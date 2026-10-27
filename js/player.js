'use strict';
// Анимансер: ходьба, ручная добыча, крафт, здоровье.

const INPUT = { keys: {}, sx: 0, sy: 0, wx: 0, wy: 0, ldown: false, rdown: false, overUI: false };

const MINE_TIME = { 1: 0.7, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1.1, 7: 1.2, 8: 1.5, 9: 0.5, 10: 0.6, 11: 4 };

function newPlayer() {
  return { x: 0.5, y: 0.5, hp: 100, inv: new Inv(40, true), weapon: null, guns: [null, null, null], ammo: [null, null, null], gun: 0, armor: null, dead: 0, cd: 0, craft: [], mine: 0, mineKey: '', lastHurt: -99, spellCd: { meteor: 0, quake: 0 }, face: 1, walk: 0 };
}

// еда для героя: сколько здоровья в секунду и как долго. Чем лучше блюдо, тем сильнее и дольше
const EAT = { berries: { r: 1, t: 30 }, raw_meat: { r: 0.8, t: 25 }, stew: { r: 2, t: 60 }, roast: { r: 3, t: 75 }, pie: { r: 4.5, t: 90 } };
function eatFood(id) {
  const p = S.player, e = EAT[id];
  if (!e || !p.inv.count(id)) return false;
  // слабее текущей — не перебивает, пока та не кончится наполовину
  if (p.food && p.food.r > e.r && p.food.t > e.t / 2) { hint('Вы ещё сыты блюдом получше'); return false; }
  p.inv.remove(id, 1);
  p.food = { id, r: e.r, t: e.t };
  log(`Съедено: ${ITEMS[id].name} — +${e.r} здоровья в секунду на ${e.t} с`, 'good');
  sfx('click');
  return true;
}
function playerReach() { return 9 + (S.bonus.reach || 0) + (S.cheats && S.cheats.reach ? 500 : 0); }
function playerMaxHp() { const p = S.player; return Math.round((100 + (S.bonus.hp || 0) + (p.armor ? ARMORS[p.armor].hp : 0)) * TUNE.playerHp * (1 - golemOverload() * 0.7)); }
function playerArmor() { const p = S.player; return p.armor ? ARMORS[p.armor].armor : 0; }
function playerSpeed() {
  const p = S.player;
  return 5.5 * (1 + (S.bonus.speed || 0) + (p.armor && ARMORS[p.armor].speed ? ARMORS[p.armor].speed : 0)) * (p.riding ? 2.1 : 1) * (1 - golemOverload() * 0.6);
}

// герой занимает кружок радиусом 0.2, а постройки (кроме стен и ворот) — свою клетку без краёв по 0.22:
// между соседними колёсами, сундуками и машинами остаётся щель, в которую можно протиснуться. Факелы проходимы.
const BLD_INSET = 0.22;
function standPoint(px, py) {
  const tx = Math.floor(px), ty = Math.floor(py), c = chunkOf(tx, ty), i = tidx(tx, ty);
  if (c.ground[i] === GROUND.water || c.ground[i] === GROUND.wall) return false;
  if (campStructAt(tx, ty)) return false;
  const b = c.bld[i];
  if (!b) return true;
  const d = BUILDINGS[b.type];
  if (d.walk || d.gate || d.kind === 'vector' || b.type === 'torch') return true;
  if (d.kind === 'wall') return false;
  return px < b.x + BLD_INSET || px > b.x + b.w - BLD_INSET || py < b.y + BLD_INSET || py > b.y + b.h - BLD_INSET;
}
function canStand(x, y) {
  const r = 0.2;
  return standPoint(x - r, y - r) && standPoint(x + r, y - r) && standPoint(x - r, y + r) && standPoint(x + r, y + r);
}

// ближайшая свободная точка (по кольцам вокруг), чтобы герой не застревал в постройках
function freeSpotNear(x, y, maxR) {
  if (canStand(x, y)) return { x, y };
  const bx = Math.floor(x) + 0.5, by = Math.floor(y) + 0.5;
  for (let r = 1; r <= (maxR || 12); r++) {
    let best = null, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = bx + dx, ny = by + dy;
      if (!canStand(nx, ny)) continue;
      const d = dist2(nx, ny, x, y);
      if (d < bd) { bd = d; best = { x: nx, y: ny }; }
    }
    if (best) return best;
  }
  return null;
}

