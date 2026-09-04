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
  /** Swing/looking wording is cosmetic; the shared count outcome remains a strike. */
  strikeStyle?: "swinging" | "looking";
  execution?: "command" | "mistake" | "wild";
};

export const isStrikeCell = (cell: number) => cell >= 0 && cell < 25;

const cellDistance = (a: number, b: number) => Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) + Math.abs((a % 5) - (b % 5));
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * Contact swing covers the whole 5×5 board, but not evenly. A center target
 * gives broad (and increasingly faint) protection toward the edge; an edge
 * target keeps its strongest area nearby while retaining a light lane back
 * toward the easier center of the zone.
 */
function contactReachWeight(targetCell: number, actualCell: number) {
  const targetRow = Math.floor(targetCell / 5), targetColumn = targetCell % 5;
  const actualRow = Math.floor(actualCell / 5), actualColumn = actualCell % 5;
  const squareDistance = Math.max(Math.abs(targetRow - actualRow), Math.abs(targetColumn - actualColumn));
  const targetCenterDistance = Math.abs(targetRow - 2) + Math.abs(targetColumn - 2);
  const actualCenterDistance = Math.abs(actualRow - 2) + Math.abs(actualColumn - 2);
  const localReach = Math.max(0, 1 - squareDistance / 4);
  const centralTarget = (4 - targetCenterDistance) / 4;
  const centralPitch = (4 - actualCenterDistance) / 4;
  const towardCenter = targetCenterDistance >= 2 && actualCenterDistance < targetCenterDistance
    ? 0.11 * (targetCenterDistance - actualCenterDistance) / targetCenterDistance
    : 0;
  return clamp(0.20 + localReach * 0.42 + centralTarget * centralPitch * 0.25 + towardCenter * 1.25 + (targetCell === actualCell ? 0.13 : 0));
}

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
  swing: SwingType;
  pitch: PitchType;
  count: Count;
  random?: () => number;
}): PlateAppearance {
  const random = input.random ?? Math.random;
  const breaking = input.pitch === "breaking";
  const pitchName = breaking ? "변화구" : "패스트볼";
  const speed = Math.round((breaking ? 102 + input.pitcher.m * 0.22 : 127 + input.pitcher.v * 0.25) + random() * 4);
  const targetRow = Math.floor(input.targetCell / 5), targetColumn = input.targetCell % 5;
  const selectedRow = Math.floor(input.pitchCell / 5), selectedColumn = input.pitchCell % 5;
  const selectedCenterDistance = Math.abs(selectedRow - 2) + Math.abs(selectedColumn - 2);
  // Corners are a high-risk choice: harder to square up, but more likely to leak.
  const breakingCommand = breaking ? (70 - input.pitcher.m) / 1400 : 0;
  const missChance = clamp(0.10 - input.pitcher.c / 520 + selectedCenterDistance * 0.011 + breakingCommand, 0.005, 0.35);
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
  const contactReach = input.swing === "contact" ? contactReachWeight(input.targetCell, actualCell) : 0;
  const covered = input.swing === "contact"
    ? true
    : input.swing === "power"
      ? Math.abs(Math.floor(input.targetCell / 5) - Math.floor(actualCell / 5)) <= 1 && Math.abs((input.targetCell % 5) - (actualCell % 5)) <= 1
      : distance === 0;
  const perfectTarget = distance === 0;
  const nearTarget = !perfectTarget && Math.abs(targetRow - actualRow) <= 1 && Math.abs(targetColumn - actualColumn) <= 1;
  // The coloured range is intentionally not a flat hit zone. Exact reads are
  // rewarded most; neighbouring contact squares merely keep the at-bat alive.
  const contactQuality = input.swing === "contact"
    ? (perfectTarget ? 0.03 : -0.04)
    : input.swing === "power" ? (perfectTarget ? 0.12 : 0.025) : 0.18;
  const hitQuality = input.swing === "contact"
    ? (perfectTarget ? 0.015 : -0.06)
    : input.swing === "power" ? (perfectTarget ? 0.085 : 0.03) : 0.14;
  const barrelQuality = input.swing === "contact"
    ? (perfectTarget ? -0.01 : -0.04)
    : input.swing === "power" ? (perfectTarget ? 0.09 : 0.035) : 0.15;
  const eyeTake = !covered && random() < clamp((input.batter.e - 38) / 220 - input.count.strikes * 0.015);
  if (eyeTake) return { outcome: "ball", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 선구안으로 아슬아슬한 공을 골랐습니다.` };

  const pitchDifficulty = input.pitcher.v / 560 + input.pitcher.c / 180 + input.pitcher.s / 410 + (breaking ? input.pitcher.m / 330 : 0);
  const swingBonus = input.swing === "contact" ? 0.03 : input.swing === "spot" ? 0.04 : 0.06;
  const contactChance = clamp(0.65 + input.batter.a / 135 + swingBonus + contactQuality - pitchDifficulty * 0.32 - distance * 0.16 + (breaking ? 0.03 : -0.01) + (mistake ? 0.06 : 0) + (nearTarget ? 0.04 : 0) + (input.count.strikes >= 2 ? 0.018 : 0));
  const reachFactor = input.swing === "contact" ? 0.62 + contactReach * 0.38 : 1;
  const contact = covered && random() < contactChance * reachFactor;
  if (!contact) {
    const reachFoulFactor = input.swing === "contact" ? 0.60 + contactReach * 0.40 : 1;
    const nearFoulChance = clamp((0.48 + input.batter.a / 430 + (input.swing === "contact" ? 0.10 : input.swing === "power" ? 0.065 : 0.04) - input.pitcher.s / 1050 + (input.count.strikes >= 2 ? 0.10 : 0)) * reachFoulFactor);
    if (nearTarget && random() < nearFoulChance) return { outcome: "foul", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 타겟 바로 옆 공을 파울로 걷어냈습니다.` };
    const foulChance = clamp((0.16 + input.batter.a / 520 + (input.swing === "contact" ? 0.09 : 0) - input.pitcher.s / 900 + (input.count.strikes >= 2 ? 0.065 : 0)) * reachFoulFactor);
    if (covered && random() < foulChance) return { outcome: "foul", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 파울, 끈질기게 승부를 이어갑니다.` };
    // A missed ball inside the coloured hitting range is always a swing and
    // miss. When the hitter read a different square, keep the same strike
    // ruling but vary the broadcast between a chase and a called strike.
    const strikeStyle = covered || random() < 0.5 ? "swinging" : "looking";
    return { outcome: "swinging_strike", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", strikeStyle, message: `${pitchName} ${speed}km/h · ${strikeStyle === "looking" ? "루킹 스트라이크." : "헛스윙 스트라이크."}` };
  }

  const power = input.batter.p / 100 + (input.swing === "power" ? 0.24 : input.swing === "spot" ? 0.05 : -0.04) - input.pitcher.s / 260;
  // Short 3-inning games need a little more payoff when a hitter barrels the
  // ball.  This changes hit quality (not the chance to put the ball in play).
  const extraChance = clamp(0.075 + power * 0.50 + barrelQuality * 1.25 + (breaking ? 0.035 : -0.01));
  const locationHitBonus = 0.05 - actualCenterDistance * 0.022;
  // Reading the exact square should feel rewarding in every swing type.
  // Neighbouring coloured squares still earn a smaller boost: they are
  // forgiving contact, not the same thing as a perfect barrel.
  const readHitBonus = perfectTarget
    ? (input.swing === "contact" ? 0.045 : input.swing === "power" ? 0.040 : 0.035)
    : nearTarget && covered
      ? (input.swing === "contact" ? 0.030 : input.swing === "power" ? 0.028 : 0)
      : 0;
  const reachHitBonus = input.swing === "contact" ? contactReach * 0.13 - 0.035 : 0;
  const hitChance = clamp(0.365 + input.batter.a / 350 + (input.swing === "contact" ? 0.02 : 0) + hitQuality + locationHitBonus + readHitBonus + reachHitBonus - input.pitcher.s / 650 - input.pitcher.v / 1280 + (mistake ? 0.05 : 0));
  const roll = random();
  if (roll < extraChance * 0.18) return { outcome: "homerun", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 완벽한 타이밍, 홈런!` };
  if (roll < extraChance * 0.56) return { outcome: "double", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 외야를 가르는 2루타!` };
  if (roll < extraChance * 0.72 && input.batter.v >= 68) return { outcome: "triple", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 빠른 발로 3루타!` };
  if (roll < hitChance) return { outcome: "single", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 노린 코스를 공략한 안타!` };
  const grounder = random() < 0.58;
  if (grounder && input.batter.v >= 72 && random() < (input.batter.v - 60) / 120) return { outcome: "single", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · 빠른 발로 내야안타!` };
  return { outcome: grounder ? "groundout" : "flyout", actualCell, isBall: false, pitchName, speed, execution: mistake ? "mistake" : "command", message: `${pitchName} ${speed}km/h · ${grounder ? "땅볼 아웃." : "뜬공 아웃."}` };
}
