'use strict';
// Постройки: размещение, снос, машины, сундуки, приём и выдача предметов.

const FUEL_ITEMS = ['wood', 'plank', 'coal', 'tar'];
const FOOD_ITEMS = ['berries', 'raw_meat', 'stew', 'roast', 'pie'];
let netsDirty = true;
let BLD_VER = 0; // меняется при постройке и сносе — големы пересчитывают пути

// ---------- индексы построек: по виду, по типу и по ячейкам 16×16 ----------
// Пересобираются только после стройки или сноса (BLD_VER), поэтому частые проверки (конвейеры, башни, свет ночью,
// поиск целей врагами, сундуки для големов) больше не перебирают всю базу каждый кадр.
const BIDX = { ver: -1, s: null, n: -1, kind: new Map(), type: new Map(), cell: new Map() }, NO_BLD = [], BCELL = 16;
function bidxSync() {
  if (BIDX.ver === BLD_VER && BIDX.s === S && BIDX.n === S.buildings.size) return BIDX;
  BIDX.kind = new Map(); BIDX.type = new Map(); BIDX.cell = new Map();
  BIDX.gx0 = 1e9; BIDX.gy0 = 1e9; BIDX.gx1 = -1e9; BIDX.gy1 = -1e9;
  const put = (m, k, b) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(b); };
  for (const b of S.buildings.values()) {
    put(BIDX.kind, BUILDINGS[b.type].kind, b); put(BIDX.type, b.type, b);
    const gx = Math.floor((b.x + b.w / 2) / BCELL), gy = Math.floor((b.y + b.h / 2) / BCELL);
    put(BIDX.cell, gx + ',' + gy, b);
    // рамка всех занятых ячеек — поиск не обходит пустую карту
    if (gx < BIDX.gx0) BIDX.gx0 = gx; if (gx > BIDX.gx1) BIDX.gx1 = gx; if (gy < BIDX.gy0) BIDX.gy0 = gy; if (gy > BIDX.gy1) BIDX.gy1 = gy;
  }
  BIDX.ver = BLD_VER; BIDX.s = S; BIDX.n = S.buildings.size;
  return BIDX;
}
function bldKind(k) { return bidxSync().kind.get(k) || NO_BLD; }
function bldType(t) { return bidxSync().type.get(t) || NO_BLD; }
// ближайшая постройка, подходящая под условие: обходим ячейки кольцами от точки, пока ближе уже не найти
function nearestBldWhere(x, y, maxD, ok) {
  const I = bidxSync(), cell = I.cell, cx = Math.floor(x / BCELL), cy = Math.floor(y / BCELL), R = Math.ceil(maxD / BCELL) + 1;
  if (I.gx1 < I.gx0) return null;
  // до рамки построек ближе не подойти — начинаем кольца с этого расстояния
  const r0 = Math.max(0, I.gx0 - cx, cx - I.gx1, I.gy0 - cy, cy - I.gy1);
  if (r0 > R) return null;
  let best = null, bd = maxD * maxD;
  const visit = (gx, gy) => {
    if (gx < I.gx0 || gx > I.gx1 || gy < I.gy0 || gy > I.gy1) return;
    const arr = cell.get(gx + ',' + gy);
    if (!arr) return;
    for (const b of arr) {
      if (ok && !ok(b)) continue;
      const d = dist2(b.x + b.w / 2, b.y + b.h / 2, x, y);
      if (d < bd) { bd = d; best = b; }
    }
  };
  for (let r = r0; r <= R; r++) {
    if (best && (r - 1) * BCELL * (r - 1) * BCELL > bd) break;
    if (r === 0) { visit(cx, cy); continue; }
    // только клетки кольца (а не весь квадрат)
    for (let gx = cx - r; gx <= cx + r; gx++) { visit(gx, cy - r); visit(gx, cy + r); }
    for (let gy = cy - r + 1; gy <= cy + r - 1; gy++) { visit(cx - r, gy); visit(cx + r, gy); }
  }
  return best;
}

function isUnlockedBuilding(id) {
  const d = BUILDINGS[id];
  if (d.hidden) return false;
  if (d.bp) return S.blueprints.includes(d.bp);
  return !d.tech || S.research.done.includes(d.tech);
}
function isUnlockedRecipe(id) {
  const r = RECIPES[id];
  if (r.bld) return isUnlockedBuilding(r.bld);
  return !r.tech || S.research.done.includes(r.tech);
}

