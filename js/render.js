'use strict';
// Отрисовка мира на canvas.

const CAM = { x: 0.5, y: 0.5, zoom: 32 };
let CV, G, DPR = 1;
let VIEW = { ox: 0, oy: 0, z: 32, x0: 0, y0: 0, x1: 0, y1: 0 };

function initRender() {
  CV = document.getElementById('game');
  G = CV.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}
// качество графики: «высокое» — родное разрешение экрана, «среднее» — не выше 1:1, «низкое» — 75%
const QUALITY = { high: 1, medium: 0, low: -1 };
function resize() {
  const dev = window.devicePixelRatio || 1, q = (typeof SETTINGS !== 'undefined' && SETTINGS.quality) || 'high';
  DPR = q === 'high' ? dev : q === 'medium' ? Math.min(dev, 1) : Math.min(dev, 1) * 0.75;
  CV.width = Math.floor(innerWidth * DPR);
  CV.height = Math.floor(innerHeight * DPR);
}

function screenToWorld(sx, sy) {
  return { x: (sx * DPR - VIEW.ox) / VIEW.z, y: (sy * DPR - VIEW.oy) / VIEW.z };
}

function sx(x) { return Math.round(x * VIEW.z + VIEW.ox); }
function sy(y) { return Math.round(y * VIEW.z + VIEW.oy); }

function drawSprite(img, x, y, w, h, flip) {
  const X = sx(x), Y = sy(y), Wd = sx(x + w) - X, Ht = sy(y + h) - Y;
  if (flip) { G.save(); G.translate(X + Wd, Y); G.scale(-1, 1); G.drawImage(img, 0, 0, Wd, Ht); G.restore(); }
  else G.drawImage(img, X, Y, Wd, Ht);
}

function hpBar(x, y, w, frac, col) {
  const X = sx(x), Y = sy(y), Wd = Math.max(8, sx(x + w) - X), H = Math.max(2, VIEW.z / 10);
  G.fillStyle = '#000'; G.fillRect(X - 1, Y - 1, Wd + 2, H + 2);
  G.fillStyle = col || (frac > 0.5 ? '#6ac04a' : frac > 0.25 ? '#e0b030' : '#d04030');
  G.fillRect(X, Y, Wd * clamp(frac, 0, 1), H);
}

function render() {
  const p = S.player;
  // положение героя между шагами симуляции (плавность при любой частоте экрана); камера держит его в центре
  const far = p.px == null || Math.abs(p.x - p.px) + Math.abs(p.y - p.py) > 3;
  p.rx = far ? p.x : lerp(p.px, p.x, RALPHA); p.ry = far ? p.y : lerp(p.py, p.y, RALPHA);
  // слежение за другим игроком (выбран на карте) — камера на нём
  const fh = UI.follow != null ? mpOtherHeroes().find(h => h.id === UI.follow) : null;
  if (UI.follow != null && !fh) UI.follow = null;
  if (fh) { CAM.x = fh.x; CAM.y = fh.y; } else { CAM.x = p.rx; CAM.y = p.ry; }
  const z = CAM.zoom * DPR;
  const W = CV.width, H = CV.height;
  const shx = SHAKE > 0 ? rand(-SHAKE, SHAKE) * DPR : 0, shy = SHAKE > 0 ? rand(-SHAKE, SHAKE) * DPR : 0;
  VIEW.z = z;
  VIEW.ox = Math.round(W / 2 - CAM.x * z + shx);
  VIEW.oy = Math.round(H / 2 - CAM.y * z + shy);
  VIEW.x0 = Math.floor(-VIEW.ox / z) - 1; VIEW.x1 = Math.ceil((W - VIEW.ox) / z) + 1;
  VIEW.y0 = Math.floor(-VIEW.oy / z) - 1; VIEW.y1 = Math.ceil((H - VIEW.oy) / z) + 1;
  G.imageSmoothingEnabled = false;
  G.fillStyle = '#080604';
  G.fillRect(0, 0, W, H);

  const cx0 = Math.floor(VIEW.x0 / CHUNK), cx1 = Math.floor(VIEW.x1 / CHUNK);
  const cy0 = Math.floor(VIEW.y0 / CHUNK), cy1 = Math.floor(VIEW.y1 / CHUNK);
  const chunks = [];
  // не больше двух новых участков карты за кадр, чтобы при ходьбе не было рывков
  let budget = 1, patches = 4;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = getChunk(cx, cy);
    chunks.push(c);
    const X = sx(cx * CHUNK), Y = sy(cy * CHUNK);
    if (!c.canvas && budget > 0) { buildChunkCanvas(c); budget--; c.oldCanvas = null; c.dirtyRect = null; }
    else if (c.canvas && c.dirtyRect && patches-- > 0) { buildChunkCanvas(c, c.dirtyRect); c.dirtyRect = null; }
    const cv = c.canvas || c.oldCanvas;
    if (cv) G.drawImage(cv, X, Y, sx((cx + 1) * CHUNK) - X, sy((cy + 1) * CHUNK) - Y);
  }
  // соседние чанки — для построек 2×2 на границе
  const near = [];
  for (let cy = cy0 - 1; cy <= cy1; cy++) for (let cx = cx0 - 1; cx <= cx1; cx++) { const c = peekChunk(cx, cy); if (c) near.push(c); }

  if (UI.showPollution) drawPollution(cx0, cx1, cy0, cy1);

  // постройки: сначала плоские, потом предметы на конвейерах, потом всё объёмное по глубине
  const flat = [], tall = [];
  for (const c of near) for (const b of c.blds) {
    if (b.x + b.w < VIEW.x0 - 1 || b.x > VIEW.x1 + 1 || b.y + b.h < VIEW.y0 || b.y > VIEW.y1 + 4) continue;
    const k = BUILDINGS[b.type].kind;
    if (k === 'belt' || k === 'pipe' || k === 'shaft' || k === 'spikes' || k === 'road') flat.push(b); else tall.push(b);
  }
  for (const b of flat) drawBuilding(b);
  for (const b of flat) if (b.items) drawBeltItems(b);
  drawFloorItems();
  drawGhosts();
  const t = S.time;
  for (const c of CORPSES) if (inView(c.x, c.y)) drawCorpse(c);
  for (const c of WILD.carcasses) if (inView(c.x, c.y)) drawCarcass(c);

  // общий список глубины: деревья, камни, горы, постройки, лагеря и юниты сортируются по нижнему краю,
  // поэтому герой заходит за дерево или дом, а перед ними оказывается сверху
  const D = [];
  const lowQ = SETTINGS.quality === 'low';
  for (const b of tall) { if (!lowQ) drawBuildingShadow(b); D.push({ y: b.y + b.h, t: 1, o: b }); }
  for (const m of visibleMountains()) D.push({ y: m.y + 2, t: 2, o: m });
  collectResProps(D);
  if (VIEW.z < PROP_LOD_Z * DPR) drawPropLOD();
  collectCampStructs(D);
  for (const g of S.golems) if (!g.hidden && inView(g.x, g.y)) D.push({ y: g.y, t: 4, o: g });
  for (const e of S.enemies) if (inView(e.x, e.y)) D.push({ y: e.y, t: 5, o: e });
  if (S.merchant && inView(S.merchant.x, S.merchant.y)) D.push({ y: S.merchant.y, t: 6, o: 'merchant' });
  if (S.envoy && inView(S.envoy.x, S.envoy.y)) D.push({ y: S.envoy.y, t: 6, o: 'envoy' });
  D.push({ y: p.y, t: 7, o: p });
  for (const h of mpOtherHeroes()) if (inView(h.x, h.y)) D.push({ y: h.y, t: 9, o: h });
  for (const c of S.carts) if (inView(c.x, c.y)) D.push({ y: c.y + 0.3, t: 10, o: c });
  for (const w of S.workers) if (w.kind === 'human' && w.x != null && inView(w.x, w.y)) D.push({ y: w.y, t: 11, o: w });
  if (S.colossus && inView(S.colossus.x, S.colossus.y)) D.push({ y: S.colossus.y, t: 12, o: S.colossus });
  for (const a of WILD.animals) if (inView(a.x, a.y)) D.push({ y: a.y, t: 13, o: a });
  D.sort((a, b) => a.y - b.y);
  for (const d of D) {
    switch (d.t) {
      case 1: drawBuilding(d.o); if (d.o.spiders) for (const sp of d.o.spiders) drawSpider(sp, t); break;
      case 2: drawMountain(d.o); break;
      case 3: drawResProp(d.o); break;
      case 8: drawCampStruct(d.o); break;
      case 4: drawInterp(d.o, () => drawGolem(d.o, t)); break;
      case 5: drawInterp(d.o, () => drawEnemy(d.o, t)); break;
      case 6: { const m = S[d.o]; drawUnit3D(d.o, m.x, m.y, { ang: Math.atan2(p.y - m.y, p.x - m.x), anim: 'stance', t }); break; }
      case 7: drawPlayer(p, t); break;
      case 9: drawOtherHero(d.o, t); break;
      case 10: drawCart(d.o, t); break;
      case 11: drawTownsfolk(d.o, t); break;
      case 12: drawColossus(d.o, t); break;
      case 13: drawAnimal(d.o, t); break;
    }
  }
  drawBuilders(t);
  if (!lowQ) drawBirds(t); // на низком качестве — без мелких украшений
  drawDeconMarks();
  if (UI.alt) { for (const b of flat) drawAltInfo(b); for (const b of tall) drawAltInfo(b); }
  drawProjs();
  // эффекты
  for (const f of FX) drawFxParticle(f, z);
  G.globalAlpha = 1;
  drawClouds();
  drawNight();
  if (!lowQ) drawAmbient(t);
  drawDemo();
  drawFog();
  // текст
  G.font = `bold ${Math.round(11 * DPR)}px Segoe UI, sans-serif`;
  G.textAlign = 'center';
  for (const ft of FTEXT) {
    G.globalAlpha = clamp(ft.life, 0, 1);
    G.fillStyle = '#000'; G.fillText(ft.text, sx(ft.x) + 1, sy(ft.y) + 1);
    G.fillStyle = ft.c; G.fillText(ft.text, sx(ft.x), sy(ft.y));
  }
  G.globalAlpha = 1;
  drawPings(W, H);
  drawScreenAlerts(W, H);
  if (fh) { G.font = `bold ${Math.round(16 * DPR)}px Segoe UI, sans-serif`; G.textAlign = 'center'; G.fillStyle = '#000'; G.fillText(`👁 Следим за «${fh.name || 'Друг'}» — WASD или Esc: вернуться`, W / 2 + 1, Math.round(60 * DPR) + 1); G.fillStyle = '#ffe0a0'; G.fillText(`👁 Следим за «${fh.name || 'Друг'}» — WASD или Esc: вернуться`, W / 2, Math.round(60 * DPR)); }
  drawCursor();
  drawDeconHold();
  drawGolemZone();
  if (p.dead > 0) {
    // явно показываем, что герой погиб, а не «завис»
    G.fillStyle = 'rgba(40,0,0,0.35)'; G.fillRect(0, 0, W, H);
    G.font = `bold ${Math.round(28 * DPR)}px Segoe UI, sans-serif`; G.textAlign = 'center';
    G.fillStyle = '#000'; G.fillText('Анимансер пал. Возрождение на базе через ' + Math.ceil(p.dead) + '…', W / 2 + 2, H / 2 + 2);
    G.fillStyle = '#ffb0a0'; G.fillText('Анимансер пал. Возрождение на базе через ' + Math.ceil(p.dead) + '…', W / 2, H / 2);
  }
}

