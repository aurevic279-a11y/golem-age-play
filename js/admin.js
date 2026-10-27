'use strict';
// Админ-режим (включается в Настройках): правка баланса прямо в игре. Всё, что изменено, хранится в сохранении
// (S.admin) — его можно прислать разработчику и принять как новые значения по умолчанию.
//   S.admin.world — ручки мира (TUNE): набеги, загрязнение, лагеря, дань, торговец, общие скорости;
//   S.admin.t[таблица][id][поле] — правка любого числового поля построек, рецептов, предметов, врагов, оружия.

// ---------- ручки мира ----------
// [ключ, название, по умолчанию, группа, шаг]
const TUNE_DEFS = [
  ['research', 'Скорость исследований ×', 1, 'Скорости', 0.1],
  ['machine', 'Скорость всех машин ×', 1, 'Скорости', 0.1],
  ['handCraft', 'Скорость крафта в руках ×', 1, 'Скорости', 0.1],
  ['belt', 'Скорость всех конвейеров ×', 1, 'Скорости', 0.1],
  ['vector', 'Скорость всех манипуляторов ×', 1, 'Скорости', 0.1],
  ['golem', 'Скорость големов ×', 1, 'Скорости', 0.1],
  ['playerHp', 'Здоровье героя ×', 1, 'Герой', 0.1],
  ['raidMin', 'Обычный набег: не раньше, с', 600, 'Набеги', 30],
  ['raidMax', 'Обычный набег: не позже, с', 900, 'Набеги', 30],
  ['raidGap', 'Пауза между любыми набегами, с', 240, 'Набеги', 30],
  ['raidSize', 'Размер набегов ×', 1, 'Набеги', 0.1],
  ['enemyHp', 'Здоровье врагов ×', 1, 'Набеги', 0.1],
  ['enemyDmg', 'Урон врагов ×', 1, 'Набеги', 0.1],
  ['evo', 'Скорость эволюции врагов ×', 1, 'Набеги', 0.1],
  ['siegeMin', 'Осада: не раньше, с', 2400, 'Набеги', 60],
  ['siegeMax', 'Осада: не позже, с', 3600, 'Набеги', 60],
  ['siegeCount', 'Машин в осаде ×', 1, 'Набеги', 0.1],
  ['expandMin', 'Новая стоянка врагов: не раньше, с', 900, 'Лагеря', 30],
  ['expandMax', 'Новая стоянка врагов: не позже, с', 1500, 'Лагеря', 30],
  ['upgrade', 'Укрепление лагерей: раз в, с', 900, 'Лагеря', 30],
  ['campHp', 'Прочность построек лагерей ×', 1, 'Лагеря', 0.1],
  ['campHpLvl', 'Прибавка прочности за уровень лагеря', 0.2, 'Лагеря', 0.05],
  ['guardT', 'Охрана лагеря подходит раз в, с', 28, 'Лагеря', 2],
  ['pollEmit', 'Выход дыма ×', 0.6, 'Загрязнение', 0.05],
  ['pollSpread', 'Растекание дыма в сторону, доля в секунду', 0.005, 'Загрязнение', 0.001],
  ['pollAbsorb', 'Поглощение дыма землёй, доля в секунду', 0.0015, 'Загрязнение', 0.0005],
  ['pollForest', 'Поглощение лесом (на дерево)', 0.00001, 'Загрязнение', 0.000005],
  ['polAnger', 'Дым, с которого злится лагерь', 0.5, 'Загрязнение', 0.05],
  ['polWaveCamp', 'Орда от дыма с лагеря: не чаще, с', 600, 'Загрязнение', 30],
  ['polWaveAll', 'Орда от дыма со всех: не чаще, с', 300, 'Загрязнение', 30],
  ['ore', 'Запас новых залежей ×', 1, 'Мир', 0.1],
  ['tribEvery', 'Дань эльфам: раз в, с', 1200, 'Дань и торговец', 60],
  ['tribTime', 'Срок на уплату дани, с', 420, 'Дань и торговец', 30],
  ['tribBase', 'Дань: нижняя планка', 100, 'Дань и торговец', 10],
  ['tribStep', 'Дань: прибавка за каждую уплату', 30, 'Дань и торговец', 5],
  ['merchPrice', 'Цены торговца (чертежи, работники) ×', 1, 'Дань и торговец', 0.1],
  ['merchReward', 'Награды торговца ×', 1, 'Дань и торговец', 0.1],
];
const TUNE = {};
for (const [k, , v] of TUNE_DEFS) TUNE[k] = v;

// ---------- таблицы, которые можно править ----------
// для каждой: объект данных, подпись, какие поля показывать (числа сверху, числа во вложенных объектах), группировка
const ADMIN_TABLES = {
  bld: { name: 'Постройки', data: () => BUILDINGS, label: d => d.name, group: d => d.kind,
    extra: d => d.kind === 'machine' ? ['speed'] : d.kind === 'vector' ? ['stack'] : [], nested: ['weapon', 'cost'] },
  recipe: { name: 'Рецепты', data: () => RECIPES, label: (d, id) => Object.keys(d.out || {}).map(x => ITEMS[x] ? ITEMS[x].name : x).join(', ') + ' (' + id + ')', group: d => (d.at || []).join(','), nested: ['in', 'out'] },
  item: { name: 'Предметы', data: () => ITEMS, label: d => d.name, group: d => d.bld ? 'постройки' : d.weapon ? 'оружие' : d.armor ? 'броня' : d.fuel ? 'топливо' : 'прочее', extra: () => ['value'] },
  enemy: { name: 'Враги', data: () => ENEMIES, label: d => d.name, group: d => d.siege ? 'осада' : 'бойцы' },
  weapon: { name: 'Оружие', data: () => WEAPONS, label: d => d.name, group: d => d.melee ? 'ближний бой' : 'дальний бой' },
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

