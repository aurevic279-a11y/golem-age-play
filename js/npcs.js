'use strict';
// Неписи всех народов: рабочие со своими сильными сторонами, настроением, отдыхом, разговорами и покупками.
// Настроение зависит от еды, крова, профиля, соседей по дому, репутации народа и событий и влияет на скорость работы.

const NPC = {
  human: { name: L('Человек'), unit: 'merchant', names: HUMAN_NAMES, about: L('точная работа') },
  orc: { name: L('Орк'), unit: 'orc_brute', names: ORC_NAMES, eff: 2.4, work: new Set(['drill', 'furnace', 'forge', 'stonecutter', 'kiln', 'mill', 'barn']), about: L('сильный, туповат: грубая работа, плохо в науке') },
  goblin: { name: L('Гоблин'), unit: 'goblin', eff: 1.8, walk: 2.6, names: [L('Шнырь'), L('Зубик'), L('Крюк'), L('Хвать'), L('Плут'), L('Юрк'), L('Сквозняк'), L('Щипа')], work: new Set(['mill', 'stonecutter', 'kitchen', 'drill']), about: L('быстрый, но слабый: мелкая работа, дёшев и неприхотлив') },
  elf: { name: L('Эльф'), unit: 'lelf', eff: 3.2, picky: true, names: [L('Лаэрис'), L('Сильвена'), L('Тиран'), L('Элиандра'), L('Феанил'), L('Ариэль'), L('Нимрис'), L('Талион')], work: new Set(['workshop', 'alchemy', 'lab']), about: L('умный и привередливый: наука и тонкая работа, нужен уют и хорошая еда') },
  dwarf: { name: L('Дворф'), unit: 'dwarf', eff: 2.8, names: [L('Торин'), L('Брокк'), L('Гимла'), L('Дурин'), L('Хильда'), L('Балин'), L('Рагна'), L('Двалин')], work: new Set(['forge', 'furnace', 'drill', 'kiln', 'stonecutter']), about: L('мастер металла и камня, упрям и любит пиво') },
  mage: { name: L('Маг'), unit: 'wizard', eff: 3, picky: true, names: [L('Астарион'), L('Мелисса'), L('Зорин'), L('Ирвинг'), L('Кассандра'), L('Орлин'), L('Вега'), L('Септим')], work: new Set(['alchemy', 'lab']), about: L('наука и алхимия, рассеян, требует жалованье за любую другую работу') },
};
const NPC_GEAR = [
  { name: L('кожаный фартук'), k: 0.12 }, { name: L('рабочие рукавицы'), k: 0.1 }, { name: L('счастливая шапка'), k: 0.14 },
  { name: L('наплечник с заклёпками'), k: 0.1 }, { name: L('очки-увеличители'), k: 0.15 },
];
const WAGE = 1; // монет в минуту за работу не по профилю

// настроение → скорость работы: 0 → ×0.7, 50 → ×1, 100 → ×1.3
function moodK(w) { return 0.7 + clamp(w.mood == null ? 55 : w.mood, 0, 100) / 100 * 0.6; }
function npcFits(w, b) {
  const d = BUILDINGS[b.type], N = NPC[w.kind];
  return d.kind === 'lab' ? N.work.has('lab') : N.work.has(d.crafts) || w.kind === 'orc' && b.type === 'treadwheel';
}
// скорость непися новых народов: не по профилю — заметно хуже
function npcEff(w, b) {
  const N = NPC[w.kind];
  if (!w.fedOk) return 0.6;
  const e = N.eff + (w.gear ? w.gear.k : 0);
  return npcFits(w, b) ? e : 1 + (e - 1) * 0.3;
}
function isNewRace(w) { return w.kind !== 'human' && w.kind !== 'orc'; }
function isFreeNpc(w) { return isNewRace(w) || w.free; }
function npcHomeType(w) { return NPC[w.kind].picky || !bldType('barracks').length ? 'house' : bldType('house').length && w.kind !== 'goblin' ? 'house' : 'barracks'; }

