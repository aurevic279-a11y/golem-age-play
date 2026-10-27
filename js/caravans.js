'use strict';
// Караваны: воловьи повозки ездят по каменным дорогам между станциями по маршруту.
// Станция загружает повозку (всем или одним выбранным предметом) или разгружает её. Векторы работают со станцией как с сундуком.

const CART = { speed: 2.4, cap: 8, rate: 0.12 };

function isRoad(x, y) { const b = bldAt(x, y); return !!b && BUILDINGS[b.type].kind === 'road'; }

function spawnCart(x, y) {
  const c = { id: S.nextId++, x: x + 0.5, y: y + 0.5, inv: new Inv(CART.cap, true), stops: [], cur: 0, state: 'idle', dir: 1, status: 'нет маршрута — откройте повозку и добавьте станции', wait: 0 };
  S.carts.push(c);
  return c;
}

// клетки дороги рядом со станцией (куда повозка встаёт под погрузку)
function stationDocks(st) {
  return perimeter(st.x, st.y, st.w, st.h).filter(([x, y]) => isRoad(x, y));
}
function cartAtStation(c, st) {
  const tx = Math.floor(c.x), ty = Math.floor(c.y);
  return stationDocks(st).some(([x, y]) => x === tx && y === ty);
}

// путь по дорогам (4 направления) до любой клетки-причала
function roadPath(c, st) {
  const goals = new Set(stationDocks(st).map(([x, y]) => x + ',' + y));
  if (!goals.size) return null;
  const sx0 = Math.floor(c.x), sy0 = Math.floor(c.y);
  const prev = new Map([[sx0 + ',' + sy0, null]]), q = [[sx0, sy0]];
  for (let h = 0; h < q.length && h < 20000; h++) {
    const [x, y] = q[h], k = x + ',' + y;
    if (goals.has(k)) {
      const pts = [];
      for (let p = k; p; p = prev.get(p)) { const [px, py] = p.split(',').map(Number); pts.push([px + 0.5, py + 0.5]); }
      return pts.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, nk = nx + ',' + ny;
      if (prev.has(nk) || !isRoad(nx, ny)) continue;
      prev.set(nk, k); q.push([nx, ny]);
    }
  }
  return null;
}

function updateCart(c, dt) {
  c.stops = c.stops.filter(id => S.buildings.has(id));
  if (!c.stops.length) { c.state = 'idle'; c.status = 'нет маршрута — откройте повозку и добавьте станции'; return; }
  if (c.cur >= c.stops.length) c.cur = 0;
  const st = S.buildings.get(c.stops[c.cur]);
  if (c.state === 'idle' || c.state === 'go') {
    if (cartAtStation(c, st)) { c.state = 'dock'; c.wait = 0; c.idleT = 0; return; }
    if (!c.path || c.pathFor !== st.id || c.pathVer !== BLD_VER) {
      c.path = roadPath(c, st); c.pathFor = st.id; c.pathVer = BLD_VER; c.pathI = 0;
      if (!c.path) { c.status = `нет дороги до «${stationName(st)}»`; c.state = 'idle'; return; }
    }
    c.state = 'go'; c.status = `едет к «${stationName(st)}»`;
    const p = c.path[Math.min(c.pathI, c.path.length - 1)];
    const d = dist(c.x, c.y, p[0], p[1]), sp = CART.speed * dt;
    if (d <= sp) { c.x = p[0]; c.y = p[1]; c.pathI++; if (c.pathI >= c.path.length) { c.state = 'dock'; c.wait = 0; c.idleT = 0; } }
    else {
      const dx = (p[0] - c.x) / d, dy = (p[1] - c.y) / d;
      c.x += dx * sp; c.y += dy * sp;
      c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
    }
    c.walk = (c.walk || 0) + dt;
    return;
  }
  if (c.state === 'dock') {
    // погрузка / разгрузка порциями
    c.wait += dt;
    if (c.wait < CART.rate) return;
    c.wait = 0;
    let moved = 0;
    if ((st.mode || 'load') === 'load') {
      for (const id of st.inv.ids()) {
        if (st.filter && id !== st.filter) continue;
        const n = Math.min(10, st.inv.count(id), c.inv.space(id));
        if (n > 0) { c.inv.add(id, n); st.inv.remove(id, n); moved += n; break; }
      }
      c.status = `грузится на «${stationName(st)}»`;
    } else {
      for (const id of c.inv.ids()) {
        const n = Math.min(10, c.inv.count(id), st.inv.space(id));
        if (n > 0) { st.inv.add(id, n); c.inv.remove(id, n); moved += n; S.stats.cartDelivered = (S.stats.cartDelivered || 0) + n; break; }
      }
      c.status = `разгружается на «${stationName(st)}»`;
    }
    if (moved) { c.idleT = 0; return; }
    // нечего грузить или некуда класть — ждём немного (вдруг векторы подвезут) и едем дальше
    c.idleT = (c.idleT || 0) + CART.rate;
    const full = c.inv.usedSlots() >= c.inv.cap && c.inv.ids().every(id => c.inv.space(id) <= 0);
    const empty = c.inv.n === 0;
    // условие ожидания станции: «до полной загрузки» / «до полной разгрузки» — иначе уезжает, когда нечего делать
    const wait = st.wait || 'none';
    const done = (st.mode || 'load') === 'load' ? (wait === 'full' ? full : full || c.idleT > 2.5) : (wait === 'empty' ? empty : empty || c.idleT > 2.5);
    if (wait !== 'none' && !done) c.status = (st.mode || 'load') === 'load' ? `ждёт полной загрузки на «${stationName(st)}»` : `ждёт полной разгрузки на «${stationName(st)}»`;
    if (done) { c.cur = (c.cur + 1) % c.stops.length; c.state = 'go'; c.path = null; }
  }
}

