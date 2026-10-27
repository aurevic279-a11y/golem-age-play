'use strict';
// Все игровые данные: предметы, рецепты, постройки, исследования, враги.
// Топливо (fuel) — секунды работы при расходе 1/с. food — качество еды.

const ITEMS = {
  // сырьё
  wood:        { name: 'Дерево',            icon: ['log', '#8a5a2b', '#5e3a18'], fuel: 30, value: 1 },
  stone:       { name: 'Камень',            icon: ['rock', '#9a9a9a', '#6a6a6a'], value: 1 },
  iron_ore:    { name: 'Железная руда',     icon: ['ore', '#7a6a62', '#c98d6a'], value: 2 },
  copper_ore:  { name: 'Медная руда',       icon: ['ore', '#6e6a5e', '#e07a3c'], value: 2 },
  coal:        { name: 'Уголь',             icon: ['ore', '#2a2a2a', '#111111'], fuel: 90, value: 2 },
  sulfur:      { name: 'Сера',              icon: ['ore', '#bfae3a', '#f2e45a'], value: 4 },
  iron_ore_pure: { name: 'Чистая железная руда', icon: ['ore', '#9a8a80', '#f0f4ff'], value: 3, desc: 'Из чистых жил дальних залежей. Плавится 1:2 — вдвое больше железа.' },
  copper_ore_pure: { name: 'Чистая медная руда', icon: ['ore', '#9a7a60', '#ffd0a0'], value: 3, desc: 'Из чистых жил дальних залежей. Плавится 1:2 — вдвое больше меди.' },
  gold_ore:    { name: 'Золотая руда',      icon: ['ore', '#7a7060', '#ffd23a'], value: 8 },
  mithril_ore: { name: 'Мифриловая руда',   icon: ['ore', '#5a6a7a', '#9fe8ff'], value: 20 },
  sand:        { name: 'Песок',             icon: ['dust', '#e2cf8a', '#c2ad66'], value: 1 },
  relic:       { name: 'Древняя реликвия',  icon: ['relic', '#c9a0ff', '#6a3fa0'], value: 400 },
  berries:     { name: 'Ягоды',             icon: ['berry', '#c0304a', '#2f7a2f'], food: 1, value: 1 },
  raw_meat:    { name: 'Сырое мясо',        icon: ['meat', '#c0505a', '#f0d0c0'], food: 1, value: 2 },
  wheat:       { name: 'Пшеница',           icon: ['wheat', '#e2c050', '#a08020'], value: 1 },
  leather:     { name: 'Кожа',              icon: ['leather', '#9a6a3a', '#6a4220'], value: 3 },
  // полуфабрикаты
  plank:       { name: 'Доски',             icon: ['plank', '#c08a4a', '#8a5a2a'], fuel: 12, value: 1 },
  wgear:       { name: 'Деревянная шестерня', icon: ['gear', '#b07a40', '#7a4a20'], value: 3 },
  wshaft:      { name: 'Деревянный вал',    icon: ['shaft', '#b07a40', '#7a4a20'], value: 3 },
  minigolem:   { name: 'Малый голем',       icon: ['golem', '#9a8a70', '#5affc0'], value: 8 },
  block:       { name: 'Тёсаный блок',      icon: ['block', '#b8b0a0', '#7a7266'], value: 3 },
  iron:        { name: 'Железный слиток',   icon: ['ingot', '#b8c0c8', '#6a7078'], value: 4 },
  copper:      { name: 'Медный слиток',     icon: ['ingot', '#e89058', '#a0502a'], value: 4 },
  gold:        { name: 'Золото',            icon: ['ingot', '#ffd84a', '#b08a10'], value: 20 },
  gem:         { name: 'Самоцвет',          icon: ['relic', '#7ff0ff', '#2a8ad0'], value: 80, desc: 'Валюта торговцев. Не добывается и не крафтится: только из лагерей врагов, подземелий, заданий торговца и за продажу ему товаров.' },
  gold_dust:   { name: 'Золотая пыль',      icon: ['dust', '#ffe070', '#c8a030'], value: 10 },
  mithril:     { name: 'Мифрил',            icon: ['ingot', '#bff4ff', '#4aa0c8'], value: 60 },
  bronze:      { name: 'Бронза',            icon: ['ingot', '#c8a050', '#7a5a20'], value: 8 },
  steel:       { name: 'Сталь',             icon: ['ingot', '#8a96a8', '#3a4250'], value: 10 },
  igear:       { name: 'Железная шестерня', icon: ['gear', '#b0b8c0', '#5a6068'], value: 8 },
  sshaft:      { name: 'Стальной вал',      icon: ['shaft', '#8a96a8', '#3a4250'], value: 20 },
  spring:      { name: 'Пружина',           icon: ['spring', '#9aa6b8', '#4a5260'], value: 6 },
  clockwork:   { name: 'Заводной механизм', icon: ['clock', '#c8a050', '#8a96a8'], value: 60 },
  glass:       { name: 'Стекло',            icon: ['glass', '#bfe8f0', '#7ab0c0'], value: 2 },
  flask:       { name: 'Колба',             icon: ['flask', '#bfe8f0', '#ffffff'], value: 3 },
  boiler:      { name: 'Котёл',             icon: ['boiler', '#c8a050', '#6a4a20'], value: 50 },
  tar:         { name: 'Тяжёлый дёготь',    icon: ['drop', '#2a1a10', '#5a3a20'], fuel: 120, value: 4 },
  oil:         { name: 'Лёгкое масло',      icon: ['flask', '#e8c050', '#fff0a0'], value: 4 },
  gas:         { name: 'Горючий газ',       icon: ['flask', '#90e070', '#d0ffb0'], value: 4 },
  explosive:   { name: 'Взрывчатка',        icon: ['bomb', '#3a3a3a', '#e05030'], value: 12 },
  shackles:    { name: 'Кандалы',           icon: ['chain', '#d8dce2', '#3a3a40'], value: 20 },
  charcoal:    { name: 'Древесный уголь',   icon: ['ore', '#4a3a30', '#1a1410'], fuel: 120, value: 2, desc: 'Горит вдвое дольше дерева. Заменяет уголь в кузне.' },
  brick:       { name: 'Кирпич',            icon: ['block', '#c0603a', '#7a3420'], value: 3, desc: 'Обожжённая глина — для печей, кузен и домов.' },
  cwire:       { name: 'Медная проволока',  icon: ['spring', '#f0a060', '#a0502a'], value: 2 },
  irod:        { name: 'Железный прут',     icon: ['shaft', '#c8d0d8', '#6a7078'], value: 2 },
  nails:       { name: 'Гвозди',            icon: ['bolt', '#a8b0b8', '#5a6068'], value: 1 },
  rope:        { name: 'Верёвка',           icon: ['spring', '#d8b878', '#8a6a3a'], value: 2, desc: 'Свивается из пшеницы. Нужна для подъёмных механизмов и вышек.' },
  rune:        { name: 'Рунная пластина',   icon: ['module', '#5affc0', '#e89058'], value: 10, desc: 'Камень с медными рунами: «мозг» механических построек.' },
  steed:       { name: 'Механический скакун', icon: ['golem', '#b08040', '#ffd060'], value: 80, desc: 'Заводной конь Анимансера: клавиша F — сесть или спешиться. Верхом скорость вдвое выше, но добывать нельзя.' },
  colossus_part: { name: 'Сегмент колосса', icon: ['clock', '#9fe8ff', '#c8a050'], value: 300, desc: 'Старая деталь колосса (из прежних версий).' },
  colossus_frame: { name: 'Каркас колосса', icon: ['block', '#8a8f98', '#c8a050'], value: 120, desc: 'Стальной остов Великого Голема. Площадке нужно 100.' },
  colossus_limb: { name: 'Конечность колосса', icon: ['shaft', '#9a9ea8', '#e8b84a'], value: 150, desc: 'Рука или нога с пружинами и шестернями. Площадке нужно 80.' },
  colossus_armor: { name: 'Руническая броня', icon: ['armor', '#7ab0ff', '#9fe8ff'], value: 150, desc: 'Пластина из бронзы и стекла с рунами — делается в алхимической лаборатории. Площадке нужно 80.' },
  colossus_heart: { name: 'Сердце колосса', icon: ['clock', '#5affc0', '#c8a050'], value: 600, desc: 'Мифриловое сердце с часовым механизмом. Площадке нужно 20.' },
  builder:     { name: 'Голем-строитель',   icon: ['golem', '#c8a050', '#5affc0'], value: 30, desc: 'Летающий голем для Гильдии строителей: строит призраки построек и разбирает помеченное на снос. Кладите в гильдию.' },
  repair:      { name: 'Ремкомплект',       icon: ['module', '#d8a850', '#7a5a20'], value: 4, desc: 'Чинит постройки: Анимансер сам латает повреждённые постройки рядом (до 3 клеток), тратя ремкомплекты. Или кнопка «Починить» в окне постройки.' },
  // еда
  stew:        { name: 'Похлёбка',          icon: ['bowl', '#a06a3a', '#d09a5a'], food: 2, value: 6 },
  roast:       { name: 'Жаркое',            icon: ['meat', '#8a4a2a', '#e0b080'], food: 3, value: 8 },
  flour:       { name: 'Мука',              icon: ['dust', '#f4f0e0', '#c8c0a8'], value: 2 },
  pie:         { name: 'Пирог',             icon: ['pie', '#d8a050', '#a0302a'], food: 4, value: 14 },
  // комфорт
  furniture:   { name: 'Мебель',            icon: ['chair', '#a0703a', '#c8a050'], value: 20 },
  clothes:     { name: 'Одежда',            icon: ['shirt', '#6a5aa0', '#3a2a70'], value: 15 },
  heater:      { name: 'Обогреватель',      icon: ['heater', '#c8a050', '#e05020'], value: 25 },
  // фолианты
  f1:          { name: 'Бурый фолиант',     icon: ['book', '#8a5a2a', '#e0c080'], value: 5 },
  f2:          { name: 'Зелёный фолиант',   icon: ['book', '#3a8a3a', '#c0f0a0'], value: 15 },
  f3:          { name: 'Красный фолиант',   icon: ['book', '#a02a2a', '#f0a0a0'], value: 30 },
  f4:          { name: 'Синий фолиант',     icon: ['book', '#2a5aa8', '#a0d0ff'], value: 50 },
  f5:          { name: 'Пурпурный фолиант', icon: ['book', '#7a3aa0', '#e0b0ff'], value: 90 },
  f6:          { name: 'Мифриловый фолиант', icon: ['book', '#4ab0c8', '#e0ffff'], value: 200 },
  // снаряжение
  bolt:        { name: 'Болты',             icon: ['bolt', '#8a6a3a', '#b8c0c8'], value: 1, desc: 'Боеприпасы для арбалетов Анимансера и башни голема-лучника. Арбалет тратит болты из инвентаря; башню заряжайте вручную (клик по башне) или вектором.' },
  crossbow:    { name: 'Арбалет',           icon: ['crossbow', '#8a5a2a', '#b8c0c8'], value: 40, weapon: true },
  arbalest:    { name: 'Осадный арбалет',   icon: ['crossbow', '#4a3a2a', '#ff7030'], value: 110, weapon: true, desc: 'Тяжёлый арбалет на подставке: бьёт постройки лагерей в 6 раз сильнее, а тараны и катапульты — вчетверо.' },
  pcrossbow:   { name: 'Пневмоарбалет',     icon: ['crossbow', '#5a6070', '#c8a050'], value: 150, weapon: true },
  flamer:      { name: 'Алхимический огнемёт', icon: ['flamer', '#c8a050', '#e05020'], value: 200, weapon: true },
  quake_staff: { name: 'Посох землетрясений', icon: ['staff', '#6a4a2a', '#9fe8ff'], value: 900, weapon: true },
  sling:       { name: 'Праща',             icon: ['sling', '#8a6a3a', '#9a9a9a'], value: 5, weapon: true },
  bow:         { name: 'Лук',               icon: ['bow', '#8a5a2a', '#e0d0a0'], value: 20, weapon: true },
  repeater:    { name: 'Многозарядный арбалет', icon: ['crossbow', '#6a4a2a', '#e8b84a'], value: 90, weapon: true },
  handcannon:  { name: 'Ручная мортира',    icon: ['cannon', '#4a4e58', '#c8a050'], value: 260, weapon: true },
  spear:       { name: 'Копьё',             icon: ['spear', '#8a6a3a', '#c8d0d8'], value: 15, weapon: true },
  sword_bronze: { name: 'Бронзовый меч',    icon: ['sword', '#c8a050', '#7a5a20'], value: 40, weapon: true },
  sword_steel: { name: 'Стальной меч',      icon: ['sword', '#c8d0dc', '#5a4030'], value: 120, weapon: true },
  warhammer:   { name: 'Боевой молот',      icon: ['hammer', '#8a96a8', '#6a4a2a'], value: 160, weapon: true },
  mithril_blade: { name: 'Мифриловый клинок', icon: ['sword', '#bff4ff', '#c8a050'], value: 700, weapon: true },
  pellet:      { name: 'Окатыши для пращи', icon: ['rock', '#c08a5a', '#7a4a2a'], value: 1, desc: 'Обожжённые глиняные шарики — снаряды пращи. Камень теперь не уходит в пращу и остаётся на постройки.' },
  axe:         { name: 'Топор',             icon: ['hammer', '#8a96a8', '#7a5030'], value: 6, stack: 20, desc: 'Топор в руках голема-дровосека.' },
  pickaxe:     { name: 'Кирка',             icon: ['hammer', '#9aa0aa', '#6a4a2a'], value: 8, stack: 20, desc: 'Кирка в руках голема-шахтёра.' },
  hoe:         { name: 'Мотыга',            icon: ['spear', '#8a6a3a', '#9aa0aa'], value: 4, stack: 20, desc: 'Мотыга в руках голема-землепашца.' },
  feather:     { name: 'Перья стервятника', icon: ['arrow', '#3a3430', '#d8d0c0'], value: 2, desc: 'С убитых стервятников. Оперение для стрел: из одного пера и доски выходит вдвое больше стрел.' },
  arrow:       { name: 'Стрелы',            icon: ['arrow', '#8a6a3a', '#9a9a9a'], value: 1, desc: 'Боеприпасы для лука.' },
  farrow:      { name: 'Огненные стрелы',   icon: ['arrow', '#8a6a3a', '#ff7030'], value: 3, desc: 'Стрелы с дёгтем: урон лука ×1,6.' },
  sbolt:       { name: 'Стальные болты',    icon: ['bolt', '#5a6070', '#e0e8f0'], value: 3, desc: 'Тяжёлые болты для арбалетов и башни лучника: урон ×1,7.' },
  cshot:       { name: 'Ядра для мортиры',  icon: ['bomb', '#3a3a40', '#ffb040'], value: 10, desc: 'Разрывные ядра для ручной мортиры.' },
  armor_padded: { name: 'Стёганка',         icon: ['armor', '#b8a070', '#7a6040'], value: 20, armor: true },
  armor_leather: { name: 'Кожаная броня',   icon: ['armor', '#9a6a3a', '#6a4220'], value: 40, armor: true },
  armor_ranger: { name: 'Плащ следопыта',   icon: ['armor', '#4a6a3a', '#a0c070'], value: 90, armor: true },
  armor_bronze: { name: 'Бронзовая кольчуга', icon: ['armor', '#c8a050', '#7a5a20'], value: 110, armor: true },
  armor_rune:  { name: 'Рунический плащ',   icon: ['armor', '#4a3a8a', '#9fe8ff'], value: 300, armor: true },
  armor_thorns: { name: 'Шипастые латы',    icon: ['armor', '#6a5a50', '#e0e0e0'], value: 320, armor: true },
  armor_heavy: { name: 'Тяжёлые латы',      icon: ['armor', '#5a6070', '#2a2e38'], value: 400, armor: true },
  armor_steel: { name: 'Стальные латы',     icon: ['armor', '#8a96a8', '#3a4250'], value: 250, armor: true },
  armor_exo:   { name: 'Заводной экзоскелет', icon: ['armor', '#c8a050', '#9fe8ff'], value: 1500, armor: true },
  mod_speed:   { name: 'Пружина скорости',  icon: ['module', '#3a8ad0', '#c0e0ff'], value: 60 },
  mod_eff:     { name: 'Узел эффективности', icon: ['module', '#3aa04a', '#c0ffc0'], value: 100 },
  gargoyle:    { name: 'Горгулья-паук',     icon: ['spider', '#9fe8ff', '#3a6a8a'], value: 400 },
};

