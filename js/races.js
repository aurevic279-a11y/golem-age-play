'use strict';
// Народы мира: гоблины, орки, светлые эльфы, дворфы и маги. У каждого — торговое поселение, торговец, караваны, репутация и задания.
// Жизнь народов идёт «за спиной» раз в минуту по простым правилам: развитие, сделки, войны. Никто не обгоняет среднее больше чем на 10%.
// Деньги — общие монеты базы (S.money).

// bloc: dark (гоблины и орки) торгуют только между собой и с вами не дружат никогда; light торгуют с вами и друг с другом. Между блоками только война.
// sells: [предмет, запас, с какой репутации]; buys: [предмет, сколько нужно за раз]. Чего нет в buys, народ не покупает вообще.
const RACES = {
  goblin: { name: L('Гоблины'), one: L('гоблин'), town: L('Вольный базар'), unit: 'goblin', soldier: 'goblin_chief', color: '#a8c050', bloc: 'dark', enemy: true,
    sells: [['coal', 0, 0], ['sulfur', 0, 0], ['rope', 0, 0], ['gem', 0, 0]], buys: [],
    props: ['woodpile', 'kiln', 'chest', 'barn'] },
  orc: { name: L('Орки'), one: L('орк'), town: L('Бойцовая ярмарка'), unit: 'orc_brute', soldier: 'orc_berserk', color: '#c07050', bloc: 'dark', enemy: true,
    sells: [['raw_meat', 0, 0], ['leather', 0, 0], ['iron', 0, 0], ['shackles', 0, 0]], buys: [],
    props: ['barracks', 'forge', 'treadwheel', 'woodpile'] },
  elf: { name: L('Светлые эльфы'), one: L('эльф'), town: L('Серебряная роща'), unit: 'lelf', soldier: 'lelf_guard', color: '#90e0a0', bloc: 'light',
    sells: [['farrow', 80, 0], ['armor_ranger', 1, 0], ['pie', 30, 15], ['rune', 8, 15], ['repeater', 1, 15], ['mod_eff', 1, 45], ['armor_rune', 1, 45], ['mithril_blade', 1, 85]],
    buys: [['pie', 40], ['roast', 60], ['clothes', 20], ['furniture', 20], ['glass', 120], ['flask', 60], ['gold', 30], ['bronze', 60]],
    props: ['nursery', 'berryfarm', 'altar', 'watermill'], perk: 'bp_elf' },
  dwarf: { name: L('Дворфы'), one: L('дворф'), town: L('Каменный чертог'), unit: 'dwarf', soldier: 'dwarf_guard', color: '#d0a060', bloc: 'light',
    sells: [['steel', 60, 0], ['igear', 80, 0], ['sshaft', 20, 15], ['armor_steel', 1, 15], ['boiler', 5, 15], ['warhammer', 1, 15], ['mithril', 15, 45], ['mod_speed', 2, 45], ['armor_heavy', 1, 45], ['armor_thorns', 1, 45]],
    buys: [['coal', 300], ['charcoal', 200], ['stew', 80], ['roast', 60], ['copper', 200], ['bronze', 80], ['gold', 40], ['gold_ore', 60], ['leather', 100], ['gem', 6]],
    props: ['forge', 'stonecutter', 'furnace', 'mine'], perk: 'bp_dwarf' },
  mage: { name: L('Маги'), one: L('маг'), town: L('Башни Знания'), unit: 'wizard', soldier: 'mage_guard', color: '#90a0ff', bloc: 'light',
    sells: [['f3', 40, 0], ['rune', 12, 0], ['f4', 25, 15], ['clockwork', 6, 15], ['mod_eff', 2, 15], ['f5', 12, 45], ['flamer', 1, 45], ['armor_rune', 1, 45], ['f6', 5, 45], ['quake_staff', 1, 85]],
    buys: [['glass', 150], ['flask', 80], ['sulfur', 150], ['oil', 100], ['gas', 100], ['gold', 40], ['gold_dust', 60], ['mithril', 20], ['clockwork', 10], ['gem', 8], ['relic', 1]],
    props: ['scriptorium', 'alchemy', 'beacon', 'obelisk'], perk: 'bp_mage' },
};
const RACE_IDS = Object.keys(RACES);
// кто кого не переносит (отрицательное — вражда); маленькая война народов и порча настроения в общем доме
const RACE_REL = { 'elf|orc': -50, 'elf|goblin': -50, 'dwarf|goblin': -50, 'dwarf|orc': -50, 'dwarf|elf': -15, 'goblin|orc': 20, 'elf|mage': 20, 'dwarf|mage': 5, 'goblin|mage': -40, 'mage|orc': -40 };
const ENEMY_REP_MAX = -30; // гоблины и орки: выше этого репутация не поднимается никогда
function tradeOk(r) { return !!RACES[r] && !RACES[r].enemy && !raceHostile(r) && rep(r) >= -10; }
const MARKET_WANTS = new Set(Object.keys(RACES).flatMap(r => RACES[r].buys.map(b => b[0])));
const relKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
function baseRel(a, b) { return RACE_REL[relKey(a, b)] || 0; }
const REP_TIERS = [[-101, L('Вражда'), '#ff5040'], [-10, L('Нейтралитет'), '#c0b8a0'], [15, L('Друг'), '#a0d870'], [45, L('Союзник'), '#70e0a0'], [85, L('Побратим'), '#ffd860']];
function repTier(v) { let t = REP_TIERS[0]; for (const x of REP_TIERS) if (v >= x[0]) t = x; return t; }
const TRADE = { buyK: 1.25, sellK: 0.7, marketK: 0.35, marketRate: 5 };
const HIRE = { peace: 3000, workerCost: 300, mercCost: 800, workerRep: 15, mercRep: 45, mercWage: 20, mercWageT: 300 };

