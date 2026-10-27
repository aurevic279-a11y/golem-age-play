'use strict';
// Графика: тени, переходы почвы, детальные машины (двойное разрешение),
// дым, отблески топок и вращающиеся шестерни. Всё рисуется кодом поверх спрайтов из sprites.js.

const BSCALE = 2; // постройки рисуются в двойном разрешении: 32 пикселя на клетку

// силуэт картинки одним цветом (без чтения пикселей — работает и с картинками из assets/ при file://)
function silhouette(src, color, w, h) {
  w = w || src.width; h = h || src.height;
  return mk(w, h, g => {
    g.drawImage(src, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, w, h);
  });
}

// ---------------- детальные постройки ----------------
// мета-данные для анимации: координаты в долях постройки
const GFX_META = {
  furnace:     { chimney: [0.77, 0.05], glow: [0.31, 0.5, 0.38, 0.31] },
  efurnace:    { glow: [0.31, 0.5, 0.38, 0.31], glowColor: '120,220,255', sparks: '#9fe8ff' },
  forge:       { chimney: [0.84, 0.02], glow: [0.13, 0.5, 0.31, 0.31] },
  kitchen:     { chimney: [0.81, 0.02], glow: [0.41, 0.81, 0.19, 0.1] },
  alchemy:     { chimney: [0.84, 0.18], glow: [0.19, 0.69, 0.31, 0.19], glowColor: '120,255,140' },
  workshop:    { gears: [[0.656, 0.594, 5 / 32]] },
  mill:        { stone: [0.5, 0.656, 7 / 32] },
  mine:        { gears: [[0.5, 0.219, 4 / 32]], exhaust: [0.88, 0.45] },
  deepdrill:   { gears: [[0.5, 0.5, 7 / 32]] },
  treadwheel:  { wheel: [0.5, 0.44, 10 / 32] },
  watermill:   { wheel: [0.19, 0.56, 6 / 32] },
  stonecutter: { saw: [0.62, 0.47] },
  shaft:       { gears: [[0.5, 0.5, 4 / 16]] },
  scriptorium: { windows: [[0.16, 0.47, 0.16, 0.16], [0.69, 0.47, 0.16, 0.16]] },
  house:       { windows: [[0.19, 0.47, 0.16, 0.16], [0.66, 0.47, 0.16, 0.16]] },
};

// мелкие детали в двойном разрешении поверх увеличенного спрайта
const BDETAIL = {
  furnace(g) { // железные скобы и решётка топки
    px(g, 18, 30, 28, 2, '#3a3632'); px(g, 18, 30, 2, 22, '#3a3632'); px(g, 44, 30, 2, 22, '#3a3632');
    for (let x = 22; x < 44; x += 5) px(g, x, 46, 2, 6, '#4a4038');
    px(g, 44, 0, 10, 2, '#7a756b'); rivets(g, [[8, 12], [56, 12], [8, 54], [56, 54]]);
  },
  efurnace(g) { BDETAIL.furnace(g); px(g, 24, 36, 16, 2, '#cff6ff'); },
  workshop(g) { // окно и верстак
    px(g, 30, 24, 8, 8, '#2a1a10'); px(g, 31, 25, 6, 6, '#ffd890'); px(g, 33, 25, 2, 6, '#8a5a2b'); px(g, 31, 27, 6, 2, '#8a5a2b');
    px(g, 6, 54, 22, 3, '#6a4a2a'); rivets(g, [[6, 22], [58, 22]]);
  },
  forge(g) { // наковальня и мехи
    px(g, 38, 38, 16, 4, '#2a2e36'); px(g, 42, 42, 8, 6, '#3a4250'); px(g, 36, 36, 4, 3, '#5a6270');
    px(g, 6, 52, 10, 4, '#8a5a2b'); px(g, 8, 50, 6, 2, '#a07040');
  },
  mill(g) { rivets(g, [[8, 24], [56, 24], [8, 56], [56, 56]]); px(g, 30, 22, 4, 6, '#5a4030'); },
  stonecutter(g) { px(g, 14, 44, 18, 2, '#9a9284'); px(g, 14, 40, 18, 1, '#d8d0c0'); rivets(g, [[6, 24], [58, 24]]); },
  scriptorium(g) { px(g, 26, 38, 12, 2, '#5a3a1a'); px(g, 30, 8, 4, 4, '#ffe8a0'); },
  alchemy(g) { px(g, 44, 40, 10, 2, '#8ad0e0'); px(g, 20, 18, 8, 2, '#ffe080'); },
  mine(g) { px(g, 22, 40, 20, 2, '#3a2a1a'); for (let y = 44; y < 62; y += 4) px(g, 24, y, 16, 1, '#5e3a18'); px(g, 30, 44, 4, 18, '#3a2a1a'); },
  nursery(g) { px(g, 2, 2, 60, 1, '#a87a4a'); },
  chest(g) { rivets(g, [[6, 10], [24, 10], [6, 26], [24, 26]]); },
  treadwheel(g) { px(g, 4, 50, 56, 2, '#8a6a50'); },
  barracks(g) { rivets(g, [[8, 20], [56, 20]]); },
  archer(g) { px(g, 12, 18, 8, 1, '#3a2a1a'); },
};
function rivets(g, pts) { for (const [x, y] of pts) { px(g, x, y, 2, 2, '#c8b890'); px(g, x + 1, y + 1, 1, 1, '#4a3a2a'); } }

