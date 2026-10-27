'use strict';
// Фоновая музыка без файлов (WebAudio): «средневековый завод» — лютня, колёсная лира, виолончель, хор,
// колокола, а в ритме — наковальня, часовой механизм, кузнечные мехи и рамочный барабан.
// Музыка меняется по ситуации: день / ночь (и биом под ногами), набег на базу, штурм лагеря, эльфы,
// обычный бой, подземелья. На каждую ситуацию — несколько треков; переходы плавные (две шины, кроссфейд).

const SETTINGS_KEY = 'golem-age-settings';
const SETTINGS = Object.assign({ music: 0.45, sfx: 0.8, ui: 1, autosave: 120, quality: 'high', fps: 0 }, (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } })());
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) { /* приватный режим */ } applySettings(); }
function applySettings() {
  document.documentElement.style.setProperty('--ui', SETTINGS.ui);
  if (MASTER) MASTER.gain.value = 0.35 * SETTINGS.sfx;
  if (MUS.gain) MUS.gain.gain.value = 0.26 * SETTINGS.music;
  if (typeof CV !== 'undefined' && CV) resize();
}

// ---------- лады ----------
const MODES = {
  dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], hijaz: [0, 1, 4, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], locrian: [0, 1, 3, 5, 6, 8, 10], whole: [0, 2, 4, 6, 8, 10, 12],
  // старые названия (на случай вызова из других мест)
  day: [0, 2, 3, 5, 7, 9, 10], night: [0, 2, 3, 5, 7, 8, 10],
};
const ROOT = 146.83; // ре малой октавы

