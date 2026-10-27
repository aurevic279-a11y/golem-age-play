'use strict';
// Сохранения: автосейв в браузере + экспорт/импорт файла.

const SAVE_KEY = 'golem-age-save-v1';
let SAVED_CHUNKS = new Map();
const TRANSIENT = new Set(['bg', '_ci', '_civ', 'waterT', 'waterOk', '_burnt', 'owner', '_sm', '_smv', 'waitT', '_pt', 'cpath', 'cpathKey', 'cpathT', 'cpathI', 'net', 'fnets', 'fnet', 'powerSat', 'wantPower', 'curRecipe', 'status', 'active', 'pot', 'load', 'think', 'focus', 'swing', '_ph', '_camp', '_wall',
  'path', 'pathKey', 'pathVer', 'pathI', 'pathT', 'pathGX', 'pathGY', 'directT', 'stkT', 'stkM', 'stkN', 'rescue', 'rescueT', 'alertH', 'shelter', 'noPath', '_open', 'pathFor', 'deconBot', 'beacons', 'ipx', 'ipy', 'px', 'py', 'rx', 'ry', 'track', 'nx', 'ny']);

function serialize() {
  const chunks = [];
  for (const [k, c] of W) {
    const rec = { k };
    let any = false;
    if (c.modified) { rec.res = b64FromBytes(c.res); rec.amt = b64FromBytes(new Uint8Array(c.amt.buffer)); rec.ore2 = 1; any = true; } // ore2 — запас уже по новым залежам
    if (c.explored.some(v => v)) { rec.exp = b64FromBytes(c.explored); any = true; }
    if (any) chunks.push(rec);
  }
  // участки из загруженного сохранения, которые ещё не открывались в этой игре, — переносим как были (раньше терялись)
  for (const [k, sv] of SAVED_CHUNKS) if (!W.has(k)) chunks.push(sv);
  const o = {
    v: 1, seed: SEED, savedAt: Date.now(),
    S: {
      time: S.time, nextId: S.nextId, spawn: S.spawn, worldVer: S.worldVer, player: S.player,
      buildings: [...S.buildings.values()], golems: S.golems, enemies: S.enemies, camps: S.camps, campChunks: S.campChunks, caveChunks: S.caveChunks, citadels: S.citadels,
      research: S.research, workers: S.workers, elves: S.elves, merchant: S.merchant, nextMerchant: S.nextMerchant,
      quests: S.quests, blueprints: S.blueprints, stats: S.stats, tutorial: S.tutorial, cheats: S.cheats, raidT: S.raidT, envoy: S.envoy, delayed: S.delayed,
      crops: S.crops, quick: S.quick, carts: S.carts, ghosts: S.ghosts, ach: S.ach, colossus: S.colossus, dungeons: S.dungeons, siegeT: S.siegeT, evo: S.evo, pollTotal: S.pollTotal, expandT: S.expandT, evoShown: S.evoShown, mpHeroes: S.mpHeroes, floor: S.floor, admin: S.admin,
    },
    chunks, poll: [...POLL],
  };
  return JSON.stringify(o, (k, v) => TRANSIENT.has(k) ? undefined : v);
}

function saveGame(manual) {
  if (!S) return;
  if (typeof MP !== 'undefined' && MP.role === 'client') { if (manual) log('В гостях игра сохраняется у хозяина.'); return; }
  try {
    localStorage.setItem(SAVE_KEY, serialize());
    if (manual) log('Игра сохранена.', 'good');
  } catch (e) {
    log('Не удалось сохранить в браузере: ' + e.message + '. Сохраните в файл через меню.', 'warn');
  }
}

