'use strict';
// Спрайты из 3D-моделей (assets/sprites, описание — SPRITES3D в assets/sprites/sprites.js).
// Одна камера и свет для всех: 64 пикселя атласа = 1 клетка. Картинки грузятся через Image(),
// поэтому игра работает и при запуске двойным кликом (file://).

const S3D = { img: {}, ready: false, left: 0 };

// кто каким атласом рисуется
const UNIT3D = {
  player: 'u_player', goblin: 'u_goblin', goblin_archer: 'u_goblin_archer',
  orc_brute: 'u_orc_brute', orc_thrower: 'u_orc_thrower', orc_shaman: 'u_orc_shaman',
  elf_blade: 'u_elf_blade', elf_mage: 'u_elf_mage', elf_lord: 'u_elf_lord',
  merchant: 'u_merchant', merchant_foe: 'u_merchant', envoy: 'u_envoy', lumber: 'u_lumber', miner: 'u_miner', fueler: 'u_fueler', porter: 'u_porter', farmer: 'u_farmer', golem: 'u_golem', garcher: 'u_garcher',
  goblin_chief: 'u_goblin', orc_berserk: 'u_orc_brute', cave_troll: 'u_orc_brute',
};
// анимация атаки врагов
const ENEMY_ATK = { cave_troll: 'swing', goblin_chief: 'swing', orc_berserk: 'swing', goblin: 'swing', goblin_archer: 'shoot', orc_brute: 'swing', orc_thrower: 'shoot', orc_shaman: 'shoot', elf_blade: 'swing', elf_mage: 'shoot', elf_lord: 'swing' };
// оружие Анимансера -> анимация атаки
const PLAYER_ATK = { staff: 'swing', sling: 'shoot', crossbow: 'shoot', pcrossbow: 'shoot', flamer: 'cast', quake_staff: 'cast',
  bow: 'shoot', repeater: 'shoot', handcannon: 'shoot', spear: 'swing', sword_bronze: 'swing', sword_steel: 'swing', warhammer: 'swing', mithril_blade: 'swing' };
// длительность атаки по виду оружия (с) — растягиваем на неё разовую анимацию
const ATK_ANIM = {
  staff: 0.32, sling: 0.55, crossbow: 0.4, pcrossbow: 0.18, flamer: 0.14, quake_staff: 0.6,
  bow: 0.45, repeater: 0.22, handcannon: 0.7, spear: 0.4, sword_bronze: 0.32, sword_steel: 0.3, warhammer: 0.6, mithril_blade: 0.26,
  cave_troll: 0.6, goblin_chief: 0.32, orc_berserk: 0.4, goblin: 0.3, goblin_archer: 0.5, orc_brute: 0.55, orc_thrower: 0.45, orc_shaman: 0.6, elf_blade: 0.35, elf_mage: 0.7, elf_lord: 0.7,
};

function loadSprites3D() {
  if (typeof SPRITES3D === 'undefined') { console.warn('нет assets/sprites/sprites.js'); return; }
  const files = new Set();
  for (const k in SPRITES3D.units) files.add(SPRITES3D.units[k].file);
  for (const k in SPRITES3D.sets) files.add(SPRITES3D.sets[k].file);
  S3D.left = files.size;
  for (const f of files) {
    const img = new Image();
    img.onload = () => { S3D.img[f] = img; if (--S3D.left <= 0) s3dDone(); };
    img.onerror = () => { console.warn('нет картинки', f); if (--S3D.left <= 0) s3dDone(); };
    img.src = verUrl(f);
  }
}
function s3dDone() {
  S3D.ready = true;
  if (!SPRITES3D.units.u_farmer) UNIT3D.farmer = 'u_lumber';
  genBuildingItemSprites();
  try { genNatureVariants(); } catch (e) { console.error('варианты природы:', e); }
  if (typeof UI !== 'undefined') UI.dirty = true;
  // перерисовать кэш земли уже с травинками и цветами
  if (typeof W !== 'undefined') for (const c of W.values()) if (c.canvas) { c.oldCanvas = c.canvas; c.canvas = null; }
}

// экранный угол (0 — вправо, вниз положительно) -> направление 0..7
function dir8(a) { return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; }

// номер кадра: k — доля разовой анимации (0..1), иначе по времени t (с)
function animFrame(a, t, k) {
  if (k != null) return Math.min(a.n - 1, Math.max(0, Math.floor(k * a.n)));
  const i = Math.floor(t * 1000 / (a.dur / a.n));
  if (a.type === 'play_once') return Math.min(a.n - 1, i);
  return ((i % a.n) + a.n) % a.n;
}

