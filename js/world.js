'use strict';
// Бесконечный мир: чанки 32×32 генерируются по мере надобности из сида.

const W = new Map();      // ключ чанка -> чанк
const POLL = new Map();   // ключ чанка -> загрязнение
let SEED = 12345;

function ck(cx, cy) { return cx + ',' + cy; }
function peekChunk(cx, cy) { return W.get(ck(cx, cy)) || null; }
function getChunk(cx, cy) {
  const k = ck(cx, cy);
  let c = W.get(k);
  if (!c) {
    c = genChunk(cx, cy); W.set(k, c);
    // соседям нужно перерисовать края почвы на границе
    for (const [dx, dy] of DIRS) { const n = W.get(ck(cx + dx, cy + dy)); if (n && n.canvas) { n.oldCanvas = n.canvas; n.canvas = null; } }
  }
  return c;
}
function chunkOf(x, y) { return getChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK)); }
function tidx(x, y) { return (((y % CHUNK) + CHUNK) % CHUNK) * CHUNK + (((x % CHUNK) + CHUNK) % CHUNK); }

function groundAt(x, y) { return chunkOf(x, y).ground[tidx(x, y)]; }
function resAt(x, y) { return chunkOf(x, y).res[tidx(x, y)]; }
function amtAt(x, y) { return chunkOf(x, y).amt[tidx(x, y)]; }
function bldAt(x, y) { return chunkOf(x, y).bld[tidx(x, y)]; }
function isWater(x, y) { return groundAt(x, y) === GROUND.water; }
function isExplored(x, y) { return chunkOf(x, y).explored[tidx(x, y)] === 1; }

// стартовые гарантированные залежи (в центре каждой — рудная гора 3×3)
const START_PATCHES = [
  { x: 14, y: -5, r: 4.6, res: RES_ID.iron, rich: 1 },
  { x: -13, y: 7, r: 4.2, res: RES_ID.copper, rich: 1 },
  { x: -5, y: -14, r: 4.4, res: RES_ID.stone, rich: 1 },
  { x: 10, y: 14, r: 4.0, res: RES_ID.coal, rich: 1 },
];
const START_POND = { x: -17, y: -15, r: 3.6 };

