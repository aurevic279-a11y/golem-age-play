'use strict';
// Совместная игра по интернету: прямое соединение браузеров (WebRTC через PeerJS, бесплатный публичный сервер знакомств).
// Хозяин считает весь мир и рассылает состояние; гость ходит сам, его действия выполняются у хозяина.
// Античита нет — это игра для друзей.

const MP = {
  role: null,        // null — одиночная игра, 'host' — хозяин, 'client' — гость
  peer: null, conns: [], hostConn: null,
  guests: {},        // у хозяина: id гостя -> { hero, input, name }
  others: [],        // у гостя: другие герои (хозяин) для отрисовки
  silent: false, inAct: false, myName: '',
  sendT: 0, stateT: 0, chunkSent: new Map(), parts: {}, status: '',
};
const PEER_JS = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const MP_PREFIX = 'golem-age-';

function mpClient() { return MP.role === 'client'; }
function mpHost() { return MP.role === 'host'; }

// ---------- загрузка библиотеки ----------
function loadPeerJs() {
  return new Promise((ok, fail) => {
    if (window.Peer) { ok(); return; }
    const s = document.createElement('script');
    s.src = PEER_JS; s.onload = () => ok(); s.onerror = () => fail(new Error('нет интернета или библиотека недоступна'));
    document.head.appendChild(s);
  });
}
function mpCode() { const a = 'abcdefghkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

// ---------- отправка (большие сообщения режем на куски) ----------
function mpSend(conn, msg) {
  if (!conn || !conn.open) return;
  const s = JSON.stringify(msg, (k, v) => TRANSIENT.has(k) ? undefined : v);
  if (s.length < 60000) { conn.send(s); return; }
  const id = Math.random().toString(36).slice(2), n = Math.ceil(s.length / 60000);
  for (let i = 0; i < n; i++) conn.send(JSON.stringify({ t: 'part', id, i, n, d: s.slice(i * 60000, (i + 1) * 60000) }));
}
function mpBroadcast(msg) { for (const c of MP.conns) mpSend(c, msg); }
function mpReceive(conn, raw, handler) {
  MP.lastRx = performance.now();
  // ошибка в одном сообщении не должна рвать игру
  try {
    let m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (m.t === 'part') {
      const p = MP.parts[m.id] || (MP.parts[m.id] = []);
      p[m.i] = m.d;
      if (p.filter(x => x != null).length < m.n) return;
      delete MP.parts[m.id];
      m = JSON.parse(p.join(''));
    }
    handler(conn, m);
  } catch (e) { console.error('Сетевое сообщение:', e); if (typeof errCount !== 'undefined') errCount++; }
}

// ---------- хозяин ----------
async function mpHostStart() {
  if (!S) { hint('Сначала начните или загрузите игру'); return; }
  try { await loadPeerJs(); } catch (e) { alert('Не удалось загрузить сетевую библиотеку: ' + e.message); return; }
  const code = mpCode();
  MP.status = 'Подключаемся к серверу знакомств…'; renderMpWin();
  const peer = new Peer(MP_PREFIX + code);
  MP.peer = peer;
  peer.on('open', () => { MP.role = 'host'; MP.code = code; MP.status = 'Игра открыта. Передайте другу код.'; renderMpWin(); log('Совместная игра открыта, код: ' + code, 'good'); });
  peer.on('error', (e) => { MP.status = 'Ошибка сети: ' + (e.type || e.message); renderMpWin(); });
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      MP.conns.push(conn);
      const hero = newPlayer();
      hero.x = S.player.x + 1; hero.y = S.player.y + 1;
      const f = freeSpotNear(hero.x, hero.y, 10); if (f) { hero.x = f.x; hero.y = f.y; }
      hero.inv.add('wood', 10);
      MP.guests[conn.peer] = { hero, input: { keys: {}, ldown: false, wx: 0, wy: 0 }, name: 'Друг', conn };
      mpSend(conn, { t: 'full', save: JSON.parse(serialize()), you: hero, host: mpHeroPub(S.player, 'Хозяин', 'host') });
      log('К игре присоединился друг', 'good'); sfx('research');
      renderMpWin();
    });
    conn.on('data', (raw) => mpReceive(conn, raw, mpHostHandle));
    conn.on('close', () => {
      if (MP.guests[conn.peer]) mpRememberGuest(MP.guests[conn.peer]);
      MP.conns = MP.conns.filter(c => c !== conn);
      delete MP.guests[conn.peer]; if (MP.hb) delete MP.hb[conn.peer];
      log('Друг вышел из игры', 'warn'); renderMpWin();
    });
  });
}

// вещи друга хранятся в сейве хозяина по нику: вышел и зашёл под тем же ником — всё на месте
function mpRememberGuest(g) {
  if (!g || !g.name || !g.restored) return;
  const h = g.hero;
  S.mpHeroes = S.mpHeroes || {};
  S.mpHeroes[g.name] = JSON.parse(JSON.stringify({ inv: h.inv, guns: h.guns, ammo: h.ammo, gun: h.gun, weapon: h.weapon, armor: h.armor, hp: h.hp, trash: h.trash || null, requests: h.requests || null }));
}
function mpRestoreGuest(g) {
  const sv = S.mpHeroes && S.mpHeroes[g.name];
  if (!sv) return;
  const h = g.hero;
  h.inv = Inv.from(sv.inv);
  if (sv.guns) { h.guns = sv.guns; h.ammo = sv.ammo; h.gun = sv.gun || 0; }
  h.weapon = sv.weapon || h.weapon; h.armor = sv.armor || null; h.hp = sv.hp || h.hp;
  if (sv.trash) h.trash = Inv.from(sv.trash);
  if (sv.requests) h.requests = sv.requests;
  log(`${g.name} вернулся — его вещи на месте.`, 'good');
}

// публичное описание героя для отрисовки у других
function mpHeroPub(h, name, id) {
  return { id: id || name, name, x: +h.x.toFixed(3), y: +h.y.toFixed(3), ang: h.ang != null ? +h.ang.toFixed(2) : null, weapon: h.weapon, armor: h.armor, hp: Math.round(h.hp), dead: h.dead, atkT: h.atkT != null ? +h.atkT.toFixed(3) : null, atkKind: h.atkKind, lastHurt: h.lastHurt, riding: !!h.riding };
}

