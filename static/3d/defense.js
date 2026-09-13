import {BASES,planPlay} from './play-plan.js';
// Ball, fielder and relay share one timeline and explicit possession.
export function createDefense({THREE,player,sphere,scene,pitcher}) {
 const clamp=n=>Math.max(0,Math.min(1,n));
 const positions=[['1루수',19,-21],['2루수',9,-30],['유격수',-12,-27],['3루수',-21,-20],['좌익수',-35,-62],['중견수',0,-65],['우익수',33,-62]];
 const fielders=positions.map(([name,x,z],i)=>{const p=player('#9d4336',x,z,String(i+3));p.name=name;p.home=p.root.position.clone();p.glove=sphere(.15,'#865936',0,0,.04,p.left.hand);p.glove.scale.set(1,1.2,.6);return p});
 let plan=null,stage='ready',throwIndex=0,catcher=null;pitcher.home=pitcher.root.position.clone();pitcher.name='투수';
 function ready(p){p.hip.position.y=.81;p.hip.rotation.set(0,0,0);p.torso.rotation.set(.14,0,0);p.left.pivot.rotation.set(-.55,0,-.18);p.right.pivot.rotation.set(-.55,0,.18);p.left.elbow.rotation.x=-.4;p.right.elbow.rotation.x=-.4;p.legs.forEach((l,i)=>{l.pivot.rotation.set(-.1,0,i?-.16:.16);l.knee.rotation.x=.18})}
 function pose(p,ground,style='basket'){ready(p);p.hip.position.y=ground?.55:.82;p.torso.rotation.x=ground?.5:0;p.left.pivot.rotation.set(ground?-.65:style==='overhead'?-2.6:-1.3,0,style==='backhand'?.5:-.18);p.left.elbow.rotation.x=ground?-.15:-.4;}
 function hand(p,which='left'){scene.updateMatrixWorld(true);return p[which].hand.getWorldPosition(new THREE.Vector3())}
 function face(p,target){p.root.rotation.y=Math.atan2(target.x-p.root.position.x,target.z-p.root.position.z)}
 function reset(){pitcher.root.position.copy(pitcher.home);plan=null;stage='ready';throwIndex=0;fielders.forEach(p=>{p.root.position.copy(p.home);p.root.rotation.set(0,0,0);ready(p)})}
 function begin(play,start){reset();const shot=play.choreography||planPlay(play);if(!shot.contact||shot.home||shot.foul)return false;
  const end=new THREE.Vector3(...shot.end),pool=shot.ground&&!shot.hit||shot.infieldHit||shot.out==='infield_flyout'?fielders.slice(0,4):fielders.slice(4);
  const fielder=pool.reduce((a,b)=>a.home.distanceTo(end)<b.home.distanceTo(end)?a:b);
  const style=shot.ground?(shot.angle<-.15?'backhand':shot.angle>.15?'forehand':'scoop'):shot.fly?'overhead':'basket';
  const from=fielder.root.position.clone();fielder.root.position.copy(end);face(fielder,start);pose(fielder,shot.ground||shot.hit,style);const catchPoint=hand(fielder);fielder.root.position.copy(from);ready(fielder);
  let source=fielder,cursor=shot.catchAt;const legs=shot.throws.map(base=>{let receiver=base===1?fielders[0]:base===3?fielders[3]:fielders[1]===source?fielders[2]:fielders[1];if(base===4&&catcher)receiver=catcher;if(receiver===source)receiver=base===1?pitcher:fielders[2];const position=new THREE.Vector3(...BASES[base]);const gather=shot.kind==='double_play'?.38:.62,duration=Math.max(.55,(base===1?29:source.home.distanceTo(position))/37);const leg={source,receiver,base,position,start:cursor,release:cursor+gather,end:cursor+gather+duration};source=receiver;cursor=leg.end;return leg});
  plan={...shot,fielder,from,end,catchPoint,start:start.clone(),style,legs,duration:cursor+.8};stage='chase';return true;
 }
 function update(t,ball){if(!plan)return false;const p=plan,f=p.fielder;
  for(const r of [...fielders,...(p.legs.some(l=>l.receiver===pitcher)?[pitcher]:[])]){if(r===f)continue;const leg=p.legs.find(l=>l.receiver===r);const dest=leg?.position||r.home.clone().lerp(p.end,.07);const u=clamp(t/Math.max(.8,p.catchAt));r.root.position.lerpVectors(r.home,dest,u);ready(r);face(r,p.end);if(u<1){const s=Math.sin(t*15)*.6;r.legs[0].pivot.rotation.x=s;r.legs[1].pivot.rotation.x=-s;}}
  if(t<p.catchAt){stage='chase';const u=clamp(t/p.catchAt),run=clamp(u*1.15);f.root.position.lerpVectors(p.from,p.end,run);ready(f);face(f,run<1?p.end:p.start);const stride=Math.sin(t*15)*.6*(run<1?1:0);f.legs[0].pivot.rotation.x=stride;f.legs[1].pivot.rotation.x=-stride;if(u>.86)pose(f,p.ground||p.hit,p.style);
   const ease=v=>(1-Math.exp(-1.6*v))/(1-Math.exp(-1.6));
   if(p.hit&&!p.infieldHit){const landing=p.ground?.12:.68,flightTime=p.ground?.12:p.distance*landing/(40+p.variant*4);let progress;
    if(t<flightTime){progress=landing*t/flightTime;ball.position.lerpVectors(p.start,p.catchPoint,progress);const vy=(.085-p.start.y+4.905*flightTime*flightTime)/flightTime;ball.position.y=Math.max(.085,p.start.y+vy*t-4.905*t*t);}
    else{const roll=clamp((t-flightTime)/(p.catchAt-flightTime));progress=landing+(1-landing)*ease(roll);ball.position.lerpVectors(p.start,p.catchPoint,progress);ball.position.y=.085+Math.abs(Math.sin(roll*Math.PI*(3+p.variant)))*.35*Math.exp(-roll*3);if(u>.92)ball.position.lerp(p.catchPoint,(u-.92)/.08);}
   }else{const progress=p.ground?ease(u):u;ball.position.lerpVectors(p.start,p.catchPoint,progress);ball.position.y+=p.ground?Math.abs(Math.sin(progress*Math.PI*(3+p.variant*2)))*.28*(1-u):4*u*(1-u)*p.apex;}

  }else{
   f.root.position.copy(p.end);const leg=p.legs.find(l=>t<l.end)||p.legs.at(-1);throwIndex=Math.max(0,p.legs.indexOf(leg));
   if(!leg){stage='receive';ball.position.copy(hand(f));}
   else if(t<leg.release){stage='gather';const s=leg.source;face(s,leg.position);const u=clamp((t-leg.start)/(leg.release-leg.start));pose(s,false);s.right.pivot.rotation.x=THREE.MathUtils.lerp(-.6,-2.7,u);s.right.elbow.rotation.x=-.3;ball.position.lerpVectors(hand(s),hand(s,'right'),u);leg.releasePoint=ball.position.clone();}
   else if(t<leg.end){stage='throw';const u=(t-leg.release)/(leg.end-leg.release);leg.source.right.pivot.rotation.x=-2.7+2.4*clamp(u*3);face(leg.receiver,leg.source.root.position);pose(leg.receiver,false);ball.position.lerpVectors(leg.releasePoint||hand(leg.source,'right'),hand(leg.receiver),u);ball.position.y+=Math.sin(u*Math.PI)*.9;}
   else{stage='receive';pose(leg.receiver,false);ball.position.copy(hand(leg.receiver));}
  }
  ball.visible=true;return t<p.duration;
 }
 function cameraFrame(ball,aspect){const center=ball.clone().multiplyScalar(.45).addScaledVector(plan.fielder.root.position,.25).addScaledVector(new THREE.Vector3(5,0,-22),.3);center.y=Math.max(1.2,center.y);const distance=(plan.ground?45:62)/Math.max(.65,Math.min(1,aspect));return {position:center.clone().add(new THREE.Vector3(.1,.65,.85).multiplyScalar(distance)),target:center};}
 reset();return {setHands(seed){fielders.forEach((p,i)=>{let h=2166136261;for(const c of String(seed)+':fielder:'+i)h=Math.imul(h^c.charCodeAt(0),16777619);p.throwHand=[1,2,3].includes(i)?'R':(h>>>(i*3))&1?'L':'R';const sign=p.throwHand==='L'?-1:1;p.root.scale.x=sign;p.badge.scale.x=sign;})},settle(){pitcher.root.position.copy(pitcher.home);fielders.forEach(p=>{p.root.position.copy(p.home);p.root.rotation.set(0,0,0);ready(p)})},setCatcher(p){catcher=p;catcher.name='포수'},setUniform(color){fielders.forEach(p=>p.setUniform(color))},begin,update,reset,cameraFrame,get active(){return Boolean(plan)},get stage(){return stage},get duration(){return plan?.duration||0},get label(){if(!plan)return '';const leg=plan.legs[throwIndex];return stage==='chase'?`${plan.fielder.name} 타구 처리`:stage==='gather'?`${leg?.source.name||plan.fielder.name} 송구 준비`:stage==='throw'?`${leg.source.name} → ${leg.base===4?'홈':leg.base+'루'} 송구`:'포구 완료'},snapshot(){return {stage,kind:plan?.kind,style:plan?.style,angle:plan?.angle,throwIndex,throws:plan?.throws||[],fielders:fielders.map(p=>({name:p.name,throwHand:p.throwHand||'R',position:p.root.position.toArray()})),fielder:plan?.fielder.name,receiver:plan?.legs[throwIndex]?.receiver.name}}};
}
