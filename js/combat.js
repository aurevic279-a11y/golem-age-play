'use strict';
// Бой: враги, снаряды, башни, оружие Анимансера, заклинания, эффекты.

const EHASH = new SpatialHash(8);
const _q = [];
let FX = [];      // частицы
let FTEXT = [];   // всплывающий текст

function spawnEnemy(type, x, y, mode, extra) {
  const d = ENEMIES[type];
  // ищем сушу рядом (не в воде и не в постройке лагеря): по кольцам вокруг точки, а не наугад
  const fs = !d.fly && nearestEPass(x, y, 14);
  if (fs) { x = fs.x; y = fs.y; }
  const e = Object.assign({ id: S.nextId++, type, x, y, hp: d.hp, maxHp: d.hp, cd: rand(0, 1), mode: mode || 'raid', tgt: null, think: 0, stun: 0, slow: 1, face: 1, campId: null, dmgMul: (1 + (S.evo || 0) * 0.6) * TUNE.enemyDmg }, extra || {});
  // эльфы слабее в начале игры и крепнут к третьему часу
  if (mode === 'elf' && !d.boss) e.hp = e.maxHp = Math.round(d.hp * clamp(0.5 + S.time / 3600 * 0.17, 0.5, 1.5));
  // осадные орудия крепнут с эволюцией слабее, чтобы их всегда можно было разбить
  else if (S.enemyScale && mode !== 'guard') e.hp = e.maxHp = Math.round(d.hp * (d.siege ? Math.min(1.5, 1 + (S.enemyScale - 1) * 0.3) : S.enemyScale));
  if (TUNE.enemyHp !== 1) e.hp = e.maxHp = Math.max(1, Math.round(e.maxHp * TUNE.enemyHp));
  if (e.hx == null) { e.hx = x; e.hy = y; }
  S.enemies.push(e);
  return e;
}
// проходимость для пути врага: вода, скалы пещер и постройки лагерей — нет; постройки игрока — да (их враг ломает)
function ePass(x, y) { return campPass(x, y); }
// ближайшая проходимая точка (середина клетки) по кольцам
function nearestEPass(x, y, maxR) {
  const bx = Math.floor(x), by = Math.floor(y);
  if (ePass(bx, by) && enemyWalkable(bx, by)) return { x, y };
  for (let r = 1; r <= (maxR || 10); r++) {
    let best = null, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = bx + dx, ny = by + dy;
      if (!ePass(nx, ny) || !enemyWalkable(nx, ny)) continue;
      const d = dist2(nx + 0.5, ny + 0.5, x, y);
      if (d < bd) { bd = d; best = { x: nx + 0.5, y: ny + 0.5 }; }
    }
    if (best) return best;
  }
  return null;
}

function hurtEnemy(e, dmg, src) {
  if (e.hp <= 0) return;
  const d = ENEMIES[e.type];
  // Владыку эльфов по-настоящему ранит только Великий Голем
  if (e.type === 'elf_lord' && !(src && src.colossus)) {
    dmg *= 0.08;
    if (S.time - (S.lordHint || -99) > 15) { S.lordHint = S.time; hint('Владыка почти неуязвим — только Великий Голем может сразить его!'); }
  }
  const real = Math.max(1, dmg - d.armor);
  e.hp -= real;
  e.flash = 0.12;
  // отбрасывание от удара и искры
  const p = S.player, sx0 = src && src.x != null ? src.x : p.x, sy0 = src && src.y != null ? src.y : p.y;
  const dl = dist(e.x, e.y, sx0, sy0) || 1, kb = Math.min(0.35, 0.06 + real / 120) / (d.boss ? 4 : d.size);
  e.kbx = (e.x - sx0) / dl * kb; e.kby = (e.y - sy0) / dl * kb * 0.6; e.kbT = 0.18;
  for (let i = 0; i < 3 + Math.min(6, real / 8); i++) FX.push({ x: e.x + rand(-0.15, 0.15), y: e.y - d.size * 0.6, vx: rand(-2.5, 2.5), vy: rand(-3, -0.5), life: rand(0.15, 0.35), c: pick(['#fff4c0', '#ffd060', '#ff9040', '#c03020']), s: 0.07 });
  if (real >= 5) floatText(e.x, e.y - 0.5, Math.round(real), '#ffd060');
  if (e.hp <= 0) killEnemy(e, src);
}

function killEnemy(e, src) {
  e.hp = 0;
  e.dead = true;
  addCorpse(e);
  if (typeof MP !== 'undefined' && MP.role === 'host') (MP.deaths || (MP.deaths = [])).push([e.type, +e.x.toFixed(2), +e.y.toFixed(2), +(e.ang || 0).toFixed(2)]);
  S.stats.kills = (S.stats.kills || 0) + 1;
  spawnBurst(e.x, e.y, ENEMIES[e.type].boss ? '#a040ff' : '#7a2a1a', ENEMIES[e.type].boss ? 40 : 8);
  if (ENEMIES[e.type].boss) onLordKilled();
  // добыча со стервятников — сразу в инвентарь ближайшего героя (лишнее, если некуда, — на землю)
  if (e.type === 'crow') {
    const h = (src && src.inv ? src : null) || nearestHero(e.x, e.y, 40) || S.player;
    const give = (id, n) => { const got = h.inv ? h.inv.add(id, n) : 0; if (got) floatText(e.x, e.y - 0.4, '+' + got + ' ' + ITEMS[id].name.toLowerCase(), '#e0d0a0'); if (n - got > 0 && typeof dropItems === 'function') dropItems(e.x, e.y, id, n - got); };
    give('feather', randi(1, 2)); if (Math.random() < 0.4) give('raw_meat', 1);
  }
  if (e.type === 'cave_troll') onTrollKilled(e);
  if (e.type === 'merchant_foe') onMerchantKilled(e);
  if (e.type.startsWith('elf')) {
    // эльфы иногда роняют мифрил
    if (Math.random() < 0.15) { S.player.inv.add('mithril', 1); floatText(e.x, e.y, '+мифрил', '#9fe8ff'); }
  }
}

// ---------- цели врагов ----------
function nearestBuilding(x, y, maxD) {
  // мины и особые постройки мира (пещеры, сундуки с добычей) враги не трогают
  return nearestBldWhere(x, y, maxD, b => BUILDINGS[b.type].kind !== 'trap' && BUILDINGS[b.type].cat !== 'special');
}
// цель налёта по важности: обычные постройки важнее всего, ворота чуть важнее стен, стены — последними.
// важность — скидка к расстоянию: постройка −6 клеток, ворота −2 (так стену рядом ломают, а не бегут к далёким воротам)
function raidTarget(x, y, maxD) {
  const ok = o => BUILDINGS[o.type].kind !== 'trap' && BUILDINGS[o.type].cat !== 'special';
  const b = nearestBldWhere(x, y, maxD, o => ok(o) && BUILDINGS[o.type].kind !== 'wall');
  const gt = nearestGate(x, y, maxD);
  const w = nearestBldWhere(x, y, maxD, o => BUILDINGS[o.type].kind === 'wall' && !BUILDINGS[o.type].gate);
  const cand = [[b, 6], [gt, 2], [w, 0]].filter(c => c[0]);
  let best = null, bs = 1e9;
  for (const [o, bonus] of cand) { const s = dist(o.x + o.w / 2, o.y + o.h / 2, x, y) - bonus; if (s < bs) { bs = s; best = o; } }
  return best;
}

// диверсанты набегов: ищут конвейеры, валы, акведуки и векторы — линии снабжения на окраинах
const SAB_KINDS = new Set(['belt', 'shaft', 'pipe', 'vector', 'pump']);
function nearestLogistics(x, y, maxD) { return nearestBldWhere(x, y, maxD, b => SAB_KINDS.has(BUILDINGS[b.type].kind)); }
function nearestFueler(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const g of S.golems) { if (g.type !== 'fueler' || g.hidden) continue; const d = dist2(g.x, g.y, x, y); if (d < bd) { bd = d; best = g; } }
  return best;
}