// раз в секунду: еда, жильё, настроение, отдых, жалованье и покупки
function updateNpcs() {
  const homes = new Map();
  for (const w of S.workers) {
    if (w.guard) continue;
    if (w.mood == null) w.mood = 55;
    const b = w.at ? S.buildings.get(w.at) : null;
    if (isNewRace(w) || w.free) {
      w.full = (w.full || 0) - 1;
      if (w.full <= 0) {
        const got = takeFood(npcHomeType(w), NPC[w.kind].picky ? 3 : 1, w);
        w.fedOk = !!got; if (!got) w.full = 0;
      }
    }
    if (b) { const h = workerHome(w, npcHomeType(w)); if (h) { if (!homes.has(h.id)) homes.set(h.id, []); homes.get(h.id).push(w); } }
  }
  const ev = typeof blightEvent === 'function' && blightEvent();
  for (const w of S.workers) {
    if (w.guard) continue;
    const b = w.at ? S.buildings.get(w.at) : null;
    let tgt = 50, why = [];
    const fits = b ? (w.kind === 'human' ? workerFits(w, b) : w.kind === 'orc' && !w.free ? workerFits(w, b) : npcFits(w, b)) : true;
    const fed = isFreeNpc(w) ? w.fedOk : w.kind === 'orc' ? w.fed !== false : w.foodOk;
    if (w.at) { if (fed) { tgt += 12; } else { tgt -= 22; why.push(L('голоден')); } }
    if (b && !fits) { tgt -= 12; why.push(L('не своя работа')); } else if (b) tgt += 8;
    const home = workerHome(w, isFreeNpc(w) ? npcHomeType(w) : w.kind === 'orc' ? 'barracks' : 'house');
    if (home && home.type === 'house') { const c = houseComfortOf(home); tgt += c >= 6 ? 8 : NPC[w.kind].picky ? -12 : 0; if (c < 6 && NPC[w.kind].picky) why.push(L('нет уюта')); }
    else if (!home) { tgt -= 10; why.push(L('нет крова')); }
    if (w.kind === 'orc' && w.shackled && !w.free) tgt -= 10; // кандалы никому не нравятся
    if (RACES[w.kind] && !RACES[w.kind].enemy) tgt += rep(w.kind) / 100 * 25; // репутация народа сильно влияет на настроение
    if (ev) { tgt -= 12; why.push(L('ядовитая погода')); }
    if (b && home) {
      const list = homes.get(home.id) || [];
      if (list.some(o => o !== w && RACES[o.kind] && RACES[w.kind] && baseRel(o.kind, w.kind) <= -30)) { tgt -= 20; why.push(L('сосед по дому')); w.badRoom = true; } else w.badRoom = false;
    }
    if (w.gear) tgt += 5;
    const vis = S.world && S.world.visitor;
    if (vis && vis.race === w.kind) { tgt += 8; w.kin = true; } else w.kin = false; // свой торговец приехал — радость
    // жалованье и обновки: за чужой станок требуют денег, а на них покупают вещицы у торговцев своей расы
    if (isFreeNpc(w) && b && !fits) {
      w.wageT = (w.wageT || 0) - 1;
      if (w.wageT <= 0) {
        w.wageT = 60;
        if ((S.money || 0) >= WAGE) { addMoney(-WAGE); w.cash = (w.cash || 0) + WAGE; }
        else { w.noPay = S.time; }
        if (!w.gear && (w.cash || 0) >= 12 && RACES[w.kind] && !RACES[w.kind].enemy && rep(w.kind) >= -10 && Math.random() < 0.2) {
          w.cash -= 12; w.gear = pick(NPC_GEAR);
          log(L`${NPC[w.kind].name} ${w.name} купил(а) у своих торговцев: ${w.gear.name}. Чужой станок идёт на ${Math.round(w.gear.k * 100)}% лучше.`, 'good');
        }
      }
      if (w.noPay && S.time - w.noPay < 120) { tgt -= 15; why.push(L('нет жалованья')); }
    } else if (w.gear && b && fits) {
      log(L`У рабочего ${w.name} сломалась вещь: ${w.gear.name}. На своём станке она больше не нужна.`);
      w.gear = null;
    }
    w.mood = clamp(w.mood + clamp(tgt - w.mood, -0.4, 0.4), 0, 100);
    w.why = why;
    // отдых и болтовня: раз в несколько минут встаёт и идёт поговорить (станок тогда работает без его бонуса)
    if (w.rest > 0) w.rest -= 1;
    else if (w.at && (w.restT = (w.restT == null ? rand(120, 400) : w.restT) - 1) <= 0) {
      w.restT = rand(240, 480) * (0.8 + w.mood / 250);
      w.rest = rand(20, 40);
    }
  }
}

