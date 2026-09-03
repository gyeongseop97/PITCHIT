export type SwingType = "power" | "contact" | "spot";
export type PitchType = "fast" | "breaking";
export type BallDirection = "high" | "low" | "in" | "out";
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

export const isStrikeCell = (cell: number) => cell >= 0 && cell < 25;

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
  ballDirection?: BallDirection;
  swing: SwingType;
  pitch: PitchType;
  count: Count;
  random?: () => number;
}): PlateAppearance {
  const random = input.random ?? Math.random;
  const breaking = input.pitch === "breaking";
  const pitchName = breaking ? "변화구" : "패스트볼";
  const speed = Math.round((breaking ? 102 + input.pitcher.m * 0.22 : 127 + input.pitcher.v * 0.25) + random() * 4);
  const direction = input.ballDirection;
  const targetRow = Math.floor(input.targetCell / 5), targetColumn = input.targetCell % 5;
  const predictedDirection = direction === "high" ? targetRow <= 1 : direction === "low" ? targetRow >= 3 : direction === "in" ? targetColumn <= 1 : targetColumn >= 3;
  if (direction) {
    const baitExecution = clamp(0.48 + input.pitcher.c / 150 + (breaking ? input.pitcher.m / 320 : 0));
    const chaseChance = clamp((predictedDirection ? 0.64 : 0.13) + (64 - input.batter.e) / 260 + (breaking ? 0.07 : -0.03));
    if (random() < baitExecution) {
      if (random() < chaseChance) return { outcome: "swinging_strike", actualCell: input.pitchCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · ${direction === "high" ? "높은" : direction === "low" ? "낮은" : direction === "in" ? "몸쪽" : "바깥쪽"} 유인구에 타자가 속았습니다.` };
      return { outcome: "ball", actualCell: input.pitchCell, isBall: true, pitchName, speed, message: `${pitchName} ${speed}km/h · 유인구를 잘 골라냈습니다.` };
    }
  }
  const missChance = clamp(0.28 - input.pitcher.c / 280 + (direction ? 0.11 : 0));
  const actualCell = random() < missChance ? nearbyCell(input.pitchCell, random) : input.pitchCell;
  const mistake = actualCell !== input.pitchCell;

  const distance = cellDistance(input.targetCell, actualCell);
  const covered = input.swing === "contact"
    ? Math.abs(Math.floor(input.targetCell / 5) - Math.floor(actualCell / 5)) <= 1 && Math.abs((input.targetCell % 5) - (actualCell % 5)) <= 1
    : input.swing === "power" ? distance <= 1 : distance === 0;
  const eyeTake = !covered && random() < clamp((input.batter.e - 38) / 220 - input.count.strikes * 0.015);
  if (eyeTake) return { outcome: "ball", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 선구안으로 아슬아슬한 공을 골랐습니다.` };

  const pitchDifficulty = input.pitcher.v / 560 + input.pitcher.c / 180 + input.pitcher.s / 410 + (breaking ? input.pitcher.m / 330 : 0);
  const swingBonus = input.swing === "contact" ? 0.03 : input.swing === "spot" ? 0.04 : 0.06;
  const contactChance = clamp(0.63 + input.batter.a / 135 + swingBonus - pitchDifficulty * 0.32 - distance * 0.16 + (breaking ? 0.03 : -0.01) + (mistake ? 0.12 : 0));
  const contact = covered && random() < contactChance;
  if (!contact) {
    const foulChance = clamp(0.16 + input.batter.a / 520 + (input.swing === "contact" ? 0.09 : 0) - input.pitcher.s / 900);
    if (covered && input.count.strikes < 2 && random() < foulChance) return { outcome: "foul", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 파울, 끈질기게 승부를 이어갑니다.` };
    return { outcome: "swinging_strike", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 헛스윙 스트라이크.` };
  }

  const power = input.batter.p / 100 + (input.swing === "power" ? 0.24 : input.swing === "spot" ? 0.05 : -0.04) - input.pitcher.s / 260;
  const extraChance = clamp(0.04 + power * 0.20 + (breaking ? 0.025 : -0.015));
  const hitChance = clamp(0.245 + input.batter.a / 350 + (input.swing === "contact" ? 0.02 : 0) - input.pitcher.s / 650 - input.pitcher.v / 1280 + (mistake ? 0.10 : 0));
  const roll = random();
  if (roll < extraChance * 0.18) return { outcome: "homerun", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 완벽한 타이밍, 홈런!` };
  if (roll < extraChance * 0.56) return { outcome: "double", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 외야를 가르는 2루타!` };
  if (roll < extraChance * 0.72 && input.batter.v >= 68) return { outcome: "triple", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 빠른 발로 3루타!` };
  if (roll < hitChance) return { outcome: "single", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 노린 코스를 공략한 안타!` };
  const grounder = random() < 0.58;
  if (grounder && input.batter.v >= 72 && random() < (input.batter.v - 60) / 120) return { outcome: "single", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · 빠른 발로 내야안타!` };
  return { outcome: grounder ? "groundout" : "flyout", actualCell, isBall: false, pitchName, speed, message: `${pitchName} ${speed}km/h · ${grounder ? "땅볼 아웃." : "뜬공 아웃."}` };
}