// ближайшие ворота
function nearestGate(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const b of bldKind('wall')) {
    if (!BUILDINGS[b.type].gate) continue;
    const d = dist2(b.x + 0.5, b.y + 0.5, x, y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function nearestGolem(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const g of S.golems) {
    if (g.hidden) continue;
    const d = dist2(g.x, g.y, x, y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

// все герои в мире: свой и (у хозяина совместной игры) герои друзей
function heroList() {
  const a = [S.player];
  if (typeof MP !== 'undefined' && MP.role === 'host') for (const id in MP.guests) a.push(MP.guests[id].hero);
  return a;
}
function nearestHero(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const h of heroList()) { if (h.dead > 0) continue; const d = dist2(h.x, h.y, x, y); if (d < bd) { bd = d; best = h; } }
  return best;
}
// урон герою: своему — напрямую, другу — от его имени
function damageHero(h, d, kind) {
  if (!h || h === S.player) { damagePlayer(d, kind); return; }
  for (const id in MP.guests) if (MP.guests[id].hero === h) { asGuest(MP.guests[id], () => damagePlayer(d, kind)); return; }
}

function enemyTarget(e) {
  const p = S.player, d = ENEMIES[e.type];
  // осадные машины бьют только постройки: таран — ворота, катапульта — что ближе
  if (d.siege) {
    // таран — по важности, как все (постройки, потом ворота, потом стены); катапульта — сперва по башням, которые в неё стреляют
    const tw = d.siege === 'catapult' ? nearestBldWhere(e.x, e.y, 14, o => BUILDINGS[o.type].kind === 'tower') : null;
    const b = tw || raidTarget(e.x, e.y, 200);
    return b ? { k: 'b', id: b.id } : toBase(e);
  }
  if (e.type === 'merchant_foe') { const h = nearestHero(e.x, e.y, 40); return h ? { k: 'p', h } : null; }
  if (e.mode === 'wild') { if (e.flee > S.time) return null; const h = nearestHero(e.x, e.y, 30); return h ? { k: 'p', h } : null; }
  // тревога: лагерь атакуют — все его бойцы идут на обидчика, как бы далеко он ни стоял (в пределах 45 клеток)
  if (e.alertT > S.time) {
    const h = e.alertH && !(e.alertH.dead > 0) && dist(e.x, e.y, e.alertH.x, e.alertH.y) < 45 ? e.alertH : nearestHero(e.x, e.y, 30);
    if (h) return { k: 'p', h };
    const ab = e.alertB != null && S.buildings.get(e.alertB);
    if (ab && dist(e.x, e.y, ab.x, ab.y) < 45) return { k: 'b', id: ab.id };
  }
  const aggro = e.sentry ? 10 : e.mode === 'guard' ? 12 : 10;
  const near = nearestHero(e.x, e.y, aggro + d.range);
  if (near) return { k: 'p', h: near };
  // голем рядом — нападаем на него
  const gm = nearestGolem(e.x, e.y, e.mode === 'guard' ? 7 : 6 + d.range);
  if (gm) return { k: 'g', id: gm.id };
  // налётчики у дороги нападают на охрану караванов и на сами повозки
  if (e.mode !== 'guard' && e.mode !== 'wild') {
    const gw = nearestGuard(e.x, e.y, 6 + d.range);
    if (gw) return { k: 'w', id: gw.id };
    const ct = nearestCart(e.x, e.y, 7 + d.range);
    if (ct) return { k: 'c', id: ct.id };
  }
  if (e.mode === 'guard') return guardPost(e);
  if (e.sab) {
    // диверсант: сначала заправщики, потом конвейеры и валы — так растянутые линии снабжения тоже надо охранять
    const fu = nearestFueler(e.x, e.y, 30);
    if (fu) return { k: 'g', id: fu.id };
    const lb = nearestLogistics(e.x, e.y, 160);
    if (lb) return { k: 'b', id: lb.id };
  }
  const b = raidTarget(e.x, e.y, e.mode === 'elf' ? 400 : 160);
  if (b) return { k: 'b', id: b.id };
  const far = nearestHero(e.x, e.y, 40);
  if (far) return { k: 'p', h: far };
  return e.mode === 'raid' ? toBase(e) : null;
}
// охрана без врага рядом: стоит на своём посту у лагеря и изредка меняет его (раньше бегала к случайной точке
// каждую секунду и «била воздух» — отсюда дёрганье); дозорные обходят кольцо вокруг лагеря
function guardPost(e) {
  if (!e.post || S.time > e.postT) {
    const camp = e.campId != null ? S.camps.find(c => c.id === e.campId) : null;
    let x, y;
    if (camp && e.sentry) {
      e.sentryA = (e.sentryA == null ? rand(0, 6.28) : e.sentryA) + rand(-0.35, 0.35);
      const R = campRadius(camp) + 6;
      x = camp.x + Math.cos(e.sentryA) * R; y = camp.y + Math.sin(e.sentryA) * R;
    } else if (camp) {
      const a = rand(0, 6.28), r = rand(2, campRadius(camp) * 0.75);
      x = camp.x + Math.cos(a) * r; y = camp.y + Math.sin(a) * r;
    } else { x = e.hx + rand(-3, 3); y = e.hy + rand(-3, 3); }
    const f = nearestEPass(x, y, 6) || { x: e.x, y: e.y };
    e.post = f; e.postT = S.time + (e.sentry ? rand(5, 9) : rand(10, 22));
  }
  return { k: 'pt', x: e.post.x, y: e.post.y, idle: true };
}
// набег из дальнего лагеря: построек ещё не видно — идём к базе (раньше такие набеги стояли и расходились)
function toBase(e) {
  if (!S.buildings.size) return null;
  const bc = baseCenter();
  if (dist(e.x, e.y, bc.x, bc.y) < 12) return null;
  return { k: 'pt', x: bc.x + rand(-4, 4), y: bc.y + rand(-4, 4) };
}

function targetPos(e) {
  const t = e.tgt;
  if (!t) return null;
  if (t.k === 'p') { const p = t.h || S.player; return p.dead > 0 ? null : { x: p.x, y: p.y, r: 0.3 }; }
  if (t.k === 'pt') return { x: t.x, y: t.y, r: 0, pt: true, idle: t.idle };
  if (t.k === 'g') { const g = S.golems.find(o => o.id === t.id); return g && !g.hidden ? { x: g.x, y: g.y, r: 0.3, g } : null; }
  if (t.k === 'w') { const w = S.workers.find(o => o.id === t.id); return w && w.guard && w.x != null ? { x: w.x, y: w.y, r: 0.3, w } : null; }
  if (t.k === 'c') { const c = S.carts.find(o => o.id === t.id); return c ? { x: c.x, y: c.y, r: 0.6, c } : null; }
  if (t.k === 'b') {
    const b = S.buildings.get(t.id);
    if (!b) return null;
    // ближайшая точка постройки
    const cx = clamp(e.x, b.x, b.x + b.w), cy = clamp(e.y, b.y, b.y + b.h);
    return { x: cx, y: cy, r: 0, b };
  }
  return null;
}

function enemyAttack(e, tp) {
  const d = ENEMIES[e.type];
  e.cd = d.cd;
  e.atkT = 0; e.atkTx = tp.x; e.atkTy = tp.y;
  e.ang = Math.atan2(tp.y - e.y, tp.x - e.x);
  e.face = tp.x < e.x ? -1 : 1;
  if (d.proj) {
    // снаряды врагов слегка доворачивают за целью — от них не увернуться простым шагом в сторону
    const track = d.proj === 'boulder' ? null : tp.g || (e.tgt && e.tgt.k === 'p' ? e.tgt.h || S.player : null);
    spawnProj({ x: e.x, y: e.y, tx: tp.x, ty: tp.y, dmg: d.dmg * (d.siege ? Math.min(1.2, e.dmgMul || 1) : (e.dmgMul || 1)), aoe: d.aoe || 0, from: 'e', kind: d.proj, speed: d.proj === 'arcane' ? 7 : 10, tgt: e.tgt, track });
    if (d.proj === 'arcane') sfx('arcane', e.x, e.y);
  } else {
    if (d.aoe) {
      // владыка бьёт по площади
      spawnBurst(tp.x, tp.y, '#a040ff', 10);
      areaDamageFriendly(tp.x, tp.y, d.aoe, d.dmg);
    } else if (e.tgt.k === 'p') {
      damageHero(e.tgt.h, d.dmg * (e.dmgMul || 1));
      // шипастые латы ранят того, кто бьёт вплотную
      const h = e.tgt.h || S.player, ar = h.armor && ARMORS[h.armor];
      if (ar && ar.thorns && !(h.dead > 0)) hurtEnemy(e, d.dmg * (e.dmgMul || 1) * ar.thorns, h);
    }
    else if (tp.g) hurtGolem(tp.g, d.dmg * (e.dmgMul || 1));
    else if (tp.w) hurtGuard(tp.w, d.dmg * (e.dmgMul || 1));
    else if (tp.c) hurtCart(tp.c, d.dmg * (e.dmgMul || 1));
    else if (tp.b) damageBuilding(tp.b, d.dmg * (d.siege ? Math.min(1.2, e.dmgMul || 1) : (e.dmgMul || 1)) * (d.siege === 'ram' && BUILDINGS[tp.b.type].kind === 'wall' ? 1.5 : 1)); // осадным машинам эволюция прибавляет не больше 20% урона
    sfx('hit', e.x, e.y);
  }
}

// урон по постройкам и игроку в радиусе
function areaDamageFriendly(x, y, r, dmg, kind) {
  for (const h of heroList()) if (h.dead <= 0 && dist(h.x, h.y, x, y) < r + 0.3) damageHero(h, dmg, kind);
  for (let ty = Math.floor(y - r); ty <= Math.floor(y + r); ty++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
    if (dist(tx + 0.5, ty + 0.5, x, y) > r) continue;
    const b = bldAt(tx, ty);
    // в середине взрыва — полный урон, по краям — половина
    if (b && b.hp > 0) { damageBuilding(b, dmg / Math.max(1, b.w * b.h) * (dist(tx + 0.5, ty + 0.5, x, y) < 0.8 ? 1 : 0.5)); }
  }
  for (const g of S.golems.slice()) if (!g.hidden && dist(g.x, g.y, x, y) < r) hurtGolem(g, dmg);
}

function updateEnemy(e, dt) {
  const d = ENEMIES[e.type];
  if (e.flash > 0) e.flash -= dt;
  if (e.atkT != null) e.atkT += dt;
  if (e.kbT > 0) e.kbT -= dt;
  e.moving = false;
  if (e.stun > 0) { e.stun -= dt; return; }
  e.cd -= dt;
  e.think -= dt;
  if (e.sentry) sentryTick(e, dt);
  let tp = targetPos(e);
  // цель ищем раз в ~секунду; без цели не ищем каждый кадр (раньше осада вдали от базы роняла FPS до 6)
  if (e.think <= 0 || (!tp && e.tgt)) {
    e.think = rand(0.8, 1.4);
    if (!e.lockB || !tp) e.tgt = enemyTarget(e);
    e.lockB = false;
    tp = targetPos(e);
  }
  // шаман лечит союзников
  if (d.heal) {
    e.healCd = (e.healCd || 0) - dt;
    if (e.healCd <= 0) {
      e.healCd = 2;
      for (const o of EHASH.query(e.x, e.y, 4, _q)) if (o !== e && o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + d.heal * 2); spawnBurst(o.x, o.y, '#80ff80', 3); }
    }
  }
  // ров с кольями
  const under = bldAt(Math.floor(e.x), Math.floor(e.y));
  let slow = 1;
  if (under && under.type === 'landmine') {
    // мина: взрыв по площади, мина пропадает
    for (const o of EHASH.query(under.x + 0.5, under.y + 0.5, 2.2, _q)) hurtEnemy(o, 140, { x: under.x + 0.5, y: under.y + 0.5 });
    spawnBurst(under.x + 0.5, under.y + 0.5, '#ff9040', 16); shake(2); sfx('boom', under.x, under.y);
    FX.push({ ring: true, x: under.x + 0.5, y: under.y + 0.5, life: 0.4, life0: 0.4, r: 2.2, c: '255,160,60' });
    destroyBuilding(under);
    if (e.hp <= 0) return;
  }
  if (under && under.type === 'spikes') {
    slow = 0.45;
    e.hp -= 8 * dt;
    if (e.hp <= 0) { killEnemy(e); return; }
    damageBuilding(under, 2 * dt);
  }
  if (d.fly) { flyerMove(e, tp, d, dt); return; }
  // застряли в воде или в постройке лагеря (заспавнились на берегу, оттолкнуло ударом) — выбираемся на ближайшую сушу
  if (!ePass(Math.floor(e.x), Math.floor(e.y))) {
    if (!e.rescue || S.time > e.rescueT) { e.rescue = nearestEPass(e.x, e.y, 8); e.rescueT = S.time + 2; }
    if (e.rescue) {
      const rd = dist(e.x, e.y, e.rescue.x, e.rescue.y) || 0.01, sp = d.speed * 0.8 * dt;
      e.ang = Math.atan2(e.rescue.y - e.y, e.rescue.x - e.x);
      e.x += (e.rescue.x - e.x) / rd * Math.min(sp, rd); e.y += (e.rescue.y - e.y) / rd * Math.min(sp, rd);
      e.moving = true; e.walk = (e.walk || 0) + dt * d.speed * 4.2;
    }
    return;
  }
  e.rescue = null;
  // налётчики без цели расходятся
  if (!tp) {
    e.idle = (e.idle || 0) + dt;
    if (e.idle > 30 && e.mode !== 'guard') e.dead = true;
    return;
  }
  e.idle = 0;
  const dd = dist(e.x, e.y, tp.x, tp.y);
  if (tp.pt) {
    // точка (пост охраны, середина базы): дошли — стоим, а не бьём воздух
    if (dd < 0.45) { e.path = null; return; }
  } else if (dd <= d.range + tp.r) {
    // стрелок, к которому подошли вплотную, отступает на шаг, пока перезаряжается
    if (e.cd > 0.25 && d.range > 3 && !d.siege && tp.r > 0 && dd < d.range * 0.4 && e.tgt && e.tgt.k === 'p') {
      const ux = (e.x - tp.x) / (dd || 0.01), uy = (e.y - tp.y) / (dd || 0.01), sp = d.speed * 0.75 * slow * dt;
      const nx = e.x + ux * sp, ny = e.y + uy * sp;
      if (ePass(Math.floor(nx), Math.floor(ny)) && enemyWalkable(Math.floor(nx), Math.floor(ny))) { e.x = nx; e.y = ny; e.moving = true; e.walk = (e.walk || 0) + dt * d.speed * 4.2; }
      e.ang = Math.atan2(tp.y - e.y, tp.x - e.x);
      return;
    }
    if (e.cd <= 0) enemyAttack(e, tp);
    else e.ang = Math.atan2(tp.y - e.y, tp.x - e.x);
    return;
  }
  // движение к цели: напрямую, если видно; иначе — по найденному пути в обход воды и стен лагерей
  const sp = d.speed * slow * dt * (tp.idle ? 0.55 : 1);
  let [dx, dy] = enemySteer(e, tp, dd);
  e.face = dx < 0 ? -1 : 1;
  let nx = e.x + dx * sp, ny = e.y + dy * sp;
  const tx = Math.floor(nx + dx * 0.3), ty = Math.floor(ny + dy * 0.3);
  if (!ePass(tx, ty)) {
    // впереди вода или стена лагеря (срезали угол) — скользим вдоль и просим новый путь
    e.pathT = 0;
    const sx1 = ePass(Math.floor(nx), Math.floor(e.y)), sy1 = ePass(Math.floor(e.x), Math.floor(ny));
    if (sx1 && Math.abs(dx) > 0.2) { ny = e.y; nx = e.x + Math.sign(dx) * sp; }
    else if (sy1 && Math.abs(dy) > 0.2) { nx = e.x; ny = e.y + Math.sign(dy) * sp; }
    else { enemyStuckTick(e, dt, 0); return; }
  } else if (!enemyWalkable(tx, ty)) {
    const blk = bldAt(tx, ty);
    if (blk && !(tp.b && tp.b === blk)) {
      // упёрлись в стену: чаще идём к воротам поблизости, иногда ломаем стену прямо тут
      // к воротам идут реже (35%) и только к близким — иначе ломают стену прямо тут
      if (e.gatePref == null) e.gatePref = Math.random() < 0.35;
      const gt = BUILDINGS[blk.type].kind === 'wall' && !BUILDINGS[blk.type].gate && e.gatePref ? nearestGate(e.x, e.y, 7) : null;
      if (gt && tp.b === gt) {
        // уже идём к воротам — обходим стену вдоль, выбирая сторону ближе к воротам
        const ax = -dy, ay = dx, gx = gt.x + 0.5, gy = gt.y + 0.5;
        const s1 = enemyWalkable(Math.floor(e.x + ax * 0.6), Math.floor(e.y + ay * 0.6)), s2 = enemyWalkable(Math.floor(e.x - ax * 0.6), Math.floor(e.y - ay * 0.6));
        const d1 = dist(e.x + ax, e.y + ay, gx, gy), d2 = dist(e.x - ax, e.y - ay, gx, gy);
        if (s1 && (!s2 || d1 <= d2)) { nx = e.x + ax * sp; ny = e.y + ay * sp; }
        else if (s2) { nx = e.x - ax * sp; ny = e.y - ay * sp; }
        else { e.tgt = { k: 'b', id: blk.id }; e.lockB = true; e.think = 3; return; }
      } else if (tp.pt && tp.idle) {
        e.post = null; return; // пост за чужой постройкой — выберем другой
      } else {
        e.tgt = { k: 'b', id: (gt || blk).id }; e.lockB = true; e.think = 3;
        return;
      }
    } else if (blk && tp.b === blk) {
      // дошли до цели вплотную, но дальность не позволяет — бьём
      if (e.cd <= 0) enemyAttack(e, tp);
      return;
    }
  }
  // не толпимся: лёгкое расталкивание соседей
  if (S.enemies.length < 600) {
    const rr = d.size * 0.55;
    for (const o of EHASH.query(nx, ny, rr + 0.35, _q)) {
      if (o === e || ENEMIES[o.type].siege) continue;
      const od = dist(nx, ny, o.x, o.y), min = rr + ENEMIES[o.type].size * 0.45;
      if (od < min && od > 0.001) { const k = (min - od) * 0.35; nx += (nx - o.x) / od * k; ny += (ny - o.y) / od * k; }
    }
    if (!ePass(Math.floor(nx), Math.floor(ny)) || !enemyWalkable(Math.floor(nx), Math.floor(ny))) { nx = e.x + dx * sp; ny = e.y + dy * sp; }
  }
  if (!ePass(Math.floor(nx), Math.floor(ny))) { e.pathT = 0; enemyStuckTick(e, dt, 0); return; }
  const moved = dist(e.x, e.y, nx, ny);
  // плавный поворот — без дёрганья спрайта между направлениями
  const want = Math.atan2(ny - e.y, nx - e.x);
  if (e.ang == null) e.ang = want;
  else { let da = want - e.ang; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; e.ang += clamp(da, -dt * 9, dt * 9); }
  e.x = nx; e.y = ny;
  e.moving = true;
  e.walk = (e.walk || 0) + dt * d.speed * 4.2;
  enemyStuckTick(e, dt, moved / Math.max(1e-6, sp));
}

// летающие: прямо к цели над водой и стенами, кружат вокруг героя и пикируют; без цели — улетают прочь
function flyerMove(e, tp, d, dt) {
  e.flap = (e.flap || 0) + dt;
  if (!tp) {
    if (e.leaveA == null) e.leaveA = rand(0, 6.28);
    e.x += Math.cos(e.leaveA) * d.speed * dt; e.y += Math.sin(e.leaveA) * d.speed * dt; e.ang = e.leaveA; e.moving = true;
    e.idle = (e.idle || 0) + dt; if (e.idle > 12) e.dead = true;
    return;
  }
  e.idle = 0;
  const dd = dist(e.x, e.y, tp.x, tp.y);
  if (dd <= d.range + tp.r && e.cd <= 0) { enemyAttack(e, tp); e.orbit = rand(1.5, 2.5); return; }
  // после клевка отлетают и заходят на новый круг
  let gx = tp.x, gy = tp.y;
  if (e.cd > 0.3) { const a = Math.atan2(e.y - tp.y, e.x - tp.x) + 1.2 * dt * 3; gx = tp.x + Math.cos(a) * (e.orbit || 2); gy = tp.y + Math.sin(a) * (e.orbit || 2); }
  const gd = dist(e.x, e.y, gx, gy) || 0.01, sp = Math.min(gd, d.speed * dt);
  e.x += (gx - e.x) / gd * sp; e.y += (gy - e.y) / gd * sp;
  e.ang = Math.atan2(gy - e.y, gx - e.x); e.moving = true; e.face = gx < e.x ? -1 : 1;
  // ранили — стая может дрогнуть и улететь
  if (e.hp < e.maxHp * 0.5 && !e.fleeRoll) { e.fleeRoll = true; if (Math.random() < 0.5) { e.flee = S.time + 30; e.tgt = null; } }
}
// куда шагать: прямо на цель, если по прямой нет воды и стен лагерей, иначе — по пути (поиск в ширину)
let ENEMY_PATH_BUDGET = 0;
function enemySteer(e, tp, dd) {
  const gx = tp.x, gy = tp.y;
  // путь ещё годен?
  if (e.path && e.pathI < e.path.length && S.time < e.pathT && dist2(gx, gy, e.pathGX, e.pathGY) < 4) {
    while (e.pathI < e.path.length && dist2(e.x, e.y, e.path[e.pathI][0], e.path[e.pathI][1]) < 0.12) e.pathI++;
    if (e.pathI < e.path.length) { const [wx, wy] = e.path[e.pathI], wd = dist(e.x, e.y, wx, wy) || 0.01; return [(wx - e.x) / wd, (wy - e.y) / wd]; }
  }
  const direct = [(gx - e.x) / (dd || 0.01), (gy - e.y) / (dd || 0.01)];
  // проверка прямой видимости — не каждый кадр
  if (S.time < (e.directT || 0)) return direct;
  if (dd < 48 && lineClear(e.x, e.y, gx, gy, Math.min(dd, 0.6), ePass)) { e.path = null; e.directT = S.time + 0.6; return direct; }
  if (ENEMY_PATH_BUDGET <= 0) return direct; // в этом кадре уже много искали — попробуем в следующем
  ENEMY_PATH_BUDGET--;
  // далёкую цель обходим по частям; из своего лагеря — сперва к ближайшему проходу
  const far = dd > 44;
  const home = e.campId != null ? S.camps.find(c => c.id === e.campId) : null;
  const inside = home && home.alive && far && dist(e.x, e.y, home.x, home.y) < campRadius(home) + 1.5;
  let path = inside ? campExitPath(e, home, gx, gy) : null;
  if (!path) {
    const ix = far ? e.x + direct[0] * 40 : gx, iy = far ? e.y + direct[1] * 40 : gy;
    path = enemyPath(e.x, e.y, ix, iy, far ? 2 : 0.4, far ? 24 : 16);
    // путь не довёл (цель за заливом или озером) — ищем обход к самой цели в окне пошире
    const end = path && path.length ? path[path.length - 1] : [e.x, e.y];
    if (dist(end[0], end[1], ix, iy) > (far ? 4 : 2) && dd < 160) {
      const p2 = enemyPath(e.x, e.y, gx, gy, 0.6, 64);
      if (p2 && p2.length) path = p2.length > 40 ? p2.slice(0, 40) : p2;
    }
  }
  e.path = path && path.length ? path : null; e.pathI = 0; e.pathT = S.time + (far ? 6 : 3.5); e.pathGX = gx; e.pathGY = gy;
  e.directT = S.time + 0.4;
  if (e.path) { const [wx, wy] = e.path[0], wd = dist(e.x, e.y, wx, wy) || 0.01; return [(wx - e.x) / wd, (wy - e.y) / wd]; }
  return direct;
}
// застревание: если долго почти не двигаемся, хотя хотим, — новый путь, потом обходной шаг в сторону
function enemyStuckTick(e, dt, eff) {
  e.stkT = (e.stkT || 0) + dt; e.stkM = (e.stkM || 0) + eff * dt;
  if (e.stkT < 1.5) return;
  const bad = e.stkM / e.stkT < 0.3;
  e.stkT = 0; e.stkM = 0;
  if (!bad) { e.stkN = 0; return; }
  e.stkN = (e.stkN || 0) + 1;
  e.pathT = 0; e.directT = 0;
  if (e.stkN >= 2) {
    // обходной манёвр: точка в стороне, куда можно дойти
    const a = rand(0, 6.28), f = nearestEPass(e.x + Math.cos(a) * 3, e.y + Math.sin(a) * 3, 4);
    if (f) { e.path = [[f.x, f.y]]; e.pathI = 0; e.pathT = S.time + 1.5; e.pathGX = e.tgt && targetPos(e) ? targetPos(e).x : e.x; e.pathGY = e.tgt && targetPos(e) ? targetPos(e).y : e.y; }
  }
  if (e.stkN >= 6 && e.mode === 'guard' && e.tgt && e.tgt.k === 'pt') { e.post = null; e.stkN = 0; }
  // налётчик застрял надолго (~30 с) и героя рядом нет — отступает: тихо уходит с карты
  if (e.stkN >= 20 && e.mode !== 'guard' && !ENEMIES[e.type].siege && dist(e.x, e.y, S.player.x, S.player.y) > 25) e.dead = true;
}
// поиск пути для врага: в ширину по 8 направлениям в окне вокруг начала и цели; если до цели не дойти —
// путь к самой близкой к ней достижимой клетке (так враг обходит залив, а не стоит у воды)
// буферы поиска переиспользуются: «поколение» вместо очистки массивов на каждый поиск
const EP_MAX = 160000, _ebfsQ = new Int32Array(EP_MAX), _ePrev = new Int32Array(EP_MAX), _eSeen = new Uint32Array(EP_MAX), _ePass = new Uint32Array(EP_MAX);
let _eGen = 0;
function enemyPath(sx0, sy0, tx, ty, near, margin) {
  const x0 = Math.floor(sx0), y0 = Math.floor(sy0), gx = Math.floor(tx), gy = Math.floor(ty);
  const minX = Math.min(x0, gx) - margin, minY = Math.min(y0, gy) - margin;
  const W = Math.max(x0, gx) + margin - minX + 1, H = Math.max(y0, gy) + margin - minY + 1;
  if (W * H > EP_MAX) return null;
  _eGen = (_eGen + 2) >>> 0; if (_eGen < 2) { _eSeen.fill(0); _ePass.fill(0); _eGen = 2; }
  const G0 = _eGen, prev = _ePrev;
  // _ePass: G0 — можно, G0+1 — нельзя, иначе не проверено
  const ok = (x, y) => { const k = (y - minY) * W + (x - minX), v = _ePass[k]; if (v === G0) return true; if (v === G0 + 1) return false; const r = ePass(x, y); _ePass[k] = r ? G0 : G0 + 1; return r; };
  const seen = (k) => _eSeen[k] === G0;
  const start = (y0 - minY) * W + (x0 - minX);
  let qh = 0, qt = 0, goal = -1, best = start, bestD = dist2(x0 + 0.5, y0 + 0.5, tx, ty);
  _ebfsQ[qt++] = start; prev[start] = start; _eSeen[start] = G0;
  const reach = (near + 0.55) * (near + 0.55);
  while (qh < qt) {
    const k = _ebfsQ[qh++], x = k % W + minX, y = (k / W | 0) + minY;
    const dg = dist2(x + 0.5, y + 0.5, tx, ty);
    if (dg <= reach) { goal = k; break; }
    if (dg < bestD) { bestD = dg; best = k; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < minX || ny < minY || nx >= minX + W || ny >= minY + H) continue;
      const nk = (ny - minY) * W + (nx - minX);
      if (seen(nk) || !ok(nx, ny)) continue;
      if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue;
      prev[nk] = k; _eSeen[nk] = G0; _ebfsQ[qt++] = nk;
    }
  }
  if (goal < 0) goal = best;
  if (goal === start) return null;
  const pts = [];
  for (let k = goal; k !== start; k = prev[k]) pts.push([k % W + minX + 0.5, (k / W | 0) + minY + 0.5]);
  pts.reverse();
  const out = [];
  let cx = sx0, cy = sy0;
  for (let i = 0; i < pts.length; i++) {
    const nxt = pts[i + 1];
    if (nxt && lineClear(cx, cy, nxt[0], nxt[1], 0, ePass)) continue;
    out.push(pts[i]); cx = pts[i][0]; cy = pts[i][1];
  }
  return out;
}

// проходимость для обхода стен лагеря: вода и скалы — нет, постройки лагеря — нет; постройки игрока враг ломает сам
function campRadius(c) { return c.type === 'goblin' ? 8.5 : c.type === 'orc' ? 10.5 : c.type === 'citadel' ? 18.5 : 12; }
// путь из своего лагеря: ближайшая клетка за его стенами, которая ближе к цели, чем середина лагеря
function campExitPath(e, c, tx, ty) {
  const R = campRadius(c) + 2, d0 = dist(c.x, c.y, tx, ty);
  const x0 = Math.floor(c.x - R - 3), y0 = Math.floor(c.y - R - 3), W = Math.ceil(R * 2 + 7), H = W;
  const prev = new Int32Array(W * H).fill(-1), pass = new Int8Array(W * H);
  const ok = (x, y) => { const k = (y - y0) * W + (x - x0); if (!pass[k]) pass[k] = campPass(x, y) ? 1 : 2; return pass[k] === 1; };
  const sx0 = clamp(Math.floor(e.x), x0, x0 + W - 1), sy0 = clamp(Math.floor(e.y), y0, y0 + H - 1);
  const start = (sy0 - y0) * W + (sx0 - x0);
  const q = [start]; prev[start] = start;
  let goal = -1;
  for (let qh = 0; qh < q.length; qh++) {
    const k = q[qh], x = k % W + x0, y = (k / W | 0) + y0;
    if (dist(x + 0.5, y + 0.5, c.x, c.y) > R && dist(x + 0.5, y + 0.5, tx, ty) < d0) { goal = k; break; }
    for (const [ddx, ddy] of DIRS) {
      const nx = x + ddx, ny = y + ddy;
      if (nx < x0 || ny < y0 || nx >= x0 + W || ny >= y0 + H) continue;
      const nk = (ny - y0) * W + (nx - x0);
      if (prev[nk] >= 0 || !ok(nx, ny)) continue;
      prev[nk] = k; q.push(nk);
    }
  }
  if (goal < 0) return null;
  const pts = [];
  for (let k = goal; k !== start; k = prev[k]) pts.push([k % W + x0 + 0.5, (k / W | 0) + y0 + 0.5]);
  return pts.reverse();
}
function campPass(x, y) {
  const c = chunkOf(x, y), i = tidx(x, y);
  return c.ground[i] !== GROUND.water && c.ground[i] !== GROUND.wall && !campStructAt(x, y);
}
function updateEnemies(dt) {
  ENEMY_PATH_BUDGET = 3;
  EHASH.clear();
  for (const e of S.enemies) EHASH.insert(e);
  for (const e of S.enemies) if (!e.dead) updateEnemy(e, dt);
  if (S.enemies.some(e => e.dead)) S.enemies = S.enemies.filter(e => !e.dead);
}

// ---------- снаряды ----------
function spawnProj(o) {
  const d = dist(o.x, o.y, o.tx, o.ty) || 0.01;
  o.vx = (o.tx - o.x) / d * o.speed; o.vy = (o.ty - o.y) / d * o.speed;
  o.life = d / o.speed;
  o.arc = o.kind === 'boulder' || o.kind === 'axe' ? d : 0;
  o.t0 = o.life;
  S.projs.push(o);
}

function updateProjs(dt) {
  for (const o of S.projs) {
    // самонаведение по врагу
    if (o.homing && !o.homing.dead) {
      const d = dist(o.x, o.y, o.homing.x, o.homing.y) || 0.01;
      o.vx = (o.homing.x - o.x) / d * o.speed; o.vy = (o.homing.y - o.y) / d * o.speed;
      o.life = d / o.speed;
    }
    if (o.track && !o.track.dead && o.track.hp > 0) {
      // доводка угасает: сразу после выстрела снаряд поворачивает до 3 рад/с, через 0,9 с летит прямо
      o.age = (o.age || 0) + dt;
      const turn = 3 * Math.max(0, 1 - o.age / 0.9);
      if (turn > 0) {
        const dx = o.track.x - o.x, dy = o.track.y - o.y;
        const cur = Math.atan2(o.vy, o.vx), want = Math.atan2(dy, dx);
        let da = want - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const a = cur + clamp(da, -turn * dt, turn * dt);
        o.vx = Math.cos(a) * o.speed; o.vy = Math.sin(a) * o.speed;
      }
    }
    const step = Math.min(dt, o.life);
    o.x += o.vx * step; o.y += o.vy * step;
    o.life -= dt;
    if ((o.kind === 'bolt' || o.kind === 'arrow' || o.kind === 'stone') && Math.random() < 0.6) FX.push({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.15, c: o.kind === 'stone' ? '#bbb6aa' : '#f0e6c8', s: 0.05 });
    if (o.kind === 'fire' && Math.random() < 0.5) FX.push({ x: o.x, y: o.y, vx: rand(-1, 1), vy: rand(-1, 0), life: 0.4, c: Math.random() < 0.5 ? '#ff8030' : '#ffd040', s: 0.15 });
    if (o.life <= 0) { projHit(o); o.done = true; }
  }
  S.projs = S.projs.filter(o => !o.done);
}

function projHit(o) {
  if (o.from === 'e') {
    if (o.aoe) { areaDamageFriendly(o.x, o.y, o.aoe, o.dmg, o.kind); spawnBurst(o.x, o.y, '#c060ff', 10); sfx('boom', o.x, o.y); return; }
    // доводимая стрела попадает в свою цель, если долетела до неё (а не только в того, кто окажется рядом)
    const hh = o.track && o.track.hp != null && !(o.track.dead > 0) && heroList().includes(o.track) && dist(o.x, o.y, o.track.x, o.track.y - 0.3) < 1.1 ? o.track : nearestHero(o.x, o.y + 0.3, 0.9);
    if (hh) { damageHero(hh, o.dmg, o.kind); spawnBurst(hh.x, hh.y - 0.4, '#e04030', 4); if (hh === S.player && S.cheats && S.cheats.god) floatText(hh.x, hh.y - 0.7, 'бессмертие', '#c0c0c0'); return; }
    const gm = nearestGolem(o.x, o.y, 0.7);
    if (gm) { hurtGolem(gm, o.dmg); return; }
    const gw = nearestGuard(o.x, o.y + 0.3, 0.7);
    if (gw) { hurtGuard(gw, o.dmg); return; }
    const ct = nearestCart(o.x, o.y, 0.8);
    if (ct) { hurtCart(ct, o.dmg); return; }
    const b = bldAt(Math.floor(o.x), Math.floor(o.y));
    if (b) damageBuilding(b, o.dmg);
    return;
  }
  // снаряды игрока и башен
  if (o.aoe) {
    for (const e of EHASH.query(o.x, o.y, o.aoe, _q)) hurtEnemy(e, o.dmg);
    damageCampStructs(o.x, o.y, o.aoe, o.sdmg || o.dmg);
    if (o.kind === 'boulder' || o.kind === 'quake') { spawnBurst(o.x, o.y, '#8a7a6a', 12); shake(o.kind === 'quake' ? 4 : 2); sfx('boom', o.x, o.y); }
    if (o.kind === 'fire') spawnBurst(o.x, o.y, '#ff8030', 4);
    return;
  }
  if (o.homing && !o.homing.dead) { if (o.homing.kind && ANIMALS[o.homing.kind]) hurtAnimal(o.homing, o.dmg, o.owner); else hurtEnemy(o.homing, o.dmg, { x: o.x - o.vx * 0.05, y: o.y - o.vy * 0.05 }); return; }
  if (o.struct) { hitStruct(o.struct, o.sdmg || o.dmg); return; }
  for (const e of EHASH.query(o.x, o.y, 0.7, _q)) { hurtEnemy(e, o.dmg); return; }
}

// ---------- оружие Анимансера ----------
// враг под курсором (для клика «атаковать»)
function enemyAtPoint(x, y) {
  let best = null, bd = 0.8 * 0.8;
  for (const e of S.enemies) {
    if (e.dead || e.hp <= 0) continue;
    const s = ENEMIES[e.type].size;
    const d = dist2(e.x, e.y - s * 0.45, x, y);
    if (d < bd * Math.max(1, s * s)) { bd = d; best = e; }
  }
  return best;
}

// выбранная кликом цель: { k: 'e', e } — враг, { k: 's', s } — постройка лагеря
function setPlayerFocus(f) {
  const p = S.player;
  p.focus = f ? Object.assign({ approach: true }, f) : null;
  if (f) {
    const name = f.k === 'e' ? ENEMIES[f.e.type].name : f.k === 'a' ? ANIMALS[f.a.kind].name : f.k === 'm' ? 'Торговец (ПКМ по нему — торговать)' : CAMP_STRUCT[f.s.kind].name;
    hint('Цель: ' + name + ' (WASD — отменить подход)');
  }
}

// позиция цели и её «радиус»; null — цель исчезла
function focusPos(p) {
  const f = p.focus;
  if (!f) return null;
  if (f.k === 'e') {
    if (f.e.dead || f.e.hp <= 0 || !S.enemies.includes(f.e)) return null;
    return { x: f.e.x, y: f.e.y, r: 0.3 };
  }
  if (f.k === 'a') {
    if (f.a.dead || !WILD.animals.includes(f.a)) return null;
    return { x: f.a.x, y: f.a.y, r: 0.2 };
  }
  if (f.k === 'm') { const m = S.merchant; return m ? { x: m.x, y: m.y, r: 0.3 } : null; }
  if (f.k === 's') {
    if (f.s.hp <= 0) return null;
    const big = structW(f.s) / 2;
    return { x: f.s.x + big, y: f.s.y + big, r: big };
  }
  return null;
}

// чем герой бьёт сейчас: оружие слота, а без боеприпасов (или в пустом слоте) — посохом
function playerAttackMode(p) {
  ensureGuns(p);
  const w = WEAPONS[p.weapon];
  if (!w) return STAFF_MELEE;
  if (w.ammo) {
    const a = p.ammo[p.gun];
    if (!a || a.n <= 0) { reloadGun(p, p.gun); const b = p.ammo[p.gun]; if (!b || b.n <= 0) return STAFF_MELEE; }
  }
  return w;
}

function playerCombat(dt) {
  const p = S.player;
  if (p.dead > 0) return;
  if (p.swing > 0) p.swing -= dt;
  if (p.atkT != null) p.atkT += dt;
  p.cd -= dt;
  if (p.focus && !focusPos(p)) p.focus = null;
  if (p.cd > 0) return;
  const w = playerAttackMode(p);
  const melee = !!w.melee;
  let tgt = null, st = null;
  const fp = focusPos(p);
  if (fp) {
    // выбранная цель — в приоритете, если достаём
    // первый удар по торговцу: он сбрасывает личину и дерётся как сильный враг
    if (p.focus.k === 'm' && dist(p.x, p.y, fp.x, fp.y) <= w.range + fp.r) { const foe = angerMerchant(); if (foe) p.focus = { k: 'e', e: foe, approach: true }; }
    if (dist(p.x, p.y, fp.x, fp.y) <= w.range + fp.r) { if (p.focus.k === 'e') tgt = p.focus.e; else if (p.focus.k === 'a') tgt = p.focus.a; else st = p.focus.s; }
  }
  if (!tgt && !st) {
    // иначе ближайший враг, иначе постройка лагеря
    let bd = w.range * w.range;
    for (const e of EHASH.query(p.x, p.y, w.range, _q)) { const d = dist2(e.x, e.y, p.x, p.y); if (d < bd) { bd = d; tgt = e; } }
    // постройки лагеря — сами только главные (хижины, шатры, башни); стены и ограды — только если по ним кликнули
    if (!tgt) st = nearestCampStruct(p.x, p.y, w.range + 1.5, true);
  }
  if (!tgt && !st) return;
  if (w === STAFF_MELEE && WEAPONS[p.weapon] && WEAPONS[p.weapon].ammo && S.time - (p.noAmmoMsg || -99) > 8) {
    hint('Нет боеприпасов (' + WEAPONS[p.weapon].ammo.map(a => ITEMS[a].name).join(' / ') + ') — бью посохом. Tab — другое оружие');
    p.noAmmoMsg = S.time;
  }
  // боеприпас из слота оружия: его вид задаёт множитель урона
  let mul = 1;
  if (!melee && w.ammo) {
    const a = p.ammo[p.gun];
    mul = AMMO[a.id] ? AMMO[a.id].mul : 1;
    if (!w.ammoChance || Math.random() < w.ammoChance) { a.n--; statC(a.id, 1); if (a.n <= 0) { p.ammo[p.gun] = null; reloadGun(p, p.gun); } }
  }
  p.cd = w.cd;
  const tx = tgt ? tgt.x : structCX(st), ty = tgt ? tgt.y : structCY(st);
  p.face = tx < p.x ? -1 : 1;
  p.atkT = 0; p.atkKind = w === STAFF_MELEE ? 'staff' : p.weapon; p.atkTx = tx; p.atkTy = ty;
  p.ang = Math.atan2(ty - p.y, tx - p.x);
  if (p.weapon === 'quake_staff' && !melee) {
    FX.push({ ring: true, x: tx, y: ty, life: 0.55, life0: 0.55, r: w.aoe || 2.5, c: '160,240,255' });
    FX.push({ ring: true, x: tx, y: ty, life: 0.4, life0: 0.4, r: (w.aoe || 2.5) * 0.6, c: '255,255,255' });
  }
  if (melee) {
    // удар посохом или клинком — сразу, без снаряда; молот бьёт всех рядом с целью
    p.swing = 0.25; p.swingX = tx; p.swingY = ty;
    const dmg = w.dmg * (1 + (S.bonus.melee || 0));
    if (tgt && tgt.kind && ANIMALS[tgt.kind]) hurtAnimal(tgt, dmg, p); else if (tgt) hurtEnemy(tgt, dmg); else hitStruct(st, dmg * w.struct);
    if (w.aoe) {
      for (const e of EHASH.query(tx, ty, w.aoe, _q)) if (e !== tgt) hurtEnemy(e, dmg * 0.6);
      FX.push({ ring: true, x: tx, y: ty, life: 0.3, life0: 0.3, r: w.aoe, c: '220,200,160' }); shake(1.5);
    }
    // мифриловый клинок лечит героя
    if (w.leech && tgt && !p.dead) p.hp = Math.min(playerMaxHp(), p.hp + dmg * w.leech);
    spawnBurst(tx, ty - 0.2, '#e8dcbc', 4);
    FX.push({ ring: true, x: tx, y: ty - 0.3, life: 0.2, life0: 0.2, r: 0.5, c: '255,240,200' });
    sfx('hit', p.x, p.y);
    return;
  }
  if (w.siege && tgt && ENEMIES[tgt.type] && ENEMIES[tgt.type].siege) mul *= w.siege;
  spawnProj({ x: p.x, y: p.y - 0.2, tx, ty, dmg: w.dmg * mul, sdmg: w.dmg * mul * (w.struct || 1), aoe: w.aoe || 0, from: 'p', owner: p, kind: w.proj, speed: w.proj === 'fire' ? 9 : w.proj === 'boulder' ? 13 : 16, homing: w.aoe ? null : tgt, struct: tgt ? null : st });
  sfx(w.proj === 'fire' ? 'fire' : w.proj === 'boulder' ? 'throw' : 'shoot');
}

// ---------- башни ----------
// подвижный страж (исполин): отходит от своего места не дальше def.mobile клеток к ближайшему врагу и возвращается назад
function guardianStep(b, def, dt) {
  const hx = b.x + b.w / 2, hy = b.y + b.h / 2, L = def.mobile, w = def.weapon;
  b.gox = b.gox || 0; b.goy = b.goy || 0;
  const cx = hx + b.gox, cy = hy + b.goy;
  let tx = hx, ty = hy, bd = 1e9;
  for (const e of EHASH.query(hx, hy, L + w.range + 2, _q)) { const d = dist2(e.x, e.y, cx, cy); if (d < bd) { bd = d; tx = e.x; ty = e.y; } }
  // встать так, чтобы враг был в досягаемости, но не дальше поводка от места
  if (bd < 1e9) { const d = Math.sqrt(bd); if (d > w.range * 0.7) { const k = (d - w.range * 0.7) / d; tx = cx + (tx - cx) * k; ty = cy + (ty - cy) * k; } else { tx = cx; ty = cy; } }
  let ox = clamp(tx - hx, -L, L), oy = clamp(ty - hy, -L, L);
  const ol = Math.hypot(ox, oy); if (ol > L) { ox *= L / ol; oy *= L / ol; }
  const dx = ox - b.gox, dy = oy - b.goy, dl = Math.hypot(dx, dy), st = (def.walkSpeed || 1) * dt;
  b.gwalk = dl > 0.05 && b.cd < (w.cd - 0.5); // во время удара стоит
  if (b.gwalk) { const k = Math.min(1, st / dl); b.gox += dx * k; b.goy += dy * k; b.gface = dx < 0 ? -1 : dx > 0 ? 1 : b.gface || 1; b.gstep = (b.gstep || 0) + st * 4; }
}
function updateTowers(dt) {
  for (const b of bldKind('tower')) {
    const def = BUILDINGS[b.type];
    if (def.power) { b.wantPower = def.power; if (!(b.powerSat > 0)) { b.status = 'нет энергии'; continue; } }
    if (def.mobile) guardianStep(b, def, dt);
    b.cd -= dt;
    if (b.cd > 0) continue;
    const w = def.weapon;
    const cx = b.x + b.w / 2 + (b.gox || 0), cy = b.y + b.h / 2 + (b.goy || 0);
    // цели: ближайшие враги; баллиста — сперва осадные машины; у башни с несколькими лучниками — каждому свой враг
    // дальность — до края цели (крупные машины достаются чуть дальше), осадные машины и для обычных башен в приоритете
    const nShots = w.archers || 1, minD2 = (w.min || 0) * (w.min || 0), R = w.range + 0.6 + b.w * 0.25, r2 = R * R;
    const cands = [];
    for (const e of EHASH.query(cx, cy, R, _q)) {
      const d = dist2(e.x, e.y, cx, cy);
      if (d <= r2 && d >= minD2) cands.push([d - (ENEMIES[e.type].siege ? (w.siegeFirst ? 1e4 : 30) : 0), e]);
    }
    if (!cands.length) { b.status = 'ждёт врагов'; b.cd = 0.25; continue; }
    cands.sort((p, q) => p[0] - q[0]);
    const tgt = cands[0][1];
    let mult = 1;
    if (w.ammo) {
      const a = w.ammo.find(id => b.inv.count(id) > 0);
      if (!a) { b.status = 'нет боеприпасов'; b.cd = 0.5; continue; }
      if (!w.ammoChance || Math.random() < w.ammoChance) { b.inv.remove(a, 1); statC(a, 1); }
      if (a === 'explosive') mult = 2.5;
      else if (AMMO[a]) mult = AMMO[a].mul;
    }
    // остальные лучники башни: по выстрелу в следующих врагов (каждый — свой болт)
    for (let k = 1; k < nShots; k++) {
      const e2 = cands[k % cands.length][1];
      if (w.ammo) { const a2 = w.ammo.find(id => b.inv.count(id) > 0); if (!a2) break; b.inv.remove(a2, 1); statC(a2, 1); }
      const ox = (k - 1) * 0.6 - 0.3;
      spawnProj({ x: cx + ox, y: cy - 1.2, tx: e2.x, ty: e2.y, dmg: w.dmg * mult * (w.siege && ENEMIES[e2.type].siege ? w.siege : 1), aoe: 0, from: 't', kind: w.proj, speed: 16, homing: e2 });
    }
    b.status = 'стреляет';
    b.cd = w.cd;
    b.aim = Math.atan2(tgt.y - cy, tgt.x - cx);
    if (w.proj === 'beam') {
      const dmg = w.dmg * (b.powerSat || 1);
      hurtEnemy(tgt, dmg, { x: cx, y: cy });
      FX.push({ beam: true, x: cx, y: cy - 1.1, x2: tgt.x, y2: tgt.y - 0.4, vx: 0, vy: 0, life: 0.18, life0: 0.18 });
      sfx('arcane', cx, cy);
      continue;
    }
    if (w.proj === 'slam') {
      for (const e of EHASH.query(cx, cy, w.aoe + 1, _q)) hurtEnemy(e, w.dmg);
      spawnBurst(cx, cy + 1, '#8a7a6a', 10); shake(1.5); sfx('boom', cx, cy);
      continue;
    }
    spawnProj({ x: cx, y: cy - 0.4, tx: tgt.x, ty: tgt.y, dmg: w.dmg * mult * (w.siege && ENEMIES[tgt.type].siege ? w.siege : 1), aoe: w.aoe || 0, from: 't', kind: w.proj,
      speed: w.proj === 'boulder' ? 11 : w.proj === 'fire' ? 9 : 16, homing: w.aoe ? null : tgt });
    sfx(w.proj === 'boulder' ? 'throw' : w.proj === 'fire' ? 'fire' : 'shoot', cx, cy);
  }
}

// ---------- заклинания ----------
function castSpell(name) {
  const p = S.player;
  if (p.dead > 0) return;
  const tech = name === 'meteor' ? 'meteor' : 'quake';
  if (!S.research.done.includes(tech)) { hint('Заклинание ещё не изучено'); return; }
  if (p.spellCd[name] > 0) { hint('Перезарядка: ' + Math.ceil(p.spellCd[name]) + ' с'); return; }
  if (name === 'meteor') {
    let tx = INPUT.wx, ty = INPUT.wy;
    const d = dist(tx, ty, p.x, p.y);
    if (d > 16) { tx = p.x + (tx - p.x) / d * 16; ty = p.y + (ty - p.y) / d * 16; }
    for (let i = 0; i < 14; i++) {
      const mx = tx + rand(-4.5, 4.5), my = ty + rand(-4.5, 4.5);
      S.delayed.push({ t: S.time + i * 0.18, fn: 'meteor', x: mx, y: my });
    }
    p.spellCd.meteor = 45;
    log('Метеоритный дождь!', 'good');
  } else {
    for (const e of EHASH.query(p.x, p.y, 7, _q)) { hurtEnemy(e, 160); e.stun = 2.5; }
    damageCampStructs(p.x, p.y, 7, 160);
    for (let i = 0; i < 40; i++) { const a = rand(0, 6.28), r = rand(0, 7); FX.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, vx: 0, vy: -1, life: 0.8, c: '#8a7a5a', s: 0.3 }); }
    shake(8); sfx('boom');
    p.spellCd.quake = 60;
    log('Землетрясение!', 'good');
  }
}

