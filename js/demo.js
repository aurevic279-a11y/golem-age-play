'use strict';
// Полигон «Рабочие»: пять одинаковых плавилен рядом — без рабочих, с орком на ягодах, с орком на жарком,
// с довольным человеком и с недовольным человеком. У каждой своя база еды: големы-землепашцы растят урожай,
// векторы носят его в скотный двор, на кухню и в барак/дом. Над каждой линией — счётчик выплавки железа.

let DEMO = null;

function startWorkersDemo() {
  newGame();
  S.peaceful = true;
  S.tutorial.hidden = true;
  S.research.done = Object.keys(TECHS).filter(id => !TECHS[id].infinite);
  recomputeBonus();
  const p = S.player, X0 = -14, Y0 = -22;
  // ровная поляна
  for (let y = Y0 - 3; y < Y0 + 52; y++) for (let x = X0 - 8; x < X0 + 46; x++) {
    const c = chunkOf(x, y), i = tidx(x, y);
    c.res[i] = 0; c.amt[i] = 0; c.ground[i] = GROUND.grass; c.modified = true;
  }
  S.camps = S.camps.filter(c => dist(c.x, c.y, X0 + 20, Y0 + 25) > 70);
  p.x = X0 + 30.5; p.y = Y0 + 20.5; // герой в сторонке, чтобы не мешать стройке
  S.cheats = { free: true };
  const put = (t, x, y, d) => { placeBuilding(t, x, y, d || 0, { noReach: true, noGhost: true }); return bldAt(x, y); };
  const vec = (x, y, d) => { const v = put('vector', x, y, d); if (v) v.fuel = 1e7; return v; };
  DEMO = { labels: [], lanes: [], t0: S.time };
  const label = (x, y, text, col) => DEMO.labels.push({ x, y, text, col: col || '#f0e6c8' });

  // плавильня линии: сундук руды → вектор → плавильня → вектор → сундук железа
  const smelter = (x, y) => {
    const src = put('chest', x, y); src.inv.add('iron_ore', 3000);
    vec(x + 1, y, 1);
    const f = put('furnace', x + 2, y); f.fuel.add('coal', 40);
    vec(x + 4, y, 1);
    const out = put('chest', x + 5, y);
    return { f, out };
  };
  // база еды на големах: землепашцы вокруг сундука, заправщик с дровяником
  const farmers = (x, y, kind, n) => {
    const ch = put('chest', x + 2, y);
    const wp = put('woodpile', x + 2, y + 1); wp.inv.add('wood', 600);
    for (let k = 0; k < n; k++) { const g = spawnGolem('farmer', x - 4 + k * 4 + 0.5, y + 4.5); g.filter = kind; g.fuel = 150; }
    const fu = spawnGolem('fueler', x + 3.5, y + 2.5); fu.fuel = 150;
    return ch;
  };
  // вода для скотного двора: пруд, насос и акведук
  // кожа со скотного двора — в отдельный сундук, иначе двор забьётся и встанет
  const leather = (x, y) => { vec(x + 1, y - 1, 0); put('chest', x + 1, y - 2); };
  const water = (x, y, len) => {
    for (let k = 0; k < 2; k++) { const c = chunkOf(x - 1, y + k); c.ground[tidx(x - 1, y + k)] = GROUND.water; }
    put('waterpump', x, y);
    for (let k = 1; k <= len; k++) put('pipe', x + k, y);
  };
  const orc = () => { const w = addWorker('orc'); w.shackled = true; return w; };

  let y = Y0;
  // 1. без рабочих
  label(X0, y - 1.2, '1. Без рабочих — обычная скорость (×1)', '#ffffff');
  let s = smelter(X0 + 14, y); DEMO.lanes.push({ name: 'Без рабочих', chest: s.out });
  y += 10;

  // 2. орк на ягодах: 3 землепашца с ягодами → сундук → вектор → барак
  label(X0, y - 1.2, '2. Орк на ягодах — ×1.8; ягода кормит всего 20 с: один землепашец едва прокормит одного орка', '#ffd080');
  let fc = farmers(X0, y, 'berries', 3);
  vec(X0 + 3, y, 1);
  const bar2 = put('barracks', X0 + 4, y); bar2.inv.add('berries', 30);
  s = smelter(X0 + 14, y);
  { const w = orc(); assignWorker(w, s.f); }
  DEMO.lanes.push({ name: 'Орк на ягодах', chest: s.out });
  label(X0 - 4, y + 6.2, 'землепашцы растят ягоды (8 грядок по 1 ягоде раз в 2,5 мин)', '#c8e8a0');
  y += 12;

  // 3. орк на жарком: землепашцы с пшеницей → скотный двор (вода) → кухня (жаркое) → барак
  label(X0, y - 1.2, '3. Улучшенный орк: жаркое — ×2.6 и сыт 60 с (2 пшеницы на порцию); пшеница → скотный двор → кухня → барак', '#ff9a70');
  fc = farmers(X0, y, 'wheat', 3);
  vec(X0 + 3, y, 1);
  put('barn', X0 + 4, y); leather(X0 + 4, y);
  vec(X0 + 6, y, 1);
  const k3 = put('kitchen', X0 + 7, y); k3.recipe = 'roast'; k3.fuel.add('coal', 40);
  vec(X0 + 9, y, 1);
  const bar3 = put('barracks', X0 + 10, y); bar3.inv.add('roast', 10); bar3.inv.add('berries', 4);
  water(X0 + 4, y + 2, 8);
  s = smelter(X0 + 14, y);
  { const w = orc(); assignWorker(w, s.f); }
  DEMO.lanes.push({ name: 'Орк на жарком', chest: s.out });
  label(X0 - 4, y + 6.2, 'землепашцы растят пшеницу; насос качает воду в скотный двор', '#c8e8a0');
  y += 12;

  // 4. довольный человек: та же кухня, плюс дом с мебелью, одеждой и обогревателем (уют 10)
  label(X0, y - 1.2, '4. Человек, доволен — уют ≥ 6 и жаркое; плавильня не его профиль: ×2.0 (в мастерской/скриптории — ×3.0)', '#a0d0ff');
  fc = farmers(X0, y, 'wheat', 3);
  vec(X0 + 3, y, 1);
  put('barn', X0 + 4, y); leather(X0 + 4, y);
  vec(X0 + 6, y, 1);
  const k4 = put('kitchen', X0 + 7, y); k4.recipe = 'roast'; k4.fuel.add('coal', 40);
  vec(X0 + 9, y, 1);
  const h4 = put('house', X0 + 10, y);
  h4.inv.add('roast', 10); h4.inv.add('furniture', 2); h4.inv.add('clothes', 2); h4.inv.add('heater', 1); h4.inv.add('coal', 30);
  water(X0 + 4, y + 2, 8);
  s = smelter(X0 + 14, y);
  { const w = addWorker('human'); assignWorker(w, s.f); }
  DEMO.lanes.push({ name: 'Человек доволен', chest: s.out });
  y += 12;

  // 5. недовольный человек: еда есть, уюта нет — работает без ускорения (×1)
  label(X0, y - 1.2, '5. Человек без уюта — еда есть, но работает без ускорения (×1), а через 10 мин устраивает саботаж', '#d0a0ff');
  const h5 = put('house', X0 + 10, y); h5.inv.add('roast', 40);
  s = smelter(X0 + 14, y);
  { const w = addWorker('human'); assignWorker(w, s.f); }
  DEMO.lanes.push({ name: 'Человек без уюта', chest: s.out });

  S.cheats = {};
  p.x = X0 + 23.5; p.y = Y0 + 20.5;
  CAM.x = p.x; CAM.y = p.y;
  for (let cy = -6; cy <= 6; cy++) for (let cx = -6; cx <= 6; cx++) getChunk(cx, cy);
  explore(p.x, p.y, 40);
  log('Полигон «Рабочие»: пять одинаковых плавилен. Сравните счётчики железа над линиями. Набегов и дани нет.', 'good');
}

