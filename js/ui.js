'use strict';
// Интерфейс: панель строительства, окна, подсказки, управление.

const UI = {
  tool: null, dir: 0, cat: 'golem', craftTab: 'golem', openB: null, openG: null, wins: {}, showPollution: false, dirty: true,
  cursorProblem: null, lastPlace: null, paused: false, mode: null, recordUndo: false, alt: false,
  zoomedIn() { return CAM.zoom >= 24; },
};
const $ = (id) => document.getElementById(id);

// ---------- сообщения ----------
function log(msg, cls) {
  if (typeof MP !== 'undefined' && MP.silent) return;
  const el = document.createElement('div');
  el.className = 'msg ' + (cls || '');
  el.textContent = msg;
  const box = $('log');
  box.appendChild(el);
  while (box.children.length > 7) box.removeChild(box.firstChild);
  setTimeout(() => { el.style.transition = 'opacity .6s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 700); }, cls === 'warn' || cls === 'elf' ? 12000 : 8000);
}
let hintTimer = 0;
function hint(msg) { if (typeof MP !== 'undefined' && MP.silent) return; $('hint').textContent = msg; hintTimer = 2.2; }

// ---------- окна ----------
function openWin(id, title, html, opts) {
  if (typeof MP !== 'undefined' && MP.silent) return null;
  opts = opts || {};
  let w = UI.wins[id];
  if (!w) {
    w = document.createElement('div');
    w.className = 'win';
    w.dataset.win = id;
    w.innerHTML = `<div class="title"><b></b><button data-act="close" data-arg="${id}">✕</button></div><div class="body"></div>`;
    $('windows').appendChild(w);
    UI.wins[id] = w;
    makeDraggable(w);
    if (opts.width) { w.style.width = opts.width + 'px'; w.dataset.w = opts.width; }
    if (opts.pos) { w.style.left = opts.pos[0] + 'px'; w.style.top = opts.pos[1] + 'px'; w.style.transform = 'none'; }
  }
  w.querySelector('.title b').textContent = title;
  w.querySelector('.body').innerHTML = html;
  return w;
}
function setWinBody(id, html) {
  if (typeof MP !== 'undefined' && MP.silent) return;
  const w = UI.wins[id];
  if (!w) return;
  const body = w.querySelector('.body');
  const st = body.scrollTop;
  // прокрутка вложенных списков (например, левая колонка исследований) тоже сохраняется — окно не прыгает наверх
  const inner = [];
  body.querySelectorAll('*').forEach((el, i) => { if (el.scrollTop > 0 || el.scrollLeft > 0) inner.push([el.tagName + '.' + el.className, el.scrollTop, el.scrollLeft]); });
  body.innerHTML = html;
  body.scrollTop = st;
  for (const [k, t, l] of inner) {
    const el = [...body.querySelectorAll('*')].find(e => e.tagName + '.' + e.className === k);
    if (el) { el.scrollTop = t; el.scrollLeft = l; }
  }
  if (w.dataset.fit) fitWin(w);
}
// окно целиком по размеру экрана, без прокрутки: если не влезает — уменьшаем масштабом и сдвигаем в экран
function fitWin(w) {
  if (!w) return;
  w.dataset.fit = '1';
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
  const vw = innerWidth / z - 16, vh = innerHeight / z - 16;
  w.style.maxHeight = 'none'; w.style.maxWidth = 'none'; w.style.width = w.dataset.w ? w.dataset.w + 'px' : 'max-content';
  const body = w.querySelector('.body'); body.style.overflow = 'visible';
  const W = w.offsetWidth, H = w.offsetHeight;
  if (!W || !H) return;
  const k = Math.min(1, vw / W, vh / H);
  w.style.transformOrigin = '0 0';
  w.style.transform = k < 0.999 ? `scale(${k.toFixed(3)})` : 'none';
  const L = parseFloat(w.style.left), T = parseFloat(w.style.top);
  w.style.left = clamp(isNaN(L) ? (vw - W * k) / 2 : L, 8, Math.max(8, vw + 8 - W * k)) + 'px';
  w.style.top = clamp(isNaN(T) ? 60 : T, 8, Math.max(8, vh + 8 - H * k)) + 'px';
}
function closeWin(id) {
  if (typeof MP !== 'undefined' && MP.silent) return;
  const w = UI.wins[id];
  if (!w) return;
  w.remove();
  delete UI.wins[id];
  if (id === 'bld') UI.openB = null;
  if (id === 'golem') UI.openG = null;
  if (id === 'cart') UI.openC = null;
}
function anyWin() { return Object.keys(UI.wins).length > 0; }
function makeDraggable(w) {
  const t = w.querySelector('.title');
  t.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const r = w.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = (ev) => { w.style.left = (ev.clientX - ox) + 'px'; w.style.top = (ev.clientY - oy) + 'px'; w.style.transform = 'none'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
}

// ---------- действия (делегирование) ----------
const ACT = {};
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const f = ACT[el.dataset.act];
  if (!f) return;
  e.preventDefault();
  // в совместной игре гость дублирует действие хозяину; пока оно выполняется у себя, отдельные команды не шлём
  const remote = typeof MP !== 'undefined' && MP.role === 'client' && !MP_LOCAL_ACTS.has(el.dataset.act);
  if (remote) { mpSendAct(el.dataset.act, el.dataset.arg, e); MP.inAct = true; }
  try { f(el.dataset.arg, e, el); } finally { if (remote) MP.inAct = false; }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

ACT.close = (id) => closeWin(id);
ACT.save = () => { saveGame(true); };
ACT.menu = () => toggleMenu();
// ---------- иконка предмета: постройки — картинкой из атласа, остальное — значком ----------
function itemImg(id, size) {
  if (ITEMS[id] && ITEMS[id].bld) return buildIconHtml(id, size || 32);
  return `<img src="${ICON_URL[id]}"${size ? ` style="width:${size}px;height:${size}px"` : ''}>`;
}
function freeBuild() { return !!(S.cheats && S.cheats.free); }

// взять постройку в руку (только если она есть в инвентаре)
function takeInHand(id) {
  if (UI.tool === id) { UI.tool = null; UI.dirty = true; return; }
  if (!isUnlockedBuilding(id)) { hint('Ещё не изучено'); return; }
  UI.tool = id; UI.cat = BUILDINGS[id].cat; UI.mode = null; UI.dirty = true;
  if (S.player.inv.count(id) < 1 && !freeBuild()) hint(`«${BUILDINGS[id].name}» нет в инвентаре — скрафтите (клик по клетке панели или окно крафта C)`);
}
function craftBuilding(id, n) {
  if (!isUnlockedBuilding(id)) { hint('Ещё не изучено'); return false; }
  const ok = queueCraft('b_' + id, n);
  if (ok) hint(`Крафт: ${BUILDINGS[id].name} ×${n}. Недостающие детали скрафтятся сами.`);
  else hint(`Не хватает на «${BUILDINGS[id].name}»: ${lackText(RECIPES['b_' + id].in, n)}`);
  return ok;
}
// чего не хватает (с учётом автокрафта деталей — показываем сырьё)
function lackText(cost, n) {
  const need = {};
  const add = (id, k, d) => {
    const have = Math.max(0, (S.player.inv.count(id) || 0) - (need['_' + id] || 0));
    const sub = d < 5 && have < k && handRecipeFor(id);
    if (sub) { const take = Math.min(have, k); need['_' + id] = (need['_' + id] || 0) + take; const runs = Math.ceil((k - take) / sub.out[id]); for (const j in sub.in) add(j, sub.in[j] * runs, d + 1); }
    else if (have < k) need[id] = (need[id] || 0) + (k - have);
    else need['_' + id] = (need['_' + id] || 0) + k;
  };
  for (const id in cost) add(id, cost[id] * (n || 1), 0);
  return Object.keys(need).filter(k => k[0] !== '_').map(id => `${ITEMS[id].name} ${need[id]}`).join(', ') || '—';
}

// ---------- панель быстрого доступа ----------
// 10 клеток, клавиши 1–0. Закрепить: взять постройку в руку и кликнуть по клетке, или Ctrl+клик в окне крафта.
// ПКМ — снять закрепление. Закреплённая клетка остаётся, даже если предметы кончились.
function renderHotbar() {
  const p = S.player;
  const btn = (act, label, title, on) => `<button data-act="${act}" title="${title}" class="${on ? 'on' : ''}">${label}</button>`;
  const tools = btn('craftwin', '⚒ Крафт <kbd>C</kbd>', 'Инвентарь и крафт', !!UI.wins.inv) + btn('invwin', '🎒 Инвентарь <kbd>E</kbd>', 'Инвентарь и снаряжение', !!UI.wins.inv)
    + btn('researchwin', '📜<kbd>T</kbd>', 'Исследования (T)', !!UI.wins.research) + btn('mapwin', '🗺<kbd>M</kbd>', 'Карта (M)', !!UI.wins.map)
    + `<span class="sep"></span>` + btn('bpCopy', '✂', 'Скопировать группу построек (Ctrl+C)', UI.mode === 'select') + btn('bpPaste', '📋', 'Вставить скопированное (Ctrl+V), R — повернуть', UI.mode === 'paste')
    + btn('deconTool', '🪓', 'Снос: выделите область — строители разберут постройки (повторное выделение снимает пометку)', UI.mode === 'decon')
    + btn('undo', '↶', 'Отменить последнее действие (Ctrl+Z)') + btn('pollution', '☁', 'Карта загрязнения (P)', UI.showPollution) + btn('statswin', '📊<kbd>O</kbd>', 'Производство в минуту (O)', !!UI.wins.stats);
  let slots = '';
  for (let i = 0; i < 10; i++) {
    const id = S.quick[i];
    const n = id ? p.inv.count(id) : 0;
    const cls = ['slot', 'hot', !id ? 'empty' : '', id && UI.tool === id ? 'on' : '', id && n === 0 ? 'zero' : ''].join(' ');
    slots += `<div class="${cls}" data-act="hot" data-arg="${i}" data-tip="h:${i}"><span class="k">${(i + 1) % 10}</span>${id ? itemImg(id, 34) : ''}${id ? `<span class="n">${n || (freeBuild() ? '∞' : '0')}</span>` : ''}</div>`;
  }
  const h = `<div id="hotTools">${tools}</div><div id="hotSlots">${slots}</div>`;
  const el = $('hotbar');
  if (el._h !== h) { el.innerHTML = h; el._h = h; }
  UI.dirty = false;
}
function hotUse(i, e) {
  const id = S.quick[i];
  if (!id) {
    if (UI.tool) { S.quick[i] = UI.tool; sfx('click'); hint(`Закреплено на клетке ${(i + 1) % 10}: ${ITEMS[UI.tool].name}`); }
    else hint('Пустая клетка: возьмите постройку в руку и кликните сюда, или Ctrl+клик по рецепту в окне крафта (C)');
    UI.dirty = true; return;
  }
  const it = ITEMS[id];
  if (it.bld) {
    if (S.player.inv.count(id) > 0 || freeBuild()) takeInHand(id);
    else craftBuilding(id, e && e.shiftKey ? 5 : 1);
  } else if (it.weapon && S.player.guns && S.player.guns.includes(id)) selectGun(S.player.guns.indexOf(id));
  else if (it.weapon || it.armor) { if (S.player.inv.count(id)) equipItem(id); else hint('Нет в инвентаре'); }
  sfx('click'); UI.dirty = true;
}
ACT.hot = (i, e) => {
  if (e.button === 2) { S.quick[+i] = null; UI.dirty = true; sfx('click'); return; }
  hotUse(+i, e);
};
function bindQuick(id) {
  if (S.quick.includes(id)) { hint('Уже на панели'); return; }
  const k = S.quick.indexOf(null);
  if (k < 0) { hint('Панель заполнена — освободите клетку ПКМ'); return; }
  S.quick[k] = id; UI.dirty = true; sfx('click');
  hint(`Закреплено на клетке ${(k + 1) % 10}: ${ITEMS[id].name}`);
}
ACT.statswin = () => { if (UI.wins.stats) closeWin('stats'); else renderStatsWin(); UI.dirty = true; };
ACT.pollution = () => { UI.showPollution = !UI.showPollution; UI.dirty = true; if (UI.showPollution) renderPollutionWin(); else closeWin('pollution'); };
ACT.deconTool = () => { if (UI.mode === 'decon') { UI.mode = null; } else { UI.tool = null; UI.mode = 'decon'; BP.sel = null; hint('Снос: выделите область мышью. Повторное выделение снимает пометку. Esc / ПКМ — выход.'); } UI.dirty = true; };
ACT.craftwin = () => { if (UI.wins.inv) closeWin('inv'); else renderInvWin(); UI.dirty = true; };
ACT.invwin = () => { if (UI.wins.inv) closeWin('inv'); else renderInvWin(); UI.dirty = true; };
ACT.researchwin = () => { if (UI.wins.research) closeWin('research'); else renderResearchWin(); UI.dirty = true; };
ACT.mapwin = () => { showMap(); UI.dirty = true; };

// ---------- подсказки ----------
document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-tip]');
  const tt = $('tooltip');
  if (!el) { tt.classList.add('hidden'); return; }
  const html = tipHtml(el.dataset.tip);
  if (!html) { tt.classList.add('hidden'); return; }
  tt.innerHTML = html;
  tt.classList.remove('hidden');
  placeTip(e);
});
document.addEventListener('mousemove', placeTip);
function placeTip(e) {
  const tt = $('tooltip');
  if (tt.classList.contains('hidden')) return;
  const w = tt.offsetWidth, h = tt.offsetHeight;
  tt.style.left = Math.min(innerWidth - w - 6, e.clientX + 14) + 'px';
  tt.style.top = Math.max(4, Math.min(innerHeight - h - 6, e.clientY - h - 8)) + 'px';
}
function tipHtml(tip) {
  const [kind, id] = tip.split(':');
  if (kind === 'h') {
    const q = S.quick[+id];
    if (!q) return `<h5>Пустая клетка ${(+id + 1) % 10}</h5><div>Возьмите постройку в руку и кликните сюда — она закрепится. Или Ctrl+клик по рецепту в окне крафта (C).</div>`;
    const n = S.player.inv.count(q);
    return tipHtml(ITEMS[q].bld ? 'b:' + q : 'i:' + q) + `<div class="dim" style="margin-top:4px">В инвентаре: ${n}. ${ITEMS[q].bld ? (n ? 'ЛКМ — взять в руку.' : 'ЛКМ — скрафтить 1, Shift — 5.') : ''} ПКМ — открепить.</div>`;
  }
  if (kind === 'b') {
    const b = BUILDINGS[id];
    let extra = '';
    if (b.power) extra += `<div class="dim">Энергия: ${b.power} КМ</div>`;
    if (b.out) extra += `<div class="dim">Выработка: до ${b.out} КМ</div>`;
    const r = RECIPES['b_' + id];
    return `<h5>${b.name}</h5><div>${b.desc || ''}</div>${extra}<div class="cost">Крафт ${r.time} с: ${costHtml(b.cost, S.player.inv)}</div>`;
  }
  if (kind === 'i') {
    const it = ITEMS[id];
    if (it.bld) return tipHtml('b:' + id) + `<div class="dim" style="margin-top:4px">ЛКМ — взять в руку и поставить. Ctrl+ЛКМ — закрепить на панели.</div>`;
    let s = `<h5>${it.name}</h5>`;
    if (it.fuel) s += `<div class="dim">Топливо: ${it.fuel} с</div>`;
    if (it.food) s += `<div class="dim">Еда, качество ${it.food}${FOOD[id] ? `, сытость ${FOOD[id].sat} с` : ''}</div>`;
    if (it.weapon) s += `<div>${weaponStats(id)}. Клик — в слот оружия.</div>`;
    if (it.armor) s += `<div>${armorStats(id)}. Клик — надеть.</div>`;
    if (AMMO[id]) s += `<div>Боеприпас (урон ×${AMMO[id].mul}). Клик — зарядить в подходящее оружие.</div>`;
    if (it.desc) s += `<div>${it.desc}</div>`;
    s += `<div class="dim">Цена: ${itemPrice(id)}${typeof tributeWorthy === 'function' && tributeWorthy(id) ? ' · ценность для дани' : ''}</div>`;
    const src = itemSources(id), use = itemUses(id);
    if (src.length) s += `<div class="dim" style="margin-top:3px"><b>Откуда:</b> ${src.join('; ')}</div>`;
    if (use.length) s += `<div class="dim"><b>Для чего:</b> ${use.join('; ')}</div>`;
    return s;
  }
  if (kind === 'r') {
    const r = RECIPES[id];
    const o = Object.keys(r.out);
    const desc = r.bld && BUILDINGS[r.bld].desc ? `<div>${BUILDINGS[r.bld].desc}</div>` : '';
    const can = canHandCraft(id);
    return `<h5>${o.map(x => ITEMS[x].name).join(', ')}</h5>${desc}<div class="cost">${costHtml(r.in, S.player.inv)} ${r.fin ? Object.keys(r.fin).map(f => iconHtml(f, r.fin[f])).join(' ') : ''} → ${o.map(x => iconHtml(x, r.out[x])).join(' ')}</div>`
      + (can ? '' : `<div class="bad">Не хватает: ${lackText(r.in, 1)}</div>`)
      + `<div><b>Можно скрафтить: ${maxHandCraft(id, 999)}</b> · уже есть: ${S.player.inv.count(o[0])}</div>`
      + `<div class="dim">${r.time} с. Всё сырьё (и на детали) списывается сразу при заказе, отмена возвращает его. ЛКМ — 1, ПКМ — 5, Shift — 10${r.bld ? ', Ctrl — закрепить на панели' : ''}</div>`
      + (r.bld ? '' : ratioHtml(r));
  }
  if (kind === 'm') {
    const r = RECIPES[id];
    const o = Object.keys(r.out);
    return `<h5>${o.map(x => ITEMS[x].name).join(', ')}</h5><div class="cost">${costHtml(r.in)} ${r.fin ? Object.keys(r.fin).map(f => iconHtml(f, r.fin[f])).join(' ') : ''} → ${o.map(x => iconHtml(x, r.out[x])).join(' ')}</div><div class="dim">${r.time} с на цикл</div>` + ratioHtml(r);
  }
  if (kind === 't') {
    const t = TECHS[id];
    return `<h5>${t.name}</h5><div>${techUnlocks(id).join(', ')}</div><div class="cost">${costHtml(t.cost)} × ${t.units}</div><div class="dim">Требует: ${t.req.map(r => TECHS[r].name).join(', ') || '—'}</div>`;
  }
  return '';
}