// пинги: пульсирующие кольца в мире с именем; за краем экрана — стрелка на краю
function drawPings(W, H) {
  if (!S.pings || !S.pings.length) return;
  S.pings = S.pings.filter(p => S.time - p.t < 12 && S.time >= p.t - 1);
  const now = performance.now();
  for (const p of S.pings) {
    const age = (now - p.rt) / 1000, a = clamp(1 - age / 12, 0, 1);
    let X = sx(p.x), Y = sy(p.y);
    const off = X < 20 || Y < 20 || X > W - 20 || Y > H - 20;
    G.save();
    if (off) {
      const cx = W / 2, cy = H / 2, ang = Math.atan2(Y - cy, X - cx), m = 30 * DPR;
      const k = Math.min((W / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
      X = cx + Math.cos(ang) * k; Y = cy + Math.sin(ang) * k;
      G.translate(X, Y); G.rotate(ang);
      G.fillStyle = `rgba(255,210,60,${a})`; G.beginPath(); G.moveTo(14 * DPR, 0); G.lineTo(-8 * DPR, -9 * DPR); G.lineTo(-8 * DPR, 9 * DPR); G.closePath(); G.fill();
      G.restore(); G.save();
    } else {
      for (let i = 0; i < 2; i++) {
        const ph = ((age * 1.2 + i * 0.5) % 1);
        G.strokeStyle = `rgba(255,210,60,${(a * (1 - ph)).toFixed(3)})`; G.lineWidth = 3 * DPR;
        G.beginPath(); G.ellipse(X, Y, VIEW.z * (0.3 + ph * 1.4), VIEW.z * (0.15 + ph * 0.7), 0, 0, 7); G.stroke();
      }
      G.fillStyle = `rgba(255,210,60,${a})`; G.beginPath(); G.moveTo(X, Y); G.lineTo(X - 8 * DPR, Y - 22 * DPR); G.lineTo(X + 8 * DPR, Y - 22 * DPR); G.closePath(); G.fill();
    }
    G.font = `bold ${Math.round(13 * DPR)}px Segoe UI, sans-serif`; G.textAlign = 'center';
    G.globalAlpha = a; G.fillStyle = '#000'; G.fillText(p.name, X + 1, Y - 26 * DPR + 1); G.fillStyle = '#ffe080'; G.fillText(p.name, X, Y - 26 * DPR);
    G.restore();
  }
}
// зона открытого голема (рамка или круг) и рамка, которую сейчас тянут
function drawGolemZone() {
  const g = UI.openG;
  G.save(); G.lineWidth = Math.max(2, VIEW.z * 0.05);
  if (g && UI.wins.golem && g.type === 'porter') {
    const { srcs, dsts } = porterLists(g);
    G.setLineDash([]);
    for (const [list, col] of [[srcs, '#ffa040'], [dsts, '#50e080']]) for (const b of list) { G.strokeStyle = col; G.strokeRect(sx(b.x), sy(b.y), sx(b.x + b.w) - sx(b.x), sy(b.y + b.h) - sy(b.y)); }
  }
  if (g && UI.wins.golem && g.type === 'fueler') {
    G.setLineDash([VIEW.z * 0.25, VIEW.z * 0.15]); G.strokeStyle = 'rgba(255,220,120,0.8)'; G.fillStyle = 'rgba(255,220,120,0.07)';
    if (g.zone) { const z = g.zone; G.fillRect(sx(z.x0), sy(z.y0), sx(z.x1 + 1) - sx(z.x0), sy(z.y1 + 1) - sy(z.y0)); G.strokeRect(sx(z.x0), sy(z.y0), sx(z.x1 + 1) - sx(z.x0), sy(z.y1 + 1) - sy(z.y0)); }
    else { G.beginPath(); G.arc(sx(g.hx), sy(g.hy), (g.type === 'fueler' ? FUELER.radius : GOLEM.radius) * VIEW.z, 0, 7); G.fill(); G.stroke(); }
  }
  const s = UI.zoneSel;
  if (s) {
    const x0 = Math.floor(Math.min(s.x0, s.x1)), x1 = Math.floor(Math.max(s.x0, s.x1)) + 1, y0 = Math.floor(Math.min(s.y0, s.y1)), y1 = Math.floor(Math.max(s.y0, s.y1)) + 1;
    const big = x1 - x0 > (g && g.type === 'fueler' ? FUELER_ZONE : 48) || y1 - y0 > (g && g.type === 'fueler' ? FUELER_ZONE : 48);
    G.setLineDash([]); G.strokeStyle = big ? '#ff6050' : '#ffd060'; G.fillStyle = big ? 'rgba(255,90,70,0.12)' : 'rgba(255,210,90,0.12)';
    G.fillRect(sx(x0), sy(y0), sx(x1) - sx(x0), sy(y1) - sy(y0)); G.strokeRect(sx(x0), sy(y0), sx(x1) - sx(x0), sy(y1) - sy(y0));
    G.font = `bold ${Math.round(14 * DPR)}px sans-serif`; G.textAlign = 'left'; G.fillStyle = '#fff'; G.fillText(`${x1 - x0}×${y1 - y0}`, sx(x1) + 4, sy(y1));
  }
  G.restore();
}
// красная виньетка при ранах (сильнее и с пульсом при совсем низком здоровье);
// последняя минута неуплаченной дани — мигающая фиолетовая рамка и надпись
function drawScreenAlerts(W, H) {
  const p = S.player;
  if (!(p.dead > 0)) {
    const k = p.hp / Math.max(1, playerMaxHp());
    if (k < 0.5) {
      const crit = k < 0.2;
      const pulse = crit ? 0.75 + Math.sin(performance.now() / 160) * 0.25 : 1;
      const a = clamp((0.5 - k) / 0.5, 0, 1) * (crit ? 0.85 : 0.55) * pulse;
      const r0 = Math.min(W, H) * (crit ? 0.18 : 0.32), r1 = Math.hypot(W, H) / 2;
      const gr = G.createRadialGradient(W / 2, H / 2, r0, W / 2, H / 2, r1);
      gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(0.6, `rgba(170,0,0,${(a * 0.5).toFixed(3)})`); gr.addColorStop(1, `rgba(120,0,0,${a.toFixed(3)})`);
      G.fillStyle = gr; G.fillRect(0, 0, W, H);
    }
  }
  const d = S.elves && S.elves.demand;
  if (d && d.deadline - S.time < 60 && d.deadline > S.time) {
    const on = Math.floor(performance.now() / 450) % 2 === 0, left = Math.ceil(d.deadline - S.time);
    const bw = Math.round(14 * DPR);
    G.save();
    // весь экран мигает фиолетовым по краям, к концу срока — сильнее
    const k = 1 - clamp(left / 60, 0, 1), a = (on ? 0.35 : 0.12) + k * 0.25;
    const gr = G.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
    gr.addColorStop(0, 'rgba(140,40,230,0)'); gr.addColorStop(1, `rgba(140,40,230,${a.toFixed(3)})`);
    G.fillStyle = gr; G.fillRect(0, 0, W, H);
    G.fillStyle = on ? 'rgba(170,60,255,0.55)' : 'rgba(120,40,200,0.25)';
    G.fillRect(0, 0, W, bw); G.fillRect(0, H - bw, W, bw); G.fillRect(0, 0, bw, H); G.fillRect(W - bw, 0, bw, H);
    G.font = `bold ${Math.round(22 * DPR)}px Segoe UI, sans-serif`; G.textAlign = 'center';
    const txt = `⚠ Дань эльфам не уплачена! Осталось ${left} с`;
    G.fillStyle = 'rgba(0,0,0,0.6)'; G.fillText(txt, W / 2 + 2, Math.round(90 * DPR) + 2);
    G.fillStyle = on ? '#e0a0ff' : '#b070ff'; G.fillText(txt, W / 2, Math.round(90 * DPR));
    G.restore();
    // звук: при входе в последнюю минуту и каждые 15 секунд
    const beat = Math.floor((60 - left) / 15);
    if (UI.tribWarn !== d.start + ':' + beat) { UI.tribWarn = d.start + ':' + beat; sfx('elf'); if (!beat) log('Осталась минута до срока дани эльфам! Заплатите (окно дани) или положите ценности на Алтарь дани.', 'elf'); }
  }
}
// туман войны: один холст на весь экран (1 пиксель = 1 клетка), растянутый со сглаживанием
const FOG = { cv: null, img: null, w: 0, h: 0 };
function drawFog() {
  const x0 = VIEW.x0 - 1, y0 = VIEW.y0 - 1;
  const w = VIEW.x1 - x0 + 2, h = VIEW.y1 - y0 + 2;
  if (!FOG.cv) FOG.cv = document.createElement('canvas');
  if (FOG.w !== w || FOG.h !== h) {
    FOG.cv.width = FOG.w = w; FOG.cv.height = FOG.h = h;
    FOG.img = FOG.cv.getContext('2d').createImageData(w, h);
    const d = FOG.img.data;
    for (let i = 0; i < w * h; i++) { d[i * 4] = 8; d[i * 4 + 1] = 6; d[i * 4 + 2] = 4; }
  }
  const d = FOG.img.data;
  let any = false;
  for (let ty = 0; ty < h; ty++) {
    const y = y0 + ty;
    const cy = Math.floor(y / CHUNK);
    const ly = ((y % CHUNK) + CHUNK) % CHUNK;
    let c = null, ccx = 1e9;
    for (let tx = 0; tx < w; tx++) {
      const x = x0 + tx;
      const cx = Math.floor(x / CHUNK);
      if (cx !== ccx) { ccx = cx; c = peekChunk(cx, cy); }
      const a = c && c.explored[ly * CHUNK + (((x % CHUNK) + CHUNK) % CHUNK)] ? 0 : 255;
      d[(ty * w + tx) * 4 + 3] = a;
      if (a) any = true;
    }
  }
  if (!any) return;
  FOG.cv.getContext('2d').putImageData(FOG.img, 0, 0);
  G.imageSmoothingEnabled = true;
  G.drawImage(FOG.cv, sx(x0), sy(y0), sx(x0 + w) - sx(x0), sy(y0 + h) - sy(y0));
  G.imageSmoothingEnabled = false;
}

function inView(x, y) { return x > VIEW.x0 - 1 && x < VIEW.x1 + 1 && y > VIEW.y0 - 1 && y < VIEW.y1 + 1; }

// карта загрязнения: мягкое облако по чанкам (жёлтое → бурое → красное), лагеря показывают, насколько они злы
let POLL_CV = null;
function drawPollution(cx0, cx1, cy0, cy1) {
  cx0 -= 1; cy0 -= 1; cx1 += 1; cy1 += 1;
  const w = cx1 - cx0 + 1, h = cy1 - cy0 + 1;
  if (!POLL_CV) POLL_CV = document.createElement('canvas');
  if (POLL_CV.width !== w || POLL_CV.height !== h) { POLL_CV.width = w; POLL_CV.height = h; }
  const g = POLL_CV.getContext('2d'), img = g.createImageData(w, h);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const v = POLL.get(ck(cx, cy)) || 0, k = ((cy - cy0) * w + (cx - cx0)) * 4;
    if (v < 0.03) continue;
    const t = clamp(v / 6, 0, 1);
    img.data[k] = 230; img.data[k + 1] = Math.round(200 - 170 * t); img.data[k + 2] = Math.round(60 - 40 * t); img.data[k + 3] = Math.round(60 + 120 * t);
  }
  g.putImageData(img, 0, 0);
  G.save(); G.imageSmoothingEnabled = true;
  G.drawImage(POLL_CV, 0.5, 0.5, w - 1, h - 1, sx(cx0 * CHUNK + CHUNK / 2), sy(cy0 * CHUNK + CHUNK / 2), sx((cx0 + w - 1) * CHUNK) - sx(cx0 * CHUNK), sy((cy0 + h - 1) * CHUNK) - sy(cy0 * CHUNK));
  G.restore();
  // подписи значений в центрах чанков
  G.font = `bold ${Math.round(11 * DPR)}px sans-serif`; G.textAlign = 'center';
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const v = POLL.get(ck(cx, cy)) || 0;
    if (v < 0.2) continue;
    G.fillStyle = 'rgba(0,0,0,0.6)'; G.fillText(v.toFixed(1), sx(cx * CHUNK + CHUNK / 2) + 1, sy(cy * CHUNK + CHUNK / 2) + 1);
    G.fillStyle = '#fff4e0'; G.fillText(v.toFixed(1), sx(cx * CHUNK + CHUNK / 2), sy(cy * CHUNK + CHUNK / 2));
  }
  // лагеря: злость от загрязнения (при 100% — сильная орда)
  for (const c of S.camps) {
    if (!c.alive || c.type === 'elf' || !inView(c.x, c.y)) continue;
    const anger = clamp((c.anger || 0) / 300, 0, 1), X = sx(c.x), Y = sy(c.y - 3);
    G.fillStyle = 'rgba(0,0,0,0.6)'; G.fillRect(X - 40 * DPR, Y - 9 * DPR, 80 * DPR, 18 * DPR);
    G.fillStyle = c.polluted ? '#ff6040' : '#8fd070'; G.fillRect(X - 38 * DPR, Y + 4 * DPR, 76 * DPR * anger, 3 * DPR);
    G.fillStyle = '#fff'; G.fillText(c.polluted ? `злость ${Math.round(anger * 100)}%` : 'спокоен', X, Y + 2 * DPR);
  }
}

function drawBuilding(b) {
  const def = BUILDINGS[b.type];
  const t = S.time;
  if (def.kind === 'road') { drawRoad(b); return; }
  if (def.kind === 'wall') {
    drawWallB(b);
    if (b.hp < b.maxHp) hpBar(b.x + 0.1, b.y - 0.95, 0.8, b.hp / b.maxHp);
    return;
  }
  if (def.kind === 'belt' && def.split) { if (!drawBelt3D(b, def, t)) drawSprite(beltSprites(b.type, b)[b.dir][0], b.x, b.y, 1, 1); drawSplitterSides(b, t); }
  else if (def.kind === 'belt' && drawBelt3D(b, def, t)) {
    // подземный конвейер без пары — красный «?»: дальше предела не соединяется
    if (def.under && b.id && !b.pair && !b.exitOf && VIEW.z >= 16) { G.fillStyle = 'rgba(255,80,60,0.9)'; G.font = `bold ${Math.round(VIEW.z * 0.4)}px sans-serif`; G.textAlign = 'center'; G.fillText('?', sx(b.x + 0.5), sy(b.y + 0.35)); }
  }
  else if (def.kind === 'belt' && (b.type === 'belt' || b.type === 'fastbelt')) drawBeltArt(b, def, t);
  else if (def.kind === 'shaft') { drawShaftArt(b, t); if (b.hp < b.maxHp) hpBar(b.x + 0.1, b.y - 0.15, 0.8, b.hp / b.maxHp); return; }
  else if (def.kind === 'belt') {
    const fr = beltSprites(b.type, b)[b.dir];
    drawSprite(fr[Math.floor(t * def.speed * 4) % 4], b.x, b.y, 1, 1);
  } else if (def.kind === 'vector') {
    if (!drawProp('build', b.type + '_' + b.dir, b.x, b.y)) drawSprite(SPR.b[b.type][b.dir], b.x, b.y, 1, 1);
    drawVectorArm(b, def);
    { const vf = vecFilters(b); if (vf && UI.zoomedIn()) drawSprite(SPR.item[vf[0]], b.x + 0.6, b.y + 0.6, 0.36, 0.36); }
    if (b.status === 'нет топлива' || b.status === 'нет энергии') statusIcon(b, b.status === 'нет топлива' ? '🔥' : '⚡');
  } else if (b.type === 'cave_entrance' && b.done && drawProp('build', 'cave_entrance_done', b.x, b.y)) {
    // пройденное подземелье: вход завален камнями
  } else if (def.mobile && drawGuardian(b, def, t)) {
    // подвижный страж: рисуется своим кодом
  } else if (drawProp('build', def.rotates ? b.type + '_' + (b.dir || 0) : def.sprite || b.type, b.x, b.y, def.spriteScale ? { scale: def.spriteScale } : null)) {
    if (def.weapon && def.weapon.archers) drawTowerArchers(b, def, t);
    if (b.type === 'ballista') drawBallistaArms(b, t);
    if (def.beltIn && def.sprite) drawInMark(b);
    if (b.type === 'treadwheel') drawWheelRunner(b, t);
    propFx(b, def, t);
    drawBuildingOverlays(b, def, t);
  } else if (b.type === 'pipe') {
    drawPipe(b);
    drawBuildingOverlays(b, def, t);
  } else {
    let img = SPR.b[b.type];
    drawSprite(img, b.x, b.y, b.w, b.h);
    if (def.kind === 'gen' && def.wind) {
      G.save();
      const cx = sx(b.x + 1), cy = sy(b.y + 0.55);
      G.translate(cx, cy); G.rotate(t * WIND * 2);
      const s = VIEW.z * 1.9;
      G.drawImage(SPR.blades, -s / 2, -s / 2, s, s);
      G.restore();
    }
    if (def.kind === 'pipe' && b.fnet >= 0 && FNETS[b.fnet] && FNETS[b.fnet].fluid && FNETS[b.fnet].amount > 0.5) {
      G.fillStyle = FLUIDS[FNETS[b.fnet].fluid].color;
      G.fillRect(sx(b.x), sy(b.y + 0.4), sx(b.x + 1) - sx(b.x), Math.max(1, VIEW.z * 0.2));
    }
    drawBuildingFx(b, t);
    drawBuildingOverlays(b, def, t);
  }
  if (b.hp < b.maxHp) hpBar(b.x + 0.1, b.y - 0.15, b.w - 0.2, b.hp / b.maxHp);
}

