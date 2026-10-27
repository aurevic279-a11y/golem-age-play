'use strict';
// Улучшения големов, механический скакун, Великий Голем, люди в городе и достижения.

// ---------- улучшения големов (нужна Кузница големов) ----------
const GOLEM_CORES = [
  null,
  { name: 'Бронзовое ядро', cost: { bronze: 8, igear: 4 }, speed: 0.5, cap: 5, hp: 60, col: '255,190,80' },
  { name: 'Мифриловое ядро', cost: { mithril: 6, clockwork: 1, rune: 2 }, speed: 1.0, cap: 15, hp: 160, col: '120,230,255' },
];
// детали ставятся в окне голема прямо из инвентаря, кузница не нужна (tech — какое исследование открывает деталь)
const GOLEM_PARTS = {
  legs: { name: 'Пружинные ноги', cost: { wgear: 8, plank: 12, leather: 2 }, speed: 0.25, desc: '+25% скорости' },
  pick: { name: 'Стальная кирка', cost: { iron: 12, igear: 4 }, dig: 0.4, desc: '+40% к скорости добычи', tech: 'smithing' },
  firebox: { name: 'Экономная топка', cost: { bronze: 4, block: 6 }, burn: 0.35, desc: '−35% расхода топлива', tech: 'bronze' },
  armor: { name: 'Каменная броня', cost: { block: 10, steel: 4 }, hp: 120, desc: '+120 прочности', tech: 'smithing' },
  bag: { name: 'Большая ноша', cost: { leather: 4, plank: 10, rope: 2 }, cap: 10, desc: '+10 к ноше', tech: 'agriculture' },
};
function golemDig(g) { return 1 + (g.pick ? GOLEM_PARTS.pick.dig : 0); }
function golemCore(g) { return GOLEM_CORES[g.core || 0] || {}; }
function golemCap(g) { return GOLEM.cap + (golemCore(g).cap || 0) + (g.bag ? GOLEM_PARTS.bag.cap : 0); }
function golemMaxHp(g) { return GOLEM.hp + (golemCore(g).hp || 0) + (g.armor ? GOLEM_PARTS.armor.hp : 0); }
function golemUpgradeHtml(g) {
  let h = '<h3>Улучшения</h3><div class="dim">Детали ставятся прямо отсюда (ресурсы из инвентаря). Ядра — только у Кузницы големов.</div>';
  for (const k in GOLEM_PARTS) {
    const pt = GOLEM_PARTS[k];
    if (g[k]) { h += `<div class="ok">✔ ${pt.name} — ${pt.desc}</div>`; continue; }
    if (pt.tech && !S.research.done.includes(pt.tech)) { h += `<div class="dim">🔒 ${pt.name} — после «${TECHS[pt.tech].name}»</div>`; continue; }
    h += `<div class="row"><button data-act="gUp" data-arg="${k}">${pt.name} (${pt.desc})</button> ${costHtml(pt.cost, S.player.inv)}</div>`;
  }
  const next = GOLEM_CORES[(g.core || 0) + 1];
  h += `<div style="margin-top:6px">Ядро: <b>${g.core ? GOLEM_CORES[g.core].name : 'каменное'}</b></div>`;
  if (!hasBuilding('golemforge')) h += `<div class="dim">Постройте «Кузницу големов» (после «Бронзового литья»), чтобы ставить ядра.</div>`;
  else if (next) h += `<div class="row"><button data-act="gUp" data-arg="core">${next.name}: +${Math.round(next.speed * 100)}% скорость, +${next.cap} ноша, +${next.hp} прочность</button> ${costHtml(next.cost, S.player.inv)}</div>`;
  return h;
}
ACT.gUp = (k) => {
  const g = UI.openG; if (!g) return;
  const inv = S.player.inv;
  if (k === 'core' && !hasBuilding('golemforge')) return;
  const cost = k === 'core' ? (GOLEM_CORES[(g.core || 0) + 1] || {}).cost : GOLEM_PARTS[k] && !g[k] ? GOLEM_PARTS[k].cost : null;
  if (!cost) return;
  if (!inv.has(cost)) { hint('Не хватает: ' + lackText(cost, 1)); sfx('error'); return; }
  inv.pay(cost);
  if (k === 'core') g.core = (g.core || 0) + 1; else g[k] = true;
  g.hp = golemMaxHp(g);
  spawnBurst(g.x, g.y - 0.5, k === 'core' && g.core === 2 ? '#9fe8ff' : '#ffd060', 12);
  sfx('research');
  if (k === 'core' && g.core === 2) S.stats.mithrilCore = 1;
  renderGolemWin();
};

