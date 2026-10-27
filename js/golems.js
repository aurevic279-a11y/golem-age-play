'use strict';
// Ходячие големы: дровосеки, шахтёры и землепашцы. Сами ищут работу, добывают и носят в сундук.
// Ходят в обход стен (свои ворота открываются), при набеге прячутся за стенами.

const GOLEM = { radius: 9, cap: 20, speed: 1.8, rate: 0.4, chestRadius: 30, burn: 1, fuelLow: 30, fuelFull: 150, emptySpeed: 0.18, hp: 80 };
// землепашец: грядки в радиусе от места создания, время роста, урожай с грядки
const FARM = { radius: 3, plots: 8, grow: 150, yield: { wheat: 1, berries: 1 } };
const GOLEM_FUELS = ['coal', 'wood', 'plank'];
// зона работы голема: прямоугольник (если задан) или круг радиуса GOLEM.radius вокруг места создания
function inGolemZone(g, x, y, pad) {
  const z = g.zone;
  if (z) return x >= z.x0 - (pad || 0) && x <= z.x1 + (pad || 0) && y >= z.y0 - (pad || 0) && y <= z.y1 + (pad || 0);
  return dist(x, y, g.hx, g.hy) <= (g.type === 'fueler' ? FUELER.radius : GOLEM.radius) + (pad || 0);
}
const RESV = new Map(); // занятые клетки: ключ -> id голема

// Заряд Анимансера: сколько големов его магия держит без надрыва. 10 + по одному за каждое изученное исследование;
// в совместной игре заряд общий и на 20% больше. Сверх лимита — растущие штрафы к здоровью, скорости и крафту.
function golemCount() { let n = S.golems.length; for (const b of bldType('treadwheel')) if (b.wheelGolem) n++; return n; }
function golemLimit() {
  let n = 10 + S.research.done.length;
  if (typeof MP !== 'undefined' && (MP.role === 'client' || MP.role === 'host' && Object.keys(MP.guests).length)) n = Math.floor(n * 1.2);
  return n;
}
// доля штрафа 0..1: 1 голем сверх — 13%, 5 — 43%, 10 — 60%
function golemOverload() { const over = golemCount() - golemLimit(); return over > 0 ? 1 - 1 / (1 + over * 0.15) : 0; }
function spawnGolem(type, x, y) {
  const g = { id: S.nextId++, type, x, y, hx: x, hy: y, state: 'seek', tx: 0, ty: 0, carry: null, n: 0, fuel: 120, work: 0, mods: [], filter: type === 'farmer' ? 'wheat' : 'any', wait: 0, status: '', hp: GOLEM.hp };
  S.golems.push(g);
  return g;
}

function golemMult(g) {
  let s = 1 + (S.bonus.golem || 0) + (golemCore(g).speed || 0) + (g.legs ? GOLEM_PARTS.legs.speed : 0);
  for (const m of g.mods) if (m === 'mod_speed') s += 0.3;
  return s;
}
function golemBurn(g) {
  let s = 1;
  for (const m of g.mods) { if (m === 'mod_speed') s += 0.3; if (m === 'mod_eff') s -= 0.4; }
  if (g.firebox) s -= GOLEM_PARTS.firebox.burn;
  return Math.max(0.2, s);
}

function golemWants(g, r) {
  if (!r || g.type === 'farmer' && !g.self || g.type === 'fueler' || g.type === 'porter') return false;
  if (g.self) return r === RES_ID.tree; // рубит дерево себе на топливо
  if (g.type === 'lumber') return r === RES_ID.tree;
  if (g.filter !== 'any') return r === +g.filter;
  return (r >= 2 && r <= 8) || r === RES_ID.sand;
}

function rkey(x, y) { return x + ',' + y; }
function release(g) {
  const k = rkey(g.tx, g.ty);
  if (RESV.get(k) === g.id) RESV.delete(k);
}

