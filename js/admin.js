'use strict';
// Админ-режим (включается в Настройках): правка баланса прямо в игре. Всё, что изменено, хранится в сохранении
// (S.admin) — его можно прислать разработчику и принять как новые значения по умолчанию.
//   S.admin.world — ручки мира (TUNE): набеги, загрязнение, лагеря, дань, торговец, общие скорости;
//   S.admin.t[таблица][id][поле] — правка любого числового поля построек, рецептов, предметов, врагов, оружия.

// ---------- ручки мира ----------
// [ключ, название, по умолчанию, группа, шаг]
const TUNE_DEFS = [
  ['research', L('Скорость исследований ×'), 1, L('Скорости'), 0.1],
  ['machine', L('Скорость всех машин ×'), 1, L('Скорости'), 0.1],
  ['handCraft', L('Скорость крафта в руках ×'), 1, L('Скорости'), 0.1],
  ['belt', L('Скорость всех конвейеров ×'), 1, L('Скорости'), 0.1],
  ['vector', L('Скорость всех манипуляторов ×'), 1, L('Скорости'), 0.1],
  ['golem', L('Скорость големов ×'), 1, L('Скорости'), 0.1],
  ['playerHp', L('Здоровье героя ×'), 1, L('Герой'), 0.1],
  ['raidMin', L('Обычный набег: не раньше, с'), 600, L('Набеги'), 30],
  ['raidMax', L('Обычный набег: не позже, с'), 900, L('Набеги'), 30],
  ['raidGap', L('Пауза между любыми набегами, с'), 240, L('Набеги'), 30],
  ['raidSize', L('Размер набегов ×'), 1, L('Набеги'), 0.1],
  ['enemyHp', L('Здоровье врагов ×'), 1, L('Набеги'), 0.1],
  ['enemyDmg', L('Урон врагов ×'), 1, L('Набеги'), 0.1],
  ['evo', L('Скорость эволюции врагов ×'), 1, L('Набеги'), 0.1],
  ['siegeMin', L('Осада: не раньше, с'), 2400, L('Набеги'), 60],
  ['siegeMax', L('Осада: не позже, с'), 3600, L('Набеги'), 60],
  ['siegeCount', L('Машин в осаде ×'), 1, L('Набеги'), 0.1],
  ['expandMin', L('Новая стоянка врагов: не раньше, с'), 900, L('Лагеря'), 30],
  ['expandMax', L('Новая стоянка врагов: не позже, с'), 1500, L('Лагеря'), 30],
  ['upgrade', L('Укрепление лагерей: раз в, с'), 900, L('Лагеря'), 30],
  ['campHp', L('Прочность построек лагерей ×'), 1, L('Лагеря'), 0.1],
  ['campHpLvl', L('Прибавка прочности за уровень лагеря'), 0.2, L('Лагеря'), 0.05],
  ['guardT', L('Охрана лагеря подходит раз в, с'), 28, L('Лагеря'), 2],
  ['pollEmit', L('Выход дыма ×'), 0.6, L('Загрязнение'), 0.05],
  ['blightRate', L('Скорость заражения мира ×'), 1, L('Загрязнение'), 0.1],
  ['mutants', L('Доля мутантов ×'), 1, L('Загрязнение'), 0.1],
  ['blightGap', L('Пауза между ядовитыми событиями, с'), 960, L('Загрязнение'), 60],
  ['pollSpread', L('Растекание дыма в сторону, доля в секунду'), 0.005, L('Загрязнение'), 0.001],
  ['pollAbsorb', L('Поглощение дыма землёй, доля в секунду'), 0.0015, L('Загрязнение'), 0.0005],
  ['pollForest', L('Поглощение лесом (на дерево)'), 0.00001, L('Загрязнение'), 0.000005],
  ['polAnger', L('Дым, с которого злится лагерь'), 0.5, L('Загрязнение'), 0.05],
  ['polWaveCamp', L('Орда от дыма с лагеря: не чаще, с'), 600, L('Загрязнение'), 30],
  ['polWaveAll', L('Орда от дыма со всех: не чаще, с'), 300, L('Загрязнение'), 30],
  ['ore', L('Запас новых залежей ×'), 1, L('Мир'), 0.1],
  ['tribEvery', L('Дань эльфам: раз в, с'), 1200, L('Дань и торговец'), 60],
  ['tribTime', L('Срок на уплату дани, с'), 420, L('Дань и торговец'), 30],
  ['tribBase', L('Дань: нижняя планка'), 100, L('Дань и торговец'), 10],
  ['tribStep', L('Дань: прибавка за каждую уплату'), 30, L('Дань и торговец'), 5],
  ['merchPrice', L('Цены торговца (чертежи, работники) ×'), 1, L('Дань и торговец'), 0.1],
  ['merchReward', L('Награды торговца ×'), 1, L('Дань и торговец'), 0.1],
];
const TUNE = {};
for (const [k, , v] of TUNE_DEFS) TUNE[k] = v;

