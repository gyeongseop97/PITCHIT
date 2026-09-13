// Deterministic presentation from the resolved play. Never rolls a new result.
export const BASES=[[0,0,0],[19.4,0,-19.4],[0,0,-38.8],[-19.4,0,-19.4],[0,0,0]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function planPlay(play={}){
 const text=play.playText||play.text||'',out=play.outcome||'';
 let hash=2166136261;for(const c of String(play.key||out))hash=Math.imul(hash^c.charCodeAt(0),16777619);const variation=(hash>>>0)%997/997;
 const variant=(hash>>>0)%3;
 const col=Number.isInteger(play.actualCell)?play.actualCell%5:2,row=Number.isInteger(play.actualCell)?Math.floor(play.actualCell/5):2;
 const aim=Number.isInteger(play.batCell)?play.batCell%5:col;
 const angle=clamp((col-2)*.25+(col-aim)*.09+(variation-.5)*.65,-.76,.76);
 const dp=out==='double_play'||play.outsRecorded===2||/병살/.test(text),force=/타자 주자 1루 생존/.test(text);
 const walk=out==='walk'||/볼넷/.test(text),foul=out==='foul',home=out==='homerun';
 const fly=/flyout/.test(out),infieldHit=out==='single'&&/내야안타/.test(text);
 const ground=out==='groundout'||dp||infieldHit||(out==='single'&&row>=3);
 const hit=['single','double','triple'].includes(out),contact=hit||home||foul||ground||fly;
 const kind=dp?'double_play':force?'force_out':infieldHit?'infield_single':walk?'walk':out;
 const distance=home?106:out==='triple'?83:out==='double'?76:infieldHit?18:ground&& !hit?24:out==='infield_flyout'?23:out==='outfield_flyout'?63:ground?46:out==='single'?51:24;
 const a=foul?(variation>.5?1:-1)*(1.0+variation*.4):angle;
 const end=[Math.sin(a)*distance,0,-Math.cos(a)*distance];
 const catchAt=home?4.6:foul?2.6:infieldHit?2.65:ground?hit?3.0:1.45:out==='infield_flyout'?2.7:out==='outfield_flyout'?3.6:out==='triple'?5.5:out==='double'?4.6:3.1;
 const apex=home?24+variant*3:foul?[.6,8,16][variant]:ground?.25+variant*.15:fly?out==='infield_flyout'?15:22:out==='triple'?9:out==='double'?8:4.5;
 const before=play.basesBefore||[0,0,0],after=play.basesAfter;
 const runs=[],count=home?4:out==='triple'?3:out==='double'?2:1;
 if(contact&&!foul){runs.push({from:0,to:fly?0:count,delay:.3,out:fly||(ground&&!hit&&!force),retreat:fly});}
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
  runs.push({from,to,delay:fly?catchAt+.18:.12,walk,slide:to<4&&to>from&&!walk&&!home,tagUp:fly&&to>from});
 }
 const throws=dp?[2,1]:ground&&!hit?[force?2:1]:infieldHit?[1]:fly?[runs.some(r=>r.to===4&&r.from>0)?4:2]:out==='triple'?[2,3]:out==='double'?[2]:hit?[2]:[];
 return {variant,kind,out,contact,ground,fly,hit,home,foul,walk,infieldHit,angle:a,end,apex,catchAt,throws,runs,distance};
}