// выполнить действие от имени гостя: подменяем героя, интерфейс молчит
function asGuest(g, fn) {
  const saveP = S.player, saveB = UI.openB, saveG = UI.openG, saveC = UI.openC, saveTool = UI.tool;
  const saveIn = Object.assign({}, INPUT);
  MP.silent = true; S.player = g.hero;
  try { return fn(); }
  catch (e) { console.error('Действие гостя:', e); }
  finally { S.player = saveP; UI.openB = saveB; UI.openG = saveG; UI.openC = saveC; UI.tool = saveTool; Object.assign(INPUT, saveIn); MP.silent = false; }
}

function mpHostHandle(conn, m) {
  const g = MP.guests[conn.peer];
  if (!g) return;
  if (m.t === 'in') {
    // гость сам двигает своего героя (на экране хозяина он плавно догоняет присланное положение)
    const h = g.hero;
    if (m.st != null && m.st <= (g.lastSt || -1)) return; // опоздавший пакет — уже есть новее
    g.lastSt = m.st;
    if (h.dead <= 0) { h.x = m.x; h.y = m.y; }
    h.ang = m.ang; h.walk = m.walk; h.moving = m.moving; h.riding = !!m.riding;
    if (m.st != null) mpHeroSample(conn.peer, m.st, h);
    g.input = { keys: {}, ldown: m.ldown, wx: m.wx, wy: m.wy, overUI: m.overUI };
    UI_TOOL_OF[conn.peer] = m.tool;
    if (m.name) g.name = m.name;
    if (!g.restored) { g.restored = true; mpRestoreGuest(g); }
    return;
  }
  if (m.t === 'act') {
    asGuest(g, () => {
      UI.openB = m.ob != null ? S.buildings.get(m.ob) || null : null;
      UI.openG = m.og != null ? S.golems.find(x => x.id === m.og) || null : null;
      UI.openC = m.oc != null ? S.carts.find(x => x.id === m.oc) || null : null;
      const ev = { shiftKey: !!m.shift, ctrlKey: !!m.ctrl, metaKey: false, button: m.button || 0 };
      const f = ACT[m.name];
      if (f && !MP_LOCAL_ACTS.has(m.name)) f(m.arg, ev, null);
    });
    return;
  }
  if (m.t === 'cmd' && m.f === 'ping') {
    const nm = m.name || g.name;
    mpPing(+m.x, +m.y, nm, true);
    for (const c2 of MP.conns) if (c2 !== conn) mpSend(c2, { t: 'ping', x: m.x, y: m.y, name: nm });
    return;
  }
  if (m.t === 'cmd') {
    asGuest(g, () => {
      if (m.wx != null) { INPUT.wx = m.wx; INPUT.wy = m.wy; }
      switch (m.f) {
        case 'place':
          // у гостя крафт мог закончиться чуть раньше — подождём предмет до 3 секунд
          if (!_mp.placeBuilding(m.type, m.x, m.y, m.dir, { noReach: true, quiet: true, noGhost: true }) && S.player.inv.count(m.type) < 1 && !m.retry) (g.pending || (g.pending = [])).push(Object.assign({}, m, { retry: S.time + 3 }));
          break;
        case 'ghost': addGhost(m.type, m.x, m.y, m.dir, true); break;
        case 'decon': { const b = bldAt(m.x, m.y); if (b) _mp.deconstruct(b); break; }
        case 'pickg': { const gm = S.golems.find(x => x.id === m.id); if (gm) _mp.pickupGolem(gm); break; }
        case 'rotate': { const b = bldAt(m.x, m.y); if (b) _mp.rotateBuilding(b, m.d); break; }
        case 'focus': _mp.setPlayerFocus(mpFocusFrom(m.f2)); break;
        case 'spell': _mp.castSpell(m.name); break;
        case 'dungeon': { const b = S.buildings.get(m.id); if (b && b.type === 'cave_entrance' && !b.done) enterDungeon(S.player, b); break; }
        case 'craft': queueCraft(m.rid, m.n); break;
        case 'cancel': cancelCraft(m.i); break;
        case 'equip': if (S.player.inv.count(m.id)) equipItem(m.id); break;
        case 'unequip': unequip(m.slot, m.i); break;
        case 'gunSel': selectGun(m.i); break;
        case 'vecFilter': { const b = S.buildings.get(m.id); if (b) b.filter = m.v || null; break; }
        case 'admin': if (m.admin && typeof m.admin === 'object') { S.admin = m.admin; applyAdmin(); } break;
        case 'gset': { const gm = S.golems.find(x => x.id === m.id); if (gm && m.st && m.st.type === gm.type) setGolemSettings(gm, m.st); break; }
        case 'floorPick': if (dist(m.x + 0.5, m.y + 0.5, S.player.x, S.player.y) < 5) floorPickup(m.x, m.y); break;
        case 'vecSet': { const b = S.buildings.get(m.id); if (b) { b.filters = (m.filters || []).slice(0, 5); b.filter = null; b.filterMode = m.mode === 'deny' ? 'deny' : 'allow'; b.lane = m.lane === 'L' || m.lane === 'R' ? m.lane : null; } break; }
        case 'reqMe': { const p = S.player; p.requests = p.requests || {}; if (m.n > 0) p.requests[m.id] = m.n; else delete p.requests[m.id]; break; }
        case 'vecLimit': { const b = S.buildings.get(m.id); if (b) b.limit = m.v || null; break; }
        case 'stName': { const b = S.buildings.get(m.id); if (b) b.name = m.v || null; break; }
        case 'cartStops': { const c = S.carts.find(x => x.id === m.id); if (c) { c.stops = m.stops.slice(); if (c.cur >= c.stops.length) c.cur = 0; } break; }
        case 'pickc': { const c = S.carts.find(x => x.id === m.id); if (c) pickupCart(c); break; }
        case 'req': { const b = S.buildings.get(m.id); if (b && b.req) { if (m.n > 0) b.req[m.item] = m.n; else delete b.req[m.item]; } break; }
      }
    });
  }
}
const UI_TOOL_OF = {};
const MP_VOLATILE = new Set(['inp', 'out', 'fluid', 'prog', 'burn', 'items', 'hand', 'handN', 'cd', 'aim', 'stored', 'scouted', 'lastHit', 'crafting', 'cycles', 'beacons', 'idleT', 'think', 'rr', 'bots', 'deconBot']);