let lastExploreTile = '';
function updatePlayer(dt) {
  const p = S.player;
  if (p.dead > 0) {
    p.dead -= dt;
    if (p.dead <= 0) respawnPlayer();
    return;
  }
  // колья лагерей (ограда из кольев) ранят, если в них упереться: раз в полсекунды
  p.spikeT = (p.spikeT || 0) - dt;
  if (p.spikeT <= 0) {
    p.spikeT = 0.5;
    for (const [ox, oy] of [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
      const s = campStructAt(Math.floor(p.x + ox), Math.floor(p.y + oy));
      if (s && s.kind === 'spikewall') { damagePlayer(4, 'spikes'); floatText(p.x, p.y - 0.8, 'колья!', '#ff8060'); break; }
    }
  }
  // оказались внутри постройки (поставили её на точку возрождения и т.п.) — выходим на свободное место
  if (!canStand(p.x, p.y)) {
    const f = freeSpotNear(p.x, p.y, 12);
    if (f) { p.x = f.x; p.y = f.y; }
  }
  // ходьба
  const k = INPUT.keys;
  let mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  let my = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
  if (mx || my) {
    const l = Math.hypot(mx, my), sp = playerSpeed() * dt;
    if (p.riding) S.stats.ridden = (S.stats.ridden || 0) + sp;
    const nx = p.x + mx / l * sp, ny = p.y + my / l * sp;
    if (canStand(nx, p.y)) p.x = nx;
    if (canStand(p.x, ny)) p.y = ny;
    if (mx) p.face = mx > 0 ? 1 : -1;
    if (!(p.atkT != null && p.atkT < 0.35)) p.ang = Math.atan2(my, mx);
    p.walk += dt;
    if (p.focus) p.focus.approach = false; // сами ходим — герой не тянется к цели
  } else if (p.focus && p.focus.approach) {
    // подходим к выбранной кликом цели на дистанцию удара
    const fp = focusPos(p), w = playerAttackMode(p);
    if (fp) {
      const d = dist(p.x, p.y, fp.x, fp.y), want = Math.max(0.6, w.range + fp.r - 0.4);
      if (d > want) {
        const sp = Math.min(playerSpeed() * dt, d - want);
        const ux = (fp.x - p.x) / d, uy = (fp.y - p.y) / d;
        const ox = p.x, oy = p.y;
        if (canStand(p.x + ux * sp, p.y)) p.x += ux * sp;
        if (canStand(p.x, p.y + uy * sp)) p.y += uy * sp;
        p.face = ux < 0 ? -1 : 1;
        p.walk += dt;
        if (Math.abs(p.x - ox) + Math.abs(p.y - oy) < sp * 0.1) p.focus.approach = false; // упёрлись
      }
    }
  }
  // конвейер под ногами везёт героя: поперёк — сносит вбок, по ходу — быстрее, против хода — медленнее
  if (!p.riding) {
    const ub = bldAt(Math.floor(p.x), Math.floor(p.y));
    if (ub && BUILDINGS[ub.type].kind === 'belt' && !BUILDINGS[ub.type].split) {
      const v = BUILDINGS[ub.type].speed * beltSat(ub) * dt, [bdx, bdy] = DIRS[ub.dir];
      if (canStand(p.x + bdx * v, p.y)) p.x += bdx * v;
      if (canStand(p.x, p.y + bdy * v)) p.y += bdy * v;
    }
  }
  if (p.x !== p.lastX || p.y !== p.lastY) {
    p.lastX = p.x; p.lastY = p.y;
    const t = Math.floor(p.x) + ',' + Math.floor(p.y);
    if (t !== lastExploreTile) { lastExploreTile = t; explore(p.x, p.y, 14); }
  }
  // ручная добыча
  p.mining = false;
  if (INPUT.ldown && !UI.tool && !INPUT.overUI && !p.riding) {
    const tx = Math.floor(INPUT.wx), ty = Math.floor(INPUT.wy);
    let r = resAt(tx, ty);
    // рудная гора: руками добывается бесконечно, но вдвое медленнее, чем обычная залежь (шахта выгоднее)
    const mount = r === RES_ID.mount;
    if (mount) r = amtAt(tx, ty);
    // посевы: собрать спелое руками
    if (r === RES_ID.crop && !bldAt(tx, ty) && dist(tx + 0.5, ty + 0.5, p.x, p.y) <= 3.5) {
      if (!cropRipe(cropKey(tx, ty))) hint(`Ещё растёт: ${Math.round(cropGrowth(cropKey(tx, ty)) * 100)}%`);
      else if (!INPUT.cropLock) {
        INPUT.cropLock = true;
        const h = harvestCrop(tx, ty);
        if (h) { const n = p.inv.add(h.id, h.n); floatText(tx + 0.5, ty, '+' + n + ' ' + ITEMS[h.id].name, '#e8dcbc'); sfx('chop'); }
      }
      r = 0;
    }
    if (r && !bldAt(tx, ty)) {
      if (dist(tx + 0.5, ty + 0.5, p.x, p.y) > 3.5) hint('Подойдите ближе, чтобы добывать');
      else {
        const key = tx + ',' + ty;
        if (key !== p.mineKey) { p.mineKey = key; p.mine = 0; }
        p.mining = true; p.mineX = tx; p.mineY = ty;
        p.mine += dt * (1 + (S.bonus.mining || 0)) / (MINE_TIME[r] * (mount ? 2 : 1));
        if (p.mine >= 1) {
          p.mine = 0;
          const item = mount ? RES[r].item : oreItem(tx, ty, r);
          if (p.inv.space(item) <= 0) hint('Инвентарь полон');
          else if (mount || takeResource(tx, ty, 1)) {
            p.inv.add(item, 1);
            S.stats.mined[item] = (S.stats.mined[item] || 0) + 1; statP(item, 1);
            floatText(tx + 0.5, ty, '+1 ' + ITEMS[item].name, '#e8dcbc');
            sfx(r === RES_ID.tree ? 'chop' : 'mine');
            if (r === RES_ID.ruins) log('Вы нашли древнюю реликвию!', 'good');
          }
        }
      }
    }
  }
  if (!INPUT.ldown) INPUT.cropLock = false;
  // крафт
  updateCraft(dt);
  // здоровье
  const maxHp = playerMaxHp();
  if (S.time - p.lastHurt > 5) p.hp = Math.min(maxHp, p.hp + dt * (2 + (p.armor && ARMORS[p.armor].regen || 0)));
  // съеденная еда: прибавка к регенерации на время (лечит и в бою)
  if (p.food && p.food.t > 0) { p.food.t -= dt; if (p.dead <= 0) p.hp = Math.min(maxHp, p.hp + dt * p.food.r); if (p.food.t <= 0) p.food = null; }
  if (p.hp > maxHp) p.hp = maxHp;
  for (const s in p.spellCd) if (p.spellCd[s] > 0) p.spellCd[s] -= dt;
}

function damagePlayer(d, kind) {
  // в гостях здоровье считает хозяин
  if (typeof MP !== 'undefined' && MP.role === 'client') return;
  const p = S.player;
  if (p.dead > 0 || S.time < (p.invuln || 0) || (S.cheats && S.cheats.god)) return;
  // рунический плащ ослабляет магию шаманов и эльфийских магов
  const ar = p.armor && ARMORS[p.armor];
  if (ar && ar.magicRes && (kind === 'magic' || kind === 'arcane')) d *= 1 - ar.magicRes;
  d = Math.max(1, d - playerArmor());
  p.hp -= d;
  p.lastHurt = S.time;
  floatText(p.x, p.y - 0.6, '-' + Math.round(d), '#ff6050');
  if (p.hp <= 0) {
    p.hp = 0; p.dead = 6; p.riding = false;
    log('Анимансер пал! Возрождение на базе через 6 секунд…', 'warn');
    sfx('death');
    spawnBurst(p.x, p.y, '#c03030', 20);
  } else sfx('hurt');
}

function respawnPlayer() {
  const p = S.player;
  p.x = S.spawn.x; p.y = S.spawn.y; p.hp = playerMaxHp(); p.dead = 0;
  p.invuln = S.time + 5;
  p.focus = null;
  const f = freeSpotNear(p.x, p.y, 20);
  if (f) { p.x = f.x; p.y = f.y; }
  if (!MP.silent) { CAM.x = p.x; CAM.y = p.y; }
  explore(p.x, p.y, 14);
  log('Анимансер возродился на базе.', 'good');
}

// ---------- крафт ----------
function handRecipeFor(item) {
  for (const id in RECIPES) {
    const r = RECIPES[id];
    if (r.at.includes('hand') && r.out[item] && isUnlockedRecipe(id)) return r;
  }
  return null;
}

// план с автоматическим крафтом промежуточных деталей.
// v — остаток инвентаря, take — что берём из инвентаря, extra — излишки деталей, сделанных по плану
function planCraft(rid, times, v, plan, depth, take, extra) {
  const r = RECIPES[rid];
  take = take || {}; extra = extra || {};
  for (const id in r.in) {
    let need = r.in[id] * times;
    const fromX = Math.min(extra[id] || 0, need);
    if (fromX) { extra[id] -= fromX; need -= fromX; }
    const have = v[id] || 0;
    if (have >= need) { v[id] = have - need; take[id] = (take[id] || 0) + need; continue; }
    const sub = handRecipeFor(id);
    if (!sub || depth > 5) return false;
    if (have) { take[id] = (take[id] || 0) + have; v[id] = 0; }
    const runs = Math.ceil((need - have) / sub.out[id]);
    if (!planCraft(sub.id, runs, v, plan, depth + 1, take, extra)) return false;
    extra[id] = (extra[id] || 0) + runs * sub.out[id] - (need - have);
  }
  plan.push({ r: rid, n: times, d: depth });
  return true;
}
// сколько раз можно скрафтить рецепт из того, что есть (с автокрафтом деталей)
function maxHandCraft(rid, cap) {
  if (S.cheats && S.cheats.freeCraft) return cap || 999;
  const ok = (n) => planCraft(rid, n, Object.assign({}, S.player.inv.c), [], 0);
  if (!ok(1)) return 0;
  let lo = 1, hi = 2;
  cap = cap || 999;
  while (hi <= cap && ok(hi)) { lo = hi; hi *= 2; }
  hi = Math.min(hi, cap + 1);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ok(m)) lo = m; else hi = m; }
  return lo;
}

