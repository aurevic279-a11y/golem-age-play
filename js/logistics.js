'use strict';
// Конвейеры, големы-векторы (манипуляторы), гнёзда горгулий.
// Конвейер хранит не клетки, а позиции предметов вдоль линии; у ленты две полосы (it.l: 0 — левая, 1 — правая
// по ходу ленты), зазор между предметами — внутри своей полосы.

const GAP = 0.26;
// без вала конвейер ползёт на 30% скорости; вал или генератор рядом с любым конвейером цепочки — полная скорость
const BELT_CRAWL = 0.3;

function isBelt(b) { return !!b && !b.floor && BUILDINGS[b.type].kind === 'belt'; }
function beltNext(b) {
  if (b.pair) return S.buildings.get(b.pair) || null; // вход подземного конвейера ведёт к выходу
  const [dx, dy] = DIRS[b.dir]; return bldAt(b.x + dx, b.y + dy);
}
function beltLen(b) { return b.pair ? b.len || 1 : 1; }

// ---------- подземный конвейер: пары вход → выход ----------
function pairUnderground(b) {
  const def = BUILDINGS[b.type];
  if (!def.under) return;
  const [dx, dy] = DIRS[b.dir];
  // сзади есть свободный вход — мы его выход
  for (let k = 1; k <= def.under + 1; k++) {
    const o = bldAt(b.x - dx * k, b.y - dy * k);
    if (!o || o.type !== b.type || o.dir !== b.dir) continue;
    if (!o.pair && !o.exitOf) { o.pair = b.id; o.len = k; b.exitOf = o.id; }
    break;
  }
  if (b.exitOf) return;
  // впереди свободный — он наш выход
  for (let k = 1; k <= def.under + 1; k++) {
    const o = bldAt(b.x + dx * k, b.y + dy * k);
    if (!o || o.type !== b.type || o.dir !== b.dir) continue;
    if (!o.pair && !o.exitOf) { b.pair = o.id; b.len = k; o.exitOf = b.id; }
    break;
  }
}
// свободный вход того же вида и направления позади клетки (для подсказки при стройке): ok — дотянется ли
function underEntryFor(type, x, y, dir) {
  const def = BUILDINGS[type], [dx, dy] = DIRS[dir];
  for (let k = 1; k <= def.under + 12; k++) {
    const o = bldAt(x - dx * k, y - dy * k);
    if (!o || o.type !== type || o.dir !== dir) continue;
    if (o.pair || o.exitOf) return null;
    return { b: o, k, ok: k <= def.under + 1 };
  }
  return null;
}
function unpairUnderground(b) {
  if (b.pair) { const o = S.buildings.get(b.pair); if (o) o.exitOf = null; b.pair = null; b.len = 1; if (b.items) for (const it of b.items) if (it.p > 1) it.p = 1; }
  if (b.exitOf) { const o = S.buildings.get(b.exitOf); if (o) { o.pair = null; o.len = 1; if (o.items) for (const it of o.items) if (it.p > 1) it.p = 1; } b.exitOf = null; }
}

