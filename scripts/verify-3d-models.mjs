/** Exercise the actual skinned players and role cameras without network play. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../public/',import.meta.url));
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root)){res.writeHead(403).end();return}res.setHeader('Content-Type','text/javascript');res.end(await readFile(file))}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:580}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/3d/commentary.js`);
 const geometry=await page.evaluate(async()=>{
  const T=await import('/3d/vendor/three.module.min.js'),{createPlayerFactory}=await import('/3d/player-model.js'),{reachHand,plantFoot}=await import('/3d/rig-poses.js');
  const scene=new T.Scene(),{player}=createPlayerFactory(scene),p=player('#af4433',0,0,'17'),g=p.bodyMesh.geometry,weights=g.getAttribute('skinWeight'),indices=g.getAttribute('skinIndex');let blends=0;
  for(let i=0;i<weights.count;i++){const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i);if(Math.abs(sum-1)>1e-6)throw Error('Unnormalized weights');if(indices.getX(i)>=p.bodyMesh.skeleton.bones.length||indices.getY(i)>=p.bodyMesh.skeleton.bones.length)throw Error('Invalid bone');if(weights.getY(i)>0&&weights.getY(i)<1)blends++;}
  for(const sign of [1,-1]){p.root.scale.x=sign;p.root.rotation.y=.63;p.hip.position.y=.60;plantFoot(p,0,new T.Vector3(.26,.08,.1));plantFoot(p,1,new T.Vector3(-.26,.08,.1));const target=p.root.localToWorld(new T.Vector3(-.35,1.24,.31));reachHand(p.right,target);p.root.updateMatrixWorld(true);p.bodyMesh.skeleton.update();if(p.right.hand.getWorldPosition(new T.Vector3()).distanceTo(target)>.01)throw Error('Hand detached');for(let i=0;i<g.getAttribute('position').count;i++){const v=p.bodyMesh.getVertexPosition(i,new T.Vector3());if(!v.toArray().every(Number.isFinite)||v.length()>3)throw Error('Exploded skin');}for(const leg of p.legs){if(Math.abs(leg.foot.getWorldPosition(new T.Vector3()).y-.08)>.005)throw Error('Unplanted foot');}}
  return {blends,bones:p.bodyMesh.skeleton.bones.length};
 });assert.ok(geometry.blends>150);assert.equal(geometry.bones,15);
 await page.evaluate(async()=>{document.body.style.margin='0';document.body.innerHTML='<div id="host" style="width:100vw;height:100vh"></div>';window.time=performance.now();window.queue=[];requestAnimationFrame=fn=>{queue.push(fn);return 0};const {createPitchitScene}=await import('/3d/scene.js');window.picks=[];window.s=createPitchitScene(document.getElementById('host'),()=>{},cell=>picks.push(cell));window.step=n=>{for(let i=0;i<n;i++){time+=50;queue.splice(0).forEach(fn=>fn(time))}return s.snapshot()};});
 const hands=new Set();
 for(const seed of ['form0','form1','form2','form3','form4','form5','form6','form7']){
  await page.evaluate(seed=>{s.reset();s.setRoomSeed(seed);s.sync({defending:false,pick:12});step(2)},seed);
  hands.add(await page.evaluate(()=>JSON.stringify(s.snapshot().handedness)));
  for(const defending of [false,true]){
   const start=await page.evaluate(defending=>{s.setCamera('auto');s.sync({defending,pick:12});return step(2)},defending);
   assert.equal(start.camera,defending?'pitcher':'batter');assert.equal(start.modelRig,'skinned-baseball-v1');
   assert.ok(start.zoneCells.every(c=>c.visible&&c.x>.08&&c.x<.92&&c.y>.2&&c.y<.7));
   assert.ok(start.players.batter.feet.every(p=>Math.abs(p[1]-.08)<.006));
   assert.ok(start.players.catcher.feet.every(p=>Math.abs(p[1]-.08)<.006));
   for(const c of start.zoneCells){await page.mouse.click(c.x*390,c.y*580);assert.equal(await page.evaluate(()=>picks.at(-1)),c.cell)}
   const motion=await page.evaluate(({defending,seed})=>{s.play({key:seed+defending,outcome:'swinging_strike',text:'루킹 스트라이크',strikeStyle:'looking',actualCell:12,batCell:12,speed:140});const windup=step(10),flight=step(14);let ready=flight;for(let i=0;i<90&&ready.phase!=='ready';i++)ready=step(1);return{windup,flight,ready}},{defending,seed});
   assert.equal(motion.windup.phase,'windup');assert.ok(Math.hypot(...motion.windup.ball.map((v,i)=>v-motion.windup.players.pitcher.hands[1][i]))<.001);
   assert.equal(motion.flight.phase,'flight');assert.deepEqual(motion.windup.cameraPosition,start.cameraPosition);assert.deepEqual(motion.flight.cameraPosition,start.cameraPosition);assert.equal(motion.ready.camera,start.camera);assert.equal(motion.ready.phase,'ready');
  }
 }
 assert.equal(hands.size,4);assert.deepEqual(errors,[]);
 console.log(`PASS: ${geometry.bones} bones, ${geometry.blends} blended vertices, mirrored IK, attached hands/planted feet, finite skinned geometry; all four throwing/batting hand combinations; both role cameras keep all 25 cells clickable and stay fixed through delivery.`);
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve))}