// увеличиваем спрайт вдвое и добавляем объём: контур, блик сверху-слева, затенение снизу-справа
function detailSprite(base, id) {
  const W2 = base.width * BSCALE, H2 = base.height * BSCALE;
  const big = mk(W2, H2, g => { g.imageSmoothingEnabled = false; g.drawImage(base, 0, 0, W2, H2); });
  const sil = silhouette(big, '#000');
  const edge = (dx, dy, col) => mk(W2, H2, g => {
    g.drawImage(silhouette(big, col), 0, 0);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(sil, dx, dy);
  });
  const light = edge(1, 1, 'rgba(255,240,210,0.30)');
  const dark = edge(-1, -1, 'rgba(0,0,0,0.35)');
  return mk(W2, H2, g => {
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.75;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.drawImage(sil, dx, dy);
    g.globalAlpha = 1;
    g.drawImage(big, 0, 0);
    g.drawImage(light, 0, 0);
    g.drawImage(dark, 0, 0);
    if (BDETAIL[id]) BDETAIL[id](g, W2, H2);
  });
}

function upgradeBuildingSprites() {
  SPR.bShadow = {};
  for (const id in BUILDINGS) {
    const d = BUILDINGS[id];
    if (d.kind === 'belt' || d.kind === 'mgolem' || !SPR.b[id]) continue;
    if (d.kind === 'vector') {
      const c = detailSprite(SPR.b[id][0], id);
      SPR.b[id] = [0, 1, 2, 3].map(dd => rotCanvas(c, dd));
      SPR.bShadow[id] = SPR.b[id].map(s => silhouette(s, 'rgba(0,0,0,0.36)'));
    } else {
      SPR.b[id] = detailSprite(SPR.b[id], id);
      SPR.bShadow[id] = silhouette(SPR.b[id], 'rgba(0,0,0,0.36)');
    }
  }
  // постройки лагерей
  SPR.campShadow = {};
  for (const k in SPR.camp) {
    if (k !== 'portal') SPR.camp[k] = detailSprite(SPR.camp[k], 'camp_' + k);
    SPR.campShadow[k] = silhouette(SPR.camp[k], 'rgba(0,0,0,0.3)');
  }
  // шестерня для вращения (рисуется крупно и масштабируется)
  SPR.gearRot = mk(32, 32, g => gearPix(g, 16, 16, 12, 8, '#c8a050', '#5e3a18', 0));
  SPR.gearRotIron = mk(32, 32, g => gearPix(g, 16, 16, 12, 8, '#9aa6b8', '#3a4250', 0));
  SPR.millstone = mk(32, 32, g => { circle(g, 16, 16, 14, '#8a867e'); circle(g, 16, 16, 12, '#a8a49c'); px(g, 15, 3, 2, 10, '#6a665e'); circle(g, 16, 16, 3, '#5a564e'); });
  SPR.wheelRot = mk(48, 48, g => {
    for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4; for (let r = 3; r < 22; r++) px(g, 24 + Math.cos(an) * r | 0, 24 + Math.sin(an) * r | 0, 2, 2, '#9a6a3a'); }
    for (let a = 0; a < 48; a++) { const an = a / 48 * Math.PI * 2; px(g, 24 + Math.cos(an) * 22 | 0, 24 + Math.sin(an) * 22 | 0, 2, 2, '#6a4220'); }
    circle(g, 24, 24, 3, '#3a2a1a');
  });
  // тени юнитов и героя — овал под ногами
  SPR.unitShadow = mk(32, 16, g => { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(16, 8, 15, 7, 0, 0, 7); g.fill(); });
}

