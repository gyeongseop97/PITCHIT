import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {resolveGroundBall} from '../lib/base-running.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204).end();return}try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript');res.end(await readFile(file))}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const fixtures=[
 {bases:[55,0,0],outs:0,dp:false},{bases:[55,55,0],outs:0,dp:false},{bases:[55,55,55],outs:0,dp:false},
 {bases:[55,0,55],outs:0,dp:false},{bases:[0,55,55],outs:0,dp:false},
 {bases:[55,55,55],outs:0,dp:true},{bases:[55,55,55],outs:1,dp:true},{bases:[55,55,55],outs:2,dp:false},
];
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1000,height:780}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({contentType:'application/json',body:'{"signedIn":false}'}));
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.queue=[];requestAnimationFrame=fn=>{if(fn.name==='frame'){queue.push(fn);return 0}return raf(fn)};window.step=n=>{for(let i=0;i<n;i++){window.time+=25;queue.splice(0).forEach(fn=>fn(time))}return window.pitchit3D.snapshot().scene};});
 for(const entry of ['/public/game/index.html','/static/index.html','/static/game/index.html']){
  await page.goto(`http://127.0.0.1:${server.address().port}`+entry);
  await page.evaluate(()=>{requestMatch=async()=>{throw Error('offline test')};start('solo')});await page.waitForFunction(()=>state.mode==='solo'&&!state.net);
  await page.locator('.game .demo3DEntry').click();await page.waitForFunction(()=>window.pitchit3D.snapshot().scene);await page.evaluate(()=>window.time=performance.now());
  for(const defending of [false,true])for(const fixture of fixtures){
   const expected=resolveGroundBall({bases:fixture.bases,outs:fixture.outs,batterSpeed:55,doublePlayChance:fixture.dp?1:0,random:()=>.999});
   const result=await page.evaluate(({fixture,defending})=>{
    Object.assign(state,{mode:'solo',net:false,finished:false,half:defending?'bottom':'top',inning:1,o:fixture.outs,b:0,s:0,r:0,away:0,bases:[...fixture.bases],pick:12,swing:'contact',pitchType:'fast'});
    Object.assign(state.batter,{p:0,a:50,e:0,v:55});Object.assign(state.awayBatter,{p:0,a:50,e:0,v:55});
    Object.assign(state.pitchers[state.activePitcher],{v:50,c:50,s:50,m:50});Object.assign(state.awayPitchers[state.awayActivePitcher],{v:50,c:50,s:50,m:50});
    render();step(2);
    const sequence=defending?[.5,.999,.60,fixture.dp?0:.999]:[.5,.999,.70,.999,.1,fixture.dp?0:.999];
    const random=Math.random;Math.random=()=>sequence.length?sequence.shift():.999;
    try{if(defending)pitch();else bat();}finally{Math.random=random;}
    const resolved={bases:[...state.bases],score:defending?state.away:state.r,outs:state.o,half:state.half};
    let snap=step(1);for(let i=0;i<150&&snap.phase!=='result';i++)snap=step(1);
    const contact=snap,early=step(28);
    for(let i=0;i<600&&snap.phase!=='ready';i++)snap=step(1);
    return {resolved,contact,early,ready:snap.phase};
   },{fixture,defending});
   assert.equal(result.contact.outcome,'groundout');assert.equal(result.ready,'ready');
   assert.deepEqual(result.resolved.bases,expected.basesAfter);assert.equal(result.resolved.score,expected.runsScored);assert.equal(result.resolved.outs,expected.inningEnded?0:fixture.outs+expected.outsRecorded);
   for(const runner of expected.runnerMoves.filter(r=>r.from>0&&r.forced)){
    const route=result.early.runnerPlans.find(r=>r.from===runner.from);assert.ok(route,`Missing runner ${runner.from}`);assert.equal(route.to,runner.to);assert.equal(route.out,runner.out);
    const start=[[0,0,0],[19.4,0,-19.4],[0,0,-38.8],[-19.4,0,-19.4]][runner.from];
    assert.ok(Math.hypot(...route.position.map((v,i)=>v-start[i]))>.5,`Forced runner ${runner.from} did not leave the base`);
   }
   if(fixture.bases[0]&&!fixture.bases[1]&&fixture.bases[2]){const third=result.early.runnerPlans.find(r=>r.from===3);assert.equal(third.to,3,'A non-forced runner was pushed off third');}
  }
  // The same rules run when 3D is disabled, via the normal batting button.
  await page.locator('.game .demo3DEntry').click();
  const flat=await page.evaluate(()=>{Object.assign(state,{mode:'solo',net:false,finished:false,half:'top',inning:1,o:0,b:0,s:0,r:0,bases:[55,55,55],pick:12,swing:'contact'});Object.assign(state.batter,{p:0,a:50,e:0,v:55});render();const values=[.5,.999,.70,.999,.1,.999],random=Math.random;Math.random=()=>values.length?values.shift():.999;try{bat()}finally{Math.random=random}return {bases:state.bases,score:state.r,outs:state.o}});
  assert.deepEqual(flat,{bases:[55,0,55],score:1,outs:1});
 }
 assert.deepEqual(errors,[]);console.log('PASS: all 3 game entries; real offline batting and pitching, 1st/1st+2nd/loaded runners move together in 3D; non-forced holds, double plays, third-out no-run cases, half changes, identical runner ratings and 2D rule parity.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