// ---------- окно «Загрязнение»: откуда берётся, как расходится и чем грозит ----------
function renderPollutionWin() {
  const src = {};
  let total = 0;
  for (const b of S.buildings.values()) { const d = BUILDINGS[b.type]; if (d.pollution && b.active) { src[b.type] = (src[b.type] || 0) + d.pollution * 60; total += d.pollution * 60; } }
  const gol = S.golems.filter(g => g.state === 'work' || g.state === 'down').length * 0.2;
  total += gol;
  const top = Object.keys(src).sort((a, b) => src[b] - src[a]).slice(0, 6);
  const angry = S.camps.filter(c => c.alive && c.polluted).length;
  let h = `<div>Сейчас выбрасывается: <b>${total.toFixed(1)}</b> в минуту. Эволюция врагов: <b>${Math.round((S.evo || 0) * 100)}%</b>. Злых лагерей: <b>${angry}</b>.</div>`;
  h += `<div class="dim" style="margin-top:4px">Как работает: плавильни, буры, кузни, кухни и работающие големы дымят. Дым копится в своём участке карты (16×16 клеток) и каждую секунду понемногу растекается в соседние. Леса его поглощают — чем больше деревьев, тем быстрее чистится воздух.</div>`;
  h += `<div class="dim">Чем грозит: дым, дошедший до лагеря гоблинов или орков (больше 0.35), злит его — когда злость дойдёт до 100%, лагерь шлёт сильную орду. Всё выброшенное за игру ускоряет эволюцию врагов: они крепче и бьют больнее.</div>`;
  h += `<div class="dim">Как снизить: модуль эффективности, Печь вечного пламени (почти не дымит), леса вокруг базы (питомник), не ставить дымные постройки в сторону лагерей.</div>`;
  if (top.length) h += `<h3>Главные источники</h3>` + top.map(id => `<div class="line">${BUILDINGS[id].name}<span style="flex:1"></span>${src[id].toFixed(1)}/мин</div>`).join('') + (gol ? `<div class="line">Големы за работой<span style="flex:1"></span>${gol.toFixed(1)}/мин</div>` : '');
  h += `<div class="dim" style="margin-top:4px">На карте: облако дыма (жёлтое → красное), цифры — дым в участке, над лагерями — их злость.</div>`;
  if (UI.wins.pollution) setWinBody('pollution', h); else openWin('pollution', 'Загрязнение (P)', h, { width: 420, pos: [20, 120] });
}

// ---------- соотношения: сколько машин-поставщиков нужно на одну такую машину ----------
const RAW_ITEMS = new Set(RES.filter(r => r && r.item).map(r => r.item));
function machineOpen(id) { const d = BUILDINGS[id]; return (!d.tech || S.research.done.includes(d.tech)) && (!d.bp || S.blueprints.includes(d.bp)); }
function bestMachine(at) {
  let best = null;
  for (const id in BUILDINGS) {
    const d = BUILDINGS[id];
    if (!d.crafts || !at.includes(d.crafts) || d.crafts === 'drill' || !machineOpen(id)) continue;
    if (!best || (d.speed || 1) > (BUILDINGS[best].speed || 1)) best = id;
  }
  return best;
}
function producerOf(item) {
  let best = null;
  for (const k in RECIPES) { const r = RECIPES[k]; if (r.bld || !r.out[item] || !bestMachine(r.at)) continue; if (!best || Object.keys(r.in).length < Object.keys(best.in).length) best = r; }
  return best;
}
function fmtRate(v) { return v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2); }
function ratioHtml(r) {
  const mid = bestMachine(r.at);
  if (!mid) return '';
  const sp = BUILDINGS[mid].speed || 1, cyc = 60 * sp / r.time;
  const drill = 60 / (BUILDINGS.mdrill.cycle || 1.5);
  const outs = Object.keys(r.out).map(x => `${iconHtml(x)} ${fmtRate(r.out[x] * cyc)}/мин`).join(' ');
  const ins = Object.keys(r.in).map(i => {
    const need = r.in[i] * cyc, pr = producerOf(i);
    let tail = '';
    if (RAW_ITEMS.has(i)) tail = ` — ≈ ${(need / drill).toFixed(2)} мех. бура или ${(need / golemOreRate()).toFixed(1)} голема`;
    else if (pr) { const m2 = bestMachine(pr.at), rate = pr.out[i] * 60 * (BUILDINGS[m2].speed || 1) / pr.time; tail = ` — ≈ ${(need / rate).toFixed(2)} × «${BUILDINGS[m2].name}»`; }
    return `<div class="dim">• ${iconHtml(i)} ${fmtRate(need)}/мин${tail}</div>`;
  }).join('');
  return `<div style="margin-top:4px;color:#c8d0a0">Одна машина «${BUILDINGS[mid].name}» даёт ${outs}. Ей нужно:</div>${ins}`;
}

// ---------- откуда берётся предмет и для чего нужен (для подсказок) ----------
const MACHINE_NAME = { hand: 'руками', workshop: 'мастерская', furnace: 'плавильня', stonecutter: 'каменотёсня', forge: 'кузня', mill: 'дробильня',
  alchemy: 'алхимическая печь', kitchen: 'кухня', berryfarm: 'ягодник', nursery: 'питомник', wheatfield: 'поле', barn: 'скотный двор', drill: 'бур', kiln: 'обжиговая печь' };
function itemSources(id) {
  const out = [];
  for (let r = 1; r < RES.length; r++) if (RES[r] && RES[r].item === id) out.push('добыча: ' + RES[r].name.toLowerCase() + (RES[r].golem ? ' (и големы)' : ''));
  if (id === 'wheat' || id === 'berries') out.push('голем-землепашец');
  const at = new Set();
  for (const rid in RECIPES) { const r = RECIPES[rid]; if (r.out[id] && !r.bld) for (const a of r.at) at.add(MACHINE_NAME[a] || a); }
  if (at.size) out.push('крафт: ' + [...at].join(', '));
  if (id === 'relic') out.push('руины, лагеря орков');
  if (id === 'mithril') out.push('добыча в лагерях, эльфы');
  if (id === 'iron_ore_pure' || id === 'copper_ore_pure') out.push('чистые жилы в залежах дальше 140 клеток от центра (руда с белыми искрами)');
  if (id === 'gem') out.push('лагеря врагов, подземелья, задания и продажа товаров торговцу');
  return out;
}
function itemUses(id) {
  const out = [];
  const it = ITEMS[id];
  if (it.fuel) out.push(`топливо (${it.fuel} с горения)`);
  if (EAT[id]) out.push(`еда героя: клик в инвентаре — +${EAT[id].r} здоровья/с на ${EAT[id].t} с`);
  if (it.food) out.push(`еда для рабочих (качество ${it.food})`);
  if (/^f\d$/.test(id)) out.push('наука: кладите в скрипторий');
  for (const w in WEAPONS) if (WEAPONS[w].ammo === id) out.push('боеприпасы: ' + WEAPONS[w].name);
  for (const b in BUILDINGS) { const wp = BUILDINGS[b].weapon; if (wp && wp.ammo && wp.ammo.includes(id)) out.push('снаряды: ' + BUILDINGS[b].name); }
  const blds = [], items = [];
  for (const rid in RECIPES) {
    const r = RECIPES[rid];
    if (!r.in[id]) continue;
    if (r.bld) blds.push(BUILDINGS[r.bld].name); else for (const o in r.out) items.push(ITEMS[o].name);
  }
  if (items.length) out.push('детали: ' + [...new Set(items)].slice(0, 6).join(', ') + (items.length > 6 ? '…' : ''));
  if (blds.length) out.push('постройки: ' + [...new Set(blds)].slice(0, 6).join(', ') + (blds.length > 6 ? '…' : ''));
  return out;
}

// ---------- инвентарь и крафт ----------
const ITEM_ORDER = Object.keys(ITEMS);
// dim(id) — приглушить клетку (постройка этого не примет)
function invGrid(inv, act, filter, dim) {
  const ids = inv.ids().filter(id => !filter || filter(id)).sort((a, b) => ITEM_ORDER.indexOf(a) - ITEM_ORDER.indexOf(b));
  // по клеткам: каждый стак отдельно и пустые клетки
  if (inv.slots && !filter) {
    let h = '<div class="grid slots">';
    let used = 0;
    for (const id of ids) {
      let left = inv.count(id);
      const st = stackOf(id);
      while (left > 0) {
        const n = Math.min(st, left); left -= n; used++;
        h += `<div class="slot${dim && dim(id) ? ' cant' : ''}" ${act ? `data-act="${act}" data-arg="${id}"` : ''} data-tip="i:${id}">${itemImg(id)}<span class="n">${n}</span></div>`;
      }
    }
    for (let i = used; i < inv.cap; i++) h += '<div class="slot empty"></div>';
    return h + '</div>';
  }
  if (!ids.length) return '<div class="dim">пусто</div>';
  return '<div class="grid">' + ids.map(id => `<div class="slot" ${act ? `data-act="${act}" data-arg="${id}"` : ''} data-tip="i:${id}">${itemImg(id)}<span class="n">${fmtNum(inv.count(id))}</span></div>`).join('') + '</div>';
}