// ---------- треки ----------
// ритм — 16 шагов на такт (x — удар, o — тихий удар): dr — рамочный барабан, an — наковальня, tk — часовой механизм,
// sh — бубен; prog — ступени аккордов по тактам; lead — чем играется мелодия; bass — чем играется бас
const TRACKS = {
  day: [
    { name: 'Кузнечный двор', bpm: 88, mode: 'dorian', prog: [0, 3, 4, 0, 5, 3, 4, 4], lead: 'lute', bass: 'pluck', pad: 'gurdy', dr: 'x.......x.......', an: '....x.......x...', tk: '..x...x...x...x.', dens: 0.6 },
    { name: 'Мельничный ход', bpm: 76, mode: 'mixolydian', prog: [0, 6, 3, 0, 0, 6, 4, 4], lead: 'gurdy', bass: 'bowed', pad: 'drone', dr: 'x.....x.x.......', an: '............x...', tk: 'x.x.x.x.x.x.x.x.', dens: 0.5 },
    { name: 'Ярмарка мастеров', bpm: 98, mode: 'dorian', prog: [0, 4, 3, 4, 0, 6, 3, 4], lead: 'lute', bass: 'pluck', pad: 'none', dr: 'x...o...x...o.o.', an: '........x.......', tk: '', sh: '..x...x...x...x.', dens: 0.7 },
    { name: 'Шестерни и смола', bpm: 82, mode: 'aeolian', prog: [0, 5, 6, 4, 0, 5, 3, 4], lead: 'gurdy', bass: 'bowed', pad: 'drone', dr: 'x.......x...x...', an: '....x.......x...', tk: '.x.x.x.x.x.x.x.x', dens: 0.55 },
  ],
  night: [
    { name: 'Ночная смена', bpm: 64, mode: 'aeolian', prog: [0, 5, 3, 4, 0, 5, 6, 4], lead: 'lute', bass: 'bowed', pad: 'choir', dr: 'x...............', an: '............o...', tk: '..x.......x.....', dens: 0.35 },
    { name: 'Лунная кузня', bpm: 58, mode: 'phrygian', prog: [0, 1, 0, 6, 0, 1, 3, 4], lead: 'lute', bass: 'bowed', pad: 'drone', dr: 'x.......o.......', an: '', tk: 'x...x...x...x...', dens: 0.3 },
    { name: 'Остывающие печи', bpm: 66, mode: 'dorian', prog: [0, 3, 0, 4, 5, 3, 4, 4], lead: 'gurdy', bass: 'bowed', pad: 'choir', dr: '', an: '........o.......', tk: '....x.......x...', dens: 0.4 },
  ],
  raid: [
    { name: 'Набат', bpm: 122, mode: 'phrygian', prog: [0, 1, 0, 6, 0, 1, 3, 1], lead: 'gurdy', bass: 'bowed', pad: 'drone', dr: 'x..xx...x..xx.x.', an: '....x.......x...', tk: 'x.x.x.x.x.x.x.x.', dens: 0.65, alarm: 1 },
    { name: 'Стены держать', bpm: 132, mode: 'aeolian', prog: [0, 0, 5, 4, 0, 0, 6, 4], lead: 'lute', bass: 'bowed', pad: 'drone', dr: 'x.x.x...x.x.x.xx', an: '..x...x...x...x.', tk: '', dens: 0.7 },
    { name: 'Огонь у ворот', bpm: 116, mode: 'hijaz', prog: [0, 1, 0, 4, 0, 1, 6, 4], lead: 'gurdy', bass: 'pluck', pad: 'choir', dr: 'x...x.x.x...x.x.', an: '....x.......x...', tk: '..x...x...x...x.', dens: 0.6, alarm: 1 },
  ],
  assault: [
    { name: 'Поход на частокол', bpm: 124, mode: 'dorian', prog: [0, 6, 0, 4, 0, 6, 3, 4], lead: 'gurdy', bass: 'bowed', pad: 'drone', dr: 'x.x.x...x.x.x...', an: '........x.......', tk: '', sh: '..x...x...x...x.', dens: 0.65 },
    { name: 'Молот и пламя', bpm: 110, mode: 'mixolydian', prog: [0, 6, 3, 0, 0, 6, 4, 4], lead: 'lute', bass: 'bowed', pad: 'gurdy', dr: 'x..x..x.x..x..x.', an: '....x.......x...', tk: '', dens: 0.6 },
    { name: 'Штурм', bpm: 128, mode: 'aeolian', prog: [0, 5, 6, 4, 0, 5, 6, 0], lead: 'gurdy', bass: 'pluck', pad: 'drone', dr: 'xx..x.x.xx..x.x.', an: '....x.......x...', tk: 'x.x.x.x.x.x.x.x.', dens: 0.7 },
  ],
  elves: [
    { name: 'Тёмный двор', bpm: 92, mode: 'locrian', prog: [0, 1, 0, 4, 0, 1, 5, 4], lead: 'lute', bass: 'bowed', pad: 'choir', dr: 'x.......x..x....', an: '', tk: '', dens: 0.45 },
    { name: 'Портал', bpm: 84, mode: 'hijaz', prog: [0, 1, 4, 1, 0, 1, 5, 4], lead: 'lute', bass: 'bowed', pad: 'choir', dr: 'x.....x.........', an: '', tk: 'x...x...x...x...', dens: 0.4 },
    { name: 'Дань кровью', bpm: 104, mode: 'phrygian', prog: [0, 1, 6, 1, 0, 1, 3, 4], lead: 'gurdy', bass: 'bowed', pad: 'choir', dr: 'x.x.....x.x..x..', an: '', tk: '', dens: 0.55, alarm: 1 },
  ],
  combat: [
    { name: 'Стычка', bpm: 112, mode: 'aeolian', prog: [0, 5, 3, 4, 0, 5, 6, 4], lead: 'lute', bass: 'bowed', pad: 'drone', dr: 'x...x.x.x...x...', an: '....x.......x...', tk: '', dens: 0.6 },
    { name: 'Клинки', bpm: 104, mode: 'phrygian', prog: [0, 1, 0, 6, 0, 1, 3, 4], lead: 'gurdy', bass: 'pluck', pad: 'drone', dr: 'x..x..x.x..x....', an: '........x.......', tk: '..x...x...x...x.', dens: 0.55 },
    { name: 'Отбиться', bpm: 118, mode: 'dorian', prog: [0, 4, 6, 4, 0, 4, 3, 4], lead: 'lute', bass: 'bowed', pad: 'gurdy', dr: 'x.x...x.x.x...x.', an: '....x.......x...', tk: '', dens: 0.65 },
  ],
  cave: [
    { name: 'Капель', bpm: 54, mode: 'phrygian', prog: [0, 1, 0, 1, 0, 6, 0, 1], lead: 'bell', bass: 'bowed', pad: 'drone', dr: '', an: '', tk: '', drip: 1, dens: 0.25 },
    { name: 'Дыхание недр', bpm: 50, mode: 'aeolian', prog: [0, 0, 5, 5, 3, 3, 4, 4], lead: 'lute', bass: 'bowed', pad: 'choir', dr: 'x...............', an: '', tk: '', bellows: 1, dens: 0.25 },
    { name: 'Заброшенная шахта', bpm: 60, mode: 'whole', prog: [0, 1, 0, 2, 0, 1, 3, 2], lead: 'bell', bass: 'bowed', pad: 'drone', dr: '', an: '............o...', tk: 'x.......x.......', drip: 1, dens: 0.3 },
  ],
};
// биом под ногами окрашивает мирную музыку: лад и сдвиг тональности (в полутонах)
const BIOME_MUS = {}; // заполняется лениво (GROUND объявлен в data.js)
function biomeMusic(gr) {
  if (!BIOME_MUS.ready) {
    Object.assign(BIOME_MUS, {
      ready: true,
      [GROUND.desert]: { mode: 'hijaz', shift: 2, name: 'пустыня' },
      [GROUND.snow]: { mode: 'lydian', shift: 5, name: 'тундра' },
      [GROUND.swamp]: { mode: 'phrygian', shift: -2, pad: 'choir', name: 'болото' },
      [GROUND.mushroom]: { mode: 'whole', shift: -3, pad: 'choir', name: 'грибная чаща' },
      [GROUND.autumn]: { mode: 'mixolydian', shift: 3, name: 'осенний лес' },
      [GROUND.dark]: { mode: 'aeolian', shift: -1, name: 'тёмный лес' },
    });
  }
  return BIOME_MUS[gr] || null;
}

