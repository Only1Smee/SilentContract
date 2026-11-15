'use strict';
/* =========================================================
   SILENT CONTRACT — Story cutscenes, records & replays,
   Sniper Assassin mode, trophy wall and pets
   ========================================================= */

/* ---------- save defaults ---------- */
const EXTRA_DEFAULTS = () => ({
  records: {}, trophies: {},
  pets: { owned: {}, active: null, col: {}, name: 'Shadow' },
  sniper: { rifle: 'r0', owned: ['r0'], seeds: {}, best: {} }
});
(function () {
  const ns = Game.newSave;
  Game.newSave = function () { return Object.assign(ns.call(this), EXTRA_DEFAULTS()); };
})();
function ensureExtras() {
  const S = Game.S, D = EXTRA_DEFAULTS();
  for (const k in D) if (!S[k] || typeof S[k] !== 'object') S[k] = D[k];
  for (const k in D.pets) if (S.pets[k] === undefined) S.pets[k] = D.pets[k];
  for (const k in D.sniper) if (S.sniper[k] === undefined) S.sniper[k] = D.sniper[k];
  const P = S.prog; if (P) { P.cuts = P.cuts || {}; P.career = P.career || {}; }
}

['#shud', '#rphud', '#cine'].forEach(s => { const e = document.querySelector(s); if (e) e.innerHTML = e.innerHTML; });

/* reset per-scene camera tweaks whenever a map loads */
(function () {
  const lm = Game.loadMap;
  Game.loadMap = function (M) {
    Engine.cam.fov = 0.75; Engine.fadeLift = 1.0; Engine.fadeR = 0.11;
    $('#shud') && $('#shud').classList.add('hidden');
    return lm.call(this, M);
  };
  const hide = UI.hideAll;
  UI.hideAll = function () { hide.call(this); ['#shud', '#rphud', '#cine'].forEach(s => { const e = $(s); if (e) e.classList.add('hidden'); }); };
})();

function sceneLights(force) {
  const c = Engine.cam, L = Game.M.lights, max = Engine.quality === 'lite' ? 4 : 10;
  if (L.length <= max) { Engine.lights = L; return; }
  const now = performance.now();
  if (!force && sceneLights.t && now - sceneLights.t < 500) return;
  sceneLights.t = now;
  Engine.lights = L.slice().sort((a, b) => ((a.x - c.tx) ** 2 + (a.y - c.ty) ** 2 * 4 + (a.z - c.tz) ** 2) - ((b.x - c.tx) ** 2 + (b.y - c.ty) ** 2 * 4 + (b.z - c.tz) ** 2)).slice(0, max);
}
function camTo(c, g, k) {
  c.tx += (g.tx - c.tx) * k; c.ty += (g.ty - c.ty) * k; c.tz += (g.tz - c.tz) * k;
  c.dist += (g.dist - c.dist) * k; c.pitch += (g.pitch - c.pitch) * k; c.yaw += angDiff(c.yaw, g.yaw) * k;
}
function sentences(txt) { return (txt.match(/[^.!?]+[.!?]+["']?/g) || [txt]).map(s => s.trim()).filter(Boolean); }
function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n).join(' ')); return o; }

/* =========================================================
   Dispatcher used by Game.update / render / onTap
   ========================================================= */
const Extras = {
  update(dt) {
    if (Game.mode === 'cutscene') Cutscene.update(dt);
    else if (Game.mode === 'replay') Replay.update(dt);
  },
  tap() {
    if (Game.mode === 'cutscene') Cutscene.next();
  },
  drawActors(t) {
    if (Game.mode === 'hideout') Pets.draw(t);
    else if (Game.mode === 'cutscene' || (Game.mode === 'result' && Cutscene.actors && Game.M === Cutscene.M)) Cutscene.draw(t);
    else if (Game.mode === 'replay') Replay.draw(t);
  }
};

/* =========================================================
   1) STORY CUTSCENES WITH IRIS
   ========================================================= */
const IRIS_LOOKS = { skin: 2, hairCol: 0, hair: 'ponytail', beard: 'none', eye: 'glasses', female: true, jacket: [0.36, 0.07, 0.1], pants: [0.08, 0.08, 0.1], tie: 0, shirt: [0.92, 0.9, 0.88], gloves: false };
const AGENT_REPLIES = [
  'Then we find Paris.',
  'From couture to an army. Quite a career change.',
  'Machines don\'t hesitate. Neither do I.',
  'Money always leaves a trail.',
  'Eleven seats. I\'ll empty them one by one.',
  'Monaco. I\'ll pack the dinner jacket.',
  'Guns again. Somebody is preparing for a war.',
  'A film studio. Fitting, for people who sell illusions.',
  'Then I\'ll be in Rio before the footage airs.',
  'Let them be nervous. Nervous people make mistakes.',
  'A man selling everyone out has plenty of enemies. I\'ll be the last one.',
  'The guard dog. Without her, the house is open.',
  'Spies trading spies. I\'ll settle the account.',
  'A masquerade. Everyone hides a face. I\'ll find his.',
  'Until the next ledger, Iris.'
];
const IRIS_CLOSERS = ['Get some rest. I\'ll have the next file ready by morning.', 'Good work, Agent. The council will feel that one.', 'I\'ll start digging. Stay sharp.', 'Clean. Exactly how I like it.', 'Pack light. You\'re flying out tomorrow.'];

const Cutscene = {
  lines: [], i: 0, t: 0, shown: 0, done: null, actors: null, shots: [], M: null, kind: '',
  intro(ch, done) {
    const C = Game.getContract(CAMPAIGN[ch].ci, 'campaign', ch), city = CITIES[C.ci];
    UI.loading(() => {
      const M = buildMap(C.ci, C.mapSeed); Game.loadMap(M); Game.npcs = [];
      const rng = RNG(C.seed + 5);
      const stop = C.stops.map(s => M.stops[s]).find(Boolean) || Object.values(M.stops)[0];
      const tp = stop.p, actors = [];
      actors.push({ x: tp[0] + 0.5, y: tp[1], z: tp[2] + 0.5, face: rng() * 6.28, looks: C.looks, outfit: C.outfit, idle: 'drink', target: true });
      if (C.bodyguard) actors.push({ x: tp[0] + 1.6, y: tp[1], z: tp[2] + 1.1, face: 0, looks: Object.assign(randomLooks(rng, 'guard'), { eye: 'shades', female: false, hair: 'buzz' }), outfit: 'guard', idle: null });
      for (const g of M.guests.slice(0, 26)) { const sp = M.spots[g.group]; if (!sp || !sp.length) continue; const p = sp[rng.int(0, sp.length - 1)]; actors.push({ x: p[0] + 0.5, y: p[1], z: p[2] + 0.5, face: rng() * 6.28, looks: randomLooks(rng, 'guest'), outfit: g.vip ? 'vip' : 'guest', idle: rng.pick(['talk', 'drink', 'talk', 'phone', null]) }); }
      for (const gd of M.guards.slice(0, 10)) { const r = gd.route[0]; actors.push({ x: r[0] + 0.5, y: r[1], z: r[2] + 0.5, face: gd.face || 0, looks: randomLooks(rng, 'guard'), outfit: 'guard', idle: null }); }
      const b = M.building, bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2, sp0 = M.spawns[0];
      const yaw0 = Math.atan2(sp0[0] - bx, sp0[2] - bz);
      let floorY = M.floors[0]; for (const f of M.floors) if (tp[1] >= f - 0.5) floorY = f;
      const T = actors[0];
      const shots = [
        t => ({ tx: bx, ty: M.floors[0] + 8, tz: bz, dist: 88, pitch: 0.55, yaw: yaw0 + 0.5 + t * 0.05, cut: 999 }),
        t => ({ tx: bx, ty: M.floors[0] + 6, tz: bz, dist: 52, pitch: 0.72, yaw: yaw0 - 0.2 + t * 0.06, cut: floorY + 2.9 }),
        t => ({ tx: T.x, ty: T.y + 1.3, tz: T.z, dist: 7.5, pitch: 0.42, yaw: T.face + 0.6 + t * 0.07, cut: floorY + 2.9, fade: [T.x, T.y, T.z] })
      ];
      const L = [{ title: `CHAPTER ${ch + 1}`, sub: `${city.name.toUpperCase()} · ${city.venue}`, shot: 0 }];
      if (ch === 0) L.push({ who: 'iris', text: 'My name is Iris. From tonight, I\'m your handler.', shot: 0 }, { who: 'iris', text: 'I find the work. You finish it. Nobody ever learns either of us existed.', shot: 1 });
      chunk(sentences(CAMPAIGN[ch].brief), 2).forEach((tx, i, a) => L.push({ who: 'iris', text: tx, shot: i === 0 && ch !== 0 ? 0 : i < a.length - 1 ? 1 : 2 }));
      L.push({ who: 'iris', text: `Your target: ${C.name}, ${C.title}.`, shot: 2 });
      Engine.cam.tx = bx; Engine.cam.ty = 30; Engine.cam.tz = bz; Engine.cam.dist = 120; Engine.cam.pitch = 0.6; Engine.cam.yaw = yaw0;
      this.start('intro', M, actors, shots, L, done);
    });
  },
  outro(ch, done) {
    UI.loading(() => {
      const M = buildHideout(Game.S.lv.hide); Game.loadMap(M); Game.npcs = [];
      const y = 3, A = { x: 17.5, y, z: 13.5 }, I = { x: 19.8, y, z: 14.9 };
      A.face = Math.atan2(I.x - A.x, I.z - A.z); I.face = Math.atan2(A.x - I.x, A.z - I.z);
      const actors = [
        Object.assign(A, { looks: Game.S.look, outfit: 'suit', suit: Game.S.look.suit, idle: null, who: 'agent' }),
        Object.assign(I, { looks: IRIS_LOOKS, outfit: 'guest', idle: null, who: 'iris' })
      ];
      if (Game.S.pets.active) actors.push({ pet: true, type: Game.S.pets.active, x: 16.6, y, z: 14.8, face: A.face + 0.6, state: 'sit', phase: 0, t: 0, hop: 0 });
      const mx = (A.x + I.x) / 2, mz = (A.z + I.z) / 2;
      const yI = Math.atan2(A.x - I.x, A.z - I.z), yA = Math.atan2(I.x - A.x, I.z - A.z);
      const shots = [
        t => ({ tx: mx, ty: y + 1.2, tz: mz, dist: 11, pitch: 0.42, yaw: yI + 1.4 + t * 0.04, cut: 6.5 }),
        t => ({ tx: I.x, ty: y + 1.5, tz: I.z, dist: 4.4, pitch: 0.16, yaw: yI + 0.32, cut: 6.5 }),
        t => ({ tx: A.x, ty: y + 1.5, tz: A.z, dist: 4.4, pitch: 0.16, yaw: yA - 0.32, cut: 6.5 })
      ];
      const L = [{ title: 'DEBRIEF', sub: `CHAPTER ${ch + 1} COMPLETE · ${CAMPAIGN[ch].name.toUpperCase()}`, shot: 0 }];
      chunk(sentences(CAMPAIGN[ch].debrief), 1).forEach(tx => L.push({ who: 'iris', text: tx, shot: 1 }));
      L.push({ who: 'agent', text: AGENT_REPLIES[ch], shot: 2 });
      if (ch === CAMPAIGN.length - 1) {
        L.push({ who: 'iris', text: 'Eleven seats and one chairman. Not a single witness.', shot: 0 }, { who: 'agent', text: 'And the ledger?', shot: 2 }, { who: 'iris', text: 'Burned. Somewhere, somebody is already starting a new one. I\'ll call you.', shot: 1 });
      } else L.push({ who: 'iris', text: IRIS_CLOSERS[ch % IRIS_CLOSERS.length], shot: 0 });
      Engine.cam.tx = mx; Engine.cam.ty = y + 1; Engine.cam.tz = mz; Engine.cam.dist = 16; Engine.cam.pitch = 0.6; Engine.cam.yaw = yI + 1.8;
      this.start('outro', M, actors, shots, L, done);
    });
  },
  start(kind, M, actors, shots, lines, done) {
    UI.hideAll();
    this.kind = kind; this.M = M; this.actors = actors; this.shots = shots; this.lines = lines; this.done = done;
    this.i = -1; this.time = 0;
    Game.mode = 'cutscene'; Game.paused = false; Game.intro = null; Game.killcam = null; Game.slowmo = 0;
    Game.P = { x: Engine.cam.tx, y: 0, z: Engine.cam.tz, face: 0, hidden: true, outfit: 'suit', inv: [], held: -1 };
    Sfx.setMode('hideout'); Sfx.intensity = 0; Sfx.play('whoosh');
    const el0 = $('#cine'); el0.classList.remove('hidden', 'out');
    $('#cnSkip').onclick = e => { e.stopPropagation(); this.finish(); };
    this.next();
  },
  next() {
    const cur = this.lines[this.i];
    if (cur && cur.text && this.shown < cur.text.length) { this.shown = cur.text.length; return; }
    this.i++;
    if (this.i >= this.lines.length) { this.finish(); return; }
    const L = this.lines[this.i];
    this.t = 0; this.shown = 0;
    const tEl = $('#cine .cn-title'), cap = $('#cine .cn-cap');
    if (L.title) {
      $('#cnT').textContent = L.title; $('#cnS').textContent = L.sub || '';
      tEl.classList.remove('go'); void tEl.offsetWidth; tEl.classList.add('go'); cap.classList.add('hidden');
    } else {
      tEl.classList.remove('go'); cap.classList.remove('hidden');
      $('#cnW').textContent = L.who === 'iris' ? 'IRIS · HANDLER' : 'AGENT';
      cap.classList.toggle('agent', L.who === 'agent');
      drawPortrait($('#cnP'), L.who === 'iris' ? IRIS_LOOKS : Game.S.look, L.who === 'iris' ? 'guest' : 'suit');
      $('#cnL').textContent = '';
      Sfx.play('tick');
    }
    for (const a of this.actors) if (!a.pet && a.who) a.idle = a.who === L.who ? 'talk' : null;
  },
  update(dt) {
    this.time += dt; this.t += dt;
    const L = this.lines[this.i]; if (!L) return;
    if (L.text) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(L.text.length, this.shown + dt * 42);
      if (Math.floor(this.shown) !== before) { $('#cnL').textContent = L.text.slice(0, Math.floor(this.shown)); if (Math.floor(this.shown) % 3 === 0) Sfx.play('tick'); }
      if (this.shown >= L.text.length && this.t > L.text.length / 42 + 3.2) this.next();
    } else if (this.t > 2.8) this.next();
    const L2 = this.lines[this.i]; if (!L2) return;
    const g = this.shots[Math.min(L2.shot, this.shots.length - 1)](this.time);
    camTo(Engine.cam, g, Math.min(1, dt * 1.6));
    Engine.cut = Game.cutY = g.cut; Engine.fadeTarget = g.fade || null;
    for (const a of this.actors) if (a.pet) { a.t += dt; }
    sceneLights();
  },
  draw(t) {
    for (const a of this.actors) {
      if (a.y > Game.cutY + 0.5) continue;
      if (a.pet) { drawPet(a, t); continue; }
      drawCharacter(a.x, a.y, a.z, a.face, a.looks, a.outfit, a.suit || null, { idle: a.idle, t: t + a.x }, a.target ? { emit: [1, 0.1, 0.1, 0.1 + 0.08 * Math.sin(t * 4)] } : undefined);
    }
  },
  finish() {
    if (Game.mode !== 'cutscene') return;
    const c = $('#cine'); c.classList.add('out'); setTimeout(() => c.classList.add('hidden'), 400);
    Game.mode = 'result';
    const d = this.done; this.done = null; this.lines = [];
    if (this.kind === 'intro') this.actors = null;
    d && d();
  }
};