for (const id in ITEMS) if (ITEMS[id].weapon || ITEMS[id].armor) ITEMS[id].stack = 1;
// боеприпасы складываются по 500 (окатыши, болты, стрелы, ядра, дёготь); базовые камень и дерево — по 100
for (const id of ['pellet', 'bolt', 'sbolt', 'arrow', 'farrow', 'cshot', 'tar']) ITEMS[id].stack = 500;
ITEMS.stone.stack = 100; ITEMS.wood.stack = 100;

const FLUIDS = {
  water: { name: 'Вода', color: '#3a7ad0' },
  resin: { name: 'Сырая смола', color: '#5a3a1a' },
};

// Оружие Анимансера: три слота, у каждого свой слот боеприпасов. В начале оружия нет — только посох; пращу крафтят.
// ammo — какие боеприпасы подходят (по порядку), melee — ближний бой (боеприпасы не нужны)
// struct — множитель урона по постройкам лагерей (камни и болты хорошо ломают хижины)
const WEAPONS = {
  sling:       { name: 'Праща',        range: 5.5, dmg: 8,   cd: 0.8,  ammo: ['pellet'], proj: 'stone', struct: 3 },
  bow:         { name: 'Лук',          range: 7,   dmg: 10,  cd: 0.55, ammo: ['arrow', 'farrow'], proj: 'arrow', struct: 1.5 },
  arbalest:    { name: 'Осадный арбалет', range: 15, dmg: 34, cd: 1.6, ammo: ['bolt', 'sbolt'], proj: 'bolt', struct: 6, siege: 4 },
  crossbow:    { name: 'Арбалет',      range: 7,   dmg: 15,  cd: 0.75, ammo: ['bolt', 'sbolt'],  proj: 'bolt', struct: 2.5 },
  repeater:    { name: 'Многозарядный арбалет', range: 6.5, dmg: 9, cd: 0.28, ammo: ['bolt', 'sbolt'], proj: 'bolt', struct: 1.8 },
  pcrossbow:   { name: 'Пневмоарбалет', range: 8.5, dmg: 15,  cd: 0.22, ammo: ['bolt', 'sbolt'],  proj: 'bolt', struct: 2 },
  flamer:      { name: 'Алхимический огнемёт', range: 5, dmg: 16, cd: 0.12, ammo: ['tar'], ammoChance: 0.06, proj: 'fire', aoe: 1.3, struct: 1.5 },
  handcannon:  { name: 'Ручная мортира', range: 11, dmg: 75, cd: 1.8, ammo: ['cshot'], proj: 'boulder', aoe: 1.8, struct: 2.5, siege: 2 },
  quake_staff: { name: 'Посох землетрясений', range: 9, dmg: 120, cd: 1.1, ammo: null, proj: 'quake', aoe: 2.5, struct: 1 },
  spear:       { name: 'Копьё',        range: 2.3, dmg: 14,  cd: 0.7,  melee: true, struct: 1.5 },
  sword_bronze: { name: 'Бронзовый меч', range: 1.5, dmg: 18, cd: 0.5,  melee: true, struct: 1.6 },
  sword_steel: { name: 'Стальной меч', range: 1.6, dmg: 32,  cd: 0.45, melee: true, struct: 1.6 },
  warhammer:   { name: 'Боевой молот', range: 1.6, dmg: 55,  cd: 1.1,  melee: true, aoe: 1.3, struct: 4 },
  mithril_blade: { name: 'Мифриловый клинок', range: 1.8, dmg: 70, cd: 0.35, melee: true, struct: 2, leech: 0.1 },
};
// боеприпасы: множитель урона
const AMMO = { pellet: { mul: 1 }, stone: { mul: 1 }, arrow: { mul: 1 }, farrow: { mul: 1.6 }, bolt: { mul: 1 }, sbolt: { mul: 1.7 }, tar: { mul: 1 }, cshot: { mul: 1 } };
// ближний бой посохом — когда слот оружия пуст или кончились боеприпасы
const STAFF_MELEE = { name: 'Посох', range: 1.3, dmg: 6, cd: 0.6, struct: 2.5, melee: true };
const ARMORS = {
  armor_padded:  { armor: 1,  hp: 15, speed: 0.08 },
  armor_leather: { armor: 2,  hp: 30 },
  armor_ranger:  { armor: 3,  hp: 35, speed: 0.15 },
  armor_bronze:  { armor: 4,  hp: 55 },
  armor_steel:   { armor: 6,  hp: 80 },
  armor_rune:    { armor: 4,  hp: 60, magicRes: 0.5, regen: 1.5 },
  armor_thorns:  { armor: 7,  hp: 90, thorns: 0.35 },
  armor_heavy:   { armor: 11, hp: 160, speed: -0.2 },
  armor_exo:     { armor: 12, hp: 180, speed: 0.2, regen: 4 },
};

