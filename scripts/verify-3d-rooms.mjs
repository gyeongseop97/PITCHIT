import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {randomBytes} from 'node:crypto';
import * as engine from '../lib/game-engine.ts';
import {resolveGroundBall} from '../lib/base-running.ts';
import * as roster from '../lib/roster.ts';
import {readShop} from '../lib/shop.ts';
const db=new Map();
const sorted=new Map();
const hashes=new Map();
class Redis{
 async get(k){return db.has(k)?structuredClone(db.get(k)):null}
 async set(k,v,options){if(options?.nx&&db.has(k))return null;db.set(k,structuredClone(v));return 'OK'}
 async del(k){db.delete(k)}
 async zadd(k,...entries){const set=sorted.get(k)||new Map();for(const entry of entries.flat()){set.set(entry.member,Number(entry.score))}sorted.set(k,set);return 'OK'}
 async zrange(k,start,stop,options={}){const values=[...(sorted.get(k)||new Map()).entries()].sort((a,b)=>options.rev?b[1]-a[1]:a[1]-b[1]).map(([member])=>member);return values.slice(start,stop<0?undefined:stop+1)}
 async zrem(k,member){sorted.get(k)?.delete(member);return 1}
 async hincrby(k,field,amount){const hash=hashes.get(k)||new Map(),next=Number(hash.get(field)||0)+Number(amount);hash.set(field,next);hashes.set(k,hash);return next}
}
const source=stripTypeScriptTypes(readFileSync('app/api/match/handler.ts','utf8').replace(/^import .*;\r?$/gm,'')).replace('export default async function handler','async function handler');
const handler=runInNewContext(source+'\nhandler',{...engine,...roster,readShop,resolveGroundBall,randomBytes,Redis,process:{env:{}},console,Date,setTimeout,Math});
async function request(body,expectedStatus){let data,status=200;const res={setHeader(){},status(n){status=n;return res},json(v){data=v},end(){}};await handler({method:'POST',body},res);if(expectedStatus)assert.equal(status,expectedStatus);else assert.ok(status<400,JSON.stringify(data));return data;}
for(const action of ['create','quick'])for(const [a,b] of [[false,false],[true,false],[false,true],[true,true]]){
 const first=await request({action,graphics3D:a});
 const second=await request({action:action==='quick'?'quick':'join',code:first.code,graphics3D:b});
 assert.equal(second.graphics3D,a||b);assert.equal(second.turnSeconds,20);assert.equal(second.game.deadline-second.game.introUntil,20000);assert.ok(second.serverNow>0);
 const host=await request({action:'state',code:first.code,token:first.token});const guest=await request({action:'state',code:first.code,token:second.token});
 assert.equal(host.graphics3D,a||b);assert.equal(guest.graphics3D,a||b);
 assert.ok(!JSON.stringify(host.players).includes(first.token));
}
assert.equal((await request({action:'solo',graphics3D:true})).graphics3D,true);
assert.equal((await request({action:'create',graphics3D:'true'})).graphics3D,false);
console.log('PASS: friend/quick rooms share either-player 3D preference; both-off and malformed preference stay 2D; player shuffling and tokens preserved.');

// A migrated guest row can coexist with its account row temporarily.  The
// public leaderboard must expose one player name, not duplicate entries.
await new Redis().zadd('pitchit:ranking:v1',{member:'legacy-player',score:1040},{member:'account-player',score:1080});
db.set('pitchit:ranking:v1:legacy-player',{name:'동일 선수',points:1040,games:3,wins:2,losses:1,draws:0});
db.set('pitchit:ranking:v1:account-player',{name:'동일 선수',points:1080,games:5,wins:3,losses:2,draws:0});
const leaderboard=await request({action:'ranking'});
assert.equal(leaderboard.ranking.filter(entry=>entry.name==='동일 선수').length,1);
assert.equal(leaderboard.ranking.find(entry=>entry.name==='동일 선수').points,1080);
console.log('PASS: legacy and account rows with the same public nickname are de-duplicated in ranking results.');

const emptyRoom=await request({action:'solo'});assert.equal(emptyRoom.turnSeconds,20);assert.ok(emptyRoom.game.deadline-emptyRoom.serverNow<=20000&&emptyRoom.game.deadline-emptyRoom.serverNow>=19900);for(const cell of [null,undefined,-1,25,2.5,'12'])await request({action:'choose',code:emptyRoom.code,token:emptyRoom.token,choice:{kind:'bat',cell,swing:'contact'}},400);console.log('PASS: server rejects missing, null, non-integer and out-of-zone choices.');

// Three expired online turns without a final confirmation are an absence,
// even when a draft was left in the zone. The game must end immediately and
// award the present opponent the normal forfeit result.
const absenceHost=await request({action:'create',name:'자리비움'});
const absenceGuest=await request({action:'join',code:absenceHost.code,name:'대기중'});
for(let turn=0;turn<3;turn++){
 const stored=db.get(`pitchit:room:${absenceHost.code}`);
 stored.game.introUntil=undefined;
 stored.game.deadline=Date.now()-1;
 // A draft is intentionally not treated as an active final choice.
 stored.game.drafts.p1={kind:'bat',cell:12,swing:'contact'};
 await request({action:'state',code:absenceHost.code,token:absenceHost.token});
}
const absenceResult=await request({action:'state',code:absenceHost.code,token:absenceGuest.token});
assert.equal(absenceResult.game.status,'finished');
assert.equal(absenceResult.game.forfeitWinner,'p2');
assert.match(absenceResult.game.event,/3턴 연속 자리비움/);
assert.equal(absenceResult.game.autoTurns.p1,3);
console.log('PASS: three consecutive automatic online turns immediately end as an absence forfeit; drafts do not bypass it.');

// A confirmed turn breaks the streak. Otherwise two old timeouts followed by
// one active turn could incorrectly become a forfeit on the next deadline.
const resetHost=await request({action:'create',name:'복귀'});
const resetGuest=await request({action:'join',code:resetHost.code,name:'상대'});
for(let turn=0;turn<2;turn++){
 const stored=db.get(`pitchit:room:${resetHost.code}`);
 stored.game.introUntil=undefined;
 stored.game.deadline=Date.now()-1;
 await request({action:'state',code:resetHost.code,token:resetHost.token});
}
const resetStored=db.get(`pitchit:room:${resetHost.code}`);
resetStored.game.deadline=Date.now()-1;
resetStored.game.choices={p1:{kind:'bat',cell:12,swing:'contact'},p2:{kind:'pitch',cell:12,pitch:'fast'}};
const resetResult=await request({action:'state',code:resetHost.code,token:resetHost.token});
assert.equal(resetResult.game.autoTurns.p1,0);
assert.equal(resetResult.game.autoTurns.p2,0);
console.log('PASS: either player confirming a turn resets only their consecutive absence streak.');
