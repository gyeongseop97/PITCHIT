// Deterministic presentation from the resolved play. Never rolls a new result.
import {flightProfile} from './batted-flight.js';
export const BASES=[[0,0,0],[19.4,0,-19.4],[0,0,-38.8],[-19.4,0,-19.4],[0,0,0]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function normalizeOutcome(play={}){
 const out=play.outcome||'',text=String(play.playText||play.text||'');
 if(['single','double','triple','homerun','groundout','double_play','infield_flyout','outfield_flyout','foul','ball','walk','swinging_strike'].includes(out))return out;
 // Local games pass CSS feedback categories (hit/out/strike), not outcomes.
 if(/홈런/.test(text))return 'homerun';
 if(/3루타/.test(text))return 'triple';
 if(/2루타/.test(text))return 'double';
 if(/안타/.test(text))return 'single';
 if(/병살/.test(text))return 'double_play';
 if(/땅볼/.test(text))return 'groundout';
 if(/내야.*뜬공|내야.*플라이/.test(text))return 'infield_flyout';
 if(/뜬공|플라이/.test(text))return 'outfield_flyout';
 if(/파울/.test(text))return 'foul';
 if(/볼넷/.test(text))return 'walk';
 if(/삼진|스트라이크|헛스윙|루킹/.test(text))return 'swinging_strike';
 if(/^볼(?:[ ·!]|$)/.test(text))return 'ball';
 return 'unknown';
}
export function planPlay(play={}){
 const text=play.playText||play.text||'',out=normalizeOutcome(play);
 let hash=2166136261;for(const c of String(play.key||out))hash=Math.imul(hash^c.charCodeAt(0),16777619);const variation=(hash>>>0)%997/997;
 const variant=(hash>>>0)%3;
 const col=Number.isInteger(play.actualCell)?play.actualCell%5:2,row=Number.isInteger(play.actualCell)?Math.floor(play.actualCell/5):2;
 const aim=Number.isInteger(play.batCell)?play.batCell%5:col;
 const hand=play.batHand==='L'?-1:1;
 const angle=clamp((col-2)*.23+(col-aim)*.09+(variation-.5)*.95-hand*.06,-.73,.73);
 const groundPlay=play.groundPlay,runningPlay=groundPlay||play.runningPlay;
 const dp=groundPlay?.kind==='double_play'||out==='double_play'||play.outsRecorded===2||/병살/.test(text),force=groundPlay?.kind==='force_out'||/타자 주자 1루 생존/.test(text);
 const walk=out==='walk'||/볼넷/.test(text),foul=out==='foul',home=out==='homerun';
 const fly=/flyout/.test(out),infieldHit=out==='single'&&/내야안타/.test(text);
 const ground=out==='groundout'||dp||infieldHit||(out==='single'&&row>=3);
 const hit=['single','double','triple'].includes(out),contact=hit||home||foul||ground||fly;
 const kind=dp?'double_play':force?'force_out':infieldHit?'infield_single':walk?'walk':out;
 let distance=home?109+variation*14:out==='triple'?84+variation*13:out==='double'?75+variation*16:infieldHit?17+variation*5:ground&&!hit?23+variation*9:out==='infield_flyout'?21+variation*10:out==='outfield_flyout'?61+variation*22:ground?48+variation*12:out==='single'?51+variation*14:24+variation*10;
 let a=foul?(variation>.5?1:-1)*(1.0+variation*.4):angle;
 if(groundPlay?.field){distance=Math.hypot(groundPlay.field.position[0],groundPlay.field.position[2]);a=Math.atan2(groundPlay.field.position[0],-groundPlay.field.position[2]);}
 const end=groundPlay?.field?[...groundPlay.field.position]:[Math.sin(a)*distance,0,-Math.cos(a)*distance];
 const flight=flightProfile({distance,ground,infieldHit,home,foul,fly,out,variant,variation,angle:a,batHand:play.batHand});
 const catchAt=flight.duration,apex=flight.apex;
 const before=play.basesBefore||[0,0,0],after=play.basesAfter;
 const runs=[],count=home?4:out==='triple'?3:out==='double'?2:1;
 if(contact&&!foul){runs.push({from:0,to:fly?1:count,delay:.48,out:fly||(ground&&!hit&&!force)});}
 if(walk)runs.push({from:0,to:1,delay:.3,walk:true});
 // Match runners from front to back; no overtaking. Server destinations win.
 let destinations=after?after.map((v,i)=>v?i+1:0).filter(Boolean):[];
 const batterSafe=hit||home||force||walk;
 if(batterSafe&&count<4){const at=destinations.indexOf(walk||force?1:count);if(at>=0)destinations.splice(at,1);}
 let scored=after?Math.max(0,before.filter(Boolean).length-((dp||force)&&before[0]?1:0)-destinations.length):0;
 for(let i=2;i>=0;i--){if(!before[i])continue;const from=i+1;
  if((dp||force)&&i===0){runs.push({from,to:2,delay:.1,out:true,slide:true});continue;}
  let to=from;
  if(home)to=4;
  else if(foul||(!contact&&!walk)||dp)to=from;
  else if(after){if(scored>0){to=4;scored--;}else{const candidate=destinations.filter(b=>b>=from).at(-1);if(candidate){to=candidate;destinations.splice(destinations.indexOf(candidate),1)}}}
  else if(hit)to=Math.min(4,from+count);
  else if(walk){to=(i===0||before.slice(0,i).every(Boolean))?from+1:from;}
  else if(fly)to=text.includes(`${from}루 주자 태그업`)?from+1:from;
  else if(ground)to=text.includes(`${from}루 주자`)?Math.min(4,from+1):from;
  const returnAfterForce=ground&&!hit&&to===from&&before.slice(0,from).every(Boolean);
  runs.push({from,to,delay:fly?catchAt+.18:.12,walk,slide:to<4&&to>from&&!walk&&!home,tagUp:fly&&to>from,returnAfterForce,attemptTo:returnAfterForce?from+1:undefined});
 }
 // Authoritative runner identities survive force outs, equal speed ratings,
 // inning changes and empty post-play bases. Never infer a score from absence.
 if(runningPlay?.runnerMoves){runs.splice(0,runs.length,...runningPlay.runnerMoves.map(r=>({...r,walk,delay:r.from===0?(walk?.3:.48):r.tagUp?catchAt+.18:.08,slide:r.from>0&&r.to>r.from&&!walk&&!home,attemptTo:r.retreat?r.from+1:undefined})));}
 const throws=runningPlay?.throws|| (dp?[2,1]:ground&&!hit?[force?2:1]:infieldHit?[1]:fly?[runs.some(r=>r.to===4&&r.from>0)?4:2]:out==='triple'?[2,3]:out==='double'?[2]:hit?[2]:[]);
 return {variant,kind,out,contact,ground,fly,hit,home,foul,walk,infieldHit,angle:a,end,apex,catchAt,throws,runs,distance,flight,field:groundPlay?.field,inningEnded:Boolean(runningPlay?.inningEnded)};
}