// ---------- Рецепты ----------
const RECIPES = {};
function R(id, out, inp, time, at, tech, extra) {
  RECIPES[id] = Object.assign({ id, out, in: inp, time, at, tech: tech || null }, extra || {});
}
R('plank',     { plank: 2 },   { wood: 1 }, 0.5, ['hand', 'workshop']);
R('wgear',     { wgear: 1 },   { plank: 2 }, 0.5, ['hand', 'workshop']);
R('wshaft',    { wshaft: 1 },  { plank: 3 }, 1, ['hand', 'workshop']);
R('minigolem', { minigolem: 1 }, { wgear: 1, plank: 2, stone: 1 }, 2, ['hand', 'workshop']);
R('igear',     { igear: 1 },   { iron: 2 }, 1.5, ['hand', 'workshop', 'forge']);
R('irod',      { irod: 2 },    { iron: 1 }, 0.5, ['hand', 'workshop', 'forge']);
R('nails',     { nails: 6 },   { irod: 1 }, 0.5, ['hand', 'workshop']);
R('cwire',     { cwire: 3 },   { copper: 1 }, 0.5, ['hand', 'workshop']);
R('rope',      { rope: 1 },    { wheat: 3 }, 1, ['hand', 'workshop']);
R('rune',      { rune: 1 },    { cwire: 3, block: 1 }, 3, ['hand', 'workshop'], 'logistics');
R('steed',     { steed: 1 },   { igear: 10, wshaft: 4, spring: 4, leather: 6 }, 8, ['hand', 'workshop'], 'smithing');
R('colossus_frame', { colossus_frame: 1 }, { steel: 12, block: 10, sshaft: 2 }, 18, ['workshop'], 'colossus');
R('colossus_limb', { colossus_limb: 1 }, { steel: 8, igear: 8, spring: 6, sshaft: 1 }, 22, ['workshop'], 'colossus');
R('colossus_armor', { colossus_armor: 1 }, { bronze: 8, glass: 6, rune: 3 }, 22, ['alchemy'], 'colossus');
R('colossus_heart', { colossus_heart: 1 }, { clockwork: 4, mithril: 6, rune: 4, gold: 3 }, 40, ['workshop'], 'colossus');
R('builder',   { builder: 1 }, { minigolem: 1, igear: 2, rune: 1 }, 4, ['hand', 'workshop'], 'logistics');
R('repair',    { repair: 2 },  { plank: 2, irod: 1, nails: 2 }, 1.5, ['hand', 'workshop']);
// обжиговая печь: топливо не нужно, жар даёт само сырьё
R('charcoal',  { charcoal: 2 }, { wood: 3 }, 4, ['kiln']);
R('brick',     { brick: 2 },   { stone: 2, wood: 1 }, 3, ['kiln']);
R('f1',        { f1: 1 },      { plank: 1, wgear: 1 }, 5, ['hand', 'workshop']);
R('f2',        { f2: 1 },      { wshaft: 1, minigolem: 1, plank: 2 }, 6, ['hand', 'workshop'], 'logistics');
R('f3',        { f3: 2 },      { bolt: 4, block: 2, igear: 1 }, 10, ['workshop'], 'military');
R('f4',        { f4: 1 },      { flask: 1, sulfur: 1, gold_dust: 1, oil: 1 }, 12, ['workshop'], 'alchemy');
R('f5',        { f5: 1 },      { clockwork: 1, bronze: 2, oil: 1 }, 15, ['workshop'], 'clockwork');
R('f6',        { f6: 1 },      { mithril: 1, gas: 2, gold: 1 }, 20, ['workshop'], 'highmagic');
// плавка
R('s_iron',    { iron: 1 },    { iron_ore: 1 }, 3.2, ['furnace']);
R('s_copper',  { copper: 1 },  { copper_ore: 1 }, 3.2, ['furnace']);
R('s_iron_pure', { iron: 2 },  { iron_ore_pure: 1 }, 4, ['furnace']);
R('s_copper_pure', { copper: 2 }, { copper_ore_pure: 1 }, 4, ['furnace']);
R('s_gold',    { gold: 1 },    { gold_ore: 1 }, 4, ['furnace']);
R('s_glass',   { glass: 1 },   { sand: 2 }, 3.2, ['furnace'], 'glass');
R('s_mithril', { mithril: 1 }, { mithril_ore: 2 }, 8, ['furnace'], 'mithril');
// каменотёсня
R('block',     { block: 1 },   { stone: 2 }, 2, ['stonecutter'], 'masonry');
// дробильня
R('gold_dust', { gold_dust: 2 }, { gold_ore: 1 }, 3, ['mill'], 'glass');
R('sand_mill', { sand: 1 },    { stone: 1 }, 1.5, ['mill'], 'glass');
R('flour',     { flour: 1 },   { wheat: 2 }, 2, ['mill'], 'haute');
// кузня
R('steel',     { steel: 1 },   { iron: 2, coal: 1 }, 6, ['forge'], 'smithing');
R('steel_c',   { steel: 1 },   { iron: 2, charcoal: 2 }, 7, ['forge'], 'smithing');
R('spring',    { spring: 2 },  { steel: 1 }, 3, ['forge'], 'smithing');
R('sshaft',    { sshaft: 1 },  { steel: 2 }, 4, ['forge'], 'smithing');
R('bronze',    { bronze: 2 },  { copper: 3, iron: 1 }, 4, ['forge'], 'bronze');
R('shackles',  { shackles: 1 }, { iron: 3, steel: 1 }, 5, ['forge', 'workshop', 'hand'], 'shackles');
// мастерская
R('bolt',      { bolt: 6 },    { plank: 1, iron: 1 }, 2, ['hand', 'workshop'], 'crossbows');
R('clockwork', { clockwork: 1 }, { igear: 2, spring: 1, sshaft: 1 }, 6, ['workshop'], 'clockwork');
R('boiler',    { boiler: 1 },  { bronze: 4, block: 2 }, 5, ['workshop'], 'bronze');
R('flask',     { flask: 1 },   { glass: 1 }, 1.5, ['hand', 'workshop'], 'glass');
R('furniture', { furniture: 1 }, { plank: 6, bronze: 1 }, 5, ['workshop'], 'comfort');
R('clothes',   { clothes: 1 }, { leather: 3 }, 4, ['workshop'], 'comfort');
R('heater',    { heater: 1 },  { bronze: 3, iron: 2 }, 5, ['workshop'], 'comfort');
R('mod_speed', { mod_speed: 1 }, { spring: 2, igear: 2, bronze: 1 }, 6, ['workshop'], 'modules');
R('mod_eff',   { mod_eff: 1 }, { clockwork: 1, gold: 1, oil: 2 }, 8, ['workshop'], 'modules2');
R('gargoyle',  { gargoyle: 1 }, { mithril: 5, clockwork: 2, oil: 2 }, 15, ['workshop'], 'nests');
R('crossbow',  { crossbow: 1 }, { plank: 10, iron: 6, wgear: 4 }, 5, ['hand', 'workshop'], 'crossbows');
R('arbalest',  { arbalest: 1 }, { plank: 16, steel: 4, wgear: 6, rope: 4 }, 8, ['hand', 'workshop'], 'siegecraft');
R('pcrossbow', { pcrossbow: 1 }, { steel: 10, clockwork: 2, spring: 4 }, 10, ['hand', 'workshop'], 'pneumatics');
R('flamer',    { flamer: 1 },  { boiler: 1, bronze: 10, steel: 5 }, 10, ['hand', 'workshop'], 'flamer');
R('quake_staff', { quake_staff: 1 }, { mithril: 20, relic: 2, gold: 10 }, 15, ['hand', 'workshop'], 'quake');
R('armor_leather', { armor_leather: 1 }, { leather: 10 }, 5, ['hand', 'workshop'], 'military');
R('armor_steel', { armor_steel: 1 }, { steel: 20, leather: 5 }, 10, ['hand', 'workshop'], 'steelarmor');
R('sling',     { sling: 1 },   { plank: 4, stone: 2 }, 2, ['hand', 'workshop']);
R('pellet',    { pellet: 10 }, { stone: 1 }, 1, ['hand', 'workshop']);
R('spear',     { spear: 1 },   { plank: 4, iron: 3 }, 2, ['hand', 'workshop'], 'smithing');
R('bow',       { bow: 1 },     { plank: 6, rope: 2 }, 3, ['hand', 'workshop'], 'crossbows');
R('arrow',     { arrow: 10 },  { plank: 1, stone: 1 }, 1, ['hand', 'workshop'], 'crossbows');
R('arrow_f',   { arrow: 20 },  { plank: 1, stone: 1, feather: 1 }, 1.5, ['hand', 'workshop'], 'crossbows');
R('farrow',    { farrow: 10 }, { arrow: 10, tar: 1 }, 2, ['hand', 'workshop'], 'greekfire');
R('sbolt',     { sbolt: 10 },  { bolt: 10, steel: 1 }, 3, ['hand', 'workshop'], 'steelarmor');
R('cshot',     { cshot: 4 },   { iron: 2, explosive: 1 }, 3, ['hand', 'workshop'], 'explosives');
R('repeater',  { repeater: 1 }, { plank: 8, igear: 6, spring: 4, iron: 10 }, 6, ['hand', 'workshop'], 'military');
R('handcannon', { handcannon: 1 }, { steel: 12, bronze: 8, explosive: 4 }, 10, ['hand', 'workshop'], 'explosives');
R('sword_bronze', { sword_bronze: 1 }, { bronze: 6, plank: 2 }, 4, ['hand', 'workshop', 'forge'], 'bronze');
R('sword_steel', { sword_steel: 1 }, { steel: 8, leather: 2 }, 6, ['hand', 'workshop', 'forge'], 'steelarmor');
R('warhammer', { warhammer: 1 }, { steel: 14, block: 4, plank: 4 }, 8, ['hand', 'workshop', 'forge'], 'military');
R('mithril_blade', { mithril_blade: 1 }, { mithril: 12, gold: 4, steel: 6 }, 15, ['hand', 'workshop', 'forge'], 'mithril');
R('armor_padded', { armor_padded: 1 }, { wheat: 8, leather: 2 }, 3, ['hand', 'workshop']);
R('armor_ranger', { armor_ranger: 1 }, { leather: 12, rope: 6 }, 6, ['hand', 'workshop'], 'military');
R('armor_bronze', { armor_bronze: 1 }, { bronze: 16, leather: 4 }, 8, ['hand', 'workshop', 'forge'], 'bronze');
R('armor_rune', { armor_rune: 1 }, { rune: 10, leather: 10, mithril: 4 }, 12, ['hand', 'workshop'], 'mithril');
R('armor_thorns', { armor_thorns: 1 }, { steel: 24, nails: 60, leather: 6 }, 12, ['hand', 'workshop', 'forge'], 'steelarmor');
R('armor_heavy', { armor_heavy: 1 }, { steel: 40, block: 10, leather: 8 }, 15, ['hand', 'workshop', 'forge'], 'steelarmor');
R('armor_exo', { armor_exo: 1 }, { clockwork: 10, mithril: 15, steel: 20 }, 20, ['hand', 'workshop'], 'exo');
// алхимия
R('distill',   { tar: 3, oil: 2, gas: 2 }, {}, 5, ['alchemy'], 'resin', { fin: { resin: 10 } });
R('explosive', { explosive: 2 }, { tar: 1, sulfur: 1, coal: 1 }, 4, ['alchemy'], 'explosives');
// кухня
R('stew',      { stew: 2 },    { raw_meat: 1, berries: 2 }, 5, ['kitchen'], 'cooking', { fin: { water: 5 } });
R('roast',     { roast: 1 },   { raw_meat: 2 }, 4, ['kitchen'], 'cooking');
R('pie',       { pie: 2 },     { flour: 2, berries: 2, raw_meat: 1 }, 8, ['kitchen'], 'haute');
// фермы (фиксированные)
R('grow_berries', { berries: 1 }, {}, 15, ['berryfarm']);
R('grow_wood', { wood: 1 }, {}, 12, ['nursery']); // 5 дерева в минуту — голем-дровосек заметно выгоднее (~19)
R('grow_wheat', { wheat: 1 }, {}, 10, ['wheatfield'], null, { fin: { water: 2 } });
R('breed',     { raw_meat: 2, leather: 1 }, { wheat: 2 }, 10, ['barn'], null, { fin: { water: 4 } });
// глубинный бур (чертёж торговца) — рецепт подставляется по руде под буром
R('drill',     {}, {}, 1.2, ['drill']);

