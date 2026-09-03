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
  execution?: "command" | "bait" | "mistake" | "wild";
};

export const isStrikeCell = (cell: number) => cell >= 0 && cell < 25;

const cellDistance = (a: number, b: number) => Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) + Math.abs((a % 5) - (b % 5));
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function mistakeIntoTarget(targetCell: number, swing: SwingType, random: () => number) {
  const row = Math.floor(targetCell / 5), column = targetCell % 5;
  const colouredRange = swing === "contact"
    ? [-1, 0, 1].flatMap(rowOffset => [-1, 0, 1].map(columnOffset => [row + rowOffset, column + columnOffset]))
    : swing === "power"
      ? [[row, column], [row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]]
      : [[row, column]];
  const candidates = colouredRange
    .filter(([nextRow, nextColumn]) => nextRow >= 0 && nextRow < 5 && nextColumn >= 0 && nextColumn < 5)
    .map(([nextRow, nextColumn]) => nextRow * 5 + nextColumn);
  // A true hanger most often lands on the hitter's exact read; the remaining
  // mistakes fall into the coloured coverage range for that swing.
  return random() < 0.42 ? targetCell : candidates[Math.floor(random() * candidates.length)];
}

function ballDirectionCell(direction: BallDirection, intendedCell: number) {
  const row = Math.floor(intendedCell / 5), column = intendedCell % 5;
  if (direction === "high") return column;
  if (direction === "low") return 20 + column;
  if (direction === "in") return row * 5;
  return row * 5 + 4;
}

