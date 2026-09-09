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
    const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
    const { userId } = clerkEnabled ? await auth() : { userId: null };
    try {
      const input = JSON.parse(body);
      // Never trust a browser-provided "member" flag.  The Clerk session is
      // the only authority that marks a player as an account holder.
      if (userId) {
        const profile = await redis.get<{ name?: string }>(`pitchit:account-career:v1:${userId}`);
        // Keep a separately supplied guest profile only for the one-time
        // migration request. The active room/ranking identity always stays
        // bound to the Clerk user id below.
        const guestProfileId = input.action === "migrate-guest" ? input.guestProfileId : undefined;
        body = JSON.stringify({ ...input, guestProfileId, profileId: userId, name: profile?.name || "플레이어", authenticated: true });
      } else {
        body = JSON.stringify({ ...input, authenticated: false });
      }
    } catch { /* handler reports malformed input */ }
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
