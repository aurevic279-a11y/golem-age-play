'use strict';
// Фракции: лагеря гоблинов и орков, набеги, Тёмные Эльфы и дань, торговцы в чёрных мантиях.

// прочность постройки лагеря: +20% за каждый уровень (раньше +40% и ещё ×1,25 за каждое укрепление — лагеря ломались по 10 минут)
function structHp(kind, lvl) { const d = CAMP_STRUCT[kind]; return d ? Math.round(d.hp * (1 + (lvl - 1) * TUNE.campHpLvl) * TUNE.campHp) : 0; }
// уровень лагеря вырос — постройки крепчают до новой прочности (сколько отбито — столько и остаётся отбитым)
function restrengthCamp(c) {
  for (const s of c.structs) { const m = structHp(s.kind, c.level); if (!m || s.kind === 'portal') continue; if (s.hp > 0) s.hp = Math.max(1, Math.round(s.hp / Math.max(1, s.maxHp) * m)); s.maxHp = m; }
}
function createCamp(l) {
  const lvl = l.type === 'citadel' ? 8 : 1 + Math.floor(Math.hypot(l.x, l.y) / 120);
  const camp = { id: S.nextId++, type: l.type, x: l.x, y: l.y, key: l.key, alive: true, level: lvl, anger: 0, guardT: 0, structs: [] };
  for (const s of l.structs) {
    const d = CAMP_STRUCT[s.kind];
    const hp = structHp(s.kind, lvl);
    camp.structs.push({ x: s.x, y: s.y, kind: s.kind, w: d.w, minor: !!d.minor, hp, maxHp: hp, cd: 0 });
  }
  S.camps.push(camp);
  return camp;
}

function campName(c) {
  return c.type === 'goblin' ? 'Лагерь гоблинов' : c.type === 'orc' ? 'Лагерь орков' : c.type === 'orc_big' ? 'Крепость орков' : c.type === 'citadel' ? 'Цитадель орков' : 'Портал эльфов';
}

function nearestCampStruct(x, y, r, majorOnly) {
  let best = null, bd = r * r;
  for (const c of S.camps) {
    if (!c.alive || Math.abs(c.x - x) > r + 8 || Math.abs(c.y - y) > r + 8) continue;
    for (const s of c.structs) {
      if (s.hp <= 0 || (majorOnly && s.minor)) continue;
      const d = dist2(structCX(s), structCY(s), x, y) - (structW(s) / 2) * (structW(s) / 2);
      if (d < bd) { bd = d; best = s; }
    }
  }
  return best;
}

function damageCampStructs(x, y, r, dmg) {
  for (const c of S.camps) {
    if (!c.alive || Math.abs(c.x - x) > r + 8 || Math.abs(c.y - y) > r + 8) continue;
    for (const s of c.structs) if (s.hp > 0 && dist(structCX(s), structCY(s), x, y) <= r + structW(s) / 2) hitStruct(s, dmg);
  }
}

function campOfStruct(s) { return S.camps.find(c => c.structs.includes(s)); }

// кого винить в ударе по лагерю: героя рядом (до 35 клеток), иначе ближайшую башню игрока
function structAttacker(s) {
  const x = structCX(s), y = structCY(s);
  const h = nearestHero(x, y, 35);
  if (h) return { h };
  const b = nearestBldWhere(x, y, 30, o => BUILDINGS[o.type].kind === 'tower');
  return b ? { b } : null;
}
// тревога в лагере: все его бойцы (и налётчики рядом) идут на обидчика; лагерь чаще зовёт подкрепление
function campAlert(c, who) {
  if (!c || !who) return;
  c.alertT = S.time + 30;
  for (const e of S.enemies) {
    if (e.dead) continue;
    const mine = e.campId === c.id;
    if (!mine && !(e.mode === 'raid' && dist(e.x, e.y, c.x, c.y) < 25)) continue;
    if (!mine && dist(e.x, e.y, c.x, c.y) > 25) continue;
    e.alertT = S.time + 25; e.alertH = who.h || null; e.alertB = who.b ? who.b.id : null;
    if (e.alertT && (e.think > 0.3)) e.think = rand(0, 0.3);
  }
}
// из разрушенного жилья выбегают его обитатели
const STRUCT_DWELLERS = { hut: 2, ghut: 3, tent: 2, otent: 3, warhall: 4, keep: 5, watchtower: 2 };
function spawnDwellers(c, s, who) {
  const n = STRUCT_DWELLERS[s.kind];
  if (!n || !c || c.type === 'elf') return;
  const pool = c.type === 'goblin' ? ['goblin', 'goblin', 'goblin_archer'] : c.type === 'citadel' ? ['orc_berserk', 'orc_brute', 'orc_thrower'] : ['orc_brute', 'orc_thrower', 'orc_brute', 'orc_shaman'];
  for (let i = 0; i < n; i++) {
    const t = pick(pool);
    const e = spawnEnemy(t, structCX(s) + rand(-0.8, 0.8), structCY(s) + rand(-0.8, 0.8), 'guard', { campId: c.id });
    e.hp = e.maxHp = Math.round(e.maxHp * (1 + (c.level - 1) * 0.2));
    if (who) { e.alertT = S.time + 25; e.alertH = who.h || null; e.alertB = who.b ? who.b.id : null; }
  }
}

function hitStruct(s, dmg) {
  if (s.hp <= 0) return;
  s.hp -= dmg;
  s.flash = 0.12;
  const c = campOfStruct(s);
  let who = null;
  if (c) {
    c.lastHit = S.time;
    // игрок бьёт постройку — враги всегда замечают и идут на него (не чаще раза в 2 с)
    if (S.time - (c.alertAt || -99) > 2) { c.alertAt = S.time; who = structAttacker(s); campAlert(c, who); }
  }
  if (s.hp <= 0) {
    if (c && !s.minor) spawnDwellers(c, s, who || structAttacker(s));
    s.hp = 0;
    spawnDebris(structCX(s), structCY(s), structW(s), s.kind);
    sfx('crash', s.x, s.y);
    if (structW(s) > 1) shake(2);
    if (s.kind === 'cage') {
      addWorker('human');
      log('Из клетки освобождён человек! Он может стать управляющим (окно «Рабочие», Y).', 'good');
    }
    if (c && c.structs.every(t => t.hp <= 0 || t.minor)) campDestroyed(c);
  }
}