// акведук: каменный жёлоб к каждому соседу, с которым он соединён (прямо, поворот, развилка, крест),
// внутри — вода (синяя) или смола (бурая), если в сети что-то есть
function pipeLinks(b) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const nb = bldAt(b.x + DIRS[d][0], b.y + DIRS[d][1]);
    out.push(!!nb && (isFluidConductor(nb) || BUILDINGS[nb.type].kind === 'machine' && (nb.fnets || []).includes(b.fnet) || !!BUILDINGS[nb.type].water));
  }
  if (!out.some(Boolean)) { out[1] = out[3] = true; } // одиночный — лежит горизонтально
  else if (out.filter(Boolean).length === 1) { const d = out.indexOf(true); out[(d + 2) % 4] = true; } // тупик — прямой отрезок
  return out;
}
function drawPipe(b) {
  const z = VIEW.z, X = sx(b.x), Y = sy(b.y), c = z / 2, L = pipeLinks(b);
  const net = b.fnet >= 0 && FNETS[b.fnet], fl = net && net.fluid && net.amount > 0.5 ? FLUIDS[net.fluid].color : null;
  const seg = (w, col) => {
    G.fillStyle = col;
    G.fillRect(X + c - w / 2, Y + c - w / 2, w, w);
    if (L[0]) G.fillRect(X + c - w / 2, Y, w, c);
    if (L[2]) G.fillRect(X + c - w / 2, Y + c, w, c);
    if (L[3]) G.fillRect(X, Y + c - w / 2, c, w);
    if (L[1]) G.fillRect(X + c, Y + c - w / 2, c, w);
  };
  seg(z * 0.56, '#5a564e');           // тень и края жёлоба
  seg(z * 0.48, '#9a9488');           // камень
  seg(z * 0.28, '#3a3632');           // канал
  if (fl) seg(z * 0.2, fl);            // жидкость
  // стыки плит поперёк жёлоба
  G.fillStyle = 'rgba(0,0,0,0.18)';
  if (L[1] || L[3]) G.fillRect(X + z * 0.04, Y + c - z * 0.24, Math.max(1, z * 0.03), z * 0.48);
  if (L[0] || L[2]) G.fillRect(X + c - z * 0.24, Y + z * 0.04, z * 0.48, Math.max(1, z * 0.03));
}
// значки над постройкой: рецепт, нехватка энергии/топлива, рабочие
function drawBuildingOverlays(b, def, t) {
  if (def.push && UI.zoomedIn()) {
    // стрелка выхода бура
    const [ox, oy] = drillOutTile(b), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const ax = sx((cx + ox + 0.5) / 2), ay = sy((cy + oy + 0.5) / 2);
    G.save(); G.translate(ax, ay); G.rotate((b.dir || 0) * Math.PI / 2 - Math.PI / 2);
    G.fillStyle = 'rgba(255,200,60,0.95)'; G.strokeStyle = '#000'; G.lineWidth = Math.max(1, VIEW.z * 0.03);
    const s = VIEW.z * 0.22; G.beginPath(); G.moveTo(s, 0); G.lineTo(-s * 0.6, -s * 0.7); G.lineTo(-s * 0.6, s * 0.7); G.closePath(); G.fill(); G.stroke();
    G.restore();
  }
  if (def.kind === 'machine' && b.recipe && !def.fixed) {
    const out = Object.keys(RECIPES[b.recipe].out)[0];
    if (out && UI.zoomedIn()) drawSprite(SPR.item[out], b.x + b.w - 0.55, b.y + 0.05, 0.5, 0.5);
  }
  if (b.status === 'нет энергии') statusIcon(b, '⚡');
  else if (b.status === 'нет топлива') statusIcon(b, '🔥');
  else if (b.status === 'нет боеприпасов') statusIcon(b, '🏹');
  if (b.sabotage && S.time < b.sabotage) statusIcon(b, '💢');
  const wk = workerAtB(b.id);
  if (wk) drawWorkerAt(b, wk, t);
}

// рабочий у машины: стоит у её края лицом к ней и трудится (орк машет, человек колдует над механизмом);
// над головой — имя и итоговое ускорение, голодный орк показывает миску
function drawWorkerAt(b, w, t) {
  const orc = w.kind === 'orc';
  const x = b.x + b.w * 0.5 + (orc ? -0.35 : 0.35), y = b.y + b.h + 0.12;
  const busy = b.active !== false && !(b.sabotage && S.time < b.sabotage) && (orc ? w.fed : w.happy);
  G.save(); G.globalAlpha = 0.3; G.fillStyle = '#000'; G.beginPath(); G.ellipse(sx(x), sy(y), VIEW.z * 0.22, VIEW.z * 0.09, 0, 0, 7); G.fill(); G.restore();
  drawUnit3D(orc ? 'orc_brute' : 'merchant', x, y, { ang: -Math.PI / 2, anim: busy ? 'swing' : 'stance', t: t + w.id * 0.37, scale: orc ? 0.78 : 0.75 });
  if (busy && Math.random() < 0.05) FX.push({ x: x + rand(-0.15, 0.15), y: y - 0.55, vx: rand(-0.3, 0.3), vy: rand(-0.8, -0.4), life: 0.4, c: orc ? '#ffb040' : '#9fe8ff', s: 0.05 });
  if (VIEW.z < 34) return;
  const m = workerMult(b), fs = Math.max(10, Math.round(VIEW.z * 0.24));
  const txt = `${orc ? 'Орк' : 'Мастер'} ${w.name} ×${m.toFixed(1)}`;
  G.save(); G.font = `bold ${fs}px sans-serif`; G.textAlign = 'center';
  const X = sx(x), Y = sy(y - 1.15), tw = G.measureText(txt).width;
  G.fillStyle = 'rgba(10,8,6,0.6)'; G.fillRect(X - tw / 2 - 4, Y - fs * 0.85, tw + 8, fs * 1.2);
  G.fillStyle = !busy ? '#ff8a70' : workerFits(w, b) ? (orc ? '#ffd080' : '#a0e0ff') : '#d8d0b0';
  G.fillText(txt, X, Y);
  G.restore();
  if (orc && !w.fed) statusIcon({ x: x - 0.5, y: y - 1.6, w: 1, h: 1 }, '🍖');
  else if (!orc && !w.happy) statusIcon({ x: x - 0.5, y: y - 1.6, w: 1, h: 1 }, '😠');
}

