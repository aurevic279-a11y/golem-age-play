'use strict';
// Строительство призраками: если постройки нет в инвентаре, ставится «призрак»,
// а големы-строители из Гильдии строителей приносят постройку из сундуков (или от Анимансера) и строят её.
// Инструмент «Снос» помечает постройки — строители разбирают их и уносят на склад.

const BUILDER = { radius: 30, speed: 4.5 };
const BUILDER_CHESTS = new Set([undefined, 'player', 'provide', 'station']); // откуда строители берут постройки

function ghostOverlap(x, y, w, h) {
  return S.ghosts.find(g => { const d = BUILDINGS[g.type]; return x < g.x + d.size[0] && x + w > g.x && y < g.y + d.size[1] && y + h > g.y; });
}
function ghostAtTile(x, y) { return ghostOverlap(x, y, 1, 1); }

// поставить призрак (true — поставлен)
function addGhost(type, x, y, dir, quiet) {
  const def = BUILDINGS[type];
  if (def.kind === 'mgolem' || def.kind === 'cart') return false;
  const prob = placeProblem(type, x, y, false);
  if (prob) { if (!quiet) hint(prob); return false; }
  if (ghostOverlap(x, y, def.size[0], def.size[1])) return false;
  S.ghosts.push({ id: S.nextId++, type, x, y, dir: dir || 0 });
  return true;
}
function removeGhostsUnder(x, y, w, h) { S.ghosts = S.ghosts.filter(g => { const d = BUILDINGS[g.type]; return !(x < g.x + d.size[0] && x + w > g.x && y < g.y + d.size[1] && y + h > g.y); }); }
function cancelGhostAt(x, y) { const g = ghostAtTile(x, y); if (!g) return false; S.ghosts.splice(S.ghosts.indexOf(g), 1); sfx('remove'); return true; }

// ---------- снос ----------
function markDecon(r) {
  const list = buildingsInRect(r);
  const ghosts = S.ghosts.filter(g => g.x >= r.x0 && g.x <= r.x1 && g.y >= r.y0 && g.y <= r.y1);
  if (!list.length && !ghosts.length) { hint('В выделении нет построек'); return; }
  // призраки в области просто убираем; постройки помечаем (повторное выделение снимает пометку)
  if (ghosts.length) S.ghosts = S.ghosts.filter(g => !ghosts.includes(g));
  const allMarked = list.length && list.every(b => b.decon);
  for (const b of list) b.decon = !allMarked;
  hint(allMarked ? `Снята пометка со ${list.length} построек` : `Помечено на снос: ${list.length}. Строители разберут их и унесут на склад${S.buildings.size && !hubsExist() ? ' (нужна Гильдия строителей) — или разберите сами ПКМ' : ''}.`);
  sfx('click');
}
function hubsExist() { return bldType('bhub').length > 0; }