function campDestroyed(c) {
  c.alive = false;
  const inv = S.player.inv;
  const loot = {};
  const L = c.level;
  if (c.type === 'goblin') { loot.iron = randi(20, 40) * L; loot.copper = randi(10, 25) * L; loot.gem = randi(1, 2) * L; if (Math.random() < 0.08) loot.relic = 1; }
  else if (c.type === 'orc') { loot.steel = randi(8, 15) * L; loot.iron = randi(30, 50) * L; loot.gem = randi(2, 4) * L; if (Math.random() < 0.2) loot.relic = 1; }
  else if (c.type === 'orc_big') { loot.steel = randi(20, 40) * L; loot.gem = randi(5, 8) * L; loot.relic = randi(1, 2); if (L >= 2) loot.mithril = randi(5, 15) * (L - 1); }
  else if (c.type === 'citadel') { loot.mithril = randi(50, 80); loot.gem = randi(30, 50); loot.relic = randi(3, 5); loot.clockwork = randi(4, 8); loot.steel = randi(150, 250); S.stats.citadels = (S.stats.citadels || 0) + 1; }
  else if (c.type === 'elf') { loot.mithril = randi(3, 8); loot.gem = randi(2, 5); }
  for (const id in loot) if (!loot[id]) delete loot[id];
  inv.addAll(loot);
  const parts = Object.keys(loot).map(id => `${ITEMS[id].name} ×${loot[id]}`).join(', ');
  log(`${campName(c)} уничтожен! Добыча: ${parts || 'ничего'}`, 'good');
  S.stats.camps = (S.stats.camps || 0) + 1;
  if (c.type === 'citadel') { addWorker('orc'); addWorker('orc'); log('Цитадель пала! Захвачены два орка-раба. Осталось цитаделей на краю карты: ' + (4 - (S.stats.citadels || 0) > 0 ? 4 - S.stats.citadels : 'ни одной из первых четырёх') + '.', 'good'); }
  else if ((c.type === 'orc' && Math.random() < 0.4) || (c.type === 'orc_big' && Math.random() < 0.6)) {
    addWorker('orc');
    log('Захвачен орк-раб! Наденьте на него кандалы (окно «Рабочие», Y).', 'good');
  }
  // охрана лагеря разбегается
  for (const e of S.enemies) if (e.campId === c.id && e.mode === 'guard') e.mode = 'raid';
  sfx('victory');
}

// сторожевые башни лагерей обстреливают героев (и гостей совместной игры): стреляют с упреждением,
// стрела доворачивает за целью — по стоящему попадает всегда, от бегущего можно увернуться только рывком
function updateCampTowers(dt) {
  const heroes = heroList().filter(h => !(h.dead > 0));
  if (!heroes.length) return;
  for (const c of S.camps) {
    if (!c.alive || !heroes.some(h => Math.abs(c.x - h.x) < 30 && Math.abs(c.y - h.y) < 30)) continue;
    for (const s of c.structs) {
      const t = CAMP_STRUCT[s.kind].tower;
      if (!t || s.hp <= 0) continue;
      s.cd = (s.cd || 0) - dt;
      if (s.cd > 0) continue;
      const tx = structCX(s), ty = structCY(s);
      let h = null, bd = t.range * t.range;
      for (const o of heroes) { const d2 = dist2(tx, ty, o.x, o.y); if (d2 <= bd) { bd = d2; h = o; } }
      if (!h) continue;
      s.cd = t.cd;
      // упреждение по скорости героя (по смещению за прошлый выстрел этой башни)
      const vx = h.x - (h._tlx != null ? h._tlx : h.x), vy = h.y - (h._tly != null ? h._tly : h.y);
      h._tlx = h.x; h._tly = h.y;
      const fly = Math.sqrt(bd) / 14, k = Math.min(1, fly / Math.max(0.2, t.cd));
      spawnProj({ x: tx, y: ty - 1.4, tx: h.x + vx * k, ty: h.y - 0.3 + vy * k, dmg: t.dmg * (1 + (c.level - 1) * 0.4), aoe: 0, from: 'e', kind: 'arrow', speed: 14, track: h });
      sfx('shoot', tx, ty);
    }
  }
}

// центр базы — среднее положение построек
// центр базы: только свои постройки на поверхности (без входов в пещеры и сундуков подземелий); кэш до стройки/сноса
const BASE_C = { v: -1, s: null, c: null };
function baseCenter() {
  if (BASE_C.v === BLD_VER && BASE_C.s === S && BASE_C.c) return BASE_C.c;
  let sx = 0, sy = 0, n = 0;
  for (const b of S.buildings.values()) { if (BUILDINGS[b.type].hidden || inDungeonY(b.y)) continue; sx += b.x; sy += b.y; n++; }
  BASE_C.v = BLD_VER; BASE_C.s = S;
  BASE_C.c = n ? { x: sx / n, y: sy / n } : { x: S.spawn.x, y: S.spawn.y };
  return BASE_C.c;
}

function dirName(dx, dy) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  const names = ['востока', 'юго-востока', 'юга', 'юго-запада', 'запада', 'северо-запада', 'севера', 'северо-востока'];
  return names[(Math.round(a / 45) + 8) % 8];
}

