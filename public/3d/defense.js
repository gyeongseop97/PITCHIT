// Choreography for an already resolved play. No outs, runs or probabilities here.
export function createDefense({THREE,player,sphere,scene}) {
 const clamp=(n)=>Math.max(0,Math.min(1,n));
 const positions=[['1루수',19,-21],['2루수',9,-30],['유격수',-12,-27],['3루수',-21,-20],['좌익수',-35,-62],['중견수',0,-65],['우익수',33,-62]];
 const fielders=positions.map(([name,x,z],i)=>{const p=player('#9d4336',x,z,String(i+3).padStart(2,'0'));p.name=name;p.home=p.root.position.clone();p.glove=sphere(.15,'#865936',0,0,.04,p.left.hand);p.glove.scale.set(1,1.2,.6);return p});
 let plan=null,stage='ready';

 function ready(p){p.hip.position.y=.81;p.torso.rotation.set(.14,0,0);p.left.pivot.rotation.set(-.55,0,-.18);p.right.pivot.rotation.set(-.55,0,.18);p.left.elbow.rotation.x=-.4;p.right.elbow.rotation.x=-.4;p.legs.forEach((leg,i)=>{leg.pivot.rotation.set(-.1,0,i?-.16:.16);leg.knee.rotation.x=.18})}
 function catchPose(p,ground){ready(p);p.hip.position.y=ground?.55:.82;p.torso.rotation.x=ground?.5:0;p.left.pivot.rotation.x=ground?-.6:-2.25;p.left.elbow.rotation.x=ground?-.15:-.3;}
 function hand(p,which='left'){scene.updateMatrixWorld(true);return p[which].hand.getWorldPosition(new THREE.Vector3())}
 function reset(){plan=null;stage='ready';fielders.forEach(p=>{p.root.position.copy(p.home);p.root.rotation.y=0;ready(p)})}
 function begin(play,start){
  reset();const out=play.outcome||'',text=play.text||'';
  if(out==='homerun'||out==='foul'||/홈런|파울/.test(text))return false;
  const ground=out==='groundout'||/땅볼|병살/.test(text),fly=/flyout/.test(out)||/뜬공/.test(text),infield=out==='infield_flyout';
  const index=ground||infield?2:out==='triple'?4:out==='double'||fly?6:5;
  const fielder=fielders[index],receiver=fielders[ground?0:1];
  const end=new THREE.Vector3(...(ground?[-10,0,-21]:infield?[-10,0,-24]:index===4?[-35,0,-66]:index===6?[29,0,-59]:[10,0,-49]));
  const from=fielder.root.position.clone();fielder.root.position.copy(end);catchPose(fielder,ground);const catchPoint=hand(fielder);fielder.root.position.copy(from);ready(fielder);
  receiver.root.position.set(...(ground?[19.4,0,-19.4]:[0,0,-38.8]));catchPose(receiver,false);
  plan={fielder,receiver,from,end,start:start.clone(),catchPoint,ground,fly,catchAt:ground?1.5:infield?2.4:3.2,throwAt:ground?2.15:infield?3.05:3.85,throwDuration:1.05,throwStart:null};stage='chase';return true;
 }
 function update(t,ball){
  if(!plan)return false;
  const p=plan,f=p.fielder;
  if(t<p.catchAt){
   stage='chase';const u=clamp(t/p.catchAt);f.root.position.lerpVectors(p.from,p.end,u);ready(f);
   const stride=Math.sin(t*15)*.55*(1-u);f.legs[0].pivot.rotation.x=stride;f.legs[1].pivot.rotation.x=-stride;f.hip.position.y+=Math.abs(Math.sin(t*15))*.035;
   if(u>.86)catchPose(f,p.ground);
   ball.position.lerpVectors(p.start,p.catchPoint,u);
   ball.position.y+=p.ground?Math.abs(Math.sin(u*Math.PI*3))*.32*(1-u):Math.sin(Math.PI*u)*(p.fly?13:5);
  }else if(t<p.throwAt){
   stage='gather';f.root.position.copy(p.end);catchPose(f,p.ground);
   const u=clamp((t-p.catchAt)/(p.throwAt-p.catchAt));f.hip.position.y=THREE.MathUtils.lerp(p.ground?.55:.82,.86,u);f.torso.rotation.x*=1-u;
   f.root.rotation.y=Math.atan2(p.receiver.root.position.x-f.root.position.x,p.receiver.root.position.z-f.root.position.z)*u;
   f.right.pivot.rotation.x=THREE.MathUtils.lerp(-.5,-2.7,u);f.right.elbow.rotation.x=THREE.MathUtils.lerp(-.4,-.2,u);
   ball.position.lerpVectors(hand(f),hand(f,'right'),u);p.throwStart=ball.position.clone();
  }else if(t<p.throwAt+p.throwDuration){
   stage='throw';const u=(t-p.throwAt)/p.throwDuration;
   f.right.pivot.rotation.x=THREE.MathUtils.lerp(-2.7,-.3,clamp(u*2));f.torso.rotation.x=.4*clamp(u*2);
   ball.position.lerpVectors(p.throwStart||hand(f,'right'),hand(p.receiver),u);ball.position.y+=Math.sin(u*Math.PI)*2;
  }else{stage='receive';ball.position.copy(hand(p.receiver));p.receiver.left.elbow.rotation.x=-.6;}
  ball.visible=true;return t<p.throwAt+p.throwDuration+.65;
 }
 function cameraFrame(ball,aspect){
  // Hold shot distance for the whole play: pan with the ball, never zoom in
  // at the catch and abruptly zoom out again for the throw.
  const center=ball.clone().multiplyScalar(.55).addScaledVector(plan.fielder.root.position,.25).addScaledVector(plan.receiver.root.position,.20);
  center.y=Math.max(1.2,center.y);
  const distance=(plan.ground?37:49)/Math.max(.65,Math.min(1,aspect));
  return {position:center.clone().add(new THREE.Vector3(.16,.55,.82).multiplyScalar(distance)),target:center};
 }
 reset();
 return {begin,update,reset,cameraFrame,get active(){return Boolean(plan)},get stage(){return stage},get duration(){return plan?plan.throwAt+plan.throwDuration+.65:0},get label(){return !plan?'':stage==='chase'?`${plan.fielder.name} 타구 처리 중`:stage==='gather'?`${plan.fielder.name} 포구 · 송구 준비`:stage==='throw'?`${plan.fielder.name} → ${plan.receiver.name} 송구`:`${plan.receiver.name} 포구 완료`},snapshot(){return{stage,fielders:fielders.map(p=>({name:p.name,position:p.root.position.toArray()})),fielder:plan?.fielder.name,receiver:plan?.receiver.name}}};
}