// ---------- таблицы, которые можно править ----------
// для каждой: объект данных, подпись, какие поля показывать (числа сверху, числа во вложенных объектах), группировка
const ADMIN_TABLES = {
  bld: { name: L('Постройки'), data: () => BUILDINGS, label: d => d.name, group: d => d.kind,
    extra: d => d.kind === 'machine' ? ['speed'] : d.kind === 'vector' ? ['stack'] : [], nested: ['weapon', 'cost'] },
  recipe: { name: L('Рецепты'), data: () => RECIPES, label: (d, id) => Object.keys(d.out || {}).map(x => ITEMS[x] ? ITEMS[x].name : x).join(', ') + ' (' + id + ')', group: d => (d.at || []).join(','), nested: ['in', 'out'] },
  item: { name: L('Предметы'), data: () => ITEMS, label: d => d.name, group: d => d.bld ? L('постройки') : d.weapon ? L('оружие') : d.armor ? L('броня') : d.fuel ? L('топливо') : L('прочее'), extra: () => ['value'] },
  enemy: { name: L('Враги'), data: () => ENEMIES, label: d => d.name, group: d => d.siege ? L('осада') : L('бойцы') },
  weapon: { name: L('Оружие'), data: () => WEAPONS, label: d => d.name, group: d => d.melee ? L('ближний бой') : L('дальний бой') },
};
const ADMIN_SKIP = new Set(['size']); // размер постройки менять нельзя — сломает карту
let ADMIN_BASE = null; // исходные значения (до правок), снимок при первом применении
const ADMIN_APPLIED = {}; // что уже применено: таблица -> id -> [поля], чтобы вернуть при отмене

function adminBase() {
  if (ADMIN_BASE) return ADMIN_BASE;
  ADMIN_BASE = {};
  for (const t in ADMIN_TABLES) ADMIN_BASE[t] = JSON.parse(JSON.stringify(ADMIN_TABLES[t].data(), (k, v) => typeof v === 'function' ? undefined : v));
  return ADMIN_BASE;
}
// числовые поля записи: 'hp', 'weapon.range', 'cost.plank' …
function adminFields(t, id) {
  const T = ADMIN_TABLES[t], d = adminBase()[t][id];
  if (!d) return [];
  const f = [];
  for (const k in d) if (typeof d[k] === 'number' && !ADMIN_SKIP.has(k)) f.push(k);
  for (const k of (T.extra ? T.extra(d) : [])) if (!f.includes(k)) f.push(k);
  for (const n of T.nested || []) if (d[n] && typeof d[n] === 'object') for (const k in d[n]) if (typeof d[n][k] === 'number') f.push(n + '.' + k);
  return f;
}
function adminBaseVal(t, id, path) {
  const d = adminBase()[t][id]; if (!d) return undefined;
  const [a, b] = path.split('.');
  const v = b ? d[a] && d[a][b] : d[a];
  if (v != null) return v;
  return path === 'speed' || path === 'stack' ? 1 : undefined;
}
// исходное значение как есть (undefined, если поля у записи не было — тогда правку просто убираем)
function adminRawBase(t, id, path) { const d = adminBase()[t][id]; if (!d) return undefined; const [a, b] = path.split('.'); return b ? d[a] && d[a][b] : d[a]; }
function adminSet(obj, path, v) {
  const [a, b] = path.split('.');
  if (b) { if (!obj[a]) obj[a] = {}; obj[a][b] = v; } else obj[a] = v;
}
function adminUnset(obj, path, base) {
  const [a, b] = path.split('.');
  if (b) { if (obj[a]) { if (base === undefined) delete obj[a][b]; else obj[a][b] = base; } }
  else if (base === undefined) delete obj[a]; else obj[a] = base;
}

// применить S.admin к живым таблицам и ручкам мира
function applyAdmin() {
  const A = S && S.admin || {};
  for (const [k, , v] of TUNE_DEFS) TUNE[k] = A.world && A.world[k] != null ? A.world[k] : v;
  adminBase();
  // вернуть всё, что было изменено раньше
  for (const t in ADMIN_APPLIED) for (const id in ADMIN_APPLIED[t]) {
    const live = ADMIN_TABLES[t].data()[id];
    if (live) for (const p of ADMIN_APPLIED[t][id]) adminUnset(live, p, adminRawBase(t, id, p));
    delete ADMIN_APPLIED[t][id];
  }
  // наложить новые правки
  for (const t in A.t || {}) for (const id in A.t[t]) {
    const live = ADMIN_TABLES[t] && ADMIN_TABLES[t].data()[id];
    if (!live) continue;
    for (const p in A.t[t][id]) adminSet(live, p, A.t[t][id][p]);
    (ADMIN_APPLIED[t] || (ADMIN_APPLIED[t] = {}))[id] = Object.keys(A.t[t][id]);
  }
  // прочность уже стоящих построек — по новой прочности их вида
  for (const b of S.buildings.values()) {
    const d = BUILDINGS[b.type];
    if (d && d.hp && b.maxHp !== d.hp && b.type !== 'archer_s') { b.hp = Math.max(1, Math.round(b.hp / Math.max(1, b.maxHp) * d.hp)); b.maxHp = d.hp; }
  }
}
// записать правку (значение равно исходному — правка снимается)
function adminEdit(t, id, path, v) {
  S.admin = S.admin || {};
  if (t === 'world') {
    S.admin.world = S.admin.world || {};
    const def = TUNE_DEFS.find(x => x[0] === path);
    if (!def || isNaN(v) || v === def[2]) delete S.admin.world[path]; else S.admin.world[path] = v;
  } else {
    S.admin.t = S.admin.t || {}; const T = S.admin.t[t] || (S.admin.t[t] = {});
    const e = T[id] || (T[id] = {});
    if (isNaN(v) || v === adminBaseVal(t, id, path)) delete e[path]; else e[path] = v;
    if (!Object.keys(e).length) delete T[id];
  }
  applyAdmin();
  if (typeof mpCmd === 'function' && typeof MP !== 'undefined' && MP.role === 'client') mpCmd({ f: 'admin', admin: S.admin });
}
function adminCount() { const A = S.admin || {}; let n = Object.keys(A.world || {}).length; for (const t in A.t || {}) for (const id in A.t[t]) n += Object.keys(A.t[t][id]).length; return n; }