function W_() { return S.world; }
function rep(r) { return S.world ? S.world.rep[r] || 0 : 0; }
function addRep(r, v) { if (!S.world || !RACES[r]) return; const o = S.world.rep[r] || 0; S.world.rep[r] = clamp(o + v, -100, RACES[r].enemy ? ENEMY_REP_MAX : 100); if (repTier(o) !== repTier(S.world.rep[r])) log(L`${RACES[r].name}: теперь вы — «${repTier(S.world.rep[r])[1]}».`, S.world.rep[r] > o ? 'good' : 'warn'); }
function addMoney(n) { S.money = Math.max(0, (S.money || 0) + n); }
function raceHostile(r) { const w = S.world; return !!w && (!!RACES[r].enemy || w.war[r] || rep(r) <= -50 && blightStage() >= 2); }
// скопления: у каждого светлого народа столица и 2 посёлка; у гоблинов и орков по 2 скопления, столица и 3 посёлка. Вокруг столицы — его земли.
function relocateVillages(w) {
  w.v3 = true; w.v2 = true; w.terr = {}; TERR_CACHE.clear();
  const bc = baseCenter(), old = w.villages, plan = ['elf', 'goblin', 'dwarf', 'orc', 'mage', 'goblin', 'orc'], a0 = rand(0, 6.28);
  w.villages = [];
  plan.forEach((r, i) => {
    const light = !RACES[r].enemy, a = a0 + i * 6.283 / plan.length;
    const pos = light ? findVillageSpot(bc, a) : findVillageSpot(bc, a, [260, 700]);
    const cap = makeVillage(r, pos.x, pos.y), o = old.find(x => x.race === r);
    if (o && light) { cap.level = o.level; cap.staff = o.staff; }
    w.villages.push(cap);
  });
  fillHamlets(w);
  VIL_V = -1; w.visitor = null; TERR_CACHE.clear();
  // лагерям не место на землях светлых народов
  for (const c of S.camps) if (c.alive && c.type !== 'elf' && c.type !== 'citadel' && (villageNearCell(c.x, c.y, 28) || isLightLand(c.x, c.y)) && !nearestHero(c.x, c.y, 45)) { c.alive = false; for (const st of c.structs) st.hp = 0; }
}
// ---------- земли ----------
// Мир поделён на участки 48×48. Вокруг столиц светлых народов — их земли, всё остальное держат гоблины и орки большими областями.
const SEC = 48, TERR_CACHE = new Map(), LAND_R = 170;
const secKey = (x, y) => Math.floor(x / SEC) + ',' + Math.floor(y / SEC);
function darkLand(x, y) { return fbm(x / 210, y / 210, SEED + 5, 3) > 0.5 ? 'orc' : 'goblin'; }
function baseLand(x, y) {
  const k = secKey(x, y);
  if (TERR_CACHE.has(k)) return TERR_CACHE.get(k);
  const cx = (Math.floor(x / SEC) + 0.5) * SEC, cy = (Math.floor(y / SEC) + 0.5) * SEC, bc = baseCenter();
  let own = dist(cx, cy, bc.x, bc.y) < 90 ? 'free' : null;
  if (!own && S.world) for (const v of S.world.villages) {
    if (v.mini) continue;
    const a = Math.atan2(cy - v.y, cx - v.x), wob = 1 + Math.sin(a * 3 + v.x) * 0.15 + Math.sin(a * 5 + v.y) * 0.08;
    if (dist(cx, cy, v.x, v.y) < (RACES[v.race].enemy ? 110 : LAND_R) * wob) { own = v.race; break; }
  }
  own = own || darkLand(cx, cy);
  TERR_CACHE.set(k, own);
  return own;
}
function landOwner(x, y) { const w = S.world; return (w && w.terr && w.terr[secKey(x, y)]) || baseLand(x, y); }
function isLightLand(x, y) { const o = landOwner(x, y); return !!RACES[o] && !RACES[o].enemy; }
function landName(o) { return o === 'free' ? L('ничьи (ваша база)') : RACES[o] ? RACES[o].name : o; }
// доля земель в округе 800 клеток от базы
let LAND_SHARE = null, LAND_SHARE_T = -99;
function landShares() {
  if (LAND_SHARE && S.time - LAND_SHARE_T < 15) return LAND_SHARE;
  const out = {}, bc = baseCenter(); let n = 0;
  for (let y = -800; y <= 800; y += SEC) for (let x = -800; x <= 800; x += SEC) {
    if (x * x + y * y > 640000) continue;
    const o = landOwner(bc.x + x, bc.y + y); if (o === 'free') continue;
    out[o] = (out[o] || 0) + 1; n++;
  }
  for (const k in out) out[k] = Math.round(out[k] / n * 100);
  LAND_SHARE = out; LAND_SHARE_T = S.time;
  return out;
}
// Война за земли. Каждый спор решает бой. Рядом с героем это живые отряды: кто выстоял, тот и забрал участок.
// Вдали от всех героев мир не просчитывается по клеткам, поэтому там исход считается по силе народов.
const WAR_SQUAD = {
  goblin: ['goblin', 'goblin', 'goblin', 'goblin_archer', 'goblin_chief', 'goblin', 'goblin', 'goblin_archer', 'goblin', 'goblin_chief', 'goblin_chief', 'goblin_archer'],
  orc: ['orc_brute', 'orc_brute', 'orc_thrower', 'orc_berserk', 'orc_brute', 'orc_thrower', 'orc_berserk'],
  elf: ['lelf_guard', 'lelf_guard', 'lelf_guard'],
  dwarf: ['dwarf_guard', 'dwarf_guard', 'dwarf_guard'],
  mage: ['mage_guard', 'mage_guard', 'mage_guard', 'mage_guard'],
};
const LIGHT_LAND_CAP = 14; // процентов округи на один светлый народ: большая часть мира остаётся за гоблинами и орками
const isLand = o => !!RACES[o];
function terrTick(w) {
  w.battles = w.battles || []; delete w.fights;
  warTick(w);
  w.syncT = (w.syncT || 0) - 1;
  if (w.syncT <= 0) { w.syncT = 20; campLandSync(); }
  heroWarTick(w);
  w.terrT = (w.terrT == null ? 120 : w.terrT) - 1;
  if (w.terrT > 0) return;
  w.terrT = rand(120, 240);
  // спорят все со всеми: любая столица и первый чужой участок на луче от неё
  const caps = w.villages.filter(v => !v.mini);
  if (!caps.length) return;
  const c = pick(caps), a = rand(0, 6.283), L = c.race;
  let foe = null, bx = 0, by = 0, ix = c.x, iy = c.y;
  for (let r = 48; r < 340; r += 24) {
    bx = c.x + Math.cos(a) * r; by = c.y + Math.sin(a) * r;
    const o = landOwner(bx, by);
    if (o !== L) { foe = o; break; }
    ix = bx; iy = by;
  }
  if (!isLand(foe)) return;
  warBegin(w, L, foe, ix, iy, bx, by);
}
// начать бой: участок A (ax, ay) против участка B (bx, by)
function warBegin(w, a, b, ax, ay, bx, by) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const hero = S.peaceful ? null : nearestHero(mx, my, 110);
  const spot = hero && S.enemies.length < 300 && w.battles.length < 3 && !villageNearCell(mx, my, 20) && dist(mx, my, baseCenter().x, baseCenter().y) > 70 ? nearestEPass(mx, my, 10) : null;
  if (!spot) { warResolve(w, { a, b, ax, ay, bx, by, x: mx, y: my }, w.eco[a] * rand(0.7, 1.3) > w.eco[b] * rand(0.7, 1.3) ? a : b); return; }
  const f = { id: S.nextId++, a, b, ax, ay, bx, by, x: spot.x, y: spot.y, until: S.time + 120, done: false };
  w.battles.push(f);
  const dl = dist(ax, ay, bx, by) || 1, ux = (bx - ax) / dl, uy = (by - ay) / dl;
  warSquad(f, a, spot.x - ux * 9, spot.y - uy * 9);
  warSquad(f, b, spot.x + ux * 9, spot.y + uy * 9);
  if (hero === S.player) log(L`Неподалёку бой за земли (${dirName(spot.x - hero.x, spot.y - hero.y)}): ${RACES[a].name} против: ${RACES[b].name}.`);
  sfx('alarm');
}
function warSquad(f, race, x, y) {
  const ally = !RACES[race].enemy && tradeOk(race);
  const warK = rand(0.65, 1.35); // боевой дух: заранее не угадать, чей сегодня день
  for (const type of WAR_SQUAD[race]) spawnEnemy(type, x + rand(-3, 3), y + rand(-3, 3), 'war', { war: race, warId: f.id, ally, warK });
}
// рядом с героем граница оживает: раз в несколько минут бой на ближайшем стыке земель
function heroWarTick(w) {
  w.heroWarT = (w.heroWarT == null ? 60 : w.heroWarT) - 1;
  if (w.heroWarT > 0 || S.peaceful) return;
  w.heroWarT = rand(150, 300);
  const heroes = heroList().filter(h => !(h.dead > 0) && h.y < DUNGEON.y0 - 64);
  if (!heroes.length) return;
  const h = pick(heroes), a0 = rand(0, 6.283);
  for (let r = 30; r <= 100; r += 14) for (let i = 0; i < 12; i++) {
    const an = a0 + i * 6.283 / 12, x = h.x + Math.cos(an) * r, y = h.y + Math.sin(an) * r, o = landOwner(x, y);
    if (!isLand(o)) continue;
    for (const [dx, dy] of [[SEC, 0], [0, SEC]]) {
      const o2 = landOwner(x + dx, y + dy);
      if (o2 !== o && isLand(o2)) { warBegin(w, o, o2, x, y, x + dx, y + dy); return; }
    }
  }
}
function warUnits(id) { return S.enemies.filter(e => e.warId === id && !e.dead && e.hp > 0); }
// раз в секунду: кто победил, кто уже ушёл с поля
function warTick(w) {
  for (const f of w.battles) {
    if (f.done) continue;
    const u = warUnits(f.id), na = u.filter(e => e.war === f.a), nb = u.filter(e => e.war === f.b);
    const hp = l => l.reduce((n, e) => n + e.hp, 0);
    const away = !nearestHero(f.x, f.y, 140);
    if (na.length && nb.length && S.time < f.until && !away) continue;
    f.done = true; f.gone = S.time + 30;
    const win = hp(na) >= hp(nb) ? f.a : f.b;
    warResolve(w, f, win);
    for (const e of u) { e.warEnd = S.time + 25; e.think = 0; }
    if (away) for (const e of u) e.dead = true;
  }
  w.battles = w.battles.filter(f => !f.done || S.time < f.gone);
  for (const e of S.enemies) {
    if (!e.war || e.dead) continue;
    if (e.warEnd ? S.time > e.warEnd && !nearestHero(e.x, e.y, 18) : !w.battles.some(f => f.id === e.warId)) e.dead = true;
  }
}
// итог боя: победитель забирает участок проигравшего; столицу и её окрестности так просто не отнять
function warResolve(w, f, win) {
  const lose = win === f.a ? f.b : f.a, lx = win === f.a ? f.bx : f.ax, ly = win === f.a ? f.by : f.ay;
  const near = nearestHero(f.x, f.y, 40);
  if (near && !RACES[win].enemy && f.id) { addRep(win, 2); if (near === S.player) log(L`${RACES[win].name} победили и благодарны вам за помощь.`); }
  w.eco[lose] *= 0.998;
  const home = w.villages.some(v => v.race === lose && !v.mini && dist(v.x, v.y, lx, ly) < 70);
  const capped = !RACES[win].enemy && (landShares()[win] || 0) >= LIGHT_LAND_CAP;
  if (home || capped || landOwner(lx, ly) === 'free') { chronicle(L`${RACES[lose].name} отбились от народа «${RACES[win].name}», но земля осталась за прежним хозяином.`); return; }
  w.terr[secKey(lx, ly)] = win;
  chronicle(L`${RACES[win].name} забрали земли у народа «${RACES[lose].name}».`);
  LAND_SHARE = null;
  campLandSync(secKey(lx, ly));
  if (RACES[win].enemy && !RACES[lose].enemy) foundCampAt(win, lx, ly);
}
// лагеря всегда соответствуют хозяину земли: гоблины и орки перестраивают захваченное, светлые сжигают
const CAMP_SWAP = { hut: 'tent', tent: 'hut', ghut: 'otent', otent: 'ghut', gtotem: 'totem', totem: 'gtotem', palisade_c: 'spikewall', spikewall: 'palisade_c' };
function campFitLand(c) {
  if (c.type !== 'goblin' && c.type !== 'orc') return;
  const o = landOwner(c.x, c.y);
  if ((o !== 'goblin' && o !== 'orc') || o === c.type) return;
  c.type = o; c._wall = null; c.guardT = 0;
  for (const s of c.structs) if (CAMP_SWAP[s.kind]) s.kind = CAMP_SWAP[s.kind];
  restrengthCamp(c);
  for (const e of S.enemies) if (e.campId === c.id && !e.war) e.dead = true;
}
function campLandSync(sec) {
  for (const c of S.camps) {
    if (!c.alive || (sec && secKey(c.x, c.y) !== sec) || nearestHero(c.x, c.y, 45)) continue;
    if (c.type !== 'elf' && c.type !== 'citadel' && isLightLand(c.x, c.y)) {
      c.alive = false; for (const st of c.structs) st.hp = 0;
      for (const e of S.enemies) if (e.campId === c.id && !e.war) e.dead = true;
      if (sec) chronicle(L`${RACES[landOwner(c.x, c.y)].name} сожгли лагерь врага.`);
    } else campFitLand(c);
  }
}
// кого бьёт боец на границе: ближайшего из чужого отряда, а враждебный герою — и героя, если тот влез в драку
function warTarget(e) {
  const f = S.world && (S.world.battles || []).find(o => o.id === e.warId);
  if (!f || f.done) {
    if (!e.ally) { const h = nearestHero(e.x, e.y, 7); if (h) return { k: 'p', h }; }
    const home = S.world && S.world.villages.find(v => v.race === e.war && !v.mini);
    if (!home) return null;
    if (!e.post || S.time > e.postT) { const l = dist(e.x, e.y, home.x, home.y) || 1; e.post = nearestEPass(e.x + (home.x - e.x) / l * 20, e.y + (home.y - e.y) / l * 20, 8) || { x: e.x, y: e.y }; e.postT = S.time + 8; }
    return { k: 'pt', x: e.post.x, y: e.post.y };
  }
  let foe = null, fd = 1600;
  for (const o of S.enemies) { if (o.warId !== e.warId || o.war === e.war || o.dead) continue; const d = dist2(o.x, o.y, e.x, e.y); if (d < fd) { fd = d; foe = o; } }
  if (!e.ally) { const h = nearestHero(e.x, e.y, 7); if (h && (!foe || dist2(h.x, h.y, e.x, e.y) < fd)) return { k: 'p', h }; }
  if (foe) return { k: 'e', id: foe.id };
  return { k: 'pt', x: f.x, y: f.y };
}
// удар по чужому бойцу: броня спасает лишь отчасти, иначе гоблины не поцарапают латника
const WAR_POWER = { goblin: 1.4, orc: 0.78, elf: 1.05, dwarf: 0.6, mage: 0.95 };
function warHit(e, foe, dmg) { hurtEnemy(foe, dmg * 0.4 * WAR_POWER[e.war] * (e.warK || 1) + ENEMIES[foe.type].armor, { x: e.x, y: e.y, war: true }); }
function warMark(e) {
  G.save(); G.globalAlpha = 0.75; G.strokeStyle = RACES[e.war].color; G.lineWidth = Math.max(1.5, VIEW.z * 0.07);
  G.beginPath(); G.ellipse(sx(e.x), sy(e.y), VIEW.z * 0.42, VIEW.z * 0.2, 0, 0, 7); G.stroke(); G.restore();
}
function drawBattle(f) {
  if (!f.done) npcLabel(`⚔ ${RACES[f.a].name} — ${RACES[f.b].name}`, f.x, f.y - 2.4, '#ffd860', npcAlpha(f.x, f.y));
}
function foundCampAt(race, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (nearestHero(x, y, 45) || villageNearCell(x, y, 26) || S.camps.some(c => c.alive && dist2(c.x, c.y, x, y) < 400)) return;
  for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) { if (isWater(xx, yy) || bldAt(xx, yy)) return; }
  for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) { const c = chunkOf(xx, yy), i = tidx(xx, yy); if (c.res[i] === RES_ID.tree) c.trees--; c.res[i] = 0; c.amt[i] = 0; c.modified = true; c.netv = (c.netv || 0) + 1; }
  const gob = race === 'goblin';
  createCamp({ type: gob ? 'goblin' : 'orc', x, y, key: 'terr' + S.nextId, structs: gob
    ? [{ kind: 'ghut', x: x - 2, y: y - 2 }, { kind: 'hut', x: x + 1, y: y - 2 }, { kind: 'hut', x: x - 2, y: y + 1 }, { kind: 'bonfire', x, y }]
    : [{ kind: 'otent', x: x - 2, y: y - 2 }, { kind: 'tent', x: x + 1, y: y - 2 }, { kind: 'tent', x: x - 2, y: y + 1 }, { kind: 'bonfire', x, y }] });
}
// цветные области на большой карте: только там, где вы уже побывали
const LAND_COL = { goblin: '168,192,80', orc: '192,90,60', elf: '144,224,160', dwarf: '208,160,96', mage: '144,160,255' };
function drawLandOverlay(g, x0, y0, tw, th, scale) {
  if (!S.world) return;
  const sx0 = Math.floor(x0 / SEC), sy0 = Math.floor(y0 / SEC), sx1 = Math.floor((x0 + tw) / SEC), sy1 = Math.floor((y0 + th) / SEC);
  for (let sy = sy0; sy <= sy1; sy++) for (let sx = sx0; sx <= sx1; sx++) {
    const wx = sx * SEC, wy = sy * SEC;
    if (![[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].some(q => isExploredSafe(wx + SEC * q[0], wy + SEC * q[1]))) continue;
    const col = LAND_COL[landOwner(wx + 1, wy + 1)];
    if (!col) continue;
    g.fillStyle = `rgba(${col},0.3)`; g.fillRect((wx - x0) * scale, (wy - y0) * scale, SEC * scale, SEC * scale);
  }
}
function chronicle(txt) { const w = S.world; w.log.unshift({ t: S.time, txt }); if (w.log.length > 40) w.log.length = 40; }

// ---------- появление мира ----------
function worldInit() {
  if (S.world) return;
  S.world = { rep: { goblin: -60, orc: -60, elf: 0, dwarf: 0, mage: 5 }, eco: {}, gold: {}, rel: {}, wars: [], war: {}, villages: [], log: [], caravans: [], visitor: null, nextVisit: S.time + 8 * 60, simT: 60 };
  S.money = S.money || 0; S.mercs = S.mercs || []; S.strays = S.strays || [];
  for (const r of RACE_IDS) { S.world.eco[r] = 100; S.world.gold[r] = 1000; }
  relocateVillages(S.world);
  chronicle(L('Народы мира торгуют и спорят о границах. Вас уже заметили.'));
}
// Поселения далеко от базы, их надо искать. Планировка у каждого народа своя; всё детерминировано, в сохранение не пишется.
// [ключ, x, y, ширина, глубина] от центра; shape: square, oct (восьмиугольник), rough (кривой частокол с дырами)
const VIL_LAYOUT = {
  elf: { R: 13, shape: 'oct', wall: 'v_elf_wall', tower: 'v_elf_tower', ground: 'rgba(84,140,70,0.55)', path: 'rgba(226,218,186,0.8)', light: '230,255,190', towers: [[-13, -3], [12, -3], [-13, 2], [12, 2], [-3, -13], [2, -13], [-3, 12], [2, 12]],
    items: [['v_elf_tree', -2, -12, 4, 3], ['v_elf_hall', -3, -8, 6, 3], ['v_elf_fountain', -1, 3, 2, 2], ['v_elf_house', -8, -5, 2, 2], ['v_elf_house', 6, -5, 2, 2], ['v_elf_house', -10, 0, 2, 2], ['v_elf_house', 8, 0, 2, 2], ['v_elf_house', -7, 5, 2, 2], ['v_elf_house', 5, 5, 2, 2], ['v_elf_house', -3, 8, 2, 2], ['v_elf_house', 1, 8, 2, 2]] },
  dwarf: { R: 12, shape: 'square', wall: 'v_dw_wall', tower: 'v_dw_tower', ground: 'rgba(130,124,112,0.6)', path: 'rgba(90,86,80,0.7)', light: '255,170,90', towers: [[-12, -12], [11, -12], [-12, 11], [11, 11]],
    items: [['v_dw_hall', -4, -10, 8, 4], ['v_dw_forge', -10, -9, 3, 2], ['v_dw_forge', 7, -9, 3, 2], ['v_dw_statue', -3, -3, 2, 2], ['v_dw_statue', 1, -3, 2, 2], ['v_dw_house', -10, -4, 2, 2], ['v_dw_house', 8, -4, 2, 2], ['v_dw_house', -10, 1, 2, 2], ['v_dw_house', 8, 1, 2, 2], ['v_dw_house', -10, 6, 2, 2], ['v_dw_house', 8, 6, 2, 2], ['v_dw_forge', -5, 6, 3, 2], ['v_dw_forge', 2, 6, 3, 2]] },
  mage: { R: 12, shape: 'oct', wall: 'v_mg_wall', tower: 'v_mg_spire', ground: 'rgba(70,70,130,0.5)', path: 'rgba(170,150,220,0.45)', light: '140,190,255', towers: [[-12, -3], [11, -3], [-12, 2], [11, 2]],
    items: [['v_mg_great', -2, -10, 4, 4], ['v_mg_spire', -7, -7, 2, 2], ['v_mg_spire', 5, -7, 2, 2], ['v_mg_lib', -3, 6, 6, 3], ['v_mg_spire', -8, 2, 2, 2], ['v_mg_spire', 6, 2, 2, 2], ['v_mg_crystal', -4, -3, 1, 1], ['v_mg_crystal', 3, -3, 1, 1], ['v_mg_crystal', -4, 3, 1, 1], ['v_mg_crystal', 3, 3, 1, 1]] },
  goblin: { R: 11, shape: 'rough', wall: 'v_gb_wall', tower: 'v_gb_tower', ground: 'rgba(110,90,50,0.5)', light: '255,140,60', towers: [[-11, -11], [10, -9], [-10, 9]],
    items: [['v_gb_hut', -8, -7, 2, 2], ['v_gb_tent', -3, -9, 2, 2], ['v_gb_hut', 3, -8, 2, 2], ['v_gb_tent', 7, -5, 2, 2], ['v_gb_hut', -9, 1, 2, 2], ['v_gb_tent', 7, 2, 2, 2], ['v_gb_hut', -5, 6, 2, 2], ['v_gb_tent', 2, 7, 2, 2], ['v_gb_pile', -2, 3, 2, 2], ['v_gb_pile', 3, -3, 2, 2]] },
  orc: { R: 12, shape: 'square', wall: 'v_or_wall', tower: 'v_or_tower', ground: 'rgba(80,56,38,0.55)', path: 'rgba(56,38,26,0.6)', light: '255,110,60', towers: [[-12, -12], [11, -12], [-12, 11], [11, 11]],
    items: [['v_or_hall', -4, -10, 8, 4], ['v_or_totem', -3, -4, 1, 1], ['v_or_totem', 2, -4, 1, 1], ['v_or_hut', -9, -4, 2, 2], ['v_or_hut', 7, -4, 2, 2], ['v_or_hut', -9, 2, 2, 2], ['v_or_hut', 7, 2, 2, 2], ['v_or_hut', -4, 7, 2, 2], ['v_or_hut', 2, 7, 2, 2], ['v_or_totem', -1, 3, 1, 1]] },
};
// посёлки вокруг столицы: то же оформление, поменьше
const VIL_MINI = {
  elf: { R: 8, towers: [[-8, -2], [7, -2]], items: [['v_elf_house', -5, -5, 2, 2], ['v_elf_house', 3, -5, 2, 2], ['v_elf_fountain', -1, -6, 2, 2], ['v_elf_house', -5, 3, 2, 2], ['v_elf_house', 3, 3, 2, 2]] },
  dwarf: { R: 8, towers: [[-8, -8], [7, -8], [-8, 7], [7, 7]], items: [['v_dw_forge', -2, -6, 3, 2], ['v_dw_house', -6, -3, 2, 2], ['v_dw_house', 4, -3, 2, 2], ['v_dw_house', -5, 3, 2, 2], ['v_dw_statue', 3, 3, 2, 2]] },
  mage: { R: 8, towers: [[-8, -2], [7, -2]], items: [['v_mg_spire', -2, -6, 2, 2], ['v_mg_spire', -6, 2, 2, 2], ['v_mg_spire', 4, 2, 2, 2], ['v_mg_crystal', -3, -2, 1, 1], ['v_mg_crystal', 2, -2, 1, 1]] },
  goblin: { R: 7, towers: [[-7, -7]], items: [['v_gb_hut', -4, -5, 2, 2], ['v_gb_tent', 2, -4, 2, 2], ['v_gb_hut', -5, 2, 2, 2], ['v_gb_tent', 2, 3, 2, 2], ['v_gb_pile', -1, 3, 2, 2]] },
  orc: { R: 8, towers: [[-8, -8], [7, 7]], items: [['v_or_hut', -5, -5, 2, 2], ['v_or_hut', 3, -5, 2, 2], ['v_or_hut', -5, 3, 2, 2], ['v_or_hut', 3, 3, 2, 2], ['v_or_totem', -2, -3, 1, 1], ['v_or_totem', 1, -3, 1, 1]] },
};
for (const r in VIL_MINI) VIL_MINI[r] = Object.assign({}, VIL_LAYOUT[r], VIL_MINI[r]);
function vilL(v) { return v.mini ? VIL_MINI[v.race] : VIL_LAYOUT[v.race]; }
const VIL_DIST = [320, 520]; // клеток от базы: придётся идти искать
function villageSpotOk(x, y, loose, rad) {
  const R = rad || 15;
  for (let yy = y - R; yy <= y + R; yy += 3) for (let xx = x - R; xx <= x + R; xx += 3) {
    const c = chunkOf(xx, yy), i = tidx(xx, yy);
    if (c.ground[i] === GROUND.water || c.ground[i] === GROUND.wall || c.bld[i]) return false;
    if (!loose && c.res[i] && c.res[i] !== RES_ID.tree) return false; // камни и руда посреди города ни к чему
  }
  for (const c of S.camps) if (c.alive && dist(c.x, c.y, x, y) < 40) return false;
  if (nearCitadel(x, y, loose ? 50 : 130)) return false; // цитадели орков — отдельная сила, города от них подальше
  return true;
}
// посёлки вокруг столиц: сперва рядом, потом чуть дальше, если мешает вода или скалы; недостающие ставит и в старых сохранениях
function fillHamlets(w) {
  w.v4 = true;
  for (const cap of w.villages.filter(v => !v.mini)) {
    const n = RACES[cap.race].enemy ? 3 : 2;
    let have = w.villages.filter(v => v.mini && v.race === cap.race && dist(v.x, v.y, cap.x, cap.y) < 130).length;
    for (let t = 0; t < 240 && have < n; t++) {
      const an = rand(0, 6.283), rr = t < 80 ? rand(36, 62) : rand(36, 110), x = Math.floor(cap.x + Math.cos(an) * rr), y = Math.floor(cap.y + Math.sin(an) * rr);
      if (w.villages.some(v => dist(v.x, v.y, x, y) < 26) || !villageSpotOk(x, y, true, 9)) continue;
      w.villages.push(makeVillage(cap.race, x, y, true)); have++;
    }
  }
  VIL_V = -1;
}
function findVillageSpot(bc, a, ring) {
  const RD = ring || VIL_DIST;
  // сперва в своём секторе, потом где угодно на кольце; в крайнем случае соглашаемся на участок с рудой (её расчистят)
  for (let t = 0; t < 160; t++) {
    const wide = t > 60, r = rand(RD[0], RD[1] + (wide ? 120 : 0)), an = wide ? rand(0, 6.283) : a + rand(-0.45, 0.45), x = Math.floor(bc.x + Math.cos(an) * r), y = Math.floor(bc.y + Math.sin(an) * r);
    if (S.world.villages.some(v => dist(v.x, v.y, x, y) < 90)) continue;
    if (villageSpotOk(x, y, t > 110)) return { x, y };
  }
  return { x: Math.floor(bc.x + Math.cos(a) * RD[1]), y: Math.floor(bc.y + Math.sin(a) * RD[1]) };
}
function makeVillage(r, x, y, mini) {
  const L = (mini ? VIL_MINI[r] : VIL_LAYOUT[r]).R + 2;
  for (let yy = y - L; yy <= y + L; yy++) for (let xx = x - L; xx <= x + L; xx++) {
    const c = chunkOf(xx, yy), i = tidx(xx, yy);
    if (c.res[i]) { if (c.res[i] === RES_ID.tree) c.trees--; c.res[i] = 0; c.amt[i] = 0; c.modified = true; c.netv = (c.netv || 0) + 1; }
  }
  return { race: r, x, y, mini: !!mini, level: 2, staff: 4, stock: {}, restock: 0, quests: [], guardT: 0, raidT: S.time + 1200, found: false };
}
function vilInside(L, x, y) {
  const R = L.R;
  return Math.abs(x) <= R && Math.abs(y) <= R && (L.shape !== 'oct' || Math.abs(x) + Math.abs(y) <= R * 1.45);
}
function villageStructs(v) {
  if (v._s) return v._s;
  const L = vilL(v), s = [];
  const add = (key, x, y, w, h) => s.push({ key, x: v.x + x, y: v.y + y, w, h });
  for (const [k, x, y, w, h] of L.items) add(k, x, y, w, h);
  const taken = new Set();
  for (const [x, y] of L.towers) { add(L.tower, x, y, 2, 2); for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) taken.add((x + a) + ',' + (y + b)); }
  const R = L.R;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    if (!vilInside(L, x, y) || taken.has(x + ',' + y)) continue;
    const edge = !vilInside(L, x - 1, y) || !vilInside(L, x + 1, y) || !vilInside(L, x, y - 1) || !vilInside(L, x, y + 1);
    if (!edge) continue;
    if (Math.abs(x) <= 1 || Math.abs(y) <= 1) continue; // ворота с четырёх сторон
    if (L.shape === 'rough' && hash2(x, y, 41) < 0.22) continue; // дырявый частокол
    const horiz = vilInside(L, x, y - 1) !== vilInside(L, x, y + 1);
    add(L.wall + (horiz ? '_h' : '_v'), x, y, 1, 1);
  }
  Object.defineProperty(v, '_s', { value: s, enumerable: false, configurable: true });
  return s;
}
function villageNearCell(x, y, r) { return !!S.world && S.world.villages.some(v => Math.abs(v.x - x) < r && Math.abs(v.y - y) < r); }
// земля площади и огни поселения
function drawVillagesGround() {
  if (!S.world) return;
  for (const v of S.world.villages) {
    if (Math.abs(v.x - CAM.x) > 70 || Math.abs(v.y - CAM.y) > 55) continue;
    const L = vilL(v), R = L.R * VIEW.z;
    G.save(); G.fillStyle = L.ground; G.beginPath();
    if (L.shape === 'oct') G.ellipse(sx(v.x + 0.5), sy(v.y + 0.5), R * 1.02, R * 1.02, 0, 0, 7); else if (L.shape === 'rough') G.ellipse(sx(v.x + 0.5), sy(v.y + 0.5), R * 0.95, R * 0.85, 0, 0, 7); else G.rect(sx(v.x - L.R), sy(v.y - L.R), R * 2, R * 2);
    G.fill();
    // дорожки от ворот к площади
    const w = VIEW.z * 3, X = sx(v.x + 0.5), Y = sy(v.y + 0.5);
    if (L.path) {
      G.fillStyle = L.path; G.fillRect(X - w / 2, Y - R, w, R * 2); G.fillRect(X - R, Y - w / 2, R * 2, w);
      G.beginPath(); G.arc(X, Y, VIEW.z * 3.4, 0, 7); G.fill();
    }
    G.restore();
  }
}
function villageLights(add) {
  if (!S.world) return;
  for (const v of S.world.villages) {
    if (Math.abs(v.x - CAM.x) > 60 || Math.abs(v.y - CAM.y) > 45) continue;
    const L = vilL(v);
    add(v.x + 0.5, v.y + 0.5, 6, L.light, true);
    for (const [x, y] of L.towers) add(v.x + x + 1, v.y + y + 1, 3.5, L.light, true);
    for (const [k, x, y, w, h] of L.items) if (w >= 2) add(v.x + x + w / 2, v.y + y + h, 2.4, L.light, true);
  }
}
let VIL_CELLS = new Set(), VIL_V = -1;
const vilKey = (x, y) => x * 1048576 + y;
function syncVillageCells() {
  const n = S.world ? S.world.villages.length : 0;
  if (n === VIL_V) return;
  VIL_V = n; VIL_CELLS = new Set();
  if (!S.world) return;
  for (const v of S.world.villages) for (const st of villageStructs(v)) for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) VIL_CELLS.add(vilKey(st.x + x, st.y + y));
}
function villageBlocked(x, y) { return VIL_CELLS.size > 0 && VIL_CELLS.has(vilKey(x, y)); }
function raceVillage(r) { return S.world && S.world.villages.find(v => v.race === r && !v.mini); }
function raceFound(r) { return !!S.world && S.world.villages.some(v => v.race === r && v.found); }
function nearestVillage(r, x, y) { let b = null, bd = 1e18; for (const v of S.world.villages) if (v.race === r) { const d = dist2(v.x, v.y, x, y); if ((v.found ? d : d + 1e12) < bd) { bd = v.found ? d : d + 1e12; b = v; } } return b; }

