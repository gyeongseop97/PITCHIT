(() => {
  const HUD_ID = 'pitchitDesktopHud';
  const STYLE_ID = 'pitchitDesktopHudStyle';
  let renderQueued = false;

  const text = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const find = (selector, scope = document) => scope.querySelector(selector);
  const all = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html.pitchit-desktop-hud-active #game.show .board .score { display: none !important; }
      html.pitchit-desktop-hud-active #game.show .board { margin-top: 12px !important; }
      #${HUD_ID} { box-sizing: border-box; display: grid; grid-template-columns: minmax(142px, .9fr) minmax(108px, .58fr) minmax(205px, 1.45fr); gap: 0; width: 100%; margin: 12px 0 16px; overflow: hidden; border: 2px solid #213e53; background: #07131d; box-shadow: 0 7px 16px #07162530; color: #edf6fb; font-family: Arial, "Noto Sans KR", sans-serif; }
      #${HUD_ID}[hidden] { display: none !important; }
      #${HUD_ID} *, #${HUD_ID} *::before, #${HUD_ID} *::after { box-sizing: border-box; }
      #${HUD_ID} .pdh-score { display: grid; grid-template-columns: 56px minmax(0, 1fr); min-height: 94px; border-right: 1px solid #426072; }
      #${HUD_ID} .pdh-inning { display: grid; place-content: center; gap: 2px; border-right: 1px solid #426072; background: linear-gradient(135deg, #193143, #0b1924); text-align: center; }
      #${HUD_ID} .pdh-inning small, #${HUD_ID} .pdh-label { color: #9db5c4; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
      #${HUD_ID} .pdh-inning strong { color: #fff05d; font-size: 22px; line-height: 1; text-shadow: 0 0 8px #f4df3b55; }
      #${HUD_ID} .pdh-phase { color: #cbdce5; font-size: 10px; font-weight: 800; }
      #${HUD_ID} .pdh-teams { display: grid; min-width: 0; }
      #${HUD_ID} .pdh-team { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px; min-width: 0; padding: 7px 10px; border-bottom: 1px solid #304b5d; }
      #${HUD_ID} .pdh-team:last-child { border-bottom: 0; }
      #${HUD_ID} .pdh-team b { overflow: hidden; color: #e8f3f8; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
      #${HUD_ID} .pdh-team strong { min-width: 24px; color: #fff25d; font-size: 24px; line-height: .9; text-align: right; }
      #${HUD_ID} .pdh-field { display: grid; grid-template-columns: 1fr 58px; align-items: center; gap: 5px; min-height: 94px; padding: 8px; border-right: 1px solid #426072; }
      #${HUD_ID} .pdh-bases { position: relative; width: 56px; height: 56px; margin: auto; transform: rotate(45deg); }
      #${HUD_ID} .pdh-base { position: absolute; width: 16px; height: 16px; border: 2px solid #8ea8b8; background: #152735; box-shadow: inset 0 1px 2px #0008; }
      #${HUD_ID} .pdh-base.is-on { border-color: #fff6ad; background: #f0c93f; box-shadow: 0 0 9px #f3cf43aa; }
      #${HUD_ID} .pdh-base[data-base="2"] { top: 0; left: 20px; }
      #${HUD_ID} .pdh-base[data-base="3"] { top: 20px; left: 0; }
      #${HUD_ID} .pdh-base[data-base="1"] { top: 20px; right: 0; }
      #${HUD_ID} .pdh-bso { display: grid; gap: 5px; }
      #${HUD_ID} .pdh-bso-row { display: grid; grid-template-columns: 10px repeat(3, 9px); align-items: center; gap: 3px; }
      #${HUD_ID} .pdh-bso-row strong { color: #b8c9d2; font-size: 10px; }
      #${HUD_ID} .pdh-bso-row > span { display: grid; grid-column: 2 / -1; grid-template-columns: repeat(3, 9px); gap: 3px; }
      #${HUD_ID} .pdh-bso-row i { display: block; width: 9px; height: 9px; border: 1px solid #73909f; border-radius: 50%; background: #162735; }
      #${HUD_ID} .pdh-bso-row.ball i.is-on { border-color: #bfffc5; background: #29d85a; box-shadow: 0 0 6px #29d85a; }
      #${HUD_ID} .pdh-bso-row.strike i.is-on { border-color: #fff5a7; background: #f1d53e; box-shadow: 0 0 6px #f1d53e; }
      #${HUD_ID} .pdh-bso-row.out i.is-on { border-color: #ffc3bb; background: #eb4e44; box-shadow: 0 0 6px #eb4e44; }
      #${HUD_ID} .pdh-battery { display: grid; grid-template-rows: 1fr 1fr; min-width: 0; }
      #${HUD_ID} .pdh-card { position: relative; min-width: 0; padding: 7px 11px; overflow: hidden; border-bottom: 1px solid #426072; background: #0a1924; }
      #${HUD_ID} .pdh-card:last-child { border-bottom: 0; background: #0d202d; }
      #${HUD_ID} .pdh-card small { display: block; margin-bottom: 2px; color: #9fb8c7; font-size: 9px; font-weight: 900; letter-spacing: .09em; }
      #${HUD_ID} .pdh-card b { display: block; padding-right: 70px; overflow: hidden; color: #fff; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
      #${HUD_ID} .pdh-card span { display: block; margin-top: 2px; overflow: hidden; color: #c5d5dd; font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
      #${HUD_ID} .pdh-swap { position: absolute; top: 7px; right: 9px; border: 1px solid #ffb0a4; background: #d94738; color: #fff; padding: 4px 7px; font: 900 10px Arial, "Noto Sans KR", sans-serif; cursor: pointer; }
      #${HUD_ID} .pdh-swap[hidden] { display: none; }
      #${HUD_ID} .pdh-swap:hover { filter: brightness(1.12); }
      @media (max-width: 650px) {
        #${HUD_ID} { grid-template-columns: minmax(0, 1fr) 112px; grid-template-rows: 76px auto; }
        #${HUD_ID} .pdh-score { grid-column: 1; grid-template-columns: 50px minmax(0, 1fr); min-height: 76px; }
        #${HUD_ID} .pdh-field { grid-column: 2; grid-template-columns: 1fr 45px; min-height: 76px; padding: 5px; border-right: 0; }
        #${HUD_ID} .pdh-bases { transform: scale(.78) rotate(45deg); }
        #${HUD_ID} .pdh-bso { gap: 4px; }
        #${HUD_ID} .pdh-bso-row { grid-template-columns: 8px repeat(3, 8px); gap: 2px; }
        #${HUD_ID} .pdh-bso-row strong { font-size: 9px; }
        #${HUD_ID} .pdh-bso-row > span { grid-template-columns: repeat(3, 8px); gap: 2px; }
        #${HUD_ID} .pdh-bso-row i { width: 8px; height: 8px; }
        #${HUD_ID} .pdh-battery { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; grid-template-rows: none; }
        #${HUD_ID} .pdh-card { min-height: 65px; padding: 7px 8px; border-bottom: 0; }
        #${HUD_ID} .pdh-card:last-child { border-left: 1px solid #426072; }
        #${HUD_ID} .pdh-card b { padding-right: 0; font-size: 13px; }
        #${HUD_ID} .pdh-card span { font-size: 9px; }
        #${HUD_ID} .pdh-card:last-child b { padding-right: 55px; }
        #${HUD_ID} .pdh-swap { top: 7px; right: 7px; padding: 3px 5px; font-size: 9px; }
        #${HUD_ID} .pdh-inning strong { font-size: 20px; }
        #${HUD_ID} .pdh-team { padding: 7px; }
        #${HUD_ID} .pdh-team b { font-size: 12px; }
        #${HUD_ID} .pdh-team strong { font-size: 21px; }
      }
    `;
    (document.head || document.documentElement).append(style);
  }

  function createHud() {
    const hud = document.createElement('section');
    hud.id = HUD_ID;
    hud.hidden = true;
    hud.setAttribute('aria-label', 'PITCHIT 데스크톱 전광판');
    hud.innerHTML = `
      <section class="pdh-score">
        <div class="pdh-inning"><small>INNING</small><strong data-inning>1회</strong><span class="pdh-phase" data-phase></span></div>
        <div class="pdh-teams">
          <div class="pdh-team"><b data-team-name="0">우리 팀</b><strong data-team-score="0">0</strong></div>
          <div class="pdh-team"><b data-team-name="1">상대 팀</b><strong data-team-score="1">0</strong></div>
        </div>
      </section>
      <section class="pdh-field">
        <div class="pdh-bases" aria-label="주자 현황"><i class="pdh-base" data-base="2"></i><i class="pdh-base" data-base="3"></i><i class="pdh-base" data-base="1"></i></div>
        <div class="pdh-bso" aria-label="볼 스트라이크 아웃"><div class="pdh-bso-row ball"><strong>B</strong><span></span></div><div class="pdh-bso-row strike"><strong>S</strong><span></span></div><div class="pdh-bso-row out"><strong>O</strong><span></span></div></div>
      </section>
      <section class="pdh-battery">
        <article class="pdh-card"><small>현재 타자</small><b data-batter-name>현재 타자</b><span data-batter-stats>정보를 불러오는 중입니다.</span></article>
        <article class="pdh-card"><small>현재 투수</small><b data-pitcher-name>현재 투수</b><span data-pitcher-stats>정보를 불러오는 중입니다.</span><button type="button" class="pdh-swap" data-swap hidden>투수 교체</button></article>
      </section>
    `;
    hud.querySelector('[data-swap]').addEventListener('click', () => {
      const sourceButton = document.getElementById('scoreSwap');
      if (sourceButton && !sourceButton.disabled) sourceButton.click();
    });
    return hud;
  }

  function ensureHud() {
    const game = document.getElementById('game');
    if (!game) return null;
    let hud = document.getElementById(HUD_ID);
    if (!hud) {
      hud = createHud();
      const top = find(':scope > .top', game);
      if (top) top.insertAdjacentElement('afterend', hud);
      else game.prepend(hud);
    }
    return hud;
  }

  function cleanLabel(selector) {
    const original = find(selector);
    if (!original) return '';
    const clone = original.cloneNode(true);
    all('button', clone).forEach((button) => button.remove());
    return text(clone);
  }

  function numberFor(id, groupClass, max) {
    const direct = Number(text(document.getElementById(id)));
    if (Number.isFinite(direct)) return Math.max(0, Math.min(max, direct));
    return Math.min(max, all(`.counts .countGroup.${groupClass} i.on`).length);
  }

  function setDots(row, amount, max) {
    const dots = row.querySelector('span');
    if (!dots) return;
    dots.replaceChildren(...Array.from({ length: max }, (_, index) => {
      const dot = document.createElement('i');
      dot.className = index < amount ? 'is-on' : '';
      return dot;
    }));
  }

  function teamValues() {
    const rows = all('#bpLineScore tbody tr');
    const parsed = rows.map((row) => ({
      name: text(find('.team', row)),
      score: text(find('.total', row)),
    })).filter((team) => team.name || team.score);
    if (parsed.length >= 2) return parsed.slice(0, 2);
    return [
      { name: text(find('#bpHomeSheet header b')) || '우리 팀', score: text(document.getElementById('runs')) || '0' },
      { name: text(find('#bpAwaySheet header b')) || '상대 팀', score: text(document.getElementById('awayRuns')) || '0' },
    ];
  }

  function pitcherMetaText() {
    const metrics = all('#bpPitchMeta .bpMetricCluster span').map((metric) => {
      const label = text(find('small', metric));
      const value = text(find('b', metric));
      return label && value ? `${label} ${value}` : '';
    }).filter(Boolean);
    const pitch = text(find('#bpPitchMeta .scorePitch'));
    return [...metrics, pitch].filter(Boolean).join(' · ') || text(find('#bpPitchMeta'));
  }

  function renderHud() {
    const game = document.getElementById('game');
    const hud = ensureHud();
    const inGame = Boolean(game?.classList.contains('show'));
    document.documentElement.classList.toggle('pitchit-desktop-hud-active', inGame);
    if (!hud) return;
    hud.hidden = !inGame;
    if (!inGame) return;

    const teams = teamValues();
    teams.forEach((team, index) => {
      const name = find(`[data-team-name="${index}"]`, hud);
      const score = find(`[data-team-score="${index}"]`, hud);
      if (name) name.textContent = team.name || (index ? '상대 팀' : '우리 팀');
      if (score) score.textContent = team.score || '0';
    });

    const inning = text(find('#bpLineScore thead .isCurrent')) || text(document.getElementById('inning')) || '1';
    const mode = text(document.getElementById('modeTitle'));
    const phase = /수비|투구/.test(mode) ? '수비' : /공격|타격/.test(mode) ? '공격' : '';
    find('[data-inning]', hud).textContent = `${inning}회`;
    find('[data-phase]', hud).textContent = phase;

    [['1', 'b1'], ['2', 'b2'], ['3', 'b3']].forEach(([base, sourceId]) => {
      find(`[data-base="${base}"]`, hud).classList.toggle('is-on', document.getElementById(sourceId)?.classList.contains('on'));
    });
    setDots(find('.pdh-bso-row.ball', hud), numberFor('balls', 'ball', 3), 3);
    setDots(find('.pdh-bso-row.strike', hud), numberFor('strikes', 'strike', 2), 2);
    setDots(find('.pdh-bso-row.out', hud), numberFor('outs', 'out', 2), 2);

    const batterName = cleanLabel('#bpBatter article b') || cleanLabel('#scoreMatchup article:first-child b') || '현재 타자';
    const batterStats = text(find('#bpBatter article span')) || text(find('#scoreMatchup article:first-child span')) || '타자 정보 준비 중';
    const pitcherName = cleanLabel('#bpPitcher article b') || cleanLabel('#scoreMatchup article:nth-child(2) b') || '현재 투수';
    const pitcherStats = pitcherMetaText() || text(find('#bpPitcher article span')) || text(find('#scoreMatchup article:nth-child(2) span')) || '투수 정보 준비 중';
    find('[data-batter-name]', hud).textContent = batterName;
    find('[data-batter-stats]', hud).textContent = batterStats;
    find('[data-pitcher-name]', hud).textContent = pitcherName;
    find('[data-pitcher-stats]', hud).textContent = pitcherStats;

    const sourceSwap = document.getElementById('scoreSwap');
    const swap = find('[data-swap]', hud);
    swap.hidden = !sourceSwap;
    swap.disabled = !sourceSwap || sourceSwap.disabled;
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      renderHud();
    });
  }

  function boot() {
    ensureStyle();
    scheduleRender();
    const observer = new MutationObserver((records) => {
      const hud = document.getElementById(HUD_ID);
      if (hud && records.length && records.every((record) => hud.contains(record.target))) return;
      scheduleRender();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('hashchange', scheduleRender);
    window.addEventListener('pageshow', scheduleRender);
    document.addEventListener('click', () => window.setTimeout(scheduleRender, 0), true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