function updateCarts(dt) { for (const c of S.carts) updateCart(c, dt); }

function stationName(b) { return b.name || ('Станция №' + b.id); }

function cartAtPoint(x, y) {
  let best = null, bd = 0.7 * 0.7;
  for (const c of S.carts) { const d = dist2(c.x, c.y - 0.3, x, y); if (d < bd) { bd = d; best = c; } }
  return best;
}

function pickupCart(c) {
  const inv = S.player.inv;
  inv.add('cart', 1);
  for (const id of c.inv.ids()) inv.add(id, c.inv.count(id));
  S.carts.splice(S.carts.indexOf(c), 1);
  if (UI.openC === c) closeWin('cart');
  sfx('remove');
}

// ---------- отрисовка ----------
function drawCart(c, t) {
  const bob = c.state === 'go' ? Math.abs(Math.sin((c.walk || 0) * 8)) * 0.03 : 0;
  // повозка крупнее клетки (×1,4), с серединой на своей точке
  const k = 1.4;
  if (!drawProp('build', 'cart_' + c.dir, c.x - 0.5 * k, c.y - 0.5 * k - bob, { scale: k })) {
    G.fillStyle = '#8a5a2e'; G.fillRect(sx(c.x - 0.35), sy(c.y - 0.5), VIEW.z * 0.7, VIEW.z * 0.5);
  }
  if (c.inv.n > 0 && UI.zoomedIn()) {
    const top = c.inv.ids()[0];
    drawSprite(SPR.item[top], c.x - 0.2, c.y - 1.15, 0.4, 0.4);
  }
}
// каменная дорога: края скругляются на внешних углах (одиночная клетка, поворот, конец полосы — любой ширины),
// плиты уложены по общей сетке мира — узор идёт сквозь клетки без швов, бордюр только по внешнему краю
function drawRoad(b) {
  const z = VIEW.z, X = sx(b.x), Y = sy(b.y), X1 = sx(b.x + 1), Y1 = sy(b.y + 1), W = X1 - X, H = Y1 - Y;
  const n = isRoad(b.x, b.y - 1), e = isRoad(b.x + 1, b.y), s = isRoad(b.x, b.y + 1), w = isRoad(b.x - 1, b.y);
  const r = z * 0.42, ext = z * 0.6;
  // фигура: клетка, продлённая в сторону соседей (там края не видно), со скруглением угла, у которого обе стороны свободны
  const x0 = X - (w ? ext : 0), y0 = Y - (n ? ext : 0), x1 = X1 + (e ? ext : 0), y1 = Y1 + (s ? ext : 0);
  const rTL = !n && !w ? r : 0, rTR = !n && !e ? r : 0, rBR = !s && !e ? r : 0, rBL = !s && !w ? r : 0;
  const shape = () => {
    G.beginPath();
    G.moveTo(x0 + rTL, y0); G.lineTo(x1 - rTR, y0); if (rTR) G.arcTo(x1, y0, x1, y0 + rTR, rTR);
    G.lineTo(x1, y1 - rBR); if (rBR) G.arcTo(x1, y1, x1 - rBR, y1, rBR);
    G.lineTo(x0 + rBL, y1); if (rBL) G.arcTo(x0, y1, x0, y1 - rBL, rBL);
    G.lineTo(x0, y0 + rTL); if (rTL) G.arcTo(x0, y0, x0 + rTL, y0, rTL);
    G.closePath();
  };
  G.save();
  G.beginPath(); G.rect(X, Y, W, H); G.clip();
  shape(); G.fillStyle = '#7e786c'; G.fill();
  if (z >= 14) {
    shape(); G.save(); G.clip();
    // плиты 1/3 клетки, ряды со сдвигом на полплиты — номера рядов и плит мировые, поэтому соседние клетки совпадают
    const k = 1 / 3;
    for (let j = 0; j < 3; j++) {
      const gy = b.y * 3 + j, off = (gy & 1) * 0.5;
      for (let i = -1; i < 3; i++) {
        const gx = Math.floor(b.x * 3 + i + off);
        const wx0 = (gx - off) * k, py0 = Y + j * H / 3;
        const px0 = sx(wx0), px1 = sx(wx0 + k);
        const h = hash2(gx, gy, 77), c = 120 + Math.floor(h * 30);
        G.fillStyle = `rgb(${c},${c - 6},${c - 16})`;
        G.fillRect(Math.round(px0) + 1, Math.round(py0) + 1, Math.round(px1) - Math.round(px0) - 2, Math.round(Y + (j + 1) * H / 3) - Math.round(py0) - 2);
      }
    }
    G.restore();
    // бордюр: тёмная кайма по внешнему краю (стороны к соседям вынесены за клетку — их не видно)
    shape(); G.strokeStyle = 'rgba(40,34,26,0.55)'; G.lineWidth = Math.max(2, z * 0.07); G.stroke();
  }
  G.restore();
}

