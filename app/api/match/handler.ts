import { Redis } from "@upstash/redis";
import { randomBytes } from "node:crypto";
import { resolvePlateAppearance, type PitchType, type PlayOutcome, type SwingType } from "../../../lib/game-engine";
import { batterArchetypes, individualizeBatter, individualizePitcher, pitcherArchetypes } from "../../../lib/roster";
import { readShop } from "../../../lib/shop";

type PlayerId = "p1" | "p2";
type Choice = { kind: "bat" | "pitch"; cell: number; swing?: string; pitch?: string };
type Batter = { n: string; t: string; p: number; a: number; e: number; v: number };
type Pitcher = { n: string; t: string; v: number; c: number; s: number; m: number };
type Team = { lineup: Batter[]; pitchers: Pitcher[]; activePitcher: number; usedPitchers: number[] };
type PlayMemory = { batCell: number; pitchCell: number; actualCell: number; attacker: PlayerId; pitchName: string; speed: number };
type PlayLog = PlayMemory & { inning: number; half: 0 | 1; swing: string; pitch: string; batterType: string; pitcherType: string; contactZone: "exact" | "near" | "outer"; outcome: string; event: string; runsBattedIn: number; outsRecorded: number; execution?: "command" | "mistake" | "wild"; strikeStyle?: "swinging" | "looking" };
type RankingResult = { before: number; points: number; change: number; wins: number; losses: number; draws: number; games: number };
type Game = {
  status: "waiting" | "playing" | "finished";
  // The pre-game card is not part of a turn: keep its countdown separate
  // from the 20-second decision deadline.
  introUntil?: number;
  forfeitWinner?: PlayerId;
  rankingApplied?: boolean;
  careerApplied?: boolean;
  balanceApplied?: boolean;
  shopApplied?: boolean;
  shopRewards?: Partial<Record<PlayerId, { total: number; breakdown: Record<string, number> }>>;
  ranking?: Partial<Record<PlayerId, RankingResult>>;
  rematch?: Partial<Record<PlayerId, boolean>>;
  inning: number;
  half: 0 | 1;
  scores: [number, number];
  inningScores: [number[], number[]];
  hits: [number, number];
  walks: [number, number];
  balls: number;
  strikes: number;
  outs: number;
  bases: [number, number, number];
  batter: [number, number];
  teams: Record<PlayerId, Team>;
  deadline: number;
  choices: Partial<Record<PlayerId, Choice>>;
  // A highlighted cell is saved privately so a player who runs out of time
  // can still use the plan they had prepared.  It is never sent to the rival.
  drafts: Partial<Record<PlayerId, Choice>>;
  lastPlay: { bat: Choice; pitch: Choice; attacker: PlayerId; pitchName: string; speed: number; actualCell: number; outcome: PlayOutcome; execution?: "command" | "mistake" | "wild"; strikeStyle?: "swinging" | "looking" } | null;
  history: PlayMemory[];
  playLog: PlayLog[];
  aiStyle: "공격형" | "모서리형" | "변화구형" | "혼합형";
  event: string;
};
type Player = { token: string; name: string; profileId?: string; authenticated?: boolean };
type Room = { code: string; mode: "solo" | "friend" | "quick"; players: Record<PlayerId, Player | null>; game: Game };

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
const ttl = 60 * 60 * 6;
const key = (code: string) => `pitchit:room:${code}`;
const quickQueueKey = "pitchit:quick:queue";
const quickQueueLockKey = "pitchit:quick:queue:lock";
// Presence is intentionally anonymous and short-lived. A browser renews its
// own random id while visible; stale entries disappear after 75 seconds.
const presenceKey = "pitchit:presence";
const presenceLifetimeMs = 75_000;
const rankingBoardKey = "pitchit:ranking:v1";
const rankingPlayerKey = (profileId: string) => `pitchit:ranking:v1:${profileId}`;
const guestMigrationKey = (profileId: string) => `pitchit:guest-migration:v1:${profileId}`;
const accountCareerKey = (profileId: string) => `pitchit:account-career:v1:${profileId}`;
const guestNicknameKey = (profileId: string) => `pitchit:guest-nickname:v1:${profileId}`;
const guestNicknameIndexKey = (name: string) => `pitchit:guest-nickname:index:v1:${name}`;
type RankingPlayer = { name: string; points: number; wins: number; losses: number; draws: number; games: number; updatedAt: number };
const strikeCells = Array.from({ length: 25 }, (_, cell) => cell);
const actor = (game: Game): PlayerId => (game.half === 0 ? "p1" : "p2");
const defender = (game: Game): PlayerId => (actor(game) === "p1" ? "p2" : "p1");
const validChoice = (choice: unknown, expected: Choice["kind"]): choice is Choice => {
  if (!choice || typeof choice !== "object") return false;
  const value = choice as Record<string, unknown>;
  if (value.kind !== expected || !Number.isInteger(value.cell) || Number(value.cell) < 0 || Number(value.cell) >= strikeCells.length) return false;
  if (expected === "bat") return value.swing === "contact" || value.swing === "power" || value.swing === "spot";
  return value.pitch === "fast" || value.pitch === "breaking";
};
const makeTeam = (): Team => {
  const lineup = Array.from({ length: 9 }, (_, index) => ({ ...individualizeBatter(batterArchetypes[Math.floor(Math.random() * batterArchetypes.length)]), n: `${index + 1}번 타자` }));
  const pitchers = [...pitcherArchetypes].sort(() => Math.random() - 0.5).map((pitcher) => ({ ...individualizePitcher(pitcher), n: `${pitcher.t} 투수` }));
  const activePitcher = Math.floor(Math.random() * pitchers.length);
  return { lineup, pitchers, activePitcher, usedPitchers: [activePitcher] };
};
const freshGame = (): Game => ({
  status: "waiting", inning: 1, half: 0, scores: [0, 0], inningScores: [Array(9).fill(0), Array(9).fill(0)], hits: [0, 0], walks: [0, 0], balls: 0, strikes: 0, outs: 0,
  bases: [0, 0, 0], batter: [0, 0], teams: { p1: makeTeam(), p2: makeTeam() }, deadline: 0, choices: {}, drafts: {}, lastPlay: null, history: [], playLog: [], aiStyle: ["공격형", "모서리형", "변화구형", "혼합형"][Math.floor(Math.random() * 4)] as Game["aiStyle"], event: "친구의 입장을 기다리는 중입니다.",
});
const code = () => randomBytes(3).toString("hex").toUpperCase();
const token = () => randomBytes(18).toString("base64url");
const profileId = (value: unknown) => {
  const candidate = String(value ?? "");
  return /^[A-Za-z0-9_-]{12,96}$/.test(candidate) ? candidate : token();
};
const rankingName = (value: unknown) => String(value ?? "플레이어").trim().slice(0, 16) || "플레이어";
const validStoredProfileId = (value: unknown) => /^[A-Za-z0-9_-]{12,96}$/.test(String(value ?? ""));
const rankingRecord = (saved?: RankingPlayer | null) => {
  const games = Math.max(0, Number(saved?.games ?? 0));
  const wins = Math.max(0, Number(saved?.wins ?? 0));
  const draws = Math.max(0, Number(saved?.draws ?? 0));
  return { points: Math.max(0, Number(saved?.points ?? 1000)), games, wins, draws, losses: Math.max(0, Number(saved?.losses ?? games - wins - draws)) };
};
const ratingChange = (points: number, opponentPoints: number, result: "win" | "loss" | "draw") => {
  const expected = 1 / (1 + Math.pow(10, (opponentPoints - points) / 400));
  if (result === "draw") return 6;
  // Winning against a stronger player is worth much more; losses are softer
  // than gains so frequent play remains rewarding without erasing upset value.
  return result === "win" ? Math.round(26 + (1 - expected) * 28) : -Math.round(6 + expected * 17);
};
async function applyRankings(room: Room) {
  const game = room.game;
  if (game.status !== "finished" || game.rankingApplied || room.mode === "solo") return;
  const p1 = room.players.p1, p2 = room.players.p2;
  if (!p1?.profileId || !p2?.profileId || p1.profileId === p2.profileId) return;
  const [savedP1, savedP2] = await Promise.all([
    redis.get<RankingPlayer>(rankingPlayerKey(p1.profileId)),
    redis.get<RankingPlayer>(rankingPlayerKey(p2.profileId)),
  ]);
  const restoreRecord = (saved?: RankingPlayer | null) => {
    const games = Number(saved?.games ?? 0), wins = Number(saved?.wins ?? 0), draws = Number(saved?.draws ?? 0);
    // Rankings created before losses/draws existed only have games and wins.
    // Those records did not support draws, so the remaining games are losses.
    return { games, wins, draws, losses: Number(saved?.losses ?? Math.max(0, games - wins - draws)) };
  };
  const firstRecord = restoreRecord(savedP1), secondRecord = restoreRecord(savedP2);
  const first: RankingPlayer = { name: rankingName(p1.name), points: Math.max(0, Number(savedP1?.points ?? 1000)), ...firstRecord, updatedAt: Date.now() };
  const second: RankingPlayer = { name: rankingName(p2.name), points: Math.max(0, Number(savedP2?.points ?? 1000)), ...secondRecord, updatedAt: Date.now() };
  const winner = game.forfeitWinner ?? (game.scores[0] === game.scores[1] ? null : game.scores[0] > game.scores[1] ? "p1" : "p2");
  const firstResult = winner === "p1" ? "win" : winner === "p2" ? "loss" : "draw";
  const secondResult = winner === "p2" ? "win" : winner === "p1" ? "loss" : "draw";
  const forfeit = Boolean(game.forfeitWinner);
  // A forfeit should hurt more than a played loss, while the winner earns a
  // smaller reward than for completing a match. Keep the normal Elo-style
  // strength adjustment, then apply the forfeit modifier symmetrically.
  const forfeitAdjusted = (change: number, result: "win" | "loss" | "draw") => {
    if (!forfeit) return change;
    if (result === "win") return Math.max(1, Math.round(change * 0.5));
    if (result === "loss") return Math.round(change * 2);
    return change;
  };
  const firstChange = forfeitAdjusted(ratingChange(first.points, second.points, firstResult), firstResult);
  const secondChange = forfeitAdjusted(ratingChange(second.points, first.points, secondResult), secondResult);
  const firstBefore = first.points, secondBefore = second.points;
  first.points = Math.max(0, first.points + firstChange); second.points = Math.max(0, second.points + secondChange);
  first.games++; second.games++;
  if (firstResult === "win") first.wins++; else if (firstResult === "loss") first.losses++; else first.draws++;
  if (secondResult === "win") second.wins++; else if (secondResult === "loss") second.losses++; else second.draws++;
  game.ranking = {
    p1: { before: firstBefore, points: first.points, change: first.points - firstBefore, wins: first.wins, losses: first.losses, draws: first.draws, games: first.games },
    p2: { before: secondBefore, points: second.points, change: second.points - secondBefore, wins: second.wins, losses: second.losses, draws: second.draws, games: second.games },
  };
  game.rankingApplied = true;
  await Promise.all([
    redis.set(rankingPlayerKey(p1.profileId), first), redis.set(rankingPlayerKey(p2.profileId), second),
    redis.zadd(rankingBoardKey, { score: first.points, member: p1.profileId }), redis.zadd(rankingBoardKey, { score: second.points, member: p2.profileId }),
  ]);
}

