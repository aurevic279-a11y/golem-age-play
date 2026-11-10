'use strict';
// Разнообразие природы без новых файлов: после загрузки атласа природы из запечённых 3D-спрайтов
// собираем ещё один атлас — отражённые и чуть больше/меньше деревья и камни, осенние, заснеженные и сухие версии,
// а кактусы и гигантские грибы рисуем кодом в том же стиле (свет сверху-слева, мягкая тень).
// Пиксели не читаются (getImageData не работает при запуске с file://) — только наложение режимами смешивания.

const VAR = { ready: false, lists: {} };
const VAR_W = 2048;

// упаковка полками: возвращает координаты места под картинку w×h
function varPacker() {
  const P = { x: 2, y: 2, rowH: 0, items: [] };
  P.place = (w, h) => {
    w = Math.ceil(w); h = Math.ceil(h);
    if (P.x + w + 2 > VAR_W) { P.x = 2; P.y += P.rowH + 3; P.rowH = 0; }
    const r = [P.x, P.y];
    P.x += w + 3; P.rowH = Math.max(P.rowH, h);
    return r;
  };
  return P;
}

// оттенок/снег/сухость поверх силуэта спрайта (режимы смешивания + обрезка по силуэту)
function varTint(g, w, h, mode, redraw) {
  if (mode === 'none') return;
  const [kind, col, a] = mode;
  g.save();
  if (kind === 'snow') {
    // снежные шапки: белое сверху, сходит на нет к середине; чуть остужаем цвет
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(190,210,235,0.18)'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h * 0.75);
    gr.addColorStop(0, 'rgba(250,252,255,0.85)'); gr.addColorStop(0.45, 'rgba(240,246,255,0.5)'); gr.addColorStop(1, 'rgba(240,246,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  } else {
    // hue/saturation/multiply/color: заливка режимом, затем вырезаем по силуэту
    g.globalCompositeOperation = kind; g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, 0, w, h);
    // осенняя листва: вдобавок поднимаем насыщенность, иначе выходит блёкло-розовой
    if (mode[3]) { g.globalCompositeOperation = 'saturation'; g.globalAlpha = mode[3]; g.fillStyle = '#ff2000'; g.fillRect(0, 0, w, h); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; redraw();
  }
  g.restore();
}

// копия спрайта набора природы в новый атлас: k — масштаб, flip — зеркально, mode — перекраска
function varCopy(P, g, src, it, key, k, flip, mode) {
  const [sx0, sy0, w, h, bx, by, tw, th] = it;
  const W2 = w * k, H2 = h * k;
  const [x, y] = P.place(W2, H2);
  // рисуем во временный холст, чтобы режимы смешивания не задели соседей по атласу
  const t = document.createElement('canvas'); t.width = Math.ceil(W2); t.height = Math.ceil(H2);
  const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true;
  const draw = () => { tg.save(); if (flip) { tg.translate(W2, 0); tg.scale(-1, 1); } tg.drawImage(src, sx0, sy0, w, h, 0, 0, W2, H2); tg.restore(); };
  draw();
  varTint(tg, W2, H2, mode, draw);
  g.drawImage(t, x, y);
  // основание: середина нижнего края подошвы остаётся на месте, подошва не масштабируется
  const ppt = 64, ax = (bx + tw * ppt / 2) * k, ay = (by + th * ppt) * k;
  let nbx = ax - tw * ppt / 2;
  if (flip) nbx = W2 - (ax + tw * ppt / 2);
  P.items.push([key, [x, y, W2, H2, nbx, ay - th * ppt, tw, th]]);
}

// кодом: кактус-сагуаро (колонна с руками) или бочковидный
function drawCactus(g, x, y, v) {
  const R = prng(v * 977 + 5), body = (cx, top, bot, wd) => {
    const gr = g.createLinearGradient(cx - wd, 0, cx + wd, 0);
    gr.addColorStop(0, '#7ab060'); gr.addColorStop(0.45, '#4e8a3e'); gr.addColorStop(1, '#2a5028');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(cx - wd, bot); g.lineTo(cx - wd, top + wd); g.arc(cx, top + wd, wd, Math.PI, 0); g.lineTo(cx + wd, bot); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,60,30,0.5)'; g.lineWidth = 1;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(cx + i * wd * 0.45, top + wd * 0.6); g.lineTo(cx + i * wd * 0.45, bot); g.stroke(); }
    g.fillStyle = 'rgba(255,250,220,0.8)';
    for (let yy = top + 6; yy < bot - 4; yy += 7) { g.fillRect(cx - wd - 1, yy, 2, 1); g.fillRect(cx + wd - 1, yy + 3, 2, 1); }
  };
  const W = 64, H = 120, cx = x + W / 2, base = y + H - 12;
  // тень
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(cx + 10, base + 2, 22, 7, 0, 0, 7); g.fill();
  if (v % 3 === 2) {
    // бочковидный кактус с цветком
    const wd = 15 + R() * 4;
    g.fillStyle = '#4e8a3e'; g.beginPath(); g.ellipse(cx, base - wd, wd, wd * 1.1, 0, 0, 7); g.fill();
    const gr = g.createRadialGradient(cx - 5, base - wd - 6, 2, cx, base - wd, wd * 1.2); gr.addColorStop(0, 'rgba(160,220,120,0.8)'); gr.addColorStop(1, 'rgba(30,60,30,0.3)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, base - wd, wd, wd * 1.1, 0, 0, 7); g.fill();
    g.fillStyle = ['#ff6080', '#ffd040', '#ff9040'][v % 3]; g.beginPath(); g.arc(cx, base - wd * 2.1, 4, 0, 7); g.fill();
    return [W, H, 0, H - 12 - 35];
  }
  const top = y + 14 + R() * 18, wd = 8 + R() * 2;
  body(cx, top, base, wd);
  // руки
  const arms = 1 + Math.floor(R() * 2);
  for (let i = 0; i < arms; i++) {
    const side = i ? -1 : (R() < 0.5 ? 1 : -1), ay = top + 26 + R() * 30, ax = cx + side * (wd + 9);
    g.fillStyle = '#4e8a3e'; g.fillRect(Math.min(cx, ax), ay, Math.abs(ax - cx), wd * 0.9);
    body(ax, ay - 22 - R() * 12, ay + wd * 0.9, wd * 0.72);
  }
  return [W, H, 0, H - 12 - 35];
}

// кодом: гигантский гриб (светлая ножка, шляпка-купол с пятнами; синие слегка светятся изнутри).
// Всё рисуется внутри своей клетки атласа: без «ореолов» и полос, которые раньше выглядели как глюки текстуры
function drawShroom(g, x, y, v) {
  const R = prng(v * 613 + 11);
  const W = 96, H = 128, cx = x + W / 2, base = y + H - 14;
  const caps = [['#c83a3a', '#ffffff'], ['#8a4ad0', '#e0c0ff'], ['#3aa8c8', '#c0f4ff'], ['#d08a3a', '#fff0c0'], ['#a0304a', '#ffd0d8']];
  const [cc, dots] = caps[v % caps.length];
  const sh = 34 + R() * 26, cw = 28 + R() * 10, lean = (R() - 0.5) * 8;
  g.save();
  g.beginPath(); g.rect(x + 1, y + 1, W - 2, H - 2); g.clip();
  // тень на земле
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(cx + 6, base + 1, Math.min(cw * 0.85, 40), 8, 0, 0, 7); g.fill();
  // ножка
  const sg = g.createLinearGradient(cx - 9, 0, cx + 9, 0); sg.addColorStop(0, '#f4ecdc'); sg.addColorStop(0.6, '#d8ccb6'); sg.addColorStop(1, '#a89880');
  g.fillStyle = sg;
  g.beginPath(); g.moveTo(cx - 9, base); g.quadraticCurveTo(cx - 6 + lean, base - sh / 2, cx - 6 + lean, base - sh); g.lineTo(cx + 6 + lean, base - sh); g.quadraticCurveTo(cx + 6 + lean, base - sh / 2, cx + 9, base); g.closePath(); g.fill();
  g.fillStyle = '#e8dcc8'; g.beginPath(); g.ellipse(cx + lean * 0.6, base - sh * 0.55, 9.5, 3.2, 0, 0, 7); g.fill(); // юбочка
  // шляпка: купол одним контуром (низ — пологая дуга), снизу — светлые пластинки
  const ty = base - sh, X = cx + lean;
  const dome = () => { g.beginPath(); g.moveTo(X - cw, ty + 2); g.bezierCurveTo(X - cw, ty - cw * 0.85, X + cw, ty - cw * 0.85, X + cw, ty + 2); g.quadraticCurveTo(X, ty + cw * 0.28, X - cw, ty + 2); g.closePath(); };
  g.fillStyle = shade(cc, 0.55); g.beginPath(); g.ellipse(X, ty + 3, cw * 0.82, cw * 0.17, 0, 0, Math.PI); g.fill();
  const cg = g.createRadialGradient(X - cw * 0.35, ty - cw * 0.5, 2, X, ty - cw * 0.15, cw * 1.15);
  cg.addColorStop(0, shade(cc, 0.4)); cg.addColorStop(0.55, cc); cg.addColorStop(1, shade(cc, -0.28));
  dome(); g.fillStyle = cg; g.fill();
  g.save(); dome(); g.clip();
  g.fillStyle = dots;
  for (let i = 0; i < 7; i++) { const px = X + (R() - 0.5) * cw * 1.5, py = ty - cw * (0.1 + R() * 0.45); g.beginPath(); g.ellipse(px, py, 2.5 + R() * 2.5, 1.8 + R() * 1.4, 0, 0, 7); g.fill(); }
  // синие светятся: мягкий свет внутри шляпки, без ореола наружу
  if (v % caps.length === 2) { const lg = g.createRadialGradient(X, ty - cw * 0.3, 1, X, ty - cw * 0.3, cw); lg.addColorStop(0, 'rgba(200,250,255,0.55)'); lg.addColorStop(1, 'rgba(120,220,255,0)'); g.fillStyle = lg; g.fillRect(X - cw, ty - cw, cw * 2, cw * 1.4); }
  g.restore();
  g.strokeStyle = shade(cc, -0.45); g.lineWidth = 1.2; dome(); g.stroke();
  g.restore();
  return [W, H, (W - 64) / 2, H - 14 - 35];
}

// собрать атлас вариантов (один раз, после загрузки спрайтов)
function genNatureVariants() {
  if (VAR.ready || typeof SPRITES3D === 'undefined') return;
  const st = SPRITES3D.sets.nature, src = st && S3D.img[st.file];
  if (!src) return;
  const P = varPacker();
  const cv = document.createElement('canvas'); cv.width = VAR_W; cv.height = 2048;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = true;
  const keys = (re) => Object.keys(st.items).filter(k => re.test(k));
  const L = VAR.lists;
  const add = (list, key) => (L[list] || (L[list] = [])).push(key);
  // базовые списки — исходные спрайты
  const B = {}; // исходные спрайты (списки L пополняются вариантами из нового атласа)
  for (const pre of ['tree', 'treeD', 'treeS', 'stone', 'iron', 'copper', 'coal', 'sulfur', 'gold', 'mithril', 'bush', 'ruins']) { B[pre] = keys(new RegExp('^' + pre + '\\d+$')); L[pre] = B[pre].slice(); }
  // 1) лес лугов: зеркальные, крупнее/мельче, светлее и сизее
  const trees = B.tree;
  trees.forEach((k, i) => {
    varCopy(P, g, src, st.items[k], 'treeM' + i, 1, true, 'none'); add('tree', 'treeM' + i);
    if (i % 2 === 0) { varCopy(P, g, src, st.items[k], 'treeB' + i, 1.18, i % 4 === 0, 'none'); add('tree', 'treeB' + i); }
    if (i % 3 === 1) { varCopy(P, g, src, st.items[k], 'treeL' + i, 0.82, false, ['hue', '#9ac040', 0.35]); add('tree', 'treeL' + i); }
    if (i % 3 === 2) { varCopy(P, g, src, st.items[k], 'treeG' + i, 1.05, true, ['hue', '#2a8a6a', 0.4]); add('tree', 'treeG' + i); }
  });
  for (const pre of ['treeD', 'treeS']) B[pre].forEach((k, i) => { varCopy(P, g, src, st.items[k], pre + 'M' + i, 1, true, 'none'); add(pre, pre + 'M' + i); });
  // 2) осенний лес: жёлтые, рыжие, багряные (и немного ещё зелёных)
  const AUT = ['#e0a020', '#d87020', '#e8c030', '#c84a20', '#d89020'];
  trees.forEach((k, i) => {
    varCopy(P, g, src, st.items[k], 'treeA' + i, 0.95 + (i % 3) * 0.08, i % 2 === 1, ['hue', AUT[i % AUT.length], 1, 0.55]); add('treeA', 'treeA' + i);
    if (i % 4 === 0) add('treeA', k);
  });
  // 3) тундра: заснеженные деревья и камни
  trees.concat(B.treeD).forEach((k, i) => { varCopy(P, g, src, st.items[k], 'treeW' + i, 1, i % 2 === 1, ['snow']); add('treeW', 'treeW' + i); });
  B.stone.forEach((k, i) => { varCopy(P, g, src, st.items[k], 'stoneW' + i, 1, i % 2 === 1, ['snow']); add('stoneW', 'stoneW' + i); });
  B.bush.forEach((k, i) => { varCopy(P, g, src, st.items[k], 'bushW' + i, 1, i % 2 === 1, ['snow']); add('bushW', 'bushW' + i); });
  // 4) пустыня: красноватые камни, сухие кусты
  B.stone.forEach((k, i) => { varCopy(P, g, src, st.items[k], 'stoneR' + i, 1 + (i % 2) * 0.15, i % 2 === 0, ['multiply', '#e8a878', 1]); add('stoneR', 'stoneR' + i); });
  B.bush.forEach((k, i) => { varCopy(P, g, src, st.items[k], 'bushD' + i, 0.9, i % 2 === 0, ['hue', '#b08a40', 0.9]); add('bushD', 'bushD' + i); });
  // 5) осенние и грибные кусты
  B.bush.forEach((k, i) => { varCopy(P, g, src, st.items[k], 'bushA' + i, 1, i % 2 === 0, ['hue', '#d86a20', 0.9]); add('bushA', 'bushA' + i); });
  B.bush.forEach((k, i) => { varCopy(P, g, src, st.items[k], 'bushP' + i, 1, i % 2 === 1, ['hue', '#9a4ad0', 0.8]); add('bushP', 'bushP' + i); });
  // 6) камни и руда — зеркальные копии (вдвое больше видов кучек)
  for (const pre of ['stone', 'iron', 'copper', 'coal', 'sulfur', 'gold', 'mithril', 'bush', 'ruins']) {
    B[pre].forEach((k, i) => { varCopy(P, g, src, st.items[k], pre + 'M' + i, 1, true, 'none'); add(pre, pre + 'M' + i); });
  }
  // 7) кактусы и гигантские грибы — кодом
  for (let v = 0; v < 6; v++) {
    const [x, y] = P.place(64, 120);
    const [w, h, bx, by] = drawCactus(g, x, y, v);
    P.items.push(['cactus' + v, [x, y, w, h, bx, by, 1, 1]]); add('cactus', 'cactus' + v);
  }
  for (let v = 0; v < 8; v++) {
    const [x, y] = P.place(96, 128);
    const [w, h, bx, by] = drawShroom(g, x, y, v);
    P.items.push(['shroom' + v, [x, y, w, h, bx, by, 1, 1]]); add('shroom', 'shroom' + v);
  }
  // атлас обрезаем по высоте занятого
  const usedH = P.y + P.rowH + 4, fin = document.createElement('canvas');
  fin.width = VAR_W; fin.height = usedH;
  fin.getContext('2d').drawImage(cv, 0, 0);
  const items = {};
  for (const [k, it] of P.items) items[k] = it;
  S3D.img['gen:nature'] = fin;
  SPRITES3D.sets.gen = { file: 'gen:nature', ppt: 64, items };
  VAR.ready = true;
  // счётчики вариантов и кэши участков посчитать заново
  for (const k in NATURE_N) delete NATURE_N[k];
  if (typeof W !== 'undefined') for (const c of W.values()) c.propCv = null;
}

// список вариантов спрайта для префикса (до готовности атласа — только исходные)
function natureVariants(pre) {
  if (VAR.ready && VAR.lists[pre]) return VAR.lists[pre];
  return null;
}