// ---------- окно крафта (C), вкладки ----------
const CRAFT_TABS = [...BUILD_CATS, ['parts', 'Детали'], ['gear', 'Снаряжение']];
function craftTabOf(rid) {
  const r = RECIPES[rid];
  if (r.bld) return BUILDINGS[r.bld].cat;
  const o = ITEMS[Object.keys(r.out)[0]];
  return o.weapon || o.armor || AMMO[rid] || rid === 'steed' ? 'gear' : 'parts';
}
// крафт живёт в окне инвентаря: C и E открывают одно окно
function renderCraftWin() { renderInvWin(); }
function craftHtml() {
  const recipes = Object.keys(RECIPES).filter(id => RECIPES[id].at.includes('hand') && isUnlockedRecipe(id));
  const tabs = CRAFT_TABS.filter(([t]) => recipes.some(id => craftTabOf(id) === t));
  if (!tabs.some(([t]) => t === UI.craftTab)) UI.craftTab = tabs.length ? tabs[0][0] : 'parts';
  let h = `<div class="tabs">${tabs.map(([t, n]) => `<button data-act="craftTab" data-arg="${t}" class="${UI.craftTab === t ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  h += `<div class="grid craft">${recipes.filter(id => craftTabOf(id) === UI.craftTab).map(id => {
    const r = RECIPES[id], o = Object.keys(r.out)[0];
    const mx = maxHandCraft(id, 99), have = S.player.inv.count(o);
    return `<div class="slot big ${mx ? '' : 'cant'}" data-act="craft" data-arg="${id}" data-tip="r:${id}">${itemImg(o, 40)}${r.out[o] > 1 ? `<span class="o">×${r.out[o]}</span>` : ''}${have ? `<span class="n">${fmtNum(have)}</span>` : ''}${mx ? `<span class="mk" title="можно скрафтить">${mx > 98 ? '99+' : mx}</span>` : ''}</div>`;
  }).join('')}</div>`;
  const q = S.player.craft;
  h += `<div class="dim" style="margin-top:8px">Число справа сверху — сколько можно скрафтить, снизу — сколько уже есть. ЛКМ — скрафтить 1, ПКМ — 5, Shift — 10. Сырьё на весь заказ (и на детали) списывается сразу. Недостающие доски, шестерни и прочие детали скрафтятся сами. Ctrl+ЛКМ — закрепить постройку на панели снизу. Готовая постройка попадает в инвентарь — ставьте её с панели или из инвентаря.</div>`;
  if (q.length) h += `<h3>Очередь крафта: ${q.length}</h3><div class="dim">Клик по значку в очереди (слева внизу) — отменить.</div>`;
  return h;
}
ACT.craftTab = (t) => { UI.craftTab = t; renderCraftWin(); sfx('click'); };

// описание оружия и брони для подсказок и энциклопедии
function weaponStats(id) {
  const w = WEAPONS[id];
  let t = `${w.melee ? 'Ближний бой' : 'Оружие'}: урон ${w.dmg}, дальность ${w.range}, удар раз в ${w.cd} с`;
  if (w.aoe) t += `, по площади ${w.aoe}`;
  if (w.leech) t += `, лечит героя на ${Math.round(w.leech * 100)}% урона`;
  if (w.ammo) t += `, боеприпасы: ${w.ammo.map(a => ITEMS[a].name).join(' / ')}`;
  return t;
}
function armorStats(id) {
  const a = ARMORS[id];
  let t = `Броня ${a.armor}, здоровье +${a.hp}`;
  if (a.speed) t += `, скорость ${a.speed > 0 ? '+' : '−'}${Math.round(Math.abs(a.speed) * 100)}%`;
  if (a.regen) t += `, лечение +${a.regen}/с`;
  if (a.magicRes) t += `, магия слабее на ${Math.round(a.magicRes * 100)}%`;
  if (a.thorns) t += `, возвращает ${Math.round(a.thorns * 100)}% урона в ближнем бою`;
  return t;
}
// три слота оружия, под каждым — слот боеприпасов
function gunSlotsHtml(p) {
  ensureGuns(p);
  let h = '<div class="row" style="gap:6px;align-items:flex-start">';
  for (let i = 0; i < 3; i++) {
    const id = p.guns[i], w = id && WEAPONS[id], a = p.ammo[i], on = p.gun === i;
    h += `<div style="text-align:center;width:64px">
      <div class="slot${on ? ' sel' : ''}" data-act="gunSlot" data-arg="${i}" title="${id ? w.name + ' — ЛКМ выбрать, ПКМ снять' : 'Пустой слот: клик по оружию в инвентаре'}" style="${on ? 'outline:2px solid #ff9f40' : ''}">${id ? itemImg(id) : '<span class="dim">' + (i + 1) + '</span>'}</div>
      <div class="slot" data-act="ammoSlot" data-arg="${i}" title="${a ? ITEMS[a.id].name + ' — клик: снять в инвентарь' : w && w.ammo ? 'Боеприпасы: ' + w.ammo.map(x => ITEMS[x].name).join(' / ') : 'Боеприпасы не нужны'}" style="margin-top:2px">${a ? itemImg(a.id) + `<span class="n">${a.n}</span>` : w && w.ammo ? '·' : '—'}</div>
      <div class="dim" style="font-size:11px">${id ? w.name : 'посох'}</div></div>`;
  }
  return h + '</div>';
}
ACT.gunSlot = (i, e) => { i = +i; if (e && e.button === 2) unequip('gun', i); else selectGun(i); renderInvWin(); };
ACT.ammoSlot = (i) => { unequip('ammo', +i); renderInvWin(); };
function renderInvWin() {
  const p = S.player;
  const w = playerAttackMode(p);
  const html = `<div class="invwrap">
    <div>
      <h3>Оружие <span class="dim">(Tab — следующее)</span></h3>
      ${gunSlotsHtml(p)}
      <div class="dim">Сейчас: <b>${w.name}</b> — урон ${w.dmg}, дальность ${w.range}</div>
      <div class="row" style="margin-top:6px">
        <div class="slot" data-act="unequip" data-arg="armor" title="Броня">${p.armor ? itemImg(p.armor) : '👕'}</div>
        <div><b>${p.armor ? ITEMS[p.armor].name : 'Без брони'}</b><div class="dim">${p.armor ? armorStats(p.armor) : 'броня 0'} · здоровье ${Math.round(p.hp)}/${playerMaxHp()}</div></div>
      </div>
      <h3>Статистика</h3>
      <div class="dim">Големов: ${S.golems.length} · построек: ${S.buildings.size} · врагов убито: ${S.stats.kills || 0} · лагерей уничтожено: ${S.stats.camps || 0} · исследований: ${S.research.done.length}/${Object.keys(TECHS).length}</div>
    </div>
    <div>
      <h3>Инвентарь <span class="dim">${p.inv.usedSlots()}/${p.inv.cap} клеток</span></h3>
      ${invGrid(p.inv, 'invClick')}
      <h3>Личная логистика</h3>
      ${logiHtml(p)}
      <div class="dim" style="margin-top:6px">Клик по постройке — взять в руку и поставить. Ctrl+клик — закрепить на панели. Клик по оружию/броне — экипировать, по еде — съесть (+регенерация). При открытой постройке: ЛКМ — положить стак, ПКМ — полстака, Shift+ЛКМ — всё.</div>
    </div>
    <div class="invcraft"><h3>Крафт</h3>${craftHtml()}</div></div>`;
  if (UI.wins.inv) setWinBody('inv', html); else fitWin(openWin('inv', 'Анимансер — инвентарь и крафт (E / C)', html, { pos: [Math.max(10, innerWidth / 2 - 640), 70] }));
}
ACT.craft = (id, e) => {
  const r = RECIPES[id];
  if ((e.ctrlKey || e.metaKey) && r.bld) { bindQuick(r.bld); renderCraftWin(); return; }
  const n = e.shiftKey ? 10 : e.button === 2 ? 5 : 1;
  if (!queueCraft(id, n)) hint('Не хватает: ' + lackText(r.in, n));
  renderCraftWin();
};
// ---------- личная логистика: запросы и корзина ----------
function logiHtml(p) {
  const req = p.requests || {};
  let h = `<div class="dim">Големы-строители (если вы в радиусе Гильдии строителей) сами подвозят запрошенное со складов и уносят содержимое корзины. ПКМ по предмету в инвентаре — в корзину.</div>`;
  h += Object.keys(req).map(id => `<div class="recipe">${iconHtml(id)} держать не меньше <b>${req[id]}</b> <span class="dim">(сейчас ${p.inv.count(id)})</span> <button data-act="reqMeDel" data-arg="${id}">✕</button></div>`).join('');
  h += `<div class="row" style="margin-top:4px"><select id="reqMeItem">${Object.keys(ITEMS).map(id => `<option value="${id}">${ITEMS[id].name}</option>`).join('')}</select><input id="reqMeN" type="number" value="50" min="1" style="width:64px"><button data-act="reqMeAdd">Запросить</button></div>`;
  const tr = p.trash;
  if (tr && tr.n) h += `<div style="margin-top:6px"><b>Корзина</b> (унесут на склад): ${invGrid(tr, 'trashBack')}</div>`;
  return h;
}
ACT.reqMeAdd = () => { const p = S.player; p.requests = p.requests || {}; const id = $('reqMeItem').value, n = Math.max(1, +$('reqMeN').value || 1); p.requests[id] = n; mpCmd({ f: 'reqMe', id, n }); renderInvWin(); };
ACT.reqMeDel = (id) => { const p = S.player; if (p.requests) delete p.requests[id]; mpCmd({ f: 'reqMe', id, n: 0 }); renderInvWin(); };
ACT.trashBack = (id) => { const p = S.player; if (!p.trash) return; const n = p.inv.add(id, p.trash.count(id)); p.trash.remove(id, n); renderInvWin(); };
function toTrash(id) {
  const p = S.player;
  if (!p.trash) p.trash = new Inv(20, true);
  const n = Math.min(p.inv.count(id), stackOf(id), p.trash.space(id));
  if (n > 0) { p.inv.remove(id, n); p.trash.add(id, n); sfx('click'); }
}
// сколько переносить по клику: ЛКМ — стак, ПКМ — полстака, Shift — всё
function clickAmount(id, have, e) {
  if (e && e.shiftKey) return have;
  const st = Math.min(have, stackOf(id));
  return e && e.button === 2 ? Math.max(1, Math.ceil(st / 2)) : st;
}
ACT.invClick = (id, e) => {
  if (UI.openB && S.buildings.has(UI.openB.id) && !(e.ctrlKey || e.metaKey)) {
    const n = playerInsert(UI.openB, id, clickAmount(id, S.player.inv.count(id), e));
    if (n) { sfx('click'); renderBldWin(); if (UI.wins.inv) renderInvWin(); return; }
  }
  if (e && e.button === 2) { toTrash(id); renderInvWin(); return; }
  if ((e.ctrlKey || e.metaKey) && (ITEMS[id].bld || ITEMS[id].weapon)) { bindQuick(id); return; }
  if (ITEMS[id].weapon || ITEMS[id].armor || AMMO[id]) { equipItem(id); renderInvWin(); return; }
  if (EAT[id]) { eatFood(id); renderInvWin(); return; }
  if (ITEMS[id].bld) { takeInHand(id); closeWin('inv'); }
};
ACT.unequip = (slot) => { unequip(slot); renderInvWin(); };
ACT.cancelCraft = (i) => cancelCraft(+i);

// ---------- окно постройки ----------
function openBuilding(b) {
  UI.openB = b;
  closeWin('golem');
  renderBldWin();
  sfx('click');
}
function bar(frac, cls) { return `<div class="prog ${cls || ''}"><div style="width:${Math.round(clamp(frac, 0, 1) * 100)}%"></div></div>`; }

function renderBldWin() {
  const b = UI.openB;
  if (!b || !S.buildings.has(b.id)) { closeWin('bld'); return; }
  const def = BUILDINGS[b.type];
  let h = `<div class="dim">Прочность ${Math.ceil(b.hp)}/${b.maxHp}${b.status ? ' · <b>' + b.status + '</b>' : ''}</div>`;
  if (def.desc) h += `<div class="dim" style="margin:4px 0">${def.desc}</div>`;
  const powerLine = () => {
    if (!def.power) return '';
    const net = NETS[b.net];
    if (def.powerOrFuel && !(b.powerSat > 0)) return `<div>Работает на топливе. Можно подключить вал — тогда топливо не нужно.</div>`;
    if (!net) return `<div class="bad">Нет подключения к валу. Поставьте деревянный вал вплотную.</div>`;
    return `<div>Энергия: ${Math.round((b.powerSat || 0) * 100)}% · сеть ${Math.round(net.demand)}/${Math.round(net.supply)} КМ</div>`;
  };
  switch (def.kind) {
    case 'machine': {
      h += powerLine();
      if (!def.fixed && !def.auto && def.crafts !== 'drill') {
        h += `<h3>Рецепт — выберите</h3><div class="grid">` + machineRecipes(b).map(id => {
          const o = Object.keys(RECIPES[id].out)[0];
          return `<div class="slot ${b.recipe === id ? 'on' : ''}" data-act="setRecipe" data-arg="${id}" data-tip="m:${id}">${itemImg(o)}</div>`;
        }).join('') + '</div>';
      }
      if (b.recipe && RECIPES[b.recipe] && def.crafts !== 'drill') h += recipeLine(RECIPES[b.recipe]);
      if (def.crafts === 'drill') {
        const dr = drillRecipe(b);
        h += dr ? `<div>Добывает: ${Object.keys(dr.out).map(id => iconHtml(id, dr.out[id])).join(' ')} за ${dr.time} с</div>` : `<div class="bad">Под постройкой нет руды</div>`;
      }
      if (Object.keys(b.fluid).length) h += `<div>Жидкости: ${Object.keys(b.fluid).map(f => iconHtml(f, Math.floor(b.fluid[f]))).join(' ')}</div>`;
      if (b.fnets && b.fnets.length) h += `<div class="dim">Подключено к акведуку</div>`;
      if (def.push) { const [ox, oy] = drillOutTile(b), dst = bldAt(ox, oy); h += `<div class="recipe">Выкладывает вперёд (R — повернуть): ${dst ? '<b>' + BUILDINGS[dst.type].name + '</b>' : '<span class="bad">пусто — поставьте там конвейер, сундук или печь</span>'}</div>`; }
      { const bm = beaconMult(b); if (bm > 1) h += `<div class="ok">Маяки усиления: +${Math.round((bm - 1) * 100)}% к скорости</div>`; }
      h += `<div class="mach"><div><h4>Вход</h4>${invGrid(b.inp)}${def.fuel ? `<h4>Топливо</h4>${invGrid(b.fuel)}` : ''}</div>`
        + `<div class="arrowbox">${b.recipe && RECIPES[b.recipe] && RECIPES[b.recipe].out ? Object.keys(RECIPES[b.recipe].out).slice(0, 1).map(o => itemImg(o, 28)).join('') : ''}<div class="parrow"><div style="width:${Math.round(clamp(b.prog, 0, 1) * 100)}%"></div></div><div class="dim">${b.active ? 'работает' : (b.status || 'простаивает')}</div></div>`
        + `<div><h4>Выход</h4>${invGrid(b.out, 'takeOut')}</div></div>`;
      h += modsHtml(b);
      h += workersHtml(b);
      break;
    }
    case 'lab': {
      h += powerLine();
      const cur = S.research.cur;
      h += cur ? `<div>Исследуется: <b>${techName(cur)}</b> (${S.research.units || 0}/${techUnits(cur)})</div>${bar(b.prog, 'blue')}` : `<div class="bad">Исследование не выбрано — нажмите T</div>`;
      h += `<h3>Фолианты</h3>${invGrid(b.inv)}`;
      h += workersHtml(b);
      break;
    }
    case 'chest': case 'barracks': case 'house': {
      const noTake = def.sub === 'input';
      h += `<h3>Содержимое ${b.inv.slots ? b.inv.usedSlots() + '/' + b.inv.cap + ' клеток' : fmtNum(b.inv.n) + '/' + fmtNum(b.inv.cap)}</h3>${invGrid(b.inv, noTake ? null : 'takeOne')}` + (noTake ? `<div class="dim" style="margin-top:6px">Забирать отсюда можно только манипуляторами.</div>` : `<div style="margin-top:6px"><button data-act="takeAll">Забрать всё</button></div>`);
      if (def.sub === 'request') {
        h += `<h3>Запросы горгульям</h3>` + Object.keys(b.req).map(id => `<div class="line row">${iconHtml(id, b.req[id])} <button data-act="reqDel" data-arg="${id}">✕</button></div>`).join('');
        h += `<div class="row"><select id="reqItem">${Object.keys(ITEMS).map(id => `<option value="${id}">${ITEMS[id].name}</option>`).join('')}</select><input id="reqN" type="number" value="50" style="width:60px"><button data-act="reqAdd">Добавить</button></div>`;
      }
      if (def.kind === 'barracks') h += `<div class="dim">Здесь едят орки, работающие ближе всего к этому бараку. Сытость: ягоды 20 с, мясо 25 с, похлёбка 45 с, жаркое 60 с, пирог 90 с. Ускорение орка: ×1.8 на ягодах, ×2.2 похлёбка, ×2.6 жаркое, ×3.0 пироги, +0.15 за каждый разный вид еды (до +0.3). Голодный — ×0.5. Орки — для грубой работы: буры, плавильни, кузня, колесо; в другом месте — половина ускорения.</div>`;
      if (def.sub === 'station') h += stationHtml(b);
      if (def.kind === 'house') h += `<div>Комфорт этого дома: <b>${houseComfortOf(b).toFixed(1)}</b>/10 (нужно 6). Мебель до 2 (+2), одежда до 2 (+1.5), обогреватель с углём (+3).</div>`;
      if (def.sub === 'altar') {
        const d = S.elves.demand, at = altarTotal();
        if (d) {
          const val = d.value || demandValue(d.items);
          h += `<div style="color:#c08cff">Эльфы требуют (до срока ${fmtTime(d.deadline - S.time)}): налог ${costHtml(d.items, at)}${d.order ? ` · или заказ ${costHtml(d.order, at)}` : ''} · или ценности на ${val} (на алтаре на ${valuablesWorth(at)})</div>`;
        } else if (!S.elves.defeated) h += `<div style="color:#c08cff">Посланник придёт через ${fmtTime(S.elves.next - S.time)}.</div>${tributePreviewHtml()}`;
        h += `<div class="dim">Храните здесь ценности. Если к концу срока дань не уплачена, эльфы сами заберут с алтаря налог, заказ или ценности по курсу на ту же сумму (${tributeRatesText()}). Кладите руками, манипулятором или конвейером.</div><div>На алтаре ценностей на <b>${valuablesWorth(at)}</b>.</div>`;
      }
      break;
    }
    case 'belt':
      h += `<div>Предметов: ${b.items.length} (левая полоса ${b.items.filter(i => !i.l).length}, правая ${b.items.filter(i => i.l).length})</div>`;
      if (!b.bg || b.bg.net < 0) h += `<div class="bad">Без энергии ползёт на ${Math.round(BELT_CRAWL * 100)}% скорости. Подведите деревянный вал от бегового колеса (или другого генератора) вплотную к любому конвейеру цепочки — поедет в полную силу.</div>`;
      else h += `<div>Энергия цепочки: ${Math.round((b.bg.powerSat || 0) * 100)}% · конвейеров в цепочке ${b.bg.belts.length}, нужно ${+b.bg.wantPower.toFixed(1)} КМ · сеть ${Math.round(NETS[b.bg.net].demand)}/${Math.round(NETS[b.bg.net].supply)} КМ</div>`;
      if (def.split) h += `<div class="row" style="margin-top:4px">Фильтр: ${b.filter ? iconHtml(b.filter) + ' — только прямо, остальное в стороны' : '<b>нет</b> — всё по очереди'} <select id="vecFilter"><option value="">— без фильтра —</option>${Object.keys(ITEMS).filter(id => !ITEMS[id].bld).map(id => `<option value="${id}" ${b.filter === id ? 'selected' : ''}>${ITEMS[id].name}</option>`).join('')}</select><button data-act="setVecFilter">Задать</button></div>`;
      if (def.under) h += b.pair ? `<div>Вход: выход через ${b.len - 1} клет.</div>` : b.exitOf ? '<div>Выход подземного конвейера</div>' : `<div class="bad">Нет пары: поставьте второй подземный конвейер в том же направлении не дальше ${def.under} клеток впереди.</div>`;
      break;
    case 'shaft':
      if (def.under) h += b.pair ? `<div>Вход подземного вала: выход через ${b.len - 1} клет.</div>` : b.exitOf ? '<div>Выход подземного вала</div>' : `<div class="bad">Нет пары: поставьте второй подземный вал в том же направлении не дальше ${def.under} клеток впереди.</div>`;
      h += b.net >= 0 && NETS[b.net] ? `<div>Сеть: ${Math.round(NETS[b.net].demand)}/${Math.round(NETS[b.net].supply)} КМ</div>` : '<div class="dim">Не подключён к генератору.</div>';
      break;
    case 'vector':
      h += vecFilterHtml(b);
      { const dstB = vecDst(b);
        if (dstB && isBelt(dstB)) h += `<div class="row" style="margin-top:4px">Класть на полосу: ${[[null, 'дальнюю'], ['L', 'левую'], ['R', 'правую']].map(([v, n]) => `<button data-act="vecLane" data-arg="${v || ''}" class="${(b.lane || null) === v ? 'on' : ''}">${n}</button>`).join('')}</div>`; }
      { const src = vecSrcAny(b), dst = vecDstAny(b), nm = (o) => o ? (o.floor ? `пол (${floorCount(o.x, o.y)}/${FLOOR_CAP})` : BUILDINGS[o.type].name) : '<span class="bad">пусто — поставьте сундук, машину или конвейер</span>';
        h += `<div class="recipe"><span style="color:#ffaa3c">Берёт из:</span> ${nm(src)} <b>→</b> <span style="color:#5aff96">кладёт в:</span> ${nm(dst)}</div>`; }
      h += `<div class="row" style="margin-top:4px"><button data-act="vcopy" title="Shift+ПКМ по манипулятору">Копировать настройки</button><button data-act="vpaste" ${UI.vecClip ? '' : 'disabled'} title="Shift+ЛКМ по манипулятору">Вставить</button></div>`;
      h += `<div class="row" style="margin-top:4px">Лимит: класть, пока в цели меньше <input id="vecLimit" type="number" min="0" value="${b.limit || ''}" placeholder="нет" style="width:70px"> шт. <button data-act="setVecLimit">Задать</button></div><div class="dim">Пусто или 0 — без лимита. Удобно, чтобы не забивать печь или башню сверх меры.</div>`;
      h += `<div>В руке: ${b.hand ? iconHtml(b.hand, b.handN > 1 ? b.handN : null) : '—'}</div>` + (def.power ? powerLine() : `<div>Топливо: ${Math.ceil(b.fuel)} с</div><button data-act="fuelVec">Заправить деревом</button>`) + `<div class="dim">Берёт с оранжевой клетки, кладёт на зелёную${def.reach > 1 ? ' (через клетку)' : ''}. R — повернуть.</div>`; break;
    case 'gen': {
      const net = NETS[b.net];
      h += `<div>Мощность: ${Math.round(b.pot || 0)} КМ, нагрузка ${Math.round((b.load || 0) * 100)}%</div>`;
      if (def.fuel) h += `<div>Топливо (${Math.ceil(b.burn)} с): ${invGrid(b.fuel)}</div>`;
      if (def.wind) h += `<div>Ветер: ${Math.round(WIND * 100)}%</div>`;
      if (net) h += `<div class="dim">Сеть: потребление ${Math.round(net.demand)} / выработка ${Math.round(net.supply)} КМ${net.cap ? `, пружины ${Math.round(net.stored)}/${net.cap}` : ''}</div>`;
      if (b.type === 'treadwheel') {
        const orc = workerAt(b.id, 'orc');
        h += orc ? '<div>Колесо крутит орк.</div>' : b.wheelGolem ? `<div class="row">Внутри бежит голем (тратит заряд Анимансера и топливо). <button data-act="wheelOut">Достать</button></div>`
          : `<div class="bad">Колесо пустое: положите мини-голема (клик по нему в инвентаре ниже) — он побежит внутри на топливе. Или посадите орка.</div>`;
        h += workersHtml(b);
      }
      break;
    }
    case 'accum': h += `<div>Запас: ${Math.round(b.stored)}/${def.cap}</div>${bar(b.stored / def.cap, 'green')}`; break;
    case 'tower': h += `<h3>Боеприпасы</h3>${invGrid(b.inv)}<div class="dim">Подходят: ${def.weapon.ammo ? def.weapon.ammo.map(a => ITEMS[a].name).join(', ') : 'не нужны'}</div>`;
      if (def.weapon.ammo) h += `<div class="row" style="margin-top:6px"><button data-act="towerFill">Зарядить из снаряжения</button><button data-act="towerFillAll">Все башни рядом</button></div><div class="dim">Берёт подходящие боеприпасы из инвентаря и из слотов оружия героя (например, болты арбалета).</div>`;
      break;
    case 'pipe': case 'pump': {
      const net = FNETS[b.fnet];
      h += net ? `<div>Сеть: ${net.fluid ? FLUIDS[net.fluid].name : 'пусто'} ${Math.floor(net.amount)}/${net.cap}</div>` : '';
      if (def.power) h += powerLine();
      break;
    }
    case 'beacon': h += powerLine(); h += `<div>Усиливает машин: <b>${[...S.buildings.values()].filter(o => (o.beacons || []).includes(b.id)).length}</b> (по +25% к скорости)</div>`; break;
    case 'csite': {
      if (S.colossus) h += `<div class="ok">Великий Голем пробуждён!</div>`;
      else {
        h += `<div>Сборка колосса: <b>${Math.round(colossusProgress(b) * 100)}%</b></div>${bar(colossusProgress(b), 'blue')}`;
        for (const id in COLOSSUS_NEED) { const n = Math.min(COLOSSUS_NEED[id], b.inv.count(id)); h += `<div class="row">${iconHtml(id)} ${ITEMS[id].name}: <b>${n}/${COLOSSUS_NEED[id]}</b></div>${bar(n / COLOSSUS_NEED[id], n >= COLOSSUS_NEED[id] ? 'green' : 'blue')}`; }
        h += `<div class="dim">Каркас, конечности и сердце — мастерская или сборочный цех, броня — алхимическая лаборатория. Подвозите векторами, носильщиками или вручную.</div>`;
      }
      break;
    }
    case 'bhub': {
      const R2 = BUILDER.radius * BUILDER.radius, cx = b.x + 1, cy = b.y + 1;
      const gh = S.ghosts.filter(g => dist2(g.x, g.y, cx, cy) <= R2).length, dc = [...S.buildings.values()].filter(o => o.decon && dist2(o.x, o.y, cx, cy) <= R2).length;
      h += `<div>Строителей: <b>${b.inv.count('builder')}</b> (заняты: ${b.bots.filter(o => o.state !== 'idle').length}). В радиусе ${BUILDER.radius}: призраков ${gh}, на снос ${dc}.</div>`;
      h += `<div class="dim">Ставьте постройки, которых нет в инвентаре, — появятся призраки. Строители возьмут постройку из сундука-склада, личного сундука, станции или прямо у вас. 🪓 на панели — пометить на снос.</div>`;
      break;
    }
    case 'nest': h += `<div>Горгулий: ${b.spiders.length} (занято ${b.spiders.filter(s => s.state !== 'idle').length})</div><div class="dim">Кладите в гнездо «Горгулья-паук» из инвентаря (клик по ней ниже).</div>`; break;
  }
  // инвентарь героя под постройкой, по стакам: ЛКМ — стак, ПКМ — полстака, Shift — всё
  if (INV_KINDS.has(def.kind)) {
    const acc = new Set(S.player.inv.ids().filter(id => acceptCount(b, id) > 0));
    h += `<h3>Ваш инвентарь <span class="dim">ЛКМ — положить стак, ПКМ — полстака, Shift — всё</span></h3>${invGrid(S.player.inv, 'put', null, id => !acc.has(id))}`;
  }
  if (b.hp < b.maxHp) h += `<div class="row" style="margin-top:6px"><button data-act="repairB" ${S.player.inv.count('repair') ? '' : 'disabled'}>🔧 Починить (ремкомплектов: ${S.player.inv.count('repair')})</button></div>`;
  h += `<div style="margin-top:8px" class="row"><button data-act="deconstruct" class="danger">Разобрать (ПКМ)</button>${(def.kind === 'vector' || def.kind === 'belt' || def.rotates) ? '<button data-act="rotateB">Повернуть (R)</button>' : ''}</div>`;
  if (UI.wins.bld) { UI.wins.bld.querySelector('.title b').textContent = def.name; setWinBody('bld', h); }
  // ширина — под сетку из 10 ячеек, чтобы сундук и инвентарь были видны целиком, без прокрутки
  else fitWin(openWin('bld', def.name, h, { width: 490, pos: [innerWidth - 510, 70] }));
}

function recipeLine(r) {
  const names = Object.keys(r.out).map(x => ITEMS[x].name).join(', ');
  return `<div class="recipe sel"><b>${names}</b>: ${costHtml(r.in)} ${r.fin ? Object.keys(r.fin).map(f => iconHtml(f, r.fin[f])).join(' ') : ''} → ${Object.keys(r.out).map(x => iconHtml(x, r.out[x])).join(' ')} <span class="dim">${r.time}с</span></div>` + ratioHtml(r);
}

function modsHtml(b) {
  if (!b.mods) return '';
  const can = S.research.done.includes('modules');
  if (!can && !b.mods.length) return '';
  let h = `<h3>Модули (${b.mods.length}/2)</h3><div class="row">`;
  h += b.mods.map((m, i) => `<div class="slot" data-act="modOut" data-arg="${i}" data-tip="i:${m}">${itemImg(m)}</div>`).join('');
  if (b.mods.length < 2) for (const m of ['mod_speed', 'mod_eff']) if (S.player.inv.count(m)) h += `<button data-act="modIn" data-arg="${m}">+ ${ITEMS[m].name}</button>`;
  return h + '</div>';
}
function workersHtml(b) {
  if (!canHostWorker(b)) return '';
  const orc = workerAt(b.id, 'orc'), hum = workerAt(b.id, 'human');
  const freeOrc = S.workers.find(w => w.kind === 'orc' && !w.at && w.shackled);
  const freeHum = S.workers.find(w => w.kind === 'human' && !w.at);
  if (!orc && !hum && !freeOrc && !freeHum) return '';
  let h = '<h3>Рабочие</h3><div class="dim">В машине работает один рабочий. Орки — грубая работа (буры, плавильни, кузня, колесо), люди — точная (мастерская, алхимия, кухня, скрипторий); не по профилю — половина ускорения.</div>';
  const fit = (w) => workerFits(w, b) ? '' : ' <span class="warn">не по профилю</span>';
  if (orc) h += `<div class="row">Орк ${orc.name}: ×${workerMult(b).toFixed(2)}${fit(orc)} ${orc.fed ? `<span class="dim">(ел: ${(orc.diet || []).map(id => ITEMS[id].name.toLowerCase()).join(', ')})</span>` : '<span class="bad">голодает</span>'} <button data-act="unassign" data-arg="${orc.id}">Снять</button></div>`;
  if (hum) h += `<div class="row">Управляющий ${hum.name}: ${hum.happy ? `<span class="ok">×${workerMult(b).toFixed(2)}</span>${fit(hum)}` : '<span class="bad">бастует</span>'} <button data-act="unassign" data-arg="${hum.id}">Снять</button></div>`;
  if (!orc && !hum) {
    if (freeOrc) h += `<button data-act="assign" data-arg="${freeOrc.id}">Поставить орка ${freeOrc.name}</button> `;
    if (freeHum) h += `<button data-act="assign" data-arg="${freeHum.id}">Поставить управляющего ${freeHum.name}</button>`;
  }
  return h;
}

ACT.setRecipe = (id) => { const b = UI.openB; if (!b) return; if (b.recipe !== id) { S.player.inv.addAll(b.inp.c); b.inp = new Inv(200); b.crafting = false; b.prog = 0; b.curRecipe = null; } b.recipe = id; renderBldWin(); sfx('click'); };
ACT.takeOut = (id, e) => { const b = UI.openB; if (!b) return; const n = S.player.inv.add(id, clickAmount(id, b.out.count(id), e)); b.out.remove(id, n); renderBldWin(); if (UI.wins.inv) renderInvWin(); };
ACT.takeOne = (id, e) => { const b = UI.openB; if (!b || BUILDINGS[b.type].sub === 'input') return; const n = S.player.inv.add(id, clickAmount(id, b.inv.count(id), e)); b.inv.remove(id, n); renderBldWin(); if (UI.wins.inv) renderInvWin(); };
ACT.takeAll = () => { const b = UI.openB; if (!b || BUILDINGS[b.type].sub === 'input') return; playerTakeAll(b); renderBldWin(); sfx('click'); };
const INV_KINDS = new Set(['chest', 'machine', 'lab', 'gen', 'tower', 'barracks', 'house', 'nest', 'bhub', 'csite']);
ACT.put = (id, e) => {
  const b = UI.openB; if (!b) return;
  if (acceptCount(b, id) <= 0) { hint(`${BUILDINGS[b.type].name} не принимает «${ITEMS[id].name}»`); return; }
  playerInsert(b, id, clickAmount(id, S.player.inv.count(id), e)); renderBldWin(); if (UI.wins.inv) renderInvWin(); sfx('click');
};
ACT.deconstruct = () => { if (UI.openB) deconstruct(UI.openB); };
ACT.repairB = () => { const b = UI.openB; if (!b) return; while (b.hp < b.maxHp && repairBuilding(b)); renderBldWin(); };
ACT.setVecLimit = () => { const b = UI.openB; if (!b) return; b.limit = Math.max(0, Math.floor(+$('vecLimit').value || 0)) || null; mpCmd({ f: 'vecLimit', id: b.id, v: b.limit }); renderBldWin(); };
// фильтр манипулятора: до 5 предметов, «только эти» или «кроме этих»; клик по пустой ячейке — выбрать предмет из сетки
function vecFilterHtml(b) {
  const f = vecFilters(b) || [], mode = b.filterMode === 'deny' ? 'deny' : 'allow';
  let h = `<h3>Фильтр</h3><div class="row" style="gap:4px;align-items:center">`;
  for (let i = 0; i < 5; i++) {
    const id = f[i];
    h += `<div class="slot${UI.vecPick === i ? ' sel' : ''}" data-act="vecSlot" data-arg="${i}" title="${id ? ITEMS[id].name + ' — клик: убрать' : 'Пусто — клик: выбрать предмет'}">${id ? itemImg(id) : '<span class="dim">+</span>'}</div>`;
  }
  h += `<button data-act="vecMode" class="${mode === 'allow' ? 'on' : ''}" data-arg="allow">только эти</button><button data-act="vecMode" class="${mode === 'deny' ? 'on' : ''}" data-arg="deny">кроме этих</button></div>`;
  h += `<div class="dim">${f.length ? (mode === 'allow' ? 'Переносит только выбранное.' : 'Переносит всё, кроме выбранного.') : 'Фильтр пуст — переносит любые предметы.'}</div>`;
  if (UI.vecPick != null) {
    const q = (UI.vecQ || '').toLowerCase();
    const ids = Object.keys(ITEMS).filter(id => !q || ITEMS[id].name.toLowerCase().includes(q));
    // сперва то, что есть рядом: в инвентаре, в источнике и цели
    const near = new Set(Object.keys(S.player.inv.c));
    for (const o of [vecSrc(b), vecDst(b)]) if (o) for (const k of ['inv', 'inp', 'out']) if (o[k]) for (const id in o[k].c) near.add(id);
    ids.sort((a, c) => (near.has(c) ? 1 : 0) - (near.has(a) ? 1 : 0));
    h += `<div class="row" style="margin:4px 0"><input id="vecQ" placeholder="поиск предмета" value="${UI.vecQ || ''}" style="width:160px"><button data-act="vecFind">Найти</button><button data-act="vecSlotCancel">Отмена</button></div>`;
    h += `<div class="grid" style="max-height:180px;overflow-y:auto">${ids.slice(0, 200).map(id => `<div class="slot" data-act="vecPickItem" data-arg="${id}" data-tip="i:${id}">${itemImg(id)}</div>`).join('')}</div>`;
  }
  return h;
}
function vecSetFilters(b, filters, mode) {
  b.filters = filters.slice(0, 5); b.filter = null; b.filterMode = mode || b.filterMode || 'allow';
  mpCmd({ f: 'vecSet', id: b.id, filters: b.filters, mode: b.filterMode, lane: b.lane || null });
}
ACT.vecSlot = (i) => {
  const b = UI.openB; if (!b) return; i = +i;
  const f = (vecFilters(b) || []).slice();
  if (f[i]) { f.splice(i, 1); vecSetFilters(b, f); UI.vecPick = null; }
  else UI.vecPick = UI.vecPick === i ? null : i;
  renderBldWin();
};
ACT.vecPickItem = (id) => { const b = UI.openB; if (!b) return; const f = (vecFilters(b) || []).filter(x => x !== id); f.push(id); vecSetFilters(b, f); UI.vecPick = null; renderBldWin(); };
ACT.vecSlotCancel = () => { UI.vecPick = null; renderBldWin(); };
ACT.vecFind = () => { UI.vecQ = ($('vecQ') && $('vecQ').value) || ''; renderBldWin(); };
ACT.vecMode = (m) => { const b = UI.openB; if (!b) return; vecSetFilters(b, vecFilters(b) || [], m); renderBldWin(); };
ACT.vecLane = (v) => { const b = UI.openB; if (!b) return; b.lane = v || null; vecSetFilters(b, vecFilters(b) || []); renderBldWin(); };
// копирование настроек манипулятора: фильтр (до 5 предметов и режим), полоса конвейера, лимит
function vecSettings(b) { return { filters: (vecFilters(b) || []).slice(), mode: b.filterMode || 'allow', lane: b.lane || null, limit: b.limit || null }; }
function setVecSettings(b, st) {
  if (!st) return;
  b.lane = st.lane || null; b.limit = st.limit || null;
  vecSetFilters(b, st.filters || [], st.mode);
  mpCmd({ f: 'vecLimit', id: b.id, v: b.limit });
}
ACT.vcopy = () => { const b = UI.openB; if (!b) return; UI.vecClip = vecSettings(b); hint('Настройки манипулятора скопированы. Shift+ЛКМ по другому манипулятору — вставить'); renderBldWin(); };
ACT.vpaste = () => { const b = UI.openB; if (!b || !UI.vecClip) return; setVecSettings(b, UI.vecClip); hint('Настройки вставлены'); renderBldWin(); };
ACT.setVecFilter = () => { const b = UI.openB; if (!b) return; b.filter = $('vecFilter').value || null; mpCmd({ f: 'vecFilter', id: b.id, v: b.filter }); renderBldWin(); };
ACT.rotateB = () => { const b = UI.openB; if (b) { rotateBuilding(b, 1); renderBldWin(); } };
// ручная заправка — до запаса на 10 минут, не больше
const FUEL_MAX = 600;
ACT.fuelVec = () => { const b = UI.openB; if (!b) return; if (b.fuel >= FUEL_MAX) { hint('Топливом заправлен до отказа'); return; } const f = ['wood', 'plank', 'coal'].find(id => S.player.inv.count(id)); if (!f) { hint('Нет дерева'); return; } S.player.inv.remove(f, 1); b.fuel = Math.min(FUEL_MAX, b.fuel + ITEMS[f].fuel * 3); renderBldWin(); };
ACT.modIn = (m) => { const b = UI.openB || UI.openG; if (!b || b.mods.length >= 2) return; if (S.player.inv.remove(m, 1)) b.mods.push(m); UI.openB ? renderBldWin() : renderGolemWin(); };
ACT.modOut = (i) => { const b = UI.openB || UI.openG; if (!b) return; const m = b.mods.splice(+i, 1)[0]; if (m) S.player.inv.add(m, 1); UI.openB ? renderBldWin() : renderGolemWin(); };
ACT.assign = (wid) => { const w = S.workers.find(x => x.id === +wid); if (w && UI.openB) assignWorker(w, UI.openB); renderBldWin(); };
ACT.unassign = (wid) => { const w = S.workers.find(x => x.id === +wid); if (w) w.at = null; if (UI.openB) renderBldWin(); if (UI.wins.workers) renderWorkersWin(); };
ACT.reqAdd = () => { const b = UI.openB; if (!b) return; const id = $('reqItem').value, n = Math.max(1, +$('reqN').value || 1); b.req[id] = n; mpCmd({ f: 'req', id: b.id, item: id, n }); renderBldWin(); };
ACT.reqDel = (id) => { const b = UI.openB; if (!b) return; delete b.req[id]; mpCmd({ f: 'req', id: b.id, item: id, n: 0 }); renderBldWin(); };

// ---------- голем ----------
function openGolem(g) { UI.openG = g; closeWin('bld'); renderGolemWin(); sfx('click'); }
function renderGolemWin() {
  const g = UI.openG;
  if (!g || !S.golems.includes(g)) { closeWin('golem'); return; }
  const fuelCls = g.fuel <= 0 ? 'bad' : g.fuel < GOLEM.fuelLow ? 'warn' : '';
  let h = `<div>Сейчас: <b>${golemStatus(g)}</b></div><div>Прочность: ${Math.ceil(g.hp == null ? golemMaxHp(g) : g.hp)}/${golemMaxHp(g)}${g.core ? ` · <b style="color:rgb(${GOLEM_CORES[g.core].col})">${GOLEM_CORES[g.core].name}</b>` : ''}</div>`;
  h += `<div class="${fuelCls}">Топливо: ${Math.ceil(g.fuel)} с из ${GOLEM.fuelFull}${g.fuel <= 0 ? ' — кончилось, голем еле двигается' : g.fuel < GOLEM.fuelLow ? ' — мало' : ''}</div>${bar(g.fuel / GOLEM.fuelFull, 'green')}`;
  h += `<div>Несёт: ${g.carry ? iconHtml(g.carry, g.n) : '—'} (${g.n}/${g.type === 'fueler' ? FUELER.cap : golemCap(g)})</div>`;
  if (g.state === 'work') h += `<div>Добыча: ${bar(g.work)}</div>`;
  if (g.type === 'porter') {
    const { srcs, dsts } = porterLists(g), nm = list => list.length ? list.map(b => BUILDINGS[b.type].name).join(', ') : '—';
    const item = g.filter && g.filter !== 'any' ? g.filter : null;
    h += `<h3>Что носить</h3><div class="row">${item ? iconHtml(item) + ' <b>' + ITEMS[item].name + '</b>' : g.filter === 'any' ? '<b>любой предмет</b> <span class="dim">(старая настройка — выберите один предмет поиском ниже)</span>' : '<span class="bad">не выбрано</span>'}</div>`;
    h += `<div class="row" style="margin:4px 0"><input id="porterQ" placeholder="поиск предмета по названию" value="${UI.porterQ || ''}" style="width:200px"><button data-act="porterFind">Найти</button></div>`;
    if (UI.porterQ) {
      const q = UI.porterQ.toLowerCase(), ids = Object.keys(ITEMS).filter(id => !ITEMS[id].bld && ITEMS[id].name.toLowerCase().includes(q)).slice(0, 40);
      h += ids.length ? `<div class="grid">${ids.map(id => `<div class="slot" data-act="porterSetItem" data-arg="${id}" data-tip="i:${id}">${itemImg(id)}</div>`).join('')}</div>` : '<div class="dim">Ничего не найдено</div>';
    }
    h += `<h3>Маршрут</h3><div class="row">Откуда (${srcs.length}): <b>${nm(srcs)}</b> <button data-act="porterPick" data-arg="src" class="${UI.porterPick === 'src' ? 'primary' : ''}">${UI.porterPick === 'src' ? 'Готово' : 'Выбрать'}</button></div>`;
    h += `<div class="row">Куда (${dsts.length}): <b>${nm(dsts)}</b> <button data-act="porterPick" data-arg="dst" class="${UI.porterPick === 'dst' ? 'primary' : ''}">${UI.porterPick === 'dst' ? 'Готово' : 'Выбрать'}</button></div>`;
    h += `<div class="dim">Нажмите «Выбрать» и кликайте по сундукам и машинам — каждый клик добавляет или убирает здание (до ${PORTER.range} клеток от места создания голема). Берёт из ближайшего источника, где предмет есть, несёт в ближайшую цель, где есть место. На карте: оранжевые рамки — откуда, зелёные — куда.</div>`;
  }
  if (g.type === 'fueler') {
    const own = golemChests(g);
    h += `<div class="dim">Берёт дрова и уголь ${own ? `только из привязанных сундуков (${own.length})` : 'из дровяника или сундука-склада'} и разносит их големам и деревянным векторам ${g.zone ? `в своей зоне ${g.zone.x1 - g.zone.x0 + 1}×${g.zone.y1 - g.zone.y0 + 1} клеток — за её пределы не ходит` : `в радиусе ${FUELER.radius} клеток от места создания`}. Скорость ×${golemMult(g).toFixed(2)}.</div>`;
    h += `<div class="row">Зона: <b>${g.zone ? 'прямоугольник' : 'круг'}</b> <button data-act="zonePick" class="${UI.zonePick ? 'primary' : ''}">${UI.zonePick ? 'тяните рамку на карте…' : 'Выделить прямоугольником'}</button>${g.zone ? '<button data-act="zoneClear">Круг</button>' : ''}</div><div class="dim">Можно выделить хоть всю базу (до ${FUELER_ZONE}×${FUELER_ZONE}).</div>`;
    h += `<div class="row">Сундуки с топливом: <b>${own ? own.length + ' привязано' : 'любые рядом'}</b> <button data-act="chestPick" class="${UI.chestPick ? 'primary' : ''}">${UI.chestPick ? 'Готово' : 'Привязать'}</button>${own ? '<button data-act="chestClear">Сбросить</button>' : ''}</div>`;
  }
  else if (g.type !== 'porter') {
    const own = golemChests(g);
    h += `<div class="dim">Работает ${g.zone ? `в зоне ${g.zone.x1 - g.zone.x0 + 1}×${g.zone.y1 - g.zone.y0 + 1} клеток` : `в радиусе ${GOLEM.radius} клеток от места создания`} и носит добычу ${own ? `только в привязанные сундуки (${own.length})` : `в ближайший сундук в радиусе ${GOLEM.chestRadius}`}. Скорость ×${golemMult(g).toFixed(2)}.</div>`;
    h += `<div class="row">Сундуки: <b>${own ? own.length + ' привязано' : 'любые рядом'}</b> <button data-act="chestPick" class="${UI.chestPick ? 'primary' : ''}">${UI.chestPick ? 'Готово' : 'Привязать'}</button>${own ? '<button data-act="chestClear">Сбросить</button>' : ''}</div>`;
    h += `<div class="dim">Сам голем не заправляется: топливо ему приносит голем-заправщик, или дайте дерево вручную. Без топлива голем еле двигается.</div>`;
  }
  if (g.type === 'farmer') {
    h += `<h3>Что сеять</h3><div class="row">${[['wheat', 'Пшеница'], ['berries', 'Ягоды']].map(([v, n]) => `<button data-act="gfilter" data-arg="${v}" class="${g.filter === v ? 'primary' : ''}">${n}</button>`).join('')}</div>`;
    const R = FARM.radius; let plots = 0, ripe = 0;
    for (const k in S.crops) { const [x, y] = k.split(',').map(Number); if (dist2(x + 0.5, y + 0.5, g.hx, g.hy) <= R * R + 1) { plots++; if (cropRipe(k)) ripe++; } }
    h += `<div class="dim">Грядок: ${plots}/${FARM.plots}, спелых: ${ripe}. Урожай созревает за ${Math.round(cropTime())} с.</div>`;
  }
  if (g.type === 'miner') {
    const opts = [['any', 'Всё подряд'], [RES_ID.stone, 'Камень'], [RES_ID.iron, 'Железная руда'], [RES_ID.copper, 'Медная руда'], [RES_ID.coal, 'Уголь'], [RES_ID.sulfur, 'Сера'], [RES_ID.gold, 'Золотая руда'], [RES_ID.mithril, 'Мифриловая руда'], [RES_ID.sand, 'Песок']];
    h += `<h3>Что добывать</h3><div class="grid">${opts.map(([v, n]) => `<button data-act="gfilter" data-arg="${v}" class="${String(g.filter) === String(v) ? 'primary' : ''}">${n}</button>`).join('')}</div>`;
  }
  h += modsHtml(g);
  h += golemUpgradeHtml(g);
  h += `<div class="row" style="margin-top:6px"><button data-act="gcopy" title="Shift+ПКМ по голему">Копировать настройки</button><button data-act="gpaste" ${UI.golemClip && UI.golemClip.type === g.type ? '' : 'disabled'} title="Shift+ЛКМ по голему">Вставить${UI.golemClip ? ' (' + BUILDINGS[UI.golemClip.type].name.replace('Голем-', '') + ')' : ''}</button></div>`;
  h += `<div class="row" style="margin-top:8px"><button data-act="gfuel">Дать дерево</button><button data-act="gpick" class="danger">Забрать голема (ПКМ)</button></div>`;
  if (UI.wins.golem) setWinBody('golem', h); else fitWin(openWin('golem', BUILDINGS[g.type].name, h, { width: 380, pos: [innerWidth - 400, 70] }));
}
ACT.wheelOut = () => { const b = UI.openB; if (!b || !b.wheelGolem) return; b.wheelGolem = false; netsDirty = true; S.player.inv.add('minigolem', 1); renderBldWin(); };
ACT.chestPick = () => { UI.chestPick = !UI.chestPick; hint(UI.chestPick ? 'Кликайте по сундукам — добавить или убрать из привязки' : 'Привязка готова'); renderGolemWin(); };
ACT.chestClear = () => { const g = UI.openG; if (!g) return; g.chests = []; UI.chestPick = false; release(g); g.state = 'seek'; renderGolemWin(); };
ACT.porterPick = (k) => { UI.porterPick = UI.porterPick === k ? null : k; if (UI.porterPick) hint('Кликайте по зданиям: ' + (k === 'src' ? 'откуда брать' : 'куда нести') + ' (повторный клик — убрать)'); renderGolemWin(); };
ACT.porterFind = () => { UI.porterQ = ($('porterQ') && $('porterQ').value) || ''; renderGolemWin(); };
ACT.porterSetItem = (id) => { const g = UI.openG; if (!g) return; const st = golemSettings(g); st.filter = id; setGolemSettings(g, st); UI.porterQ = ''; renderGolemWin(); };
ACT.gfilter = (v) => { const g = UI.openG; if (!g) return; g.filter = v; release(g); g.state = 'seek'; g.wait = 0; renderGolemWin(); };
ACT.gfuel = () => { const g = UI.openG; if (!g) return; if (g.fuel >= FUEL_MAX) { hint('Голем заправлен до отказа'); return; } const k = Math.min(5, Math.ceil((FUEL_MAX - g.fuel) / ITEMS.wood.fuel)), n = S.player.inv.remove('wood', k); g.fuel = Math.min(FUEL_MAX, g.fuel + n * ITEMS.wood.fuel); if (!n) hint('Нет дерева'); renderGolemWin(); };

// понятное описание того, чем занят голем
function golemStatus(g) {
  switch (g.state) {
    case 'work': return g.self ? '🪓 рубит дерево себе на топливо' : (g.type === 'lumber' ? '🪓 рубит дерево' : '⛏ добывает ' + (RES[resAt(g.tx, g.ty)] ? RES[resAt(g.tx, g.ty)].name.toLowerCase() : ''));
    case 'walk': return g.self ? '🚶 идёт рубить дерево себе на топливо' : '🚶 идёт к ресурсу';
    case 'fetch': return '🔥 идёт к сундуку за топливом';
    case 'tofuel': return '🔥 несёт топливо голему';
    case 'pfrom': case 'pto': return '📦 ' + (g.status || 'носит груз');
    case 'flee': return '🛡 ' + (g.status || 'прячется от врагов');
    case 'return': return g.status && g.status.startsWith('нет') ? '⚠ ' + g.status : '📦 несёт добычу в сундук';
    default: return g.status ? (g.status.startsWith('нет') ? '⚠ ' : '') + g.status : 'ищет работу';
  }
}
ACT.gpick = () => { if (UI.openG) pickupGolem(UI.openG); };
// зона работы прямоугольником: кнопка в окне голема, потом рамка мышью по миру
ACT.zonePick = () => { UI.zonePick = !UI.zonePick; UI.zoneSel = null; hint(UI.zonePick ? `Зажмите ЛКМ и протяните рамку — это будет зона работы голема (до ${UI.openG && UI.openG.type === 'fueler' ? FUELER_ZONE + '×' + FUELER_ZONE + ', отдалите камеру колесом' : '48×48'})` : 'Выбор зоны отменён'); renderGolemWin(); };
ACT.zoneClear = () => { const g = UI.openG; if (!g) return; setGolemSettings(g, Object.assign(golemSettings(g), { zone: null })); renderGolemWin(); };
function finishZone() {
  const g = UI.openG, z = UI.zoneSel;
  UI.zoneSel = null; UI.zonePick = false;
  if (!g || !z) return;
  const x0 = Math.floor(Math.min(z.x0, z.x1)), x1 = Math.floor(Math.max(z.x0, z.x1)), y0 = Math.floor(Math.min(z.y0, z.y1)), y1 = Math.floor(Math.max(z.y0, z.y1));
  const lim = g.type === 'fueler' ? FUELER_ZONE : 48;
  if (x1 - x0 >= lim || y1 - y0 >= lim) { hint(`Слишком большая зона: не больше ${lim}×${lim}`); renderGolemWin(); return; }
  setGolemSettings(g, Object.assign(golemSettings(g), { zone: { x0, y0, x1, y1 } }));
  hint(`Зона голема: ${x1 - x0 + 1}×${y1 - y0 + 1}`); renderGolemWin();
}
// заправщику можно отдать всю базу целиком
const FUELER_ZONE = 160;
// копирование настроек голема: что добывать, зона, привязанные сундуки, маршрут носильщика
function golemSettings(g) { if (g.type === 'porter') porterLists(g); return { type: g.type, filter: g.filter, zone: g.zone ? Object.assign({}, g.zone) : null, chests: (g.chests || []).slice(), psrcs: (g.psrcs || []).slice(), pdsts: (g.pdsts || []).slice() }; }
function setGolemSettings(g, st) {
  if (!st || st.type !== g.type) return false;
  g.filter = st.filter; g.zone = st.zone && g.type === 'fueler' ? Object.assign({}, st.zone) : null; g.chests = (st.chests || []).slice();
  if (g.type === 'porter') { g.psrcs = (st.psrcs || (st.psrc != null ? [st.psrc] : [])).slice(); g.pdsts = (st.pdsts || (st.pdst != null ? [st.pdst] : [])).slice(); g.psrc = g.pdst = null; g.state = g.n > 0 ? 'pto' : 'pfrom'; }
  else { release(g); g.state = 'seek'; g.wait = 0; }
  mpCmd({ f: 'gset', id: g.id, st });
  return true;
}
ACT.gcopy = () => { const g = UI.openG; if (!g) return; UI.golemClip = golemSettings(g); hint('Настройки скопированы: ' + BUILDINGS[g.type].name + '. Shift+ЛКМ по другому такому голему — вставить'); renderGolemWin(); };
ACT.gpaste = () => { const g = UI.openG; if (!g || !UI.golemClip) return; if (setGolemSettings(g, UI.golemClip)) hint('Настройки вставлены'); else hint('Настройки от другого вида голема'); renderGolemWin(); };

// ---------- исследования ----------
// Окно исследований: слева карточки с картинками (доступно / позже / изучено), справа — подробности выбранного:
// что откроет (с картинками), стоимость, что нужно изучить до и к чему ведёт, кнопка «Исследовать».
const BONUS_ICON = { speed: '🏃', reach: '🖐', mining: '⛏', hp: '❤', golem: '⚙', research: '📜', bag: '🎒', prod: '⛏', machine: '⚙' };
function techUnlockList(id, size) {
  size = size || 32;
  const out = [];
  for (const b in BUILDINGS) if (BUILDINGS[b].tech === id && !BUILDINGS[b].hidden) out.push({ icon: buildIconHtml(b, size), name: BUILDINGS[b].name, tip: 'b:' + b });
  for (const r in RECIPES) if (RECIPES[r].tech === id && !RECIPES[r].bld) { const o = Object.keys(RECIPES[r].out)[0]; if (o && !out.some(u => u.tip === 'i:' + o)) out.push({ icon: itemImg(o, size), name: ITEMS[o].name, tip: 'i:' + o }); }
  return out;
}
function techIcon(id, size) {
  const u = techUnlockList(id, size)[0], t = TECHS[id];
  if (u) return u.icon;
  const bk = t.bonus ? Object.keys(t.bonus)[0] : t.bonusPer ? Object.keys(t.bonusPer)[0] : null;
  const em = t.spell ? (t.spell === 'meteor' ? '☄' : '🌋') : bk ? BONUS_ICON[bk] || '✦' : '✦';
  return `<span class="temoji" style="font-size:${Math.round(size * 0.7)}px">${em}</span>`;
}
function techState(id) {
  const R = S.research;
  if (R.cur === id) return 'cur';
  if (R.done.includes(id) && !TECHS[id].infinite) return 'done';
  return techAvailable(id) ? 'avail' : 'locked';
}
function renderResearchWin() {
  const R = S.research, cur = R.cur;
  if (!UI.techSel || !TECHS[UI.techSel]) UI.techSel = cur || Object.keys(TECHS).find(techAvailable) || Object.keys(TECHS)[0];
  const ids = Object.keys(TECHS);
  const tile = (id) => {
    const st = techState(id), p = R.progress[id] ? R.progress[id] / techUnits(id) : 0;
    return `<div class="ttile ${st}${UI.techSel === id ? ' sel' : ''}" data-act="techSel" data-arg="${id}" title="${techName(id)}">
      <div class="ti">${techIcon(id, 40)}</div><div class="tn">${techName(id)}${TECHS[id].infinite ? ' ∞' : ''}</div>
      ${st === 'cur' || p > 0 ? `<div class="tp"><div style="width:${Math.round((st === 'cur' ? (R.units || 0) / techUnits(id) : p) * 100)}%"></div></div>` : ''}
      ${st === 'done' ? '<div class="tok">✔</div>' : st === 'locked' ? '<div class="tlock">🔒</div>' : ''}</div>`;
  };
  const group = (title, list) => list.length ? `<h3>${title} <span class="dim">${list.length}</span></h3><div class="ttiles">${list.map(tile).join('')}</div>` : '';
  let left = '';
  if (cur) left += group('Изучается', [cur]);
  left += group('Доступно', ids.filter(id => techState(id) === 'avail'));
  left += group('Позже', ids.filter(id => techState(id) === 'locked'));
  left += group('Изучено', ids.filter(id => techState(id) === 'done'));
  // подробности выбранного
  const id = UI.techSel, t = TECHS[id], st = techState(id);
  let d = `<div class="thead"><div class="ti big">${techIcon(id, 56)}</div><div><div class="tname">${techName(id)}${t.infinite ? ' ∞' : ''}</div>
    <div class="dim">${st === 'done' ? '<span class="ok">Изучено</span>' : st === 'cur' ? '<span class="ok">Изучается сейчас</span>' : st === 'avail' ? 'Можно исследовать' : '<span class="bad">Сначала изучите нужное ниже</span>'}</div></div></div>`;
  if (t.desc) d += `<div class="tdesc">${t.desc}</div>`;
  const un = techUnlockList(id), extra = techUnlocks(id).filter(n => !un.some(u => u.name === n));
  if (un.length || extra.length) {
    d += `<h4>Откроет</h4><div class="tunl">${un.map(u => `<div class="tu" data-tip="${u.tip}">${u.icon}<span>${u.name}</span></div>`).join('')}</div>`;
    if (extra.length) d += extra.map(x => `<div class="line">✦ ${x}</div>`).join('');
  }
  if (t.bonusPer) d += `<div class="line">✦ ${t.desc || ''}</div>`;
  const n = techUnits(id), done = st === 'cur' ? (R.units || 0) : (R.progress[id] || 0);
  d += `<h4>Стоимость</h4><div class="line">${costHtml(t.cost)} × <b>${n}</b> <span class="dim">· ${t.time} с на единицу в скриптории</span></div>`;
  if (done) d += `<div>${done}/${n}</div>${bar(done / n, 'blue')}`;
  if (t.req.length) d += `<h4>Требует</h4><div class="treq">${t.req.map(r => `<span class="tr ${R.done.includes(r) ? 'ok' : 'bad'}" data-act="techSel" data-arg="${r}">${techIcon(r, 20)} ${TECHS[r].name}</span>`).join('')}</div>`;
  const next = ids.filter(x => TECHS[x].req.includes(id));
  if (next.length) d += `<h4>Ведёт к</h4><div class="treq">${next.map(r => `<span class="tr" data-act="techSel" data-arg="${r}">${techIcon(r, 20)} ${TECHS[r].name}</span>`).join('')}</div>`;
  d += `<div style="margin-top:10px">${st === 'avail' ? `<button class="primary" data-act="research" data-arg="${id}">▶ Исследовать</button>` : st === 'cur' ? '<button disabled>Изучается…</button>' : st === 'done' ? '<button disabled>Изучено</button>' : '<button disabled>Недоступно</button>'}</div>`;
  d += researchSpeedHtml();
  if (!cur) d += `<div class="bad" style="margin-top:6px">Ничего не изучается — выберите исследование. Скриптории поглощают фолианты.</div>`;
  const h = `<div class="rwrap"><div class="rleft">${left}</div><div class="rright">${d}</div></div>`;
  if (UI.wins.research) setWinBody('research', h); else openWin('research', 'Исследования (T)', h, { width: 1000, pos: [Math.max(10, innerWidth / 2 - 500), 60] });
}
// скорость исследований и откуда прибавки (Скоропись I/II, руна скорописи от торговца, точная механика)
function researchSpeedHtml() {
  const parts = [];
  for (const id of S.research.done) { const t = TECHS[id]; if (t && t.bonus && t.bonus.research) parts.push(`${t.name} +${Math.round(t.bonus.research * 100)}%`); }
  for (const id of S.blueprints) { const bp = BLUEPRINTS[id]; if (bp && bp.bonus && bp.bonus.research) parts.push(`${bp.name.replace(/\s*\(.*\)$/, '')} +${Math.round(bp.bonus.research * 100)}%`); }
  const r = S.bonus.research || 0, m = S.bonus.machine || 0;
  if (m) parts.push(`Точная механика +${Math.round(m * 100)}%`);
  const tot = Math.round(((1 + r) * (1 + m) - 1) * 100);
  return `<div class="line" style="margin-top:8px">📜 Скорость исследований: <b class="${tot ? 'ok' : ''}">+${tot}%</b>${parts.length ? ' <span class="dim">(' + parts.join(', ') + ')</span>' : ' <span class="dim">(нет прибавок)</span>'}</div>`;
}
// пополнить башню боеприпасами героя: сначала из инвентаря, потом из слотов боеприпасов оружия
function towerRefill(b) {
  const def = BUILDINGS[b.type], p = S.player;
  if (!def.weapon || !def.weapon.ammo) return 0;
  let moved = 0;
  for (const id of def.weapon.ammo) {
    let want = acceptCount(b, id);
    if (want <= 0) continue;
    const fromInv = Math.min(want, p.inv.count(id));
    if (fromInv) { const n = insertInto(b, id, fromInv); p.inv.remove(id, n); moved += n; want -= n; }
    ensureGuns(p);
    for (let i = 0; i < 3 && want > 0; i++) {
      const a = p.ammo[i];
      if (!a || a.id !== id || a.n <= 0) continue;
      const n = insertInto(b, id, Math.min(want, a.n));
      a.n -= n; moved += n; want -= n;
      if (a.n <= 0) p.ammo[i] = null;
    }
  }
  return moved;
}
ACT.towerFill = () => { const b = UI.openB; if (!b) return; const n = towerRefill(b); hint(n ? `В башню: ${n} боеприпасов` : 'Нет подходящих боеприпасов (или башня полна)'); renderBldWin(); if (UI.wins.inv) renderInvWin(); };
ACT.towerFillAll = () => {
  const p = S.player; let n = 0, k = 0;
  for (const b of bldKind('tower')) if (dist(b.x + b.w / 2, b.y + b.h / 2, p.x, p.y) <= 12) { const m = towerRefill(b); if (m) { n += m; k++; } }
  hint(n ? `Заряжено башен: ${k}, боеприпасов: ${n}` : 'Нет подходящих боеприпасов или башни рядом полны'); renderBldWin();
};
ACT.research = (id) => { setResearch(id); renderResearchWin(); sfx('click'); };
ACT.techSel = (id) => { UI.techSel = id; renderResearchWin(); };

// ---------- рабочие ----------
function renderWorkersWin() {
  let h = '';
  if (!S.workers.length) h += '<div class="dim">Рабочих пока нет. Орков-рабов можно захватить в лагерях орков или купить у торговца. Людей спасают из клеток в крепостях орков.</div>';
  for (const w of S.workers) {
    const b = w.at ? S.buildings.get(w.at) : null;
    let st = b ? `в «${BUILDINGS[b.type].name}»` : 'свободен';
    if (w.kind === 'orc') st += w.at ? (w.fed ? ` · сыт (×${orcEff(w).toFixed(2)})` : ' · <span class="bad">голодает</span>') : '';
    else st += w.at ? (w.happy ? ' · <span class="ok">доволен</span>' : ' · <span class="bad">бастует</span>') : '';
    h += `<div class="worker"><div><b>${w.kind === 'orc' ? 'Орк' : 'Человек'} ${w.name}</b><div class="dim">${st}</div></div><div>`;
    if (w.kind === 'orc' && !w.shackled) h += `<button data-act="shackle" data-arg="${w.id}">Надеть кандалы (${S.player.inv.count('shackles')})</button>`;
    if (w.at) h += `<button data-act="unassign" data-arg="${w.id}">Снять</button>`;
    h += '</div></div>';
  }
  h += `<div class="dim" style="margin-top:8px">Назначить рабочего — откройте нужную постройку (машину, скрипторий, беговое колесо) и нажмите «Поставить». Орки работают в 2–3 раза быстрее, но едят из барака. Люди дают ×2.5, но им нужны дом с комфортом ≥ 6 и отборная еда.</div>`;
  if (UI.wins.workers) setWinBody('workers', h); else openWin('workers', 'Рабочие (Y)', h, { width: 480 });
}
ACT.shackle = (wid) => { const w = S.workers.find(x => x.id === +wid); if (w) shackle(w); renderWorkersWin(); };

// ---------- эльфы ----------
function openElfWin() { renderElfWin(); }
function renderElfWin() {
  const e = S.elves;
  let h = '';
  if (e.defeated) h += '<div class="ok">Господство Тёмных Эльфов свергнуто. Континент свободен.</div>';
  else if (e.final) h += '<div class="bad">Идёт Великий штурм! Убейте Владыку Тёмных Эльфов.</div>';
  else if (e.demand) {
    const left = e.demand.deadline - S.time;
    const both = stockTotal();
    const can = both.has(e.demand.items), canO = e.demand.order && both.has(e.demand.order);
    h += `<p>«Жалкий механик. Твои шестерни скрипят на нашей земле. Выбирай, чем платить, — или мы придём.»</p>`;
    h += `<div class="worker"><div><b>Налог</b> — ${Math.round(tributeShare() * 100)}% фолиантов, сделанных с прошлой дани:<div>${costHtml(e.demand.items, both)}</div></div><button class="primary" data-act="payTribute" ${can ? '' : 'disabled'}>Заплатить</button></div>`;
    if (e.demand.order) h += `<div class="worker"><div><b>Заказ</b> — партия того, что вы производите (не дешевле налога):<div>${costHtml(e.demand.order, both)}</div></div><button class="primary" data-act="payOrder" ${canO ? '' : 'disabled'}>Отдать</button></div>`;
    const val = e.demand.value || demandValue(e.demand.items), vp = valuablesPlan(both, val);
    h += `<div class="worker"><div><b>Ценностями по курсу</b> — самоцветы, мифрил, реликвии на сумму <b>${val}</b> <span class="dim">(${tributeRatesText()}; у вас на ${valuablesWorth(both)})</span>${vp ? `<div>Возьмут: ${costHtml(vp)}</div>` : ''}</div><button class="primary" data-act="payValuables" ${vp ? '' : 'disabled'}>Отдать</button></div>`;
    h += `<div>Осталось: <b>${fmtTime(left)}</b>. Платить можно из любых сундуков и инвентаря. Если к сроку на Алтаре дани лежит налог, заказ или ценности на эту сумму — эльфы заберут сами. Следующий посланник придёт через 20 минут после этого, как бы рано вы ни заплатили — тянуть до последнего незачем.</div>`;
    h += `<div class="bad" style="margin-top:4px">Не заплатите — карательный отряд разнесёт базу, а ставка дани навсегда вырастет на 5%. Отбитый налёт ничего не даёт.</div>`;
  } else {
    h += `<div>Следующее требование дани через <b>${fmtTime(e.next - S.time)}</b>.</div>${tributePreviewHtml()}<div class="dim">Уплачено раз: ${e.paid}, отказов: ${e.refusals}.</div>`;
  }
  if (!e.defeated && !e.final) {
    if (S.research.done.includes('overthrow')) h += `<div style="margin-top:10px"><button class="danger" data-act="finalWar">⚔ Отказаться от дани навсегда — Великий штурм</button></div>`;
    else h += `<div class="dim" style="margin-top:10px">Владыку эльфов по-настоящему ранит только Великий Голем (исследование «Великий Голем», Площадка колосса: 100 каркасов, 80 конечностей, 80 рунических бронь и 20 сердец). Чтобы свергнуть эльфов, изучите «Ритуал свержения» и подготовьте оборону: маги эльфов бьют на 14 клеток — дальше башен лучников. Нужны требушеты, огонь и заклинания.</div>`;
  }
  if (UI.wins.elf) setWinBody('elf', h); else openWin('elf', 'Тёмные Эльфы', h, { width: 460 });
}
ACT.payTribute = () => { if (S.elves.demand && payFromSources(S.elves.demand.items, true)) tributePaid(false); };
ACT.payOrder = () => { const d = S.elves.demand; if (d && d.order && payFromSources(d.order, true)) tributePaid(false); };
ACT.payValuables = () => { const d = S.elves.demand; if (!d) return; const vp = valuablesPlan(stockTotal(), d.value || demandValue(d.items)); if (vp && payFromSources(vp, true)) tributePaid(false); };
// что эльфы попросят в следующий раз, если ничего не изменится (для окна эльфов и алтаря)
// курс: цены самых ходовых ценностей
function tributeRatesText() {
  return VALUABLES.filter(id => ITEMS[id]).map(id => `${ITEMS[id].name.toLowerCase()} ${itemPrice(id)}`).join(', ');
}
function tributePreviewHtml() {
  const it = makeDemand(), val = demandValue(it);
  return `<div style="margin-top:4px">Если бы пришли сейчас: налог ${costHtml(it)} — или ценностями на ${val} (фолианты, самоцветы, мифрил, реликвии, ценные ресурсы — по курсу). Налог — ${Math.round(tributeShare() * 100)}% фолиантов, сделанных с прошлой дани; нет фолиантов — самые ценные ресурсы со складов.</div>`;
}
ACT.refuseTribute = () => { if (confirm('Отказаться платить? Эльфы пришлют карательный отряд.')) refuseTribute(); };
ACT.finalWar = () => { if (confirm('Начать Великий штурм? Пути назад не будет.')) startFinalWar(); };
ACT.elfwin = () => renderElfWin();

// ---------- торговец ----------
function renderMerchantWin() {
  const m = S.merchant;
  if (!m) { closeWin('merchant'); return; }
  let h = `<p class="dim">Лицо скрыто капюшоном. Голос звучит отовсюду сразу: «Самоцветы, мифрил и древности, механик. Золото копай себе сам.» Самоцветы не добываются — их дают лагеря, подземелья, задания и продажа товаров. Уйдёт через ${fmtTime(m.until - S.time)}.</p>`;
  m.offers.forEach((o, i) => {
    const can = S.player.inv.has(o.price);
    h += `<div class="worker"><div><b>${o.name}</b>${o.q ? `<div class="dim">${o.q.desc}. Награда: ${costHtml(o.q.reward)}. Срок 20 минут.</div>` : ''}${o.give ? `<div>${costHtml(o.give)}</div>` : ''}</div><div class="row">${costHtml(o.price, S.player.inv)} ${o.sold ? '<span class="dim">' + (o.kind === 'sell' ? 'продано' : 'куплено') + '</span>' : `<button data-act="buy" data-arg="${i}" ${can ? '' : 'disabled'}>${o.kind === 'quest' ? 'Взять' : o.kind === 'sell' ? 'Продать' : 'Купить'}</button>`}</div></div>`;
  });
  h += `<div class="dim" style="margin-top:8px">Напасть можно, как на любого врага: клик по торговцу. Он очень силён, зато при нём самоцветы, реликвии и мифрил. Торговать — ПКМ по нему.</div>`;
  if (UI.wins.merchant) setWinBody('merchant', h); else openWin('merchant', 'Торговец в чёрной мантии', h, { width: 520 });
}
ACT.buy = (i) => buyOffer(+i);
ACT.attackMerchant = () => { if (confirm('Напасть на торговца? Говорят, это очень плохая идея…')) attackMerchant(); };
ACT.deliver = (id) => deliverQuest(+id);

// ---------- меню, справка, карта ----------
function toggleMenu() {
  if (UI.wins.menu) { closeWin('menu'); return; }
  const h = `<div class="col">
    <button data-act="close" data-arg="menu">Продолжить</button>
    <button data-act="save">Сохранить (F5)</button>
    <button data-act="export">Сохранить в файл</button>
    <button data-act="import">Загрузить из файла</button>
    <button data-act="settings">⚙ Настройки</button>
    <button data-act="sound">Звук: ${SOUND_ON ? 'вкл' : 'выкл'}</button>
    <button data-act="help">Справка (H)</button>
    <button data-act="encwin">📖 Энциклопедия (J)</button>
    <button data-act="achwin">🏆 Достижения</button>
    <button data-act="cheats">Чит-меню (Ё)</button>${SETTINGS.admin ? '<button data-act="adminwin">🛠 Админ-меню (F9)</button>' : ''}
    <button data-act="mp" class="primary">🌐 Играть вместе с другом</button>
    <button data-act="newgame" class="danger">Новая игра</button></div>`;
  openWin('menu', 'Меню', h, { width: 280 });
}
// ---------- энциклопедия (J) ----------
const ENC = { tab: 'items', sel: null, q: '' };
const ENEMY_DESC = {
  goblin: 'Мелкий и быстрый. Нападает толпой, ломает постройки.', ram: 'Осадный таран: идёт прямо к воротам, по стенам бьёт вдвое сильнее. Героя не замечает.', catapult: 'Осадная катапульта: останавливается в 8,5 клетки и бросает камни через стены по площади — башни лучников (11) её достают, баллиста (14) — издалека.', cave_troll: 'Хозяин подземелья. Огромный, бьёт по площади. За победу — богатая добыча.', goblin_chief: 'Крупный вожак в набегах после 30% эволюции: крепкий и злой.', orc_berserk: 'Огромный орк в набегах после 50% эволюции: быстрый, бронированный, бьёт очень больно.', goblin_archer: 'Стреляет из лука издалека.', orc_brute: 'Крепкий рубака, бьёт больно.',
  orc_thrower: 'Метает топоры через стены.', orc_shaman: 'Лечит сородичей и бьёт магией.', elf_blade: 'Быстрый тёмный мечник в броне.',
  elf_mage: 'Магическая артиллерия: бьёт по площади на 14 клеток — дальше башен лучников.', elf_lord: 'Владыка Тёмных Эльфов. Победите его, чтобы освободить континент.',
};
function encList() {
  const q = ENC.q.toLowerCase();
  const ok = (name) => !q || name.toLowerCase().includes(q);
  if (ENC.tab === 'items') return Object.keys(ITEMS).filter(id => !ITEMS[id].bld && ok(ITEMS[id].name)).map(id => [id, ITEMS[id].name, itemImg(id, 22)]);
  if (ENC.tab === 'blds') return Object.keys(BUILDINGS).filter(id => !BUILDINGS[id].hidden && ok(BUILDINGS[id].name)).map(id => [id, BUILDINGS[id].name, buildIconHtml(id, 22)]);
  if (ENC.tab === 'enemies') return Object.keys(ENEMIES).filter(id => ok(ENEMIES[id].name)).map(id => [id, ENEMIES[id].name, unitIconHtml(id, 22)]);
  return Object.keys(TECHS).filter(id => ok(TECHS[id].name)).map(id => [id, TECHS[id].name, S.research.done.includes(id) ? '✔' : '📜']);
}
function encRecipesFor(id) {
  return Object.keys(RECIPES).filter(r => RECIPES[r].out[id] && !RECIPES[r].bld).map(r => {
    const R = RECIPES[r];
    return `<div class="recipe">${costHtml(R.in)} ${R.fin ? Object.keys(R.fin).map(f => iconHtml(f, R.fin[f])).join(' ') : ''} → ${Object.keys(R.out).map(o => iconHtml(o, R.out[o])).join(' ')} <span class="dim">${R.time} с · ${R.at.map(a => MACHINE_NAME[a] || a).join(', ')}${R.tech ? ' · нужно: ' + TECHS[R.tech].name : ''}</span></div>`;
  }).join('');
}
function encDetail() {
  const id = ENC.sel;
  if (!id) return '<div class="dim">Выберите строку слева.</div>';
  if (ENC.tab === 'items') {
    const it = ITEMS[id];
    if (!it) return '';
    let h = `<h3>${itemImg(id, 32)} ${it.name}</h3>`;
    if (it.desc) h += `<p>${it.desc}</p>`;
    const src = itemSources(id), use = itemUses(id);
    if (src.length) h += `<div><b>Откуда:</b> ${src.join('; ')}</div>`;
    if (use.length) h += `<div><b>Для чего:</b> ${use.join('; ')}</div>`;
    const rc = encRecipesFor(id);
    if (rc) h += `<h4>Рецепты</h4>${rc}`;
    if (it.weapon) h += `<div>${weaponStats(id)}</div>`;
    if (it.armor) h += `<div>${armorStats(id)}</div>`;
    return h;
  }
  if (ENC.tab === 'blds') {
    const b = BUILDINGS[id];
    let h = `<h3>${buildIconHtml(id, 40)} ${b.name}</h3><p>${b.desc || ''}</p>`;
    h += `<div><b>Крафт:</b> ${costHtml(b.cost)} <span class="dim">(${RECIPES['b_' + id].time} с, руками или в мастерской)</span></div>`;
    h += `<div><b>Размер:</b> ${b.size[0]}×${b.size[1]}, прочность ${b.hp}${b.power ? ', энергия ' + b.power + ' КМ' : ''}${b.out ? ', выработка до ' + b.out + ' КМ' : ''}${b.fuel ? ', нужно топливо' : ''}</div>`;
    h += `<div><b>Открывается:</b> ${b.bp ? 'чертёж у торговца' : b.tech ? 'исследование «' + TECHS[b.tech].name + '»' : 'сразу'}</div>`;
    if (b.crafts && !b.fixed) h += `<h4>Что делает</h4><div class="grid">${Object.keys(RECIPES).filter(r => RECIPES[r].at.includes(b.crafts) && !RECIPES[r].bld).map(r => iconHtml(Object.keys(RECIPES[r].out)[0])).join(' ')}</div>`;
    return h;
  }
  if (ENC.tab === 'enemies') {
    const e = ENEMIES[id];
    return `<h3>${unitIconHtml(id, 48)} ${e.name}</h3><p>${ENEMY_DESC[id] || ''}</p><div>Здоровье ${e.hp}, урон ${e.dmg}, броня ${e.armor}, скорость ${e.speed}, дальность ${e.range}${e.aoe ? ', по площади' : ''}</div>`;
  }
  const t = TECHS[id];
  return `<h3>${t.name}</h3>${t.desc ? `<p>${t.desc}</p>` : ''}<div><b>Стоимость:</b> ${costHtml(t.cost)} × ${t.units}</div><div><b>Требует:</b> ${t.req.map(r => TECHS[r].name).join(', ') || '—'}</div><div><b>Открывает:</b> ${techUnlocks(id).join(', ') || '—'}</div><div>${S.research.done.includes(id) ? '<span class="ok">Изучено</span>' : techAvailable(id) ? 'Можно изучать (T)' : '<span class="dim">Пока недоступно</span>'}</div>`;
}
function renderEncWin() {
  const tabs = [['items', 'Предметы'], ['blds', 'Постройки'], ['enemies', 'Враги'], ['techs', 'Исследования']];
  const list = encList();
  const h = `<div class="tabs">${tabs.map(([k, n]) => `<button data-act="encTab" data-arg="${k}" class="${ENC.tab === k ? 'on' : ''}">${n}</button>`).join('')}
    <input id="encQ" placeholder="поиск…" value="${ENC.q}" style="margin-left:8px;width:160px"></div>
    <div class="row" style="align-items:flex-start;gap:12px">
      <div class="enclist">${list.map(([id, n, ic]) => `<div class="encrow ${ENC.sel === id ? 'on' : ''}" data-act="encSel" data-arg="${id}">${ic} ${n}</div>`).join('')}</div>
      <div class="encdet">${encDetail()}</div></div>`;
  if (UI.wins.enc) setWinBody('enc', h); else openWin('enc', 'Энциклопедия (J)', h, { width: 820 });
  const q = $('encQ');
  if (q && !q._b) { q._b = true; q.addEventListener('input', () => { ENC.q = q.value; const pos = q.selectionStart; renderEncWin(); const q2 = $('encQ'); q2.focus(); q2.setSelectionRange(pos, pos); }); }
}
ACT.encTab = (k) => { ENC.tab = k; ENC.sel = null; renderEncWin(); };
ACT.encSel = (id) => { ENC.sel = id; renderEncWin(); };
ACT.encwin = () => { if (UI.wins.enc) closeWin('enc'); else renderEncWin(); };

// ---------- настройки ----------
function renderSettingsWin() {
  const pct = (v) => Math.round(v * 100) + '%';
  const h = `<div class="list">
    <div class="line"><b>Музыка</b><span><input type="range" min="0" max="1" step="0.05" value="${SETTINGS.music}" data-set="music"> <span id="setv_music">${pct(SETTINGS.music)}</span></span></div>
    <div class="line"><b>Звуки</b><span><input type="range" min="0" max="1" step="0.05" value="${SETTINGS.sfx}" data-set="sfx"> <span id="setv_sfx">${pct(SETTINGS.sfx)}</span></span></div>
    <div class="line"><b>Масштаб интерфейса</b><span><select data-set="ui">${[0.8, 0.9, 1, 1.1, 1.25, 1.4].map(v => `<option value="${v}" ${SETTINGS.ui == v ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></span></div>
    <div class="line"><b>Качество графики</b><span><select data-set-s="quality">${[['high', 'высокое (родное разрешение)'], ['medium', 'среднее'], ['low', 'низкое (быстрее всего)']].map(([v, n]) => `<option value="${v}" ${SETTINGS.quality === v ? 'selected' : ''}>${n}</option>`).join('')}</select></span></div>
    <div class="line"><b>Облака</b><span><select data-set="clouds"><option value="1" ${SETTINGS.clouds !== 0 ? 'selected' : ''}>плывут над картой</option><option value="0" ${SETTINGS.clouds === 0 ? 'selected' : ''}>выключены</option></select></span></div>
    <div class="line"><b>Автокачество</b><span><select data-set="autoQ"><option value="1" ${SETTINGS.autoQ !== 0 ? 'selected' : ''}>снижать само, если тормозит</option><option value="0" ${SETTINGS.autoQ === 0 ? 'selected' : ''}>не менять</option></select></span></div>
    <div class="line"><b>Счётчик кадров</b><span><select data-set="fps"><option value="0" ${!SETTINGS.fps ? 'selected' : ''}>скрыт</option><option value="1" ${SETTINGS.fps ? 'selected' : ''}>показывать</option></select></span></div>
    <div class="line"><b>Админ-режим</b><span><select data-set="admin"><option value="0" ${!SETTINGS.admin ? 'selected' : ''}>выключен</option><option value="1" ${SETTINGS.admin ? 'selected' : ''}>включён — Админ-меню в меню Esc и на F9</option></select></span></div>
    <div class="line"><b>Автосохранение</b><span><select data-set="autosave">${[[60, 'каждую минуту'], [120, 'каждые 2 минуты'], [300, 'каждые 5 минут'], [600, 'каждые 10 минут']].map(([v, n]) => `<option value="${v}" ${SETTINGS.autosave == v ? 'selected' : ''}>${n}</option>`).join('')}</select></span></div>
  </div>
  <div class="row" style="margin-top:10px"><button data-act="resetTut">Начать обучение заново</button><button data-act="sound">Звук: ${SOUND_ON ? 'вкл' : 'выкл'}</button></div>
  <div class="dim" style="margin-top:8px">Настройки хранятся в браузере и действуют во всех сохранениях.</div>`;
  if (UI.wins.settings) setWinBody('settings', h); else openWin('settings', 'Настройки', h, { width: 480 });
}
ACT.settings = () => renderSettingsWin();
ACT.unpause = () => { UI.paused = false; };
ACT.resetTut = () => { S.tutorial = { step: 0, hidden: false }; log('Обучение начато заново', 'good'); };
const onSetting = (e) => {
  const ks = e.target.dataset && e.target.dataset.setS;
  if (ks) { SETTINGS[ks] = e.target.value; saveSettings(); return; }
  const k = e.target.dataset && e.target.dataset.set;
  if (!k) return;
  SETTINGS[k] = +e.target.value;
  const lbl = $('setv_' + k); if (lbl) lbl.textContent = Math.round(SETTINGS[k] * 100) + '%';
  saveSettings();
};
document.addEventListener('input', onSetting);
document.addEventListener('change', onSetting);
ACT.export = () => exportSave();
ACT.import = () => $('fileInput').click();
ACT.sound = () => { SOUND_ON = !SOUND_ON; if (UI.wins.menu) { closeWin('menu'); toggleMenu(); } if (UI.wins.settings) renderSettingsWin(); };
ACT.newgame = () => { if (confirm('Начать новую игру? Текущий прогресс в автосохранении будет перезаписан.')) { localStorage.removeItem(SAVE_KEY); location.reload(); } };
ACT.help = () => showHelp();

function showHelp() {
  const h = `<div class="list">
  <div class="line"><b>WASD</b><span>ходьба</span></div>
  <div class="line"><b>ЛКМ (зажать)</b><span>добывать дерево/камень/руду рядом</span></div>
  <div class="line"><b>ЛКМ по постройке / голему</b><span>открыть окно</span></div>
  <div class="line"><b>ЛКМ по врагу / хижине лагеря</b><span>атаковать эту цель (герой сам подойдёт; без боеприпасов бьёт посохом)</span></div>
  <div class="line"><b>C</b><span>окно крафта: постройки и детали. Недостающие детали крафтятся сами, готовое попадает в инвентарь</span></div>
  <div class="line"><b>Tab / Shift+Tab</b><span>сменить оружие: три слота, у каждого свой слот боеприпасов (окно E). Пустой слот или нет боеприпасов — бой посохом</span></div>
  <div class="line"><b>Панель внизу, 1–0</b><span>взять закреплённую постройку в руку (если её нет — скрафтить), ЛКМ на земле — поставить (стены и конвейеры можно тянуть)</span></div>
  <div class="line"><b>Закрепить на панели</b><span>взять постройку в руку и кликнуть по пустой клетке, или Ctrl+клик по рецепту/предмету; ПКМ по клетке — открепить</span></div>
  <div class="line"><b>R</b><span>повернуть конвейер/вектор</span></div>
  <div class="line"><b>ПКМ</b><span>отменить выбор / разобрать постройку / забрать голема</span></div>
  <div class="line"><b>Q</b><span>взять в руку такую же постройку, как под курсором</span></div>
  <div class="line"><b>Ctrl+C / Ctrl+V</b><span>выделить группу построек и вставить копию (R — повернуть)</span></div>
  <div class="line"><b>Ctrl+Z</b><span>отменить последнее действие (постройку или разборку)</span></div>
  <div class="line"><b>E / T / Y</b><span>инвентарь / исследования / рабочие</span></div>
  <div class="line"><b>J</b><span>энциклопедия: все предметы, постройки, враги и исследования</span></div>
  <div class="line"><b>F</b><span>сесть на механического скакуна или спешиться</span></div>
  <div class="line"><b>G</b><span>у входа в пещеру (фонари и бирюзовый свет) — спуститься в подземелье; у светящейся лестницы — подняться. Каждое подземелье проходится один раз</span></div>
  <div class="line"><b>M / P</b><span>карта / загрязнение</span></div>
  <div class="line"><b>Alt</b><span>альт-режим: рецепты над машинами, содержимое сундуков, направления конвейеров и векторов</span></div>
  <div class="line"><b>O</b><span>статистика производства и потребления (графики)</span></div>
  <div class="line"><b>Колесо мыши</b><span>масштаб</span></div>
  <div class="line"><b>Z / X</b><span>Метеоритный дождь / Землетрясение (после исследования)</span></div>
  <div class="line"><b>Пробел</b><span>пауза</span></div>
  <div class="line"><b>F5</b><span>сохранить (автосохранение каждые 2 минуты)</span></div>
  </div>
  <h3>Как устроена экономика</h3>
  <p>Големы-дровосеки и шахтёры сами ходят за ресурсами в радиусе 14 клеток и носят всё в ближайший сундук. Их топливо — дерево: держите его в сундуке. Големы-векторы перекладывают предметы: сзади → вперёд. Мастерские, каменотёсни и скриптории крутятся от вала: поставьте беговое колесо (или мельницу) и дорожку деревянных валов вплотную к машинам.</p>
  <p>Скрипторий поглощает фолианты. Выберите исследование (T) и подвозите фолианты векторами.</p>
  <h3>Враги</h3>
  <p>Гоблины и орки приходят набегами, а если загрязнение (P) доберётся до их лагеря — приходят сильные орды. Деревья поглощают загрязнение. Тёмные Эльфы требуют дань — платите или защищайтесь. Цель игры — изучить «Ритуал свержения», отказаться от дани и убить Владыку эльфов.</p>`;
  openWin('help', 'Справка', h, { width: 560 });
}

const MAPV = { x: 0, y: 0, scale: 3 };
function showMap() {
  if (UI.wins.map) { closeWin('map'); return; }
  MAPV.x = S.player.x; MAPV.y = S.player.y;
  const w = Math.max(400, Math.min(innerWidth - 330, 1100)), h = Math.max(300, Math.min(innerHeight - 170, 760));
  const legend = [['#969696', 'Камень'], ['#c88c6e', 'Железная руда'], ['#e68246', 'Медная руда'], ['#282828', 'Уголь'], ['#e6dc5a', 'Сера'],
    ['#ffd73c', 'Золотая руда'], ['#a0f0ff', 'Мифрил'], ['#7d766a', 'Рудная гора (место для шахты)'], ['#285a23', 'Лес'], ['#285a9b', 'Вода'],
    ['#3e4a2a', 'Болото (смола)'], ['#e8b84a', 'Ваши постройки'], ['#d02020', 'Лагерь врагов'], ['#c040ff', 'Портал эльфов'], ['#5affc0', 'Анимансер']];
  openWin('map', 'Карта (M)', `<div class="row" style="align-items:flex-start">
    <canvas id="bigmap" width="${w}" height="${h}" style="display:block;image-rendering:pixelated;cursor:grab;border:1px solid #000"></canvas>
    <div style="width:200px"><h3>Обозначения</h3>${legend.map(([c, n]) => `<div class="row" style="gap:6px;margin:2px 0"><span style="display:inline-block;width:12px;height:12px;background:${c};border:1px solid #000"></span>${n}</div>`).join('')}
    <div style="margin-top:10px" class="col"><button data-act="mapHome">К Анимансеру</button><div class="row"><button data-act="mapZoom" data-arg="1">＋</button><button data-act="mapZoom" data-arg="-1">－</button></div></div>
    <div class="dim" style="margin-top:8px">Перетаскивайте карту мышью, колесо — масштаб. Подписи появляются у разведанных мест. Alt+ЛКМ — пинг (его видит друг).</div>
    <div id="mapPlayers">${mapPlayersHtml()}</div></div></div>`);
  const cv = $('bigmap');
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k;
    const tw = Math.ceil(cv.width / MAPV.scale), th = Math.ceil(cv.height / MAPV.scale);
    const wx = Math.floor(MAPV.x - tw / 2) + px / MAPV.scale, wy = Math.floor(MAPV.y - th / 2) + py / MAPV.scale;
    if (e.altKey) { INPUT.altUsed = true; pingAt(wx, wy); redrawBigMap(); return; }
    // клик по другу на карте — следить за ним
    const h = mpOtherHeroes().find(o => dist(o.x, o.y, wx, wy) * MAPV.scale < 9);
    if (h) { followHero(h.id); return; }
    const sx0 = e.clientX, sy0 = e.clientY, mx0 = MAPV.x, my0 = MAPV.y;
    cv.style.cursor = 'grabbing';
    const mv = (ev) => { MAPV.x = mx0 - (ev.clientX - sx0) / MAPV.scale; MAPV.y = my0 - (ev.clientY - sy0) / MAPV.scale; redrawBigMap(); };
    const up = () => { cv.style.cursor = 'grab'; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); ACT.mapZoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  redrawBigMap();
}
function redrawBigMap() { const cv = $('bigmap'); if (cv) drawMap(cv, MAPV.x, MAPV.y, MAPV.scale, true); const mp = $('mapPlayers'); if (mp) { const h = mapPlayersHtml(); if (mp._h !== h) { mp.innerHTML = h; mp._h = h; } } }
// игроки онлайн: показать на карте, следить камерой
function mapPlayersHtml() {
  if (!MP.role) return '';
  const list = mpOtherHeroes();
  let h = `<h3>Игроки онлайн: ${list.length + 1}</h3><div class="row" style="gap:6px;margin:2px 0"><span style="color:#5affc0">●</span> вы${UI.follow == null ? ' <span class="dim">(камера)</span>' : ` <button data-act="followMe">Вернуть камеру</button>`}</div>`;
  for (const o of list) h += `<div class="row" style="gap:6px;margin:2px 0"><span style="color:${o.guest ? '#ff7a60' : '#ffd060'}">●</span> ${o.name || 'Друг'} <button data-act="followHero" data-arg="${o.id}">${UI.follow === o.id ? 'следим' : 'Следить'}</button><button data-act="mapToHero" data-arg="${o.id}">На карте</button></div>`;
  return h;
}
function followHero(id) {
  const h = mpOtherHeroes().find(o => String(o.id) === String(id));
  if (!h) return;
  UI.follow = h.id;
  hint(`Камера следит за «${h.name || 'Друг'}». WASD или Esc — вернуться к своему герою.`);
  closeWin('map');
}
ACT.followHero = (id) => followHero(id);
ACT.followMe = () => { UI.follow = null; redrawBigMap(); };
ACT.mapToHero = (id) => { const h = mpOtherHeroes().find(o => String(o.id) === String(id)); if (h) { MAPV.x = h.x; MAPV.y = h.y; redrawBigMap(); } };
function pingAt(x, y) {
  if (!S) return;
  if (!MP.role) { mpPing(x, y, 'Вы', false); hint('Пинг виден друзьям в совместной игре'); return; }
  mpSendPing(x, y);
}
ACT.mapHome = () => { MAPV.x = S.player.x; MAPV.y = S.player.y; redrawBigMap(); };
ACT.mapZoom = (d) => { MAPV.scale = clamp(MAPV.scale + (+d), 1, 8); redrawBigMap(); };

function showVictory() {
  const t = fmtTime(S.victoryTime || S.time);
  const h = `<div class="center"><h1>Победа!</h1><p>Анимансер, некогда изгнанный и безоружный, превзошёл врождённую мощь Тёмных Эльфов.</p>
  <div class="credits"><div class="roll">
  <p>Время до победы: <b>${t}</b></p>
  <p>Построено зданий: ${Object.values(S.stats.built).reduce((a, b) => a + b, 0)}</p>
  <p>Големов в строю: ${S.golems.length}</p>
  <p>Врагов повержено: ${S.stats.kills || 0}</p>
  <p>Лагерей уничтожено: ${S.stats.camps || 0}</p>
  <p>Исследований: ${S.research.done.length}</p>
  <br><p><b>Эпоха Големов</b></p><p>Игра сделана для вас Claude</p><p>Спасибо за игру!</p></div></div>
  <button class="primary" data-act="close" data-arg="victory">Играть дальше</button></div>`;
  openWin('victory', 'Эпоха Големов', h, { width: 520 });
}

// ---------- HUD ----------
let mmTimer = 0;
const FPS = { acc: 0, n: 0, v: 0 };
function updateHud(dt) {
  const p = S.player;
  const dl = dayLabel();
  FPS.acc += dt; FPS.n++;
  if (FPS.acc >= 0.5) {
    FPS.v = Math.round(FPS.n / FPS.acc); FPS.acc = 0; FPS.n = 0;
    // автокачество: если долго меньше 40 кадров — снижаем разрешение отрисовки
    if (SETTINGS.autoQ !== 0 && !UI.paused && document.visibilityState === 'visible') {
      FPS.low = FPS.v < 40 ? (FPS.low || 0) + 1 : 0;
      if (FPS.low >= 12 && SETTINGS.quality !== 'low') {
        FPS.low = 0;
        SETTINGS.quality = SETTINGS.quality === 'high' ? 'medium' : 'low';
        saveSettings();
        log(`Игра шла медленно — качество графики снижено до «${SETTINGS.quality === 'medium' ? 'среднего' : 'низкого'}» (Esc → Настройки).`, 'warn');
      }
    }
  }
  $('clock').textContent = dl.icon + ' ' + fmtTime(S.time) + (SETTINGS.fps ? ` · ${FPS.v} к/с` : '');
  $('clock').title = dl.text;
  $('pauseInd').classList.toggle('hidden', !UI.paused);
  $('pauseOverlay').classList.toggle('hidden', !UI.paused);
  const mh = playerMaxHp();
  $('hpFill').style.width = (p.hp / mh * 100) + '%';
  $('hpText').textContent = p.dead > 0 ? `возрождение ${Math.ceil(p.dead)}…` : `${Math.ceil(p.hp)} / ${mh}`;
  ensureGuns(p);
  const w = WEAPONS[p.weapon];
  let gear = `<b>${w ? w.name : 'Посох'}</b>${w && w.ammo ? ` · ${p.ammo[p.gun] ? ITEMS[p.ammo[p.gun].id].name : ITEMS[w.ammo[0]].name}: ${gunAmmoTotal(p, p.gun)}` : ''}`;
  gear += `<br><span class="dim">Tab: ${p.guns.map((g, i) => (i === p.gun ? '▸' : '') + (g ? WEAPONS[g].name : '—')).join(' · ')}</span>`;
  if (p.armor) gear += `<br>${ITEMS[p.armor].name}`;
  { const n = golemCount(), lim = golemLimit(), k = golemOverload();
    gear += k > 0 ? `<br><span class="bad" title="Сверх заряда Анимансера: каждый лишний голем сильнее бьёт по герою. Изучайте исследования (+1 к заряду за каждое) или разберите часть големов.">⚠ Перегрузка магии: големов ${n}/${lim} — здоровье −${Math.round(k * 70)}%, скорость −${Math.round(k * 60)}%, крафт −${Math.round(k * 80)}%</span>`
      : `<br><span class="dim" title="Сколько големов держит магия Анимансера: 10 + 1 за каждое исследование${typeof MP !== 'undefined' && MP.role ? ', в совместной игре +20%' : ''}">✦ Заряд: големов ${n}/${lim}</span>`; }
  if (p.food) gear += `<br><span class="ok">🍖 ${ITEMS[p.food.id].name}: +${p.food.r} здоровья/с, ещё ${Math.ceil(p.food.t)} с</span>`;
  const sp = [];
  if (S.research.done.includes('meteor')) sp.push(`Z Метеоры ${p.spellCd.meteor > 0 ? Math.ceil(p.spellCd.meteor) + 'с' : '✓'}`);
  if (S.research.done.includes('quake')) sp.push(`X Землетрясение ${p.spellCd.quake > 0 ? Math.ceil(p.spellCd.quake) + 'с' : '✓'}`);
  if (sp.length) gear += '<br>' + sp.join(' · ');
  const ch = S.cheats || {}, on = [ch.god && 'бессмертие', ch.free && 'бесплатная стройка', ch.freeCraft && 'крафт без ресурсов', ch.instant && 'мгновенный крафт', ch.reach && 'стройка где угодно', ch.speed > 1 && 'время ×' + ch.speed].filter(Boolean);
  if (on.length) gear += `<br><span style="color:#ff9f40">Читы: ${on.join(', ')}</span>`;
  $('gear').innerHTML = gear;
  const cq = p.craft.slice(0, 12).map((e, i) => {
    const o = Object.keys(RECIPES[e.r].out)[0];
    const k = e.started ? 1 - e.t / RECIPES[e.r].time : 0;
    return `<div class="q" data-act="cancelCraft" data-arg="${i}" title="${ITEMS[o].name} — клик, чтобы отменить">${itemImg(o, 24)}<div class="p" style="width:${Math.round(k * 10) * 10}%"></div></div>`;
  }).join('') + (p.craft.length > 12 ? `<span class="dim">+${p.craft.length - 12}</span>` : '');
  if ($('craftQ')._h !== cq) { $('craftQ').innerHTML = cq; $('craftQ')._h = cq; }
  // угрозы и события
  const th = [];
  const e = S.elves;
  if (!e.defeated) {
    if (e.final) th.push(`<div class="elf" data-act="elfwin">⚔ Великий штурм эльфов!</div>`);
    else if (e.demand) th.push(`<div class="elf" data-act="elfwin" style="cursor:pointer">👁 Дань эльфам: ${fmtTime(e.demand.deadline - S.time)} — открыть</div>`);
    else if (S.time > 60) th.push(`<div class="elf" data-act="elfwin" style="cursor:pointer">Дань через ${fmtTime(e.next - S.time)}</div>`);
  }
  if (S.pollutedCamps) th.push(`<div class="warn">☁ Загрязнение злит лагерей: ${S.pollutedCamps}</div>`);
  if (S.evo > 0.02) th.push(`<div style="color:${S.evo > 0.5 ? '#ff5a45' : S.evo > 0.25 ? '#ffa200' : '#b8ad9c'}" title="Растёт со временем, от загрязнения и разорённых лагерей. Враги крепче и сильнее бьют.">🧬 Эволюция врагов: ${Math.round(S.evo * 100)}%</div>`);
  const raiders = S.enemies.filter(x => x.mode !== 'guard').length;
  if (raiders) th.push(`<div class="warn">⚠ Враги на подходе: ${raiders}</div>`);
  const portals = S.camps.filter(c => c.type === 'elf' && c.alive).length;
  if (portals) th.push(`<div class="elf">🌀 Порталы эльфов: ${portals}</div>`);
  if (S.merchant) th.push(`<div data-act="merchantwin" style="cursor:pointer;color:#e8b84a">🧙 Торговец (${fmtTime(S.merchant.until - S.time)}) — открыть</div>`);
  for (const q of S.quests) {
    if (q.done) continue;
    th.push(`<div>📜 ${q.desc} (${fmtTime(q.deadline - S.time)}) ${q.kind === 'deliver' ? `<button data-act="deliver" data-arg="${q.id}" ${S.player.inv.has(q.need) ? '' : 'disabled'}>Сдать</button>` : `${(S.stats.camps || 0) - q.base}/${q.n}`}</div>`);
  }
  const thHtml = th.join('');
  if ($('threats')._h !== thHtml) { $('threats').innerHTML = thHtml; $('threats')._h = thHtml; }
  // миникарта
  mmTimer -= dt;
  if (mmTimer <= 0) { mmTimer = 0.5; drawMap($('minimap'), p.x, p.y, 2); }
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('hint').textContent = ''; }
  if (UI.cursorProblem && (UI.tool || UI.mode === 'paste') && !INPUT.overUI) $('hint').textContent = UI.cursorProblem, hintTimer = 0.1;
}
ACT.merchantwin = () => renderMerchantWin();
ACT.bpCopy = () => startSelect();
ACT.bpPaste = () => startPaste();
ACT.undo = () => undoLast();