// Крафт сразу забирает из инвентаря ВСЁ сырьё на заказ (и на детали) в «корзину заказа» p.craftBag[g].
// Детали, сделанные по пути, тоже идут в корзину; итог — в инвентарь; излишки — в инвентарь в конце.
function queueCraft(rid, times) {
  if (typeof MP !== 'undefined') mpCmd({ f: 'craft', rid, n: times });
  // чит «крафт без ресурсов»: сырьё не нужно и не тратится
  if (S.cheats && S.cheats.freeCraft) {
    for (let i = 0; i < times; i++) S.player.craft.push({ r: rid, t: RECIPES[rid].time, started: true, free: true });
    sfx('click');
    return true;
  }
  const p = S.player;
  const v = Object.assign({}, p.inv.c), take = {};
  const plan = [];
  if (!planCraft(rid, times, v, plan, 0, take, {})) { hint('Не хватает ресурсов'); sfx('error'); return false; }
  const g = 'g' + (S.nextId++);
  p.craftBag = p.craftBag || {};
  const bag = p.craftBag[g] = {};
  for (const id in take) if (take[id] > 0) bag[id] = p.inv.remove(id, take[id]);
  statCAll(take);
  for (const st of plan) for (let i = 0; i < st.n; i++) p.craft.push({ r: st.r, t: RECIPES[st.r].time, started: false, g, fin: st.d === 0 });
  sfx('click');
  return true;
}