// ---------- жизнь народов раз в минуту ----------
function worldTick() {
  if (!S.world) worldInit();
  syncVillageCells();
  const w = S.world;
  if (!w.v3) relocateVillages(w);
  if (!w.v4) fillHamlets(w);
  terrTick(w);
  // старые сохранения: гоблины и орки всегда враги, войны только между лагерями
  for (const r of RACE_IDS) if (RACES[r].enemy && w.rep[r] > ENEMY_REP_MAX) w.rep[r] = -60;
  worldEverySecond(w);
  if ((w.simT = (w.simT || 60) - 1) > 0) return;
  w.simT = 60;
  const avg = RACE_IDS.reduce((a, r) => a + w.eco[r], 0) / RACE_IDS.length;
  for (const r of RACE_IDS) {
    const lead = w.eco[r] / avg;
    let g = rand(0.6, 1.4) * (w.war[r] ? 0.8 : 1);
    // кто вырвался вперёд больше чем на 10% — кризис: рост, деньги и ресурсы падают; отстающие подтягиваются
    if (lead > 1.1) { g *= 0.2; w.gold[r] *= 0.97; if (Math.random() < 0.1) chronicle(L`${RACES[r].name} богатеют слишком быстро: цены взлетели, соседи косятся, казна тает.`); }
    else if (lead < 0.9) g *= 1.6;
    w.eco[r] += g; w.gold[r] = clamp(w.gold[r] + g * 8, 100, 99999);
  }
  const avg2 = RACE_IDS.reduce((a, r) => a + w.eco[r], 0) / RACE_IDS.length;
  for (const r of RACE_IDS) w.eco[r] = clamp(w.eco[r], avg2 * 0.9, avg2 * 1.1);
  for (const v of w.villages) { v.level = clamp(1 + Math.floor(w.eco[v.race] / 60), 2, 6); if (v.staff < 3 + v.level && Math.random() < 0.08) v.staff++; }
  // загрязнение и рабы портят отношения
  const st = blightStage();
  if (st) { addRep('elf', -0.02 * st); addRep('mage', -0.01 * st); }
  // настроение своих неписей совсем чуть-чуть двигает репутацию народа
  for (const x of S.workers) if (RACES[x.kind] && !RACES[x.kind].enemy && x.mood != null) addRep(x.kind, (x.mood - 50) / 50 * 0.02);
  // случайные дела народов
  if (Math.random() < 0.45) worldEvent(w);
  // войны заканчиваются
  w.wars = w.wars.filter(a => { if (S.time < a.until) return true; chronicle(L`${RACES[a.a].name} и ${RACES[a.b].name} заключили перемирие.`); return false; });
}
function worldEvent(w) {
  const a = pick(RACE_IDS), b = pick(RACE_IDS.filter(x => x !== a));
  if (RACES[a].bloc !== RACES[b].bloc) {
    // разные лагеря не торгуют: только война и стычки
    const atWar = w.wars.some(x => x.a === a && x.b === b || x.a === b && x.b === a);
    if (atWar) {
      const win = w.eco[a] * rand(0.8, 1.2) > w.eco[b] * rand(0.8, 1.2) ? a : b, lose = win === a ? b : a;
      w.eco[lose] *= 0.985; w.gold[lose] *= 0.97; w.gold[win] *= 1.02;
      chronicle(L`Бой на границе: ${RACES[win].name} потеснили ${RACES[lose].name}.`);
    } else if (w.wars.length < 2 && Math.random() < 0.35) {
      w.wars.push({ a, b, until: S.time + rand(900, 2400) });
      chronicle(L`⚔ ${RACES[a].name} объявили войну: ${RACES[b].name}!`);
      log(L`⚔ В мире война: ${RACES[a].name} против ${RACES[b].name}.`);
    } else chronicle(L`Стычка в лесу: ${RACES[a].name} и ${RACES[b].name}.`);
    return;
  }
  // один лагерь: торговля и караваны
  const it = pick(RACES[a].sells)[0];
  w.gold[a] += 15; w.eco[b] += 0.3;
  chronicle(L`Караван: ${RACES[a].name} → ${RACES[b].name}, товар: ${ITEMS[it].name.toLowerCase()}.`);
  const va = raceVillage(a), vb = raceVillage(b);
  if (va && vb && w.caravans.length < 5) w.caravans.push({ a, x0: va.x, y0: va.y, x1: vb.x, y1: vb.y, t0: S.time, dur: dist(va.x, va.y, vb.x, vb.y) / 1.6, id: S.nextId++ });
}
function raceAtWar(r) { return S.world.wars.find(x => x.a === r || x.b === r); }
function worldEverySecond(w) {
  for (const v of w.villages) if (!v.found && nearestHero(v.x, v.y, 34)) {
    v.found = true; explore(v.x, v.y, vilL(v).R + 6);
    log(L`Вы нашли ${v.mini ? L('посёлок') : L('столицу')}: ${RACES[v.race].town} (${RACES[v.race].name}). Отмечено на карте.`, 'good'); chronicle(L`Найдено: ${RACES[v.race].town}.`); sfx('research');
  }
  w.caravans = w.caravans.filter(c => S.time < c.t0 + c.dur);
  // торговец народа сам заходит на базу
  const m = w.visitor;
  if (m && S.time > m.until) { w.visitor = null; closeWin('trade'); }
  if (!w.visitor && S.time >= w.nextVisit) {
    w.nextVisit = S.time + rand(16, 28) * 60;
    const ok = RACE_IDS.filter(r => tradeOk(r) && raceFound(r)); // приезжают только те, кого вы уже нашли
    if (ok.length && S.buildings.size > 3) {
      const r = pick(ok), bc = baseCenter(); let x = bc.x + rand(-6, 6), y = bc.y + rand(-6, 6);
      for (let i = 0; i < 20 && !walkable(Math.floor(x), Math.floor(y)); i++) { x += rand(-3, 3); y += rand(-3, 3); }
      w.visitor = { race: r, x, y, until: S.time + 300 };
      log(L`Торговец народа «${RACES[r].name}» пришёл на базу на 5 минут. Кликните по нему.`, 'good');
    }
  }
  // лавка: что положили — то продаётся само
  for (const b of bldType('market')) {
    b.coinAcc = b.coinAcc || 0;
    let room = TRADE.marketRate;
    for (const id of b.inv.ids()) {
      if (!MARKET_WANTS.has(id)) continue;
      const unit = itemPrice(id) * TRADE.marketK * (1 + (S.bonus.trade || 0));
      while (room >= unit && b.inv.count(id) > 0) { b.inv.remove(id, 1); room -= unit; b.coinAcc += unit; }
      if (room < unit) break;
    }
    const n = Math.floor(b.coinAcc);
    if (n) { addMoney(n); b.coinAcc -= n; }
  }
  // враждебные народы
  for (const v of w.villages) {
    if (!raceHostile(v.race)) continue;
    const R = RACES[v.race], h = nearestHero(v.x, v.y, 26);
    if (h && dist(h.x, h.y, v.x, v.y) < 22 && !(h.dead > 0)) for (const [dx, dy] of vilL(v).towers) {
      if (Math.random() < 0.6 || dist(v.x + dx, v.y + dy, h.x, h.y) > 12) continue;
      spawnProj({ x: v.x + dx, y: v.y + dy - 1, tx: h.x, ty: h.y, dmg: 6 + v.level * 2, aoe: 0, from: 'e', kind: 'arrow', speed: 12, tgt: { k: 'p', h }, track: h });
    }
    if (h && (v.guardT = (v.guardT || 0) - 1) <= 0) {
      v.guardT = 25;
      if (S.enemies.filter(e => e.vil === v.race).length < 4 + v.level) for (let i = 0; i < 2; i++) spawnEnemy(R.soldier, v.x + rand(-3, 3), v.y + rand(-3, 3), 'guard', { vil: v.race });
    }
    if (!R.enemy && !v.mini && S.time >= (v.raidT || 0) && !S.peaceful) {
      v.raidT = S.time + rand(900, 1500);
      const n = 2 + v.level;
      for (let i = 0; i < n; i++) spawnEnemy(R.soldier, v.x + rand(-2, 2), v.y + rand(-2, 2), 'raid', { vil: v.race });
      log(L`${R.name} идут карать вас: ${n} воинов!`, 'warn'); sfx('alarm');
    }
  }
  // запас торговца понемногу пополняется
  for (const v of w.villages) if (S.time >= (v.restock || 0) || !v.want) {
    v.restock = S.time + 300; v.stock = {}; v.want = {};
    if (RACES[v.race].enemy || v.mini) { v.quests = []; continue; }
    for (const [id, n] of RACES[v.race].sells) v.stock[id] = n === 1 ? 1 : Math.round(n * (1 + v.level * 0.25));
    for (const [id, n] of RACES[v.race].buys) v.want[id] = Math.round(n * (1 + v.level * 0.25));
    v.quests = v.quests.filter(q => !q.taken);
    if (v.quests.length < 2) v.quests.push(makeRaceQuest(v.race));
  }
}
// лагерь разгромлен: своим обидно, врагам приятно
function onCampRazed(c) {
  const r = c.type === 'goblin' ? 'goblin' : c.type === 'orc' || c.type === 'orc_big' || c.type === 'citadel' ? 'orc' : null;
  if (!r || !S.world) return;
  addRep(r, -2);
  for (const o of RACE_IDS) if (o !== r && baseRel(o, r) <= -30) addRep(o, 1.5);
}

