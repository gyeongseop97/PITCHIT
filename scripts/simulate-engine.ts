import { resolvePlateAppearance, type BatterRatings, type PitcherRatings, type SwingType } from "../lib/game-engine";

type BatterProfile = { name: string; ratings: BatterRatings; swing: SwingType };
type PitcherProfile = { name: string; ratings: PitcherRatings; breakingRate: number; baitRate: number };
type StatLine = Record<"pa" | "ab" | "h" | "bb" | "so" | "foul" | "out" | "single" | "double" | "triple" | "hr", number>;

const PLATE_APPEARANCES = 100_000;
const cells = Array.from({ length: 25 }, (_, cell) => cell);
const directions = ["high", "low", "in", "out"] as const;
const batters: BatterProfile[] = [
  { name: "컨택형", ratings: { p: 45, a: 85, e: 55, v: 45 }, swing: "contact" },
  { name: "파워형", ratings: { p: 85, a: 48, e: 52, v: 45 }, swing: "power" },
  { name: "주루형", ratings: { p: 45, a: 57, e: 48, v: 80 }, swing: "contact" },
  { name: "선구안형", ratings: { p: 48, a: 58, e: 82, v: 42 }, swing: "spot" },
];
const pitchers: PitcherProfile[] = [
  { name: "구속형", ratings: { v: 86, c: 52, s: 50, m: 42 }, breakingRate: .28, baitRate: .20 },
  { name: "제구형", ratings: { v: 48, c: 88, s: 48, m: 46 }, breakingRate: .30, baitRate: .22 },
  { name: "구위형", ratings: { v: 53, c: 50, s: 87, m: 40 }, breakingRate: .30, baitRate: .19 },
  { name: "변화형", ratings: { v: 50, c: 54, s: 45, m: 86 }, breakingRate: .55, baitRate: .30 },
];

const choose = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
const empty = (): StatLine => ({ pa: 0, ab: 0, h: 0, bb: 0, so: 0, foul: 0, out: 0, single: 0, double: 0, triple: 0, hr: 0 });
const add = (to: StatLine, from: StatLine) => Object.keys(to).forEach(key => to[key as keyof StatLine] += from[key as keyof StatLine]);
const ratio = (top: number, bottom: number) => bottom ? +(top / bottom).toFixed(3) : 0;

/** `readRate` models a correct prediction of the pitcher's chosen 5×5 square. */
function targetFor(pitchCell: number, readRate: number) {
  return Math.random() < readRate ? pitchCell : choose(cells);
}
function adjacentTo(cell: number) {
  const row = Math.floor(cell / 5), column = cell % 5;
  const candidates = [[row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]]
    .filter(([r, c]) => r >= 0 && r < 5 && c >= 0 && c < 5)
    .map(([r, c]) => r * 5 + c);
  return choose(candidates);
}

function plateAppearance(batter: BatterProfile, pitcher: PitcherProfile, readRate: number, selectTarget = (cell: number) => targetFor(cell, readRate), selectPitch = () => choose(cells)): StatLine {
  const stat = empty();
  stat.pa++;
  let balls = 0;
  let strikes = 0;
  while (true) {
    const pitchCell = selectPitch();
    const targetCell = selectTarget(pitchCell);
    const bait = Math.random() < pitcher.baitRate ? choose(directions) : undefined;
    const result = resolvePlateAppearance({
      batter: batter.ratings, pitcher: pitcher.ratings, targetCell, pitchCell, ballDirection: bait,
      swing: batter.swing, pitch: Math.random() < pitcher.breakingRate ? "breaking" : "fast", count: { balls, strikes },
    });
    if (result.outcome === "ball") { if (++balls === 4) { stat.bb++; return stat; } continue; }
    if (result.outcome === "foul") { stat.foul++; strikes = Math.min(2, strikes + 1); continue; }
    if (result.outcome === "swinging_strike" || result.outcome === "strike") {
      if (++strikes === 3) { stat.ab++; stat.so++; stat.out++; return stat; }
      continue;
    }
    stat.ab++;
    if (result.outcome === "groundout" || result.outcome === "flyout") { stat.out++; return stat; }
    stat.h++;
    if (result.outcome === "single") stat.single++;
    if (result.outcome === "double") stat.double++;
    if (result.outcome === "triple") stat.triple++;
    if (result.outcome === "homerun") stat.hr++;
    return stat;
  }
}

function report(scenario: string, stats: StatLine) {
  return { scenario, PA: stats.pa, AVG: ratio(stats.h, stats.ab), OBP: ratio(stats.h + stats.bb, stats.pa), BB: ratio(stats.bb, stats.pa), K: ratio(stats.so, stats.pa), Foul: ratio(stats.foul, stats.pa), H: ratio(stats.h, stats.pa), "2B": ratio(stats.double, stats.pa), "3B": ratio(stats.triple, stats.pa), HR: ratio(stats.hr, stats.pa) };
}
function runScenario(name: string, readRate: number, chooseBatter = () => choose(batters), choosePitcher = () => choose(pitchers), selectTarget?: (cell: number) => number, selectPitch?: () => number) {
  const total = empty();
  for (let plate = 0; plate < PLATE_APPEARANCES; plate++) add(total, plateAppearance(chooseBatter(), choosePitcher(), readRate, selectTarget, selectPitch));
  return report(name, total);
}

const standardBatter: BatterProfile = { name: "기준", ratings: { p: 62, a: 62, e: 62, v: 62 }, swing: "contact" };
const standardPitcher: PitcherProfile = { name: "기준", ratings: { v: 60, c: 60, s: 60, m: 60 }, breakingRate: .35, baitRate: .22 };
const qualityReports = (["contact", "power", "spot"] as SwingType[]).flatMap(swing => {
  const batter = { ...standardBatter, swing };
  return [
    runScenario(`${swing} · 정확 타겟`, 1, () => batter, () => standardPitcher, cell => cell),
    runScenario(`${swing} · 주변 색깔존`, 0, () => batter, () => standardPitcher, adjacentTo),
  ];
});
const locationReports = (["contact", "power", "spot"] as SwingType[]).flatMap(swing => {
  const batter = { ...standardBatter, swing };
  return [
    runScenario(`${swing} · 중앙 투구`, 1, () => batter, () => standardPitcher, cell => cell, () => 12),
    runScenario(`${swing} · 구석 투구`, 1, () => batter, () => standardPitcher, cell => cell, () => 0),
  ];
});
const centerBatters = (["contact", "power", "spot"] as SwingType[]).map(swing => ({ ...standardBatter, name: `가운데 ${swing}`, swing }));
const cornerCells = [0, 4, 20, 24];
const strategyReports = centerBatters.flatMap(batter => [
  runScenario(`${batter.name} vs 중앙 투구`, 0, () => batter, () => standardPitcher, () => 12, () => 12),
  runScenario(`${batter.name} vs 구석 투구`, 0, () => batter, () => standardPitcher, () => 12, () => choose(cornerCells)),
]);

console.table([
  runScenario("무작위 추측 (읽기 0%)", 0),
  runScenario("일반 심리전 (읽기 35%)", .35),
  runScenario("좋은 예측 (읽기 55%)", .55),
  ...batters.map(batter => runScenario(`${batter.name} 타자`, .35, () => batter)),
  ...pitchers.map(pitcher => runScenario(`${pitcher.name} 투수 상대`, .35, undefined, () => pitcher)),
  ...qualityReports,
  ...locationReports,
  ...strategyReports,
]);
