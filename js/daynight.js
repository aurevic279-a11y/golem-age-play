'use strict';
// День и ночь: сутки длятся 10 минут, ночь — около трети. Ночью темнеет, светятся печи, костры, фонари,
// руны големов и сам Анимансер; гоблины и орки ходят в набеги чаще.

const DAY = { len: 600, start: 0.08, maxDark: 0.66 };
// фаза суток 0..1: 0 — рассвет, 0.5 — вечер
function dayPhase() { return ((S.time / DAY.len + DAY.start) % 1 + 1) % 1; }
// темнота 0 (день) .. 1 (глубокая ночь)
function darkness() {
  const f = dayPhase();
  // закат длится около двух с половиной минут, рассвет — полторы: свет меняется плавно
  if (f < 0.42) return 0;
  if (f < 0.66) return smooth((f - 0.42) / 0.24);
  if (f < 0.85) return 1;
  return 1 - smooth((f - 0.85) / 0.15);
}
// тёплый оттенок: золотой час перед закатом и розовый рассвет (0..1)
function warmth() {
  const f = dayPhase();
  if (f > 0.34 && f < 0.62) return Math.sin((f - 0.34) / 0.28 * Math.PI);
  if (f > 0.86) return Math.sin((f - 0.86) / 0.14 * Math.PI) * 0.8;
  return 0;
}
function isNight() { return darkness() > 0.5; }
// сколько осталось до смены (для подсказки на часах)
function dayLabel() {
  const f = dayPhase();
  if (f < 0.42) return { icon: '☀', text: 'день, до заката ' + fmtTime((0.42 - f) * DAY.len) };
  if (f < 0.66) return { icon: '🌇', text: 'закат' };
  if (f < 0.85) return { icon: '🌙', text: 'ночь, до рассвета ' + fmtTime((0.85 - f) * DAY.len) };
  return { icon: '🌅', text: 'рассвет' };
}

// источники света: радиус в клетках и цвет
const LIGHT_BLD = {
  torch: [5.2, '255,170,70'], beacon: [3.5, '120,255,220'], bdrill: [2.4, '255,150,60'], steamengine: [3, '255,150,60'], assembler: [2.6, '140,210,255'],
  furnace: [3.6, '255,150,60'], efurnace: [3.6, '120,210,255'], forge: [3.6, '255,140,50'], kitchen: [3, '255,170,80'], kiln: [3.2, '255,130,50'],
  alchemy: [3, '140,255,170'], scriptorium: [2.6, '255,210,140'], house: [2.8, '255,200,120'], barracks: [2.4, '255,190,110'],
  watchtower: [5, '255,210,120'], firetower: [4.2, '255,140,40'], archer: [2, '255,200,120'], altar: [3, '200,140,255'], nest: [2.5, '150,240,255'],
};
const LIGHT_ALWAYS = new Set(['beacon', 'torch', 'scriptorium', 'house', 'barracks', 'watchtower', 'archer', 'altar', 'nest', 'firetower']);
const LIGHT_CAMP = { bonfire: [5, '255,150,50'], watchtower: [3, '255,170,80'], keep: [3.5, '255,170,80'], warhall: [3, '255,170,80'], totem: [2.5, '160,255,140'], gtotem: [2, '255,170,80'], portal: [5, '190,120,255'] };