type Career = Record<string, unknown> & {
  games?: number; wins?: number; losses?: number; draws?: number; atBats?: number;
  hits?: number; rbi?: number; homeRuns?: number; walks?: number; strikeouts?: number;
  outsRecorded?: number; earnedRuns?: number; recordedGames?: string[]; matchHistory?: unknown[];
};
const numberOf = (value: unknown) => Math.max(0, Number(value) || 0);
const koreaDate = () => {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "00";
  return `${value("year")}.${value("month")}.${value("day")}`;
};
const careerDefaults = () => ({ games: 0, wins: 0, losses: 0, draws: 0, atBats: 0, hits: 0, rbi: 0, homeRuns: 0, walks: 0, strikeouts: 0, outsRecorded: 0, earnedRuns: 0, recordedGames: [] as string[], matchHistory: [] as unknown[] });

// A finished online game is recorded here, beside the final game state.  This
// means a signed-in player's record comes from the server, not whichever phone
// happened to save last.
async function applyCareerRecords(room: Room) {
  const game = room.game;
  if (game.status !== "finished" || game.careerApplied || room.mode === "solo") return;
  const p1 = room.players.p1, p2 = room.players.p2;
  const members: Array<[PlayerId, Player, Player]> = [];
  if (p1?.authenticated && p1.profileId && p2) members.push(["p1", p1, p2]);
  if (p2?.authenticated && p2.profileId && p1) members.push(["p2", p2, p1]);
  game.careerApplied = true;
  await Promise.all(members.map(async ([playerId, player, opponent]) => {
    const saved = await redis.get<Record<string, unknown>>(accountCareerKey(player.profileId!));
    const career: Career = { ...careerDefaults(), ...(saved?.career as Career || {}) };
    const recorded = Array.isArray(career.recordedGames) ? career.recordedGames.map(String) : [];
    if (recorded.includes(room.code)) return;
    const mine = (game.playLog || []).filter(play => play.attacker === playerId);
    const pitching = (game.playLog || []).filter(play => play.attacker !== playerId);
    const plateEnds = mine.filter(play => ["single", "double", "triple", "homerun", "groundout", "infield_flyout", "outfield_flyout"].includes(play.outcome) || /삼진|볼넷/.test(play.event));
    const side = playerId === "p1" ? 0 : 1, otherSide = side === 0 ? 1 : 0;
    const won = game.forfeitWinner === playerId || (!game.forfeitWinner && game.scores[side] > game.scores[otherSide]);
    const lost = Boolean(game.forfeitWinner && game.forfeitWinner !== playerId) || (!game.forfeitWinner && game.scores[side] < game.scores[otherSide]);
    const result = won ? "WIN" : lost ? "LOSS" : "DRAW";
    career.games = numberOf(career.games) + 1;
    career.wins = numberOf(career.wins) + (won ? 1 : 0);
    career.losses = numberOf(career.losses) + (lost ? 1 : 0);
    career.draws = numberOf(career.draws) + (result === "DRAW" ? 1 : 0);
    career.walks = numberOf(career.walks) + plateEnds.filter(play => /볼넷/.test(play.event)).length;
    career.atBats = numberOf(career.atBats) + plateEnds.filter(play => !/볼넷/.test(play.event)).length;
    career.hits = numberOf(career.hits) + plateEnds.filter(play => ["single", "double", "triple", "homerun"].includes(play.outcome)).length;
    career.homeRuns = numberOf(career.homeRuns) + plateEnds.filter(play => play.outcome === "homerun").length;
    career.rbi = numberOf(career.rbi) + plateEnds.reduce((total, play) => total + numberOf(play.runsBattedIn), 0);
    career.strikeouts = numberOf(career.strikeouts) + plateEnds.filter(play => /삼진/.test(play.event)).length;
    career.outsRecorded = numberOf(career.outsRecorded) + pitching.reduce((total, play) => total + numberOf(play.outsRecorded), 0);
    career.earnedRuns = numberOf(career.earnedRuns) + numberOf(game.scores[otherSide]);
    career.recordedGames = [...recorded, room.code].slice(-100);
    const history = Array.isArray(career.matchHistory) ? career.matchHistory : [];
    career.matchHistory = [{ code: room.code, date: koreaDate(), opponent: opponent.name, mine: game.scores[side], theirs: game.scores[otherSide], result }, ...history].slice(0, 30);
    await redis.set(accountCareerKey(player.profileId!), { ...saved, career, updatedAt: Date.now() });
  }));
}
function rewardFor(game: Game, playerId: PlayerId, mode: Room["mode"]) {
  const mine = (game.playLog || []).filter((play) => play.attacker === playerId);
  const pitching = (game.playLog || []).filter((play) => play.attacker !== playerId);
  const side = playerId === "p1" ? 0 : 1, other = side ? 0 : 1;
  const won = game.forfeitWinner === playerId || (!game.forfeitWinner && game.scores[side] > game.scores[other]);
  const forfeited = Boolean(game.forfeitWinner && game.forfeitWinner !== playerId);
  if (forfeited) return { total: 0, breakdown: {} };
  const hits = mine.filter((play) => ["single", "double", "triple", "homerun"].includes(play.outcome)).length;
  const homers = mine.filter((play) => play.outcome === "homerun").length;
  const strikeouts = pitching.filter((play) => /삼진/.test(play.event)).length;
  const walks = mine.filter((play) => /볼넷/.test(play.event)).length;
  const base = mode === "solo" ? 10 : 30, win = won ? (mode === "solo" ? 8 : 20) : 0;
  const breakdown = { "경기 완료": base, ...(win ? { "승리 보너스": win } : {}), ...(hits ? { "안타": hits * 3 } : {}), ...(homers ? { "홈런": homers * 15 } : {}), ...(strikeouts ? { "삼진": strikeouts * 4 } : {}), ...(walks ? { "볼넷": walks * 2 } : {}) };
  return { total: Object.values(breakdown).reduce((sum, value) => sum + value, 0), breakdown };
}
async function applyShopRewards(room: Room) {
  const game = room.game;
  if (game.status !== "finished" || game.shopApplied) return;
  game.shopApplied = true; game.shopRewards = {};
  for (const playerId of ["p1", "p2"] as PlayerId[]) {
    const player = room.players[playerId]; if (!player) continue;
    const reward = rewardFor(game, playerId, room.mode); game.shopRewards[playerId] = reward;
    if (!player.authenticated || !player.profileId || reward.total <= 0) continue;
    const saved = (await redis.get<Record<string, unknown>>(accountCareerKey(player.profileId))) || {};
    const shop = readShop(saved.shop);
    if (shop.rewardedGames.includes(room.code)) continue;
    await redis.set(accountCareerKey(player.profileId), { ...saved, shop: { ...shop, coins: shop.coins + reward.total, rewardedGames: [...shop.rewardedGames, room.code].slice(-150) }, updatedAt: Date.now() });
  }
}
const publicRoom = (room: Room) => ({
  code: room.code,
  mode: room.mode,
  ready: room.game.status === "playing",
  players: { p1: room.players.p1?.name ?? null, p2: room.players.p2?.name ?? null },
  // Reveal only that a player has locked a choice.  Their target, swing and
  // pitch stay private until both choices are received and resolved.
  choiceReady: { p1: Boolean(room.game.choices.p1), p2: Boolean(room.game.choices.p2) },
  game: { ...room.game, choices: {}, drafts: {} },
  attacker: actor(room.game),
});