// ---------- механический скакун ----------
function toggleRide() {
  const p = S.player;
  if (p.riding) { p.riding = false; hint('Вы спешились'); sfx('click'); return; }
  if (!p.inv.count('steed')) { hint('Нет механического скакуна — скрафтите его (C → Снаряжение)'); return; }
  p.riding = true; hint('Верхом! Скорость ×2. Добывать верхом нельзя. F — спешиться.'); sfx('build');
}
function drawSteed(p, t, ang) {
  const d = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)) ? (Math.cos(ang) > 0 ? 1 : 3) : (Math.sin(ang) > 0 ? 2 : 0);
  const bob = (INPUT.keys.KeyW || INPUT.keys.KeyA || INPUT.keys.KeyS || INPUT.keys.KeyD) ? Math.abs(Math.sin(t * 14)) * 0.05 : 0;
  drawProp('build', 'steed_' + d, p.x - 0.5, p.y - 0.5 - bob);
}

// ---------- Великий Голем ----------
// колосс собирается из четырёх видов деталей — у каждой своя производственная цепочка
const COLOSSUS_NEED = { colossus_frame: 100, colossus_limb: 80, colossus_armor: 80, colossus_heart: 20 };
const COLOSSUS = { parts: Object.values(COLOSSUS_NEED).reduce((a, b) => a + b, 0), hp: 30000, speed: 2.6, dmg: 220, aoe: 2.8, cd: 1.3, range: 2.2 };
function colossusDone(b) { return Object.keys(COLOSSUS_NEED).every(id => b.inv.count(id) >= COLOSSUS_NEED[id]); }
function colossusProgress(b) { let n = 0; for (const id in COLOSSUS_NEED) n += Math.min(COLOSSUS_NEED[id], b.inv.count(id)); return n / COLOSSUS.parts; }
function colossusTick(dt) {
  // площадка: когда собраны все сегменты — колосс просыпается
  for (const b of bldType('colossus_site')) {
    if (S.colossus) continue;
    if (colossusDone(b)) {
      for (const id in COLOSSUS_NEED) b.inv.remove(id, COLOSSUS_NEED[id]);
      S.colossus = { x: b.x + 2, y: b.y + 3.2, hp: COLOSSUS.hp, cd: 0, ang: Math.PI / 2 };
      log('ВЕЛИКИЙ ГОЛЕМ ПРОБУДИЛСЯ! Колосс следует за Анимансером и крушит врагов. Только он может сразить Владыку Тёмных Эльфов.', 'good');
      sfx('victory'); shake(6);
      for (let i = 0; i < 4; i++) spawnBurst(b.x + 2, b.y + 2, '#9fe8ff', 30);
    }
  }
  const c = S.colossus;
  if (!c) return;
  if (c.atkT != null) c.atkT += dt;
  c.cd -= dt;
  const p = S.player;
  // цель: ближайший враг рядом с колоссом или героем
  let tgt = null, bd = 14 * 14;
  for (const e of S.enemies) {
    if (e.dead) continue;
    const d = Math.min(dist2(e.x, e.y, c.x, c.y), dist2(e.x, e.y, p.x, p.y) + 9);
    if (d < bd) { bd = d; tgt = e; }
  }
  let tx = p.x - 2, ty = p.y + 1.5, near = 2.5;
  if (tgt) { tx = tgt.x; ty = tgt.y; near = COLOSSUS.range; }
  const d = dist(c.x, c.y, tx, ty);
  c.moving = false;
  if (d > near) {
    const sp = COLOSSUS.speed * dt;
    c.x += (tx - c.x) / d * sp; c.y += (ty - c.y) / d * sp; c.moving = true; c.walk = (c.walk || 0) + dt;
    c.ang = Math.atan2(ty - c.y, tx - c.x);
    if (Math.random() < dt * 2) shake(0.6);
  } else if (tgt && c.cd <= 0) {
    c.cd = COLOSSUS.cd; c.atkT = 0; c.ang = Math.atan2(tgt.y - c.y, tgt.x - c.x);
    for (const e of EHASH.query(tgt.x, tgt.y, COLOSSUS.aoe, _q)) hurtEnemy(e, COLOSSUS.dmg, { x: c.x, y: c.y, colossus: true });
    damageCampStructs(tgt.x, tgt.y, COLOSSUS.aoe, COLOSSUS.dmg);
    FX.push({ ring: true, x: tgt.x, y: tgt.y, life: 0.5, life0: 0.5, r: COLOSSUS.aoe, c: '150,240,255' });
    spawnBurst(tgt.x, tgt.y, '#8a7a6a', 16); shake(3); sfx('boom', c.x, c.y);
  }
}
function drawColossus(c, t) {
  G.save(); G.globalAlpha = 0.25; G.fillStyle = '#5affc0';
  G.beginPath(); G.ellipse(sx(c.x), sy(c.y), VIEW.z * 1.4, VIEW.z * 0.6, 0, 0, 7); G.fill(); G.restore();
  const atk = c.atkT != null && c.atkT < 0.6;
  drawUnit3D('golem', c.x, c.y, { ang: c.ang, anim: atk ? 'swing' : c.moving ? 'run' : 'stance', t: c.moving ? c.walk * 0.6 : t, k: atk ? c.atkT / 0.6 : null, scale: 3.4 });
  // светящиеся руны на груди
  G.save(); G.globalCompositeOperation = 'lighter';
  const gl = 0.6 + Math.sin(t * 3) * 0.2;
  G.fillStyle = `rgba(90,255,210,${gl.toFixed(2)})`; G.beginPath(); G.arc(sx(c.x), sy(c.y - 2.6), VIEW.z * 0.22, 0, 7); G.fill();
  G.restore();
}

