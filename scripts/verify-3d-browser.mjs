/** Local-only regression for PITCHIT's optional 3D presentation layer.
 * Install Playwright or set PLAYWRIGHT_MODULE; BROWSER_CHANNEL is optional. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(await readFile(file))}catch{res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1400,height:1100},hasTouch:true}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://**/*',route=>route.fulfill({status:200,contentType:'application/json',body:'{"signedIn":false}'}));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function select(cell,touch=false){
  await page.locator('.pitch3dViewport').scrollIntoViewIfNeeded();
  const box=await page.locator('.pitch3dCanvas canvas').boundingBox();
  const p=await page.evaluate(cell=>window.pitchit3D.snapshot().scene.zoneCells.find(p=>p.cell===cell),cell);
  assert.ok(p.visible&&p.x>0&&p.x<1&&p.y>0&&p.y<1);
  if(touch)await page.touchscreen.tap(box.x+p.x*box.width,box.y+p.y*box.height);
  else await page.mouse.click(box.x+p.x*box.width,box.y+p.y*box.height);
 }
 for(const entry of ['/public/game/index.html','/static/index.html','/static/game/index.html']){
  await page.goto(base+entry);await page.evaluate(()=>{requestMatch=async()=>{throw Error('Offline fixture')};start('solo')});await page.waitForFunction(()=>state.mode==='solo'&&!state.net);
  const before=await page.evaluate(()=>JSON.stringify(state));assert.equal(await page.locator('.demo3DEntry').count(),2);
  await page.locator('.game .demo3DEntry').click();await page.waitForFunction(()=>window.pitchit3D.snapshot().scene!==null);assert.equal(await page.evaluate(()=>JSON.stringify(state)),before);
  for(const cell of [0,4,20,24,12]){await select(cell);assert.equal(await page.evaluate(()=>state.pick),cell)}
  await page.locator('.pitch3dConfirm').click();await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.plays>0);await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.phase==='result');
  const after=await page.evaluate(()=>JSON.stringify(state));await page.locator('.game .demo3DEntry').click();assert.equal(await page.evaluate(()=>JSON.stringify(state)),after);assert.equal(await page.locator('.pitch3dViewport > .zoneWrap').count(),0);
 }
 await page.locator('.game .demo3DEntry').click();
 await page.evaluate(()=>{window.fixture={ready:true,players:{p1:{name:'A'},p2:{name:'B'}},choiceReady:{p1:false,p2:false},game:{status:'playing',inning:1,half:0,scores:[0,0],balls:0,strikes:0,outs:0,bases:[1,0,0],batter:[0,0],deadline:Date.now()+60000,event:'패스트볼 143km/h · 안타!',lastPlay:{actualCell:4,execution:'command',outcome:'single',pitchName:'패스트볼',speed:143,attacker:'p1',pitch:{kind:'pitch',cell:4,pitch:'fast'},bat:{kind:'bat',cell:4,swing:'spot'}}}};matchSession={code:'FIXTURE',token:'fixture-token',player:'p1',mode:'friend'};applyMatch(window.fixture)});
 const visual=await page.evaluate(()=>window.pitchit3D.snapshot().scene);assert.equal(visual.actualCell,4);assert.equal(visual.outcome,'single');assert.deepEqual(visual.bases,[1,0,0]);
 await page.evaluate(()=>applyMatch(window.fixture));assert.equal((await page.evaluate(()=>window.pitchit3D.snapshot().scene)).plays,visual.plays);
 await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.following);
 const cameraBefore=await page.evaluate(()=>window.pitchit3D.snapshot().scene.cameraPosition);
 await page.waitForTimeout(250);assert.notDeepEqual(await page.evaluate(()=>window.pitchit3D.snapshot().scene.cameraPosition),cameraBefore);
 assert.match(await page.locator('.pitch3dCaption').innerText(),/안타/);
 await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.phase==='ready',null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.pitchit3D.snapshot().scene.camera),'zone');
 assert.ok(await page.evaluate(()=>window.pitchit3D.snapshot().scene.historyMarkerCount>0));assert.equal(await page.evaluate(()=>window.pitchit3D.snapshot().scene.lastBatCell),4);
 const historyCount=await page.evaluate(()=>window.pitchit3D.snapshot().scene.history.length);await page.evaluate(()=>applyMatch(window.fixture));assert.equal(await page.evaluate(()=>window.pitchit3D.snapshot().scene.history.length),historyCount);
 for(const swing of ['contact','power','spot']){
  await page.evaluate(swing=>{state.swing=swing;state.pick=12;render()},swing);
  const ranges=await page.evaluate(()=>({source:[...document.querySelectorAll('#zone .range')].map(el=>+el.dataset.z),visual:window.pitchit3D.snapshot().scene.rangeCells}));assert.deepEqual(ranges.visual,ranges.source);
  assert.equal(ranges.visual.length,swing==='spot'?0:swing==='power'?8:24);
 }
 for(let cell=0;cell<25;cell++){await select(cell);assert.equal(await page.evaluate(()=>state.pick),cell)}
 await page.locator('.pitch3dCanvas canvas').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>state.pick),19);
 await select(8);await page.evaluate(()=>{requestMatch=async input=>{window.sentChoice=input;return window.fixture}});await page.locator('.pitch3dConfirm').click();const request=await page.evaluate(()=>window.sentChoice);assert.equal(request.action,'choose');assert.equal(request.choice.cell,8);assert.equal(request.choice.kind,'bat');assert.equal(request.token,'fixture-token');
 await page.evaluate(()=>{matchSubmitted=true;render()});const lockedPick=await page.evaluate(()=>state.pick);await select(12);assert.equal(await page.evaluate(()=>state.pick),lockedPick);
 await page.evaluate(()=>{matchSubmitted=false;window.fixture.choiceReady.p1=false;render()});
 for(const view of ['batter','pitcher','side','broadcast'])await page.locator(`[data-view3d="${view}"]`).click();
 await page.locator('[data-view3d="zone"]').click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const cell of [0,4,12,20,24]){await select(cell,true);assert.equal(await page.evaluate(()=>state.pick),cell)}
 await page.locator('[data-follow3d]').click();await page.evaluate(()=>{window.fixture.game.deadline+=1000;applyMatch(window.fixture)});await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.phase==='result');assert.equal(await page.evaluate(()=>window.pitchit3D.snapshot().scene.following),false);
 await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.phase==='ready',null,{timeout:10000});
 await page.evaluate(()=>{window.fixture.game.half=1;window.fixture.game.lastPlay=null;window.fixture.game.deadline+=1000;applyMatch(window.fixture)});
 assert.equal(await page.evaluate(()=>state.half),'bottom');
 await page.locator('#inningBreak').waitFor({state:'hidden'});
 for(const cell of [0,4,12,20,24]){await select(cell,true);assert.equal(await page.evaluate(()=>state.pick),cell)}
 // Current normal-game rules remove manual bait controls; 3D mirrors availability.
 assert.equal(await page.locator('.pitch3dBaits').isVisible(),false);
 await select(12,true);await page.locator('.pitch3dConfirm').click();const pitchRequest=await page.evaluate(()=>window.sentChoice);assert.equal(pitchRequest.choice.cell,12);assert.equal(pitchRequest.choice.kind,'pitch');
 await page.locator('[data-follow3d]').click();
 for(const [outcome,word,fielder] of [['groundout','땅볼 아웃','유격수'],['outfield_flyout','뜬공 아웃','우익수']]){
  await page.evaluate(({outcome,word})=>{matchSubmitted=false;window.fixture.game.deadline=Date.now()+60000;window.fixture.game.lastPlay={actualCell:20,outcome,pitchName:'패스트볼',speed:140,execution:'command',bat:{kind:'bat',cell:12,swing:'contact'},pitch:{kind:'pitch',cell:20,pitch:'fast'}};window.fixture.game.event=word;applyMatch(window.fixture)}, {outcome,word});
  await page.waitForFunction(()=>{const s=window.pitchit3D.snapshot().scene;return s.swingAge<.5&&s.batVisible});
  await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.defense.stage==='gather');
  const d=await page.evaluate(()=>window.pitchit3D.snapshot().scene.defense);assert.equal(d.fielders.length,7);assert.ok(d.fielders.some(f=>f.name===d.fielder));
  await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.defense.stage==='throw');await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.defense.stage==='receive');
  await page.waitForFunction(()=>window.pitchit3D.snapshot().scene.phase==='ready',null,{timeout:12000});await select(4,true);assert.equal(await page.evaluate(()=>window.pitchit3D.snapshot().scene.location.cell),20);assert.ok(await page.evaluate(()=>window.pitchit3D.snapshot().scene.historyMarkerCount>0));
 }
 // Room adoption runs through the real request wrapper, before match rendering.
 await page.goto(base+'/public/game/index.html');const sent=[];
 await page.route('**/api/match',async route=>{const body=route.request().postDataJSON();sent.push(body);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'3DROOM',graphics3D:true,ready:false})})});
 await page.evaluate(()=>requestMatch({action:'join',code:'3DROOM'}));assert.equal(sent.find(x=>x.action==='join').graphics3D,false);assert.equal(await page.evaluate(()=>window.pitchit3D.snapshot().enabled),true);
 await page.evaluate(()=>requestMatch({action:'create'}));assert.equal(sent.find(x=>x.action==='create').graphics3D,true);
 assert.deepEqual(errors,[]);
 console.log('PASS: 3 entry paths; 25 world-space cells, keyboard/mobile input, choice locking and original network payload; commentary; moving follow camera, return and opt-out; poll deduplication; range parity, persistent pitch history, visible swing and ground/fly fielding throws; 5 cameras; no browser errors.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