function addRun(game: Game, side: 0 | 1 = game.half) {
  game.inningScores ??= [[], []];
  game.scores[side]++;
  const inningIndex = Math.max(0, game.inning - 1);
  game.inningScores[side][inningIndex] = (game.inningScores[side][inningIndex] ?? 0) + 1;
}
function advance(game: Game, runs: number, batterSpeed: number) {
  const side = game.half;
  const next: [number, number, number] = [0, 0, 0];
  let extraAdvance = "";
  for (let i = 2; i >= 0; i--) if (game.bases[i]) {
    const runnerSpeed = game.bases[i];
    let destination = i + runs;
    // Short PITCHIT games need hits to create momentum.  A single can score
    // a runner from second or send one from first to third; a fast runner is
    // more likely to take the extra base.  Doubles can score a runner from
    // first, rather than leaving every one at third.
    if (runs === 1 && i === 1 && Math.random() < Math.min(.96, .82 + (runnerSpeed - 40) / 90)) destination = 3;
    if (runs === 1 && i === 0 && Math.random() < Math.min(.50, .18 + (runnerSpeed - 40) / 70)) { destination = 3; extraAdvance = " · 주력으로 1루에서 홈까지 질주합니다!"; }
    else if (runs === 1 && i === 0 && Math.random() < Math.min(.91, .66 + (runnerSpeed - 40) / 90)) destination = 2;
    if (runs === 2 && i === 0 && Math.random() < Math.min(.96, .74 + (runnerSpeed - 40) / 80)) destination = 3;
    if (destination >= 3) addRun(game, side);
    else next[destination as 0 | 1 | 2] = runnerSpeed;
  }
  if (runs >= 4) addRun(game, side);
  else next[(runs - 1) as 0 | 1 | 2] = batterSpeed;
  if (runs === 1 && next[2] && Math.random() < Math.min(.20, Math.max(.02, (next[2] - 58) / 130))) { addRun(game, side); next[2] = 0; extraAdvance = " · 주력으로 2루에서 홈까지 파고듭니다!"; }
  game.bases = next;
  return extraAdvance;
}
function walk(game: Game, batterSpeed: number) {
  const side = game.half;
  if (game.bases[0] && game.bases[1] && game.bases[2]) addRun(game, side);
  if (game.bases[1]) game.bases[2] = game.bases[1];
  if (game.bases[0]) game.bases[1] = game.bases[0];
  game.bases[0] = batterSpeed;
}
function advanceGroundRunners(game: Game) {
  if (game.outs >= 2) return "";
  const next: [number, number, number] = [...game.bases] as [number, number, number];
  const notes: string[] = [];
  // A runner on third can score on a slow infield grounder, while a runner on
  // second can take third. Speed determines both decisions.
  for (let index = 2; index >= 1; index--) {
    const speed = next[index]; if (!speed) continue;
    // A runner with average speed (55) should advance about half the time
    // from second and score about 70% of the time from third on a grounder.
    // Speed still creates meaningful separation at both ends.
    const chance = index === 2 ? Math.min(.90, Math.max(.56, .70 + (speed - 55) / 125)) : Math.min(.72, Math.max(.36, .50 + (speed - 55) / 140));
    if (Math.random() >= chance) continue;
    if (index === 2) { next[2] = 0; addRun(game); notes.push("3루 주자 홈 쇄도"); }
    else if (!next[2]) { next[1] = 0; next[2] = speed; notes.push("2루 주자 3루 진루"); }
  }
  game.bases = next;
  return notes.length ? ` · ${notes.join(" · ")}` : "";
}
function tagUpOutfield(game: Game, batterPower: number) {
  if (game.outs >= 2) return "";
  const next: [number, number, number] = [...game.bases] as [number, number, number];
  const notes: string[] = [];
  // 3루→홈은 가장 쉽고, 1루→2루는 가장 어렵다. A deep fly from a
  // powerful hitter and a fast runner both raise the chance to tag.
  const bases = [.14, .54, .76];
  for (let index = 2; index >= 0; index--) {
    const speed = next[index]; if (!speed) continue;
    const chance = Math.min(index === 2 ? .98 : index === 1 ? .88 : .54, Math.max(index === 2 ? .68 : index === 1 ? .38 : .06, bases[index] + (speed - 50) / 145 + (batterPower - 50) / 260));
    if (Math.random() >= chance) continue;
    if (index === 2) { next[2] = 0; addRun(game); notes.push("3루 주자 태그업 득점"); }
    else if (!next[index + 1]) { next[index] = 0; next[index + 1] = speed; notes.push(`${index + 1}루 주자 태그업 ${index + 2}루`); }
  }
  game.bases = next;
  return notes.length ? ` · ${notes.join(" · ")}` : "";
}
function nextPitch(game: Game) {
  game.choices = {};
  game.drafts = {};
  game.deadline = Date.now() + 20000;
}
function finishWalkoff(game: Game) {
  // In the regulation final half and every extra-inning bottom half, the
  // home team does not need to record three outs once it has taken the lead.
  if (game.half !== 1 || game.inning < 3 || game.scores[1] <= game.scores[0]) return false;
  game.status = "finished";
  game.deadline = 0;
  game.choices = {};
  game.drafts = {};
  game.event = `${game.event} · 끝내기 승리!`;
  return true;
}
function endPlate(game: Game) {
  game.balls = 0;
  game.strikes = 0;
  game.batter[game.half] = (game.batter[game.half] + 1) % 9;
  if (game.outs < 3) return;
  game.outs = 0;
  game.bases = [0, 0, 0];
  if (game.half === 0) {
    // In the final regulation inning the home side does not bat when it is
    // already ahead after recording the third out in the top half.
    if (game.inning >= 3 && game.scores[1] > game.scores[0]) {
      game.status = "finished";
      game.deadline = 0;
      game.event = `${game.inning}회초 종료 · p2 승리`;
      return;
    }
    game.half = 1;
    if (game.inning >= 4) game.bases = [0, 55, 0];
    return;
  }
  if (game.inning < 3) { game.half = 0; game.inning++; return; }
  if (game.scores[0] !== game.scores[1]) {
    game.status = "finished";
    game.deadline = 0;
    game.event = `${game.inning}이닝 종료 · ${game.scores[0] > game.scores[1] ? "p1" : "p2"} 승리`;
    return;
  }
  if (game.inning >= 9) {
    game.status = "finished";
    game.deadline = 0;
    game.event = "9이닝 종료 · 무승부";
    return;
  }
  game.inning++;
  game.half = 0;
  game.bases = [0, 55, 0];
  game.event = `${game.inning - 1}이닝 종료 · 승부치기! 무사 2루에서 시작합니다.`;
}
async function resolve(room: Room) {
  const game = room.game;
  if (game.status !== "playing") return;
  const battingPlayer = actor(game);
  const batting = game.choices[battingPlayer] ?? game.drafts[battingPlayer] ?? { kind: "bat" as const, cell: strikeCells[Math.floor(Math.random() * strikeCells.length)], swing: "contact" };
  const pitching = game.choices[defender(game)] ?? game.drafts[defender(game)] ?? { kind: "pitch" as const, cell: strikeCells[Math.floor(Math.random() * strikeCells.length)], pitch: "fast" };
  const pitcher = game.teams[defender(game)].pitchers[game.teams[defender(game)].activePitcher];
  const batter = game.teams[battingPlayer].lineup[game.batter[game.half]];
  const battingSide = battingPlayer === "p1" ? 0 : 1;
  const scoreBefore = game.scores[battingSide];
  const strikesBefore = game.strikes;
  let outsOnPlay = 0;
  const plate = resolvePlateAppearance({
    batter,
    pitcher,
    targetCell: batting.cell,
    pitchCell: pitching.cell,
    swing: (batting.swing ?? "contact") as SwingType,
    pitch: (pitching.pitch ?? "fast") as PitchType,
    count: { balls: game.balls, strikes: game.strikes },
  });
  game.lastPlay = { bat: batting, pitch: pitching, attacker: battingPlayer, pitchName: plate.pitchName, speed: plate.speed, actualCell: plate.actualCell, outcome: plate.outcome, execution: plate.execution, strikeStyle: plate.strikeStyle };
  game.history = [{ batCell: batting.cell, pitchCell: pitching.cell, actualCell: plate.actualCell, attacker: battingPlayer, pitchName: plate.pitchName, speed: plate.speed }, ...(game.history ?? [])].slice(0, 5);
  const executionNotice = plate.execution === "mistake" ? "실투 · " : plate.execution === "wild" ? "제구 이탈 · " : "";
  game.event = `${executionNotice}${plate.message}`;
  if (plate.outcome === "ball") {
    // A command miss is a forced take: it has already been ruled a ball by
    // the shared engine, regardless of the hitter's target or swing type.
    game.balls++;
    if (game.balls >= 4) { game.walks[game.half]++; walk(game, batter.v); game.event = `${executionNotice}${plate.message} · 볼넷`; if (!finishWalkoff(game)) endPlate(game); }
  } else if (plate.outcome === "foul") {
    game.strikes = Math.min(2, game.strikes + 1);
  } else if (plate.outcome === "swinging_strike") {
    game.strikes++;
    if (game.strikes >= 3) { game.outs++; outsOnPlay = 1; game.event = `${plate.message} · ${plate.strikeStyle === "looking" ? "루킹 삼진 아웃" : "헛스윙 스트라이크 삼진 아웃"}`; endPlate(game); }
  } else if (plate.outcome === "groundout") {
    const hasFirstRunner = Boolean(game.bases[0]);
    const lowPitchBonus = Math.max(0, Math.floor(plate.actualCell / 5) - 2) * .04;
    const doublePlayChance = Math.min(.38, Math.max(.08, .20 + lowPitchBonus + (pitcher.s - 50) / 260 + (50 - batter.v) / 150 + ((pitching.pitch ?? "fast") === "breaking" ? .02 : 0)));
    if (hasFirstRunner && game.outs < 2 && Math.random() < doublePlayChance) {
      game.bases[0] = 0; game.outs += 2; outsOnPlay = 2;
      game.event = `${plate.message} · 병살타! 1루 주자와 타자 주자가 모두 아웃됩니다.`;
    } else {
      // On a non-double-play force at second, the runner is out but the
      // batter reaches first. Other runners can still advance on the grounder.
      if (hasFirstRunner) game.bases[0] = 0;
      const advanceNote = advanceGroundRunners(game);
      if (hasFirstRunner) game.bases[0] = batter.v;
      game.outs++; outsOnPlay = 1;
      game.event = `${plate.message}${hasFirstRunner ? " · 1루 주자 아웃, 타자 주자 1루 생존" : ""}${advanceNote}`;
    }
    if (!finishWalkoff(game)) endPlate(game);
  } else if (plate.outcome === "infield_flyout" || plate.outcome === "outfield_flyout") {
    const tagUp = plate.outcome === "outfield_flyout" ? tagUpOutfield(game, batter.p) : "";
    game.outs++; outsOnPlay = 1;
    game.event = `${plate.message}${tagUp}`;
    if (!finishWalkoff(game)) endPlate(game);
  } else {
    const bases = plate.outcome === "homerun" ? 4 : plate.outcome === "triple" ? 3 : plate.outcome === "double" ? 2 : 1;
    game.hits[game.half]++; const extraAdvance = advance(game, bases, batter.v); game.event = `${plate.message}${extraAdvance}`; if (!finishWalkoff(game)) endPlate(game);
  }
  const gridDistance = Math.abs(Math.floor(batting.cell / 5) - Math.floor(plate.actualCell / 5)) + Math.abs(batting.cell % 5 - plate.actualCell % 5);
  const contactZone: PlayLog["contactZone"] = gridDistance === 0 ? "exact" : gridDistance === 1 ? "near" : "outer";
  game.playLog = [{
    inning: game.inning,
    half: game.half,
    batCell: batting.cell,
    pitchCell: pitching.cell,
    actualCell: plate.actualCell,
    attacker: battingPlayer,
    swing: batting.swing ?? "contact",
    pitch: pitching.pitch ?? "fast",
    batterType: batter.t,
    pitcherType: pitcher.t,
    contactZone,
    pitchName: plate.pitchName,
    speed: plate.speed,
    outcome: plate.outcome,
    event: game.event,
    runsBattedIn: game.scores[battingSide] - scoreBefore,
    outsRecorded: outsOnPlay,
    execution: plate.execution,
    strikeStyle: plate.strikeStyle,
  }, ...(game.playLog ?? [])].slice(0, 120);
  await trackBalance(plate.outcome, batting.swing ?? "contact", pitching.pitch ?? "fast", plate.execution, batter.t, pitcher.t, contactZone);
  if (room.game.status === "finished") { await applyRankings(room); await applyCareerRecords(room); await applyShopRewards(room); await applyBalanceGame(room); }
  if (game.status === "playing") nextPitch(game);
}