// ---------- Постройки ----------
// kind: chest belt vector shaft gen accum pipe pump machine lab wall spikes tower barracks house nest mgolem
const BUILD_CATS = [
  ['golem', 'Големы'], ['log', 'Логистика'], ['prod', 'Производство'], ['power', 'Энергия'],
  ['food', 'Еда и жидкости'], ['def', 'Оборона'], ['special', 'Особое'],
];
const BUILDINGS = {};
function B(id, o) { BUILDINGS[id] = Object.assign({ id, size: [1, 1], hp: 150, tech: null, cost: {} }, o); }

B('lumber',    { name: 'Голем-дровосек', cat: 'golem', kind: 'mgolem', cost: { wood: 50, stone: 10 },
  desc: 'Сам ходит к деревьям в радиусе 9 клеток от места создания и носит дерево в ближайший сундук. Топливо ему приносит голем-заправщик (или дайте дерево вручную) — сам себя голем не кормит.' });
B('miner',     { name: 'Голем-шахтёр', cat: 'golem', kind: 'mgolem', cost: { wood: 40, stone: 25 },
  desc: 'Сам ходит к камню и рудам в радиусе 9 клеток и носит добычу в ближайший сундук. Топливо ему приносит голем-заправщик. В его окне можно выбрать, что добывать.' });
B('porter',    { name: 'Голем-носильщик', cat: 'golem', kind: 'mgolem', cost: { wood: 40, stone: 20, wgear: 6 }, tech: 'mechvectors',
  desc: 'Возит предметы из одного здания в другое: из сундука или выхода машины — во вход машины, сундук, барак, башню. Откуда, куда и что носить — выберите в окне голема (до 40 клеток от места создания). Носит 20 штук за ходку. Топливо приносит заправщик.' });
B('fueler',    { name: 'Голем-заправщик', cat: 'golem', kind: 'mgolem', cost: { wood: 60, stone: 30, plank: 10 },
  desc: 'Големы сами не заправляются — это делает заправщик. Берёт дрова или уголь из дровяника или сундука-склада (до 30 штук) и разносит их големам и деревянным векторам в радиусе 30 клеток от места создания, первыми — самым голодным. Себя кормит из своей ноши. Без него големов приходится заправлять вручную (кнопка «Дать дерево» в окне голема).' });
B('farmer',    { name: 'Голем-землепашец', cat: 'golem', kind: 'mgolem', cost: { wood: 30, stone: 10, minigolem: 1 }, tech: 'agriculture',
  desc: 'Нужна вода: ставьте у пруда или реки (до 6 клеток) или подведите акведук с водой (до 4 клеток). Распахивает поле вокруг места создания (до 8 грядок в радиусе 3, урожай раз в 2,5 минуты), сеет, растит и собирает пшеницу или ягоды, носит урожай в ближайший сундук. Что сеять — выберите в его окне. Топливо приносит голем-заправщик.' });
B('golemforge', { name: 'Кузница големов', cat: 'golem', kind: 'gforge', size: [2, 2], cost: { block: 20, bronze: 10, igear: 10 }, hp: 400, tech: 'bronze',
  desc: 'Пока кузница стоит, в окне любого ходячего голема можно поставить ему бронзовое или мифриловое ядро (скорость, ноша, прочность), каменную броню и большую ношу.' });
B('colossus_site', { name: 'Площадка колосса', cat: 'special', kind: 'csite', size: [4, 4], cost: { block: 200, steel: 100, mithril: 30, rune: 20 }, hp: 5000, tech: 'colossus',
  desc: 'Здесь собирают Великого Голема: отвезите 100 сегментов колосса (вручную или векторами). Пробудившийся колосс следует за Анимансером и крушит врагов. Только он может по-настоящему ранить Владыку Тёмных Эльфов.' });
B('vector',    { name: 'Голем-вектор', cat: 'golem', kind: 'vector', cost: { minigolem: 1 }, swing: 0.9, burn: 0.25,
  desc: 'Стационарный манипулятор: берёт предметы сзади и кладёт вперёд (R — повернуть). Жжёт немного дерева или угля, которые сам и переносит.' });
B('fvector',   { name: 'Вектор-фильтр', cat: 'golem', kind: 'vector', cost: { minigolem: 1, wgear: 2 }, swing: 0.9, burn: 0.25, filter: true, tech: 'logistics',
  desc: 'Как голем-вектор, но переносит только выбранный предмет (выберите в его окне). Без выбора — любой.' });
B('lvector',   { name: 'Длинный вектор', cat: 'golem', kind: 'vector', cost: { minigolem: 1, wshaft: 2 }, swing: 1.2, burn: 0.3, reach: 2, tech: 'logistics',
  desc: 'Дотягивается через клетку: берёт за 2 клетки сзади и кладёт за 2 клетки впереди.' });
B('bvector',   { name: 'Пакетный вектор', cat: 'golem', kind: 'vector', cost: { minigolem: 1, wgear: 4, wshaft: 2, rope: 2 }, swing: 1.1, burn: 0.35, stack: 3, tech: 'logistics',
  desc: 'Голем-вектор с широкой клешнёй: переносит по 3 одинаковых предмета за раз. Жжёт дерево или уголь.' });
B('svector',   { name: 'Вектор-укладчик', cat: 'golem', kind: 'vector', cost: { minigolem: 1, igear: 4, spring: 2, rune: 1 }, swing: 0.8, power: 6, stack: 5, tech: 'clockwork',
  desc: 'Механический вектор, который переносит до 5 одинаковых предметов за раз. Работает от вала.' });
B('mvector',   { name: 'Механический вектор', cat: 'golem', kind: 'vector', cost: { minigolem: 1, igear: 2, wshaft: 1, rune: 1 }, swing: 0.5, power: 3, tech: 'mechvectors',
  desc: 'Быстрый манипулятор без топлива. Работает от вала.' });

B('chest',     { name: 'Сундук-склад', cat: 'log', kind: 'chest', cost: { wood: 8 }, cap: 24, hp: 100, desc: 'Склад для големов: 24 стака по 50. Сюда големы-добытчики несут добычу (в радиусе 30 клеток от места, где их поставили). Отсюда же голем-заправщик берёт топливо, если рядом нет дровяника.' });
B('pchest',    { name: 'Личный сундук', cat: 'log', kind: 'chest', sub: 'player', cost: { wood: 8, plank: 4 }, cap: 32, hp: 120, desc: 'Только для Анимансера: 32 стака. Големы-добытчики сюда ничего не носят и ничего не берут. Векторы — могут.' });
B('woodpile',  { name: 'Дровяник', cat: 'log', kind: 'chest', sub: 'wood', cost: { wood: 20, plank: 6 }, cap: 16, hp: 140, desc: 'Склад топлива для големов: только дерево, доски и уголь (16 стаков). Пока дровяник заполнен меньше чем наполовину, големы несут дерево сюда в первую очередь, остальное — в сундуки-склады. Големы заправляются отсюда первым делом.' });
B('inchest',  { name: 'Входной сундук', cat: 'log', kind: 'chest', sub: 'input', beltIn: true, rotates: true, cost: { wood: 8, plank: 4, wgear: 1 }, cap: 24, hp: 100,
  desc: 'Конвейер, упёртый в этот сундук, кладёт предметы прямо в него. Забирать отсюда можно только манипуляторами — руками и големами нельзя. 24 стака.' });
B('belt',      { name: 'Конвейер', cat: 'log', kind: 'belt', cost: { plank: 1, stone: 1 }, speed: 1.875, beltPower: 0.25, walk: true, hp: 60,
  desc: 'Простой роликовый конвейер с двумя полосами: манипуляторы кладут на дальнюю от себя полосу, боковой конвейер — на ближнюю. Тяните мышью, чтобы проложить линию, R — повернуть. Без энергии ползёт на 30% скорости; подведите деревянный вал вплотную к любому конвейеру цепочки — вся цепочка поедет в полную силу (4 конвейера берут 1 КМ, быстрый — 0,5 КМ, подземный и разделитель — по 1 КМ).' });