// запас руды во всей залежи: у старта ~10 000, дальше от центра больше: 50к → 100к → 200к → 300к → 500к → 1 млн
// (± до 15% разброса); редкие руды (сера, золото, мифрил) — меньше
const ORE_BASE = { 2: 1100, 3: 1200, 4: 1200, 5: 1100, 6: 850, 7: 650, 8: 450 };
const ORE_TIERS = [[60, 50000], [110, 100000], [170, 200000], [240, 300000], [320, 500000], [Infinity, 1000000]];
function patchTotal(p) {
  const spread = 0.85 + hash2(Math.round(p.x), Math.round(p.y), SEED + 8181) * 0.3;
  const rare = Math.min(1, ORE_BASE[p.res] / 1100);
  if (START_PATCHES.includes(p)) return 10000 * spread * rare * TUNE.ore;
  const d = Math.hypot(p.x, p.y);
  let t = ORE_TIERS[0][1];
  for (const [lim, v] of ORE_TIERS) if (d < lim) { t = v; break; }
  return t * spread * rare * TUNE.ore;
}
// запас клетки: всего на залежь / площадь; в середине гуще, к краю меньше (средний множитель формы ≈ 0,9)
function patchTileAmt(p, pd) {
  if (p.perTile == null) p.perTile = patchTotal(p) / (Math.PI * p.r * p.r * 0.9);
  return Math.max(20, Math.min(65000, Math.floor(p.perTile * (1.3 - pd / p.r * 0.6))));
}
// залежи-пятна: по одной (или ни одной) на клетку сетки PATCH_CELL×PATCH_CELL
const PATCH_CELL = 56;
const PATCH_CACHE = new Map();
function patchInCell(gx, gy) {
  const key = gx + ',' + gy;
  if (PATCH_CACHE.has(key)) return PATCH_CACHE.get(key);
  let p = null;
  const h = hash2(gx, gy, SEED + 5151);
  const x = gx * PATCH_CELL + 10 + Math.floor(hash2(gx, gy, SEED + 5252) * (PATCH_CELL - 20));
  const y = gy * PATCH_CELL + 10 + Math.floor(hash2(gx, gy, SEED + 5353) * (PATCH_CELL - 20));
  const d = Math.sqrt(x * x + y * y);
  // залежь не кладём в озеро: проверяем высоту в центре и по краям
  const dry = (xx, yy) => fbm(xx / 48, yy / 48, SEED, 4) + Math.max(0, 1 - Math.hypot(xx, yy) / 28) * 0.35 > 0.37;
  if (d > 34 && h < 0.62 && dry(x, y) && dry(x + 4, y) && dry(x - 4, y) && dry(x, y + 4) && dry(x, y - 4)) {
    // какие руды бывают на таком расстоянии
    const w = [[RES_ID.stone, 3], [RES_ID.iron, 3], [RES_ID.copper, 3], [RES_ID.coal, 3]];
    if (d > 45) w.push([RES_ID.sulfur, 1.6]);
    if (d > 80) w.push([RES_ID.gold, 2.4]);
    if (d > 200) w.push([RES_ID.mithril, 1.2]);
    // в новых мирах залежи под стать биому: в пустыне — сера и золото, в тундре — железо, уголь и мифрил, в осеннем лесу — медь
    if (S && S.worldVer >= 2) {
      const bm = biomeAt(x, y, d), add = (r, k) => { const e = w.find(a => a[0] === r); if (e) e[1] += k; };
      if (bm === GROUND.desert) { add(RES_ID.sulfur, 2.5); add(RES_ID.gold, 1.5); }
      else if (bm === GROUND.snow) { add(RES_ID.iron, 1.5); add(RES_ID.coal, 1.5); add(RES_ID.mithril, 1); }
      else if (bm === GROUND.autumn) add(RES_ID.copper, 2);
    }
    let sum = 0; for (const [, k] of w) sum += k;
    let t = hash2(gx, gy, SEED + 5454) * sum, res = w[0][0];
    for (const [r, k] of w) { if (t < k) { res = r; break; } t -= k; }
    const r = 4 + hash2(gx, gy, SEED + 5555) * 2.5 + Math.min(5, d / 90);
    p = { x, y, r, res, rich: 1 + d / 70, key };
  }
  PATCH_CACHE.set(key, p);
  return p;
}
// все залежи (включая стартовые), задевающие прямоугольник
function patchesIn(x0, y0, x1, y1) {
  const out = [];
  for (const sp of START_PATCHES) if (sp.x >= x0 - 12 && sp.x <= x1 + 12 && sp.y >= y0 - 12 && sp.y <= y1 + 12) out.push(sp);
  for (let gy = Math.floor((y0 - 16) / PATCH_CELL); gy <= Math.floor((y1 + 16) / PATCH_CELL); gy++)
    for (let gx = Math.floor((x0 - 16) / PATCH_CELL); gx <= Math.floor((x1 + 16) / PATCH_CELL); gx++) {
      const p = patchInCell(gx, gy);
      if (p) out.push(p);
    }
  return out;
}
// какая залежь покрывает клетку
function patchAtTile(x, y) {
  for (const sp of START_PATCHES) if (dist(x, y, sp.x, sp.y) < sp.r + 1.5) return sp;
  const gx = Math.floor(x / PATCH_CELL), gy = Math.floor(y / PATCH_CELL);
  for (let yy = gy - 1; yy <= gy + 1; yy++) for (let xx = gx - 1; xx <= gx + 1; xx++) {
    const p = patchInCell(xx, yy);
    if (p && dist(x, y, p.x, p.y) < p.r + 1.5) return p;
  }
  return null;
}
// рудная гора (место под шахту) — только у дальних залежей, не у стартовых
const MOUNT_MIN_DIST = 60;
function isMountTile(p, x, y) { return !START_PATCHES.includes(p) && Math.hypot(p.x, p.y) >= MOUNT_MIN_DIST && Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1; }