// ---------- окна ----------
function openCart(c) { UI.openC = c; closeWin('bld'); closeWin('golem'); renderCartWin(); sfx('click'); }
function renderCartWin() {
  const c = UI.openC;
  if (!c || !S.carts.includes(c)) { closeWin('cart'); return; }
  const stations = [...S.buildings.values()].filter(b => b.type === 'station');
  let h = `<div>Сейчас: <b>${c.status}</b></div>`;
  h += `<h3>Маршрут</h3>`;
  if (!c.stops.length) h += '<div class="dim">Пусто. Добавьте станции по порядку — повозка будет объезжать их по кругу.</div>';
  c.stops.forEach((id, i) => { const b = S.buildings.get(id); if (b) h += `<div class="recipe ${i === c.cur ? 'sel' : ''}">${i + 1}. ${stationName(b)} <span class="dim">(${(b.mode || 'load') === 'load' ? 'погрузка' : 'разгрузка'})</span> <button data-act="cartDel" data-arg="${i}">✕</button></div>`; });
  h += stations.length ? `<div class="row" style="margin-top:6px"><select id="cartAdd">${stations.map(b => `<option value="${b.id}">${stationName(b)}</option>`).join('')}</select><button data-act="cartAddStop">Добавить остановку</button></div>` : '<div class="bad">Нет станций. Поставьте «Станцию караванов» у дороги.</div>';
  h += `<h3>Груз ${c.inv.usedSlots()}/${c.inv.cap}</h3>${invGrid(c.inv, 'cartTake')}`;
  h += guardsHtml(c);
  h += `<div class="row" style="margin-top:8px"><button data-act="cartPick" class="danger">Забрать повозку (ПКМ)</button></div>`;
  h += `<div class="dim" style="margin-top:6px">Повозка ездит только по каменным дорогам. Встаёт на клетку дороги рядом со станцией. Станция в режиме «погрузка» отдаёт повозке свои предметы, «разгрузка» — принимает груз.</div>`;
  if (UI.wins.cart) setWinBody('cart', h); else fitWin(openWin('cart', 'Воловья повозка', h, { width: 440, pos: [innerWidth - 460, 70] }));
}
ACT.cartAddStop = () => { const c = UI.openC; if (!c) return; const id = +$('cartAdd').value; if (S.buildings.has(id)) { c.stops.push(id); mpCmd({ f: 'cartStops', id: c.id, stops: c.stops }); } renderCartWin(); };
ACT.cartDel = (i) => { const c = UI.openC; if (!c) return; c.stops.splice(+i, 1); if (c.cur >= c.stops.length) c.cur = 0; mpCmd({ f: 'cartStops', id: c.id, stops: c.stops }); renderCartWin(); };
ACT.cartTake = (id) => { const c = UI.openC; if (!c) return; const n = S.player.inv.add(id, c.inv.count(id)); c.inv.remove(id, n); renderCartWin(); };
ACT.cartPick = () => { if (UI.openC) pickupCart(UI.openC); };
ACT.stWait = (w) => { const b = UI.openB; if (!b) return; b.wait = w; renderBldWin(); };
ACT.stMode = (m) => { const b = UI.openB; if (!b) return; b.mode = m; renderBldWin(); };
ACT.stFilter = () => { const b = UI.openB; if (!b) return; b.filter = $('stFilter').value || null; mpCmd({ f: 'vecFilter', id: b.id, v: b.filter }); renderBldWin(); };
ACT.stName = () => { const b = UI.openB; if (!b) return; const v = ($('stName').value || '').trim().slice(0, 24); b.name = v || null; mpCmd({ f: 'stName', id: b.id, v: b.name }); renderBldWin(); };

