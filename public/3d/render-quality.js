export const QUALITY={low:{pixelRatio:1,shadow:0,crowd:0,trail:5},medium:{pixelRatio:1.3,shadow:1024,crowd:.45,trail:8},high:{pixelRatio:1.7,shadow:2048,crowd:1,trail:12}};
export function initialQuality({mobile=false,cores=8,memory=8}={}){return cores<=4||memory<=4?'low':mobile?'medium':'high';}
// Only lower automatically, at a play boundary; never change a play's timing.
export function createQualityController(initial='high'){
 let mode='auto',level=initial,samples=[],cooldown=0;
 return {set(value){mode=['auto','low','medium','high'].includes(value)?value:'auto';if(mode!=='auto')level=mode;samples=[];cooldown=0;return level;},sample(ms,ready){if(mode!=='auto'||ms<=0||ms>150)return null;samples.push(ms);if(samples.length>180)samples.shift();cooldown++;if(!ready||samples.length<120||cooldown<180||level==='low')return null;const average=samples.reduce((a,b)=>a+b,0)/samples.length;if(average<27)return null;level=level==='high'?'medium':'low';samples=[];cooldown=0;return level;},get mode(){return mode},get level(){return level}};
}