// биомы дальних земель (дальше ~90–130 клеток от старта): холодно — тундра, жарко — пустыня, местами — осенний лес
const BIOME_D = 90;
function biomeAt(x, y, d) {
  if (d < BIOME_D || d < BIOME_D + valueNoise(x / 40, y / 40, SEED + 911) * 40) return -1;
  const t = fbm(x / 300, y / 300, SEED + 313, 3);
  if (t < 0.37) return GROUND.snow;
  if (t > 0.62) return GROUND.desert;
  if (fbm(x / 160 - 40, y / 160 + 90, SEED + 515, 2) > 0.63) return GROUND.autumn;
  return -1;
}
function genTile(x, y, out) {
  if (y >= DUNGEON.y0 - 64) { dungeonTile(x, y, out); return; }
  const d = Math.sqrt(x * x + y * y);
  let e = fbm(x / 48, y / 48, SEED, 4) + Math.max(0, 1 - d / 28) * 0.35;
  const m = fbm(x / 70 + 300, y / 70 - 200, SEED + 77, 3);
  let ground = GROUND.grass, res = 0, amt = 0;
  const pd = dist(x, y, START_POND.x, START_POND.y);
  if (pd < START_POND.r) e = 0.2;
  if (e < 0.33) ground = GROUND.water;
  else if (e < 0.355) ground = GROUND.sand;
  else if (m > 0.63 && e < 0.52 && d > 25) ground = GROUND.swamp;
  else if (d > 110 && fbm(x / 90, y / 90, SEED + 5, 2) > 0.58) ground = GROUND.dark;
  else if (d > 30 && fbm(x / 30 + 50, y / 30, SEED + 9, 2) > 0.72) ground = GROUND.rock;
  if (ground === GROUND.grass || ground === GROUND.dark) { const bm = biomeAt(x, y, d); if (bm >= 0) ground = bm; }
  // грибная чаща — в сырых местах (болота и тёмный лес) далеко от старта
  if ((ground === GROUND.swamp || ground === GROUND.dark) && d > 120 && fbm(x / 120, y / 120, SEED + 717, 2) > 0.6) ground = GROUND.mushroom;

  const p = patchAtTile(x, y);
  if (p && isMountTile(p, x, y)) { out.g = GROUND.rock; out.r = RES_ID.mount; out.a = p.res; return; }
  if (ground !== GROUND.water) {
    const h = hash2(x, y, SEED + 4242);
    // залежи руды: пятна с рваным краем, гора в центре
    if (p) {
      const pd = dist(x, y, p.x, p.y);
      const edge = (valueNoise(x / 2.7, y / 2.7, SEED + 61) - 0.5) * 1.6;
      if (pd < p.r + edge) {
        res = p.res;
        amt = patchTileAmt(p, pd);
        if (ground === GROUND.water || ground === GROUND.sand) ground = GROUND.grass;
      }
    }
    if (!res && d > 3.5) {
      if (ground === GROUND.sand) { if (h < 0.5) { res = RES_ID.sand; amt = 600; } }
      else if (ground === GROUND.grass || ground === GROUND.dark) {
        const f = fbm(x / 20, y / 20, SEED + 3, 3);
        const thr = ground === GROUND.dark ? 0.44 : (d < 22 ? 0.47 : 0.53);
        if (f > thr && h > 0.22) { res = RES_ID.tree; amt = 4 + Math.floor(hash2(x, y, SEED + 7) * 5); }
        else if (h < 0.006) { res = RES_ID.bush; amt = 15; }
        else if (d > 140 && h > 0.9984) { res = RES_ID.ruins; amt = 1 + (h > 0.9995 ? 1 : 0); }
      } else if (ground === GROUND.swamp && h < 0.08) { res = RES_ID.tree; amt = 3; }
      else if (ground === GROUND.desert) {
        // редкие кактусы (дают древесину), песок и выходы камня
        const f = fbm(x / 20, y / 20, SEED + 3, 3);
        if (f > 0.58 && h > 0.6) { res = RES_ID.tree; amt = 3; }
        else if (h < 0.05) { res = RES_ID.sand; amt = 400; }
        else if (h < 0.058) { res = RES_ID.stone; amt = 300; }
      } else if (ground === GROUND.snow) {
        // заснеженная тайга и валуны
        const f = fbm(x / 20, y / 20, SEED + 3, 3);
        if (f > 0.54 && h > 0.3) { res = RES_ID.tree; amt = 4 + Math.floor(hash2(x, y, SEED + 7) * 5); }
        else if (h < 0.012) { res = RES_ID.stone; amt = 300; }
      } else if (ground === GROUND.autumn) {
        // густой осенний лес, много ягодных кустов
        const f = fbm(x / 20, y / 20, SEED + 3, 3);
        if (f > 0.47 && h > 0.2) { res = RES_ID.tree; amt = 4 + Math.floor(hash2(x, y, SEED + 7) * 5); }
        else if (h < 0.014) { res = RES_ID.bush; amt = 15; }
        else if (d > 140 && h > 0.9984) { res = RES_ID.ruins; amt = 1; }
      } else if (ground === GROUND.mushroom) {
        // гигантские грибы (их ножки — та же древесина)
        const f = fbm(x / 20, y / 20, SEED + 3, 3);
        if (f > 0.45 && h > 0.3) { res = RES_ID.tree; amt = 3 + Math.floor(hash2(x, y, SEED + 7) * 4); }
        else if (h < 0.01) { res = RES_ID.bush; amt = 15; }
      }
    }
  }
  out.g = ground; out.r = res; out.a = amt;
}