let winTimer = 0, statsTimer = 0;
function refreshWindows(dt) {
  winTimer -= dt;
  if (winTimer > 0) return;
  winTimer = 0.35;
  renderHotbar();
  const ae = document.activeElement;
  const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT');
  if (UI.wins.inv && !typing) renderInvWin();
  if (UI.wins.bld && !typing) renderBldWin();
  if (UI.wins.golem && !typing) renderGolemWin();
  if (UI.wins.cart && !typing) renderCartWin();
  if (UI.wins.research) renderResearchWin();
  if (UI.wins.map && MP.role && (UI.mapT = (UI.mapT || 0) + 1) % 4 === 0) redrawBigMap(); // друзья двигаются — карта обновляется
  if (UI.wins.workers) renderWorkersWin();
  if (UI.wins.elf) renderElfWin();
  if (UI.wins.merchant) renderMerchantWin();
  if (UI.wins.stats && (statsTimer = (statsTimer || 0) + 1) % 3 === 0) renderStatsWin();
  if (UI.wins.pollution && (UI._polT = (UI._polT || 0) + 1) % 3 === 0) renderPollutionWin();
}

// ---------- ввод ----------
function initInput() {
  const cv = $('game');
  addEventListener('keydown', (e) => {
    if (typeof INTRO_ON !== 'undefined' && INTRO_ON) return; // клавиши — катсцене (пропуск)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    INPUT.keys[e.code] = true;
    initAudio(); if (AC && AC.state === 'suspended') AC.resume();
    if (!S || document.getElementById('startScreen').style.display !== 'none') return;
    // Alt: нажали и отпустили — альт-режим; Alt+ЛКМ — пинг на карте (альт-режим тогда не переключается)
    if (e.code === 'AltLeft' || e.code === 'AltRight') { e.preventDefault(); if (!e.repeat) { INPUT.altHeld = true; INPUT.altUsed = false; } return; }
    if (UI.follow != null && (e.code === 'Escape' || /^(Key[WASD]|Arrow)/.test(e.code))) { UI.follow = null; hint('Камера снова на вашем герое'); if (e.code === 'Escape') return; }
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyC') { e.preventDefault(); startSelect(); return; }
      if (e.code === 'KeyV') { e.preventDefault(); startPaste(); return; }
      if (e.code === 'KeyZ') { e.preventDefault(); undoLast(); return; }
    }
    if (UI.mode && e.code === 'KeyR') { if (UI.mode === 'paste') rotateClip(); return; }
    if (UI.mode && e.code === 'Escape') { UI.mode = null; BP.sel = null; UI.dirty = true; return; }
    switch (e.code) {
      case 'Backquote': ACT.cheats(); break;
      case 'KeyE': ACT.invwin(); break;
      case 'Tab': e.preventDefault(); switchGun(e.shiftKey ? -1 : 1); if (UI.wins.inv) renderInvWin(); break;
      case 'KeyC': ACT.craftwin(); break;
      case 'KeyJ': ACT.encwin(); break;
      case 'KeyF': toggleRide(); break;
      case 'KeyG': toggleDungeon(); break;
      case 'KeyT': ACT.researchwin(); break;
      case 'KeyY': if (UI.wins.workers) closeWin('workers'); else renderWorkersWin(); break;
      case 'KeyM': showMap(); break;
      case 'KeyO': if (UI.wins.stats) closeWin('stats'); else renderStatsWin(); break;
      case 'KeyH': if (UI.wins.help) closeWin('help'); else showHelp(); break;
      case 'KeyP': ACT.pollution(); break;
      case 'F9': if (SETTINGS.admin) ACT.adminwin(); break;
      case 'KeyR': {
        const b = bldAt(Math.floor(INPUT.wx), Math.floor(INPUT.wy));
        const rot = b && (BUILDINGS[b.type].kind === 'belt' || BUILDINGS[b.type].kind === 'vector' || BUILDINGS[b.type].push || BUILDINGS[b.type].rotates || (BUILDINGS[b.type].kind === 'shaft' && BUILDINGS[b.type].under));
        // с конвейером в руке: R над последним поставленным конвейером линии поворачивает именно его (получается поворот ленты)
        const lastBelt = UI.tool && b && UI.lastPlace && UI.lastPlace.x === b.x && UI.lastPlace.y === b.y && b.type === UI.tool;
        if (rot && (!UI.tool || lastBelt)) { rotateBuilding(b, e.shiftKey ? 3 : 1); if (UI.tool) UI.dir = b.dir; }
        else UI.dir = (UI.dir + (e.shiftKey ? 3 : 1)) % 4;
        break;
      }
      case 'KeyQ': {
        if (UI.tool) UI.tool = null;
        else {
          // «пипетка»: взять в руку такую же постройку, как под курсором
          const b = bldAt(Math.floor(INPUT.wx), Math.floor(INPUT.wy));
          const g = !b && golemAtPoint(INPUT.wx, INPUT.wy - 0.3);
          const id = b ? b.type : g ? g.type : null;
          if (id && isUnlockedBuilding(id)) { takeInHand(id); UI.dir = b ? b.dir || 0 : 0; }
        }
        UI.dirty = true; break;
      }
      case 'KeyZ': castSpell('meteor'); break;
      case 'KeyX': castSpell('quake'); break;
      case 'Space': UI.paused = !UI.paused; e.preventDefault(); break;
      case 'F5': e.preventDefault(); saveGame(true); break;
      case 'Escape':
        if (UI.mode === 'decon') { UI.mode = null; BP.sel = null; UI.dirty = true; }
        else if (UI.tool) { UI.tool = null; UI.dirty = true; }
        else if (anyWin()) { for (const id of Object.keys(UI.wins)) closeWin(id); }
        else toggleMenu();
        break;
      default:
        if (/^Digit[0-9]$/.test(e.code)) hotUse((+e.code.slice(5) + 9) % 10, e);
    }
  });
  addEventListener('keyup', (e) => {
    INPUT.keys[e.code] = false;
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
      e.preventDefault();
      if (INPUT.altHeld && !INPUT.altUsed && S) { UI.alt = !UI.alt; hint(UI.alt ? 'Альт-режим: рецепты, содержимое, направления (Alt — выключить). Alt+ЛКМ — пинг для друга' : 'Альт-режим выключен'); }
      INPUT.altHeld = false;
    }
  });
  addEventListener('blur', () => { INPUT.keys = {}; INPUT.ldown = INPUT.rdown = false; });

  const updMouse = (e) => {
    if (Math.abs(e.clientX - INPUT.sx) + Math.abs(e.clientY - INPUT.sy) > 3) INPUT.moveT = performance.now();
    INPUT.sx = e.clientX; INPUT.sy = e.clientY;
    const w = screenToWorld(e.clientX, e.clientY);
    INPUT.wx = w.x; INPUT.wy = w.y;
    INPUT.overUI = e.target !== cv;
  };
  addEventListener('pointermove', (e) => {
    updMouse(e);
    if (!S) return;
    if ((UI.mode === 'select' || UI.mode === 'decon') && BP.sel) { BP.sel.x1 = INPUT.wx; BP.sel.y1 = INPUT.wy; }
    if (UI.zoneSel) { UI.zoneSel.x1 = INPUT.wx; UI.zoneSel.y1 = INPUT.wy; }
    if (INPUT.ldown && UI.tool && e.target === cv) dragPlace();
    if (INPUT.rdown && !UI.tool && e.target === cv) rightAction(true);
    // прицел над врагом
    const aim = e.target === cv && !UI.tool && (enemyAtPoint(INPUT.wx, INPUT.wy) || campStructAtPoint(INPUT.wx, INPUT.wy));
    cv.style.cursor = aim ? 'crosshair' : '';
  });
  cv.addEventListener('pointerdown', (e) => {
    updMouse(e);
    initAudio(); if (AC && AC.state === 'suspended') AC.resume();
    if (!S) return;
    if (e.button === 0 && e.altKey) { INPUT.altUsed = true; pingAt(INPUT.wx, INPUT.wy); return; }
    if (e.button === 0 && UI.zonePick) { UI.zoneSel = { x0: INPUT.wx, y0: INPUT.wy, x1: INPUT.wx, y1: INPUT.wy }; return; }
    // Shift+ПКМ по голему — копировать настройки, Shift+ЛКМ — вставить
    if (e.shiftKey && !UI.tool && !UI.mode) {
      const gg = golemAtPoint(INPUT.wx, INPUT.wy - 0.3);
      if (gg && e.button === 2) { UI.golemClip = golemSettings(gg); hint('Настройки скопированы: ' + BUILDINGS[gg.type].name); return; }
      if (gg && e.button === 0 && UI.golemClip) { hint(setGolemSettings(gg, UI.golemClip) ? 'Настройки вставлены' : 'Настройки от другого вида голема'); if (UI.openG === gg) renderGolemWin(); return; }
      // то же для манипуляторов
      const vb = !gg && bldAt(Math.floor(INPUT.wx), Math.floor(INPUT.wy));
      if (vb && BUILDINGS[vb.type].kind === 'vector') {
        if (e.button === 2) { UI.vecClip = vecSettings(vb); hint('Настройки манипулятора скопированы'); return; }
        if (e.button === 0 && UI.vecClip) { setVecSettings(vb, UI.vecClip); hint('Настройки манипулятора вставлены'); if (UI.openB === vb) renderBldWin(); return; }
      }
    }
    if (e.button === 0) {
      if (UI.mode === 'select' || UI.mode === 'decon') { BP.sel = { x0: INPUT.wx, y0: INPUT.wy, x1: INPUT.wx, y1: INPUT.wy }; return; }
      if (UI.mode === 'paste') { pastePlace(); return; }
      INPUT.ldown = true;
      if (UI.tool) { undoBegin(); UI.lastPlace = null; UI.beltLast = null; UI.beltBlocked = false; dragPlace(); return; }
      leftClick();
    } else if (e.button === 2) {
      if (UI.mode) { UI.mode = null; BP.sel = null; UI.dirty = true; return; }
      INPUT.rdown = true;
      if (UI.tool) { UI.tool = null; UI.dirty = true; return; }
      undoBegin();
      rightAction(false);
    }
  });
  addEventListener('pointerup', (e) => {
    if (e.button === 0 && UI.zoneSel) { finishZone(); return; }
    if (e.button === 0) { if (INPUT.ldown && UI.tool) dragRelease(); INPUT.ldown = false; if ((UI.mode === 'select' || UI.mode === 'decon') && BP.sel) finishSelect(); }
    if (e.button === 2) INPUT.rdown = false;
    if (UNDO.cur) undoEnd();
  });
  UI.recordUndo = true;
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    CAM.zoom = clamp(CAM.zoom * f, 12, 72);
  }, { passive: false });

  $('fileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { loadFromString(rd.result); } catch (err) { alert('Не удалось загрузить файл: ' + err.message); } };
    rd.readAsText(f);
    e.target.value = '';
  });
}