// персонаж. o: { ang, anim, t, k, alpha, flash, scale }
function drawUnit3D(kind, wx, wy, o) {
  const u = SPRITES3D.units[UNIT3D[kind] || kind];
  if (!u) return false;
  const img = S3D.img[u.file];
  if (!img) return false;
  const a = u.anims[o.anim] || u.anims.stance;
  const fr = a.f[dir8(o.ang || 0)][animFrame(a, o.t || 0, o.k)];
  const s = VIEW.z * (o.scale || 1) / u.ppt;
  const [fx, fy, fw, fh, ox, oy] = fr;
  const X = sx(wx) - ox * s, Y = sy(wy) - oy * s;
  G.save();
  G.imageSmoothingEnabled = true;
  if (o.alpha != null) G.globalAlpha = o.alpha;
  if (o.tint) G.drawImage(tintedFrame(img, fx, fy, fw, fh, [o.tint]), X, Y, fw * s, fh * s); // перекраска (горожане в катсцене)
  else G.drawImage(img, fx, fy, fw, fh, X, Y, fw * s, fh * s);
  if (o.flash) {
    G.globalCompositeOperation = 'lighter';
    G.globalAlpha = 0.5 * (o.alpha == null ? 1 : o.alpha);
    G.drawImage(img, fx, fy, fw, fh, X, Y, fw * s, fh * s);
  }
  G.restore();
  return true;
}