function canHandCraft(rid) {
  if (S.cheats && S.cheats.freeCraft) return true;
  const v = Object.assign({}, S.player.inv.c);
  return planCraft(rid, 1, v, [], 0);
}

// вернуть корзину заказа в инвентарь (что не влезло — на землю рядом)
function craftBagReturn(g) {
  const p = S.player, bag = p.craftBag && p.craftBag[g];
  if (!bag) return;
  for (const id in bag) {
    const got = p.inv.add(id, bag[id]);
    if (got < bag[id] && typeof dropItems === 'function') dropItems(p.x, p.y, id, bag[id] - got);
  }
  delete p.craftBag[g];
}

function updateCraft(dt) {
  const p = S.player, q = p.craft;
  if (!q.length) return;
  const e = q[0], r = RECIPES[e.r], inv = p.inv;
  const bag = e.g && p.craftBag && p.craftBag[e.g];
  if (!e.started) {
    if (bag) {
      // из корзины заказа; если чего-то нет (старый сейв, сбой) — добираем из инвентаря
      for (const id in r.in) {
        const need = r.in[id], fromBag = Math.min(bag[id] || 0, need);
        if (fromBag < need && inv.count(id) < need - fromBag) {
          q.splice(0, q.length, ...q.filter(x => x.g !== e.g)); craftBagReturn(e.g);
          hint('Крафт прерван: не хватает ресурсов'); return;
        }
      }
      for (const id in r.in) {
        const need = r.in[id], fromBag = Math.min(bag[id] || 0, need);
        if (fromBag) { bag[id] -= fromBag; if (!bag[id]) delete bag[id]; }
        if (need > fromBag) { inv.remove(id, need - fromBag); statC(id, need - fromBag); }
      }
    } else {
      if (!inv.pay(r.in)) { q.shift(); hint('Крафт прерван: не хватает ресурсов'); return; }
      statCAll(r.in);
    }
    e.started = true;
  }
  e.t -= S.cheats && S.cheats.instant ? 999 : dt * TUNE.handCraft * (1 - golemOverload() * 0.8);
  if (e.t <= 0) {
    for (const id in r.out) {
      if (bag && !e.fin) { bag[id] = (bag[id] || 0) + r.out[id]; continue; }
      const got = inv.add(id, r.out[id]);
      S.stats.made[id] = (S.stats.made[id] || 0) + got; statP(id, got);
      if (got < r.out[id] && typeof dropItems === 'function') dropItems(p.x, p.y, id, r.out[id] - got);
    }
    q.shift();
    if (bag && !q.some(x => x.g === e.g)) craftBagReturn(e.g);
  }
}

