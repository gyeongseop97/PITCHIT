import matchHandler from "./handler";
import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";
const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

async function respond(request: Request) {
  const headers = new Headers();
  let status = 200;
  let payload: unknown;
  let ended = false;
  const response = {
    setHeader(name: string, value: string) { headers.set(name, value); },
    status(code: number) { status = code; return response; },
    json(value: unknown) { payload = value; },
    end() { ended = true; },
  };
  let body = request.method === "GET" ? undefined : await request.text();
  // Guests keep their device profile id.  A signed-in player cannot spoof a
  // different profile id: rankings and rooms are bound to the Clerk account.
  if (body) {
    const { userId } = await auth();
    if (userId) {
      try {
        const profile = await redis.get<{ name?: string }>(`pitchit:account-career:v1:${userId}`);
        body = JSON.stringify({ ...JSON.parse(body), profileId: userId, name: profile?.name || "플레이어" });
      } catch { /* handler reports malformed input */ }
    }
  }
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  await matchHandler({ method: request.method, body, query }, response);
  if (!headers.has("Content-Type") && !ended) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(ended ? null : JSON.stringify(payload ?? {}), { status, headers });
}

export async function POST(request: Request) { return respond(request); }
export async function GET(request: Request) { return respond(request); }
export async function OPTIONS(request: Request) { return respond(request); }