// ---------- цены ----------
function warPrice(r) { return raceAtWar(r) ? 1.15 : 1; }
function buyPrice(r, id) { return Math.max(1, Math.round(itemPrice(id) * TRADE.buyK * warPrice(r) * (1 - rep(r) / 400) * (1 - (S.bonus.trade || 0) * 0.4))); }
function sellPrice(r, id) { return Math.max(1, Math.round(itemPrice(id) * TRADE.sellK * (1 + rep(r) / 400) * (1 + (S.bonus.trade || 0)))); }

// ---------- задания: принести / найти / зачистить ----------
function makeRaceQuest(r) {
  const R = RACES[r], kind = pick(['bring', 'bring', 'find', 'clear']), lvl = clamp(S.research.done.length / 15, 0.5, 4);
  if (kind === 'clear') {
    const n = lvl > 2 ? 2 : 1;
    return { kind: 'camps', n, rep: 8, coins: Math.round(250 * n * lvl), desc: L`${R.name}: зачистить лагеря врагов (${n})`, race: r };
  }
  if (kind === 'find') {
    const id = Math.random() < 0.5 ? 'relic' : 'gem', n = id === 'relic' ? 1 : 3;
    return { kind: 'deliver', need: { [id]: n }, rep: 7, coins: Math.round(itemPrice(id) * n * 1.2), desc: L`${R.name}: найти ${ITEMS[id].name.toLowerCase()} ×${n}`, race: r };
  }
  const id = pick(R.buys)[0], n = roundLot(Math.max(10, 800 * lvl / itemPrice(id)));
  return { kind: 'deliver', need: { [id]: n }, rep: 6, coins: Math.round(itemPrice(id) * n * 0.8), desc: L`${R.name}: принести ${ITEMS[id].name.toLowerCase()} ×${n}`, race: r };
}

