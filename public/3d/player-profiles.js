// A profile belongs to a roster slot for the entire game, including replays.
const hash=value=>{let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return (h^(h>>>16))>>>0};
export const PITCH_FORMS=Object.freeze([
 {name:'오버핸드',lift:.43,slot:1.77,reach:-.24,coil:.40,stride:.62,tempo:1},
 {name:'스리쿼터',lift:.35,slot:1.57,reach:-.43,coil:.48,stride:.66,tempo:.94},
 {name:'컴팩트',lift:.24,slot:1.69,reach:-.30,coil:.28,stride:.52,tempo:.90},
 {name:'하이킥',lift:.55,slot:1.79,reach:-.23,coil:.44,stride:.68,tempo:1.08}
]);
export const BAT_FORMS=Object.freeze([
 {name:'스탠더드',width:.28,crouch:0,gripY:1.26,gripZ:.23,load:.14,waggle:.035},
 {name:'와이드',width:.33,crouch:.035,gripY:1.23,gripZ:.26,load:.10,waggle:.025},
 {name:'업라이트',width:.24,crouch:-.025,gripY:1.31,gripZ:.20,load:.17,waggle:.04},
 {name:'컴팩트',width:.29,crouch:.04,gripY:1.21,gripZ:.20,load:.12,waggle:.02}
]);
export function playerProfile(seed,id,role){const h=hash(seed+':'+id);return {id,hand:h&1?'L':'R',form:(h>>>5)%4,...(role==='pitcher'?PITCH_FORMS:BAT_FORMS)[(h>>>5)%4]};}
