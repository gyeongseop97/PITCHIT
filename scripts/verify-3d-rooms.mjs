import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {randomBytes} from 'node:crypto';
import * as engine from '../lib/game-engine.ts';
import * as roster from '../lib/roster.ts';
import {readShop} from '../lib/shop.ts';
const db=new Map();
class Redis{async get(k){return db.has(k)?structuredClone(db.get(k)):null}async set(k,v,options){if(options?.nx&&db.has(k))return null;db.set(k,structuredClone(v));return 'OK'}async del(k){db.delete(k)}}
const source=stripTypeScriptTypes(readFileSync('app/api/match/handler.ts','utf8').replace(/^import .*;\r?$/gm,'')).replace('export default async function handler','async function handler');
const handler=runInNewContext(source+'\nhandler',{...engine,...roster,readShop,randomBytes,Redis,process:{env:{}},console,Date,setTimeout,Math});
async function request(body,expectedStatus){let data,status=200;const res={setHeader(){},status(n){status=n;return res},json(v){data=v},end(){}};await handler({method:'POST',body},res);if(expectedStatus)assert.equal(status,expectedStatus);else assert.ok(status<400,JSON.stringify(data));return data;}
for(const action of ['create','quick'])for(const [a,b] of [[false,false],[true,false],[false,true],[true,true]]){
 const first=await request({action,graphics3D:a});
 const second=await request({action:action==='quick'?'quick':'join',code:first.code,graphics3D:b});
 assert.equal(second.graphics3D,a||b);
 const host=await request({action:'state',code:first.code,token:first.token});const guest=await request({action:'state',code:first.code,token:second.token});
 assert.equal(host.graphics3D,a||b);assert.equal(guest.graphics3D,a||b);
 assert.ok(!JSON.stringify(host.players).includes(first.token));
}
assert.equal((await request({action:'solo',graphics3D:true})).graphics3D,true);
assert.equal((await request({action:'create',graphics3D:'true'})).graphics3D,false);
console.log('PASS: friend/quick rooms share either-player 3D preference; both-off and malformed preference stay 2D; player shuffling and tokens preserved.');

const emptyRoom=await request({action:'solo'});for(const cell of [null,undefined,-1,25,2.5,'12'])await request({action:'choose',code:emptyRoom.code,token:emptyRoom.token,choice:{kind:'bat',cell,swing:'contact'}},400);console.log('PASS: server rejects missing, null, non-integer and out-of-zone choices.');
