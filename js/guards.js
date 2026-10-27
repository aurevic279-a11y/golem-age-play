'use strict';
// Охрана караванов: люди из дома людей, назначенные к повозке. Их одевают — оружие и броня из инвентаря героя.
// Охранник идёт рядом с повозкой, бьёт врагов вокруг неё; раненый (меньше 40% здоровья) отходит к повозке и лечится,
// а не дерётся до смерти. Погибнуть может — вещи тогда падают на землю.
// Повозки уязвимы: налётчики рядом нападают на них; разбитая повозка высыпает груз на дорогу.

const GUARD = { hp: 60, speed: 3.4, aggro: 8, flee: 0.4, regen: 3, perCart: 4 };
CART.hp = 300;

function cartGuards(c) { return S.workers.filter(w => w.guard === c.id); }
function freeHumans() { return S.workers.filter(w => w.kind === 'human' && !w.at && !w.guard); }
// оружие охранника: из WEAPONS (боеприпасы не тратит), без оружия — кулаки
function guardWeapon(w) { return w.gw && WEAPONS[w.gw] ? WEAPONS[w.gw] : { name: 'кулаки', range: 1.2, dmg: 5, cd: 0.9, melee: true }; }
function guardMaxHp(w) { return GUARD.hp + (w.ga && ARMORS[w.ga] ? ARMORS[w.ga].hp : 0); }
function cartMaxHp() { return CART.hp; }

function nearestGuard(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const w of S.workers) if (w.guard && w.x != null && !(w.ghp <= 0)) { const d = dist2(w.x, w.y, x, y); if (d < bd) { bd = d; best = w; } }
  return best;
}
function nearestCart(x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const c of S.carts) { const d = dist2(c.x, c.y, x, y); if (d < bd) { bd = d; best = c; } }
  return best;
}

function hurtGuard(w, dmg) {
  const ar = w.ga && ARMORS[w.ga] ? ARMORS[w.ga].armor : 0;
  const real = dmg * 10 / (10 + ar * 2);
  w.ghp = (w.ghp == null ? guardMaxHp(w) : w.ghp) - real; w.hurtT = S.time;
  floatText(w.x, w.y - 0.8, '-' + Math.round(real), '#ff9050');
  if (w.ghp > 0) return;
  // погиб: вещи — на землю, человек выбывает
  if (w.gw) dropItems(w.x, w.y, w.gw, 1);
  if (w.ga) dropItems(w.x, w.y, w.ga, 1);
  S.workers.splice(S.workers.indexOf(w), 1);
  spawnBurst(w.x, w.y, '#7a2a1a', 8);
  log(`Охранник ${w.name} погиб, защищая караван. Его вещи остались на дороге.`, 'warn');
}
function hurtCart(c, dmg) {
  c.hp = (c.hp == null ? cartMaxHp() : c.hp) - dmg; c.hurtT = S.time;
  floatText(c.x, c.y - 0.8, '-' + Math.round(dmg), '#ff9050');
  if (c.hp > 0) return;
  for (const id of c.inv.ids()) dropItems(c.x, c.y, id, c.inv.count(id));
  for (const w of cartGuards(c)) w.guard = null;
  S.carts.splice(S.carts.indexOf(c), 1);
  if (UI.openC === c) closeWin('cart');
  spawnBurst(c.x, c.y, '#8a5a2e', 14);
  log('Враги разбили повозку! Груз рассыпан по дороге — подберите. Поставьте охрану (окно повозки).', 'warn');
}

function guardMove(w, tx, ty, dt, sp) {
  const d = dist(w.x, w.y, tx, ty);
  w.moving = d > 0.12;
  if (!w.moving) return true;
  const st = Math.min(sp * dt, d), nx = w.x + (tx - w.x) / d * st, ny = w.y + (ty - w.y) / d * st;
  if (walkable(Math.floor(nx), Math.floor(ny)) || isRoad(Math.floor(nx), Math.floor(ny))) { w.x = nx; w.y = ny; }
  else { w.x += (tx - w.x) / d * st * 0.3; w.y += (ty - w.y) / d * st * 0.3; } // протискивается медленнее
  w.ang = Math.atan2(ty - w.y, tx - w.x); w.walk = (w.walk || 0) + dt;
  return false;
}