// разделитель: выходы вперёд, влево, вправо — на конвейеры, идущие от него
function splitterOut(b, id, lane) {
  // фильтр: выбранный предмет — только прямо, остальные — только в стороны
  const outs = !b.filter ? [b.dir, (b.dir + 3) % 4, (b.dir + 1) % 4] : id === b.filter ? [b.dir] : [(b.dir + 3) % 4, (b.dir + 1) % 4];
  for (let k = 0; k < outs.length; k++) {
    const d = outs[((b.rr || 0) + k) % outs.length];
    const [dx, dy] = DIRS[d];
    const nb = bldAt(b.x + dx, b.y + dy);
    if (!isBelt(nb) || nb.dir === (d + 2) % 4) continue;
    const pos = beltEntryPos(d, nb);
    if (pos < 0) continue;
    const nl = beltLaneFrom(d, nb, lane || 0);
    if (beltCanAccept(nb, pos, nl)) { beltInsert(nb, id, pos, nl); b.rr = ((b.rr || 0) + k + 1) % 6; return true; }
  }
  return false;
}
// поворот: в конвейер входит лента сбоку, а сзади — нет. Возвращает направление входящего потока или -1
function beltCurveIn(b) {
  const def = BUILDINGS[b.type];
  if (def.split || def.under) return -1;
  const feeds = (d) => { const [dx, dy] = DIRS[d], n = bldAt(b.x - dx, b.y - dy); return !!n && isBelt(n) && n.dir === d && !n.pair && !BUILDINGS[n.type].split; };
  if (feeds(b.dir)) return -1;
  const l = feeds((b.dir + 3) % 4), r = feeds((b.dir + 1) % 4);
  return l && !r ? (b.dir + 3) % 4 : r && !l ? (b.dir + 1) % 4 : -1;
}
// поворот ленты — кэш до стройки/сноса (рисование спрашивает его для каждого предмета в каждом кадре)
function beltCI(b) { if (b._civ !== BLD_VER) { b._ci = b.id ? beltCurveIn(b) : -1; b._civ = BLD_VER; } return b._ci; }
// точка на ленте: p 0..1 от входа к выходу (на повороте — по дуге)
function beltPoint(b, p) {
  const ci = beltCI(b), [dx, dy] = DIRS[b.dir];
  if (ci < 0) { const k = p - 0.5; return [b.x + 0.5 + dx * k, b.y + 0.5 + dy * k]; }
  const [fx, fy] = DIRS[ci];
  const cx = b.x + 0.5 + (-fx + dx) * 0.5, cy = b.y + 0.5 + (-fy + dy) * 0.5;
  const a0 = Math.atan2(-fy * 0.5 + b.y + 0.5 - cy, -fx * 0.5 + b.x + 0.5 - cx), a1 = Math.atan2(dy * 0.5 + b.y + 0.5 - cy, dx * 0.5 + b.x + 0.5 - cx);
  let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const a = a0 + da * clamp(p, 0, 1);
  return [cx + Math.cos(a) * 0.5, cy + Math.sin(a) * 0.5];
}
// точка предмета с учётом полосы: сдвиг поперёк ленты (на повороте — поперёк дуги)
const LANE_OFF = 0.2;
function beltLanePoint(b, p, lane) {
  const ci = beltCI(b), [dx, dy] = DIRS[b.dir], k = lane ? -LANE_OFF : LANE_OFF;
  if (ci < 0) { const q = p - 0.5; return [b.x + 0.5 + dx * q + dy * k, b.y + 0.5 + dy * q - dx * k]; } // левая сторона по ходу: (dy, -dx)
  // поворот: дуга вокруг угла клетки; левая полоса снаружи или внутри — по направлению поворота
  const [fx, fy] = DIRS[ci];
  const cx = b.x + 0.5 + (-fx + dx) * 0.5, cy = b.y + 0.5 + (-fy + dy) * 0.5;
  const a0 = Math.atan2(-fy * 0.5 + b.y + 0.5 - cy, -fx * 0.5 + b.x + 0.5 - cx), a1 = Math.atan2(dy * 0.5 + b.y + 0.5 - cy, dx * 0.5 + b.x + 0.5 - cx);
  let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const a = a0 + da * clamp(p, 0, 1), r = 0.5 + k * Math.sign(da);
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}
function beltEntryPos(fromDir, to) {
  if (to.dir === fromDir) return 0;
  if (fromDir === beltCurveIn(to)) return 0; // поворот: лента продолжается по дуге
  if ((to.dir + 2) % 4 === fromDir) return -1;
  return 0.5;
}
function beltCanAccept(belt, pos, lane) {
  lane = lane || 0;
  for (const it of belt.items) if ((it.l || 0) === lane && Math.abs(it.p - pos) < GAP) return false;
  return true;
}
function beltInsert(belt, id, pos, lane) {
  let i = 0;
  while (i < belt.items.length && belt.items[i].p > pos) i++;
  belt.items.splice(i, 0, { id, p: pos, l: lane || 0 });
}
// на какую полосу попадает предмет при переходе на следующий конвейер:
// прямо и на повороте — та же полоса; сбоку — ближняя к входящей ленте
function beltLaneFrom(fromDir, to, lane) {
  if (to.dir === fromDir || fromDir === beltCurveIn(to) || BUILDINGS[to.type].split) return lane;
  return fromDir === (to.dir + 1) % 4 ? 0 : 1;
}
// манипулятор или бур кладёт на дальнюю от себя полосу; вдоль ленты — на правую
function dropLane(src, dst) {
  // манипулятор с выбранной полосой: 'L' — левая (0), 'R' — правая (1) по ходу ленты
  if (src && src.lane === 'L') return 0;
  if (src && src.lane === 'R') return 1;
  const vd = src ? src.dir || 0 : 1;
  return vd === (dst.dir + 3) % 4 ? 0 : 1;
}

