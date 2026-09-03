import { Redis } from "@upstash/redis";
import { randomBytes } from "node:crypto";
import { resolvePlateAppearance, type PitchType, type SwingType } from "../../../lib/game-engine";

type PlayerId = "p1" | "p2";
type Choice = { kind: "bat" | "pitch"; cell: number; swing?: string; pitch?: string };
type Batter = { n: string; t: string; p: number; a: number; e: number; v: number };
type Pitcher = { n: string; t: string; v: number; c: number; s: number; m: number };
type Team = { lineup: Batter[]; pitchers: Pitcher[]; activePitcher: number; usedPitchers: number[] };
type Game = {
  status: "waiting" | "playing" | "finished";
  inning: number;
  half: 0 | 1;
  scores: [number, number];
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
  lastPlay: { bat: Choice; pitch: Choice; attacker: PlayerId; pitchName: string; speed: number; actualCell: number } | null;
  event: string;
};
type Room = { code: string; mode: "friend" | "quick"; players: Record<PlayerId, { token: string; name: string } | null>; game: Game };

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});
const ttl = 60 * 60 * 6;
const key = (code: string) => `pitchit:room:${code}`;
const quickQueueKey = "pitchit:quick:queue";
const quickQueueLockKey = "pitchit:quick:queue:lock";
const actor = (game: Game): PlayerId => (game.half === 0 ? "p1" : "p2");
const defender = (game: Game): PlayerId => (actor(game) === "p1" ? "p2" : "p1");
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
  const pitchers = [...pitcherTypes].sort(() => Math.random() - 0.5).map((pitcher, index) => ({ ...pitcher, n: `${index + 1}번 투수` }));
  const activePitcher = Math.floor(Math.random() * pitchers.length);
  return { lineup, pitchers, activePitcher, usedPitchers: [activePitcher] };
};
const freshGame = (): Game => ({
  status: "waiting", inning: 1, half: 0, scores: [0, 0], hits: [0, 0], walks: [0, 0], balls: 0, strikes: 0, outs: 0,
  bases: [0, 0, 0], batter: [0, 0], teams: { p1: makeTeam(), p2: makeTeam() }, deadline: 0, choices: {}, lastPlay: null, event: "친구의 입장을 기다리는 중입니다.",
});
const code = () => randomBytes(3).toString("hex").toUpperCase();
const token = () => randomBytes(18).toString("base64url");
const publicRoom = (room: Room) => ({
  code: room.code,
  ready: room.game.status === "playing",
  players: { p1: room.players.p1?.name ?? null, p2: room.players.p2?.name ?? null },
  game: { ...room.game, choices: {} },
  attacker: actor(room.game),
});

