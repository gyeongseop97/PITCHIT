// Assign support by baseball position. Only the receiver and one right-side
// backup go toward first on a routine grounder; other players keep their area.
const homes=[[19,0,-21],[9,0,-30],[-12,0,-27],[-21,0,-20],[-35,0,-62],[0,0,-65],[33,0,-62],[0,.22,-18.44]];
const bags=[[0,0,0],[19.4,0,-19.4],[0,0,-38.8],[-19.4,0,-19.4],[0,0,0]];
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const approach=(from,to,limit)=>{const u=Math.min(1,limit/Math.max(.01,distance(from,to)));return from.map((v,i)=>v+(to[i]-v)*u)};
export function defensiveCoverage({ground,hit,end,fielder,reserved=[],throws=[],runs=[]}){
 const assigned=new Set(reserved),tasks=[];
 const add=(index,role,target)=>{if(assigned.has(index))return false;assigned.add(index);tasks.push({index,role,target});return true;};
 const needs=base=>runs.some(r=>r.from===base||r.to===base)&&!throws.includes(base);
 // Dedicated infield responsibilities. Never pick a random free infielder
 // as the first-base backup and leave second/third undefended.
 if(!reserved.includes(0))add(0,'1루 커버',[19.7,0,-19.2]);
 if(needs(3)&&!add(3,'3루 커버',[-19.7,0,-19.2]))for(const i of [2,1])if(add(i,'3루 커버',[-19.7,0,-19.2]))break;
 if(needs(2)){
  const choices=end[0]<0?[1,2]:[2,1];for(const i of choices)if(add(i,'2루 커버',[i===1?.4:-.4,0,-38.5]))break;
 }
 const last=throws.at(-1)||2;
 if(!ground&&Math.hypot(end[0],end[2])>42){
  const cutoff=approach(end,bags[last],distance(end,bags[last])*.55);
  for(const i of end[0]<0?[2,1]:[1,2])if(add(i,'중계 대기',cutoff))break;
  const outfield=[4,5,6].filter(i=>!assigned.has(i));
  if(outfield.length){const backup=outfield.sort((a,b)=>distance(homes[a],end)-distance(homes[b],end))[0],length=Math.max(1,Math.hypot(end[0],end[2]));add(backup,'타구 백업',[end[0]+end[0]/length*5,0,end[2]+end[2]/length*5]);}
 }else if(ground){
  // Outfield ground-ball backup stays in each player's lane.
  add(4,'좌측 타구 백업',approach(homes[4],[Math.min(-17,end[0]),0,Math.min(-26,end[2])],10));
  add(5,'중앙 타구 백업',approach(homes[5],[Math.max(-10,Math.min(10,end[0])),0,Math.min(-42,end[2]-6)],10));
  add(6,last===1?'1루 송구 백업':'우측 타구 백업',last===1?[27,0,-24]:approach(homes[6],[Math.max(17,end[0]),0,Math.min(-26,end[2])],10));
 }
 const homePlay=last===4||runs.some(r=>r.to===4&&!r.stopped);
 add(7,homePlay?'홈 송구 백업':'마운드 주변 커버',homePlay?[0,0,5]:approach(homes[7],[end[0],0,end[2]],2.5));
 for(let i=0;i<7;i++)if(!assigned.has(i))add(i,'담당 구역 유지',approach(homes[i],end,i>=4?4:2));
 return tasks;
}