function beltSat(b) {
  const g = b.bg;
  if (!g || g.net < 0) return S.cheats && S.cheats.free ? 1 : BELT_CRAWL;
  return BELT_CRAWL + (1 - BELT_CRAWL) * (g.powerSat || 0);
}
function updateBelt(b, dt) {
  const items = b.items;
  if (!items.length) return;
  const def = BUILDINGS[b.type];
  const v = def.speed * TUNE.belt * dt * beltSat(b), L = beltLen(b);
  let nb = null, checked = false, lim0 = L, lim1 = L, prev = Infinity, unsorted = false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], ln = it.l || 0;
    const lim = ln ? lim1 : lim0;
    if (it.p < lim) it.p = Math.min(it.p + v, lim);
    if (it.p >= L) {
      // первый на своей полосе дошёл до конца — пробуем передать дальше
      if (def.split) {
        if (splitterOut(b, it.id, ln)) { items.splice(i, 1); i--; continue; }
      } else {
        if (!checked) { nb = beltNext(b); checked = true; }
        if (isBelt(nb)) {
          const pos = beltEntryPos(b.dir, nb);
          if (pos >= 0) {
            const nl = beltLaneFrom(b.dir, nb, ln);
            if (beltCanAccept(nb, pos, nl)) { items.splice(i, 1); beltInsert(nb, it.id, pos, nl); i--; continue; }
          }
        } else if (nb && BUILDINGS[nb.type].beltIn && insertInto(nb, it.id, 1) === 1) { items.splice(i, 1); i--; continue; }
      }
    }
    if (ln) lim1 = it.p - GAP; else lim0 = it.p - GAP;
    if (it.p > prev) unsorted = true;
    prev = it.p;
  }
  if (unsorted) items.sort((a, c) => c.p - a.p);
}

// ---------- векторы ----------
function vecReach(b) { return BUILDINGS[b.type].reach || 1; }
function vecSrc(b) { const [dx, dy] = DIRS[b.dir], r = vecReach(b); return bldAt(b.x - dx * r, b.y - dy * r); }
function vecDst(b) { const [dx, dy] = DIRS[b.dir], r = vecReach(b); return bldAt(b.x + dx * r, b.y + dy * r); }
// пустая клетка пола вместо постройки: { floor: true, x, y }
function vecSrcTile(b) { const [dx, dy] = DIRS[b.dir], r = vecReach(b); return [b.x - dx * r, b.y - dy * r]; }
function vecDstTile(b) { const [dx, dy] = DIRS[b.dir], r = vecReach(b); return [b.x + dx * r, b.y + dy * r]; }
function vecSrcAny(b) { const o = vecSrc(b); if (o) return o; const [x, y] = vecSrcTile(b); return floorAt(x, y) ? { floor: true, x, y } : null; }
function vecDstAny(b) { const o = vecDst(b); if (o) return o; const [x, y] = vecDstTile(b); return floorOk(x, y) ? { floor: true, x, y } : null; }
function takeAny(src, filter) { return src.floor ? floorTake(src.x, src.y, filter) : isBelt(src) ? takeFromBelt(src, filter) : extractFrom(src, filter); }

// сколько предмета уже лежит в постройке (для лимита векторов)
function countIn(b, id) {
  let n = 0;
  for (const k of ['inv', 'inp', 'fuel']) if (b[k] && b[k].count) n += b[k].count(id);
  return n;
}
function canDrop(dst, id, src) {
  if (dst.floor) return floorCount(dst.x, dst.y) < FLOOR_CAP;
  if (isBelt(dst)) return beltCanAccept(dst, 0.5, dropLane(src, dst));
  return acceptCount(dst, id) > 0;
}
function dropInto(dst, id, src) {
  if (dst.floor) return floorPut(dst.x, dst.y, id, 1) === 1;
  if (isBelt(dst)) {
    const ln = dropLane(src, dst);
    if (!beltCanAccept(dst, 0.5, ln)) return false;
    beltInsert(dst, id, 0.5, ln);
    return true;
  }
  return insertInto(dst, id, 1) === 1;
}
function takeFromBelt(belt, filter) {
  for (let i = 0; i < belt.items.length; i++) {
    const it = belt.items[i];
    if (!filter || filter(it.id)) { belt.items.splice(i, 1); return it.id; }
  }
  return null;
}

