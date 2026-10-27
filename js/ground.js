'use strict';
// Земля в стиле low-poly: плоские мягкие цвета, плавные переходы между почвами,
// вода с тёмной глубиной и светлым мелководьем у берега, лёгкий шум и россыпь травинок/цветов.
// Цвета считаются по клеткам и плавно смешиваются; чанк кэшируется картинкой GPX пикселей на клетку.

const GPX = 32;      // пикселей кэша на клетку
const GSUB = 8;      // шаг расчёта цвета (пикселей на клетку), дальше растягиваем со сглаживанием
const GPAD = 3;      // запас клеток вокруг чанка (для переходов и глубины воды)

// цвета почв
const GCOL = [];
GCOL[GROUND.grass] = [106, 168, 74];
GCOL[GROUND.dark] = [76, 132, 58];
GCOL[GROUND.sand] = [214, 196, 136];
GCOL[GROUND.swamp] = [88, 116, 66];
GCOL[GROUND.rock] = [138, 132, 120];
GCOL[GROUND.water] = [200, 186, 130]; // под водой — мокрый песок (виден в полосе берега)
GCOL[GROUND.wall] = [38, 34, 32];     // скала пещеры
GCOL[GROUND.desert] = [226, 196, 132];  // пустыня: тёплый песок, местами красные бэдленды
GCOL[GROUND.snow] = [214, 224, 234];    // тундра: снег с голубыми тенями
GCOL[GROUND.autumn] = [150, 138, 64];   // осенний лес: жухлая трава
GCOL[GROUND.mushroom] = [104, 86, 112]; // грибная чаща: лиловый мох
const WATER_DEEP = [38, 92, 150], WATER_SHALLOW = [74, 142, 190], WATER_FOAM = [178, 216, 232];
// под залежью — земля с оттенком руды, чтобы пятно читалось издалека
const ORE_SOIL = { 2: [150, 146, 136], 3: [150, 112, 92], 4: [168, 116, 72], 5: [70, 70, 66], 6: [190, 182, 92], 7: [196, 166, 80], 8: [112, 170, 186] };

// как клетка выглядит на картинке земли: руда (пока не кончилась), гора, песок или просто почва
function groundLook(r, a) { return r >= 2 && r <= 8 ? (a > 0 ? r : 0) : r === RES_ID.mount ? 100 : r === RES_ID.sand ? 101 : 0; }
// ground и res клетки: из загруженного чанка, иначе из генератора (соседний чанк ещё не создан)
const _gt = { g: 0, r: 0, a: 0 };
function groundInfo(x, y) {
  const c = peekChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
  if (c) { const i = tidx(x, y); _gt.g = c.ground[i]; _gt.r = c.res[i]; _gt.a = c.amt[i]; return _gt; }
  genTile(x, y, _gt);
  return _gt;
}

let GRAIN = null;
function grainPattern(g) {
  if (!GRAIN) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const gg = c.getContext('2d'), img = gg.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      const v = Math.random();
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v < 0.5 ? 0 : 255;
      img.data[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 22);
    }
    gg.putImageData(img, 0, 0);
    GRAIN = c;
  }
  return g.createPattern(GRAIN, 'repeat');
}