function findResource(g) {
  const R = GOLEM.radius, hx = Math.floor(g.hx), hy = Math.floor(g.hy), z = g.zone;
  const X0 = z ? z.x0 : hx - R, X1 = z ? z.x1 : hx + R, Y0 = z ? z.y0 : hy - R, Y1 = z ? z.y1 : hy + R;
  let best = null, bd = 1e9;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    if (!z && (x - hx) * (x - hx) + (y - hy) * (y - hy) > R * R) continue;
    const c = chunkOf(x, y), i = tidx(x, y);
    if (!golemWants(g, c.res[i]) || c.bld[i]) continue;
    const k = rkey(x, y);
    if (RESV.has(k) && RESV.get(k) !== g.id) continue;
    // голем привязан к месту: в первую очередь ресурсы ближе к дому (в прямоугольной зоне — ближе к себе)
    const d = (z ? 0 : dist2(x + 0.5, y + 0.5, g.hx, g.hy) * 2) + dist2(x + 0.5, y + 0.5, g.x, g.y);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

// заполненность дровяника (0..1) по клеткам
function woodpileFill(b) { return b.inv.n / (b.inv.cap * 50); }
// куда нести ношу: топливо — сначала в дровяник, пока он заполнен меньше чем наполовину; остальное — в сундуки-склады
function golemChests(g) {
  if (g.chests && g.chests.length) { const l = g.chests.map(id => S.buildings.get(id)).filter(b => b && BUILDINGS[b.type].kind === 'chest'); if (l.length) return l; }
  return null;
}
function findChest(g) {
  const item = g.carry || 'stone', fuel = GOLEM_FUELS.includes(item);
  // привязан к своим сундукам — несёт только туда (на любом расстоянии), ближайший со свободным местом
  const own = golemChests(g);
  if (own) { let best = null, bd = 1e18; for (const b of own) { if (b.inv.space(item) <= 0) continue; const d = dist2(b.x + 0.5, b.y + 0.5, g.x, g.y); if (d < bd) { bd = d; best = b; } } return best; }
  let best = null, bd = 1e9, pile = null, pd = 1e9, anyPile = null, ad = 1e9;
  for (const b of bldKind('chest')) {
    const d = BUILDINGS[b.type];
    if (g.zone && g.type === 'fueler' ? !inGolemZone(g, b.x + 0.5, b.y + 0.5, 3) : dist(b.x + 0.5, b.y + 0.5, g.hx, g.hy) > GOLEM.chestRadius) continue;
    if (b.inv.space(item) <= 0) continue;
    const dd = dist2(b.x + 0.5, b.y + 0.5, g.x, g.y);
    if (d.sub === 'wood') {
      if (!fuel) continue;
      if (woodpileFill(b) < 0.5 && dd < pd) { pd = dd; pile = b; }
      if (dd < ad) { ad = dd; anyPile = b; }
      continue;
    }
    if (d.sub && d.sub !== 'provide') continue;
    if (dd < bd) { bd = dd; best = b; }
  }
  return pile || best || anyPile;
}

// шахта в рабочей зоне шахтёра, где есть место и подходящая руда. К шахте привязано не больше maxGolems големов
// (b.miners); привязанный ходит только в свою, остальные шахтёры добывают на поверхности, а не ждут очереди
function mineCrew(b) {
  const max = BUILDINGS.mine.maxGolems;
  b.miners = (b.miners || []).filter(id => { const o = S.golems.find(x => x.id === id); return o && o.type === 'miner'; });
  if (b.miners.length > max) b.miners.length = max;
  return b.miners;
}
function findMine(g) {
  if (g.type !== 'miner' || g.self) return null;
  for (const b of bldType('mine')) if (mineCrew(b).includes(g.id)) {
    if ((g.filter === 'any' || +g.filter === b.ore) && inGolemZone(g, b.x + 1.5, b.y + 1.5, 2)) return b;
    b.miners.splice(b.miners.indexOf(g.id), 1); // ушёл из зоны или сменил руду — место свободно
  }
  let best = null, bd = 1e9;
  for (const b of bldType('mine')) {
    if (mineCrew(b).length >= BUILDINGS.mine.maxGolems) continue;
    if (g.filter !== 'any' && +g.filter !== b.ore) continue;
    if (!inGolemZone(g, b.x + 1.5, b.y + 1.5, 2)) continue;
    const d = dist2(b.x + 1.5, b.y + 1.5, g.x, g.y);
    if (d < bd) { bd = d; best = b; }
  }
  if (best) best.miners.push(g.id);
  return best;
}
function minersHeading(b, except) { let n = 0; for (const o of S.golems) if (o !== except && o.state === 'tomine' && o.mine === b.id) n++; return n; }
function mineEntrance(b) { return { x: b.x + 1.5, y: b.y + 3.05 }; }

// без топлива голем еле шевелится, но может дойти до дров
function golemPace(g) { return golemMult(g) * TUNE.golem * (g.fuel > 0 ? 1 : GOLEM.emptySpeed); }

// ---------- путь в обход стен ----------
// прямая свободна? (последние near клеток не проверяем — там сама цель, например сундук)
function lineClear(x0, y0, x1, y1, near, pf) {
  pf = pf || walkable;
  const d = dist(x0, y0, x1, y1), len = d - near, n = Math.ceil(len / 0.25);
  for (let i = 1; i <= n; i++) {
    const k = Math.min(len, i * 0.25) / d;
    if (!pf(Math.floor(x0 + (x1 - x0) * k), Math.floor(y0 + (y1 - y0) * k))) return false;
  }
  return true;
}
// поиск в ширину по клеткам в окне вокруг начала и цели; ворота для своих проходимы (pf — своя проверка проходимости)
const _bfsQ = new Int32Array(80000);
function findPath(sx0, sy0, tx, ty, near, pf) {
  pf = pf || walkable;
  const x0 = Math.floor(sx0), y0 = Math.floor(sy0), gx = Math.floor(tx), gy = Math.floor(ty);
  const minX = Math.min(x0, gx) - 14, minY = Math.min(y0, gy) - 14;
  const W = Math.max(x0, gx) + 14 - minX + 1, H = Math.max(y0, gy) + 14 - minY + 1;
  if (W * H > 80000) return null;
  const prev = new Int32Array(W * H).fill(-1);
  const pass = new Int8Array(W * H); // 0 — не проверено, 1 — можно, 2 — нельзя
  const ok = (x, y) => { const k = (y - minY) * W + (x - minX); if (!pass[k]) pass[k] = pf(x, y) ? 1 : 2; return pass[k] === 1; };
  const start = (y0 - minY) * W + (x0 - minX);
  let qh = 0, qt = 0, goal = -1;
  _bfsQ[qt++] = start; prev[start] = start;
  const reach = (near + 0.55) * (near + 0.55);
  while (qh < qt) {
    const k = _bfsQ[qh++], x = k % W + minX, y = (k / W | 0) + minY;
    if (dist2(x + 0.5, y + 0.5, tx, ty) <= reach) { goal = k; break; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < minX || ny < minY || nx >= minX + W || ny >= minY + H) continue;
      const nk = (ny - minY) * W + (nx - minX);
      if (prev[nk] >= 0 || !ok(nx, ny)) continue;
      if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue; // не срезаем углы стен
      prev[nk] = k; _bfsQ[qt++] = nk;
    }
  }
  if (goal < 0) return null;
  const pts = [];
  for (let k = goal; k !== start; k = prev[k]) pts.push([k % W + minX + 0.5, (k / W | 0) + minY + 0.5]);
  pts.reverse();
  // сглаживание: пропускаем точки, до которых видно напрямую
  const out = [];
  let cx = sx0, cy = sy0;
  for (let i = 0; i < pts.length; i++) {
    const nxt = pts[i + 1];
    if (nxt && lineClear(cx, cy, nxt[0], nxt[1], 0, pf)) continue;
    out.push(pts[i]); cx = pts[i][0]; cy = pts[i][1];
  }
  return out;
}

