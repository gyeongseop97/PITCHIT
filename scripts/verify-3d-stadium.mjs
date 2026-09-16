/** Rendering, phone targeting and presentation timing regression. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const server=createServer(async(req,res)=>{if(req.url==='/favicon.ico'){res.writeHead(204).end();return}try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}res.setHeader('Content-Type','text/javascript');res.end(await readFile(file))}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const p=await browser.newPage({viewport:{width:390,height:477}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.goto(`http://127.0.0.1:${server.address().port}/3d/commentary.js`);
 await p.evaluate(async()=>{document.body.style.margin='0';document.body.innerHTML='<div id="host" style="width:100vw;height:100vh"></div>';window.queue=[];requestAnimationFrame=fn=>{queue.push(fn);return 0};const {createPitchitScene}=await import('/3d/scene.js');window.picked=null;window.s=createPitchitScene(document.getElementById('host'),()=>{},cell=>picked=cell);window.time=performance.now();window.step=n=>{for(let i=0;i<n;i++){time+=25;queue.splice(0).forEach(fn=>fn(time))}return s.snapshot()};s.setRoomSeed('STADIUM');s.sync({defending:true,pick:12});step(2);});
 const initial=await p.evaluate(()=>s.snapshot());assert.equal(initial.stadium.dugouts,2);assert.ok(initial.stadium.sections>=24);assert.ok(initial.stadium.seats>4000);
 const clearsFence=await p.evaluate(async()=>{const {planPlay}=await import('/3d/play-plan.js');const park=s.snapshot().stadium;return Array.from({length:60},(_,i)=>{const shot=planPlay({key:'wall'+i,outcome:'homerun',actualCell:i%25}),u=park.outfieldRadius/shot.distance;return Math.sin(u*Math.PI)*shot.apex>park.wallHeight+.085}).every(Boolean)});assert.ok(clearsFence,'Home runs must clear the new fence');
 for(const [width,height] of [[320,477],[390,477],[390,580],[1280,720]]){
  await p.setViewportSize({width,height});await p.waitForTimeout(60);
  for(const seed of ['form0','form1','form2','form3']){
   const snap=await p.evaluate(seed=>{s.setRoomSeed(seed);s.setCamera('pitcher');return step(2)},seed);
   const gap=Math.abs(snap.zoneCells[0].x-snap.zoneCells[1].x)*width;assert.ok(gap>=24,`Only ${gap}px between phone columns`);
   for(const cell of snap.zoneCells){assert.ok(cell.x>.05&&cell.x<.95&&cell.y>.22&&cell.y<.72);await p.mouse.click(cell.x*width,cell.y*height);assert.equal(await p.evaluate(()=>picked),cell.cell)}
  }
 }
 for(const view of ['batter','pitcher','side','broadcast','catcher'])await p.evaluate(view=>{s.setCamera(view);step(2)},view);
 for(const theme of ['classic','night','retro','neon'])await p.evaluate(theme=>{s.sync({defending:true,pick:12,shop:{equippedTheme:theme}});step(2)},theme);
 const timing=await p.evaluate(()=>{s.reset();s.sync({defending:true});s.play({key:'pacing',outcome:'swinging_strike',strikeStyle:'looking',text:'루킹 스트라이크',actualCell:12,speed:140});let elapsed=0,last='windup',release,arrival;let snap=s.snapshot();while(elapsed<3&&snap.phase!=='ready'){snap=step(1);elapsed+=.025;if(last==='windup'&&snap.phase==='flight')release=elapsed;if(last==='catch'&&snap.phase==='result'){arrival=elapsed;if(snap.history.length!==1||snap.effectOpacity<=0)throw Error('Missing glove reveal');}if(snap.phase==='flight'||snap.phase==='catch'){if(snap.history.length||snap.effectOpacity>0)throw Error('Result spoiled before catch');}last=snap.phase;}return{release,arrival,elapsed,snap};});
 assert.ok(timing.release<.91);assert.ok(timing.arrival>timing.release+.47);assert.ok(timing.elapsed<2.5);assert.equal(timing.snap.phase,'ready');assert.deepEqual(errors,[]);
 console.log('PASS: closed 28-section stadium; all cameras/themes compile without WebGL errors; 25 cells clickable with >=24px column spacing at 320px, 390px and desktop; faster delivery/return preserves catch-before-result timing.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