function tilesOf(def, x, y) {
  const out = [];
  for (let dy = 0; dy < def.size[1]; dy++) for (let dx = 0; dx < def.size[0]; dx++) out.push([x + dx, y + dy]);
  return out;
}
function perimeter(x, y, w, h) {
  const out = [];
  for (let i = 0; i < w; i++) { out.push([x + i, y - 1]); out.push([x + i, y + h]); }
  for (let j = 0; j < h; j++) { out.push([x - 1, y + j]); out.push([x + w, y + j]); }
  return out;
}

// проверка места: возвращает null если можно, иначе текст причины
function placeProblem(type, x, y, checkReach) {
  // акведук (насос, цистерна) не должен соединять воду со смолой
  if (BUILDINGS[type] && (BUILDINGS[type].kind === 'pipe' || BUILDINGS[type].kind === 'pump')) {
    const d = BUILDINGS[type], fl = new Set(d.fluid ? [d.fluid] : []);
    for (let yy = y - 1; yy <= y + d.size[1]; yy++) for (let xx = x - 1; xx <= x + d.size[0]; xx++) {
      const inside = xx >= x && xx < x + d.size[0] && yy >= y && yy < y + d.size[1], corner = (xx < x || xx >= x + d.size[0]) && (yy < y || yy >= y + d.size[1]);
      if (inside || corner) continue;
      const nb = bldAt(xx, yy);
      if (!nb || !isFluidConductor(nb)) continue;
      const net = nb.fnet >= 0 && FNETS[nb.fnet];
      if (net && net.fluid && net.amount > 0.5) fl.add(net.fluid);
      if (net) for (const pm of net.pumps) if (BUILDINGS[pm.type].fluid) fl.add(BUILDINGS[pm.type].fluid);
      if (BUILDINGS[nb.type].fluid) fl.add(BUILDINGS[nb.type].fluid);
    }
    if (fl.size > 1) return 'Нельзя соединять воду и смолу в одном акведуке';
  }
  const def = BUILDINGS[type];
  if (def.kind === 'mgolem') {
    if (isWater(x, y)) return 'Нельзя в воду';
  } else if (def.kind === 'cart') {
    if (!isRoad(x, y)) return 'Повозку ставят на каменную дорогу';
  } else {
    let onOre = false, onSwamp = false;
    for (const [tx, ty] of tilesOf(def, x, y)) {
      const c = chunkOf(tx, ty), i = tidx(tx, ty);
      if (c.ground[i] === GROUND.water) return 'Нельзя строить на воде';
      if (c.bld[i]) return 'Место занято';
      const r = c.res[i];
      if (r === RES_ID.tree) return 'Мешает дерево — срубите его';
      if (r === RES_ID.bush || r === RES_ID.ruins || r === RES_ID.crop) return 'Мешает ' + RES[r].name.toLowerCase();
      if (r === RES_ID.mount && def.kind !== 'mine') return 'Здесь рудная гора — на ней можно построить только шахту';
      if (def.kind === 'mine' && r !== RES_ID.mount) return 'Шахту можно построить только на рудной горе (серая гора в центре залежи)';
      if (r >= 2 && r <= 8) onOre = true;
      if (c.ground[i] === GROUND.swamp) onSwamp = true;
      if (campStructAt(tx, ty)) return 'Место занято лагерем';
    }
    if (def.needWater && !perimeter(x, y, def.size[0], def.size[1]).some(([px, py]) => isWater(px, py))) return 'Нужно поставить вплотную к воде';
    if (def.needSwamp && !onSwamp) return 'Нужно ставить на болото';
    if (def.crafts === 'drill' && !onOre) {
      // бур с площадью добычи достаточно поставить рядом с залежью
      const a = def.area || 0;
      let near = false;
      for (let yy = y - a; yy < y + def.size[1] + a && !near; yy++) for (let xx = x - a; xx < x + def.size[0] + a; xx++) { const r = resAt(xx, yy); if (r >= 2 && r <= 8) { near = true; break; } }
      if (!near) return 'Нужно ставить на руду или камень (или вплотную к залежи)';
    }
    if (!def.walk) {
      const p = S.player;
      if (p.x > x - 0.3 && p.x < x + def.size[0] + 0.3 && p.y > y - 0.3 && p.y < y + def.size[1] + 0.3) return 'Вы стоите на этом месте';
    }
  }
  if (checkReach) {
    const cx = x + def.size[0] / 2, cy = y + def.size[1] / 2;
    if (dist(cx, cy, S.player.x, S.player.y) > playerReach() + def.size[0] / 2) return 'Слишком далеко';
  }
  return null;
}