const MUS = { gain: null, buses: [], cur: null, next: 0, step: 0, scene: null, want: null, wantT: 0, track: null, trackT: 0, last: {}, phrase: null, timer: null, calmT: 0 };

// ---------- шины: две для кроссфейда, у каждой — фильтр и общий «зал» ----------
function makeBus() {
  const inp = AC.createGain(), filt = AC.createBiquadFilter(), out = AC.createGain();
  filt.type = 'lowpass'; filt.frequency.value = 3200;
  inp.connect(filt); filt.connect(out); out.connect(MUS.gain);
  filt.connect(MUS.rev);
  out.gain.value = 0;
  return { inp, filt, out };
}
function startMusic() {
  if (!AC || MUS.gain) return;
  MUS.gain = AC.createGain();
  MUS.gain.connect(AC.destination);
  // «каменный зал»: две задержки с затуханием
  MUS.rev = AC.createGain(); MUS.rev.gain.value = 0.32;
  const d1 = AC.createDelay(), d2 = AC.createDelay(), fb = AC.createGain(), lp = AC.createBiquadFilter();
  d1.delayTime.value = 0.23; d2.delayTime.value = 0.37; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 1800;
  MUS.rev.connect(d1); MUS.rev.connect(d2); d1.connect(lp); d2.connect(lp); lp.connect(fb); fb.connect(d1); lp.connect(MUS.gain);
  MUS.buses = [makeBus(), makeBus()];
  MUS.cur = 0;
  applySettings();
  MUS.next = AC.currentTime + 0.5;
  MUS.timer = setInterval(musicTick, 100);
}
// плавная смена трека: старая шина гаснет, новая разгорается (3 с)
function crossfadeTo(track) {
  const t = AC.currentTime, old = MUS.buses[MUS.cur];
  MUS.cur = 1 - MUS.cur;
  const nb = MUS.buses[MUS.cur];
  old.out.gain.cancelScheduledValues(t); old.out.gain.setValueAtTime(old.out.gain.value, t); old.out.gain.linearRampToValueAtTime(0, t + 3);
  nb.out.gain.cancelScheduledValues(t); nb.out.gain.setValueAtTime(nb.out.gain.value, t); nb.out.gain.linearRampToValueAtTime(1, t + 3);
  MUS.track = track; MUS.trackT = 0; MUS.step = 0; MUS.phrase = null;
  MUS.next = Math.max(MUS.next, t + 0.05);
}

