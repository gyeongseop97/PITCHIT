export type CosmeticSet = "classic" | "night" | "retro" | "neon";
export type ShopState = { coins: number; owned: string[]; equippedSet: CosmeticSet; equippedTheme: CosmeticSet; equippedBall: "classic" | "crimson" | "retro" | "neon"; rewardedGames: string[]; operatorGrantApplied: boolean };
export const SHOP_ITEMS = [
  { id: "set-classic", type: "set", set: "classic", theme: "classic", ball: "classic", effect: "classic", name: "클래식 스타터 세트", description: "기본 구장 · 클래식 야구공 · 기본 타격감", cost: 0 },
  { id: "set-night", type: "set", set: "night", theme: "night", ball: "crimson", effect: "night", name: "나이트 파이어 세트", description: "야간 구장 · 크림슨 하드볼 · 불꽃 섬광 이펙트", cost: 210 },
  { id: "set-retro", type: "set", set: "retro", theme: "retro", ball: "retro", effect: "retro", name: "레트로 볼파크 세트", description: "빈티지 구장 · 레트로 가죽공 · 카드 버스트 이펙트", cost: 270 },
  { id: "set-neon", type: "set", set: "neon", theme: "neon", ball: "neon", effect: "neon", name: "네온 썬더 세트", description: "네온 구장 · 사이버 블루볼 · 번개 이펙트", cost: 330 },
] as const;
const validSet = (value: unknown): value is CosmeticSet => value === "classic" || value === "night" || value === "retro" || value === "neon";
const legacySet = (item: string) => item === "theme-night" || item === "ball-crimson" ? "night" : item === "theme-retro" || item === "ball-retro" ? "retro" : item === "theme-neon" || item === "ball-neon" ? "neon" : item === "theme-classic" || item === "ball-classic" ? "classic" : null;
const itemForSet = (set: CosmeticSet) => `set-${set}`;
const setData = (set: CosmeticSet) => SHOP_ITEMS.find((item) => item.set === set)!;
export const defaultShop = (): ShopState => ({ coins: 0, owned: ["set-classic"], equippedSet: "classic", equippedTheme: "classic", equippedBall: "classic", rewardedGames: [], operatorGrantApplied: false });
export const readShop = (value: unknown): ShopState => {
  const raw = value && typeof value === "object" ? value as Partial<ShopState> : {};
  const source = Array.isArray(raw.owned) ? raw.owned.filter((item): item is string => typeof item === "string") : [];
  const owned = [...new Set(["set-classic", ...source.filter((item) => /^set-(classic|night|retro|neon)$/.test(item)), ...source.map(legacySet).filter((item): item is CosmeticSet => Boolean(item)).map(itemForSet)])];
  const prior = validSet(raw.equippedTheme) ? raw.equippedTheme : raw.equippedBall === "crimson" ? "night" : raw.equippedBall === "retro" ? "retro" : raw.equippedBall === "neon" ? "neon" : "classic";
  const equippedSet = validSet(raw.equippedSet) && owned.includes(itemForSet(raw.equippedSet)) ? raw.equippedSet : owned.includes(itemForSet(prior)) ? prior : "classic";
  const equipped = setData(equippedSet);
  return { coins: Math.max(0, Math.floor(Number(raw.coins) || 0)), owned, equippedSet, equippedTheme: equipped.theme, equippedBall: equipped.ball, rewardedGames: Array.isArray(raw.rewardedGames) ? raw.rewardedGames.filter((code): code is string => typeof code === "string").slice(-150) : [], operatorGrantApplied: raw.operatorGrantApplied === true };
};
