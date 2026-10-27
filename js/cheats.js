'use strict';
// Чит-меню для быстрой проверки (клавиша Ё / `).

function cheatState() {
  if (!S.cheats) S.cheats = { god: false, free: false, instant: false, reach: false, speed: 1 };
  return S.cheats;
}

const CHEAT_BASIC = ['wood', 'stone', 'iron_ore', 'copper_ore', 'coal', 'sulfur', 'gold_ore', 'mithril_ore', 'sand',
  'plank', 'wgear', 'wshaft', 'minigolem', 'block', 'iron', 'copper', 'gold', 'steel', 'bronze', 'igear', 'glass',
  'charcoal', 'brick', 'irod', 'nails', 'cwire', 'rope', 'rune', 'wheat'];

function cheatGive(ids, n) {
  const inv = S.player.inv;
  let lost = 0;
  for (const id of ids) lost += n - inv.add(id, n);
  log(lost ? `Выдано, но ${lost} не поместилось в инвентарь` : 'Ресурсы выданы', lost ? 'warn' : 'good');
}

function cheatResearchAll() {
  for (const id in TECHS) if (!S.research.done.includes(id)) S.research.done.push(id);
  netsDirty = true; // конвейеры после «Механических векторов» начинают требовать энергию
  S.research.cur = null; S.research.units = 0;
  recomputeBonus();
  UI.dirty = true;
  log('Все исследования открыты', 'good');
}

function cheatFinishCurrent() {
  const id = S.research.cur;
  if (!id) { hint('Сначала выберите исследование (T)'); return; }
  completeTech(id);
}

function cheatRevealMap(r) {
  const p = S.player;
  for (let y = -r; y <= r; y += 12) for (let x = -r; x <= r; x += 12) explore(p.x + x, p.y + y, 9);
  log('Карта открыта в радиусе ' + r, 'good');
}