// лагерь у базы со временем укрепляется: уровень +1 (не выше 6), постройки крепче
function upgradeCamp(bc) {
  const cap = Math.min(5, 2 + Math.floor((S.evo || 0) * 3));
  const cand = S.camps.filter(c => c.alive && (c.type === 'goblin' || c.type === 'orc' || c.type === 'orc_big') && c.level < cap && dist(c.x, c.y, bc.x, bc.y) < 300);
  if (!cand.length) return;
  const c = pick(cand);
  c.level++;
  restrengthCamp(c);
  log(`${campName(c)} на ${dirName(c.x - bc.x, c.y - bc.y)} укрепился: уровень ${c.level}. Его охрана и набеги стали сильнее.`, 'warn');
}
// новая стоянка рядом с существующим лагерем
function expandCamp() {
  const bc = baseCenter();
  // родитель — один из трёх ближайших к базе лагерей (до 450 клеток); новая стоянка — в сторону базы
  const parents = S.camps.filter(c => c.alive && c.type !== 'elf' && c.type !== 'citadel' && dist(c.x, c.y, bc.x, bc.y) < 450)
    .sort((a, b) => dist2(a.x, a.y, bc.x, bc.y) - dist2(b.x, b.y, bc.x, bc.y)).slice(0, 3);
  if (!parents.length) return;
  const par = pick(parents);
  const toBaseA = Math.atan2(bc.y - par.y, bc.x - par.x);
  for (let tries = 0; tries < 24; tries++) {
    const a = toBaseA + rand(-1.1, 1.1), r = rand(28, 48);
    const x = Math.round(par.x + Math.cos(a) * r), y = Math.round(par.y + Math.sin(a) * r);
    if (dist(x, y, bc.x, bc.y) < 45) continue;
    let near = false;
    for (const b of S.buildings.values()) if (dist2(b.x, b.y, x, y) < 35 * 35) { near = true; break; }
    if (near || S.camps.some(c => c.alive && dist2(c.x, c.y, x, y) < 20 * 20)) continue;
    let ok = true;
    for (let yy = y - 3; yy <= y + 3 && ok; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (isWater(xx, yy) || bldAt(xx, yy)) { ok = false; break; }
    if (!ok) continue;
    for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) { const c = chunkOf(xx, yy), i = tidx(xx, yy); if (c.res[i] === RES_ID.tree) c.trees--; if (c.res[i] && c.res[i] !== RES_ID.mount) { c.res[i] = 0; c.modified = true; c.netv = (c.netv || 0) + 1; if (c.canvas) { c.oldCanvas = c.canvas; c.canvas = null; } } }
    const gob = par.type === 'goblin';
    const structs = gob
      ? [{ kind: 'ghut', x: x - 2, y: y - 2 }, { kind: 'hut', x: x + 1, y: y - 2 }, { kind: 'hut', x: x - 2, y: y + 1 }, { kind: 'bonfire', x, y }, { kind: 'gtotem', x: x + 2, y: y + 1 }]
      : [{ kind: 'otent', x: x - 2, y: y - 2 }, { kind: 'tent', x: x + 1, y: y - 2 }, { kind: 'tent', x: x - 2, y: y + 1 }, { kind: 'bonfire', x, y }, { kind: 'totem', x: x + 2, y: y + 1 }];
    const camp = createCamp({ type: gob ? 'goblin' : 'orc', x, y, key: 'exp' + S.nextId, structs });
    camp.level = par.level;
    const dB = Math.round(dist(x, y, bc.x, bc.y));
    // близко к базе — разведчики замечают её, и через минуту стоянка идёт в набег
    if (dB < 150) camp.raidAt = S.time + 60;
    log(`${gob ? 'Гоблины' : 'Орки'} основали новую стоянку на ${dirName(x - bc.x, y - bc.y)} — в ${dB} клетках от базы.${dB < 150 ? ' Их разведчики уже заметили вашу базу!' : ''}`, 'warn');
    return;
  }
}
// ---------- дозорные ----------
// 2–4 часовых ходят кольцом вокруг лагеря. Заметив героя, дозорный 6 секунд поднимает тревогу (над ним «!»);
// убили раньше — тревоги нет. Тревога: лагерь крепнет (уровень +1, больше охраны) и весь идёт на героя.
const SENTRY_ALARM = 6;
function campSentries(c) {
  if (c.sentryT != null && S.time < c.sentryT) return;
  c.sentryT = S.time + 240; // раз в 4 минуты пополняются
  const have = S.enemies.filter(e => e.campId === c.id && e.sentry && !e.dead).length;
  const want = Math.min(4, 2 + Math.floor(c.level / 2));
  const R = campRadius(c) + 6;
  for (let i = have; i < want; i++) {
    const a = rand(0, 6.28);
    const t = c.type === 'goblin' ? (i % 2 ? 'goblin_archer' : 'goblin') : c.type === 'elf' ? null : (i % 2 ? 'orc_thrower' : 'orc_brute');
    if (!t) return;
    const e = spawnEnemy(t, c.x + Math.cos(a) * R, c.y + Math.sin(a) * R, 'guard', { campId: c.id, sentry: true, sentryA: a });
    e.hp = e.maxHp = Math.round(e.maxHp * (1 + (c.level - 1) * 0.3));
  }
}
function sentryTick(e, dt) {
  if (!e.sentry || e.alarmed) return;
  const h = nearestHero(e.x, e.y, 10);
  if (h) e.alarmK = (e.alarmK || 0) + dt / SENTRY_ALARM;
  else if (e.alarmK > 0) e.alarmK = Math.max(0, e.alarmK - dt / SENTRY_ALARM / 2);
  if (e.alarmK >= 1) {
    e.alarmed = true; e.alarmK = 1;
    const c = S.camps.find(x => x.id === e.campId);
    if (!c || !c.alive) return;
    campAlert(c, { h: h || nearestHero(e.x, e.y, 30) });
    // лагерь крепнет не чаще раза в 8 минут
    if (S.time - (c.alarmAt || -9999) > 480) {
      c.alarmAt = S.time;
      c.alarmLvl = Math.min(3, (c.alarmLvl || 0) + 1);
      if (c.level < 6) { c.level++; restrengthCamp(c); }
      c.guardT = 0;
      log(`Дозорный поднял тревогу! ${campName(c)} усилился (уровень ${c.level}) и идёт на вас. Убивайте часовых быстро — пока горит «!».`, 'warn');
      sfx('alarm');
    }
  }
}

// одновременно на базу идёт не больше RAID_CAP врагов: набеги, осады и орды от загрязнения делят этот предел
const RAID_CAP = 45;
function raidersNow() { let n = 0; for (const e of S.enemies) if (e.mode === 'raid' && !e.dead) n++; return n; }
function sendRaid(camp, strength, reason) {
  const room = RAID_CAP - raidersNow();
  if (room < 4 || S.enemies.length > 200) return;
  // между набегами — не меньше 4 минут (охрана осады идёт вместе с машинами всегда)
  const siege = reason && reason.startsWith('⚔');
  if (!siege && S.time - (S.lastRaidAt || -9999) < TUNE.raidGap) return;
  S.lastRaidAt = S.time;
  const t = S.time / 60;
  let comp = [];
  if (camp.type === 'goblin') {
    const n = Math.min(Math.round(18 * Math.max(1, TUNE.raidSize)), room, Math.round((2 + t / 20) * strength * TUNE.raidSize));
    for (let i = 0; i < n; i++) comp.push(S.evo > 0.3 && Math.random() < 0.15 ? 'goblin_chief' : Math.random() < 0.25 ? 'goblin_archer' : 'goblin');
  } else {
    const n = Math.min(Math.round(15 * Math.max(1, TUNE.raidSize)), room, Math.round((2 + t / 28) * strength * TUNE.raidSize * (camp.type === 'orc_big' ? 1.3 : camp.type === 'citadel' ? 1.7 : 1)));
    for (let i = 0; i < n; i++) { const r = Math.random(); comp.push(S.evo > 0.5 && Math.random() < 0.15 ? 'orc_berserk' : r < 0.5 ? 'orc_brute' : r < 0.85 ? 'orc_thrower' : 'orc_shaman'); }
  }
  // треть набега — диверсанты: идут не на стены, а на конвейеры, валы и заправщиков на окраинах
  for (const type of comp) spawnEnemy(type, camp.x + rand(-2, 2), camp.y + rand(-2, 2), 'raid', { campId: camp.id, sab: Math.random() < 0.33 && !ENEMIES[type].siege });
  const bc = baseCenter();
  log(`${reason || 'Набег'}: ${comp.length} врагов идут с ${dirName(camp.x - bc.x, camp.y - bc.y)} (${campName(camp)}). Часть — диверсанты: целятся в конвейеры и заправщиков.`, 'warn');
  sfx('alarm');
  S.lastRaid = { x: camp.x, y: camp.y, t: S.time };
}