// ---------- строители ----------
function hubSources(hub, id) {
  // сундуки в радиусе гильдии с нужной постройкой
  let best = null, bd = 1e9;
  for (const b of bldKind('chest')) {
    const d = BUILDINGS[b.type];
    if (!BUILDER_CHESTS.has(d.sub) || !b.inv.count(id)) continue;
    const dd = dist2(b.x + 0.5, b.y + 0.5, hub.x + 1, hub.y + 1);
    if (dd > BUILDER.radius * BUILDER.radius) continue;
    if (dd < bd) { bd = dd; best = b; }
  }
  if (best) return { b: best };
  const p = S.player;
  if (p.dead <= 0 && p.inv.count(id) && dist(p.x, p.y, hub.x + 1, hub.y + 1) <= BUILDER.radius) return { p: true };
  return null;
}
function storeChest(hub, id) {
  let best = null, bd = 1e9;
  for (const b of bldKind('chest')) {
    const d = BUILDINGS[b.type];
    if ((d.sub && d.sub !== 'player' && d.sub !== 'provide') || b.inv.space(id) <= 0) continue;
    const dd = dist2(b.x + 0.5, b.y + 0.5, hub.x + 1, hub.y + 1);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}

function botMove(bot, tx, ty, dt) {
  const d = dist(bot.x, bot.y, tx, ty), sp = BUILDER.speed * (1 + (S.bonus.golem || 0)) * dt;
  if (d <= sp) { bot.x = tx; bot.y = ty; return true; }
  bot.x += (tx - bot.x) / d * sp; bot.y += (ty - bot.y) / d * sp;
  bot.ang = Math.atan2(ty - bot.y, tx - bot.x);
  return false;
}

function updateHub(hub, dt) {
  const n = hub.inv.count('builder');
  while (hub.bots.length < n) hub.bots.push({ id: S.nextId++, x: hub.x + 1, y: hub.y + 1, state: 'idle' });
  // лишних (вынутых из гильдии) убираем, когда они дома
  if (hub.bots.length > n) { const i = hub.bots.findIndex(b => b.state === 'idle'); if (i >= 0) hub.bots.splice(i, 1); }
  const hx = hub.x + 1, hy = hub.y + 0.6, R2 = BUILDER.radius * BUILDER.radius;
  for (const bot of hub.bots) {
    switch (bot.state) {
      case 'idle': {
        if (!botMove(bot, hx, hy, dt)) break;
        bot.think = (bot.think || 0) - dt;
        if (bot.think > 0) break;
        bot.think = 0.5;
        // сначала личная логистика героя, потом снос, потом стройка
        const p = S.player;
        if (p.dead <= 0 && dist2(p.x, p.y, hx, hy) <= R2) {
          if (p.trash && p.trash.n && !S.trashBot) { S.trashBot = bot.id; bot.state = 'ptrash'; break; }
          let got = false;
          for (const id in (p.requests || {})) {
            S.reqBusy = S.reqBusy || {};
            const need = p.requests[id] - p.inv.count(id);
            if (need <= 0 || S.reqBusy[id]) continue;
            const src = hubSources(hub, id);
            if (!src || !src.b) continue;
            S.reqBusy[id] = bot.id; bot.state = 'pfetch'; bot.rid = id; bot.src = src.b.id; got = true;
            break;
          }
          if (got) break;
        }
        let job = null;
        for (const b of S.buildings.values()) if (b.decon && !b.deconBot && dist2(b.x + b.w / 2, b.y + b.h / 2, hx, hy) <= R2) { job = b; break; }
        if (job) { job.deconBot = bot.id; bot.state = 'decon'; bot.tid = job.id; break; }
        for (const g of S.ghosts) {
          if (g.bot || dist2(g.x + 0.5, g.y + 0.5, hx, hy) > R2) continue;
          const src = hubSources(hub, g.type);
          if (!src) continue;
          g.bot = bot.id; bot.state = 'fetch'; bot.gid = g.id; bot.src = src.b ? src.b.id : 'player';
          break;
        }
        break;
      }
      case 'fetch': {
        const g = S.ghosts.find(x => x.id === bot.gid);
        if (!g) { bot.state = 'idle'; break; }
        const src = bot.src === 'player' ? S.player : S.buildings.get(bot.src);
        if (!src) { g.bot = null; bot.state = 'idle'; break; }
        const tx = bot.src === 'player' ? src.x : src.x + 0.5, ty = bot.src === 'player' ? src.y - 0.5 : src.y + 0.5;
        if (!botMove(bot, tx, ty, dt)) break;
        const inv = src.inv;
        if (inv.remove(g.type, 1)) { bot.carry = g.type; bot.state = 'build'; }
        else { g.bot = null; bot.state = 'idle'; }
        break;
      }
      case 'build': {
        const g = S.ghosts.find(x => x.id === bot.gid);
        if (!g) { bot.state = 'return'; break; }
        const def = BUILDINGS[g.type];
        if (!botMove(bot, g.x + def.size[0] / 2, g.y + def.size[1] / 2 - 0.4, dt)) break;
        S.ghosts.splice(S.ghosts.indexOf(g), 1);
        if (placeProblem(g.type, g.x, g.y, false)) { bot.state = 'return'; break; }
        const b = newBuilding(g.type, g.x, g.y, g.dir);
        registerBuilding(b);
        if (def.under) pairUnderground(b);
        S.stats.built[g.type] = (S.stats.built[g.type] || 0) + 1;
        S.stats.botBuilt = (S.stats.botBuilt || 0) + 1;
        bot.carry = null; bot.state = 'idle';
        spawnBurst(g.x + def.size[0] / 2, g.y + def.size[1] / 2, '#9fe8ff', 6);
        sfx('build', g.x, g.y);
        break;
      }
      case 'ptrash': {
        // забрать содержимое корзины героя и унести на склад
        const p = S.player;
        if (!p.trash || !p.trash.n || p.dead > 0) { S.trashBot = null; bot.state = 'idle'; break; }
        if (!botMove(bot, p.x, p.y - 0.5, dt)) break;
        const id = p.trash.ids()[0], n = Math.min(50, p.trash.count(id));
        p.trash.remove(id, n);
        bot.carry = null; bot.extra = { [id]: n }; bot.state = 'return'; S.trashBot = null;
        break;
      }
      case 'pfetch': {
        const ch = S.buildings.get(bot.src), p = S.player, id = bot.rid;
        if (!ch || !ch.inv.count(id)) { S.reqBusy[id] = null; bot.state = 'idle'; break; }
        if (!botMove(bot, ch.x + 0.5, ch.y + 0.5, dt)) break;
        const need = Math.max(0, (p.requests && p.requests[id] || 0) - p.inv.count(id));
        const n = Math.min(need, 50, ch.inv.count(id));
        if (n <= 0) { S.reqBusy[id] = null; bot.state = 'idle'; break; }
        ch.inv.remove(id, n); bot.extra = { [id]: n }; bot.state = 'pdeliver';
        break;
      }
      case 'pdeliver': {
        const p = S.player, id = bot.rid;
        if (p.dead > 0 || dist2(p.x, p.y, hx, hy) > R2 * 1.5) { S.reqBusy[id] = null; bot.state = 'return'; break; }
        if (!botMove(bot, p.x, p.y - 0.5, dt)) break;
        const n = bot.extra ? bot.extra[id] : 0, put = p.inv.add(id, n);
        if (put < n) bot.extra[id] = n - put; else bot.extra = null;
        S.reqBusy[id] = null;
        bot.state = bot.extra ? 'return' : 'idle';
        break;
      }
      case 'decon': {
        const b = S.buildings.get(bot.tid);
        if (!b || !b.decon) { if (b) b.deconBot = null; bot.state = 'idle'; break; }
        if (!botMove(bot, b.x + b.w / 2, b.y + b.h / 2 - 0.4, dt)) break;
        bot.carry = b.type;
        bot.extra = buildingContents(b);
        unregisterBuilding(b);
        spawnBurst(b.x + b.w / 2, b.y + b.h / 2, '#ff9f40', 6);
        sfx('remove', b.x, b.y);
        bot.state = 'return';
        break;
      }
      case 'return': {
        if (!bot.carry && !bot.extra) { bot.state = 'idle'; break; }
        const ch = storeChest(hub, bot.carry || Object.keys(bot.extra)[0]);
        if (!ch) { bot.status = 'нет места на складе'; if (botMove(bot, hx, hy, dt)) { bot.think = (bot.think || 0) - dt; } break; }
        if (!botMove(bot, ch.x + 0.5, ch.y + 0.5, dt)) break;
        if (bot.carry) ch.inv.add(bot.carry, 1);
        if (bot.extra) for (const id in bot.extra) { const left = bot.extra[id] - ch.inv.add(id, bot.extra[id]); if (left > 0) S.player.inv.add(id, left); }
        bot.carry = null; bot.extra = null; bot.state = 'idle';
        break;
      }
    }
  }
}

function updateBuilders(dt) {
  S.reqBusy = S.reqBusy || {};
  for (const b of bldType('bhub')) updateHub(b, dt);
  // призраки, у чьих строителей пропала гильдия, снова свободны
  for (const g of S.ghosts) if (g.bot && !anyBot(g.bot)) g.bot = null;
}
function anyBot(id) { for (const b of bldType('bhub')) if (b.bots && b.bots.some(x => x.id === id)) return true; return false; }

// ---------- отрисовка ----------
function drawGhosts() {
  for (const g of S.ghosts) {
    const d = BUILDINGS[g.type];
    if (g.x + d.size[0] < VIEW.x0 || g.x > VIEW.x1 || g.y + d.size[1] < VIEW.y0 || g.y > VIEW.y1 + 2) continue;
    G.globalAlpha = 0.42;
    drawBuildingGhost(g.type, g.x, g.y, g.dir);
    G.globalAlpha = 0.18; G.fillStyle = '#5ab0ff';
    G.fillRect(sx(g.x), sy(g.y), VIEW.z * d.size[0], VIEW.z * d.size[1]);
    G.globalAlpha = 0.9; G.strokeStyle = '#7ac0ff'; G.lineWidth = Math.max(1, VIEW.z * 0.03); G.setLineDash([VIEW.z * 0.12, VIEW.z * 0.08]);
    G.strokeRect(sx(g.x) + 1, sy(g.y) + 1, VIEW.z * d.size[0] - 2, VIEW.z * d.size[1] - 2); G.setLineDash([]);
    G.globalAlpha = 1;
  }
}
function drawDeconMarks() {
  G.strokeStyle = 'rgba(255,70,50,0.9)'; G.lineWidth = Math.max(2, VIEW.z * 0.07); G.lineCap = 'round';
  for (const b of S.buildings.values()) {
    if (!b.decon || b.x > VIEW.x1 || b.x + b.w < VIEW.x0 || b.y > VIEW.y1 || b.y + b.h < VIEW.y0) continue;
    const cx = sx(b.x + b.w / 2), cy = sy(b.y + b.h / 2), r = VIEW.z * 0.3;
    G.beginPath(); G.moveTo(cx - r, cy - r); G.lineTo(cx + r, cy + r); G.moveTo(cx + r, cy - r); G.lineTo(cx - r, cy + r); G.stroke();
  }
}
function drawBuilders(t) {
  for (const b of bldType('bhub')) {
    if (!b.bots) continue;
    for (const bot of b.bots) {
      if (!inView(bot.x, bot.y)) continue;
      const fly = bot.state === 'idle' && dist(bot.x, bot.y, b.x + 1, b.y + 0.6) < 0.1 ? 0 : 0.7 + Math.sin(t * 6 + bot.id) * 0.08;
      G.fillStyle = 'rgba(0,0,0,0.25)'; G.beginPath(); G.ellipse(sx(bot.x), sy(bot.y), VIEW.z * 0.2, VIEW.z * 0.09, 0, 0, 7); G.fill();
      drawUnit3D('golem', bot.x, bot.y - fly, { ang: bot.ang != null ? bot.ang : Math.PI / 2, anim: fly ? 'run' : 'stance', t: t + bot.id, scale: 0.55 });
      if (fly) { G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = 'rgba(90,255,200,0.5)'; G.beginPath(); G.arc(sx(bot.x), sy(bot.y - fly + 0.05), VIEW.z * 0.1, 0, 7); G.fill(); G.restore(); }
      const shown = bot.carry || (bot.extra && Object.keys(bot.extra)[0]);
      if (shown && SPR.item[shown]) drawSprite(SPR.item[shown], bot.x - 0.18, bot.y - fly - 0.95, 0.36, 0.36);
    }
  }
}
