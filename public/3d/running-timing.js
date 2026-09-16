// Shared arrival times for runners, receivers and calls, in seconds after contact.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function runnerDuration(shot,r){
 const speed=r.speed&&r.speed!==1?r.speed:55,pace=clamp(3.25-(speed-55)/130,2.9,3.6);
 if(r.returnAfterForce)return Math.max(1,2*(shot.catchAt-r.delay)+.4);
 if(r.retreat)return shot.catchAt+.3;
 if(r.walk)return 4.8;
 if(shot.home)return Math.max(1,r.to-r.from)*2.15;
 return Math.max(1,r.to-r.from)*(r.from===0&&r.to===1?3.8:pace);
}
export function runnerProgress(elapsed,duration){
 const acceleration=.3,t=Math.max(0,elapsed),travel=t<acceleration?t*t/(2*acceleration):t-acceleration/2;
 return clamp(travel/Math.max(.1,duration-acceleration/2),0,1);
}
export function planRunner(shot,r,throws){
 const target=throws.find(l=>l.base===r.to),outAt=r.out?(shot.fly?shot.catchAt:target?.time):undefined;
 let duration=runnerDuration(shot,r);
 if(outAt!=null&&!r.retreat&&!shot.fly)duration=Math.max(duration,outAt+(target?.action==='tag'?.02:.18)-r.delay);
 return {...r,outAt,arrival:r.delay+duration,duration,runThrough:r.from===0&&r.to===1&&!r.out&&!r.walk,stopAt:shot.inningEnded&&!r.out?(shot.fly?shot.catchAt:throws.at(-1)?.time):undefined};
}