// ---------- инструменты ----------
function env(g, t, a, peak, dur, curve) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t + dur); else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function osc(bus, type, f, t, dur, vol, a, det, filt) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det;
  env(g, t, a || 0.005, vol, dur, a > 0.1 ? 'lin' : null);
  if (filt) { const f2 = AC.createBiquadFilter(); f2.type = filt[0]; f2.frequency.value = filt[1]; if (filt[2]) f2.Q.value = filt[2]; o.connect(f2); f2.connect(g); }
  else o.connect(g);
  g.connect(bus.inp); o.start(t); o.stop(t + dur + 0.05);
  return o;
}
// лютня: щипок, яркая атака, быстро гаснет
function iLute(bus, f, t, dur, vol) {
  osc(bus, 'triangle', f, t, dur, vol, 0.004);
  osc(bus, 'sawtooth', f, t, dur * 0.5, vol * 0.18, 0.003, 4, ['lowpass', 2200]);
  osc(bus, 'sine', f * 2, t, dur * 0.4, vol * 0.25, 0.004);
}
// колёсная лира: гнусавая пила через полосовой фильтр, с вибрато
function iGurdy(bus, f, t, dur, vol) {
  const o = osc(bus, 'sawtooth', f, t, dur, vol * 0.55, 0.06, 0, ['bandpass', 1100, 1.2]);
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 5.2; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.05);
  osc(bus, 'square', f, t, dur, vol * 0.08, 0.06, -6, ['lowpass', 900]);
}
// виолончель/бас: смычок — медленная атака, мягкий фильтр
function iBowed(bus, f, t, dur, vol) {
  osc(bus, 'sawtooth', f, t, dur, vol * 0.5, Math.min(0.35, dur * 0.3), 0, ['lowpass', 520]);
  osc(bus, 'sawtooth', f, t, dur, vol * 0.3, Math.min(0.35, dur * 0.3), 7, ['lowpass', 420]);
}
function iPluckBass(bus, f, t, dur, vol) { osc(bus, 'triangle', f, t, dur, vol, 0.004); osc(bus, 'sine', f / 2, t, dur * 0.7, vol * 0.5, 0.004); }
// хор: две расстроенные пилы через «гласную» (две форманты)
function iChoir(bus, f, t, dur, vol) {
  for (const det of [-8, 9]) for (const [fr, q, k] of [[650, 4, 1], [1080, 5, 0.6]]) osc(bus, 'sawtooth', f, t, dur, vol * 0.18 * k, Math.min(0.8, dur * 0.4), det, ['bandpass', fr, q]);
}
// колокол: негармонические обертоны
// мягкий колокольчик: только в пещерах, тихо, без резких верхних обертонов
function iBell(bus, f, t, dur, vol) {
  for (const [m, k, d] of [[1, 1, 1], [2.76, 0.25, 0.5]]) osc(bus, 'sine', f * m, t, Math.max(0.3, dur * 1.4 * d), vol * 0.35 * k, 0.01, 0, ['lowpass', 1800]);
}
function iDrone(bus, f, t, dur, vol) { osc(bus, 'sawtooth', f, t, dur, vol * 0.35, dur * 0.25, 0, ['lowpass', 300]); osc(bus, 'sine', f * 1.5, t, dur, vol * 0.25, dur * 0.25); }
function noiseBuf() {
  if (MUS.nbuf) return MUS.nbuf;
  const n = AC.sampleRate, b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return (MUS.nbuf = b);
}
function iNoise(bus, t, dur, vol, type, f, q, a) {
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
  env(g, t, a || 0.002, vol, dur, a > 0.1 ? 'lin' : null);
  s.connect(fl); fl.connect(g); g.connect(bus.inp); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
// рамочный барабан: падающий тон + шлепок
function iDrum(bus, t, vol) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
  env(g, t, 0.003, vol, 0.32); o.connect(g); g.connect(bus.inp); o.start(t); o.stop(t + 0.4);
  iNoise(bus, t, 0.08, vol * 0.35, 'lowpass', 900);
}
// молот по наковальне: глухой короткий удар с лёгким металлом, без звона (высокий звон резал уши)
function iAnvil(bus, t, vol) {
  const f = 310 + Math.random() * 20;
  for (const [m, k] of [[1, 1], [2.31, 0.35], [3.87, 0.12]]) osc(bus, 'sine', f * m, t, 0.1 + 0.05 / m, vol * 0.2 * k, 0.001, 0, ['lowpass', 1400]);
  iNoise(bus, t, 0.05, vol * 0.35, 'lowpass', 1200);
}
function iTick(bus, t, vol) { iNoise(bus, t, 0.025, vol, 'bandpass', 3200, 6); }
function iShaker(bus, t, vol) { iNoise(bus, t, 0.07, vol, 'highpass', 6000); }
function iBellows(bus, t, dur, vol) { iNoise(bus, t, dur, vol, 'lowpass', 500, 0, dur * 0.5); }
function iDrip(bus, t, vol) { const f = 1400 + Math.random() * 900; const o = osc(bus, 'sine', f, t, 0.18, vol, 0.002); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.08); }

