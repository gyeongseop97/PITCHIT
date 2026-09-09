import assert from "node:assert/strict";
import { batterArchetypes, individualizeBatter, individualizePitcher, pitcherArchetypes } from "../lib/roster";

let checks = 0, changed = 0;
for (const base of batterArchetypes) for (let trial = 0; trial < 10_000; trial++) {
  const player = individualizeBatter(base);
  const fields = ["p", "a", "e", "v"] as const;
  assert.equal(fields.reduce((sum, field) => sum + player[field], 0), fields.reduce((sum, field) => sum + base[field], 0));
  assert.ok(fields.every(field => Math.abs(player[field] - base[field]) <= 5));
  if (fields.some(field => player[field] !== base[field])) changed++;
  checks++;
}
for (const base of pitcherArchetypes) for (let trial = 0; trial < 10_000; trial++) {
  const player = individualizePitcher(base);
  const fields = ["v", "c", "s", "m"] as const;
  assert.equal(fields.reduce((sum, field) => sum + player[field], 0), fields.reduce((sum, field) => sum + base[field], 0));
  assert.ok(fields.every(field => Math.abs(player[field] - base[field]) <= 5));
  if (fields.some(field => player[field] !== base[field])) changed++;
  checks++;
}
assert.ok(changed > checks * .9, "variation should affect almost every generated player");
console.log(`PASS: ${checks.toLocaleString()} roster generations preserved their archetype budget; ${(changed / checks * 100).toFixed(1)}% received unique stat variation.`);