function updateCamps() {
  const bc = baseCenter(), p = S.player;
  // эволюция врагов: растёт со временем, от загрязнения и от разорённых лагерей
  S.evo = clamp((S.time / 18000 + (S.pollTotal || 0) / 40000 + (S.stats.camps || 0) * 0.015) * TUNE.evo, 0, 1);
  S.enemyScale = 1 + S.evo; // к концу эволюции враги вдвое крепче (раньше — в 2,6 раза)
  const evoStep = Math.floor(S.evo * 10);
  if (evoStep > (S.evoShown || 0)) { S.evoShown = evoStep; if (evoStep >= 3) log(`Эволюция врагов: ${evoStep * 10}%. Гоблины и орки стали крепче${evoStep >= 5 ? ', в набегах появились берсерки' : evoStep >= 3 ? ', в набегах появились вожаки' : ''}.`, 'warn'); }
  siegeTick();
  // расширение: лагеря основывают новые стоянки
  S.expandT = (S.expandT == null ? 1500 : S.expandT) - 1;
  if (S.expandT <= 0) { S.expandT = rand(TUNE.expandMin, TUNE.expandMax) * (1.3 - S.evo * 0.6); expandCamp(); }
  S.upgT = (S.upgT == null ? 900 : S.upgT) - 1;
  if (S.upgT <= 0) { S.upgT = TUNE.upgrade * rand(0.8, 1.2); upgradeCamp(bc); }
  S.pollutedCamps = 0;
  for (const c of S.camps) {
    if (!c.alive || c.type === 'elf') continue;
    const dBase = dist(c.x, c.y, bc.x, bc.y);
    const hero = nearestHero(c.x, c.y, 70);
    // дозорные вокруг лагеря: заметив героя, поднимают тревогу, если их не убить быстро
    if (hero && c.type !== 'citadel') campSentries(c);
    const alerted = c.alertT > S.time;
    // охрана, когда Анимансер рядом; под атакой подкрепление подходит в полтора раза чаще и его немного больше
    if (hero && dist(hero.x, hero.y, c.x, c.y) < (alerted ? 32 : 22)) {
      c.guardT -= alerted ? 1.5 : 1;
      if (c.guardT <= 0) {
        // охрана подходит реже, а с каждой разрушенной постройкой её становится меньше
        c.guardT = TUNE.guardT * (c.type === 'goblin' ? 1.07 : 0.93);
        const alive = S.enemies.filter(e => e.campId === c.id && e.mode === 'guard' && !e.sentry).length;
        const main = c.structs.filter(s => !s.minor);
        const left = main.filter(s => s.hp > 0).length / Math.max(1, main.length);
        if (alive < Math.ceil((3 + c.level * 2) * Math.max(left, alerted ? 0.5 : 0) * (alerted ? 1.2 : 1) + (c.alarmLvl || 0))) {
          const grp = c.type === 'goblin' ? ['goblin', 'goblin', 'goblin', 'goblin_archer'] : c.type === 'orc' ? ['orc_brute', 'orc_brute', 'orc_thrower'] : c.type === 'citadel' ? ['orc_berserk', 'orc_berserk', 'orc_brute', 'orc_brute', 'orc_shaman', 'orc_thrower', 'orc_thrower', 'goblin_chief'] : ['orc_brute', 'orc_brute', 'orc_shaman', 'orc_thrower', 'orc_thrower'];
          for (const t of grp) {
            const e = spawnEnemy(t, c.x + rand(-2, 2), c.y + rand(-2, 2), 'guard', { campId: c.id });
            e.hp = e.maxHp = Math.round(ENEMIES[t].hp * (1 + (c.level - 1) * 0.25));
            if (alerted) { e.alertT = S.time + 25; e.alertH = hero; }
          }
        }
      }
    }
    if (c.raidAt && S.time >= c.raidAt) { c.raidAt = null; sendRaid(c, 0.5, 'Новая стоянка нападает'); }
    if (dBase > 320) continue;
    // загрязнение злит лагерь
    const pol = pollutionAt(c.x, c.y);
    c.polluted = pol > TUNE.polAnger;
    if (c.polluted) {
      S.pollutedCamps++;
      c.anger += Math.min(pol, 3);
      // не чаще раза в 10 минут с лагеря и раза в 5 минут со всех лагерей вместе
      if (c.anger >= 450 && S.time >= (c.nextWave || 0) && S.time - (S.lastPolWave || -999) >= TUNE.polWaveAll) {
        c.anger = 0;
        c.nextWave = S.time + TUNE.polWaveCamp;
        S.lastPolWave = S.time;
        sendRaid(c, Math.min(3, 1.3 + pol * 0.2), 'Загрязнение разъярило лагерь — сильная орда');
      }
    } else c.anger = Math.max(0, c.anger - 0.5);
  }
  // обычные набеги
  // ночью гоблины и орки собираются в набеги почти вдвое быстрее
  const night = isNight();
  // чем дымнее у базы, тем чаще (до трёх раз)
  const smoke = 1 + Math.min(0.5, pollutionAt(bc.x, bc.y) / 4 + (S.pollutedCamps || 0) * 0.05);
  S.raidT -= (night ? 1.5 : 1) * (1 + (smoke - 1) * 0.5);
  if (S.raidT <= 0) {
    S.raidT = rand(TUNE.raidMin, TUNE.raidMax);
    let best = null, bd = 450;
    for (const c of S.camps) {
      if (!c.alive || c.type === 'elf' || c.type === 'citadel') continue;
      const d = dist(c.x, c.y, bc.x, bc.y);
      if (d < bd) { bd = d; best = c; }
    }
    // без загрязнения — небольшой набег; чем дымнее, тем крупнее; дальние лагеря шлют чуть меньше
    const str = 0.45 * smoke * (night ? 1.3 : 1) * (bd > 260 ? 0.8 : 1);
    if (best && S.buildings.size > 3) sendRaid(best, str, night ? 'Ночной набег' : 'Набег');
  }
  // набежало больше предела (старые сейвы) — самые дальние от базы отступают
  { const raiders = S.enemies.filter(e => e.mode === 'raid' && !e.dead && !ENEMIES[e.type].siege);
    if (raiders.length > RAID_CAP + 10) {
      raiders.sort((a, b) => dist2(b.x, b.y, bc.x, bc.y) - dist2(a.x, a.y, bc.x, bc.y));
      for (const e of raiders.slice(0, raiders.length - RAID_CAP)) e.dead = true;
    } }
  // далёкие враги без цели исчезают
  if (S.enemies.length > 400) S.enemies = S.enemies.filter(e => dist(e.x, e.y, p.x, p.y) < 150 || e.mode === 'elf');
}

