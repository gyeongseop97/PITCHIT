export type ShopTheme = "classic" | "night" | "retro" | "neon";
export type ShopState = { coins: number; owned: string[]; equippedTheme: ShopTheme; rewardedGames: string[] };
export const SHOP_ITEMS = [
  { id: "theme-night", type: "theme", theme: "night", name: "나이트 게임", description: "깊은 남색의 야간 구장 전광판", cost: 90 },
  { id: "theme-retro", type: "theme", theme: "retro", name: "레트로 볼파크", description: "빈티지 크림·브라운 경기장", cost: 140 },
  { id: "theme-neon", type: "theme", theme: "neon", name: "네온 클래식", description: "보랏빛 네온 야구장", cost: 210 },
] as const;
export const defaultShop = (): ShopState => ({ coins: 0, owned: ["theme-classic"], equippedTheme: "classic", rewardedGames: [] });
export const readShop = (value: unknown): ShopState => {
  const raw = value && typeof value === "object" ? value as Partial<ShopState> : {};
  const owned = Array.isArray(raw.owned) ? raw.owned.filter((item): item is string => typeof item === "string") : ["theme-classic"];
  return { coins: Math.max(0, Math.floor(Number(raw.coins) || 0)), owned: [...new Set(["theme-classic", ...owned])], equippedTheme: raw.equippedTheme === "night" || raw.equippedTheme === "retro" || raw.equippedTheme === "neon" ? raw.equippedTheme : "classic", rewardedGames: Array.isArray(raw.rewardedGames) ? raw.rewardedGames.filter((code): code is string => typeof code === "string").slice(-150) : [] };
};