// герой: оружие в руке (по точке кисти из фотостудии) и оттенок брони
const HERO_WEAPON = { sling: 'w_sling', crossbow: 'w_crossbow', pcrossbow: 'w_pcrossbow', flamer: 'w_flamer', repeater: 'w_crossbow' };
// оружие без запечённой модели — рисуем кодом: холст 64×32 (64 px = клетка), рукоять в точке (12, 16), остриё вправо
const WEAPON_ART = {};
function weaponArt(id) {
  if (WEAPON_ART[id] !== undefined) return WEAPON_ART[id];
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  const blade = (len, wd, col, edge) => {
    g.fillStyle = lin(g, 0, 16 - wd, 0, 16 + wd, [[0, shade(col, 0.45)], [0.5, col], [1, shade(col, -0.35)]]);
    g.beginPath(); g.moveTo(16, 16 - wd); g.lineTo(16 + len - wd * 2, 16 - wd); g.lineTo(16 + len, 16); g.lineTo(16 + len - wd * 2, 16 + wd); g.lineTo(16, 16 + wd); g.closePath(); g.fill();
    g.strokeStyle = edge; g.lineWidth = 1; g.stroke();
  };
  const grip = (col, guard) => { g.fillStyle = col; g.fillRect(4, 14, 12, 4); g.fillStyle = guard; g.fillRect(14, 9, 4, 14); g.fillRect(2, 13, 3, 6); };
  switch (id) {
    case 'sword_bronze': blade(34, 3.5, '#c8a050', '#6a4a18'); grip('#5a3a20', '#a07a30'); break;
    case 'sword_steel': blade(40, 3.5, '#c8d0dc', '#4a5260'); grip('#4a3020', '#8a96a8'); break;
    case 'mithril_blade': blade(44, 4, '#bff4ff', '#3a8ab0'); grip('#3a2a5a', '#e8b84a');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(120,230,255,0.35)'; g.fillRect(18, 14, 36, 4); break;
    case 'spear': g.fillStyle = '#8a6a3a'; g.fillRect(0, 14.5, 50, 3); g.save(); g.translate(34, 0); blade(14, 4, '#c8d0d8', '#4a5260'); g.restore(); break;
    case 'warhammer': g.fillStyle = '#6a4a2a'; g.fillRect(2, 14, 38, 4);
      g.fillStyle = lin(g, 0, 4, 0, 28, [[0, '#c8d0dc'], [0.5, '#8a96a8'], [1, '#4a5260']]); g.fillRect(36, 4, 14, 24); g.strokeStyle = '#2a2e38'; g.strokeRect(36.5, 4.5, 13, 23); break;
    case 'bow': g.strokeStyle = '#8a5a2a'; g.lineWidth = 3; g.beginPath(); g.arc(4, 16, 14, -1.25, 1.25); g.stroke();
      g.strokeStyle = '#e8e0c8'; g.lineWidth = 1; g.beginPath(); g.moveTo(8.5, 2.6); g.lineTo(8.5, 29.4); g.stroke(); break;
    case 'handcannon': g.fillStyle = lin(g, 0, 9, 0, 23, [[0, '#8a909c'], [0.5, '#4a4e58'], [1, '#22252c']]); g.fillRect(8, 10, 40, 12);
      g.fillStyle = '#c8a050'; g.fillRect(44, 8, 6, 16); g.fillRect(8, 9, 4, 14); g.fillStyle = '#6a4a2a'; g.fillRect(2, 14, 10, 5); break;
    default: WEAPON_ART[id] = null; return null;
  }
  WEAPON_ART[id] = c;
  return c;
}
const ARMOR_TINT = { armor_leather: 'rgba(120,72,30,0.3)', armor_steel: 'rgba(120,140,170,0.32)', armor_exo: 'rgba(235,180,50,0.38)' };
// гость: плащ перекрашен в багряный (смена оттенка с сохранением светотени модели)
const GUEST_TINT = 'hue:#c8282a';
// перекрашенные кадры героя кэшируем: раньше кадр перекрашивался в холсте каждый кадр
const TINT_CACHE = new Map();
function tintedFrame(img, fx, fy, fw, fh, tints) {
  const k = tints.join('|') + '|' + fx + ',' + fy;
  let c = TINT_CACHE.get(k);
  if (c) return c;
  if (TINT_CACHE.size > 600) TINT_CACHE.clear();
  c = document.createElement('canvas'); c.width = fw; c.height = fh;
  const g = c.getContext('2d');
  g.drawImage(img, fx, fy, fw, fh, 0, 0, fw, fh);
  for (const t of tints) {
    if (t.startsWith('hue:')) {
      // смена оттенка: заливка режимом «hue», затем обрезка по силуэту кадра
      g.globalCompositeOperation = 'hue'; g.fillStyle = t.slice(4); g.fillRect(0, 0, fw, fh);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(img, fx, fy, fw, fh, 0, 0, fw, fh);
    } else { g.globalCompositeOperation = 'source-atop'; g.fillStyle = t; g.fillRect(0, 0, fw, fh); }
  }
  TINT_CACHE.set(k, c);
  return c;
}
function drawHero(p, o) {
  const art = !HERO_WEAPON[p.weapon] && p.weapon ? weaponArt(p.weapon) : null;
  const wkey = (HERO_WEAPON[p.weapon] || art) && SPRITES3D.units.u_player_bare ? HERO_WEAPON[p.weapon] || 'art' : null;
  const u = SPRITES3D.units[wkey ? 'u_player_bare' : 'u_player'];
  const img = u && S3D.img[u.file];
  if (!img) return drawUnit3D('player', p.x, p.y, o);
  const a = u.anims[o.anim] || u.anims.stance, d = dir8(o.ang || 0);
  const fr = a.f[d][animFrame(a, o.t || 0, o.k)];
  const s = VIEW.z / u.ppt;
  const [fx, fy, fw, fh, ox, oy, hand] = fr;
  const X = sx(p.x) - ox * s, Y = sy(p.y) - oy * s;
  const behind = d >= 5 && d <= 7; // смотрит от камеры — оружие за спиной героя
  const weapon = () => {
    if (!wkey || !hand) return;
    if (art) {
      // клинок взмахивает дугой во время удара
      const sw = o.anim === 'swing' && o.k != null ? (o.k - 0.5) * 2.4 : 0;
      const ang = (o.ang || 0) + sw * (Math.cos(o.ang || 0) < 0 ? -1 : 1), hx = X + hand[0] * s, hy = Y + hand[1] * s;
      G.save(); G.imageSmoothingEnabled = true;
      G.translate(hx, hy); G.rotate(ang); if (Math.cos(ang) < 0) G.scale(1, -1);
      const k = s * 0.8;
      G.drawImage(art, -12 * k, -16 * k, 64 * k, 32 * k);
      G.restore();
      return;
    }
    const st = SPRITES3D.sets.build, it = st && st.items[wkey], wimg = st && S3D.img[st.file];
    if (!it || !wimg) return;
    const ang = o.ang || 0, hx = X + hand[0] * s, hy = Y + hand[1] * s;
    G.save(); G.imageSmoothingEnabled = true;
    G.translate(hx, hy); G.rotate(ang); if (Math.cos(ang) < 0) G.scale(1, -1);
    const k = s * 0.95;
    G.drawImage(wimg, it[0], it[1], it[2], it[3], -(it[4] + 32) * k, -(it[5] + 32 - 15) * k, it[2] * k, it[3] * k);
    G.restore();
  };
  if (behind) weapon();
  G.save();
  G.imageSmoothingEnabled = true;
  // гость совместной игры — в синем плаще, хозяин — в своих цветах; броня — оттенок поверх
  const tints = [];
  if (p.guest) tints.push(GUEST_TINT);
  if (ARMOR_TINT[p.armor]) tints.push(ARMOR_TINT[p.armor]);
  if (tints.length) G.drawImage(tintedFrame(img, fx, fy, fw, fh, tints), X, Y, fw * s, fh * s);
  else G.drawImage(img, fx, fy, fw, fh, X, Y, fw * s, fh * s);
  if (o.flash) { G.globalCompositeOperation = 'lighter'; G.globalAlpha = 0.5; G.drawImage(img, fx, fy, fw, fh, X, Y, fw * s, fh * s); }
  G.restore();
  if (!behind) weapon();
  return true;
}

