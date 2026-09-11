import { SHOP_ITEMS, readShop } from "../lib/shop";

const legacy = readShop({ coins: 13, owned: ["theme-night"], equippedTheme: "night" });
if (!legacy.owned.includes("set-night") || legacy.equippedSet !== "night" || legacy.equippedBall !== "crimson" || legacy.operatorGrantApplied) {
  throw new Error("Legacy shop state did not migrate to its matching cosmetic set.");
}

const neon = SHOP_ITEMS.find((item) => item.id === "set-neon");
const retro = SHOP_ITEMS.find((item) => item.id === "set-retro");
if (!neon || neon.ball !== "neon" || neon.effect !== "neon" || !retro || retro.ball !== "retro" || retro.effect !== "retro") {
  throw new Error("Cosmetic set catalog is incomplete.");
}

console.log("PASS: shop state migration and paired cosmetic-set catalog.");