B('fastbelt',  { name: 'Быстрый конвейер', cat: 'log', kind: 'belt', cost: { igear: 1, plank: 1, stone: 1 }, speed: 3.75, beltPower: 0.5, walk: true, hp: 80, tech: 'fastbelts', desc: 'Конвейер вдвое быстрее.' });
B('splitter',  { name: 'Разделитель конвейеров', cat: 'log', kind: 'belt', split: true, cost: { plank: 4, wgear: 2, stone: 2 }, speed: 1.875, beltPower: 1, walk: true, hp: 80, tech: 'logistics',
  desc: 'Принимает предметы с любых конвейеров и по очереди раздаёт их вперёд, влево и вправо — на конвейеры, идущие от него. Так одну линию можно разделить на две-три или слить несколько в одну.' });
B('ubelt',     { name: 'Подземный конвейер', cat: 'log', kind: 'belt', under: 5, cost: { plank: 6, stone: 6, wgear: 1 }, speed: 1.875, beltPower: 1, walk: true, hp: 80, tech: 'logistics',
  desc: 'Ставьте парой в одном направлении: вход и выход до 5 клеток между ними. Предметы проходят под землёй — под постройками, валами и другими конвейерами.' });
B('bhub',      { name: 'Гильдия строителей', cat: 'log', kind: 'bhub', size: [2, 2], cost: { block: 20, plank: 20, igear: 10, rune: 2 }, hp: 400, tech: 'logistics',
  desc: 'Дом летающих големов-строителей (кладите их сюда). В радиусе 30 клеток они сами строят призраки построек — постройки берут из сундуков или из вашего инвентаря, если вы рядом — и разбирают помеченное инструментом «Снос».' });
B('cave_entrance', { name: 'Вход в подземелье', cat: 'special', kind: 'deco', size: [3, 3], hidden: true, hp: 99999, desc: 'G рядом — спуститься. Подземелье проходится один раз: после победы над троллем вход обваливается.' });
B('cave_exit', { name: 'Выход из пещеры', cat: 'special', kind: 'deco', size: [2, 2], hidden: true, hp: 99999, desc: 'G рядом — подняться на поверхность.' });
B('loot_chest', { name: 'Сундук с добычей', cat: 'special', kind: 'chest', sub: 'loot', hidden: true, cap: 12, hp: 99999, desc: 'Старый сундук в пещере. Заберите добычу.' });
B('road',      { name: 'Каменная дорога', cat: 'log', kind: 'road', walk: true, cost: { stone: 2 }, hp: 200, tech: 'logistics',
  desc: 'Мощёная дорога для воловьих повозок. Тяните мышью, чтобы проложить. Ходить по ней можно всем.' });
B('station',   { name: 'Станция караванов', cat: 'log', kind: 'chest', sub: 'station', size: [2, 2], cap: 32, cost: { plank: 20, block: 10, nails: 10 }, hp: 300, tech: 'husbandry',
  desc: 'Склад у дороги для повозок: в режиме «погрузка» отдаёт свои предметы повозкам, в режиме «разгрузка» принимает их груз. Векторы и конвейеры работают с ней как с сундуком.' });
B('cart',      { name: 'Воловья повозка', cat: 'log', kind: 'cart', cost: { plank: 20, leather: 4, wheat: 20, wgear: 4 }, hp: 100, tech: 'husbandry',
  desc: 'Вол тянет телегу на 8 стаков по каменным дорогам между станциями. Поставьте на дорогу, откройте и задайте маршрут из станций.' });
B('altar',     { name: 'Алтарь дани', cat: 'special', kind: 'chest', sub: 'altar', beltIn: true, size: [2, 2], cost: { block: 20, gold: 2 }, cap: 64, hp: 400, tech: 'masonry',
  desc: 'Дань Тёмным Эльфам автоматически берётся отсюда. Можно подвозить золото конвейерами.' });

B('shaft',     { name: 'Деревянный вал', cat: 'power', kind: 'shaft', cost: { wshaft: 1 }, walk: true, hp: 60,
  desc: 'Передаёт вращение. Постройки, стоящие вплотную к валу, получают энергию.' });
B('ushaft',    { name: 'Подземный вал', cat: 'power', kind: 'shaft', under: 6, cost: { wshaft: 4, stone: 4, wgear: 2 }, walk: true, hp: 80, tech: 'logistics',
  desc: 'Ставьте парой в одном направлении (R — повернуть): энергия идёт под землёй до 6 клеток — под конвейерами, дорогами и постройками.' });
B('treadwheel', { name: 'Беговое колесо', cat: 'power', kind: 'gen', size: [2, 2], cost: { plank: 20, wgear: 10, stone: 10 }, out: 40, fuel: true, burn: 1,
  desc: 'Внутри бегает голем, сжигая дерево или уголь. 40 КМ — хватит на 160 конвейеров или скрипторий с мастерской. Если поставить орка-раба — 110–180 КМ без топлива (зависит от еды).' });
B('watermill', { name: 'Водяная мельница', cat: 'power', kind: 'gen', size: [2, 2], cost: { plank: 30, wgear: 15, block: 10, nails: 20 }, out: 90, needWater: true, tech: 'watermill',
  desc: 'Ставится вплотную к воде. 90 КМ без топлива.' });
B('windmill',  { name: 'Ветряк', cat: 'power', kind: 'gen', size: [2, 2], cost: { plank: 30, igear: 10, wshaft: 4, rope: 6, rune: 1 }, out: 120, wind: true, tech: 'windmill',
  desc: 'До 120 КМ, но мощность зависит от ветра.' });
B('steamengine', { name: 'Паровой двигатель', cat: 'power', kind: 'gen', size: [2, 2], cost: { boiler: 1, sshaft: 2, block: 10, igear: 6 }, out: 220, fuel: true, burn: 2, water: 2, tech: 'bronze',
  desc: 'Котёл кипятит воду и крутит вал: до 220 КМ. Нужны топливо (лучше уголь) и вода по акведуку от водяного насоса — подведите акведук вплотную.' });
B('spring_acc', { name: 'Пружинный аккумулятор', cat: 'power', kind: 'accum', cost: { spring: 10, steel: 5, block: 5 }, cap: 8000, rate: 150, tech: 'accumulators',
  desc: 'Огромная заводная пружина: копит излишки энергии и отдаёт их при нехватке.' });

B('furnace',   { name: 'Плавильня', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'furnace', cost: { stone: 20 }, fuel: true, burn: 1.5, auto: true, pollution: 0.05,
  desc: 'Плавит руду в слитки. Нужно топливо: дерево или уголь.' });
B('efurnace',  { name: 'Печь вечного пламени', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'furnace', cost: { block: 30, mithril: 5, gold: 10 }, auto: true, speed: 2, pollution: 0.02, bp: 'eternal',
  desc: 'Чертёж торговца. Плавит вдвое быстрее и без топлива.' });
B('kiln',      { name: 'Обжиговая печь', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'kiln', cost: { stone: 30, wood: 10 }, pollution: 0.04, hp: 220,
  desc: 'Без топлива: жар даёт само сырьё. Выберите рецепт: древесный уголь (горит вдвое дольше дерева) или кирпич (для печей, кузен и домов).' });
B('workshop',  { name: 'Мастерская', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'workshop', cost: { plank: 16, wgear: 8, nails: 12, stone: 20 }, power: 30, pollution: 0.02,
  desc: 'Собирает предметы по выбранному рецепту. Нужна энергия от вала.' });
B('beacon',    { name: 'Маяк усиления', cat: 'prod', kind: 'beacon', cost: { clockwork: 2, gold: 5, rune: 3, block: 10 }, power: 20, hp: 300, tech: 'modules', radius: 3,
  desc: 'Рунный кристалл, который подгоняет машины вокруг: все машины и буры в радиусе 3 клеток работают на 25% быстрее (не больше двух маяков на машину). Нужна энергия от вала.' });
B('assembler', { name: 'Сборочный цех', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'workshop', cost: { steel: 10, igear: 10, clockwork: 1, brick: 20, rune: 2 }, power: 60, speed: 2, pollution: 0.03, tech: 'clockwork', hp: 400,
  desc: 'Вторая ступень мастерской: делает всё то же самое, но вдвое быстрее. Нужна энергия.' });
B('stonecutter', { name: 'Каменотёсня', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'stonecutter', cost: { plank: 15, wgear: 8, stone: 20 }, power: 20, pollution: 0.02, tech: 'masonry',
  desc: 'Тешет камень в блоки. Нужна энергия.' });
B('forge',     { name: 'Кузня', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'forge', cost: { brick: 20, block: 10, iron: 10, wgear: 10 }, power: 20, fuel: true, burn: 2, pollution: 0.08, tech: 'smithing',
  desc: 'Сталь, пружины, валы, бронза. Нужны энергия и топливо.' });
B('mill',      { name: 'Дробильня', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'mill', cost: { block: 15, igear: 10, wshaft: 4, rune: 1 }, power: 40, pollution: 0.03, tech: 'glass',
  desc: 'Дробит руду в пыль, камень в песок, пшеницу в муку.' });
B('alchemy',   { name: 'Алхимическая печь', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'alchemy', cost: { block: 30, bronze: 10, glass: 10 }, power: 10, fuel: true, burn: 2, pollution: 0.12, tech: 'resin',
  desc: 'Расщепляет смолу на дёготь, масло и газ. Делает взрывчатку.' });
B('scriptorium', { name: 'Скрипторий', cat: 'prod', kind: 'lab', size: [2, 2], cost: { plank: 30, wgear: 10, stone: 20 }, power: 20, pollution: 0.01,
  desc: 'Библиотека: поглощает фолианты и двигает текущее исследование (T).' });
B('nursery',   { name: 'Питомник', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'nursery', fixed: 'grow_wood', speed: 2, cost: { wood: 30, stone: 10, minigolem: 1 }, hp: 200,
  desc: 'Голем-садовник растит и рубит молодые деревья: бесконечно даёт дерево (1 каждые 4 с). Забирайте вектором в сундук.' });
