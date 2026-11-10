'use strict';
// Стадии заражения мира. Счёт растёт от всего выпущенного дыма и понемногу от времени, назад не идёт.
// 1 — зверей и птиц меньше; 2 — мутанты в набегах; 3 — заражены почва, деревья и поля, мир чуть блёкнет;
// 4 «Чернобыль» — события (кислотный дождь, токсичный туман, споры), звери-мутанты, мини-боссы, заражённые грядки.

const BLIGHT_STAGES = [
  { name: L('Чистый мир'), color: '#8fc070', desc: L('Природа пока не замечает ваших заводов.') },
  { name: L('Стадия 1: Оскудение'), color: '#c8c060', desc: L('Зверей становится меньше, птицы пролетают реже.') },
  { name: L('Стадия 2: Мутации'), color: '#d0a040', desc: L('В набегах появляются мутанты: чуть сильнее обычных, страшнее на вид и идут первыми.') },
  { name: L('Стадия 3: Порча'), color: '#c07830', desc: L('Почва и деревья заражены: лес отрастает дольше, с дерева меньше древесины, поля дают меньше. Откройте исследование «Защитный костюм»!') },
  { name: L('Стадия 4: Чернобыль'), color: '#c04a30', desc: L('Зверей почти нет, бывшие звери нападают на героя. Кислотные дожди, туман, споры и набеги мутантов. Спасают костюм и укрытие у стен зданий. Открываются заражённые грядки.') },
];
const BLIGHT_AT = [2000, 6000, 14000, 24000]; // пороги счёта
const BLIGHT_EVENTS = {
  acid: { name: L('Кислотный дождь'), icon: '🌧', drain: 2.2, slow: 0.1, desc: L('жжёт здоровье и замедляет') },
  fog: { name: L('Токсичный туман'), icon: '🌫', drain: 1.0, slow: 0.3, desc: L('сильно замедляет и отравляет') },
  spores: { name: L('Споры'), icon: '🍄', drain: 1.5, slow: 0.15, desc: L('отравляют, мутанты лезут к базе') },
};
const BLIGHT_FIRST_EVENT = 8 * 60; // первое событие — через 8 минут после начала Чернобыля

function blightScore() { return ((S.pollTotal || 0) + S.time * 0.15) * TUNE.blightRate; }
function blightStage() { return (S.blight && S.blight.stage) || 0; }
function blightEvent() { const e = S.blight && S.blight.ev; return e && S.time < e.until ? e : null; }

// множители для других систем
function wildCap() { return [14, 9, 7, 5, 2][blightStage()]; }
function birdGapMul() { return [1, 2, 2.5, 3, 6][blightStage()]; }
function treeYieldMul() { return [1, 1, 1, 0.75, 0.6][blightStage()]; }
function treeGrowMul() { return [1, 1, 1, 0.6, 0.4][blightStage()]; }
function farmMul() {
  const m = [1, 1, 1, 0.8, 0.65][blightStage()];
  return S.research.done.includes('fertilizer') ? 1 - (1 - m) / 2 : m; // поля големов-землепашцев: наука снимает половину штрафа
}
// поле-постройка: с удобрением порчи как не бывало и даже чуть быстрее; мешка хватает на минуту
function farmBldMul(b, dt) {
  if (b.inp && b.inp.count('fertilizer') > 0) {
    b.fertT = (b.fertT || 0) + dt;
    if (b.fertT >= 60) { b.fertT = 0; b.inp.remove('fertilizer', 1); }
    return 1.15;
  }
  return farmMul();
}
function mutantChance() { return ([0, 0, 0.15, 0.25, 0.4][blightStage()] + (blightEvent() ? 0.2 : 0)) * TUNE.mutants; }

// дерево даёт меньше: часть срубленного просто рассыпается трухой
function treeDrop() { return Math.random() < treeYieldMul(); }

