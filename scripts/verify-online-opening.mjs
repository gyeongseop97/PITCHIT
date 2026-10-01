/** Real 2-player browser requests against the actual handler and local-only Redis.
 * No production rooms, accounts or records are touched. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from '../lib/game-engine.ts';
import * as roster from '../lib/roster.ts';
import { resolveGroundBall, resolveFlyBall, resolveWalk } from '../lib/base-running.ts';
import { readShop } from '../lib/shop.ts';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const db = new Map(), sorted = new Map(), hashes = new Map(), requests = [];
class Redis {
  async get(key) { return db.has(key) ? structuredClone(db.get(key)) : null; }
  async set(key, value, options) { if (options?.nx && db.has(key)) return null; db.set(key, structuredClone(value)); return 'OK'; }
  async del(key) { return Number(db.delete(key)); }
  async zadd(key, ...entries) { const set = sorted.get(key) || new Map(); for (const entry of entries.flat()) set.set(entry.member, Number(entry.score)); sorted.set(key, set); return 'OK'; }
  async zrange(key, start, stop, options = {}) { const entries = [...(sorted.get(key) || new Map()).entries()].sort((a, b) => options.rev ? b[1] - a[1] : a[1] - b[1]); return entries.slice(start, stop < 0 ? undefined : stop + 1).map(([member]) => member); }
  async zrem(key, member) { return Number(sorted.get(key)?.delete(member)); }
  async hincrby(key, field, amount) { const hash = hashes.get(key) || new Map(), value = Number(hash.get(field) || 0) + amount; hash.set(field, value); hashes.set(key, hash); return value; }
}
const source = stripTypeScriptTypes(readFileSync(path.join(root, 'app/api/match/handler.ts'), 'utf8').replace(/^import .*;\r?$/gm, '')).replace('export default async function handler', 'async function handler');
const handler = runInNewContext(source + '\nhandler', { ...engine, ...roster, readShop, resolveGroundBall, resolveFlyBall, resolveWalk, randomBytes, Redis, process: { env: {} }, console, Date, Math, setTimeout });
async function api(body) {
  let status = 200, data;
  const res = { setHeader() {}, status(n) { status = n; return res; }, json(value) { data = value; }, end() {} };
  await handler({ method: 'POST', body }, res);
  requests.push({ body, status, data });
  return { status, data };
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/match') {
      let text = ''; for await (const chunk of req) text += chunk;
      const body = JSON.parse(text), result = await api(body);
      res.writeHead(result.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(result.data)); return;
    }
    if (pathname.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"signedIn":false}'); return; }
    const file = path.resolve(root, 'public', '.' + decodeURIComponent(pathname));
    if (!file.startsWith(path.join(root, 'public') + path.sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  } catch (error) { res.writeHead(500).end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  for (const mode of ['friend', 'quick']) for (const graphics3D of [false, true]) {
    const contexts = [], pages = [], errors = [];
    try {
      const first = (await api({ action: mode === 'friend' ? 'create' : 'quick', name: '선수 A', graphics3D })).data;
      const second = (await api({ action: mode === 'friend' ? 'join' : 'quick', code: first.code, name: '선수 B', graphics3D })).data;
      const sessions = await Promise.all([first, second].map(room => api({ action: 'state', code: room.code, token: room.token }).then(response => response.data)));
      // Assert both players' first defensive pitch too, without waiting for
      // random third outs. This isolates the half-inning transition path.
      for (let index = 0; index < 2; index++) {
        const context = await browser.newContext({ viewport: graphics3D ? { width: 1280, height: 1000 } : { width: 390, height: 844 }, hasTouch: !graphics3D }); contexts.push(context);
        const page = await context.newPage(); pages.push(page); page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"signedIn":false}' }));
        await page.goto(base + '/game/index.html');
        await page.evaluate(async ({ room, mode }) => {
          matchSession = { code: room.code, token: room.token, player: room.player, mode };
          if (room.graphics3D) await requestMatch({ action: 'state', code: room.code, token: room.token });
          beginMatch(room);
        }, { room: sessions[index], mode });
      }
      await Promise.all(pages.map(page => page.waitForFunction(() => state.net && matchNow() >= state.introUntil && !document.getElementById('matchIntro'), null, { timeout: 15000 })));
      if (graphics3D) await Promise.all(pages.map(page => page.waitForFunction(() => window.pitchit3D.snapshot().scene)));
      async function choose(page, cell, confirm = true) {
        if (graphics3D) {
          await page.locator('[data-view3d="zone"]').click();
          await page.locator('.pitch3dViewport').scrollIntoViewIfNeeded();
          const box = await page.locator('.pitch3dCanvas canvas').boundingBox();
          const point = await page.evaluate(cell => window.pitchit3D.snapshot().scene.zoneCells.find(point => point.cell === cell), cell);
          assert.ok(point.visible); await page.mouse.click(box.x + point.x * box.width, box.y + point.y * box.height);
        } else await page.locator(`#zone [data-z="${cell}"]`).click();
        assert.equal(await page.evaluate(() => state.pick), cell);
        if (confirm) await page.locator(graphics3D ? '.pitch3dConfirm' : '#swing').click();
      }
      for (let half = 0; half < 2; half++) {
        const stored = db.get(`pitchit:room:${first.code}`);
        if (half) {
          stored.game.half = half; stored.game.balls = 0; stored.game.strikes = 0; stored.game.outs = 0;
          stored.game.choices = {}; stored.game.drafts = {}; stored.game.lastPlay = undefined;
          stored.game.deadline = Date.now() + 20000;
          await Promise.all(pages.map(page => page.evaluate(async () => applyMatch(await requestMatch({ action: 'state', code: matchSession.code, token: matchSession.token })))));
          await Promise.all(pages.map(page => page.locator('#inningBreak').waitFor({ state: 'hidden', timeout: 15000 })));
          if (graphics3D) await Promise.all(pages.map(page => page.waitForFunction(() => window.pitchit3D.snapshot().scene.phase === 'ready', null, { timeout: 15000 })));
        }
        const pitcherIndex = sessions.findIndex(room => room.player === (half === 0 ? 'p2' : 'p1')), batterIndex = 1 - pitcherIndex;
        const before = stored.game.deadline, requestStart = requests.length, started = Date.now();
        // Never click the default fastball selector: a fresh client must
        // submit the visually selected default, not an undefined pitch.
        await choose(pages[batterIndex], 12, false);
        await choose(pages[pitcherIndex], 12, false);
        // Preview/draft storage must accept the default pitch too. It is
        // private and does not count as an active final confirmation.
        await pages[pitcherIndex].waitForTimeout(500);
        const drafts = requests.slice(requestStart).filter(request => request.body.action === 'draft');
        assert.ok(drafts.some(request => request.body.choice.kind === 'pitch' && request.body.choice.pitch === 'fast' && request.status === 200), JSON.stringify(drafts));
        const confirmSelector = graphics3D ? '.pitch3dConfirm' : '#swing';
        await pages[batterIndex].locator(confirmSelector).click();
        await pages[pitcherIndex].locator(confirmSelector).click();
        // Wait for network completion before checking the actual accepted
        // payload, so failure reports the server rejection, not just a timer.
        await Promise.all(pages.map(page => page.waitForFunction(previous => state.deadline !== previous, before, { timeout: 4000 }).catch(error => { throw new Error(`${error.message}\nchoices=${JSON.stringify(requests.slice(requestStart).filter(request => request.body.action === 'choose'))}`); })));
        const choices = requests.slice(requestStart).filter(request => request.body.action === 'choose');
        assert.equal(choices.length, 2); assert.ok(choices.every(request => request.status === 200), JSON.stringify(choices));
        assert.equal(choices.find(request => request.body.choice.kind === 'pitch').body.choice.pitch, 'fast');
        assert.ok(db.get(`pitchit:room:${first.code}`).game.lastPlay); assert.ok(before - Date.now() > 8000, 'Opening pitch waited for the turn deadline');
        console.log(`  half=${half} resolved in ${Date.now() - started}ms including 500ms preview check`);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS: ${mode} ${graphics3D ? '3D' : '2D'} both first defensive pitches resolve immediately with the default pitch.`);
    } finally { await Promise.all(contexts.map(context => context.close())); }
  }
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