// ---------- окно торговли ----------
// что репутация открывает у этого народа: от меньшей к большей
const REP_STAGES = [
  { at: -101, name: L('Вражда'), c: '#ff5040', note: L('не торгуют') },
  { at: -10, name: L('Нейтралитет'), c: '#c0b8a0', note: L('торговля и задания, товары') },
  { at: 15, name: L('Друг'), c: '#a0d870', note: L('найм рабочих') },
  { at: 45, name: L('Союзник'), c: '#70e0a0', note: L('найм наёмников') },
  { at: 85, name: L('Побратим'), c: '#ffd860', note: L('особая вещь') },
];
function repStagesHtml(r) {
  const val = rep(r), R = RACES[r];
  let cur = 0; REP_STAGES.forEach((t, i) => { if (val >= t.at) cur = i; });
  const nx = REP_STAGES[cur + 1], c0 = REP_STAGES[cur];
  let h = L`<div style="margin-top:2px">Сейчас: <b style="color:${c0.c}">${c0.name}</b> — ${Math.round(val)} очков</div>`;
  if (nx) h += L`<div>До «${nx.name}» осталось <b>${Math.ceil(nx.at - val)}</b> очков</div>${bar((val - c0.at) / (nx.at - c0.at))}`;
  h += '<div style="margin-top:6px">';
  REP_STAGES.slice(1).forEach((t) => {
    const on = val >= t.at, goods = R.sells.filter(g => g[2] === (t.at === -10 ? 0 : t.at)).map(g => ITEMS[g[0]].name.toLowerCase());
    const here = c0 === t;
    h += L`<div style="padding:2px 4px;${here ? 'background:rgba(255,216,96,.12);border-left:3px solid ' + t.c : ''}">${on ? '✔' : '🔒'} <b style="color:${on ? t.c : '#8a8478'}">${t.name}</b> <span class="dim">(от ${t.at})</span>: ${t.note}${goods.length ? ', ' + goods.join(', ') : ''}${here ? L(' <b>← вы здесь</b>') : ''}</div>`;
  });
  h += '</div>';
  h += L`<div class="dim" style="margin-top:4px">Очки дают: задание +6…+8, торговля +1 за 1500 монет, разгром лагеря орков или гоблинов +1,5. Отнимают: проваленное задание −4${r === 'dwarf' ? '' : L(', дым заводов понемногу')}.</div>`;
  const d = Math.round(val / 4);
  if (d) h += L`<div class="dim">Из-за репутации цены товаров ${d > 0 ? L('ниже') : L('выше')} на ${Math.abs(d)}%, а ваш товар ${d > 0 ? L('дороже') : L('дешевле')} на столько же.</div>`;
  return h;
}
function renderTradeWin(r) {
  if (r) UI.tradeRace = r;
  r = UI.tradeRace;
  const R = RACES[r], v = raceVillage(r);
  if (!R || !S.world) return;
  const inv = S.player.inv, val = rep(r), T = repTier(val), st = v ? v.stock || {} : {}, want = v ? v.want || {} : {};
  let h = `<div class="row" style="justify-content:space-between"><b style="color:${R.color}">${R.name}</b><span>🪙 <b>${fmtNum(Math.floor(S.money || 0))}</b></span></div>`;
  if (R.enemy) { h += L`<div class="bad">${R.name} никогда не будут с вами торговать и дружить. Они торгуют только с ${r === 'orc' ? L('гоблинами') : L('орками')}, воюют со светлыми народами, а чужаков встречают стрелами.</div>`; return tradeWinSet(h, R); }
  h += repStagesHtml(r);
  const war = raceAtWar(r);
  if (war) h += L`<div class="warn">Идёт война (${RACES[war.a === r ? war.b : war.a].name}): цены товаров выше на 15%.</div>`;
  if (raceHostile(r)) { h += L`<div class="bad">Этот народ воюет с вами: торговли нет, его воины нападают на базу.</div><div class="row" style="margin-top:6px"><span>Откупиться и заключить мир: 🪙${HIRE.peace}</span><button data-act="racePeace" data-arg="${r}">Предложить мир</button></div>`; return tradeWinSet(h, R); }
  if (val < -10) { h += L('<div class="bad">С вами здесь не разговаривают: нужно хотя бы −10 очков. Разгромите лагеря орков и гоблинов.</div>'); return tradeWinSet(h, R); }
  h += L('<h3>Товары</h3>');
  for (const [id, , need] of R.sells) {
    const n = st[id] || 0, p = buyPrice(r, id), locked = val < need;
    h += `<div class="row">${iconHtml(id)} <span data-tip="i:${id}">${ITEMS[id].name}</span> ${locked ? `<span class="dim">🔒 ${(REP_STAGES.find(t => t.at === need) || {}).name}</span>` : L`<span class="dim">есть ${n}</span> <span>🪙${p}</span>
      <button data-act="raceBuy" data-arg="${r}|${id}|1" ${n < 1 ? 'disabled' : ''}>×1</button>${n > 1 ? `<button data-act="raceBuy" data-arg="${r}|${id}|10">×10</button>` : ''}`}</div>`;
  }
  const bp = R.perk && BLUEPRINTS[R.perk];
  if (bp && !S.blueprints.includes(R.perk)) h += `<div class="row">✨ ${bp.name} ${val >= 85 ? L`<span>🪙${bp.coins}</span><button data-act="racePerk" data-arg="${r}">Купить</button>` : L('<span class="dim">🔒 Побратим</span>')}</div>`;
  h += L('<h3>Что им нужно</h3><div class="dim">Покупают только это и только сколько нужно сейчас. Спрос обновляется раз в 5 минут.</div>');
  const list = R.buys.map(b => b[0]).sort((a, b) => (inv.count(b) > 0) - (inv.count(a) > 0));
  for (const id of list) {
    const w = want[id] || 0, have = inv.count(id);
    h += L`<div class="row">${iconHtml(id)} ${ITEMS[id].name} <span class="dim">нужно ${w}, у вас ${have}</span> <span>🪙${sellPrice(r, id)}</span>
      <button data-act="raceSell" data-arg="${r}|${id}|1" ${w < 1 || have < 1 ? 'disabled' : ''}>×1</button><button data-act="raceSell" data-arg="${r}|${id}|all" ${w < 1 || have < 1 ? 'disabled' : ''}>Сколько возьмут</button></div>`;
  }
  h += L('<h3>Задания</h3>');
  const qs = (v ? v.quests : []).filter(q => !q.taken);
  if (!qs.length) h += L('<div class="dim">Пока заданий нет.</div>');
  qs.forEach((q, i) => { h += L`<div class="row">📜 ${q.desc} <span class="dim">🪙${q.coins}, репутация +${q.rep}</span><button data-act="raceQuest" data-arg="${r}|${i}">Взять</button></div>`; });
  h += L('<h3>Найм</h3>');
  if (!v || v.staff <= 0) h += L('<div class="dim">Сейчас в поселении нет лишних рук. Загляните позже.</div>');
  else {
    const cW = hireCost(HIRE.workerCost), cM = hireCost(HIRE.mercCost);
    h += L`<div class="row">Рабочий-${R.one} <span class="dim">(${NPC[r].about})</span> ${val >= HIRE.workerRep ? L`<span>🪙${cW}</span><button data-act="raceHire" data-arg="${r}">Нанять</button>` : L('<span class="dim">🔒 Друг</span>')}</div>`;
    h += L`<div class="row">Наёмник-${R.one} <span class="dim">(ходит за вами и бьётся, ${HIRE.mercWage} монет в 5 минут)</span> ${val >= HIRE.mercRep ? L`<span>🪙${cM}</span><button data-act="raceMerc" data-arg="${r}">Нанять</button>` : L('<span class="dim">🔒 Союзник</span>')}</div>`;
    h += L`<div class="dim">Свободных людей в поселении: ${v.staff}</div>`;
  }
  h += L`<div class="row" style="margin-top:8px"><button class="danger" data-act="raceAttack" data-arg="${r}">Объявить войну</button></div>`;
  tradeWinSet(h, R);
}
function tradeWinSet(h, R) { if (UI.wins.trade) setWinBody('trade', h); else openWin('trade', L`Торговец: ${R.town}`, h, { width: 520 }); }
function hireCost(c) { return Math.round(c * (1 - (S.bonus.hire || 0))); }
function repayMsg(n) { hint(L`Не хватает монет: нужно ${n}`); sfx('error'); }
ACT.raceBuy = (arg) => {
  const [r, id, nn] = arg.split('|'), v = raceVillage(r); if (!v || !tradeOk(r)) return;
  const it = RACES[r].sells.find(x => x[0] === id); if (!it || rep(r) < it[2]) return;
  const n = Math.min(+nn, v.stock[id] || 0), p = buyPrice(r, id) * n;
  if (n < 1) return;
  if ((S.money || 0) < p) return repayMsg(p);
  const got = S.player.inv.add(id, n);
  if (got < 1) { hint(L('Инвентарь полон')); return; }
  addMoney(-buyPrice(r, id) * got); v.stock[id] -= got; addRep(r, buyPrice(r, id) * got / 1500);
  sfx('coins'); renderTradeWin();
};
ACT.raceSell = (arg) => {
  const [r, id, nn] = arg.split('|'), inv = S.player.inv, v = raceVillage(r);
  if (!v || !tradeOk(r) || !v.want || !v.want[id]) return; // чего им не надо, того не покупают
  const n = Math.min(nn === 'all' ? inv.count(id) : +nn, inv.count(id), v.want[id]);
  if (n < 1) return;
  inv.remove(id, n); v.want[id] -= n; const g = sellPrice(r, id) * n;
  addMoney(g); addRep(r, g / 1500); S.world.gold[r] = Math.max(100, S.world.gold[r] - g * 0.1);
  sfx('coins'); renderTradeWin();
};
ACT.racePerk = (r) => {
  const R = RACES[r], bp = R.perk && BLUEPRINTS[R.perk];
  if (!bp || S.blueprints.includes(R.perk) || rep(r) < 85) return;
  if ((S.money || 0) < bp.coins) return repayMsg(bp.coins);
  addMoney(-bp.coins); S.blueprints.push(R.perk); recomputeBonus();
  log(L`Получено: ${bp.name}`, 'good'); sfx('victory'); renderTradeWin();
};
ACT.raceQuest = (arg) => {
  const [r, i] = arg.split('|'), v = raceVillage(r), q = v && v.quests.filter(o => !o.taken)[+i];
  if (!q) return;
  q.taken = true;
  S.quests.push(Object.assign({ id: S.nextId++, deadline: S.time + 25 * 60, base: S.stats.camps || 0, reward: {} }, q));
  log(L('Новое задание: ') + q.desc + L(' (25 минут)'), 'good'); sfx('click'); renderTradeWin();
};
ACT.raceHire = (r) => {
  const v = raceVillage(r), c = hireCost(HIRE.workerCost);
  if (!tradeOk(r) || !v || v.staff <= 0 || rep(r) < HIRE.workerRep) return;
  if ((S.money || 0) < c) return repayMsg(c);
  addMoney(-c); v.staff--;
  const w = addWorker(r); w.free = true; w.shackled = r === 'orc';
  log(L`Нанят рабочий: ${RACES[r].one} ${w.name}. Поставьте его на станок (окно постройки).`, 'good'); sfx('coins'); renderTradeWin();
};
ACT.raceMerc = (r) => {
  const v = raceVillage(r), c = hireCost(HIRE.mercCost), p = S.player;
  if (!tradeOk(r) || !v || v.staff <= 0 || rep(r) < HIRE.mercRep) return;
  if ((S.money || 0) < c) return repayMsg(c);
  addMoney(-c); v.staff--;
  S.mercs.push({ id: S.nextId++, merc: true, race: r, name: pick(NPC[r].names), x: p.x + rand(-1, 1), y: p.y + rand(-1, 1), ghp: MERC.hp * MERC_RACE[r].hp, wageT: S.time + HIRE.mercWageT, cd: 0 });
  log(L`Наёмник с вами: ${RACES[r].one}. Он поможет даже против Владыки эльфов.`, 'good'); sfx('coins'); renderTradeWin();
};
ACT.racePeace = (r) => {
  if (RACES[r].enemy) return;
  if ((S.money || 0) < HIRE.peace) return repayMsg(HIRE.peace);
  addMoney(-HIRE.peace); S.world.war[r] = false; S.world.rep[r] = Math.max(rep(r), -24);
  log(L`Мир с народом: ${RACES[r].name}. Дальше всё зависит от вас.`, 'good'); sfx('coins'); renderTradeWin();
};
ACT.raceAttack = (r) => {
  if (RACES[r].enemy) return;
  S.world.war[r] = true; addRep(r, -70);
  for (const o of RACE_IDS) if (o !== r) addRep(o, -3);
  log(L`Вы объявили войну: ${RACES[r].name}!`, 'warn'); closeWin('trade');
};

