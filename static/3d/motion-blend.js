import * as THREE from './vendor/three.module.min.js';
import {plantFoot} from './rig-poses.js';
const clamp=v=>Math.max(0,Math.min(1,v));
export const smoothStep=v=>{v=clamp(v);return v*v*(3-2*v)};
export function capturePose(p){return p.bodyMesh.skeleton.bones.map(b=>({position:b.position.clone(),rotation:b.quaternion.clone()}));}
export function blendPose(p,from,amount){if(!from)return;const u=smoothStep(amount);p.bodyMesh.skeleton.bones.forEach((b,i)=>{b.position.lerpVectors(from[i].position,b.position,u);b.quaternion.slerpQuaternions(from[i].rotation,b.quaternion,u)});}
// Foot targets follow distance travelled. During stance the planted foot moves
// back relative to the root; the recovery foot lifts instead of sliding.
export function locomotionPose(p,distance,speed=7){
 const strength=clamp(speed/5),stride=.55+strength*.22,cycle=distance/(stride/.55),phase=cycle%1;
 p.hip.rotation.set(0,Math.sin(phase*Math.PI*2)*.07*strength,0);p.hip.position.set(0,.735+Math.sin(phase*Math.PI*4)*.012*strength,0);p.torso.rotation.set(.10+strength*.12,-p.hip.rotation.y*.6,0);p.head.rotation.set(.02,0,0);
 for(let i=0;i<2;i++){
  const u=(phase+i*.5)%1,stance=u<.55,z=stance?stride*(.5-u/.55):stride*(-.5+smoothStep((u-.55)/.45));
  const lift=stance?0:Math.sin((u-.55)/.45*Math.PI)*.27*strength;
  plantFoot(p,i,new THREE.Vector3(i?-.13:.13,.08+lift,z*strength));
 }
 const arm=Math.sin(phase*Math.PI*2)*.68*strength;p.left.pivot.rotation.set(arm,0,-.12);p.right.pivot.rotation.set(-arm,0,.12);p.left.elbow.rotation.set(-1.1,0,0);p.right.elbow.rotation.set(-1.1,0,0);
}