function newBuilding(type, x, y, dir) {
  const def = BUILDINGS[type];
  // у гостя совместной игры «предварительные» постройки получают отрицательные номера — не путаются с хозяйскими
  const id = typeof MP !== 'undefined' && MP.role === 'client' ? -(MP.localN = (MP.localN || 0) + 1) : S.nextId++;
  const b = { id, type, x, y, w: def.size[0], h: def.size[1], dir: dir || 0, hp: def.hp, maxHp: def.hp, lastHit: -99 };
  switch (def.kind) {
    case 'chest': b.inv = new Inv(def.cap, true); if (def.sub === 'request') b.req = {}; break;
    case 'barracks': case 'house': b.inv = new Inv(def.cap); b.burn = 0; break;
    case 'belt': b.items = []; break;
    case 'vector': b.hand = null; b.prog = 0; b.fuel = def.power ? 0 : 60; break;
    case 'machine': b.recipe = def.fixed || null; b.inp = new Inv(200); b.out = new Inv(100); b.prog = 0; b.crafting = false; b.burn = 0; b.fluid = {}; b.mods = [];
      if (def.fuel) b.fuel = new Inv(40);
      break;
    case 'lab': b.inv = new Inv(200); b.prog = 0; b.mods = []; break;
    case 'gen': b.burn = 0; if (def.fuel) b.fuel = new Inv(40); if (type === 'treadwheel') b.wheelGolem = false; break;
    case 'accum': b.stored = 0; break;
    case 'tower': b.inv = new Inv(100); b.cd = 0; break;
    case 'nest': b.inv = new Inv(50); b.spiders = []; break;
    case 'mine': b.ore = amtAt(x + 1, y + 1); b.inside = 0; break;
    case 'bhub': b.inv = new Inv(50); b.bots = []; break;
    case 'csite': b.inv = new Inv(400); break;
  }
  return b;
}

function registerBuilding(b) {
  const def = BUILDINGS[b.type];
  const old = S.buildings.get(b.id);
  if (old && old !== b) unregisterBuilding(old); // тот же номер — прежняя постройка уходит целиком, а не остаётся «сиротой» на карте
  S.buildings.set(b.id, b);
  for (const [tx, ty] of tilesOf(def, b.x, b.y)) { const c = chunkOf(tx, ty); c.bld[tidx(tx, ty)] = b; c.bldv = ((c.bldv || 0) + 1) % 4096; }
  chunkOf(b.x, b.y).blds.push(b);
  netsDirty = true;
  BLD_VER++;
}

function placeBuilding(type, x, y, dir, opts) {
  opts = opts || {};
  const def = BUILDINGS[type];
  const prob = placeProblem(type, x, y, !opts.noReach);
  if (prob) { hint(prob); return false; }
  //: ставим скрафченную постройку из инвентаря
  const inv = S.player.inv;
  const free = S.cheats && S.cheats.free;
  if (!free && inv.count(type) < 1) {
    //: нет постройки — ставим призрак, его построят големы-строители
    if (!opts.noGhost && addGhost(type, x, y, dir, opts.quiet)) {
      if (!opts.quiet && S.time - (S.ghostHint || -99) > 20) { S.ghostHint = S.time; hint(hubsExist() ? `Призрак: строители принесут «${def.name}» со склада или из вашего инвентаря` : `Поставлен призрак «${def.name}». Постройте Гильдию строителей — или скрафтите и поставьте сами`); }
      return true;
    }
    if (!opts.quiet) hint(`Нет «${def.name}» в инвентаре — скрафтите (клик по иконке или C)`);
    return false;
  }
  removeGhostsUnder(x, y, def.size[0], def.size[1]);
  if (!free) {
    inv.remove(type, 1);
    // кончились — освобождаем руку
    if (inv.count(type) === 0 && typeof UI !== 'undefined' && UI.tool === type && !opts.quiet) { UI.tool = null; UI.dirty = true; hint(`«${def.name}» закончились — скрафтите ещё (C или клик по клетке панели)`); }
  }
  if (def.kind === 'mgolem') {
    const g = spawnGolem(type, x + 0.5, y + 0.5);
    recordUndo({ a: 'addg', id: g.id });
  } else if (def.kind === 'cart') {
    spawnCart(x, y);
  } else {
    const b = newBuilding(type, x, y, dir);
    registerBuilding(b);
    if (def.under) pairUnderground(b);
    recordUndo({ a: 'add', id: b.id });
    explore(x + def.size[0] / 2, y + def.size[1] / 2, 5);
  }
  S.stats.built[type] = (S.stats.built[type] || 0) + 1;
  sfx('build');
  return true;
}

