import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planPlay,BASES} from '../public/3d/play-plan.js';
import {createBattedFlight} from '../public/3d/batted-flight.js';
import {contactFeedback,playContactSound} from '../public/3d/contact-feedback.js';
import {QUALITY,initialQuality,createQualityController} from '../public/3d/render-quality.js';
import {runnerDuration,runnerProgress,planRunner} from '../public/3d/running-timing.js';
import {resolveGroundBall} from '../lib/base-running.ts';
assert.equal(initialQuality({mobile:true,cores:8,memory:8}),'medium');assert.equal(initialQuality({cores:4}),'low');
const q=createQualityController('high');for(let i=0;i<250;i++)assert.equal(q.sample(40,false),null);assert.equal(q.level,'high');assert.equal(q.sample(40,true),'medium');q.set('high');for(let i=0;i<500;i++)assert.equal(q.sample(45,true),null);assert.equal(q.level,'high');
const kinds=new Set(),speeds=[];let physical=0;
for(const outcome of ['single','double','triple','homerun','groundout','infield_flyout','outfield_flyout','foul'])for(let cell=0;cell<25;cell++)for(let i=0;i<4;i++){
 const input={outcome,key:'quality'+i,actualCell:cell,batCell:12},shot=planPlay(input),flight=createBattedFlight(shot,[0,1,0],[shot.end[0],.085,shot.end[2]]),f=contactFeedback(shot,flight);assert.deepEqual(shot,planPlay(input));assert.ok(Number.isFinite(f.speed)&&f.speed>30&&f.speed<250);assert.ok(Number.isFinite(f.angle));kinds.add(f.kind);speeds.push(f.speed);physical++;
 for(const r of shot.runs){const duration=runnerDuration(shot,r);assert.equal(runnerProgress(duration,duration),1);assert.equal(runnerProgress(0,duration),0);if(!r.out&&!r.retreat){const plan=planRunner(shot,r,[{base:r.to,time:1,action:'tag'}]);assert.equal(plan.duration,duration,'Safe runner accelerated to match an early throw');}}
}
assert.ok(kinds.size>=5);assert.ok(Math.max(...speeds)-Math.min(...speeds)>90);
assert.equal(playContactSound(null,{tone:1000}),false);assert.equal(playContactSound({state:'suspended'},{tone:1000}),false);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript');res.end(await readFile(file))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',r=>r.fulfill({contentType:'application/json',body:'{"signedIn":false}'}));
 await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,options){return get.call(this,type,/webgl/.test(type)?{...options,preserveDrawingBuffer:true}:options)};});
 await page.goto('http://127.0.0.1:'+server.address().port+'/public/3d/commentary.js');
 await page.evaluate(async()=>{document.body.style.margin='0';document.body.innerHTML='<div id="host" style="width:100vw;height:100vh"></div>';window.queue=[];requestAnimationFrame=fn=>{queue.push(fn);return 0};window.calls=[];window.s=(await import('/public/3d/scene.js')).createPitchitScene(document.getElementById('host'),(text,meta={})=>calls.push({text,meta}));s.setRoomSeed('polish');window.time=performance.now();window.step=()=>{time+=25;queue.splice(0).forEach(fn=>fn(time));return s.snapshot()};});
 const base={actualCell:12,batCell:12,pitchName:'패스트볼',speed:145};const tests=[];
 for(const [name,field,bases,dp] of [['first',{position:[16,0,-22],fielder:0},[55,0,0],0],['home',{position:[0,0,-18],fielder:1},[55,55,55],1],['second',{position:[5,0,-27],fielder:1},[55,0,0],1]]){const groundPlay=resolveGroundBall({bases,outs:0,batterSpeed:55,field,doublePlayChance:dp,random:()=>.01});tests.push({...base,key:name,outcome:'groundout',groundPlay,basesBefore:bases,basesAfter:groundPlay.basesAfter});}
 tests.push({...base,key:'tag',outcome:'single',basesBefore:[0,55,0],basesAfter:[55,0,0],runningPlay:{runnerMoves:[{from:0,to:1,out:false},{from:2,to:3,out:true,forced:false,slide:true}],throws:[3]}});
 tests.push({...base,key:'safe-double',outcome:'double',basesBefore:[0,0,0],basesAfter:[0,55,0]});
 const feet=await page.evaluate(async()=>{
   const THREE=await import('/public/3d/vendor/three.module.min.js'),{createPlayerFactory}=await import('/public/3d/player-model.js'),{locomotionPose}=await import('/public/3d/motion-blend.js');
   const rig=createPlayerFactory(new THREE.Scene()).player('#eee',0,0,'1','runner');let maxDrift=0,minHeight=10;const prior=[null,null];
   for(let n=0;n<300;n++){const d=n*.015,phase=(d/(.77/.55))%1;rig.root.position.z=d;locomotionPose(rig,d,7);rig.root.updateWorldMatrix(true,true);rig.legs.forEach((l,i)=>{const u=(phase+i*.5)%1,p=l.foot.getWorldPosition(new THREE.Vector3());minHeight=Math.min(minHeight,p.y);if(u<.5&&u>.04&&prior[i])maxDrift=Math.max(maxDrift,Math.abs(p.z-prior[i].z));prior[i]=p;});}return {maxDrift,minHeight};
  });assert.ok(feet.maxDrift<.006,'Stance foot slides: '+feet.maxDrift);assert.ok(feet.minHeight>.055);
 let checked=0;
 for(const quality of ['low','medium','high'])for(const play of tests){
  const result=await page.evaluate(({play,quality})=>{s.sync({defending:false,pick:12,bases:play.basesBefore});s.setQuality(quality);step();calls.length=0;s.play({...play,key:play.key+quality});let snap,contact=null;const events=[];let prior=null;for(let i=0;i<650;i++){snap=step();if(snap.phase==='result'){contact??=snap;if(!snap.revealed&&snap.feedback)throw Error('Early contact feedback');if(snap.defense.stage==='tag'||snap.defense.stage==='receive')events.push({age:snap.resultAge,defense:snap.defense,ball:snap.ball,runners:snap.runnerPlans});for(const r of snap.runnerPlans){if(!r.position.every(Number.isFinite))throw Error('Invalid runner position');}if(prior&&snap.resultAge<.35&&snap.feedback)throw Error('Early feedback');prior=snap;}if(snap.phase==='ready')break;}return {snap,contact,events,calls:[...calls]};},{play,quality});
  assert.equal(result.snap.phase,'ready',play.key);assert.equal(result.snap.quality.level,quality);assert.equal(result.snap.quality.shadows,Boolean(QUALITY[quality].shadow));assert.equal(result.calls.filter(c=>c.meta.impact).length,1);assert.equal(result.calls.filter(c=>c.meta.feedback).length,1);assert.ok(result.snap.feedback?.speed>30);
  assert.ok(result.contact.defense.support.some(t=>t.role.includes('백업')));assert.ok(result.contact.defense.support.every(t=>t.target.every(Number.isFinite)));
  for(const leg of result.contact.defense.throwTimes){const runner=result.contact.runnerPlans.find(r=>r.from===leg.runnerFrom);if(runner&&!runner.out)assert.ok(runner.arrival<leg.receiveAt,'Safe runner loses race');if(runner?.out&&leg.action==='force')assert.ok(runner.arrival>leg.time,'Out runner beats force');}
  if(play.key==='tag'){assert.ok(result.events.some(e=>e.defense.stage==='tag'));const e=result.events.find(e=>e.age>=e.defense.throwTimes[0].time);assert.ok(e);assert.ok(Math.hypot(...e.ball.map((n,i)=>n-e.defense.receiverGlove[i]))<.001);const runner=e.runners.find(r=>r.from===2);assert.ok(Math.hypot(e.defense.receiverGlove[0]-runner.position[0],e.defense.receiverGlove[2]-runner.position[2])<.45,'Tag missed the arriving runner');}
  if(play.key==='first'){const e=result.events.find(e=>e.age>=e.defense.throwTimes[0].time);assert.ok(e);assert.ok(Math.min(...e.defense.receiverFeet.map(p=>Math.hypot(p[0]-BASES[1][0],p[2]-BASES[1][2])))<.2,'Force out without a foot on the bag');}
  checked++;
 }
 await mkdir('outputs',{recursive:true});await page.evaluate(play=>{s.sync({defending:false,pick:12,bases:play.basesBefore});s.setQuality('high');s.play({...play,key:'polish-capture'});for(let i=0;i<180;i++){const p=step();if(p.phase==='result'&&p.resultAge>2.5)break;}},tests[1]);await page.screenshot({path:'outputs/3d-polish-defense.png'});
 // Full game UI: automatic quality only, result-only feedback and mobile controls.
 for(const entry of ['/public/game/index.html','/static/index.html','/static/game/index.html']){
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:'+server.address().port+entry);await page.evaluate(()=>{requestMatch=async()=>{throw Error('offline fixture')};start('solo')});await page.waitForFunction(()=>state.mode==='solo'&&!state.net);await page.locator('.game .demo3DEntry').click();await page.waitForFunction(()=>pitchit3D.snapshot().scene);assert.equal(await page.locator('[data-quality3d]').count(),0);assert.equal((await page.evaluate(()=>pitchit3D.snapshot().scene)).quality.mode,'auto');await page.evaluate(()=>localStorage.setItem('pitchit:3d-quality','high'));
  await page.evaluate(()=>{const raf=requestAnimationFrame;window.queue=[];requestAnimationFrame=fn=>{if(fn.name==='frame'){queue.push(fn);return 0}return raf(fn)};window.time=performance.now();window.step=n=>{for(let i=0;i<n;i++){time+=50;queue.splice(0).forEach(fn=>fn(time))}return pitchit3D.snapshot().scene;};});await page.waitForFunction(()=>queue.length>0);
  await page.evaluate(()=>{matchSession={code:'POLISH',token:'fixture',player:'p1',mode:'friend'};const base={ready:true,players:{p1:{name:'A'},p2:{name:'B'}},choiceReady:{p1:false,p2:false},game:{status:'playing',inning:1,half:0,scores:[0,0],balls:0,strikes:0,outs:0,bases:[0,0,0],batter:[0,0],deadline:Date.now()+60000,event:'준비'}};applyMatch(base);applyMatch({...base,game:{...base.game,bases:[55,0,0],lastPlay:{attacker:'p1',actualCell:12,bat:{cell:12,swing:'contact'},pitch:{cell:12},pitchName:'패스트볼',speed:145,outcome:'single',basesBefore:[0,0,0],basesAfter:[55,0,0]},event:'안타!'}});});
  assert.equal(await page.locator('.pitch3dContact').isVisible(),false);await page.evaluate(()=>{for(let i=0;i<240;i++){const s=step(1);if(s.revealed)break;}});assert.equal(await page.locator('.pitch3dContact').isVisible(),true);assert.match(await page.locator('.pitch3dContact').innerText(),new RegExp('km/h'));const rect=await page.locator('.pitch3dConfirm').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390&&rect.height>=32);await page.screenshot({path:'outputs/3d-polish-mobile.png'});
  await page.reload();await page.evaluate(()=>{requestMatch=async()=>{throw Error('offline fixture')};start('solo')});await page.waitForFunction(()=>state.mode==='solo'&&!state.net);await page.locator('.game .demo3DEntry').click();await page.waitForFunction(()=>pitchit3D.snapshot().scene);assert.equal(await page.locator('[data-quality3d]').count(),0);assert.equal((await page.evaluate(()=>pitchit3D.snapshot().scene)).quality.mode,'auto');
 }
 assert.deepEqual(errors,[]);console.log('PASS: '+physical+' contact profiles; '+checked+' base-play timelines at all quality levels; force touches, glove possession/tag, safe races, backup roles; result-only feedback, automatic mobile quality without a settings menu and three full game entries.');
}finally{await browser?.close();await new Promise(r=>server.close(r))}