function mpFocusFrom(f) {
  if (!f) return null;
  if (f.k === 'e') { const e = S.enemies.find(x => x.id === f.id); return e ? { k: 'e', e } : null; }
  if (f.k === 's') { const c = S.camps.find(x => x.id === f.camp); const s = c && c.structs[f.i]; return s ? { k: 's', s } : null; }
  if (f.k === 'a') { const a = WILD.animals.find(x => x.id === f.id); return a ? { k: 'a', a } : null; }
  if (f.k === 'm') return S.merchant ? { k: 'm' } : null;
  return null;
}
function mpFocusTo(f) {
  if (!f) return null;
  if (f.k === 'e') return { k: 'e', id: f.e.id };
  if (f.k === 's') { const c = S.camps.find(x => x.structs.includes(f.s)); return c ? { k: 's', camp: c.id, i: c.structs.indexOf(f.s) } : null; }
  if (f.k === 'a') return { k: 'a', id: f.a.id };
  if (f.k === 'm') return { k: 'm' };
  return null;
}

// каждый тик у хозяина: герои гостей добывают, крафтят, стреляют, получают урон
function mpHostTick() {
  for (const id in MP.guests) {
    const g = MP.guests[id];
    if (g.pending && g.pending.length) {
      const left = [];
      for (const m of g.pending) {
        const ok = asGuest(g, () => S.player.inv.count(m.type) > 0 && _mp.placeBuilding(m.type, m.x, m.y, m.dir, { noReach: true, quiet: true, noGhost: true }));
        if (!ok && S.time < m.retry) left.push(m);
      }
      g.pending = left;
    }
    asGuest(g, () => {
      Object.assign(INPUT, { keys: {}, ldown: g.input.ldown, wx: g.input.wx, wy: g.input.wy, overUI: g.input.overUI });
      UI.tool = UI_TOOL_OF[id] || null;
      updatePlayer(DT);
      playerCombat(DT);
    });
  }
  MP.sendT -= DT; MP.stateT -= DT; MP.heroT = (MP.heroT || 0) - DT;
  // положения героев — 20 раз в секунду отдельным лёгким пакетом (мир — 10 раз в секунду)
  if (MP.heroT <= 0) { MP.heroT = 0.05; mpBroadcastHeroes(); }
  if (MP.sendT <= 0) { MP.sendT = 0.1; mpBroadcastFast(); }
  if (MP.stateT <= 0) { MP.stateT = 1.5; mpBroadcastState(); }
}

function mpBroadcastFast() {
  // враги — только рядом с каждым гостем (дальних он всё равно не видит)
  const pack = e => [e.id, e.type, +e.x.toFixed(2), +e.y.toFixed(2), Math.round(e.hp), e.maxHp, +(e.ang || 0).toFixed(2), e.mode, e.moving ? 1 : 0, e.atkT != null ? +e.atkT.toFixed(2) : -1, e.campId, e.sentry ? +(e.alarmK || 0).toFixed(2) : -1, e.alarmed ? 1 : 0];
  const golems = S.golems.map(g => [g.id, +g.x.toFixed(2), +g.y.toFixed(2), g.state, g.carry, g.n, Math.round(g.hp == null ? GOLEM.hp : g.hp), g.hidden ? 1 : 0, +(g.fuel || 0).toFixed(0), +(g.work || 0).toFixed(2), g.tx, g.ty]);
  for (const c of MP.conns) {
    const g = MP.guests[c.peer];
    if (!g) continue;
    const hx = g.hero.x, hy = g.hero.y;
    const enemies = S.enemies.filter(e => !e.dead && Math.abs(e.x - hx) < 60 && Math.abs(e.y - hy) < 60).map(pack);
    const deaths = (MP.deaths || []).filter(d => Math.abs(d[1] - hx) < 60 && Math.abs(d[2] - hy) < 60);
    const animals = WILD.animals.filter(a => !a.dead && Math.abs(a.x - hx) < 60 && Math.abs(a.y - hy) < 60).map(a => [a.id, a.kind, +a.x.toFixed(2), +a.y.toFixed(2), +(a.ang || 0).toFixed(2), a.moving ? 1 : 0, a.flash > 0 ? 1 : 0]);
    const adeaths = (MP.adeaths || []).filter(d => Math.abs(d[2] - hx) < 60 && Math.abs(d[3] - hy) < 60);
    mpSend(c, { t: 'fast', time: S.time, enemies, golems, deaths, animals, adeaths, carts: S.carts.map(k => [k.id, +k.x.toFixed(2), +k.y.toFixed(2), k.dir, k.state]), me: { hp: g.hero.hp, dead: g.hero.dead } });
  }
  MP.deaths = []; MP.adeaths = [];
}
// хозяин: герои всех, кроме самого получателя; st — время симуляции хозяина (мс), по нему гость раскладывает снимки
function mpBroadcastHeroes() {
  const st = Math.round(S.time * 1000);
  const all = [mpHeroPub(S.player, 'Хозяин', 'host')];
  for (const id in MP.guests) all.push(mpHeroPub(MP.guests[id].hero, MP.guests[id].name, id));
  for (const c of MP.conns) mpSend(c, { t: 'h', st, others: all.filter(h => h.id !== c.peer) });
}

// гость: движущиеся объекты плавно догоняют положения от хозяина (пакеты приходят 10 раз в секунду)
function mpSmoothTo(o, k) {
  if (o.nx == null) return;
  const dx = o.nx - o.x, dy = o.ny - o.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) { o.x = o.nx; o.y = o.ny; return; }
  o.x += dx * k; o.y += dy * k;
}
function mpSmoothTick() {
  const k = Math.min(1, DT * 9);
  for (const g of S.golems) mpSmoothTo(g, k);
  for (const c of S.carts) mpSmoothTo(c, k);
  for (const e of S.enemies) mpSmoothTo(e, k);
  for (const a of WILD.animals) { mpSmoothTo(a, k); if (a.moving) a.walk = (a.walk || 0) + DT * ANIMALS[a.kind].speed * 2; if (a.flash > 0) a.flash -= DT; }
}

