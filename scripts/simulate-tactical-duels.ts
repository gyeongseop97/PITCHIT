import { resolvePlateAppearance, type BallDirection, type BatterRatings, type PitcherRatings, type PitchType, type SwingType } from "../lib/game-engine";

// Two identical agents play the published 3-inning rules.  They retain the
// last five choices, mix a read of that pattern with a deliberate feint, and
// use bait pitches mostly in strikeout counts.  This is intentionally not a
// random-at-bat test: it approximates two players trying to read one another.
const GAMES = Number(process.env.GAMES ?? 20_000);
const CELLS = Array.from({ length: 25 }, (_, index) => index);
const directions: BallDirection[] = ["high", "low", "in", "out"];
const batterTypes: Array<{ t: string } & BatterRatings> = [
  { t: "컨택형", p: 45, a: 85, e: 55, v: 45 }, { t: "파워형", p: 85, a: 48, e: 52, v: 45 },
  { t: "주루형", p: 45, a: 57, e: 48, v: 80 }, { t: "선구안형", p: 48, a: 58, e: 82, v: 42 },
];
const pitcherTypes: Array<{ t: string } & PitcherRatings> = [
  { t: "구속형", v: 86, c: 52, s: 50, m: 42 }, { t: "제구형", v: 48, c: 88, s: 48, m: 46 },
  { t: "구위형", v: 53, c: 50, s: 87, m: 40 }, { t: "변화형", v: 50, c: 54, s: 45, m: 86 },
];
type Batter = { t: string } & BatterRatings;
type Pitcher = { t: string } & PitcherRatings;
type Team = { lineup: Batter[]; pitchers: Pitcher[]; active: number; used: number[]; batter: number; runsAllowed: number; baitUsed: number };
type Line = { games: number; wins: number; runs: number; h: number; ab: number; bb: number; so: number; hr: number; doubles: number; triples: number; outsPitched: number; runsAllowed: number; mistakes: number; wild: number; bait: number; baitChase: number; pitches: number };
type Memory = { bat: number[]; pitch: number[] };
const blank = (): Line => ({ games: 0, wins: 0, runs: 0, h: 0, ab: 0, bb: 0, so: 0, hr: 0, doubles: 0, triples: 0, outsPitched: 0, runsAllowed: 0, mistakes: 0, wild: 0, bait: 0, baitChase: 0, pitches: 0 });
const choose = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)];
const makeTeam = (): Team => { const active = Math.floor(Math.random() * 4); return { lineup: Array.from({ length: 9 }, () => ({ ...choose(batterTypes) })), pitchers: [...pitcherTypes].sort(() => Math.random() - .5), active, used: [active], batter: 0, runsAllowed: 0, baitUsed: 0 }; };
const distance = (a: number, b: number) => Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) + Math.abs(a % 5 - b % 5);
const nearby = (cell: number) => CELLS.filter(candidate => distance(candidate, cell) <= 1);
const weightedRead = (history: number[]) => {
  if (!history.length) return choose(CELLS);
  const score = new Map<number, number>();
  history.slice(-5).forEach((cell, index) => score.set(cell, (score.get(cell) ?? 0) + index + 1));
  const best = Math.max(...score.values());
  return choose([...score.entries()].filter(([, value]) => value === best).map(([cell]) => cell));
};
const directionFor = (target: number): BallDirection => {
  const row = Math.floor(target / 5), col = target % 5;
  if (row <= 1) return "high";
  if (row >= 3) return "low";
  return col <= 2 ? "in" : "out";
};
function battingPlan(team: Team, memory: Memory, strikes: number): { cell: number; swing: SwingType } {
  const batter = team.lineup[team.batter];
  const read = weightedRead(memory.pitch);
  // 62% pattern read, 23% near-pattern adjustment, 15% intentional feint.
  const cell = Math.random() < .62 ? read : Math.random() < .82 ? choose(nearby(read)) : choose(CELLS);
  let swing: SwingType = batter.t === "파워형" ? "power" : batter.t === "선구안형" ? "spot" : "contact";
  if (strikes >= 2) swing = "contact";
  else if (batter.t === "컨택형" && Math.random() < .12) swing = "power";
  else if (batter.t === "주루형" && Math.random() < .10) swing = "spot";
  return { cell, swing };
}
function pitchingPlan(team: Team, memory: Memory, balls: number, strikes: number, baitRemaining: number): { cell: number; pitch: PitchType; ball?: BallDirection } {
  const pitcher = team.pitchers[team.active];
  const expected = weightedRead(memory.bat);
  const counter = CELLS.filter(cell => distance(cell, expected) >= 3);
  const cell = Math.random() < .48 ? choose(counter) : Math.random() < .78 ? choose(nearby(expected)) : choose(CELLS);
  const pitch: PitchType = (pitcher.m >= 70 && Math.random() < .57) || (strikes >= 2 && Math.random() < .46) ? "breaking" : "fast";
  // Avoid baiting in a hitter's count; that should be a pressure option, not
  // a default.  The ten-pitch match limit is respected below.
  const baitChance = strikes >= 2 ? .36 : balls === 0 && strikes === 1 ? .16 : .07;
  const ball = baitRemaining > 0 && balls < 3 && Math.random() < baitChance ? directionFor(expected) : undefined;
  return { cell, pitch, ball };
}
function maybeChangePitcher(team: Team, inning: number) {
  if ((team.runsAllowed < 3 && inning < 3) || team.used.length >= team.pitchers.length) return;
  const next = team.pitchers.findIndex((_, index) => !team.used.includes(index));
  if (next >= 0) { team.active = next; team.used.push(next); }
}
function advance(bases: number[], basesTaken: number, speed: number): number {
  let runs = 0; const next = [0, 0, 0];
  for (let index = 2; index >= 0; index--) if (bases[index]) { const destination = index + basesTaken; if (destination >= 3) runs++; else next[destination] = bases[index]; }
  if (basesTaken >= 4) runs++; else next[basesTaken - 1] = speed;
  if (basesTaken === 1 && next[2] && Math.random() < Math.min(.26, Math.max(.03, (next[2] - 36) / 175))) { next[2] = 0; runs++; }
  bases.splice(0, 3, ...next); return runs;
}
function forceWalk(bases: number[], speed: number): number {
  const run = bases.every(Boolean) ? 1 : 0; if (bases[1]) bases[2] = bases[1]; if (bases[0]) bases[1] = bases[0]; bases[0] = speed; return run;
}
function playHalf(offense: Team, defense: Team, hitting: Line, pitching: Line, battingMemory: Memory, pitchingMemory: Memory, inning: number, extraRunner: boolean) {
  let outs = 0, balls = 0, strikes = 0, runs = 0, baitRemaining = Math.max(0, 10 - defense.baitUsed);
  const bases = extraRunner ? [0, 55, 0] : [0, 0, 0];
  while (outs < 3) {
    maybeChangePitcher(defense, inning);
    const bat = battingPlan(offense, battingMemory, strikes);
    const pitch = pitchingPlan(defense, pitchingMemory, balls, strikes, baitRemaining);
    if (pitch.ball) { pitching.bait++; defense.baitUsed++; baitRemaining--; }
    const batter = offense.lineup[offense.batter], pitcher = defense.pitchers[defense.active];
    const result = resolvePlateAppearance({ batter, pitcher, targetCell: bat.cell, pitchCell: pitch.cell, ballDirection: pitch.ball, swing: bat.swing, pitch: pitch.pitch, count: { balls, strikes } });
    pitching.pitches++; battingMemory.pitch.push(pitch.cell); pitchingMemory.bat.push(bat.cell);
    if (battingMemory.pitch.length > 5) battingMemory.pitch.shift(); if (pitchingMemory.bat.length > 5) pitchingMemory.bat.shift();
    if (result.execution === "mistake") pitching.mistakes++; if (result.execution === "wild") pitching.wild++; if (result.execution === "bait" && result.outcome === "swinging_strike") pitching.baitChase++;
    if (result.outcome === "ball") { if (++balls < 4) continue; hitting.bb++; runs += forceWalk(bases, batter.v); offense.batter = (offense.batter + 1) % 9; balls = 0; strikes = 0; continue; }
    if (result.outcome === "foul") { strikes = Math.min(2, strikes + 1); continue; }
    if (result.outcome === "swinging_strike") { if (++strikes < 3) continue; hitting.ab++; hitting.so++; outs++; pitching.outsPitched++; offense.batter = (offense.batter + 1) % 9; balls = 0; strikes = 0; continue; }
    hitting.ab++;
    if (result.outcome === "groundout" || result.outcome === "flyout") {
      if (result.outcome === "flyout" && outs < 2 && bases[2] && Math.random() < Math.min(.42, Math.max(.10, .12 + (bases[2] - 40) / 145))) { bases[2] = 0; runs++; }
      outs++; pitching.outsPitched++; offense.batter = (offense.batter + 1) % 9; balls = 0; strikes = 0; continue;
    }
    const taken = result.outcome === "homerun" ? 4 : result.outcome === "triple" ? 3 : result.outcome === "double" ? 2 : 1;
    hitting.h++; if (taken === 2) hitting.doubles++; if (taken === 3) hitting.triples++; if (taken === 4) hitting.hr++;
    runs += advance(bases, taken, batter.v); offense.batter = (offense.batter + 1) % 9; balls = 0; strikes = 0;
  }
  hitting.runs += runs; pitching.runsAllowed += runs; defense.runsAllowed += runs;
  return runs;
}
const a = blank(), b = blank();
let innings = 0, extras = 0;
for (let game = 0; game < GAMES; game++) {
  const teamA = makeTeam(), teamB = makeTeam(), memoryA: Memory = { bat: [], pitch: [] }, memoryB: Memory = { bat: [], pitch: [] };
  let scoreA = 0, scoreB = 0, inning = 1;
  while (true) {
    scoreA += playHalf(teamA, teamB, a, b, memoryA, memoryB, inning, inning >= 4);
    scoreB += playHalf(teamB, teamA, b, a, memoryB, memoryA, inning, inning >= 4);
    innings += 2;
    if (inning >= 3 && scoreA !== scoreB) break;
    inning++; if (inning >= 4) extras++;
    if (inning > 12) break;
  }
  a.games++; b.games++; if (scoreA > scoreB) a.wins++; else if (scoreB > scoreA) b.wins++;
}
const stat = (name: string, line: Line) => ({
  전략: name, 경기: line.games, 승: line.wins, 승률: +(line.wins / line.games).toFixed(3), 경기당득점: +(line.runs / line.games).toFixed(2),
  타율: +(line.h / line.ab).toFixed(3), 안타: line.h, 경기당안타: +(line.h / line.games).toFixed(2), 홈런: line.hr, '2루타': line.doubles, '3루타': line.triples,
  볼넷: line.bb, 삼진: line.so, 경기당볼넷: +(line.bb / line.games).toFixed(2), 경기당삼진: +(line.so / line.games).toFixed(2),
  실투: line.mistakes, 제구이탈볼: line.wild, 유인구: line.bait, 유인구헛스윙: line.baitChase, 유인성공률: line.bait ? +(line.baitChase / line.bait).toFixed(3) : 0,
  방어율: +(line.runsAllowed * 27 / line.outsPitched).toFixed(2), 투구수: line.pitches,
});
console.log(`전략적 1대1 시뮬레이션 ${GAMES.toLocaleString()}경기 · 평균 ${+(innings / (GAMES * 2)).toFixed(2)}이닝/팀 · 연장전 ${extras.toLocaleString()}회`);
console.table([stat("플레이어 A", a), stat("플레이어 B", b), stat("양 팀 합산/2", Object.fromEntries(Object.keys(a).map(key => [key, (a as any)[key] + (b as any)[key]])) as Line)]);
