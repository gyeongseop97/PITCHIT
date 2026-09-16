export type RunnerMove = { from: number; to: number; forced: boolean; out: boolean; scored: boolean; stopped: boolean; tagUp?: boolean; retreat?: boolean; speed?: number };
export type FieldChoice = { position: [number, number, number]; fielder: number; strategy: string };
export type GroundBallResult = {
  kind: "double_play" | "force_out" | "groundout";
  basesAfter: [number, number, number];
  runnerMoves: RunnerMove[];
  throws: number[];
  outsRecorded: number;
  runsScored: number;
  runsBattedIn: number;
  inningEnded: boolean;
  note: string;
  field?: FieldChoice;
};

export type RunningResult = Omit<GroundBallResult, "kind"> & { kind: "walk" | "flyout" };
const basePoints = [[0, 0], [19.4, -19.4], [0, -38.8], [-19.4, -19.4], [0, 0]];
const fieldPositions = [[19, -21], [9, -30], [-12, -27], [-21, -20]];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Forced awards only propagate through an unbroken chain from first base. */
export function resolveWalk({ bases, batterSpeed }: { bases: readonly number[]; batterSpeed: number }): RunningResult {
  const basesAfter: [number, number, number] = [batterSpeed, 0, 0];
  const runnerMoves: RunnerMove[] = [{ from: 0, to: 1, forced: true, out: false, scored: false, stopped: false, speed: batterSpeed }];
  let runsScored = 0;
  for (let i = 2; i >= 0; i--) {
    if (!bases[i]) continue;
    const forced = bases.slice(0, i + 1).every(Boolean), to = i + 1 + Number(forced);
    runnerMoves.push({ from: i + 1, to, forced, out: false, scored: to === 4, stopped: false, speed: bases[i] });
    if (to === 4) runsScored++; else basesAfter[to - 1] = bases[i];
  }
  return { kind: "walk", basesAfter, runnerMoves, throws: [], outsRecorded: 0, runsScored, runsBattedIn: runsScored, inningEnded: false, note: "" };
}

/** The catch retires the batter first; two-out catches never allow a run. */
export function resolveFlyBall({ bases, outs, batterPower = 55, outfield = true, random = Math.random }: {
  bases: readonly number[]; outs: number; batterPower?: number; outfield?: boolean; random?: () => number;
}): RunningResult {
  const inningEnded = outs >= 2, basesAfter: [number, number, number] = [0, 0, 0];
  const runnerMoves: RunnerMove[] = [{ from: 0, to: 1, forced: false, out: true, scored: false, stopped: false }];
  const notes: string[] = []; let runsScored = 0;
  for (let i = 2; i >= 0; i--) {
    if (!bases[i]) continue;
    const speed = bases[i] === 1 ? 55 : bases[i];
    const chance = clamp([.14, .40, .70][i] + (speed - 55) / 180 + (batterPower - 55) / 300, .06, .93);
    const advance = !inningEnded && outfield && (i === 2 || !basesAfter[i + 1]) && random() < chance;
    const to = i + 1 + Number(advance);
    runnerMoves.push({ from: i + 1, to: inningEnded ? i + 2 : to, forced: false, out: false, scored: advance && to === 4, stopped: inningEnded, tagUp: advance, retreat: !advance && !inningEnded, speed });
    if (inningEnded) continue;
    if (to === 4) runsScored++; else basesAfter[to - 1] = bases[i];
    if (advance) notes.push(`${i + 1}루 주자 태그업 ${to === 4 ? "득점" : `${to}루`}`);
  }
  return { kind: "flyout", basesAfter, runnerMoves, throws: inningEnded ? [] : [runnerMoves.some(r => r.scored) ? 4 : runnerMoves.some(r => r.tagUp && r.to === 3) ? 3 : 2], outsRecorded: 1, runsScored, runsBattedIn: runsScored, inningEnded, note: notes.length ? ` · ${notes.join(" · ")}` : "" };
}

/** Resolve from the pre-contact force chain; a third force out or batter out
 * before first cancels every run (MLB 5.08(a)). Field choice is authoritative. */