// ---------- наёмники ----------
const MERC = { hp: 220, speed: 4.4, dmg: 26, cd: 0.9, range: 1.5, rangeShoot: 6, aggro: 11 };
// у наёмников каждого народа свой характер: орк силён, гоблин быстр и хрупок, дворф живуч, эльф и маг бьют издалека
const MERC_RACE = { goblin: { hp: 0.6, dmg: 0.7, speed: 1.3, cd: 0.7 }, orc: { hp: 1.2, dmg: 1.4, speed: 0.95, cd: 1.1 }, elf: { hp: 0.9, dmg: 1.1, speed: 1.1, cd: 1 }, dwarf: { hp: 1.6, dmg: 1.1, speed: 0.8, cd: 1.1 }, mage: { hp: 0.7, dmg: 1.5, speed: 0.9, cd: 1.3 } };
function mercMaxHp(w) { return MERC.hp * MERC_RACE[w.race].hp; }
function updateMercs(dt) {
  const p = S.player;
  for (const w of (S.mercs || []).slice()) {
    if (S.time >= w.wageT) {
      w.wageT = S.time + HIRE.mercWageT;
      if ((S.money || 0) >= HIRE.mercWage) addMoney(-HIRE.mercWage);
      else { S.mercs.splice(S.mercs.indexOf(w), 1); log(L`Наёмник ${w.name} ушёл: нечем платить.`, 'warn'); continue; }
    }
    const shoot = w.race === 'elf' || w.race === 'mage', reach = shoot ? MERC.rangeShoot : MERC.range, M = MERC_RACE[w.race];
    let foe = null, fd = MERC.aggro * MERC.aggro;
    for (const e of EHASH.query(w.x, w.y, MERC.aggro, _q)) { if (e.dead) continue; const d = dist2(e.x, e.y, w.x, w.y); if (d < fd) { fd = d; foe = e; } }
    w.cd -= dt;
    if (foe) {
      if (Math.sqrt(fd) > reach * 0.85) guardMove(w, foe.x, foe.y, dt, MERC.speed * M.speed);
      else w.moving = false;
      if (Math.sqrt(fd) <= reach + 0.3 && w.cd <= 0) {
        w.cd = MERC.cd * M.cd; w.atkT = S.time; w.ang = Math.atan2(foe.y - w.y, foe.x - w.x);
        hurtEnemy(foe, MERC.dmg * M.dmg, { x: w.x, y: w.y, merc: true });
        if (shoot) FX.push({ x: w.x, y: w.y - 0.5, vx: (foe.x - w.x) * 6, vy: (foe.y - w.y) * 6, life: 0.16, c: w.race === 'mage' ? '#90a0ff' : '#e8f0c0' });
      }
    } else {
      const a = w.id * 2.4, tx = p.x + Math.cos(a) * 2, ty = p.y + Math.sin(a) * 2;
      if (dist(w.x, w.y, p.x, p.y) > 60) { w.x = tx; w.y = ty; }
      if (dist(w.x, w.y, tx, ty) > 1) guardMove(w, tx, ty, dt, MERC.speed * M.speed); else w.moving = false;
      if (S.time - (w.hurtT || -99) > 5) w.ghp = Math.min(mercMaxHp(w), w.ghp + 4 * dt);
    }
  }
}
function drawMerc(w, t) {
  const atk = w.atkT && S.time - w.atkT < 0.35;
  drawUnit3D(RACES[w.race].unit, w.x, w.y, { ang: w.ang != null ? w.ang : Math.PI / 2, anim: atk ? 'swing' : w.moving ? 'run' : 'stance', t: w.moving ? (w.walk || 0) * 1.2 : t + w.id, k: atk ? (S.time - w.atkT) / 0.35 : null });
  if (w.ghp < mercMaxHp(w)) hpBar(w.x - 0.3, w.y - 1.25, 0.6, w.ghp / mercMaxHp(w), null);
  npcLabel('⚔ ' + w.name, w.x, w.y - 1.4, '#ffe0a0', 1);
}