// предмет из набора (природа, постройки, лагеря) с основанием в клетке (tx, ty)
// природа ищется и в атласе сгенерированных вариантов (js/variants.js)
function propSet(set, key) {
  const st = SPRITES3D.sets[set];
  if (st && st.items[key]) return st;
  if (set === 'nature' && SPRITES3D.sets.gen && SPRITES3D.sets.gen.items[key]) return SPRITES3D.sets.gen;
  return null;
}
function propDef(set, key) { const st = propSet(set, key); return st && st.items[key]; }
function drawProp(set, key, tx, ty, o) {
  const st = propSet(set, key), it = st && st.items[key];
  if (!it) return false;
  const img = S3D.img[st.file];
  if (!img) return false;
  const s = VIEW.z * ((o && o.scale) || 1) / st.ppt;
  const [x, y, w, h, bx, by] = it;
  const X = sx(tx) - bx * s, Y = sy(ty) - by * s;
  G.imageSmoothingEnabled = true;
  if (o && (o.alpha != null || o.flash)) {
    G.save();
    if (o.alpha != null) G.globalAlpha = o.alpha;
    G.drawImage(img, x, y, w, h, X, Y, w * s, h * s);
    if (o.flash) { G.globalCompositeOperation = 'lighter'; G.globalAlpha = 0.35; G.drawImage(img, x, y, w, h, X, Y, w * s, h * s); }
    G.restore();
  } else G.drawImage(img, x, y, w, h, X, Y, w * s, h * s);
  return true;
}
// верх картинки предмета в клетках над основанием (для полосок здоровья)
function propTop(set, key, ty) {
  const it = propDef(set, key);
  return it ? ty - it[5] / SPRITES3D.sets[set].ppt : ty - 1;
}

// HTML-картинка из атласа (для интерфейса): CSS-фон с нужным кусочком, без toDataURL
function atlasHtml(file, fx, fy, fw, fh, size, cls) {
  const img = S3D.img[file];
  if (!img) return `<span class="aimg ${cls || ''}" style="width:${size}px;height:${size}px"></span>`;
  // внешняя рамка size×size, внутри — ровно кусок атласа, чтобы соседние картинки не попадали в иконку
  const k = size / Math.max(fw, fh);
  return `<span class="aimg ${cls || ''}" style="width:${size}px;height:${size}px"><span style="width:${Math.round(fw * k)}px;height:${Math.round(fh * k)}px;background-image:url('${file}');` +
    `background-size:${img.naturalWidth * k}px ${img.naturalHeight * k}px;background-position:${-fx * k}px ${-fy * k}px"></span></span>`;
}
function propIconHtml(set, key, size) {
  const st = SPRITES3D.sets[set], it = st && st.items[key];
  if (!it) return '';
  return atlasHtml(st.file, it[0], it[1], it[2], it[3], size);
}
function unitIconHtml(kind, size) {
  // иконка в полный рост сбоку (отдельный рендер фотостудии), иначе кадр из атласа анимаций
  const ik = 'icon_' + (UNIT3D[kind] || kind).replace(/^u_/, '');
  if (propDef('icons', ik)) return propIconHtml('icons', ik, size);
  const u = SPRITES3D.units[UNIT3D[kind] || kind];
  if (!u) return '';
  const f = u.anims.stance.f[2][0];
  return atlasHtml(u.file, f[0], f[1], f[2], f[3], size);
}