// отмена: детали заказа — вся группа целиком, сырьё возвращается в инвентарь
function cancelCraft(i) {
  if (typeof MP !== 'undefined') mpCmd({ f: 'cancel', i });
  const p = S.player, q = p.craft, e = q[i];
  if (!e) return;
  if (e.g && p.craftBag && p.craftBag[e.g]) {
    const bag = p.craftBag[e.g];
    for (const x of q) if (x.g === e.g && x.started) for (const id in RECIPES[x.r].in) bag[id] = (bag[id] || 0) + RECIPES[x.r].in[id];
    for (let j = q.length - 1; j >= 0; j--) if (q[j].g === e.g) q.splice(j, 1);
    craftBagReturn(e.g);
    return;
  }
  if (e.started && !e.free) S.player.inv.addAll(RECIPES[e.r].in);
  q.splice(i, 1);
}

// ---------- оружие: три слота, у каждого свой слот боеприпасов ----------
// старые сохранения: одно оружие + праща
function ensureGuns(p) {
  if (!p.guns) {
    p.guns = ['sling', p.weapon && p.weapon !== 'sling' ? p.weapon : null, null];
    p.gun = p.guns[1] ? 1 : 0;
  }
  if (!p.ammo) p.ammo = [null, null, null];
  if (p.gun == null) p.gun = 0;
  p.weapon = p.guns[p.gun] || null;
}
// подходит ли боеприпас к оружию
function ammoFits(wid, aid) { const w = WEAPONS[wid]; return !!(w && w.ammo && w.ammo.includes(aid)); }
// сколько боеприпасов у слота: в слоте + в инвентаре (для подсказок)
function gunAmmoTotal(p, i) {
  const w = WEAPONS[p.guns[i]];
  if (!w || !w.ammo) return 0;
  const a = p.ammo[i];
  let n = a ? a.n : 0;
  for (const id of w.ammo) n += p.inv.count(id);
  return n;
}
// пустой слот боеприпасов сам заряжается из инвентаря (сильнейшими подходящими, целой стопкой)
function reloadGun(p, i) {
  const w = WEAPONS[p.guns[i]];
  if (!w || !w.ammo) return;
  // старые сохранения: в слоте пращи лежали камни — возвращаем их в сумку
  if (p.ammo[i] && !ammoFits(p.guns[i], p.ammo[i].id)) unloadAmmo(p, i);
  const a = p.ammo[i];
  if (a && a.n > 0) {
    // добираем стопку из инвентаря тем же видом
    const room = stackOf(a.id) - a.n, k = room > 0 ? p.inv.remove(a.id, room) : 0;
    a.n += k;
    return;
  }
  let best = null;
  for (const id of w.ammo) if (p.inv.count(id) > 0 && (!best || (AMMO[id] ? AMMO[id].mul : 1) > (AMMO[best] ? AMMO[best].mul : 1))) best = id;
  if (!best) { p.ammo[i] = null; return; }
  p.ammo[i] = { id: best, n: p.inv.remove(best, stackOf(best)) };
}
// снять боеприпасы слота в инвентарь
function unloadAmmo(p, i) {
  const a = p.ammo[i];
  if (!a) return;
  const k = p.inv.add(a.id, a.n);
  a.n -= k;
  if (a.n <= 0) p.ammo[i] = null;
}
// переключить слот оружия (Tab): следующий непустой
function switchGun(dir) {
  const p = S.player;
  ensureGuns(p);
  for (let k = 1; k <= 3; k++) {
    const i = (p.gun + (dir || 1) * k + 9) % 3;
    if (p.guns[i] || k === 3) { selectGun(i); return; }
  }
}
function selectGun(i) {
  const p = S.player;
  ensureGuns(p);
  if (i < 0 || i > 2) return;
  if (typeof MP !== 'undefined') mpCmd({ f: 'gunSel', i });
  p.gun = i; p.weapon = p.guns[i] || null;
  reloadGun(p, i);
  if (!MP.silent) { hint('Оружие: ' + (p.weapon ? WEAPONS[p.weapon].name : 'посох (слот пуст)')); sfx('click'); }
}

