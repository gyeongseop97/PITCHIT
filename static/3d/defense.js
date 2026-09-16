import {BASES,planPlay} from './play-plan.js';
import {TIMING} from './presentation-timing.js';
import {createBattedFlight,sampleBattedFlight} from './batted-flight.js';
// Ball, fielder and relay share one timeline and explicit possession.
export function createDefense({THREE,player,createGlove,scene,pitcher}) {
 const clamp=n=>Math.max(0,Math.min(1,n));
 const positions=[['1루수',19,-21],['2루수',9,-30],['유격수',-12,-27],['3루수',-21,-20],['좌익수',-35,-62],['중견수',0,-65],['우익수',33,-62]];
 const fielders=positions.map(([name,x,z],i)=>{const p=player('#9d4336',x,z,String(i+3));p.name=name;p.home=p.root.position.clone();p.glove=createGlove(p.left.hand);return p});
 let plan=null,stage='ready',throwIndex=0,catcher=null,elapsed=0;pitcher.home=pitcher.root.position.clone();pitcher.name='투수';
 function ready(p){p.hip.position.y=.81;p.hip.rotation.set(0,0,0);p.torso.rotation.set(.14,0,0);p.left.pivot.rotation.set(-.55,0,-.18);p.right.pivot.rotation.set(-.55,0,.18);p.left.elbow.rotation.x=-.4;p.right.elbow.rotation.x=-.4;p.legs.forEach((l,i)=>{l.pivot.rotation.set(-.1,0,i?-.16:.16);l.knee.rotation.x=.18;l.foot.rotation.set(0,0,0)})}
 function pose(p,ground,style='basket'){ready(p);p.hip.position.y=ground?.55:.82;p.torso.rotation.x=ground?.5:0;p.left.pivot.rotation.set(ground?-.65:style==='overhead'?-2.6:-1.3,0,style==='backhand'?.5:-.18);p.left.elbow.rotation.x=ground?-.15:-.4;}
 function hand(p,which='left'){scene.updateMatrixWorld(true);return p[which].hand.getWorldPosition(new THREE.Vector3())}
 function face(p,target){p.root.rotation.y=Math.atan2(target.x-p.root.position.x,target.z-p.root.position.z)}
 function resetPitcher(){pitcher.root.position.copy(pitcher.home);pitcher.root.rotation.set(0,0,0);}
 function reset(){resetPitcher();plan=null;stage='ready';throwIndex=0;fielders.forEach(p=>{p.root.position.copy(p.home);p.root.rotation.set(0,0,0);ready(p)})}
 function begin(play,start){reset();const shot=play.choreography||planPlay(play);if(!shot.contact||shot.home||shot.foul)return false;
  const end=new THREE.Vector3(...shot.end),pool=shot.ground&&!shot.hit||shot.infieldHit||shot.out==='infield_flyout'?fielders.slice(0,4):fielders.slice(4);
  const fielder=shot.field?fielders[shot.field.fielder]:pool.reduce((a,b)=>a.home.distanceTo(end)<b.home.distanceTo(end)?a:b);
  const style=shot.ground?(shot.angle<-.15?'backhand':shot.angle>.15?'forehand':'scoop'):shot.fly?'overhead':'basket';
  const from=fielder.root.position.clone();fielder.root.position.copy(end);face(fielder,start);pose(fielder,shot.ground||shot.hit,style);const catchPoint=hand(fielder);fielder.root.position.copy(from);ready(fielder);
  if(catcher)catcher.home=new THREE.Vector3(0,0,1.45);
  let source=fielder,cursor=shot.catchAt,sourcePosition=end;
  const legs=shot.throws.map(base=>{
   let receiver=base===1?fielders[0]:base===3?fielders[3]:fielders[1]===source?fielders[2]:fielders[1];
   if(base===4&&catcher)receiver=catcher;
   const position=new THREE.Vector3(...BASES[base]),carry=receiver===source&&sourcePosition.distanceTo(position)<8;
   if(receiver===source&&!carry)receiver=base===1?pitcher:fielders[2];
   const gather=carry?.08:shot.kind==='double_play'?TIMING.doublePlayTransfer:TIMING.transfer;
   const duration=Math.max(.34,sourcePosition.distanceTo(position)/(carry?7.4:TIMING.throwSpeed));
   const tagRunner=shot.fly?shot.runs.find(r=>r.tagUp&&r.to===base):null;
   const runnerSpeed=tagRunner?.speed&&tagRunner.speed!==1?tagRunner.speed:55;
   const tagArrival=tagRunner?tagRunner.delay+Math.max(1,tagRunner.to-tagRunner.from)*Math.max(2.3,Math.min(3.1,2.65-(runnerSpeed-55)/110)):0;
   // Safe tag-ups must beat the return throw. The gather represents the
   // fielder setting his feet and choosing the relay after the catch.
   const releaseTime=Math.max(cursor+gather,tagArrival?tagArrival+.16-duration:0);
   const leg={source,receiver,base,carry,sourcePosition:sourcePosition.clone(),position,start:cursor,release:releaseTime,end:releaseTime+duration};
   source=receiver;sourcePosition=position;cursor=leg.end;return leg;
  });
  plan={...shot,fielder,from,end,catchPoint,start:start.clone(),ballFlight:createBattedFlight(shot,start.toArray(),catchPoint.toArray()),style,legs,duration:cursor+TIMING.settle};stage='chase';return true;
 }
 function update(t,ball){if(!plan)return false;elapsed=t;const p=plan,f=p.fielder;
  for(const r of [...fielders,...(p.legs.some(l=>l.receiver===pitcher)?[pitcher]:[]),...(p.legs.some(l=>l.receiver===catcher)?[catcher]:[])]){if(r===f)continue;const leg=p.legs.find(l=>l.receiver===r);const dest=leg?.position||r.home.clone().lerp(p.end,.07);const u=clamp(t/Math.max(.8,p.catchAt));r.root.position.lerpVectors(r.home,dest,u);ready(r);face(r,p.end);if(u<1){const s=Math.sin(t*15)*.6;r.legs[0].pivot.rotation.x=s;r.legs[1].pivot.rotation.x=-s;}}
  if(t<p.catchAt){stage='chase';const u=clamp(t/p.catchAt),run=clamp(u*1.15);f.root.position.lerpVectors(p.from,p.end,run);ready(f);face(f,run<1?p.end:p.start);const stride=Math.sin(t*15)*.6*(run<1?1:0);f.legs[0].pivot.rotation.x=stride;f.legs[1].pivot.rotation.x=-stride;if(u>.86)pose(f,p.ground||p.hit,p.style);
   ball.position.fromArray(sampleBattedFlight(p.ballFlight,t));

  }else{
   f.root.position.copy(p.legs.find(l=>l.carry&&l.source===f&&t>=l.end)?.position||p.end);const leg=p.legs.find(l=>t<l.end)||p.legs.at(-1);throwIndex=Math.max(0,p.legs.indexOf(leg));
   if(!leg){stage='receive';ball.position.copy(hand(f));}
   else if(leg.carry&&t<leg.end){stage='carry';const u=clamp((t-leg.start)/(leg.end-leg.start));leg.source.root.position.lerpVectors(leg.sourcePosition,leg.position,u);face(leg.source,leg.position);ready(leg.source);const stride=Math.sin(t*16)*.55;leg.source.legs[0].pivot.rotation.x=stride;leg.source.legs[1].pivot.rotation.x=-stride;ball.position.copy(hand(leg.source));}
   else if(t<leg.release){stage='gather';const s=leg.source;face(s,leg.position);const u=clamp((t-leg.start)/(leg.release-leg.start));pose(s,false);s.right.pivot.rotation.x=THREE.MathUtils.lerp(-.6,-2.7,u);s.right.elbow.rotation.x=-.3;ball.position.lerpVectors(hand(s),hand(s,'right'),u);leg.releasePoint=ball.position.clone();}
   else if(t<leg.end){stage='throw';const u=(t-leg.release)/(leg.end-leg.release);leg.source.right.pivot.rotation.x=-2.7+2.4*clamp(u*3);face(leg.receiver,leg.source.root.position);pose(leg.receiver,false);ball.position.lerpVectors(leg.releasePoint||hand(leg.source,'right'),hand(leg.receiver),u);ball.position.y+=Math.sin(u*Math.PI)*.35;}
   else{stage='receive';pose(leg.receiver,false);ball.position.copy(hand(leg.receiver));}
  }
  ball.visible=true;return t<p.duration;
 }
 function cameraFrame(ball,aspect,runnerPositions=[]){
  const leg=plan.legs.find(l=>elapsed<l.end)||plan.legs.at(-1),receiving=elapsed>=plan.catchAt;
  const base=leg?.base||1,bag=new THREE.Vector3(...BASES[base]);
  const relevant=runnerPositions.filter(r=>r.to===base||r.scored&&base===4);
  const points=receiving?[ball,bag,...relevant.map(r=>new THREE.Vector3(...r.position))]:[ball,plan.fielder.root.position,plan.end];
  if(!receiving&&plan.ground){points.push(bag);for(const r of relevant)points.push(new THREE.Vector3(...r.position));}
  const center=points.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);center.y=Math.max(1,center.y);
  const radius=Math.max(6,...points.map(p=>p.distanceTo(center)));
  // Fit the complete play in both portrait and landscape, with room for controls.
  const fov=receiving?43:50,halfFov=Math.atan(Math.tan(fov*Math.PI/360)*Math.min(1,aspect));
  const distance=Math.max(receiving?19:27,(radius+3)/Math.sin(halfFov));
  const offset=new THREE.Vector3(base===3?-.36:.36,.72,1).normalize().multiplyScalar(distance);
  return {position:center.clone().add(offset),target:center,fov,shot:receiving?'base-play':plan.ground?'infield':'outfield',points:points.map(p=>p.toArray())};
 }

 reset();return {setHands(seed){fielders.forEach((p,i)=>{let h=2166136261;for(const c of String(seed)+':fielder:'+i)h=Math.imul(h^c.charCodeAt(0),16777619);p.throwHand=[1,2,3].includes(i)?'R':(h>>>(i*3))&1?'L':'R';const sign=p.throwHand==='L'?-1:1;p.root.scale.x=sign;p.badge.scale.x=sign;})},settle(){resetPitcher();fielders.forEach(p=>{p.root.position.copy(p.home);p.root.rotation.set(0,0,0);ready(p)})},setCatcher(p){catcher=p;catcher.name='포수'},setUniform(color){fielders.forEach(p=>p.setUniform(color))},begin,update,reset,cameraFrame,get throwTimes(){return plan?.legs.map(l=>({base:l.base,time:l.end}))||[]},get active(){return Boolean(plan)},get stage(){return stage},get duration(){return plan?.duration||0},get label(){if(!plan)return '';const leg=plan.legs[throwIndex];return stage==='chase'?`${plan.fielder.name} 타구 처리`:stage==='gather'?`${leg?.source.name||plan.fielder.name} 송구 준비`:stage==='carry'?`${leg.base}루 베이스 터치`:stage==='throw'?`${leg.source.name} → ${leg.base===4?'홈':leg.base+'루'} 송구`:'포구 완료'},snapshot(){return {stage,kind:plan?.kind,style:plan?.style,angle:plan?.angle,throwIndex,throws:plan?.throws||[],throwTimes:plan?.legs.map(l=>({base:l.base,time:l.end}))||[],catchAt:plan?.catchAt,elapsed,strategy:plan?.field?.strategy,fielders:fielders.map(p=>({name:p.name,throwHand:p.throwHand||'R',position:p.root.position.toArray()})),fielder:plan?.fielder.name,receiver:plan?.legs[throwIndex]?.receiver.name}}};
}