// медленное состояние: постройки, инвентари, исследования, изменившиеся чанки
function mpBroadcastState() {
  const chunks = [];
  for (const [k, c] of W) {
    const v = c.netv || 0;
    if (!v || MP.chunkSent.get(k) === v) continue;
    MP.chunkSent.set(k, v);
    chunks.push({ k, res: b64FromBytes(c.res), amt: b64FromBytes(new Uint8Array(c.amt.buffer)) });
  }
  // постройки: каждому гостю — только изменившиеся с прошлого раза (и удалённые); раз в 30 с — полная сверка
  const rep = (k, v) => TRANSIENT.has(k) ? undefined : v;
  // «живые» поля (прогресс, предметы на конвейерах, рука вектора…) гость считает сам — по ним не сравниваем
  const VOL = MP_VOLATILE;
  const sigRep = (k, v) => TRANSIENT.has(k) || VOL.has(k) || (k === 'fuel' && typeof v === 'number') ? undefined : v;
  const cur = new Map(), sig = new Map();
  for (const b of S.buildings.values()) { sig.set(b.id, JSON.stringify(b, sigRep)); }
  const campsJs = JSON.stringify(S.camps, rep);
  MP.stateN = (MP.stateN || 0) + 1;
  const fullB = MP.stateN % 20 === 0;
  const base = {
    t: 'state', time: S.time, research: S.research, stats: S.stats, elves: S.elves, merchant: S.merchant, admin: S.admin,
    ghosts: S.ghosts, quests: S.quests, crops: S.crops, workers: S.workers, raidT: S.raidT, blueprints: S.blueprints, envoy: S.envoy, chunks, golems: S.golems, carts: S.carts, floor: S.floor,
  };
  for (const c of MP.conns) {
    const g = MP.guests[c.peer];
    if (!g) continue;
    const h = g.hero;
    mpRememberGuest(g);
    if (!c.sent || fullB) c.sent = new Map();
    const bch = [], bdel = [];
    for (const [id, sg] of sig) if (c.sent.get(id) !== sg) { if (!cur.has(id)) cur.set(id, JSON.stringify(S.buildings.get(id), rep)); bch.push(cur.get(id)); c.sent.set(id, sg); }
    for (const id of [...c.sent.keys()]) if (!sig.has(id)) { bdel.push(id); c.sent.delete(id); }
    // лагеря — только когда изменились
    const camps = c.campsSent !== campsJs || fullB ? (c.campsSent = campsJs) : undefined;
    // общая разведка: открытое хозяином (и другими гостями) — гостю, побитово, до 80 участков за пакет
    const exp = [];
    c.expSent = c.expSent || new Map();
    for (const [k, ch] of W) {
      if (!ch.expv || c.expSent.get(k) === ch.expv) continue;
      c.expSent.set(k, ch.expv);
      exp.push([k, mpExpPack(ch.explored)]);
      if (exp.length >= 80) break;
    }
    mpSend(c, Object.assign({}, base, { exp, campsJs: camps, bch, bdel, bfull: fullB || undefined, me: { inv: h.inv, hp: h.hp, weapon: h.weapon, guns: h.guns, ammo: h.ammo, gun: h.gun, armor: h.armor, craft: h.craft, craftBag: h.craftBag, dead: h.dead, spellCd: h.spellCd } }));
  }
}

// ---------- гость ----------
async function mpJoin(code) {
  code = (code || '').trim().toLowerCase();
  if (!code) { hint('Введите код'); return; }
  try { await loadPeerJs(); } catch (e) { alert('Не удалось загрузить сетевую библиотеку: ' + e.message); return; }
  MP.status = 'Соединяемся…'; renderMpWin();
  const peer = new Peer();
  MP.peer = peer;
  peer.on('error', (e) => { MP.status = 'Ошибка: ' + (e.type === 'peer-unavailable' ? 'игра с таким кодом не найдена' : (e.type || e.message)); renderMpWin(); });
  peer.on('open', () => {
    const conn = peer.connect(MP_PREFIX + code, { reliable: true });
    MP.hostConn = conn;
    conn.on('open', () => { MP.status = 'Соединено, загружаем мир…'; renderMpWin(); });
    conn.on('data', (raw) => mpReceive(conn, raw, mpClientHandle));
    conn.on('close', () => { log('Связь с хозяином потеряна', 'warn'); MP.role = null; MP.status = 'Связь потеряна'; renderMpWin(); });
  });
}

// разведанные клетки участка: 1 бит на клетку
function mpExpPack(arr) {
  const out = new Uint8Array(Math.ceil(arr.length / 8));
  for (let i = 0; i < arr.length; i++) if (arr[i]) out[i >> 3] |= 1 << (i & 7);
  return b64FromBytes(out);
}
function mpExpMerge(arr, b64) {
  const b = bytesFromB64(b64);
  let ch = false;
  for (let i = 0; i < arr.length; i++) if (!arr[i] && (b[i >> 3] >> (i & 7)) & 1) { arr[i] = 1; ch = true; }
  return ch;
}
// ---------- пинги: Alt+ЛКМ отмечает точку, её видят все игроки ----------
function mpPing(x, y, name, fromNet) {
  S.pings = (S.pings || []).filter(p => S.time - p.t < 12);
  S.pings.push({ x, y, name: name || 'Друг', t: S.time, rt: performance.now() });
  if (fromNet) { log(`📍 ${name || 'Друг'} отмечает точку на карте (${dirName(x - S.player.x, y - S.player.y)}, ${Math.round(dist(x, y, S.player.x, S.player.y))} клеток)`, 'good'); sfx('coins'); }
}
function mpSendPing(x, y) {
  const name = MP.myName || (mpHost() ? 'Хозяин' : 'Друг');
  mpPing(x, y, name, false);
  if (mpClient()) mpSend(MP.hostConn, { t: 'cmd', f: 'ping', x, y, name });
  else if (mpHost()) for (const c of MP.conns) mpSend(c, { t: 'ping', x, y, name });
  sfx('click');
}
// сообщения журнала: мир (набеги, эльфы, лагеря, осады) ведёт хозяин — он рассылает свои сообщения гостям,
// и у всех журнал одинаковый; то, что гость уже показал сам (тот же текст за последние 8 с), второй раз не выводим
const MP_LOGSEEN = new Map();
function mpLogSeen(msg) { const t = MP_LOGSEEN.get(msg); return t != null && performance.now() - t < 8000; }
const _logLocal = log;
log = function (msg, cls) {
  if (typeof MP !== 'undefined' && !MP.silent) {
    if (MP.role === 'host' && MP.conns.length) mpBroadcast({ t: 'log', msg, cls });
    if (MP.role === 'client') { if (mpLogSeen(msg)) return; MP_LOGSEEN.set(msg, performance.now()); }
  }
  return _logLocal(msg, cls);
};
function mpClientHandle(conn, m) {
  if (m.t === 'ping' && S) { mpPing(m.x, m.y, m.name, true); return; }
  if (m.t === 'log') { if (!mpLogSeen(m.msg)) { MP_LOGSEEN.set(m.msg, performance.now()); _logLocal(m.msg, m.cls); } return; }
  if (m.t === 'full') {
    loadState(m.save);
    MP.role = 'client';
    const me = Object.assign(newPlayer(), m.you);
    me.inv = Inv.from(m.you.inv);
    S.player = me;
    MP.others = [m.host]; MP.hb = {};
    CAM.x = me.x; CAM.y = me.y;
    startGame();
    for (const id of Object.keys(UI.wins)) closeWin(id);
    log('Вы в игре у друга! Ваши действия выполняются в его мире.', 'good');
    return;
  }
  if (!mpClient() || !S) return;
  if (m.t === 'h') mpApplyHeroes(m);
  else if (m.t === 'fast') mpApplyFast(m);
  else if (m.t === 'state') mpApplyState(m);
}

