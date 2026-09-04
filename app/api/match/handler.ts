import { Redis } from "@upstash/redis";
import { randomBytes } from "node:crypto";
import { resolvePlateAppearance, type PitchType, type PlayOutcome, type SwingType } from "../../../lib/game-engine";

type PlayerId = "p1" | "p2";
type Choice = { kind: "bat" | "pitch"; cell: number; swing?: string; pitch?: string };
type Batter = { n: string; t: string; p: number; a: number; e: number; v: number };
type Pitcher = { n: string; t: string; v: number; c: number; s: number; m: number };
type Team = { lineup: Batter[]; pitchers: Pitcher[]; activePitcher: number; usedPitchers: number[] };
type PlayMemory = { batCell: number; pitchCell: number; actualCell: number; attacker: PlayerId; pitchName: string; speed: number };
type PlayLog = PlayMemory & { inning: number; half: 0 | 1; swing: string; pitch: string; outcome: string; event: string; runsBattedIn: number; outsRecorded: number; execution?: "command" | "mistake" | "wild"; strikeStyle?: "swinging" | "looking" };
type RankingResult = { before: number; points: number; change: number; wins: number; losses: number; draws: number; games: number };
type Game = {
  status: "waiting" | "playing" | "finished";
  // The pre-game card is not part of a turn: keep its countdown separate
  // from the 20-second decision deadline.
  introUntil?: number;
  forfeitWinner?: PlayerId;
  rankingApplied?: boolean;
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
  lastPlay: { bat: Choice; pitch: Choice; attacker: PlayerId; pitchName: string; speed: number; actualCell: number; outcome: PlayOutcome; execution?: "command" | "mistake" | "wild"; strikeStyle?: "swinging" | "looking" } | null;
  history: PlayMemory[];
  playLog: PlayLog[];
  aiStyle: "공격형" | "모서리형" | "변화구형" | "혼합형";
  event: string;
};
type Player = { token: string; name: string; profileId?: string };
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
const batterTypes = [
  { t: "컨택형", p: 45, a: 85, e: 55, v: 45 }, { t: "파워형", p: 85, a: 48, e: 52, v: 45 },
  { t: "주루형", p: 45, a: 57, e: 48, v: 80 }, { t: "선구안형", p: 48, a: 58, e: 82, v: 42 },
];
const pitcherTypes = [
  { t: "구속형", v: 86, c: 52, s: 50, m: 42 }, { t: "제구형", v: 48, c: 88, s: 48, m: 46 },
  { t: "구위형", v: 53, c: 50, s: 87, m: 40 }, { t: "변화형", v: 50, c: 54, s: 45, m: 86 },
];
const makeTeam = (): Team => {
  const lineup = Array.from({ length: 9 }, (_, index) => ({ ...batterTypes[Math.floor(Math.random() * batterTypes.length)], n: `${index + 1}번 타자` }));
  const pitchers = [...pitcherTypes].sort(() => Math.random() - 0.5).map((pitcher) => ({ ...pitcher, n: `${pitcher.t} 투수` }));
  const activePitcher = Math.floor(Math.random() * pitchers.length);
  return { lineup, pitchers, activePitcher, usedPitchers: [activePitcher] };
};
const freshGame = (): Game => ({
  status: "waiting", inning: 1, half: 0, scores: [0, 0], inningScores: [Array(9).fill(0), Array(9).fill(0)], hits: [0, 0], walks: [0, 0], balls: 0, strikes: 0, outs: 0,
  bases: [0, 0, 0], batter: [0, 0], teams: { p1: makeTeam(), p2: makeTeam() }, deadline: 0, choices: {}, lastPlay: null, history: [], playLog: [], aiStyle: ["공격형", "모서리형", "변화구형", "혼합형"][Math.floor(Math.random() * 4)] as Game["aiStyle"], event: "친구의 입장을 기다리는 중입니다.",
});
const code = () => randomBytes(3).toString("hex").toUpperCase();
const token = () => randomBytes(18).toString("base64url");
const profileId = (value: unknown) => {
  const candidate = String(value ?? "");
  return /^[A-Za-z0-9_-]{12,96}$/.test(candidate) ? candidate : token();
};
const rankingName = (value: unknown) => String(value ?? "플레이어").trim().slice(0, 16) || "플레이어";
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
  const restoreRecord = (saved?: RankingPlayer) => {
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
const publicRoom = (room: Room) => ({
  code: room.code,
  mode: room.mode,
  ready: room.game.status === "playing",
  players: { p1: room.players.p1?.name ?? null, p2: room.players.p2?.name ?? null },
  // Reveal only that a player has locked a choice.  Their target, swing and
  // pitch stay private until both choices are received and resolved.
  choiceReady: { p1: Boolean(room.game.choices.p1), p2: Boolean(room.game.choices.p2) },
  game: { ...room.game, choices: {} },
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
function nextPitch(game: Game) {
  game.choices = {};
  game.deadline = Date.now() + 20000;
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
  const batting = game.choices[battingPlayer] ?? { kind: "bat" as const, cell: strikeCells[Math.floor(Math.random() * strikeCells.length)], swing: "contact" };
  const pitching = game.choices[defender(game)] ?? { kind: "pitch" as const, cell: strikeCells[Math.floor(Math.random() * strikeCells.length)], pitch: "fast" };
  const pitcher = game.teams[defender(game)].pitchers[game.teams[defender(game)].activePitcher];
  const batter = game.teams[battingPlayer].lineup[game.batter[game.half]];
  const battingSide = battingPlayer === "p1" ? 0 : 1;
  const scoreBefore = game.scores[battingSide];
  const strikesBefore = game.strikes;
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
    if (game.balls >= 4) { game.walks[game.half]++; walk(game, batter.v); game.event = `${executionNotice}${plate.message} · 볼넷`; endPlate(game); }
  } else if (plate.outcome === "foul") {
    game.strikes = Math.min(2, game.strikes + 1);
  } else if (plate.outcome === "swinging_strike") {
    game.strikes++;
    if (game.strikes >= 3) { game.outs++; game.event = `${plate.message} · ${plate.strikeStyle === "looking" ? "루킹 삼진 아웃" : "헛스윙 스트라이크 삼진 아웃"}`; endPlate(game); }
  } else if (plate.outcome === "groundout" || plate.outcome === "flyout") {
    let tagUp = "";
    if (plate.outcome === "flyout" && game.outs < 2 && game.bases[2]) {
      const runnerSpeed = game.bases[2];
      const tagUpChance = Math.min(0.42, Math.max(0.10, 0.12 + (runnerSpeed - 40) / 145));
      if (Math.random() < tagUpChance) {
        game.bases[2] = 0;
        addRun(game);
        tagUp = " · 3루 주자가 태그업 득점!";
      }
    }
    game.outs++;
    game.event = `${plate.message}${tagUp}`;
    endPlate(game);
  } else {
    const bases = plate.outcome === "homerun" ? 4 : plate.outcome === "triple" ? 3 : plate.outcome === "double" ? 2 : 1;
    game.hits[game.half]++; const extraAdvance = advance(game, bases, batter.v); game.event = `${plate.message}${extraAdvance}`; endPlate(game);
  }
  game.playLog = [{
    inning: game.inning,
    half: game.half,
    batCell: batting.cell,
    pitchCell: pitching.cell,
    actualCell: plate.actualCell,
    attacker: battingPlayer,
    swing: batting.swing ?? "contact",
    pitch: pitching.pitch ?? "fast",
    pitchName: plate.pitchName,
    speed: plate.speed,
    outcome: plate.outcome,
    event: game.event,
    runsBattedIn: game.scores[battingSide] - scoreBefore,
    outsRecorded: plate.outcome === "groundout" || plate.outcome === "flyout" || (plate.outcome === "swinging_strike" && strikesBefore >= 2) ? 1 : 0,
    execution: plate.execution,
    strikeStyle: plate.strikeStyle,
  }, ...(game.playLog ?? [])].slice(0, 120);
  trackBalance(plate.outcome, batting.swing ?? "contact", pitching.pitch ?? "fast");
  if (room.game.status === "finished") await applyRankings(room);
  if (game.status === "playing") nextPitch(game);
}

const balanceKey = "pitchit:balance:v1";
function trackBalance(outcome: string, swing: string, pitch: string) {
  // Aggregate only anonymous game events. These counters are used to check
  // live balance trends without storing player names, rooms, or choices.
  void Promise.all([
    redis.hincrby(balanceKey, "plateAppearances", 1),
    redis.hincrby(balanceKey, `outcome:${outcome}`, 1),
    redis.hincrby(balanceKey, `swing:${swing}`, 1),
    redis.hincrby(balanceKey, `pitch:${pitch}`, 1),
  ]).catch(() => undefined);
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
  room.game.deadline = 0;
  room.game.choices = {};
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
    if (input.action === "stats") {
      const stats = await redis.hgetall<Record<string, number>>(balanceKey);
      return res.status(200).json({ stats: stats ?? {} });
    }
    if (input.action === "solo") {
      const room: Room = { code: code(), mode: "solo", players: { p1: { token: token(), name: input.name || "플레이어", profileId: profileId(input.profileId) }, p2: { token: "AI", name: "PITCHIT AI" } }, game: freshGame() };
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
            const joining = { token: token(), name: input.name || "플레이어 2", profileId: profileId(input.profileId) };
            const player = startRoom(waitingRoom, joining);
            await save(waitingRoom);
            await redis.del(quickQueueKey);
            return res.json({ ...publicRoom(waitingRoom), player, token: joining.token });
          }
          await redis.del(quickQueueKey);
        }
        const room: Room = { code: code(), mode: "quick", players: { p1: { token: token(), name: input.name || "플레이어 1", profileId: profileId(input.profileId) }, p2: null }, game: freshGame() };
        room.game.event = "상대를 찾는 중입니다…";
        await save(room);
        await redis.set(quickQueueKey, room.code, { ex: 45 });
        return res.status(201).json({ ...publicRoom(room), player: "p1", token: room.players.p1!.token, searching: true });
      } finally { await release(quickQueueLockKey, queueLock); }
    }
    if (input.action === "create") {
      const room: Room = { code: code(), mode: "friend", players: { p1: { token: token(), name: input.name || "플레이어 1", profileId: profileId(input.profileId) }, p2: null }, game: freshGame() };
      await save(room);
      return res.status(201).json({ ...publicRoom(room), player: "p1", token: room.players.p1!.token });
    }
    let room = await load(String(input.code || "").toUpperCase());
    if (!room) return res.status(404).json({ error: "방을 찾을 수 없습니다." });
    const needsRoomLock = input.action === "join" || input.action === "choose" || input.action === "swap" || input.action === "forfeit" || input.action === "rematch" || (input.action === "state" && Boolean(room.game.introUntil));
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
        next.deadline = 0;
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
      const joining = { token: token(), name: input.name || "플레이어 2", profileId: profileId(input.profileId) };
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
        nextPitch(room.game);
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
      const expected = player === actor(room.game) ? "bat" : "pitch";
      if (input.choice?.kind !== expected) return res.status(409).json({ error: "현재 차례의 작전이 아닙니다." });
      if (!validChoice(input.choice, expected)) return res.status(400).json({ error: "작전 선택값이 올바르지 않습니다." });
      room.game.choices[player] = input.choice;
      if (room.mode === "solo") {
        const ai = aiChoice(room.game, "p2");
        room.game.choices.p2 = ai;
      }
      if (room.game.choices.p1 && room.game.choices.p2) await resolve(room);
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
