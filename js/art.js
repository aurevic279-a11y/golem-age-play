'use strict';
// Объёмная графика высокого разрешения (векторное рисование с градиентами).
// Масштаб: ART px на клетку; высокие объекты выходят за свою клетку вверх.

const ART = 64;
const ARTSPR = {};

function artCanvas(wTiles, hTiles, fn) {
  const c = document.createElement('canvas');
  c.width = Math.round(wTiles * ART); c.height = Math.round(hTiles * ART);
  const g = c.getContext('2d');
  fn(g, c.width, c.height);
  return c;
}
function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function rad(g, x, y, r0, r1, stops) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function poly(g, pts, fill, stroke, lw) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
}
// детерминированный ГСЧ для рисования
function prng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

// горы залежей в поле зрения (кроме тех, где уже стоит шахта)
function visibleMountains() {
  const out = [];
  for (const p of patchesIn(VIEW.x0 - 3, VIEW.y0 - 3, VIEW.x1 + 3, VIEW.y1 + 5)) {
    const c = peekChunk(Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK));
    if (!c) continue;
    const i = tidx(p.x, p.y);
    if (c.res[i] !== RES_ID.mount || c.bld[i]) continue;
    out.push(p);
  }
  return out;
}
const RES_KEY = { 2: 'stone', 3: 'iron', 4: 'copper', 5: 'coal', 6: 'sulfur', 7: 'gold', 8: 'mithril' };
function drawMountain(p) {
  // гора 3×3 с центром в p
  if (drawProp('nature', 'mount_' + RES_KEY[p.res], p.x - 1, p.y - 1)) return;
  G.fillStyle = '#6c675e'; G.fillRect(sx(p.x - 1), sy(p.y - 1), VIEW.z * 3, VIEW.z * 3);
}