function leftClick() {
  const x = INPUT.wx, y = INPUT.wy;
  // выбор маршрута голема-носильщика
  // привязка голема к сундукам: клик по сундуку добавляет или убирает его
  if (UI.chestPick && UI.openG) {
    const b = bldAt(Math.floor(x), Math.floor(y)), g = UI.openG;
    if (b && BUILDINGS[b.type].kind === 'chest') {
      g.chests = g.chests || [];
      const i = g.chests.indexOf(b.id);
      if (i >= 0) g.chests.splice(i, 1); else g.chests.push(b.id);
      hint(i >= 0 ? 'Сундук отвязан' : 'Сундук привязан'); release(g); g.state = 'seek'; renderGolemWin();
    } else hint('Кликните по сундуку');
    INPUT.ldown = false; return;
  }
  if (UI.porterPick && UI.openG) {
    const b = bldAt(Math.floor(x), Math.floor(y)), g = UI.openG;
    if (b && porterOk(g, b)) {
      const st = golemSettings(g), list = UI.porterPick === 'src' ? st.psrcs : st.pdsts, i = list.indexOf(b.id);
      if (i >= 0) list.splice(i, 1); else list.push(b.id);
      setGolemSettings(g, st);
      hint((i >= 0 ? 'Убрано: ' : 'Добавлено: ') + BUILDINGS[b.type].name);
    } else hint(b ? `Слишком далеко от места создания голема (до ${PORTER.range} клеток)` : 'Здесь нет здания');
    INPUT.ldown = false; renderGolemWin(); return;
  }
  const m = S.merchant;
  if (m && dist(m.x, m.y - 0.4, x, y) < 0.7) { setPlayerFocus({ k: 'm' }); INPUT.ldown = false; return; }
  if (S.envoy && dist(S.envoy.x, S.envoy.y - 0.4, x, y) < 0.7) { renderElfWin(); return; }
  // клик по врагу или постройке лагеря — атаковать именно эту цель
  const en = enemyAtPoint(x, y);
  if (en) { setPlayerFocus({ k: 'e', e: en }); INPUT.ldown = false; return; }
  const cs = campStructAtPoint(x, y);
  if (cs) { setPlayerFocus({ k: 's', s: cs }); INPUT.ldown = false; return; }
  const g = golemAtPoint(x, y - 0.3);
  if (g) { openGolem(g); return; }
  const an = animalAtPoint(x, y);
  if (an) { setPlayerFocus({ k: 'a', a: an }); INPUT.ldown = false; return; }
  const cart = cartAtPoint(x, y);
  if (cart) { openCart(cart); return; }
  const b = bldAt(Math.floor(x), Math.floor(y));
  if (b) { openBuilding(b); return; }
  // предметы на полу — подобрать
  if (floorAt(Math.floor(x), Math.floor(y))) {
    if (dist(Math.floor(x) + 0.5, Math.floor(y) + 0.5, S.player.x, S.player.y) > 3.5) { hint('Подойдите ближе, чтобы подобрать'); return; }
    mpCmd({ f: 'floorPick', x: Math.floor(x), y: Math.floor(y) });
    const n = floorPickup(Math.floor(x), Math.floor(y));
    if (n) { floatText(Math.floor(x) + 0.5, Math.floor(y), '+' + n, '#e8dcbc'); sfx('click'); }
    INPUT.ldown = false;
  }
}

