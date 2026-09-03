import { resolvePlateAppearance, type BatterRatings, type PitcherRatings } from "../lib/game-engine";

const batters: BatterRatings[] = [
  { p: 45, a: 85, e: 55, v: 45 }, { p: 85, a: 48, e: 52, v: 45 },
  { p: 45, a: 57, e: 48, v: 80 }, { p: 48, a: 58, e: 82, v: 42 },
];
const pitchers: PitcherRatings[] = [
  { v: 86, c: 52, s: 50, m: 42 }, { v: 48, c: 88, s: 48, m: 46 },
  { v: 53, c: 50, s: 87, m: 40 }, { v: 50, c: 54, s: 45, m: 86 },
];
const stats: Record<string, number> = Object.fromEntries(["ab", "h", "bb", "so", "double", "triple", "hr", "out"].map(key => [key, 0]));
const choose = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const strikeCells = Array.from({ length: 25 }, (_, cell) => cell);
const centralTargets = [6, 7, 8, 11, 12, 13, 16, 17, 18];
const outerTargets = Array.from({ length: 25 }, (_, cell) => cell).filter(cell => !centralTargets.includes(cell));

for (let plate = 0; plate < 100_000; plate++) {
  const batter = choose(batters), pitcher = choose(pitchers), target = Math.random() < .72 ? choose(centralTargets) : choose(outerTargets);
  const swing = choose(["contact", "contact", "power", "spot"] as const);
  let balls = 0, strikes = 0;
  while (true) {
    const bait = Math.random() < 0.26 ? choose(["high", "low", "in", "out"] as const) : undefined;
    const result = resolvePlateAppearance({ batter, pitcher, targetCell: target, pitchCell: choose(strikeCells), ballDirection: bait, swing, pitch: Math.random() < .58 ? "fast" : "breaking", count: { balls, strikes } });
    if (result.outcome === "ball") { if (++balls >= 4) { stats.bb++; break; } continue; }
    if (result.outcome === "foul") { strikes = Math.min(2, strikes + 1); continue; }
    if (result.outcome === "swinging_strike") { if (++strikes >= 3) { stats.so++; stats.out++; stats.ab++; break; } continue; }
    stats.ab++;
    if (result.outcome === "groundout" || result.outcome === "flyout") stats.out++;
    else { stats.h++; if (result.outcome === "double") stats.double++; if (result.outcome === "triple") stats.triple++; if (result.outcome === "homerun") stats.hr++; }
    break;
  }
}
console.log(JSON.stringify({
  plateAppearances: 100000,
  battingAverage: +(stats.h / stats.ab).toFixed(3),
  onBase: +((stats.h + stats.bb) / 100000).toFixed(3),
  walkRate: +(stats.bb / 100000).toFixed(3),
  strikeoutRate: +(stats.so / 100000).toFixed(3),
  extraBaseRate: +((stats.double + stats.triple + stats.hr) / 100000).toFixed(3),
  ...stats,
}, null, 2));