const _tile = { g: 0, r: 0, a: 0 };
function genChunk(cx, cy) {
  const c = {
    cx, cy,
    ground: new Uint8Array(CHUNK_AREA), res: new Uint8Array(CHUNK_AREA), amt: new Uint16Array(CHUNK_AREA),
    bld: new Array(CHUNK_AREA).fill(null), blds: [], explored: new Uint8Array(CHUNK_AREA),
    canvas: null, fog: null, fogDirty: true, modified: false, trees: 0,
  };
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
    genTile(x0 + lx, y0 + ly, _tile);
    const i = ly * CHUNK + lx;
    c.ground[i] = _tile.g; c.res[i] = _tile.r; c.amt[i] = _tile.a;
  }
  // лагерь врагов (раскладка детерминирована, сам объект создаётся один раз)
  const layout = campLayout(cx, cy);
  clearCampArea(c);
  clearCaveArea(c);
  // исходная густота леса — до неё деревья и отрастают
  c.trees0 = 0;
  for (let i = 0; i < CHUNK_AREA; i++) if (c.res[i] === RES_ID.tree) c.trees0++;
  // сохранённые изменения тайлов
  if (typeof SAVED_CHUNKS !== 'undefined' && SAVED_CHUNKS.has(ck(cx, cy))) {
    const sv = SAVED_CHUNKS.get(ck(cx, cy));
    if (sv.res) {
      const genRes = sv.ore2 ? null : c.res.slice(), genAmt = sv.ore2 ? null : c.amt.slice();
      c.res.set(bytesFromB64(sv.res)); c.amt.set(new Uint16Array(bytesFromB64(sv.amt).buffer)); c.modified = true;
      if (!sv.ore2) shrinkOldOre(c, x0, y0, genRes, genAmt);
    }
    if (sv.exp) c.explored.set(bytesFromB64(sv.exp));
  }
  for (let i = 0; i < CHUNK_AREA; i++) if (c.res[i] === RES_ID.tree) c.trees++;
  if (layout && S && !S.campChunks.includes(ck(cx, cy))) {
    S.campChunks.push(ck(cx, cy));
    createCamp(layout);
  }
  // цитадели появляются и в уже идущей игре (учёт отдельно от обычных лагерей); у гостя — только от хозяина
  if (S && !(typeof MP !== 'undefined' && MP.role === 'client')) for (const s of citadelsIn(cx, cy)) {
    S.citadels = S.citadels || [];
    if (S.citadels.includes(s.id)) continue;
    S.citadels.push(s.id);
    createCamp(citadelLayoutCached(s));
  }
  noteCave(cx, cy);
  return c;
}

// сохранения до новых залежей (у старта ~10 000 вместо ~200 000): запас уже открытых залежей уменьшаем
// в той же пропорции, в какой новая залежь меньше старой (выработанное остаётся выработанным)
function shrinkOldOre(c, x0, y0, genRes, genAmt) {
  for (let i = 0; i < CHUNK_AREA; i++) {
    const r = c.res[i];
    if (r < RES_ID.stone || r > RES_ID.mithril || genRes[i] !== r) continue;
    const x = x0 + i % CHUNK, y = y0 + Math.floor(i / CHUNK), p = patchAtTile(x, y);
    if (!p) continue;
    const oldG = Math.min(65000, Math.floor(ORE_BASE[r] * p.rich * (1.3 - dist(x, y, p.x, p.y) / p.r * 0.6))), newG = genAmt[i];
    if (oldG > newG) c.amt[i] = Math.max(1, Math.min(newG, Math.round(c.amt[i] * newG / oldG)));
  }
}