function advance(game: Game, runs: number) {
  const side = game.half;
  const next: [number, number, number] = [0, 0, 0];
  for (let i = 2; i >= 0; i--) if (game.bases[i]) {
    const destination = i + runs;
    if (destination >= 3) game.scores[side]++;
    else next[destination as 0 | 1 | 2] = 1;
  }
  if (runs >= 4) game.scores[side]++;
  else next[(runs - 1) as 0 | 1 | 2] = 1;
  game.bases = next;
}
function walk(game: Game) {
  const side = game.half;
  if (game.bases[0] && game.bases[1] && game.bases[2]) game.scores[side]++;
  if (game.bases[1]) game.bases[2] = 1;
  if (game.bases[0]) game.bases[1] = 1;
  game.bases[0] = 1;
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
  if (game.half === 0) game.half = 1;
  else if (game.inning >= 3) {
    game.status = "finished";
    game.deadline = 0;
    game.event = game.scores[0] === game.scores[1] ? "3이닝 종료 · 무승부" : `3이닝 종료 · ${game.scores[0] > game.scores[1] ? "p1" : "p2"} 승리`;
  } else { game.half = 0; game.inning++; }
}
function resolve(room: Room) {
  const game = room.game;
  if (game.status !== "playing") return;
  const battingPlayer = actor(game);
  const batting = game.choices[battingPlayer] ?? { kind: "bat" as const, cell: Math.floor(Math.random() * 25), swing: "contact" };
  const pitching = game.choices[defender(game)] ?? { kind: "pitch" as const, cell: Math.floor(Math.random() * 25), pitch: "fast" };
  const pitcher = game.teams[defender(game)].pitchers[game.teams[defender(game)].activePitcher];
  const batter = game.teams[battingPlayer].lineup[game.batter[game.half]];
  const plate = resolvePlateAppearance({
    batter,
    pitcher,
    targetCell: batting.cell,
    pitchCell: pitching.cell,
    swing: (batting.swing ?? "contact") as SwingType,
    pitch: (pitching.pitch ?? "fast") as PitchType,
    count: { balls: game.balls, strikes: game.strikes },
  });
  game.lastPlay = { bat: batting, pitch: pitching, attacker: battingPlayer, pitchName: plate.pitchName, speed: plate.speed, actualCell: plate.actualCell };
  game.event = plate.message;
  if (plate.outcome === "ball") {
    game.balls++;
    if (game.balls >= 4) { game.walks[game.half]++; walk(game); game.event = `${plate.message} · 볼넷`; endPlate(game); }
  } else if (plate.outcome === "foul") {
    game.strikes = Math.min(2, game.strikes + 1);
  } else if (plate.outcome === "swinging_strike") {
    game.strikes++;
    if (game.strikes >= 3) { game.outs++; game.event = `${plate.message} · 삼진 아웃`; endPlate(game); }
  } else if (plate.outcome === "groundout" || plate.outcome === "flyout") {
    game.outs++;
    endPlate(game);
  } else {
    const bases = plate.outcome === "homerun" ? 4 : plate.outcome === "triple" ? 3 : plate.outcome === "double" ? 2 : 1;
    game.hits[game.half]++; advance(game, bases); endPlate(game);
  }
  if (game.status === "playing") nextPitch(game);
}
async function readBody(req: any) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
}
async function load(code: string) { return redis.get<Room>(key(code)); }
async function save(room: Room) { await redis.set(key(room.code), room, { ex: ttl }); }
async function acquire(keyName: string) {
  const lockToken = token();
  const acquired = await redis.set(keyName, lockToken, { nx: true, ex: 3 });
  return acquired ? lockToken : null;
}
async function release(keyName: string, lockToken: string) {
  // Only the holder deletes the short-lived lock. The check prevents an expired lock from deleting a newer one.
  if (await redis.get<string>(keyName) === lockToken) await redis.del(keyName);
}
function startRoom(room: Room, joining: { token: string; name: string }) {
  room.players.p2 = joining;
  room.game.status = "playing";
  room.game.event = "매칭 완료! 20초 안에 작전을 선택하세요.";
  nextPitch(room.game);
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
    if (input.action === "quick") {
      const queueLock = await acquire(quickQueueLockKey);
      if (!queueLock) return res.status(409).json({ error: "매칭 대기열을 확인 중입니다. 다시 눌러 주세요." });
      try {
        const waitingCode = await redis.get<string>(quickQueueKey);
        if (waitingCode) {
          const waitingRoom = await load(waitingCode);
          if (waitingRoom?.mode === "quick" && waitingRoom.game.status === "waiting" && waitingRoom.players.p1?.name !== input.name) {
            const joining = { token: token(), name: input.name || "플레이어 2" };
            startRoom(waitingRoom, joining);
            await save(waitingRoom);
            await redis.del(quickQueueKey);
            return res.json({ ...publicRoom(waitingRoom), player: "p2", token: joining.token });
          }
          await redis.del(quickQueueKey);
        }
        const room: Room = { code: code(), mode: "quick", players: { p1: { token: token(), name: input.name || "플레이어 1" }, p2: null }, game: freshGame() };
        room.game.event = "상대를 찾는 중입니다…";
        await save(room);
        await redis.set(quickQueueKey, room.code, { ex: 45 });
        return res.status(201).json({ ...publicRoom(room), player: "p1", token: room.players.p1!.token, searching: true });
      } finally { await release(quickQueueLockKey, queueLock); }
    }
    if (input.action === "create") {
      const room: Room = { code: code(), mode: "friend", players: { p1: { token: token(), name: input.name || "플레이어 1" }, p2: null }, game: freshGame() };
      await save(room);
      return res.status(201).json({ ...publicRoom(room), player: "p1", token: room.players.p1!.token });
    }
    const room = await load(String(input.code || "").toUpperCase());
    if (!room) return res.status(404).json({ error: "방을 찾을 수 없습니다." });
    const needsRoomLock = input.action === "join" || input.action === "choose";
    const roomLockKey = `pitchit:room:${room.code}:lock`;
    const roomLock = needsRoomLock ? await acquire(roomLockKey) : null;
    if (needsRoomLock && !roomLock) return res.status(409).json({ error: "상대 선택을 처리 중입니다. 잠시 후 다시 시도해 주세요." });
    try {
    if (input.action === "join") {
      if (room.players.p2) return res.status(409).json({ error: "이미 두 명이 입장한 방입니다." });
      startRoom(room, { token: token(), name: input.name || "플레이어 2" });
      await save(room);
      return res.json({ ...publicRoom(room), player: "p2", token: room.players.p2!.token });
    }
    const player = identify(room, input.token);
    if (!player) return res.status(403).json({ error: "유효하지 않은 참가자입니다." });
    if (room.game.status === "playing" && Date.now() >= room.game.deadline) resolve(room);
    if (input.action === "choose") {
      if (room.game.status === "finished") return res.status(409).json({ error: "이미 종료된 경기입니다." });
      const expected = player === actor(room.game) ? "bat" : "pitch";
      if (input.choice?.kind !== expected) return res.status(409).json({ error: "현재 차례의 작전이 아닙니다." });
      room.game.choices[player] = input.choice;
      if (room.game.choices.p1 && room.game.choices.p2) resolve(room);
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
