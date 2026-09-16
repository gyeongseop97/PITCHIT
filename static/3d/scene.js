import * as THREE from './vendor/three.module.min.js';
import {describePlay,pitchLocation} from './commentary.js';
import {BASES,planPlay} from './play-plan.js';
import {createDefense} from './defense.js';
import {createPlayerFactory} from './player-model.js';
import {cameraFrame} from './camera-framing.js';
import {reachHand,plantFoot} from './rig-poses.js';
import {createStadium} from './stadium.js';
import {TIMING} from './presentation-timing.js';
// Presentation only: receives resolved PITCHIT plays and never decides an outcome.
export function createPitchitScene(host,onStatus=()=>{},onPick=()=>{}) {
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=THREE.MathUtils.lerp;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setSize(Math.max(1,host.clientWidth),Math.max(1,host.clientHeight));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
host.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#9ea99b');scene.fog=new THREE.Fog('#c1d7d7',90,230);
const camera=new THREE.PerspectiveCamera(45,Math.max(1,host.clientWidth)/Math.max(1,host.clientHeight),.08,280);
const ambient=new THREE.HemisphereLight('#f4edcf','#345543',2.2);scene.add(ambient);
const sun=new THREE.DirectionalLight('#fff0c3',3.2);sun.position.set(-28,45,22);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-38;sun.shadow.camera.right=38;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-45;sun.shadow.camera.far=120;sun.shadow.normalBias=.04;sun.target.position.set(0,0,-15);scene.add(sun,sun.target);
const materials={};
function mat(color,roughness=.8){return materials[color]??=new THREE.MeshStandardMaterial({color,roughness});}
function mesh(geo,color,parent=scene){const m=new THREE.Mesh(geo,typeof color==='string'?mat(color):color);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,color,x,y,z,parent=scene){const m=mesh(new THREE.BoxGeometry(w,h,d),color,parent);m.position.set(x,y,z);return m;}
function sphere(radius,color,x,y,z,parent=scene){const m=mesh(new THREE.SphereGeometry(radius,20,12),color,parent);m.position.set(x,y,z);return m;}
function cylinder(top,bottom,height,color,x,y,z,parent=scene,segments=24){const m=mesh(new THREE.CylinderGeometry(top,bottom,height,segments),color,parent);m.position.set(x,y,z);return m;}
function line(points,color='#eee6c9',opacity=1,parent=scene){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const l=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));parent.add(l);return l;}
function flatShape(points,color,height=.015){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();const m=mesh(new THREE.ShapeGeometry(s),color);m.rotation.x=-Math.PI/2;m.position.y=height;return m;}
// One world unit is one metre. Home plate is the origin, mound is 18.44m away.
const turfCanvas=document.createElement('canvas');turfCanvas.width=turfCanvas.height=1024;const ctx=turfCanvas.getContext('2d');ctx.fillStyle='#58734c';ctx.fillRect(0,0,1024,1024);for(let y=0;y<1024;y+=64){ctx.fillStyle=y%128===0?'#557249':'#628054';ctx.fillRect(0,y,1024,64)}
const turfTexture=new THREE.CanvasTexture(turfCanvas);turfTexture.colorSpace=THREE.SRGBColorSpace;turfTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
const dirtCanvas=document.createElement('canvas');dirtCanvas.width=dirtCanvas.height=128;const dirtCtx=dirtCanvas.getContext('2d'),dirtPixels=dirtCtx.createImageData(128,128);let grain=73471;
for(let i=0;i<dirtPixels.data.length;i+=4){grain=Math.imul(grain,1664525)+1013904223|0;const light=216+(grain>>>24)%40;dirtPixels.data[i]=light;dirtPixels.data[i+1]=light;dirtPixels.data[i+2]=light;dirtPixels.data[i+3]=255;}dirtCtx.putImageData(dirtPixels,0,0);
const dirtTexture=new THREE.CanvasTexture(dirtCanvas);dirtTexture.wrapS=dirtTexture.wrapT=THREE.RepeatWrapping;dirtTexture.repeat.set(.6,.6);dirtTexture.colorSpace=THREE.SRGBColorSpace;for(const color of ['#bf9771','#bd9270','#c8a280'])mat(color).map=dirtTexture;
const ground=mesh(new THREE.PlaneGeometry(210,210),new THREE.MeshStandardMaterial({map:turfTexture,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.z=-42;ground.castShadow=false;
flatShape([[0,5],[27,-20],[0,-46],[-27,-20]],'#bf9771',.025);
flatShape([[0,-5],[14.6,-20],[0,-35],[-14.6,-20]],'#5c784f',.04);
cylinder(2.7,2.9,.22,'#bd9270',0,.1,-18.44);cylinder(4.1,4.1,.02,'#c8a280',0,.042,0);
box(.61,.035,.15,'#f2e7d3',0,.24,-18.44);
flatShape([[-.216,-.22],[.216,-.22],[.216,.0],[0,.216],[-.216,0]],'#fff2d7',.071);
for(const [x,z] of [[19.4,-19.4],[-19.4,-19.4],[0,-38.8]]){const b=box(.38,.12,.38,'#f7f0dd',x,.1,z);b.rotation.y=Math.PI/4}
line([[-72,.07,-72],[0,.07,0],[72,.07,-72]],'#f7ecd3');
for(const x of [-.85,.85])line([[x-.3,.075,-.75],[x+.3,.075,-.75],[x+.3,.075,.7],[x-.3,.075,.7],[x-.3,.075,-.75]],'#e7d7bc');
const stadium=createStadium(scene);
const {player,createGlove}=createPlayerFactory(scene);
const pitcher=player('#9d4336',0,-18.44,'17','pitcher');pitcher.root.position.y=.22;
const glove=createGlove(pitcher.left.hand);
const batter=player('#eee7d4',-.82,.05,'09','batter');batter.root.rotation.y=Math.PI/2;
const battingRig=new THREE.Group();scene.add(battingRig);battingRig.add(batter.root);
let pitchSign=1,batSign=1;
function randomizeHands(seed){let bits;if(typeof seed==='string'){let hash=2166136261;for(const c of seed)hash=Math.imul(hash^c.charCodeAt(0),16777619);bits=new Uint8Array([hash,hash>>>8]);}else bits=crypto.getRandomValues(new Uint8Array(2));pitchSign=bits[0]&1?-1:1;batSign=bits[1]&1?-1:1;pitcher.root.scale.x=pitchSign;pitcher.badge.scale.x=pitchSign;batter.badge.scale.x=batSign;battingRig.scale.x=batSign;}
randomizeHands();
let teamColors=['#ece1bb','#9d4336'],teamSeed='';
function seedTeams(seed){teamSeed=String(seed);let h=0;for(const c of String(seed))h=Math.imul(h,31)+c.charCodeAt(0)|0;const pairs=[['#f2dfb3','#254b80'],['#78c6ba','#913c53'],['#e8b84b','#524876'],['#e8ddd5','#1e685c'],['#e58e68','#345578'],['#8db4df','#843a30']];teamColors=pairs[(h>>>0)%pairs.length];}
seedTeams(crypto.getRandomValues(new Uint32Array(1))[0]);
function uniformTeams(attack){const a=teamColors[attack?1:0],d=teamColors[attack?0:1];batter.setUniform(a);runners.forEach(r=>r.setUniform(a));pitcher.setUniform(d);catcher.setUniform(d);defense.setUniform(d);}
// A helmet and a pivoted bat keep the hitter readable in every view.
const batPivot=new THREE.Group();battingRig.add(batPivot);
const bat=mesh(new THREE.LatheGeometry([new THREE.Vector2(.022,-.06),new THREE.Vector2(.015,0),new THREE.Vector2(.017,.18),new THREE.Vector2(.023,.32),new THREE.Vector2(.038,.55),new THREE.Vector2(.043,.77),new THREE.Vector2(.038,.84),new THREE.Vector2(0,.855)],20),'#dbc193',batPivot);
sphere(.033,'#704b2c',0,-.055,0,batPivot);
const defense=createDefense({THREE,player,createGlove,scene,pitcher});
defense.setHands(teamSeed);
const umpire=player('#26303c',0,2.15,'U','umpire');umpire.root.rotation.y=Math.PI;
const catcher=player('#263c39',0,1.45,'02','catcher');const catcherGlove=createGlove(catcher.left.hand,true);
function resetCatcher(){
 catcher.root.scale.x=1;catcher.root.position.set(0,0,1.45);catcher.root.rotation.y=Math.PI;catcher.hip.position.set(0,.48,0);catcher.hip.rotation.set(0,0,0);catcher.torso.rotation.set(.16,0,0);catcher.head.rotation.set(-.12,0,0);
 plantFoot(catcher,0,new THREE.Vector3(.255,.08,.10));plantFoot(catcher,1,new THREE.Vector3(-.255,.08,.10));
 reach(catcher.left,catcher.root.localToWorld(new THREE.Vector3(.05,.84,.43)));reach(catcher.right,catcher.root.localToWorld(new THREE.Vector3(-.15,.69,.26)));
}
resetCatcher();
defense.setCatcher(catcher);
const visibleMitt=catcherGlove.clone();scene.add(visibleMitt);visibleMitt.visible=false;
// A real sphere with raised red seams, rather than a flat sprite.
const ball=new THREE.Group();scene.add(ball);
let ballColor='#f9f4dc',seamColor='#b64032';

sphere(.085,new THREE.MeshStandardMaterial({color:ballColor,roughness:.44,emissive:ballColor,emissiveIntensity:.1}),0,0,0,ball);
for(const sign of [-1,1]){const pts=[];for(let i=0;i<=64;i++){const t=i/64*Math.PI*2;pts.push(new THREE.Vector3(sign*.038+.019*Math.cos(2*t),.07*Math.sin(t),.07*Math.cos(t)).normalize().multiplyScalar(.086))}mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts,true),64,.0028,4,true),seamColor,ball);}
const trailPoints=Array.from({length:12},()=>new THREE.Vector3());const trailGeometry=new THREE.BufferGeometry().setFromPoints(trailPoints);
trailGeometry.setAttribute('alpha',new THREE.Float32BufferAttribute(trailPoints.map((_,i)=>(1-i/(trailPoints.length-1))**1.6),1));
const trail=new THREE.Line(trailGeometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{color:{value:new THREE.Color('#fff3ce')}},vertexShader:'attribute float alpha;varying float opacity;void main(){opacity=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform vec3 color;varying float opacity;void main(){gl_FragColor=vec4(color,opacity*0.7);}'}));scene.add(trail);trail.visible=false;
const zone=new THREE.Group();scene.add(zone);
const zoneCells=[];
const rangeBorders=[];
for(let cell=0;cell<25;cell++){
 const tile=mesh(new THREE.PlaneGeometry(.108,.142),new THREE.MeshBasicMaterial({color:'#dce7d4',transparent:true,opacity:.17,side:THREE.DoubleSide,depthWrite:false}),zone);
 tile.position.set((cell%5-2)*.112,1.27-Math.floor(cell/5)*.146,.06);tile.userData.cell=cell;tile.castShadow=false;tile.receiveShadow=false;zoneCells.push(tile);
 const border=line([[-.05,-.066,.002],[.05,-.066,.002],[.05,.066,.002],[-.05,.066,.002],[-.05,-.066,.002]],'#8af6ff',1,tile);border.visible=false;rangeBorders.push(border);
}
for(let i=0;i<=5;i++){
 line([[-.28+i*.112,.613,.062],[-.28+i*.112,1.343,.062]],'#e6f6c2',.85,zone);
 line([[-.28,.613+i*.146,.062],[.28,.613+i*.146,.062]],'#e6f6c2',.85,zone);
}

