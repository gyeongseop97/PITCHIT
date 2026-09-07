import { auth, currentUser } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const careerKey = (userId: string) => `pitchit:account-career:v1:${userId}`;
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const boundedCareer = (value: unknown) => {
  const career = asObject(value);
  const history = Array.isArray(career.matchHistory) ? career.matchHistory.slice(0, 30) : [];
  const codes = Array.isArray(career.recordedGames) ? career.recordedGames.slice(-100) : [];
  return { ...career, matchHistory: history, recordedGames: codes };
};

async function signedIn() {
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
    mergedLocal: Boolean(saved?.mergedLocal),
  });
}

export async function POST(request: Request) {
  const userId = await signedIn();
  if (!userId) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const input = asObject(await request.json());
  const saved = (await redis.get<Record<string, unknown>>(careerKey(userId))) || {};
  const action = String(input.action || "");
  const name = String(input.name || saved.name || "플레이어").trim().slice(0, 16) || "플레이어";

  if (action === "merge") {
    // The explicit first-login import is intentionally one-time.  It prevents
    // a browser refresh from adding the same device career twice.
    if (saved.mergedLocal) return Response.json({ signedIn: true, name, career: saved.career || null, mergedLocal: true });
    const next = { name, career: boundedCareer(input.career), mergedLocal: true, updatedAt: Date.now() };
    await redis.set(careerKey(userId), next);
    return Response.json({ signedIn: true, ...next });
  }

  if (action === "sync") {
    const next = { ...saved, name, career: boundedCareer(input.career), updatedAt: Date.now() };
    await redis.set(careerKey(userId), next);
    return Response.json({ signedIn: true, ...next });
  }

  if (action === "name") {
    const next = { ...saved, name, updatedAt: Date.now() };
    await redis.set(careerKey(userId), next);
    return Response.json({ signedIn: true, ...next });
  }
  return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
