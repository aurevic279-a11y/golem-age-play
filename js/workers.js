'use strict';
// Орки-рабы (еда + кандалы) и спасённые люди (комфорт + отборная еда).

const ORC_NAMES = [L('Грок'), L('Мурзаг'), L('Ургаш'), L('Бол'), L('Гхаш'), L('Тракк'), L('Зогг'), L('Крул'), L('Нарг'), L('Ульдраг'), L('Шаграт'), L('Горбаг'), L('Груммаш'), L('Зуг-Зуг'), L('Акрак'), L('Брогг'), L('Дурза'), L('Карг'), L('Мокра'), L('Ругаш'), L('Торг'), L('Хрумм'), L('Гнашак'), L('Ургхал')];
const HUMAN_NAMES = [L('Мирослава'), L('Ольгерд'), L('Ведана'), L('Святополк'), L('Любава'), L('Радим'), L('Злата'), L('Всеволод')];

function addWorker(kind) {
  const w = { id: S.nextId++, kind, name: pick(typeof NPC !== 'undefined' && NPC[kind] ? NPC[kind].names : kind === 'orc' ? ORC_NAMES : HUMAN_NAMES), shackled: false, at: null, full: 0, q: 1, unhappy: 0, fed: true, diet: [] };
  S.workers.push(w);
  return w;
}

function workerAt(bid, kind) {
  for (const w of S.workers) if (w.at === bid && w.kind === kind) return w;
  return null;
}

// еда: качество и сытость (секунд). Чем лучше еда, тем дольше рабочий сыт и тем быстрее работает.
// Ягоды кормят орка всего 20 с — на одних ягодах нужны большие поля; жаркое и пироги выгоднее и сильнее.
const FOOD = { berries: { q: 1, sat: 20 }, raw_meat: { q: 1, sat: 25 }, stew: { q: 2, sat: 45 }, roast: { q: 3, sat: 60 }, pie: { q: 4, sat: 90 } };
// рабочие — редкость (лагеря, клетки с пленниками, торговец за самоцветы), поэтому в своём деле очень сильны.
// орк: голодный ×0.5; сытый ×1.8 на ягодах, ×2.2 на похлёбке, ×2.6 на жарком, ×3.0 на пирогах;
// +0.15 за каждый лишний вид еды из последних четырёх блюд (до +0.3)
const ORC_BY_Q = { 1: 1.8, 2: 2.2, 3: 2.6, 4: 3.0 };
function orcVariety(w) { return w.diet ? Math.min(0.3, (new Set(w.diet).size - 1) * 0.15) : 0; }
function orcEff(w) { return w.fed ? (ORC_BY_Q[w.q || 1] || 1.4) + orcVariety(w) : 0.5; }
const HUMAN_EFF = 3;
// профиль работы: орки — грубая работа (буры, плавильни, кузня, камень, печи, мельница, скотный двор, колесо),
// люди — точная (мастерская и сборочный цех, алхимия, кухня, скрипторий). Не по профилю — половина ускорения.
const ORC_WORK = new Set(['drill', 'furnace', 'forge', 'stonecutter', 'kiln', 'mill', 'barn']);
const HUMAN_WORK = new Set(['workshop', 'alchemy', 'kitchen']);
function workerFits(w, b) {
  if (w.kind !== 'orc' && w.kind !== 'human') return npcFits(w, b);
  const def = BUILDINGS[b.type];
  if (w.kind === 'orc') return b.type === 'treadwheel' || ORC_WORK.has(def.crafts);
  return def.kind === 'lab' || HUMAN_WORK.has(def.crafts);
}
function workerAtB(bid) { for (const w of S.workers) if (w.at === bid) return w; return null; }

// в машине один рабочий: бонусы орка и человека не перемножаются
function workerMult(b) {
  if (b.sabotage && S.time < b.sabotage) return 0;
  const w = workerAtB(b.id);
  if (!w) return 1;
  if (w.rest > 0) return 1; // отдыхает и болтает: машина идёт без его прибавки
  const m = moodK(w) * (1 + (S.bonus.npc || 0));
  if (isNewRace(w)) return Math.max(0.5, npcEff(w, b) * m);
  const e = w.kind === 'orc' ? orcEff(w) : w.happy ? HUMAN_EFF : 1;
  return (workerFits(w, b) || e < 1 ? e : 1 + (e - 1) / 2) * m;
}

function canHostWorker(b) {
  const k = BUILDINGS[b.type].kind;
  return k === 'machine' || k === 'lab' || b.type === 'treadwheel';
}

function assignWorker(w, b) {
  if (w.kind === 'orc' && !w.shackled) { hint(L('Сначала наденьте кандалы')); return false; }
  if (w.kind === 'orc' && !hasBuilding('barracks')) { hint(L('Нужен барак рабов (исследование «Кандалы и бараки»)')); return false; }
  if (w.kind === 'human' && !hasBuilding('house')) { hint(L('Нужен дом людей (исследование «Комфорт и уют»)')); return false; }
  if (isNewRace(w) && !hasBuilding('house') && !hasBuilding('barracks')) { hint(L('Нужен кров: дом или барак, и еда в нём')); return false; }
  const prev = workerAtB(b.id);
  if (prev && prev !== w) { prev.at = null; hint(L`${prev.name} снят(а): в машине работает только один рабочий`); }
  if (isNewRace(w) && !workerFits(w, b)) hint(L`${w.name}: не по профилю — работает хуже и просит жалованье (${NPC[w.kind].about})`);
  else if (!workerFits(w, b)) hint(L`${w.name}: не по профилю — ускорение вдвое меньше (${w.kind === 'orc' ? L('орки — буры, плавильни, кузня, колесо') : L('люди — мастерская, алхимия, кухня, скрипторий')})`);
  w.at = b.id;
  sfx('click');
  return true;
}