function equipItem(id) {
  if (typeof MP !== 'undefined') mpCmd({ f: 'equip', id });
  const p = S.player, inv = p.inv;
  ensureGuns(p);
  if (ITEMS[id].weapon) {
    if (!inv.count(id)) return;
    // в первый пустой слот, иначе вместо текущего
    let i = p.guns.indexOf(null);
    if (i < 0) i = p.gun;
    if (p.guns[i]) { inv.add(p.guns[i], 1); unloadAmmo(p, i); }
    inv.remove(id, 1); p.guns[i] = id;
    if (p.ammo[i] && !ammoFits(id, p.ammo[i].id)) unloadAmmo(p, i);
    p.gun = i; p.weapon = id;
    reloadGun(p, i);
    log(`Оружие в слоте ${i + 1}: ${WEAPONS[id].name}`);
  } else if (ITEMS[id].armor) {
    if (p.armor) inv.add(p.armor, 1);
    inv.remove(id, 1); p.armor = id;
    log('Надета броня: ' + ITEMS[id].name);
  } else if (AMMO[id]) {
    // боеприпасы — в подходящий слот (сначала текущий)
    const order = [p.gun, 0, 1, 2];
    const i = order.find(k => ammoFits(p.guns[k], id));
    if (i == null) { hint('Нет оружия под ' + ITEMS[id].name); return; }
    if (p.ammo[i] && p.ammo[i].id !== id) unloadAmmo(p, i);
    if (p.ammo[i] && p.ammo[i].id !== id) return; // инвентарь полон
    if (!p.ammo[i]) p.ammo[i] = { id, n: 0 };
    p.ammo[i].n += inv.remove(id, stackOf(id) - p.ammo[i].n);
    if (p.ammo[i].n <= 0) p.ammo[i] = null;
  }
  sfx('click');
}
// slot: 'armor', 'gun' или 'ammo' (i — номер слота оружия)
function unequip(slot, i) {
  if (typeof MP !== 'undefined') mpCmd({ f: 'unequip', slot, i });
  const p = S.player;
  ensureGuns(p);
  if (slot === 'weapon') { slot = 'gun'; i = p.gun; }
  if (slot === 'gun' && p.guns[i]) {
    unloadAmmo(p, i);
    if (p.inv.add(p.guns[i], 1)) { p.guns[i] = null; if (p.gun === i) p.weapon = null; }
  }
  if (slot === 'ammo') unloadAmmo(p, i);
  if (slot === 'armor' && p.armor) { p.inv.add(p.armor, 1); p.armor = null; }
}
