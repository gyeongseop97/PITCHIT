/** Resolved-ball physics and consecutive-play handedness regressions. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {planPlay} from '../public/3d/play-plan.js';
import {createBattedFlight,sampleBattedFlight} from '../public/3d/batted-flight.js';

let count=0;const profiles=new Set();
for(const outcome of ['single','double','triple','homerun','groundout','double_play','infield_flyout','outfield_flyout','foul'])for(let cell=0;cell<25;cell++)for(let seed=0;seed<8;seed++){
 const shot=planPlay({key:'motion'+seed,outcome,actualCell:cell,batCell:12,batHand:seed%2?'L':'R'});
 const start=[(cell%5-2)*.112,1.27-Math.floor(cell/5)*.146,0],end=[shot.end[0],shot.fly?1.4:.085,shot.end[2]],flight=createBattedFlight(shot,start,end);
 assert.deepEqual(sampleBattedFlight(flight,0),start);
 assert.ok(Math.hypot(...sampleBattedFlight(flight,shot.catchAt).map((v,i)=>v-end[i]))<1e-8);
 for(let i=0;i<=100;i++){const point=sampleBattedFlight(flight,shot.catchAt*i/100);assert.ok(point.every(Number.isFinite));assert.ok(point[1]>=.0849,'Ball went underground');}
 if(shot.flight.rollTime){
  const t=shot.flight.airTime,dt=.0001,a=sampleBattedFlight(flight,t-dt),b=sampleBattedFlight(flight,t),c=sampleBattedFlight(flight,t+dt);
  const before=Math.hypot(b[0]-a[0],b[2]-a[2])/dt,after=Math.hypot(c[0]-b[0],c[2]-b[2])/dt;
  assert.ok(Math.abs(before-after)<.03,'Horizontal speed jumps at the bounce');
 }
 if(shot.home){let lo=0,hi=shot.catchAt;for(let i=0;i<30;i++){const t=(lo+hi)/2,p=sampleBattedFlight(flight,t);if(Math.hypot(p[0],p[2])<100)lo=t;else hi=t}assert.ok(sampleBattedFlight(flight,hi)[1]>3.385,'Home run hits the wall');}
 if(outcome==='double'||outcome==='triple')assert.ok(shot.flight.exitSpeed>=39,'Extra-base hit lacks initial pace');
 profiles.add(shot.flight.type);count++;
}
assert.ok(profiles.size>=7);

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const server=createServer(async(req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204).end();return}try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}res.setHeader('Content-Type','text/javascript');res.end(await readFile(file))}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:900,height:640}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(`http://127.0.0.1:${server.address().port}/3d/commentary.js`);
 await page.evaluate(async()=>{
  document.body.style.margin='0';document.body.innerHTML='<div id="host" style="width:100vw;height:100vh"></div>';
  window.queue=[];requestAnimationFrame=fn=>{queue.push(fn);return 0};
  const {createPitchitScene}=await import('/3d/scene.js');window.planPlay=(await import('/3d/play-plan.js')).planPlay;
  window.s=createPitchitScene(document.getElementById('host'));window.time=performance.now();
  window.step=()=>{time+=25;queue.splice(0).forEach(fn=>fn(time));return s.snapshot()};
 });
 const combinations=new Set();let maxGripError=0;
 for(let seed=0;seed<8;seed++){
  const result=await page.evaluate(seed=>{
   s.reset();s.setRoomSeed('form'+seed);s.sync({defending:false,pick:12});step();
   const initial=s.snapshot(),sign=initial.handedness.bat==='L'?-1:1;
   // A first baseman fields the ball; the pitcher covers first, then pitches again.
   let play;for(let i=0;i<1000;i++){const candidate={key:'cover'+i,outcome:'groundout',actualCell:4,batCell:4,batHand:initial.handedness.bat,speed:145},p=planPlay(candidate);if(p.angle>.66){play=candidate;break}}
   if(!play)throw Error('No cover-first fixture');s.play(play);
   let beforeTakeoff=0,takeoff=false,covered=false,maximum=0,previous=null;
   for(let i=0;i<600;i++){
    const snap=step();
    if(snap.battingMirror!==sign)throw Error('Batter changed sides during the play');
    if(snap.phase==='windup'&&Math.abs(snap.pitcherYaw)>1e-8)throw Error('Pitcher faces sideways');
    if(snap.phase==='result'&&snap.batterVisible){
     beforeTakeoff++;
     const error=Math.max(...snap.players.batter.hands.map((p,index)=>Math.hypot(...p.map((v,j)=>v-(index?snap.batTopHandWorld:snap.batGripWorld)[j]))));maximum=Math.max(maximum,error);
     if(Math.sign(snap.batterPosition[0])!==-sign)throw Error('Batter moved to the other box');
    }
    if(snap.runnerVisible&&!takeoff){takeoff=true;if(snap.runnerMirror!==sign)throw Error('Runner handedness changed');if(previous&&Math.hypot(...snap.runnerPosition.map((v,j)=>v-previous.batterPosition[j]))>.3)throw Error('Runner teleported out of the box');}
    if(snap.defense.receiver==='투수'&&snap.defense.stage==='receive')covered=true;
    previous=snap;if(snap.phase==='ready')break;
   }
   const end=s.snapshot();if(!covered||!takeoff||beforeTakeoff<8)throw Error('Missing field/swing/run transition');
   if(end.phase!=='ready'||Math.abs(end.pitcherYaw)>1e-8||end.runnerVisible)throw Error('Play did not restore the ready pose');
   s.play({key:'next'+seed,outcome:'swinging_strike',strikeStyle:'looking',actualCell:12,speed:140});
   for(let i=0;i<55;i++){const next=step();if(Math.abs(next.pitcherYaw)>1e-8)throw Error('Pitcher retained a fielding rotation on the next pitch');}
   return {hands:initial.handedness,maximum};
  },seed);
  combinations.add(JSON.stringify(result.hands));maxGripError=Math.max(maxGripError,result.maximum);
 }
 for(const handedness of ['L','R']){
  const error=await page.evaluate(handedness=>{
   for(let i=0;i<8;i++){s.reset();s.setRoomSeed('form'+i);if(s.snapshot().handedness.bat===handedness)break;}s.sync({defending:false,pick:12});let maximum=0;
   for(let cell=0;cell<25;cell++){
    s.play({key:'all-cells'+cell,outcome:'single',actualCell:cell,batCell:cell,speed:150});
    for(let i=0;i<85;i++){const snap=step();if(snap.phase==='result'&&snap.batterVisible){maximum=Math.max(maximum,...snap.players.batter.hands.map((p,index)=>Math.hypot(...p.map((v,j)=>v-(index?snap.batTopHandWorld:snap.batGripWorld)[j]))));}if(snap.runnerVisible)break;}
   }return maximum;
  },handedness);maxGripError=Math.max(maxGripError,error);
 }
 assert.equal(combinations.size,4);assert.ok(maxGripError<.01,`Hands detached from bat by ${maxGripError.toFixed(3)}m`);assert.deepEqual(errors,[]);
 console.log(`PASS: ${count} continuous ball paths, ${profiles.size} flight styles, realistic initial pace and bounce speed, home-run fence clearance; all 4 handedness combinations retain their side through swing/run and pitcher cover-first/next-pitch sequences. Max grip error ${maxGripError.toFixed(3)}m.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