/* campaign hooks: intro before the first briefing of a chapter, outro after a win */
(function () {
  const ob = UI.briefing;
  UI.briefing = function (ci, intel, mode, chapter, start) {
    ensureExtras();
    const P = Game.S.prog;
    if (mode === 'campaign' && Game.mode === 'hideout' && !P.cuts['i' + chapter]) {
      P.cuts['i' + chapter] = 1; Game.save(); this.closeSheet();
      Cutscene.intro(chapter, () => { Game.enterHideout(); this._ctab = 'campaign'; this.openStation('contracts'); ob.call(this, ci, intel, mode, chapter, start); });
      return;
    }
    ob.call(this, ci, intel, mode, chapter, start);
    if (mode === 'campaign') {
      const body = this.sheet.querySelector('.brief'); if (!body) return;
      const row = el('div', 'cut-row');
      const b1 = el('button', 'btn sm', '{i:film} Watch Briefing');
      b1.onclick = () => { this.closeSheet(); Cutscene.intro(chapter, () => { Game.enterHideout(); this._ctab = 'campaign'; this.openStation('contracts'); ob.call(this, ci, intel, mode, chapter, start); }); };
      row.appendChild(b1);
      if ((P.campaign || 0) > chapter) {
        const b2 = el('button', 'btn sm', '{i:chat} Watch Debrief');
        b2.onclick = () => { this.closeSheet(); Cutscene.outro(chapter, () => { Game.enterHideout(); this._ctab = 'campaign'; this.openStation('contracts'); ob.call(this, ci, intel, mode, chapter, start); }); };
        row.appendChild(b2);
      }
      body.insertBefore(row, body.firstChild);
    }
  };
})();

/* =========================================================
   2) RECORDS, LEADERBOARDS AND REPLAYS
   ========================================================= */
const REPLAY_KEY = 'silentcontract_replays_v1';
const Records = {
  cur: null, last: null,
  begin() {
    const C = Game.C;
    if (!C || C.mode === 'tutorial' || C.mode === 'sniper') { this.cur = null; return; }
    this.cur = { v: 1, ci: C.ci, seed: C.mapSeed, mode: C.mode, look: JSON.parse(JSON.stringify(Game.S.look)),
      targets: Game.targets.map(t => ({ name: t.name, looks: t.looks, outfit: t.outfit })), dt: 0.5, of: [], p: [], tg: [], ev: [], acc: 0, n: 0, dur: 0 };
    this.lastSp = false; this.lastBodies = 0; this.lastOutfit = Game.P.outfit;
    this.sample();
  },
  oi(o) { const R = this.cur; let i = R.of.indexOf(o); if (i < 0) { R.of.push(o); i = R.of.length - 1; } return i; },
  tick(dt) {
    const R = this.cur; if (!R || Game.mode !== 'mission') return;
    R.acc += dt;
    if (R.acc >= R.dt) { R.acc -= R.dt; this.sample(); }
    const S = Game.stats, P = Game.P;
    if (S.spotted && !this.lastSp) { this.lastSp = true; this.event('spot', 'Spotted'); }
    if (S.bodiesFound > this.lastBodies) { this.lastBodies = S.bodiesFound; this.event('body', 'A body was found'); }
    if (P.outfit !== this.lastOutfit) { this.lastOutfit = P.outfit; this.event('disg', 'Disguise: ' + (OUTFIT_NAMES[P.outfit] || P.outfit)); }
  },
  sample() {
    const R = this.cur, P = Game.P;
    R.p.push(Math.round(P.x * 10), Math.round(P.y * 10), Math.round(P.z * 10), Math.round(P.face * 100), this.oi(P.outfit), (P.moving ? 1 : 0) | (P.carrying ? 2 : 0) | (P.action ? 4 : 0) | (P.aimT > 0 ? 8 : 0) | (P.dead ? 16 : 0));
    for (const t of Game.targets) R.tg.push(Math.round(t.x * 10), Math.round(t.y * 10), Math.round(t.z * 10), Math.round(t.face * 100), t.state === 'dead' ? (t.escaped ? 3 : 2) : t.moving ? 1 : 0);
    R.n++; R.dur = Game.stats.t;
    if (R.n >= 1200) this.compact();
  },
  compact() {
    const R = this.cur, T = R.targets.length, np = [], nt = [];
    for (let i = 0; i < R.n; i += 2) { for (let k = 0; k < 6; k++) np.push(R.p[i * 6 + k]); for (let k = 0; k < T * 5; k++) nt.push(R.tg[i * T * 5 + k]); }
    R.p = np; R.tg = nt; R.n = np.length / 6; R.dt *= 2;
  },
  event(k, txt, at, extra) {
    if (!this.cur) return;
    const P = at || Game.P;
    this.cur.ev.push(Object.assign({ t: Math.round(Game.stats.t * 10) / 10, k, txt, x: +P.x.toFixed(1), y: +P.y.toFixed(1), z: +P.z.toFixed(1) }, extra || {}));
  },
  finish() { const R = this.cur; if (!R) return null; this.sample(); delete R.acc; this.cur = null; this.last = R; return R; },
  score(res) {
    const base = { S: 10000, A: 8000, B: 6500, C: 5000, D: 3500, F: 2000 }[res.rank] || 2000;
    const st = res.stats || {};
    let s = base + Math.max(0, Math.round(4000 - (st.time || 0) * 6));
    if (res.sa) s += 2500; else if (st.spotted === false) s += 1000;
    if (res.mode === 'sniper') s += Math.round((st.acc || 0) * 3000) + (st.accidents || 0) * 1000;
    s -= (Game.stats && Game.stats.nonTarget || 0) * 600;
    s *= { casual: 0.75, pro: 1, master: 1.5 }[Game.diff] || 1;
    if (res.mode === 'elusive') s *= 1.2;
    return Math.max(0, Math.round(s));
  },
  key(res) { return (res.mode === 'sniper' ? 'sn:' : '') + CITIES[res.C.ci].id; },
  submit(res) {
    ensureExtras();
    const rec = res.mode === 'sniper' ? null : this.finish();
    if (rec) res.replay = rec;
    if (!res.success || res.mode === 'tutorial') return;
    const id = this.key(res), S = Game.S;
    const list = S.records[id] = S.records[id] || [];
    const prev = list.length ? list[0].score : 0;
    const e = { score: this.score(res), rank: res.rank, time: Math.round((res.stats && res.stats.time) || 0), date: Progress.dayStr(), diff: Game.diff, mode: res.mode };
    list.push(e); list.sort((a, b) => b.score - a.score); list.splice(5);
    const pos = list.indexOf(e) + 1;
    res.record = { score: e.score, best: pos === 1, prev, pos };
    if (pos === 1 && rec) { rec.score = e.score; rec.rank = e.rank; rec.date = e.date; this.store(id, rec); }
    Game.save();
  },
  all() { try { return JSON.parse(localStorage.getItem(REPLAY_KEY)) || {}; } catch (e) { return {}; } },
  store(id, rec) {
    const A = this.all(); A[id] = rec;
    for (let tries = 0; tries < 16; tries++) {
      try { localStorage.setItem(REPLAY_KEY, JSON.stringify(A)); return true; } catch (e) {
        const ks = Object.keys(A).filter(k => k !== id); if (!ks.length) return false; delete A[ks[0]];
      }
    }
    return false;
  },
  load(id) { return this.all()[id] || null; },
  totals(prefix) { let s = 0; for (const c of CITIES) { const L = Game.S.records[(prefix || '') + c.id]; if (L && L.length) s += L[0].score; } return s; }
};

/* record kills and wrap mission start */
(function () {
  const k = Game.kill;
  Game.kill = function (n, method, byPlayer, via) {
    const was = n.state;
    k.call(this, n, method, byPlayer, via);
    if (was !== 'dead' && n.state === 'dead') {
      const ti = this.targets ? this.targets.indexOf(n) : -1;
      if (Records.cur) Records.event('kill', ti >= 0 ? 'Target eliminated: ' + n.name : 'Non-target killed', n, { f: +n.face.toFixed(2), o: n.outfit, ti });
      if (this.C && this.C.mode === 'sniper') { if (n.isTarget && n.accident) this.stats.accidents = (this.stats.accidents || 0) + 1; this.killcam = null; }
    }
  };
  const sm = Game.startMission;
  Game.startMission = function (ci, intel, opts) {
    ensureExtras();
    if (opts && opts.mode === 'sniper') return Sniper.start(ci);
    sm.call(this, ci, intel, opts);
    Records.begin();
  };
})();

