import {readFileSync,writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/base-running.ts',import.meta.url),'utf8')).replace(/^export /gm,'').replace(/[\t ]+$/gm,'').trim();
const block=`<!-- PITCHIT BASE RUNNING START -->\n<script>\n(()=>{\n${code}\nwindow.pitchitBaseRunning={resolveGroundBall,resolveWalk,resolveFlyBall};\n})();\n</script>\n<!-- PITCHIT BASE RUNNING END -->`;
const file=new URL('../public/game/index.html',import.meta.url);
let html=readFileSync(file,'utf8').replace(/\s*<!-- PITCHIT BASE RUNNING START -->[\s\S]*?<!-- PITCHIT BASE RUNNING END -->/,'');
html=html.replace('<!-- PITCHIT 3D ENTRY START -->',block+'\n<!-- PITCHIT 3D ENTRY START -->');
writeFileSync(file,html);