// ---------- люди в городе ----------
const TOWN_TALK = [
  'Хорошо, что брёвна теперь носят големы, а не мы.', 'Спасибо за крышу над головой, Анимансер!', 'Слышишь, как стучат шестерни? Музыка!',
  'Говорят, торговец в чёрном — вовсе не человек.', 'Эльфы опять требуют дань. Сколько можно?', 'Мой дед тоже чинил механизмы. Только поменьше.',
  'Голем-землепашец сегодня улыбался. Или мне показалось?', 'Надо бы стену повыше…', 'Пахнет хлебом с кухни!',
];
const TOWN_NIGHT = ['Ночью опять гоблины выли за стеной…', 'Зажгите ещё факелов, страшно.', 'Скорее бы рассвет.'];
const TOWN_SAD = ['Есть нечего, а работать заставляют…', 'В доме холодно и пусто.', 'Без пирога я и пальцем не пошевелю.'];
function townTick(dt) {
  const houses = [...S.buildings.values()].filter(b => b.type === 'house');
  const bc = baseCenter();
  for (const w of S.workers) {
    if (w.kind !== 'human' || w.guard) continue; // охранники караванов ходят сами (guards.js)
    if (w.x == null) { const h = houses[0]; w.x = h ? h.x + 1 : bc.x + rand(-3, 3); w.y = h ? h.y + 2.4 : bc.y + rand(-3, 3); }
    const b = w.at ? S.buildings.get(w.at) : null;
    // работает — стоит у своей постройки; свободен — гуляет между домами
    if (b) { w.tx = b.x + b.w / 2 + 0.3; w.ty = b.y + b.h + 0.4; }
    else if (w.tx == null || dist(w.x, w.y, w.tx, w.ty) < 0.2 && (w.idle = (w.idle || 0) + dt) > 4) {
      w.idle = 0;
      const h = houses.length ? pick(houses) : null;
      w.tx = h ? h.x + rand(-1, 3) : bc.x + rand(-6, 6); w.ty = h ? h.y + 2 + rand(0, 2) : bc.y + rand(-6, 6);
      if (!walkable(Math.floor(w.tx), Math.floor(w.ty))) { w.tx = w.x; w.ty = w.y; }
    }
    const d = dist(w.x, w.y, w.tx, w.ty);
    w.moving = d > 0.15;
    if (w.moving) { const sp = 1.5 * dt; w.x += (w.tx - w.x) / d * Math.min(sp, d); w.y += (w.ty - w.y) / d * Math.min(sp, d); w.ang = Math.atan2(w.ty - w.y, w.tx - w.x); w.walk = (w.walk || 0) + dt; }
    // реплики
    w.talkT = (w.talkT == null ? rand(5, 20) : w.talkT) - dt;
    if (w.talkT <= 0) {
      w.talkT = rand(18, 40);
      w.say = pick(w.at && !w.happy ? TOWN_SAD : isNight() && Math.random() < 0.6 ? TOWN_NIGHT : TOWN_TALK);
      w.sayT = 4;
    }
    if (w.sayT > 0) w.sayT -= dt;
  }
}
function drawTownsfolk(w, t) {
  if (w.guard) { drawGuard(w, t); return; }
  drawUnit3D('merchant', w.x, w.y, { ang: w.ang != null ? w.ang : Math.PI / 2, anim: w.moving ? 'run' : 'stance', t: w.moving ? w.walk * 1.2 : t + w.id, scale: 0.9 });
  G.font = `${Math.round(Math.max(10, VIEW.z * 0.22))}px sans-serif`; G.textAlign = 'center';
  G.lineWidth = 3; G.strokeStyle = '#000'; G.strokeText(w.name, sx(w.x), sy(w.y - 1.35)); G.fillStyle = '#d8f0ff'; G.fillText(w.name, sx(w.x), sy(w.y - 1.35));
  if (w.sayT > 0 && w.say) {
    // облачко с репликой
    G.font = `${Math.round(Math.max(11, VIEW.z * 0.24))}px sans-serif`;
    const tw = G.measureText(w.say).width + 12, X = sx(w.x) - tw / 2, Y = sy(w.y - 2.2) - VIEW.z * 0.3;
    G.globalAlpha = Math.min(1, w.sayT); G.fillStyle = 'rgba(255,248,230,0.95)'; G.strokeStyle = '#000'; G.lineWidth = 1;
    G.fillRect(X, Y, tw, VIEW.z * 0.4); G.strokeRect(X, Y, tw, VIEW.z * 0.4);
    G.fillStyle = '#2a2018'; G.fillText(w.say, sx(w.x), Y + VIEW.z * 0.29); G.globalAlpha = 1;
  }
}