// надписи над линиями и счётчики выплавки
function drawDemo() {
  if (!DEMO) return;
  const z = VIEW.z, fs = Math.max(11, Math.round(z * 0.32));
  G.save();
  G.font = `bold ${fs}px sans-serif`; G.textAlign = 'left'; G.textBaseline = 'middle';
  for (const l of DEMO.labels) {
    if (!inView(l.x + 8, l.y)) continue;
    const X = sx(l.x), Y = sy(l.y), w = G.measureText(l.text).width;
    G.fillStyle = 'rgba(10,8,6,0.65)'; G.fillRect(X - 4, Y - fs * 0.7, w + 8, fs * 1.4);
    G.fillStyle = l.col; G.fillText(l.text, X, Y);
  }
  const mins = Math.max(1 / 60, (S.time - DEMO.t0) / 60);
  for (const ln of DEMO.lanes) {
    const b = ln.chest;
    if (!b || !inView(b.x, b.y)) continue;
    const n = b.inv.count('iron');
    const txt = `железо: ${n} (${(n / mins).toFixed(1)}/мин)`;
    const X = sx(b.x + 1.3), Y = sy(b.y + 0.5), w = G.measureText(txt).width;
    G.fillStyle = 'rgba(10,8,6,0.7)'; G.fillRect(X - 4, Y - fs * 0.7, w + 8, fs * 1.4);
    G.fillStyle = '#ffe080'; G.fillText(txt, X, Y);
  }
  G.restore();
}
