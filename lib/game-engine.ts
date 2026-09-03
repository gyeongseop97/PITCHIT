export type SwingType = "power" | "contact" | "spot";
export type PitchType = "fast" | "breaking";
export type BatterRatings = { p: number; a: number; e: number; v: number };
export type PitcherRatings = { v: number; c: number; s: number; m: number };
export type Count = { balls: number; strikes: number };
export type PlayOutcome = "ball" | "strike" | "foul" | "swinging_strike" | "groundout" | "flyout" | "single" | "double" | "triple" | "homerun";

export type PlateAppearance = {
  outcome: PlayOutcome;
  actualCell: number;
  isBall: boolean;
  pitchName: string;
  speed: number;
  message: string;
};

export const isStrikeCell = (cell: number) => {
  const row = Math.floor(cell / 5);
  const column = cell % 5;
  return row >= 1 && row <= 3 && column >= 1 && column <= 3;
};

const cellDistance = (a: number, b: number) => Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) + Math.abs((a % 5) - (b % 5));
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function nearbyCell(cell: number, random: () => number) {
  const row = Math.floor(cell / 5);
  const column = cell % 5;
  const direction = [[0, -1], [0, 1], [-1, 0], [1, 0]][Math.floor(random() * 4)];
  return Math.max(0, Math.min(4, row + direction[0])) * 5 + Math.max(0, Math.min(4, column + direction[1]));
}

/** Pure plate-appearance resolution. No state, Redis, DOM, or clock access. */
export function resolvePlateAppearance(input: {
  batter: BatterRatings;
  pitcher: PitcherRatings;
  targetCell: number;
  pitchCell: number;
  swing: SwingType;
  pitch: PitchType;
  count: Count;
  random?: () => number;
}): PlateAppearance {
  const random = input.random ?? Math.random;
  const breaking = input.pitch === "breaking";
  const pitchName = breaking ? "변화구" : "패스트볼";
  const speed = Math.round((breaking ? 102 + input.pitcher.m * 0.22 : 127 + input.pitcher.v * 0.25) + random() * 4);
  const edgeAim = !isStrikeCell(input.pitchCell);
  const missChance = clamp(0.36 - input.pitcher.c / 250 + (edgeAim ? 0.16 : 0));
  const actualCell = random() < missChance ? nearbyCell(input.pitchCell, random) : input.pitchCell;
  const isBall = !isStrikeCell(actualCell);

  // Balls are always called balls: there is deliberately no ball-swing branch.
  if (isBall) return { outcome: "ball", actualCell, isBall, pitchName, speed, message: `${pitchName} ${speed}km/h · 볼존으로 벗어났습니다.` };

  const distance = cellDistance(input.targetCell, actualCell);
  const coverage = input.swing === "contact" ? 2 : input.swing === "power" ? 1 : 0;
  const covered = distance <= coverage;
  const eyeTake = !covered && random() < clamp((input.batter.e - 38) / 220 - input.count.strikes * 0.015);
  if (eyeTake) return { outcome: "ball", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 선구안으로 아슬아슬한 공을 골랐습니다.` };

  const pitchDifficulty = input.pitcher.v / 560 + input.pitcher.s / 410 + (breaking ? input.pitcher.m / 330 : 0);
  const swingBonus = input.swing === "contact" ? 0.12 : input.swing === "spot" ? 0.06 : -0.05;
  const contactChance = clamp(0.17 + input.batter.a / 142 + swingBonus - pitchDifficulty - distance * 0.14 + (breaking ? 0.025 : -0.015));
  const contact = covered && random() < contactChance;
  if (!contact) {
    const foulChance = clamp(0.16 + input.batter.a / 520 + (input.swing === "contact" ? 0.09 : 0) - input.pitcher.s / 900);
    if (covered && input.count.strikes < 2 && random() < foulChance) return { outcome: "foul", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 파울, 끈질기게 승부를 이어갑니다.` };
    return { outcome: "swinging_strike", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 헛스윙 스트라이크.` };
  }

  const power = input.batter.p / 100 + (input.swing === "power" ? 0.24 : input.swing === "spot" ? 0.05 : -0.04) - input.pitcher.s / 260;
  const extraChance = clamp(0.035 + power * 0.17 + (breaking ? 0.025 : -0.015));
  const hitChance = clamp(0.28 + input.batter.a / 255 + (input.swing === "contact" ? 0.08 : 0) - input.pitcher.s / 480 - input.pitcher.v / 800);
  const roll = random();
  if (roll < extraChance * 0.18) return { outcome: "homerun", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 완벽한 타이밍, 홈런!` };
  if (roll < extraChance * 0.56) return { outcome: "double", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 외야를 가르는 2루타!` };
  if (roll < extraChance * 0.72 && input.batter.v >= 68) return { outcome: "triple", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 빠른 발로 3루타!` };
  if (roll < hitChance) return { outcome: "single", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 노린 코스를 공략한 안타!` };
  const grounder = random() < 0.58;
  if (grounder && input.batter.v >= 72 && random() < (input.batter.v - 60) / 120) return { outcome: "single", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 빠른 발로 내야안타!` };
  return { outcome: grounder ? "groundout" : "flyout", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · ${grounder ? "땅볼 아웃." : "뜬공 아웃."}` };
}
