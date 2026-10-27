'use strict';
// Осады с таранами и катапультами; подземелья в рудных горах (тёмные пещеры с рудой, сундуками и пещерным троллем).

// ---------- осады ----------
function gateCount() { let n = 0; for (const b of bldKind('wall')) if (BUILDINGS[b.type].gate) n++; return n; }
const SIEGES_ON = true; // осады: false — выключить (машины с прошлых осад тогда убираются)
function siegeTick() {
  if (!SIEGES_ON) {
    // оставшиеся от прежних осад машины убираем, чтобы не грузили игру
    if (S.enemies.some(e => ENEMIES[e.type].siege)) S.enemies = S.enemies.filter(e => !ENEMIES[e.type].siege);
    S.siegeActive = null;
    return;
  }
  // осада отбита: машин не осталось — проверяем, целы ли все ворота
  if (S.siegeActive && !S.enemies.some(e => ENEMIES[e.type].siege)) {
    const held = gateCount() >= S.siegeActive.gates && S.siegeActive.gates > 0;
    log(held ? 'Осада отбита! Все ворота устояли.' : 'Осада закончилась.', 'good');
    if (held) S.stats.siegeHeld = 1;
    S.siegeActive = null;
  }
  S.siegeT = (S.siegeT == null ? 3600 : S.siegeT) - 1;
  if (S.siegeT > 0 || S.buildings.size < 25) return;
  S.siegeT = rand(TUNE.siegeMin, TUNE.siegeMax);
  startSiege();
}
function startSiege() {
  const bc = baseCenter();
  let best = null, bd = 1e9;
  for (const c of S.camps) {
    if (!c.alive || c.type === 'elf') continue;
    const d = dist(c.x, c.y, bc.x, bc.y) * (c.type === 'goblin' ? 1.6 : 1); // орки охотнее идут на штурм
    if (d < bd && d < 320) { bd = d; best = c; }
  }
  if (!best) return false;
  const n = Math.max(1, Math.round((1 + Math.floor((S.evo || 0) * 2)) * TUNE.siegeCount)); // до 3 таранов и 3 катапульт: осаду можно отбить башнями и баллистами
  for (let i = 0; i < n; i++) spawnEnemy('ram', best.x + rand(-3, 3), best.y + rand(-3, 3), 'raid', { campId: best.id });
  for (let i = 0; i < n; i++) spawnEnemy('catapult', best.x + rand(-3, 3), best.y + rand(-3, 3), 'raid', { campId: best.id });
  S.siegeActive = { gates: gateCount(), t: S.time };
  sendRaid(best, 1.3, `⚔ ОСАДА! ${n} тарана и ${n} катапульты с охраной`);
  sfx('elf'); shake(2);
  return true;
}