const Replay = {
  rec: null, t: 0, speed: 1, playing: true, crowd: [], onExit: null,
  play(rec, onExit) {
    if (!rec) { UI.toast('No replay saved yet', 'bad'); return; }
    UI.loading(() => {
      const M = buildMap(rec.ci, rec.seed); Game.loadMap(M); Game.npcs = [];
      this.rec = rec; this.t = 0; this.speed = 1; this.playing = true; this.onExit = onExit; this.evI = 0;
      const rng = RNG(rec.seed * 31 + 7), cr = [];
      for (const g of M.guards) { const r = g.route[0]; cr.push({ x: r[0] + 0.5, y: r[1], z: r[2] + 0.5, face: g.face || rng() * 6.28, looks: Object.assign(randomLooks(rng, 'guard'), { female: false }), outfit: 'guard', idle: null }); }
      for (const s of M.staff) { const r = s.route[0]; cr.push({ x: r[0] + 0.5, y: r[1], z: r[2] + 0.5, face: s.face || rng() * 6.28, looks: randomLooks(rng, 'staff'), outfit: s.outfit, idle: rng.pick(['wipe', 'tray', null]) }); }
      for (const g of M.guests) { const sp = M.spots[g.group]; if (!sp || !sp.length) continue; const p = sp[rng.int(0, sp.length - 1)]; cr.push({ x: p[0] + 0.5, y: p[1], z: p[2] + 0.5, face: rng() * 6.28, looks: randomLooks(rng, 'guest'), outfit: g.vip ? 'vip' : 'guest', idle: rng.pick(['talk', 'drink', 'phone', 'talk', null]) }); }
      this.crowd = cr.slice(0, 70);
      this.bodyLooks = rec.ev.map((e, i) => randomLooks(RNG(rec.seed + i * 13), 'guest'));
      Game.mode = 'replay'; Game.paused = false;
      Game.P = { x: rec.p[0] / 10, y: rec.p[1] / 10, z: rec.p[2] / 10, face: 0, hidden: true, outfit: 'suit', inv: [], held: -1, moving: false, dead: false };
      Game.snapCam(); Engine.cam.yaw = Math.PI + 0.55; Engine.cam.pitch = 0.95; Engine.cam.dist = 20;
      UI.hideAll(); $('#rphud').classList.remove('hidden');
      $('#rpInfo').textContent = `${CITIES[rec.ci].name} · ${rec.score ? 'Score ' + rec.score.toLocaleString() + ' · ' : ''}${rec.rank ? 'Rank ' + rec.rank : ''}`;
      const ticks = $('#rpTicks'); ticks.innerHTML = '';
      for (const e of rec.ev) { const d = el('i', 'tk ' + e.k); d.style.left = (e.t / Math.max(1, rec.dur) * 100) + '%'; ticks.appendChild(d); }
      $('#rpPlay').onclick = () => { if (this.t >= this.rec.dur) this.t = 0; this.playing = !this.playing; this.btn(); };
      $('#rpSpd').onclick = () => { this.speed = this.speed >= 8 ? 1 : this.speed * 2; $('#rpSpd').textContent = this.speed + 'x'; };
      $('#rpSpd').textContent = '1x';
      $('#rpExit').onclick = () => this.exit();
      const tr = $('#rpTrack');
      const seek = e => { const r = tr.getBoundingClientRect(); this.t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * this.rec.dur; this.evI = this.rec.ev.findIndex(x => x.t > this.t); if (this.evI < 0) this.evI = this.rec.ev.length; };
      tr.onpointerdown = e => { tr.setPointerCapture(e.pointerId); seek(e); tr.onpointermove = seek; };
      tr.onpointerup = () => { tr.onpointermove = null; };
      this.btn();
      Sfx.setMode('mission'); Sfx.intensity = 0;
      const C = Game.S.prog.career; C.replays = (C.replays || 0) + 1; Progress.checkAch(); Game.save();
    });
  },
  btn() { $('#rpPlay').innerHTML = this.playing ? '{i:pause}' : '{i:play}'; },
  exit() { Game.mode = 'result'; const f = this.onExit; this.rec = null; Game.enterHideout(); f && f(); },
  stateAt(t) {
    const R = this.rec, f = Math.max(0, Math.min(R.n - 1.0001, t / R.dt)), i0 = Math.floor(f), i1 = Math.min(R.n - 1, i0 + 1), k = f - i0;
    const a = i0 * 6, b = i1 * 6, p = R.p;
    const P = { x: (p[a] + (p[b] - p[a]) * k) / 10, y: (p[a + 1] + (p[b + 1] - p[a + 1]) * k) / 10, z: (p[a + 2] + (p[b + 2] - p[a + 2]) * k) / 10,
      face: lerpAng(p[a + 3] / 100, p[b + 3] / 100, k), outfit: R.of[p[a + 4]] || 'suit', fl: p[a + 5] };
    const T = R.targets.length, tg = [];
    for (let j = 0; j < T; j++) {
      const A = (i0 * T + j) * 5, Bq = (i1 * T + j) * 5, q = R.tg;
      tg.push({ x: (q[A] + (q[Bq] - q[A]) * k) / 10, y: (q[A + 1] + (q[Bq + 1] - q[A + 1]) * k) / 10, z: (q[A + 2] + (q[Bq + 2] - q[A + 2]) * k) / 10, face: lerpAng(q[A + 3] / 100, q[Bq + 3] / 100, k), st: q[A + 4] });
    }
    return { P, tg };
  },
  update(dt) {
    const R = this.rec; if (!R) return;
    if (this.playing) { this.t += dt * this.speed; if (this.t >= R.dur) { this.t = R.dur; this.playing = false; this.btn(); } }
    const s = this.stateAt(this.t); this.cur = s;
    const P = Game.P; Object.assign(P, { x: s.P.x, y: s.P.y, z: s.P.z, face: s.P.face, outfit: s.P.outfit, moving: !!(s.P.fl & 1) });
    P.phase = (P.phase || 0) + (P.moving ? dt * this.speed * 9 : 0);
    // events
    while (this.evI < R.ev.length && R.ev[this.evI].t <= this.t) {
      const e = R.ev[this.evI++];
      if (this.playing) { const d = $('#rpEv'); d.textContent = e.txt; d.className = 'show ' + e.k; clearTimeout(this._evT); this._evT = setTimeout(() => d.className = '', 2200); Sfx.play(e.k === 'kill' ? 'kill' : 'tick'); }
    }
    const c = Engine.cam, k = Math.min(1, dt * 6);
    c.tx += (P.x - c.tx) * k; c.ty += (P.y + 1 - c.ty) * k; c.tz += (P.z - c.tz) * k;
    Game.updateCut(); Engine.fadeTarget = [P.x, P.y, P.z];
    sceneLights();
    $('#rpFill').style.width = (this.t / Math.max(0.01, R.dur) * 100) + '%';
    $('#rpTime').textContent = `${fmtTime(this.t)} / ${fmtTime(R.dur)}`;
  },
  draw(t) {
    const R = this.rec, s = this.cur; if (!R || !s) return;
    const cut = Game.cutY, c = Engine.cam, near = (x, z) => (x - c.tx) ** 2 + (z - c.tz) ** 2 < 2500;
    for (const a of this.crowd) { if (a.y > cut + 0.5 || !near(a.x, a.z)) continue; drawCharacter(a.x, a.y, a.z, a.face, a.looks, a.outfit, null, { idle: a.idle, t: t + a.x }); }
    const P = Game.P;
    drawCharacter(P.x, P.y, P.z, P.face, R.look, P.outfit, R.look.suit, { walk: P.moving, phase: P.phase, act: !!(s.P.fl & 4), aim: !!(s.P.fl & 8), drag: !!(s.P.fl & 2), dead: !!(s.P.fl & 16), deadK: 1, t }, { emit: [0.2, 0.6, 1, 0.06] });
    s.tg.forEach((q, j) => {
      if (q.st === 3 || q.y > cut + 0.5) return;
      const T = R.targets[j], dead = q.st === 2;
      drawCharacter(q.x, q.y, q.z, q.face, T.looks, T.outfit, null, { walk: q.st === 1, phase: t * 9, dead, deadK: 1, t }, dead ? undefined : { emit: [1, 0.1, 0.1, 0.12 + 0.08 * Math.sin(t * 4)] });
      if (!dead) Engine.box(M4.mul(M4.T(q.x, q.y + 2.4 + Math.sin(t * 3) * 0.1, q.z), M4.mul(M4.RY(t * 2), M4.mul(M4.RZ(Math.PI / 4), M4.S(0.22, 0.22, 0.22)))), [1, 0.15, 0.15], [1, 0.1, 0.1, 0.9]);
    });
    R.ev.forEach((e, i) => {
      if (e.k !== 'kill' || e.ti >= 0 || e.t > this.t || e.y > cut + 0.5 || !near(e.x, e.z)) return;
      drawCharacter(e.x, e.y, e.z, e.f || 0, this.bodyLooks[i], e.o || 'guest', null, { dead: true, deadK: 1, t });
    });
  }
};

/* =========================================================
   3) SNIPER ASSASSIN MODE
   ========================================================= */
const SNIPER_RIFLES = [
  { id: 'r0', name: 'Kestrel Bolt-Action', price: 0, zoom: 4, mag: 5, ammo: 20, silenced: false, bolt: 1.25, reload: 2.4, desc: 'Reliable, loud. Every shot can be heard.' },
  { id: 'r1', name: 'Whisper Suppressed', price: 60000, zoom: 5, mag: 5, ammo: 20, silenced: true, bolt: 1.0, reload: 2.2, desc: 'Integrated suppressor. Only people near the impact notice.' },
  { id: 'r2', name: 'Sovereign Elite', price: 160000, zoom: 8, mag: 8, ammo: 30, silenced: true, bolt: 0.55, reload: 1.8, desc: 'Suppressed semi-auto with an 8x scope.' }
];
const SNIPER_SHOOTABLE = ['chandelier', 'sig', 'stove', 'speaker', 'caralarm', 'fusebox', 'radio'];

