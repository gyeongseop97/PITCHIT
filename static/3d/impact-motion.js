// Short camera impulses, sampled against the existing play clock. No time stop,
// no turn delay, and no movement of selection controls or page layout.
const shapes={contact:{duration:.23,amount:.0045,zoom:.018},soft:{duration:.16,amount:.0017,zoom:.006},strike:{duration:.14,amount:.0016,zoom:.006},strikeout:{duration:.32,amount:.006,zoom:.028},out:{duration:.18,amount:.0028,zoom:.009},homerun:{duration:.38,amount:.0055,zoom:.025}};
export function createImpactMotion(reduced=false){
 let current=null,age=1,count=0;
 return {trigger(kind){const shape=shapes[kind];if(!shape)return false;current={kind,...shape};age=0;count++;return true;},clear(){current=null;age=1;},sample(dt){if(!current)return {active:false,x:0,y:0,roll:0,zoom:0,count};age+=dt;const u=Math.min(1,age/current.duration),envelope=(1-u)**3,amount=reduced?0:current.amount*envelope;const frame={active:u<1,kind:current.kind,x:Math.sin(age*93)*amount,y:Math.cos(age*77)*amount*.6,roll:Math.sin(age*65)*amount*.45,zoom:reduced?0:current.zoom*envelope,count};if(u===1)current=null;return frame;},get count(){return count}};
}