function exportSave() {
  const blob = new Blob([serialize()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `golem-age-${fmtTime(S.time).replace(/:/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  log('Файл сохранения скачан.', 'good');
}

function loadFromString(str) {
  const o = JSON.parse(str);
  if (!o || o.v !== 1) throw new Error('неизвестный формат');
  loadState(o);
  startGame();
}

function invify(b) {
  for (const k of ['inv', 'inp', 'out', 'fuel']) if (b[k] && b[k].c) b[k] = Inv.from(b[k]);
}

function loadState(o) {
  SEED = o.seed;
  W.clear(); POLL.clear(); RESV.clear(); PATCH_CACHE.clear(); CAMP_CACHE.clear(); CIT_CACHE.clear(); CIT_LAYOUT.clear(); CAVE_CACHE.clear(); DUNGEON_CACHE.clear();
  SAVED_CHUNKS = new Map(o.chunks.map(c => [c.k, c]));
  const d = o.S;
  S = freshState();
  Object.assign(S, {
    time: d.time, nextId: d.nextId, spawn: d.spawn, worldVer: d.worldVer || 1, golems: d.golems, enemies: d.enemies || [], camps: d.camps, campChunks: d.campChunks, caveChunks: d.caveChunks || [], citadels: d.citadels || [],
    research: d.research, workers: d.workers, elves: d.elves, merchant: d.merchant, nextMerchant: d.nextMerchant,
    quests: d.quests || [], blueprints: d.blueprints || [], stats: d.stats, tutorial: d.tutorial, cheats: d.cheats, raidT: d.raidT, envoy: d.envoy, delayed: d.delayed || [],
    ghosts: (d.ghosts || []).map(g => Object.assign(g, { bot: null })), evo: d.evo || 0, pollTotal: d.pollTotal || 0, expandT: d.expandT, evoShown: d.evoShown || 0,
    floor: d.floor || {}, admin: d.admin || {}, ach: d.ach || {}, colossus: d.colossus || null, dungeons: d.dungeons || [], siegeT: d.siegeT, mpHeroes: d.mpHeroes || {},
    crops: d.crops || {}, quick: d.quick || S.quick, carts: (d.carts || []).map(c => Object.assign(c, { inv: Inv.from(c.inv) })),
  });
  S.research.progress = S.research.progress || {};
  for (const b of d.buildings || []) if (b.type === 'treadwheel' && b.wheelGolem === undefined) b.wheelGolem = true;
  const p = Object.assign(newPlayer(), d.player);
  p.inv = Inv.from(d.player.inv);
  // старые сохранения: одно оружие → три слота (праща + прежнее оружие)
  if (!d.player.guns) p.guns = null;
  ensureGuns(p);
  if (d.player.trash) p.trash = Inv.from(d.player.trash);
  S.player = p;
  recomputeBonus();
  const oldArchers = [];
  for (const bd of d.buildings) {
    if (bd.type === 'mine' && bd.w !== 3) { p.inv.addAll({ stone: 25, plank: 10, wgear: 4 }); continue; }
    // башня лучника стала 2×2 — старые 1×1 переставим после загрузки остального
    if (bd.type === 'archer' && bd.w === 1) { oldArchers.push(bd); continue; }
    const b = Object.assign({}, bd);
    invify(b);
    if (BUILDINGS[b.type] && BUILDINGS[b.type].kind === 'chest' && b.inv) { b.inv.slots = true; b.inv.cap = BUILDINGS[b.type].cap; }
    if (b.type === 'belt' || b.type === 'fastbelt') b.items = b.items || [];
    if (b.fluid == null && BUILDINGS[b.type].kind === 'machine') b.fluid = {};
    registerBuilding(b);
  }
  // старые башни лучника 1×1: где рядом есть место — становятся новыми 2×2, иначе остаются малыми (archer_s)
  let grown = 0;
  for (const bd of oldArchers) {
    const b = Object.assign({}, bd);
    invify(b);
    const fits = (x, y) => { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const tx = x + i, ty = y + j; if (bldAt(tx, ty) || !walkable(tx, ty) || campStructAt(tx, ty) || resAt(tx, ty) === RES_ID.tree) return false; } return true; };
    const spot = [[b.x, b.y], [b.x - 1, b.y], [b.x, b.y - 1], [b.x - 1, b.y - 1]].find(([x, y]) => fits(x, y));
    if (spot) { b.x = spot[0]; b.y = spot[1]; b.w = b.h = 2; b.maxHp = BUILDINGS.archer.hp; b.hp = Math.min(b.maxHp, b.hp + 250); grown++; }
    else b.type = 'archer_s';
    registerBuilding(b);
  }
  if (oldArchers.length && typeof log === 'function') setTimeout(() => log(`Башни лучников теперь 2×2: ${grown} из ${oldArchers.length} старых башен выросли на месте, остальные (зажатые стенами) стоят на узком основании, но стреляют так же.`, 'good'), 1500);
  // башни лучников снова с прежней прочностью (в прошлой версии было 600)
  for (const b of S.buildings.values()) if ((b.type === 'archer' || b.type === 'archer_s') && b.maxHp !== BUILDINGS[b.type].hp) { b.maxHp = BUILDINGS[b.type].hp; b.hp = Math.min(b.hp, b.maxHp); }
  for (const [k, v] of o.poll || []) POLL.set(k, v);
  for (const g of S.golems) if (g.state === 'walk' || g.state === 'work') RESV.set(rkey(g.tx, g.ty), g.id);
  // правки админ-меню из сохранения — до пересчёта лагерей (их прочность зависит от ручек мира)
  applyAdmin();
  // лагеря из прошлых версий: прочность построек — по новой формуле (раньше росла слишком сильно)
  for (const c of S.camps) if (c.alive && c.type !== 'elf' && typeof restrengthCamp === 'function') restrengthCamp(c);
  // у торговца, что уже стоит, — новые цены на чертежи и улучшения
  if (S.merchant && S.merchant.offers) for (const of of S.merchant.offers) if (of.kind === 'bp' && BLUEPRINTS[of.id]) of.price = BLUEPRINTS[of.id].price;
  // инструменты големов больше не предметы: убираем скрафтованные кирки, топоры и мотыги отовсюду
  for (const g of S.golems) { delete g.tool; if (g.type !== 'fueler') g.zone = null; } // прямоугольная зона — только у заправщика
  { const drop = ['pickaxe', 'axe', 'hoe'], clean = inv => { if (inv && inv.c) for (const id of drop) if (inv.count(id)) inv.remove(id, inv.count(id)); };
    clean(S.player.inv); for (const b of S.buildings.values()) { clean(b.inv); clean(b.out); clean(b.fuel); }
    if (S.player.craftBag) for (const id of drop) delete S.player.craftBag[id]; }
  netsDirty = true;
  // разведанные и изменённые участки сразу в память — карта показывает всё открытое, а не только посещённое
  for (const k of SAVED_CHUNKS.keys()) { const [cx, cy] = k.split(',').map(Number); getChunk(cx, cy); }
  CAM.x = p.x; CAM.y = p.y;
}

function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadLocal() { loadFromString(localStorage.getItem(SAVE_KEY)); }
