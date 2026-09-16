import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {resolveGroundBall,resolveWalk,resolveFlyBall} from '../lib/base-running.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}res.setHeader('Content-Type','text/javascript');res.end(await readFile(file))}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const scenarios=[];
for(const [name,field,bases,outs,dp] of [
 ['first',{position:[16,0,-22],fielder:0,strategy:''},[55,55,55],0,0],
 ['second-double',{position:[5,0,-27],fielder:1,strategy:''},[55,55,55],0,1],
 ['third-double',{position:[-19,0,-20],fielder:3,strategy:''},[55,55,0],0,1],
 ['home-double',{position:[0,0,-18],fielder:1,strategy:''},[55,55,55],0,1],
 ['third-out',{position:[0,0,-18],fielder:1,strategy:''},[55,55,55],2,0]]){
 const groundPlay=resolveGroundBall({bases,outs,batterSpeed:55,doublePlayChance:dp,field,contact:{actualCell:12,batCell:12,defenseLead:0},random:()=>.1});scenarios.push({key:name,outcome:'groundout',groundPlay,basesBefore:bases,basesAfter:groundPlay.basesAfter});
}
for(const outs of [0,2]){const runningPlay=resolveFlyBall({bases:[55,55,55],outs,random:()=>0});scenarios.push({key:'fly'+outs,outcome:'outfield_flyout',runningPlay,basesBefore:[55,55,55],basesAfter:runningPlay.basesAfter});}
const walking=resolveWalk({bases:[0,62,83],batterSpeed:55});scenarios.push({key:'walk',outcome:'walk',runningPlay:walking,basesBefore:[0,62,83],basesAfter:walking.basesAfter});
for(const [outcome,basesAfter] of [['single',[55,0,0]],['double',[0,55,0]],['triple',[0,0,55]],['homerun',[0,0,0]],['foul',[0,0,0]]])scenarios.push({key:outcome,outcome,basesBefore:[0,0,0],basesAfter});
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:1000,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/3d/commentary.js');
 await page.evaluate(async()=>{document.body.style.margin='0';document.body.innerHTML='<div id="host" style="width:100vw;height:100vh"></div>';window.queue=[];requestAnimationFrame=fn=>{queue.push(fn);return 0};window.calls=[];window.s=(await import('/3d/scene.js')).createPitchitScene(document.getElementById('host'),(text,meta={})=>calls.push({at:window.s?.snapshot().resultAge||0,text,meta}));window.time=performance.now();window.step=()=>{time+=25;queue.splice(0).forEach(fn=>fn(time));return s.snapshot()};s.setRoomSeed('situation-2026');});
 let checks=0,fitChecks=0;
 for(const width of [1000,390]){
  await page.setViewportSize({width,height:width===390?740:760});
  for(const play of scenarios){
   const r=await page.evaluate(play=>{
    calls.length=0;const ids={batterId:'p1:batter:4',pitcherId:'p2:pitcher:2'};s.sync({...ids,bases:play.basesBefore,pick:12,defending:false});step();
    const before=s.snapshot();s.play({...play,...ids,key:play.key+':'+innerWidth,actualCell:12,batCell:12,speed:145,pitchName:'패스트볼'});s.sync({...ids,bases:play.basesAfter,pick:null,defending:false,pending:true});
    let snap,contact=null,firstReveal=null,maxEarly=0,fit=[],poses=[];
    for(let i=0;i<650;i++){
     snap=step();if(snap.phase==='result'){
      contact??=snap;if(snap.revealed&&!firstReveal)firstReveal=snap;
      if(snap.handedness.bat!==before.handedness.bat||snap.handedness.pitch!==before.handedness.pitch)throw Error('Mid-play handedness changed');
      if(snap.resultAge<.7&&snap.trajectory.contact)maxEarly=Math.max(maxEarly,snap.history.length-before.history.length);
      if(snap.following&&snap.resultAge>.7)fit.push(snap.framing);
      if(snap.resultAge>.6&&snap.resultAge<.7)poses.push(snap.runnerPlans);
     }
     if(snap.phase==='ready')break;
    }
    return {phase:snap.phase,contact,firstReveal,maxEarly,calls:[...calls],fit,poses,profiles:snap.profiles};
   },play);
   assert.equal(r.phase,'ready',play.key+' did not finish');assert.ok(r.firstReveal,play.key+' missing final result');
   assert.equal(r.calls.filter(c=>c.meta.reveal).length,1,'Final result repeated');
   if(play.groundPlay){assert.equal(r.contact.revealed,false);assert.ok(r.firstReveal.resultAge>=r.contact.defense.throwTimes.at(-1).time);if(play.groundPlay.kind==='double_play'){const outCalls=r.calls.filter(c=>c.meta.commentary?.title.includes('에서 아웃'));assert.ok(outCalls.length>=1);assert.ok(outCalls[0].at>=r.contact.defense.throwTimes[0].time);}}
   if(play.outcome==='outfield_flyout'){assert.ok(r.firstReveal.resultAge>=r.contact.defense.catchAt);if(play.runningPlay.inningEnded)assert.ok(r.contact.runnerPlans.filter(p=>p.from).every(p=>p.stopAt===r.contact.defense.catchAt));}
   if(['single','double','triple'].includes(play.outcome)){const batter=r.contact.runnerPlans.find(p=>p.from===0);assert.ok(r.firstReveal.resultAge>=batter.delay+batter.duration);}
   if(play.outcome==='walk')assert.equal(r.contact.umpireCall,false);
   for(const points of r.fit)for(const p of points){assert.ok(p.every(Number.isFinite));if(Math.abs(p[0])<=1&&Math.abs(p[1])<=1)fitChecks++;}
   checks++;
  }
 }
 await mkdir('outputs',{recursive:true});
 const imagePlay=scenarios.find(p=>p.key==='home-double');
 await page.setViewportSize({width:1100,height:800});
 await page.evaluate(play=>{s.sync({batterId:'p1:batter:4',pitcherId:'p2:pitcher:2',bases:play.basesBefore,defending:false,pick:12});s.play({...play,key:'capture',actualCell:12,batCell:12,speed:140});for(let i=0;i<150;i++){const p=step();if(p.phase==='result'&&p.resultAge>1.5)break;}},imagePlay);
 await page.screenshot({path:'outputs/situation-home-defense.png'});
 assert.deepEqual(errors,[]);assert.ok(fitChecks>200);console.log('PASS: '+checks+' 3D plays across desktop/mobile; timed outs and safe calls, no contact-time spoilers, home/third/second double plays, walk holds, tag-up/third-out running, fixed handedness and camera framing.');
}finally{await browser?.close();await new Promise(r=>server.close(r))}
