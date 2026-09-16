// Explain resolved plays; never infer a new result or change game state.
export function pitchLocation(play={}) {
 if(play.execution==='bait'||play.execution==='wild'||play.isBall)return '존 바깥'+({high:' · 높은 공',low:' · 낮은 공',in:' · 몸쪽',out:' · 바깥쪽'}[play.direction]||'');
 return Number.isInteger(play.actualCell)&&play.actualCell>=0&&play.actualCell<25?`${Math.floor(play.actualCell/5)+1}행 ${play.actualCell%5+1}열`:'위치 미제공';
}
export function describePlay(play={}) {
 const text=String(play.playText||play.text||''),out=play.outcome||'';
 let title;
 const forceBase=play.groundPlay?.throws?.[0]===4?'홈':(play.groundPlay?.throws?.[0]||2)+'루';
 if(/홈런/.test(text)||out==='homerun')title='담장을 넘깁니다! 홈런!';
 else if(/볼넷/.test(text)||out==='walk')title='볼넷. 타자가 1루로 걸어갑니다.';
 else if(/삼진/.test(text))title=play.strikeStyle==='looking'||/루킹/.test(text)?'루킹 삼진! 배트를 내지 못했습니다.':'헛스윙 삼진! 투수가 타자를 잡아냅니다.';
 else if(/3루타/.test(text)||out==='triple')title='3루타! 타자가 3루까지 진루합니다.';
 else if(/2루타/.test(text)||out==='double')title='2루타! 장타로 2루까지 진루합니다.';
 else if(/안타/.test(text)||out==='single')title='안타! 타자가 출루합니다.';
 else if(/파울/.test(text)||out==='foul')title='파울! 승부가 계속됩니다.';
 else if(/땅볼|병살/.test(text)||out==='groundout')title=/병살/.test(text)?'병살타! 두 개의 아웃을 잡습니다.':play.groundPlay?.kind==='force_out'||/타자 주자 1루 생존/.test(text)?play.groundPlay?.inningEnded?forceBase+'에서 포스 아웃! 세 번째 아웃으로 이닝이 끝납니다.':forceBase+'에서 포스 아웃! 타자 주자는 1루로 갑니다.':'땅볼 아웃! 수비가 타자를 잡아냅니다.';
 else if(out==='infield_flyout')title='내야에 뜬 공, 잡았습니다. 아웃!';
 else if(/뜬공/.test(text)||out==='outfield_flyout')title=play.runningPlay?.runsScored?'희생플라이! 주자가 홈을 밟습니다.':play.runningPlay?.inningEnded?'뜬공 아웃! 세 번째 아웃으로 이닝이 끝납니다.':play.runningPlay?.runnerMoves?.some(r=>r.tagUp)?'뜬공 아웃! 주자는 태그업으로 진루합니다.':'높이 뜬 타구, 수비가 잡아냅니다. 아웃!';
 else if(out==='ball'||/^볼(?:[ ·!]|$)/.test(text))title='볼. 타자가 공을 골라냅니다.';
 else if(play.strikeStyle==='looking'||/루킹/.test(text))title='루킹 스트라이크! 타자가 지켜봤습니다.';
 else if(out==='swinging_strike'||/헛스윙|스트라이크/.test(text))title='헛스윙 스트라이크! 배트가 공을 빗나갑니다.';
 else title=text||'투구 판정이 나왔습니다.';
 const details=[];
 if(play.execution==='mistake')details.push('투수의 실투가 나왔습니다.');
 if(play.execution==='bait')details.push('스트라이크존 바깥을 노린 유인구였습니다.');
 else if(play.execution==='wild')details.push('제구가 흔들려 공이 존을 벗어났습니다.');
 else if(Number.isInteger(play.actualCell)&&play.actualCell>=0&&play.actualCell<25){
  const row=Math.floor(play.actualCell/5),col=play.actualCell%5;
  details.push(`공은 ${['상단','상단 쪽','가운데 높이','하단 쪽','하단'][row]} ${['왼쪽','왼쪽 안쪽','중앙','오른쪽 안쪽','오른쪽'][col]} 코스로 들어왔습니다.`);
  if(Number.isInteger(play.batCell))details.push(play.batCell===play.actualCell?'타자가 노린 칸과 일치했습니다.':'타자가 노린 칸과 다른 위치였습니다.');
 }
 const pitch=[play.pitchName,Number(play.speed)>0?`${play.speed} km/h`:''].filter(Boolean).join(' · ');
 return {title,detail:details.join(' '),pitch};
}