// какой спрайт набора построек показывать как иконку
function buildIconKey(id) {
  const d = BUILDINGS[id];
  const mat = id === 'stonewall' || id === 'stonegate' ? 'stone' : 'wood';
  if (d.kind === 'vector') return id + '_1';
  if (d.rotates) return id + '_2';
  if (d.split) return 'splitter_1';
  if (d.under && d.kind === 'belt') return 'ubelt_in_1';
  if (d.kind === 'belt') return id + '_h0';
  if (d.kind === 'cart') return 'cart_1';
  if (d.gate) return 'gate_' + mat + '_h';
  if (d.kind === 'wall') return 'wall_' + mat + '_10';
  return d.sprite || id;
}
// постройки-предметы на конвейерах и в руках големов: маленькая картинка из атласа
function genBuildingItemSprites() {
  for (const id in BUILDINGS) {
    const d = BUILDINGS[id];
    let src = null, fr = null;
    const ik = 'icon_' + (UNIT3D[id] || id).replace(/^u_/, ''), ist = SPRITES3D.sets.icons;
    if (d.kind === 'mgolem' && ist && ist.items[ik]) { src = S3D.img[ist.file]; fr = ist.items[ik]; }
    else if (d.kind === 'mgolem') { const u = SPRITES3D.units[UNIT3D[id] || id]; if (u) { src = S3D.img[u.file]; fr = u.anims.stance.f[2][0]; } }
    else { const st = SPRITES3D.sets.build, it = st && st.items[buildIconKey(id)]; if (it) { src = S3D.img[st.file]; fr = it; } }
    if (d.kind === 'shaft') { SPR.item[id] = d.under ? ushaftIcon() : shaftIcon(); continue; }
    if (!src || !fr) continue;
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const g = c.getContext('2d'), k = 48 / Math.max(fr[2], fr[3]);
    g.imageSmoothingEnabled = true;
    g.drawImage(src, fr[0], fr[1], fr[2], fr[3], (48 - fr[2] * k) / 2, (48 - fr[3] * k) / 2, fr[2] * k, fr[3] * k);
    SPR.item[id] = c;
  }
}

// нарисованные кодом иконки (дорога, вал) — без чужих картинок, поэтому toDataURL работает и с file://
let ROAD_ICON = null, SHAFT_ICON = null;
function roadIcon() {
  if (ROAD_ICON) return ROAD_ICON;
  const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d');
  g.fillStyle = '#5e594f'; g.fillRect(2, 2, 44, 44);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const v = 120 + ((i * 7 + j * 13) % 4) * 10; g.fillStyle = `rgb(${v},${v - 6},${v - 16})`; g.fillRect(4 + i * 14 + (j % 2) * 4, 4 + j * 14, 12, 12); }
  return (ROAD_ICON = c);
}
function shaftIcon() {
  if (SHAFT_ICON) return SHAFT_ICON;
  const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 18, 0, 30); gr.addColorStop(0, '#d8a868'); gr.addColorStop(0.5, '#a8763e'); gr.addColorStop(1, '#5e3e20');
  g.fillStyle = gr; g.fillRect(2, 19, 44, 10);
  g.fillStyle = '#6e4a26'; g.beginPath(); g.arc(24, 24, 11, 0, 7); g.fill(); g.strokeStyle = '#3e2810'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = '#c8955a'; g.lineWidth = 2.5; for (let i = 0; i < 4; i++) { const a = 0.4 + i * Math.PI / 2; g.beginPath(); g.moveTo(24, 24); g.lineTo(24 + Math.cos(a) * 9, 24 + Math.sin(a) * 9); g.stroke(); }
  g.fillStyle = '#8a8f98'; g.beginPath(); g.arc(24, 24, 3.5, 0, 7); g.fill();
  return (SHAFT_ICON = c);
}

