import {BASES,planPlay} from './play-plan.js';
import {TIMING} from './presentation-timing.js';
import {createBattedFlight,sampleBattedFlight} from './batted-flight.js';
import {runnerDuration} from './running-timing.js';
import {locomotionPose,capturePose,blendPose,smoothStep} from './motion-blend.js';
import {plantFoot,reachHand} from './rig-poses.js';
// One possession timeline drives the ball, glove, bag touch, tag and umpire call.
export function createDefense({THREE,player,createGlove,scene,pitcher}) {
 const clamp=n=>Math.max(0,Math.min(1,n));
 const positions=[['1루수',19,-21],['2루수',9,-30],['유격수',-12,-27],['3루수',-21,-20],['좌익수',-35,-62],['중견수',0,-65],['우익수',33,-62]];
 const fielders=positions.map(([name,x,z],i)=>{const p=player('#9d4336',x,z,String(i+3));p.name=name;p.home=p.root.position.clone();p.glove=createGlove(p.left.hand);return p});
 let plan=null,stage='ready',throwIndex=0,catcher=null,elapsed=0;pitcher.home=pitcher.root.position.clone();pitcher.name='투수';
 const vec=p=>new THREE.Vector3(...p);
 function ready(p){p.hip.position.set(0,.77,0);p.hip.rotation.set(0,0,0);p.torso.rotation.set(.14,0,0);p.left.pivot.rotation.set(-.55,0,-.18);p.right.pivot.rotation.set(-.55,0,.18);p.left.elbow.rotation.x=-.4;p.right.elbow.rotation.x=-.4;plantFoot(p,0,vec([.16,.08,.04]));plantFoot(p,1,vec([-.16,.08,-.04]));}
 function pose(p,ground,style='basket'){ready(p);p.hip.position.y=ground?.55:.77;p.torso.rotation.x=ground?.5:0;p.left.pivot.rotation.set(ground?-.65:style==='overhead'?-2.6:-1.3,0,style==='backhand'?.5:-.18);p.left.elbow.rotation.x=ground?-.15:-.4;plantFoot(p,0,vec([.24,.08,.12]));plantFoot(p,1,vec([-.24,.08,-.06]));}
 function hand(p,which='left'){p.root.updateWorldMatrix(true,true);return p[which].hand.getWorldPosition(new THREE.Vector3())}
 function face(p,target){p.root.rotation.y=Math.atan2(target.x-p.root.position.x,target.z-p.root.position.z)}
 function resetPitcher(){pitcher.root.position.copy(pitcher.home);pitcher.root.rotation.set(0,0,0);}
 function reset(){resetPitcher();plan=null;stage='ready';throwIndex=0;fielders.forEach(p=>{p.root.position.copy(p.home);p.root.rotation.set(0,0,0);ready(p)})}
 function move(p,from,to,t,arrival,reaction=.12){
  const length=from.distanceTo(to),duration=Math.max(.12,arrival-reaction),u=clamp((t-reaction)/duration);
  // Brief acceleration/deceleration; distance-based feet remain tied to travel.
  const travel=u<.12?u*u/.24:u>.88?.88-(1-u)*(1-u)/.24:u-.06;
  const progress=clamp(travel/.88);p.root.position.lerpVectors(from,to,progress);
  if(u<1&&length>.15){face(p,to);locomotionPose(p,length*progress,length/duration);}else ready(p);
  return u;
 }
 function begin(play,start){reset();const shot=play.choreography||planPlay(play);if(!shot.contact||shot.home||shot.foul)return false;
  const end=vec(shot.end),pool=shot.ground&&!shot.hit||shot.infieldHit||shot.out==='infield_flyout'?fielders.slice(0,4):fielders.slice(4);
  const fielder=shot.field?fielders[shot.field.fielder]:pool.reduce((a,b)=>a.home.distanceTo(end)<b.home.distanceTo(end)?a:b);
  const style=shot.ground?(shot.angle<-.15?'backhand':shot.angle>.15?'forehand':'scoop'):shot.fly?'overhead':'basket';
  const from=fielder.root.position.clone();fielder.root.position.copy(end);face(fielder,start);pose(fielder,shot.ground||shot.hit,style);const catchPoint=hand(fielder);fielder.root.position.copy(from);ready(fielder);
  if(catcher)catcher.home=vec([0,0,1.45]);
  let source=fielder,cursor=shot.catchAt,sourcePosition=end;
  const legs=shot.throws.map(base=>{
   let receiver=base===1?fielders[0]:base===3?fielders[3]:fielders[1]===source?fielders[2]:fielders[1];
   if(base===4&&catcher)receiver=catcher;
   const position=vec(BASES[base]),carry=receiver===source&&sourcePosition.distanceTo(position)<8;
   if(receiver===source&&!carry)receiver=base===1?pitcher:fielders[2];
   const runner=shot.runs.find(r=>r.to===base&&r.to>r.from&&!r.retreat&&!r.stopped);
   const action=runner?(runner.forced||runner.from===0&&base===1?'force':'tag'):'receive';
   const arrival=runner?runner.delay+runnerDuration(shot,runner):0;
   const gather=carry?.08:shot.kind==='double_play'?TIMING.doublePlayTransfer:TIMING.transfer;
   const duration=Math.max(.34,sourcePosition.distanceTo(position)/(carry?7.4:TIMING.throwSpeed));
   const coverAt=receiver.home.distanceTo(position)/8.4+.15;
   // A safe runner keeps a plausible pace. Delay the fielding transfer instead
   // of accelerating the runner to beat an unrealistically early throw.
   const releaseTime=Math.max(cursor+gather,coverAt-duration,runner&&!runner.out?arrival+.20-duration:runner&&action==='tag'?arrival-.20-duration:0);
   const receiveAt=releaseTime+duration,decisionAt=receiveAt+(action==='tag'?.18:action==='force'&&!carry?.06:0);
   const leg={source,receiver,runner,action,base,carry,sourcePosition:sourcePosition.clone(),position,start:cursor,release:releaseTime,end:receiveAt,decisionAt};
   source=receiver;sourcePosition=position;cursor=decisionAt;return leg;
  });
  const assigned=new Set([fielder,...legs.flatMap(l=>[l.source,l.receiver])]);
  const support=[];const last=legs.at(-1),bag=last?.position||vec(BASES[2]);
  // Back up the ball, back up the receiving base, cover uncovered bags, and
  // align an infielder between the outfield and the target as a cutoff.
  const available=fielders.filter(p=>!assigned.has(p));
  function assign(role,dest,pool=available){const candidates=pool.filter(p=>available.includes(p));if(!candidates.length)return;const p=candidates.reduce((a,b)=>a.home.distanceTo(dest)<b.home.distanceTo(dest)?a:b);available.splice(available.indexOf(p),1);support.push({player:p,role,dest,arrival:Math.max(shot.catchAt,p.home.distanceTo(dest)/7.8+.15)});}
  const behind=end.clone().add(end.clone().sub(start).normalize().multiplyScalar(6));assign('타구 백업',behind,fielders.slice(4));
  const throwLine=bag.clone().sub(end).normalize();assign('송구 백업',bag.clone().addScaledVector(throwLine,5));
  if(shot.distance>42)assign('중계 대기',end.clone().lerp(bag,.56),fielders.slice(0,4));
  for(const base of [2,3,1])if(!legs.some(l=>l.base===base))assign(base+'루 커버',vec(BASES[base]).add(vec([.4,0,.3])),fielders.slice(0,4));
  for(const p of available)support.push({player:p,role:'커버 이동',dest:p.home.clone().lerp(end,.12),arrival:Math.max(.8,shot.catchAt)});
  if(!assigned.has(pitcher)){const homeBackup=(last?.base===4?vec([0,0,5]):bag.clone().addScaledVector(throwLine,5.5));support.push({player:pitcher,role:'송구 백업',dest:homeBackup,arrival:Math.max(shot.catchAt,pitcher.home.distanceTo(homeBackup)/7.8+.15)});}
  plan={...shot,fielder,from,end,catchPoint,start:start.clone(),ballFlight:createBattedFlight(shot,start.toArray(),catchPoint.toArray()),style,legs,support,duration:cursor+TIMING.settle};stage='chase';return true;
 }
 function receivePose(leg,t,runners){
  const p=leg.receiver;face(p,leg.source.root.position);pose(p,false);
  if(leg.action==='force'){
   const bag=leg.position.clone();bag.y=.10;const local=p.root.worldToLocal(bag.clone());plantFoot(p,0,local);
   // Stretch with one foot on the bag, then secure the glove to the chest.
   const glove=leg.position.clone().add(leg.source.root.position.clone().sub(leg.position).setY(0).normalize().multiplyScalar(.40));glove.y=1.0;reachHand(p.left,glove);
  }else if(leg.action==='tag'&&t>=leg.end){
   const runner=runners.find(r=>r.from===leg.runner?.from),point=runner?vec(runner.position):leg.position.clone();point.y=.42;
   const u=smoothStep((t-leg.end)/.18);p.hip.position.y=.77-.23*u;p.torso.rotation.x=.15+.35*u;plantFoot(p,0,vec([.24,.08,.10]));plantFoot(p,1,vec([-.24,.08,-.10]));reachHand(p.left,hand(p).lerp(point,u));
  }
 }
 function update(t,ball,runners=[]){if(!plan)return false;elapsed=t;const p=plan,f=p.fielder;
  for(const task of p.support){move(task.player,task.player.home,task.dest,t,task.arrival);if(t>=task.arrival)face(task.player,ball.position);}
  for(const r of new Set(p.legs.map(l=>l.receiver))){if(r===f)continue;const first=p.legs.find(l=>l.receiver===r);const destination=first.position.clone().add(vec([.13,0,.13]));move(r,r.home,destination,t,Math.max(.25,Math.min(first.end-.12,r.home.distanceTo(destination)/8.4+.15)));if(t>=first.end-.12)face(r,first.source.root.position);}
  if(t<p.catchAt){stage='chase';const run=move(f,p.from,p.end,t,p.catchAt-.06);const running=capturePose(f);face(f,run<1?p.end:p.start);if(t>p.catchAt-.25){pose(f,p.ground||p.hit,p.style);blendPose(f,running,(t-(p.catchAt-.25))/.25);}ball.position.fromArray(sampleBattedFlight(p.ballFlight,t));
  }else{
   f.root.position.copy(p.legs.find(l=>l.carry&&l.source===f&&t>=l.end)?.position||p.end);
   const leg=p.legs.find(l=>t<l.decisionAt)||p.legs.at(-1);throwIndex=Math.max(0,p.legs.indexOf(leg));
   if(!leg){stage='receive';pose(f,p.ground||p.hit,p.style);ball.position.copy(hand(f));}
   else if(leg.carry&&t<leg.end){stage='carry';move(leg.source,leg.sourcePosition,leg.position,t-leg.start,leg.end-leg.start,0);ball.position.copy(hand(leg.source));}
   else if(t<leg.release){stage='gather';const s=leg.source;face(s,leg.position);const u=clamp((t-leg.start)/(leg.release-leg.start));pose(s,p.ground&&leg===p.legs[0]&&u<.3,p.style);const fromPose=capturePose(s);pose(s,false);s.right.pivot.rotation.x=THREE.MathUtils.lerp(-.6,-2.7,smoothStep(u));s.right.elbow.rotation.x=-.3;blendPose(s,fromPose,Math.min(1,u/.3));ball.position.lerpVectors(hand(s),hand(s,'right'),smoothStep(u));leg.releasePoint=ball.position.clone();}
   else if(t<leg.end){stage='throw';const u=(t-leg.release)/(leg.end-leg.release);leg.source.right.pivot.rotation.x=-2.7+2.4*smoothStep(u*3);receivePose(leg,t,runners);ball.position.lerpVectors(leg.releasePoint||hand(leg.source,'right'),hand(leg.receiver),u);ball.position.y+=Math.sin(u*Math.PI)*.35;}
   else{stage=leg.action==='tag'&&t<leg.decisionAt?'tag':'receive';receivePose(leg,t,runners);ball.position.copy(hand(leg.receiver));}
  }
  ball.visible=true;return t<p.duration;
 }
 function cameraFrame(ball,aspect,runnerPositions=[]){
  const leg=plan.legs.find(l=>elapsed<l.decisionAt)||plan.legs.at(-1),receiving=elapsed>=plan.catchAt;
  const base=leg?.base||1,bag=vec(BASES[base]),relevant=runnerPositions.filter(r=>r.to===base||r.scored&&base===4);
  const points=receiving?[ball,bag,...relevant.map(r=>vec(r.position))]:[ball,plan.fielder.root.position,plan.end];
  if(!receiving&&plan.ground){points.push(bag);for(const r of relevant)points.push(vec(r.position));}
  const center=points.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);center.y=Math.max(1,center.y);
  const radius=Math.max(6,...points.map(p=>p.distanceTo(center))),fov=receiving?43:50,halfFov=Math.atan(Math.tan(fov*Math.PI/360)*Math.min(1,aspect)),distance=Math.max(receiving?19:27,(radius+3)/Math.sin(halfFov));
  return {position:center.clone().add(new THREE.Vector3(base===3?-.36:.36,.72,1).normalize().multiplyScalar(distance)),target:center,fov,shot:receiving?'base-play':plan.ground?'infield':'outfield',points:points.map(p=>p.toArray())};
 }
 const times=()=>plan?.legs.map(l=>({base:l.base,time:l.decisionAt,receiveAt:l.end,action:l.action,runnerFrom:l.runner?.from,out:Boolean(l.runner?.out)}))||[];
 reset();return {setHands(seed){fielders.forEach((p,i)=>{let h=2166136261;for(const c of String(seed)+':fielder:'+i)h=Math.imul(h^c.charCodeAt(0),16777619);p.throwHand=[1,2,3].includes(i)?'R':(h>>>(i*3))&1?'L':'R';const sign=p.throwHand==='L'?-1:1;p.root.scale.x=sign;p.badge.scale.x=sign;})},settle(){resetPitcher();fielders.forEach(p=>{p.root.position.copy(p.home);p.root.rotation.set(0,0,0);ready(p)})},setCatcher(p){catcher=p;catcher.name='포수'},setUniform(color){fielders.forEach(p=>p.setUniform(color))},begin,update,reset,cameraFrame,get flight(){return plan?.ballFlight},get throwTimes(){return times()},get active(){return Boolean(plan)},get stage(){return stage},get duration(){return plan?.duration||0},get label(){if(!plan)return '';const leg=plan.legs[throwIndex];return stage==='chase'?plan.fielder.name+' 타구 처리':stage==='gather'?(leg?.source.name||plan.fielder.name)+' 송구 준비':stage==='carry'?(leg.base===4?'홈':leg.base+'루')+' 베이스 터치':stage==='tag'?'글러브 태그':stage==='throw'?leg.source.name+' → '+(leg.base===4?'홈':leg.base+'루')+' 송구':'포구 완료'},snapshot(){const leg=plan?.legs[throwIndex];return {stage,kind:plan?.kind,style:plan?.style,angle:plan?.angle,throwIndex,throws:plan?.throws||[],throwTimes:times(),catchAt:plan?.catchAt,elapsed,strategy:plan?.field?.strategy,support:plan?.support.map(t=>({name:t.player.name,role:t.role,target:t.dest.toArray(),position:t.player.root.position.toArray()}))||[],baseAction:leg?.action,receiverGlove:leg?hand(leg.receiver).toArray():null,receiverFeet:leg?.receiver.legs.map(l=>l.foot.getWorldPosition(new THREE.Vector3()).toArray()),fielders:fielders.map(p=>({name:p.name,throwHand:p.throwHand||'R',position:p.root.position.toArray()})),fielder:plan?.fielder.name,receiver:leg?.receiver.name}}};
}