// ---------- реплики ----------
const NPC_TALK = {
  human: { good: [L('Хорошо, что брёвна теперь носят големы.'), L('Спасибо за крышу над головой!'), L('Пахнет хлебом с кухни!'), L('Надо бы стену повыше…')], bad: [L('Есть нечего, а работать заставляют…'), L('В доме холодно и пусто.'), L('Без пирога и пальцем не пошевелю.')], chat: [L('Слыхал, торговец в чёрном вовсе не человек?'), L('Мой дед тоже чинил големов.'), L('Эльфы опять требуют дань.')] },
  orc: { good: [L('Орк сыт, орк бить железо!'), L('Хорошая плавка. Хрррр.'), L('Камень ломать весело.'), L('Много еды — мало думать.')], bad: [L('Кандалы трут…'), L('Орк голодный — орк злой.'), L('Ещё день, и сломаю тут всё.')], chat: [L('Ты сильный. Давай драться!'), L('Думать больно. Бить проще.'), L('Гоблин мелкий, но смешной.')] },
  goblin: { good: [L('Хе-хе, я быстрее всех!'), L('Тут что-то плохо лежало… Уже нет.'), L('Шустро-шустро-шустро!'), L('Чур моё!')], bad: [L('Опять объедки!'), L('Сбегу, вот увидите!'), L('Я маленький, а работы большие.')], chat: [L('Слышь, а монетка есть?'), L('Дворфы воняют пивом, хе-хе.'), L('Я тут знаю лазейку…')] },
  elf: { good: [L('Дивный закат над трубами… почти.'), L('Этот механизм почти изящен.'), L('Лес простит вас. Когда-нибудь.'), L('Прекрасный пирог, хвалю.')], bad: [L('Это жильё оскорбляет мой вкус.'), L('Дым! Всюду дым!'), L('Я тысячу лет такого не ела.')], chat: [L('Сколько вам лет? Ах да, простите.'), L('Орки здесь? Какой ужас.'), L('В роще сейчас цветут ивы.')] },
  dwarf: { good: [L('Вот это сталь! Звенит как надо.'), L('Камень не врёт.'), L('Хорошая работа, клянусь бородой.'), L('За горн! За пиво!')], bad: [L('Пива нет — работы нет!'), L('Эти гоблины опять стащили молот!'), L('Хуже штольни, чем тут.')], chat: [L('Мой прадед ковал лучше.'), L('Эльфы? Тьфу, тростинки.'), L('Глубже копать надо, глубже!')] },
  mage: { good: [L('Эфир сегодня спокоен.'), L('Какой любопытный эксперимент!'), L('Формула сошлась, наконец-то.'), L('Знание — вот истинное топливо.')], bad: [L('Здесь невозможно сосредоточиться!'), L('Мне обещали лабораторию!'), L('Это не наука, а кошмар.')], chat: [L('Ты читал трактат о рунах?'), L('Голем — это просто упрямая формула.'), L('Я забыл, зачем пришёл…')] },
};
const NPC_EVENT = [L('Жжётся! Под крышу, быстро!'), L('Чем это пахнет?!'), L('Не дыши этим!'), L('Опять с неба льёт дрянь!')];
const NPC_HATE = [L('Не стой рядом со мной.'), L('Как с таким жить под одной крышей?'), L('Подвинься, чучело.'), L('Убери от меня свою рожу!')];
function npcEmotion(w) {
  if (typeof blightEvent === 'function' && blightEvent() && !w.at) return '😨';
  if (w.rest > 0) return w.say && w.sayT > 0 ? '💬' : '☕';
  if (w.badRoom) return '😠';
  if (w.mood >= 72) return '😊';
  if (w.mood < 28) return '😡';
  if (w.mood < 42) return '😟';
  return '';
}
function npcPickLine(w, other) {
  if (typeof blightEvent === 'function' && blightEvent() && Math.random() < 0.6) return pick(NPC_EVENT);
  const T = NPC_TALK[w.kind] || NPC_TALK.human;
  if (w.kin && Math.random() < 0.5) return pick([L('Земляк приехал! Что новенького дома?'), L('Почём нынче у вас товар?'), L('Привет родне передай!')]);
  if (other && RACES[other.kind] && RACES[w.kind] && baseRel(other.kind, w.kind) <= -30 && Math.random() < 0.6) return pick(NPC_HATE);
  if (w.rest > 0) return pick(T.chat);
  if (isNight() && w.kind === 'human' && Math.random() < 0.5) return pick(TOWN_NIGHT);
  return pick(w.mood < 42 ? T.bad : T.good);
}
// видимость подписи и реплики: вблизи ясно, издалека почти прозрачно
function npcAlpha(x, y) {
  const d = dist(x, y, S.player.x, S.player.y);
  return clamp(1 - (d - 5) / 15, 0.06, 1);
}
function npcLabel(txt, x, y, col, a) {
  G.save(); G.globalAlpha = a; G.font = `${Math.round(Math.max(11, VIEW.z * 0.24))}px sans-serif`; G.textAlign = 'center';
  G.lineWidth = 3; G.strokeStyle = '#000'; G.strokeText(txt, sx(x), sy(y)); G.fillStyle = col; G.fillText(txt, sx(x), sy(y)); G.restore();
}
function townHomes() { return bldType('house').concat(bldType('barracks')); }
// ходьба всех неписей: у станка — стоят, отдыхают — идут к соседу, свободные — гуляют между домами
function npcMoveTick(dt) {
  const homes = townHomes(), bc = baseCenter();
  for (const w of S.workers) {
    if (w.guard) continue;
    const N = NPC[w.kind] || NPC.human;
    if (w.x == null) { const h = homes[0]; w.x = h ? h.x + 1 : bc.x + rand(-3, 3); w.y = h ? h.y + 2.4 : bc.y + rand(-3, 3); }
    const b = w.at ? S.buildings.get(w.at) : null;
    let friend = null;
    if (w.rest > 0) {
      let bd = 20 * 20;
      for (const o of S.workers) { if (o === w || o.guard || o.x == null) continue; const d = dist2(o.x, o.y, w.x, w.y); if (d < bd) { bd = d; friend = o; } }
      const vs = S.world && S.world.visitor;
      if (vs && vs.race === w.kind) { friend = null; w.tx = vs.x + (w.id % 2 ? 0.9 : -0.9); w.ty = vs.y + 0.3; }
      else if (friend) { w.tx = friend.x + (w.id % 2 ? 0.8 : -0.8); w.ty = friend.y + 0.2; }
    } else if (b) { w.tx = b.x + b.w / 2 + 0.3; w.ty = b.y + b.h + 0.4; }
    else if (w.tx == null || dist(w.x, w.y, w.tx, w.ty) < 0.2 && (w.idle = (w.idle || 0) + dt) > 4) {
      w.idle = 0;
      const h = homes.length ? pick(homes) : null;
      w.tx = h ? h.x + rand(-1, 3) : bc.x + rand(-6, 6); w.ty = h ? h.y + 2 + rand(0, 2) : bc.y + rand(-6, 6);
      if (!walkable(Math.floor(w.tx), Math.floor(w.ty))) { w.tx = w.x; w.ty = w.y; }
    }
    const d = dist(w.x, w.y, w.tx, w.ty);
    w.moving = d > 0.15;
    if (w.moving) { const sp = (N.walk || 1.5) * dt; w.x += (w.tx - w.x) / d * Math.min(sp, d); w.y += (w.ty - w.y) / d * Math.min(sp, d); w.ang = Math.atan2(w.ty - w.y, w.tx - w.x); w.walk = (w.walk || 0) + dt; }
    w.talkT = (w.talkT == null ? rand(5, 20) : w.talkT) - dt;
    if (w.talkT <= 0) {
      w.talkT = w.rest > 0 ? rand(5, 9) : rand(22, 50);
      w.say = npcPickLine(w, friend); w.sayT = 4.5;
      // собеседник отвечает через пару секунд
      if (friend && w.rest > 0 && friend.talkT > 2.5) friend.talkT = rand(2, 2.5);
    }
    if (w.sayT > 0) w.sayT -= dt;
  }
  // беженцы: сами бредут к базе, через минуту-другую уходят
  for (const w of S.strays || []) {
    if (w.sayT > 0) w.sayT -= dt;
    if (w.still) continue; // пленник сидит на месте
    const d = dist(w.x, w.y, bc.x, bc.y);
    if (d > 3) { const sp = 1.6 * dt; const nx = w.x + (bc.x - w.x) / d * sp, ny = w.y + (bc.y - w.y) / d * sp; if (walkable(Math.floor(nx), Math.floor(ny))) { w.x = nx; w.y = ny; w.moving = true; w.walk = (w.walk || 0) + dt; } w.ang = Math.atan2(bc.y - w.y, bc.x - w.x); }
  }
  if (S.strays && S.strays.length) S.strays = S.strays.filter(w => S.time < w.until);
}
function drawNpc(w, t) {
  const N = NPC[w.kind] || NPC.human;
  drawUnit3D(N.unit, w.x, w.y, { ang: w.ang != null ? w.ang : Math.PI / 2, anim: w.moving ? 'run' : 'stance', t: w.moving ? w.walk * 1.2 : t + w.id, scale: 0.9 });
  const a = npcAlpha(w.x, w.y), top = w.kind === 'dwarf' || w.kind === 'goblin' ? 1.05 : 1.35;
  npcLabel(w.name, w.x, w.y - top, '#d8f0ff', a);
  const em = npcEmotion(w);
  if (em) { G.save(); G.globalAlpha = a; G.font = `${Math.round(VIEW.z * 0.34)}px sans-serif`; G.textAlign = 'center'; G.fillText(em, sx(w.x), sy(w.y - top - 0.32)); G.restore(); }
  if (w.sayT > 0 && w.say) {
    // облачко с репликой: крупно и ясно вблизи, еле видно издалека
    G.save();
    G.font = `${Math.round(Math.max(12, VIEW.z * 0.27))}px sans-serif`; G.textAlign = 'center';
    const tw = G.measureText(w.say).width + 14, bh = VIEW.z * 0.46, X = sx(w.x) - tw / 2, Y = sy(w.y - top - 0.72) - bh / 2;
    G.globalAlpha = a * Math.min(1, w.sayT * 2);
    G.fillStyle = 'rgba(255,248,230,0.95)'; G.strokeStyle = 'rgba(40,30,20,0.7)'; G.lineWidth = 1;
    G.beginPath(); G.roundRect(X, Y, tw, bh, 4); G.fill(); G.stroke();
    G.fillStyle = '#2a2018'; G.textBaseline = 'middle'; G.fillText(w.say, sx(w.x), Y + bh / 2);
    G.restore();
  }
}

