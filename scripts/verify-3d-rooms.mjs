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

// Online forfeits are based only on missed final choices. Heartbeats remain
// useful for presence, but an old `lastSeen` timestamp must never finish a
// game by itself. Exercise both friend and quick rooms because player roles
// are randomized when the second player joins.
const onlineMatch=async mode=>{
 const first=await request({action:mode==='quick'?'quick':'create',name:`${mode}-첫번째`});
 const second=await request({action:mode==='quick'?'quick':'join',code:first.code,name:`${mode}-두번째`});
 const firstState=await request({action:'state',code:first.code,token:first.token});
 const secondState=await request({action:'state',code:first.code,token:second.token});
 const sessions={
  [firstState.player]:{token:first.token,player:firstState.player},
  [secondState.player]:{token:second.token,player:secondState.player},
 };
 const stored=db.get(`pitchit:room:${first.code}`);
 stored.game.introUntil=undefined;
 stored.game.deadline=Date.now()+20_000;
 stored.game.choices={};
 stored.game.drafts={};
 stored.game.autoTurns={};
 return {code:first.code,sessions};
};
const choiceFor=(game,player)=>((game.half===0?'p1':'p2')===player
 ? {kind:'bat',cell:12,swing:'contact'}
 : {kind:'pitch',cell:12,pitch:'fast'});
const submitFinal=async(match,player)=>{
 const game=db.get(`pitchit:room:${match.code}`).game;
 return request({action:'choose',code:match.code,token:match.sessions[player].token,deadline:game.deadline,choice:choiceFor(game,player)});
};
const expireWithAbsent=async(match,absent)=>{
 const present=absent==='p1'?'p2':'p1';
 await submitFinal(match,present);
 const stored=db.get(`pitchit:room:${match.code}`);
 stored.game.deadline=Date.now()-1;
 return request({action:'state',code:match.code,token:match.sessions[present].token});
};

for(const mode of ['friend','quick']){
 for(const absent of ['p1','p2']){
 const match=await onlineMatch(mode);
 const present=absent==='p1'?'p2':'p1';
 const stored=db.get(`pitchit:room:${match.code}`);
 stored.game.lastSeen[absent]=Date.now()-60_000;
 const afterThirtySeconds=await request({action:'state',code:match.code,token:match.sessions[present].token});
 assert.equal(afterThirtySeconds.game.status,'playing',`${mode}: an old heartbeat alone must not forfeit`);

 let afterTwo=afterThirtySeconds;
 for(let turn=0;turn<2;turn++){
  const game=db.get(`pitchit:room:${match.code}`).game;
  // A draft never substitutes for the final manual confirmation.
  game.drafts[absent]=choiceFor(game,absent);
  afterTwo=await expireWithAbsent(match,absent);
 }
 assert.equal(afterTwo.game.status,'playing',`${mode}: two automatic turns must not forfeit`);
 assert.equal(afterTwo.game.autoTurns[absent],2,`${mode}: two missed finals are tracked`);
 assert.equal(afterTwo.game.autoTurns[present],0,`${mode}: the present player remains active`);

 const afterThird=await expireWithAbsent(match,absent);
 assert.equal(afterThird.game.status,'finished',`${mode}: the third missed final ends the match`);
 assert.equal(afterThird.game.forfeitWinner,present,`${mode}: the present player receives the forfeit win`);
 assert.match(afterThird.game.event,/3턴 연속 자리비움/);

 const resetMatch=await onlineMatch(mode);
 for(let turn=0;turn<2;turn++) await expireWithAbsent(resetMatch,absent);
 assert.equal((await request({action:'state',code:resetMatch.code,token:resetMatch.sessions[present].token})).game.autoTurns[absent],2);
 await submitFinal(resetMatch,absent);
 const manualReset=await submitFinal(resetMatch,present);
 assert.equal(manualReset.game.status,'playing',`${mode}: a confirmed return keeps the game open`);
 assert.equal(manualReset.game.autoTurns[absent],0,`${mode}: final manual choice resets that player's absence streak`);
 for(let turn=0;turn<2;turn++) await expireWithAbsent(resetMatch,absent);
 const afterReturnMisses=await request({action:'state',code:resetMatch.code,token:resetMatch.sessions[present].token});
 assert.equal(afterReturnMisses.game.status,'playing',`${mode}: two new misses after a return still do not forfeit`);
 assert.equal(afterReturnMisses.game.autoTurns[absent],2);

 const quit=await request({action:'forfeit',code:resetMatch.code,token:resetMatch.sessions[absent].token});
 assert.equal(quit.game.status,'finished',`${mode}: explicit quit remains immediate`);
 assert.equal(quit.game.forfeitWinner,present,`${mode}: explicit quit awards the opponent`);
 }
}
console.log('PASS: friend and quick rooms apply the same AFK rule to either player, ignore stale heartbeats, reset on a manual choice, and keep explicit quit immediate.');

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