function blightTick() {
  const B = S.blight || (S.blight = { stage: 0, ev: null, next: null });
  const score = blightScore();
  let st = 0; for (const v of BLIGHT_AT) if (score >= v) st++;
  if (st > B.stage) {
    B.stage = st;
    const s = BLIGHT_STAGES[st];
    log(L`☣ Заражение мира — ${s.name}. ${s.desc}`, 'warn');
    sfx('alarm');
    if (st === 3 && !S.research.done.includes('hazmat')) log(L('Изучите «Защитный костюм» как можно скорее: до Чернобыля осталось не так много времени.'), 'warn');
    if (st === 4) { B.next = S.time + BLIGHT_FIRST_EVENT; log(L`Первое ядовитое событие — примерно через ${Math.round(BLIGHT_FIRST_EVENT / 60)} минут. Нужен «Защитный костюм» или укрытие у стен здания.`, 'warn'); }
  }
  if (B.stage < 4 || S.peaceful) return;
  if (B.next == null) B.next = S.time + BLIGHT_FIRST_EVENT;
  if (B.ev && S.time >= B.ev.until) { log(L`${BLIGHT_EVENTS[B.ev.type].name} закончился.`, 'good'); B.ev = null; B.next = S.time + rand(TUNE.blightGap * 0.7, TUNE.blightGap * 1.3); }
  if (!B.ev && S.time >= B.next) startBlightEvent();
  if (B.ev) {
    for (const h of heroList()) {
      const k = heroExposure(h);
      if (k <= 0 || h.dead > 0) continue;
      h.hp -= BLIGHT_EVENTS[B.ev.type].drain * k;
      h.lastHurt = S.time;
      if (h.hp <= 0) { h.hp = 1; damageHero(h === S.player ? null : h, 99999); }
    }
    // набеги мутантов во время событий идут чаще
    S.raidT -= 1;
  }
}
function startBlightEvent() {
  const B = S.blight, type = pick(Object.keys(BLIGHT_EVENTS)), E = BLIGHT_EVENTS[type];
  B.ev = { type, until: S.time + rand(90, 150) };
  log(L`${E.icon} ${E.name}: ${E.desc}! Наденьте защитный костюм или встаньте у стены здания.`, 'warn');
  sfx('alarm');
  if (typeof strayDuringEvent === 'function') strayDuringEvent();
  // споры сразу приводят мутантов
  if (type === 'spores') {
    const bc = baseCenter();
    let best = null, bd = 450;
    for (const c of S.camps) { if (!c.alive || c.type === 'elf' || c.type === 'citadel') continue; const d = dist(c.x, c.y, bc.x, bc.y); if (d < bd) { bd = d; best = c; } }
    if (best) sendRaid(best, 0.7, L('⚔ Споры подняли мутантов'));
  }
}
// укрытие — стена здания рядом: дом, барак, мастерская и всё, что 2×2 и больше
function heroSheltered(h) {
  const cx = Math.floor(h.x), cy = Math.floor(h.y);
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    const b = bldAt(x, y);
    if (b && b.w >= 2 && b.h >= 2 && BUILDINGS[b.type].kind !== 'tower') return true;
  }
  return false;
}
// доля вреда от события: 0 — защищён полностью
function heroExposure(h) {
  if (!blightEvent()) return 0;
  if (inDungeonY(h.y) || heroSheltered(h)) return 0;
  const a = h.armor && ARMORS[h.armor];
  return clamp(1 - (a && a.hazard || 0), 0, 1);
}
function blightSlow(h) {
  const e = blightEvent();
  return e ? BLIGHT_EVENTS[e.type].slow * heroExposure(h) : 0;
}