function mpApplyFast(m) {
  S.time = m.time;
  const p = S.player;
  if (m.me.dead > 0 && !(p.dead > 0)) { p.dead = m.me.dead; log('Анимансер пал! Возрождение через несколько секунд…', 'warn'); }
  if (!(m.me.dead > 0) && p.dead > 0) { p.dead = 0; }
  p.hp = m.me.hp;
  // враги: по id сохраняем объекты (на них ссылается выбранная цель)
  const old = new Map(S.enemies.map(e => [e.id, e]));
  S.enemies = m.enemies.map(a => {
    const e = old.get(a[0]) || { id: a[0], type: a[1], cd: 0, mode: a[7], tgt: null, think: 0, stun: 0, slow: 1, face: 1 };
    if (e.nx == null) { e.x = a[2]; e.y = a[3]; }
    e.type = a[1]; e.nx = a[2]; e.ny = a[3]; e.hp = a[4]; e.maxHp = a[5]; e.ang = a[6]; e.mode = a[7]; e.moving = !!a[8]; e.atkT = a[9] >= 0 ? a[9] : null; e.campId = a[10]; e.sentry = a[11] >= 0; e.alarmK = a[11] > 0 ? a[11] : 0; e.alarmed = !!a[12];
    e.netT = S.time;
    return e;
  });
  // големы: двигаем известных, пропавших убираем (новые придут с медленным состоянием)
  const og = new Map(S.golems.map(g => [g.id, g])), seen = new Set();
  for (const a of m.golems) {
    const g = og.get(a[0]);
    if (!g) continue;
    seen.add(g.id);
    if (g.nx == null) { g.x = a[1]; g.y = a[2]; }
    g.nx = a[1]; g.ny = a[2]; g.state = a[3]; g.carry = a[4]; g.n = a[5]; g.hp = a[6]; g.hidden = !!a[7]; g.fuel = a[8]; g.work = a[9]; g.tx = a[10]; g.ty = a[11];
  }
  S.golems = S.golems.filter(g => seen.has(g.id));
  for (const a of m.carts || []) { const c = S.carts.find(k => k.id === a[0]); if (c) { if (c.nx == null) { c.x = a[1]; c.y = a[2]; } c.nx = a[1]; c.ny = a[2]; c.dir = a[3]; c.state = a[4]; } }
  // звери — от хозяина (по id сохраняем объекты: на них может быть наведена цель)
  if (m.animals) {
    const oa = new Map(WILD.animals.map(a => [a.id, a]));
    WILD.animals = m.animals.map(r => {
      const a = oa.get(r[0]) || { id: r[0], kind: r[1], x: r[2], y: r[3], walk: 0, hp: 1 };
      a.kind = r[1]; a.nx = r[2]; a.ny = r[3]; a.ang = r[4]; a.moving = !!r[5]; if (r[6]) a.flash = 0.15;
      return a;
    });
  }
  for (const d of m.adeaths || []) WILD.carcasses.push({ kind: d[1], x: d[2], y: d[3], side: d[4], t: 0 });
  // убитые хозяином враги остаются лежать телами и у гостя
  for (const d of m.deaths || []) if (!CORPSES.some(c => c.type === d[0] && c.t < 2 && Math.abs(c.x - d[1]) + Math.abs(c.y - d[2]) < 2)) addCorpse({ type: d[0], x: d[1], y: d[2], ang: d[3] });
}

function mpApplyState(m) {
  // постройки: меняем только присланные; свои «предварительные» (поставленные до ответа хозяина) убираем
  const openId = UI.openB ? UI.openB.id : null, openG = UI.openG ? UI.openG.id : null;
  const incoming = (m.bch || []).map(s => JSON.parse(s));
  const keep = m.bfull ? new Set(incoming.map(b => b.id)) : null;
  for (const b of [...S.buildings.values()]) {
    if (b.local || (keep && !keep.has(b.id))) unregisterBuilding(b);
  }
  for (const id of m.bdel || []) { const b = S.buildings.get(id); if (b) unregisterBuilding(b); }
  for (const bd of incoming) {
    const old = S.buildings.get(bd.id);
    if (old) unregisterBuilding(old);
    // если на этом месте стоит другая постройка (рассинхрон) — она уступает хозяйской
    for (const [tx, ty] of tilesOf(BUILDINGS[bd.type], bd.x, bd.y)) { const o = bldAt(tx, ty); if (o && o.id !== bd.id) unregisterBuilding(o); }
    const b = Object.assign({}, bd);
    invify(b);
    if (BUILDINGS[b.type].kind === 'chest' && b.inv) { b.inv.slots = true; b.inv.cap = BUILDINGS[b.type].cap; }
    if (BUILDINGS[b.type].kind === 'belt') b.items = b.items || [];
    if (b.fluid == null && BUILDINGS[b.type].kind === 'machine') b.fluid = {};
    registerBuilding(b);
  }
  if (m.bfull) purgeOrphanBuildings();
  if (openId != null) UI.openB = S.buildings.get(openId) || null;
  if (m.ghosts) S.ghosts = m.ghosts;
  if (m.campsJs) S.camps = JSON.parse(m.campsJs);
  if (m.floor) S.floor = m.floor;
  if (m.exp) for (const [k, b64] of m.exp) { const [cx, cy] = k.split(',').map(Number); const c = getChunk(cx, cy); if (mpExpMerge(c.explored, b64)) c.fogDirty = true; }
  Object.assign(S, { research: m.research, stats: m.stats, elves: m.elves, merchant: m.merchant, quests: m.quests, crops: m.crops, workers: m.workers, raidT: m.raidT, blueprints: m.blueprints, envoy: m.envoy });
  // правки админ-меню хозяина — у гостя те же таблицы и ручки
  if (m.admin && JSON.stringify(m.admin) !== JSON.stringify(S.admin || {})) { S.admin = m.admin; applyAdmin(); }
  S.research.progress = S.research.progress || {};
  for (const c of S.camps) { c._wall = null; }
  recomputeBonus();
  // свой герой: инвентарь, снаряжение и очередь крафта — от хозяина
  const p = S.player, me = m.me;
  p.inv = Inv.from(me.inv); p.hp = me.hp; p.weapon = me.weapon; p.armor = me.armor; if (me.guns) { p.guns = me.guns; p.ammo = me.ammo; p.gun = me.gun; } p.craft = me.craft || []; p.craftBag = me.craftBag || {}; p.spellCd = me.spellCd || p.spellCd;
  // изменившиеся клетки мира
  for (const ch of m.chunks) {
    const [cx, cy] = ch.k.split(',').map(Number);
    const c = getChunk(cx, cy);
    const nres = bytesFromB64(ch.res), namt = new Uint16Array(bytesFromB64(ch.amt).buffer);
    // картинку земли перерисовываем только там, где клетка сменила вид (кончилась руда и т. п.),
    // а не при каждом ударе кирки — раньше это давало рывки у гостя
    for (let i = 0; i < c.res.length; i++) if (groundLook(c.res[i], c.amt[i]) !== groundLook(nres[i], namt[i])) redrawTile(c.cx * CHUNK + (i % CHUNK), c.cy * CHUNK + Math.floor(i / CHUNK));
    c.res.set(nres); c.amt.set(namt);
    let t = 0; for (let i = 0; i < c.res.length; i++) if (c.res[i] === RES_ID.tree) t++;
    c.trees = t; c.modified = true; c.netv = (c.netv || 0) + 1;
  }
  // големы целиком (положения потом уточняются быстрыми пакетами)
  // текущее экранное положение сохраняем, новое становится целью плавного движения
  const keepPos = (list, old) => { const om = new Map(old.map(o => [o.id, o])); for (const o of list) { const p = om.get(o.id); o.nx = o.x; o.ny = o.y; if (p) { o.x = p.x; o.y = p.y; } } return list; };
  S.golems = keepPos(m.golems, S.golems);
  const oc = UI.openC ? UI.openC.id : null;
  S.carts = keepPos((m.carts || []).map(c => Object.assign(c, { inv: Inv.from(c.inv) })), S.carts);
  if (oc != null) UI.openC = S.carts.find(c => c.id === oc) || null;
  UI.dirty = true;
  if (openG != null) UI.openG = S.golems.find(g => g.id === openG) || null;
}

