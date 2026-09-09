export type ShopTheme = "classic" | "night" | "retro" | "neon";
export type BallSkin = "classic" | "crimson" | "neon";
export type ShopState = { coins: number; owned: string[]; equippedTheme: ShopTheme; equippedBall: BallSkin; rewardedGames: string[]; operatorGrantApplied: boolean };
export const SHOP_ITEMS = [
  { id: "theme-classic", type: "theme", theme: "classic", name: "클래식 구장", description: "PITCHIT 기본 전광판 테마", cost: 0 },
  { id: "theme-night", type: "theme", theme: "night", name: "나이트 게임", description: "깊은 남색의 야간 구장 전광판", cost: 90 },
  { id: "theme-retro", type: "theme", theme: "retro", name: "레트로 볼파크", description: "빈티지 크림·브라운 경기장", cost: 140 },
  { id: "theme-neon", type: "theme", theme: "neon", name: "네온 클래식", description: "보랏빛 네온 야구장", cost: 210 },
  { id: "ball-crimson", type: "ball", ball: "crimson", name: "크림슨 하드볼", description: "붉은 가죽과 선명한 흰 실밥의 시그니처 볼", cost: 120 },
  { id: "ball-neon", type: "ball", ball: "neon", name: "사이버 블루볼", description: "푸른 빛이 감도는 미래형 야구공", cost: 180 },
  { id: "ball-classic", type: "ball", ball: "classic", name: "클래식 야구공", description: "PITCHIT 기본 야구공", cost: 0 },
] as const;
export const defaultShop = (): ShopState => ({ coins: 0, owned: ["theme-classic", "ball-classic"], equippedTheme: "classic", equippedBall: "classic", rewardedGames: [], operatorGrantApplied: false });
export const readShop = (value: unknown): ShopState => {
  const raw = value && typeof value === "object" ? value as Partial<ShopState> : {};
  const owned = Array.isArray(raw.owned) ? raw.owned.filter((item): item is string => typeof item === "string") : ["theme-classic", "ball-classic"];
  return { coins: Math.max(0, Math.floor(Number(raw.coins) || 0)), owned: [...new Set(["theme-classic", "ball-classic", ...owned])], equippedTheme: raw.equippedTheme === "night" || raw.equippedTheme === "retro" || raw.equippedTheme === "neon" ? raw.equippedTheme : "classic", equippedBall: raw.equippedBall === "crimson" || raw.equippedBall === "neon" ? raw.equippedBall : "classic", rewardedGames: Array.isArray(raw.rewardedGames) ? raw.rewardedGames.filter((code): code is string => typeof code === "string").slice(-150) : [], operatorGrantApplied: raw.operatorGrantApplied === true };
};