function updateGuards(dt) {
  for (const c of S.carts) {
    if (c.hp == null) c.hp = cartMaxHp();
    if (c.hp < cartMaxHp() && S.time - (c.hurtT || -99) > 8) c.hp = Math.min(cartMaxHp(), c.hp + 2 * dt);
  }
  for (const w of S.workers.slice()) {
    if (!w.guard) continue;
    const c = S.carts.find(o => o.id === w.guard);
    if (!c) { w.guard = null; continue; }
    if (w.x == null) { w.x = c.x; w.y = c.y; }
    const max = guardMaxHp(w);
    if (w.ghp == null || w.ghp > max) w.ghp = max;
    const wp = guardWeapon(w), i = cartGuards(c).indexOf(w);
    // враг у повозки или у самого охранника
    let foe = null, fd = 1e9;
    for (const e of EHASH.query(c.x, c.y, GUARD.aggro + 2, _q)) {
      if (e.dead || e.mode === 'guard' && dist(e.x, e.y, c.x, c.y) > GUARD.aggro) continue;
      const d = dist2(e.x, e.y, w.x, w.y); if (d < fd) { fd = d; foe = e; }
    }
    w.cd = (w.cd || 0) - dt;
    if (foe && w.ghp < max * GUARD.flee) {
      // ранен — отходит за повозку, подальше от врага
      const a = Math.atan2(c.y - foe.y, c.x - foe.x);
      guardMove(w, c.x + Math.cos(a) * 1.6, c.y + Math.sin(a) * 1.6, dt, GUARD.speed * 1.1);
      w.gstate = 'отступает';
    } else if (foe) {
      const d = Math.sqrt(fd), reach = wp.melee ? wp.range * 0.8 : wp.range * 0.85;
      // далеко от повозки за врагом не уходит
      if (d > reach && dist(w.x, w.y, c.x, c.y) < 9) guardMove(w, foe.x, foe.y, dt, GUARD.speed);
      else w.moving = false;
      if (d <= wp.range + 0.3 && w.cd <= 0) {
        w.cd = wp.cd * 1.2; w.atkT = S.time;
        if (wp.melee) hurtEnemy(foe, wp.dmg * 0.8, w);
        else spawnProj({ x: w.x, y: w.y - 0.4, tx: foe.x, ty: foe.y, dmg: wp.dmg * 0.8, aoe: wp.aoe || 0, from: 't', kind: wp.proj || 'arrow', speed: 15, homing: wp.aoe ? null : foe });
        w.ang = Math.atan2(foe.y - w.y, foe.x - w.x);
      }
      w.gstate = 'бьётся';
    } else {
      // идут рядом с повозкой: по бокам и чуть позади
      const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const ang = c.dir != null ? [Math.PI * 1.5, 0, Math.PI / 2, Math.PI][c.dir] : 0;
      const tx = c.x + Math.cos(ang + Math.PI / 2) * side * 0.9 - Math.cos(ang) * (0.4 + row * 0.8), ty = c.y + Math.sin(ang + Math.PI / 2) * side * 0.9 - Math.sin(ang) * (0.4 + row * 0.8);
      guardMove(w, tx, ty, dt, GUARD.speed);
      if (S.time - (w.hurtT || -99) > 5) w.ghp = Math.min(max, w.ghp + GUARD.regen * dt);
      w.gstate = 'охраняет';
    }
  }
}

// рисуем охранника: человек с оружием, полоска здоровья
function drawGuard(w, t) {
  const atk = w.atkT && S.time - w.atkT < 0.35;
  drawUnit3D('merchant', w.x, w.y, { ang: w.ang != null ? w.ang : Math.PI / 2, anim: atk ? 'swing' : w.moving ? 'run' : 'stance', t: w.moving ? (w.walk || 0) * 1.2 : t + w.id, k: atk ? (S.time - w.atkT) / 0.35 : null, scale: 0.9 });
  if (w.gw && SPR.item[w.gw]) drawSprite(SPR.item[w.gw], w.x + 0.15, w.y - 0.95, 0.32, 0.32);
  if (w.ghp < guardMaxHp(w)) hpBar(w.x - 0.3, w.y - 1.25, 0.6, w.ghp / guardMaxHp(w), w.ghp < guardMaxHp(w) * GUARD.flee ? '#ff6040' : null);
  if (VIEW.z >= 28) {
    G.font = `${Math.round(Math.max(10, VIEW.z * 0.22))}px sans-serif`; G.textAlign = 'center';
    G.lineWidth = 3; G.strokeStyle = '#000'; G.strokeText('🛡 ' + w.name, sx(w.x), sy(w.y - 1.4)); G.fillStyle = '#ffe0a0'; G.fillText('🛡 ' + w.name, sx(w.x), sy(w.y - 1.4));
  }
}