function unregisterBuilding(b) {
  const def = BUILDINGS[b.type];
  if (def.under) unpairUnderground(b);
  for (const [tx, ty] of tilesOf(def, b.x, b.y)) {
    const c = chunkOf(tx, ty), i = tidx(tx, ty);
    if (c.bld[i] === b) { c.bld[i] = null; c.bldv = ((c.bldv || 0) + 1) % 4096; }
  }
  const c = chunkOf(b.x, b.y);
  const k = c.blds.indexOf(b);
  if (k >= 0) c.blds.splice(k, 1);
  if (S.buildings.get(b.id) === b) S.buildings.delete(b.id);
  netsDirty = true;
  BLD_VER++;
  // рабочие освобождаются
  for (const w of S.workers) if (w.at === b.id) w.at = null;
}

// поворот конвейера или вектора (подземный конвейер заново ищет пару)
function rotateBuilding(b, delta) {
  const def = BUILDINGS[b.type];
  if (def.under) unpairUnderground(b);
  b.dir = (b.dir + (delta || 1) + 4) % 4;
  if (def.under) pairUnderground(b);
  if (def.kind === 'belt') netsDirty = true; // цепочки конвейеров (питание) пересобираются
}

// возвращает содержимое постройки (для возврата игроку)
function buildingContents(b) {
  const out = {};
  const add = (inv) => { if (inv) for (const id in inv.c) out[id] = (out[id] || 0) + inv.c[id]; };
  add(b.inv); add(b.inp); add(b.out); add(b.fuel);
  if (b.items) for (const it of b.items) out[it.id] = (out[it.id] || 0) + 1;
  if (b.hand) out[b.hand] = (out[b.hand] || 0) + 1;
  if (b.mods) for (const m of b.mods) out[m] = (out[m] || 0) + 1;
  if (b.type === 'nest') out.gargoyle = (out.gargoyle || 0) + b.spiders.length;
  if (b.bots) for (const bot of b.bots) { if (bot.carry) out[bot.carry] = (out[bot.carry] || 0) + 1; }
  if (b.wheelGolem) out.minigolem = (out.minigolem || 0) + 1;
  return out;
}

function deconstruct(b) {
  const def = BUILDINGS[b.type];
  if (def.hidden && !def.refund) { if (b.inv) { playerTakeAll(b); hint('Добыча забрана'); } return; }
  recordUndo(bldSnapshot(b));
  const inv = S.player.inv;
  // при бесплатной стройке (чит) постройка не возвращается — иначе её можно «размножать»
  const back = S.cheats && S.cheats.free ? {} : { [def.refund || b.type]: 1 };
  const cont = buildingContents(b);
  for (const id in cont) back[id] = (back[id] || 0) + cont[id];
  let lost = 0;
  for (const id in back) lost += back[id] - inv.add(id, back[id]);
  unregisterBuilding(b);
  if (lost > 0) log(`Инвентарь полон — потеряно ${lost} предм.`, 'warn');
  sfx('remove');
  if (UI.openB === b) closeWin('bld');
}

function destroyBuilding(b) {
  unregisterBuilding(b);
  spawnBurst(b.x + b.w / 2, b.y + b.h / 2, '#8a6a4a', 14);
  sfx('crash');
  if (UI.openB === b) closeWin('bld');
}

function damageBuilding(b, d) {
  b.hp -= d;
  b.lastHit = S.time;
  if (b.hp <= 0) {
    destroyBuilding(b);
    S.stats.lost = (S.stats.lost || 0) + 1;
    if (S.time - (S.lastLossMsg || -99) > 8) { log(`Враги разрушили: ${BUILDINGS[b.type].name}`, 'warn'); S.lastLossMsg = S.time; }
  }
}

// ---------- маяки усиления ----------
let BEACON_VER = -1;
function beaconMult(b) {
  if (BEACON_VER !== BLD_VER) {
    BEACON_VER = BLD_VER;
    const beacons = [...S.buildings.values()].filter(o => o.type === 'beacon');
    for (const o of S.buildings.values()) {
      o.beacons = beacons.filter(bc => Math.abs(bc.x + 0.5 - (o.x + o.w / 2)) <= BUILDINGS.beacon.radius + o.w / 2 && Math.abs(bc.y + 0.5 - (o.y + o.h / 2)) <= BUILDINGS.beacon.radius + o.h / 2).map(bc => bc.id);
    }
  }
  let n = 0;
  for (const id of b.beacons || []) { const bc = S.buildings.get(id); if (bc && bc.powerSat > 0) n++; }
  return 1 + Math.min(2, n) * 0.25;
}

