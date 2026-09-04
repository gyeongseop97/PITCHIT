/**
 * Production API smoke test for every online-room transition. It only creates
 * short-lived audit rooms and uses one shared profile id, so it never changes
 * the public ranking table. Run with:
 *   npx tsx scripts/verify-match-flows.ts
 */
import assert from "node:assert/strict";

const api = process.env.MATCH_URL ?? "https://pitchit-baseball.vercel.app/api/match";
const auditId = `audit_${Date.now()}_shared`;
const auditName = "자동 점검";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(body: Record<string, unknown>, expected = 200): Promise<any> {
  const response = await fetch(api, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${body.action}: ${data.error ?? JSON.stringify(data)}`);
  return data;
}

async function state(session: any) {
  return request({ action: "state", code: session.code, token: session.token });
}

async function main() {
  // Presence and a solo turn cover the non-match API paths and AI resolution.
  const presence = await request({ action: "presence", clientId: `audit_${Date.now()}_presence` });
  assert.ok(Number.isInteger(presence.online) && presence.online >= 1);
  const solo = await request({ action: "solo", name: auditName, profileId: auditId }, 201);
  const soloTurn = await request({ action: "choose", code: solo.code, token: solo.token, choice: { kind: "bat", cell: 12, swing: "contact" } });
  assert.ok(soloTurn.game.lastPlay, "solo turn must resolve with an AI choice");

  // Friend lobby: waiting rooms reject choices, then allow exactly one join.
  const host = await request({ action: "create", name: auditName, profileId: auditId }, 201);
  await request({ action: "choose", code: host.code, token: host.token, choice: { kind: "bat", cell: 12, swing: "contact" } }, 409);
  const guest = await request({ action: "join", code: host.code, name: auditName, profileId: auditId });
  assert.equal(guest.ready, true);
  await request({ action: "join", code: host.code, name: auditName, profileId: auditId }, 409);
  await request({ action: "choose", code: host.code, token: host.token, choice: { kind: "bat", cell: 25, swing: "contact" } }, 409);

  // Intro cannot consume decision time. After it ends, only the defender may swap.
  await wait(5_200);
  const initial = await state(host);
  const attacker = initial.attacker === "p1" ? host : guest;
  const defender = initial.attacker === "p1" ? guest : host;
  await request({ action: "swap", code: host.code, token: attacker.token, index: 0 }, 409);
  const staff = initial.game.teams[defender.player].pitchers as unknown[];
  const used = initial.game.teams[defender.player].usedPitchers as number[];
  const replacement = staff.findIndex((_, index) => !used.includes(index));
  assert.ok(replacement >= 0, "a new game must have an unused bullpen pitcher");
  const swapped = await request({ action: "swap", code: host.code, token: defender.token, index: replacement });
  assert.equal(swapped.swapped, true);

  // Invalid payloads are rejected and one locked choice is private but visible as ready.
  const bat = initial.attacker === "p1" ? { kind: "bat", cell: 12, swing: "contact" } : { kind: "pitch", cell: 12, pitch: "fast" };
  const bad = initial.attacker === "p1" ? { kind: "bat", cell: -1, swing: "contact" } : { kind: "pitch", cell: -1, pitch: "fast" };
  await request({ action: "choose", code: host.code, token: attacker.token, choice: bad }, 400);
  const locked = await request({ action: "choose", code: host.code, token: attacker.token, choice: bat });
  assert.equal(locked.choiceReady[attacker.player], true);
  assert.deepEqual(locked.game.choices, {}, "public state must never reveal a chosen target");
  const answer = initial.attacker === "p1" ? { kind: "pitch", cell: 6, pitch: "breaking" } : { kind: "bat", cell: 6, swing: "power" };
  const resolved = await request({ action: "choose", code: host.code, token: defender.token, choice: answer });
  assert.ok(resolved.game.lastPlay, "both submitted choices must resolve one pitch");
  assert.ok(resolved.game.lastPlay.actualCell >= 0 && resolved.game.lastPlay.actualCell < 25);

  // Quick queue joins atomically; a waiting quick room can also be cancelled.
  const queued = await request({ action: "quick", name: auditName, profileId: auditId }, 201);
  assert.equal(queued.searching, true);
  const matched = await request({ action: "quick", name: auditName, profileId: auditId });
  assert.equal(matched.code, queued.code);
  assert.equal(matched.ready, true);
  const cancellable = await request({ action: "quick", name: auditName, profileId: auditId }, 201);
  const cancelled = await request({ action: "cancel", code: cancellable.code, token: cancellable.token });
  assert.equal(cancelled.cancelled, true);

  // Forfeit ends the match immediately. Shared profile keeps this audit out of ranking.
  const forfeited = await request({ action: "forfeit", code: host.code, token: attacker.token });
  assert.equal(forfeited.game.status, "finished");
  assert.equal(forfeited.game.forfeitWinner, defender.player);
  console.log("PASS: presence, solo, friend lobby/join/intro, validation, choice privacy, swap, quick queue/cancel, forfeit");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