// ---------- подземелья ----------
const DUNGEON = { y0: 200000, stride: 256, size: 120 };
const DUNGEON_CACHE = new Map();
function inDungeonY(y) { return y >= DUNGEON.y0 - 8; }
function dungeonIdAt(x) { return Math.floor(x / DUNGEON.stride); }
// простой воспроизводимый генератор случайных чисел
function mulberry(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// раскладка: залы и ходы; ближе к выходу — железо и медь, в глубине — золото и мифрил
function dungeonLayout(id) {
  if (DUNGEON_CACHE.has(id)) return DUNGEON_CACHE.get(id);
  const N = DUNGEON.size, grid = new Uint8Array(N * N), ores = new Map();
  const rnd = mulberry(SEED * 31 + id * 7919 + 13);
  const rooms = [{ x: 6, y: 54, w: 10, h: 10 }];
  for (let t = 0; t < 200 && rooms.length < 15; t++) {
    const w = 8 + Math.floor(rnd() * 8), h = 7 + Math.floor(rnd() * 7);
    const x = 4 + Math.floor(rnd() * (N - w - 8)), y = 4 + Math.floor(rnd() * (N - h - 8));
    if (rooms.some(r => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h });
  }
  const carve = (x, y) => { if (x > 1 && y > 1 && x < N - 2 && y < N - 2) grid[y * N + x] = 1; };
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
  // ходы: каждый зал — к ближайшему из уже соединённых
  const cx = r => Math.floor(r.x + r.w / 2), cy = r => Math.floor(r.y + r.h / 2);
  for (let i = 1; i < rooms.length; i++) {
    let j = 0, bd = 1e9;
    for (let k = 0; k < i; k++) { const d = Math.hypot(cx(rooms[i]) - cx(rooms[k]), cy(rooms[i]) - cy(rooms[k])); if (d < bd) { bd = d; j = k; } }
    let x = cx(rooms[i]), y = cy(rooms[i]); const tx = cx(rooms[j]), ty = cy(rooms[j]);
    const hFirst = rnd() < 0.5;
    const stepX = () => { while (x !== tx) { carve(x, y); carve(x, y + 1); x += Math.sign(tx - x); } };
    const stepY = () => { while (y !== ty) { carve(x, y); carve(x + 1, y); y += Math.sign(ty - y); } };
    if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  }
  // неровные стены пещеры
  for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) {
    if (grid[y * N + x]) continue;
    const nb = grid[(y - 1) * N + x] + grid[(y + 1) * N + x] + grid[y * N + x - 1] + grid[y * N + x + 1];
    if (nb >= 2 && rnd() < 0.35) grid[y * N + x] = 2; // 2 — отметка, ниже станет полом
  }
  for (let i = 0; i < grid.length; i++) if (grid[i] === 2) grid[i] = 1;
  // зал босса — самый дальний от входа
  let boss = 1, far = 0;
  for (let i = 1; i < rooms.length; i++) { const d = Math.hypot(cx(rooms[i]) - cx(rooms[0]), cy(rooms[i]) - cy(rooms[0])); if (d > far) { far = d; boss = i; } }
  // рудные жилы в залах
  rooms.forEach((r, i) => {
    if (i === 0) return;
    const depth = Math.hypot(cx(r) - cx(rooms[0]), cy(r) - cy(rooms[0])) / far;
    const pool = depth > 0.7 ? [RES_ID.gold, RES_ID.mithril, RES_ID.iron] : depth > 0.4 ? [RES_ID.iron, RES_ID.gold, RES_ID.coal, RES_ID.sulfur] : [RES_ID.iron, RES_ID.copper, RES_ID.coal, RES_ID.stone];
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const ox = r.x + 1 + Math.floor(rnd() * (r.w - 2)), oy = r.y + 1 + Math.floor(rnd() * (r.h - 2)), res = pool[Math.floor(rnd() * pool.length)];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (rnd() < 0.75) ores.set((oy + dy) * N + ox + dx, res);
    }
  });
  const L = { grid, ores, rooms, boss, far };
  DUNGEON_CACHE.set(id, L);
  return L;
}
// клетка подземелья для генератора мира
function dungeonTile(x, y, out) {
  const id = dungeonIdAt(x), lx = x - id * DUNGEON.stride, ly = y - DUNGEON.y0;
  out.r = 0; out.a = 0;
  if (id < 0 || lx < 0 || ly < 0 || lx >= DUNGEON.size || ly >= DUNGEON.size) { out.g = GROUND.wall; return; }
  const L = dungeonLayout(id), i = ly * DUNGEON.size + lx;
  if (!L.grid[i]) { out.g = GROUND.wall; return; }
  out.g = GROUND.rock;
  const o = L.ores.get(i);
  if (o) { out.r = o; out.a = 4000; }
}
function dungeonOrigin(id) { return { x: id * DUNGEON.stride, y: DUNGEON.y0 }; }

// первый спуск: выход, охрана, сундуки, тролль
function populateDungeon(d) {
  const L = dungeonLayout(d.id), o = dungeonOrigin(d.id), rnd = mulberry(SEED + d.id * 104729);
  const cxr = r => o.x + Math.floor(r.x + r.w / 2), cyr = r => o.y + Math.floor(r.y + r.h / 2);
  const st = L.rooms[0];
  const ex = newBuilding('cave_exit', cxr(st) - 1, cyr(st) - 1, 0); registerBuilding(ex);
  L.rooms.forEach((r, i) => {
    if (i === 0) return;
    const depth = Math.hypot(r.x - st.x, r.y - st.y) / L.far;
    const x = cxr(r), y = cyr(r);
    if (i === L.boss) {
      const t = spawnEnemy('cave_troll', x, y, 'guard', { dg: d.id });
      t.hp = t.maxHp = Math.round(ENEMIES.cave_troll.hp * (1 + (S.evo || 0)));
      for (let k = 0; k < 2; k++) spawnEnemy('orc_brute', x + rand(-2, 2), y + rand(-2, 2), 'guard', { dg: d.id });
    } else {
      const n = 2 + Math.floor(rnd() * 3 + depth * 2);
      const pool = depth > 0.5 ? ['orc_brute', 'orc_thrower', 'orc_shaman', 'goblin_chief'] : ['goblin', 'goblin', 'goblin_archer', 'orc_thrower'];
      for (let k = 0; k < n; k++) spawnEnemy(pool[Math.floor(rnd() * pool.length)], x + rand(-2, 2), y + rand(-2, 2), 'guard', { dg: d.id });
    }
    // сундук с добычей — в половине залов и всегда у тролля
    if (i === L.boss || rnd() < 0.5) {
      const cx = r.x + r.w - 2 + o.x, cy = r.y + 1 + o.y;
      if (!bldAt(cx, cy)) {
        const ch = newBuilding('loot_chest', cx, cy, 0); registerBuilding(ch);
        const k = i === L.boss ? 3 : 1 + depth;
        ch.inv.add('gold', Math.round((3 + rnd() * 8) * k));
        if (rnd() < 0.4 * k) ch.inv.add('gem', Math.round(1 + rnd() * 2 * k));
        ch.inv.add(pick(['iron', 'copper', 'steel', 'bronze']), Math.round((10 + rnd() * 30) * k));
        if (depth > 0.5 || i === L.boss) ch.inv.add('mithril', Math.round((1 + rnd() * 4) * k));
        if (rnd() < 0.25 * k) ch.inv.add('relic', 1);
        if (rnd() < 0.3) ch.inv.add(pick(['f3', 'f4', 'f5']), Math.round(2 + rnd() * 4));
        if (rnd() < 0.2) ch.inv.add(pick(['mod_speed', 'repair', 'explosive', 'rune']), Math.round(1 + rnd() * 3));
      }
    }
  });
  d.populated = true;
}