const CAMP_CACHE = new Map();
function campLayout(cx, cy) {
  const key = ck(cx, cy);
  if (CAMP_CACHE.has(key)) return CAMP_CACHE.get(key);
  const res = campLayoutGen(cx, cy);
  CAMP_CACHE.set(key, res);
  return res;
}
// Цитадели орков — самые сильные лагеря, одна из целей игры: четыре на краю карты радиусом 400 (север, юг, запад, восток),
// дальше кольцами через каждые 400 клеток (на втором кольце — восемь и т. д.). Место — по кругу, сдвинутое с воды на сушу.
const CIT_CACHE = new Map(), _ctile = { g: 0, r: 0, a: 0 };
function citadelSite(k, i) {
  const key = k + ',' + i;
  if (CIT_CACHE.has(key)) return CIT_CACHE.get(key);
  const n = 4 * k, a = -Math.PI / 2 + i * Math.PI * 2 / n;
  let site = null;
  for (let r = 400 * k; r < 400 * k + 120; r += 4) {
    const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
    genTile(x, y, _ctile);
    if (_ctile.g === GROUND.water || _ctile.g === GROUND.swamp) continue;
    // не на залежи руды: стены цитадели не должны резать месторождение
    if (patchesIn(x - 30, y - 30, x + 30, y + 30).some(p => dist(x, y, p.x, p.y) < p.r + 20)) continue;
    site = { x, y, id: 'cit' + key }; break;
  }
  CIT_CACHE.set(key, site);
  return site;
}
// цитадели, чьи места попадают в этот чанк
function citadelsIn(cx, cy) {
  const out = [], d = Math.hypot(cx + 0.5, cy + 0.5) * CHUNK, k = Math.round(d / 400);
  if (k < 1 || Math.abs(d - 400 * k) > 160) return out;
  for (let i = 0; i < 4 * k; i++) { const s = citadelSite(k, i); if (s && Math.floor(s.x / CHUNK) === cx && Math.floor(s.y / CHUNK) === cy) out.push(s); }
  return out;
}
function nearCitadel(x, y, r) {
  const d = Math.hypot(x, y), k = Math.round(d / 400);
  if (k < 1 || Math.abs(d - 400 * k) > r + 120) return false;
  for (let i = 0; i < 4 * k; i++) { const s = citadelSite(k, i); if (s && dist(x, y, s.x, s.y) < r) return true; }
  return false;
}
function citadelLayout(s) {
  const { x, y } = s, structs = [], occ = new Set();
  const R = prng(Math.floor(hash2(x, y, SEED + 4242) * 1e9));
  const put = (kind, sx, sy) => {
    const w = CAMP_STRUCT[kind].w;
    for (let yy = sy; yy < sy + w; yy++) for (let xx = sx; xx < sx + w; xx++) if (occ.has(xx + ',' + yy)) return;
    for (let yy = sy; yy < sy + w; yy++) for (let xx = sx; xx < sx + w; xx++) occ.add(xx + ',' + yy);
    structs.push({ x: sx, y: sy, kind });
  };
  const ring = (rad, gaps) => {
    const n = Math.round(Math.PI * 2 * rad * 2);
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      if (gaps.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.22)) continue;
      const k = rad / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      put('stonewall_c', Math.round(x + Math.cos(a) * k), Math.round(y + Math.sin(a) * k));
    }
  };
  const gate = R() * Math.PI * 2;
  put('keep', x - 1, y - 1);
  put('warhall', x - 6, y - 1); put('warhall', x + 4, y - 1);
  put('bonfire', x, y + 3); put('bonfire', x, y - 3);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; put('otent', Math.round(x + Math.cos(a) * 7.5 - 1), Math.round(y + Math.sin(a) * 7.5 - 1)); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 1; put('cage', Math.round(x + Math.cos(a) * 4.5), Math.round(y + Math.sin(a) * 4.5)); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.78; put('totem', Math.round(x + Math.cos(a) * 9.5), Math.round(y + Math.sin(a) * 9.5)); }
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) put('watchtower', Math.round(x + dx * 10.5 - 1), Math.round(y + dy * 10.5 - 1));
  ring(12.5, [gate, gate + Math.PI]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; put('watchtower', Math.round(x + Math.cos(a) * 15.5 - 1), Math.round(y + Math.sin(a) * 15.5 - 1)); }
  ring(17.5, [gate + Math.PI / 2, gate + Math.PI * 1.5]);
  return { type: 'citadel', x, y, structs, key: s.id };
}
const CIT_LAYOUT = new Map();
function citadelLayoutCached(s) { if (!CIT_LAYOUT.has(s.id)) CIT_LAYOUT.set(s.id, citadelLayout(s)); return CIT_LAYOUT.get(s.id); }
function campLayoutGen(cx, cy) {
  if ((cy + 1) * CHUNK >= DUNGEON.y0 - 64) return null; // под землёй лагерей нет
  const dc = Math.sqrt(cx * cx + cy * cy);
  if (dc < 2.6) return null;
  if (nearCitadel((cx + 0.5) * CHUNK, (cy + 0.5) * CHUNK, 45)) return null; // у цитадели обычных лагерей нет
  const h = hash2(cx, cy, SEED + 999), h2 = hash2(cx, cy, SEED + 1999);
  let type = null;
  if (dc >= 7 && h < 0.08) type = 'orc_big';
  else if (dc >= 4.5 && h < 0.21 + Math.min(0.1, dc * 0.005)) type = 'orc';
  else if (h < (dc < 12 ? 0.34 : 0.42)) type = 'goblin';
  if (!type) return null;
  const x = cx * CHUNK + 10 + Math.floor(h2 * 12), y = cy * CHUNK + 10 + Math.floor(hash2(cx, cy, SEED + 2999) * 12);
  // лагерь не ставим на залежь руды и в озеро
  for (const p of patchesIn(x - 24, y - 24, x + 24, y + 24)) if (dist(x, y, p.x, p.y) < p.r + 13) return null;
  const elev = (xx, yy) => fbm(xx / 48, yy / 48, SEED, 4) + Math.max(0, 1 - Math.hypot(xx, yy) / 28) * 0.35;
  if (elev(x, y) < 0.36) return null;
  const R = prng(Math.floor(hash2(cx, cy, SEED + 77) * 1e9));
  const structs = [];
  const occ = new Set();
  const free = (sx, sy, w) => { for (let yy = sy - (w > 1 ? 1 : 0); yy < sy + w + (w > 1 ? 1 : 0); yy++) for (let xx = sx - (w > 1 ? 1 : 0); xx < sx + w + (w > 1 ? 1 : 0); xx++) if (occ.has(xx + ',' + yy)) return false; return true; };
  const put = (kind, sx, sy) => {
    const w = CAMP_STRUCT[kind].w;
    if (!free(sx, sy, w)) return false;
    for (let yy = sy; yy < sy + w; yy++) for (let xx = sx; xx < sx + w; xx++) occ.add(xx + ',' + yy);
    structs.push({ x: sx, y: sy, kind });
    return true;
  };
  const ring = (kind, rad, gaps, square) => {
    // кольцо стены с проходами (gaps — углы проходов в радианах); соседние клетки — только по стороне, без диагоналей
    const done = new Set();
    const n = Math.round(Math.PI * 2 * rad * 2);
    let prev = null;
    const add = (px, py) => { const k2 = px + ',' + py; if (done.has(k2)) return; done.add(k2); put(kind, px, py); };
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2;
      if (gaps.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.32)) { prev = null; continue; }
      let px, py;
      if (square) { const k = rad / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))); px = Math.round(x + Math.cos(a) * k); py = Math.round(y + Math.sin(a) * k); }
      else { px = Math.round(x + Math.cos(a) * rad); py = Math.round(y + Math.sin(a) * rad); }
      if (prev && prev[0] !== px && prev[1] !== py) add(px, prev[1]);
      add(px, py);
      prev = [px, py];
    }
  };
  const around = (kind, n, rad, off) => {
    const w = CAMP_STRUCT[kind].w;
    for (let i = 0; i < n; i++) {
      const a = (off || 0) + i / n * Math.PI * 2 + (R() - 0.5) * 0.4, r = rad + (R() - 0.5) * 1.2;
      put(kind, Math.round(x + Math.cos(a) * r - w / 2), Math.round(y + Math.sin(a) * r - w / 2));
    }
  };
  const gate = R() * Math.PI * 2;
  if (type === 'goblin') {
    put('bonfire', x, y);
    around('ghut', 4 + Math.floor(R() * 3), 4.6, R() * 6);
    around('gtotem', 2, 2.2, R() * 6);
    ring('palisade_c', 7.6, [gate, gate + Math.PI * (0.8 + R() * 0.4)]);
  } else if (type === 'orc') {
    put('warhall', x - 1, y - 1);
    put('bonfire', x, y + 3);
    around('otent', 3 + Math.floor(R() * 2), 5.6, R() * 6);
    around('totem', 2, 3.4, R() * 6);
    around('watchtower', 2, 7.4, gate + Math.PI / 2);
    ring('spikewall', 9.6, [gate, gate + Math.PI]);
  } else {
    put('keep', x - 1, y - 1);
    put('bonfire', x + 3, y);
    around('otent', 3, 5.2, R() * 6);
    around('cage', 2, 3.6, R() * 6);
    put('totem', x - 3, y);
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) put('watchtower', Math.round(x + dx * 8.5 - 1), Math.round(y + dy * 8.5 - 1));
    ring('stonewall_c', 10.5, [gate, gate + Math.PI], true);
  }
  return { type, x, y, structs, key: ck(cx, cy) };
}