B('mine',      { name: 'Шахта', cat: 'prod', kind: 'mine', size: [3, 3], cost: { block: 60, iron: 40, wgear: 30, wshaft: 10 }, hp: 900, tech: 'masonry', maxGolems: 2, yieldMul: 1, tripTime: 16,
  desc: 'Строится только на рудной горе в центре залежи — одна шахта на залежь. Големы-шахтёры (дом в радиусе 14) сами спускаются вниз и поднимают руду бесконечно. Чем дальше залежь от места высадки, тем больше руды за одну ходку. До 2 големов одновременно.' });
B('bdrill',    { name: 'Буровая установка', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'drill', cost: { stone: 15, iron: 10, wgear: 6 }, fuel: true, burn: 1, cycle: 3, area: 1, push: true, pollution: 0.06, hp: 250,
  desc: 'ставится на залежь, сама добывает руду или камень с площади 4×4 (под собой и на клетку вокруг) и выкладывает добычу вперёд — на конвейер, в сундук или прямо в печь. Стрелка показывает, куда (R — повернуть). Топливо — дерево или уголь.' });
B('mdrill',    { name: 'Механический бур', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'drill', cost: { iron: 20, igear: 10, wshaft: 4, rune: 1 }, power: 30, cycle: 1.5, area: 1, push: true, pollution: 0.08, hp: 350, tech: 'smithing',
  desc: 'Вдвое быстрее буровой установки и без топлива — работает от вала. Добывает с площади 4×4 и выкладывает вперёд (R — повернуть).' });
B('deepdrill', { name: 'Глубинный бур', cat: 'prod', kind: 'machine', size: [2, 2], crafts: 'drill', cost: { steel: 30, mithril: 10, clockwork: 4 }, power: 60, pollution: 0.1, bp: 'deepdrill', cycle: 0.6,
  desc: 'Чертёж торговца. Ставится на руду и быстро выкачивает залежь под собой (руда при этом кончается).' });

B('tank',      { name: 'Цистерна', cat: 'food', kind: 'pipe', size: [2, 2], tankCap: 600, cost: { plank: 20, iron: 10, block: 8 }, hp: 300, tech: 'agriculture',
  desc: 'Большой бак на 600 единиц жидкости: подключите к акведуку, и сеть запасает воду или смолу впрок.' });
B('pipe',      { name: 'Акведук', cat: 'food', kind: 'pipe', cost: { stone: 2 }, walk: true, hp: 80, tech: 'agriculture',
  desc: 'Проводит воду или смолу. Одна сеть — одна жидкость.' });
B('waterpump', { name: 'Водяной насос', cat: 'food', kind: 'pump', fluid: 'water', rate: 20, cost: { plank: 10, wgear: 5, stone: 5 }, needWater: true, tech: 'agriculture',
  desc: 'Ставится вплотную к воде, качает воду в акведук.' });
B('resinpump', { name: 'Смоляная помпа', cat: 'food', kind: 'pump', fluid: 'resin', rate: 5, cost: { plank: 20, igear: 10, wshaft: 2 }, needSwamp: true, power: 15, tech: 'resin',
  desc: 'Ставится на болото, качает сырую смолу. Нужна энергия.' });
B('berryfarm', { name: 'Ягодник', cat: 'food', kind: 'machine', size: [2, 2], crafts: 'berryfarm', fixed: 'grow_berries', cost: { wood: 20, minigolem: 1 }, tech: 'agriculture',
  desc: 'Голем-аграрий выращивает ягоды.' });
B('wheatfield', { name: 'Пшеничное поле', cat: 'food', kind: 'machine', size: [2, 2], crafts: 'wheatfield', fixed: 'grow_wheat', cost: { wood: 10, minigolem: 1, stone: 5 }, tech: 'agriculture',
  desc: 'Растит пшеницу. Нужна вода по акведуку.' });
B('barn',      { name: 'Скотный двор', cat: 'food', kind: 'machine', size: [2, 2], crafts: 'barn', fixed: 'breed', cost: { plank: 30, block: 10 }, tech: 'husbandry',
  desc: 'Пшеница и вода превращаются в мясо и кожу.' });
B('kitchen',   { name: 'Кухня', cat: 'food', kind: 'machine', size: [2, 2], crafts: 'kitchen', cost: { brick: 15, iron: 10, plank: 10 }, fuel: true, burn: 1, pollution: 0.02, tech: 'cooking',
  desc: 'Готовит похлёбку, жаркое и пироги. Чем лучше еда, тем быстрее работают орки.' });
B('barracks',  { name: 'Барак рабов', cat: 'food', kind: 'barracks', size: [2, 2], cost: { block: 30, plank: 20, iron: 10 }, cap: 300, hp: 400, tech: 'shackles',
  desc: 'Здесь живут орки-рабы. Подвозите сюда еду: орки едят отсюда.' });
B('house',     { name: 'Дом людей', cat: 'food', kind: 'house', size: [2, 2], cost: { brick: 30, plank: 30, bronze: 5 }, cap: 200, hp: 400, tech: 'comfort',
  desc: 'Жильё спасённых людей. Положите мебель, одежду, обогреватель (с углём) и отборную еду.' });

B('palisade',  { name: 'Частокол', cat: 'def', kind: 'wall', cost: { wood: 4 }, hp: 250, desc: 'Задерживает врагов. Тяните мышью, чтобы поставить линию. Соединяется с воротами и башнями.' });
B('gate',      { name: 'Ворота частокола', cat: 'def', kind: 'wall', gate: true, cost: { wood: 6, plank: 4, nails: 4 }, hp: 210,
  desc: 'Свои — Анимансер и големы — проходят, враги нет. Чуть слабее частокола, и враги ломятся в первую очередь именно в ворота. Ставьте в линию стены.' });
B('stonewall', { name: 'Каменная стена', cat: 'def', kind: 'wall', cost: { block: 3 }, hp: 1000, tech: 'masonry', desc: 'Прочная стена. Соединяется с воротами и башнями.' });
B('stonegate', { name: 'Каменные ворота', cat: 'def', kind: 'wall', gate: true, cost: { block: 5, irod: 4 }, hp: 850, tech: 'masonry',
  desc: 'Окованные ворота в каменной стене: свои проходят, враги нет. Враги ломятся в первую очередь в ворота.' });
B('spikes',    { name: 'Ров с кольями', cat: 'def', kind: 'spikes', cost: { wood: 3, stone: 3 }, walk: true, hp: 300, tech: 'military', desc: 'Враги вязнут и получают урон.' });
B('torch',     { name: 'Факел', cat: 'def', kind: 'deco', cost: { wood: 2 }, hp: 60,
  desc: 'Горит всегда и освещает ночью круг радиусом 5 клеток. Тяните мышью, чтобы поставить ряд.' });
B('watchtower', { name: 'Дозорная вышка', cat: 'def', kind: 'watch', cost: { plank: 20, irod: 6, rope: 4 }, hp: 260, tech: 'agriculture',
  desc: 'Голем-дозорный разведывает местность в радиусе 30 клеток и заранее предупреждает о врагах, идущих к базе.' });
B('obelisk',   { name: 'Рунный обелиск', cat: 'def', kind: 'tower', cost: { block: 20, rune: 4, gold: 4, glass: 6 }, hp: 500, tech: 'alchemy', power: 40,
  weapon: { range: 10, dmg: 18, cd: 0.5, ammo: null, proj: 'beam' }, desc: 'Бьёт врагов рунным лучом на 10 клеток. Боеприпасы не нужны — только энергия от вала (40 КМ).' });
B('landmine',  { name: 'Мина-ловушка', cat: 'def', kind: 'trap', walk: true, cost: { explosive: 1, plank: 1 }, hp: 30, tech: 'explosives',
  desc: 'Закопанный заряд: взрывается, когда на него наступает враг, и бьёт всех вокруг (радиус 2,2). Враги мины не замечают. Одноразовая.' });
// та же башня, что и раньше (рецепт, прочность, урон, дальность), только основание и модель 2×2
B('archer',    { name: 'Башня голема-лучника', cat: 'def', kind: 'tower', size: [2, 2], cost: { plank: 20, stone: 30, wgear: 5, irod: 4 }, hp: 350, tech: 'crossbows', sprite: 'archer2',
  weapon: { range: 9, dmg: 13, cd: 0.8, ammo: ['sbolt', 'bolt'], proj: 'bolt', archers: 1 }, desc: 'Стреляет болтами (подвозите их вектором). Стальные болты бьют в 1,7 раза сильнее. Дальность 9.' });
// старая башня 1×1, зажатая стенами: то же самое, что большая, только основание узкое (модель покрупнее)
B('archer_s',  { name: 'Башня голема-лучника', cat: 'def', kind: 'tower', hidden: true, refund: 'archer', cost: { plank: 20, stone: 30, wgear: 5, irod: 4 }, hp: 350, sprite: 'archer', spriteScale: 1.5,
  weapon: { range: 9, dmg: 13, cd: 0.8, ammo: ['sbolt', 'bolt'], proj: 'bolt' }, desc: 'Старая башня на узком основании 1×1 (встроена в стену). Стреляет так же, как большая. Разберите — получите башню 2×2.' });
B('ballista',  { name: 'Баллиста', cat: 'def', kind: 'tower', cost: { plank: 30, steel: 6, wgear: 8, rope: 6 }, hp: 500, tech: 'siegecraft', sprite: 'archer',
  weapon: { range: 18, dmg: 40, cd: 2.2, ammo: ['sbolt', 'bolt'], proj: 'bolt', siege: 4, siegeFirst: true }, desc: 'Тяжёлый болт на 18 клеток — вдвое дальше, чем бьют катапульты. По таранам и катапультам урон ×4, целится в них первыми. Заряжается болтами.' });
B('firetower', { name: 'Башня греческого огня', cat: 'def', kind: 'tower', cost: { block: 30, bronze: 10, boiler: 1 }, hp: 650, tech: 'greekfire',
  weapon: { range: 6, dmg: 26, cd: 0.3, aoe: 1.6, ammo: ['tar'], ammoChance: 0.08, proj: 'fire' }, desc: 'Поливает врагов горящим дёгтем. Дальность 6, бьёт по площади.' });
B('trebuchet', { name: 'Требушет', cat: 'def', kind: 'tower', size: [2, 2], cost: { block: 40, sshaft: 4, clockwork: 2, plank: 40 }, hp: 800, tech: 'trebuchets',
  weapon: { range: 26, min: 5, dmg: 90, cd: 4, aoe: 2.4, ammo: ['explosive', 'block'], proj: 'boulder' }, desc: 'Артиллерия: дальность 26, бьёт по площади. Снаряды — блоки или взрывчатка (×2.5).' });
