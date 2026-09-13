import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const shared = stripTypeScriptTypes(readFileSync(new URL('../lib/shop.ts', import.meta.url),'utf8')).replace(/^export /gm,'').replace(/[\t ]+$/gm,'');
const ui = readFileSync(new URL('./shop-ui.template',import.meta.url),'utf8');
for(const file of ['public/game/index.html','static/game/index.html','static/index.html']){
 const path=new URL('../'+file,import.meta.url);
 let html=readFileSync(path,'utf8');
 const start=html.indexOf("const shopStorageKey='pitchit:shop:v1';");
 const end=html.indexOf('function showShopReward(',start);
 if(start<0||end<0)throw new Error('Shop block missing: '+file);
 html=html.slice(0,start)+"const shopStorageKey='pitchit:shop:v1';\n"+shared+'\n'+ui+'\n'+html.slice(end);
 html=html.replace("const item=shopCatalog.find(v=>v.set===activeShop().equippedSet)||shopCatalog[0];if(!item.effectImage", "const item=equippedShopItem('effect');if(!item.image").replace('effect.className=`cosmeticSetEffect ${item.effect}`','effect.className=`cosmeticSetEffect ${item.value}`');
 html=html.replace("button.textContent='아이템 · 테마 관리'","button.textContent='공 · 배경 · 효과 관리'");
 if(!html.includes('.shopCategories{'))html=html.replace('</style><script id="shop-v1">','.shopWallet{display:grid;gap:6px}.shopWallet b{display:block}.shopCategories{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.shopCategories button{padding:10px 16px;border:1px solid #ccd4cf;border-radius:12px;background:#fff;color:#183b2c;cursor:pointer}.shopCategories button[aria-pressed="true"]{background:#183b2c;color:#fff}.shopStatus{min-height:24px}.shopPreview span{color:#fff;font-weight:700;text-shadow:0 1px 4px #000}\n</style><script id="shop-v1">');
 writeFileSync(path,html.trimEnd()+"\n");
}
