import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {randomBytes} from 'node:crypto';
import * as engine from '../lib/game-engine.ts';
import {resolveGroundBall,resolveFlyBall,resolveWalk} from '../lib/base-running.ts';
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
const handler=runInNewContext(source+'\nhandler',{...engine,...roster,readShop,resolveGroundBall,resolveFlyBall,resolveWalk,randomBytes,Redis,process:{env:{}},console,Date,setTimeout,Math});
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

// A refresh is recoverable for 30 seconds. Once that window has elapsed,
// the connected opponent's next state check closes the room as a forfeit.
const reconnectHost=await request({action:'create',name:'재접속'});
const reconnectGuest=await request({action:'join',code:reconnectHost.code,name:'대기'});
const reconnectHostState=await request({action:'state',code:reconnectHost.code,token:reconnectHost.token});
const activeId=reconnectHostState.player,missingId=activeId==='p1'?'p2':'p1';
const reconnectStored=db.get(`pitchit:room:${reconnectHost.code}`);
reconnectStored.game.lastSeen[missingId]=Date.now()-30_001;
const reconnectResult=await request({action:'state',code:reconnectHost.code,token:reconnectHost.token});
assert.equal(reconnectResult.game.status,'finished');
assert.equal(reconnectResult.game.forfeitWinner,activeId);
assert.match(reconnectResult.game.event,/연결이 30초간 끊겨/);
console.log('PASS: online rooms grant a 30-second reconnect window, then close as a forfeit for the connected opponent.');

// Pitch count is recorded per pitcher and fatigue starts only after a normal
// opening workload, so a starter is not punished on the first few pitches.
const staminaRoom=await request({action:'solo'});let staminaState=staminaRoom;
const staminaStored=db.get(`pitchit:room:${staminaRoom.code}`);
const aiPitcher=staminaStored.game.teams.p2.activePitcher;
staminaStored.game.pitchCounts.p2[aiPitcher]=9;
staminaState=await request({action:'choose',code:staminaRoom.code,token:staminaRoom.token,choice:{kind:'bat',cell:12,swing:'contact'}});
assert.equal(staminaState.game.pitchCounts.p2[aiPitcher],10);
assert.equal(staminaState.game.lastPlay.stamina,100);
assert.equal(staminaState.game.lastPlay.pitchCount,10);
const staminaStoredAgain=db.get(`pitchit:room:${staminaRoom.code}`);
staminaStoredAgain.game.half=0;
staminaStoredAgain.game.outs=0;
staminaStoredAgain.game.choices={};
staminaStoredAgain.game.drafts={};
staminaStoredAgain.game.pitchCounts.p2[aiPitcher]=10;
staminaState=await request({action:'choose',code:staminaRoom.code,token:staminaRoom.token,choice:{kind:'bat',cell:12,swing:'contact'}});
assert.equal(staminaState.game.pitchCounts.p2[aiPitcher],11);
assert.equal(staminaState.game.lastPlay.stamina,97);
console.log('PASS: pitch count is recorded, with full stamina through 10 pitches and wear from pitch 11.');

// T/B/S/K must belong to the active pitcher for this game, not the live at-bat
// count. Every result consumes one pitch and therefore keeps T = B + S.
const pitcherTotalsRoom=await request({action:'solo'});let pitcherTotalsState=pitcherTotalsRoom;
for(let turn=0;turn<12;turn++){
 const before=structuredClone(pitcherTotalsState.game.pitcherStats);
 const choice=pitcherTotalsState.attacker==='p1'?{kind:'bat',cell:12,swing:'contact'}:{kind:'pitch',cell:12,pitch:'fast'};
 pitcherTotalsState=await request({action:'choose',code:pitcherTotalsRoom.code,token:pitcherTotalsRoom.token,choice});
 const play=pitcherTotalsState.game.lastPlay;
 const pitcherMatch=String(play?.pitcherId||'').match(/^(p[12]):pitcher:(\d+)$/);
 assert.ok(pitcherMatch,'resolved play identifies the pitcher that threw it');
 const player=pitcherMatch[1],index=Number(pitcherMatch[2]);
 const prior=before[player]?.[index]||{pitches:0,balls:0,strikes:0,strikeouts:0};
 const line=pitcherTotalsState.game.pitcherStats[player][index];
 assert.equal(line.pitches,prior.pitches+1);
 assert.equal(line.balls,prior.balls+(play.outcome==='ball'?1:0));
 assert.equal(line.strikes,prior.strikes+(play.outcome==='ball'?0:1));
 assert.equal(line.strikeouts,prior.strikeouts+(/삼진/.test(play.playText||'')?1:0));
 assert.equal(line.pitches,line.balls+line.strikes);
}
console.log('PASS: every server-resolved pitch updates only that pitcher’s T/B/S/K and preserves T = B + S.');

// A reliever starts with an independent game line while the outgoing
// pitcher’s completed line remains unchanged.
const relieverRoom=await request({action:'solo'});
const relieverStored=db.get(`pitchit:room:${relieverRoom.code}`);
relieverStored.game.introUntil=undefined;
relieverStored.game.half=1;
relieverStored.game.deadline=Date.now()+20_000;
relieverStored.game.choices={};
relieverStored.game.drafts={};
const outgoing=relieverStored.game.teams.p1.activePitcher;
const reliever=relieverStored.game.teams.p1.pitchers.findIndex((_,index)=>index!==outgoing);
const beforeReliever=structuredClone(relieverStored.game.pitcherStats.p1);
await request({action:'swap',code:relieverRoom.code,token:relieverRoom.token,index:reliever});
const relieverPitch=await request({action:'choose',code:relieverRoom.code,token:relieverRoom.token,choice:{kind:'pitch',cell:12,pitch:'fast'}});
assert.equal(relieverPitch.game.lastPlay.pitcherId,`p1:pitcher:${reliever}`);
assert.equal(relieverPitch.game.pitcherStats.p1[reliever].pitches,beforeReliever[reliever].pitches+1);
assert.equal(relieverPitch.game.pitcherStats.p1[outgoing].pitches,beforeReliever[outgoing].pitches);
console.log('PASS: pitcher changes keep outgoing and incoming T/B/S/K lines independent.');