B('guardian',  { name: 'Голем-исполин', cat: 'def', kind: 'tower', size: [2, 2], cost: { block: 50, steel: 30, mithril: 10 }, hp: 3000, bp: 'guardian',
  weapon: { range: 3, dmg: 45, cd: 2, aoe: 2, ammo: null, proj: 'slam' }, mobile: 3, walkSpeed: 1.1, desc: 'Чертёж торговца. Огромный каменный страж: сам отходит от своего места (до 3 клеток) к врагам и медленно, но страшно бьёт оземь. Боеприпасы не нужны.' });

B('nest',      { name: 'Гнездо горгулий', cat: 'special', kind: 'nest', size: [2, 2], cost: { mithril: 30, clockwork: 10, block: 50 }, hp: 600, radius: 25, tech: 'nests',
  desc: 'Пауки-горгульи из мифрила носят предметы из сундуков-хранилищ в сундуки-запросы в радиусе 25. Положите в гнездо горгулий.' });
B('provchest', { name: 'Сундук-хранилище', cat: 'special', kind: 'chest', sub: 'provide', cost: { steel: 5, mithril: 2 }, cap: 32, tech: 'nests', desc: 'Горгульи берут отсюда.' });
B('reqchest',  { name: 'Сундук-запрос', cat: 'special', kind: 'chest', sub: 'request', cost: { steel: 5, mithril: 2 }, cap: 24, tech: 'nests', desc: 'Укажите, что и сколько нужно — горгульи принесут.' });

// ---------- постройки — это предметы ----------
// Постройку сначала крафтят (руками или в мастерской), она попадает в инвентарь, и уже оттуда её ставят.
// При разборке постройка возвращается в инвентарь целиком.
for (const id in BUILDINGS) {
  const d = BUILDINGS[id];
  if (d.hidden) continue; // особые постройки мира (выход из пещеры, сундук с добычей) не крафтятся
  let total = 0, value = 0;
  for (const k in d.cost) { total += d.cost[k]; value += (ITEMS[k] ? ITEMS[k].value : 1) * d.cost[k]; }
  ITEMS[id] = { name: d.name, icon: ['block', '#9a8a70', '#5a4a3a'], bld: true, value };
  R('b_' + id, { [id]: 1 }, d.cost, clamp(Math.round(total / 8) / 2, 0.5, 10), ['hand', 'workshop'], null, { bld: id });
}
// ---------- цена каждого предмета ----------
// У кого цена не задана — считаем по рецепту: сырьё + 10% за работу. Цена нужна для дани и торговли.
for (let pass = 0; pass < 6; pass++) {
  for (const rid in RECIPES) {
    const r = RECIPES[rid], outs = Object.keys(r.out);
    let cost = 0, ok = true;
    for (const k in r.in) { const v = ITEMS[k] && ITEMS[k].value; if (!v) { ok = false; break; } cost += v * r.in[k]; }
    if (!ok) continue;
    const n = outs.reduce((a, o) => a + r.out[o], 0) || 1;
    for (const o of outs) if (ITEMS[o] && !ITEMS[o].value) ITEMS[o].value = Math.max(1, Math.round(cost * 1.1 / n));
  }
}
for (const id in ITEMS) if (!ITEMS[id].value) ITEMS[id].value = 1;
function itemPrice(id) { return (ITEMS[id] && ITEMS[id].value) || 1; }

// ---------- Исследования ----------
const TECHS = {};
function T(id, name, cost, units, time, req, o) {
  TECHS[id] = Object.assign({ id, name, cost, units, time, req }, o || {});
}
const F12 = { f1: 1, f2: 1 }, F123 = { f1: 1, f2: 1, f3: 1 }, F124 = { f1: 1, f2: 1, f4: 1 };
const F1234 = { f1: 1, f2: 1, f3: 1, f4: 1 }, F1245 = { f1: 1, f2: 1, f4: 1, f5: 1 };
const F12345 = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 }, FALL = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 };

T('masonry',    'Каменотёсное дело', { f1: 1 }, 10, 10, []);
T('crossbows',  'Арбалеты', { f1: 1 }, 15, 10, []);
T('logistics',  'Логистика', { f1: 1 }, 20, 10, []);
T('agriculture', 'Земледелие', { f1: 1 }, 25, 10, []);
T('legs1',      'Быстрые ноги I', { f1: 1 }, 20, 10, [], { bonus: { speed: 0.15 } });
T('arms1',      'Длинные руки I', { f1: 1 }, 20, 10, [], { bonus: { reach: 4 } });
T('bags1',      'Вместительные сумки I', { f1: 1 }, 25, 10, [], { bonus: { bag: 10 } });
T('mining1',    'Мастер добычи I', { f1: 1 }, 20, 10, [], { bonus: { mining: 0.5 } });
T('watermill',  'Водяная мельница', { f1: 1 }, 25, 10, ['masonry']);
T('smithing',   'Кузнечное дело', { f1: 1 }, 30, 12, ['masonry']);
T('golems1',    'Резвость големов I', F12, 40, 15, ['logistics'], { bonus: { golem: 0.2 } });
T('fastbelts',  'Быстрые конвейеры', F12, 40, 15, ['logistics', 'smithing']);
T('mechvectors', 'Механические векторы', F12, 40, 15, ['logistics', 'smithing']);
T('husbandry',  'Скотоводство', F12, 30, 15, ['agriculture', 'logistics']);
T('cooking',    'Кулинария', F12, 30, 15, ['husbandry']);
T('shackles',   'Кандалы и бараки', F12, 30, 15, ['smithing', 'logistics']);
T('bronze',     'Бронзовое литьё', F12, 40, 15, ['smithing']);
T('windmill',   'Ветряки', F12, 40, 15, ['watermill', 'smithing']);
T('accumulators', 'Пружинные аккумуляторы', F12, 50, 15, ['windmill']);
T('military',   'Военное дело', F12, 40, 15, ['crossbows', 'logistics', 'smithing']);
T('glass',      'Стекловарение', F12, 40, 15, ['smithing', 'logistics']);
T('modules',    'Модули големов', F12, 50, 15, ['bronze']);
T('legs2',      'Быстрые ноги II', F12, 40, 15, ['legs1'], { bonus: { speed: 0.15 } });
T('arms2',      'Длинные руки II', F12, 40, 15, ['arms1'], { bonus: { reach: 4 } });
T('bags2',      'Вместительные сумки II', F12, 50, 15, ['bags1'], { bonus: { bag: 20 } });
T('mining2',    'Мастер добычи II', F12, 40, 15, ['mining1'], { bonus: { mining: 0.5 } });
T('hp1',        'Выносливость I', F12, 40, 15, ['military'], { bonus: { hp: 50 } });
T('comfort',    'Комфорт и уют', F12, 50, 15, ['bronze', 'husbandry']);
T('resin',      'Смоляные помпы', F12, 60, 15, ['bronze', 'glass']);
T('steelarmor', 'Стальные латы', F123, 50, 20, ['military']);
T('siegecraft', 'Осадное дело', F12, 45, 15, ['military'], { desc: 'Против таранов и катапульт: баллиста (башня, бьёт на 18 клеток, по осадным машинам ×4, целится в них первой) и осадный арбалет (в руку, 15 клеток, по машинам ×4, по постройкам лагерей ×6).' });
T('alchemy',    'Алхимия', F123, 75, 20, ['resin', 'military']);
T('golems2',    'Резвость големов II', F123, 75, 20, ['golems1', 'military'], { bonus: { golem: 0.2 } });
T('clockwork',  'Заводные механизмы', F124, 80, 20, ['alchemy']);
T('research1',  'Скоропись I', F124, 80, 20, ['alchemy'], { bonus: { research: 0.25 } });
T('haute',      'Высокая кухня', F124, 60, 20, ['cooking', 'alchemy']);
T('greekfire',  'Греческий огонь', F1234, 100, 20, ['alchemy']);
T('explosives', 'Взрывчатка', F1234, 100, 25, ['alchemy']);
T('pneumatics', 'Пневматика', F1234, 80, 20, ['clockwork', 'steelarmor']);
T('hp2',        'Выносливость II', F1234, 100, 25, ['hp1', 'alchemy'], { bonus: { hp: 75 } });
T('flamer',     'Алхимический огнемёт', F1234, 120, 25, ['greekfire']);
T('modules2',   'Узлы эффективности', F1245, 100, 25, ['clockwork', 'modules']);
T('mithril',    'Мифриловое литьё', F1245, 150, 30, ['clockwork']);
T('research2',  'Скоропись II', F1245, 150, 30, ['research1', 'clockwork'], { bonus: { research: 0.25 } });
T('legs3',      'Быстрые ноги III', F1245, 100, 25, ['legs2', 'clockwork'], { bonus: { speed: 0.2 } });
T('arms3',      'Длинные руки III', F1245, 100, 25, ['arms2', 'clockwork'], { bonus: { reach: 6 } });
T('golems3',    'Резвость големов III', F12345, 150, 30, ['golems2', 'clockwork'], { bonus: { golem: 0.3 } });
T('trebuchets', 'Требушеты', F12345, 150, 30, ['explosives', 'clockwork']);
T('nests',      'Гнёзда горгулий', F1245, 200, 30, ['mithril']);
T('highmagic',  'Высшая магия', F12345, 200, 30, ['mithril']);
T('exo',        'Заводной экзоскелет', FALL, 250, 40, ['highmagic', 'steelarmor']);
T('meteor',     'Метеоритный дождь', FALL, 300, 40, ['highmagic'], { spell: 'meteor' });
T('quake',      'Землетрясение', FALL, 300, 40, ['highmagic'], { spell: 'quake' });
T('hp3',        'Выносливость III', FALL, 200, 40, ['hp2', 'highmagic'], { bonus: { hp: 100 } });
T('colossus',   'Великий Голем', FALL, 250, 40, ['highmagic', 'clockwork'], { desc: 'Открывает Площадку колосса и четыре вида его деталей (каркас, конечности, руническая броня, сердце) — Великий Голем единственный, кто может сразить Владыку эльфов.' });
// бесконечные исследования: каждый уровень дороже в 1,5 раза
T('inf_mine',   'Щедрые недра', F123, 60, 25, ['mining2', 'military'], { infinite: true, bonusPer: { prod: 0.1 }, desc: 'Каждый уровень: +10% к добыче големов, буров и шахт (лишняя руда сверх добытой).' });
T('inf_golem',  'Неутомимые големы', F1245, 100, 30, ['golems2', 'clockwork'], { infinite: true, bonusPer: { golem: 0.1 }, desc: 'Каждый уровень: +10% к скорости всех големов.' });
T('inf_machine', 'Точная механика', F1245, 100, 30, ['clockwork'], { infinite: true, bonusPer: { machine: 0.06 }, desc: 'Каждый уровень: +6% к скорости машин, буров и скрипториев.' });
T('overthrow',  'Ритуал свержения', FALL, 1000, 60, ['exo', 'meteor', 'quake', 'trebuchets'],
  { desc: 'Позволяет навсегда отказаться от дани и бросить вызов Тёмным Эльфам.' });

