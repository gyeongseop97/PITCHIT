import { readFileSync,writeFileSync } from 'node:fs';
const path=new URL('../public/game/index.html',import.meta.url);
let html=readFileSync(path,'utf8');
const block=readFileSync(new URL('./3d-entry.template',import.meta.url),'utf8').trim();
html=html.replace(/\s*<!-- PITCHIT 3D ENTRY START -->[\s\S]*?<!-- PITCHIT 3D ENTRY END -->/,'');
html=html.replace('</body>',`<!-- PITCHIT 3D ENTRY START -->\n${block}\n<!-- PITCHIT 3D ENTRY END -->\n</body>`);
writeFileSync(path,html);
