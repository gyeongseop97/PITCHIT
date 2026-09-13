import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SHOP_ITEMS, readShop, defaultShop, buyShopItem, equipShopItem } from '../lib/shop.ts';
const item=(id)=>SHOP_ITEMS.find(item=>item.id===id);
for(const set of ['night','retro','neon']){
 const shop=readShop({coins:123,owned:[`set-${set}`],equippedSet:set,rewardedGames:['game'],operatorGrantApplied:true});
 assert.equal(shop.owned.length,6);assert.equal(shop.equippedEffect,set);assert.equal(shop.equippedTheme,set);
 assert.equal(shop.equippedBall,set==='night'?'crimson':set);assert.equal(shop.coins,123);assert.deepEqual(readShop(shop),shop);
 assert.equal(shop.operatorGrantApplied,true);assert.deepEqual(shop.rewardedGames,['game']);
}
let shop=readShop({coins:1000});
for(const id of ['ball-crimson','theme-retro','effect-neon']){
 const before=shop;shop=buyShopItem(shop,item(id));
 assert.equal(shop.owned.length,before.owned.length+1);assert.equal(shop.coins,before.coins-item(id).cost);
 assert.equal(shop.equippedBall,before.equippedBall);assert.equal(shop.equippedTheme,before.equippedTheme);assert.equal(shop.equippedEffect,before.equippedEffect);
 assert.deepEqual(buyShopItem(shop,item(id)),shop);shop=equipShopItem(shop,item(id));
}
assert.equal(shop.coins,730);assert.equal(shop.equippedBall,'crimson');assert.equal(shop.equippedTheme,'retro');assert.equal(shop.equippedEffect,'neon');assert.deepEqual(readShop(shop),shop);
assert.throws(()=>buyShopItem(defaultShop(),item('ball-neon')),/부족/);assert.throws(()=>equipShopItem(defaultShop(),item('ball-neon')),/보유/);
assert.equal(readShop({owned:['ball-crimson'],equippedBall:'crimson'}).owned.length,4);
assert.equal(readShop({owned:['ball-crimson'],equippedTheme:'night'}).equippedTheme,'classic');
assert.deepEqual(readShop({owned:'broken',coins:Infinity}),defaultShop());
for(const file of ['public/game/index.html','static/game/index.html','static/index.html']){
 const html=readFileSync(file,'utf8'),start=html.indexOf("const shopStorageKey='pitchit:shop:v1';"),end=html.indexOf('const shopCatalog = SHOP_ITEMS;',start);
 const result=runInNewContext(html.slice(start,end)+'\nJSON.stringify(readShop('+JSON.stringify(shop)+'))');
 assert.deepEqual(JSON.parse(result),shop);
 for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new (await import('node:vm')).Script(script);
}
console.log('PASS: bundle migration, category isolation, purchases, balance, ownership, persistence, browser parity and script syntax.');