// ---------- природа: деревья, камни, руда, кусты, руины (спрайты из 3D-моделей) ----------
const NATURE_N = {};
// пока атлас вариантов не готов — исходный спрайт
const VAR_BASE = { treeW: 'tree', treeA: 'tree', cactus: 'tree', shroom: 'tree', stoneW: 'stone', stoneR: 'stone', bushW: 'bush', bushD: 'bush', bushA: 'bush', bushP: 'bush' };
// какой лес растёт на почве
const TREE_PRE = { [GROUND.swamp]: 'treeS', [GROUND.dark]: 'treeD', [GROUND.desert]: 'cactus', [GROUND.snow]: 'treeW', [GROUND.autumn]: 'treeA', [GROUND.mushroom]: 'shroom' };
function natureCount(prefix) {
  if (NATURE_N[prefix] == null) { let n = 0; while (propDef('nature', prefix + n)) n++; NATURE_N[prefix] = n; }
  return NATURE_N[prefix];
}
// какой спрайт стоит на клетке: вариант по хешу клетки
function resPropKey(r, gr, x, y) {
  const h = hash2(x, y, 99);
  let pre;
  if (r === RES_ID.tree) pre = TREE_PRE[gr] || 'tree';
  else if (r === RES_ID.bush) pre = gr === GROUND.snow ? 'bushW' : gr === GROUND.desert ? 'bushD' : gr === GROUND.autumn ? 'bushA' : gr === GROUND.mushroom ? 'bushP' : 'bush';
  else if (r === RES_ID.ruins) pre = 'ruins';
  else if (r === RES_ID.stone && (gr === GROUND.snow || gr === GROUND.desert)) pre = gr === GROUND.snow ? 'stoneW' : 'stoneR';
  else if (RES_KEY[r]) pre = RES_KEY[r];
  else return null;
  // сгенерированные варианты (зеркальные, осенние, снежные, кактусы…), иначе исходные спрайты
  const list = natureVariants(pre);
  if (list && list.length) return list[Math.floor(h * list.length)];
  const base = VAR_BASE[pre] || pre;
  const n = natureCount(base);
  return n ? base + Math.floor(h * n) : null;
}
// издалека деревья и камни участка рисуются один раз в картинку (перерисовка — только когда что-то срубили или выросло)
// поля вокруг участка: сверху 5 клеток, по бокам по 2 — кроны соседних клеток не обрезаются квадратами
const PROP_LOD_Z = 22, PROP_PX = 16, PROP_PAD = 5, PROP_PADX = 2;
const TREE_K = 1.4; // деревья крупнее модели героя
function propBlit(g, set, key, X, Y, s) {
  const st = propSet(set, key), it = st && st.items[key], img = st && S3D.img[st.file];
  if (!it || !img) return;
  g.drawImage(img, it[0], it[1], it[2], it[3], X - it[4] * s, Y - it[5] * s, it[2] * s, it[3] * s);
}
function chunkPropCanvas(c) {
  const ver = (c.netv || 0) * 4096 + (c.bldv || 0);
  if (c.propCv && c.propVer === ver) return c.propCv;
  if (!S3D.ready) return null;
  const cv = c.propCv || document.createElement('canvas');
  cv.width = (CHUNK + PROP_PADX * 2) * PROP_PX; cv.height = (CHUNK + PROP_PAD + 1) * PROP_PX;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.imageSmoothingEnabled = true;
  const s = PROP_PX / SPRITES3D.sets.nature.ppt;
  for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
    const i = ly * CHUNK + lx, r = c.res[i];
    if (!r || r === RES_ID.sand || r === RES_ID.mount || r === RES_ID.crop) continue;
    if (c.bld[i] && r !== RES_ID.tree) continue; // руда под конвейером или постройкой не рисуется поверх неё
    const x = c.cx * CHUNK + lx, y = c.cy * CHUNK + ly;
    const key = resPropKey(r, c.ground[i], x, y);
    if (!key) continue;
    const ore = r !== RES_ID.tree;
    const dx = (hash2(x, y, 41) - 0.5) * (ore ? 0.4 : 0.24), dy = (hash2(x, y, 43) - 0.5) * (ore ? 0.3 : 0.16);
    const k = r === RES_ID.tree ? TREE_K : 1, sh = (0.5 - 0.5 * k) * PROP_PX;
    propBlit(g, 'nature', key, (lx + dx + PROP_PADX) * PROP_PX + sh, (ly + dy + PROP_PAD) * PROP_PX + sh, s * k);
  }
  c.propCv = cv; c.propVer = ver;
  return cv;
}
// при дальней камере — участки целиком, сверху вниз
function drawPropLOD() {
  const cx0 = Math.floor((VIEW.x0 - PROP_PADX) / CHUNK), cx1 = Math.floor((VIEW.x1 + PROP_PADX) / CHUNK), cy0 = Math.floor(VIEW.y0 / CHUNK), cy1 = Math.floor((VIEW.y1 + PROP_PAD) / CHUNK);
  G.imageSmoothingEnabled = true;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = peekChunk(cx, cy);
    if (!c) continue;
    const cv = chunkPropCanvas(c);
    if (!cv) continue;
    const X = sx(cx * CHUNK - PROP_PADX), Y = sy(cy * CHUNK - PROP_PAD);
    G.drawImage(cv, X, Y, sx((cx + 1) * CHUNK + PROP_PADX) - X, sy((cy + 1) * CHUNK + 1) - Y);
  }
  G.imageSmoothingEnabled = false;
}
// все ресурсы в поле зрения (с запасом снизу: высокие деревья торчат вверх)
function collectResProps(D) {
  if (VIEW.z < PROP_LOD_Z * DPR) {
    // издалека — только грядки по отдельности, остальное нарисует drawPropLOD
    for (let y = VIEW.y0 - 1; y <= VIEW.y1 + 1; y++) for (let x = VIEW.x0 - 1; x <= VIEW.x1 + 1; x++) {
      const c = peekChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
      if (c && c.res[tidx(x, y)] === RES_ID.crop) D.push({ y: y + 0.2, t: 3, o: { x, y, r: RES_ID.crop, g: c.ground[tidx(x, y)] } });
    }
    return;
  }
  const x0 = VIEW.x0 - 1, x1 = VIEW.x1 + 1, y0 = VIEW.y0 - 1, y1 = VIEW.y1 + 3;
  for (let y = y0; y <= y1; y++) {
    const cy = Math.floor(y / CHUNK), ly = y - cy * CHUNK;
    let c = null, ccx = 1e9;
    for (let x = x0; x <= x1; x++) {
      const cx = Math.floor(x / CHUNK);
      if (cx !== ccx) { ccx = cx; c = peekChunk(cx, cy); }
      if (!c) continue;
      const i = ly * CHUNK + (x - cx * CHUNK), r = c.res[i];
      if (!r || r === RES_ID.sand || r === RES_ID.mount) continue;
      if (r !== RES_ID.tree && r !== RES_ID.crop && c.bld[i]) continue; // руда под конвейером/постройкой не лезет поверх
      if (r === RES_ID.crop) { D.push({ y: y + 0.2, t: 3, o: { x, y, r, g: c.ground[i] } }); continue; }
      // ствол дерева — у середины клетки: кто стоит южнее, рисуется поверх;
      // по камням и руде можно ходить, они ниже — герой на клетке рисуется поверх них
      D.push({ y: y + (r === RES_ID.tree ? 0.55 : 0.3), t: 3, o: { x, y, r, g: c.ground[i] } });
    }
  }
}
// грядка: вспаханная земля и растение по стадии роста
function drawCrop(o) {
  const k = cropKey(o.x, o.y), cr = S.crops[k];
  const X = sx(o.x), Y = sy(o.y), z = VIEW.z;
  G.fillStyle = '#6a4a2c';
  G.fillRect(X + z * 0.06, Y + z * 0.08, z * 0.88, z * 0.84);
  G.fillStyle = '#4e3520';
  for (let i = 0; i < 3; i++) G.fillRect(X + z * 0.1, Y + z * (0.2 + i * 0.27), z * 0.8, Math.max(1, z * 0.06));
  if (!cr) return;
  const gr = cropGrowth(k), ripe = gr >= 1;
  const st = ripe ? 3 : Math.min(2, Math.floor(gr * 3));
  if (drawProp('build', 'crop_' + (cr.c === 'berries' ? 'b' : 'w') + st, o.x, o.y)) return;
  // запасной вариант без спрайта: стебли
  const h = (0.2 + gr * 0.5) * z;
  G.strokeStyle = ripe ? (cr.c === 'berries' ? '#3a7a30' : '#e0c050') : '#6aa040'; G.lineWidth = Math.max(1, z * 0.05);
  for (let i = 0; i < 6; i++) { const px = X + z * (0.18 + (i % 3) * 0.32), py = Y + z * (0.35 + Math.floor(i / 3) * 0.4); G.beginPath(); G.moveTo(px, py); G.lineTo(px, py - h); G.stroke(); }
}
function drawResProp(o) {
  if (o.r === RES_ID.crop) { drawCrop(o); return; }
  const key = resPropKey(o.r, o.g, o.x, o.y);
  const p = S.player;
  // небольшой сдвиг, чтобы лес и россыпи камней не стояли ровной сеткой
  const ore = o.r !== RES_ID.tree, jit = ore ? 0.4 : 0.24;
  let dx = (hash2(o.x, o.y, 41) - 0.5) * jit, dy = (hash2(o.x, o.y, 43) - 0.5) * (ore ? 0.3 : 0.16);
  // дерево, которое рубит герой, вздрагивает
  if (p.mining && p.mineX === o.x && p.mineY === o.y) dx += Math.sin(S.time * 40) * 0.03;
  // дерево перед героем становится полупрозрачным, чтобы его было видно
  const hide = o.r === RES_ID.tree && o.y + 0.55 > p.y && o.y - 2.9 < p.y && Math.abs(o.x + 0.5 - p.x) < 1.6;
  // деревья крупнее героя (масштаб вокруг середины клетки)
  const k = o.r === RES_ID.tree ? TREE_K : 1, sh = 0.5 - 0.5 * k;
  if (key && drawProp('nature', key, o.x + dx + sh, o.y + dy + sh, hide ? { alpha: 0.5, scale: k } : k !== 1 ? { scale: k } : null)) { if (ore) pureGlint(o); return; }
  const arr = SPR.res[o.r];
  if (arr) drawSprite(arr[Math.floor(hash2(o.x, o.y, 99) * arr.length)], o.x, o.y, 1, 1);
}