// расчистить в чанке место под постройки лагерей (своего и соседних чанков)
function clearCampArea(c) {
  const x0 = c.cx * CHUNK, y0 = c.cy * CHUNK;
  for (let ny = c.cy - 1; ny <= c.cy + 1; ny++) for (let nx = c.cx - 1; nx <= c.cx + 1; nx++) {
    const ls = [campLayout(nx, ny), ...citadelsIn(nx, ny).map(citadelLayoutCached)];
    for (const l of ls) {
    if (!l) continue;
    // вся площадка лагеря без леса и кустов
    const rad = l.type === 'goblin' ? 8.5 : l.type === 'orc' ? 10.5 : l.type === 'citadel' ? 18.5 : 12;
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const dx = x0 + lx - l.x, dy = y0 + ly - l.y;
      if (dx * dx + dy * dy > rad * rad) continue;
      const i = ly * CHUNK + lx;
      if (c.res[i] === RES_ID.tree || c.res[i] === RES_ID.bush) { c.res[i] = 0; c.amt[i] = 0; c.netv = (c.netv || 0) + 1; }
    }
    for (const s of l.structs) {
      const w = CAMP_STRUCT[s.kind].w, m = w > 1 ? 1 : 0;
      for (let yy = s.y - m; yy < s.y + w + m; yy++) for (let xx = s.x - m; xx < s.x + w + m; xx++) {
        const lx = xx - x0, ly = yy - y0;
        if (lx < 0 || ly < 0 || lx >= CHUNK || ly >= CHUNK) continue;
        const i = ly * CHUNK + lx;
        if (c.ground[i] === GROUND.water) c.ground[i] = GROUND.grass;
        c.res[i] = 0; c.amt[i] = 0; c.netv = (c.netv || 0) + 1;
      }
    }
  }
  }
}