// подземный вал: ось уходит в каменный портал со стрелкой
let USHAFT_ICON = null;
function ushaftIcon() {
  if (USHAFT_ICON) return USHAFT_ICON;
  const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 18, 0, 30); gr.addColorStop(0, '#d8a868'); gr.addColorStop(0.5, '#a8763e'); gr.addColorStop(1, '#5e3e20');
  g.fillStyle = gr; g.fillRect(2, 19, 22, 10);
  g.fillStyle = '#9aa0aa'; g.fillRect(9, 18, 3, 12);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(32, 30, 14, 10, 0, 0, 7); g.fill();
  g.fillStyle = '#7a756c'; g.beginPath(); g.ellipse(30, 25, 14, 12, 0, 0, 7); g.fill();
  g.fillStyle = '#a49e92'; g.beginPath(); g.ellipse(30, 22, 11, 8, 0, 0, 7); g.fill();
  g.fillStyle = '#1a1612'; g.beginPath(); g.ellipse(28, 25, 6, 5, 0, 0, 7); g.fill();
  g.fillStyle = '#c8962e'; g.beginPath(); g.arc(28, 25, 2.2, 0, 7); g.fill();
  g.strokeStyle = '#ffd060'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(36, 8); g.lineTo(44, 13); g.lineTo(36, 18); g.stroke();
  return (USHAFT_ICON = c);
}
// иконка постройки для панели и подсказок
function buildIconHtml(id, size) {
  const d = BUILDINGS[id];
  if (d.kind === 'mgolem') return unitIconHtml(id, size);
  const key = buildIconKey(id);
  if (propDef('build', key)) return propIconHtml('build', key, size);
  const img = d.kind === 'belt' ? beltSprites(id)[0][0] : d.kind === 'road' ? roadIcon() : d.kind === 'shaft' ? (d.under ? ushaftIcon() : shaftIcon()) : SPR.b[id];
  if (!img) return '';
  if (!img._url) img._url = img.toDataURL();
  return `<img src="${img._url}" style="width:${size}px;height:${size}px">`;
}

// --------- трупы: проигрываем анимацию смерти и плавно растворяем ---------
const CORPSES = [];
// тело лежит 25 секунд и плавно растворяется; осадные машины рассыпаются обломками
const CORPSE_LIFE = 10;
function addCorpse(e) {
  const d = ENEMIES[e.type];
  if (d && d.prop) { spawnDebris(e.x - 0.5, e.y - 0.5, 1, 'wood'); return; }
  if (d && d.fly) { spawnBurst(e.x, e.y - 1, '#2a2420', 8); return; }
  CORPSES.push({ type: e.type, x: e.x, y: e.y, ang: e.ang || 0, side: Math.cos(e.ang || 0) > 0 ? -1 : 1, t: 0, scale: d && d.scale });
  if (CORPSES.length > 120) CORPSES.shift();
}
function updateCorpses(dt) {
  for (const c of CORPSES) c.t += dt;
  while (CORPSES.length && CORPSES[0].t > CORPSE_LIFE) CORPSES.shift();
}
function drawCorpse(c) {
  const fade = c.t < CORPSE_LIFE - 3 ? 1 : Math.max(0, (CORPSE_LIFE - c.t) / 3);
  const sc = c.scale || 1, pool = Math.min(1, c.t / 1.5);
  // лужа крови растекается под телом
  G.save(); G.globalAlpha = 0.45 * fade; G.fillStyle = '#5a1410';
  G.beginPath(); G.ellipse(sx(c.x + (c.side || 1) * 0.35 * sc), sy(c.y), VIEW.z * (0.2 + 0.35 * pool) * sc, VIEW.z * (0.1 + 0.15 * pool) * sc, 0, 0, 7); G.fill(); G.restore();
  drawFallen(c.type, c.x, c.y, c.side || 1, c.t, fade, sc);
}
// тело падает набок (за 0,4 с, с ускорением) и остаётся лежать
function drawFallen(kind, wx, wy, side, t, alpha, scale) {
  const u = SPRITES3D.units[UNIT3D[kind] || kind];
  const img = u && S3D.img[u.file];
  if (!img) return;
  const fall = Math.min(1, t / 0.4), k = fall * fall;
  const bounce = t > 0.4 && t < 0.6 ? Math.sin((t - 0.4) / 0.2 * Math.PI) * 0.08 : 0;
  const a = u.anims.stance, fr = a.f[dir8(side > 0 ? Math.PI : 0)][0];
  const s = VIEW.z * (scale || 1) / u.ppt;
  const [fx, fy, fw, fh, ox, oy] = fr;
  G.save();
  G.imageSmoothingEnabled = true;
  G.globalAlpha = alpha;
  G.translate(sx(wx), sy(wy));
  G.rotate(side * (k * Math.PI / 2 - bounce));
  G.drawImage(img, fx, fy, fw, fh, -ox * s, -oy * s, fw * s, fh * s);
  G.restore();
}