function updateVector(b, dt) {
  const def = BUILDINGS[b.type];
  let speed = 2 / def.swing * TUNE.vector;
  b.wantPower = 0;
  if (def.power) {
    b.wantPower = def.power;
    if (!b.powerSat) { b.status = 'нет энергии'; return; }
    speed *= b.powerSat;
  } else if (b.fuel <= 0) {
    // голем-вектор ищет себе топливо: из руки или из источника
    if (b.hand && ITEMS[b.hand].fuel) { b.fuel += ITEMS[b.hand].fuel; b.hand = null; b.prog = 0; }
    else {
      const src = vecSrcAny(b);
      let f = null;
      if (src) f = takeAny(src, id => !!ITEMS[id].fuel);
      if (f) b.fuel += ITEMS[f].fuel;
      else { b.status = 'нет топлива'; return; }
    }
  }
  // простой тоже стоит топлива — вдвое меньше, чем работа
  if (!def.power && b.fuel > 0) b.fuel -= dt * def.burn * 0.5;
  if (!b.hand) {
    if (b.prog > 0) { b.status = 'работает'; b.prog = Math.max(0, b.prog - dt * speed); burnVector(b, def, dt); return; }
    // ждущий манипулятор проверяет источник и цель не каждый кадр, а ~7 раз в секунду (вразнобой)
    if (b.waitT > 0) { b.waitT -= dt; return; }
    const src = vecSrcAny(b), dst = vecDstAny(b);
    // с пола на пол тоже можно: цепочка «манипулятор → пол → манипулятор → пол…»
    if (!src || !dst) { b.status = 'нет цели'; b.waitT = 0.5; return; }
    // лимит: кладём, только пока в цели меньше заданного числа этого предмета
    const underLimit = id => !b.limit || dst.floor || isBelt(dst) || countIn(dst, id) < b.limit;
    const filter = id => vecFilterOk(b, id) && canDrop(dst, id, b) && underLimit(id);
    const id = takeAny(src, filter);
    if (id) {
      b.hand = id; b.handN = 1;
      // укладчик берёт сразу несколько одинаковых
      const stack = def.stack || 1;
      while (b.handN < stack) {
        if (dst.floor && floorCount(dst.x, dst.y) + b.handN >= FLOOR_CAP) break;
        const more = takeAny(src, x => x === id);
        if (!more) break;
        b.handN++;
      }
      b.status = 'работает';
    } else { b.status = b.limit && dst && !isBelt(dst) ? 'ждёт (лимит или нет предметов)' : 'ждёт'; b.waitT = 0.12 + (b.id % 7) * 0.006; }
    return;
  }
  b.status = 'работает';
  b.prog = Math.min(1, b.prog + dt * speed);
  burnVector(b, def, dt);
  if (b.prog >= 1) {
    // мало топлива — сжечь то, что несём
    if (!def.power && b.fuel < 3 && ITEMS[b.hand].fuel) { b.fuel += ITEMS[b.hand].fuel; b.hand = null; return; }
    const dst = vecDstAny(b);
    let n = b.handN || 1;
    while (n > 0 && dst && dropInto(dst, b.hand, b)) n--;
    if (n <= 0) { b.hand = null; b.handN = 0; }
    else { b.handN = n; b.status = 'цель занята'; }
  }
}
function burnVector(b, def, dt) { if (!def.power) b.fuel -= dt * def.burn * 0.5; } // вторая половина — сверх простоя

