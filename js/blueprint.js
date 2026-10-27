'use strict';
// Чертежи: выделить группу построек мышью (Ctrl+C), вставить копию (Ctrl+V, R — поворот),
// и отмена последних действий (Ctrl+Z).

const BP = { clip: null, sel: null };
const UNDO = { stack: [], cur: null, busy: false };

// ---------- отмена ----------
function undoBegin() { UNDO.cur = []; }
function undoEnd() {
  if (UNDO.cur && UNDO.cur.length) { UNDO.stack.push(UNDO.cur); if (UNDO.stack.length > 60) UNDO.stack.shift(); }
  UNDO.cur = null;
}
function recordUndo(e) {
  if (UNDO.busy || !S || typeof UI === 'undefined' || !UI.recordUndo) return;
  if (UNDO.cur) UNDO.cur.push(e);
  else { UNDO.stack.push([e]); if (UNDO.stack.length > 60) UNDO.stack.shift(); }
}
function bldSnapshot(b) {
  return { a: 'del', type: b.type, x: b.x, y: b.y, dir: b.dir || 0, recipe: BUILDINGS[b.type].fixed ? null : b.recipe || null, filter: b.filter || null, filters: b.filters || null, filterMode: b.filterMode || null, lane: b.lane || null };
}

function undoLast() {
  const g = UNDO.stack.pop();
  if (!g) { hint('Нечего отменять'); return; }
  UNDO.busy = true;
  let n = 0, fail = 0;
  try {
    for (let i = g.length - 1; i >= 0; i--) {
      const e = g[i];
      if (e.a === 'add') { const b = S.buildings.get(e.id); if (b) { deconstruct(b); n++; } }
      else if (e.a === 'addg') { const gm = S.golems.find(x => x.id === e.id); if (gm) { pickupGolem(gm); n++; } }
      else if (e.a === 'del') {
        if (placeBuilding(e.type, e.x, e.y, e.dir, { noReach: true, quiet: true })) {
          const b = bldAt(e.x, e.y);
          if (b && e.recipe) b.recipe = e.recipe;
          if (b && e.filter) b.filter = e.filter;
          if (b && e.filters) { b.filters = e.filters; b.filterMode = e.filterMode; } if (b && e.lane) b.lane = e.lane;
          n++;
        } else fail++;
      } else if (e.a === 'delg') {
        if (placeBuilding(e.type, Math.floor(e.x), Math.floor(e.y), 0, { noReach: true, quiet: true })) n++; else fail++;
      }
    }
  } finally { UNDO.busy = false; }
  hint(`Отменено: ${n}${fail ? `, не удалось вернуть ${fail} (нет постройки в инвентаре или место занято)` : ''}`);
  sfx('remove');
}