// оживление объёмных построек: дым из труб, отблеск огня, крутящаяся шестерня у машин на валу
const SMOKY = { furnace: 1, forge: 1, kitchen: 1, alchemy: 1, efurnace: 0.5, treadwheel: 0, bdrill: 0.6, steamengine: 1.4, kiln: 0.8 };
function propFx(b, def, t) {
  if (b.type === 'torch') {
    // язычок пламени и искры
    const fx = b.x + 0.5, fy = b.y + 0.5 - 0.92, fl = 1 + Math.sin(t * 17 + b.id) * 0.12 + Math.sin(t * 29) * 0.06;
    G.save(); G.globalCompositeOperation = 'lighter';
    const gr = G.createRadialGradient(sx(fx), sy(fy), 0, sx(fx), sy(fy), VIEW.z * 0.28 * fl);
    gr.addColorStop(0, 'rgba(255,230,140,0.95)'); gr.addColorStop(0.5, 'rgba(255,140,40,0.6)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
    G.fillStyle = gr; G.beginPath(); G.arc(sx(fx), sy(fy), VIEW.z * 0.28 * fl, 0, 7); G.fill(); G.restore();
    if (Math.random() < 0.06) FX.push({ x: fx + rand(-0.05, 0.05), y: fy, vx: rand(-0.2, 0.2), vy: rand(-1.2, -0.6), life: rand(0.4, 0.8), c: pick(['#ffd060', '#ff9030']), s: 0.04 });
    return;
  }
  let on = b.active === true;
  if (def.kind === 'gen') on = (b.pot || 0) > 0 && (b.load || 0) > 0;
  if (!on) return;
  const top = propTop('build', b.type, b.y);
  if (SMOKY[b.type] && Math.random() < 0.12 * SMOKY[b.type]) FX.push({ x: b.x + b.w * (0.3 + Math.random() * 0.4), y: top + 0.3, vx: rand(-0.15, 0.15), vy: rand(-0.9, -0.5), life: rand(1.2, 2), c: pick(['rgba(90,86,80,0.5)', 'rgba(120,116,110,0.45)', 'rgba(70,66,62,0.5)']), s: rand(0.18, 0.3) });
  if (def.fuel && def.kind === 'machine' && VIEW.z >= 30) {
    // отблеск огня у основания
    const fl = 0.5 + Math.sin(t * 13 + b.id) * 0.15 + Math.sin(t * 7.3) * 0.1;
    const cx = sx(b.x + b.w / 2), cy = sy(b.y + b.h - 0.1), R = VIEW.z * b.w * 0.55;
    G.save(); G.globalCompositeOperation = 'lighter';
    const grd = G.createRadialGradient(cx, cy, 0, cx, cy, R);
    grd.addColorStop(0, `rgba(255,140,40,${(fl * 0.4).toFixed(2)})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    G.fillStyle = grd; G.fillRect(cx - R, cy - R, R * 2, R * 2);
    G.restore();
  }
  if ((def.power || def.kind === 'gen') && VIEW.z >= 22) drawRotating(SPR.gearRotIron, b, 0.86, 0.2, 0.2, t * 2 + b.id);
}

// полупрозрачный призрак постройки (выбор места, вставка чертежа)
function drawBuildingGhost(type, x, y, dir) {
  const def = BUILDINGS[type];
  if (def.kind === 'mgolem') { drawUnit3D(type, x + 0.5, y + 0.8, { ang: Math.PI / 2, anim: 'stance', t: 0 }); return; }
  if (def.kind === 'belt') { if (!drawBelt3D({ type, dir, x, y }, def, 0)) drawSprite(beltSprites(type)[dir][0], x, y, 1, 1); return; }
  if (def.kind === 'road') { G.fillStyle = '#8a857a'; G.fillRect(sx(x), sy(y), VIEW.z, VIEW.z); return; }
  if (def.kind === 'shaft') {
    // вал и подземный вал — как настоящие (подземный: вход или выход — по тому, есть ли свободный вход позади)
    const fake = { type, x, y, dir, net: -1, w: 1, h: 1 };
    if (def.under) { const ent = underEntryFor(type, x, y, dir); if (ent && ent.ok) fake.exitOf = ent.b.id; else fake.pair = -1; }
    else { fake._sm = DIRS[dir][0] ? 3 : 12; fake._smv = BLD_VER; }
    drawShaftArt(fake, 0);
    if (def.under) { G.save(); G.translate(sx(x + 0.5), sy(y + 0.5)); G.rotate(dir * Math.PI / 2); G.strokeStyle = '#ffd060'; G.lineWidth = Math.max(2, VIEW.z * 0.06); const s = VIEW.z * 0.18; G.beginPath(); G.moveTo(-s, s * 0.4 - VIEW.z * 0.3); G.lineTo(0, -s * 0.6 - VIEW.z * 0.3); G.lineTo(s, s * 0.4 - VIEW.z * 0.3); G.stroke(); G.restore(); }
    return;
  }
  if (def.kind === 'cart') { drawProp('build', 'cart_' + dir, x, y); return; }
  if (def.rotates) { drawProp('build', type + '_' + dir, x, y); return; }
  if (def.kind === 'vector') { if (!drawProp('build', type + '_' + dir, x, y)) drawSprite(SPR.b[type][dir], x, y, 1, 1); return; }
  if (def.kind === 'wall') { if (!drawProp('build', 'wall_' + (type === 'stonewall' ? 'stone' : 'wood') + '_10', x, y)) drawSprite(SPR.b[type], x, y, 1, 1); return; }
  if (!drawProp('build', def.sprite || type, x, y, def.spriteScale ? { scale: def.spriteScale, alpha: G.globalAlpha } : null)) drawSprite(SPR.b[type], x, y, def.size[0], def.size[1]);
  else if (def.beltIn && def.sprite) drawInMark({ x, y, w: def.size[0], h: def.size[1] });
}
// исполин: идёт вперевалку (покачивание и наклон), перед ударом поднимается, потом с размаху приседает
function drawGuardian(b, def, t) {
  const st = propSet('build', 'guardian'), it = st && st.items.guardian, img = it && S3D.img[st.file];
  if (!img) return false;
  const w = def.weapon, ox = b.gox || 0, oy = b.goy || 0;
  const ph = b.cd > 0 ? 1 - b.cd / w.cd : 1; // 0 сразу после удара → 1 к следующему
  const wind = b.status === 'стреляет' && b.cd < 0.45 ? (0.45 - b.cd) / 0.45 : 0; // замах перед ударом
  const hit = ph < 0.12 ? 1 - ph / 0.12 : 0; // приседание после удара
  const step = b.gwalk ? Math.sin(b.gstep || 0) : 0;
  const lift = wind * 0.28 + Math.abs(step) * 0.08 - hit * 0.08, tilt = step * 0.06 + (b.gface || 1) * (b.gwalk ? 0.03 : 0);
  const s = VIEW.z / st.ppt, [x, y, ww, hh, bx, by] = it;
  const baseX = sx(b.x + ox + b.w / 2), baseY = sy(b.y + oy + b.h);
  // тень остаётся на земле
  G.save(); G.globalAlpha = 0.25; G.fillStyle = '#000'; G.beginPath(); G.ellipse(baseX, baseY - VIEW.z * 0.3, VIEW.z * 0.9 * (1 - lift * 0.4), VIEW.z * 0.35, 0, 0, 7); G.fill(); G.restore();
  G.save();
  G.translate(baseX, baseY - lift * VIEW.z); G.rotate(tilt); G.scale(1 + hit * 0.06, 1 - hit * 0.08);
  G.imageSmoothingEnabled = true;
  G.drawImage(img, x, y, ww, hh, -bx * s - b.w / 2 * VIEW.z, -by * s - b.h * VIEW.z, ww * s, hh * s);
  G.restore();
  if (hit > 0.6 && !b._slamFx) { b._slamFx = true; spawnBurst(b.x + ox + b.w / 2, b.y + oy + b.h, '#8a7a6a', 6); }
  if (hit === 0) b._slamFx = false;
  return true;
}
// лучники на башне (если у неё несколько): големы с арбалетами смотрят на свою цель
function drawTowerArchers(b, def, t) {
  if (VIEW.z < 18) return;
  const top = propTop('build', def.sprite || 'archer', b.y);
  const ty = b.y + (top - b.y) * (def.spriteScale || 1) + 0.55;
  for (let k = 0; k < def.weapon.archers; k++) {
    const bw = b.w || 1, x = def.weapon.archers === 1 ? b.x + bw / 2 : b.x + bw * (0.225 + k * 0.275), y = ty + (k === 1 ? -0.1 : 0.12);
    drawUnit3D('garcher', x, y, { ang: b.aim != null ? b.aim : Math.PI / 2, anim: b.status === 'стреляет' && b.cd > def.weapon.cd - 0.3 ? 'swing' : 'stance', t: t + k * 0.3 + b.id, k: b.cd > def.weapon.cd - 0.3 ? 1 - (b.cd - def.weapon.cd + 0.3) / 0.3 : null, scale: bw > 1 ? 0.55 : 0.45 });
  }
}
// баллиста: тяжёлые плечи лука на вершине башни, повёрнуты к цели
function drawBallistaArms(b, t) {
  const top = propTop('build', 'archer', b.y);
  const X = sx(b.x + 0.5), Y = sy(top + 0.25), a = b.aim != null ? b.aim : -Math.PI / 2, L = VIEW.z * 0.55;
  G.save(); G.translate(X, Y); G.rotate(a);
  G.strokeStyle = '#4a2e14'; G.lineWidth = Math.max(2, VIEW.z * 0.09);
  G.beginPath(); G.moveTo(-L * 0.5, 0); G.lineTo(L * 0.6, 0); G.stroke();
  G.strokeStyle = '#7a5028'; G.lineWidth = Math.max(2, VIEW.z * 0.07);
  G.beginPath(); G.moveTo(L * 0.35, -L * 0.6); G.quadraticCurveTo(L * 0.6, 0, L * 0.35, L * 0.6); G.stroke();
  G.strokeStyle = '#e8dcbc'; G.lineWidth = 1; const pull = b.cd > 1.6 ? 0 : L * 0.25;
  G.beginPath(); G.moveTo(L * 0.35, -L * 0.6); G.lineTo(L * 0.1 - pull, 0); G.lineTo(L * 0.35, L * 0.6); G.stroke();
  G.restore();
}
// метка «вход»: синяя воронка со стрелкой вниз на крышке сундука
function drawInMark(b) {
  const cx = sx(b.x + b.w / 2), cy = sy(b.y + 0.2), s = VIEW.z * 0.2;
  G.save();
  G.fillStyle = 'rgba(70,150,255,0.95)'; G.strokeStyle = '#0c1a30'; G.lineWidth = Math.max(1, VIEW.z * 0.03);
  G.beginPath(); G.moveTo(cx - s, cy - s * 0.9); G.lineTo(cx + s, cy - s * 0.9); G.lineTo(cx + s * 0.35, cy); G.lineTo(cx + s * 0.35, cy + s * 0.6); G.lineTo(cx - s * 0.35, cy + s * 0.6); G.lineTo(cx - s * 0.35, cy); G.closePath();
  G.fill(); G.stroke();
  G.restore();
}

// альт-режим: что делает каждая постройка
function altBadge(id, cx, cy, size, n) {
  const R = VIEW.z * size * 0.62;
  G.fillStyle = 'rgba(20,14,10,0.72)'; G.beginPath(); G.arc(sx(cx), sy(cy), R, 0, 7); G.fill();
  G.strokeStyle = 'rgba(232,184,74,0.7)'; G.lineWidth = Math.max(1, VIEW.z * 0.03); G.stroke();
  const img = SPR.item[id];
  if (img) drawSprite(img, cx - size / 2, cy - size / 2, size, size);
  if (n != null) {
    G.font = `bold ${Math.max(9, Math.round(VIEW.z * 0.28))}px Segoe UI, sans-serif`; G.textAlign = 'right';
    const t = fmtNum(n), X = sx(cx + size * 0.62), Y = sy(cy + size * 0.6);
    G.fillStyle = '#000'; G.fillText(t, X + 1, Y + 1); G.fillStyle = '#fff'; G.fillText(t, X, Y);
  }
}
function altArrow(x0, y0, x1, y1, col) {
  const X0 = sx(x0), Y0 = sy(y0), X1 = sx(x1), Y1 = sy(y1), a = Math.atan2(Y1 - Y0, X1 - X0), L = VIEW.z * 0.18;
  G.strokeStyle = col; G.lineWidth = Math.max(1.5, VIEW.z * 0.06);
  G.beginPath(); G.moveTo(X0, Y0); G.lineTo(X1, Y1);
  G.moveTo(X1, Y1); G.lineTo(X1 - Math.cos(a - 0.5) * L, Y1 - Math.sin(a - 0.5) * L);
  G.moveTo(X1, Y1); G.lineTo(X1 - Math.cos(a + 0.5) * L, Y1 - Math.sin(a + 0.5) * L);
  G.stroke();
}
function topItem(inv) { let best = null, n = 0; if (inv) for (const id in inv.c) if (inv.c[id] > n) { n = inv.c[id]; best = id; } return best ? [best, n] : null; }
function drawAltInfo(b) {
  const def = BUILDINGS[b.type], cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  switch (def.kind) {
    case 'machine': {
      let out = null;
      if (def.crafts === 'drill') { const r = drillRecipe(b); out = r && Object.keys(r.out)[0]; }
      else { const r = b.curRecipe || (b.recipe && RECIPES[b.recipe]); out = r && Object.keys(r.out)[0]; }
      if (out) altBadge(out, cx, cy, b.w * 0.5);
      break;
    }
    case 'lab': { const cur = S.research.cur; if (cur) { const f = Object.keys(TECHS[cur].cost); altBadge(f[f.length - 1], cx, cy, 0.9); } break; }
    case 'chest': case 'barracks': case 'house': { const t = topItem(b.inv); if (t) altBadge(t[0], cx, cy, Math.min(b.w, 1) * 0.6, b.inv.n); break; }
    case 'tower': { const t = topItem(b.inv); if (t) altBadge(t[0], cx, cy, 0.55, t[1]); break; }
    case 'gen': if (b.fuel) { const t = topItem(b.fuel); if (t) altBadge(t[0], cx, cy, 0.7, t[1]); } break;
    case 'belt': {
      const [dx, dy] = DIRS[b.dir];
      altArrow(cx - dx * 0.3, cy - dy * 0.3, cx + dx * 0.3, cy + dy * 0.3, 'rgba(255,255,255,0.75)');
      if (b.pair) { const o = S.buildings.get(b.pair); if (o) { G.setLineDash([4, 4]); altArrow(cx, cy, o.x + 0.5, o.y + 0.5, 'rgba(232,184,74,0.6)'); G.setLineDash([]); } }
      break;
    }
    case 'vector': {
      const r = def.reach || 1, [dx, dy] = DIRS[b.dir];
      altArrow(cx - dx * r * 0.9, cy - dy * r * 0.9, cx + dx * r * 0.9, cy + dy * r * 0.9, 'rgba(90,255,192,0.85)');
      if (b.filter) altBadge(b.filter, cx, cy, 0.45);
      break;
    }
  }
}

function statusIcon(b, ch) {
  if (Math.floor(S.time * 2) % 2) return;
  G.font = `${Math.round(VIEW.z * 0.45)}px sans-serif`;
  G.textAlign = 'center';
  G.fillText(ch, sx(b.x + b.w / 2), sy(b.y + b.h / 2 + 0.2));
}

// набор кадров конвейера: у подземного свой для входа и выхода
// рука вектора: плечо на голове голема, локоть и клешня; несёт предмет дугой от оранжевой клетки к зелёной
const ARM_COL = { bvector: '#6a8ac8', vector: '#a08868', fvector: '#7a9a60', lvector: '#9a7048', mvector: '#9aa6b8', svector: '#c8a050' };
function drawVectorArm(b, def) {
  const z = VIEW.z, [dx, dy] = DIRS[b.dir], reach = def.reach || 1;
  const k = b.prog * 2 - 1; // -1 — над источником, +1 — над целью
  const shX = b.x + 0.5, shY = b.y + 0.5 - 0.42;
  const hx = b.x + 0.5 + dx * k * reach * 0.85, hyG = b.y + 0.5 + dy * k * reach * 0.85;
  const lift = 0.22 + Math.sin(b.prog * Math.PI) * 0.3;
  const hy = hyG - lift;
  const ex = (shX + hx) / 2 - dy * 0.12, ey = Math.min(shY, hy) - 0.28;
  const pts = [[sx(shX), sy(shY)], [sx(ex), sy(ey)], [sx(hx), sy(hy)]];
  G.lineCap = 'round'; G.lineJoin = 'round';
  // издалека — упрощённо: одна линия и предмет
  if (z < 30) {
    G.strokeStyle = ARM_COL[b.type] || '#a08868'; G.lineWidth = Math.max(1.5, z * 0.09);
    G.beginPath(); G.moveTo(pts[0][0], pts[0][1]); G.lineTo(pts[1][0], pts[1][1]); G.lineTo(pts[2][0], pts[2][1]); G.stroke();
    if (b.hand) drawSprite(SPR.item[b.hand], hx - 0.22, hy - 0.05, 0.44, 0.44);
    return;
  }
  const line = (w, c) => { G.strokeStyle = c; G.lineWidth = Math.max(1.5, z * w); G.beginPath(); G.moveTo(pts[0][0], pts[0][1]); G.lineTo(pts[1][0], pts[1][1]); G.lineTo(pts[2][0], pts[2][1]); G.stroke(); };
  // тень руки на земле
  G.strokeStyle = 'rgba(0,0,0,0.18)'; G.lineWidth = Math.max(1, z * 0.08); G.beginPath(); G.moveTo(sx(shX + 0.1), sy(b.y + 0.55)); G.lineTo(sx(hx + 0.1), sy(hyG + 0.05)); G.stroke();
  line(0.13, '#2a2018'); line(0.08, ARM_COL[b.type] || '#a08868');
  G.fillStyle = '#5affc0'; G.beginPath(); G.arc(pts[1][0], pts[1][1], Math.max(1.5, z * 0.05), 0, 7); G.fill();
  if (b.hand) drawSprite(SPR.item[b.hand], hx - 0.22, hy - 0.05, 0.44, 0.44);
  // клешня
  G.strokeStyle = '#2a2018'; G.lineWidth = Math.max(1, z * 0.05);
  G.beginPath(); G.moveTo(pts[2][0] - z * 0.08, pts[2][1] + z * 0.1); G.lineTo(pts[2][0], pts[2][1]); G.lineTo(pts[2][0] + z * 0.08, pts[2][1] + z * 0.1); G.stroke();
}

// откуда вектор берёт (оранжевая клетка) и куда кладёт (зелёная), со стрелкой
function vectorMarks(x, y, dir, r) {
  const [dx, dy] = DIRS[dir], z = VIEW.z;
  const mark = (tx, ty, col, txt) => {
    G.fillStyle = col.replace('1)', '0.22)'); G.fillRect(sx(tx), sy(ty), z, z);
    G.strokeStyle = col; G.lineWidth = Math.max(2, z * 0.06); G.strokeRect(sx(tx) + 1, sy(ty) + 1, z - 2, z - 2);
    if (z >= 26) { G.font = `bold ${Math.round(Math.max(10, z * 0.22))}px sans-serif`; G.textAlign = 'center'; G.lineWidth = 3; G.strokeStyle = '#000'; G.strokeText(txt, sx(tx + 0.5), sy(ty + 0.9)); G.fillStyle = '#fff'; G.fillText(txt, sx(tx + 0.5), sy(ty + 0.9)); }
  };
  mark(x - dx * r, y - dy * r, 'rgba(255,170,60,1)', 'берёт');
  mark(x + dx * r, y + dy * r, 'rgba(90,255,150,1)', 'кладёт');
  // стрелка через вектор
  const ax = sx(x + 0.5 - dx * r * 0.6), ay = sy(y + 0.5 - dy * r * 0.6), bx = sx(x + 0.5 + dx * r * 0.6), by = sy(y + 0.5 + dy * r * 0.6);
  G.strokeStyle = 'rgba(255,255,255,0.85)'; G.lineWidth = Math.max(2, z * 0.07); G.lineCap = 'round';
  G.beginPath(); G.moveTo(ax, ay); G.lineTo(bx, by); G.stroke();
  const ang = Math.atan2(by - ay, bx - ax), hl = z * 0.22;
  G.beginPath(); G.moveTo(bx, by); G.lineTo(bx - Math.cos(ang - 0.5) * hl, by - Math.sin(ang - 0.5) * hl); G.moveTo(bx, by); G.lineTo(bx - Math.cos(ang + 0.5) * hl, by - Math.sin(ang + 0.5) * hl); G.stroke();
}

// конвейеры в 3D: лента с планками (4 кадра движения), разделитель и арки подземного конвейера
function drawBelt3D(b, def, t) {
  const [dx, dy] = DIRS[b.dir];
  let key;
  if (def.split) key = 'splitter_' + b.dir;
  else if (def.under) key = (b.exitOf ? 'ubelt_out_' : 'ubelt_in_') + b.dir;
  else {
    // анимация идёт только от энергии; у призрака (нет id) лента стоит
    // лента бежит спокойно (вдвое медленнее прежнего), без энергии — еле ползёт
    const sat = b.id ? beltSat(b) : 0;
    b._ph = ((b._ph || 0) + (t - (b._pt || t)) * def.speed / 0.5 * sat) % 1; b._pt = t;
    const ci = b.id ? beltCI(b) : -1;
    const f = Math.floor(b._ph * 4) % 4;
    if (ci >= 0) key = b.type + '_c' + ci + b.dir + f;
    else key = b.type + '_' + (dx ? 'h' : 'v') + (dx < 0 || dy < 0 ? (4 - f) % 4 : f);
  }
  if (!drawProp('build', key, b.x, b.y)) return false;
  // светящаяся руна-стрелка по ходу ленты
  if (!def.split && !def.under && VIEW.z >= 30 && !(b.id && beltCI(b) >= 0)) {
    const z = VIEW.z;
    G.save(); G.translate(sx(b.x + 0.5), sy(b.y + 0.42)); G.rotate(b.dir * Math.PI / 2);
    G.strokeStyle = b.type === 'fastbelt' ? 'rgba(160,230,255,0.5)' : 'rgba(120,255,200,0.4)'; G.lineWidth = Math.max(1, z * 0.05);
    G.beginPath(); G.moveTo(-z * 0.13, z * 0.06); G.lineTo(0, -z * 0.08); G.lineTo(z * 0.13, z * 0.06); G.stroke();
    G.restore();
  }
  return true;
}
// предметы на полу: россыпь значков по клетке (до 10)
function drawFloorItems() {
  if (!S.floor) return;
  const s = 0.34;
  for (const k in S.floor) {
    const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1);
    if (x < VIEW.x0 - 1 || x > VIEW.x1 || y < VIEW.y0 - 1 || y > VIEW.y1) continue;
    const f = S.floor[k];
    let n = 0;
    for (const id in f) for (let j = 0; j < f[id] && n < 10; j++, n++) {
      const px = x + 0.15 + hash2(x * 13 + n, y, 71) * 0.5, py = y + 0.15 + hash2(x, y * 13 + n, 73) * 0.5;
      G.fillStyle = 'rgba(0,0,0,0.25)'; G.beginPath(); G.ellipse(sx(px + s / 2), sy(py + s * 0.9), VIEW.z * s * 0.45, VIEW.z * s * 0.15, 0, 0, 7); G.fill();
      if (SPR.item[id]) drawSprite(SPR.item[id], px, py, s, s);
    }
  }
}
// разделитель: к конвейерам, уходящим вбок (и приходящим сбоку), — рукав ленты от середины до края клетки
function drawSplitterSides(b, t) {
  const z = VIEW.z;
  for (const d of [(b.dir + 1) % 4, (b.dir + 3) % 4, (b.dir + 2) % 4]) {
    const [dx, dy] = DIRS[d], nb = bldAt(b.x + dx, b.y + dy);
    if (!isBelt(nb) || BUILDINGS[nb.type].split) continue;
    const out = nb.dir === d, inn = nb.dir === (d + 2) % 4;
    if (!out && !inn) continue;
    if (d === (b.dir + 2) % 4) continue; // сзади вход и так нарисован моделью
    const X = sx(b.x + 0.5), Y = sy(b.y + 0.5), m = z * 0.36;
    G.save(); G.translate(X, Y); G.rotate(Math.atan2(dy, dx));
    G.fillStyle = '#3a2a1c'; G.fillRect(z * 0.2, -m, z * 0.3 + 1, m * 2);
    G.fillStyle = '#5e4630'; G.fillRect(z * 0.2, -m * 0.75, z * 0.3 + 1, m * 1.5);
    const sp = (t * BUILDINGS[b.type].speed * (out ? 1 : -1) * (b.id ? beltSat(b) : 0)) % 1;
    G.fillStyle = '#8a6a48';
    for (let i = 0; i < 3; i++) { const p = z * 0.2 + (((i / 3 + sp) % 1) + 1) % 1 * z * 0.3; G.fillRect(p, -m * 0.75, Math.max(1, z * 0.06), m * 1.5); }
    G.fillStyle = '#6e5034'; G.fillRect(z * 0.2, -m, z * 0.3 + 1, Math.max(1, z * 0.06)); G.fillRect(z * 0.2, m - Math.max(1, z * 0.06), z * 0.3 + 1, Math.max(1, z * 0.06));
    G.strokeStyle = 'rgba(120,255,200,0.6)'; G.lineWidth = Math.max(1, z * 0.05);
    const ax = out ? z * 0.32 : z * 0.18, s2 = out ? 1 : -1;
    G.beginPath(); G.moveTo(ax - s2 * z * 0.08, -z * 0.1); G.lineTo(ax + s2 * z * 0.04, 0); G.lineTo(ax - s2 * z * 0.08, z * 0.1); G.stroke();
    G.restore();
  }
}
// конвейер: деревянная рама, бегущие планки и светящиеся руны-стрелки (запасной вариант без спрайтов)
function drawBeltArt(b, def, t) {
  const z = VIEW.z, X = sx(b.x), Y = sy(b.y);
  const [dx, dy] = DIRS[b.dir], horiz = dx !== 0;
  const fast = b.type === 'fastbelt';
  G.fillStyle = '#3a2a1c'; G.fillRect(X, Y, z, z);
  // полотно
  const m = z * 0.12;
  G.fillStyle = fast ? '#5a6270' : '#5e4630';
  if (horiz) G.fillRect(X, Y + m, z, z - m * 2); else G.fillRect(X + m, Y, z - m * 2, z);
  // планки бегут по направлению
  const n = 4, off = ((t * def.speed) % 1 + 1) % 1;
  G.fillStyle = fast ? '#8a96a8' : '#8a6a48';
  for (let i = -1; i < n; i++) {
    let k = (i + off) / n; if (dx < 0 || dy < 0) k = 1 - k;
    const p = k * z;
    if (p < -z * 0.1 || p > z) continue;
    if (horiz) G.fillRect(X + p, Y + m, Math.max(1, z * 0.1), z - m * 2); else G.fillRect(X + m, Y + p, z - m * 2, Math.max(1, z * 0.1));
  }
  // бортики
  G.fillStyle = fast ? '#3a4250' : '#6e5034';
  if (horiz) { G.fillRect(X, Y, z, m); G.fillRect(X, Y + z - m, z, m); } else { G.fillRect(X, Y, m, z); G.fillRect(X + z - m, Y, m, z); }
  G.fillStyle = 'rgba(0,0,0,0.35)';
  if (horiz) G.fillRect(X, Y + z - m * 0.4, z, m * 0.4); else G.fillRect(X + z - m * 0.4, Y, m * 0.4, z);
  // руна-стрелка
  if (z >= 30) {
    G.save(); G.translate(X + z / 2, Y + z / 2); G.rotate(b.dir * Math.PI / 2);
    G.strokeStyle = fast ? 'rgba(140,220,255,0.55)' : 'rgba(110,255,190,0.45)'; G.lineWidth = Math.max(1, z * 0.07);
    G.beginPath(); G.moveTo(-z * 0.16, z * 0.08); G.lineTo(0, -z * 0.1); G.lineTo(z * 0.16, z * 0.08); G.stroke();
    G.restore();
  }
}
// деревянный вал: тонкая ось на козлах-опорах; к соседям тянется ось, в центре — вращающаяся втулка со спицами
// Валы: дубовая ось с железными обручами на каменных опорах, на развилках — редуктор с шестернёй.
// Каждая плитка рисуется один раз в маленький холст (форма × кадр вращения × масштаб), в кадре — один drawImage.
const SHAFT_CACHE = new Map(), SHAFT_FRAMES = 8;
let SHAFT_Z = 0;
function shaftMask(b) {
  if (b._smv === BLD_VER) return b._sm;
  // младшие 4 бита — куда идёт ось (к валу или к постройке), старшие — где сосед именно вал (для редуктора на развилке)
  const link = (x, y) => { const o = bldAt(x, y); return !!o && o !== b && (isPowerConductor(o) || !!BUILDINGS[o.type].power); };
  const sh = (x, y) => { const o = bldAt(x, y); return !!o && o !== b && BUILDINGS[o.type].kind === 'shaft'; };
  let m = (link(b.x - 1, b.y) ? 1 : 0) | (link(b.x + 1, b.y) ? 2 : 0) | (link(b.x, b.y - 1) ? 4 : 0) | (link(b.x, b.y + 1) ? 8 : 0);
  const s = (sh(b.x - 1, b.y) ? 1 : 0) | (sh(b.x + 1, b.y) ? 2 : 0) | (sh(b.x, b.y - 1) ? 4 : 0) | (sh(b.x, b.y + 1) ? 8 : 0);
  if (!m) m = 3;
  b._sm = m | (s << 4); b._smv = BLD_VER;
  return b._sm;
}
function shaftTile(mm, f, zp) {
  const key = mm * 64 + f, m = mm & 15, ss = (mm >> 4) & 15, pillar = !(mm & 256);
  let c = SHAFT_CACHE.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = zp;
  const g = c.getContext('2d'), z = zp, cx = z / 2, cy = z / 2, w = Math.max(3, z * 0.24);
  const L = m & 1, R = m & 2, U = m & 4, D = m & 8, horiz = L || R, vert = U || D;
  const straight = (m === 3 || m === 12);
  // редуктор — только там, где сходятся валы (угол или развилка из валов); отвод к постройке — муфтой без шестерни
  const nS = (ss & 1) + (ss >> 1 & 1) + (ss >> 2 & 1) + (ss >> 3 & 1);
  const gearbox = nS >= 3 || nS === 2 && ss !== 3 && ss !== 12;
  const off = f / SHAFT_FRAMES; // доля оборота
  // ось: тень, дерево с бликом, волокна, бегущие железные обручи
  const axle = (hz, a0, a1) => {
    const len = a1 - a0;
    if (len <= 0) return;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    if (hz) g.fillRect(a0, cy - w / 2 + z * 0.1, len, w); else g.fillRect(cx - w / 2 + z * 0.06, a0 + z * 0.04, w, len);
    const gr = hz ? g.createLinearGradient(0, cy - w / 2, 0, cy + w / 2) : g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    gr.addColorStop(0, '#f0c888'); gr.addColorStop(0.3, '#c89050'); gr.addColorStop(0.75, '#8a5a2c'); gr.addColorStop(1, '#4e3016');
    g.fillStyle = gr;
    if (hz) g.fillRect(a0, cy - w / 2, len, w); else g.fillRect(cx - w / 2, a0, w, len);
    g.fillStyle = 'rgba(90,52,20,0.35)';
    if (hz) g.fillRect(a0, cy + w * 0.12, len, Math.max(1, w * 0.1)); else g.fillRect(cx + w * 0.12, a0, Math.max(1, w * 0.1), len);
    const step = z * 0.5, bw = Math.max(1, z * 0.07);
    for (let k = -1; k < 3; k++) {
      const p = a0 + ((k + off) * step) - (a0 % step);
      if (p + bw < a0 || p > a1) continue;
      const p0 = Math.max(a0, p), p1 = Math.min(a1, p + bw);
      const bg = hz ? g.createLinearGradient(0, cy - w / 2, 0, cy + w / 2) : g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      bg.addColorStop(0, '#e4e8ee'); bg.addColorStop(0.4, '#9aa0aa'); bg.addColorStop(1, '#3e424a');
      g.fillStyle = bg;
      if (hz) g.fillRect(p0, cy - w / 2 - 1, p1 - p0, w + 2); else g.fillRect(cx - w / 2 - 1, p0, w + 2, p1 - p0);
    }
  };
  if (straight && pillar) {
    // каменная опора под осью — через клетку, чтобы длинный вал не был частоколом
    const bx = cx - z * 0.17, by = cy - z * 0.02, bwid = z * 0.34, bh = z * 0.3;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + z * 0.04, by + z * 0.06, bwid, bh);
    g.fillStyle = '#8c8880'; g.fillRect(bx, by, bwid, bh);
    g.fillStyle = '#b4b0a6'; g.fillRect(bx, by, bwid, Math.max(1, bh * 0.28));
    g.fillStyle = '#5e5a54'; g.fillRect(bx, by + bh - Math.max(1, bh * 0.18), bwid, Math.max(1, bh * 0.18));
  }
  if (horiz) axle(true, L ? 0 : cx, R ? z : cx);
  if (vert) axle(false, U ? 0 : cy, D ? z : cy);
  if (straight && !gearbox) {
    // латунная втулка подшипника
    const hw = z * 0.12, gr = m === 3 ? g.createLinearGradient(0, cy - w / 2, 0, cy + w / 2) : g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.5, '#c8962e'); gr.addColorStop(1, '#6a4a10');
    g.fillStyle = gr;
    if (m === 3) g.fillRect(cx - hw / 2, cy - w / 2 - 2, hw, w + 4); else g.fillRect(cx - w / 2 - 2, cy - hw / 2, w + 4, hw);
  } else if (!gearbox) {
    // муфта: железный диск на стыке осей
    const r = Math.max(2, z * 0.15);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(cx + z * 0.03, cy + z * 0.05, r, 0, 7); g.fill();
    g.fillStyle = '#6e737c'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = '#a8aeb8'; g.beginPath(); g.arc(cx - r * 0.2, cy - r * 0.25, r * 0.55, 0, 7); g.fill();
    g.fillStyle = '#3a3e46';
    for (let i = 0; i < 4; i++) { const a = off * Math.PI * 2 / 4 + i * Math.PI / 2; g.fillRect(cx + Math.cos(a) * r * 0.62 - 1, cy + Math.sin(a) * r * 0.62 - 1, 2, 2); }
  } else {
    // редуктор на развилке валов: дубовый короб с железными уголками и шестерня сверху
    const s = z * 0.46, x0 = cx - s / 2, y0 = cy - s / 2;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + z * 0.04, y0 + z * 0.06, s, s);
    g.fillStyle = '#5e3c20'; g.fillRect(x0, y0, s, s);
    g.fillStyle = '#7e5430'; g.fillRect(x0 + 1, y0 + 1, s - 2, s * 0.42);
    g.strokeStyle = '#2e1c0c'; g.lineWidth = Math.max(1, z * 0.025); g.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
    g.fillStyle = '#4a4e56'; const rv = Math.max(1.5, z * 0.05);
    for (const [ax, ay] of [[x0, y0], [x0 + s - rv, y0], [x0, y0 + s - rv], [x0 + s - rv, y0 + s - rv]]) g.fillRect(ax, ay, rv, rv);
    const r = s * 0.34;
    g.save(); g.translate(cx, cy - z * 0.02); g.rotate(off * Math.PI / 4);
    g.fillStyle = '#a88a4a';
    for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * Math.PI / 4); g.fillRect(-r * 0.16, -r * 1.18, r * 0.32, r * 0.36); g.restore(); }
    g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.fillStyle = '#6e5828'; g.beginPath(); g.arc(0, 0, r * 0.55, 0, 7); g.fill();
    g.fillStyle = '#2e3238'; g.beginPath(); g.arc(0, 0, r * 0.22, 0, 7); g.fill();
    g.restore();
  }
  // у постройки — фланец на краю клетки
  const stub = m & ~ss;
  g.fillStyle = '#4a4e56';
  const fw = Math.max(2, z * 0.06), fh = w + Math.max(2, z * 0.08);
  if (stub & 1) g.fillRect(0, cy - fh / 2, fw, fh);
  if (stub & 2) g.fillRect(z - fw, cy - fh / 2, fw, fh);
  if (stub & 4) g.fillRect(cx - fh / 2, 0, fh, fw);
  if (stub & 8) g.fillRect(cx - fh / 2, z - fw, fh, fw);
  SHAFT_CACHE.set(key, c);
  return c;
}
function drawShaftArt(b, t) {
  const X = sx(b.x), Y = sy(b.y), Wd = sx(b.x + 1) - X, Ht = sy(b.y + 1) - Y;
  if (BUILDINGS[b.type].under) { drawUnderShaft(b, t, X, Y, Wd, Ht); return; }
  const zp = Math.max(4, Math.round(VIEW.z));
  if (zp !== SHAFT_Z) { SHAFT_CACHE.clear(); SHAFT_Z = zp; }
  const on = b.net >= 0 && NETS[b.net] && NETS[b.net].supply > 0;
  const f = on ? Math.floor(t * 10 + b.x * 0.37 + b.y * 0.21) % SHAFT_FRAMES : 0;
  G.drawImage(shaftTile(shaftMask(b) | ((b.x + b.y) & 1 ? 256 : 0), f < 0 ? f + SHAFT_FRAMES : f, zp), X, Y, Wd, Ht);
}

// подземный вал: ось уходит в каменный портал (вход) или выходит из него (выход)
function drawUnderShaft(b, t, X, Y, W, H) {
  const [dx, dy] = DIRS[b.dir], exit = !!b.exitOf, z = W;
  const on = b.net >= 0 && NETS[b.net] && NETS[b.net].supply > 0;
  // со стороны, откуда ось приходит над землёй — половинка оси; портал — с другой стороны
  const side = exit ? 1 : -1; // вход: ось сзади; выход: ось спереди
  const ax = dx * side, ay = dy * side, zp = Math.max(4, Math.round(VIEW.z));
  if (zp !== SHAFT_Z) { SHAFT_CACHE.clear(); SHAFT_Z = zp; }
  const f = on ? Math.floor(t * 10 + b.x * 0.37 + b.y * 0.21) % SHAFT_FRAMES : 0;
  // половина прямой оси — со стороны, где вал идёт над землёй
  G.save(); G.beginPath();
  if (dx) G.rect(ax < 0 ? X : X + W / 2, Y, W / 2, H); else G.rect(X, ay < 0 ? Y : Y + H / 2, W, H / 2);
  G.clip();
  G.drawImage(shaftTile(dx ? 3 : 12, f < 0 ? f + SHAFT_FRAMES : f, zp), X, Y, W, H);
  G.restore();
  // каменный портал
  const px = X + W / 2 - dx * side * W * 0.1, py = Y + H / 2 - dy * side * H * 0.1, r = W * 0.34;
  G.fillStyle = 'rgba(0,0,0,0.3)'; G.beginPath(); G.ellipse(px + W * 0.05, py + H * 0.12, r, r * 0.7, 0, 0, 7); G.fill();
  G.fillStyle = '#7a756c'; G.beginPath(); G.ellipse(px, py, r, r * 0.8, 0, 0, 7); G.fill();
  G.fillStyle = '#9a958a'; G.beginPath(); G.ellipse(px, py - r * 0.15, r * 0.8, r * 0.55, 0, 0, 7); G.fill();
  G.fillStyle = '#1a1612'; G.beginPath(); G.ellipse(px + dx * side * -r * 0.15, py + dy * side * -r * 0.12, r * 0.42, r * 0.36, 0, 0, 7); G.fill();
  G.fillStyle = '#c8962e'; G.beginPath(); G.arc(px, py, Math.max(1.5, r * 0.18), 0, 7); G.fill();
  if (!b.pair && !b.exitOf) { G.fillStyle = 'rgba(255,80,60,0.8)'; G.font = `bold ${Math.round(z * 0.4)}px sans-serif`; G.textAlign = 'center'; G.fillText('?', X + W / 2, Y + H * 0.35); }
}
// кто крутит беговое колесо: голем или орк бегут внутри, пока колесо даёт энергию
function drawWheelRunner(b, t) {
  const orc = workerAt(b.id, 'orc');
  if (!orc && !b.wheelGolem) return;
  const run = (b.pot || 0) > 0 && (b.load || 0) > 0;
  drawUnit3D(orc ? 'orc_brute' : 'golem', b.x + 1, b.y + 1.15, { ang: 0, anim: run ? 'run' : 'stance', t: t * (orc ? 1.2 : 1) + b.id, scale: orc ? 0.62 : 0.66 });
}
function beltSprites(type, b) {
  if (BUILDINGS[type].under) return b && b.exitOf ? SPR.ubelt_out : SPR.ubelt_in;
  return SPR[type];
}

// предметы на конвейерах: все значки с тенью заранее в одном атласе под текущий масштаб —
// в кадре один drawImage на предмет из одной текстуры (видеокарта рисует их пачкой)
const BELT_ATLAS = { z: 0, cv: null, s: 0, h: 0, at: new Map(), n: 0 };
function beltItemCell(id) {
  let p = BELT_ATLAS.at.get(id);
  if (p) return p;
  const A = BELT_ATLAS, z = A.z, s = A.s, h = A.h, cols = 16;
  if (!A.cv) { A.cv = document.createElement('canvas'); A.cv.width = cols * s; A.cv.height = Math.ceil((Object.keys(ITEMS).length + 8) / cols) * h; }
  const x = (A.n % cols) * s, y = Math.floor(A.n / cols) * h; A.n++;
  const g = A.cv.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + s * 0.52, y + s * 0.86, z * 0.14, z * 0.06, 0, 0, 7); g.fill();
  g.imageSmoothingEnabled = false;
  g.drawImage(SPR.item[id] || SPR.item.stone, x + s * 0.04, y, z * 0.36, z * 0.36);
  p = [x, y]; A.at.set(id, p);
  return p;
}
function drawBeltItems(b) {
  const A = BELT_ATLAS, zp = Math.round(VIEW.z);
  if (zp !== A.z) { A.z = zp; A.s = Math.max(4, Math.round(zp * 0.4)); A.h = Math.round(A.s * 1.1); A.cv = null; A.at.clear(); A.n = 0; }
  const ox = VIEW.z * 0.2, oy = VIEW.z * 0.22, s = A.s, h = A.h;
  for (const it of b.items) {
    if (it.p > 1) continue; // ушёл под землю
    const [ix, iy] = beltLanePoint(b, it.p, it.l), c = beltItemCell(it.id);
    G.drawImage(A.cv, c[0], c[1], s, h, Math.round(sx(ix) - ox), Math.round(sy(iy) - oy), s, h);
  }
}

// голем: шагает (run), работает (swing в такт ударам), стоит (stance)
function drawGolem(g, t) {
  const moving = (g.state === 'walk' || g.state === 'return' || g.state === 'fetch' || g.state === 'tomine' || g.state === 'flee' || g.state === 'tofuel' || g.state === 'pfrom' || g.state === 'pto') && g._px != null && (Math.abs(g.x - g._px) + Math.abs(g.y - g._py)) > 1e-4;
  const working = g.state === 'work';
  // фаза удара: замах → удар → отдача (примерно 2.5 удара на единицу добычи)
  const ph = working ? ((g.anim || 0) * GOLEM.rate * golemMult(g) * 2.5) % 1 : 0;
  // направление: к цели работы или по ходу движения
  if (working) g.ang = Math.atan2(g.ty + 0.5 - g.y, g.tx + 0.5 - g.x);
  else if (g._px != null && (Math.abs(g.x - g._px) + Math.abs(g.y - g._py)) > 1e-4) g.ang = Math.atan2(g.y - g._py, g.x - g._px);
  g._px = g.x; g._py = g.y;
  const anim = working ? 'swing' : moving ? 'run' : 'stance';
  drawUnit3D(g.type, g.x, g.y, { ang: g.ang != null ? g.ang : Math.PI / 2, anim, t: t + g.id * 0.31, k: working ? ph : null });
  if (working) {
    // искры/щепки в момент удара
    if (g._ph !== undefined && g._ph < 0.6 && ph >= 0.6) {
      const r = resAt(g.tx, g.ty);
      spawnBurst(g.tx + 0.5, g.ty + 0.5, r === RES_ID.tree ? '#c8a060' : r === RES_ID.coal ? '#303030' : '#d8d0c0', 3);
    }
  }
  g._ph = ph;
  // полоски: прогресс добычи и заполненность ноши
  const by = g.y - 1.25;
  if (working) hpBar(g.x - 0.35, by, 0.7, g.work, '#e8b84a');
  if (g.n > 0) {
    hpBar(g.x - 0.35, by + (working ? 0.13 : 0), 0.7, g.n / golemCap(g), '#8ac0ff');
    if (g.carry) drawSprite(SPR.item[g.carry], g.x - 0.72, by - 0.12, 0.34, 0.34);
  }
  if (g.hp != null && g.hp < golemMaxHp(g)) hpBar(g.x - 0.35, by - 0.13, 0.7, g.hp / golemMaxHp(g));
  if (g.core) { G.save(); G.globalCompositeOperation = 'lighter'; G.fillStyle = `rgba(${GOLEM_CORES[g.core].col},0.35)`; G.beginPath(); G.ellipse(sx(g.x), sy(g.y), VIEW.z * 0.42, VIEW.z * 0.2, 0, 0, 7); G.fill(); G.restore(); }
  if (g.fuel <= 0 && Math.floor(t * 2) % 2) { G.font = `${Math.round(VIEW.z * 0.4)}px sans-serif`; G.textAlign = 'center'; G.fillText('🔥', sx(g.x), sy(g.y - 1.4)); }
  else if (g.state === 'flee' && Math.floor(t * 2) % 2) { G.font = `${Math.round(VIEW.z * 0.4)}px sans-serif`; G.textAlign = 'center'; G.fillText('🛡', sx(g.x), sy(g.y - 1.4)); }
  else if (g.noPath && Math.floor(t * 2) % 2) { G.font = `${Math.round(VIEW.z * 0.4)}px sans-serif`; G.textAlign = 'center'; G.fillText('🚧', sx(g.x), sy(g.y - 1.4)); }
}

// летающий моб: тень на земле, тёмные крылья-взмахи, красный глаз
function drawFlyer(e, d, t) {
  const h = e.flyH || 1.1, X = sx(e.x), Y = sy(e.y - h), z = VIEW.z;
  G.fillStyle = 'rgba(0,0,0,0.22)'; G.beginPath(); G.ellipse(sx(e.x), sy(e.y), z * 0.2, z * 0.08, 0, 0, 7); G.fill();
  const flap = Math.sin((e.flap || t) * 14 + e.id) * 0.5, w = z * 0.42, s = Math.cos(e.ang || 0) < 0 ? -1 : 1;
  G.save(); G.translate(X, Y); G.scale(s, 1);
  G.fillStyle = e.flash > 0 ? '#ffffff' : '#2a2420';
  G.beginPath(); G.moveTo(-w * 0.1, 0); G.quadraticCurveTo(-w * 0.6, -w * (0.3 + flap), -w, -w * flap * 0.6); G.quadraticCurveTo(-w * 0.5, w * 0.05, -w * 0.1, w * 0.1); G.fill();
  G.beginPath(); G.moveTo(w * 0.1, 0); G.quadraticCurveTo(w * 0.6, -w * (0.3 + flap), w, -w * flap * 0.6); G.quadraticCurveTo(w * 0.5, w * 0.05, w * 0.1, w * 0.1); G.fill();
  G.beginPath(); G.ellipse(0, w * 0.05, w * 0.26, w * 0.13, 0, 0, 7); G.fill();
  G.fillStyle = '#4a3a2a'; G.beginPath(); G.arc(w * 0.24, -w * 0.02, w * 0.1, 0, 7); G.fill();
  G.fillStyle = '#d8a040'; G.beginPath(); G.moveTo(w * 0.32, -w * 0.02); G.lineTo(w * 0.46, w * 0.03); G.lineTo(w * 0.32, w * 0.06); G.fill();
  G.fillStyle = '#ff3020'; G.fillRect(w * 0.25, -w * 0.06, Math.max(1, z * 0.03), Math.max(1, z * 0.03));
  G.restore();
  if (e.hp < e.maxHp) hpBar(e.x - 0.3, e.y - h - 0.45, 0.6, e.hp / e.maxHp, '#d04030');
}
function drawEnemy(e, t) {
  const d = ENEMIES[e.type];
  if (d.fly) { drawFlyer(e, d, t); return; }
  if (d.prop) {
    // осадная машина — объёмная модель в 4 направлениях
    const a = e.ang != null ? e.ang : Math.PI / 2, dir = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 1 : 3) : (Math.sin(a) > 0 ? 2 : 0);
    const kick = e.atkT != null && e.atkT < 0.3 ? Math.sin(e.atkT / 0.3 * Math.PI) * 0.12 : 0;
    drawProp('build', d.prop + '_' + dir, e.x - 0.5 + Math.cos(a) * kick, e.y - 0.5 + Math.sin(a) * kick, e.flash > 0 ? { flash: true } : null);
    if (e.hp < e.maxHp) hpBar(e.x - 0.55, e.y - 1.3, 1.1, e.hp / e.maxHp, '#d04030');
    return;
  }
  if (d.boss) {
    G.globalAlpha = 0.35; G.fillStyle = '#a040ff';
    G.beginPath(); G.ellipse(sx(e.x), sy(e.y), VIEW.z * 1.2, VIEW.z * 0.6, 0, 0, 7); G.fill(); G.globalAlpha = 1;
  }
  const dur = ATK_ANIM[e.type] || 0.4;
  const atkK = e.atkT != null && e.atkT < dur ? e.atkT / dur : -1;
  const kbk = e.kbT > 0 ? e.kbT / 0.18 : 0;
  let anim = 'stance', ak = null;
  if (atkK >= 0) { anim = ENEMY_ATK[e.type] || 'swing'; ak = atkK; }
  else if (e.kbT > 0.04) { anim = 'hit'; ak = 1 - e.kbT / 0.18; }
  else if (e.moving) anim = 'run';
  const ex = e.x + (e.kbx || 0) * kbk, ey = e.y + (e.kby || 0) * kbk;
  drawUnit3D(e.type, ex, ey, { ang: e.ang != null ? e.ang : Math.PI / 2, anim, t: t + e.id * 0.37, k: ak, flash: e.flash > 0 || (d.scale && Math.sin(t * 6 + e.id) > 0.85), scale: d.scale });
  const top = unitTop(e.type);
  if (e.stun > 0) { G.font = `${Math.round(VIEW.z * 0.4)}px sans-serif`; G.textAlign = 'center'; G.fillText('💫', sx(e.x), sy(e.y - top - 0.15)); }
  if (e.sentry && e.alarmK > 0) {
    // дозорный поднимает тревогу: «!» и кольцо, которое заполняется
    const X = sx(e.x), Y = sy(e.y - top - 0.55), R = VIEW.z * 0.28;
    G.save(); G.lineWidth = Math.max(2, VIEW.z * 0.07);
    G.strokeStyle = 'rgba(0,0,0,0.5)'; G.beginPath(); G.arc(X, Y, R, 0, 7); G.stroke();
    G.strokeStyle = e.alarmed ? '#ff3020' : '#ffb020'; G.beginPath(); G.arc(X, Y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, e.alarmK)); G.stroke();
    G.font = `bold ${Math.round(VIEW.z * 0.42)}px sans-serif`; G.textAlign = 'center'; G.textBaseline = 'middle';
    G.fillStyle = e.alarmed ? '#ff3020' : '#ffd040'; G.fillText('!', X, Y + 1); G.restore();
  }
  if (e.hp < e.maxHp) { const w = Math.max(0.7, d.size); hpBar(e.x - w / 2, e.y - top - 0.1, w, e.hp / e.maxHp, d.boss ? '#a040ff' : '#d04030'); }
}
// горгулья-паук из гнезда: тельце с лапками и светящимися глазами
function drawSpider(s, t) {
  const X = sx(s.x), Y = sy(s.y - 0.15), r = VIEW.z * 0.16, k = Math.sin(t * 18 + s.x * 5) * 0.25;
  G.fillStyle = 'rgba(0,0,0,0.25)'; G.beginPath(); G.ellipse(X + r * 0.4, sy(s.y) , r * 1.4, r * 0.5, 0, 0, 7); G.fill();
  G.strokeStyle = '#2a3e50'; G.lineWidth = Math.max(1, VIEW.z * 0.04);
  G.beginPath();
  for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
    const a = (i - 1.5) * 0.45 + (i % 2 ? k : -k);
    G.moveTo(X, Y); G.lineTo(X + sd * r * 1.3 * Math.cos(a), Y + r * 0.9 * Math.sin(a) - r * 0.3); G.lineTo(X + sd * r * 1.8 * Math.cos(a), Y + r * 1.1 * Math.sin(a) + r * 0.4);
  }
  G.stroke();
  G.fillStyle = '#3a6a8a'; G.beginPath(); G.ellipse(X, Y, r, r * 0.8, 0, 0, 7); G.fill();
  G.fillStyle = '#9fe8ff'; G.fillRect(X - r * 0.45, Y - r * 0.3, r * 0.3, r * 0.3); G.fillRect(X + r * 0.15, Y - r * 0.3, r * 0.3, r * 0.3);
}
// высота персонажа в клетках (над ногами)
function unitTop(kind) {
  const u = SPRITES3D.units[UNIT3D[kind]];
  if (!u) return 1;
  if (u._top == null) u._top = u.anims.stance.f[2][0][5] / u.ppt;
  return u._top;
}

// нарисовать объект в промежуточной точке между шагами симуляции
function drawInterp(o, fn) {
  if (o.ipx == null || Math.abs(o.x - o.ipx) + Math.abs(o.y - o.ipy) > 2) { fn(); return; }
  const x = o.x, y = o.y;
  o.x = lerp(o.ipx, x, RALPHA); o.y = lerp(o.ipy, y, RALPHA);
  try { fn(); } finally { o.x = x; o.y = y; }
}
function drawPlayer(p, t) {
  const X = p.rx != null ? p.rx : p.x, Y = p.ry != null ? p.ry : p.y;
  if (p.dead > 0) {
    // анимация гибели на месте, пока идёт отсчёт до возрождения
    drawUnit3D('player', X, Y, { ang: p.ang || Math.PI / 2, anim: 'die', t: 6 - p.dead });
    return;
  }
  const moving = INPUT.keys.KeyW || INPUT.keys.KeyA || INPUT.keys.KeyS || INPUT.keys.KeyD;
  // свечение под ногами
  const guest = typeof MP !== 'undefined' && MP.role === 'client';
  G.globalAlpha = 0.18; G.fillStyle = guest ? '#ff7a60' : '#5affc0';
  G.beginPath(); G.ellipse(sx(X), sy(Y), VIEW.z * 0.5, VIEW.z * 0.28, 0, 0, 7); G.fill(); G.globalAlpha = 1;
  const adur = ATK_ANIM[p.atkKind] || 0.3;
  const atkK = p.atkT != null && p.atkT < adur ? p.atkT / adur : -1;
  const hurtT = S.time - (p.lastHurt || -9);
  let panim = 'stance', pk = null;
  if (atkK >= 0) { panim = PLAYER_ATK[p.atkKind] || 'swing'; pk = atkK; }
  else if (hurtT < 0.25 && !moving) { panim = 'hit'; pk = hurtT / 0.25; }
  else if (moving) panim = 'run';
  if (p.riding) {
    // верхом: скакун под героем, герой чуть выше и без бега
    drawSteed({ x: X, y: Y }, t, p.ang != null ? p.ang : Math.PI / 2);
    drawHero({ x: X, y: Y - 0.38, weapon: p.weapon, armor: p.armor, guest }, { ang: p.ang != null ? p.ang : Math.PI / 2, anim: atkK >= 0 ? panim : 'stance', t, k: atkK >= 0 ? pk : null, flash: hurtT < 0.12 });
  } else drawHero({ x: X, y: Y, weapon: p.weapon, armor: p.armor, guest }, { ang: p.ang != null ? p.ang : Math.PI / 2, anim: panim, t: moving ? p.walk * 1.4 : t, k: pk, flash: hurtT < 0.12 });
  const fp = focusPos(p);
  if (fp) {
    // отметка выбранной цели
    const r = VIEW.z * (fp.r + 0.35) * (1 + Math.sin(t * 8) * 0.06);
    G.strokeStyle = 'rgba(255,80,60,0.9)'; G.lineWidth = Math.max(1.5, VIEW.z * 0.05);
    G.beginPath(); G.arc(sx(fp.x), sy(fp.y), r, 0, 7); G.stroke();
    G.beginPath();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + t; G.moveTo(sx(fp.x) + Math.cos(a) * r * 0.7, sy(fp.y) + Math.sin(a) * r * 0.7); G.lineTo(sx(fp.x) + Math.cos(a) * r * 1.2, sy(fp.y) + Math.sin(a) * r * 1.2); }
    G.stroke();
  }
  if (p.mining) {
    const k = p.mine;
    hpBar(p.mineX + 0.1, p.mineY - 0.2, 0.8, k, '#e8b84a');
  }
}

// постройки лагерей в поле зрения — в общий список глубины
function collectCampStructs(D) {
  for (const c of S.camps) {
    if (!c.alive) continue;
    if (c.x < VIEW.x0 - 14 || c.x > VIEW.x1 + 14 || c.y < VIEW.y0 - 14 || c.y > VIEW.y1 + 16) continue;
    for (const s of c.structs) if (s.hp > 0) { s._camp = c; D.push({ y: s.y + structW(s), t: 8, o: s }); }
  }
}
function drawCampStruct(s) {
  if (s.kind === 'palisade_c' || s.kind === 'stonewall_c') {
    const jx = s.flash > 0 ? Math.sin(S.time * 90) * 0.05 : 0;
    const st = s.kind === 'palisade_c' ? 'woodc' : 'stonec', m = campWallMask(s._camp, s);
    if (!drawProp('build', 'wall_' + st + '_' + m, s.x + jx, s.y)) drawArt(wallSprite(st, m), s.x + jx, s.y + 1 - 1.9, 1, 1.9);
    if (s.hp < s.maxHp) hpBar(s.x + 0.1, s.y - 0.95, 0.8, s.hp / s.maxHp, '#a07a50');
    if (s.flash > 0) s.flash -= 1 / 60;
    return;
  }
  if (s.flash > 0) s.flash -= 1 / 60;
  if (s.kind === 'portal') {
    G.save();
    const X = sx(s.x + 1), Y = sy(s.y + 1);
    G.translate(X, Y); G.rotate(S.time * 1.5);
    const sz = VIEW.z * 2.2;
    G.drawImage(SPR.camp.portal, -sz / 2, -sz / 2, sz, sz);
    G.restore();
    if (Math.random() < 0.3) FX.push({ x: s.x + 1 + rand(-1, 1), y: s.y + 1 + rand(-1, 1), vx: 0, vy: -1, life: 0.8, c: '#c080ff', s: 0.15 });
    hpBar(s.x, s.y - 0.4, 2, s.hp / s.maxHp, '#a040ff');
    return;
  }
  const w = structW(s);
  // при попадании постройка вздрагивает
  const jx = s.flash > 0 ? Math.sin(S.time * 90) * 0.05 : 0;
  // 3D-модель из фотостудии
  if (drawProp('camp', 'c_' + s.kind, s.x + jx, s.y, s.flash > 0 ? { flash: true } : null)) {
    if (s.kind === 'bonfire') drawFlame(s.x + 0.5, s.y + 0.55, 0.36, S.time, s.x * 7 + s.y);
    if (s.hp < s.maxHp) hpBar(s.x + 0.1, propTop('camp', 'c_' + s.kind, s.y) - 0.1, w - 0.2, s.hp / s.maxHp, s.minor ? '#a07a50' : '#d04030');
    return;
  }
  const img = campArt(s.kind);
  let hT = 1;
  if (img) {
    hT = img.height / ART;
    drawArt(img, s.x + jx, s.y + w - hT, w, hT);
    if (s.flash > 0) {
      G.save(); G.globalAlpha = 0.35; G.globalCompositeOperation = 'lighter';
      drawArt(img, s.x + jx, s.y + w - hT, w, hT); G.restore();
    }
  } else if (SPR.camp[s.kind]) drawSprite(SPR.camp[s.kind], s.x, s.y, 1, 1);
  if (s.kind === 'bonfire') drawFlame(s.x + 0.5, s.y + 0.62, 0.42, S.time, s.x * 7 + s.y);
  if (s.hp < s.maxHp) hpBar(s.x + 0.1, s.y + w - hT - 0.05, w - 0.2, s.hp / s.maxHp, s.minor ? '#a07a50' : '#d04030');
}

function drawProjs() {
  for (const o of S.projs) {
    const X = sx(o.x), Y = sy(o.y);
    let lift = 0;
    if (o.arc) { const k = 1 - o.life / o.t0; lift = Math.sin(k * Math.PI) * o.arc * 0.25 * VIEW.z; }
    const s = Math.max(2, VIEW.z * 0.15);
    switch (o.kind) {
      case 'stone': G.fillStyle = '#9a968e'; G.fillRect(X - s / 2, Y - s / 2, s, s); break;
      case 'bolt': case 'arrow':
        G.strokeStyle = o.kind === 'bolt' ? '#d8c8a0' : '#a08050'; G.lineWidth = Math.max(1, VIEW.z / 16);
        G.beginPath(); const l = Math.hypot(o.vx, o.vy) || 1; G.moveTo(X, Y); G.lineTo(X - o.vx / l * VIEW.z * 0.4, Y - o.vy / l * VIEW.z * 0.4); G.stroke(); break;
      case 'axe': G.fillStyle = '#c0c0c0'; G.fillRect(X - s, Y - s - lift, s * 2, s * 2); break;
      case 'magic': G.fillStyle = '#80ff80'; G.beginPath(); G.arc(X, Y, s, 0, 7); G.fill(); break;
      case 'arcane': G.fillStyle = '#c060ff'; G.beginPath(); G.arc(X, Y, s * 1.6, 0, 7); G.fill(); G.fillStyle = '#fff'; G.beginPath(); G.arc(X, Y, s * 0.6, 0, 7); G.fill(); break;
      case 'fire': G.fillStyle = '#ff9030'; G.beginPath(); G.arc(X, Y, s * 1.2, 0, 7); G.fill(); break;
      case 'boulder': G.fillStyle = '#6a655b'; G.beginPath(); G.arc(X, Y - lift, s * 2, 0, 7); G.fill(); break;
      case 'quake': G.fillStyle = '#9fe8ff'; G.beginPath(); G.arc(X, Y, s * 1.5, 0, 7); G.fill(); break;
    }
  }
}

function drawCursor() {
  const tx = Math.floor(INPUT.wx), ty = Math.floor(INPUT.wy);
  if (INPUT.overUI) return;
  if (UI.mode && UI.tool) UI.mode = null;
  if (UI.mode) { drawBlueprintCursor(); return; }
  const tool = UI.tool;
  if (tool) {
    const def = BUILDINGS[tool];
    const p = S.player;
    // радиус строительства
    G.strokeStyle = 'rgba(90,255,192,0.25)'; G.lineWidth = DPR;
    G.beginPath(); G.arc(sx(p.x), sy(p.y), playerReach() * VIEW.z, 0, 7); G.stroke();
    const ox = def.size[0] > 1 ? Math.round(INPUT.wx - def.size[0] / 2) : tx;
    const oy = def.size[1] > 1 ? Math.round(INPUT.wy - def.size[1] / 2) : ty;
    const left = S.player.inv.count(tool), free = S.cheats && S.cheats.free;
    const prob = placeProblem(tool, ox, oy, true) || (left > 0 || free ? null : `нет «${def.name}» в инвентаре — скрафтите (C)`);
    G.globalAlpha = 0.6;
    drawBuildingGhost(tool, ox, oy, UI.dir);
    G.globalAlpha = 0.3;
    G.fillStyle = prob ? '#ff3020' : '#40ff60';
    G.fillRect(sx(ox), sy(oy), sx(ox + def.size[0]) - sx(ox), sy(oy + def.size[1]) - sy(oy));
    G.globalAlpha = 1;
    if (def.kind === 'belt') {
      G.fillStyle = '#fff'; G.font = `bold ${Math.round(VIEW.z * 0.5)}px sans-serif`; G.textAlign = 'center';
      G.fillText(DIR_NAMES[UI.dir], sx(ox + 0.5), sy(oy + 0.7));
    }
    if (def.kind === 'vector') vectorMarks(ox, oy, UI.dir, def.reach || 1);
    if (def.under) drawUnderReach(tool, ox, oy, UI.dir);
    if (def.push) {
      // где бур добывает и куда выкладывает
      const a = def.area || 0;
      G.strokeStyle = 'rgba(255,200,60,0.6)'; G.lineWidth = Math.max(1, VIEW.z * 0.04); G.setLineDash([VIEW.z * 0.15, VIEW.z * 0.1]);
      G.strokeRect(sx(ox - a), sy(oy - a), VIEW.z * (def.size[0] + a * 2), VIEW.z * (def.size[1] + a * 2)); G.setLineDash([]);
      const [tx, ty] = drillOutTile({ x: ox, y: oy, w: def.size[0], h: def.size[1], dir: UI.dir });
      G.fillStyle = 'rgba(90,255,150,0.3)'; G.fillRect(sx(tx), sy(ty), VIEW.z, VIEW.z);
      G.strokeStyle = 'rgba(90,255,150,1)'; G.strokeRect(sx(tx) + 1, sy(ty) + 1, VIEW.z - 2, VIEW.z - 2);
    }
    if (def.kind === 'mgolem') {
      G.strokeStyle = 'rgba(255,220,120,0.35)';
      G.beginPath(); G.arc(sx(ox + 0.5), sy(oy + 0.5), (tool === 'farmer' ? FARM.radius : GOLEM.radius) * VIEW.z, 0, 7); G.stroke();
    }
    // сколько таких построек осталось в руке
    G.font = `bold ${Math.round(12 * DPR)}px sans-serif`; G.textAlign = 'left'; G.lineWidth = 3 * DPR; G.strokeStyle = '#000';
    const lbl = free ? '∞' : '×' + left;
    G.strokeText(lbl, sx(ox + def.size[0]) + 4 * DPR, sy(oy) + 12 * DPR); G.fillStyle = left || free ? '#ffe6c0' : '#ff6050'; G.fillText(lbl, sx(ox + def.size[0]) + 4 * DPR, sy(oy) + 12 * DPR);
    if (prob) UI.cursorProblem = prob; else UI.cursorProblem = null;
  } else {
    const b = bldAt(tx, ty);
    G.strokeStyle = 'rgba(255,255,255,0.5)'; G.lineWidth = DPR;
    if (b) G.strokeRect(sx(b.x), sy(b.y), sx(b.x + b.w) - sx(b.x), sy(b.y + b.h) - sy(b.y));
    else G.strokeRect(sx(tx), sy(ty), VIEW.z, VIEW.z);
    if (b && BUILDINGS[b.type].kind === 'vector') {
      vectorMarks(b.x, b.y, b.dir, BUILDINGS[b.type].reach || 1);
    }
    if (b && b.pair) { const o = S.buildings.get(b.pair); if (o) { G.strokeStyle = 'rgba(232,184,74,0.8)'; G.strokeRect(sx(o.x), sy(o.y), VIEW.z, VIEW.z); } }
    if (b && b.exitOf) { const o = S.buildings.get(b.exitOf); if (o) { G.strokeStyle = 'rgba(232,184,74,0.8)'; G.strokeRect(sx(o.x), sy(o.y), VIEW.z, VIEW.z); } }
    if (b && b.type === 'nest') { G.strokeStyle = 'rgba(159,232,255,0.4)'; G.beginPath(); G.arc(sx(b.x + 1), sy(b.y + 1), BUILDINGS.nest.radius * VIEW.z, 0, 7); G.stroke(); }
    if (b && BUILDINGS[b.type].kind === 'tower') { G.strokeStyle = 'rgba(255,120,90,0.4)'; G.beginPath(); G.arc(sx(b.x + b.w / 2), sy(b.y + b.h / 2), BUILDINGS[b.type].weapon.range * VIEW.z, 0, 7); G.stroke(); }
    // только в режиме карты загрязнения (P)
    if (UI.showPollution && !b && !INPUT.ldown && performance.now() - (INPUT.moveT || 0) > 600) drawPollutionHover(tx, ty);
  }
}
// подземный конвейер/вал в руке: докуда дотянется ход. Есть свободный вход позади — линия к нему
// (зелёная — соединятся, красная — слишком далеко); нет — полоса максимальной длины вперёд
function drawUnderReach(type, x, y, dir) {
  const def = BUILDINGS[type], [dx, dy] = DIRS[dir], z = VIEW.z;
  let ent = underEntryFor(type, x, y, dir);
  // тянем от только что поставленного входа: полоса от него
  const lp = INPUT.ldown && UI.lastPlace && UI.lastPlace.placed ? bldAt(UI.lastPlace.x, UI.lastPlace.y) : null;
  if (!ent && lp && lp.type === type && !lp.pair && !lp.exitOf && (lp.x !== x || lp.y !== y)) {
    const k = dx ? (x - lp.x) * dx : (y - lp.y) * dy;
    if (k > 0 && (dx ? y === lp.y : x === lp.x)) ent = { b: lp, k, ok: k <= def.under + 1 };
  }
  G.save();
  if (ent) {
    const col = ent.ok ? '90,255,140' : '255,70,50';
    for (let i = 1; i < ent.k; i++) { const tx = ent.b.x + dx * i, ty = ent.b.y + dy * i; G.fillStyle = `rgba(${col},${i <= def.under ? 0.22 : 0.12})`; G.fillRect(sx(tx), sy(ty), z, z); }
    G.strokeStyle = `rgba(${col},0.95)`; G.lineWidth = Math.max(2, z * 0.07); G.setLineDash([z * 0.2, z * 0.12]);
    G.beginPath(); G.moveTo(sx(ent.b.x + 0.5), sy(ent.b.y + 0.5)); G.lineTo(sx(x + 0.5), sy(y + 0.5)); G.stroke(); G.setLineDash([]);
    G.font = `bold ${Math.round(Math.max(11, z * 0.32))}px sans-serif`; G.textAlign = 'center'; G.lineWidth = 3; G.strokeStyle = '#000';
    const txt = ent.ok ? `${ent.k - 1} / ${def.under}` : `слишком далеко: ${ent.k - 1} > ${def.under}`;
    G.strokeText(txt, sx(x + 0.5), sy(y) - 4); G.fillStyle = ent.ok ? '#a0ffb0' : '#ff8070'; G.fillText(txt, sx(x + 0.5), sy(y) - 4);
    if (!ent.ok) { // где был бы предел
      const mx = ent.b.x + dx * (def.under + 1), my = ent.b.y + dy * (def.under + 1);
      G.strokeStyle = 'rgba(90,255,140,0.9)'; G.lineWidth = 2; G.strokeRect(sx(mx) + 1, sy(my) + 1, z - 2, z - 2);
    }
  } else {
    // полоса вперёд: сюда можно поставить выход
    for (let i = 1; i <= def.under + 1; i++) { const tx = x + dx * i, ty = y + dy * i; G.fillStyle = `rgba(90,255,140,${i === def.under + 1 ? 0.28 : 0.1})`; G.fillRect(sx(tx), sy(ty), z, z); }
    const ex = x + dx * (def.under + 1), ey = y + dy * (def.under + 1);
    G.strokeStyle = 'rgba(90,255,140,0.7)'; G.lineWidth = 2; G.setLineDash([z * 0.15, z * 0.1]); G.strokeRect(sx(ex) + 1, sy(ey) + 1, z - 2, z - 2); G.setLineDash([]);
  }
  G.restore();
}
// загрязнение под курсором: сколько дыма в этом участке и сколько нужно, чтобы лагеря разозлились
function drawPollutionHover(tx, ty) {
  if (inDungeonY(ty)) return;
  const v = pollutionAt(tx, ty);
  let camp = null;
  for (const c of S.camps) if (c.alive && c.type !== 'elf' && Math.abs(c.x - tx) < 9 && Math.abs(c.y - ty) < 9) { camp = c; break; }
  if (v < 0.005 && !camp) return;
  const lines = [`Дым в этом участке: ${v.toFixed(2)}` + (v >= 0.35 ? ' — лагерь в таком дыму злится' : ' (лагерь злится, если дым у него выше 0.35)')];
  if (camp) lines.push(`${campName(camp)}: ${camp.polluted ? 'злость ' + Math.round(clamp((camp.anger || 0) / 300, 0, 1) * 100) + '% (при 100% — орда)' : 'спокоен'}`);
  const X = INPUT.sx * (CV.width / innerWidth) + 18 * DPR, Y = INPUT.sy * (CV.height / innerHeight) + 22 * DPR;
  G.font = `${Math.round(12 * DPR)}px Segoe UI, sans-serif`; G.textAlign = 'left';
  const w = Math.max(...lines.map(l => G.measureText(l).width)) + 12 * DPR, h = lines.length * 16 * DPR + 6 * DPR;
  G.fillStyle = 'rgba(20,16,12,0.82)'; G.fillRect(X, Y, w, h);
  lines.forEach((l, i) => { G.fillStyle = i === 0 ? (v >= 0.35 ? '#ff8a70' : v >= 0.15 ? '#ffd080' : '#cfe8c0') : '#e8dcc0'; G.fillText(l, X + 6 * DPR, Y + 15 * DPR + i * 16 * DPR); });
}

// ---------- миникарта и большая карта ----------
function groundColor(gr, r) {
  if (r === RES_ID.tree) return gr === GROUND.snow ? [70, 100, 90] : gr === GROUND.desert ? [96, 140, 70] : gr === GROUND.autumn ? [170, 90, 30] : gr === GROUND.mushroom ? [150, 60, 90] : [40, 90, 35];
  if (r >= 2 && r <= 8) return [[0, 0, 0], [0, 0, 0], [150, 150, 150], [200, 140, 110], [230, 130, 70], [40, 40, 40], [230, 220, 90], [255, 215, 60], [160, 240, 255]][r];
  if (r === RES_ID.ruins) return [200, 160, 255];
  if (r === RES_ID.mount) return [125, 118, 106];
  switch (gr) {
    case GROUND.water: return [56, 112, 168];
    default: return GCOL[gr] || GCOL[GROUND.grass];
  }
}

function drawMap(cv, cxw, cyw, scale, labels) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const img = g.createImageData(W, H);
  const d = img.data;
  const tw = Math.ceil(W / scale), th = Math.ceil(H / scale);
  const x0 = Math.floor(cxw - tw / 2), y0 = Math.floor(cyw - th / 2);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const x = x0 + tx, y = y0 + ty;
    const c = peekChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    let col = [8, 6, 4];
    if (c) {
      const i = tidx(x, y);
      if (c.explored[i]) col = c.bld[i] ? [232, 184, 74] : groundColor(c.ground[i], c.res[i]);
    }
    for (let sy2 = 0; sy2 < scale; sy2++) for (let sx2 = 0; sx2 < scale; sx2++) {
      const px2 = tx * scale + sx2, py2 = ty * scale + sy2;
      if (px2 >= W || py2 >= H) continue;
      const o = (py2 * W + px2) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const mx = (x) => (x - x0) * scale, my = (y) => (y - y0) * scale;
  const dot = (x, y, c, r) => { g.fillStyle = c; g.fillRect(mx(x) - r, my(y) - r, r * 2, r * 2); };
  for (const c of S.camps) {
    if (!c.alive) continue;
    if (c.type !== 'elf' && !isExploredSafe(c.x, c.y)) continue;
    dot(c.x, c.y, c.type === 'elf' ? '#c040ff' : c.polluted ? '#ff2020' : '#c03030', Math.max(2, scale * 1.5));
  }
  for (const e of S.enemies) dot(e.x, e.y, '#ff4040', Math.max(1, scale * 0.6));
  if (S.merchant) dot(S.merchant.x, S.merchant.y, '#ffe060', 3);
  if (labels) drawMapLabels(g, x0, y0, tw, th, scale, mx, my);
  // друзья онлайн и пинги
  if (typeof mpOtherHeroes === 'function') for (const h of mpOtherHeroes()) {
    dot(h.x, h.y, h.guest ? '#ff7a60' : '#ffd060', Math.max(2, scale));
    if (labels) { g.font = 'bold 11px Segoe UI, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(h.name || 'Друг', mx(h.x) + 1, my(h.y) - 7); g.fillStyle = h.guest ? '#ffb0a0' : '#ffe080'; g.fillText(h.name || 'Друг', mx(h.x), my(h.y) - 8); g.strokeStyle = h.guest ? '#ff7a60' : '#ffd060'; g.lineWidth = 2; g.beginPath(); g.arc(mx(h.x), my(h.y), 6, 0, 7); g.stroke(); }
  }
  if (S.pings) for (const pg of S.pings) { if (S.time - pg.t > 12) continue; g.strokeStyle = '#ffd23c'; g.lineWidth = 2; const r = 4 + ((performance.now() / 300) % 1) * 8; g.beginPath(); g.arc(mx(pg.x), my(pg.y), r, 0, 7); g.stroke(); dot(pg.x, pg.y, '#ffd23c', 2); }
  dot(S.player.x, S.player.y, '#5affc0', Math.max(2, scale));
  if (labels) { g.strokeStyle = '#5affc0'; g.lineWidth = 2; g.beginPath(); g.arc(mx(S.player.x), my(S.player.y), 7, 0, 7); g.stroke(); }
}

// подписи большой карты: залежи, лагеря, шахты, база
const ORE_LABEL = { 2: 'Камень', 3: 'Железо', 4: 'Медь', 5: 'Уголь', 6: 'Сера', 7: 'Золото', 8: 'Мифрил' };
function mapLabel(g, x, y, text, sub, col) {
  g.font = 'bold 12px Segoe UI, sans-serif';
  const w = Math.max(g.measureText(text).width, sub ? g.measureText(sub).width * 0.85 : 0) + 10;
  const h = sub ? 30 : 17;
  g.fillStyle = 'rgba(10,8,6,0.78)'; g.fillRect(x - w / 2, y - h - 6, w, h);
  g.fillStyle = col; g.fillRect(x - w / 2, y - h - 6, 3, h);
  g.textAlign = 'center'; g.fillStyle = '#f0e2c2'; g.fillText(text, x, y - h + 7);
  if (sub) { g.font = '11px Segoe UI, sans-serif'; g.fillStyle = '#b8a888'; g.fillText(sub, x, y - 10); }
  g.beginPath(); g.moveTo(x - 4, y - 6); g.lineTo(x + 4, y - 6); g.lineTo(x, y); g.closePath(); g.fillStyle = 'rgba(10,8,6,0.78)'; g.fill();
}
function patchAmount(p) {
  let sum = 0;
  const R = Math.ceil(p.r + 2);
  for (let y = p.y - R; y <= p.y + R; y++) for (let x = p.x - R; x <= p.x + R; x++) {
    const c = peekChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    if (!c) continue;
    const i = tidx(x, y);
    if (c.res[i] === p.res) sum += c.amt[i];
  }
  return sum;
}
function drawMapLabels(g, x0, y0, tw, th, scale, mx, my) {
  const col = (r) => { const c = groundColor(0, r); return `rgb(${c[0]},${c[1]},${c[2]})`; };
  for (const p of patchesIn(x0, y0, x0 + tw, y0 + th)) {
    if (!isExploredSafe(p.x, p.y)) continue;
    const c = peekChunk(Math.floor(p.x / CHUNK), Math.floor(p.y / CHUNK));
    const mine = c && c.bld[tidx(p.x, p.y)];
    const amt = patchAmount(p);
    const sub = (mine && mine.type === 'mine' ? 'шахта ×' + mineYield(mine) + ' · ' : '') + (amt ? '≈' + fmtNum(amt) : 'выработана');
    mapLabel(g, mx(p.x + 0.5), my(p.y - p.r * 0.4), ORE_LABEL[p.res], sub, col(p.res));
  }
  for (const c of S.camps) {
    if (!c.alive) continue;
    if (c.type !== 'elf' && !isExploredSafe(c.x, c.y)) continue;
    const name = c.type === 'goblin' ? 'Гоблины' : c.type === 'orc' ? 'Орки' : c.type === 'orc_big' ? 'Крепость орков' : c.type === 'citadel' ? '☠ Цитадель орков' : 'Портал эльфов';
    const X = mx(c.x), Y = my(c.y);
    g.fillStyle = c.type === 'elf' ? '#c040ff' : '#d02020';
    g.beginPath(); g.arc(X, Y, 6, 0, 7); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.fillRect(X - 2.5, Y - 3, 2, 2); g.fillRect(X + 0.5, Y - 3, 2, 2); g.fillRect(X - 2, Y + 1, 4, 1.5);
    mapLabel(g, X, Y - 8, name, c.polluted ? 'злится от загрязнения' : (c.type !== 'elf' ? 'уровень ' + c.level : ''), c.type === 'elf' ? '#c040ff' : '#d02020');
  }
  if (S.buildings.size) { const bc = baseCenter(); mapLabel(g, mx(bc.x), my(bc.y) - 4, 'Ваша база', null, '#e8b84a'); }
  if (S.merchant) mapLabel(g, mx(S.merchant.x), my(S.merchant.y) - 4, 'Торговец', null, '#ffe060');
}
function isExploredSafe(x, y) {
  const c = peekChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
  return c && c.explored[tidx(Math.floor(x), Math.floor(y))] === 1;
}
