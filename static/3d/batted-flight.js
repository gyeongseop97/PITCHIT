// Presentation trajectory in metres/seconds. A resolved result chooses a
// profile; sampling it never changes the result or rolls another random value.
const GRAVITY = 9.81;
const BALL_HEIGHT = .085;
const clamp = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };

export function flightProfile({distance, ground, infieldHit, home, foul, fly, out, variant, variation, angle, batHand}) {
 const curve = (batHand === 'L' ? -1 : 1) * (variant - 1) * .7;
 if (home || fly || (foul && variant !== 0)) {
  const duration = home ? 4.8 + variation * .45 : out === 'infield_flyout' ? 3.05 + variation * .4 : foul ? 2.6 + variant * .4 : 3.5 + variation * .6;
  const drag = home ? .20 : .14;
  return {type:home?'home_run':out==='infield_flyout'?'popup':foul?'foul_fly':'fly_ball', airTime:duration, duration, drag, curve, exitSpeed:distance * drag / (1 - Math.exp(-drag * duration)), apex:GRAVITY * duration * duration / 8};
 }
 const rolling = ground || foul;
 const speed = infieldHit ? 17 + variation * 3 : rolling ? 29 + variation * 7 : (out === 'single' ? 39 : 43) + variation * 3 - variant * 1.5;
 const fraction = rolling ? (infieldHit ? .06 : .12) : out === 'single' ? [.54,.70,.84][variant] : [.72,.84,.93][variant];
 const drag = .14, airTime = -Math.log(1 - distance * fraction * drag / speed) / drag;
 const landingSpeed = speed * Math.exp(-drag * airTime), tailSpeed = infieldHit ? 1.2 : rolling ? 5 : 6;
 const rollTime = 2 * distance * (1 - fraction) / (landingSpeed + tailSpeed);
 const pickupDelay = infieldHit ? .95 : 0;
 return {type:infieldHit?'slow_roller':rolling?'ground_ball':variant===2?'driven_ball':'line_drive', exitSpeed:speed, drag, airTime, rollTime, landingSpeed, tailSpeed, fraction, pickupDelay, duration:airTime+rollTime+pickupDelay, restitution:rolling?.33:.38, curve, apex:0};
}

export function createBattedFlight(shot, start, end = shot.end) {
 return {profile:shot.flight, start:[...start], end:[...end]};
}

function bounceHeight(time, impactSpeed, restitution) {
 let speed = impactSpeed * restitution;
 for (let i=0; i<7 && speed>.12; i++) {
  const duration = 2 * speed / GRAVITY;
  if (time <= duration) return Math.max(0, speed*time - GRAVITY*time*time/2);
  time -= duration; speed *= .42;
 }
 return 0;
}

export function sampleBattedFlight(flight, elapsed) {
 const {profile:p,start,end} = flight, t = Math.max(0, Math.min(elapsed, p.duration));
 let progress, y;
 if (!p.rollTime) {
  progress = (1-Math.exp(-p.drag*t))/(1-Math.exp(-p.drag*p.duration));
  const vy = (end[1]-start[1]+GRAVITY*p.duration*p.duration/2)/p.duration;
  y = start[1]+vy*t-GRAVITY*t*t/2;
 } else {
  const vy = (BALL_HEIGHT-start[1]+GRAVITY*p.airTime*p.airTime/2)/p.airTime;
  if (t < p.airTime) {
   progress = p.fraction*(1-Math.exp(-p.drag*t))/(1-Math.exp(-p.drag*p.airTime));
   y = start[1]+vy*t-GRAVITY*t*t/2;
  } else {
   const roll = Math.min(t-p.airTime,p.rollTime), deceleration = (p.landingSpeed-p.tailSpeed)/p.rollTime;
   const covered = p.landingSpeed*roll-deceleration*roll*roll/2;
   progress = p.fraction+(1-p.fraction)*covered/((p.landingSpeed+p.tailSpeed)*p.rollTime/2);
   y = BALL_HEIGHT+bounceHeight(t-p.airTime,Math.abs(vy-GRAVITY*p.airTime),p.restitution);
   // The last few centimetres belong to the glove, not an artificial high arc.
   y += (end[1]-y)*smooth((t-(p.duration-.12))/.12);
  }
 }
 const dx=end[0]-start[0], dz=end[2]-start[2], length=Math.hypot(dx,dz)||1;
 const bend=p.curve*Math.sin(progress*Math.PI);
 return [start[0]+dx*progress-dz/length*bend, y, start[2]+dz*progress+dx/length*bend];
}