const Sniper = {
  E: [0, 0, 0], yaw: 0, pitch: 0.3, fov: 0.75, zoom: 1, D: 60, floorI: 0, rifle: SNIPER_RIFLES[0],
  active() { return Game.mode === 'mission' && Game.C && Game.C.mode === 'sniper' && !Game.paused; },
  rifleOf() { return SNIPER_RIFLES.find(r => r.id === Game.S.sniper.rifle) || SNIPER_RIFLES[0]; },
  extraTarget(rng, used) {
    const looks = randomLooks(rng, 'target');
    const stops = rng.shuffle(['bar', 'buffet', 'office', 'speech', 'balcony', 'kitchen', 'sauna', 'pool', 'privatebar'].filter(x => !used.includes(x))).slice(0, 4);
    return { name: rng.pick(FIRST) + ' ' + rng.pick(LAST), title: rng.pick(TITLES), looks, outfit: rng() < 0.5 ? 'vip' : 'guest', stops };
  },
  contract(ci) {
    ensureExtras();
    const id = CITIES[ci].id, SS = Game.S.sniper;
    if (!SS.seeds[id]) { SS.seeds[id] = (Math.random() * 1e9) | 0; Game.save(); }
    const C = Game.genContract(ci, SS.seeds[id]);
    const rng = RNG(C.seed + 31337);
    C.mode = 'sniper'; C.intel = 1; C.method = 'any'; C.bodyguard = true; C.start = 'perch';
    C.second = this.extraTarget(rng, C.stops); C.third = this.extraTarget(rng, C.stops.concat(C.second.stops));
    C.fee = 20000 + ci * 6000; C.title = C.title;
    return C;
  },
  start(ci) {
    const G = Game, C = this.contract(ci);
    G.C = C; G.mode = 'mission'; G.paused = false;
    const M = buildMap(ci, C.mapSeed); G.loadMap(M);
    Engine.env = Object.assign({}, Engine.env, { fogN: (Engine.env.fogN || 50) + 40, fogF: (Engine.env.fogF || 130) + 90 });
    const rng = RNG(C.seed + 99);
    // the perch: across the street, high above the venue's front
    const b = M.building, bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2, sp = M.spawns[0];
    let dx = sp[0] - bx, dz = sp[2] - bz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const rot = 0.38, rx = dx * Math.cos(rot) - dz * Math.sin(rot), rz = dx * Math.sin(rot) + dz * Math.cos(rot);
    const R = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 20;
    this.E = [bx + rx * R, b.top + 16, bz + rz * R];
    G.P = G.makePlayer([Math.floor(this.E[0]), Math.floor(this.E[1]), Math.floor(this.E[2])], 'suit');
    Object.assign(G.P, { x: this.E[0], y: this.E[1], z: this.E[2], hidden: true });
    G.stats = { t: 0, spotted: false, spottedBy: 0, bodiesFound: 0, kills: 0, nonTarget: 0, combat: false, suitOnly: true, targetDead: false, method: null, disguises: 0, coins: 0, kos: 0, usedGun: true, shots: 0, hits: 0, accidents: 0, alerted: false };
    G.diff = G.S.settings.difficulty || 'pro'; G.D = DIFFS[G.diff];
    G.chatT = 3;
    G.spawnNPCs(rng);
    G.time = 0; G.slowmo = 0; G.killcam = null; G.intro = null; UI.clearFx(); UI.setInstinct(false);
    Tutorial.active = false; $('#tut').classList.add('hidden');
    G.lastLaunch = { ci, intel: 0, opts: { mode: 'sniper' } };
    this.rifle = this.rifleOf(); this.mag = this.rifle.mag; this.ammo = this.rifle.ammo - this.rifle.mag;
    this.cool = 0; this.reloadT = 0; this.endT = 0; this.zoom = 1; this.fov = 0.75; this.failT = 0;
    // aim at the main target to start
    const t = G.targets[0];
    this.floorI = this.floorOf(t.y);
    this.lookAt([t.x, t.y + 1, t.z]); this.D = Math.hypot(t.x - this.E[0], t.y - this.E[1], t.z - this.E[2]);
    Engine.fadeLift = 0; Engine.fadeR = 0.14;
    UI.hideAll(); $('#shud').classList.remove('hidden'); this.wireHud(); this.hud(true);
    Sfx.setMode('mission'); Sfx.play('whoosh');
    UI.toast(`${CITIES[ci].name} — ${CITIES[ci].venue}`, 'big');
    UI.toast('Eliminate all three targets. Drag to aim, pinch to zoom.');
    G.save();
  },
  floorOf(y) { const F = Game.M.floors; let k = 0; for (let i = 0; i < F.length - 1; i++) if (y >= F[i] - 0.5) k = i; return k; },
  cut() { const F = Game.M.floors; return this.floorI >= F.length - 1 ? 999 : F[this.floorI] + 2.9; },
  lookAt(p) {
    const ux = this.E[0] - p[0], uy = this.E[1] - p[1], uz = this.E[2] - p[2], L = Math.hypot(ux, uy, uz) || 1;
    this.pitch = Math.asin(uy / L); this.yaw = Math.atan2(ux, uz);
  },
  dir() { const cp = Math.cos(this.pitch); return [-Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp]; },
  // ray that passes through walls and stops on walkable surfaces below the cut
  floorRay(o, d, maxD) {
    const W = Game.W, cut = this.cut(); let acc = 0;
    for (let k = 0; k < 40; k++) {
      const oo = [o[0] + d[0] * acc, o[1] + d[1] * acc, o[2] + d[2] * acc];
      const h = W.raycast(oo, d, maxD - acc, cut); if (!h) return null;
      const T = acc + h.t;
      if (h.face[1] === 1) return { t: T, p: [o[0] + d[0] * T, o[1] + d[1] * T, o[2] + d[2] * T] };
      acc = T + 0.04; if (acc > maxD) return null;
    }
    return null;
  },
  camera(dt) {
    const c = Engine.cam, d = this.dir();
    this.fov += (0.75 / this.zoom - this.fov) * Math.min(1, dt * 10);
    const h = this.floorRay(this.E, d, 260), D = Math.max(6, Math.min(230, h ? h.t : 90));
    this.D += (D - this.D) * Math.min(1, dt * 10);
    c.fov = this.fov; c.yaw = this.yaw; c.pitch = this.pitch; c.dist = this.D;
    c.tx = this.E[0] + d[0] * this.D; c.ty = this.E[1] + d[1] * this.D; c.tz = this.E[2] + d[2] * this.D;
    Engine.cut = Game.cutY = this.cut();
    Engine.fadeTarget = h ? h.p : null;
    Game.targetVisible = true;
    this.tick(dt);
    this.hud();
  },
  drag(dx, dy) { const s = this.fov / Math.max(320, innerHeight); this.yaw += dx * s; this.pitch = Math.max(-0.15, Math.min(1.35, this.pitch - dy * s)); },
  zoomBy(f) { const z = this.rifle.zoom; this.zoom = Math.max(1, Math.min(z, this.zoom * f)); },
  setZoom(z) { this.zoom = Math.max(1, Math.min(this.rifle.zoom, z)); Sfx.play('tick'); },
  tick(dt) {
    const G = Game, S = G.stats;
    this.cool = Math.max(0, this.cool - dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { const n = Math.min(this.rifle.mag - this.mag, this.ammo); this.mag += n; this.ammo -= n; Sfx.play('pickup'); } }
    if (G.targets.some(t => t.state === 'escape')) S.alerted = true;
    if (S.targetDead && !this.endT) this.endT = G.time + 2.4;
    if (this.endT && G.time >= this.endT && G.mode === 'mission') { this.endT = 0; G.endMission(true); return; }
    if (!S.targetDead && this.mag <= 0 && this.ammo <= 0 && this.reloadT <= 0) {
      this.failT += dt; if (this.failT > 2.5 && G.mode === 'mission') G.endMission(false, 'Out of ammunition');
    }
  },
  wireHud() {
    const b = (id, fn) => { const e = $(id); e.onclick = ev => { ev.stopPropagation(); fn(); }; };
    b('#sFire', () => this.fire());
    b('#sZoomIn', () => this.setZoom(this.zoom < 1.5 ? 2 : this.zoom * 2));
    b('#sZoomOut', () => this.setZoom(this.zoom > 2.5 ? this.zoom / 2 : 1));
    b('#sFloorUp', () => { this.floorI = Math.min(Game.M.floors.length - 1, this.floorI + 1); Sfx.play('tick'); this.hud(true); });
    b('#sFloorDn', () => { this.floorI = Math.max(0, this.floorI - 1); Sfx.play('tick'); this.hud(true); });
    b('#sNext', () => this.nextTarget());
    b('#sReload', () => this.reload());
    b('#sInst', () => Game.toggleInstinct());
    b('#sPause', () => UI.pause());
  },
  nextTarget() {
    const alive = Game.targets.filter(t => t.state !== 'dead');
    if (!alive.length) return;
    this._ti = ((this._ti || 0) + 1) % alive.length;
    const t = alive[this._ti];
    this.floorI = this.floorOf(t.y); this.lookAt([t.x, t.y + 1, t.z]);
    if (this.zoom < 2) this.zoom = Math.min(this.rifle.zoom, 2.5);
    UI.toast(`${t.name}${t.state === 'escape' ? ' — fleeing!' : ''}`); Sfx.play('tick'); this.hud(true);
  },
  reload() {
    if (this.reloadT > 0 || this.mag >= this.rifle.mag || this.ammo <= 0) return;
    this.reloadT = this.rifle.reload; Sfx.play('action');
  },
  hit(o, d) {
    const G = Game, cut = this.cut();
    const fl = this.floorRay(o, d, 260), ft = fl ? fl.t : 1e9;
    let best = null, bt = ft, kind = null;
    for (const n of G.npcs) {
      if (n.hidden || n.carriedBy || n.state === 'dead' || n.y > cut + 0.5) continue;
      const t = rayAABB(o, d, [n.x - 0.38, n.y, n.z - 0.38], [n.x + 0.38, n.y + 1.95, n.z + 0.38]);
      if (t >= 0 && t < bt) { bt = t; best = n; kind = 'npc'; }
    }
    for (const pr of G.props) {
      if (pr.gone || !SNIPER_SHOOTABLE.includes(pr.type) || pr.p[1] > cut + 0.5) continue;
      if (pr.type === 'sig' && !(pr.sig && pr.sig.type === 'drop' && !pr.dropped)) continue;
      if (pr.type === 'chandelier' && (pr.dropped || pr.dropping)) continue;
      const s = pr.type === 'chandelier' ? 0.9 : 0.55, y0 = pr.type === 'chandelier' ? pr.p[1] - 0.6 : pr.p[1];
      const t = rayAABB(o, d, [pr.p[0] - s, y0, pr.p[2] - s], [pr.p[0] + s, y0 + (pr.type === 'chandelier' ? 1.2 : 1.0), pr.p[2] + s]);
      if (t >= 0 && t < bt) { bt = t; best = pr; kind = 'prop'; }
    }
    return { kind, best, t: bt === 1e9 ? 120 : bt, floor: fl };
  },
  fire() {
    const G = Game, S = G.stats;
    if (!this.active() || G.slowmo > 0) return;
    if (this.reloadT > 0 || this.cool > 0) return;
    if (this.mag <= 0) { if (this.ammo > 0) this.reload(); else Sfx.play('tick'); return; }
    this.mag--; S.shots++; this.cool = this.rifle.bolt;
    const o = this.E, d = this.dir(), h = this.hit(o, d);
    const pt = [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t];
    Sfx.play(this.rifle.silenced ? 'silenced' : 'gun'); Engine.shakeAmt = Math.max(Engine.shakeAmt, 0.18 / this.zoom);
    this.pitch = Math.min(1.35, this.pitch - 0.012 / this.zoom);
    G.fx.push({ type: 'tracer', a: [o[0] + d[0] * 3, o[1] + d[1] * 3 - 0.4, o[2] + d[2] * 3], b: pt, t: 0, dur: 0.12, col: [1, 0.9, 0.55] });
    try { navigator.vibrate && navigator.vibrate(30); } catch (e) { }
    const flash = $('#sMuzzle'); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    if (h.kind === 'npc') {
      const n = h.best; S.hits++;
      G.kill(n, 'sniper', true);
      G.noise(pt, this.rifle.silenced ? 6 : 24, this.rifle.silenced ? 'scream' : 'gunshot');
    } else if (h.kind === 'prop') {
      const pr = h.best; this.shootProp(pr, pt);
    } else {
      G.fx.push({ type: 'dust', p: pt, t: 0, dur: 0.5 });
      G.noise(pt, this.rifle.silenced ? 3.5 : 16, this.rifle.silenced ? 'scream' : 'gunshot');
    }
    if (this.mag <= 0 && this.ammo > 0) setTimeout(() => this.reload(), 350);
    this.hud(true);
  },
  shootProp(pr, pt) {
    const G = Game;
    switch (pr.type) {
      case 'chandelier': pr.used = true; G.dropChandelier(); G.toast('The chandelier gives way...'); break;
      case 'sig': pr.dropping = true; pr.dropY = 0; pr.vy = 0; G.fx.push({ type: 'sigdrop', pr, t: 0, dur: 0.8 }); break;
      case 'stove': pr.gone = true; G.explode(pr.p, 3.4, 'accident'); break;
      case 'speaker': if (G.M.stops.pool) { pr.used = true; pr.fallT = 0; G.electrocutePool(); } break;
      case 'caralarm': pr.on = true; pr.alarmT = 9; Sfx.play('alarm'); G.lure(pr, 26, 3, 'alarm'); G.toast('Car alarm!'); break;
      case 'fusebox': pr.on = true; G.blackout = { y: Math.round(pr.p[1]), t: 35, pr }; Sfx.play('zap'); G.lure(pr, 30, 1, 'fuse'); G.toast('Power cut on that floor'); break;
      case 'radio': pr.on = true; pr.radioT = 0; G.lure(pr, 14, 1, 'radio'); G.toast('Radio on'); break;
    }
    G.fx.push({ type: 'dust', p: pt, t: 0, dur: 0.4 });
  },
  tap(sx, sy) {
    const r = Engine.ray(sx, sy), cut = this.cut();
    let best = null, bt = 1e9;
    for (const n of Game.npcs) {
      if (n.hidden || n.y > cut + 0.5) continue;
      const t = rayAABB(r.o, r.d, [n.x - 0.5, n.y, n.z - 0.5], [n.x + 0.5, n.y + 2, n.z + 0.5]);
      if (t >= 0 && t < bt) { bt = t; best = n; }
    }
    if (!best) return;
    const what = best.isTarget ? 'Target: ' + best.name : best.state === 'dead' ? 'Body' : GUARDLIKE(best.kind) ? 'Guard' : best.kind === 'staff' ? 'Staff' : 'Guest';
    UI.popup([best.x, best.y + 2.2, best.z], what.toUpperCase(), best.isTarget ? 'red' : 'grey');
  },
  panic(b) {
    const G = Game; G.stats.alerted = true;
    for (const t of G.targets) if (t.state !== 'dead' && Math.hypot(t.x - b.x, t.z - b.z) < 30) G.startEscape(t);
  },
  hud(force) {
    const now = performance.now(); if (!force && this._h && now - this._h < 120) return; this._h = now;
    const F = Game.M.floors;
    $('#sFloor').textContent = this.floorI >= F.length - 1 ? 'ROOF' : this.floorI === 0 ? 'GROUND' : 'FLOOR ' + this.floorI;
    $('#sAmmo').textContent = this.reloadT > 0 ? 'RELOADING' : `${this.mag} / ${this.ammo}`;
    $('#sFire').classList.toggle('wait', this.reloadT > 0 || this.cool > 0 || this.mag <= 0);
    $('#scZoom').textContent = this.zoom.toFixed(1) + 'x';
    $('#shud').classList.toggle('zoomed', this.zoom > 1.4);
    $('#sTime').textContent = fmtTime(Game.stats.t);
    $('#sTargets').innerHTML = Game.targets.map(t => `<div class="st${t.state === 'dead' ? ' dead' : t.state === 'escape' ? ' run' : ''}">${t.state === 'dead' ? '{i:check}' : t.state === 'escape' ? '{i:run}' : '{i:target}'} ${t.name}</div>`).join('');
    const im = $('#sInstM'); if (im && Game.inst) im.style.width = Game.inst.m + '%';
    $('#sInst').classList.toggle('on', !!(Game.inst && Game.inst.on));
  },
  end(success, reason) {
    const G = Game, S = G.stats, C = G.C, sv = G.S;
    $('#shud').classList.add('hidden');
    const res = { success, reason, city: CITIES[C.ci], C, lines: [], payout: 0, rank: 'F', mode: 'sniper' };
    const acc = S.shots ? S.hits / S.shots : 0;
    if (success) {
      const silent = !S.alerted && S.bodiesFound === 0 && S.nonTarget === 0;
      let pts = 100 - S.bodiesFound * 10 - S.nonTarget * 15 - (S.alerted ? 20 : 0) - (acc < 0.5 ? 10 : 0);
      const rank = silent && acc >= 0.6 ? 'S' : silent || pts >= 80 ? 'A' : pts >= 65 ? 'B' : pts >= 50 ? 'C' : pts >= 30 ? 'D' : 'F';
      res.rank = rank;
      let pay = C.fee; res.lines.push(['Sniper contract fee', C.fee]);
      if (silent) { const b = Math.round(C.fee * 0.4); pay += b; res.lines.push(['Silent Sniper', b]); }
      if (S.accidents) { const b = Math.round(C.fee * 0.1 * S.accidents); pay += b; res.lines.push([`Accident kills ×${S.accidents}`, b]); }
      if (S.shots === G.targets.length) { const b = Math.round(C.fee * 0.2); pay += b; res.lines.push(['Perfect accuracy', b]); }
      if (S.nonTarget) { const p = -S.nonTarget * 3000; pay += p; res.lines.push([`Non-target casualties ×${S.nonTarget}`, p]); }
      if (S.bodiesFound) { const p = -S.bodiesFound * 1500; pay += p; res.lines.push([`Bodies found ×${S.bodiesFound}`, p]); }
      if (G.D && G.D.pay !== 1) { const b = Math.round(pay * (G.D.pay - 1)); pay += b; res.lines.push([`${G.D.name} difficulty`, b]); }
      const rm = { S: 1.25, A: 1.1, B: 1, C: 0.95, D: 0.9, F: 0.8 }[rank], rb = Math.round(pay * rm) - pay;
      if (rb) res.lines.push([`Rank ${rank} modifier`, rb]);
      pay = Math.max(Math.round(C.fee * 0.25), pay + rb);
      res.payout = pay; sv.money += pay; sv.stats.contracts++; sv.stats.earned += pay; if (rank === 'S') sv.stats.s++;
      const id = CITIES[C.ci].id, order = 'SABCDF', prev = sv.sniper.best[id];
      if (!prev || order.indexOf(rank) < order.indexOf(prev)) sv.sniper.best[id] = rank;
      sv.sniper.seeds[id] = (Math.random() * 1e9) | 0;
      res.stats = { time: S.t, kills: S.kills, method: 'Sniper Rifle', spotted: false, bodies: S.bodiesFound, disguises: 0, shots: S.shots, hits: S.hits, acc, accidents: S.accidents };
      const Cr = sv.prog.career; Cr.snipers = (Cr.snipers || 0) + 1; if (rank === 'S') Cr.sniperS = (Cr.sniperS || 0) + 1;
    } else res.lines.push([reason || 'Contract failed', 0]);
    res.mastery = []; res.challenges = 0;
    res.xp = success ? RANK_XP[res.rank] + 300 : 100;
    res.xpFrom = { level: sv.prog.level, xp: sv.prog.xp };
    res.ups = Progress.addXP(res.xp);
    Progress.checkAch(); G.save();
    Sfx.setMode('hideout'); Sfx.intensity = 0;
    UI.showResult(res);
  }
};

