import matchHandler from "./handler";

export const runtime = "nodejs";

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
  const body = request.method === "GET" ? undefined : await request.text();
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  await matchHandler({ method: request.method, body, query }, response);
  if (!headers.has("Content-Type") && !ended) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(ended ? null : JSON.stringify(payload ?? {}), { status, headers });
}

export async function POST(request: Request) { return respond(request); }
export async function GET(request: Request) { return respond(request); }
export async function OPTIONS(request: Request) { return respond(request); }