export function resolveGroundBall({ bases, outs, batterSpeed, doublePlayChance = .20, random = Math.random, contact, field: suppliedField }: {
  bases: readonly number[]; outs: number; batterSpeed: number; doublePlayChance?: number; random?: () => number;
  contact?: { actualCell: number; batCell: number; defenseLead?: number; inning?: number };
  field?: FieldChoice;
}): GroundBallResult {
  const forced = bases.map((runner, index) => Boolean(runner) && bases.slice(0, index + 1).every(Boolean));
  let field = suppliedField;
  if (!field && contact) {
    const angle = clamp((contact.actualCell % 5 - 2) * .27 + (contact.actualCell % 5 - contact.batCell % 5) * .08 + (random() - .5) * .95, -.80, .80);
    const depth = 15 + random() * 21, position: [number, number, number] = [Math.sin(angle) * depth, 0, -Math.cos(angle) * depth];
    const distances = fieldPositions.map(([x, z]) => Math.hypot(position[0] - x, position[2] - z));
    field = { position, fielder: distances.indexOf(Math.min(...distances)), strategy: "" };
  }
  let target = bases[0] ? 2 : 1;
  if (field) {
    const [x, , z] = field.position, depth = Math.hypot(x, z);
    const distanceTo = (base: number) => Math.hypot(x - basePoints[base][0], z - basePoints[base][1]);
    if (outs === 2) target = [1, ...forced.flatMap((v, i) => v ? [i + 2] : [])].sort((a, b) => distanceTo(a) - distanceTo(b))[0];
    else if (forced[2] && depth < 25 && Math.abs(contact?.defenseLead ?? 0) <= 1) target = 4;
    else if (forced[1] && x < -12 && depth < 31) target = 3;
    else if (depth > 31 || field.fielder === 0 || !bases[0]) target = 1;
    field = { ...field, strategy: target === 4 ? "home-force" : target === 3 ? "third-force" : target === 2 ? "second-force" : "sure-out" };
  }
  const forceOut = target > 1;
  const doublePlay = forceOut && outs < 2 && random() < doublePlayChance && (!field || Math.hypot(field.position[0], field.position[2]) < 31);
  const outsRecorded = doublePlay ? 2 : 1, inningEnded = outs + outsRecorded >= 3;
  const basesAfter: [number, number, number] = [0, 0, 0];
  const batterOut = !forceOut || doublePlay;
  const runnerMoves: RunnerMove[] = [{ from: 0, to: 1, forced: true, out: batterOut, scored: false, stopped: inningEnded && !batterOut, speed: batterSpeed }];
  const notes: string[] = [];
  const baseName = target === 4 ? "홈" : `${target}루`;
  if (doublePlay) notes.push(`병살타! ${target - 1}루 주자와 타자 주자가 모두 아웃됩니다.`);
  else if (forceOut) notes.push(inningEnded ? `${target - 1}루 주자 ${baseName}에서 포스 아웃` : `${target - 1}루 주자 ${baseName}에서 포스 아웃, 타자 주자 1루 생존`);
  if (!batterOut && !inningEnded) basesAfter[0] = batterSpeed;
  let runsScored = 0;
  for (let index = 2; index >= 0; index--) {
    const runner = bases[index]; if (!runner) continue;
    const from = index + 1, out = forceOut && from === target - 1;
    let to = from;
    if (forced[index] || inningEnded) to = from + 1;
    else {
      const speed = runner === 1 ? 55 : runner;
      const chance = index === 2 ? Math.min(.90, Math.max(.56, .70 + (speed - 55) / 125)) : Math.min(.72, Math.max(.36, .50 + (speed - 55) / 140));
      if ((index === 2 || !basesAfter[index + 1]) && random() < chance) to = from + 1;
    }
    const scored = to === 4 && !out && !inningEnded;
    runnerMoves.push({ from, to, forced: forced[index], out, scored, stopped: inningEnded && !out, speed: runner });
    if (out || inningEnded) continue;
    if (scored) runsScored++;
    else basesAfter[to - 1] = runner;
    if (to > from) notes.push(`${from}루 주자 ${to === 4 ? "홈 쇄도 득점" : `${to}루 진루`}`);
  }
  if (inningEnded) notes.push("세 번째 아웃 · 득점 인정 없음");
  return { kind: doublePlay ? "double_play" : forceOut ? "force_out" : "groundout", basesAfter, runnerMoves, throws: doublePlay ? [target, 1] : [target], outsRecorded, runsScored, runsBattedIn: doublePlay ? 0 : runsScored, inningEnded, field, note: notes.length ? ` · ${notes.join(" · ")}` : "" };
}