/* =========================================================
   4) HIDEOUT: TROPHY WALL AND PETS
   ========================================================= */
const TROPHY_NAMES = { london: 'Clocktower Miniature', paris: 'Iron Tower Figurine', dubai: 'Golden Spire', tokyo: 'Torii Gate', newyork: 'Torch Statuette', rome: 'Marble Column', monaco: 'Casino Chip Stack', marrakech: 'Brass Lantern', mumbai: 'Premiere Film Reel', rio: 'Carnival Mask', hongkong: 'Jade Dragon', berlin: 'Gold Record', sydney: 'Harbour Sails', istanbul: 'Palace Dome', venice: 'Gilded Bauta Mask' };
const RANK_COL = { S: [0.95, 0.76, 0.28], A: [0.8, 0.82, 0.86], B: [0.72, 0.45, 0.24], C: [0.72, 0.45, 0.24], D: [0.32, 0.32, 0.34], F: [0.32, 0.32, 0.34] };

function drawTrophy(id, x, y, z, t, rank) {
  const b = (ox, oy, oz, sx, sy, sz, col, em, rx, rz) => {
    let m = M4.T(x + ox, y + oy, z + oz); if (rx) m = M4.mul(m, M4.RX(rx)); if (rz) m = M4.mul(m, M4.RZ(rz));
    Engine.box(M4.mul(m, M4.S(sx, sy, sz)), col, em || null);
  };
  b(0, 0.03, 0, 0.36, 0.06, 0.3, RANK_COL[rank] || RANK_COL.B, rank === 'S' ? [0.95, 0.76, 0.28, 0.25] : null);
  const gold = [0.95, 0.78, 0.3], stone = [0.78, 0.74, 0.64], y0 = 0.06;
  switch (id) {
    case 'london': b(0, y0 + 0.25, 0, 0.14, 0.5, 0.14, stone); b(0, y0 + 0.4, 0.072, 0.1, 0.1, 0.01, [0.95, 0.95, 0.85], [1, 0.95, 0.7, 0.4]); b(0, y0 + 0.56, 0, 0.1, 0.12, 0.1, gold); b(0, y0 + 0.65, 0, 0.03, 0.08, 0.03, gold); break;
    case 'paris': { const ir = [0.36, 0.3, 0.24]; b(0, y0 + 0.05, 0, 0.3, 0.1, 0.3, ir); b(0, y0 + 0.2, 0, 0.18, 0.2, 0.18, ir); b(0, y0 + 0.42, 0, 0.09, 0.26, 0.09, ir); b(0, y0 + 0.6, 0, 0.025, 0.12, 0.025, ir); break; }
    case 'dubai': { const s = [0.82, 0.85, 0.9]; b(0, y0 + 0.15, 0, 0.16, 0.3, 0.16, s); b(0, y0 + 0.4, 0, 0.1, 0.22, 0.1, s); b(0, y0 + 0.58, 0, 0.05, 0.16, 0.05, gold); b(0, y0 + 0.7, 0, 0.015, 0.1, 0.015, gold); break; }
    case 'tokyo': { const r = [0.82, 0.12, 0.1]; b(-0.13, y0 + 0.2, 0, 0.045, 0.4, 0.045, r); b(0.13, y0 + 0.2, 0, 0.045, 0.4, 0.045, r); b(0, y0 + 0.33, 0, 0.32, 0.035, 0.04, r); b(0, y0 + 0.42, 0, 0.42, 0.05, 0.06, r); b(0, y0 + 0.46, 0, 0.46, 0.03, 0.07, [0.08, 0.08, 0.08]); break; }
    case 'newyork': { const g = [0.36, 0.62, 0.52]; b(0, y0 + 0.2, 0, 0.12, 0.4, 0.1, g); b(0, y0 + 0.45, 0, 0.08, 0.1, 0.08, g); b(0.08, y0 + 0.5, 0, 0.04, 0.18, 0.04, g); b(0.08, y0 + 0.62, 0, 0.06, 0.06, 0.06, gold, [1, 0.7, 0.2, 0.7 + 0.2 * Math.sin(t * 6)]); break; }
    case 'rome': { const w = [0.93, 0.91, 0.86]; b(0, y0 + 0.03, 0, 0.22, 0.06, 0.22, w); b(0, y0 + 0.28, 0, 0.12, 0.45, 0.12, w); b(0, y0 + 0.53, 0, 0.22, 0.06, 0.22, w); break; }
    case 'monaco': [[0.75, 0.1, 0.12], [0.08, 0.08, 0.1], [0.75, 0.1, 0.12], [0.1, 0.35, 0.2]].forEach((c, i) => b(0, y0 + 0.025 + i * 0.05, 0, 0.26, 0.045, 0.26, c)); b(0, y0 + 0.21, 0, 0.1, 0.02, 0.1, gold); break;
    case 'marrakech': { const br = [0.78, 0.58, 0.24]; b(0, y0 + 0.2, 0, 0.17, 0.26, 0.17, br); b(0, y0 + 0.2, 0, 0.12, 0.2, 0.18, [1, 0.6, 0.2], [1, 0.6, 0.2, 0.8]); b(0, y0 + 0.37, 0, 0.1, 0.08, 0.1, br); b(0, y0 + 0.44, 0, 0.04, 0.06, 0.04, br); break; }
    case 'mumbai': b(0, y0 + 0.03, 0, 0.12, 0.06, 0.12, [0.2, 0.2, 0.22]); b(0, y0 + 0.24, 0, 0.32, 0.32, 0.05, [0.14, 0.14, 0.16]); b(0, y0 + 0.24, 0.03, 0.08, 0.08, 0.02, [0.8, 0.8, 0.84]); for (const [a, c] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) b(a, y0 + 0.24 + c, 0.03, 0.05, 0.05, 0.01, [0.3, 0.3, 0.32]); break;
    case 'rio': b(0, y0 + 0.13, 0, 0.025, 0.26, 0.025, [0.4, 0.25, 0.12]); b(0, y0 + 0.3, 0, 0.3, 0.13, 0.04, [0.15, 0.7, 0.45]); b(-0.07, y0 + 0.31, 0.022, 0.06, 0.04, 0.01, [0.05, 0.05, 0.05]); b(0.07, y0 + 0.31, 0.022, 0.06, 0.04, 0.01, [0.05, 0.05, 0.05]); [[-0.09, [0.95, 0.85, 0.2]], [0, [0.9, 0.2, 0.6]], [0.09, [0.95, 0.85, 0.2]]].forEach(([a, c]) => b(a, y0 + 0.45, -0.01, 0.04, 0.18, 0.02, c, null, 0, -a * 3)); break;
    case 'hongkong': { const j = [0.24, 0.66, 0.46]; for (let i = 0; i < 4; i++) b(-0.13 + i * 0.08, y0 + 0.1 + 0.08 * Math.abs(Math.sin(i * 1.3)), 0, 0.09, 0.08, 0.08, j); b(0.2, y0 + 0.24, 0, 0.11, 0.1, 0.1, j); b(0.24, y0 + 0.27, 0.05, 0.02, 0.02, 0.01, [1, 0.1, 0.1], [1, 0.1, 0.1, 1]); break; }
    case 'berlin': b(0, y0 + 0.03, 0, 0.14, 0.06, 0.12, [0.15, 0.15, 0.17]); b(0, y0 + 0.24, 0, 0.34, 0.34, 0.02, gold, [0.95, 0.78, 0.3, 0.15]); b(0, y0 + 0.24, 0.012, 0.12, 0.12, 0.01, [0.08, 0.08, 0.1]); break;
    case 'sydney': { const w = [0.96, 0.95, 0.9]; b(0, y0 + 0.03, 0, 0.36, 0.06, 0.2, [0.7, 0.6, 0.5]); b(-0.1, y0 + 0.17, 0, 0.13, 0.24, 0.02, w, null, 0, 0.5); b(0.02, y0 + 0.2, 0, 0.14, 0.3, 0.02, w, null, 0, 0.45); b(0.13, y0 + 0.15, 0, 0.11, 0.2, 0.02, w, null, 0, 0.55); break; }
    case 'istanbul': { const c = [0.9, 0.85, 0.72], tl = [0.3, 0.62, 0.62]; b(0, y0 + 0.07, 0, 0.26, 0.14, 0.26, c); b(0, y0 + 0.19, 0, 0.2, 0.1, 0.2, tl); b(0, y0 + 0.27, 0, 0.12, 0.06, 0.12, tl); b(0, y0 + 0.33, 0, 0.02, 0.06, 0.02, gold); for (const [a, e] of [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]]) b(a, y0 + 0.2, e, 0.03, 0.4, 0.03, c); break; }
    case 'venice': b(0, y0 + 0.13, 0, 0.025, 0.26, 0.025, [0.5, 0.1, 0.12]); b(0, y0 + 0.34, 0, 0.22, 0.2, 0.04, gold, [0.95, 0.78, 0.3, 0.15]); b(0, y0 + 0.25, 0.02, 0.12, 0.06, 0.03, gold); b(-0.05, y0 + 0.38, 0.022, 0.05, 0.03, 0.01, [0.05, 0.05, 0.05]); b(0.05, y0 + 0.38, 0.022, 0.05, 0.03, 0.01, [0.05, 0.05, 0.05]); b(0, y0 + 0.47, 0, 0.18, 0.04, 0.05, [0.6, 0.08, 0.12]); break;
  }
}