// ---------- модули ----------
function modSpeed(b) {
  let s = 1;
  if (b.mods) for (const m of b.mods) if (m === 'mod_speed') s += 0.3;
  return s;
}
function modCost(b) {
  let s = 1;
  if (b.mods) for (const m of b.mods) { if (m === 'mod_speed') s += 0.3; if (m === 'mod_eff') s -= 0.4; }
  return Math.max(0.2, s);
}

// ---------- машины ----------
// рецепты машины — кэш по типу цеха; сбрасывается, когда открыто новое исследование
const MREC = { s: null, n: -1, by: new Map(), item: new Map() };
function mrecSync() { if (MREC.s !== S || MREC.n !== S.research.done.length) { MREC.s = S; MREC.n = S.research.done.length; MREC.by.clear(); MREC.item.clear(); } }
function machineRecipes(b) {
  const def = BUILDINGS[b.type];
  if (def.fixed) return [def.fixed];
  mrecSync();
  let l = MREC.by.get(def.crafts);
  if (!l) { l = Object.keys(RECIPES).filter(id => RECIPES[id].at.includes(def.crafts) && isUnlockedRecipe(id)); MREC.by.set(def.crafts, l); }
  return l;
}
// какой рецепт машины берёт этот предмет на вход (для плавилен, принимающих любую руду)
function machineRecipeFor(b, id) {
  mrecSync();
  const key = b.type + '|' + id;
  let r = MREC.item.get(key);
  if (r === undefined) { const rid = machineRecipes(b).find(x => RECIPES[x].in[id]); r = rid ? RECIPES[rid] : null; MREC.item.set(key, r); }
  return r;
}

function autoRecipe(b) {
  if (b.recipe && b.inp.has(RECIPES[b.recipe].in)) return RECIPES[b.recipe];
  for (const id of machineRecipes(b)) {
    const r = RECIPES[id];
    if (b.inp.has(r.in)) return r;
  }
  return b.recipe ? RECIPES[b.recipe] : null;
}

// во сколько раз ходка в шахту богаче обычной ноши: чем дальше от места высадки, тем больше
// сколько нош руды поднимает голем за ходку: 1 у старта, +1 за каждые 120 клеток, не больше 4 (yieldMul — множитель из админ-меню)
function mineYield(b) {
  return Math.min(4, 1 + Math.floor(dist(b.x + b.w / 2, b.y + b.h / 2, S.spawn.x, S.spawn.y) / 120)) * (BUILDINGS.mine.yieldMul || 1) * (1 + (S.bonus.prod || 0));
}

function drillRecipe(b) {
  // какая руда под буром (руды по кругу, если их несколько)
  const def = BUILDINGS[b.type];
  // буры добывают и вокруг себя (area клеток в каждую сторону)
  const a = def.area || 0, all = [];
  for (let y = b.y - a; y < b.y + b.h + a; y++) for (let x = b.x - a; x < b.x + b.w + a; x++) all.push([x, y]);
  const tiles = all.filter(([tx, ty]) => { const r = resAt(tx, ty); return r >= 2 && r <= 8; });
  if (!tiles.length) return null;
  const t = tiles[(b.cycles || 0) % tiles.length];
  return { id: 'drill', out: { [oreItem(t[0], t[1], resAt(t[0], t[1]))]: 1 }, in: {}, time: def.cycle || 1.2, tile: t };
}

function outputsFit(b, r) {
  let n = 0;
  for (const id in r.out) { n += r.out[id]; if (b.out.count(id) + r.out[id] > 60) return false; }
  return b.out.space() >= n;
}
function fluidsReady(b, r) {
  if (!r.fin) return true;
  for (const f in r.fin) if ((b.fluid[f] || 0) < r.fin[f]) return false;
  return true;
}