// ---------- выделение и копирование ----------
function startSelect() {
  UI.tool = null; UI.mode = 'select'; BP.sel = null; UI.dirty = true;
  hint('Выделите область мышью (зажмите ЛКМ). Esc — отмена.');
}
function selRect() {
  const s = BP.sel;
  if (!s) return null;
  const x0 = Math.floor(Math.min(s.x0, s.x1)), y0 = Math.floor(Math.min(s.y0, s.y1));
  const x1 = Math.floor(Math.max(s.x0, s.x1)), y1 = Math.floor(Math.max(s.y0, s.y1));
  return { x0, y0, x1, y1 };
}
function buildingsInRect(r) {
  const out = new Set();
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const b = bldAt(x, y); if (b) out.add(b); }
  return [...out];
}
function finishSelect() {
  const r = selRect();
  BP.sel = null;
  if (UI.mode === 'decon') { if (r) markDecon(r); return; }
  if (!r) { UI.mode = null; return; }
  const list = buildingsInRect(r);
  if (!list.length) { UI.mode = null; hint('В выделении нет построек'); return; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of list) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  BP.clip = {
    w: x1 - x0, h: y1 - y0,
    items: list.map(b => ({ type: b.type, dx: b.x - x0, dy: b.y - y0, dir: b.dir || 0, recipe: BUILDINGS[b.type].fixed ? null : b.recipe || null, filter: b.filter || null, filters: b.filters || null, filterMode: b.filterMode || null, lane: b.lane || null })),
  };
  UI.mode = 'paste';
  hint(`Скопировано построек: ${list.length}. ЛКМ — вставить, R — повернуть, Esc — отмена.`);
  sfx('click');
}
function startPaste() {
  if (!BP.clip) { hint('Сначала скопируйте постройки: Ctrl+C и выделите область'); return; }
  UI.tool = null; UI.mode = 'paste'; UI.dirty = true;
  hint('ЛКМ — вставить, R — повернуть, Esc — отмена.');
}
function rotateClip() {
  const c = BP.clip;
  if (!c) return;
  // поворот на 90° по часовой стрелке
  for (const it of c.items) {
    const sz = BUILDINGS[it.type].size;
    const nx = c.h - (it.dy + sz[1]), ny = it.dx;
    it.dx = nx; it.dy = ny;
    it.dir = (it.dir + 1) % 4;
  }
  const w = c.w; c.w = c.h; c.h = w;
}
function pasteOrigin() {
  const c = BP.clip;
  return { x: Math.round(INPUT.wx - c.w / 2), y: Math.round(INPUT.wy - c.h / 2) };
}
// сколько стоит вставить всё и что получится поставить
function pastePlan() {
  const c = BP.clip, o = pasteOrigin();
  const p = S.player;
  const far = dist(o.x + c.w / 2, o.y + c.h / 2, p.x, p.y) > playerReach() + 12;
  return c.items.map(it => {
    const x = o.x + it.dx, y = o.y + it.dy;
    const prob = far ? 'далеко' : placeProblem(it.type, x, y, false);
    return { it, x, y, ok: !prob };
  });
}
function pastePlace() {
  const plan = pastePlan();
  if (plan.every(e => !e.ok)) { hint('Сюда не поставить: место занято или слишком далеко'); sfx('error'); return; }
  let n = 0, poor = 0;
  undoBegin();
  // сначала постройки, потом конвейеры и векторы — чтобы подземные конвейеры нашли пары
  plan.sort((a, b) => (BUILDINGS[a.it.type].kind === 'belt' ? 1 : 0) - (BUILDINGS[b.it.type].kind === 'belt' ? 1 : 0));
  for (const e of plan) {
    if (!e.ok) continue;
    if (S.player.inv.count(e.it.type) < 1 && !(S.cheats && S.cheats.free)) { if (addGhost(e.it.type, e.x, e.y, e.it.dir, true)) poor++; continue; }
    if (placeBuilding(e.it.type, e.x, e.y, e.it.dir, { noReach: true, quiet: true })) {
      const b = bldAt(e.x, e.y);
      if (b && e.it.recipe) b.recipe = e.it.recipe;
      if (b && e.it.filter) b.filter = e.it.filter;
      if (b && e.it.filters) { b.filters = e.it.filters; b.filterMode = e.it.filterMode; } if (b && e.it.lane) b.lane = e.it.lane;
      n++;
    }
  }
  undoEnd();
  hint(`Поставлено: ${n} из ${plan.length}${poor ? ` · призраков: ${poor} — их построят големы-строители` : ''}`);
  if (n) sfx('build');
}

// ---------- отрисовка ----------
function drawBlueprintCursor() {
  if (UI.mode === 'select' || UI.mode === 'decon') {
    const r = selRect();
    if (r) {
      const red = UI.mode === 'decon';
      G.fillStyle = red ? 'rgba(255,80,60,0.14)' : 'rgba(90,200,255,0.12)'; G.strokeStyle = red ? 'rgba(255,90,60,0.9)' : 'rgba(90,200,255,0.9)'; G.lineWidth = Math.max(1, DPR);
      const X = sx(r.x0), Y = sy(r.y0), Wd = sx(r.x1 + 1) - X, Ht = sy(r.y1 + 1) - Y;
      G.fillRect(X, Y, Wd, Ht); G.strokeRect(X, Y, Wd, Ht);
      for (const b of buildingsInRect(r)) { G.strokeStyle = 'rgba(90,200,255,0.6)'; G.strokeRect(sx(b.x), sy(b.y), sx(b.x + b.w) - sx(b.x), sy(b.y + b.h) - sy(b.y)); }
    } else {
      G.strokeStyle = 'rgba(90,200,255,0.7)';
      G.strokeRect(sx(Math.floor(INPUT.wx)), sy(Math.floor(INPUT.wy)), VIEW.z, VIEW.z);
    }
    return;
  }
  if (UI.mode === 'paste' && BP.clip) {
    const plan = pastePlan();
    G.globalAlpha = 0.55;
    for (const e of plan) {
      const def = BUILDINGS[e.it.type];
      drawBuildingGhost(e.it.type, e.x, e.y, e.it.dir);
    }
    G.globalAlpha = 0.25;
    for (const e of plan) {
      const sz = BUILDINGS[e.it.type].size;
      G.fillStyle = e.ok ? '#40ff60' : '#ff3020';
      G.fillRect(sx(e.x), sy(e.y), sx(e.x + sz[0]) - sx(e.x), sy(e.y + sz[1]) - sy(e.y));
    }
    G.globalAlpha = 1;
    const cost = {};
    for (const e of plan) if (e.ok) cost[e.it.type] = (cost[e.it.type] || 0) + 1;
    const lack = S.cheats && S.cheats.free ? [] : Object.keys(cost).filter(id => S.player.inv.count(id) < cost[id]);
    UI.cursorProblem = lack.length ? 'Не хватает: ' + lack.map(id => `${ITEMS[id].name} ${S.player.inv.count(id)}/${cost[id]}`).join(', ') : null;
  }
}
