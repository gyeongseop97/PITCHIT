import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {randomBytes} from 'node:crypto';
import {resolveGroundBall,resolveWalk,resolveFlyBall} from '../lib/base-running.ts';
import * as roster from '../lib/roster.ts';
import {readShop} from '../lib/shop.ts';
import {describePlay} from '../public/3d/commentary.js';
import {planPlay} from '../public/3d/play-plan.js';
import {playerProfile} from '../public/3d/player-profiles.js';
import {runnerPoint} from '../public/3d/runner-motion.js';
let checks=0;
for(let mask=0;mask<8;mask++){
 const bases=[41,62,83].map((v,i)=>mask&(1<<i)?v:0),r=resolveWalk({bases,batterSpeed:55});
 assert.equal(r.basesAfter.filter(Boolean).length+r.runsScored,bases.filter(Boolean).length+1);
 for(const move of r.runnerMoves.filter(m=>m.from)){assert.equal(move.to,move.from+Number(bases.slice(0,move.from).every(Boolean)));}
 const visual=planPlay({outcome:'walk',basesBefore:bases,basesAfter:r.basesAfter,runningPlay:r});
 assert.deepEqual(visual.runs.map(m=>[m.from,m.to]),r.runnerMoves.map(m=>[m.from,m.to]));checks++;
 for(let outs=0;outs<3;outs++)for(const outfield of [false,true])for(const roll of [0,.999]){
  const fly=resolveFlyBall({bases,outs,outfield,random:()=>roll});
  assert.equal(fly.runsScored,fly.runnerMoves.filter(m=>m.scored).length);
  if(outs===2){assert.equal(fly.runsScored,0);assert.deepEqual(fly.basesAfter,[0,0,0]);assert.ok(fly.runnerMoves.filter(m=>m.from).every(m=>m.stopped));}
  else assert.equal(fly.basesAfter.filter(Boolean).length+fly.runsScored,bases.filter(Boolean).length);
  if(outfield&&fly.runsScored)assert.match(describePlay({outcome:'outfield_flyout',runningPlay:fly}).title,/희생플라이/);
  if(!outfield&&outs<2)assert.deepEqual(fly.basesAfter,bases);
  const p=planPlay({outcome:outfield?'outfield_flyout':'infield_flyout',basesBefore:bases,basesAfter:fly.basesAfter,runningPlay:fly});
  assert.equal(p.inningEnded,outs===2);assert.ok(p.runs.filter(m=>m.tagUp).every(m=>m.delay>p.catchAt));checks++;
 }
}
assert.deepEqual(resolveWalk({bases:[0,62,83],batterSpeed:55}).basesAfter,[55,62,83]);
const fields=[{position:[16,0,-22],fielder:0,strategy:''},{position:[-19,0,-20],fielder:3,strategy:''},{position:[0,0,-18],fielder:1,strategy:''},{position:[-16,0,-31],fielder:2,strategy:''},{position:[5,0,-27],fielder:1,strategy:''}];
for(let mask=0;mask<8;mask++)for(let outs=0;outs<3;outs++)for(const field of fields)for(const roll of [0,.999]){
 const bases=[41,62,83].map((v,i)=>mask&(1<<i)?v:0),r=resolveGroundBall({bases,outs,batterSpeed:55,doublePlayChance:.5,field,contact:{actualCell:12,batCell:12,defenseLead:0},random:()=>roll});
 assert.equal(r.outsRecorded,r.runnerMoves.filter(m=>m.out).length);
 if(r.inningEnded){assert.equal(r.runsScored,0);assert.deepEqual(r.basesAfter,[0,0,0]);}
 else assert.equal(r.basesAfter.filter(Boolean).length+r.runsScored+r.outsRecorded,bases.filter(Boolean).length+1);
 assert.ok(r.runnerMoves.filter(m=>m.forced).every(m=>m.to===m.from+1));
 assert.ok(r.throws.every(base=>r.runnerMoves.some(m=>m.out&&m.to===base)));
 const p=planPlay({outcome:'groundout',groundPlay:r});assert.deepEqual(p.end,field.position);assert.deepEqual(p.throws,r.throws);checks++;
}
const tactical=(field,outs=0,bases=[41,62,83],lead=0)=>resolveGroundBall({bases,outs,batterSpeed:55,field,contact:{actualCell:12,batCell:12,defenseLead:lead},doublePlayChance:0,random:()=>.999});
assert.equal(tactical(fields[0]).throws[0],1);assert.equal(tactical(fields[1]).throws[0],3);assert.equal(tactical(fields[2]).throws[0],4);assert.equal(tactical(fields[3]).throws[0],1);assert.equal(tactical(fields[4]).throws[0],2);assert.notEqual(tactical(fields[2],0,[41,62,83],4).throws[0],4);
for(let from=0;from<4;from++)for(let to=from+1;to<=4;to++)for(let base=from+1;base<=to;base++){
 const point=runnerPoint(from,to,(base-from)/(to-from)).point,expected=[[0,0,0],[19.4,0,-19.4],[0,0,-38.8],[-19.4,0,-19.4],[0,0,0]][base];
 assert.ok(Math.hypot(...point.map((v,i)=>v-expected[i]))<1e-8,'Runner missed a bag');
}
for(const role of ['pitcher','batter']){const forms=new Set(),hands=new Set();for(let slot=0;slot<60;slot++){const p=playerProfile('match','p1:'+role+':'+slot,role);assert.deepEqual(p,playerProfile('match',p.id,role));forms.add(p.form);hands.add(p.hand);}assert.equal(forms.size,6);assert.equal(hands.size,2);}
class Redis {async hincrby(){return 1}async get(){return null}async set(){return 'OK'}}
const source=stripTypeScriptTypes(readFileSync('app/api/match/handler.ts','utf8').replace(/^import .*;\r?$/gm,'')).replace('export default async function handler','async function handler');
const control={outcome:'ball'};
const api=runInNewContext(source+'\n({resolve,freshGame})',{...roster,readShop,randomBytes,Redis,console,Date,Math,setTimeout,process:{env:{}},resolveGroundBall,resolveWalk,resolveFlyBall:args=>resolveFlyBall({...args,random:()=>0}),resolvePlateAppearance:()=>({outcome:control.outcome,actualCell:12,isBall:control.outcome==='ball',pitchName:'패스트볼',speed:140,message:control.outcome==='ball'?'볼':'뜬공 아웃'})});
for(const outcome of ['ball','outfield_flyout','infield_flyout'])for(let mask=0;mask<8;mask++)for(let outs=0;outs<3;outs++){
 const game=api.freshGame(),bases=[41,62,83].map((v,i)=>mask&(1<<i)?v:0);control.outcome=outcome;
 Object.assign(game,{status:'playing',balls:3,outs,bases,choices:{p1:{kind:'bat',cell:12,swing:'contact'},p2:{kind:'pitch',cell:12,pitch:'fast'}}});
 await api.resolve({code:'SITUATION_FIXTURE',mode:'friend',players:{p1:null,p2:null},game});
 const r=game.lastPlay.runningPlay;assert.ok(r);assert.equal(game.scores[0],r.runsScored);assert.equal(game.playLog[0].outsRecorded,r.outsRecorded);assert.equal(game.half,r.inningEnded?1:0);assert.ok(game.lastPlay.batterId.startsWith('p1:batter:'));checks++;
}
console.log('PASS: '+checks+' rule/API cases; walk awards, tag-up and third-out runs, tactical first/second/third/home throws, runner conservation, exact bag touches and stable 6-form left/right roster profiles.');