const balanceKey = "pitchit:balance:v1";
const balanceGameKey = (code: string) => `pitchit:balance:game:v1:${code}`;
async function trackBalance(outcome: string, swing: string, pitch: string, execution: string | undefined, batterType: string, pitcherType: string, contactZone: string) {
  // Aggregate anonymous events live. The per-game audit row below keeps no
  // player names or profile ids, only game mechanics for balance checks.
  await Promise.all([
    redis.hincrby(balanceKey, "plateAppearances", 1),
    redis.hincrby(balanceKey, `outcome:${outcome}`, 1),
    redis.hincrby(balanceKey, `swing:${swing}`, 1),
    redis.hincrby(balanceKey, `pitch:${pitch}`, 1),
    redis.hincrby(balanceKey, `batter:${batterType}`, 1),
    redis.hincrby(balanceKey, `pitcher:${pitcherType}`, 1),
    redis.hincrby(balanceKey, `contact:${contactZone}`, 1),
    ...(execution ? [redis.hincrby(balanceKey, `execution:${execution}`, 1)] : []),
  ]);
}
function countBy(values: string[]) { return values.reduce<Record<string, number>>((counts, value) => { counts[value] = (counts[value] || 0) + 1; return counts; }, {}); }
async function applyBalanceGame(room: Room) {
  const game = room.game;
  if (game.status !== "finished" || game.balanceApplied) return;
  const plays = game.playLog || [];
  const outcomes = countBy(plays.map(play => play.outcome));
  const hits = (outcomes.single || 0) + (outcomes.double || 0) + (outcomes.triple || 0) + (outcomes.homerun || 0);
  const strikeouts = plays.filter(play => /삼진/.test(play.event)).length;
  const walks = plays.filter(play => /볼넷/.test(play.event)).length;
  const atBats = hits + (outcomes.groundout || 0) + (outcomes.infield_flyout || 0) + (outcomes.outfield_flyout || 0) + strikeouts;
  const execution = countBy(plays.map(play => play.execution || "command"));
  const summary = {
    version: 1, mode: room.mode, completedAt: Date.now(), innings: game.inning,
    halfInnings: new Set(plays.map(play => `${play.inning}:${play.half}`)).size, pitches: plays.length,
    totalRuns: game.scores[0] + game.scores[1], scoreP1: game.scores[0], scoreP2: game.scores[1],
    hits, atBats, walks, strikeouts, rbi: plays.reduce((sum, play) => sum + numberOf(play.runsBattedIn), 0),
    outs: plays.reduce((sum, play) => sum + numberOf(play.outsRecorded), 0), singles: outcomes.single || 0,
    doubles: outcomes.double || 0, triples: outcomes.triple || 0, homeRuns: outcomes.homerun || 0,
    groundouts: outcomes.groundout || 0, infieldFlyouts: outcomes.infield_flyout || 0, outfieldFlyouts: outcomes.outfield_flyout || 0, flyouts: (outcomes.infield_flyout || 0) + (outcomes.outfield_flyout || 0), balls: outcomes.ball || 0,
    doublePlays: plays.filter(play => /병살타/.test(play.event)).length,
    tagUpRuns: plays.filter(play => /태그업 득점/.test(play.event)).length,
    groundAdvanceRuns: plays.filter(play => /홈 쇄도/.test(play.event)).length,
    fouls: outcomes.foul || 0, swingingStrikes: outcomes.swinging_strike || 0, mistakes: execution.mistake || 0,
    wildPitches: execution.wild || 0, extraInningGame: game.inning > 3 ? 1 : 0, forfeit: game.forfeitWinner ? 1 : 0,
    outcomeCounts: outcomes, executionCounts: execution,
    // All mechanics needed for later simulations: type, swing/pitch choice,
    // aimed cell, actual cell, and exact/near/outer contact classification.
    plays: plays.map(({ inning, half, batCell, pitchCell, actualCell, swing, pitch, batterType, pitcherType, contactZone, outcome, execution, runsBattedIn, outsRecorded }) => ({ inning, half, batCell, pitchCell, actualCell, swing, pitch, batterType, pitcherType, contactZone, outcome, execution: execution || "command", runsBattedIn, outsRecorded })),
  };
  await redis.set(balanceGameKey(room.code), summary);
  await Promise.all([
    redis.hincrby(balanceKey, "games", 1), redis.hincrby(balanceKey, `mode:${room.mode}`, 1),
    ...Object.entries(summary).filter(([, value]) => typeof value === "number").map(([field, value]) => redis.hincrby(balanceKey, `game:${field}`, Number(value))),
  ]);
  game.balanceApplied = true;
}
function aiChoice(game: Game, player: PlayerId): Choice {
  const corners = [0, 4, 20, 24], center = [6, 7, 8, 11, 12, 13, 16, 17, 18], edges = [1, 3, 5, 9, 15, 19, 21, 23];
  const pick = (cells: number[]) => cells[Math.floor(Math.random() * cells.length)];
  const pitcher = game.teams[player].pitchers[game.teams[player].activePitcher];
  if (player === actor(game)) {
    const swings: SwingType[] = ["contact", "power", "spot"];
    // Aggressive AI hitters sit on the middle; corner personalities
    // hunt an edge more often. A repeated pattern remains readable.
    const cell = game.aiStyle === "공격형" ? pick(center) : game.aiStyle === "모서리형" ? pick(edges) : pick(strikeCells);
    return { kind: "bat", cell, swing: game.aiStyle === "공격형" && Math.random() < .42 ? "power" : swings[Math.floor(Math.random() * swings.length)] };
  }
  const type = pitcher?.t ?? "구위형";
  const style = game.aiStyle;
  const cornerHeavy = style === "모서리형" || type === "제구형";
  const breakingHeavy = style === "변화구형" || type === "변화형";
  const fastHeavy = type === "구속형";
  const target = cornerHeavy ? pick(Math.random() < .72 ? corners : edges) : type === "구위형" ? pick([11, 12, 13, 16, 17, 18]) : pick(style === "공격형" ? center : strikeCells);
  return {
    kind: "pitch",
    cell: target,
    pitch: breakingHeavy ? (Math.random() < .76 ? "breaking" : "fast") : fastHeavy ? (Math.random() < .78 ? "fast" : "breaking") : (Math.random() < .48 ? "breaking" : "fast"),
  };
}
async function readBody(req: any) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
}
async function load(code: string) { return redis.get<Room>(key(code)); }
async function save(room: Room) { await redis.set(key(room.code), room, { ex: ttl }); }
async function acquire(keyName: string, attempts = 1) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const lockToken = token();
    const acquired = await redis.set(keyName, lockToken, { nx: true, ex: 3 });
    if (acquired) return lockToken;
    if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 60));
  }
  return null;
}
async function release(keyName: string, lockToken: string) {
  // Only the holder deletes the short-lived lock. The check prevents an expired lock from deleting a newer one.
  if (await redis.get<string>(keyName) === lockToken) await redis.del(keyName);
}
function startRoom(room: Room, joining: Player): PlayerId {
  const host = room.players.p1!;
  // Keep the inning state in the canonical top-to-bottom order. Randomising
  // `game.half` skips a half-inning, so randomise the player roles instead.
  const joiningBatsFirst = Math.random() < 0.5;
  if (joiningBatsFirst) {
    room.players.p1 = joining;
    room.players.p2 = host;
  } else {
    room.players.p2 = joining;
  }
  room.game.status = "playing";
  room.game.half = 0;
  room.game.introUntil = Date.now() + 5_000;
  // Reserve the opening decision window now.  Clients can receive the
  // match-intro state a few milliseconds before its expiry; a zero deadline
  // in that gap used to leave the first defender unable to submit a pitch.
  room.game.deadline = room.game.introUntil + 20_000;
  room.game.choices = {};
  room.game.drafts = {};
  room.game.event = "매칭 완료! 양 팀 소개 후 경기가 시작됩니다.";
  return joiningBatsFirst ? "p1" : "p2";
}
function identify(room: Room, supplied: string): PlayerId | null {
  return room.players.p1?.token === supplied ? "p1" : room.players.p2?.token === supplied ? "p2" : null;
}
export default async function handler(req: any, res: any) {
  try {
    // The game is also published through GitHub Pages, which calls this
    // Vercel function from a different origin.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    const input = req.method === "GET" ? req.query : await readBody(req);
    if (input.action === "presence") {
      const clientId = String(input.clientId ?? "");
      if (!/^[A-Za-z0-9_-]{12,96}$/.test(clientId)) return res.status(400).json({ error: "유효하지 않은 접속 정보입니다." });
      const now = Date.now();
      await redis.zadd(presenceKey, { score: now, member: clientId });
      await redis.zremrangebyscore(presenceKey, 0, now - presenceLifetimeMs);
      const online = await redis.zcard(presenceKey);
      return res.status(200).json({ online, expiresIn: Math.ceil(presenceLifetimeMs / 1000) });
    }
    if (input.action === "ranking") {
      const ids = await redis.zrange<string[]>(rankingBoardKey, 0, 49, { rev: true });
      const entries = await Promise.all(ids.map(async (id) => ({ id, player: await redis.get<RankingPlayer>(rankingPlayerKey(id)) })));
      const ranking = entries
        .filter((entry): entry is { id: string; player: RankingPlayer } => Boolean(entry.player))
        .map(({ player }) => { const games = Math.max(0, player.games), wins = Math.max(0, player.wins), draws = Math.max(0, player.draws ?? 0); return { name: rankingName(player.name), points: Math.max(0, Math.round(player.points)), wins, losses: Math.max(0, player.losses ?? games - wins - draws), draws, games }; })
        .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, "ko"));
      return res.status(200).json({ ranking });
    }
    if (input.action === "migrate-guest") {
      if (input.authenticated !== true) return res.status(401).json({ error: "로그인 후에만 비회원 기록을 이전할 수 있습니다." });
      const memberId = String(input.profileId ?? ""), guestId = String(input.guestProfileId ?? "");
      if (!validStoredProfileId(memberId) || !validStoredProfileId(guestId) || memberId === guestId) return res.status(400).json({ error: "이전할 비회원 기록을 확인하지 못했습니다." });
      const migrationLockKey = `${guestMigrationKey(guestId)}:lock`;
      const migrationLock = await acquire(migrationLockKey, 3);
      if (!migrationLock) return res.status(409).json({ error: "기록 이전을 처리 중입니다. 잠시 후 다시 시도해 주세요." });
      try {
        const alreadyMigratedTo = await redis.get<string>(guestMigrationKey(guestId));
        if (alreadyMigratedTo && alreadyMigratedTo !== memberId) return res.status(409).json({ error: "이 비회원 기록은 이미 다른 계정에 이전되었습니다." });
        if (alreadyMigratedTo === memberId) return res.status(200).json({ migrated: false, alreadyMigrated: true });
        const [guest, member] = await Promise.all([redis.get<RankingPlayer>(rankingPlayerKey(guestId)), redis.get<RankingPlayer>(rankingPlayerKey(memberId))]);
        if (guest) {
          const source = rankingRecord(guest), target = rankingRecord(member);
          // Rankings start at 1,000. Carry the guest's gain/loss over rather
          // than granting an accidental second free 1,000-point baseline.
          const points = member ? Math.max(0, target.points + (source.points - 1000)) : source.points;
          const merged: RankingPlayer = { name: rankingName(input.name), points, games: target.games + source.games, wins: target.wins + source.wins, losses: target.losses + source.losses, draws: target.draws + source.draws, updatedAt: Date.now() };
          await Promise.all([redis.set(rankingPlayerKey(memberId), merged), redis.zadd(rankingBoardKey, { score: merged.points, member: memberId }), redis.del(rankingPlayerKey(guestId)), redis.zrem(rankingBoardKey, guestId)]);
        }
        const guestName = await redis.get<string>(guestNicknameKey(guestId));
        if (guestName && await redis.get<string>(guestNicknameIndexKey(guestName)) === guestId) await redis.del(guestNicknameIndexKey(guestName));
        await Promise.all([redis.del(guestNicknameKey(guestId)), redis.set(guestMigrationKey(guestId), memberId)]);
        return res.status(200).json({ migrated: Boolean(guest), alreadyMigrated: false });
      } finally { await release(migrationLockKey, migrationLock); }
    }
    if (input.action === "stats") {
      const stats = await redis.hgetall<Record<string, number>>(balanceKey);
      return res.status(200).json({ stats: stats ?? {} });
    }
    if (input.action === "identity") {
      const id = String(input.profileId ?? "");
      if (!/^[A-Za-z0-9_-]{12,96}$/.test(id)) return res.status(400).json({ error: "유효하지 않은 기기 정보입니다." });
      const saved = await redis.get<string>(guestNicknameKey(id));
      if (saved) return res.status(200).json({ name: saved });
      for (let attempt = 0; attempt < 100; attempt++) {
        const name = `Player${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
        const claimed = await redis.set(guestNicknameIndexKey(name), id, { nx: true });
        if (!claimed) continue;
        await redis.set(guestNicknameKey(id), name);
        return res.status(201).json({ name });
      }
      return res.status(503).json({ error: "비회원 닉네임을 발급하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    if (input.action === "solo") {
      const room: Room = { code: code(), mode: "solo", players: { p1: { token: token(), name: input.name || "플레이어", profileId: profileId(input.profileId), authenticated: input.authenticated === true }, p2: { token: "AI", name: "PITCHIT AI" } }, game: freshGame() };
      room.game.status = "playing";
      room.game.event = "PITCHIT AI와 경기 시작! 20초 안에 작전을 선택하세요.";
      nextPitch(room.game);
      await save(room);
      return res.status(201).json({ ...publicRoom(room), player: "p1", token: room.players.p1!.token });
    }
    if (input.action === "quick") {
      const queueLock = await acquire(quickQueueLockKey);
      if (!queueLock) return res.status(409).json({ error: "매칭 대기열을 확인 중입니다. 다시 눌러 주세요." });
      try {
        const waitingCode = await redis.get<string>(quickQueueKey);
        if (waitingCode) {
          const waitingRoom = await load(waitingCode);
          if (waitingRoom?.mode === "quick" && waitingRoom.game.status === "waiting") {
            const joining = { token: token(), name: input.name || "플레이어 2", profileId: profileId(input.profileId), authenticated: input.authenticated === true };
            const player = startRoom(waitingRoom, joining);
            await save(waitingRoom);
            await redis.del(quickQueueKey);
            return res.json({ ...publicRoom(waitingRoom), player, token: joining.token });
          }
          await redis.del(quickQueueKey);
        }
        const room: Room = { code: code(), mode: "quick", players: { p1: { token: token(), name: input.name || "플레이어 1", profileId: profileId(input.profileId), authenticated: input.authenticated === true }, p2: null }, game: freshGame() };
        room.game.event = "상대를 찾는 중입니다…";
        await save(room);
        await redis.set(quickQueueKey, room.code, { ex: 45 });
        return res.status(201).json({ ...publicRoom(room), player: "p1", token: room.players.p1!.token, searching: true });
      } finally { await release(quickQueueLockKey, queueLock); }
    }
    if (input.action === "create") {
      const room: Room = { code: code(), mode: "friend", players: { p1: { token: token(), name: input.name || "플레이어 1", profileId: profileId(input.profileId), authenticated: input.authenticated === true }, p2: null }, game: freshGame() };
      await save(room);
      return res.status(201).json({ ...publicRoom(room), player: "p1", token: room.players.p1!.token });
    }
    let room = await load(String(input.code || "").toUpperCase());
    if (!room) return res.status(404).json({ error: "방을 찾을 수 없습니다." });
    const needsRoomLock = input.action === "join" || input.action === "draft" || input.action === "choose" || input.action === "swap" || input.action === "forfeit" || input.action === "rematch" || (input.action === "state" && Boolean(room.game.introUntil));
    const roomLockKey = `pitchit:room:${room.code}:lock`;
    const roomLock = needsRoomLock ? await acquire(roomLockKey, 12) : null;
    if (needsRoomLock && !roomLock) return res.status(409).json({ error: "상대 선택을 처리 중입니다. 잠시 후 다시 시도해 주세요." });
    try {
    // A second player may have loaded this room while the first player was
    // saving a choice. Always re-read after taking the lock so that choices
    // are merged instead of one request overwriting the other.
    if (needsRoomLock) {
      const lockedRoom = await load(room.code);
      if (!lockedRoom) return res.status(404).json({ error: "방을 찾을 수 없습니다." });
      room = lockedRoom;
    }
    if (input.action === "forfeit") {
      const player = identify(room, input.token);
      if (!player) return res.status(403).json({ error: "유효하지 않은 참가자입니다." });
      if (room.game.status === "finished") return res.status(200).json({ ...publicRoom(room), player, token: input.token });
      const winner: PlayerId = player === "p1" ? "p2" : "p1";
      room.game.status = "finished";
      room.game.deadline = 0;
      room.game.choices = {};
      room.game.forfeitWinner = winner;
      room.game.event = `${room.players[player]?.name || "플레이어"} 님이 경기를 포기했습니다. ${room.players[winner]?.name || "상대"} 님의 몰수승입니다.`;
      await applyRankings(room);
      await applyCareerRecords(room);
      await applyShopRewards(room);
      await applyBalanceGame(room);
      await save(room);
      return res.status(200).json({ ...publicRoom(room), player, token: input.token, forfeited: true });
    }
    if (input.action === "rematch") {
      const player = identify(room, input.token);
      if (!player) return res.status(403).json({ error: "유효하지 않은 참가자입니다." });
      if (room.mode === "solo") return res.status(409).json({ error: "싱글 플레이는 새 게임으로 다시 시작할 수 있습니다." });
      if (room.game.status !== "finished") return res.status(409).json({ error: "경기 종료 후에 리매치를 요청할 수 있습니다." });
      room.game.rematch ??= {};
      room.game.rematch[player] = true;
      if (room.game.rematch.p1 && room.game.rematch.p2) {
        const next = freshGame();
        next.status = "playing";
        next.introUntil = Date.now() + 5_000;
        next.deadline = next.introUntil + 20_000;
        next.event = "리매치 성사! 양 팀 소개 후 경기가 시작됩니다.";
        room.game = next;
      }
      await save(room);
      return res.status(200).json({ ...publicRoom(room), player, token: input.token });
    }
    if (input.action === "cancel") {
      const player = identify(room, input.token);
      if (!player) return res.status(403).json({ error: "유효하지 않은 참가자입니다." });
      if (room.mode !== "quick" || room.game.status !== "waiting" || player !== "p1") return res.status(409).json({ error: "취소할 수 없는 매칭입니다." });
      if (await redis.get<string>(quickQueueKey) === room.code) await redis.del(quickQueueKey);
      await redis.del(key(room.code));
      return res.status(200).json({ cancelled: true });
    }
    if (input.action === "join") {
      if (room.players.p2) return res.status(409).json({ error: "이미 두 명이 입장한 방입니다." });
      const joining = { token: token(), name: input.name || "플레이어 2", profileId: profileId(input.profileId), authenticated: input.authenticated === true };
      const player = startRoom(room, joining);
      await save(room);
      return res.json({ ...publicRoom(room), player, token: joining.token });
    }
    const player = identify(room, input.token);
    if (!player) return res.status(403).json({ error: "유효하지 않은 참가자입니다." });
    if (room.game.introUntil) {
      if (Date.now() < room.game.introUntil) {
        if (input.action === "choose") return res.status(409).json({ error: "매칭 안내가 끝난 뒤 작전을 선택할 수 있습니다." });
      } else {
        room.game.introUntil = undefined;
        room.game.event = "경기 시작! 20초 안에 작전을 선택하세요.";
        // The opening turn was reserved when the match started. Recreating it
        // here created a small race: a client could finish its five-second
        // intro card and send the very first pitch while the server was still
        // moving the deadline. Keep the reserved deadline so that first
        // selection is accepted immediately after the intro expires.
        if (room.game.deadline <= Date.now()) nextPitch(room.game);
      }
    }
    if (!room.game.introUntil && room.game.status === "playing" && Date.now() >= room.game.deadline) await resolve(room);
    if (input.action === "swap") {
      if (room.game.status !== "playing") return res.status(409).json({ error: "경기가 종료되었습니다." });
      if (player !== defender(room.game)) return res.status(409).json({ error: "수비 중에만 투수를 교체할 수 있습니다." });
      const index = Number(input.index);
      const team = room.game.teams[player];
      if (!Number.isInteger(index) || index < 0 || index >= team.pitchers.length) return res.status(400).json({ error: "올바르지 않은 투수입니다." });
      if (team.usedPitchers.includes(index)) return res.status(409).json({ error: "이미 등판한 투수입니다." });
      team.activePitcher = index;
      team.usedPitchers.push(index);
      room.game.event = `${room.players[player]?.name || "플레이어"} · ${team.pitchers[index].n} 투수 교체`;
      await save(room);
      return res.json({ ...publicRoom(room), player, token: input.token, swapped: true });
    }
    if (input.action === "choose") {
      if (room.game.status === "finished") return res.status(409).json({ error: "이미 종료된 경기입니다." });
      if (room.game.status !== "playing") return res.status(409).json({ error: "상대가 입장한 뒤 경기가 시작되면 작전을 선택할 수 있습니다." });
      // New clients include the deadline they saw.  Reject an old network
      // retry rather than letting it become a choice for the next pitch.
      if (input.deadline !== undefined && Number(input.deadline) !== room.game.deadline) return res.status(409).json({ error: "새 턴이 시작되었습니다. 현재 턴의 칸을 다시 선택해 주세요." });
      const expected = player === actor(room.game) ? "bat" : "pitch";
      if (input.choice?.kind !== expected) return res.status(409).json({ error: "현재 차례의 작전이 아닙니다." });
      if (!validChoice(input.choice, expected)) return res.status(400).json({ error: "작전 선택값이 올바르지 않습니다." });
      room.game.choices[player] = input.choice;
      delete room.game.drafts[player];
      if (room.mode === "solo") {
        const ai = aiChoice(room.game, "p2");
        room.game.choices.p2 = ai;
      }
      if (room.game.choices.p1 && room.game.choices.p2) await resolve(room);
    }
    if (input.action === "draft") {
      if (room.game.status !== "playing") return res.status(409).json({ error: "상대가 입장한 뒤 작전을 선택할 수 있습니다." });
      // Never let a delayed touch from the prior pitch become the next
      // pitch's timeout choice.
      if (Number(input.deadline) !== room.game.deadline) return res.status(409).json({ error: "새 턴이 시작되었습니다." });
      const expected = player === actor(room.game) ? "bat" : "pitch";
      if (input.choice?.kind !== expected || !validChoice(input.choice, expected)) return res.status(400).json({ error: "임시 선택값이 올바르지 않습니다." });
      if (!room.game.choices[player]) room.game.drafts[player] = input.choice;
    }
    await save(room);
    return res.json({ ...publicRoom(room), player, token: input.token });
    } finally {
      if (roomLock) await release(roomLockKey, roomLock);
    }
  } catch (error) {
    return res.status(500).json({ error: "경기 서버 오류", detail: error instanceof Error ? error.message : "unknown" });
  }
}
