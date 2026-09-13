import assert from 'node:assert/strict';
import {planPlay} from '../public/3d/play-plan.js';
const plans=[];for(const outcome of ['single','double','triple','homerun','foul','groundout','infield_flyout','outfield_flyout','ball','swinging_strike'])for(let cell=0;cell<25;cell++)for(let variant=0;variant<6;variant++){
 const input={key:`${variant}`,outcome,actualCell:cell,batCell:12,basesBefore:[60,70,80]};const p=planPlay(input);assert.deepEqual(p,planPlay(input));assert.ok(p.end.every(Number.isFinite));assert.ok(p.catchAt>0);if(outcome==='foul')assert.equal(p.runs.some(r=>r.to>r.from),false);if(outcome==='homerun')assert.equal(p.runs.filter(r=>r.to===4).length,4);if(outcome==='double')assert.equal(p.runs[0].to,2);if(outcome==='triple')assert.equal(p.runs[0].to,3);plans.push(p);
}
const dp=planPlay({outcome:'groundout',outsRecorded:2,basesBefore:[60,0,0],basesAfter:[0,0,0]});assert.deepEqual(dp.throws,[2,1]);assert.equal(dp.runs.filter(r=>r.out).length,2);
const force=planPlay({outcome:'groundout',text:'타자 주자 1루 생존',basesBefore:[60,0,0],basesAfter:[80,0,0]});assert.deepEqual(force.throws,[2]);assert.equal(force.runs.find(r=>r.from===0).out,false);
const walk=planPlay({outcome:'ball',text:'볼넷',basesBefore:[60,70,80],basesAfter:[55,60,70]});assert.deepEqual(walk.runs.map(r=>[r.from,r.to]),[[0,1],[3,4],[2,3],[1,2]]);
const tag=planPlay({outcome:'outfield_flyout',text:'3루 주자 태그업 득점',basesBefore:[0,0,70],basesAfter:[0,0,0]});assert.ok(tag.runs.find(r=>r.from===3).delay>tag.catchAt);assert.deepEqual(tag.throws,[4]);
assert.ok(new Set(plans.filter(p=>p.out==='groundout').map(p=>p.angle)).size>25);
console.log('PASS: 1,500 deterministic direction/course variants; all outcomes, bases, walks, tag-up, force and double play routes.');