const Trophies = {
  award(res) {
    if (!res.success || !['free', 'campaign', 'elusive', 'weekly'].includes(res.mode)) return;
    ensureExtras();
    const id = CITIES[res.C.ci].id, cur = Game.S.trophies[id], order = 'SABCDF';
    const e = { name: res.C.name, title: res.C.title, method: res.stats ? res.stats.method : null, rank: res.rank, date: Progress.dayStr() };
    if (!cur) { Game.S.trophies[id] = e; res.newTrophy = true; }
    else if (order.indexOf(res.rank) < order.indexOf(cur.rank)) { Game.S.trophies[id] = e; res.newTrophy = 'up'; }
    Game.S.prog.career.trophies = Object.keys(Game.S.trophies).length;
    Progress.checkAch(); Game.save();
  }
};

/* hideout additions: trophy cabinet, pet bed */
(function () {
  const bh = buildHideout;
  buildHideout = function (tier) {
    const M = bh(tier), w = M.world, y = 3;
    for (let x = 19; x <= 22; x++) w.set(x, y, 26, B.WOOD_D);
    M.props.push({ type: 'station', st: 'trophies', p: [21.0, y, 25.6], name: 'Trophy Wall' });
    M.props.push({ type: 'station', st: 'pet', p: [13.5, y, 14.5], name: 'Pet Bed' });
    M.lights.push({ x: 21, y: y + 3.2, z: 25.6, r: 5, c: [1.0, 0.85, 0.62] });
    return M;
  };
  const ds = drawStation;
  drawStation = function (pr, t, hl) {
    if (pr.st !== 'trophies' && pr.st !== 'pet') return ds(pr, t, hl);
    const [x, y, z] = pr.p, hc = [0.4, 0.8, 1], ow = 0.04 + 0.012 * Math.sin(t * 4);
    const bx = (ox, oy, oz, sx, sy, sz, col, e) => { Engine.box(M4.mul(M4.T(x + ox, y + oy, z + oz), M4.S(sx, sy, sz)), col, e || null); if (hl && !e) Engine.outline(M4.mul(M4.T(x + ox, y + oy, z + oz), M4.S(sx + ow * 2, sy + ow * 2, sz + ow * 2)), hc, 0.9); };
    if (pr.st === 'pet') {
      bx(0, 0.08, 0, 1.0, 0.16, 0.8, [0.3, 0.2, 0.14]); bx(0, 0.16, 0, 0.8, 0.06, 0.6, [0.62, 0.22, 0.2]);
      bx(0, 0.2, 0.42, 0.2, 0.08, 0.14, [0.75, 0.75, 0.78]); return;
    }
    const wd = [0.18, 0.12, 0.09], zc = 0.85;
    bx(0, 2.33, zc + 0.38, 4.0, 2.65, 0.06, [0.12, 0.09, 0.07]);
    bx(-1.97, 2.33, zc, 0.08, 2.65, 0.8, wd); bx(1.97, 2.33, zc, 0.08, 2.65, 0.8, wd);
    for (const sh of [1.87, 2.77, 3.63]) bx(0, sh, zc, 4.0, 0.06, 0.8, wd);
    bx(0, 3.57, zc - 0.36, 3.8, 0.03, 0.03, [1, 0.85, 0.6], [1, 0.85, 0.6, 0.9]);
    const T = Game.S.trophies || {};
    CITIES.forEach((c, i) => {
      const row = Math.floor(i / 5), col = i % 5, tx = x - 1.52 + col * 0.76, ty = y + [2.8, 1.9, 1.0][row], tz = z + zc;
      const e = T[c.id];
      if (e) drawTrophy(c.id, tx, ty, tz, t, e.rank);
      else Engine.box(M4.mul(M4.T(tx, ty + 0.02, tz), M4.S(0.3, 0.04, 0.26)), [0.16, 0.16, 0.18]);
    });
  };
})();

const PETS = [
  { id: 'cat', name: 'Cat', price: 12000, cols: [[0.13, 0.13, 0.15], [0.86, 0.52, 0.22], [0.92, 0.91, 0.88], [0.5, 0.5, 0.54]], cn: ['Black', 'Ginger', 'White', 'Grey'], snd: 'meow', say: 'PURR' },
  { id: 'dog', name: 'Dobermann', price: 18000, cols: [[0.12, 0.09, 0.07], [0.45, 0.28, 0.15]], cn: ['Black & Tan', 'Red'], snd: 'bark', say: 'WOOF' },
  { id: 'fox', name: 'Fox', price: 30000, cols: [[0.86, 0.4, 0.12], [0.85, 0.86, 0.9]], cn: ['Red', 'Arctic'], snd: 'yip', say: 'YIP' },
  { id: 'raven', name: 'Raven', price: 25000, cols: [[0.08, 0.08, 0.11], [0.9, 0.9, 0.92]], cn: ['Black', 'Albino'], snd: 'caw', say: 'CAW' }
];
const PET_NAMES = ['Shadow', 'Ghost', 'Whisper', 'Ledger', 'Bishop', 'Nyx', 'Echo', 'Rook', 'Cipher', 'Velvet', 'Mako', 'Saint', 'Dossier', 'Silk'];

function drawPet(e, t) {
  const def = PETS.find(p => p.id === e.type) || PETS[0];
  const ci = (Game.S.pets.col && Game.S.pets.col[e.type]) || 0, col = def.cols[ci] || def.cols[0];
  const dark = [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6], lite = [Math.min(1, col[0] + 0.35), Math.min(1, col[1] + 0.35), Math.min(1, col[2] + 0.35)];
  const hop = e.hop > 0 ? Math.sin((e.hop / 0.5) * Math.PI) * 0.35 : 0;
  const fly = e.type === 'raven' && e.moving ? 0.55 + Math.sin(t * 3) * 0.08 : 0;
  const base = M4.mul(M4.T(e.x, e.y + hop + fly, e.z), M4.RY(e.face));
  const b = (ox, oy, oz, sx, sy, sz, c, em, rx, rz) => { let m = M4.mul(base, M4.T(ox, oy, oz)); if (rx) m = M4.mul(m, M4.RX(rx)); if (rz) m = M4.mul(m, M4.RZ(rz)); Engine.box(M4.mul(m, M4.S(sx, sy, sz)), c, em || null); };
  const ph = e.phase || 0, walk = e.moving, sw = walk ? Math.sin(ph) * 0.05 : 0, st = e.state;
  const sleep = st === 'sleep' && !walk, sit = st === 'sit' && !walk;
  if (e.type === 'raven') {
    const flap = walk ? Math.sin(t * 22) * 0.9 : 0.1;
    b(0, 0.17, 0, 0.16, 0.14, 0.28, col); b(0, 0.27, 0.14, 0.12, 0.12, 0.12, col); b(0, 0.26, 0.23, 0.04, 0.03, 0.08, [0.25, 0.25, 0.27]);
    b(-0.035, 0.29, 0.2, 0.025, 0.025, 0.01, [0.9, 0.7, 0.2], [0.9, 0.7, 0.2, 0.6]); b(0.035, 0.29, 0.2, 0.025, 0.025, 0.01, [0.9, 0.7, 0.2], [0.9, 0.7, 0.2, 0.6]);
    b(-0.1, 0.2, 0, 0.03, 0.1, 0.24, dark, null, 0, flap); b(0.1, 0.2, 0, 0.03, 0.1, 0.24, dark, null, 0, -flap);
    b(0, 0.15, -0.2, 0.1, 0.02, 0.14, dark);
    if (!walk) { b(-0.04, 0.05, 0.02, 0.02, 0.1, 0.02, [0.2, 0.2, 0.2]); b(0.04, 0.05, 0.02, 0.02, 0.1, 0.02, [0.2, 0.2, 0.2]); }
    return;
  }
  const big = e.type === 'dog' ? 1.35 : e.type === 'fox' ? 1.1 : 1;
  const L = 0.18 * big, by = sleep ? 0.1 * big : L + 0.08 * big;
  if (!sleep) {
    for (const [lx, lz, p] of [[-0.07, 0.15, 0], [0.07, 0.15, Math.PI], [-0.07, -0.15, Math.PI], [0.07, -0.15, 0]]) {
      if (sit && lz < 0) continue;
      const s2 = walk ? Math.sin(ph + p) * 0.05 : 0;
      b(lx * big, L / 2 + Math.max(0, s2) * 0.4, lz * big + s2, 0.06 * big, L, 0.06 * big, e.type === 'fox' ? dark : col);
    }
  }
  const tilt = sit ? -0.5 : 0;
  b(0, sit ? by - 0.02 : by, sit ? -0.04 : 0, 0.2 * big, 0.17 * big, (e.type === 'dog' ? 0.5 : 0.42) * big, col, null, tilt);
  if (e.type === 'dog' || e.type === 'cat') b(0, by - 0.06 * big, 0.04, 0.14 * big, 0.06, 0.25 * big, e.type === 'dog' && ci === 0 ? [0.55, 0.32, 0.16] : lite);
  const hy = sleep ? 0.13 * big : by + (sit ? 0.2 : 0.13) * big, hz = (sleep ? 0.22 : 0.25) * big;
  b(0, hy, hz, 0.2 * big, 0.18 * big, 0.18 * big, col);
  if (e.type !== 'cat') b(0, hy - 0.04 * big, hz + 0.13 * big, 0.1 * big, 0.08 * big, 0.12 * big, e.type === 'fox' ? lite : col);
  b(0, hy - 0.02 * big, hz + (e.type === 'cat' ? 0.095 : 0.19) * big, 0.04, 0.03, 0.02, [0.08, 0.06, 0.06]);
  const ear = e.type === 'fox' ? 0.11 : 0.07;
  b(-0.06 * big, hy + 0.12 * big, hz - 0.02, 0.05 * big, ear * big, 0.04 * big, e.type === 'fox' ? dark : col);
  b(0.06 * big, hy + 0.12 * big, hz - 0.02, 0.05 * big, ear * big, 0.04 * big, e.type === 'fox' ? dark : col);
  if (!sleep) { const ec = e.type === 'cat' ? [0.4, 0.9, 0.3] : [0.15, 0.1, 0.05]; b(-0.05 * big, hy + 0.03, hz + 0.092 * big, 0.035, 0.03, 0.01, ec, e.type === 'cat' ? [0.4, 0.9, 0.3, 0.5] : null); b(0.05 * big, hy + 0.03, hz + 0.092 * big, 0.035, 0.03, 0.01, ec, e.type === 'cat' ? [0.4, 0.9, 0.3, 0.5] : null); }
  const wag = (e.type === 'dog' ? Math.sin(t * (walk || e.hop > 0 ? 18 : 6)) * 0.4 : Math.sin(t * 2) * 0.25);
  const tl = e.type === 'fox' ? 0.36 : e.type === 'dog' ? 0.16 : 0.28, tw = e.type === 'fox' ? 0.12 : 0.05;
  let m = M4.mul(base, M4.T(0, by + 0.04, -0.22 * big)); m = M4.mul(m, M4.RY(wag)); m = M4.mul(m, M4.RX(sleep ? 0.0 : -0.75));
  Engine.box(M4.mul(m, M4.mul(M4.T(0, 0, -tl / 2 * big), M4.S(tw * big, tw * big, tl * big))), col);
  if (e.type === 'fox') Engine.box(M4.mul(m, M4.mul(M4.T(0, 0, -tl * big - 0.04), M4.S(tw * big * 0.9, tw * big * 0.9, 0.1))), [0.95, 0.95, 0.95]);
  void sw;
}

