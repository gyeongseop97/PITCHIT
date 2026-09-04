/** Exhaustively sanity-check the 5x5 plate engine across legal inputs. */
import assert from "node:assert/strict";
import { resolvePlateAppearance, type PitchType, type SwingType } from "../lib/game-engine";

const swings: SwingType[] = ["contact", "power", "spot"];
const pitches: PitchType[] = ["fast", "breaking"];
const outcomes = new Set(["ball", "foul", "swinging_strike", "groundout", "flyout", "single", "double", "triple", "homerun"]);
const batters = [
  { p: 45, a: 85, e: 55, v: 45 }, { p: 85, a: 48, e: 52, v: 45 },
  { p: 45, a: 57, e: 48, v: 80 }, { p: 48, a: 58, e: 82, v: 42 },
];
const pitchers = [
  { v: 86, c: 52, s: 50, m: 42 }, { v: 48, c: 88, s: 48, m: 46 },
  { v: 53, c: 50, s: 87, m: 40 }, { v: 50, c: 54, s: 45, m: 86 },
];

let checks = 0;
for (const batter of batters) for (const pitcher of pitchers) for (const swing of swings) for (const pitch of pitches)
  for (const targetCell of Array.from({ length: 25 }, (_, cell) => cell)) for (const pitchCell of Array.from({ length: 25 }, (_, cell) => cell))
    for (const count of [{ balls: 0, strikes: 0 }, { balls: 3, strikes: 2 }]) {
      const result = resolvePlateAppearance({ batter, pitcher, swing, pitch, targetCell, pitchCell, count });
      assert.ok(outcomes.has(result.outcome), `unknown outcome: ${result.outcome}`);
      assert.ok(Number.isInteger(result.actualCell) && result.actualCell >= 0 && result.actualCell < 25, `invalid actual cell: ${result.actualCell}`);
      assert.ok(Number.isFinite(result.speed) && result.speed >= 90 && result.speed <= 160, `invalid speed: ${result.speed}`);
      assert.equal(typeof result.isBall, "boolean", "ball flag must be boolean");
      checks++;
    }

console.log(`PASS: ${checks.toLocaleString()} legal plate appearances produced valid cells, outcomes, and speeds.`);