// ---------- входы в подземелья: отдельные пещеры на карте (в горы не залезть — их только копают) ----------
// место пещеры задано сидом по чанку, как лагеря; сам вход — постройка, его создаёт хозяин и шлёт гостям
const CAVE_CACHE = new Map(), CAVE_QUEUE = [], _cvt = { g: 0, r: 0, a: 0 };
function caveLayout(cx, cy) {
  const key = ck(cx, cy);
  if (!CAVE_CACHE.has(key)) CAVE_CACHE.set(key, caveLayoutGen(cx, cy));
  return CAVE_CACHE.get(key);
}
function caveLayoutGen(cx, cy) {
  if ((cy + 1) * CHUNK >= DUNGEON.y0 - 200) return null;
  const dc = Math.hypot(cx, cy);
  if (dc < 2.6 || hash2(cx, cy, SEED + 5151) > (dc < 7 ? 0.16 : 0.08)) return null;
  const x = cx * CHUNK + 8 + Math.floor(hash2(cx, cy, SEED + 5252) * 14), y = cy * CHUNK + 8 + Math.floor(hash2(cx, cy, SEED + 5353) * 14);
  for (let ny = cy - 1; ny <= cy + 1; ny++) for (let nx = cx - 1; nx <= cx + 1; nx++) { const l = campLayout(nx, ny); if (l && dist(x + 1.5, y + 1.5, l.x, l.y) < 22) return null; }
  for (const p of patchesIn(x - 20, y - 20, x + 20, y + 20)) if (dist(x + 1.5, y + 1.5, p.x, p.y) < p.r + 6) return null;
  for (let yy = y - 1; yy <= y + 4; yy++) for (let xx = x - 1; xx <= x + 3; xx++) {
    genTile(xx, yy, _cvt);
    if (_cvt.g === GROUND.water || _cvt.g === GROUND.swamp || _cvt.r === RES_ID.mount) return null;
  }
  return { x, y };
}
// площадка у входа без леса и камней (у всех игроков одинаково)
function clearCaveArea(c) {
  const x0 = c.cx * CHUNK, y0 = c.cy * CHUNK;
  for (let ny = c.cy - 1; ny <= c.cy + 1; ny++) for (let nx = c.cx - 1; nx <= c.cx + 1; nx++) {
    const l = caveLayout(nx, ny);
    if (!l) continue;
    for (let yy = l.y - 1; yy <= l.y + 4; yy++) for (let xx = l.x - 1; xx <= l.x + 3; xx++) {
      const lx = xx - x0, ly = yy - y0;
      if (lx < 0 || ly < 0 || lx >= CHUNK || ly >= CHUNK) continue;
      c.res[ly * CHUNK + lx] = 0; c.amt[ly * CHUNK + lx] = 0;
    }
  }
}
// вызывается из genChunk: запоминаем пещеру, постройку ставим в ближайшем тике (чанк ещё не в мире)
function noteCave(cx, cy) {
  const l = caveLayout(cx, cy);
  if (!l || !S || (typeof MP !== 'undefined' && MP.role === 'client')) return;
  S.caveChunks = S.caveChunks || [];
  if (S.caveChunks.includes(ck(cx, cy))) return;
  S.caveChunks.push(ck(cx, cy));
  CAVE_QUEUE.push({ l, s: S });
}
function spawnCaveEntrances() {
  while (CAVE_QUEUE.length) {
    const { l, s } = CAVE_QUEUE.shift();
    if (s !== S) continue;
    let busy = false;
    for (let yy = l.y; yy < l.y + 3; yy++) for (let xx = l.x; xx < l.x + 3; xx++) {
      if (bldAt(xx, yy)) busy = true;
      else if (resAt(xx, yy)) { const c = chunkOf(xx, yy), i = tidx(xx, yy); if (c.res[i] === RES_ID.tree) c.trees--; c.res[i] = 0; c.amt[i] = 0; c.modified = true; c.netv = (c.netv || 0) + 1; if (c.canvas) { c.oldCanvas = c.canvas; c.canvas = null; } }
    }
    if (busy) continue;
    S.dungeons = S.dungeons || [];
    const id = S.dungeons.reduce((m, d) => Math.max(m, d.id), 0) + 1;
    const b = newBuilding('cave_entrance', l.x, l.y, 0); b.dg = id;
    registerBuilding(b);
    S.dungeons.push({ id, ex: l.x, ey: l.y });
  }
}