// ---------- мутанты ----------
// в набеге часть врагов — мутанты: на 35% крепче, на 20% злее, зелёные, чуть крупнее. Выходят вперёд основной толпы.
function mutateEnemy(e, boss) {
  e.mutant = boss ? 2 : 1;
  const k = boss ? 4 : 1.35;
  e.hp = e.maxHp = Math.round(e.maxHp * k);
  e.dmgMul = (e.dmgMul || 1) * (boss ? 1.5 : 1.2);
}
// вызывается из sendRaid: мутанты впереди всех, на 4-й стадии — ещё и мини-босс
function raidMutants(list, camp) {
  const ch = mutantChance();
  if (ch <= 0) return 0;
  const bc = baseCenter(), d = dist(camp.x, camp.y, bc.x, bc.y) || 1;
  const ux = (bc.x - camp.x) / d, uy = (bc.y - camp.y) / d;
  let n = 0;
  const lead = (e) => { const off = Math.min(9, d * 0.3); const f = nearestEPass(e.x + ux * off, e.y + uy * off, 6); if (f) { e.x = f.x; e.y = f.y; e.hx = f.x; e.hy = f.y; } };
  for (const e of list) {
    if (ENEMIES[e.type].siege || Math.random() >= ch) continue;
    mutateEnemy(e, false); lead(e); n++;
  }
  if (blightStage() >= 4 && list.length && Math.random() < 0.6) {
    const e = list.find(o => !ENEMIES[o.type].siege && o.mutant !== 2);
    if (e) { if (e.mutant) { e.hp = e.maxHp = Math.round(e.maxHp / 1.35); e.dmgMul /= 1.2; } mutateEnemy(e, true); lead(e); n++; log(L('☣ В набеге идёт мутант-вожак! С него падает мутаген.'), 'warn'); }
  }
  return n;
}
function onMutantKilled(e, src) {
  if (e.mutant !== 2) return;
  const h = (src && src.inv ? src : null) || nearestHero(e.x, e.y, 60) || S.player;
  const n = randi(1, 2), got = h.inv.add('mutagen', n);
  if (n - got > 0) dropItems(e.x, e.y, 'mutagen', n - got);
  floatText(e.x, e.y - 0.8, '+' + n + L(' мутаген'), '#a0ff70');
  log(L`Мутант-вожак убит: мутаген ×${n}. Им можно усилить голема в его окне.`, 'good');
  sfx('coins');
}
// на 4-й стадии часть встреченных зверей — мутанты, нападают на героя
function wildMutantTick(dt) {
  if (blightStage() < 4 || S.peaceful) return;
  S.blight.beastT = (S.blight.beastT == null ? 40 : S.blight.beastT) - dt;
  if (S.blight.beastT > 0) return;
  S.blight.beastT = rand(50, 110);
  if (S.enemies.filter(e => ENEMIES[e.type].beast).length > 6) return;
  const h = pick(heroList());
  if (h.dead > 0 || inDungeonY(h.y) || Math.random() > 0.55 || nearestBldWhere(h.x, h.y, 14)) return;
  const a = rand(0, 6.28), n = randi(1, 2);
  for (let i = 0; i < n; i++) spawnEnemy('mut_beast', h.x + Math.cos(a) * 18 + rand(-2, 2), h.y + Math.sin(a) * 18 + rand(-2, 2), 'wild');
  if (h === S.player) log(L('Из чащи вылез зверь-мутант!'), 'warn');
}

