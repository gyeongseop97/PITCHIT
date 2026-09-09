import type { BatterRatings, PitcherRatings } from "./game-engine";

export type BatterArchetype = { t: string } & BatterRatings;
export type PitcherArchetype = { t: string } & PitcherRatings;

// Every archetype has the same 230-point budget. Individual players keep that
// budget, but redistribute up to five points per ability so no two lineups are
// a set of identical copies.
export const batterArchetypes: BatterArchetype[] = [
  { t: "컨택형", p: 45, a: 85, e: 55, v: 45 }, { t: "파워형", p: 85, a: 48, e: 52, v: 45 },
  { t: "주루형", p: 45, a: 57, e: 48, v: 80 }, { t: "선구안형", p: 48, a: 58, e: 82, v: 42 },
];
export const pitcherArchetypes: PitcherArchetype[] = [
  { t: "구속형", v: 86, c: 52, s: 50, m: 42 }, { t: "제구형", v: 48, c: 88, s: 48, m: 46 },
  { t: "구위형", v: 53, c: 50, s: 87, m: 40 }, { t: "변화형", v: 50, c: 54, s: 45, m: 86 },
];

function spread(values: number[], random: () => number) {
  // The final adjustment restores the exact archetype total. Re-roll if it
  // would push any individual stat outside the small ±5 variation window.
  for (let attempt = 0; attempt < 64; attempt++) {
    const offsets = values.slice(0, -1).map(() => Math.floor(random() * 11) - 5);
    const last = -offsets.reduce((sum, offset) => sum + offset, 0);
    if (Math.abs(last) <= 5) return [...offsets, last].map((offset, index) => values[index] + offset);
  }
  return [...values];
}

export function individualizeBatter(base: BatterArchetype, random = Math.random): BatterArchetype {
  const [p, a, e, v] = spread([base.p, base.a, base.e, base.v], random);
  return { ...base, p, a, e, v };
}

export function individualizePitcher(base: PitcherArchetype, random = Math.random): PitcherArchetype {
  const [v, c, s, m] = spread([base.v, base.c, base.s, base.m], random);
  return { ...base, v, c, s, m };
}