function initGfx() {
  upgradeBuildingSprites();
}

// ---------------- рисование в мире ----------------
// тень постройки: силуэт, сдвинутый вправо-вниз (солнце слева сверху)
function drawBuildingShadow(b) {
  const def = BUILDINGS[b.type];
  if (def.kind === 'wall') return;
  // у объёмных спрайтов тень уже нарисована фотостудией
  if (typeof SPRITES3D !== 'undefined' && propDef('build', def.kind === 'vector' ? b.type + '_' + b.dir : b.type) && S3D.ready) return;
  const sh = SPR.bShadow && SPR.bShadow[b.type];
  if (!sh) return;
  const img = def.kind === 'vector' ? sh[b.dir] : sh;
  const k = def.kind === 'wall' ? 0.14 : def.kind === 'tower' || def.wind ? 0.4 : 0.26;
  // косая тень: верх силуэта смещён вправо сильнее низа
  const X = sx(b.x), Y = sy(b.y), Wd = sx(b.x + b.w) - X, Ht = sy(b.y + b.h) - Y;
  G.save();
  G.translate(X + VIEW.z * k * 0.35, Y + Ht + VIEW.z * k * 0.25);
  G.transform(1, 0, -k * 1.4 * VIEW.z / Math.max(1, Ht) * b.h, 1, 0, 0);
  G.drawImage(img, 0, -Ht, Wd, Ht);
  G.restore();
}

function drawUnitShadow(x, y, size) {
  if (!SPR.unitShadow) return;
  drawSprite(SPR.unitShadow, x - size * 0.32 + 0.06, y - size * 0.1, size * 0.64, size * 0.24);
}

// вращающаяся картинка с центром в (fx, fy) долей постройки
function drawRotating(img, b, fx, fy, rTiles, ang) {
  const X = sx(b.x + b.w * fx), Y = sy(b.y + b.h * fy), s = rTiles * 2 * VIEW.z * 1.12;
  G.save(); G.translate(X, Y); G.rotate(ang); G.drawImage(img, -s / 2, -s / 2, s, s); G.restore();
}