function moveTo(g, tx, ty, dt, near) {
  const d = dist(g.x, g.y, tx, ty);
  if (d <= near) { g.path = null; return true; }
  const key = tx.toFixed(2) + ',' + ty.toFixed(2);
  if (g.pathKey !== key || g.pathVer !== BLD_VER) {
    g.pathKey = key; g.pathVer = BLD_VER; g.pathI = 0;
    g.path = lineClear(g.x, g.y, tx, ty, near) ? [] : findPath(g.x, g.y, tx, ty, near);
  }
  if (!g.path) {
    // прохода нет (стена без ворот) — ждём и иногда пробуем снова
    g.blockT = (g.blockT || 0) + dt;
    if (g.blockT > 3) { g.blockT = 0; g.pathKey = null; }
    g.noPath = true;
    return false;
  }
  g.noPath = false;
  let wx = tx, wy = ty;
  const last = g.pathI >= g.path.length;
  if (!last) [wx, wy] = g.path[g.pathI];
  const dw = dist(g.x, g.y, wx, wy);
  const sp = GOLEM.speed * golemPace(g) * dt;
  if (!last && dw <= sp) { g.x = wx; g.y = wy; g.pathI++; return false; }
  const k = Math.min(1, sp / dw);
  g.x += (wx - g.x) * k; g.y += (wy - g.y) * k;
  g.face = wx < g.x ? -1 : 1;
  return last && d - sp <= near;
}