// ---------- Тёмные Эльфы ----------
function wealth() {
  let w = 0;
  const val = (cost) => { let s = 0; for (const id in cost) s += (ITEMS[id] ? ITEMS[id].value : 1) * cost[id]; return s; };
  for (const b of S.buildings.values()) w += val(BUILDINGS[b.type].cost);
  for (const g of S.golems) w += val(BUILDINGS[g.type].cost);
  w += val(S.player.inv.c) * 0.5;
  return Math.round(w);
}

// Дань — налог с исследований: эльфы требуют долю фолиантов, произведённых со времени прошлой дани
// (12% и +2% за каждую уплату, до 25%). Не производите фолианты — берут золото и самые редкие ресурсы со складов:
// чем реже и ценнее ресурс, тем охотнее его требуют.
const FOLIOS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
// неуплата навсегда поднимает ставку на 5% (до 50%)
function tributeShare() { return Math.min(0.5, Math.min(0.25, 0.12 + S.elves.paid * 0.02) + (S.elves.penalty || 0)); }
// заказ эльфов — второй вариант дани: доставить партию того, что вы уже производите (≈ 8 минут выработки, чем ценнее — тем охотнее)
// заказ: партия того, что завод производит, но по цене не дешевле налога ценностями (никаких «13 камней»)
function makeOrder(minValue) {
  const R = statRates(1).P, cand = [];
  for (const id in S.stats.made) {
    const it = ITEMS[id];
    if (!it || it.bld || FOLIOS.includes(id) || id === 'relic' || id === 'gem' || !(S.stats.made[id] > 0)) continue;
    const rate = R[id] || 0;
    if (rate < 0.5) continue;
    cand.push({ id, rate, w: (it.value || 1) });
  }
  if (!cand.length) return { stone: Math.max(200, Math.ceil((minValue || 0) / itemPrice('stone') / 10) * 10) };
  let tot = cand.reduce((a, c) => a + c.w, 0), r = Math.random() * tot, c = cand[0];
  for (const x of cand) { r -= x.w; if (r <= 0) { c = x; break; } }
  let n = Math.max(20, Math.ceil(c.rate * 8 * (1 + S.elves.paid * 0.05) / 10) * 10);
  if (minValue) n = Math.max(n, Math.ceil(minValue / itemPrice(c.id) / 10) * 10);
  return { [c.id]: n };
}
function folioSnap() { const o = {}; for (const f of FOLIOS) o[f] = S.stats.made[f] || 0; return o; }
function stockTotal() {
  const inv = new Inv(1e12);
  for (const b of S.buildings.values()) if (b.inv && BUILDINGS[b.type].kind === 'chest') for (const id in b.inv.c) inv.add(id, b.inv.c[id]);
  for (const id in S.player.inv.c) inv.add(id, S.player.inv.c[id]);
  return inv;
}
function makeDemand() {
  const e = S.elves, share = tributeShare(), snap = e.snap || {}, items = {};
  for (const f of FOLIOS) {
    const made = (S.stats.made[f] || 0) - (snap[f] || 0);
    if (made >= 5) items[f] = Math.ceil(made * share);
  }
  if (!Object.keys(items).length) {
    // фолиантов нет — ценности со складов: вес = ценность², т.е. редкое хотят сильнее
    const st = stockTotal(), cand = [];
    for (const id in st.c) {
      const it = ITEMS[id], n = st.c[id];
      if (!it || it.bld || id === 'relic' || n < 10 || (it.value || 1) < 2) continue;
      cand.push({ id, n, w: (it.value || 1) * (it.value || 1) });
    }
    const gold = cand.find(c => c.id === 'gold');
    // без случайности: самое ценное и редкое — первым (так алтарь может заранее показать, что попросят)
    cand.sort((a, b) => b.w - a.w);
    const pickW = () => cand.shift();
    const chosen = [];
    if (gold) chosen.push(cand.splice(cand.indexOf(gold), 1)[0]);
    while (chosen.length < 2 && cand.length) chosen.push(pickW());
    for (const c of chosen) items[c.id] = Math.max(5, Math.ceil(c.n * share * 1.5 / 5) * 5);
  }
  if (!Object.keys(items).length) items.wood = 30;
  // налог не меньше планки дани: если набралось мало — пропорционально больше того же
  { let v = 0; for (const id in items) v += itemPrice(id) * items[id];
    const k = tributeFloor() / 1.3 / Math.max(1, v);
    if (k > 1) for (const id in items) items[id] = Math.ceil(items[id] * k / 5) * 5; }
  if (S.time > 6 * 3600 && e.paid % 3 === 2) items.relic = 1;
  return items;
}

// третий способ: ценностями — самоцветы, мифрил, реликвии на сумму налога (с наценкой 30%)
const VALUABLES = ['gem', 'mithril', 'relic'];
function tributeWorthy(id) { return VALUABLES.includes(id); }
// нижняя планка дани растёт с каждой уплатой: 100 + 30 за каждую (после 20 даней — 700, это ~9 самоцветов), не больше 3000
function tributeFloor() { return Math.min(3000, TUNE.tribBase + TUNE.tribStep * (S.elves.paid || 0)); }
function demandValue(items) { let v = 0; for (const id in items) v += itemPrice(id) * items[id]; return Math.max(tributeFloor(), Math.ceil(v * 1.3 / 10) * 10); }
// что именно возьмут ценностями из запаса inv: сначала самоцветы, потом мифрил, потом реликвии (недоплаты нет, переплата — до одной штуки)
function valuablesPlan(inv, need) {
  const plan = {};
  let left = need;
  for (const id of VALUABLES) {
    if (left <= 0) break;
    const v = itemPrice(id), n = Math.min(inv.count(id), Math.ceil(left / v));
    if (n > 0) { plan[id] = n; left -= n * v; }
  }
  return left <= 0 ? plan : null;
}
function valuablesWorth(inv) { return VALUABLES.reduce((a, id) => a + inv.count(id) * itemPrice(id), 0); }
function altarTotal() {
  const inv = new Inv(1e9);
  for (const b of S.buildings.values()) if (BUILDINGS[b.type].sub === 'altar') for (const id in b.inv.c) inv.add(id, b.inv.c[id]);
  return inv;
}