// анимация постройки: шестерни, колёса, отблеск огня, свет в окнах, дым
function drawBuildingFx(b, t) {
  const def = BUILDINGS[b.type], m = GFX_META[b.type];
  if (!m || (SPR.b[b.type] && SPR.b[b.type]._asset)) return;
  let on = b.active === true;
  if (def.kind === 'gen') on = (b.pot || 0) > 0 && (b.load || 0) > 0;
  if (def.kind === 'shaft') on = b.net >= 0 && NETS[b.net] && NETS[b.net].supply > 0;
  const spin = on ? t * (def.kind === 'shaft' ? 3 : 2) : 0;
  if (m.gears) for (const [fx, fy, r] of m.gears) drawRotating(def.kind === 'shaft' || b.type === 'workshop' || b.type === 'mine' ? SPR.gearRot : SPR.gearRotIron, b, fx, fy, r * (def.kind === 'shaft' ? 1 : b.w), spin + (b.x + b.y) * 0.4);
  if (m.stone) drawRotating(SPR.millstone, b, m.stone[0], m.stone[1], m.stone[2] * b.w, spin * 0.7);
  if (m.wheel) drawRotating(SPR.wheelRot, b, m.wheel[0], m.wheel[1], m.wheel[2] * b.w * 1.05, spin * 0.8);
  if (m.saw && on) {
    const X = sx(b.x + b.w * m.saw[0]), Y = sy(b.y + b.h * m.saw[1]) + Math.sin(t * 20) * VIEW.z * 0.06;
    G.fillStyle = '#c8d0d8'; G.fillRect(X - VIEW.z * 0.25, Y, VIEW.z * 0.5, Math.max(1, VIEW.z * 0.06));
    if (Math.random() < 0.2) FX.push({ x: b.x + b.w * m.saw[0], y: b.y + b.h * 0.7, vx: rand(-1, 1), vy: rand(-1.5, -0.5), life: 0.4, c: '#d8d0c0', s: 0.06 });
  }
  if (m.glow && on) {
    // мерцающий отблеск в топке
    const [fx, fy, fw, fh] = m.glow, fl = 0.55 + Math.sin(t * 13 + b.id) * 0.15 + Math.sin(t * 7.3) * 0.1;
    G.save(); G.globalCompositeOperation = 'lighter';
    G.fillStyle = `rgba(${m.glowColor || '255,140,40'},${fl.toFixed(2)})`;
    G.fillRect(sx(b.x + b.w * fx), sy(b.y + b.h * fy), VIEW.z * b.w * fw, VIEW.z * b.h * fh);
    const R = VIEW.z * b.w * 0.6, cx = sx(b.x + b.w * (fx + fw / 2)), cy = sy(b.y + b.h * (fy + fh));
    const grd = G.createRadialGradient(cx, cy, 0, cx, cy, R);
    grd.addColorStop(0, `rgba(${m.glowColor || '255,140,40'},${(fl * 0.35).toFixed(2)})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    G.fillStyle = grd; G.fillRect(cx - R, cy - R, R * 2, R * 2);
    G.restore();
    if (m.sparks && Math.random() < 0.1) FX.push({ x: b.x + b.w * (fx + fw / 2), y: b.y + b.h * fy, vx: rand(-0.4, 0.4), vy: -1, life: 0.6, c: m.sparks, s: 0.07 });
  }
  if (m.windows && (on || b.type === 'house')) {
    G.save(); G.globalCompositeOperation = 'lighter';
    G.fillStyle = 'rgba(255,200,90,0.25)';
    for (const [fx, fy, fw, fh] of m.windows) G.fillRect(sx(b.x + b.w * fx), sy(b.y + b.h * fy), VIEW.z * b.w * fw, VIEW.z * b.h * fh);
    G.restore();
  }
  // дым из трубы — только когда горит топливо
  const burning = on && (def.fuel ? (b.burn > 0 || def.kind === 'gen') : false) && !(def.powerOrFuel && b.powerSat > 0);
  const chim = m.chimney || (burning && m.exhaust);
  if (chim && burning && Math.random() < 0.25) spawnSmoke(b.x + b.w * chim[0], b.y + b.h * chim[1], def.pollution > 0.06 ? 0.55 : 0.4);
}

// клуб дыма: растёт, светлеет и сносится ветром
function spawnSmoke(x, y, a) {
  FX.push({ smoke: true, x: x + rand(-0.05, 0.05), y, vx: rand(-0.1, 0.1) + (typeof WIND !== 'undefined' ? WIND * 0.35 : 0.1), vy: rand(-0.7, -0.45),
    life: rand(2.2, 3), life0: 2.6, s: 0.12, a: a || 0.45, c: Math.random() < 0.5 ? '120,116,110' : '150,146,140' });
}

function drawFxParticle(f, z) {
  if (f.beam) {
    // рунный луч обелиска
    const k = clamp(f.life / f.life0, 0, 1);
    G.save(); G.globalCompositeOperation = 'lighter'; G.lineCap = 'round';
    G.strokeStyle = `rgba(90,255,200,${(k * 0.5).toFixed(2)})`; G.lineWidth = Math.max(3, z * 0.22 * k);
    G.beginPath(); G.moveTo(sx(f.x), sy(f.y)); G.lineTo(sx(f.x2), sy(f.y2)); G.stroke();
    G.strokeStyle = `rgba(230,255,250,${k.toFixed(2)})`; G.lineWidth = Math.max(1, z * 0.06 * k); G.stroke();
    G.restore();
    return;
  }
  if (f.ring) {
    const k = 1 - clamp(f.life / f.life0, 0, 1);
    G.strokeStyle = `rgba(${f.c},${(1 - k) * 0.8})`; G.lineWidth = Math.max(1.5, z * 0.12 * (1 - k));
    G.beginPath(); G.ellipse(sx(f.x), sy(f.y), z * f.r * (0.2 + k * 0.8), z * f.r * (0.2 + k * 0.8) * 0.55, 0, 0, 7); G.stroke();
    return;
  }
  if (f.smoke) {
    const k = clamp(f.life / f.life0, 0, 1), r = (f.s + (1 - k) * 0.45) * z;
    G.fillStyle = `rgba(${f.c},${(f.a * k).toFixed(3)})`;
    G.beginPath(); G.arc(sx(f.x), sy(f.y), Math.max(1, r), 0, 7); G.fill();
    return;
  }
  G.globalAlpha = clamp(f.life * 2, 0, 1); G.fillStyle = f.c;
  const s = Math.max(1, f.s * z); G.fillRect(sx(f.x) - s / 2, sy(f.y) - s / 2, s, s);
  G.globalAlpha = 1;
}
