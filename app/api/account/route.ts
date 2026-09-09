import { auth, currentUser } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { SHOP_ITEMS, readShop } from "../../../lib/shop";

export const runtime = "nodejs";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const careerKey = (userId: string) => `pitchit:account-career:v1:${userId}`;
const nicknameKey = (normalized: string) => `pitchit:nickname:v1:${normalized}`;
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const boundedCareer = (value: unknown) => {
  const career = asObject(value);
  const history = Array.isArray(career.matchHistory) ? career.matchHistory.slice(0, 30) : [];
  const codes = Array.isArray(career.recordedGames) ? career.recordedGames.slice(-100) : [];
  return { ...career, matchHistory: history, recordedGames: codes };
};
const careerNumber = (value: unknown) => Math.max(0, Number(value) || 0);
const mergeCareer = (saved: unknown, imported: unknown) => {
  const current: Record<string, unknown> = boundedCareer(saved), incoming: Record<string, unknown> = boundedCareer(imported);
  const totals = ["games", "wins", "losses", "draws", "atBats", "hits", "rbi", "homeRuns", "walks", "strikeouts", "outsRecorded", "earnedRuns"];
  const next: Record<string, unknown> = { ...current };
  for (const field of totals) next[field] = careerNumber(current[field]) + careerNumber(incoming[field]);
  next.recordedGames = [...new Set([...(Array.isArray(current.recordedGames) ? current.recordedGames.map(String) : []), ...(Array.isArray(incoming.recordedGames) ? incoming.recordedGames.map(String) : [])])].slice(-100);
  const history = [...(Array.isArray(incoming.matchHistory) ? incoming.matchHistory : []), ...(Array.isArray(current.matchHistory) ? current.matchHistory : [])];
  const seen = new Set<string>();
  next.matchHistory = history.filter((entry) => { const code = String(asObject(entry).code || ""); if (!code || seen.has(code)) return false; seen.add(code); return true; }).slice(0, 30);
  return next;
};
const nickname = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 16);
const normalizedNickname = (value: string) => value.toLocaleLowerCase("ko-KR");
const operatorEmail = "mgs15158@gmail.com";
const isOperator = (user: Awaited<ReturnType<typeof currentUser>>) => Boolean(user?.emailAddresses.some((email) => email.emailAddress.toLowerCase() === operatorEmail));

async function signedIn() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) return null;
  const { userId } = await auth();
  return userId;
}

export async function GET() {
  const userId = await signedIn();
  if (!userId) return Response.json({ signedIn: false });
  const [saved, user] = await Promise.all([redis.get<Record<string, unknown>>(careerKey(userId)), currentUser()]);
  return Response.json({
    signedIn: true,
    name: saved?.name || user?.firstName || user?.username || "플레이어",
    career: saved?.career || null,
    shop: readShop(saved?.shop),
    operator: isOperator(user),
    mergedLocal: Boolean(saved?.mergedLocal),
  });
}

export async function POST(request: Request) {
  const userId = await signedIn();
  if (!userId) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const input = asObject(await request.json());
  const saved = (await redis.get<Record<string, unknown>>(careerKey(userId))) || {};
  const action = String(input.action || "");
  const name = nickname(input.name || saved.name || "플레이어") || "플레이어";

  if (action === "merge") {
    // The explicit first-login import is intentionally one-time.  It prevents
    // a browser refresh from adding the same device career twice.
    if (saved.mergedLocal) return Response.json({ signedIn: true, name, career: saved.career || null, mergedLocal: true });
    const next = { ...saved, career: mergeCareer(saved.career, input.career), mergedLocal: true, updatedAt: Date.now() };
    await redis.set(careerKey(userId), next);
    return Response.json({ signedIn: true, ...next });
  }

  if (action === "name") {
    if (name.length < 2) return Response.json({ error: "닉네임은 2~16자로 입력해 주세요." }, { status: 400 });
    const key = nicknameKey(normalizedNickname(name));
    const owner = await redis.get<string>(key);
    if (owner && owner !== userId) return Response.json({ error: "이미 사용 중인 닉네임입니다." }, { status: 409 });
    if (!owner) {
      const claimed = await redis.set(key, userId, { nx: true });
      if (!claimed) return Response.json({ error: "이미 사용 중인 닉네임입니다." }, { status: 409 });
    }
    const previous = typeof saved.nicknameKey === "string" ? saved.nicknameKey : "";
    if (previous && previous !== key) {
      const previousOwner = await redis.get<string>(previous);
      if (previousOwner === userId) await redis.del(previous);
    }
    const next = { ...saved, name, nicknameKey: key, updatedAt: Date.now() };
    await redis.set(careerKey(userId), next);
    return Response.json({ signedIn: true, ...next });
  }
  if (action === "shop-buy") {
    const item = SHOP_ITEMS.find((candidate) => candidate.id === String(input.itemId || ""));
    if (!item) return Response.json({ error: "상점 아이템을 찾을 수 없습니다." }, { status: 404 });
    const shop = readShop(saved.shop);
    if (shop.owned.includes(item.id)) return Response.json({ signedIn: true, name, career: saved.career || null, shop });
    if (shop.coins < item.cost) return Response.json({ error: "P 코인이 부족합니다." }, { status: 409 });
    const next = { ...saved, shop: { ...shop, coins: shop.coins - item.cost, owned: [...shop.owned, item.id] }, updatedAt: Date.now() };
    await redis.set(careerKey(userId), next);
    return Response.json({ signedIn: true, name, career: saved.career || null, shop: next.shop });
  }
  if (action === "shop-equip") {
    const item = SHOP_ITEMS.find((candidate) => candidate.id === String(input.itemId || ""));
    const shop = readShop(saved.shop);
    if (!item || !shop.owned.includes(item.id)) return Response.json({ error: "보유하지 않은 아이템입니다." }, { status: 409 });
    const equipped = item.type === "theme" ? { equippedTheme: item.theme } : { equippedBall: item.ball };
    const next = { ...saved, shop: { ...shop, ...equipped }, updatedAt: Date.now() };
    await redis.set(careerKey(userId), next);
    return Response.json({ signedIn: true, name, career: saved.career || null, shop: next.shop });
  }
  if (action === "operator-grant") {
    const user = await currentUser();
    if (!isOperator(user)) return Response.json({ error: "운영자 권한이 필요합니다." }, { status: 403 });
    const shop = readShop(saved.shop);
    const nextShop = { ...shop, coins: Math.max(shop.coins, 100000), operatorGrantApplied: true };
    const next = { ...saved, shop: nextShop, updatedAt: Date.now() };
    await redis.set(careerKey(userId), next);
    return Response.json({ signedIn: true, name, career: saved.career || null, shop: nextShop, operator: true });
  }
  return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
