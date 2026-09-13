export type CosmeticSet = "classic" | "night" | "retro" | "neon";
export type ShopState = { coins: number; owned: string[]; equippedTheme: CosmeticSet; equippedBall: "classic" | "crimson" | "retro" | "neon"; equippedEffect: CosmeticSet; rewardedGames: string[]; operatorGrantApplied: boolean };
export const SHOP_ITEMS = [
  { id: "ball-classic", type: "ball", value: "classic", name: "클래식 야구공", description: "기본 흰색 야구공", image: "pitch-ball.png", cost: 0 },
  { id: "ball-crimson", type: "ball", value: "crimson", name: "크림슨 하드볼", description: "강렬한 붉은 야구공", image: "pitch-ball-crimson-v1.png", cost: 70 },
  { id: "ball-retro", type: "ball", value: "retro", name: "레트로 가죽공", description: "빈티지 가죽 야구공", image: "pitch-ball-retro-v1.png", cost: 90 },
  { id: "ball-neon", type: "ball", value: "neon", name: "사이버 블루볼", description: "푸른 네온 야구공", image: "pitch-ball-neon-v1.png", cost: 110 },
  { id: "theme-classic", type: "theme", value: "classic", name: "기본 구장", description: "클래식 구장 배경", image: "", cost: 0 },
  { id: "theme-night", type: "theme", value: "night", name: "야간 구장", description: "밤의 구장 배경", image: "", cost: 70 },
  { id: "theme-retro", type: "theme", value: "retro", name: "빈티지 구장", description: "레트로 구장 배경", image: "", cost: 90 },
  { id: "theme-neon", type: "theme", value: "neon", name: "네온 구장", description: "네온 구장 배경", image: "", cost: 110 },
  { id: "effect-classic", type: "effect", value: "classic", name: "기본 타격감", description: "기본 결과 효과", image: "", cost: 0 },
  { id: "effect-night", type: "effect", value: "night", name: "불꽃 섬광", description: "불꽃이 터지는 결과 효과", image: "pitch-effect-night-v1.png", cost: 70 },
  { id: "effect-retro", type: "effect", value: "retro", name: "카드 버스트", description: "빈티지 카드 결과 효과", image: "pitch-effect-retro-v1.png", cost: 90 },
  { id: "effect-neon", type: "effect", value: "neon", name: "번개", description: "번쩍이는 번개 결과 효과", image: "pitch-effect-neon-v1.png", cost: 110 },
] as const;
export type ShopItem = typeof SHOP_ITEMS[number];
export const equippedField = { ball: "equippedBall", theme: "equippedTheme", effect: "equippedEffect" } as const;
export const defaultShop = (): ShopState => ({ coins: 0, owned: ["ball-classic", "theme-classic", "effect-classic"], equippedTheme: "classic", equippedBall: "classic", equippedEffect: "classic", rewardedGames: [], operatorGrantApplied: false });
export const readShop = (value: unknown): ShopState => {
  const raw = value && typeof value === "object" ? value as Partial<ShopState> & { equippedSet?: string } : {};
  const source = Array.isArray(raw.owned) ? raw.owned.filter((item): item is string => typeof item === "string") : [];
  // Bundle purchases grant all components; individual purchases stay individual.
  const expanded = source.flatMap((id) => /^set-(classic|night|retro|neon)$/.test(id) ? [`theme-${id.slice(4)}`, `ball-${id === "set-night" ? "crimson" : id.slice(4)}`, `effect-${id.slice(4)}`] : [id]);
  const owned = [...new Set([...defaultShop().owned, ...expanded.filter((id) => SHOP_ITEMS.some((item) => item.id === id))])];
  const selected = (type: ShopItem["type"], candidate: unknown) => SHOP_ITEMS.find((item) => item.type === type && item.value === candidate && owned.includes(item.id))?.value || "classic";
  const legacySet = source.includes(`set-${raw.equippedSet}`) ? raw.equippedSet : undefined;
  return {
    coins: Number.isFinite(Number(raw.coins)) ? Math.max(0, Math.floor(Number(raw.coins))) : 0, owned,
    equippedTheme: selected("theme", raw.equippedTheme ?? legacySet) as ShopState["equippedTheme"],
    equippedBall: selected("ball", raw.equippedBall ?? (legacySet === "night" ? "crimson" : legacySet)) as ShopState["equippedBall"],
    equippedEffect: selected("effect", raw.equippedEffect ?? legacySet) as ShopState["equippedEffect"],
    rewardedGames: Array.isArray(raw.rewardedGames) ? raw.rewardedGames.filter((code): code is string => typeof code === "string").slice(-150) : [],
    operatorGrantApplied: raw.operatorGrantApplied === true,
  };
};
export function buyShopItem(shop: ShopState, item: ShopItem): ShopState {
  if (shop.owned.includes(item.id)) return shop;
  if (shop.coins < item.cost) throw new Error("P 코인이 부족합니다.");
  return { ...shop, coins: shop.coins - item.cost, owned: [...shop.owned, item.id] };
}
export function equipShopItem(shop: ShopState, item: ShopItem): ShopState {
  if (!shop.owned.includes(item.id)) throw new Error("보유하지 않은 아이템입니다.");
  return { ...shop, [equippedField[item.type]]: item.value };
}