function payFromSources(items, usePlayer) {
  // сам по сроку — только с алтарей; вручную — алтари, потом инвентарь, потом любые сундуки
  const have = usePlayer ? stockTotal() : altarTotal();
  for (const id in items) if (have.count(id) < items[id]) return false;
  const chests = [...S.buildings.values()].filter(b => b.inv && BUILDINGS[b.type].kind === 'chest');
  chests.sort((a, b) => (BUILDINGS[b.type].sub === 'altar') - (BUILDINGS[a.type].sub === 'altar'));
  for (const id in items) {
    let need = items[id];
    for (const b of chests) {
      if (need <= 0 || !usePlayer && BUILDINGS[b.type].sub !== 'altar') break;
      need -= b.inv.remove(id, need);
      if (usePlayer && need > 0 && BUILDINGS[b.type].sub === 'altar') need -= S.player.inv.remove(id, need);
    }
    if (usePlayer && need > 0) S.player.inv.remove(id, need);
  }
  return true;
}

function updateElves() {
  const e = S.elves;
  if (e.defeated) return;
  if (!e.demand && !e.final && S.time >= e.next) {
    const items = makeDemand();
    const value = demandValue(items);
    e.demand = { items, order: makeOrder(value), value, start: S.time, deadline: S.time + TUNE.tribTime };
    const p = S.player;
    S.envoy = { x: p.x + 3, y: p.y - 2, until: S.time + 360 };
    log('Посланник Тёмных Эльфов требует дань! Откройте окно дани (клик по посланнику или по таймеру справа).', 'elf');
    sfx('elf');
    openElfWin();
  }
  if (e.demand && S.time >= e.demand.deadline) {
    // к сроку эльфы сами берут с алтаря: налог, заказ или ценности на ту же сумму
    const vp = valuablesPlan(altarTotal(), e.demand.value || demandValue(e.demand.items));
    if (payFromSources(e.demand.items, false) || e.demand.order && payFromSources(e.demand.order, false) || vp && payFromSources(vp, false)) tributePaid(true);
    else refuseTribute();
  }
  if (S.envoy && (S.time > S.envoy.until || !e.demand)) S.envoy = null;
  // порталы карательных отрядов
  for (const c of S.camps) {
    if (c.type !== 'elf' || !c.alive) continue;
    c.spawnT -= 1;
    if (c.spawnT <= 0 && (c.blades > 0 || c.mages > 0 || c.lord)) {
      c.spawnT = c.final ? 4 : 6;
      const s = c.structs[0];
      // каратели уходят через 4 минуты, Великий штурм — до конца
      const extra = c.final ? {} : { leaveAt: S.time + 180 };
      for (let k = 0; k < (c.final ? 3 : 2); k++) {
        if (c.blades > 0 && (Math.random() < 0.7 || c.mages <= 0)) { c.blades--; spawnEnemy('elf_blade', s.x + 1 + rand(-1, 1), s.y + 1 + rand(-1, 1), 'elf', extra); }
        else if (c.mages > 0) { c.mages--; spawnEnemy('elf_mage', s.x + 1 + rand(-1, 1), s.y + 1 + rand(-1, 1), 'elf', extra); }
      }
      if (c.lord && S.time - c.born > 50) {
        c.lord = false;
        const L = spawnEnemy('elf_lord', s.x + 1, s.y + 1, 'elf');
        L.hp = L.maxHp = ENEMIES.elf_lord.hp;
        log('ВЛАДЫКА ТЁМНЫХ ЭЛЬФОВ вступил в бой!', 'elf');
        sfx('elf'); shake(6);
      }
    }
    if (c.blades <= 0 && c.mages <= 0 && !c.lord && !c.final && S.time - c.born > 150) {
      c.alive = false;
      log('Портал эльфов закрылся.', 'elf');
    }
  }
  let left = 0;
  // база разорена (почти нет построек, конвейеры и стены не в счёт) — каратели уходят через 10 секунд, а не караулят возрождение
  let standing = 0;
  for (const b of S.buildings.values()) { const k = BUILDINGS[b.type].kind; if (k !== 'belt' && k !== 'wall' && k !== 'pipe' && k !== 'road' && k !== 'deco' && k !== 'spikes' && k !== 'shaft') standing++; }
  const ruined = standing < 4;
  for (const en of S.enemies) {
    if (en.mode === 'elf' && en.leaveAt && ruined) en.leaveAt = Math.min(en.leaveAt, S.time + 10);
    if (en.leaveAt && S.time > en.leaveAt && !en.dead) { en.dead = true; left++; spawnBurst(en.x, en.y, '#a040ff', 8); }
  }
  if (left && S.time - (S.lastLeaveMsg || -999) > 60) { S.lastLeaveMsg = S.time; log('Карательный отряд эльфов ушёл через портал.', 'elf'); }
}

function tributePaid(auto) {
  const e = S.elves;
  e.paid++;
  e.next = (e.demand && e.demand.start != null ? e.demand.start : S.time) + TUNE.tribEvery;
  e.demand = null;
  e.snap = folioSnap();
  S.envoy = null;
  log(auto ? 'Дань взята с алтаря. Эльфы довольны… пока.' : 'Дань уплачена. Эльфы довольны… пока.', 'elf');
  closeWin('elf');
  sfx('coins');
}

function refuseTribute() {
  const e = S.elves;
  e.refusals++;
  e.penalty = Math.min(0.25, (e.penalty || 0) + 0.05);
  e.next = (e.demand && e.demand.start != null ? e.demand.start : S.time) + TUNE.tribEvery;
  e.demand = null;
  e.snap = folioSnap();
  S.envoy = null;
  closeWin('elf');
  const h = S.time / 3600;
  spawnPortal(2 + e.refusals * 2 + Math.floor(h * 2), e.refusals + Math.floor(h), false);
  log(`Дань не уплачена! Карательный отряд идёт громить базу, а ставка дани навсегда выросла до ${Math.round(tributeShare() * 100)}%.`, 'elf');
  sfx('elf');
}

function spawnPortal(blades, mages, final, angle) {
  const bc = baseCenter();
  const a = angle != null ? angle : rand(0, Math.PI * 2);
  let x = 0, y = 0;
  for (let r = 30; r < 60; r += 2) {
    x = Math.round(bc.x + Math.cos(a) * r); y = Math.round(bc.y + Math.sin(a) * r);
    if (walkable(x, y) && walkable(x + 1, y + 1) && !bldAt(x, y)) break;
  }
  const hp = Math.round(CAMP_STRUCT.portal.hp * (final ? 3 : 1 + e_h()));
  const c = { id: S.nextId++, type: 'elf', x: x + 1, y: y + 1, alive: true, level: 1, anger: 0, structs: [{ x, y, kind: 'portal', hp, maxHp: hp, big: true }],
    blades, mages, lord: false, final: !!final, spawnT: 8, born: S.time };
  S.camps.push(c);
  explore(x, y, 6);
  return c;
}
function e_h() { return S.time / 3600 * 0.3; }