// клетка, куда бур выкладывает добычу: по центру стороны, куда смотрит стрелка
function drillOutTile(b) {
  switch (b.dir || 0) {
    case 0: return [b.x, b.y - 1];
    case 1: return [b.x + b.w, b.y];
    case 2: return [b.x + b.w - 1, b.y + b.h];
    default: return [b.x - 1, b.y + b.h - 1];
  }
}
function drillPush(b) {
  const [tx, ty] = drillOutTile(b), dst = bldAt(tx, ty);
  if (!dst || dst === b) return;
  for (const id of b.out.ids()) { if (dropInto(dst, id, b)) { b.out.remove(id, 1); return; } }
}
// машина на топливе горит и в простое — вдвое медленнее, чем в работе
function updateMachine(b, dt) {
  updateMachineCore(b, dt);
  const def = BUILDINGS[b.type];
  if (b.active || !def.fuel || def.power && !def.powerOrFuel || def.powerOrFuel && b.powerSat > 0) return;
  if (b.burn <= 0) {
    const f = FUEL_ITEMS.find(id => b.fuel.count(id) > 0);
    if (!f) return;
    b.fuel.remove(f, 1); statC(f, 1); b.burn += ITEMS[f].fuel;
  }
  b.burn -= dt * def.burn * 0.5;
}
function updateMachineCore(b, dt) {
  const def = BUILDINGS[b.type];
  if (def.push && b.out.n) drillPush(b);
  let r;
  if (def.crafts === 'drill') r = drillRecipe(b);
  else if (def.auto && !b.crafting) { r = autoRecipe(b); b.recipe = r ? r.id : null; }
  else r = b.recipe ? RECIPES[b.recipe] : null;
  b.active = false;
  b.wantPower = 0;
  if (!r) return;
  // жидкости подтягиваем из соседних сетей
  if (r.fin) pullFluids(b, r);
  if (!b.crafting) {
    if (!b.inp.has(r.in) || !fluidsReady(b, r) || !outputsFit(b, r)) { b.status = 'ждёт сырьё'; if (!outputsFit(b, r)) b.status = 'выход переполнен'; return; }
    b.inp.pay(r.in);
    statCAll(r.in);
    if (r.fin) for (const f in r.fin) b.fluid[f] -= r.fin[f];
    b.crafting = true; b.prog = 0;
    b.curRecipe = r;
  }
  r = b.curRecipe || r;
  let speed = (def.speed || 1) * TUNE.machine * modSpeed(b) * workerMult(b) * beaconMult(b) * (1 + (S.bonus.machine || 0));
  // powerOrFuel: от вала, а если вала нет — на топливе
  let onFuel = !!def.fuel;
  if (def.power) {
    b.wantPower = def.power * modCost(b);
    if (def.powerOrFuel && !(b.powerSat > 0)) onFuel = true;
    else {
      onFuel = def.fuel && !def.powerOrFuel;
      speed *= b.powerSat || 0;
      if (!b.powerSat) { b.status = 'нет энергии'; return; }
    }
  }
  if (onFuel) {
    if (b.burn <= 0) {
      const f = FUEL_ITEMS.find(id => b.fuel.count(id) > 0);
      if (!f) { b.status = def.powerOrFuel ? 'нет топлива и вала' : 'нет топлива'; return; }
      b.fuel.remove(f, 1); statC(f, 1);
      b.burn += ITEMS[f].fuel;
    }
    b.burn -= dt * def.burn * modCost(b);
  }
  if (speed <= 0) return;
  b.active = true;
  b.status = 'работает';
  if (def.pollution) addPollution(b.x, b.y, def.pollution * dt * modCost(b));
  b.prog += dt * speed / r.time;
  if (b.prog >= 1) {
    if (!outputsFit(b, r)) { b.prog = 1; b.status = 'выход переполнен'; return; }
    if (r.tile) takeResource(r.tile[0], r.tile[1], 1);
    for (const id in r.out) {
      // продуктивность добычи: буры иногда дают лишнюю руду
      const extra = r.tile && Math.random() < (S.bonus.prod || 0) % 1 ? 1 : 0;
      const n = r.out[id] + extra + (r.tile ? Math.floor(S.bonus.prod || 0) : 0);
      b.out.add(id, n); S.stats.made[id] = (S.stats.made[id] || 0) + n; statP(id, n);
    }
    b.cycles = (b.cycles || 0) + 1;
    b.crafting = false; b.prog = 0; b.curRecipe = null;
  }
}