// ---------- на карте ----------
function drawVillageStruct(s) { drawProp('build', s.key, s.x, s.y); }
function drawVillageTrader(v, t) {
  drawUnit3D(RACES[v.race].unit, v.x + 0.5, v.y + 0.5, { ang: Math.PI / 2, anim: 'stance', t: t + v.x, flash: false });
  npcLabel(RACES[v.race].enemy ? `${RACES[v.race].town}` : L`🪙 ${RACES[v.race].town}${v.mini ? L(' (посёлок)') : ''}: торговец`, v.x + 0.5, v.y - 0.9, RACES[v.race].color, 1);
}
function pushVillages(D, inView) {
  if (!S.world) return;
  for (const v of S.world.villages) {
    if (Math.abs(v.x - CAM.x) > 70 || Math.abs(v.y - CAM.y) > 55) continue;
    for (const s of villageStructs(v)) if (inView(s.x, s.y)) D.push({ y: s.y + s.h, t: 14, o: s });
    if (inView(v.x, v.y)) D.push({ y: v.y + 0.5, t: 15, o: v });
  }
  const m = S.world.visitor;
  if (m && inView(m.x, m.y)) D.push({ y: m.y, t: 16, o: m });
  for (const c of S.world.caravans) { const k = (S.time - c.t0) / c.dur, x = lerp(c.x0, c.x1, k), y = lerp(c.y0, c.y1, k); if (inView(x, y)) D.push({ y, t: 17, o: { c, x, y } }); }
  for (const w of S.mercs || []) if (inView(w.x, w.y)) D.push({ y: w.y, t: 18, o: w });
  for (const w of S.strays || []) if (inView(w.x, w.y)) D.push({ y: w.y, t: 19, o: w });
  for (const f of S.world.battles || []) if (inView(f.x, f.y)) D.push({ y: f.y + 1, t: 20, o: f });
}
function drawVisitor(m, t) {
  drawUnit3D(RACES[m.race].unit, m.x, m.y, { ang: Math.PI / 2, anim: 'stance', t });
  npcLabel(L`🪙 Торговец: ${RACES[m.race].name}`, m.x, m.y - 1.4, RACES[m.race].color, 1);
}
function drawCaravan(o, t) {
  const c = o.c, dx = c.x1 - c.x0, dy = c.y1 - c.y0, dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  drawProp('build', 'cart_' + dir, o.x - 0.7, o.y - 0.7, { scale: 1.4 });
  drawUnit3D(RACES[c.a].unit, o.x - 1, o.y + 0.2, { ang: Math.atan2(dy, dx), anim: 'run', t: t * 1.2 });
}
// клик по торговцу или беженцу
function raceClickAt(x, y) {
  if (!S.world) return false;
  const near = (o, r) => dist(o.x, o.y - 0.4, x, y) < r;
  const m = S.world.visitor;
  if (m && near(m, 0.9)) { renderTradeWin(m.race); return true; }
  for (const v of S.world.villages) if (near({ x: v.x + 0.5, y: v.y + 0.5 }, 0.9)) { renderTradeWin(v.race); return true; }
  for (const w of S.strays || []) if (near(w, 0.9)) { if (MP.role === 'client') mpSendAct('strayJoin', w.id); else ACT.strayJoin(w.id); return true; }
  return false;
}