function startFinalWar() {
  const e = S.elves;
  if (!S.research.done.includes('overthrow')) return;
  e.final = true;
  e.demand = null;
  S.envoy = null;
  const base = rand(0, Math.PI * 2);
  for (let k = 0; k < 3; k++) {
    const c = spawnPortal(40, 14, true, base + k * Math.PI * 2 / 3);
    if (k === 0) c.lord = true;
  }
  log('Вы отказались от дани навсегда. ВЕЛИКИЙ ШТУРМ ТЁМНЫХ ЭЛЬФОВ НАЧАЛСЯ!', 'elf');
  sfx('elf'); shake(8);
  closeWin('elf');
}

function onLordKilled() {
  const e = S.elves;
  e.defeated = true;
  e.final = false;
  for (const c of S.camps) if (c.type === 'elf') c.alive = false;
  for (const en of S.enemies) if (en.type.startsWith('elf')) { en.dead = true; spawnBurst(en.x, en.y, '#a040ff', 6); }
  S.victoryTime = S.time;
  log('Владыка повержен! Господство Тёмных Эльфов свергнуто!', 'good');
  sfx('victory');
  setTimeout(showVictory, 1500);
}

// ---------- торговцы ----------
function updateMerchant() {
  const m = S.merchant;
  if (m && S.time > m.until) { S.merchant = null; log('Торговец в чёрной мантии исчез так же внезапно, как появился.'); closeWin('merchant'); }
  if (!S.merchant && S.time >= S.nextMerchant) {
    S.nextMerchant = S.time + rand(25, 40) * 60;
    const bc = baseCenter();
    let x = bc.x + rand(-5, 5), y = bc.y + rand(-5, 5);
    for (let i = 0; i < 20 && !walkable(Math.floor(x), Math.floor(y)); i++) { x += rand(-3, 3); y += rand(-3, 3); }
    S.merchant = { x, y, until: S.time + 300, offers: makeOffers() };
    log('На базу пришёл Торговец в чёрной мантии. Кликните по нему, чтобы поторговать.', 'good');
    sfx('elf');
  }
  // квесты
  for (const q of S.quests) {
    if (q.done) continue;
    if (S.time > q.deadline) { q.done = true; q.failed = true; log('Задание провалено: ' + q.desc, 'warn'); }
    else if (q.kind === 'camps' && (S.stats.camps || 0) - q.base >= q.n) completeQuest(q);
  }
  S.quests = S.quests.filter(q => !q.done || S.time - q.deadline < 30);
}

// цены и награды торговца с множителем из админ-меню (не меньше 1 штуки)
function merchScale(o, k) { if (k === 1) return o; const r = {}; for (const id in o) r[id] = Math.max(1, Math.round(o[id] * k)); return r; }
function makeOffers() {
  const offers = [];
  const bps = Object.keys(BLUEPRINTS).filter(id => !S.blueprints.includes(id));
  for (let i = 0; i < 2 && bps.length; i++) {
    const id = bps.splice(randi(0, bps.length - 1), 1)[0];
    offers.push({ kind: 'bp', id, price: merchScale(BLUEPRINTS[id].price, TUNE.merchPrice), name: BLUEPRINTS[id].name });
  }
  offers.push({ kind: 'slave', price: merchScale({ gem: 15 }, TUNE.merchPrice), name: 'Орк-раб — силач для грубой работы (буры, плавильни, кузня, колесо)' });
  if (Math.random() < 0.5) offers.push({ kind: 'human', price: merchScale({ gem: 30, relic: 1 }, TUNE.merchPrice), name: 'Человек-мастер — для точной работы (мастерская, алхимия, скрипторий)' });
  offers.push({ kind: 'trade', give: { relic: 1 }, price: { gem: 25 }, name: 'Древняя реликвия' });
  // торговец скупает товары за самоцветы — так продукция завода превращается в валюту
  const sells = [
    { give: { iron: 400 }, gem: 2 }, { give: { block: 400 }, gem: 2 }, { give: { plank: 600 }, gem: 2 },
    { give: { steel: 200 }, gem: 4, tech: 'smithing' }, { give: { igear: 300 }, gem: 4, tech: 'smithing' }, { give: { bronze: 150 }, gem: 4, tech: 'bronze' },
    { give: { glass: 200 }, gem: 4, tech: 'glass' }, { give: { clockwork: 30 }, gem: 6, tech: 'clockwork' }, { give: { roast: 100 }, gem: 4, tech: 'cooking' },
    { give: { f3: 150 }, gem: 5, tech: 'military' }, { give: { f4: 120 }, gem: 6, tech: 'alchemy' }, { give: { f5: 80 }, gem: 8, tech: 'clockwork' },
  ].filter(q => !q.tech || S.research.done.includes(q.tech));
  // объёмы растут вместе с заводом, а награды — прежние (иначе самоцветы обесцениваются)
  const stage = merchantStage();
  for (let k = 0; k < 2 && sells.length; k++) {
    const q = sells.splice(randi(0, sells.length - 1), 1)[0];
    const give = {}; for (const id in q.give) give[id] = roundLot(q.give[id] * stage);
    offers.push({ kind: 'sell', price: give, give: merchScale({ gem: q.gem }, TUNE.merchReward), name: 'Продать: ' + Object.keys(give).map(id => ITEMS[id].name + ' ×' + give[id]).join(', ') });
  }
  // задание на доставку: то, что завод уже делает (самое ценное охотнее), примерно на 12 минут выработки;
  // если выработки ещё нет — из списка по изученному, тоже с ростом объёма
  const qq = merchantDeliverQuest(stage);
  offers.push({ kind: 'quest', q: { kind: 'deliver', need: qq.need, reward: merchScale(qq.reward, TUNE.merchReward), desc: 'Принести: ' + Object.keys(qq.need).map(id => ITEMS[id].name + ' ×' + qq.need[id]).join(', ') }, name: 'Задание: доставка', price: {} });
  const nCamps = Math.min(6, 2 + Math.floor(S.research.done.length / 20));
  offers.push({ kind: 'quest', q: { kind: 'camps', n: nCamps, reward: merchScale({ gem: 8, mithril: 8 }, TUNE.merchReward), desc: `Уничтожить ${nCamps} вражеских лагеря` }, name: 'Задание: истребление', price: {} });
  return offers;
}
// множитель объёмов торговца: 1 в начале, ~6 к концу (по изученному и времени игры)
function merchantStage() { return clamp(1 + S.research.done.length / 12 + S.time / 3600 * 0.25, 1, 7); }
function roundLot(n) { return n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : Math.max(5, Math.round(n / 5) * 5); }
function merchantDeliverQuest(stage) {
  const R = typeof statRates === 'function' ? statRates(1).P : {};
  const cand = [];
  for (const id in R) {
    const it = ITEMS[id];
    if (!it || it.bld || id === 'gem' || id === 'relic' || R[id] < 0.3) continue;
    cand.push({ id, rate: R[id], w: Math.pow(itemPrice(id), 1.3) });
  }
  if (cand.length) {
    let tot = cand.reduce((a, c) => a + c.w, 0), r = Math.random() * tot, c = cand[0];
    for (const x of cand) { r -= x.w; if (r <= 0) { c = x; break; } }
    const n = roundLot(Math.max(c.rate * 12, 300 / itemPrice(c.id)) * (0.8 + Math.random() * 0.4));
    // награда как у прежних заданий: 4–10 самоцветов (за дорогой товар — больше)
    return { need: { [c.id]: n }, reward: { gem: clamp(Math.round(3 + Math.log2(itemPrice(c.id) + 1)), 4, 10) } };
  }
  const pool = [
    { need: { iron: 600 }, reward: { gem: 4 } },
    { need: { block: 500 }, reward: { gem: 4 } },
    { need: { steel: 250 }, reward: { gem: 7, relic: 1 }, tech: 'smithing' },
    { need: { bronze: 200 }, reward: { gem: 7, mithril: 5 }, tech: 'bronze' },
    { need: { clockwork: 40 }, reward: { gem: 10, relic: 1 }, tech: 'clockwork' },
    { need: { pie: 80 }, reward: { gem: 8, mithril: 10 }, tech: 'haute' },
  ].filter(q => !q.tech || S.research.done.includes(q.tech));
  const q = pick(pool), need = {}, reward = {};
  for (const id in q.need) need[id] = roundLot(q.need[id] * stage);
  for (const id in q.reward) reward[id] = q.reward[id];
  return { need, reward };
}

