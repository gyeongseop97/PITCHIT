import * as THREE from './vendor/three.module.min.js';
const down=new THREE.Vector3(0,-1,0);
// Solve in the joint parent's local space, so a mirrored left-handed rig has
// exactly the same reach and joint limits as its right-handed counterpart.
export function solveLimb(pivot,joint,target,a,b,pole=new THREE.Vector3(0,-1,0)) {
 pivot.parent.updateWorldMatrix(true,false);
 const local=pivot.parent.worldToLocal(target.clone()).sub(pivot.position);
 const distance=THREE.MathUtils.clamp(local.length(),Math.abs(a-b)+.005,a+b-.004),axis=local.normalize();
 const bend=pole.clone().addScaledVector(axis,-pole.dot(axis));
 if(bend.lengthSq()<.001)bend.set(0,0,1).addScaledVector(axis,-axis.z);
 bend.normalize();const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 const upper=axis.clone().multiplyScalar(along).addScaledVector(bend,height),lower=axis.clone().multiplyScalar(distance).sub(upper);
 pivot.quaternion.setFromUnitVectors(down,upper.normalize());
 joint.quaternion.setFromUnitVectors(down,lower.normalize().applyQuaternion(pivot.quaternion.clone().invert()));
}
export function reachHand(arm,target) {solveLimb(arm.pivot,arm.elbow,target,.32,.31,new THREE.Vector3(Math.sign(arm.pivot.position.x)*.28,-1,.1));}
export function plantFoot(player,index,localTarget) {
 const leg=player.legs[index];player.root.updateWorldMatrix(true,false);
 solveLimb(leg.pivot,leg.knee,player.root.localToWorld(localTarget.clone()),.39,.34,new THREE.Vector3(0,0,1));
 leg.knee.updateWorldMatrix(true,false);
 const facing=player.root.getWorldQuaternion(new THREE.Quaternion());
 leg.foot.quaternion.copy(leg.knee.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(facing));
}