const Pets = {
  update(dt) {
    ensureExtras();
    const SP = Game.S.pets, G = Game;
    if (!SP.active || !G.M || !G.M.hideout) { G.pet = null; return; }
    let e = G.pet;
    if (!e || e.type !== SP.active) e = G.pet = { type: SP.active, x: 13.5, y: 3, z: 15.6, face: Math.PI, path: null, pi: 0, moving: false, phase: 0, state: 'idle', idleT: 0, hop: 0, rt: 0 };
    const P = G.P; if (!P) return;
    e.hop = Math.max(0, e.hop - dt); e.rt -= dt;
    const d = Math.hypot(P.x - e.x, P.z - e.z);
    const busy = !!document.querySelector('#sheet:not(.hidden)');
    if ((P.moving && d > 2.4) || d > 4.8) {
      e.idleT = 0;
      if (e.rt <= 0) {
        e.rt = 0.7;
        const gx = Math.floor(P.x - Math.sin(P.face) * 1.3), gz = Math.floor(P.z - Math.cos(P.face) * 1.3);
        const goal = G.W.walkable(gx, 3, gz) ? [gx, 3, gz] : G.cellOf(P);
        G.findPath(e, goal, true);
      }
    } else if (!e.path || e.pi >= e.path.length) {
      e.idleT += dt;
      if (!busy && e.idleT > 8 && e.idleT - dt <= 8 && Math.random() < 0.6) {
        for (let k = 0; k < 8; k++) { const x = Math.floor(e.x + (Math.random() - 0.5) * 6), z = Math.floor(e.z + (Math.random() - 0.5) * 6); if (G.W.walkable(x, 3, z)) { G.findPath(e, [x, 3, z], true); break; } }
      }
      if (e.idleT > 30 && e.idleT - dt <= 30) G.findPath(e, [13, 3, 14], true);
    }
    const sp = e.type === 'dog' ? 3.4 : e.type === 'raven' ? 3.6 : 3.0;
    G.stepPath(e, dt, d > 6 ? sp * 1.6 : sp);
    if (e.moving) { e.phase += dt * 13; e.state = 'walk'; }
    else e.state = e.idleT > 28 ? 'sleep' : e.idleT > 5 ? 'sit' : 'idle';
    if (!e.moving && e.state !== 'sleep' && d < 4) e.face = lerpAng(e.face, Math.atan2(P.x - e.x, P.z - e.z), Math.min(1, dt * 3));
  },
  draw(t) { if (Game.pet) drawPet(Game.pet, t); },
  hit(r) {
    const e = Game.pet; if (!e) return false;
    const tt = rayAABB(r.o, r.d, [e.x - 0.45, e.y, e.z - 0.45], [e.x + 0.45, e.y + 0.9, e.z + 0.45]);
    if (tt < 0) return false;
    this.pet();
    return true;
  },
  pet() {
    const e = Game.pet; if (!e) return;
    const def = PETS.find(p => p.id === e.type);
    e.hop = 0.5; e.idleT = 0; Sfx.play(def.snd);
    UI.popup([e.x, e.y + 1.0, e.z], def.say, 'grey');
    UI.toast(`${Game.S.pets.name} is happy to see you`);
  }
};

/* pet and rifle sounds */
(function () {
  const pl = Sfx.play.bind(Sfx);
  Sfx.play = function (name) {
    if (!this.ctx || !this.on.sfx) return pl(name);
    const t = this.ctx.currentTime;
    switch (name) {
      case 'meow': this.tone(620, 0.35, 'sawtooth', 0.04, t, 900); this.tone(900, 0.25, 'sine', 0.05, t + 0.15, 500); return;
      case 'bark': this.noise(0.09, 0.25, 700, 2, t, 'bandpass'); this.tone(260, 0.1, 'sawtooth', 0.12, t, 160); this.noise(0.09, 0.22, 700, 2, t + 0.18, 'bandpass'); this.tone(240, 0.1, 'sawtooth', 0.1, t + 0.18, 150); return;
      case 'yip': this.tone(1100, 0.12, 'sawtooth', 0.05, t, 1500); this.tone(1200, 0.12, 'sawtooth', 0.05, t + 0.15, 1700); return;
      case 'caw': this.noise(0.3, 0.2, 1400, 3, t, 'bandpass'); this.tone(500, 0.3, 'sawtooth', 0.07, t, 380); return;
    }
    return pl(name);
  };
})();

/* =========================================================
   UI: records, trophy wall, pets, sniper tab & briefing
   ========================================================= */