const contactRing=mesh(new THREE.RingGeometry(.17,.2,40),new THREE.MeshBasicMaterial({color:'#e8f7b5',side:THREE.DoubleSide,transparent:true,opacity:0}));contactRing.position.set(0,1,.2);

// Keyed leg lift, stride, release and follow-through keep the ball in the hand.
function animatePitcher(t){
 const w=state.phase==='windup'?clamp(t/TIMING.windup,0,1):state.phase==='flight'?1+state.flight/.7:state.phase==='result'?1.7+state.resultAge:0;
 const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
 const lift=Math.sin(smooth(w/.5)*Math.PI/2)*(1-smooth((w-.50)/.36)),drive=smooth((w-.5)/.5),finish=smooth((w-1)/.48),recover=smooth((w-1.8)/.6);
 pitcher.hip.position.set(-.025*lift,.80-.10*drive+.10*recover,.29*drive*(1-recover));pitcher.hip.rotation.set(0,-.2*lift+.22*drive*(1-recover),0);pitcher.torso.rotation.set(.05+.25*drive*(1-recover),-.4*lift+.22*drive*(1-recover),-.04*drive);
 plantFoot(pitcher,0,new THREE.Vector3(.13-.03*drive,.085+.43*lift,.05+.62*drive*(1-recover)));
 plantFoot(pitcher,1,new THREE.Vector3(-.13,.085+.12*finish*(1-recover),-.04-.18*finish*(1-recover)));
 const ready=new THREE.Vector3(-.01,1.26,.24),cocked=new THREE.Vector3(-.47,1.68,-.13),released=new THREE.Vector3(-.24,1.77,.72),follow=new THREE.Vector3(.17,.98,.58);
 const right=ready.clone();
 if(w<.52)right.y+=lift*.08;
 else if(w<.82)right.lerp(cocked,smooth((w-.52)/.30));
 else if(w<=1)right.copy(cocked).lerp(released,smooth((w-.82)/.18));
 else right.copy(released).lerp(follow,finish).lerp(ready,recover);
 const left=new THREE.Vector3(.055,1.27+.08*lift,.20).lerp(new THREE.Vector3(.15,1.18,.25),drive*(1-recover));
 pitcher.root.updateWorldMatrix(true,false);reach(pitcher.right,pitcher.root.localToWorld(right));reach(pitcher.left,pitcher.root.localToWorld(left));
 pitcher.head.rotation.set(-.025,0,.025*drive);
}
function reach(arm,worldTarget){reachHand(arm,worldTarget);}
function animateBatter(dt){
 state.swingAge+=dt;const age=state.swingAge,live=age<.85,contactAt=.16;
 const turn=live?Math.sin(clamp(age/.55,0,1)*Math.PI/2)*(1-clamp((age-.6)/.25,0,1)):0,load=state.phase==='windup'?Math.sin(state.elapsed/TIMING.windup*Math.PI)*.14:0;
 battingRig.scale.x=1;batter.root.position.set(-.82,0,.05);batter.root.rotation.y=Math.PI/2;
 batter.hip.position.y=.77;batter.hip.rotation.y=turn*.4;batter.torso.rotation.set(.08,-load+turn*.65,0);
 batter.head.rotation.set(.025,state.phase==='flight'?lerp(1.1,.12,clamp(state.flight/state.duration,0,1)):live?.12:1.1,0);
 plantFoot(batter,0,new THREE.Vector3(.28,.08,.035));plantFoot(batter,1,new THREE.Vector3(-.27,.08+turn*.04,.015));
 const y=Number.isFinite(target.y)?target.y:1.05;
 const grip=new THREE.Vector3(-.62,1.26,.23),direction=new THREE.Vector3(-.18,.91,.36);
 if(live){
  const u=clamp(age/contactAt,0,1),v=clamp((age-contactAt)/.5,0,1);
  grip.lerp(new THREE.Vector3(target.x/batSign-.65,y,0),u).lerp(new THREE.Vector3(-.72,1.45,-.15),v);
  const angle=lerp(1.75,0,u)-v*2;direction.set(Math.cos(angle),lerp(.7,0,u)+v*.7,Math.sin(angle));
 }
 batPivot.position.copy(grip);batPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
 batter.root.updateMatrixWorld(true);reach(batter.left,grip);reach(batter.right,grip.clone().addScaledVector(direction,.065));battingRig.scale.x=batSign;
}