// чистая жила: на руде поблёскивают белые искры
function pureGlint(o) {
  if ((o.r !== RES_ID.iron && o.r !== RES_ID.copper) || !isPureOre(o.x, o.y)) return;
  const ph = (S.time * 1.3 + hash2(o.x, o.y, 5) * 7) % 3;
  if (ph > 1) return;
  const a = Math.sin(ph * Math.PI), X = sx(o.x + 0.3 + hash2(o.x, o.y, 6) * 0.4), Y = sy(o.y + 0.25 + hash2(o.x, o.y, 8) * 0.3), r = VIEW.z * 0.12 * a;
  G.save(); G.globalCompositeOperation = 'lighter'; G.strokeStyle = `rgba(255,255,255,${(0.9 * a).toFixed(2)})`; G.lineWidth = Math.max(1, VIEW.z * 0.025);
  G.beginPath(); G.moveTo(X - r, Y); G.lineTo(X + r, Y); G.moveTo(X, Y - r); G.lineTo(X, Y + r); G.stroke(); G.restore();
}

// высокодетальная картинка: рисуем со сглаживанием
function drawArt(img, x, y, w, h, flip) {
  G.imageSmoothingEnabled = true;
  drawSprite(img, x, y, w, h, flip);
  G.imageSmoothingEnabled = false;
}

