import assert from 'node:assert/strict';
import {describePlay,pitchLocation} from '../public/3d/commentary.js';
for(const [outcome,word] of Object.entries({homerun:'홈런',single:'안타',double:'2루타',triple:'3루타',foul:'파울',groundout:'땅볼',infield_flyout:'내야',outfield_flyout:'아웃',ball:'볼',swinging_strike:'헛스윙'})){
 assert.ok(describePlay({outcome,pitchName:'패스트볼',text:'패스트볼 143km/h',speed:143}).title.includes(word));
}
assert.match(describePlay({outcome:'swinging_strike',text:'패스트볼 143km/h · 루킹 삼진!',strikeStyle:'looking'}).title,/루킹 삼진/);
assert.match(describePlay({outcome:'ball',text:'볼넷!'}).title,/볼넷/);
assert.match(describePlay({outcome:'swinging_strike',text:'유인구 · 헛스윙 스트라이크!'}).title,/헛스윙/);
assert.match(describePlay({actualCell:12,batCell:12}).detail,/일치/);
assert.match(describePlay({actualCell:4,batCell:12}).detail,/다른 위치/);
assert.doesNotMatch(describePlay({actualCell:4}).detail,/타자가 노린/);
assert.doesNotMatch(describePlay({execution:'wild',actualCell:4}).detail,/들어왔습니다/);
assert.match(describePlay({execution:'mistake'}).detail,/실투/);
assert.equal(describePlay().detail,'');
assert.equal(pitchLocation({actualCell:4}),'1행 5열');
assert.equal(pitchLocation({actualCell:20}),'5행 1열');
assert.match(pitchLocation({actualCell:4,execution:'wild'}),/존 바깥/);
assert.match(pitchLocation({execution:'bait',direction:'high'}),/높은 공/);
assert.equal(pitchLocation({actualCell:null}),'위치 미제공');
console.log('PASS: resolved outcomes, pitch-name ambiguity, strikeouts/walks, and evidence-based location commentary.');