// part — перерисовать только прямоугольник клеток [x0, y0, x1, y1] (в клетках чанка) поверх готовой картинки:
// когда исчезла одна клетка руды, не пересчитываем весь участок (это ~25 мс)
function buildChunkCanvas(c, part) {
  if (part && !(c.canvas && c.small)) part = null;
  const N = CHUNK + GPAD * 2, x0 = c.cx * CHUNK - GPAD, y0 = c.cy * CHUNK - GPAD;
  // 1) свойства клеток с запасом: цвет суши, вода, глубина
  const R = new Float32Array(N * N), Gc = new Float32Array(N * N), B = new Float32Array(N * N);
  const Wt = new Float32Array(N * N), Dp = new Float32Array(N * N), Gm = new Float32Array(N * N), Bm = new Uint8Array(N * N);
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const t = groundInfo(x0 + tx, y0 + ty), k = ty * N + tx;
    let col = GCOL[t.g] || GCOL[GROUND.grass];
    if (t.g === GROUND.wall) {
      // стена пещеры: у края, обращённого к полу, — светлее (видна грань)
      const below = groundInfo(x0 + tx, y0 + ty + 1).g;
      col = below !== GROUND.wall ? [86, 78, 70] : GCOL[GROUND.wall];
    } else if (t.g === GROUND.rock && y0 + ty >= DUNGEON.y0 - 64) col = [96, 88, 78];
    if (t.r >= 2 && t.r <= 8 && t.a > 0) col = mix3(col, ORE_SOIL[t.r], 0.55);
    else if (t.r === RES_ID.mount) col = GCOL[GROUND.rock];
    else if (t.r === RES_ID.sand) col = mix3(col, [232, 216, 160], 0.4);
    R[k] = col[0]; Gc[k] = col[1]; B[k] = col[2];
    Wt[k] = t.g === GROUND.water ? 1 : 0;
    Bm[k] = t.g >= GROUND.desert && !(t.r >= 2 && t.r <= 8) ? t.g : 0;
    // чистая трава (без руды и песка) — на ней рисуем луга, сухие пятна и проплешины
    Gm[k] = (t.g === GROUND.grass || t.g === GROUND.dark) && (!t.r || t.r === RES_ID.tree) ? 1 : 0;
  }
  // глубина воды: насколько далеко берег (0 — у берега, 1 — в трёх клетках)
  for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
    const k = ty * N + tx;
    if (!Wt[k]) continue;
    let d = 3;
    for (let dy = -3; dy <= 3 && d > 0; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = tx + dx, yy = ty + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N || Wt[yy * N + xx]) continue;
      d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)) - 1);
    }
    Dp[k] = d / 3;
  }
  // 2) цвет с шагом GSUB пикселей на клетку: билинейное смешивание соседних клеток
  const S2 = CHUNK * GSUB;
  const small = part ? c.small : document.createElement('canvas');
  if (!part) small.width = small.height = S2;
  const px0 = part ? clamp(part[0], 0, CHUNK) * GSUB : 0, py0 = part ? clamp(part[1], 0, CHUNK) * GSUB : 0;
  const px1 = part ? clamp(part[2] + 1, 0, CHUNK) * GSUB : S2, py1 = part ? clamp(part[3] + 1, 0, CHUNK) * GSUB : S2;
  const IW = px1 - px0, IH = py1 - py0;
  if (IW <= 0 || IH <= 0) return;
  const sg = small.getContext('2d'), img = sg.createImageData(IW, IH), d = img.data;
  for (let py = py0; py < py1; py++) {
    const wy = c.cy * CHUNK + (py + 0.5) / GSUB;
    for (let pxl = px0; pxl < px1; pxl++) {
      const wx = c.cx * CHUNK + (pxl + 0.5) / GSUB;
      // границы почв искривляем шумом, чтобы не было клеточных «ступенек»
      const u = clamp((pxl + 0.5) / GSUB - 0.5 + GPAD + (valueNoise(wx / 2.3, wy / 2.3, 821) - 0.5) * 1.6, 0, N - 1.001);
      const v = clamp((py + 0.5) / GSUB - 0.5 + GPAD + (valueNoise(wx / 2.3, wy / 2.3, 822) - 0.5) * 1.6, 0, N - 1.001);
      const ix = Math.floor(u), fx0 = u - ix, iy = Math.floor(v), fy0 = v - iy;
      // смягчённые веса: переход уже, середина клетки — чистый цвет
      const fx = smooth(fx0), fy = smooth(fy0);
      const k00 = iy * N + ix, k10 = k00 + 1, k01 = k00 + N, k11 = k01 + 1;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      // крупные пятна светлее/темнее, чтобы трава не была однотонной
      const n = valueNoise(wx / 5, wy / 5, 811) * 0.6 + valueNoise(wx * 0.9, wy * 0.9, 812) * 0.4;
      let r = R[k00] * w00 + R[k10] * w10 + R[k01] * w01 + R[k11] * w11;
      let g = Gc[k00] * w00 + Gc[k10] * w10 + Gc[k01] * w01 + Gc[k11] * w11;
      let b = B[k00] * w00 + B[k10] * w10 + B[k01] * w01 + B[k11] * w11;
      const lum = 1 + (n - 0.5) * 0.12;
      r *= lum; g *= lum; b *= lum;
      // разнообразие травы: сочные тёмные луга, выгоревшие жёлтые пятна, проплешины голой земли
      const gm = Gm[k00] * w00 + Gm[k10] * w10 + Gm[k01] * w01 + Gm[k11] * w11;
      if (gm > 0.01) {
        const m = valueNoise(wx / 11, wy / 11, 831) * 0.7 + valueNoise(wx / 4, wy / 4, 832) * 0.3;
        if (m > 0.58) { const f = Math.min(1, (m - 0.58) / 0.2) * 0.55 * gm; r = lerp(r, 168, f); g = lerp(g, 176, f); b = lerp(b, 84, f); }
        else if (m < 0.36) { const f = Math.min(1, (0.36 - m) / 0.2) * 0.5 * gm; r = lerp(r, 62, f); g = lerp(g, 128, f); b = lerp(b, 56, f); }
        const dn = valueNoise(wx / 3.2, wy / 3.2, 833) * 0.75 + valueNoise(wx * 1.3, wy * 1.3, 834) * 0.25;
        if (dn > 0.78) { const f = Math.min(1, (dn - 0.78) / 0.07) * 0.85 * gm; r = lerp(r, 146, f); g = lerp(g, 118, f); b = lerp(b, 78, f); }
        // клевер: мелкие тёмные крапинки
        const cl = valueNoise(wx * 3.1, wy * 3.1, 835);
        if (cl > 0.72) { const f = (cl - 0.72) * 1.2 * gm; r -= 20 * f; g -= 6 * f; b -= 18 * f; }
      }
      // узоры биомов: красные полосы бэдлендов, голубые тени на снегу, листва на осенней траве, светлые пятна грибницы
      const bm = Bm[(fy0 < 0.5 ? iy : iy + 1) * N + (fx0 < 0.5 ? ix : ix + 1)];
      if (bm === GROUND.desert) {
        const st = valueNoise(wx / 9, wy / 2.5, 841) * 0.7 + valueNoise(wx / 3, wy / 3, 842) * 0.3;
        if (st > 0.6) { const f = Math.min(1, (st - 0.6) / 0.15) * 0.6; r = lerp(r, 196, f); g = lerp(g, 112, f); b = lerp(b, 72, f); }
        const dune = Math.sin(wx * 0.9 + valueNoise(wx / 6, wy / 6, 843) * 6) * 0.5 + 0.5;
        r += (dune - 0.5) * 10; g += (dune - 0.5) * 9; b += (dune - 0.5) * 6;
      } else if (bm === GROUND.snow) {
        const sh = valueNoise(wx / 4, wy / 4, 844);
        if (sh < 0.4) { const f = (0.4 - sh) * 1.2; r -= 30 * f; g -= 16 * f; b += 2 * f; }
        if (valueNoise(wx * 2.5, wy * 2.5, 845) > 0.86) { r += 14; g += 14; b += 12; }
      } else if (bm === GROUND.autumn) {
        const lv = valueNoise(wx * 1.6, wy * 1.6, 846);
        if (lv > 0.66) { const f = Math.min(1, (lv - 0.66) / 0.12) * 0.7, red = valueNoise(wx / 3, wy / 3, 847) > 0.5; r = lerp(r, red ? 196 : 222, f); g = lerp(g, red ? 74 : 150, f); b = lerp(b, 34, f); }
      } else if (bm === GROUND.mushroom) {
        const sp = valueNoise(wx * 1.2, wy * 1.2, 848);
        if (sp > 0.72) { const f = Math.min(1, (sp - 0.72) / 0.1) * 0.5; r = lerp(r, 176, f); g = lerp(g, 150, f); b = lerp(b, 196, f); }
      }
      // вода: порог по сглаженной маске с шумом — естественная линия берега
      const wv = Wt[k00] * w00 + Wt[k10] * w10 + Wt[k01] * w01 + Wt[k11] * w11 + (valueNoise(wx * 1.7, wy * 1.7, 813) - 0.5) * 0.35;
      if (wv > 0.5) {
        const dp = Dp[k00] * w00 + Dp[k10] * w10 + Dp[k01] * w01 + Dp[k11] * w11;
        const e = clamp((wv - 0.5) / 0.35, 0, 1) * 0.35 + dp * 0.65;
        r = lerp(WATER_SHALLOW[0], WATER_DEEP[0], e); g = lerp(WATER_SHALLOW[1], WATER_DEEP[1], e); b = lerp(WATER_SHALLOW[2], WATER_DEEP[2], e);
        if (wv < 0.58) { const f = 1 - (wv - 0.5) / 0.08; r = lerp(r, WATER_FOAM[0], f * 0.8); g = lerp(g, WATER_FOAM[1], f * 0.8); b = lerp(b, WATER_FOAM[2], f * 0.8); }
        const ripple = (valueNoise(wx * 2.2, wy * 0.8, 814) - 0.5) * 10;
        r += ripple; g += ripple; b += ripple;
      } else if (wv > 0.3) {
        // влажная полоса берега
        const f = (wv - 0.3) / 0.2;
        r = lerp(r, 170, f * 0.45); g = lerp(g, 152, f * 0.45); b = lerp(b, 104, f * 0.45);
      }
      const o = ((py - py0) * IW + (pxl - px0)) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  sg.putImageData(img, px0, py0);
  c.small = small;
  if (part) {
    // заплатка: тот же рисунок, но только в пределах изменившихся клеток
    const g = c.canvas.getContext('2d');
    g.save(); g.beginPath(); g.rect(px0 / GSUB * GPX, py0 / GSUB * GPX, IW / GSUB * GPX, IH / GSUB * GPX); g.clip();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, c.canvas.width, c.canvas.height);
    g.fillStyle = grainPattern(g); g.fillRect(0, 0, c.canvas.width, c.canvas.height);
    drawDecor(g, c);
    g.restore();
    return;
  }
  // 3) растягиваем до GPX со сглаживанием, сверху — мелкое зерно и травинки/цветы
  const cv = c.canvas && c.canvas.width === CHUNK * GPX ? c.canvas : document.createElement('canvas');
  cv.width = cv.height = CHUNK * GPX;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(small, 0, 0, cv.width, cv.height);
  g.fillStyle = grainPattern(g); g.fillRect(0, 0, cv.width, cv.height);
  drawDecor(g, c);
  c.canvas = cv;
  c.oldCanvas = null;
}