function campStructAtPoint(x, y) {
  for (const c of S.camps) {
    if (!c.alive || Math.abs(c.x - x) > 12 || Math.abs(c.y - y) > 12) continue;
    for (const s of c.structs) {
      if (s.hp <= 0) continue;
      const sz = structW(s);
      if (x >= s.x && x < s.x + sz && y >= s.y - (sz > 1 ? 1 : 0.5) && y < s.y + sz) return s;
    }
  }
  return null;
}

function rightAction(drag) {
  const x = INPUT.wx, y = INPUT.wy, p = S.player;
  if (!drag && S.merchant && dist(S.merchant.x, S.merchant.y - 0.4, x, y) < 0.7) { renderMerchantWin(); return; }
  const g = golemAtPoint(x, y - 0.3);
  if (g && !drag) { if (dist(g.x, g.y, p.x, p.y) <= playerReach()) pickupGolem(g); else hint('Слишком далеко'); return; }
  const cart = !drag && cartAtPoint(x, y);
  if (cart) { if (dist(cart.x, cart.y, p.x, p.y) <= playerReach()) { mpCmd({ f: 'pickc', id: cart.id }); pickupCart(cart); } else hint('Слишком далеко'); return; }
  const b = bldAt(Math.floor(x), Math.floor(y));
  if (!b) { cancelGhostAt(Math.floor(x), Math.floor(y)); return; }
  if (dist(b.x + b.w / 2, b.y + b.h / 2, p.x, p.y) > playerReach() + 1) { hint('Слишком далеко'); return; }
  if (UI.deconHold && UI.deconHold.id === b.id) return;
  UI.deconHold = { id: b.id, t: 0, need: deconTime(b) };
}