// ---------- окно повозки: раздел охраны ----------
function guardsHtml(c) {
  const gs = cartGuards(c), free = freeHumans();
  let h = `<h3>Охрана ${gs.length}/${GUARD.perCart}</h3>`;
  if (!gs.length) h += '<div class="dim">Без охраны налётчики разобьют повозку и рассыплют груз. Назначьте свободных людей из дома людей и дайте им оружие и броню.</div>';
  const inv = S.player.inv;
  const weapons = inv.ids().filter(id => WEAPONS[id]), armors = inv.ids().filter(id => ARMORS[id]);
  for (const w of gs) {
    const wp = guardWeapon(w);
    h += `<div class="worker" style="display:block"><b>🛡 ${w.name}</b> — ${w.gstate || 'охраняет'}, здоровье ${Math.ceil(w.ghp == null ? guardMaxHp(w) : w.ghp)}/${guardMaxHp(w)}
      <div class="row" style="flex-wrap:wrap">Оружие: <b>${w.gw ? ITEMS[w.gw].name : 'кулаки'}</b> <span class="dim">(урон ${wp.dmg}, дальность ${wp.range})</span>${w.gw ? `<button data-act="guardTake" data-arg="${w.id}|gw">Забрать</button>` : ''}</div>
      ${weapons.length ? `<div class="row" style="flex-wrap:wrap">Выдать: ${weapons.map(id => `<button data-act="guardGear" data-arg="${w.id}|gw|${id}" data-tip="i:${id}">${itemImg(id)}</button>`).join('')}</div>` : ''}
      <div class="row" style="flex-wrap:wrap">Броня: <b>${w.ga ? ITEMS[w.ga].name : 'нет'}</b>${w.ga ? `<button data-act="guardTake" data-arg="${w.id}|ga">Забрать</button>` : ''}</div>
      ${armors.length ? `<div class="row" style="flex-wrap:wrap">Выдать: ${armors.map(id => `<button data-act="guardGear" data-arg="${w.id}|ga|${id}" data-tip="i:${id}">${itemImg(id)}</button>`).join('')}</div>` : ''}
      <button data-act="guardFire" data-arg="${w.id}">Снять с охраны</button></div>`;
  }
  if (gs.length < GUARD.perCart) h += free.length ? `<div class="row" style="margin-top:4px"><button data-act="guardHire">Назначить охранника</button> <span class="dim">свободных людей: ${free.length}</span></div>` : '<div class="dim">Свободных людей нет: нужен дом людей и человек без работы (людей нанимают у торговца).</div>';
  h += `<div class="dim">Повозка: прочность ${Math.ceil(c.hp == null ? cartMaxHp() : c.hp)}/${cartMaxHp()} (чинится сама, если её не бьют). Охранники идут рядом, бьют врагов у повозки, раненые отходят и лечатся. Боеприпасы не тратят.</div>`;
  return h;
}
ACT.guardHire = () => { const c = UI.openC; if (!c) return; const w = freeHumans()[0]; if (!w || cartGuards(c).length >= GUARD.perCart) return; w.guard = c.id; w.x = c.x; w.y = c.y; w.ghp = guardMaxHp(w); renderCartWin(); };
ACT.guardFire = (id) => { const w = S.workers.find(x => x.id === +id); if (!w) return; for (const k of ['gw', 'ga']) if (w[k]) { S.player.inv.add(w[k], 1); w[k] = null; } w.guard = null; renderCartWin(); };
// выдать охраннику оружие или броню из инвентаря героя (в совместной игре — из инвентаря того, кто нажал)
ACT.guardGear = (arg) => {
  const [id, f, item] = arg.split('|'), w = S.workers.find(x => x.id === +id); if (!w || !item) return;
  if ((f === 'gw' ? !WEAPONS[item] : !ARMORS[item]) || S.player.inv.remove(item, 1) < 1) return;
  if (w[f]) S.player.inv.add(w[f], 1);
  w[f] = item; if (f === 'ga') w.ghp = Math.min(guardMaxHp(w), (w.ghp || 0) + ARMORS[item].hp);
  renderCartWin();
};
ACT.guardTake = (arg) => {
  const [id, f] = arg.split('|'), w = S.workers.find(x => x.id === +id); if (!w) return;
  if (w[f]) { S.player.inv.add(w[f], 1); w[f] = null; w.ghp = Math.min(w.ghp, guardMaxHp(w)); }
  renderCartWin();
};
