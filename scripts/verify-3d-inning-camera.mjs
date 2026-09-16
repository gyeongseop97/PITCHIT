import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {resolveGroundBall,resolveFlyBall} from '../lib/base-running.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript');res.end(await readFile(file))}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1000,height:780}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.fulfill({contentType:'application/json',body:'{"signedIn":false}'}));
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.queue=[];requestAnimationFrame=fn=>{if(fn.name==='frame'){queue.push(fn);return 0}return raf(fn)};window.step=n=>{for(let i=0;i<n;i++){time+=50;queue.splice(0).forEach(fn=>fn(time))}return pitchit3D.snapshot().scene;};});
 let cases=0;
 const entries=process.env.CAMERA_ENTRY?[process.env.CAMERA_ENTRY]:['/public/game/index.html','/static/index.html','/static/game/index.html'];
 for(const entry of entries){
  await page.goto('http://127.0.0.1:'+server.address().port+entry);await page.evaluate(()=>{requestMatch=async()=>{throw Error('offline fixture')};start('solo')});await page.waitForFunction(()=>state.mode==='solo'&&!state.net);await page.locator('.game .demo3DEntry').click();await page.waitForFunction(()=>pitchit3D.snapshot().scene);await page.evaluate(()=>window.time=performance.now());
  for(const me of ['p1','p2'])for(const half of [1,0])for(const outcome of ['swinging_strike','groundout','outfield_flyout']){
   const attacker=half?'p2':'p1',defender=half?'p1':'p2',groundPlay=outcome==='groundout'?resolveGroundBall({bases:[55,0,0],outs:2,batterSpeed:55,random:()=>.99}):undefined,runningPlay=outcome==='outfield_flyout'?resolveFlyBall({bases:[55,0,0],outs:2}):undefined;
   const result=await page.evaluate(({me,half,outcome,attacker,defender,groundPlay,runningPlay})=>{
    matchSession={code:'CAMERA_FIXTURE',token:'fixture-token',player:me,mode:'friend'};matchSubmitted=false;
    const base={ready:true,players:{p1:{name:'A'},p2:{name:'B'}},choiceReady:{p1:false,p2:false},game:{status:'playing',inning:1,half,scores:[0,0],balls:0,strikes:2,outs:2,bases:[55,0,0],batter:[0,0],deadline:Date.now()+60000,event:'투구 준비',lastPlay:null}};
    applyMatch(base);document.querySelector('[data-view3d="auto"]').click();step(1);const before=pitchit3D.snapshot().scene;
    const play={attacker,outcome,batterId:attacker+':batter:0',pitcherId:defender+':pitcher:0',actualCell:12,pitchName:'패스트볼',speed:140,strikeStyle:'looking',bat:{kind:'bat',cell:12,swing:'contact'},pitch:{kind:'pitch',cell:12,pitch:'fast'},basesBefore:[55,0,0],basesAfter:[0,0,0],outsRecorded:1,groundPlay,runningPlay,playText:outcome==='swinging_strike'?'루킹 삼진 아웃':outcome==='groundout'?'땅볼 아웃':'뜬공 아웃'};
    const next={...base,game:{...base.game,half:half?0:1,inning:half?2:1,outs:0,strikes:0,bases:[0,0,0],batter:half?[0,1]:[1,0],lastPlay:play,deadline:base.game.deadline+1000,event:'3아웃 · 공수 교대'}};
    applyMatch(next);const windup=pitchit3D.snapshot().scene;step(2);applyMatch(next);render();document.querySelector('[data-view3d="auto"]').click();const polled=pitchit3D.snapshot().scene;
    const frames=[];let snap=step(1),toggled=false;
    for(let i=0;i<250;i++){snap=step(1);if(snap.phase==='ready')break;frames.push({phase:snap.phase,camera:snap.camera,uniforms:snap.uniforms,ids:snap.playerIds,revealed:snap.revealed});if(!toggled&&snap.phase==='result'){document.querySelector('[data-follow3d]').click();document.querySelector('[data-view3d="auto"]').click();toggled=true;}}
    return {before,windup,polled,frames,after:snap,expected:me!==attacker?'pitcher':'batter'};
   },{me,half,outcome,attacker,defender,groundPlay,runningPlay});
   const label=entry+' '+me+' half='+half+' '+outcome;
   assert.equal(result.before.camera,result.expected,label+' setup');assert.equal(result.windup.camera,result.expected,label+' reveals the third out at windup');assert.equal(result.polled.camera,result.expected,label+' poll/auto leaked the next half');
   assert.deepEqual(result.windup.uniforms,result.before.uniforms,label+' uniform spoiler');
   for(const f of result.frames){assert.equal(f.camera,result.expected,label+' changed camera during '+f.phase);assert.deepEqual(f.uniforms,result.before.uniforms,label+' changed uniforms early');assert.deepEqual(f.ids,result.windup.playerIds,label+' changed players early');}
   assert.equal(result.after.phase,'ready');assert.equal(result.after.camera,result.expected==='pitcher'?'batter':'pitcher',label+' did not change after completion');assert.equal(result.after.uniforms.batter,result.before.uniforms.pitcher);cases++;
  }
  // Offline third strikes use the same frozen presentation while finishAtBat switches sides.
  for(const defending of [false,true]){
   const r=await page.evaluate(defending=>{matchSession=null;matchSubmitted=false;Object.assign(state,{mode:'solo',net:false,finished:false,half:defending?'bottom':'top',inning:1,o:2,b:0,s:2,r:0,away:0,bases:[0,0,0],pick:defending?12:24,swing:'spot',pitchType:'fast'});Object.assign(state.batter,{e:0});render();document.querySelector('[data-view3d="auto"]').click();step(1);const before=pitchit3D.snapshot().scene,random=Math.random,values=defending?[.5,.99,0]:[0,.99,.99];Math.random=()=>values.length?values.shift():.99;try{if(defending)pitch();else bat();}finally{Math.random=random;}const windup=pitchit3D.snapshot().scene;let after;for(let i=0;i<180;i++){after=step(1);if(after.phase==='ready')break;}return {before,windup,after,half:state.half};},defending);
   assert.equal(r.windup.camera,defending?'pitcher':'batter');assert.deepEqual(r.windup.uniforms,r.before.uniforms);assert.equal(r.half,defending?'top':'bottom');assert.equal(r.after.camera,defending?'batter':'pitcher');cases++;
  }
  console.log('PASS: '+entry+' inning-ending camera holds');
 }
 assert.deepEqual(errors,[]);console.log('PASS: '+cases+' third-out presentations; both network players and halves, strikeout/ground/fly outs, polling, auto/follow controls, uniforms, player identities and offline third strikes.');
}finally{await browser?.close();await new Promise(r=>server.close(r))}
