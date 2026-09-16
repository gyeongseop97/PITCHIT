// A profile belongs to a roster slot for the entire game, including replays.
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0};
export const PITCH_FORMS=Object.freeze([
 {name:'오버핸드',lift:.43,slot:1.77,reach:-.24,coil:.40,stride:.62,tempo:1},
 {name:'스리쿼터',lift:.35,slot:1.57,reach:-.43,coil:.48,stride:.66,tempo:.94},
 {name:'컴팩트',lift:.24,slot:1.69,reach:-.30,coil:.28,stride:.52,tempo:.90},
 {name:'하이킥',lift:.55,slot:1.79,reach:-.23,coil:.44,stride:.68,tempo:1.08},
 {name:'사이드암',lift:.28,slot:1.24,reach:-.56,coil:.56,stride:.68,tempo:1,cockY:1.47,cockX:-.56,lean:.16},
 {name:'퀵 모션',lift:.16,slot:1.62,reach:-.34,coil:.24,stride:.49,tempo:.88,cockY:1.54,cockX:-.40,lean:.03}
]);
export const BAT_FORMS=Object.freeze([
 {name:'스탠더드',width:.28,crouch:0,gripY:1.26,gripZ:.23,load:.14,waggle:.035},
 {name:'와이드',width:.33,crouch:.035,gripY:1.23,gripZ:.26,load:.10,waggle:.025},
 {name:'업라이트',width:.24,crouch:-.025,gripY:1.31,gripZ:.20,load:.17,waggle:.04},
 {name:'컴팩트',width:.29,crouch:.04,gripY:1.21,gripZ:.20,load:.12,waggle:.02},
 {name:'오픈 스탠스',width:.32,crouch:.02,gripY:1.29,gripZ:.25,load:.19,waggle:.05,open:.14},
 {name:'레그킥',width:.27,crouch:0,gripY:1.32,gripZ:.23,load:.21,waggle:.045,kick:.16}
]);
export const BODY_TYPES=Object.freeze([
 {id:'balanced',name:'균형형',chest:1,waist:1,depth:1,arm:1,leg:1,torsoExtra:0},
 {id:'lean',name:'슬림형',chest:.88,waist:.86,depth:.87,arm:.88,leg:.92,torsoExtra:.025},
 {id:'power',name:'파워형',chest:1.16,waist:1.09,depth:1.15,arm:1.18,leg:1.12,torsoExtra:.015},
 {id:'tall',name:'장신형',chest:.97,waist:.94,depth:.97,arm:.98,leg:.97,torsoExtra:.085},
 {id:'compact',name:'다부진형',chest:1.06,waist:1.06,depth:1.06,arm:1.06,leg:1.09,torsoExtra:-.055}
]);
export function playerProfile(seed,id,role){const h=hash(seed+':'+id),forms=role==='pitcher'?PITCH_FORMS:BAT_FORMS,form=(h>>>5)%forms.length;return {id,hand:h&1?'L':'R',form,...forms[form],body:BODY_TYPES[(h>>>12)%BODY_TYPES.length]};}