function controlMissCell(intendedCell: number, random: () => number) {
  const row = Math.floor(intendedCell / 5), column = intendedCell % 5;
  const nearby = [[row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]]
    .filter(([nextRow, nextColumn]) => nextRow >= 0 && nextRow < 5 && nextColumn >= 0 && nextColumn < 5)
    .map(([nextRow, nextColumn]) => nextRow * 5 + nextColumn);
  return nearby[Math.floor(random() * nearby.length)] ?? intendedCell;
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
    // With two strikes, an outside pitch becomes a little more effective; the
    // bonus is deliberately modest so BALL is never the dominant choice.
    const baitExecution = clamp(0.48 + input.pitcher.c / 150 + (breaking ? input.pitcher.m / 320 : 0) + (input.count.strikes >= 2 ? 0.035 : 0));
    const chaseChance = clamp((predictedDirection ? 0.64 : 0.13) + (64 - input.batter.e) / 260 + (breaking ? 0.07 : -0.03) + (input.count.strikes >= 2 ? 0.035 : 0));
    const actualBallCell = ballDirectionCell(direction, input.pitchCell);
    if (random() < baitExecution) {
      if (random() < chaseChance) return { outcome: "swinging_strike", actualCell: actualBallCell, isBall: false, pitchName, speed, execution: "bait", message: `${pitchName} ${speed}km/h · ${direction === "high" ? "높은" : direction === "low" ? "낮은" : direction === "in" ? "몸쪽" : "바깥쪽"} 유인구에 타자가 속았습니다.` };
      return { outcome: "ball", actualCell: actualBallCell, isBall: true, pitchName, speed, execution: "bait", message: `${pitchName} ${speed}km/h · 유인구를 잘 골라냈습니다.` };
    }
  }
  const selectedRow = Math.floor(input.pitchCell / 5), selectedColumn = input.pitchCell % 5;
  const selectedCenterDistance = Math.abs(selectedRow - 2) + Math.abs(selectedColumn - 2);
  // Corners are a high-risk choice: harder to square up, but more likely to leak.
  const breakingCommand = breaking ? (70 - input.pitcher.m) / 1400 : 0;
  const missChance = clamp(0.10 - input.pitcher.c / 520 + selectedCenterDistance * 0.011 + breakingCommand + (direction ? 0.05 : 0), 0.005, 0.35);
  const mistake = random() < missChance;
  const actualCell = mistake ? mistakeIntoTarget(input.targetCell, input.swing, random) : input.pitchCell;
  const actualRow = Math.floor(actualCell / 5), actualColumn = actualCell % 5;
  const actualCenterDistance = Math.abs(actualRow - 2) + Math.abs(actualColumn - 2);
  // A hitter's count forces the pitcher to come closer to the zone. Corners
  // remain useful, but are a touch more likely to miss when behind in count.
  const hittersCountRisk = input.count.balls >= 3 && selectedCenterDistance >= 2 ? 0.024 : 0;
  const accidentalBallRisk = clamp(Math.max(0, selectedCenterDistance - 1) * 0.02 + 0.003 - input.pitcher.c / 2000 + hittersCountRisk);
  if (random() < accidentalBallRisk) {
    return { outcome: "ball", actualCell: controlMissCell(actualCell, random), isBall: true, pitchName, speed, execution: "wild", message: `${pitchName} ${speed}km/h · 제구가 빠져 볼이 됐습니다.` };
  }

  const distance = cellDistance(input.targetCell, actualCell);
  const covered = input.swing === "contact"
    ? Math.abs(Math.floor(input.targetCell / 5) - Math.floor(actualCell / 5)) <= 1 && Math.abs((input.targetCell % 5) - (actualCell % 5)) <= 1
    : input.swing === "power" ? distance <= 1 : distance === 0;
  const perfectTarget = distance === 0;
  const nearTarget = !perfectTarget && Math.abs(targetRow - actualRow) <= 1 && Math.abs(targetColumn - actualColumn) <= 1;
  // The coloured range is intentionally not a flat hit zone. Exact reads are
  // rewarded most; neighbouring contact squares merely keep the at-bat alive.
  const contactQuality = input.swing === "contact"
    ? (perfectTarget ? 0.03 : -0.10)
    : input.swing === "power" ? (perfectTarget ? 0.12 : 0.025) : 0.18;
  const hitQuality = input.swing === "contact"
    ? (perfectTarget ? 0.015 : -0.09)
    : input.swing === "power" ? (perfectTarget ? 0.085 : 0.03) : 0.14;
  const barrelQuality = input.swing === "contact"
    ? (perfectTarget ? -0.01 : -0.06)
    : input.swing === "power" ? (perfectTarget ? 0.09 : 0.035) : 0.15;
  const eyeTake = !covered && random() < clamp((input.batter.e - 38) / 220 - input.count.strikes * 0.015);
  if (eyeTake) return { outcome: "ball", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 선구안으로 아슬아슬한 공을 골랐습니다.` };

  const pitchDifficulty = input.pitcher.v / 560 + input.pitcher.c / 180 + input.pitcher.s / 410 + (breaking ? input.pitcher.m / 330 : 0);
  const swingBonus = input.swing === "contact" ? 0.03 : input.swing === "spot" ? 0.04 : 0.06;
  const contactChance = clamp(0.65 + input.batter.a / 135 + swingBonus + contactQuality - pitchDifficulty * 0.32 - distance * 0.16 + (breaking ? 0.03 : -0.01) + (mistake ? 0.06 : 0) + (nearTarget ? 0.04 : 0) + (input.count.strikes >= 2 ? 0.018 : 0));
  const contact = covered && random() < contactChance;
  if (!contact) {
    const nearFoulChance = clamp(0.48 + input.batter.a / 430 + (input.swing === "contact" ? 0.10 : input.swing === "power" ? 0.065 : 0.04) - input.pitcher.s / 1050 + (input.count.strikes >= 2 ? 0.10 : 0));
    if (nearTarget && random() < nearFoulChance) return { outcome: "foul", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 타겟 바로 옆 공을 파울로 걷어냈습니다.` };
    const foulChance = clamp(0.16 + input.batter.a / 520 + (input.swing === "contact" ? 0.09 : 0) - input.pitcher.s / 900 + (input.count.strikes >= 2 ? 0.065 : 0));
    if (covered && random() < foulChance) return { outcome: "foul", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 파울, 끈질기게 승부를 이어갑니다.` };
    return { outcome: "swinging_strike", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 헛스윙 스트라이크.` };
  }

  const power = input.batter.p / 100 + (input.swing === "power" ? 0.24 : input.swing === "spot" ? 0.05 : -0.04) - input.pitcher.s / 260;
  const extraChance = clamp(0.04 + power * 0.20 + barrelQuality + (breaking ? 0.025 : -0.015));
  const locationHitBonus = 0.05 - actualCenterDistance * 0.022;
  const hitChance = clamp(0.245 + input.batter.a / 350 + (input.swing === "contact" ? 0.02 : 0) + hitQuality + locationHitBonus - input.pitcher.s / 650 - input.pitcher.v / 1280 + (mistake ? 0.05 : 0));
  const roll = random();
  if (roll < extraChance * 0.18) return { outcome: "homerun", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 완벽한 타이밍, 홈런!` };
  if (roll < extraChance * 0.56) return { outcome: "double", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 외야를 가르는 2루타!` };
  if (roll < extraChance * 0.72 && input.batter.v >= 68) return { outcome: "triple", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 빠른 발로 3루타!` };
  if (roll < hitChance) return { outcome: "single", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 노린 코스를 공략한 안타!` };
  const grounder = random() < 0.58;
  if (grounder && input.batter.v >= 72 && random() < (input.batter.v - 60) / 120) return { outcome: "single", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 빠른 발로 내야안타!` };
  return { outcome: grounder ? "groundout" : "flyout", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · ${grounder ? "땅볼 아웃." : "뜬공 아웃."}` };
}
