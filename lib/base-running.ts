export type RunnerMove = { from: number; to: number; forced: boolean; out: boolean; scored: boolean; stopped: boolean };
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
};

/** The force is determined at contact, before removing any retired runner.
 * Force removal may allow a lead runner to return; this game's defense throws
 * second-to-first, so those runners keep advancing while the relay is made.
 * MLB 5.08(a): a third force out / batter out before first cancels every run.
 */
export function resolveGroundBall({ bases, outs, batterSpeed, doublePlayChance = .20, random = Math.random }: {
  bases: readonly number[]; outs: number; batterSpeed: number; doublePlayChance?: number; random?: () => number;
}): GroundBallResult {
  const forced = bases.map((runner, index) => Boolean(runner) && bases.slice(0, index + 1).every(Boolean));
  const forceAtSecond = Boolean(bases[0]);
  const doublePlay = forceAtSecond && outs < 2 && random() < doublePlayChance;
  const outsRecorded = doublePlay ? 2 : 1, inningEnded = outs + outsRecorded >= 3;
  const basesAfter: [number, number, number] = [0, 0, 0];
  const batterOut = !forceAtSecond || doublePlay;
  const runnerMoves: RunnerMove[] = [{ from: 0, to: 1, forced: true, out: batterOut, scored: false, stopped: inningEnded && !batterOut }];
  const notes: string[] = [];
  if (doublePlay) notes.push("병살타! 1루 주자와 타자 주자가 모두 아웃됩니다.");
  else if (forceAtSecond) notes.push(inningEnded ? "1루 주자 2루에서 포스 아웃" : "1루 주자 아웃, 타자 주자 1루 생존");
  if (!batterOut && !inningEnded) basesAfter[0] = batterSpeed;
  let runsScored = 0;
  for (let index = 2; index >= 0; index--) {
    const runner = bases[index]; if (!runner) continue;
    const from = index + 1, out = index === 0 && forceAtSecond;
    let to = from;
    if (forced[index] || inningEnded) to = from + 1;
    else {
      const speed = runner === 1 ? 55 : runner;
      const chance = index === 2 ? Math.min(.90, Math.max(.56, .70 + (speed - 55) / 125)) : Math.min(.72, Math.max(.36, .50 + (speed - 55) / 140));
      if ((index === 2 || !basesAfter[index + 1]) && random() < chance) to = from + 1;
    }
    const scored = to === 4 && !out && !inningEnded;
    runnerMoves.push({ from, to, forced: forced[index], out, scored, stopped: inningEnded && !out });
    if (out || inningEnded) continue;
    if (scored) runsScored++;
    else basesAfter[to - 1] = runner;
    if (to > from) notes.push(`${from}루 주자 ${to === 4 ? "홈 쇄도 득점" : `${to}루 진루`}`);
  }
  if (inningEnded) notes.push("세 번째 아웃 · 득점 인정 없음");
  return { kind: doublePlay ? "double_play" : forceAtSecond ? "force_out" : "groundout", basesAfter, runnerMoves, throws: doublePlay ? [2, 1] : [forceAtSecond ? 2 : 1], outsRecorded, runsScored, runsBattedIn: doublePlay ? 0 : runsScored, inningEnded, note: notes.length ? ` · ${notes.join(" · ")}` : "" };
}