// протяжка мышью: конвейеры, стены, валы — по пути мыши; остальные постройки — рядом в линию от первой
// (ряд печей, сундуков…) с шагом в свой размер по главной оси
const FREE_DRAG = new Set(['belt', 'wall', 'shaft', 'pipe', 'spikes', 'road', 'deco']);
function dragPlace() {
  const def = BUILDINGS[UI.tool];
  if (!def) return;
  const tx = def.size[0] > 1 ? Math.round(INPUT.wx - def.size[0] / 2) : Math.floor(INPUT.wx);
  const ty = def.size[1] > 1 ? Math.round(INPUT.wy - def.size[1] / 2) : Math.floor(INPUT.wy);
  const lp = UI.lastPlace;
  if (lp && lp.x === tx && lp.y === ty) return;
  if (def.kind === 'mgolem' || def.kind === 'cart') {
    if (lp) return;
    const ok = placeBuilding(UI.tool, tx, ty, UI.dir);
    UI.lastPlace = { x: tx, y: ty, placed: ok };
    INPUT.ldown = false; return; // один голем за клик
  }
  if (lp && (def.under || def.split)) return; // подземный: выход ставится при отпускании кнопки (см. dragRelease)
  if (!FREE_DRAG.has(def.kind) || def.under || def.split) {
    if (!lp) { UI.dragStart = { x: tx, y: ty }; UI.dragDone = new Set(); }
    const s0 = UI.dragStart, w = def.size[0], h = def.size[1];
    const horiz = Math.abs(tx - s0.x) / w >= Math.abs(ty - s0.y) / h;
    const n = horiz ? Math.round((tx - s0.x) / w) : Math.round((ty - s0.y) / h);
    for (let k = 0; Math.abs(k) <= Math.abs(n); k += n < 0 ? -1 : 1) {
      const x = horiz ? s0.x + k * w : s0.x, y = horiz ? s0.y : s0.y + k * h, key = x + ',' + y;
      if (!UI.dragDone.has(key)) { UI.dragDone.add(key); placeBuilding(UI.tool, x, y, UI.dir, k ? { quiet: true } : null); }
      if (!n) break;
    }
    UI.lastPlace = { x: tx, y: ty, placed: true };
    return;
  }
  // протягивание конвейера: направление по движению мыши
  if (lp && def.kind === 'belt' && Math.abs(lp.x - tx) + Math.abs(lp.y - ty) === 1) {
    const d = DIRS.findIndex(([dx, dy]) => dx === tx - lp.x && dy === ty - lp.y);
    if (d >= 0) {
      UI.dir = d;
      const prev = bldAt(lp.x, lp.y);
      if (prev && isBelt(prev) && lp.placed && prev.dir !== d) rotateBuilding(prev, (d - prev.dir + 4) % 4);
    }
  }
  const here = bldAt(tx, ty);
  // конвейер поверх такого же — поворачивает его (так получается поворот ленты)
  if (def.kind === 'belt' && here && here.type === UI.tool && here.x === tx && here.y === ty) {
    if (here.dir !== UI.dir && lp) rotateBuilding(here, (UI.dir - here.dir + 4) % 4);
    UI.lastPlace = { x: tx, y: ty, placed: true }; UI.beltLast = { x: tx, y: ty }; UI.beltBlocked = false;
    return;
  }
  // автозамена: линия конвейера упёрлась в постройку — за препятствием ставим пару подземных конвейеров
  if (def.kind === 'belt' && !def.under && !def.split && here && !isBelt(here)) { UI.beltBlocked = true; UI.lastPlace = { x: tx, y: ty, placed: false }; return; }
  if (def.kind === 'belt' && UI.beltBlocked && UI.beltLast && !placeProblem(UI.tool, tx, ty, true) && autoUnderground(tx, ty)) {
    UI.lastPlace = { x: tx, y: ty, placed: true }; UI.beltLast = { x: tx, y: ty }; UI.beltBlocked = false;
    return;
  }
  const ok = placeBuilding(UI.tool, tx, ty, UI.dir, lp ? { quiet: true } : null);
  UI.lastPlace = { x: tx, y: ty, placed: ok };
  if (ok && def.kind === 'belt') { UI.beltLast = { x: tx, y: ty }; UI.beltBlocked = false; }
}
// пара подземных конвейеров вместо обычных: последний конвейер перед препятствием — вход, клетка за ним — выход
function autoUnderground(tx, ty) {
  const L = UI.beltLast, prev = bldAt(L.x, L.y);
  if (!prev || prev.type !== 'belt' || !isUnlockedBuilding('ubelt')) return false;
  const [dx, dy] = DIRS[prev.dir], k = dx ? (tx - L.x) * dx : (ty - L.y) * dy;
  if ((dx && ty !== L.y) || (dy && tx !== L.x) || k < 2 || k - 1 > BUILDINGS.ubelt.under) return false;
  const free = S.cheats && S.cheats.free;
  if (!free && S.player.inv.count('ubelt') + 0 < 2) { hint('Для обхода препятствия нужно 2 подземных конвейера'); return false; }
  const dir = prev.dir;
  deconstruct(prev); // обычный конвейер возвращается в инвентарь
  placeBuilding('ubelt', L.x, L.y, dir, { quiet: true, noReach: true });
  placeBuilding('ubelt', tx, ty, dir, { quiet: true });
  UI.dir = dir;
  hint('Препятствие: поставлена пара подземных конвейеров');
  return true;
}
// отпустили кнопку с подземным конвейером/валом в руке: если тянули от входа по прямой в пределах длины — ставим выход
function dragRelease() {
  const def = BUILDINGS[UI.tool], lp = UI.lastPlace;
  if (!def || !def.under || !lp || !lp.placed) return;
  const tx = Math.floor(INPUT.wx), ty = Math.floor(INPUT.wy);
  if (tx === lp.x && ty === lp.y) return;
  const [dx, dy] = DIRS[UI.dir], k = dx ? (tx - lp.x) * dx : (ty - lp.y) * dy;
  if ((dx && ty !== lp.y) || (dy && tx !== lp.x) || k < 1) return;
  if (k > def.under + 1) { hint(`Слишком далеко: подземный ход не длиннее ${def.under} клеток`); return; }
  placeBuilding(UI.tool, tx, ty, UI.dir);
}