// ---------- беженцы ----------
function strayDuringEvent() {
  S.strays = S.strays || [];
  if (S.strays.length >= 2 || Math.random() > 0.5) return;
  const h = S.player, a = rand(0, 6.28), kind = pick(['elf', 'dwarf', 'mage', 'human']), N = NPC[kind];
  const f = nearestEPass(h.x + Math.cos(a) * 16, h.y + Math.sin(a) * 16, 8);
  if (!f) return;
  S.strays.push({ id: S.nextId++, kind, name: pick(N.names), x: f.x, y: f.y, until: S.time + 180, stray: true, mood: 30, say: L('Пустите под крышу!'), sayT: 6 });
  log(L`Беженец (${N.name.toLowerCase()}) ищет укрытие от яда. Кликните по нему, пока не поздно — он останется работать.`, 'good');
}
ACT.strayJoin = (id) => {
  const i = (S.strays || []).findIndex(o => o.id === +id);
  if (i < 0) return;
  const s = S.strays.splice(i, 1)[0], w = addWorker(s.kind);
  w.name = s.name; w.free = true; w.x = s.x; w.y = s.y; w.shackled = s.kind === 'orc';
  log(L`${NPC[s.kind].name} ${w.name} остаётся у вас. Назначьте на станок в окне постройки.`, 'good'); sfx('coins');
};
// кого находят в клетках и подземельях
function randomCaptive() { return Math.random() < 0.6 ? 'human' : pick(['elf', 'dwarf', 'mage']); }