// у гостя: постройки, оставшиеся на карте, но не известные игре (фантомы), убираем при полной сверке
function purgeOrphanBuildings() {
  for (const c of W.values()) {
    if (!c.blds.length) continue;
    const orphans = c.blds.filter(b => S.buildings.get(b.id) !== b);
    for (const b of orphans) {
      for (const [tx, ty] of tilesOf(BUILDINGS[b.type], b.x, b.y)) { const cc = chunkOf(tx, ty), i = tidx(tx, ty); if (cc.bld[i] === b) cc.bld[i] = null; }
      c.blds.splice(c.blds.indexOf(b), 1);
    }
    if (orphans.length) { netsDirty = true; BLD_VER++; }
  }
}

// гость 20 раз в секунду шлёт своё положение и состояние мыши
function mpClientTick() {
  // хозяин молчит — предупреждаем
  if (MP.lastRx && performance.now() - MP.lastRx > 8000) {
    if (!MP.lagWarn) { MP.lagWarn = true; log('Нет ответа от хозяина больше 8 секунд — проверьте интернет (или хозяин поставил игру на паузу).', 'warn'); }
  } else MP.lagWarn = false;
  MP.simT = (MP.simT || 0) + DT;
  MP.sendT -= DT;
  if (MP.sendT > 0) return;
  MP.sendT = 0.05;
  const p = S.player;
  mpSend(MP.hostConn, { t: 'in', st: Math.round(MP.simT * 1000), riding: !!p.riding, x: +p.x.toFixed(3), y: +p.y.toFixed(3), ang: p.ang, walk: p.walk, moving: !!(INPUT.keys.KeyW || INPUT.keys.KeyA || INPUT.keys.KeyS || INPUT.keys.KeyD || INPUT.keys.ArrowUp || INPUT.keys.ArrowDown || INPUT.keys.ArrowLeft || INPUT.keys.ArrowRight),
    ldown: INPUT.ldown, wx: INPUT.wx, wy: INPUT.wy, overUI: INPUT.overUI, tool: UI.tool, name: MP.myName || undefined });
}

// действия интерфейса, которые меняют только экран гостя — их хозяину не шлём
const MP_LOCAL_ACTS = new Set(['achwin', 'vcopy', 'vpaste', 'adminwin', 'admTab', 'admGroup', 'admGroupReset', 'admReset', 'admExport', 'reqMeAdd', 'reqMeDel', 'deconTool', 'setVecLimit', 'cartAddStop', 'cartDel', 'stFilter', 'stName', 'encTab', 'encSel', 'encwin', 'settings', 'unpause', 'resetTut', 'close', 'tab', 'menu', 'craftwin', 'invwin', 'researchwin', 'mapwin', 'pollution', 'help', 'mapHome', 'mapZoom', 'cheats', 'craftTab', 'zonePick', 'gcopy', 'gpaste', 'porterPick', 'porterFind', 'porterSetItem', 'zoneClear', 'followHero', 'followMe', 'mapToHero', 'vecSlot', 'vecSlotCancel', 'vecFind',
  'bpCopy', 'bpPaste', 'save', 'export', 'import', 'newgame', 'sound', 'elfwin', 'merchantwin', 'mp', 'mpHost', 'mpJoin', 'mpLeave', 'mpCopy', 'hot', 'setVecFilter', 'reqAdd', 'reqDel', 'undo']);
function mpSendAct(name, arg, e) {
  if (!mpClient() || MP_LOCAL_ACTS.has(name)) return;
  mpSend(MP.hostConn, { t: 'act', name, arg, ob: UI.openB ? UI.openB.id : null, og: UI.openG ? UI.openG.id : null, oc: UI.openC ? UI.openC.id : null, shift: e && e.shiftKey, ctrl: e && (e.ctrlKey || e.metaKey), button: e && e.button });
}
function mpCmd(o) { if (mpClient() && !MP.inAct) mpSend(MP.hostConn, Object.assign({ t: 'cmd' }, o)); }