// ---------- вид мира ----------
// Оттенок всей картинки — фильтром на холст: дёшево для видеокарты и ровно, глаза не режет.
let BLIGHT_CSS = null;
function blightVisual() {
  const st = blightStage();
  const f = SETTINGS.blightTint === 'off' ? 'none' : st >= 4 ? 'saturate(.82) sepia(.12) hue-rotate(-4deg)' : st >= 3 ? 'saturate(.9) sepia(.06)' : 'none';
  if (f !== BLIGHT_CSS && typeof CV !== 'undefined' && CV) { BLIGHT_CSS = f; CV.style.transition = 'filter 8s'; CV.style.filter = f; }
}
// заражённая земля: мягкие пятна там, где дым густой (видно под зданиями и деревьями)
function drawBlightGround() {
  if (blightStage() < 3) return;
  const cx0 = Math.floor(VIEW.x0 / CHUNK), cx1 = Math.floor(VIEW.x1 / CHUNK), cy0 = Math.floor(VIEW.y0 / CHUNK), cy1 = Math.floor(VIEW.y1 / CHUNK);
  const max = blightStage() >= 4 ? 0.2 : 0.13;
  G.save();
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const v = POLL.get(ck(cx, cy)) || 0;
    if (v < 0.1) continue;
    const a = Math.min(max, 0.03 + v * 0.05), X = sx((cx + 0.5) * CHUNK), Y = sy((cy + 0.5) * CHUNK), R = CHUNK * VIEW.z * 0.85;
    const gr = G.createRadialGradient(X, Y, R * 0.2, X, Y, R);
    gr.addColorStop(0, `rgba(72,78,28,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(72,78,28,0)');
    G.fillStyle = gr; G.fillRect(X - R, Y - R, R * 2, R * 2);
  }
  G.restore();
}
// дождь и туман поверх мира, полупрозрачные и неяркие
function drawBlightWeather(t) {
  const e = blightEvent();
  if (!e || inDungeonY(S.player.y)) return;
  const W = CV.width, H = CV.height;
  G.save();
  if (e.type === 'acid') {
    G.strokeStyle = 'rgba(190,225,110,0.22)'; G.lineWidth = Math.max(1, DPR); G.beginPath();
    for (let i = 0; i < 90; i++) {
      const sp = 0.6 + (i % 5) * 0.08, X = ((i * 137.5 + t * 90 * sp) % (W + 40)) - 20, Y = ((i * 89.3 + t * 620 * sp) % (H + 40)) - 20;
      G.moveTo(X, Y); G.lineTo(X - 3 * DPR, Y + 14 * DPR);
    }
    G.stroke();
    G.fillStyle = 'rgba(120,150,50,0.05)'; G.fillRect(0, 0, W, H);
  } else {
    const col = e.type === 'fog' ? '130,150,80' : '170,120,170', n = e.type === 'fog' ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const X = (Math.sin(t * 0.07 + i * 1.9) * 0.55 + 0.5) * W, Y = (Math.cos(t * 0.05 + i * 2.7) * 0.55 + 0.5) * H, R = Math.max(W, H) * (e.type === 'fog' ? 0.42 : 0.3);
      const gr = G.createRadialGradient(X, Y, 0, X, Y, R);
      gr.addColorStop(0, `rgba(${col},${e.type === 'fog' ? 0.13 : 0.09})`); gr.addColorStop(1, `rgba(${col},0)`);
      G.fillStyle = gr; G.fillRect(X - R, Y - R, R * 2, R * 2);
    }
    if (e.type === 'spores') {
      G.fillStyle = 'rgba(225,190,240,0.4)';
      for (let i = 0; i < 40; i++) { const X = (i * 211 + Math.sin(t + i) * 30 + t * 12) % W, Y = (i * 127 - t * 18 + H * 9) % H; G.fillRect(X, Y, 2 * DPR, 2 * DPR); }
    }
  }
  G.restore();
}
// подсказка: что сейчас с заражением
function blightHud() {
  const st = blightStage(), out = [];
  if (st > 0) out.push(`<div data-act="pollution" style="cursor:pointer;color:${BLIGHT_STAGES[st].color}" title="${BLIGHT_STAGES[st].desc}">☣ ${BLIGHT_STAGES[st].name}</div>`);
  const e = blightEvent();
  if (e) {
    const E = BLIGHT_EVENTS[e.type], k = heroExposure(S.player);
    out.push(`<div class="${k > 0 ? 'warn' : 'ok'}">${E.icon} ${E.name} ${fmtTime(e.until - S.time)} — ${k <= 0 ? L('вы в укрытии') : k < 1 ? L`костюм держит (вред ×${k.toFixed(1)})` : L('вы под ударом! укройтесь у здания')}</div>`);
  } else if (st >= 4 && S.blight.next && S.blight.next - S.time < 120) out.push(L`<div class="warn">☣ Скоро ядовитое событие: ${fmtTime(S.blight.next - S.time)}</div>`);
  return out;
}
function blightWinHtml() {
  const st = blightStage(), score = blightScore(), nx = BLIGHT_AT[st];
  let h = L`<h3>Заражение мира</h3><div style="color:${BLIGHT_STAGES[st].color}"><b>${BLIGHT_STAGES[st].name}</b></div><div class="dim">${BLIGHT_STAGES[st].desc}</div>`;
  if (nx) h += L`<div>До следующей стадии: <b>${fmtNum(Math.max(0, nx - score))}</b></div>${bar(score / nx)}`;
  return h + L('<div class="dim">Растёт от всего выпущенного дыма (и понемногу от времени). Назад не откатывается.</div>');
}
