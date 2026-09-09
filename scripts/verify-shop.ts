import { SHOP_ITEMS, readShop } from "../lib/shop";

const legacy = readShop({ coins: 13, owned: ["theme-night"], equippedTheme: "night" });
if (!legacy.owned.includes("ball-classic") || legacy.equippedBall !== "classic" || legacy.operatorGrantApplied) {
  throw new Error("Legacy shop state did not receive the safe ball-skin defaults.");
}

const crimson = SHOP_ITEMS.find((item) => item.id === "ball-crimson");
const neon = SHOP_ITEMS.find((item) => item.id === "ball-neon");
if (!crimson || crimson.type !== "ball" || crimson.cost !== 120 || !neon || neon.type !== "ball" || neon.cost !== 180) {
  throw new Error("Ball-skin catalog is incomplete.");
}

console.log("PASS: shop state migration and baseball-skin catalog.");
