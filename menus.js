'use strict';
/* =========================================================
   SILENT CONTRACT — Game-feel layer: progression menus,
   banners, popups, cinematic overlays, animated results, boot
   ========================================================= */
const VIA_NAMES = { chandelier: 'Chandelier', push: 'Balcony Push', sauna: 'Sauna', pool: 'Electrocution', gas: 'Gas Explosion', charge: 'Remote Charge' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

Object.assign(UI, {
  _money: null, popups: [], bannerQ: [], bannerBusy: false,

  tweenMoney(target) {
    const elm = $('#hMoney'); if (!elm) return;
    if (this._money === null) { this._money = target; elm.textContent = money(target); return; }
    const from = this._money, t0 = performance.now(), d = 700;
    this._money = target;
    if (from === target) { elm.textContent = money(target); return; }
    elm.classList.add('bump');
    const step = () => { const k = Math.min(1, (performance.now() - t0) / d); elm.textContent = money(from + (target - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); else elm.classList.remove('bump'); };
    requestAnimationFrame(step);
  },
  autoDaily() { if (Game.S.created && Progress.dailyState().can) setTimeout(() => { if (Game.mode === 'hideout' && this.sheet.classList.contains('hidden')) this.daily(); }, 600); },

  /* ---------- daily rewards ---------- */
  daily() {
    const st = Progress.dailyState();
    const wrap = el('div', 'daily');
    wrap.appendChild(el('p', 'hint', st.can ? 'Log in every day to keep your streak going. Miss a day and it resets.' : 'Come back tomorrow for your next reward.'));
    const grid = el('div', 'days');
    DAILY_REWARDS.forEach((r, i) => {
      const claimed = st.can ? i < st.idx : i <= st.idx;
      const today = st.can && i === st.idx;
      const d = el('div', 'day' + (claimed ? ' got' : '') + (today ? ' today' : '') + (i === 6 ? ' big' : ''));
      const icon = r.suit ? '👔' : r.token ? '🎫' : r.xp ? '⭐' : '💵';
      d.innerHTML = `<div class="dn">DAY ${i + 1}</div><div class="di">${icon}</div><div class="dl">${r.label}</div>${claimed ? '<div class="dc">✔</div>' : ''}`;
      grid.appendChild(d);
    });
    wrap.appendChild(grid);
    wrap.appendChild(el('div', 'streak', `🔥 Streak: <b>${st.streak}</b> day${st.streak === 1 ? '' : 's'}`));
    let foot = null;
    if (st.can) {
      foot = el('button', 'btn primary big', 'Claim Reward');
      foot.onclick = () => {
        const res = Progress.claimDaily(); if (!res) return;
        Sfx.play('daily'); this.refreshMoney();
        this.banner('DAILY REWARD', res.r.label, '🎁');
        for (const u of res.ups) this.levelUp(u);
        this.daily();
        const t = this.sheet.querySelector('.day.got:last-of-type'); if (t) t.classList.add('pop');
      };
    }
    this.openSheet('Daily Rewards', wrap, { foot });
  },

  /* ---------- challenges ---------- */
  challenges(tab) {
    tab = tab || 'daily';
    Progress.refreshChallenges();
    const P = Game.S.prog;
    const wrap = el('div');
    const tabs = el('div', 'tabs');
    for (const [k, n] of [['daily', 'Daily'], ['mastery', 'City Mastery']]) { const t = el('button', 'tab' + (k === tab ? ' on' : ''), n); t.onclick = () => this.challenges(k); tabs.appendChild(t); }
    wrap.appendChild(tabs);
    if (tab === 'daily') {
      const now = new Date(), mid = new Date(now); mid.setHours(24, 0, 0, 0);
      const ms = mid - now, hh = Math.floor(ms / 3.6e6), mm = Math.floor(ms / 6e4) % 60;
      wrap.appendChild(el('p', 'hint', `New challenges in ${hh}h ${mm}m`));
      P.ch.list.forEach((c, i) => {
        const t = Progress.chDef(c);
        const d = el('div', 'chal' + (c.done ? ' done' : '') + (c.claimed ? ' claimed' : ''));
        d.innerHTML = `<div class="ch-t">${Progress.chText(c)}</div><div class="bar"><i style="width:${Math.min(100, c.prog / t.goal * 100)}%"></i><span>${Math.min(c.prog, t.goal)}/${t.goal}</span></div><div class="ch-r">💵 ${money(t.cash)} · ⭐ ${t.xp} XP</div>`;
        if (c.done && !c.claimed) { const b = el('button', 'btn sm primary', 'Claim'); b.onclick = () => { const r = Progress.claimChallenge(i); if (r) { Sfx.play('cash'); this.refreshMoney(); r.ups.forEach(u => this.levelUp(u)); this.challenges('daily'); } }; d.appendChild(b); }
        else if (c.claimed) d.appendChild(el('div', 'ch-ok', '✔'));
        wrap.appendChild(d);
      });
    } else {
      wrap.appendChild(el('p', 'hint', 'Each city has 6 mastery challenges. Each one completed earns +250 XP.'));
      CITIES.forEach((c, i) => {
        const m = Game.S.prog.mastery[c.id] || {}; const n = MASTERY.filter(x => m[x.id]).length;
        const d = el('div', 'mrow2' + (Game.cityUnlocked(i) ? '' : ' locked'));
        d.innerHTML = `<div class="mr-n"><b>${c.name}</b><span>${n}/${MASTERY.length}</span></div><div class="mr-c">${MASTERY.map(x => `<i class="${m[x.id] ? 'ok' : ''}" title="${x.name}">${m[x.id] ? '★' : '☆'}</i>`).join('')}</div>`;
        wrap.appendChild(d);
      });
    }
    this.openSheet('Challenges', wrap, { side: true });
  },

  /* ---------- achievements ---------- */
  achievements() {
    const P = Game.S.prog, wrap = el('div', 'achs');
    const got = Object.keys(P.ach).length;
    wrap.appendChild(el('div', 'ach-sum', `<b>${got}</b> / ${ACHIEVEMENTS.length} unlocked<div class="bar"><i style="width:${got / ACHIEVEMENTS.length * 100}%"></i></div>`));
    const sorted = ACHIEVEMENTS.slice().sort((a, b) => { const sa = P.ach[a.id] ? (P.ach[a.id].claimed ? 1 : 0) : 2, sb = P.ach[b.id] ? (P.ach[b.id].claimed ? 1 : 0) : 2; return sa - sb; });
    for (const a of sorted) {
      const st = P.ach[a.id], v = Math.min(a.goal, Progress.statVal(a.stat));
      const d = el('div', 'ach' + (st ? ' got' : '') + (st && !st.claimed ? ' ready' : ''));
      d.innerHTML = `<div class="a-ic">${st ? a.icon : '🔒'}</div><div class="a-t"><b>${a.name}</b><span>${a.desc}</span>${!st && a.goal > 1 ? `<div class="bar sm"><i style="width:${v / a.goal * 100}%"></i></div><em>${a.stat === 'earned' ? money(v) + ' / ' + money(a.goal) : v + ' / ' + a.goal}</em>` : ''}</div>`;
      if (st && !st.claimed) { const b = el('button', 'btn sm primary', money(a.cash)); b.onclick = () => { const r = Progress.claimAch(a.id); if (r) { Sfx.play('cash'); this.refreshMoney(); r.ups.forEach(u => this.levelUp(u)); this.achievements(); } }; d.appendChild(b); }
      else if (st) d.appendChild(el('div', 'ch-ok', '✔'));
      wrap.appendChild(d);
    }
    this.openSheet('Achievements', wrap, { side: true });
  },
  career() {
    const S = Game.S, P = S.prog, C = P.career;
    const rows = [['Agent level', P.level], ['Contracts completed', S.stats.contracts], ['S ranks', S.stats.s], ['Silent Assassin', C.sa], ['Total earned', money(S.stats.earned)],
      ['Cities completed', Object.keys(C.cities).length + ' / 15'], ['Accident kills', C.accident], ['Poison kills', C.poison], ['Fiber Wire kills', C.wire], ['Pistol kills', C.pistol], ['Melee kills', C.melee], ['Explosive kills', C.explosive],
      ['People subdued', C.ko], ['Bodies hidden', C.hidden], ['Coins thrown', C.coins], ['Daily challenges', P.dailies], ['Best streak', P.daily.streak + ' days']];
    const wrap = el('div', 'career');
    const top = el('div', 'car-top'); const cv = el('canvas', 'portrait'); cv.width = 96; cv.height = 96; drawPortrait(cv, S.look, 'suit'); top.appendChild(cv);
    top.appendChild(el('div', '', `<div class="b-name">Agent</div><div class="b-title">Level ${P.level}</div><div class="bar"><i style="width:${P.xp / xpForLevel(P.level) * 100}%"></i><span>${P.xp} / ${xpForLevel(P.level)} XP</span></div>`));
    wrap.appendChild(top);
    wrap.appendChild(el('div', 'rlines', rows.map(([a, b]) => `<div class="rl"><span>${a}</span><b>${b}</b></div>`).join('')));
    this.openSheet('Career', wrap, { side: true });
  },

  /* ---------- banners & popups ---------- */
  banner(title, text, icon) { this.bannerQ.push({ title, text, icon }); if (!this.bannerBusy) this.nextBanner(); },
  async nextBanner() {
    const b = this.bannerQ.shift(); if (!b) { this.bannerBusy = false; return; }
    this.bannerBusy = true;
    const e = $('#banner'); e.innerHTML = `<div class="bn-i">${b.icon}</div><div><div class="bn-t">${b.title}</div><div class="bn-x">${b.text}</div></div>`;
    e.classList.remove('hidden', 'out'); void e.offsetWidth; e.classList.add('in');
    await sleep(2600); e.classList.add('out'); await sleep(400); e.classList.add('hidden'); e.classList.remove('in');
    this.nextBanner();
  },
  levelUp(u) {
    Sfx.play('levelup');
    const o = $('#lvlup'); o.innerHTML = `<div class="lu-k">LEVEL UP</div><div class="lu-n">${u.level}</div><div class="lu-r">+${money(u.cash)}</div>`;
    o.classList.remove('hidden'); o.classList.remove('go'); void o.offsetWidth; o.classList.add('go');
    clearTimeout(this._luT); this._luT = setTimeout(() => o.classList.add('hidden'), 2400);
    if (Game.mode === 'hideout') this.refreshMoney();
  },
  popup(pos, text, cls) {
    const e = el('div', 'pop ' + (cls || ''), text); $('#popups').appendChild(e);
    this.popups.push({ e, pos: pos.slice(), t: 0 });
  },
  tickPopups(dt) {
    for (const p of this.popups) {
      p.t += dt; const s = Engine.project([p.pos[0], p.pos[1] + p.t * 0.8, p.pos[2]]);
      if (s) { p.e.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.3 - p.t)})`; p.e.style.opacity = Math.max(0, 1 - Math.max(0, p.t - 1.2) / 0.6); }
    }
    this.popups = this.popups.filter(p => { if (p.t > 1.8) { p.e.remove(); return false; } return true; });
  },
  killFlash(on, method, via) {
    const k = $('#killflash');
    if (!on) { k.classList.add('hidden'); return; }
    const m = METHODS.find(x => x.id === method);
    k.innerHTML = `<div class="kf-t">TARGET ELIMINATED</div><div class="kf-s">${(m ? m.name : method || '').toUpperCase()}${via ? ' · ' + VIA_NAMES[via].toUpperCase() : ''}</div>`;
    k.classList.remove('hidden'); k.classList.remove('go'); void k.offsetWidth; k.classList.add('go');
  },
  letterbox(on, title, sub) {
    const L = $('#letterbox');
    if (!on) { L.classList.add('out'); setTimeout(() => L.classList.add('hidden'), 500); return; }
    L.innerHTML = `<div class="lb-bar top"></div><div class="lb-bar bot"></div><div class="lb-txt"><div class="lb-t">${title}</div><div class="lb-s">${sub}</div><div class="lb-skip">tap to skip</div></div>`;
    L.classList.remove('hidden', 'out');
  },

  /* ---------- animated results ---------- */
  async showResult(res) {
    this.hideAll();
    const r = $('#result'); r.classList.remove('hidden');
    let fast = false; r.onclick = () => { fast = true; };
    const w = ms => fast ? Promise.resolve() : sleep(ms);
    r.innerHTML = `<div class="rbox">
      <div class="r-city">${res.city.name} · ${res.city.venue}</div>
      <div class="r-head ${res.success ? 'good' : 'bad'}">${res.success ? 'CONTRACT COMPLETE' : 'CONTRACT FAILED'}</div>
      <div class="r-rank r-${res.rank}" id="rRank"></div>
      <div id="rStats"></div><div class="rlines" id="rLines"></div>
      <div class="r-pay"><span>Payout</span><b id="rPay">$0</b></div>
      <div class="r-xp"><div class="rx-l"><span>Agent Level <b id="rLv">${res.xpFrom.level}</b></span><em id="rXpG">+0 XP</em></div><div class="bar"><i id="rXpB" style="width:${res.xpFrom.xp / xpForLevel(res.xpFrom.level) * 100}%"></i></div></div>
      <div id="rExtra"></div>
      <div class="r-btns" id="rBtns" style="visibility:hidden"><button class="btn" id="rRetry">${res.success ? 'New Contract Here' : 'Retry'}</button><button class="btn primary" id="rHome">Return to Hideout</button></div></div>`;
    $('#rHome').onclick = e => { e.stopPropagation(); r.classList.add('hidden'); Game.enterHideout(); this.autoDaily(); };
    $('#rRetry').onclick = e => { e.stopPropagation(); r.classList.add('hidden'); Game.enterHideout(); this.openStation('contracts'); this.briefing(res.C.ci); };
    Sfx.play(res.success ? 'whoosh' : 'fail');
    await w(500);
    if (res.stats) $('#rStats').innerHTML = `<div class="rstats"><span>⏱ ${fmtTime(res.stats.time)}</span><span>🎯 ${(METHODS.find(m => m.id === res.stats.method) || { name: res.stats.method || '-' }).name}</span><span>👁 ${res.stats.spotted ? 'Spotted' : 'Unseen'}</span><span>⚰ ${res.stats.bodies} found</span><span>👔 ${res.stats.disguises} disguises</span></div>`;
    for (const [n, v] of res.lines) {
      const d = el('div', 'rl in', `<span>${n}</span><b class="${v < 0 ? 'bad' : ''}">${v ? money(v) : ''}</b>`);
      $('#rLines').appendChild(d); Sfx.play('tick'); await w(240);
    }
    // payout count
    const t0 = performance.now(), D = fast ? 1 : 900;
    await new Promise(res2 => { const st = () => { const k = Math.min(1, (performance.now() - t0) / D); $('#rPay').textContent = money(res.payout * k); if (Math.random() < 0.3) Sfx.play('tick'); if (k < 1 && !fast) requestAnimationFrame(st); else { $('#rPay').textContent = money(res.payout); res2(); } }; st(); });
    if (res.payout) Sfx.play('cash');
    await w(300);
    // rank stamp
    const rk = $('#rRank'); rk.textContent = res.rank; rk.classList.add('stamp'); Sfx.play('rank'); Engine.shakeAmt = 0.5;
    if (res.sa) this.banner('SILENT ASSASSIN', 'Nobody ever knew you were there', '👻');
    await w(700);
    // XP
    $('#rXpG').textContent = `+${res.xp} XP`;
    let lv = res.xpFrom.level, xp = res.xpFrom.xp, gain = res.xp;
    while (gain > 0) {
      const need = xpForLevel(lv) - xp, add = Math.min(need, gain);
      xp += add; gain -= add;
      $('#rXpB').style.width = (xp / xpForLevel(lv) * 100) + '%';
      await w(650);
      if (xp >= xpForLevel(lv)) { lv++; xp = 0; $('#rLv').textContent = lv; $('#rXpB').style.transition = 'none'; $('#rXpB').style.width = '0%'; void $('#rXpB').offsetWidth; $('#rXpB').style.transition = ''; }
    }
    for (const u of res.ups) this.levelUp(u);
    // extras
    const ex = [];
    if (res.mastery && res.mastery.length) ex.push(`<div class="r-mast">🏅 Mastery: ${res.mastery.map(m => `<span>${m.name}</span>`).join('')}</div>`);
    if (res.challenges) ex.push(`<div class="r-mast">✅ ${res.challenges} daily challenge${res.challenges > 1 ? 's' : ''} completed — claim in Challenges</div>`);
    $('#rExtra').innerHTML = ex.join('');
    $('#rBtns').style.visibility = 'visible';
  }
});

// wrap mission start to add the cinematic letterbox
(function () {
  const orig = UI.showMission;
  UI.showMission = function () {
    orig.call(this);
    const C = Game.C, c = CITIES[C.ci];
    this.letterbox(true, c.name.toUpperCase(), `${c.venue} — Target: ${C.name}`);
  };
})();

/* =========================================================
   Boot
   ========================================================= */
(function boot() {
  const cv = $('#gl');
  try { Engine.init(cv); } catch (e) { $('#loading').innerHTML = '<div class="err">This game needs WebGL2. Please use an up-to-date browser.<br><small>' + e.message + '</small></div>'; $('#loading').classList.remove('hidden'); return; }
  Game.load(); Progress.ensure();
  Engine.quality = Game.S.settings.quality;
  Sfx.on.music = Game.S.settings.music !== false; Sfx.on.sfx = Game.S.settings.sfx !== false;
  UI.init(); Input.init(cv);
  Engine.resize();
  window.addEventListener('resize', () => Engine.resize());
  Game.enterHideout();
  UI.showTitle();
  $('#loading').classList.add('hidden');
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    Engine.resize();
    if (!$('#title').classList.contains('hidden')) Engine.cam.yaw += dt * 0.08;
    try { Game.update(dt); Game.render(dt); UI.tickPopups(dt); } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (Sfx.ctx) { if (document.hidden) Sfx.ctx.suspend(); else Sfx.ctx.resume(); } if (document.hidden && Game.mode === 'mission' && !Game.paused) UI.pause(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
})();

/* =========================================================
   Contracts hub: campaign, free contracts, elusive target
   ========================================================= */
Object.assign(UI, {
  contracts(tab) {
    tab = tab || this._ctab || 'campaign'; this._ctab = tab;
    const P = Game.S.prog, wrap = el('div');
    const es = Elusive.state();
    const tabs = el('div', 'tabs');
    for (const [k, n] of [['campaign', `Campaign ${P.campaign || 0}/15`], ['free', 'Contracts'], ['elusive', 'Elusive' + (es.status === 'open' ? ' •' : '')]]) { const t = el('button', 'tab' + (k === tab ? ' on' : ''), n); t.onclick = () => this.contracts(k); tabs.appendChild(t); }
    wrap.appendChild(tabs);
    if (tab === 'campaign') {
      wrap.appendChild(el('div', 'camp-head', `<b>THE MERIDIAN LEDGER</b><span>A shadow syndicate with eleven council seats and one chairman. Follow the money across fifteen cities.</span>`));
      const list = el('div', 'chapters');
      CAMPAIGN.forEach((ch, i) => {
        const done = i < (P.campaign || 0), cur = i === (P.campaign || 0), lock = i > (P.campaign || 0);
        const d = el('div', 'chap' + (done ? ' done' : '') + (cur ? ' cur' : '') + (lock ? ' locked' : ''));
        d.innerHTML = `<div class="chn">${String(i + 1).padStart(2, '0')}</div><div class="cht"><b>${lock ? '???' : ch.name}</b><span>${CITIES[ch.ci].name} · ${lock ? 'Classified' : ch.title}</span></div><div class="chs">${done ? '✔' : cur ? '▶' : '🔒'}</div>`;
        if (!lock) d.onclick = () => this.briefing(ch.ci, 0, 'campaign', i);
        list.appendChild(d);
      });
      wrap.appendChild(list);
      setTimeout(() => { const c = list.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'center' }); }, 50);
    } else if (tab === 'free') {
      wrap.appendChild(el('p', 'hint', 'Free contracts: a new random target every time. Cities unlock as you progress.'));
      const grid = el('div', 'cities');
      CITIES.forEach((c, i) => {
        const un = Game.cityUnlocked(i), best = Game.S.best[c.id], mc = Progress.masteryCount(i);
        const d = el('div', 'city' + (un ? '' : ' locked') + ' t-' + c.time);
        d.innerHTML = `<div class="city-n">${String(i + 1).padStart(2, '0')} · ${resolveLayout(c).name}</div><div class="city-name">${c.name}</div><div class="city-v">${un ? c.venue : 'Locked — complete ' + CITIES[i - 1].name}</div>${un ? `<div class="stars">${'★'.repeat(mc)}<i>${'★'.repeat(MASTERY.length - mc)}</i></div>` : ''}${best ? `<div class="rank r-${best}">${best}</div>` : ''}`;
        if (un) d.onclick = () => this.briefing(i, 0, 'free');
        grid.appendChild(d);
      });
      wrap.appendChild(grid);
    } else {
      const C = Game.getContract(es.ci, 'elusive');
      const card = el('div', 'elusive ' + es.status);
      const cv = el('canvas', 'portrait'); cv.width = 96; cv.height = 96; drawPortrait(cv, C.looks, C.outfit);
      card.appendChild(cv);
      card.appendChild(el('div', 'el-i', `<div class="el-tag">ELUSIVE TARGET</div><div class="b-name">${C.name}</div><div class="b-title">${C.title.replace('Elusive Target · ', '')}</div><div class="b-venue">${CITIES[es.ci].name} · ${CITIES[es.ci].venue}</div><div class="el-t">⏳ Gone in ${Elusive.timeLeft()}</div>`));
      wrap.appendChild(card);
      wrap.appendChild(el('p', 'hint', `One attempt only. If you die, abort or fail, the target disappears until tomorrow. Always guarded, no full guidance. Pays ${money(C.fee)} and +1,500 XP.`));
      if (es.status === 'open') { const b = el('button', 'btn primary big', 'Accept Contract'); b.style.width = '100%'; b.onclick = () => this.briefing(es.ci, 0, 'elusive'); wrap.appendChild(b); }
      else wrap.appendChild(el('div', 'el-done ' + es.status, es.status === 'done' ? '✔ TARGET ELIMINATED — new target tomorrow' : '✕ TARGET ESCAPED — new target tomorrow'));
    }
    this.openSheet('Contracts', wrap, { wide: true });
  },
  briefing(ci, intel, mode, chapter, start) {
    mode = mode || 'free'; intel = intel || 0; start = start || 'street';
    const C = Game.getContract(ci, mode, chapter); ci = C.ci;
    const city = CITIES[ci], S = Game.S;
    const again = (i, st) => this.briefing(ci, i === undefined ? intel : i, mode, chapter, st || start);
    const wrap = el('div', 'brief');
    if (mode === 'campaign') wrap.appendChild(el('div', 'chap-tag', `CHAPTER ${chapter + 1} / ${CAMPAIGN.length}`));
    if (mode === 'elusive') wrap.appendChild(el('div', 'chap-tag el', 'ELUSIVE TARGET · ONE ATTEMPT'));
    const top = el('div', 'b-top');
    const cv = el('canvas', 'portrait'); cv.width = 96; cv.height = 96; drawPortrait(cv, C.looks, C.outfit);
    top.appendChild(cv);
    const LYb = resolveLayout(city);
    top.appendChild(el('div', 'b-info', `<div class="b-city">${city.name}, ${city.country} · ${city.time} · ${LYb.name}, ${LYb.floors.length} floors</div><div class="b-name">${C.name}</div><div class="b-title">${C.title}</div><div class="b-venue">${city.venue}</div>`));
    wrap.appendChild(top);
    if (C.story) wrap.appendChild(el('div', 'handler', `<div class="h-av">📡</div><div><b>${HANDLER}</b><p>${C.story.brief}</p></div>`));
    else wrap.appendChild(el('p', 'b-blurb', city.blurb));
    wrap.appendChild(el('p', 'b-blurb', `The target is wearing ${describeLooks(C.looks, C.outfit)}.${C.bodyguard ? ' Travels with a bodyguard.' : ''}`));
    { const m = Progress.mastery(ci); wrap.appendChild(el('div', 'mast', MASTERY.map(x => `<span class="${m[x.id] ? 'ok' : ''}">${m[x.id] ? '✔' : '○'} ${x.name}</span>`).join(''))); }
    const mth = METHODS.find(x => x.id === C.method);
    wrap.appendChild(el('div', 'b-grid', `<div><span>Fee</span><b>${money(C.fee)}</b></div><div><span>Preferred kill</span><b>${mth.name}${C.method !== 'any' ? ' (+30%)' : ''}</b></div><div><span>Silent Assassin</span><b>+40%</b></div><div><span>Suit Only</span><b>+15%</b></div>`));
    // starting location
    wrap.appendChild(el('div', 'sec', 'Starting Location'));
    const mc = Progress.masteryCount(ci);
    const sl = el('div', 'starts');
    for (const s of STARTS) {
      const ok = mc >= s.req;
      const b = el('div', 'start' + (start === s.id ? ' on' : '') + (ok ? '' : ' locked'), `<div class="st-i">${ok ? s.icon : '🔒'}</div><b>${s.name}</b><span>${ok ? s.desc : `Needs ${s.req}★ mastery here`}</span>`);
      if (ok) b.onclick = () => again(intel, s.id);
      sl.appendChild(b);
    }
    wrap.appendChild(sl);
    // intel
    const it = el('div', 'intel'); it.appendChild(el('div', 'sec', 'Handler Guidance'));
    const opts = [[0, 'Go in blind', 'Target only marked when you see them.'], [1, 'Target Intel', 'Target tracked at all times + their schedule.']];
    if (mode !== 'elusive') opts.push([2, 'Full Guidance', 'Everything above + step-by-step kill opportunities and item markers.']);
    for (const [t, n, d] of opts) {
      const tok = t && S.prog.tokens > 0, price = t && !tok ? Game.intelPrice(t) : 0;
      const b = el('div', 'opt' + (intel === t ? ' on' : ''));
      b.innerHTML = `<b>${n}</b><span>${d}</span><em>${tok ? '🎫 Token' : price ? money(price) : 'Free'}</em>`;
      b.onclick = () => { if (price > S.money) { this.toast('Not enough money', 'bad'); return; } again(t); };
      it.appendChild(b);
    }
    wrap.appendChild(it);
    // loadout
    const lo = el('div', 'lo'); lo.appendChild(el('div', 'sec', 'Loadout'));
    const items = [S.loadout.weapon].concat(S.loadout.gear.slice(0, Game.gearSlots())).filter(Boolean);
    lo.appendChild(el('div', 'lo-items', items.map(i => `<span>${ITEMS[i].icon} ${ITEMS[i].name}</span>`).join('') || '<span>Nothing</span>'));
    const lb = el('div', 'lo-btns');
    const b1 = el('button', 'btn sm', 'Change weapon'); b1.onclick = () => { this.armory(); this.backTo = () => again(); this.addBack(); };
    const b2 = el('button', 'btn sm', 'Change gear'); b2.onclick = () => { this.gear(); this.backTo = () => again(); this.addBack(); };
    lb.append(b1, b2);
    if (mode === 'free') { const b3 = el('button', 'btn sm', '🎲 New contract'); b3.onclick = () => { Game.rerollContract(ci); again(); }; lb.appendChild(b3); }
    lo.appendChild(lb); wrap.appendChild(lo);
    const foot = el('div', 'foot2');
    const back = el('button', 'btn', 'Back'); back.onclick = () => this.contracts();
    const go = el('button', 'btn primary', `Start Mission${intel ? ' · ' + (S.prog.tokens > 0 ? '🎫' : money(Game.intelPrice(intel))) : ''}`);
    go.onclick = () => { this.closeSheet(); this.loading(() => Game.startMission(ci, intel, { mode, chapter, start })); };
    foot.append(back, go);
    this.openSheet(mode === 'campaign' ? 'Campaign Briefing' : mode === 'elusive' ? 'Elusive Briefing' : 'Briefing', wrap, { wide: true, foot });
  }
});
// extend results with story debrief + mode-aware buttons
(function () {
  const orig = UI.showResult;
  UI.showResult = async function (res) {
    await orig.call(this, res);
    const C = res.C;
    if (res.story) $('#rExtra').insertAdjacentHTML('beforeend', `<div class="handler"><div class="h-av">📡</div><div><b>${HANDLER}</b><p>${res.story.debrief}</p></div></div>`);
    const rt = $('#rRetry');
    if (C.mode === 'elusive') rt.style.display = 'none';
    else if (C.mode === 'campaign') {
      const next = res.success && C.chapter + 1 < CAMPAIGN.length;
      rt.textContent = next ? 'Next Chapter' : res.success ? 'Replay Chapter' : 'Retry';
      rt.onclick = e => { e.stopPropagation(); $('#result').classList.add('hidden'); Game.enterHideout(); const ch = next ? C.chapter + 1 : C.chapter; this._ctab = 'campaign'; this.briefing(CAMPAIGN[ch].ci, 0, 'campaign', ch); };
    } else {
      rt.onclick = e => { e.stopPropagation(); $('#result').classList.add('hidden'); Game.enterHideout(); this._ctab = 'free'; this.briefing(C.ci, 0, 'free'); };
    }
  };
})();