// ---------- достижения ----------
const ACH = [
  { id: 'citadel1', name: 'Падение цитадели', desc: 'Разрушить Цитадель орков на краю карты', ok: () => (S.stats.citadels || 0) >= 1 },
  { id: 'citadel4', name: 'Четыре стороны света', desc: 'Разрушить все четыре цитадели на краю карты', ok: () => (S.stats.citadels || 0) >= 4 },
  { id: 'golem1', name: 'Оживший камень', desc: 'Создать первого голема', ok: () => S.golems.length >= 1 },
  { id: 'golem10', name: 'Бригада', desc: '10 големов одновременно', ok: () => S.golems.length >= 10 },
  { id: 'golem50', name: 'Армия камня', desc: '50 големов одновременно', ok: () => S.golems.length >= 50 },
  { id: 'iron100', name: 'Первая плавка', desc: 'Выплавить 100 железных слитков', ok: () => (S.stats.made.iron || 0) >= 100 },
  { id: 'ingot1000', name: 'Заводской гул', desc: '1000 слитков в минуту', ok: () => { const r = statRates(0).P; return ['iron', 'copper', 'gold', 'steel', 'bronze', 'mithril'].reduce((a, k) => a + (r[k] || 0), 0) >= 1000; } },
  { id: 'nightsafe', name: 'Тихая ночь', desc: 'Пережить ночь без единой разрушенной постройки (при 20+ постройках)', ok: () => !!S.stats.nightSafe },
  { id: 'camp1', name: 'Первая победа', desc: 'Разорить лагерь врагов', ok: () => (S.stats.camps || 0) >= 1 },
  { id: 'camp10', name: 'Гроза лагерей', desc: 'Разорить 10 лагерей', ok: () => (S.stats.camps || 0) >= 10 },
  { id: 'kills500', name: 'Защитник', desc: 'Победить 500 врагов', ok: () => (S.stats.kills || 0) >= 500 },
  { id: 'bots50', name: 'Без рук', desc: 'Големы-строители построили 50 построек', ok: () => (S.stats.botBuilt || 0) >= 50 },
  { id: 'cart1000', name: 'Караванщик', desc: 'Повозки доставили 1000 предметов', ok: () => (S.stats.cartDelivered || 0) >= 1000 },
  { id: 'rider', name: 'Всадник', desc: 'Проехать верхом 2000 клеток', ok: () => (S.stats.ridden || 0) >= 2000 },
  { id: 'mithril', name: 'Сердце из мифрила', desc: 'Поставить голему мифриловое ядро', ok: () => !!S.stats.mithrilCore },
  { id: 'town4', name: 'Город людей', desc: '4 человека живут в городе', ok: () => S.workers.filter(w => w.kind === 'human').length >= 4 },
  { id: 'tribute10', name: 'Терпеливый данник', desc: 'Заплатить дань эльфам 10 раз', ok: () => (S.elves.paid || 0) >= 10 },
  { id: 'research', name: 'Учёный', desc: 'Изучить все обычные исследования', ok: () => Object.keys(TECHS).every(id => TECHS[id].infinite || S.research.done.includes(id)) },
  { id: 'infinity', name: 'Бесконечность', desc: '5 уровней бесконечных исследований', ok: () => Object.values(S.research.levels || {}).reduce((a, b) => a + b, 0) >= 5 },
  { id: 'hours10', name: 'Долгая эпоха', desc: 'Играть 10 часов в одном мире', ok: () => S.time >= 36000 },
  { id: 'troll', name: 'Гроза пещер', desc: 'Победить пещерного тролля', ok: () => (S.stats.trolls || 0) >= 1 },
  { id: 'siege', name: 'Крепость', desc: 'Отбить осаду, не потеряв ни одних ворот', ok: () => !!S.stats.siegeHeld },
  { id: 'colossus', name: 'Пробуждение', desc: 'Пробудить Великого Голема', ok: () => !!S.colossus },
  { id: 'lord', name: 'Свержение', desc: 'Сразить Владыку Тёмных Эльфов', ok: () => !!S.elves.defeated },
];
function achTick() {
  S.ach = S.ach || {};
  // «тихая ночь»: на закате запоминаем потери, на рассвете сравниваем
  const n = isNight();
  if (n && !S.achNight) S.achNight = { lost: S.stats.lost || 0, size: S.buildings.size };
  if (!n && S.achNight) { if ((S.stats.lost || 0) === S.achNight.lost && S.achNight.size >= 20) S.stats.nightSafe = 1; S.achNight = null; }
  for (const a of ACH) {
    if (S.ach[a.id]) continue;
    let ok = false;
    try { ok = a.ok(); } catch (e) { ok = false; }
    if (ok) { S.ach[a.id] = S.time; log(`🏆 Достижение: «${a.name}» — ${a.desc}`, 'good'); sfx('victory'); }
  }
}
function renderAchWin() {
  S.ach = S.ach || {};
  const got = ACH.filter(a => S.ach[a.id]).length;
  const h = `<div class="dim">Получено ${got} из ${ACH.length}</div><div class="list">${ACH.map(a => `<div class="line"><b style="color:${S.ach[a.id] ? '#ffa200' : '#6a6560'}">${S.ach[a.id] ? '🏆' : '🔒'} ${a.name}</b><span class="${S.ach[a.id] ? '' : 'dim'}">${a.desc}${S.ach[a.id] ? ` · ${fmtTime(S.ach[a.id])}` : ''}</span></div>`).join('')}</div>`;
  if (UI.wins.ach) setWinBody('ach', h); else openWin('ach', 'Достижения', h, { width: 560 });
}
ACT.achwin = () => { if (UI.wins.ach) closeWin('ach'); else renderAchWin(); };

function featuresTick(dt) {
  colossusTick(dt);
  townTick(dt);
}