function runDelayed() {
  if (!S.delayed.length) return;
  for (const d of S.delayed) {
    if (d.t > S.time) continue;
    d.done = true;
    if (d.fn === 'meteor') {
      spawnProj({ x: d.x - 3, y: d.y - 8, tx: d.x, ty: d.y, dmg: 85, aoe: 1.7, from: 'p', kind: 'boulder', speed: 18 });
    }
  }
  S.delayed = S.delayed.filter(d => !d.done);
}

// ---------- эффекты ----------
function spawnBurst(x, y, c, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.28), s = rand(1, 4);
    FX.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: rand(0.3, 0.8), c, s: rand(0.08, 0.2) });
  }
}
// обломки разрушенной постройки
function spawnDebris(x, y, w, kind) {
  const cols = kind && (kind.includes('stone') || kind === 'keep') ? ['#8a857a', '#6a655b', '#a8a296'] : ['#7a5a2a', '#5e3a18', '#a07040', '#c8a060'];
  for (let i = 0; i < 10 + w * 10; i++) {
    const a = rand(0, 6.28), s = rand(1, 3 + w);
    FX.push({ x: x + rand(-w / 2, w / 2), y: y + rand(-w / 2, w / 2), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: rand(0.5, 1.2), c: pick(cols), s: rand(0.1, 0.25) });
  }
  for (let i = 0; i < 4 + w * 3; i++) spawnSmoke(x + rand(-w / 2, w / 2), y + rand(-w / 3, w / 3), 0.5);
}
function floatText(x, y, text, c) { FTEXT.push({ x, y, text, c, life: 1.2 }); if (FTEXT.length > 60) FTEXT.shift(); }
let SHAKE = 0;
function shake(v) { SHAKE = Math.max(SHAKE, v); }
function updateFx(dt) {
  updateCorpses(dt);
  // частицы обновляем и уплотняем на месте — без нового массива каждый кадр
  let n = 0;
  for (const f of FX) {
    if (f.ring) f.life -= dt;
    else { f.x += f.vx * dt; f.y += f.vy * dt; if (!f.smoke) f.vy += 3 * dt; f.life -= dt; }
    if (f.life > 0) FX[n++] = f;
  }
  FX.length = n;
  if (FX.length > 800) FX.splice(0, FX.length - 800);
  n = 0;
  for (const t of FTEXT) { t.y -= dt * 0.8; t.life -= dt; if (t.life > 0) FTEXT[n++] = t; }
  FTEXT.length = n;
  SHAKE = Math.max(0, SHAKE - dt * 12);
}