// ---------- окно мира ----------
function renderWorldWin() {
  const w = S.world;
  if (!w) return;
  const avg = RACE_IDS.reduce((a, r) => a + w.eco[r], 0) / RACE_IDS.length, bc = S.player;
  let h = L`<div class="row" style="justify-content:space-between"><b>🪙 Монеты: ${fmtNum(Math.floor(S.money || 0))}</b><span class="dim">Монеты дают торговля, лавка и задания</span></div>`;
  h += L('<table style="width:100%;border-collapse:collapse;margin-top:6px"><tr class="dim"><td>Народ</td><td>Репутация</td><td>Земли</td><td>Развитие</td><td>Казна</td><td>Поселение</td></tr>');
  for (const r of RACE_IDS) {
    const R = RACES[r], v = nearestVillage(r, bc.x, bc.y), T = repTier(rep(r)), war = raceAtWar(r);
    h += `<tr style="border-top:1px solid #4a4238"><td style="color:${R.color}"><b>${R.name}</b>${war ? `<div class="warn">⚔ ${RACES[war.a === r ? war.b : war.a].name}</div>` : ''}${RACES[r].enemy ? L('<div class="bad">враг навсегда</div>') : raceHostile(r) ? L('<div class="bad">воюет с вами</div>') : ''}</td>
      <td><span style="color:${T[2]}">${T[1]}</span> ${Math.round(rep(r))}</td><td>${landShares()[r] || 0}%</td><td>${Math.round(w.eco[r] / avg * 100)}%</td><td>${fmtNum(Math.round(w.gold[r]))}</td>
      <td>${!v ? L('<span class="dim">нет</span>') : v.found ? L`${R.town}<div class="dim">${Math.round(dist(v.x, v.y, bc.x, bc.y))} кл. на ${dirName(v.x - bc.x, v.y - bc.y)}</div>` : L`<span class="warn">не найдено</span><div class="dim">слухи: где-то на ${dirName(v.x - baseCenter().x, v.y - baseCenter().y)}, очень далеко</div>`}</td></tr>`;
  }
  h += L('</table><div class="dim" style="margin-top:4px">Светлые эльфы, дворфы и маги торгуют с вами и между собой. Гоблины и орки торгуют только друг с другом и всегда враждебны. Между этими двумя лагерями только война. Кто обгоняет среднее больше чем на 10%, ловит кризис. Границы земель всё время меняются: смотрите цветные области на карте (M).</div>');
  const m = (S.mercs || []).length;
  if (m) h += L`<div style="margin-top:6px">Наёмников с вами: <b>${m}</b> (${HIRE.mercWage} монет каждому раз в 5 минут)</div>`;
  h += L('<h3>Хроника мира</h3>');
  for (const e of w.log.slice(0, 14)) h += `<div class="line"><span class="dim">${fmtTime(e.t)}</span> ${e.txt}</div>`;
  if (UI.wins.world) setWinBody('world', h); else openWin('world', L('Народы мира (U)'), h, { width: 620 });
}
ACT.worldwin = () => { if (UI.wins.world) closeWin('world'); else renderWorldWin(); UI.dirty = true; };