function cheatNearestCamp(type) {
  const p = S.player;
  let best = null, bd = 1e9;
  for (const c of S.camps) {
    if (!c.alive || c.type === 'elf' || (type && c.type !== type)) continue;
    const d = dist(c.x, c.y, p.x, p.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function cheatTeleport(x, y) {
  const p = S.player;
  const f = freeSpotNear(x, y, 20) || { x, y };
  p.x = f.x; p.y = f.y; CAM.x = p.x; CAM.y = p.y;
  explore(p.x, p.y, 14);
}

function cheatSkip(sec) {
  const n = Math.round(sec * TPS);
  for (let i = 0; i < n; i++) tick();
  log('Прошло ' + fmtTime(sec), 'good');
}

function renderCheatWin() {
  const C = cheatState();
  const tog = (k, name) => `<button data-act="cheatTog" data-arg="${k}" class="${C[k] ? 'primary' : ''}">${C[k] ? '✔' : '✖'} ${name}</button>`;
  const h = `
  <h3>Ресурсы</h3>
  <div class="grid">
    <button data-act="cheatGive" data-arg="basic">+500 базовых ресурсов</button>
    <button data-act="cheatGive" data-arg="all">+50 всех предметов (без построек)</button>
    <button data-act="cheatGive" data-arg="blds">+10 всех открытых построек</button>
    <button data-act="cheatGive" data-arg="gold">+200 золота, мифрила, самоцветов</button>
    <button data-act="cheatGive" data-arg="ammo">+200 болтов и камней</button>
    <button data-act="cheatClear">Очистить инвентарь</button>
  </div>
  <h3>Режимы</h3>
  <div class="dim">Бесплатная стройка: постройки ставятся, не тратясь из инвентаря (и при разборке не возвращаются). Крафт без ресурсов: любой рецепт крафтится, сырьё не нужно.</div>
  <div class="grid">
    ${tog('god', 'Бессмертие')}${tog('free', 'Бесплатная стройка')}${tog('freeCraft', 'Крафт без ресурсов')}${tog('instant', 'Мгновенный крафт')}${tog('reach', 'Строить где угодно')}
  </div>
  <h3>Скорость времени</h3>
  <div class="grid">${[1, 2, 5, 10, 20].map(s => `<button data-act="cheatSpeed" data-arg="${s}" class="${C.speed === s ? 'primary' : ''}">×${s}</button>`).join('')}
    <button data-act="cheatSkip" data-arg="600">Пропустить 10 минут</button></div>
  <h3>Исследования</h3>
  <div class="grid"><button data-act="cheatResearch" data-arg="cur">Завершить текущее</button><button data-act="cheatResearch" data-arg="all">Открыть все</button></div>
  <h3>Мир и враги</h3>
  <div class="grid">
    <button data-act="cheatMap" data-arg="150">Открыть карту (150)</button>
    <button data-act="cheatMap" data-arg="400">Открыть карту (400)</button>
    <button data-act="cheatTp" data-arg="goblin">К лагерю гоблинов</button>
    <button data-act="cheatTp" data-arg="orc">К лагерю орков</button>
    <button data-act="cheatTp" data-arg="orc_big">К крепости орков</button>
    <button data-act="cheatTp" data-arg="citadel">К цитадели</button>
    <button data-act="cheatTp" data-arg="base">Домой</button>
    <button data-act="cheatRaid" data-arg="weak">Набег</button>
    <button data-act="cheatRaid" data-arg="strong">Сильная орда</button>
    <button data-act="cheatSiege">Осада</button>
    <button data-act="cheatElf" data-arg="demand">Дань эльфам сейчас</button>
    <button data-act="cheatElf" data-arg="punish">Каратели эльфов</button>
    <button data-act="cheatMerchant">Торговец сейчас</button>
    <button data-act="cheatKill">Убить всех врагов рядом</button>
    <button data-act="cheatWorker" data-arg="orc">+ орк-раб</button>
    <button data-act="cheatWorker" data-arg="human">+ человек</button>
  </div>
  <div class="dim" style="margin-top:8px">Ё (или \`) — открыть/закрыть это окно.</div>`;
  if (UI.wins.cheat) setWinBody('cheat', h); else openWin('cheat', 'Чит-меню', h, { width: 560 });
}

ACT.cheatTog = (k) => { const C = cheatState(); C[k] = !C[k]; renderCheatWin(); };
ACT.cheatSpeed = (s) => { cheatState().speed = +s; renderCheatWin(); };
ACT.cheatSkip = (s) => cheatSkip(+s);
ACT.cheatGive = (k) => {
  if (k === 'basic') cheatGive(CHEAT_BASIC, 500);
  else if (k === 'all') cheatGive(Object.keys(ITEMS).filter(id => !ITEMS[id].bld), 50);
  else if (k === 'blds') cheatGive(Object.keys(BUILDINGS).filter(isUnlockedBuilding), 10);
  else if (k === 'gold') cheatGive(['gold', 'mithril', 'relic', 'gem'], 200);
  else if (k === 'ammo') cheatGive(['bolt', 'stone', 'tar'], 200);
  renderCheatWin();
};
ACT.cheatClear = () => { const inv = S.player.inv; for (const id of inv.ids()) inv.remove(id, inv.count(id)); log('Инвентарь очищен'); };
ACT.cheatResearch = (k) => { if (k === 'all') cheatResearchAll(); else cheatFinishCurrent(); };
ACT.cheatMap = (r) => cheatRevealMap(+r);
ACT.cheatTp = (k) => {
  if (k === 'base') { cheatTeleport(S.spawn.x, S.spawn.y); return; }
  const c = cheatNearestCamp(k);
  if (!c) { hint('Таких лагерей поблизости нет — откройте карту подальше'); return; }
  cheatTeleport(c.x + 9, c.y);
};
ACT.cheatRaid = (k) => {
  const c = cheatNearestCamp(null);
  if (!c) { hint('Нет лагерей поблизости'); return; }
  sendRaid(c, k === 'strong' ? 3 : 1, k === 'strong' ? 'Сильная орда (чит)' : 'Набег (чит)');
};
ACT.cheatElf = (k) => {
  if (k === 'demand') { S.elves.demand = null; S.elves.next = S.time; }
  else refuseTribute();
};
ACT.cheatSiege = () => { if (!startSiege()) hint('Нет лагерей поблизости'); };
ACT.cheatMerchant = () => { S.merchant = null; S.nextMerchant = S.time; };
ACT.cheatKill = () => {
  const p = S.player;
  let n = 0;
  for (const e of S.enemies) if (dist(e.x, e.y, p.x, p.y) < 40) { killEnemy(e); n++; }
  log('Убито врагов: ' + n);
};
ACT.cheatWorker = (k) => { const w = addWorker(k); if (k === 'orc') w.shackled = true; log(k === 'orc' ? 'Добавлен орк-раб (в кандалах)' : 'Добавлен человек', 'good'); };
ACT.cheats = () => { if (UI.wins.cheat) closeWin('cheat'); else renderCheatWin(); };