function hasBuilding(type) {
  if (bldType(type).length) return true;
  return false;
}

function shackle(w) {
  if (!S.player.inv.remove('shackles', 1)) { hint(L('Нужны кандалы (кузня, исследование «Кандалы и бараки»)')); return; }
  w.shackled = true;
  sfx('click');
}

// рабочий живёт и ест в ближайшем к месту работы бараке (орк) или доме (человек)
function workerHome(w, type) {
  const at = S.buildings.get(w.at);
  let best = null, bd = 1e9;
  for (const b of bldType(type)) {
    const d = at ? dist2(b.x, b.y, at.x, at.y) : 0;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
// съесть лучшую еду из своего барака/дома; для разнообразия при равном качестве берёт то, чего давно не ел
function takeFood(type, minQ, w) {
  let best = null, bs = -1;
  for (const b of [workerHome(w, type)]) {
    if (!b) continue;
    for (const id of FOOD_ITEMS) {
      const q = FOOD[id].q;
      if (q < minQ || b.inv.count(id) <= 0) continue;
      const sc = q * 10 + (w.diet && w.diet.includes(id) ? 0 : 5);
      if (sc > bs) { bs = sc; best = [b, id]; }
    }
  }
  if (!best) return null;
  best[0].inv.remove(best[1], 1); statC(best[1], 1);
  const id = best[1];
  w.q = FOOD[id].q; w.full = (w.full || 0) + FOOD[id].sat;
  w.diet = (w.diet || []).concat(id).slice(-4);
  return id;
}

function houseComfortOf(b) {
  if (!b) return 0;
  let c = Math.min(2, b.inv.count('furniture')) * 2 + Math.min(2, b.inv.count('clothes')) * 1.5;
  if (b.inv.count('heater') > 0 && (b.burn > 0)) c += 3;
  return c;
}
function houseComfort() {
  let best = 0;
  for (const b of bldType('house')) best = Math.max(best, houseComfortOf(b));
  return best;
}

// раз в секунду
function updateWorkers() {
  const humans = S.workers.filter(w => w.kind === 'human' && w.at);
  // обогреватели в домах жгут уголь
  for (const b of bldType('house')) {
    if (b.inv.count('heater') > 0 && humans.length) {
      if (b.burn <= 0.5) { const f = ['coal', 'wood'].find(id => b.inv.count(id) > 0); if (f) { b.inv.remove(f, 1); b.burn += ITEMS[f].fuel; } }
      b.burn -= 0.5;
    }
  }
  const comfort = houseComfort();
  S.comfort = comfort;
  for (const w of S.workers) {
    if (!w.at) continue;
    if (!S.buildings.get(w.at)) { w.at = null; continue; }
    if (isNewRace(w)) continue; // еда и настроение новых народов — в npcs.js
    w.full = (w.full || 0) - 1;
    if (w.kind === 'orc') {
      if (w.free) { w.fed = w.fedOk !== false; w.q = w.q || 1; continue; }
      if (w.full <= 0) {
        if (takeFood('barracks', 1, w)) { w.fed = true; w.starve = 0; }
        else {
          w.fed = false; w.full = 0;
          w.starve = (w.starve || 0) + 1;
          if (w.starve === 1) log(L`Орк ${w.name} голодает — привезите еду в барак.`, 'warn');
          if (w.starve > 900) {
            log(L`Орк ${w.name} сорвал кандалы от голода и сбежал!`, 'warn');
            w.gone = true;
          }
        }
      }
    } else {
      if (w.full <= 0) {
        if (takeFood('house', 3, w)) w.foodOk = true;
        else { w.foodOk = false; w.full = 0; }
      }
      const ok = w.foodOk && houseComfortOf(workerHome(w, 'house')) >= 6;
      if (ok) { w.happy = true; w.unhappy = Math.max(0, w.unhappy - 2); }
      else {
        if (w.happy !== false) log(L`${w.name} отказывается работать: ${!w.foodOk ? L('нет отборной еды (жаркое/пирог) в доме') : L('мало комфорта в доме')}.`, 'warn');
        w.happy = false;
        w.unhappy++;
        if (w.unhappy > 600) {
          const b = S.buildings.get(w.at);
          if (b) { b.sabotage = S.time + 120; log(L`${w.name} устроил(а) саботаж: «${BUILDINGS[b.type].name}» стоит 2 минуты!`, 'warn'); }
          w.unhappy = 300;
        }
      }
    }
  }
  if (S.workers.some(w => w.gone)) S.workers = S.workers.filter(w => !w.gone);
}
