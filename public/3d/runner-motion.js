import {BASES} from './play-plan.js';
const clamp=v=>Math.max(0,Math.min(1,v));
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const scale=(a,k)=>a.map(v=>v*k);
// Hermite segments touch each bag exactly and share tangents across turns.
export function runnerPoint(from,to,progress,start=BASES[from]){
 const count=Math.max(1,to-from),part=clamp(progress)*count,index=Math.min(count-1,Math.floor(part)),u=part-index;
 const a=index===0?start:BASES[from+index],b=BASES[Math.min(4,from+index+1)];
 const prior=index?BASES[from+index-1]:null,next=from+index+2<=to?BASES[from+index+2]:null;
 const m0=prior?scale(sub(b,prior),.5):sub(b,a),m1=next?scale(sub(next,a),.5):sub(b,a);
 const u2=u*u,u3=u2*u;
 const point=a.map((v,i)=>(2*u3-3*u2+1)*v+(u3-2*u2+u)*m0[i]+(-2*u3+3*u2)*b[i]+(u3-u2)*m1[i]);
 const tangent=a.map((v,i)=>(6*u2-6*u)*v+(3*u2-4*u+1)*m0[i]+(-6*u2+6*u)*b[i]+(3*u2-2*u)*m1[i]);
 return {point,yaw:Math.atan2(tangent[0],tangent[2])};
}
export function leadPosition(base,amount=1.15){const a=BASES[base],b=BASES[base+1],length=Math.hypot(...sub(b,a));return mix(a,b,amount/length);}