// ---------- предметы на полу ----------
// манипулятор может класть на пустую клетку (до 10 предметов) и брать с неё — цепочка «манипулятор → пол → манипулятор»
const FLOOR_CAP = 10;
function floorKey(x, y) { return x + ',' + y; }
function floorAt(x, y) { return S.floor && S.floor[floorKey(x, y)] || null; }
function floorCount(x, y) { const f = floorAt(x, y); let n = 0; if (f) for (const id in f) n += f[id]; return n; }
function floorOk(x, y) { return !bldAt(x, y) && walkable(x, y) && !campStructAt(x, y); }
function floorPut(x, y, id, n) {
  if (!S.floor) S.floor = {};
  const k = floorKey(x, y), f = S.floor[k] || (S.floor[k] = {});
  const room = Math.max(0, FLOOR_CAP - floorCount(x, y)), put = Math.min(room, n || 1);
  if (put > 0) f[id] = (f[id] || 0) + put;
  if (!Object.keys(f).length) delete S.floor[k];
  return put;
}
function floorTake(x, y, filter) {
  const f = floorAt(x, y);
  if (!f) return null;
  for (const id in f) if (!filter || filter(id)) { if (--f[id] <= 0) delete f[id]; if (!Object.keys(f).length) delete S.floor[floorKey(x, y)]; return id; }
  return null;
}
// выбросить предметы на землю рядом с точкой (лишнее из крафта и т.п.): по 10 на клетку, по кольцам
function dropItems(x, y, id, n) {
  const bx = Math.floor(x), by = Math.floor(y);
  for (let r = 0; r <= 6 && n > 0; r++) for (let dy = -r; dy <= r && n > 0; dy++) for (let dx = -r; dx <= r && n > 0; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !floorOk(bx + dx, by + dy)) continue;
    n -= floorPut(bx + dx, by + dy, id, n);
  }
  return n;
}
// игрок подбирает всё с клетки
function floorPickup(x, y) {
  const f = floorAt(x, y);
  if (!f) return 0;
  let got = 0;
  for (const id of Object.keys(f)) { const n = S.player.inv.add(id, f[id]); got += n; f[id] -= n; if (f[id] <= 0) delete f[id]; }
  if (!Object.keys(f).length) delete S.floor[floorKey(x, y)];
  return got;
}
// фильтр манипулятора: до 5 предметов, режим «только эти» или «кроме этих»; старое поле filter — один предмет
function vecFilters(b) { return b.filters && b.filters.length ? b.filters : b.filter ? [b.filter] : null; }
function vecFilterOk(b, id) {
  const f = vecFilters(b);
  if (!f) return true;
  return b.filterMode === 'deny' ? !f.includes(id) : f.includes(id);
}

function updateLogistics(dt) {
  for (const b of bldKind('belt')) updateBelt(b, dt);
  for (const b of bldKind('vector')) updateVector(b, dt);
  for (const b of bldKind('nest')) updateNest(b, dt);
}

// ---------- гнёзда горгулий ----------
function newSpider(nest) { return { x: nest.x + 1, y: nest.y + 1, state: 'idle', item: null, n: 0, src: 0, dst: 0 }; }

function chestsNear(x, y, r, sub) {
  const out = [];
  for (const b of bldKind('chest')) if (BUILDINGS[b.type].sub === sub && dist(b.x, b.y, x, y) <= r) out.push(b);
  return out;
}

function updateNest(nest, dt) {
  const R = BUILDINGS.nest.radius;
  nest.think = (nest.think || 0) - dt;
  if (nest.think <= 0) {
    nest.think = 0.5;
    const idle = nest.spiders.filter(s => s.state === 'idle');
    if (idle.length) {
      const reqs = chestsNear(nest.x, nest.y, R, 'request');
      const provs = chestsNear(nest.x, nest.y, R, 'provide');
      for (const rq of reqs) {
        for (const id in rq.req) {
          if (!idle.length) break;
          let need = rq.req[id] - rq.inv.count(id);
          for (const s of nest.spiders) if (s.dst === rq.id && s.item === id && s.state !== 'idle') need -= s.n || 10;
          if (need <= 0) continue;
          const pv = provs.find(p => p.inv.count(id) > 0);
          if (!pv) continue;
          const s = idle.pop();
          s.state = 'toSrc'; s.item = id; s.src = pv.id; s.dst = rq.id; s.n = Math.min(10, need);
        }
      }
    }
  }
  const sp = 8 * dt;
  for (const s of nest.spiders) {
    if (s.state === 'idle') { s.x = lerp(s.x, nest.x + 1, 0.1); s.y = lerp(s.y, nest.y + 1, 0.1); continue; }
    const tgt = s.state === 'home' ? nest : S.buildings.get(s.state === 'toSrc' ? s.src : s.dst);
    if (!tgt) { s.state = 'home'; continue; }
    const tx = tgt.x + tgt.w / 2, ty = tgt.y + tgt.h / 2;
    const d = dist(s.x, s.y, tx, ty);
    if (d > sp) { s.x += (tx - s.x) / d * sp; s.y += (ty - s.y) / d * sp; continue; }
    s.x = tx; s.y = ty;
    if (s.state === 'toSrc') { s.carry = tgt.inv.remove(s.item, s.n); s.state = s.carry ? 'toDst' : 'home'; }
    else if (s.state === 'toDst') {
      const put = tgt.inv.add(s.item, s.carry);
      s.carry -= put;
      s.state = 'home';
    } else if (s.state === 'home') {
      s.state = 'idle'; s.item = null; s.dst = 0; s.carry = 0;
    }
  }
}