// ---------- обёртки над действиями в мире: у гостя дублируем их хозяину ----------
const _mp = { placeBuilding, deconstruct, pickupGolem, rotateBuilding, setPlayerFocus, castSpell };
placeBuilding = function (type, x, y, dir, opts) {
  const ghost = mpClient() && S.player.inv.count(type) < 1 && !(S.cheats && S.cheats.free);
  const ok = _mp.placeBuilding(type, x, y, dir, opts);
  if (ok && ghost) { mpCmd({ f: 'ghost', type, x, y, dir }); return ok; }
  if (ok && mpClient()) {
    // у гостя постройка «предварительная», пока хозяин не пришлёт настоящую
    const b = bldAt(x, y); if (b && b.type === type) b.local = true;
    mpCmd({ f: 'place', type, x, y, dir });
  }
  return ok;
};
deconstruct = function (b) { mpCmd({ f: 'decon', x: b.x, y: b.y }); return _mp.deconstruct(b); };
pickupGolem = function (g) { mpCmd({ f: 'pickg', id: g.id }); return _mp.pickupGolem(g); };
rotateBuilding = function (b, d) { mpCmd({ f: 'rotate', x: b.x, y: b.y, d }); return _mp.rotateBuilding(b, d); };
setPlayerFocus = function (f) { mpCmd({ f: 'focus', f2: mpFocusTo(f) }); return _mp.setPlayerFocus(f); };
castSpell = function (name) { mpCmd({ f: 'spell', name, wx: INPUT.wx, wy: INPUT.wy }); return _mp.castSpell(name); };

// ---------- другие герои на экране ----------
// Снимки положений: каждый присланный пакет — снимок (время отправителя, x, y …). Рисуем героя на ~110 мс
// в прошлом, плавно между двумя снимками вокруг этого момента — движение ровное при любых задержках сети.
// Бег, поворот и шаги считаем сами по видимому движению, удар — по atkT, который тикает между пакетами.
const MP_DELAY = 110, MP_EXTRA = 100;
function mpHeroSample(id, st, h) {
  const hb = MP.hb || (MP.hb = {}), now = performance.now();
  let b = hb[id];
  if (!b) b = hb[id] = { s: [], off: null, lastSt: -1, walk: 0, ang: Math.PI / 2, mv: 0 };
  if (st <= b.lastSt) return; // опоздал или повтор
  // сдвиг часов отправителя: минимум (приход − отправка) с медленной «ползучестью» вверх —
  // одиночные сетевые рывки почти не сдвигают шкалу, а отставание симуляции отправителя догоняется
  const d = now - st;
  if (b.off == null || now - b.rx > 1000 || st - b.lastSt > 1000) { b.off = d; b.s.length = 0; }
  else b.off = Math.min(d, b.off + Math.max(1, (d - b.off) * 0.04));
  b.lastSt = st; b.rx = now;
  const t = st + b.off, last = b.s[b.s.length - 1];
  // большой скачок (возрождение, телепорт) — не тянем через всю карту
  if (last && Math.abs(h.x - last.x) + Math.abs(h.y - last.y) > 4) b.s.length = 0;
  b.s.push({ t, x: h.x, y: h.y, ang: h.ang, atkT: h.atkT, atkKind: h.atkKind, dead: h.dead, riding: h.riding, hp: h.hp, weapon: h.weapon, armor: h.armor, lastHurt: h.lastHurt, name: h.name });
  while (b.s.length > 2 && b.s[1].t < now - MP_DELAY - 1000) b.s.shift();
  if (b.s.length > 40) b.s.shift();
}
function mpApplyHeroes(m) {
  if (m.st <= (MP.heroSt || -1)) return;
  MP.heroSt = m.st;
  MP.others = m.others;
  for (const h of m.others) mpHeroSample(h.id || h.name, m.st, h);
}
// положение героя в момент «сейчас − задержка»: между снимками — линейно, после последнего — недолго по скорости
function mpHeroInterp(b, out) {
  const s = b.s, rt = performance.now() - MP_DELAY;
  if (!s.length) return null;
  let a = s[0], c = null;
  if (rt <= a.t) { out.x = a.x; out.y = a.y; return a; }
  for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= rt) { a = s[i]; c = s[i + 1] || null; break; }
  if (c) {
    const k = (rt - a.t) / Math.max(1, c.t - a.t);
    out.x = a.x + (c.x - a.x) * k; out.y = a.y + (c.y - a.y) * k;
  } else {
    // снимки кончились: продолжаем движение по последней скорости не дольше MP_EXTRA мс
    const p = s.length > 1 ? s[s.length - 2] : null, ex = Math.min(rt - a.t, MP_EXTRA);
    if (p && a.t > p.t && a.t - p.t < 300) { out.x = a.x + (a.x - p.x) / (a.t - p.t) * ex; out.y = a.y + (a.y - p.y) / (a.t - p.t) * ex; }
    else { out.x = a.x; out.y = a.y; }
  }
  out.dt = rt - a.t; // сколько прошло с этого снимка (для atkT)
  return a;
}
// бег, шаги и поворот по видимому движению
function mpHeroAnim(b, x, y, attacking, sentAng) {
  const now = performance.now(), dt = b.ft ? Math.min(0.1, (now - b.ft) / 1000) : 0;
  b.ft = now;
  if (b.px == null) { b.px = x; b.py = y; }
  const dx = x - b.px, dy = y - b.py, d = Math.hypot(dx, dy);
  b.px = x; b.py = y;
  const moving = dt > 0 && d / dt > 0.6;
  // короткие паузы между снимками не останавливают ноги
  b.mv = moving ? 0.15 : Math.max(0, b.mv - dt);
  if (moving) { b.walk += d / 5.5; b.ang = Math.atan2(dy, dx); }
  if (attacking && sentAng != null) b.ang = sentAng;
  return b.mv > 0;
}
let MP_HFRAME = -1, MP_HLIST = [];
function mpOtherHeroes() {
  if (!MP.role) return MP_HLIST.length ? (MP_HLIST = []) : MP_HLIST;
  // один расчёт на кадр (герои нужны и для отрисовки, и для ночного света)
  const fk = typeof last !== 'undefined' ? last : 0;
  if (fk === MP_HFRAME && fk) return MP_HLIST;
  MP_HFRAME = fk;
  const hb = MP.hb || (MP.hb = {}), out = [];
  const one = (id, live) => {
    const b = hb[id], pos = {};
    const a = b ? mpHeroInterp(b, pos) : null;
    const src = live || a;
    if (!src) return;
    const h = { id, name: src.name, weapon: src.weapon, armor: src.armor, hp: src.hp, lastHurt: src.lastHurt, guest: id !== 'host',
      x: a ? pos.x : live.x, y: a ? pos.y : live.y, dead: src.dead, riding: src.riding, atkKind: src.atkKind, atkT: src.atkT };
    // у гостя удар продолжается между пакетами: atkT снимка + прошедшее время
    if (!live && a && a.atkT != null) h.atkT = a.atkT + Math.max(0, pos.dt || 0) / 1000;
    const adur = ATK_ANIM[h.atkKind] || 0.3, atk = h.atkT != null && h.atkT < adur;
    if (b) { h.moving = mpHeroAnim(b, h.x, h.y, atk, src.ang); h.ang = b.ang; h.walk = b.walk; }
    else { h.moving = false; h.ang = src.ang; h.walk = 0; }
    out.push(h);
  };
  if (mpHost()) for (const id in MP.guests) { const g = MP.guests[id]; one(id, Object.assign(mpHeroPub(g.hero, g.name, id), { x: g.hero.x, y: g.hero.y })); }
  else if (mpClient()) for (const h of MP.others || []) one(h.id || h.name, null);
  MP_HLIST = out;
  return out;
}
function drawOtherHero(h, t) {
  const ang = h.ang != null ? h.ang : Math.PI / 2;
  if (h.dead > 0) { drawUnit3D('player', h.x, h.y, { ang, anim: 'die', t: 6 - h.dead, alpha: 0.8 }); return; }
  G.globalAlpha = 0.16; G.fillStyle = h.guest ? '#ff7a60' : '#5affc0';
  G.beginPath(); G.ellipse(sx(h.x), sy(h.y), VIEW.z * 0.5, VIEW.z * 0.28, 0, 0, 7); G.fill(); G.globalAlpha = 1;
  const adur = ATK_ANIM[h.atkKind] || 0.3;
  const atkK = h.atkT != null && h.atkT < adur ? h.atkT / adur : -1;
  const anim = atkK >= 0 ? (PLAYER_ATK[h.atkKind] || 'swing') : h.moving && !h.riding ? 'run' : 'stance';
  const flash = S.time - (h.lastHurt || -9) < 0.12;
  if (h.riding) {
    drawSteed({ x: h.x, y: h.y }, t, ang);
    drawHero({ x: h.x, y: h.y - 0.38, weapon: h.weapon, armor: h.armor, guest: h.guest }, { ang, anim, t, k: atkK >= 0 ? atkK : null, flash });
  } else drawHero({ x: h.x, y: h.y, weapon: h.weapon, armor: h.armor, guest: h.guest }, { ang, anim, t: h.moving ? (h.walk || 0) * 1.4 : t, k: atkK >= 0 ? atkK : null, flash });
  const ny = h.y - (h.riding ? 1.95 : 1.55);
  G.font = `bold ${Math.round(Math.max(11, VIEW.z * 0.28))}px sans-serif`; G.textAlign = 'center';
  G.lineWidth = 3; G.strokeStyle = '#000'; G.strokeText(h.name || 'Друг', sx(h.x), sy(ny));
  G.fillStyle = h.guest ? '#ffa890' : '#ffd060'; G.fillText(h.name || 'Друг', sx(h.x), sy(ny));
}

