import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {randomBytes} from 'node:crypto';
import {resolveGroundBall} from '../lib/base-running.ts';
import {planPlay} from '../public/3d/play-plan.js';
import * as roster from '../lib/roster.ts';
import {readShop} from '../lib/shop.ts';

const forcedByMask=[[],[1],[],[1,2],[],[1],[],[1,2,3]];
let checks=0;
for(let mask=0;mask<8;mask++)for(let outs=0;outs<3;outs++)for(const doublePlayChance of [0,1])for(const roll of [0,.999]){
 const bases=[11,22,33].map((v,i)=>mask&(1<<i)?v:0),saved=[...bases];
 const result=resolveGroundBall({bases,outs,batterSpeed:44,doublePlayChance,random:()=>roll});
 assert.deepEqual(bases,saved,'The resolver mutated the input bases');
 assert.deepEqual(result.runnerMoves.filter(r=>r.from&&r.forced).map(r=>r.from).sort(),forcedByMask[mask]);
 assert.ok(result.runnerMoves.filter(r=>r.forced).every(r=>r.to===r.from+1),'A forced runner stayed at the original base');
 assert.equal(result.runnerMoves.filter(r=>r.out).length,result.outsRecorded);
 assert.equal(result.runnerMoves.length,bases.filter(Boolean).length+1);
 assert.equal(new Set(result.runnerMoves.map(r=>r.from)).size,result.runnerMoves.length);
 if(result.inningEnded){assert.equal(result.runsScored,0);assert.deepEqual(result.basesAfter,[0,0,0]);assert.ok(result.runnerMoves.every(r=>!r.scored));}
 else assert.equal(result.basesAfter.filter(Boolean).length+result.runsScored+result.outsRecorded,bases.filter(Boolean).length+1,'A runner vanished or duplicated');
 if(outs===2)assert.equal(result.outsRecorded,1);
 if(result.kind==='double_play')assert.equal(result.runsBattedIn,0);
 const visual=planPlay({outcome:'groundout',basesBefore:bases,basesAfter:result.basesAfter,groundPlay:result,outsRecorded:result.outsRecorded,text:'공수 교대'});
 assert.deepEqual(visual.throws,result.throws);
 assert.deepEqual(visual.runs.map(({from,to,out,forced,scored})=>({from,to,out,forced,scored})),result.runnerMoves.map(({from,to,out,forced,scored})=>({from,to,out,forced,scored})));
 checks++;
}
for(const [bases,outs,dp,after,runs] of [
 [[11,0,0],0,0,[44,0,0],0],[[11,22,0],0,0,[44,0,22],0],[[11,22,33],0,0,[44,0,22],1],
 [[11,0,33],0,0,[44,0,33],0],[[0,22,33],0,0,[0,22,33],0],
 [[11,22,33],0,1,[0,0,22],1],[[11,22,33],1,1,[0,0,0],0],[[11,22,33],2,0,[0,0,0],0],
]){const r=resolveGroundBall({bases,outs,batterSpeed:44,doublePlayChance:dp,random:()=>.999});assert.deepEqual(r.basesAfter,after);assert.equal(r.runsScored,runs);}
const oldServer=planPlay({outcome:'groundout',basesBefore:[55,55,55],basesAfter:[0,55,55],outsRecorded:2,text:'병살타'});
assert.ok(oldServer.runs.filter(r=>r.from>=2).every(r=>r.returnAfterForce&&r.attemptTo===r.from+1),'Legacy results must still show the initial forced attempt');

// Exercise the real API resolver locally. Redis and plate contact are fixtures;
// base running, counts, half changes, play logs and walkoffs are production code.
class Redis {async hincrby(){return 1}async get(){return null}async set(){return 'OK'}}
const source=stripTypeScriptTypes(readFileSync('app/api/match/handler.ts','utf8').replace(/^import .*;\r?$/gm,'')).replace('export default async function handler','async function handler');
const control={roll:.999};
const api=runInNewContext(source+'\n({resolve,freshGame})',{
 ...roster,readShop,randomBytes,Redis,console,Date,Math,setTimeout,process:{env:{}},
 resolveGroundBall:args=>resolveGroundBall({...args,random:()=>control.roll}),
 resolvePlateAppearance:()=>({outcome:'groundout',actualCell:22,isBall:false,pitchName:'패스트볼',speed:140,message:'패스트볼 · 땅볼 아웃.'}),
});
let apiChecks=0;
for(let mask=0;mask<8;mask++)for(let outs=0;outs<3;outs++)for(const roll of [0,.999]){
 const game=api.freshGame(),bases=[55,55,55].map((v,i)=>mask&(1<<i)?v:0);control.roll=roll;
 Object.assign(game,{status:'playing',outs,bases:[...bases],choices:{p1:{kind:'bat',cell:12,swing:'contact'},p2:{kind:'pitch',cell:22,pitch:'fast'}}});
 await api.resolve({code:'GROUND_FIXTURE',mode:'friend',players:{p1:null,p2:null},game});
 const result=game.lastPlay.groundPlay;
 assert.ok(result);assert.deepEqual(Array.from(game.lastPlay.basesBefore),bases);assert.deepEqual(Array.from(game.lastPlay.basesAfter),result.basesAfter);
 assert.equal(game.scores[0],result.runsScored);assert.equal(game.inningScores[0][0],result.runsScored);assert.equal(game.playLog[0].outsRecorded,result.outsRecorded);assert.equal(game.playLog[0].runsBattedIn,result.runsBattedIn);
 assert.equal(game.half,result.inningEnded?1:0);assert.equal(game.outs,result.inningEnded?0:outs+result.outsRecorded);apiChecks++;
}
for(const [outs,roll,finished] of [[1,0,false],[2,.999,false],[0,.999,true]]){
 const game=api.freshGame();control.roll=roll;Object.assign(game,{status:'playing',inning:3,half:1,outs,bases:[55,55,55],choices:{p2:{kind:'bat',cell:12,swing:'contact'},p1:{kind:'pitch',cell:22,pitch:'fast'}}});
 await api.resolve({code:'GROUND_WALKOFF',mode:'friend',players:{p1:null,p2:null},game});
 assert.equal(game.status==='finished',finished);assert.equal(game.scores[1],finished?1:0);
}
console.log(`PASS: ${checks} base/out/random combinations, explicit 1st/1st+2nd/loaded force cases, optional non-forced holds, no lost/duplicated runners, third-out run cancellation, double-play RBI; ${apiChecks} real API resolutions and walkoff/inning transitions, including identical runner ratings.`);