// сколько единиц предмета постройка примет
function acceptCount(b, id) {
  const def = BUILDINGS[b.type];
  switch (def.kind) {
    case 'chest':
      if (def.sub === 'wood') return FUEL_ITEMS.includes(id) ? b.inv.space(id) : 0;
      return b.inv.space(id);
    case 'barracks': return FOOD_ITEMS.includes(id) ? b.inv.space(id) : 0;
    case 'house':
      if (FOOD_ITEMS.includes(id) || id === 'furniture' || id === 'clothes' || id === 'heater') return Math.min(b.inv.space(id), id === 'furniture' || id === 'clothes' || id === 'heater' ? Math.max(0, 4 - b.inv.count(id)) : 50);
      if (id === 'coal' || id === 'wood') return Math.max(0, 30 - b.inv.count(id));
      return 0;
    case 'machine': {
      let r = b.recipe ? RECIPES[b.recipe] : null;
      if (def.auto) {
        // плавильня принимает любую руду, если вход пуст или руда та же
        const smelt = machineRecipeFor(b, id);
        if (smelt) {
          // вход пуст или в нём та же руда (топливо не в счёт)
          let other = false;
          for (const x in b.inp.c) if (x !== id && !FUEL_ITEMS.includes(x) && b.inp.c[x] > 0) { other = true; break; }
          if (!other) return Math.max(0, smelt.in[id] * 10 - b.inp.count(id));
        }
      } else if (r && r.in[id]) {
        const want = Math.max(r.in[id] * 3, 4) - b.inp.count(id);
        if (want > 0) return want;
      }
      if (def.fuel && FUEL_ITEMS.includes(id)) return Math.max(0, 15 - b.fuel.count(id));
      return 0;
    }
    case 'gen':
      if (b.type === 'treadwheel' && id === 'minigolem') return b.wheelGolem || workerAt(b.id, 'orc') ? 0 : 1;
      return def.fuel && FUEL_ITEMS.includes(id) ? Math.max(0, 15 - b.fuel.count(id)) : 0;
    case 'lab': return id[0] === 'f' && /^f\d$/.test(id) ? Math.max(0, 20 - b.inv.count(id)) : 0;
    case 'tower': return def.weapon.ammo && def.weapon.ammo.includes(id) ? Math.max(0, 60 - b.inv.count(id)) : 0;
    case 'nest': return id === 'gargoyle' ? 1 : 0;
    case 'bhub': return id === 'builder' ? Math.max(0, 20 - b.inv.count(id)) : 0;
    case 'csite': return COLOSSUS_NEED[id] && !S.colossus ? Math.max(0, COLOSSUS_NEED[id] - b.inv.count(id)) : 0;
  }
  return 0;
}

function insertInto(b, id, k) {
  const n = Math.min(k, acceptCount(b, id));
  if (n <= 0) return 0;
  const def = BUILDINGS[b.type];
  if (b.type === 'nest') { b.spiders.push(newSpider(b)); return 1; }
  if (def.kind === 'machine') {
    const r = b.recipe ? RECIPES[b.recipe] : null;
    const isIngr = def.auto ? machineRecipes(b).some(x => RECIPES[x].in[id]) : (r && r.in[id]);
    if (isIngr && !(def.fuel && FUEL_ITEMS.includes(id) && b.inp.count(id) >= (r ? r.in[id] * 3 : 99))) return b.inp.add(id, n);
    if (def.fuel && FUEL_ITEMS.includes(id)) return b.fuel.add(id, n);
    return b.inp.add(id, n);
  }
  if (b.type === 'treadwheel' && id === 'minigolem') { b.wheelGolem = true; netsDirty = true; return 1; }
  if (def.kind === 'gen') return b.fuel.add(id, n);
  return b.inv.add(id, n);
}

// что вектор может забрать из постройки
function extractFrom(b, filter) {
  const def = BUILDINGS[b.type];
  let inv = null;
  if (def.kind === 'chest') inv = b.inv;
  else if (def.kind === 'machine') inv = b.out;
  if (!inv) return null;
  for (const id in inv.c) if (!filter || filter(id)) { inv.remove(id, 1); return id; }
  return null;
}

// игрок кладёт предмет в постройку
function playerInsert(b, id, k) {
  const inv = S.player.inv;
  k = Math.min(k, inv.count(id));
  const n = insertInto(b, id, k);
  if (n > 0) inv.remove(id, n);
  return n;
}
function playerTakeAll(b) {
  const inv = S.player.inv;
  let got = 0;
  for (const L of [b.inv, b.out]) {
    if (!L) continue;
    for (const id of L.ids()) { const n = inv.add(id, L.count(id)); L.remove(id, n); got += n; }
  }
  if (b.items) { for (const it of b.items) if (inv.add(it.id, 1)) got++; b.items = []; }
  return got;
}

function updateBuildings(dt) {
  for (const b of bldKind('beacon')) { b.wantPower = BUILDINGS.beacon.power; b.active = b.powerSat > 0; }
  for (const b of bldKind('machine')) updateMachine(b, dt);
  for (const b of bldKind('lab')) updateLab(b, dt);
}