function nearEntrance(p) { for (const b of bldType('cave_entrance')) if (dist(b.x + 1.5, b.y + 1.5, p.x, p.y) < 3.3) return b; return null; }
function nearExit(p) { for (const b of bldType('cave_exit')) if (dist(b.x + 1, b.y + 1, p.x, p.y) < 3) return b; return null; }
function isMpClient() { return typeof MP !== 'undefined' && MP.role === 'client'; }

// G: спуститься в пещеру у входа / подняться у светящейся лестницы
function toggleDungeon() {
  const p = S.player;
  if (p.dead > 0) return;
  if (inDungeonY(p.y)) {
    if (!nearExit(p)) { hint('Подойдите к выходу из пещеры (светящаяся лестница в первом зале)'); return; }
    const ret = p.dgRet || S.spawn;
    p.x = ret.x; p.y = ret.y; p.riding = false; CAM.x = p.x; CAM.y = p.y; explore(p.x, p.y, 14);
    log('Вы поднялись на поверхность.', 'good'); sfx('build');
    return;
  }
  const ent = nearEntrance(p);
  if (!ent) { hint('Подземелья — в отдельных пещерах с фонарями у входа (ищите на карте). В горы не залезть, их только копают.'); return; }
  if (ent.done) { hint('Это подземелье уже пройдено — вход обвалился.'); return; }
  enterDungeon(p, ent);
  // у гостя: хозяин заселяет подземелье врагами и сундуками
  if (isMpClient() && typeof mpCmd === 'function') mpCmd({ f: 'dungeon', id: ent.id });
}
function enterDungeon(p, ent) {
  S.dungeons = S.dungeons || [];
  let d = S.dungeons.find(o => o.id === ent.dg);
  if (!d) { d = { id: ent.dg, ex: ent.x, ey: ent.y }; S.dungeons.push(d); }
  p.dgRet = { x: ent.x + 1.5, y: ent.y + 3.8 };
  const L = dungeonLayout(d.id), o = dungeonOrigin(d.id), st = L.rooms[0];
  p.x = o.x + st.x + st.w / 2 + 0.5; p.y = o.y + st.y + st.h / 2 + 2; p.riding = false;
  if (!isMpClient() && !d.populated) populateDungeon(d);
  if (p === S.player || !(typeof MP !== 'undefined' && MP.silent)) { CAM.x = p.x; CAM.y = p.y; }
  explore(p.x, p.y, 10);
  log('Вы спустились в подземелье. Где-то в глубине живёт пещерный тролль — победите его, и подземелье будет пройдено. G у светящейся лестницы — наверх.', 'warn');
  sfx('arcane');
}

// подсказка рядом с входом или выходом; у хозяина — новые входы в пещеры
let dgHintT = 0;
function dungeonHintTick(dt) {
  if (CAVE_QUEUE.length && !isMpClient()) spawnCaveEntrances();
  dgHintT -= dt;
  if (dgHintT > 0) return;
  dgHintT = 1;
  const p = S.player;
  if (inDungeonY(p.y)) { if (nearExit(p)) hint('G — подняться на поверхность'); return; }
  const ent = nearEntrance(p);
  if (ent) hint(ent.done ? 'Подземелье пройдено — вход обвалился' : 'G — спуститься в подземелье');
}

function onTrollKilled(e) {
  // добыча — тому герою, кто ближе к троллю (в совместной игре это может быть друг)
  const h = nearestHero(e.x, e.y, 40) || S.player;
  const loot = { relic: 2, mithril: 15, gold: 25, gem: 10, clockwork: 2 };
  for (const id in loot) h.inv.add(id, loot[id]);
  S.stats.trolls = (S.stats.trolls || 0) + 1;
  const d = (S.dungeons || []).find(o => o.id === e.dg); if (d) d.cleared = true;
  // подземелье проходится один раз: вход обваливается, выйти можно по лестнице
  for (const b of bldType('cave_entrance')) if (b.dg === e.dg) { b.done = true; BLD_VER++; }
  log('Пещерный тролль повержен! Добыча: 2 реликвии, 10 самоцветов, 15 мифрила, 25 золота, 2 заводных механизма. Подземелье пройдено — вход за вами обвалится.', 'good');
  sfx('victory');
}
