import { resolvePlateAppearance, type PitcherRatings } from "../lib/game-engine";

const TRIALS = 100_000;
const pitchers: Record<string, PitcherRatings> = {
  구속형: { v: 86, c: 52, s: 50, m: 42 },
  제구형: { v: 48, c: 88, s: 48, m: 46 },
  구위형: { v: 53, c: 50, s: 87, m: 40 },
  변화형: { v: 50, c: 54, s: 45, m: 86 },
};
const locations = { 중앙: 12, 변두리: 2, 모서리: 0 } as const;

function measure(name: string, pitcher: PitcherRatings, pitchCell: number, pitch: "fast" | "breaking") {
  let mistakes = 0, commandMissBalls = 0, balls = 0;
  for (let i = 0; i < TRIALS; i++) {
    // The batter targets a different square with zero eye rating. This isolates
    // the pitcher's directed-mistake and accidental-ball probabilities.
    const targetCell = pitchCell === 12 ? 6 : 12;
    const result = resolvePlateAppearance({
      batter: { p: 60, a: 60, e: 0, v: 60 }, pitcher,
      targetCell, pitchCell, swing: "contact", pitch, count: { balls: 0, strikes: 0 },
    });
    // A hanging pitch and a command miss are separate events. The old report
    // counted every moved ball as a "mistake", which overstated hanger risk.
    if (result.execution === "mistake") mistakes++;
    if (result.execution === "wild") commandMissBalls++;
    if (result.outcome === "ball") balls++;
  }
  return { 투수: name, 구종: pitch === "fast" ? "패스트볼" : "변화구", 위치: Object.entries(locations).find(([, cell]) => cell === pitchCell)?.[0], 실투율: +(mistakes / TRIALS).toFixed(3), 제구이탈볼: +(commandMissBalls / TRIALS).toFixed(3), 전체볼확률: +(balls / TRIALS).toFixed(3) };
}

console.table(Object.entries(pitchers).flatMap(([name, pitcher]) => (["fast", "breaking"] as const).flatMap(pitch => Object.values(locations).map(cell => measure(name, pitcher, cell, pitch)))));