// ---------- сцена: что сейчас происходит ----------
function musicScene() {
  const p = S.player;
  if (typeof inDungeonY === 'function' && inDungeonY(p.y)) return 'cave';
  let elf = S.elves && S.elves.final, raid = 0, fight = false, camp = null;
  const bc = typeof baseCenter === 'function' ? baseCenter() : { x: 0, y: 0 };
  for (const e of S.enemies) {
    if (e.dead) continue;
    const dp = dist(e.x, e.y, p.x, p.y);
    if (e.mode === 'elf' && dp < 50) elf = true;
    if (e.mode === 'raid' && dist(e.x, e.y, bc.x, bc.y) < 45) raid++;
    if (dp < 14 && e.mode !== 'guard' && e.mode !== 'wild') fight = true;
    if (dp < 14 && e.tgt && e.tgt.k === 'p') fight = true;
  }
  // последняя минута неуплаченной дани — тревожная музыка эльфов
  const dm = S.elves && S.elves.demand;
  if (dm && dm.deadline - S.time < 60 && dm.deadline > S.time) elf = true;
  if (elf) return 'elves';
  if (raid >= 3) return 'raid';
  for (const c of S.camps) {
    if (!c.alive || c.type === 'elf') continue;
    if (dist(c.x, c.y, p.x, p.y) < (typeof campRadius === 'function' ? campRadius(c) : 10) + 14 && (c.alertT > S.time || S.time - (c.lastHit || -99) < 15)) { camp = c; break; }
  }
  if (camp) return 'assault';
  if (fight || S.time - (p.lastHurt || -99) < 4) return 'combat';
  return typeof isNight === 'function' && isNight() ? 'night' : 'day';
}
// подобрать трек сцены, не повторяя только что игравший; мирным трекам — краска биома
function pickTrack(scene) {
  const list = TRACKS[scene];
  const lastName = MUS.last[scene];
  const cand = list.filter(t => t.name !== lastName);
  let tr = Object.assign({}, pick(cand.length ? cand : list));
  MUS.last[scene] = tr.name;
  tr.shift = 0;
  if (scene === 'day' || scene === 'night') {
    const gr = typeof groundAt === 'function' ? groundAt(Math.floor(S.player.x), Math.floor(S.player.y)) : -1;
    const bm = biomeMusic(gr);
    if (bm) { tr.mode = bm.mode; tr.shift = bm.shift; if (bm.lead) tr.lead = bm.lead; if (bm.pad) tr.pad = bm.pad; tr.biome = bm.name; }
    tr.bgr = gr;
  }
  tr.scene = scene;
  return tr;
}
function hz(tr, deg, oct) {
  const sc = MODES[tr.mode] || MODES.dorian, n = sc.length;
  const o = Math.floor(deg / n), d = ((deg % n) + n) % n;
  return ROOT * Math.pow(2, oct + o + (sc[d] + (tr.shift || 0)) / 12);
}
// мелодия на 4 такта по 8 долей: мотив, его вариация, ответ, мотив с каденцией на тонику аккорда
function makePhrase(tr, bars) {
  const dens = tr.dens || 0.5;
  const motif = [];
  let deg = Math.floor(Math.random() * 3) * 2;
  for (let i = 0; i < 8; i++) {
    if (i === 0 || Math.random() < dens * (i % 2 ? 0.7 : 1.2)) { deg = clamp(deg + pick([-2, -1, -1, 1, 1, 2, 0, 3, -3, 4]), -2, 9); motif.push({ d: deg, len: Math.random() < 0.3 ? 2 : 1 }); }
    else motif.push(null);
  }
  const vary = (m, k) => m.map((n, i) => n && Math.random() < k ? { d: clamp(n.d + pick([-1, 1, 2, -2]), -2, 10), len: n.len } : n && Object.assign({}, n));
  const answer = vary(motif.map(n => n && { d: n.d + 2, len: n.len }), 0.6);
  const end = vary(motif, 0.3); for (let i = 5; i < 8; i++) end[i] = null; end[4] = { d: bars[3] % 7, len: 3 };
  return [motif, vary(motif, 0.35), answer, end];
}
const on = (pat, i) => pat && pat[i] === 'x' ? 1 : pat && pat[i] === 'o' ? 0.45 : 0;