Object.assign(UI, {
  records(tab) {
    ensureExtras();
    tab = tab || this._rtab || 'contracts'; this._rtab = tab;
    const wrap = el('div'), S = Game.S;
    const tabs = el('div', 'tabs');
    for (const [k, n] of [['contracts', 'Contracts'], ['sniper', 'Sniper']]) { const b = el('button', 'tab' + (k === tab ? ' on' : ''), n); b.onclick = () => this.records(k); tabs.appendChild(b); }
    wrap.appendChild(tabs);
    const pre = tab === 'sniper' ? 'sn:' : '';
    const reps = Records.all();
    wrap.appendChild(el('div', 'rec-tot', `<span>{i:podium} CAREER SCORE</span><b>${Records.totals(pre).toLocaleString()}</b><small>Sum of your best score in every city. Beat your own records to climb.</small>`));
    const list = el('div', 'rec-list');
    CITIES.forEach((c, i) => {
      const L = S.records[pre + c.id] || [], best = L[0];
      const d = el('div', 'rec-row' + (best ? '' : ' empty'));
      d.innerHTML = `<div class="rr-n">${String(i + 1).padStart(2, '0')}</div><div class="rr-c"><b>${c.name}</b><span>${best ? `${fmtTime(best.time)} · ${DIFFS[best.diff] ? DIFFS[best.diff].name : ''} · ${best.date}` : 'No record yet'}</span></div>${best ? `<div class="rank sm r-${best.rank}">${best.rank}</div><div class="rr-s">${best.score.toLocaleString()}</div>` : '<div class="rr-s dim">—</div>'}${reps[pre + c.id] ? '<div class="rr-r">{i:film}</div>' : ''}`;
      if (best) d.onclick = () => this.recordDetail(pre, i);
      list.appendChild(d);
    });
    wrap.appendChild(list);
    this.openSheet('Records', wrap, { wide: true });
  },
  recordDetail(pre, ci) {
    const c = CITIES[ci], L = Game.S.records[pre + c.id] || [], wrap = el('div');
    const back = el('button', 'btn sm', '{i:arrow} Back'); back.onclick = () => this.records(); wrap.appendChild(back);
    wrap.appendChild(el('div', 'sec', `${c.name} · ${pre ? 'Sniper' : 'Contracts'} · Top ${L.length}`));
    const tb = el('div', 'rec-list');
    L.forEach((e, i) => tb.appendChild(el('div', 'rec-row', `<div class="rr-n">#${i + 1}</div><div class="rr-c"><b>${e.score.toLocaleString()}</b><span>${fmtTime(e.time)} · ${DIFFS[e.diff] ? DIFFS[e.diff].name : ''} · ${e.mode || ''} · ${e.date}</span></div><div class="rank sm r-${e.rank}">${e.rank}</div>`)));
    wrap.appendChild(tb);
    const rec = !pre && Records.load(c.id);
    if (rec) { const b = el('button', 'btn primary big', '{i:film} Watch Best Run'); b.style.width = '100%'; b.onclick = () => { this.closeSheet(); Replay.play(rec, () => this.records()); }; wrap.appendChild(b); }
    else if (!pre) wrap.appendChild(el('p', 'hint', 'Set a new personal best here to save a replay of the run.'));
    this.openSheet('Records', wrap, { wide: true });
  },
  trophies() {
    ensureExtras();
    const T = Game.S.trophies, wrap = el('div');
    wrap.appendChild(el('p', 'hint', `${Object.keys(T).length} / ${CITIES.length} trophies. Complete a contract in a city to put its trophy on the wall. The plinth shows your best rank there.`));
    const g = el('div', 'troph');
    CITIES.forEach(c => {
      const e = T[c.id];
      g.appendChild(el('div', 'tro' + (e ? ' r-' + e.rank : ' locked'), e ? `<b>${TROPHY_NAMES[c.id]}</b><span>${c.name}</span><small>${e.name || ''}${e.title ? ' · ' + e.title : ''}</small><small>${(METHODS.find(m => m.id === e.method) || { name: e.method || '' }).name} · ${e.date}</small><i class="rank sm r-${e.rank}">${e.rank}</i>` : `<b>???</b><span>${c.name}</span><small>Complete a contract here</small>`));
    });
    wrap.appendChild(g);
    this.openSheet('Trophy Wall', wrap, { wide: true });
  },
  petShop() {
    ensureExtras();
    const SP = Game.S.pets, wrap = el('div');
    if (SP.active) {
      const card = el('div', 'pet-card');
      card.innerHTML = `<div class="pc-i">{i:paw}</div><div><b>${SP.name}</b><span>${PETS.find(p => p.id === SP.active).name}</span></div>`;
      const petB = el('button', 'btn sm', '{i:heart} Pet'); petB.onclick = () => Pets.pet(); card.appendChild(petB);
      wrap.appendChild(card);
      const nm = el('div', 'row'); nm.appendChild(el('div', 'row-l', 'Name'));
      const ch = el('div', 'chips');
      PET_NAMES.forEach(n => { const b = el('button', 'chip' + (SP.name === n ? ' on' : ''), n); b.onclick = () => { SP.name = n; Game.save(); this.petShop(); }; ch.appendChild(b); });
      nm.appendChild(ch); wrap.appendChild(nm);
      const def = PETS.find(p => p.id === SP.active);
      const cr = el('div', 'row'); cr.appendChild(el('div', 'row-l', 'Coat'));
      const cc = el('div', 'chips');
      def.cols.forEach((c, i) => { const b = el('button', 'sw' + (((SP.col || {})[def.id] || 0) === i ? ' on' : '')); b.style.background = rgb(c); b.title = def.cn[i]; b.onclick = () => { SP.col = SP.col || {}; SP.col[def.id] = i; Game.save(); this.petShop(); }; cc.appendChild(b); });
      cr.appendChild(cc); wrap.appendChild(cr);
    } else wrap.appendChild(el('p', 'hint', 'Every safehouse needs a companion. Adopt a pet: it follows you around the hideout, naps when you\'re busy, and waits for you between contracts.'));
    wrap.appendChild(el('div', 'sec', 'Companions'));
    const grid = el('div', 'grid');
    PETS.forEach(p => {
      const own = SP.owned[p.id], on = SP.active === p.id;
      const d = el('div', 'item' + (on ? ' on' : ''), `<div class="it-i">{i:paw}</div><div class="it-n">${p.name}</div><div class="it-d">${p.cn.join(' · ')}</div>`);
      const b = el('button', 'btn sm' + (own ? '' : ' primary'), on ? 'With you' : own ? 'Choose' : money(p.price));
      b.onclick = () => {
        if (on) return;
        if (own) { SP.active = p.id; Game.pet = null; Game.save(); this.petShop(); return; }
        this.buy(p.price, () => { SP.owned[p.id] = true; SP.active = p.id; Game.pet = null; Game.S.prog.career.pets = Object.keys(SP.owned).length; Progress.checkAch(); Sfx.play(p.snd); this.toast(`${p.name} adopted`, 'good'); });
        this.petShop();
      };
      d.appendChild(b); grid.appendChild(d);
    });
    wrap.appendChild(grid);
    this.openSheet('Companion', wrap);
  },
  sniperTab(body) {
    ensureExtras();
    const SS = Game.S.sniper;
    body.appendChild(el('p', 'hint', 'Sniper Assassin: take a rooftop position across from the venue and eliminate three targets with a rifle. If a target reaches an exit, the contract fails. Bodies that are found send the other targets running.'));
    body.appendChild(el('div', 'sec', 'Rifle'));
    const rg = el('div', 'grid');
    SNIPER_RIFLES.forEach(r => {
      const own = SS.owned.includes(r.id), on = SS.rifle === r.id;
      const d = el('div', 'item' + (on ? ' on' : ''), `<div class="it-i">{i:scope}</div><div class="it-n">${r.name}</div><div class="it-d">${r.zoom}x zoom · ${r.mag} round mag · ${r.silenced ? 'suppressed' : 'loud'}<br>${r.desc}</div>`);
      const b = el('button', 'btn sm' + (own ? '' : ' primary'), on ? 'Equipped' : own ? 'Equip' : money(r.price));
      b.onclick = () => { if (on) return; if (own) { SS.rifle = r.id; Game.save(); this.contracts('sniper'); return; } this.buy(r.price, () => { SS.owned.push(r.id); SS.rifle = r.id; this.toast(r.name + ' unlocked', 'good'); }); this.contracts('sniper'); };
      d.appendChild(b); rg.appendChild(d);
    });
    body.appendChild(rg);
    body.appendChild(el('div', 'sec', 'Locations'));
    const grid = el('div', 'cities');
    CITIES.forEach((c, i) => {
      const un = Game.cityUnlocked(i), best = SS.best[c.id];
      const d = el('div', 'city' + (un ? '' : ' locked') + ' t-' + c.time);
      d.innerHTML = `<div class="city-n">${String(i + 1).padStart(2, '0')} · SNIPER</div><div class="city-name">${c.name}</div><div class="city-v">${un ? c.venue : 'Locked'}</div>${best ? `<div class="rank r-${best}">${best}</div>` : ''}`;
      if (un) d.onclick = () => this.sniperBrief(i);
      grid.appendChild(d);
    });
    body.appendChild(grid);
  },
  sniperBrief(ci) {
    const C = Sniper.contract(ci), city = CITIES[ci], wrap = el('div', 'brief');
    const back = el('button', 'btn sm', '{i:arrow} Back'); back.onclick = () => this.contracts('sniper'); wrap.appendChild(back);
    wrap.appendChild(el('div', 'chap-tag el', 'SNIPER ASSASSIN · 3 TARGETS'));
    wrap.appendChild(el('div', 'b-city', `${city.name}, ${city.country} · ${city.venue}`));
    const tg = el('div', 'sn-tg');
    [{ name: C.name, title: C.title, looks: C.looks, outfit: C.outfit }, C.second, C.third].forEach(t => {
      const d = el('div', 'sn-t'); const cv = el('canvas', 'portrait'); cv.width = 72; cv.height = 72; drawPortrait(cv, t.looks, t.outfit); d.appendChild(cv);
      d.appendChild(el('div', '', `<b>${t.name}</b><span>${t.title}</span>`)); tg.appendChild(d);
    });
    wrap.appendChild(tg);
    const r = Sniper.rifleOf();
    wrap.appendChild(el('div', 'rules', `<div>• Rifle: ${r.name} (${r.zoom}x, ${r.mag} rounds, ${r.ammo} total)</div><div>• Drag to aim, pinch or use the zoom buttons. FLOOR changes which level of the building you can see into.</div><div>• Walls near your crosshair turn see-through and the round goes straight through them.</div><div>• Shoot chandeliers, gas stoves, the pool speaker or signature props for accident kills.</div><div>• ${r.silenced ? 'Suppressed: only people near the impact will notice.' : 'Loud: anyone near the impact will panic. Upgrade to a suppressed rifle.'}</div>`));
    wrap.appendChild(el('p', 'hint', `Fee ${money(C.fee)} · Bonuses for Silent Sniper, accident kills and perfect accuracy.`));
    const go = el('button', 'btn primary big', '{i:scope} Take Position'); go.style.width = '100%';
    go.onclick = () => { this.closeSheet(); this.loading(() => Sniper.start(ci)); };
    wrap.appendChild(go);
    this.openSheet('Sniper Contract', wrap, { wide: true });
  }
});

/* contracts: add the Sniper tab */
(function () {
  const oc = UI.contracts;
  UI.contracts = function (tab) {
    tab = tab || this._ctab || 'campaign';
    const sn = tab === 'sniper';
    oc.call(this, sn ? 'free' : tab);
    this._ctab = tab;
    const body = this.sheet.querySelector('.sh-body'), tabs = body && body.querySelector('.tabs'); if (!tabs) return;
    const b = el('button', 'tab' + (sn ? ' on' : ''), '{i:scope} Sniper'); b.onclick = () => this.contracts('sniper'); tabs.appendChild(b);
    if (sn) {
      tabs.querySelectorAll('.tab').forEach(x => { if (x !== b) x.classList.remove('on'); });
      let n = tabs.nextSibling; while (n) { const nx = n.nextSibling; n.remove(); n = nx; }
      this.sniperTab(tabs.parentNode);
    }
  };
  const os = UI.openStation;
  UI.openStation = function (st, creator) {
    if (st === 'trophies' || st === 'pet') { if (Game.mode !== 'hideout') return; this.prevCam = Object.assign({}, Engine.cam); return st === 'pet' ? this.petShop() : this.trophies(); }
    return os.call(this, st, creator);
  };
  // result screen: outro cutscene, records, replays, trophies
  const sr = UI.showResult;
  UI.showResult = async function (res) {
    if (res.mode === 'campaign' && res.success && !res._cut && res.C && res.C.chapter !== undefined) {
      res._cut = true; Cutscene.outro(res.C.chapter, () => { Game.mode = 'result'; UI.showResult(res); }); return;
    }
    if (!res._sub) { res._sub = true; try { Records.submit(res); Trophies.award(res); } catch (e) { console.error(e); } }
    await sr.call(this, res);
    if (res.mode === 'sniper' && res.stats) $('#rStats').innerHTML = `<div class="rstats"><span>{i:clock} ${fmtTime(res.stats.time)}</span><span>{i:bullet} ${res.stats.hits}/${res.stats.shots} hits</span><span>{i:scope} ${Math.round(res.stats.acc * 100)}% accuracy</span><span>{i:coffin} ${res.stats.bodies} found</span><span>{i:burst} ${res.stats.accidents} accidents</span></div>`;
    const ex = $('#rExtra');
    if (res.record) ex.insertAdjacentHTML('beforeend', `<div class="r-rec${res.record.best ? ' best' : ''}"><span>{i:podium} Score <b>${res.record.score.toLocaleString()}</b></span><em>${res.record.best ? (res.record.prev ? 'NEW PERSONAL BEST' : 'FIRST RECORD SET') : `#${res.record.pos} · best ${res.record.prev.toLocaleString()}`}</em></div>`);
    if (res.newTrophy) ex.insertAdjacentHTML('beforeend', `<div class="r-mast">{i:trophy} ${res.newTrophy === 'up' ? 'Trophy upgraded' : 'New trophy'}: ${TROPHY_NAMES[CITIES[res.C.ci].id]} — on your hideout wall</div>`);
    if (res.replay && res.replay.n > 2) {
      const b = el('button', 'btn', '{i:film} Watch Replay');
      b.onclick = e => { e.stopPropagation(); $('#result').classList.add('hidden'); Replay.play(res.replay); };
      $('#rBtns').insertBefore(b, $('#rBtns').firstChild);
    }
    if (res.mode === 'sniper') {
      const rt = $('#rRetry'); rt.textContent = res.success ? 'Next Sniper Contract' : 'Retry';
      rt.onclick = e => { e.stopPropagation(); $('#result').classList.add('hidden'); Game.enterHideout(); this._ctab = 'sniper'; this.openStation('contracts'); this.sniperBrief(res.C.ci); };
    }
  };
})();

/* hideout HUD: Records button */
(function () {
  const init = UI.init;
  UI.init = function () {
    init.call(this);
    ensureExtras();
    const sb = $('#bRec'); if (sb) sb.onclick = () => { Sfx.play('click'); this.records(); };
  };
})();

/* achievements for the new systems */
ACHIEVEMENTS.push(
  { id: 'snip1', icon: '{i:scope}', name: 'Long Range', desc: 'Complete a Sniper contract', stat: 'snipers', goal: 1, cash: 10000 },
  { id: 'snip5', icon: '{i:scope}', name: 'Overwatch', desc: 'Complete 5 Sniper contracts', stat: 'snipers', goal: 5, cash: 40000 },
  { id: 'snipS', icon: '{i:bullet}', name: 'One Shot, One Kill', desc: 'Earn an S rank on a Sniper contract', stat: 'sniperS', goal: 1, cash: 25000 },
  { id: 'pet1', icon: '{i:paw}', name: 'Best Friend', desc: 'Adopt a companion', stat: 'pets', goal: 1, cash: 5000 },
  { id: 'pet4', icon: '{i:paw}', name: 'Menagerie', desc: 'Adopt all four companions', stat: 'pets', goal: 4, cash: 30000 },
  { id: 'tro10', icon: '{i:trophy}', name: 'Trophy Hunter', desc: 'Put 10 trophies on your wall', stat: 'trophies', goal: 10, cash: 30000 },
  { id: 'tro15', icon: '{i:trophy}', name: 'Full Cabinet', desc: 'Collect all 15 city trophies', stat: 'trophies', goal: 15, cash: 75000 },
  { id: 'tape', icon: '{i:film}', name: 'Game Tape', desc: 'Watch a replay of one of your runs', stat: 'replays', goal: 1, cash: 3000 }
);