// ---------- здоровье и укрытие ----------
function hurtGolem(g, dmg) {
  if (g.hidden || !S.golems.includes(g)) return;
  g.hp = (g.hp == null ? golemMaxHp(g) : g.hp) - dmg;
  g.lastHurt = S.time;
  floatText(g.x, g.y - 0.8, '-' + Math.round(dmg), '#ff9050');
  spawnBurst(g.x, g.y - 0.4, '#a09080', 4);
  if (g.hp <= 0) {
    log(`Враги разбили голема: ${BUILDINGS[g.type].name}`, 'warn');
    spawnBurst(g.x, g.y - 0.3, '#8a7a6a', 16);
    sfx('crash', g.x, g.y);
    release(g);
    S.golems.splice(S.golems.indexOf(g), 1);
    if (UI.openG === g) closeWin('golem');
  }
}
// рядом враги? налётчики пугают издалека, стража лагерей — только вблизи
function golemThreat(g) {
  for (const e of S.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, g.x, g.y);
    if (d < 8) return true;
    if (e.mode !== 'guard' && (d < 20 || dist(e.x, e.y, g.hx, g.hy) < 20)) return true;
  }
  return false;
}
// клетка внутри стен: заливка «вражескими» шагами не вырывается наружу
function enclosed(x, y) {
  const seen = new Set([x + ',' + y]), q = [[x, y]];
  for (let h = 0; h < q.length; h++) {
    if (q.length > 3000) return false;
    const [cx, cy] = q[h];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
      if (seen.has(k) || !enemyWalkable(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return true;
}
// куда прятаться: за стены возле своих сундуков, иначе к сундуку, иначе домой
function findShelter(g) {
  const pts = [];
  for (const b of bldKind('chest')) {
    const sd = BUILDINGS[b.type];
    if (sd.sub === 'altar' || dist(b.x + 0.5, b.y + 0.5, g.hx, g.hy) > GOLEM.chestRadius) continue;
    for (const [dx, dy] of DIRS) if (walkable(b.x + dx, b.y + dy) && enemyWalkable(b.x + dx, b.y + dy)) { pts.push([b.x + dx, b.y + dy]); break; }
  }
  pts.sort((a, b) => dist2(a[0], a[1], g.x, g.y) - dist2(b[0], b[1], g.x, g.y));
  for (const p of pts.slice(0, 4)) if (enclosed(p[0], p[1])) return { x: p[0] + 0.5, y: p[1] + 0.5, safe: true };
  if (pts.length) return { x: pts[0][0] + 0.5, y: pts[0][1] + 0.5, safe: false };
  return { x: g.hx, y: g.hy, safe: false };
}
function golemDefense(g, dt) {
  const mh = golemMaxHp(g);
  if (g.hp == null) g.hp = mh;
  if (g.hp < mh && S.time - (g.lastHurt || -99) > 8) g.hp = Math.min(mh, g.hp + dt * 2);
  if (g.state === 'down') return;
  g.threatT = (g.threatT || 0) - dt;
  if (g.threatT > 0) return;
  g.threatT = 0.5;
  if (golemThreat(g)) {
    g.calm = 0;
    if (g.state !== 'flee') { release(g); g.self = false; g.state = 'flee'; g.shelter = findShelter(g); }
  } else if (g.state === 'flee' && (g.calm = (g.calm || 0) + 0.5) >= 5) { g.state = 'seek'; g.wait = 0; }
}

// ---------- землепашец ----------
function cropKey(x, y) { return x + ',' + y; }
function cropTime() { return FARM.grow / (1 + (S.bonus.golem || 0)); }
function cropRipe(k) { const c = S.crops[k]; return !!c && S.time - c.t >= cropTime(); }
function cropGrowth(k) { const c = S.crops[k]; return c ? clamp((S.time - c.t) / cropTime(), 0, 1) : 0; }
// полю нужна вода: пруд или река до 6 клеток от места голема, либо акведук с водой до 4 клеток (проверка раз в 5 с)
function farmWater(g) {
  if (g.waterT != null && S.time < g.waterT) return g.waterOk;
  g.waterT = S.time + 5;
  let ok = false;
  for (let dy = -6; dy <= 6 && !ok; dy++) for (let dx = -6; dx <= 6; dx++) if (isWater(Math.floor(g.hx) + dx, Math.floor(g.hy) + dy)) { ok = true; break; }
  if (!ok) for (const b of [...bldKind('pipe'), ...bldKind('pump')]) {
    if (Math.abs(b.x - g.hx) > 4.5 || Math.abs(b.y - g.hy) > 4.5) continue;
    const n = FNETS[b.fnet];
    if (n && n.fluid === 'water' && n.amount > 0.5) { ok = true; break; }
  }
  g.waterOk = ok;
  return ok;
}
function canPlant(x, y) {
  const c = chunkOf(x, y), i = tidx(x, y);
  return !c.res[i] && !c.bld[i] && (c.ground[i] === GROUND.grass || c.ground[i] === GROUND.dark || c.ground[i] === GROUND.autumn) && !campStructAt(x, y);
}
// работа землепашца: собрать спелое, иначе посадить на свободную клетку
function findFarmJob(g) {
  const R = FARM.radius, hx = Math.floor(g.hx), hy = Math.floor(g.hy);
  let ripe = null, rd = 1e9, free = null, fd = 1e9, plots = 0;
  for (let y = hy - R; y <= hy + R; y++) for (let x = hx - R; x <= hx + R; x++) {
    if (dist2(x + 0.5, y + 0.5, g.hx, g.hy) > R * R + 1) continue;
    const k = rkey(x, y);
    const crop = !!S.crops[k] && resAt(x, y) === RES_ID.crop;
    if (crop) plots++;
    if (RESV.has(k) && RESV.get(k) !== g.id) continue;
    const d = dist2(x + 0.5, y + 0.5, g.x, g.y);
    if (crop) { if (cropRipe(k) && d < rd) { rd = d; ripe = [x, y]; } }
    else if (canPlant(x, y) && d < fd) { fd = d; free = [x, y]; }
  }
  if (ripe) return { job: 'harvest', t: ripe };
  if (free && plots < FARM.plots) return { job: 'plant', t: free };
  return null;
}
function farmJobValid(g) {
  const k = rkey(g.tx, g.ty);
  if (g.job === 'harvest') return resAt(g.tx, g.ty) === RES_ID.crop && cropRipe(k);
  return canPlant(g.tx, g.ty);
}
function plantCrop(x, y, kind) {
  const c = chunkOf(x, y), i = tidx(x, y);
  c.res[i] = RES_ID.crop; c.amt[i] = 1; c.modified = true; c.netv = (c.netv || 0) + 1;
  S.crops[cropKey(x, y)] = { t: S.time, c: kind };
}
// собрать грядку: вернёт предмет и количество
function harvestCrop(x, y) {
  const k = cropKey(x, y), cr = S.crops[k];
  const c = chunkOf(x, y), i = tidx(x, y);
  if (c.res[i] === RES_ID.crop) { c.res[i] = 0; c.amt[i] = 0; c.modified = true; c.netv = (c.netv || 0) + 1; }
  if (!cr) return null;
  delete S.crops[k];
  return { id: cr.c, n: FARM.yield[cr.c] || 1 };
}

function refuelFrom(g, inv) {
  while (g.fuel < GOLEM.fuelFull) {
    const f = GOLEM_FUELS.find(id => inv.count(id) > 0);
    if (!f) break;
    inv.remove(f, 1); statC(f, 1); g.fuel += ITEMS[f].fuel;
  }
}

function burnFuel(g, k, dt) { g._burnt = true; g.fuel = Math.max(0, g.fuel - dt * GOLEM.burn * golemBurn(g) * k); }

// ближайший сундук с топливом в рабочей зоне голема: дровяник важнее сундука-склада
function findFuelChest(g) {
  const own = golemChests(g);
  if (own) { const b = own.find(c => GOLEM_FUELS.some(id => c.inv.count(id) > 0)); if (b) return b; }
  let best = null, bd = 1e9;
  for (const b of bldKind('chest')) {
    const d = BUILDINGS[b.type];
    if (d.sub && d.sub !== 'wood' && d.sub !== 'provide') continue;
    if (!GOLEM_FUELS.some(id => b.inv.count(id) > 0)) continue;
    if (dist(b.x + 0.5, b.y + 0.5, g.hx, g.hy) > GOLEM.chestRadius) continue;
    const dd = dist2(b.x + 0.5, b.y + 0.5, g.x, g.y) * (d.sub === 'wood' ? 0.25 : 1);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}

// ближайшее дерево в рабочей зоне (для заправки шахтёра)
function findTreeFor(g) {
  const was = g.self;
  g.self = true;
  const t = findResource(g);
  g.self = was;
  return t;
}

// следим за топливом: дровосек ест из ноши, остальные идут к сундуку или рубят дерево себе
// топливо: голем сам не заправляется — его кормит голем-заправщик или игрок вручную
function golemFuelLogic(g, dt) {
  if (g.fuel <= 0 && g.state !== 'down') g.status = 'нет топлива — нужен голем-заправщик рядом или дайте дерево вручную';
}

// ---------- голем-носильщик: возит предметы из выбранного здания в выбранное ----------
// откуда — сундук или выход машины; куда — любое здание, которое примет предмет (вход машины, сундук, барак, башня…)
const PORTER = { range: 40 };
function porterOk(g, b) { return !!b && S.buildings.get(b.id) === b && dist(b.x + b.w / 2, b.y + b.h / 2, g.hx, g.hy) <= PORTER.range; }
// носильщик носит один выбранный предмет из любых своих источников в любые свои цели (несколько сундуков и машин)
function porterLists(g) {
  // старые сохранения: одно «откуда» и одно «куда»
  if (!g.psrcs) g.psrcs = g.psrc != null ? [g.psrc] : [];
  if (!g.pdsts) g.pdsts = g.pdst != null ? [g.pdst] : [];
  const live = ids => ids.map(id => S.buildings.get(id)).filter(Boolean);
  return { srcs: live(g.psrcs), dsts: live(g.pdsts) };
}
function updatePorter(g, dt) {
  // предмет — один выбранный; «any» (старые сохранения) — любой, который примет хоть одна цель
  const { srcs, dsts } = porterLists(g), item = g.filter && g.filter !== 'any' ? g.filter : null, any = g.filter === 'any';
  if (!srcs.length || !dsts.length || !item && !any) { g.state = 'seek'; g.status = !item && !any ? 'выберите в окне голема, какой предмет носить' : 'выберите в окне голема, откуда и куда носить'; return; }
  const okItem = x => item ? x === item : dsts.some(d => acceptCount(d, x) > 0);
  if (g.state !== 'pto' && g.state !== 'pfrom') g.state = g.n > 0 ? 'pto' : 'pfrom';
  burnFuel(g, 0.5, dt);
  const near = (list, ok) => { let best = null, bd = 1e18; for (const b of list) { if (!ok(b)) continue; const d = dist2(b.x + b.w / 2, b.y + b.h / 2, g.x, g.y); if (d < bd) { bd = d; best = b; } } return best; };
  const has = b => { for (const k of ['inv', 'out', 'fuel']) if (b[k] && b[k].c) for (const id in b[k].c) if (b[k].c[id] > 0 && okItem(id)) return true; return false; };
  if (g.state === 'pfrom') {
    // ближайший источник, где этот предмет есть (и есть куда его отнести)
    if (item && !dsts.some(d => acceptCount(d, item) > 0)) { g.status = 'все цели полны — ждёт'; return; }
    const src = near(srcs, has);
    if (!src) { g.status = item ? 'ждёт груз: нет «' + ITEMS[item].name + '» в источниках' : 'ждёт груз'; return; }
    g.status = 'идёт за грузом';
    if (moveTo(g, src.x + src.w / 2, src.y + src.h / 2, dt, Math.max(src.w, src.h) / 2 + 0.6)) {
      while (g.n < golemCap(g)) {
        const id = extractFrom(src, x => (!g.carry || x === g.carry) && okItem(x));
        if (!id) break;
        g.carry = id; g.n++;
      }
      if (g.n > 0) g.state = 'pto';
    } else if (g.noPath) g.status = 'нет прохода — поставьте ворота';
    return;
  }
  const dst = near(dsts, b => acceptCount(b, g.carry || item) > 0);
  if (!dst) { g.status = 'все цели полны — ждёт'; return; }
  g.status = 'несёт груз';
  if (moveTo(g, dst.x + dst.w / 2, dst.y + dst.h / 2, dt, Math.max(dst.w, dst.h) / 2 + 0.6)) {
    const put = g.carry ? insertInto(dst, g.carry, g.n) : 0;
    g.n -= put;
    if (!g.n) { g.carry = null; g.state = 'pfrom'; }
  } else if (g.noPath) g.status = 'нет прохода — поставьте ворота';
}

// ---------- голем-заправщик: берёт топливо из сундука и разносит его големам ----------
const FUELER = { radius: 30, cap: 30 };
// заправщик кормит големов и деревянные векторы (манипуляторы на топливе) в своём радиусе
const VEC_FUEL_FULL = 300;
function fuelerTarget(g) {
  let best = null, bd = 1e9;
  for (const o of S.golems) {
    if (o === g || o.type === 'fueler' || o.hidden || o.state === 'flee' || o.fuel >= GOLEM.fuelFull * 0.6) continue;
    if (!inGolemZone(g, o.x, o.y)) continue;
    if (S.golems.some(f => f !== g && f.type === 'fueler' && f.fto === o.id)) continue;
    const d = o.fuel * 4 + dist(o.x, o.y, g.x, g.y); // сначала самые голодные
    if (d < bd) { bd = d; best = o; }
  }
  for (const b of bldKind('vector')) {
    if (BUILDINGS[b.type].power || b.fuel >= VEC_FUEL_FULL * 0.4) continue;
    if (!inGolemZone(g, b.x + 0.5, b.y + 0.5)) continue;
    if (S.golems.some(f => f !== g && f.type === 'fueler' && f.fto === b.id)) continue;
    const d = b.fuel * 2 + dist(b.x + 0.5, b.y + 0.5, g.x, g.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function updateFueler(g, dt) {
  // себя кормит из своей ноши
  if (g.fuel < GOLEM.fuelLow && g.n > 0 && GOLEM_FUELS.includes(g.carry)) { g.n--; g.fuel += ITEMS[g.carry].fuel; if (!g.n) g.carry = null; }
  switch (g.state) {
    case 'fetch': {
      const ch = S.buildings.get(g.fch);
      if (!ch || !ch.inv) { g.state = 'seek'; return; }
      burnFuel(g, 0.5, dt);
      g.status = 'идёт к сундуку за топливом';
      if (moveTo(g, ch.x + 0.5, ch.y + 0.5, dt, 1.0)) {
        while (g.n < FUELER.cap) {
          const f = g.carry ? (ch.inv.count(g.carry) > 0 ? g.carry : null) : GOLEM_FUELS.find(id => ch.inv.count(id) > 0);
          if (!f) break;
          ch.inv.remove(f, 1); g.carry = f; g.n++;
        }
        g.state = 'seek'; g.wait = 0;
      }
      return;
    }
    case 'tofuel': {
      // цель — голем или вектор (постройка)
      const vb = S.buildings.get(g.fto), t = vb && BUILDINGS[vb.type].kind === 'vector' ? null : S.golems.find(o => o.id === g.fto);
      if (!(t && !t.hidden || vb) || !g.n) { g.fto = null; g.state = 'seek'; return; }
      burnFuel(g, 0.5, dt);
      g.status = vb ? 'несёт топливо вектору' : 'несёт топливо голему';
      const tx = vb ? vb.x + 0.5 : Math.floor(t.x) + 0.5, ty = vb ? vb.y + 0.5 : Math.floor(t.y) + 0.5;
      if (moveTo(g, tx, ty, dt, 1.3)) {
        if (vb) while (vb.fuel < VEC_FUEL_FULL && g.n > 0) { g.n--; vb.fuel += ITEMS[g.carry].fuel; statC(g.carry, 1); }
        else while (t.fuel < GOLEM.fuelFull && g.n > 0) { g.n--; t.fuel += ITEMS[g.carry].fuel; statC(g.carry, 1); }
        if (!g.n) g.carry = null;
        spawnBurst(tx, ty - 0.4, '#ffaa40', 4);
        g.fto = null; g.state = 'seek'; g.wait = 0.3;
      }
      return;
    }
    default: {
      if (g.state !== 'seek') g.state = 'seek';
      g.wait -= dt;
      if (g.wait > 0) return;
      const t = g.n > 0 && fuelerTarget(g);
      if (t) { g.fto = t.id; g.state = 'tofuel'; return; }
      if (g.n < FUELER.cap / 2) {
        const ch = findFuelChest(g);
        if (ch) { g.fch = ch.id; g.state = 'fetch'; return; }
      }
      g.wait = 1;
      g.status = g.n > 0 ? 'ждёт: големы и векторы рядом заправлены' : 'нет топлива — положите дерево или уголь в дровяник или сундук-склад рядом';
    }
  }
}

function updateGolem(g, dt) {
  if (g.state === 'nofuel') g.state = 'seek'; // старые сохранения
  golemDefense(g, dt);
  if (!S.golems.includes(g)) return;
  if (g.type === 'fueler' && g.state !== 'flee') { updateFueler(g, dt); return; }
  if (g.type === 'porter' && g.state !== 'flee') { golemFuelLogic(g, dt); updatePorter(g, dt); return; }
  if (g.state !== 'flee') golemFuelLogic(g, dt);
  switch (g.state) {
    case 'flee': {
      const sh = g.shelter || (g.shelter = findShelter(g));
      burnFuel(g, 0.3, dt);
      // надёжного укрытия нет, а враг рядом — убегает от него, по возможности к герою
      if (!sh.safe) {
        let e = null, ed = 196;
        for (const o of S.enemies) { if (o.dead) continue; const d = dist2(o.x, o.y, g.x, g.y); if (d < ed) { ed = d; e = o; } }
        // враг не совсем рядом — не идёт к нему навстречу, а затаивается
        if (e && ed >= 81) { g.status = 'затаился подальше от врагов'; return; }
        if (e) {
          let ax = g.x - e.x, ay = g.y - e.y; const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
          const p = S.player, pd = dist(p.x, p.y, g.x, g.y);
          if (p.dead <= 0 && pd > 2 && pd < 30) { ax += (p.x - g.x) / pd * 0.7; ay += (p.y - g.y) / pd * 0.7; }
          const tx = Math.floor(g.x + ax * 4) + 0.5, ty = Math.floor(g.y + ay * 4) + 0.5;
          if (walkable(Math.floor(tx), Math.floor(ty))) { moveTo(g, tx, ty, dt, 0.5); g.status = 'убегает от врагов'; return; }
        }
      }
      if (moveTo(g, sh.x, sh.y, dt, 0.5)) g.status = sh.safe ? 'прячется за стенами — рядом враги' : 'прячется у сундука — рядом враги (стен вокруг нет)';
      else g.status = g.noPath ? 'не может пройти в укрытие — нет ворот' : 'бежит в укрытие от врагов';
      return;
    }
    case 'seek': {
      g.wait -= dt;
      if (g.wait > 0) return;
      if (g.type === 'farmer' && !g.self) {
        if (g.n >= golemCap(g)) { g.state = 'return'; return; }
        if (!farmWater(g)) { g.wait = 3; g.status = 'нет воды: поставьте у пруда или реки (до 6 клеток) или подведите акведук с водой'; return; }
        const j = findFarmJob(g);
        if (j) { g.job = j.job; g.tx = j.t[0]; g.ty = j.t[1]; RESV.set(rkey(g.tx, g.ty), g.id); g.state = 'walk'; g.status = j.job === 'harvest' ? 'идёт собирать урожай' : 'идёт сеять'; }
        else if (g.n > 0) g.state = 'return';
        else { g.wait = 2; g.status = 'ждёт, пока созреет урожай'; }
        return;
      }
      const mine = !g.self && g.n === 0 && findMine(g);
      if (mine) { g.state = 'tomine'; g.mine = mine.id; g.status = 'идёт в шахту'; return; }
      const t = findResource(g);
      if (t) {
        g.tx = t[0]; g.ty = t[1];
        RESV.set(rkey(t[0], t[1]), g.id);
        g.state = 'walk'; g.status = g.self ? 'идёт рубить дерево себе на топливо' : 'идёт к ресурсу';
      } else if (g.self) { g.self = false; g.wait = 1; }
      else if (g.n > 0) { g.state = 'return'; }
      else { g.wait = 3; g.status = g.type === 'miner' && bldType('mine').some(b => inGolemZone(g, b.x + 1.5, b.y + 1.5, 2)) ? `шахта полна (бригада ${BUILDINGS.mine.maxGolems}), на поверхности добывать нечего` : 'нет ресурсов в радиусе'; }
      return;
    }
    case 'walk':
      burnFuel(g, 0.5, dt);
      if (g.type === 'farmer' && !g.self) {
        if (!farmJobValid(g)) { release(g); g.state = 'seek'; return; }
        if (moveTo(g, g.tx + 0.5, g.ty + 0.5, dt, 0.7)) { g.state = 'work'; g.work = 0; g.status = g.job === 'harvest' ? 'собирает урожай' : 'пашет и сеет'; }
        else if (g.noPath) g.status = 'нет прохода — поставьте ворота в стене';
        return;
      }
      if (!golemWants(g, resAt(g.tx, g.ty))) { release(g); g.state = 'seek'; return; }
      if (moveTo(g, g.tx + 0.5, g.ty + 0.5, dt, 0.85)) { g.state = 'work'; g.status = g.self ? 'рубит дерево себе на топливо' : 'добывает'; }
      else if (g.noPath) g.status = 'нет прохода — поставьте ворота в стене';
      return;
    case 'work': {
      if (g.type === 'farmer' && !g.self) {
        if (!farmJobValid(g)) { release(g); g.state = 'seek'; return; }
        burnFuel(g, 0.8, dt);
        g.anim = (g.anim || 0) + dt;
        g.work += dt * golemPace(g) / (g.job === 'harvest' ? 1.6 : 2.2);
        if (g.work < 1) return;
        g.work = 0; release(g);
        const kind = g.filter === 'berries' ? 'berries' : 'wheat';
        if (g.job === 'plant') plantCrop(g.tx, g.ty, kind);
        else {
          const h = harvestCrop(g.tx, g.ty);
          if (h && (!g.carry || g.carry === h.id)) { g.carry = h.id; g.n += h.n; S.stats.made[h.id] = (S.stats.made[h.id] || 0) + h.n; }
          if (Math.random() < 0.5) sfx('chop', g.x, g.y);
          // сразу засеваем заново
          if (canPlant(g.tx, g.ty)) plantCrop(g.tx, g.ty, kind);
        }
        g.state = g.n >= golemCap(g) ? 'return' : 'seek';
        return;
      }
      if (!golemWants(g, resAt(g.tx, g.ty))) {
        release(g);
        if (g.self) { g.state = 'seek'; return; }
        g.state = g.n >= golemCap(g) / 2 ? 'return' : 'seek'; return;
      }
      burnFuel(g, 1, dt);
      g.work += dt * GOLEM.rate * golemPace(g) * golemDig(g);
      addPollution(g.x, g.y, 0.015 * dt); // добыча коптит: карьер злит ближние лагеря, его надо охранять
      g.anim = (g.anim || 0) + dt;
      while (g.work >= 1) {
        g.work -= 1;
        const r = resAt(g.tx, g.ty);
        const item = oreItem(g.tx, g.ty, r);
        if (g.self) {
          // дрова сразу в топку
          if (takeResource(g.tx, g.ty, 1)) { g.fuel += ITEMS.wood.fuel; if (Math.random() < 0.3) sfx('chop', g.x, g.y); }
          if (g.fuel >= GOLEM.fuelFull * 0.6) { release(g); g.self = false; g.state = 'seek'; g.work = 0; return; }
          continue;
        }
        if (g.carry && g.carry !== item) { g.state = 'return'; return; }
        if (takeResource(g.tx, g.ty, 1)) {
          g.carry = item; g.n++;
          // продуктивность добычи: иногда лишняя единица
          if (g.type === 'miner' && Math.random() < (S.bonus.prod || 0)) g.n++;
          if (g.type === 'lumber' && Math.random() < 0.3) sfx('chop', g.x, g.y);
          if (g.type === 'miner' && Math.random() < 0.3) sfx('mine', g.x, g.y);
        }
        if (g.n >= golemCap(g)) { release(g); g.state = 'return'; return; }
      }
      return;
    }
    case 'tomine': {
      const b = S.buildings.get(g.mine);
      if (!b || b.type !== 'mine') { g.state = 'seek'; return; }
      burnFuel(g, 0.5, dt);
      const en = mineEntrance(b);
      if (moveTo(g, en.x, en.y, dt, 0.35)) {
        // не из бригады этой шахты (старое сохранение) — идёт работать на поверхность
        if (!mineCrew(b).includes(g.id) || (b.inside || 0) >= BUILDINGS.mine.maxGolems) { g.state = 'seek'; g.wait = 1; return; }
        b.inside = (b.inside || 0) + 1;
        g.state = 'down'; g.hidden = true; g.downT = BUILDINGS.mine.tripTime || 16; g.status = 'добывает под землёй';
        sfx('mine', g.x, g.y);
      }
      return;
    }
    case 'down': {
      const b = S.buildings.get(g.mine);
      if (!b) { g.hidden = false; g.state = 'seek'; return; }
      burnFuel(g, 0.6, dt);
      g.downT -= dt * golemPace(g);
      addPollution(b.x, b.y, 0.02 * dt);
      if (g.downT <= 0) {
        b.inside = Math.max(0, (b.inside || 1) - 1);
        g.hidden = false;
        const en = mineEntrance(b);
        g.x = en.x; g.y = en.y;
        g.carry = RES[b.ore].item; g.n = Math.round(golemCap(g) * mineYield(b));
        g.state = 'return'; g.status = 'поднял руду из шахты';
        spawnBurst(en.x, en.y - 0.3, '#8a7a6a', 5);
      }
      return;
    }
    case 'fetch': {
      // за топливом к сундуку
      // старые сохранения: обычные големы больше сами не ходят за топливом
      const ch = S.buildings.get(g.fch);
      if (!ch || !ch.inv || !g.carry) { g.state = g.carry ? 'return' : 'seek'; return; }
      burnFuel(g, 0.5, dt);
      g.status = 'идёт к сундуку за дровами';
      if (moveTo(g, ch.x + 0.5, ch.y + 0.5, dt, 1.0)) {
        if (g.carry) {
          const put = ch.inv.add(g.carry, g.n);
          g.n -= put;
          S.stats.mined[g.carry] = (S.stats.mined[g.carry] || 0) + put; statP(g.carry, put);
          if (!g.n) g.carry = null;
        }
        g.state = 'seek';
      }
      return;
    }
    case 'return': {
      const ch = findChest(g);
      if (!ch) { g.status = 'нет сундука-склада рядом (до 30 клеток) или все полны'; return; }
      burnFuel(g, 0.5, dt);
      g.status = 'несёт в сундук';
      const arrived = moveTo(g, ch.x + 0.5, ch.y + 0.5, dt, 1.0);
      if (g.noPath) g.status = 'не может пройти к сундуку — нет ворот';
      if (arrived) {
        if (g.carry) {
          const put = ch.inv.add(g.carry, g.n);
          g.n -= put;
          S.stats.mined[g.carry] = (S.stats.mined[g.carry] || 0) + put; statP(g.carry, put);
          if (!g.n) g.carry = null;
        }
        g.state = 'seek';
      }
      return;
    }
  }
}

function updateGolems(dt) {
  for (const g of S.golems) {
    g._burnt = false;
    updateGolem(g, dt);
    // простой тоже стоит топлива (вдвое меньше работы), кроме спрятанных за стенами
    if (!g._burnt && !g.hidden && g.fuel > 0) g.fuel = Math.max(0, g.fuel - dt * GOLEM.burn * golemBurn(g) * 0.5);
  }
}
// сколько руды в минуту в среднем приносит один голем-добытчик (с учётом дороги к сундуку)
function golemOreRate() { return 60 * GOLEM.rate * (1 + (S.bonus.golem || 0)) * 0.8; }

function golemAtPoint(x, y) {
  let best = null, bd = 0.6 * 0.6;
  for (const g of S.golems) {
    if (g.hidden) continue;
    const d = dist2(g.x, g.y, x, y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

function pickupGolem(g) {
  const inv = S.player.inv;
  recordUndo({ a: 'delg', type: g.type, x: g.hx, y: g.hy });
  if (!(S.cheats && S.cheats.free)) inv.add(g.type, 1);
  if (g.carry) inv.add(g.carry, g.n);
  for (const m of g.mods) inv.add(m, 1);
  release(g);
  if (g.state === 'down') { const b = S.buildings.get(g.mine); if (b) b.inside = Math.max(0, (b.inside || 1) - 1); }
  S.golems.splice(S.golems.indexOf(g), 1);
  sfx('remove');
  if (UI.openG === g) closeWin('golem');
}
