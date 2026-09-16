import {sampleBattedFlight} from './batted-flight.js';
// Contact descriptors explain the resolved animation, never change its outcome.
export function contactStyle(play,shot){
 const {home,fly,foul,infieldHit,ground,variant,variation,out}=shot;
 const actual=Number.isInteger(play.actualCell)?play.actualCell:12,aim=Number.isInteger(play.batCell)?play.batCell:actual;
 const miss=Math.hypot(actual%5-aim%5,Math.floor(actual/5)-Math.floor(aim/5));
 let kind=home||out==='double'||out==='triple'?'barrel':infieldHit?'jammed':fly?(out==='infield_flyout'?'under':variant===0?'barrel':'under'):foul?'edge':miss>1.4?(actual%5>aim%5?'tip':'jammed'):ground&&variant===0?'topped':'barrel';
 const styles={barrel:{label:'정타',barrel:.65,tilt:home?.23:ground?-.10:.08,tone:1650,volume:.25},jammed:{label:'먹힌 타구',barrel:.43,tilt:-.12,tone:520,volume:.12},tip:{label:'배트 끝',barrel:.79,tilt:.04,tone:2350,volume:.10},under:{label:'배트 아래',barrel:.62,tilt:.33,tone:850,volume:.14},topped:{label:'덮어 친 타구',barrel:.59,tilt:-.18,tone:680,volume:.16},edge:{label:'빗맞음',barrel:.77,tilt:fly?.32:.08,tone:2700,volume:.09}};
 return {kind,...styles[kind],miss,energy:kind==='barrel'?1:kind==='jammed'?.65:.82,swing:play.swing||'contact',variation};
}
export function contactFeedback(shot,flight){
 if(!shot.contact)return null;
 const start=sampleBattedFlight(flight,0),next=sampleBattedFlight(flight,.0001);
 const horizontal=Math.hypot(next[0]-start[0],next[2]-start[2])/.0001,vertical=(next[1]-start[1])/.0001;
 const angle=Math.round(Math.atan2(vertical,horizontal)*180/Math.PI);
 const direction=shot.foul?(shot.angle<0?'3루 쪽 파울':'1루 쪽 파울'):shot.angle<-.24?'좌측':shot.angle>.24?'우측':'중앙';
 return {kind:shot.impact.kind,label:shot.impact.label,speed:Math.round(Math.hypot(horizontal,vertical)*3.6),angle,direction,course:shot.ground?'땅볼':shot.flight.type==='line_drive'||shot.flight.type==='driven_ball'?'직선 타구':shot.flight.type==='popup'?'높은 내야 타구':'뜬 타구'};
}
// A short wood impulse. Uses the game's existing audio preference/context.
export function playContactSound(context,impact){
 if(!context||context.state!=='running'||!impact)return false;
 const at=context.currentTime,length=.09,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*length),context.sampleRate),data=buffer.getChannelData(0);
 let seed=8129;for(let i=0;i<data.length;i++){seed=Math.imul(seed,1664525)+1013904223|0;data[i]=((seed>>>0)/4294967296*2-1)*Math.exp(-i/(context.sampleRate*.014));}
 const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=impact.tone;filter.Q.value=.7;gain.gain.value=impact.volume;source.connect(filter).connect(gain).connect(context.destination);source.start(at);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
 const oscillator=context.createOscillator(),body=context.createGain();oscillator.type='triangle';oscillator.frequency.setValueAtTime(impact.tone*.26,at);oscillator.frequency.exponentialRampToValueAtTime(110,at+.055);body.gain.setValueAtTime(impact.volume*.32,at);body.gain.exponentialRampToValueAtTime(.001,at+.065);oscillator.connect(body).connect(context.destination);oscillator.start(at);oscillator.stop(at+.07);oscillator.onended=()=>{oscillator.disconnect();body.disconnect()};return true;
}

export function playImpactSound(context,kind,impact){
 if(kind==='contact'||kind==='soft')return playContactSound(context,impact);
 if(!context||context.state!=='running')return false;
 const profiles={strike:[170,.07,.055],strikeout:[125,.16,.13],out:[150,.10,.07],homerun:[220,.20,.10]},p=profiles[kind];if(!p)return false;
 const at=context.currentTime,osc=context.createOscillator(),gain=context.createGain();osc.type='triangle';osc.frequency.setValueAtTime(p[0]*2.1,at);osc.frequency.exponentialRampToValueAtTime(p[0],at+.045);gain.gain.setValueAtTime(p[2],at);gain.gain.exponentialRampToValueAtTime(.001,at+p[1]);osc.connect(gain).connect(context.destination);osc.start(at);osc.stop(at+p[1]+.01);osc.onended=()=>{osc.disconnect();gain.disconnect()};return true;
}