// медленный тик: самопочинка, топливо обогревателей
function slowBuildings() {
  for (const b of S.buildings.values()) {
    if (b.hp < b.maxHp && S.time - b.lastHit > 10) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.01);
    if (b.type === 'watchtower') watchtowerTick(b);
  }
  autoRepair();
}
// дозорная вышка: разведка и предупреждение о врагах
function watchtowerTick(b) {
  const cx = b.x + 0.5, cy = b.y + 0.5;
  if (!b.scouted || S.time - b.scouted > 20) { b.scouted = S.time; for (let a = 0; a < 6.28; a += 0.6) explore(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 10); explore(cx, cy, 14); }
  if (S.time - (S.watchWarn || -99) < 40) return;
  for (const e of S.enemies) {
    if (e.mode === 'guard' || e.dead || e.warned || dist(e.x, e.y, cx, cy) > 30) continue;
    // о каждом отряде бьём тревогу один раз, а не каждые 40 с, пока он стоит рядом
    for (const o of S.enemies) if (dist(o.x, o.y, e.x, e.y) < 15) o.warned = true;
    S.watchWarn = S.time;
    log(`Дозорная вышка: враги на подходе (${dirName(e.x - cx, e.y - cy)})!`, 'warn');
    sfx('alarm');
    break;
  }
}
// Анимансер сам чинит повреждённые постройки рядом, тратя ремкомплекты
function autoRepair() {
  const p = S.player, inv = p.inv;
  if (p.dead > 0 || !inv.count('repair')) return;
  for (const b of S.buildings.values()) {
    if (b.hp >= b.maxHp || S.time - b.lastHit < 2) continue;
    if (dist(b.x + b.w / 2, b.y + b.h / 2, p.x, p.y) > 3 + b.w / 2) continue;
    repairBuilding(b);
    return;
  }
}
// один ремкомплект чинит до 150 прочности
function repairBuilding(b) {
  const inv = S.player.inv;
  if (b.hp >= b.maxHp || !inv.remove('repair', 1)) return false;
  b.hp = Math.min(b.maxHp, b.hp + 150);
  floatText(b.x + b.w / 2, b.y, '🔧 +150', '#9fffb0');
  spawnBurst(b.x + b.w / 2, b.y + b.h / 2, '#ffe080', 5);
  sfx('build');
  return true;
}

// постройка лагеря в клетке: лагеря разложены по ячейкам 32×32 (перестройка — когда меняется список лагерей),
// раньше каждая проверка перебирала все лагеря карты — при открытой большой карте враги искали путь очень долго
const CIDX = { arr: null, n: -1, cell: new Map() };
function campCellsSync() {
  if (CIDX.arr === S.camps && CIDX.n === S.camps.length) return CIDX.cell; // у гостя список лагерей приходит новым массивом
  CIDX.cell = new Map(); CIDX.arr = S.camps; CIDX.n = S.camps.length;
  for (const c of S.camps) {
    let x0 = c.x, y0 = c.y, x1 = c.x, y1 = c.y;
    for (const s of c.structs) { const w = structW(s); x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + w); y1 = Math.max(y1, s.y + w); }
    for (let gy = Math.floor(y0 / 32); gy <= Math.floor(y1 / 32); gy++) for (let gx = Math.floor(x0 / 32); gx <= Math.floor(x1 / 32); gx++) {
      // числовой ключ — без склейки строк в горячем пути
      const k = gx * 1048576 + gy; let a = CIDX.cell.get(k);
      if (!a) CIDX.cell.set(k, a = []);
      a.push(c);
    }
  }
  return CIDX.cell;
}
function campStructAt(x, y) {
  const list = campCellsSync().get(Math.floor(x / 32) * 1048576 + Math.floor(y / 32));
  if (!list) return null;
  for (const c of list) {
    if (!c.alive || Math.abs(c.x - x) > 19 || Math.abs(c.y - y) > 19) continue;
    for (const s of c.structs) { if (s.hp <= 0) continue; const w = structW(s); if (x >= s.x && x < s.x + w && y >= s.y && y < s.y + w) return s; }
  }
  return null;
}

// проходима ли клетка для своих (Анимансер, големы): ворота открываются перед ними
function walkable(x, y) {
  const c = chunkOf(x, y), i = tidx(x, y);
  if (c.ground[i] === GROUND.water || c.ground[i] === GROUND.wall) return false;
  const b = c.bld[i];
  // сквозь манипуляторы (векторы) можно проходить
  return !b || !!BUILDINGS[b.type].walk || !!BUILDINGS[b.type].gate || BUILDINGS[b.type].kind === 'vector' || b.type === 'torch';
}
// для врагов ворота — такая же стена
function enemyWalkable(x, y) {
  const c = chunkOf(x, y), i = tidx(x, y);
  if (c.ground[i] === GROUND.water || c.ground[i] === GROUND.wall) return false;
  const b = c.bld[i];
  return !b || !!BUILDINGS[b.type].walk;
}