// ---------- окно ----------
function renderMpWin() {
  if (typeof UI === 'undefined') return;
  let h = '<p class="dim">Играйте вдвоём через интернет. Один создаёт игру и передаёт код, второй вводит его. Мир считается у создателя игры — у него должен быть хороший интернет и компьютер. Нужно, чтобы у обоих была эта же версия игры.</p>';
  if (!MP.role) {
    h += S ? `<div class="row"><button class="primary" data-act="mpHost">Создать совместную игру из текущей</button></div>` : `<div class="dim">Чтобы самому открыть игру для друга — начните или загрузите игру, затем Esc → «Играть вместе с другом».</div>`;
    h += `<h3>Присоединиться к другу</h3><div class="row"><input id="mpCode" placeholder="код от друга" style="width:140px"> <input id="mpName" placeholder="ваше имя" style="width:120px"> <button data-act="mpJoin">Войти</button></div>`;
    h += `<div class="dim">Ваша текущая игра при входе к другу не пропадёт — она сохранена в браузере.</div>`;
  } else if (mpHost()) {
    h += `<div>Код игры: <b data-act="mpCopy" title="Нажмите — код скопируется" style="font-size:22px;color:#ffa200;letter-spacing:2px;cursor:pointer;border-bottom:1px dashed #ffa200">${MP.code || '…'}</b> <button data-act="mpCopy">📋 Копировать</button></div><div class="dim">Нажмите на код — он скопируется, останется вставить другу (Ctrl+V). Подключено: ${Object.keys(MP.guests).length}</div>`;
    for (const id in MP.guests) h += `<div>• ${MP.guests[id].name}</div>`;
    h += `<div class="row" style="margin-top:8px"><button class="danger" data-act="mpLeave">Закрыть совместную игру</button></div>`;
  } else {
    h += `<div class="ok">Вы в игре у друга.</div><div class="row" style="margin-top:8px"><button class="danger" data-act="mpLeave">Выйти (вернуться к своей игре)</button></div>`;
  }
  if (MP.status) h += `<div class="dim" style="margin-top:8px">${MP.status}</div>`;
  if (UI.wins.mp) setWinBody('mp', h); else openWin('mp', 'Совместная игра', h, { width: 460 });
}
ACT.mp = () => renderMpWin();
ACT.mpHost = () => mpHostStart();
ACT.mpJoin = () => { MP.myName = ($('mpName') && $('mpName').value.trim()) || 'Друг'; mpJoin($('mpCode') && $('mpCode').value); };
ACT.mpLeave = () => {
  if (MP.peer) MP.peer.destroy();
  const wasClient = mpClient();
  MP.role = null; MP.conns = []; MP.guests = {}; MP.others = []; MP.hb = {}; MP.hostConn = null; MP.status = '';
  if (wasClient) location.reload();
  else { log('Совместная игра закрыта'); renderMpWin(); }
};

// клик по коду игры — код в буфер обмена
ACT.mpCopy = () => {
  if (!MP.code) return;
  const done = () => hint('Код скопирован: ' + MP.code + ' — вставьте другу (Ctrl+V)');
  const fallback = () => { const t = document.createElement('textarea'); t.value = MP.code; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { hint('Не удалось скопировать — выделите код вручную'); } t.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(MP.code).then(done, fallback); else fallback();
};