function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// травы, цветы, грибы, камешки, пни: на лугах — цветочные поляны, в тёмном лесу — грибы, на проплешинах — камешки
const DECOR_G = { grass: [0, 1, 2, 3, 4], flower: [5, 6, 7, 8, 9, 10, 11, 12, 13], forest: [14, 15, 16, 20, 21, 22], pebble: [17, 18, 19, 23] };
function pickDecor(group, x, y) { const a = DECOR_G[group]; return a[Math.floor(hash2(x, y, 516) * a.length)]; }
// мелочь биомов рисуем кодом (в кэш чанка, поэтому бесплатно в кадре)
function decorDraw(g, kind, X, Y, h) {
  const z = GPX;
  switch (kind) {
    case 'tuft': // сухая трава пустыни
      g.strokeStyle = h < 0.5 ? '#a08850' : '#8a6a3a'; g.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.35; g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * z * 0.3, Y + Math.sin(a) * z * 0.3); g.stroke(); }
      break;
    case 'bones': // кости и череп
      g.fillStyle = '#ece4d0'; g.strokeStyle = 'rgba(80,60,40,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(X, Y, z * 0.12, z * 0.1, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#4a3a2a'; g.fillRect(X - z * 0.06, Y - z * 0.02, z * 0.04, z * 0.04); g.fillRect(X + z * 0.02, Y - z * 0.02, z * 0.04, z * 0.04);
      g.strokeStyle = '#e4dcc8'; g.lineWidth = 2; g.beginPath(); g.moveTo(X + z * 0.15, Y + z * 0.12); g.lineTo(X + z * 0.42, Y + z * 0.02); g.stroke();
      break;
    case 'drift': // сугроб
      g.fillStyle = '#c4d2e2'; g.beginPath(); g.ellipse(X, Y + z * 0.05, z * 0.42, z * 0.15, 0, 0, 7); g.fill();
      g.fillStyle = '#f8fcff'; g.beginPath(); g.ellipse(X - z * 0.03, Y, z * 0.38, z * 0.12, 0, 0, 7); g.fill();
      break;
    case 'ice': // льдинки
      g.fillStyle = 'rgba(190,225,245,0.9)'; g.beginPath(); g.moveTo(X, Y - z * 0.1); g.lineTo(X + z * 0.1, Y); g.lineTo(X, Y + z * 0.06); g.lineTo(X - z * 0.12, Y); g.closePath(); g.fill();
      break;
    case 'leaves': // палая листва
      for (let i = 0; i < 7; i++) { g.fillStyle = ['#d0602a', '#e0a030', '#b83a20', '#c88a2a'][(i + Math.floor(h * 10)) % 4]; g.beginPath(); g.ellipse(X + Math.cos(i * 2.4 + h * 6) * z * 0.3, Y + Math.sin(i * 2.4 + h * 6) * z * 0.2, z * 0.07, z * 0.04, i, 0, 7); g.fill(); }
      break;
    case 'shroom': { // грибочки
      const cols = ['#d84a6a', '#8a5ad0', '#4ac0d0', '#e0a040'], col = cols[Math.floor(h * 4)];
      for (let i = 0; i < 3; i++) {
        const x = X + (i - 1) * z * 0.16, y = Y + (i % 2) * z * 0.08, sz = z * (0.07 + (i === 1 ? 0.04 : 0));
        g.fillStyle = '#e8e0d0'; g.fillRect(x - sz * 0.25, y - sz, sz * 0.5, sz);
        g.fillStyle = col; g.beginPath(); g.ellipse(x, y - sz, sz, sz * 0.6, 0, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x - sz * 0.4, y - sz * 1.3, sz * 0.2, sz * 0.2);
      }
      break;
    }
    case 'log': { // упавшее бревно
      const a = (h - 0.5) * 1.2;
      g.save(); g.translate(X, Y); g.rotate(a);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(-z * 0.38, z * 0.02, z * 0.8, z * 0.12);
      g.fillStyle = '#6e4a28'; g.fillRect(-z * 0.4, -z * 0.09, z * 0.8, z * 0.16);
      g.fillStyle = '#8a6038'; g.fillRect(-z * 0.4, -z * 0.09, z * 0.8, z * 0.05);
      g.fillStyle = '#c8a070'; g.beginPath(); g.ellipse(z * 0.4, -z * 0.01, z * 0.04, z * 0.08, 0, 0, 7); g.fill();
      g.fillStyle = '#4a8a3a'; g.fillRect(-z * 0.1, -z * 0.11, z * 0.12, z * 0.04);
      g.restore();
      break;
    }
    case 'stump': // пень
      g.fillStyle = '#5a3a20'; g.fillRect(X - z * 0.12, Y - z * 0.12, z * 0.24, z * 0.14);
      g.fillStyle = '#c8a070'; g.beginPath(); g.ellipse(X, Y - z * 0.12, z * 0.12, z * 0.06, 0, 0, 7); g.fill();
      g.strokeStyle = '#8a6a40'; g.lineWidth = 1; g.beginPath(); g.ellipse(X, Y - z * 0.12, z * 0.06, z * 0.03, 0, 0, 7); g.stroke();
      break;
  }
}
function drawBiomeDecor(g, c) {
  for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
    const i = ly * CHUNK + lx, gr = c.ground[i];
    if (c.res[i]) continue;
    const x = c.cx * CHUNK + lx, y = c.cy * CHUNK + ly, h = hash2(x, y, 4517);
    let kind = null;
    if (gr === GROUND.desert) kind = h < 0.07 ? 'tuft' : h < 0.075 ? 'bones' : null;
    else if (gr === GROUND.snow) kind = h < 0.08 ? 'drift' : h < 0.1 ? 'ice' : null;
    else if (gr === GROUND.autumn) kind = h < 0.16 ? 'leaves' : h < 0.17 ? 'log' : h < 0.18 ? 'stump' : null;
    else if (gr === GROUND.mushroom) kind = h < 0.12 ? 'shroom' : h < 0.13 ? 'log' : null;
    else if (gr === GROUND.grass || gr === GROUND.dark) kind = h < 0.006 ? 'log' : h < 0.012 ? 'stump' : null;
    if (!kind) continue;
    decorDraw(g, kind, (lx + 0.3 + hash2(x, y, 4518) * 0.4) * GPX, (ly + 0.4 + hash2(x, y, 4519) * 0.4) * GPX, hash2(x, y, 4520));
  }
}
function drawDecor(g, c) {
  drawBiomeDecor(g, c);
  const st = typeof SPRITES3D !== 'undefined' && SPRITES3D.sets.nature, img = st && S3D.img[st.file];
  if (!img) return;
  const s = GPX / st.ppt;
  for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
    const i = ly * CHUNK + lx, gr = c.ground[i];
    if (c.res[i] || (gr !== GROUND.grass && gr !== GROUND.dark && gr !== GROUND.swamp && gr !== GROUND.autumn && gr !== GROUND.mushroom)) continue;
    const x = c.cx * CHUNK + lx, y = c.cy * CHUNK + ly;
    // до двух украшений на клетку
    for (let k = 0; k < 2; k++) {
      const h = hash2(x, y, 515 + k * 7);
      const meadow = valueNoise(x / 11, y / 11, 831) * 0.7 + valueNoise(x / 4, y / 4, 832) * 0.3;
      const dirt = valueNoise(x / 3.2, y / 3.2, 833) * 0.75 + valueNoise(x * 1.3, y * 1.3, 834) * 0.25;
      const flowers = valueNoise(x / 6, y / 6, 836);
      let grp = null;
      if (dirt > 0.8) { if (h < 0.25) grp = 'pebble'; }
      else if (gr === GROUND.swamp) { if (h < 0.06) grp = 'grass'; }
      else if (gr === GROUND.dark || gr === GROUND.mushroom) { if (h < 0.08) grp = 'forest'; else if (h < 0.2 && gr === GROUND.dark) grp = 'grass'; }
      else if (gr === GROUND.autumn) { if (h < 0.05) grp = 'forest'; else if (h < 0.1) grp = 'grass'; }
      else if (flowers > 0.66 && meadow > 0.4) { if (h < 0.38) grp = 'flower'; else if (h < 0.55) grp = 'grass'; }
      else if (h < 0.16) grp = 'grass'; else if (h < 0.2) grp = 'flower'; else if (h < 0.215) grp = 'forest'; else if (h < 0.23) grp = 'pebble';
      if (!grp) continue;
      const it = st.items['decor' + pickDecor(grp, x + k * 31, y)];
      if (!it) continue;
      const ox = (hash2(x, y, 518 + k) - 0.5) * 0.8 * GPX, oy = (hash2(x, y, 519 + k) - 0.5) * 0.8 * GPX;
      g.drawImage(img, it[0], it[1], it[2], it[3], lx * GPX - it[4] * s + ox, ly * GPX - it[5] * s + oy, it[2] * s, it[3] * s);
    }
  }
}

// клетка изменилась (срублено дерево, выработана руда): перерисуем чанк целиком, пока показывая старую картинку
// клетка поменяла вид (кончилась руда и т. п.): перерисуем заплаткой её и соседей в ближайшем кадре
function redrawTile(x, y) {
  const c = chunkOf(x, y);
  if (!c.canvas) return;
  const lx = x - c.cx * CHUNK, ly = y - c.cy * CHUNK;
  const r = c.dirtyRect;
  if (!r) c.dirtyRect = [lx - 1, ly - 1, lx + 1, ly + 1];
  else { r[0] = Math.min(r[0], lx - 1); r[1] = Math.min(r[1], ly - 1); r[2] = Math.max(r[2], lx + 1); r[3] = Math.max(r[3], ly + 1); }
}
