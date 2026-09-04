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

// Deliberately opposite spot/pitch selections finish a full audit game
// quickly while still exercising balls, strikes, outs, inning changes, and
// the final-game state transition through the production API.
const battingChoice = () => ({ kind: "bat", cell: 0, swing: "spot" as const });
const pitchingChoice = () => ({ kind: "pitch", cell: 24, pitch: "fast" as const });

async function playFullGame() {
  const p1 = await request({ action: "create", name: auditName, profileId: auditId }, 201);
  const p2 = await request({ action: "join", code: p1.code, name: auditName, profileId: auditId });
  const sessions: Record<string, any> = { [p1.player]: p1, [p2.player]: p2 };
  await wait(5_200);
  let current = await state(p1);
  let pitches = 0;
  while (current.game.status === "playing" && pitches++ < 450) {
    const battingPlayer = current.attacker as "p1" | "p2";
    const pitchingPlayer = battingPlayer === "p1" ? "p2" : "p1";
    await request({ action: "choose", code: p1.code, token: sessions[battingPlayer].token, choice: battingChoice() });
    current = await request({ action: "choose", code: p1.code, token: sessions[pitchingPlayer].token, choice: pitchingChoice() });
  }
  assert.equal(current.game.status, "finished", "a complete game must finish without a stuck turn");
  assert.ok(current.game.inning >= 3 && current.game.inning <= 9, `invalid final inning: ${current.game.inning}`);
  assert.equal(current.game.inningScores[0].length, 9);
  assert.equal(current.game.inningScores[1].length, 9);
  return pitches;
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
  // `attacker` is always batting, even when that player happens to be p2.
  const bat = { kind: "bat", cell: 12, swing: "contact" };
  const bad = { kind: "bat", cell: -1, swing: "contact" };
  await request({ action: "choose", code: host.code, token: attacker.token, choice: bad }, 400);
  const locked = await request({ action: "choose", code: host.code, token: attacker.token, choice: bat });
  assert.equal(locked.choiceReady[attacker.player], true);
  assert.deepEqual(locked.game.choices, {}, "public state must never reveal a chosen target");
  const answer = { kind: "pitch", cell: 6, pitch: "breaking" };
  const resolved = await request({ action: "choose", code: host.code, token: defender.token, choice: answer });
  assert.ok(resolved.game.lastPlay, "both submitted choices must resolve one pitch");
  assert.ok(resolved.game.lastPlay.actualCell >= 0 && resolved.game.lastPlay.actualCell < 25);

  // The production queue is shared with real players. Keep this opt-in so a
  // routine audit never joins a human's waiting room. Run with
  // RUN_LIVE_QUEUE=1 only in a private/staging project.
  if (process.env.RUN_LIVE_QUEUE === "1") {
    const queued = await request({ action: "quick", name: auditName, profileId: auditId }, 201);
    assert.equal(queued.searching, true);
    const matched = await request({ action: "quick", name: auditName, profileId: auditId });
    assert.equal(matched.code, queued.code);
    assert.equal(matched.ready, true);
    const cancellable = await request({ action: "quick", name: auditName, profileId: auditId }, 201);
    const cancelled = await request({ action: "cancel", code: cancellable.code, token: cancellable.token });
    assert.equal(cancelled.cancelled, true);
  }

  // Forfeit ends the match immediately. Shared profile keeps this audit out of ranking.
  const forfeited = await request({ action: "forfeit", code: host.code, token: attacker.token });
  assert.equal(forfeited.game.status, "finished");
  assert.equal(forfeited.game.forfeitWinner, defender.player);
  const rematchWaiting = await request({ action: "rematch", code: host.code, token: attacker.token });
  assert.equal(rematchWaiting.game.status, "finished");
  const rematched = await request({ action: "rematch", code: host.code, token: defender.token });
  assert.equal(rematched.game.status, "playing");
  assert.ok(rematched.game.introUntil, "a rematch must show the match intro before its first turn");

  // A full remote game means dozens of sequential server calls. Keep it
  // opt-in for staging/CI so routine production audits cannot outlive a
  // command runner or contend with live users.
  const fullGame = process.env.RUN_FULL_GAME === "1" ? `, complete game (${await playFullGame()} pitches)` : "";
  console.log(`PASS: presence, solo, friend lobby/join/intro, validation, choice privacy, swap, forfeit/rematch${fullGame}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