// ---------- стены с автосоединением (маска соседей: 1 — сверху, 2 — справа, 4 — снизу, 8 — слева) ----------
const WALL_STYLE = {
  wood:  { kind: 'stake', col: '#7a5632', col2: '#6a4a28', rope: '#c8b090', h: 1.05 },
  woodc: { kind: 'stake', col: '#6a4a28', col2: '#5a3e20', rope: '#a08a6a', h: 1.15 },
  stone: { kind: 'block', col: '#8a857a', dark: '#5e5a52', h: 0.85 },
  stonec: { kind: 'block', col: '#7a756b', dark: '#4e4a42', h: 0.95 },
};
function wallSprite(style, mask) {
  const k = 'wall_' + style + '_' + mask;
  if (ARTSPR[k]) return ARTSPR[k];
  const st = WALL_STYLE[style];
  const H = 1.9; // высота холста в клетках; нижняя клетка — основание
  ARTSPR[k] = artCanvas(1, H, (g, w, h) => {
    const top = (H - 1) * ART; // y верхнего края основания на холсте
    // точки вдоль соединений: от центра к краям
    // вертикальные участки делаем в несколько брёвен/блоков в ширину, чтобы стена была одинаково массивной
    const pts = [];
    const step = st.kind === 'stake' ? 0.25 : 0.2;
    const across = st.kind === 'stake' ? [-0.17, 0, 0.17] : [-0.13, 0.13];
    const vpt = (y) => { for (const dx of across) pts.push([0.5 + dx, y]); };
    if ((mask & 5) || !mask) vpt(0.5); else pts.push([0.5, 0.5]);
    if (mask & 1) for (let t = 0.5 - step; t >= -0.01; t -= step) vpt(t);
    if (mask & 4) for (let t = 0.5 + step; t <= 1.01; t += step) vpt(t);
    if (mask & 8) for (let t = 0.5 - step; t >= -0.01; t -= step) pts.push([t, 0.5]);
    if (mask & 2) for (let t = 0.5 + step; t <= 1.01; t += step) pts.push([t, 0.5]);
    if (!mask && st.kind === 'stake') pts.push([0.5, 0.32], [0.5, 0.68]);
    pts.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    // тень
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (const [x, y] of pts) { g.beginPath(); g.ellipse(x * w + ART * 0.08, top + y * ART + 2, ART * 0.15, ART * 0.06, 0, 0, 7); g.fill(); }
    let i = 0;
    for (const [x, y] of pts) {
      const bx = x * w, by = top + y * ART;
      if (st.kind === 'stake') {
        const hh = ART * st.h * (0.9 + ((i * 37) % 10) / 50), sw = ART * 0.2;
        stakeArt(g, bx, by, hh, sw, i % 2 ? st.col2 : st.col);
      } else {
        // каменный блок: передняя грань с кладкой и светлый верх
        const bw = ART * 0.34, hh = ART * st.h, d = ART * 0.16;
        g.fillStyle = st.dark; g.fillRect(bx - bw / 2, by - hh, bw, hh);
        g.fillStyle = lin(g, 0, by - hh, 0, by, [[0, shade(st.col, 0.05)], [1, shade(st.col, -0.3)]]);
        g.fillRect(bx - bw / 2, by - hh, bw, hh);
        g.fillStyle = 'rgba(30,26,22,0.45)';
        for (let yy = by - hh + ART * 0.14; yy < by - 2; yy += ART * 0.14) g.fillRect(bx - bw / 2, yy, bw, 1.2);
        g.fillStyle = shade(st.col, 0.25); g.fillRect(bx - bw / 2, by - hh - d, bw, d);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + bw / 2 - 2, by - hh - d, 2, hh + d);
      }
      i++;
    }
    // зубцы на камне и верёвка на частоколе вдоль горизонтали
    if (st.kind === 'block') {
      g.fillStyle = shade(st.col, 0.2);
      for (const [x, y] of pts) if ((Math.round(x * 10) + Math.round(y * 10)) % 2 === 0) g.fillRect(x * w - ART * 0.08, top + y * ART - ART * st.h - ART * 0.32, ART * 0.16, ART * 0.16);
    } else if (mask & 10) {
      g.fillStyle = st.rope;
      const x0 = mask & 8 ? 0 : w / 2, x1 = mask & 2 ? w : w / 2;
      g.fillRect(x0, top + ART * 0.5 - ART * 0.55, x1 - x0, 2.5);
    }
  });
  return ARTSPR[k];
}
function stakeArt(g, x, yb, h, w, col) {
  g.beginPath(); g.moveTo(x - w / 2, yb); g.lineTo(x - w / 2, yb - h + w * 0.9); g.lineTo(x, yb - h); g.lineTo(x + w / 2, yb - h + w * 0.9); g.lineTo(x + w / 2, yb); g.closePath();
  g.fillStyle = lin(g, x - w / 2, 0, x + w / 2, 0, [[0, shade(col, 0.2)], [0.45, col], [1, shade(col, -0.5)]]); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - w / 2, yb - h * 0.35, w, 1.5);
}
// материал стены; стены и ворота любого материала соединяются между собой и с башнями
const WALL_MAT = { palisade: 'wood', gate: 'wood', stonewall: 'stone', stonegate: 'stone' };
function wallMaskB(b) {
  let m = 0;
  const same = (x, y) => { const o = bldAt(x, y); return o && (BUILDINGS[o.type].kind === 'wall' || BUILDINGS[o.type].kind === 'tower'); };
  if (same(b.x, b.y - 1)) m |= 1; if (same(b.x + 1, b.y)) m |= 2; if (same(b.x, b.y + 1)) m |= 4; if (same(b.x - 1, b.y)) m |= 8;
  return m;
}
// ворота: открыты, когда рядом свои (герой или голем)
function gateOpen(b) {
  const p = S.player, cx = b.x + 0.5, cy = b.y + 0.5;
  if (p.dead <= 0 && dist(p.x, p.y, cx, cy) < 1.6) return true;
  for (const g of S.golems) if (!g.hidden && dist(g.x, g.y, cx, cy) < 1.5) return true;
  return false;
}
function drawWallB(b) {
  const style = WALL_MAT[b.type] || 'wood', m = wallMaskB(b);
  if (BUILDINGS[b.type].gate) {
    // поворот ворот: по соседним стенам (вертикальная линия — ворота смотрят вбок)
    const vert = (m & 5) && !(m & 10);
    const k = 'gate_' + style + '_' + (vert ? 'v' : 'h') + (gateOpen(b) ? '_open' : '');
    if (drawProp('build', k, b.x, b.y)) return;
  }
  if (drawProp('build', 'wall_' + style + '_' + m, b.x, b.y)) return;
  drawArt(wallSprite(style, m), b.x, b.y + 1 - 1.9, 1, 1.9);
}
// стены лагерей: маска по соседним сегментам того же лагеря
function campWallMask(c, s) {
  if (!c._wall) { c._wall = new Map(); for (const t of c.structs) if (t.minor) c._wall.set(t.x + ',' + t.y, t); }
  const alive = (x, y) => { const t = c._wall.get(x + ',' + y); return t && t.hp > 0; };
  let m = 0;
  if (alive(s.x, s.y - 1)) m |= 1; if (alive(s.x + 1, s.y)) m |= 2; if (alive(s.x, s.y + 1)) m |= 4; if (alive(s.x - 1, s.y)) m |= 8;
  return m;
}