// ---------- разборка с задержкой: держите ПКМ над постройкой ----------
function deconTime(b) {
  if (S.cheats && (S.cheats.instant || S.cheats.free)) return 0.05;
  const d = BUILDINGS[b.type];
  return clamp(0.25 + (d.hp || 100) / 900 + (b.w * b.h - 1) * 0.12, 0.3, 1.6);
}
function updateDeconHold(dt) {
  const h = UI.deconHold;
  if (!h) return;
  if (!INPUT.rdown || UI.tool) { UI.deconHold = null; return; }
  const b = bldAt(Math.floor(INPUT.wx), Math.floor(INPUT.wy));
  if (!b || b.id !== h.id) { UI.deconHold = null; if (b) rightAction(true); return; }
  h.t += dt;
  if (h.t >= h.need) { UI.deconHold = null; deconstruct(b); }
}
function drawDeconHold() {
  const h = UI.deconHold;
  if (!h) return;
  const b = S.buildings.get(h.id);
  if (!b) return;
  const X = sx(b.x + b.w / 2), Y = sy(b.y + b.h / 2), R = VIEW.z * 0.38;
  G.save(); G.lineWidth = Math.max(3, VIEW.z * 0.1);
  G.strokeStyle = 'rgba(0,0,0,0.55)'; G.beginPath(); G.arc(X, Y, R, 0, 7); G.stroke();
  G.strokeStyle = '#ff7040'; G.beginPath(); G.arc(X, Y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, h.t / h.need)); G.stroke();
  G.restore();
}