let runRoute=[],runDuration=0,runnerPlans=[],choreography=null;
function runPose(p,t,moving,slide=false){const stride=moving?Math.sin(t*16)*.75:0;p.hip.rotation.set(0,0,0);p.hip.position.y=slide?.28:.86+Math.abs(stride)*.045;p.torso.rotation.set(slide?-.55:.15,0,0);p.head.rotation.set(.03,0,0);p.legs.forEach((l,i)=>{l.foot.rotation.set(0,0,0);l.pivot.rotation.set(slide?(i?-1.4:-.9):i?stride:-stride,0,0);l.knee.rotation.x=slide?(i?.15:.8):Math.max(0,i?-stride:stride)*.9});p.left.pivot.rotation.set(stride,0,-.12);p.right.pivot.rotation.set(-stride,0,.12);p.left.elbow.rotation.set(-1,0,0);p.right.elbow.rotation.set(-1,0,0);}
function animateRunner(t){for(const r of runnerPlans){const p=r.from===0?batter:runners[r.from-1];if(r.from===0)battingRig.scale.x=1;if(t<r.delay){if(r.from>0){p.root.visible=true;p.root.position.fromArray(BASES[r.from]);runPose(p,0,false);}continue;}
 const elapsed=t-r.delay,distance=r.retreat?1:Math.max(0,r.to-r.from),duration=r.duration,progress=clamp(elapsed/duration,0,1),walk=r.walk;
 p.root.visible=!(progress>=1&&(r.out||r.to===4));if(!p.root.visible)continue;
 if(r.retreat){const v=Math.sin(progress*Math.PI)*.18;p.root.position.lerpVectors(new THREE.Vector3(...BASES[0]),new THREE.Vector3(...BASES[1]),v);p.root.rotation.y=progress<.5?Math.PI*.75:-Math.PI*.25;}
 else if(distance){const segment=progress*distance,index=Math.min(distance-1,Math.floor(segment)),u=clamp(segment-index,0,1),from=new THREE.Vector3(...BASES[r.from+index]),to=new THREE.Vector3(...BASES[r.from+index+1]);p.root.position.lerpVectors(from,to,u);if(index<distance-1){const rounding=Math.sin(u*Math.PI)*.8;p.root.position.x+=rounding;}const direction=to.clone().sub(from);p.root.rotation.y=Math.atan2(direction.x,direction.z);}
 else p.root.position.fromArray(BASES[r.from]);
 runPose(p,t*(walk?.6:1),progress<1&&distance>0,r.slide&&progress>.89&&progress<1);
}}
function startRunners(){runnerPlans=choreography.runs.map(r=>({...r,duration:r.retreat?choreography.catchAt+.5:r.walk?5:choreography.home?Math.max(1,r.to-r.from)*2.4:Math.max(1,r.to-r.from)*(r.from===0&&r.to===1?3.5:2.4)}));runRoute=runnerPlans.some(r=>r.from===0&&r.to>0)?BASES.slice(1,(runnerPlans.find(r=>r.from===0)?.to||0)+1):[];runDuration=Math.max(0,...runnerPlans.map(r=>r.delay+r.duration));runners.forEach((p,i)=>{p.root.visible=Boolean(currentPlay.basesBefore?.[i]);p.root.position.fromArray(BASES[i+1])});}
const state={phase:'ready',elapsed:0,flight:0,duration:.65,swingAge:10,resultAge:0,contact:false,outcome:'',visualKey:'',plays:0};
let active=true,disposed=false,view='batter',model={},currentPlay=null,manualCamera=false,frameId=0;
let hoverCell=null,keyboardCell=12,followEnabled=!reduced,followSuppressed=false,following=false,lastCommentary=null,lastLocation=null,autoPlayCamera=false;
const pitchHistory=[];
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const gloveTarget=new THREE.Vector3();
const release=new THREE.Vector3(),target=new THREE.Vector3(),battedStart=new THREE.Vector3(),velocity=new THREE.Vector3();
const cameraGoal=new THREE.Vector3(),lookGoal=new THREE.Vector3(),lookCurrent=new THREE.Vector3();
function setCamera(next,user=true,cut=false){
 if(next==='auto'){next=model.defending?'pitcher':'batter';user=false;followSuppressed=false;}
 if(!['zone','broadcast','batter','pitcher','side','catcher'].includes(next))return;
 manualCamera=user;if(user){followSuppressed=true;autoPlayCamera=false;}following=false;view=next;
 const frame=cameraFrame(next,camera.aspect,pitchSign,batSign,host.clientHeight);camera.fov=frame.fov;camera.updateProjectionMatrix();cameraGoal.fromArray(frame.pos);lookGoal.fromArray(frame.look);
 if(cut||state.phase==='ready'||!state.plays||next==='zone'||next==='catcher'){camera.position.copy(cameraGoal);lookCurrent.copy(lookGoal);camera.lookAt(lookCurrent);camera.updateMatrixWorld()}
 onStatus(null,{view:next,following:false});
}
setCamera('batter',false);
const runners=[[-19.4,-19.4],[0,-38.8],[19.4,-19.4]].reverse().map(([x,z])=>{const runner=player('#eee7d4',x,z,'P','runner');runner.root.visible=false;return runner});
const targetMarker=mesh(new THREE.RingGeometry(.038,.049,4),new THREE.MeshBasicMaterial({color:'#f5df76',side:THREE.DoubleSide,transparent:true,opacity:.85}));
const locationMarker=new THREE.Group();scene.add(locationMarker);locationMarker.visible=false;
const mark=mesh(new THREE.RingGeometry(.027,.038,24),new THREE.MeshBasicMaterial({color:'#ff5573',side:THREE.DoubleSide,depthTest:false}),locationMarker);mark.renderOrder=9;
for(const axis of [0,1]){const cross=line(axis?[[-.058,0,0],[.058,0,0]]:[[0,-.058,0],[0,.058,0]],'#ff5573',1,locationMarker);cross.material.depthTest=false;cross.renderOrder=9;}
const historyMarkers=new THREE.Group();scene.add(historyMarkers);
function refreshHistoryMarkers(){for(const child of [...historyMarkers.children]){historyMarkers.remove(child);child.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose()})}pitchHistory.forEach((item,i)=>{const c=document.createElement('canvas');c.width=c.height=96;const ctx=c.getContext('2d');ctx.beginPath();ctx.arc(48,48,40,0,Math.PI*2);ctx.fillStyle=i===0?'#ff5573':'#24483edd';ctx.fill();ctx.strokeStyle='#fff4dc';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#ffffff';ctx.font='bold 54px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),48,50);const m=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false,transparent:true});const marker=new THREE.Sprite(m);marker.scale.set(.072,.072,1);marker.position.fromArray(item.point);if(item.outside){marker.position.x=clamp(marker.position.x,-.36,.36);marker.position.y=clamp(marker.position.y,.52,1.43);}marker.position.z=.14+i*.004;const same=pitchHistory.slice(0,i).filter(p=>p.cell===item.cell&&p.outside===item.outside).length;marker.position.x+=same*.016;marker.position.y-=same*.013;marker.renderOrder=15-i;historyMarkers.add(marker)});const latest=pitchHistory[0];if(Number.isInteger(latest?.batCell)){const pos=cellPoint(latest.batCell);const ring=new THREE.Mesh(new THREE.RingGeometry(.046,.056,4),new THREE.MeshBasicMaterial({color:'#63f6ee',side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.95}));ring.position.copy(pos);ring.position.z=.13;ring.renderOrder=12;historyMarkers.add(ring);}}
const cellPoint=cell=>new THREE.Vector3(((cell%5)-2)*.112,1.27-Math.floor(cell/5)*.146,0);
function sync(next){const previousRole=model.defending;model=next||{};if(state.phase==='ready'&&!manualCamera&&(previousRole!==model.defending||view==='zone'))setCamera(model.defending?'pitcher':'batter',false,true);if(state.phase==='ready')uniformTeams(model.attackTeam||0);if(!model.pending&&state.phase==='ready')runners.forEach((runner,i)=>{runner.root.visible=Boolean(model.bases?.[i]);runner.root.position.fromArray(BASES[i+1]);runPose(runner,0,false)});targetMarker.visible=Number.isInteger(model.pick)&&state.phase!=='flight';if(targetMarker.visible)targetMarker.position.copy(cellPoint(model.pick));
 const colors={classic:['#f9f4dc','#b64032'],crimson:['#af3b30','#f5d398'],retro:['#c79b64','#60432b'],neon:['#69c4df','#e5ffeb']}[model.shop?.equippedBall]||['#f9f4dc','#b64032'];ball.children[0].material.color.set(colors[0]);ball.children[0].material.emissive.set(colors[0]);ball.children.slice(1).forEach(seam=>seam.material.color.set(colors[1]));
 const theme=model.shop?.equippedTheme||'classic';const skies={classic:'#9ea99b',night:'#233b4d',retro:'#b9a38a',neon:'#4c456b'};scene.background.set(skies[theme]||skies.classic);stadium.setTheme(theme);scene.fog.color.copy(stadium.horizon);ambient.intensity=theme==='night'?1.1:2.2;
 if(state.phase==='ready')onStatus(model.locked?'선택을 변경할 수 없는 상태입니다.':model.defending?'투구할 코스를 가상 스트라이크존에서 선택하세요.':'타격할 코스를 가상 스트라이크존에서 선택하세요.');paintZone();
}
function play(resolved){if(!resolved||resolved.key===state.visualKey)return;state.visualKey=resolved.key;state.plays++;followSuppressed=false;following=false;hoverCell=null;resetCatcher();currentPlay={basesBefore:[...(model.bases||[])],...resolved};choreography=planPlay({...currentPlay,key:resolved.variationKey||resolved.key});currentPlay.outcome=choreography.out;uniformTeams(resolved.attacker?resolved.attacker==='p2':model.attackTeam||0);runnerPlans=[];runRoute=[];runDuration=0;defense.reset();autoPlayCamera=!manualCamera||view==='zone';if(autoPlayCamera)setCamera((resolved.defending??model.defending)?'pitcher':'batter',false,true);state.phase='windup';state.elapsed=0;state.flight=0;state.swingAge=10;state.contact=false;state.resultAge=0;state.outcome=choreography.out;state.duration=clamp(18.44/((Number(resolved.speed)||140)/3.6),.38,.9);target.copy(cellPoint(Number.isInteger(resolved.actualCell)?clamp(resolved.actualCell,0,24):12));
 if(resolved.execution==='bait'||resolved.execution==='wild'||resolved.isBall){const direction=resolved.direction;const offsets={high:[0,.45,0],low:[0,-.5,0],in:[-.65,0,0],out:[.65,0,0]};target.add(new THREE.Vector3(...(offsets[direction]||[.52,0,0])))}
 ball.visible=true;trail.visible=false;targetMarker.visible=false;contactRing.material.opacity=0;onStatus(`${resolved.pitchName||'투구'} · ${resolved.speed||'—'} km/h`);
 contactRing.scale.setScalar(1);onStatus(null,{pending:true,handedness:{pitch:pitchSign===1?'우투':'좌투',bat:batSign===1?'우타':'좌타'}});

}
function isContact(){return Boolean(choreography?.contact)}
function resolveVisual(){state.phase='result';state.resultAge=0;const out=state.outcome,text=currentPlay.text||'';state.contact=isContact();
 if(state.contact){velocity.set(Math.sin(choreography.angle)*choreography.distance/choreography.catchAt,0,-Math.cos(choreography.angle)*choreography.distance/choreography.catchAt);battedStart.copy(ball.position);trail.visible=!reduced;contactRing.position.copy(ball.position);contactRing.material.color.set({classic:'#f4edd3',night:'#ff9950',retro:'#d3ad73',neon:'#8cddff'}[model.shop?.equippedEffect]||'#f4edd3');contactRing.material.opacity=.85;defense.begin({...currentPlay,choreography},battedStart);}
 startRunners();
 if(!state.contact){contactRing.position.copy(ball.position);contactRing.material.color.set('#92dfff');contactRing.material.opacity=.85;}contactRing.scale.setScalar(1);
 lastLocation={key:currentPlay.key,cell:currentPlay.actualCell,location:pitchLocation(currentPlay),outside:currentPlay.isBall||['wild','bait'].includes(currentPlay.execution)};locationMarker.position.copy(target);locationMarker.position.z=.10;
 const description=describePlay(currentPlay);pitchHistory.unshift({...lastLocation,point:target.toArray(),batCell:currentPlay.batCell,pitch:description.pitch,result:description.title});pitchHistory.splice(5);refreshHistoryMarkers();onStatus(null,{history:[...pitchHistory],reveal:true});
 lastCommentary=describePlay(currentPlay);onStatus(null,{commentary:lastCommentary});
}
function trailAt(position,reset=false){if(reset)trailPoints.forEach(p=>p.copy(position));else{for(let i=trailPoints.length-1;i>0;i--)trailPoints[i].copy(trailPoints[i-1]);trailPoints[0].copy(position)}trailPoints.forEach((p,i)=>trailGeometry.attributes.position.setXYZ(i,p.x,p.y,p.z));trailGeometry.attributes.position.needsUpdate=true;trailGeometry.computeBoundingSphere()}
function update(dt){state.elapsed+=dt;animatePitcher(state.elapsed);animateBatter(dt);
 if(state.phase==='windup'){scene.updateMatrixWorld(true);pitcher.right.hand.getWorldPosition(ball.position);if(state.elapsed>=TIMING.windup){release.copy(ball.position);state.phase='flight';state.flight=0;trailAt(ball.position,true);trail.visible=!reduced;}}
 else if(state.phase==='flight'){state.flight+=dt;const t=clamp(state.flight/state.duration,0,1),breaking=/커브|변화|curve|breaking/i.test(currentPlay.pitchName||''),slider=/슬라이더|slider/i.test(currentPlay.pitchName||'');ball.position.lerpVectors(release,target,t);ball.position.x+=Math.sin(t*Math.PI)*(slider?.65:breaking?-.18:0)*t;ball.position.y+=Math.sin(t*Math.PI)*(breaking?.85:.12);ball.rotation.x+=dt*44;ball.rotation.z+=dt*(slider?24:9);trailAt(ball.position);
 const take=state.outcome==='ball'||currentPlay.strikeStyle==='looking'||/볼넷|루킹/.test(currentPlay.text||'');if(!take&&state.flight>=state.duration-.16&&state.swingAge>1)state.swingAge=0;if(t>=1){if(isContact())resolveVisual();else{state.phase='catch';state.catchAge=0;catcher.root.position.x=target.x*.65;const mitt=new THREE.Vector3(target.x,clamp(target.y,.4,1.4),.98);reach(catcher.left,mitt);scene.updateMatrixWorld(true);catcherGlove.getWorldPosition(gloveTarget);}}}
 else if(state.phase==='catch'){state.catchAge+=dt;const u=clamp(state.catchAge/TIMING.catch,0,1);ball.position.lerpVectors(target,gloveTarget,u);trailAt(ball.position);if(u===1)resolveVisual();}
 else if(state.phase==='result'){state.resultAge+=dt;const t=state.resultAge;contactRing.material.opacity=Math.max(0,.85-t*3);contactRing.scale.setScalar(1+t*3);if(state.contact&&defense.active){defense.update(t,ball);trail.visible=defense.stage==='throw'||defense.stage==='chase';trailAt(ball.position);}else if(state.contact){const u=clamp(t/choreography.catchAt,0,1);ball.position.lerpVectors(battedStart,new THREE.Vector3(...choreography.end),u);ball.position.y=.085+battedStart.y*(1-u)+Math.sin(u*Math.PI)*choreography.apex;ball.rotation.x+=dt*22;trailAt(ball.position);if(u===1)trail.visible=false;}else{ball.position.copy(gloveTarget);ball.visible=t<.45;}const end=defense.active?defense.duration:state.contact?choreography.catchAt+TIMING.settle:/삼진/.test(currentPlay.playText||currentPlay.text||'')?1.1:TIMING.callHold;if(t>Math.max(end,runDuration+.35)){runnerPlans=[];runRoute=[];defense.settle();resetCatcher();state.phase='ready';ball.visible=false;trail.visible=false;following=false;if(!followSuppressed||autoPlayCamera)setCamera(model.defending?'pitcher':'batter',false,true);sync(model);}}
 else{ball.visible=false;}
 if(state.phase==='result')animateRunner(state.resultAge);
 const call=state.phase==='result'&&!state.contact&&state.outcome!=='ball',strikeout=/삼진/.test(currentPlay?.playText||currentPlay?.text||'');umpire.hip.position.y=call?.9:.62;umpire.torso.rotation.x=call?0:.25;umpire.legs.forEach(l=>{l.pivot.rotation.x=-.5;l.knee.rotation.x=.8});umpire.right.pivot.rotation.set(call?-.9-Math.sin(Math.min(state.resultAge,1)*Math.PI)*.7:-.5,0,call?-.85:0);umpire.right.elbow.rotation.x=call?(strikeout?-.2:-1.6):-.5;umpire.torso.rotation.y=call&&strikeout?Math.sin(Math.min(state.resultAge,1)*Math.PI)*.55:0;umpire.root.visible=!['zone','batter'].includes(view);

 const wasFollowing=following;following=state.phase==='result'&&state.resultAge>TIMING.fieldCut&&state.contact&&followEnabled&&!followSuppressed;
 const smooth=reduced?1:1-Math.exp(-dt*(following?8:5));
 if(following){const direction=new THREE.Vector3(velocity.x,0,velocity.z).normalize();const chase=ball.position.clone().addScaledVector(direction,defense.active?-10:-6);chase.x+=defense.active?7:0;chase.y=Math.max(defense.active?7:2.4,ball.position.y+(defense.active?5:2.5));const fieldFrame=defense.active?defense.cameraFrame(ball.position,camera.aspect):null;if(!wasFollowing){camera.fov=50;camera.updateProjectionMatrix();camera.position.copy(fieldFrame?.position||chase);lookCurrent.copy(fieldFrame?.target||ball.position);onStatus(null,{view:'field'})}else{camera.position.lerp(fieldFrame?.position||chase,1-Math.exp(-dt*3));lookCurrent.lerp(fieldFrame?.target||ball.position,1-Math.exp(-dt*4));}onStatus(null,{following:true,fielding:defense.label});}
 else{camera.position.lerp(cameraGoal,smooth);lookCurrent.lerp(lookGoal,smooth);}
 camera.lookAt(lookCurrent);camera.updateMatrixWorld();const batterRun=runnerPlans.find(r=>r.from===0);batter.root.visible=(view!=='zone'||state.phase!=='ready')&&!(state.phase==='result'&&batterRun&&(batterRun.out||batterRun.to===4)&&state.resultAge>=batterRun.delay+batterRun.duration);batPivot.visible=batter.root.visible&&!(batterRun&&state.phase==='result'&&state.resultAge>.35);catcher.root.visible=!['batter','zone'].includes(view);visibleMitt.visible=!catcher.root.visible&&(state.phase==='catch'||(state.phase==='result'&&!state.contact));if(visibleMitt.visible){catcherGlove.getWorldPosition(visibleMitt.position);catcherGlove.getWorldQuaternion(visibleMitt.quaternion);}zone.visible=!following;historyMarkers.visible=zone.visible;targetMarker.visible=zone.visible&&Number.isInteger(model.pick)&&state.phase==='ready';locationMarker.visible=false;paintZone();
}
function paintZone(){for(const tile of zoneCells){
 const i=tile.userData.cell,selected=i===model.pick,hover=i===hoverCell,weight=model.rangeWeights?.[i]||0,range=model.rangeCells?.includes(i)&&!model.defending;
 tile.material.color.set(selected?'#ffd34d':hover?'#ffffff':range?weight>=.7?'#13e8e1':weight>=.45?'#27a6ff':'#7974ff':'#19332d');
 tile.material.opacity=selected?.85:hover?.65:range?weight>=.7?.72:weight>=.45?.6:.43:.08;
 rangeBorders[i].visible=selected||range;rangeBorders[i].material.color.set(selected?'#fff4a3':'#a6f7ff');
}}

function cellAt(event){if(!active||model.locked||!zone.visible||following)return null;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);camera.updateMatrixWorld();zone.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(zoneCells,false)[0]?.object.userData.cell??null;}
let pointerStart=null;
const down=event=>{if(event.button!==0)return;pointerStart={x:event.clientX,y:event.clientY}};
const up=event=>{if(!pointerStart)return;const moved=Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y);pointerStart=null;if(moved>9)return;const cell=cellAt(event);if(cell!==null){keyboardCell=cell;onPick(cell)}};
const move=event=>{hoverCell=cellAt(event);renderer.domElement.style.cursor=hoverCell===null?'default':model.locked?'not-allowed':'pointer';};
const leave=()=>{hoverCell=null;pointerStart=null};
const keydown=event=>{if(model.locked)return;const keys={ArrowLeft:-1,ArrowRight:1,ArrowUp:-5,ArrowDown:5};if(event.key in keys){event.preventDefault();keyboardCell=clamp(keyboardCell+keys[event.key],0,24);hoverCell=keyboardCell;renderer.domElement.setAttribute('aria-label',('가상 스트라이크존 '+(Math.floor(keyboardCell/5)+1)+'행 '+(keyboardCell%5+1)+'열. Enter로 선택.'))}else if(event.key==='Enter'||event.key===' '){event.preventDefault();onPick(keyboardCell)}};
renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('role','application');renderer.domElement.setAttribute('aria-label','가상 스트라이크존. 방향키로 칸 이동, Enter로 선택.');
for(const [type,fn] of [['pointerdown',down],['pointerup',up],['pointermove',move],['pointerleave',leave],['pointercancel',leave],['keydown',keydown]])renderer.domElement.addEventListener(type,fn);
const observer=new ResizeObserver(()=>{if(!host.clientWidth||!host.clientHeight)return;renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();setCamera(view,manualCamera)});observer.observe(host);
let previous=performance.now();function frame(now){if(disposed)return;const dt=Math.min((now-previous)/1000,.05);previous=now;if(active&&host.clientWidth&&host.clientHeight){update(dt);renderer.render(scene,camera)}frameId=requestAnimationFrame(frame)}frameId=requestAnimationFrame(frame);
return {restoreHistory(records){if(state.phase!=='ready'||!Array.isArray(records))return;pitchHistory.length=0;for(const [i,p] of records.slice(0,5).entries()){if(!Number.isInteger(p.actualCell))continue;const point=cellPoint(p.actualCell);const outside=p.isBall||['wild','bait'].includes(p.execution);if(outside)point.x+=.52;pitchHistory.push({key:'restored:'+i,cell:p.actualCell,batCell:p.batCell,point:point.toArray(),outside,location:pitchLocation(p)})}lastLocation=pitchHistory[0]||null;refreshHistoryMarkers();},sync,play,setRoomSeed(seed){randomizeHands(seed);seedTeams(seed);defense.setHands(teamSeed);if(state.phase==='ready'){uniformTeams(model.attackTeam||0);setCamera(view,manualCamera,true)}},reset(){state.phase='ready';state.visualKey='';state.plays=0;currentPlay=null;lastLocation=null;lastCommentary=null;runRoute=[];runDuration=0;randomizeHands();following=false;state.swingAge=10;pitchHistory.length=0;runnerPlans=[];refreshHistoryMarkers();seedTeams(crypto.getRandomValues(new Uint32Array(1))[0]);defense.setHands(teamSeed);defense.reset();setCamera(model.defending?'pitcher':'batter',false,true);onStatus(null,{history:[],commentary:{title:'어떤 코스로 승부할까요?',detail:'가상 스트라이크존에서 코스를 선택하세요.',pitch:''}})},setCamera,setFollow(value){followEnabled=Boolean(value);if(!followEnabled&&following)setCamera(model.defending?'pitcher':'batter',false,true)},setActive(value){active=value;previous=performance.now()},snapshot(){const point=o=>o.getWorldPosition(new THREE.Vector3()).toArray();const rig=p=>({head:point(p.head),feet:p.legs.map(l=>point(l.foot)),hands:[point(p.left.hand),point(p.right.hand)]});return{players:{pitcher:rig(pitcher),batter:rig(batter),catcher:rig(catcher)},phase:state.phase,trajectory:choreography?{kind:choreography.kind,distance:choreography.distance,end:[...choreography.end],contact:choreography.contact}:null,teamColors:[...teamColors],uniforms:{batter:batter.uniformColor,pitcher:pitcher.uniformColor},attackTeam:model.attackTeam,runnerPlans:runnerPlans.map(r=>({...r,position:(r.from===0?batter:runners[r.from-1]).root.position.toArray()})),historyMarkerCount:historyMarkers.children.filter(o=>o.isSprite).length,lastBatCell:pitchHistory[0]?.batCell,umpireCall:state.phase==='result'&&!state.contact&&state.outcome!=='ball',key:state.visualKey,plays:state.plays,outcome:state.outcome,actualCell:currentPlay?.actualCell,ball:ball.position.toArray(),bases:[...(model.bases||[])],pick:model.pick,moundDistance:18.44,camera:view,following,cameraFov:camera.fov,modelRig:'skinned-baseball-v1',stadium:{...stadium.stats},timing:{...TIMING},renderStats:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},cameraPosition:camera.position.toArray(),cameraTarget:lookCurrent.toArray(),commentary:lastCommentary,history:[...pitchHistory],location:lastLocation,rangeCells:[...(model.rangeCells||[])],rangeWeights:{...model.rangeWeights},catcherHand:'R',anatomy:{rightShoulderX:catcher.right.pivot.position.x,leftShoulderX:catcher.left.pivot.position.x},handedness:{pitch:pitchSign===1?'R':'L',bat:batSign===1?'R':'L'},bodyYaw:batter.root.rotation.y,batterPosition:batter.root.position.toArray(),running:state.phase==='result'&&runRoute.length>0&&state.resultAge>.35,runBases:runRoute.length,contact:state.contact,effectOpacity:contactRing.material.opacity,glove:gloveTarget.toArray(),swingAge:state.swingAge,batPosition:batPivot.position.toArray(),batVisible:batPivot.visible,defense:defense.snapshot(),zoneCells:zoneCells.map(tile=>{const p=tile.getWorldPosition(new THREE.Vector3()).project(camera);return{cell:tile.userData.cell,x:(p.x+1)/2,y:(1-p.y)/2,visible:zone.visible&&p.z>-1&&p.z<1}})}},dispose(){disposed=true;cancelAnimationFrame(frameId);observer.disconnect();for(const [type,fn] of [['pointerdown',down],['pointerup',up],['pointermove',move],['pointerleave',leave],['pointercancel',leave],['keydown',keydown]])renderer.domElement.removeEventListener(type,fn);scene.traverse(object=>{object.geometry?.dispose();object.skeleton?.dispose();if(object.material){for(const material of Array.isArray(object.material)?object.material:[object.material]){material.map?.dispose();material.dispose()}}});renderer.dispose();renderer.domElement.remove()}};
}

