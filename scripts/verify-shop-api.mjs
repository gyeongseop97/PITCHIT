import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import * as shop from '../lib/shop.ts';
let saved={shop:{coins:200,owned:['set-retro'],equippedSet:'retro'}};
let userId='test';
const source=stripTypeScriptTypes(readFileSync('app/api/account/route.ts','utf8').replace(/^import .*;\r?$/gm,'')).replace(/^export /gm,'');
const api=runInNewContext(source+'\n({GET,POST})',{
 ...shop,Response,process:{env:{NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'test',CLERK_SECRET_KEY:'test'}},
 auth:async()=>({userId}),currentUser:async()=>null,
 Redis:class{async get(){return saved}async set(key,value){saved=value}},
});
async function post(action,itemId){const response=await api.POST(new Request('http://test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,itemId})}));return {status:response.status,data:await response.json()}}
let response=await post('shop-buy','ball-crimson');assert.equal(response.status,200);assert.equal(response.data.shop.coins,130);assert.equal(response.data.shop.equippedBall,'retro');
response=await post('shop-buy','ball-crimson');assert.equal(response.data.shop.coins,130);
response=await post('shop-equip','ball-crimson');assert.equal(response.data.shop.equippedBall,'crimson');assert.equal(response.data.shop.equippedTheme,'retro');assert.equal(response.data.shop.equippedEffect,'retro');
assert.equal((await post('shop-equip','effect-neon')).status,409);
assert.equal((await post('shop-buy','set-night')).status,404);
await post('shop-buy','effect-neon');assert.equal((await post('shop-buy','theme-night')).status,409);
await post('shop-equip','effect-neon');assert.equal(saved.shop.equippedTheme,'retro');assert.equal(saved.shop.equippedEffect,'neon');
const loaded=await (await api.GET()).json();assert.equal(loaded.shop.equippedBall,'crimson');assert.equal(loaded.shop.equippedEffect,'neon');
userId=null;assert.equal((await post('shop-buy','theme-night')).status,401);
console.log('PASS: account API purchases, repeat purchase, category equip, validation, persistence and authentication (mock storage).');