// Ночь рисуется в уменьшенный вчетверо холст (свет мягкий — разницы не видно) готовыми «пятнами» света:
// никаких градиентов на каждый огонь в каждом кадре. Тёплый отсвет — отдельный маленький холст, одним проходом.
let NIGHT_CV = null, GLOW_CV = null;
const NIGHT_Q = 0.25, LIGHT_BLOB = {};
function lightBlob(col) {
  const key = col || 'hole';
  if (LIGHT_BLOB[key]) return LIGHT_BLOB[key];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (col) { gr.addColorStop(0, `rgba(${col},0.55)`); gr.addColorStop(0.8, `rgba(${col},0.08)`); gr.addColorStop(1, `rgba(${col},0)`); }
  else { gr.addColorStop(0, 'rgba(0,0,0,0.78)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); }
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (LIGHT_BLOB[key] = c);
}
function drawNight() {
  const under = inDungeonY(S.player.y);
  const dk = under ? 1 : darkness(), wm = under ? 0 : warmth();
  // золотой час и рассвет: мягкий тёплый свет поверх мира
  if (wm > 0.01) {
    const f = dayPhase(), dawn = f > 0.8;
    // простое наложение цвета (soft-light по всему экрану заметно дороже для видеокарты)
    G.save();
    G.fillStyle = dawn ? `rgba(255,140,170,${(wm * 0.12).toFixed(3)})` : `rgba(255,150,50,${(wm * 0.14).toFixed(3)})`;
    G.fillRect(0, 0, CV.width, CV.height);
    G.restore();
  }
  if (dk <= 0.01) return;
  const W = CV.width, H = CV.height, z = VIEW.z;
  const w = Math.ceil(W * NIGHT_Q), h = Math.ceil(H * NIGHT_Q);
  if (!NIGHT_CV) { NIGHT_CV = document.createElement('canvas'); GLOW_CV = document.createElement('canvas'); }
  if (NIGHT_CV.width !== w || NIGHT_CV.height !== h) { NIGHT_CV.width = GLOW_CV.width = w; NIGHT_CV.height = GLOW_CV.height = h; }
  const g = NIGHT_CV.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  const f = dayPhase(), dusk = f > 0.42 && f < 0.7 ? Math.max(0, 1 - Math.abs(f - 0.56) / 0.12) : 0;
  g.fillStyle = under ? 'rgba(6,5,8,0.9)' : `rgba(${Math.round(14 + dusk * 40)},${Math.round(18 + dusk * 6)},${Math.round(46 - dusk * 20)},${(dk * DAY.maxDark).toFixed(3)})`;
  g.fillRect(0, 0, w, h);
  // собираем огни на экране
  const lights = [];
  const add = (x, y, r, col, flick) => {
    const X = sx(x), Y = sy(y), R = r * z * (flick ? 1 + Math.sin(S.time * 9 + x * 3 + y) * 0.04 + Math.sin(S.time * 23 + x) * 0.02 : 1);
    if (X + R < 0 || Y + R < 0 || X - R > W || Y - R > H) return;
    lights.push([X, Y, R, col]);
  };
  const p = S.player;
  if (p.dead <= 0) add(p.x, p.y - 0.4, under ? 6.5 : 4.2, '255,230,180', true);
  if (under) for (const b of bldType('cave_exit')) add(b.x + 1, b.y + 1, 4, '120,255,220', true);
  else for (const b of bldType('cave_entrance')) if (!b.done) add(b.x + 1.5, b.y + 1.6, 3.5, '120,255,220', true);
  if (typeof mpOtherHeroes === 'function') for (const h of mpOtherHeroes()) if (!(h.dead > 0)) add(h.x, h.y - 0.4, 4, '255,230,180', true);
  for (const gm of S.golems) if (!gm.hidden && gm.fuel > 0) add(gm.x, gm.y - 0.55, 1.4, '255,170,60', true);
  for (const type in LIGHT_BLD) {
    const L = LIGHT_BLD[type], always = LIGHT_ALWAYS.has(type);
    for (const b of bldType(type)) {
      if (!always && !b.active) continue;
      if (b.x < VIEW.x0 - 8 || b.x > VIEW.x1 + 8 || b.y < VIEW.y0 - 8 || b.y > VIEW.y1 + 8) continue;
      add(b.x + b.w / 2, b.y + b.h * 0.7, L[0], L[1], true);
    }
  }
  // всё, что жжёт топливо, светит всегда, пока огонь не погас (и в простое): печи, генераторы, манипуляторы-големы;
  // машины на энергии (мастерские и т. п.) — когда работают
  const inV = (b) => !(b.x < VIEW.x0 - 6 || b.x > VIEW.x1 + 6 || b.y < VIEW.y0 - 6 || b.y > VIEW.y1 + 6);
  const lit = (b, d) => b.burn > 0 || (b.fuel && b.fuel.n > 0);
  for (const k of ['machine', 'gen', 'lab']) for (const b of bldKind(k)) {
    if (!inV(b)) continue;
    const d = BUILDINGS[b.type];
    const on = d.fuel ? lit(b, d) : k !== 'gen' && b.active;
    if (!on || LIGHT_BLD[b.type] && (b.active || LIGHT_ALWAYS.has(b.type))) continue; // уже светит своим светом
    const L = LIGHT_BLD[b.type];
    add(b.x + b.w / 2, b.y + b.h * 0.7, L ? L[0] * 0.8 : 1.6 + b.w * 0.6, L ? L[1] : d.fuel ? '255,160,70' : '255,205,140', true);
  }
  for (const b of bldKind('vector')) if (!BUILDINGS[b.type].power && b.fuel > 0 && inV(b)) add(b.x + 0.5, b.y + 0.5, 1.5, '255,170,70', true);
  for (const c of S.camps) {
    if (!c.alive || c.x < VIEW.x0 - 10 || c.x > VIEW.x1 + 10 || c.y < VIEW.y0 - 10 || c.y > VIEW.y1 + 10) continue;
    for (const s of c.structs) { const L = LIGHT_CAMP[s.kind]; if (L && s.hp > 0) add(structCX(s), structCY(s), L[0], L[1], true); }
  }
  for (const o of S.projs) if (o.kind === 'fire' || o.kind === 'arcane' || o.kind === 'magic') add(o.x, o.y, 1.3, o.kind === 'fire' ? '255,150,50' : '200,140,255');
  // вырезаем темноту вокруг огней
  g.globalCompositeOperation = 'destination-out';
  const hole = lightBlob(null), q = NIGHT_Q;
  for (const [X, Y, R] of lights) g.drawImage(hole, (X - R) * q, (Y - R) * q, R * 2 * q, R * 2 * q);
  G.save(); G.imageSmoothingEnabled = true;
  G.drawImage(NIGHT_CV, 0, 0, W, H);
  // тёплый отсвет огней: копим в маленьком холсте и кладём поверх одним проходом
  if (lights.length) {
    const gg = GLOW_CV.getContext('2d');
    gg.globalCompositeOperation = 'source-over'; gg.clearRect(0, 0, w, h);
    gg.globalCompositeOperation = 'lighter'; gg.globalAlpha = Math.min(1, dk);
    for (const [X, Y, R, col] of lights) { const r = R * 0.8; gg.drawImage(lightBlob(col), (X - r) * q, (Y - r) * q, r * 2 * q, r * 2 * q); }
    gg.globalAlpha = 1;
    G.globalCompositeOperation = 'lighter'; G.globalAlpha = 0.45;
    G.drawImage(GLOW_CV, 0, 0, W, H);
  }
  G.restore();
}

// раз в секунду: предупреждаем о наступлении ночи и рассвете
function dayNightTick() {
  const n = isNight();
  if (S.wasNight === undefined) { S.wasNight = n; return; }
  if (n && !S.wasNight) { log('Наступает ночь — гоблины и орки ходят в набеги чаще. Свет у построек отпугивает темноту, держите оборону.', 'warn'); sfx('alarm'); }
  else if (!n && S.wasNight) log('Рассвет. Ночь пережита.', 'good');
  S.wasNight = n;
}