// ---------- крупная экономика ----------
// Чем позднее постройка, тем она дороже (серьёзная база требует сотен тысяч ресурсов).
// Ступень — по числу видов фолиантов в исследовании, которое её открывает. Мелочь (конвейеры, валы, стены) дорожает мало.
(function scaleEconomy() {
  const tierOf = (tech) => tech && TECHS[tech] ? Object.keys(TECHS[tech].cost).length : 0;
  const MULT = [2, 3, 4, 6, 9, 14, 20];
  const CHEAP = new Set(['belt', 'shaft', 'pipe', 'wall', 'road', 'deco', 'trap', 'spikes']);
  for (const id in BUILDINGS) {
    const d = BUILDINGS[id];
    if (d.hidden || d.bp) continue;
    const m = CHEAP.has(d.kind) ? 1.5 : MULT[tierOf(d.tech)];
    for (const k in d.cost) d.cost[k] = Math.ceil(d.cost[k] * m);
  }
  // исследования: ранние втрое длиннее, поздние — дороже в 4–18 раз, Ритуал свержения — в 20 раз (нужны большие заводы фолиантов и дальние залежи).
  // Время одного шага сокращается, поэтому общее время изучения в одном скриптории остаётся прежним — решает число скрипториев и фолиантов.
  const TMULT = [3, 3, 4, 6, 9, 12, 18];
  for (const id in TECHS) {
    const t = TECHS[id], m = t.infinite ? 2 : id === 'overthrow' ? 20 : TMULT[Object.keys(t.cost).length];
    t.time = t.infinite ? t.time : Math.max(2, Math.round(t.time * 3 / m * 10) / 10);
    t.units = Math.round(t.units * m);
  }
})();

// ---------- Враги ----------
const ENEMIES = {
  goblin:       { name: 'Гоблин', hp: 22, speed: 3.9, dmg: 4, cd: 1, range: 0.9, armor: 0, size: 0.55 },
  goblin_archer: { name: 'Гоблин-лучник', hp: 16, speed: 3.4, dmg: 3, cd: 1.5, range: 4.5, armor: 0, size: 0.55, proj: 'arrow' },
  orc_brute:    { name: 'Орк-рубака', hp: 110, speed: 3.0, dmg: 14, cd: 1.2, range: 1, armor: 2, size: 0.8 },
  orc_thrower:  { name: 'Орк-метатель', hp: 70, speed: 2.8, dmg: 10, cd: 1.8, range: 5.5, armor: 1, size: 0.75, proj: 'axe' },
  orc_shaman:   { name: 'Орк-шаман', hp: 80, speed: 2.6, dmg: 9, cd: 2, range: 6.5, armor: 0, size: 0.75, proj: 'magic', heal: 6 },
  ram:          { name: 'Таран', hp: 420, speed: 1.5, dmg: 55, cd: 2.2, range: 1.3, armor: 3, size: 1.1, siege: 'ram', prop: 'ram' },
  catapult:     { name: 'Катапульта', hp: 190, speed: 1.3, dmg: 45, cd: 4.5, range: 8.5, armor: 2, size: 1.1, siege: 'catapult', prop: 'catapult', proj: 'boulder', aoe: 1.6 },
  cave_troll:   { name: 'Пещерный тролль', hp: 3500, speed: 2.6, dmg: 45, cd: 1.4, range: 1.5, armor: 6, size: 1.4, scale: 2.2, aoe: 1.6 },
  crow:         { name: 'Стервятник', hp: 14, speed: 5.2, dmg: 3, cd: 1.1, range: 0.8, armor: 0, size: 0.5, fly: true },
  goblin_chief: { name: 'Вожак гоблинов', hp: 120, speed: 3.6, dmg: 12, cd: 1, range: 1, armor: 2, size: 0.8, scale: 1.35 },
  orc_berserk:  { name: 'Орк-берсерк', hp: 260, speed: 3.7, dmg: 22, cd: 0.8, range: 1.1, armor: 4, size: 1, scale: 1.25 },
  merchant_foe: { name: 'Разгневанный торговец', hp: 2600, speed: 3.4, dmg: 34, cd: 1.5, range: 9, armor: 9, size: 0.8, proj: 'arcane', aoe: 1.4 },
  elf_blade:    { name: 'Тёмный клинок', hp: 240, speed: 4.6, dmg: 22, cd: 0.9, range: 1.1, armor: 4, size: 0.7 },
  elf_mage:     { name: 'Маг-артиллерист', hp: 180, speed: 3.0, dmg: 45, cd: 3.5, range: 14, armor: 3, size: 0.7, proj: 'arcane', aoe: 1.8 },
  elf_lord:     { name: 'Владыка Тёмных Эльфов', hp: 9000, speed: 3.2, dmg: 70, cd: 1.6, range: 1.6, armor: 12, size: 1.4, boss: true, aoe: 2.2 },
};

// постройки лагерей
// w — размер в клетках; minor — стены и ограды (ломать для победы необязательно)
const CAMP_STRUCT = {
  hut:        { name: 'Хижина гоблинов', hp: 160, w: 1 },
  tent:       { name: 'Шатёр орков', hp: 450, w: 1 },
  ghut:       { name: 'Большая хижина гоблинов', hp: 260, w: 2 },
  bonfire:    { name: 'Костёр', hp: 90, w: 1 },
  gtotem:     { name: 'Знамя гоблинов', hp: 170, w: 1 },
  palisade_c: { name: 'Частокол гоблинов', hp: 90, w: 1, minor: true },
  otent:      { name: 'Военный шатёр орков', hp: 520, w: 2 },
  warhall:    { name: 'Длинный дом вождя', hp: 1300, w: 3 },
  watchtower: { name: 'Сторожевая башня орков', hp: 600, w: 2, tower: { range: 9, dmg: 7, cd: 1.6 } },
  totem:      { name: 'Тотем шаманов', hp: 650, w: 1 },
  spikewall:  { name: 'Ограда из кольев', hp: 160, w: 1, minor: true },
  keep:       { name: 'Цитадель орков', hp: 2600, w: 3 },
  stonewall_c: { name: 'Стена крепости', hp: 450, w: 1, minor: true },
  cage:       { name: 'Клетка с пленником', hp: 220, w: 1 },
  portal:     { name: 'Портал эльфов', hp: 1600, w: 2 },
};
function structW(s) { return s.w || (s.big ? 2 : (CAMP_STRUCT[s.kind] && CAMP_STRUCT[s.kind].w) || 1); }
function structCX(s) { return s.x + structW(s) / 2; }
function structCY(s) { return s.y + structW(s) / 2; }

// ---------- Чертежи торговцев ----------
const BLUEPRINTS = {
  guardian:  { name: 'Чертёж: Голем-исполин', price: { gem: 60, relic: 2 }, building: 'guardian' },
  eternal:   { name: 'Чертёж: Печь вечного пламени', price: { gem: 50, mithril: 25 }, building: 'efurnace' },
  deepdrill: { name: 'Чертёж: Глубинный бур', price: { gem: 70, mithril: 50, relic: 1 }, building: 'deepdrill' },
  rune:      { name: 'Руна скорописи (+30% к исследованиям)', price: { relic: 3, gem: 45 }, bonus: { research: 0.3 } },
  heart:     { name: 'Сердце колосса (+25% к скорости големов)', price: { mithril: 80, gem: 30, relic: 2 }, bonus: { golem: 0.25 } },
  bigpack:   { name: 'Бездонный мешок (+40 клеток инвентаря)', price: { gem: 40, mithril: 10 }, bonus: { inv: 1 } },
};

// какие руды по тайлу ресурса выдаются
// res: 0 нет, 1 дерево, 2 камень, 3 железо, 4 медь, 5 уголь, 6 сера, 7 золото, 8 мифрил, 9 ягодный куст, 10 песок, 11 руины
const RES = [
  null,
  { name: 'Дерево', item: 'wood', golem: 'lumber' },
  { name: 'Камень', item: 'stone', golem: 'miner' },
  { name: 'Железная руда', item: 'iron_ore', golem: 'miner' },
  { name: 'Медная руда', item: 'copper_ore', golem: 'miner' },
  { name: 'Уголь', item: 'coal', golem: 'miner' },
  { name: 'Сера', item: 'sulfur', golem: 'miner' },
  { name: 'Золотая руда', item: 'gold_ore', golem: 'miner' },
  { name: 'Мифриловая руда', item: 'mithril_ore', golem: 'miner' },
  { name: 'Ягодный куст', item: 'berries', golem: null },
  { name: 'Песок', item: 'sand', golem: 'miner' },
  { name: 'Древние руины', item: 'relic', golem: null },
  { name: 'Рудная гора', item: null, golem: null },
  { name: 'Посевы', item: null, golem: null },
];
const RES_ID = { tree: 1, stone: 2, iron: 3, copper: 4, coal: 5, sulfur: 6, gold: 7, mithril: 8, bush: 9, sand: 10, ruins: 11, mount: 12, crop: 13 };

// почва
const GROUND = { grass: 0, sand: 1, water: 2, swamp: 3, dark: 4, rock: 5, wall: 6, desert: 7, snow: 8, autumn: 9, mushroom: 10 };
// почвы, где растут деревья и бродит живность (биомы дальних земель — пустыня, тундра, осенний лес, грибная чаща)
const SOIL = new Set([GROUND.grass, GROUND.dark, GROUND.desert, GROUND.snow, GROUND.autumn, GROUND.mushroom]);
const BIOME_NAME = { 0: 'Луга', 1: 'Песок', 2: 'Вода', 3: 'Болото', 4: 'Тёмный лес', 5: 'Скалы', 7: 'Пустыня', 8: 'Тундра', 9: 'Осенний лес', 10: 'Грибная чаща' };