function buyOffer(i) {
  const m = S.merchant;
  if (!m) return;
  const o = m.offers[i];
  if (!o || o.sold) return;
  const inv = S.player.inv;
  if (!inv.has(o.price)) { hint('Торговец принимает только то, что указано в цене'); sfx('error'); return; }
  inv.pay(o.price);
  o.sold = true;
  if (o.kind === 'bp') {
    S.blueprints.push(o.id);
    recomputeBonus();
    log('Получено: ' + o.name, 'good');
  } else if (o.kind === 'slave') { addWorker('orc'); log('Куплен орк-раб.', 'good'); }
  else if (o.kind === 'human') { addWorker('human'); log('К вам присоединился человек-мастер.', 'good'); }
  else if (o.kind === 'trade') { inv.addAll(o.give); log('Куплено: ' + o.name, 'good'); }
  else if (o.kind === 'sell') { inv.addAll(o.give); log(o.name + ' — получено самоцветов: ' + o.give.gem, 'good'); }
  else if (o.kind === 'quest') {
    const q = Object.assign({ id: S.nextId++, deadline: S.time + 20 * 60, base: S.stats.camps || 0 }, o.q);
    S.quests.push(q);
    log('Новое задание: ' + q.desc + ' (20 минут)', 'good');
  }
  sfx('coins');
  renderMerchantWin();
}

function deliverQuest(id) {
  const q = S.quests.find(x => x.id === id);
  if (!q || q.done || q.kind !== 'deliver') return;
  if (!S.player.inv.pay(q.need)) { hint('Не хватает предметов'); return; }
  completeQuest(q);
}
function completeQuest(q) {
  q.done = true;
  S.player.inv.addAll(q.reward);
  log('Задание выполнено! Награда: ' + Object.keys(q.reward).map(id => ITEMS[id].name + ' ×' + q.reward[id]).join(', '), 'good');
  sfx('victory');
}

// напасть на торговца — просто ударить его, как моба: он превращается в сильного мага.
// Убьёте — богатая добыча; убежите — он уйдёт. Следующий торговец — не раньше чем через полтора часа.
function angerMerchant() {
  const m = S.merchant;
  if (!m) return null;
  closeWin('merchant');
  const e = spawnEnemy('merchant_foe', m.x, m.y, 'merchant');
  e.hp = e.maxHp = Math.round(ENEMIES.merchant_foe.hp * (1 + (S.evo || 0)));
  S.merchant = null;
  S.nextMerchant = S.time + 90 * 60;
  log('Торговец сбросил личину! «Ты пожалеешь, механик…» Он силён — убейте его ради добычи или бегите.', 'warn');
  sfx('elf'); shake(3);
  for (let i = 0; i < 40; i++) { const a = rand(0, 6.28); FX.push({ x: m.x + Math.cos(a) * 0.5, y: m.y - 0.5 + Math.sin(a) * 0.5, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.6, c: pick(['#a040ff', '#ff60ff', '#ffffff']), s: 0.2 }); }
  return e;
}
function onMerchantKilled(e) {
  const h = nearestHero(e.x, e.y, 40) || S.player;
  const loot = { gem: 30, relic: 2, mithril: 25, clockwork: 3 };
  for (const id in loot) h.inv.add(id, loot[id]);
  log('Торговец повержен! Его добро: 30 самоцветов, 2 реликвии, 25 мифрила, 3 заводных механизма.', 'good');
  sfx('victory');
}
function attackMerchant() {
  const m = S.merchant;
  if (!m) return;
  closeWin('merchant');
  const R = 12;
  log('Торговец телепортировался, оставив за собой чудовищный магический взрыв!', 'warn');
  for (const b of [...S.buildings.values()]) if (dist(b.x + b.w / 2, b.y + b.h / 2, m.x, m.y) < R) destroyBuilding(b);
  S.golems = S.golems.filter(g => dist(g.x, g.y, m.x, m.y) >= R);
  for (const e of S.enemies) if (dist(e.x, e.y, m.x, m.y) < R) e.dead = true;
  const p = S.player;
  if (dist(p.x, p.y, m.x, m.y) < R) damagePlayer(99999);
  for (let i = 0; i < 120; i++) { const a = rand(0, 6.28), r = rand(0, R); FX.push({ x: m.x + Math.cos(a) * r, y: m.y + Math.sin(a) * r, vx: rand(-2, 2), vy: rand(-3, 0), life: rand(0.5, 1.5), c: pick(['#a040ff', '#ffffff', '#ff60ff']), s: 0.3 }); }
  shake(14); sfx('boom'); sfx('boom');
  S.merchant = null;
  S.nextMerchant = S.time + 90 * 60;
}