// ---------- изменение тайлов ----------
function takeResource(x, y, n) {
  const c = chunkOf(x, y), i = tidx(x, y);
  if (!c.res[i]) return 0;
  const got = Math.min(n, c.amt[i]);
  c.amt[i] -= got;
  c.modified = true;
  c.netv = (c.netv || 0) + 1;
  if (c.amt[i] <= 0) {
    const was = c.res[i];
    c.res[i] = 0;
    // деревья рисуются поверх земли — кэш чанка менять не нужно; под рудой и песком меняется цвет земли
    if (was === RES_ID.tree) c.trees--; else if (was !== RES_ID.crop) redrawTile(x, y);
  }
  return got;
}

// ---------- отрастание деревьев ----------
// раз в секунду: в загруженных чанках возле базы и героя на пустой траве рядом с деревом
// иногда вырастает новое (не вплотную к постройкам), пока лес не вернётся к исходной густоте
const REGROW = { chunkR: 2, tries: 2, chance: 0.35, minTrees: 40 };
function canGrowTree(c, i, x, y) {
  if (c.res[i] || c.bld[i]) return false;
  if (!SOIL.has(c.ground[i])) return false;
  let trees = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nc = peekChunk(Math.floor((x + dx) / CHUNK), Math.floor((y + dy) / CHUNK));
    if (!nc) return false;
    const j = tidx(x + dx, y + dy);
    if (nc.bld[j]) return false;
    if (nc.res[j] === RES_ID.tree) trees++;
  }
  if (!trees) return false;
  if (campStructAt(x, y)) return false;
  const p = S.player;
  return Math.abs(p.x - x - 0.5) > 1 || Math.abs(p.y - y - 0.5) > 1;
}
function regrowTrees() {
  const seen = new Set();
  const centers = [baseCenter(), S.player];
  for (const cn of centers) {
    const ccx = Math.floor(cn.x / CHUNK), ccy = Math.floor(cn.y / CHUNK);
    for (let cy = ccy - REGROW.chunkR; cy <= ccy + REGROW.chunkR; cy++) for (let cx = ccx - REGROW.chunkR; cx <= ccx + REGROW.chunkR; cx++) {
      const k = ck(cx, cy);
      if (seen.has(k)) continue;
      seen.add(k);
      const c = peekChunk(cx, cy);
      if (!c || c.trees >= Math.max(c.trees0 || 0, REGROW.minTrees)) continue;
      for (let t = 0; t < REGROW.tries; t++) {
        if (Math.random() > REGROW.chance) continue;
        const i = Math.floor(Math.random() * CHUNK_AREA);
        const x = cx * CHUNK + (i % CHUNK), y = cy * CHUNK + Math.floor(i / CHUNK);
        if (!canGrowTree(c, i, x, y)) continue;
        c.res[i] = RES_ID.tree; c.amt[i] = 4 + Math.floor(Math.random() * 5);
        c.trees++; c.modified = true; c.netv = (c.netv || 0) + 1;
      }
    }
  }
}