function musicTick() {
  if (!AC || AC.state !== 'running' || !S || !SOUND_ON || SETTINGS.music <= 0) { if (AC) MUS.next = AC.currentTime + 0.2; return; }
  // сцена должна продержаться немного, прежде чем музыка сменится (из боя в мир — дольше)
  const sc = musicScene();
  if (sc !== MUS.want) { MUS.want = sc; MUS.wantT = performance.now(); }
  const calm = MUS.scene && ['combat', 'raid', 'assault', 'elves'].includes(MUS.scene) && (sc === 'day' || sc === 'night');
  const hold = calm ? 9000 : MUS.scene ? 2500 : 0;
  const biomeChange = MUS.track && (sc === 'day' || sc === 'night') && sc === MUS.scene && typeof groundAt === 'function' && biomeMusic(groundAt(Math.floor(S.player.x), Math.floor(S.player.y))) !== biomeMusic(MUS.track.bgr) && performance.now() - (MUS.biomeT || 0) > 20000;
  if ((sc !== MUS.scene && performance.now() - MUS.wantT > hold) || !MUS.track || biomeChange || MUS.trackT > 150) {
    MUS.scene = sc; if (biomeChange) MUS.biomeT = performance.now();
    crossfadeTo(pickTrack(sc));
  }
  const tr = MUS.track, bus = MUS.buses[MUS.cur];
  const step = 60 / tr.bpm / 4; // шестнадцатая
  while (MUS.next < AC.currentTime + 0.35) {
    const t = MUS.next, bar = Math.floor(MUS.step / 16), s = MUS.step % 16;
    const prog = tr.prog, chord = prog[bar % prog.length];
    if (s === 0 && (bar % 4 === 0 || !MUS.phrase)) MUS.phrase = makePhrase(tr, [prog[bar % prog.length], prog[(bar + 1) % prog.length], prog[(bar + 2) % prog.length], prog[(bar + 3) % prog.length]]);
    const barDur = step * 16;
    // гармония: бас на сильные доли, подложка на весь такт
    if (s === 0) {
      if (tr.pad === 'drone') iDrone(bus, hz(tr, 0, -2), t, barDur * 1.05, 0.11);
      else if (tr.pad === 'choir') { iChoir(bus, hz(tr, chord, -1), t, barDur * 1.05, 0.09); iChoir(bus, hz(tr, chord + 2, -1), t, barDur * 1.05, 0.06); }
      else if (tr.pad === 'gurdy') iGurdy(bus, hz(tr, chord, -1), t, barDur, 0.05);
      if (tr.bass === 'bowed') iBowed(bus, hz(tr, chord, -1), t, barDur * 0.95, 0.16);
    }
    if (tr.bass === 'pluck' && (s === 0 || s === 8 || (s === 14 && Math.random() < 0.4))) iPluckBass(bus, hz(tr, s === 8 ? chord + 4 : chord, -1), t, step * 6, 0.13);
    // перебор лютни по аккорду в мирных треках
    if ((tr.scene === 'day') && tr.lead !== 'lute' && s % 4 === 2) iLute(bus, hz(tr, chord + (s === 6 ? 2 : 4), 0), t, step * 4, 0.04);
    // мелодия (восьмые)
    if (s % 2 === 0 && MUS.phrase) {
      const n = MUS.phrase[bar % 4][s / 2];
      if (n) {
        const f = hz(tr, chord + n.d, 0), dur = step * 2 * (n.len + 0.6);
        if (tr.lead === 'lute') iLute(bus, f, t, dur * 1.4, 0.1);
        else if (tr.lead === 'gurdy') iGurdy(bus, f, t, dur, 0.09);
        else if (tr.lead === 'bell') iBell(bus, f, t, dur, 0.07);
        else iChoir(bus, f, t, dur, 0.1);
      }
    }
    // ритм цеха
    let v;
    if ((v = on(tr.dr, s))) iDrum(bus, t, 0.42 * v);
    if ((v = on(tr.an, s))) iAnvil(bus, t, 0.22 * v);
    if ((v = on(tr.tk, s))) iTick(bus, t, 0.08 * v);
    if ((v = on(tr.sh, s))) iShaker(bus, t, 0.05 * v);
    if (tr.bellows && s === 0 && bar % 2 === 0) iBellows(bus, t, barDur * 0.9, 0.06);
    if (tr.drip && Math.random() < 0.05) iDrip(bus, t, 0.05);
    MUS.step++;
    MUS.next += step;
    MUS.trackT += step;
  }
}