// раздел станции в окне постройки
function stationHtml(b) {
  const mode = b.mode || 'load';
  let h = `<h3>Станция караванов</h3><div class="row"><input id="stName" value="${b.name || ''}" placeholder="${stationName(b)}" style="width:170px"><button data-act="stName">Переименовать</button></div>`;
  h += `<div class="row" style="margin-top:6px"><button data-act="stMode" data-arg="load" class="${mode === 'load' ? 'on' : ''}">Погрузка в повозки</button><button data-act="stMode" data-arg="unload" class="${mode === 'unload' ? 'on' : ''}">Разгрузка из повозок</button></div>`;
  const wait = b.wait || 'none', wv = mode === 'load' ? 'full' : 'empty';
  h += `<div class="row" style="margin-top:6px">Повозка уезжает: <button data-act="stWait" data-arg="none" class="${wait === 'none' ? 'on' : ''}">когда нечего делать</button><button data-act="stWait" data-arg="${wv}" class="${wait !== 'none' ? 'on' : ''}">${mode === 'load' ? 'только полной' : 'только пустой'}</button></div>`;
  if (mode === 'load') h += `<div class="row" style="margin-top:6px">Грузить: <select id="stFilter"><option value="">— всё подряд —</option>${Object.keys(ITEMS).filter(id => !ITEMS[id].bld).map(id => `<option value="${id}" ${b.filter === id ? 'selected' : ''}>${ITEMS[id].name}</option>`).join('')}</select><button data-act="stFilter">Задать</button></div>`;
  const carts = S.carts.filter(c => c.stops.includes(b.id)).length;
  h += `<div class="dim">Повозок на маршруте через эту станцию: ${carts}. Подвозите сюда грузы векторами или конвейерами.</div>`;
  return h;
}