// ---------- туман войны ----------
function explore(px, py, r) {
  const r2 = r * r;
  const x0 = Math.floor(px - r), x1 = Math.ceil(px + r), y0 = Math.floor(py - r), y1 = Math.ceil(py + r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (dist2(x + 0.5, y + 0.5, px, py) > r2) continue;
    const c = chunkOf(x, y), i = tidx(x, y);
    if (!c.explored[i]) { c.explored[i] = 1; c.fogDirty = true; c.expv = (c.expv || 0) + 1; }
  }
}

// ---------- загрязнение ----------
// выход дыма от машин и големов — 60% от того, что они пишут (дым доходил до лагерей в 250 клетках)
function addPollution(x, y, v) {
  if (v > 0) v *= TUNE.pollEmit;
  if (v > 0 && S) S.pollTotal = (S.pollTotal || 0) + v;
  const k = ck(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
  POLL.set(k, (POLL.get(k) || 0) + v);
}
function pollutionAt(x, y) { return POLL.get(ck(Math.floor(x / CHUNK), Math.floor(y / CHUNK))) || 0; }
// раз в секунду: Накопление = Вход + Генерация − Выход − Поглощение
function diffusePollution() {
  const delta = new Map();
  for (const [k, v] of POLL) {
    if (v < 0.002) { POLL.delete(k); continue; }
    const [cx, cy] = k.split(',').map(Number);
    // расходится медленно (0,5% в каждую сторону в секунду), поглощается землёй и сильнее лесом:
    // на базе дым густой и держится несколько минут после остановки завода, слабый хвост — до ~100–130 клеток
    const spread = v * TUNE.pollSpread;
    for (const [dx, dy] of DIRS) {
      const nk = ck(cx + dx, cy + dy);
      delta.set(nk, (delta.get(nk) || 0) + spread);
    }
    const c = peekChunk(cx, cy);
    const absorb = v * (TUNE.pollAbsorb + (c ? c.trees * TUNE.pollForest : TUNE.pollAbsorb * 2));
    delta.set(k, (delta.get(k) || 0) - spread * 4 - absorb);
  }
  for (const [k, d] of delta) {
    const nv = (POLL.get(k) || 0) + d;
    if (nv > 0.002) POLL.set(k, nv); else POLL.delete(k);
  }
}

function updateFogCanvas(c) {
  if (!c.fog) { c.fog = document.createElement('canvas'); c.fog.width = c.fog.height = CHUNK; }
  const g = c.fog.getContext('2d');
  const img = g.createImageData(CHUNK, CHUNK);
  for (let i = 0; i < CHUNK_AREA; i++) {
    img.data[i * 4] = 8; img.data[i * 4 + 1] = 6; img.data[i * 4 + 2] = 4;
    img.data[i * 4 + 3] = c.explored[i] ? 0 : 255;
  }
  g.putImageData(img, 0, 0);
  c.fogDirty = false;
  c.fullyExplored = c.explored.every(v => v === 1);
}
// освобождаем кэш далёких чанков
function trimChunkCanvases(camx, camy) {
  for (const c of W.values()) {
    if (!c.canvas) continue;
    const dx = (c.cx + 0.5) * CHUNK - camx, dy = (c.cy + 0.5) * CHUNK - camy;
    if (dx * dx + dy * dy > 110 * 110) { c.canvas = null; c.oldCanvas = null; c.fog = null; c.fogDirty = true; }
  }
}
