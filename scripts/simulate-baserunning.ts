/**
 * Isolated 100k-trial checks for the live baserunning rules.  Every scenario
 * uses a standard runner (speed 55) and hitter (power 55), unless a scenario
 * itself specifies another input.  These are deliberately artificial base
 * states so each reported rate is easy to audit.
 */
const TRIALS = Number(process.env.TRIALS ?? 100_000);
const runnerSpeed = 55;
const batterPower = 55;
const clamp = (value: number, floor: number, ceiling: number) => Math.min(ceiling, Math.max(floor, value));

type Scenario = { situation: string; chance: number; detail: string };
const tagBases = [.14, .54, .76];
const tagScenarios: Scenario[] = [
  { situation: "외야 뜬공 · 1루→2루", chance: clamp(tagBases[0] + (runnerSpeed - 50) / 145 + (batterPower - 50) / 260, .06, .54), detail: "주자 주력 55 · 타자 파워 55" },
  { situation: "외야 뜬공 · 2루→3루", chance: clamp(tagBases[1] + (runnerSpeed - 50) / 145 + (batterPower - 50) / 260, .38, .88), detail: "주자 주력 55 · 타자 파워 55" },
  { situation: "외야 뜬공 · 3루→홈", chance: clamp(tagBases[2] + (runnerSpeed - 50) / 145 + (batterPower - 50) / 260, .68, .98), detail: "주자 주력 55 · 타자 파워 55" },
];
const groundScenarios: Scenario[] = [
  { situation: "내야 땅볼 · 2루→3루", chance: clamp(.18 + (runnerSpeed - 50) / 135, .10, .42), detail: "주자 주력 55 · 2아웃 전" },
  { situation: "내야 땅볼 · 3루→홈", chance: clamp(.22 + (runnerSpeed - 50) / 115, .12, .48), detail: "주자 주력 55 · 2아웃 전" },
];
const doublePlayScenarios: Scenario[] = [
  { situation: "땅볼 · 1루 주자 병살", chance: clamp(.20 + 0 + (55 - 50) / 260 + (50 - runnerSpeed) / 150, .08, .38), detail: "무사/1사 · 중단 코스 · 패스트볼 · 투수 구위 55 · 타자 주력 55" },
  { situation: "땅볼 · 1루 주자 병살", chance: clamp(.20 + .08 + (87 - 50) / 260 + (50 - 45) / 150 + .02, .08, .38), detail: "무사/1사 · 낮은 코스 · 변화구 · 구위형 투수 87 · 느린 타자 주력 45" },
  { situation: "땅볼 · 1루 주자 병살", chance: clamp(.20 + 0 + (45 - 50) / 260 + (50 - 80) / 150, .08, .38), detail: "무사/1사 · 중단 코스 · 패스트볼 · 낮은 구위 45 · 주루형 타자 주력 80" },
];

function simulate(group: string, scenarios: Scenario[]) {
  return scenarios.map(scenario => {
    let successes = 0;
    for (let trial = 0; trial < TRIALS; trial++) if (Math.random() < scenario.chance) successes++;
    return {
      구분: group,
      상황: scenario.situation,
      조건: scenario.detail,
      이론확률: `${(scenario.chance * 100).toFixed(2)}%`,
      성공횟수: successes.toLocaleString(),
      시뮬레이션성공률: `${(successes / TRIALS * 100).toFixed(2)}%`,
    };
  });
}

console.log(`주루 단독 시뮬레이션 · 각 상황 ${TRIALS.toLocaleString()}회`);
console.table([
  ...simulate("외야 뜬공 태그업", tagScenarios),
  ...simulate("내야 땅볼 추가 진루", groundScenarios),
  ...simulate("병살 가능 상황", doublePlayScenarios),
]);
