'use strict';
// Облака: полупрозрачные облака плывут над картой, по земле скользят их мягкие тени.
// Облака не хранятся: поле облаков задано сидом и сдвигается ветром со временем — у хозяина и гостя оно одинаковое.
// Каждая форма рисуется один раз в отдельный холст (облако и его тень), в кадре — по два drawImage на облако.
// Изредка попадаются облака-«пасхалки»: голем, сердце, дракон, шестерня.

const CLOUD = {
  cell: 26,                 // клетка сетки облаков (в клетках мира)
  chance: 0.72,             // вероятность облака в клетке сетки
  vx: 0.55, vy: 0.17,       // дрейф (клеток в секунду)
  sunX: 3.2, sunY: 4.6,     // куда падает тень (клеток на единицу высоты облака)
  shapes: [], eggs: [], ready: false,
};
const CLOUD_PX = 256;       // ширина холста формы
const EGG_NAMES = ['голема', 'сердце', 'дракона', 'шестерню'];
const CLOUD_SEEN = new Set();

// мягкий кружок: заливка с размытой тенью даёт пушистый край без ctx.filter (работает везде)
function cloudPuff(g, x, y, r) {
  g.shadowBlur = r * 0.9; g.shadowColor = '#fff';
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}
// объём: верх светлый, низ сероватый; затем — копия формы для тени
function cloudFinish(c) {
  const g = c.getContext('2d');
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, 0, 0, c.height);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(214,222,236,0.18)'); gr.addColorStop(1, 'rgba(160,170,192,0.42)');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  // тень: тёмный силуэт той же формы (уменьшен вдвое — тень мягкая, растягиваем со сглаживанием)
  const sh = document.createElement('canvas');
  sh.width = Math.ceil(c.width / 2); sh.height = Math.ceil(c.height / 2);
  const sg = sh.getContext('2d');
  sg.drawImage(c, 0, 0, sh.width, sh.height);
  sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#0c1420'; sg.fillRect(0, 0, sh.width, sh.height);
  return { cv: c, sh, w: c.width / CLOUD_PX };
}
function cloudCanvas(h) { const c = document.createElement('canvas'); c.width = CLOUD_PX; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; return [c, g]; }

// обычное облако: гроздь кружков по эллипсу, разной плотности и вытянутости
function genCloudShape(seed) {
  const R = prng(seed * 7919 + 13);
  const H = 120 + Math.floor(R() * 60);
  const [c, g] = cloudCanvas(H);
  const n = 10 + Math.floor(R() * 14), stretch = 0.75 + R() * 0.5;
  const cx = CLOUD_PX / 2, cy = H * 0.58;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R());
    // кучевые облака: кружки выше центра крупнее (шапка), снизу — плоское основание
    let x = cx + Math.cos(a) * d * CLOUD_PX * 0.22 * stretch, y = cy + Math.sin(a) * d * H * 0.18;
    const r = (13 + R() * 20) * (y < cy ? 1.15 : 0.85);
    // не выходим за края холста (иначе облако «обрезано»)
    const m = r * 1.9;
    x = clamp(x, m, CLOUD_PX - m); y = clamp(Math.min(y, cy + H * 0.12), m, H - m);
    cloudPuff(g, x, y, r);
  }
  // рваные клочья по краям
  for (let i = 0; i < 4; i++) { g.globalAlpha = 0.5; cloudPuff(g, cx + (R() - 0.5) * CLOUD_PX * 0.62, cy + (R() - 0.3) * H * 0.25, 7 + R() * 8); }
  g.globalAlpha = 1;
  return cloudFinish(c);
}

// пасхалки: узнаваемый силуэт из пушистых кружков
function genEggShape(kind) {
  const [c, g] = cloudCanvas(200);
  const P = (x, y, r) => cloudPuff(g, x, y, r);
  const line = (x0, y0, x1, y1, r, step) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / (step || r * 0.8))); for (let i = 0; i <= n; i++) P(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r); };
  if (kind === 0) {
    // голем: квадратная голова, широкие плечи, руки-колонны, короткие ноги
    for (let x = 108; x <= 148; x += 14) for (let y = 30; y <= 56; y += 13) P(x, y, 13);
    for (let x = 88; x <= 168; x += 13) for (let y = 78; y <= 128; y += 13) P(x, y, 15);
    line(70, 82, 56, 150, 13); line(186, 82, 200, 150, 13);
    P(56, 158, 16); P(200, 158, 16);
    line(104, 136, 102, 178, 14); line(152, 136, 154, 178, 14);
  } else if (kind === 1) {
    // сердце (параметрическая кривая)
    for (let i = 0; i < 64; i++) {
      const t = i / 64 * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3), y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      P(128 + x * 5.2, 96 + y * 5.2, 13);
    }
    for (let y = 50; y <= 140; y += 16) for (let x = 70; x <= 186; x += 16) {
      const u = (x - 128) / 5.2 / 16, v = -(y - 96) / 5.2 / 16;
      if (Math.pow(u * u + v * v - 0.6, 3) - u * u * v * v * v < 0) P(x, y, 14);
    }
  } else if (kind === 2) {
    // дракон: толстое извилистое тело, большая голова с рогами, два перепончатых крыла, хвост с шипом
    const poly = (pts, r) => {
      // заполнить многоугольник кружками
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let y = y0; y <= y1; y += r) for (let x = x0; x <= x1; x += r) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) P(x, y, r * 0.9);
      }
    };
    // тело-змея с утолщением посередине
    for (let i = 0; i <= 24; i++) { const x = 20 + i * 6.5, y = 150 + Math.sin(i * 0.38 + 0.6) * 14; P(x, y, 6 + Math.sin(i / 24 * Math.PI) * 11); }
    line(176, 146, 192, 116, 8); // тонкая шея
    P(204, 106, 19); P(224, 110, 13); P(238, 114, 9); // голова и вытянутая морда
    P(226, 132, 8); P(240, 134, 6); // нижняя челюсть (между челюстями — просвет)
    line(196, 92, 184, 70, 4); line(208, 90, 204, 66, 4); // рога
    // одно большое крыло над телом: перепонка с зубчатым нижним краем, отделена от тела просветом
    poly([[96, 122], [72, 40], [190, 52], [172, 80], [156, 70], [144, 98], [126, 84], [116, 116]], 10);
    line(96, 118, 110, 136, 6); // корень крыла
    line(20, 150, 8, 132, 5); P(8, 126, 8); // хвост с кисточкой
  } else {
    // шестерня: обод с зубцами и дырой в центре
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; P(128 + Math.cos(a) * 52, 100 + Math.sin(a) * 52, 15); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; line(128 + Math.cos(a) * 62, 100 + Math.sin(a) * 62, 128 + Math.cos(a) * 82, 100 + Math.sin(a) * 82, 12); }
    g.shadowBlur = 10; g.shadowColor = '#000'; g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(128, 100, 22, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  // плотно уложенные кружки дают сплошной белый — делаем пасхалку такой же полупрозрачной, как обычные облака
  g.shadowBlur = 0; g.globalCompositeOperation = 'destination-in'; g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  return cloudFinish(c);
}

function initClouds() {
  if (CLOUD.ready) return;
  for (let i = 0; i < 12; i++) CLOUD.shapes.push(genCloudShape(i + 1));
  for (let i = 0; i < 4; i++) CLOUD.eggs.push(genEggShape(i));
  CLOUD.ready = true;
}

// облако в клетке сетки: форма, размер (клеток), высота (длина тени), плотность
function cloudInCell(gx, gy, out) {
  // разные слагаемые к координатам, а не к сиду: иначе соседние сиды hash2 дают похожие числа
  const ch = k => hash2(gx + k * 1013, gy - k * 7919, SEED + 31337);
  const h = ch(0);
  if (h > CLOUD.chance) return false;
  const k = ch(1);
  out.egg = ch(2) < 0.02;
  out.shape = out.egg ? CLOUD.eggs[Math.floor(k * CLOUD.eggs.length)] : CLOUD.shapes[Math.floor(k * CLOUD.shapes.length)];
  out.size = out.egg ? 24 : 12 + ch(3) * 22;
  out.ox = ch(4) * CLOUD.cell; out.oy = ch(5) * CLOUD.cell;
  out.alt = 0.6 + ch(6) * 0.8;
  out.dens = out.egg ? 0.8 : 0.55 + ch(7) * 0.45;
  out.key = gx + ',' + gy;
  return true;
}

const _cl = {};
function drawClouds() {
  if (SETTINGS.clouds === 0 || !S || inDungeonY(S.player.y)) return;
  if (!CLOUD.ready) initClouds();
  const low = SETTINGS.quality === 'low';
  const ox = S.time * CLOUD.vx, oy = S.time * CLOUD.vy;
  const dk = darkness(), z = VIEW.z;
  // облака закрывают обзор — вблизи прозрачнее, издалека плотнее; ночью тени еле видны
  const zoomK = clamp((60 * DPR - z) / (44 * DPR), 0, 1);
  const shA = 0.3 * (1 - dk * 0.85), clA = (0.32 + zoomK * 0.25) * (1 - dk * 0.5);
  const pad = 30;
  const gx0 = Math.floor((VIEW.x0 - ox - pad) / CLOUD.cell), gx1 = Math.floor((VIEW.x1 - ox + pad) / CLOUD.cell);
  const gy0 = Math.floor((VIEW.y0 - oy - pad) / CLOUD.cell), gy1 = Math.floor((VIEW.y1 - oy + pad) / CLOUD.cell);
  const list = [];
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    // на низком качестве — вдвое реже
    if (low && ((gx + gy) & 1)) continue;
    if (!cloudInCell(gx, gy, _cl)) continue;
    const sh = _cl.shape, w = _cl.size, h = w * sh.cv.height / sh.cv.width;
    const x = gx * CLOUD.cell + _cl.ox + ox - w / 2, y = gy * CLOUD.cell + _cl.oy + oy - h / 2;
    list.push([sh, x, y, w, h, _cl.alt, _cl.dens, _cl.egg, _cl.key]);
  }
  if (!list.length) return;
  G.save();
  G.imageSmoothingEnabled = true;
  // тени: смещены по солнцу, тем дальше, чем выше облако
  for (const [sh, x, y, w, h, alt, dens] of list) {
    const X = sx(x + CLOUD.sunX * alt), Y = sy(y + CLOUD.sunY * alt), Wd = w * z, Ht = h * z;
    if (X > CV.width || Y > CV.height || X + Wd < 0 || Y + Ht < 0) continue;
    G.globalAlpha = shA * dens;
    G.drawImage(sh.sh, X, Y, Wd, Ht);
  }
  // сами облака (на низком качестве — только тени)
  if (!low && clA > 0.02) {
    const cx = CV.width / 2, cy = CV.height / 2;
    for (const [sh, x, y, w, h, , dens, egg, key] of list) {
      const X = sx(x), Y = sy(y), Wd = w * z, Ht = h * z;
      if (X > CV.width || Y > CV.height || X + Wd < 0 || Y + Ht < 0) continue;
      if (egg && !CLOUD_SEEN.has(key) && X > 0 && Y > 0 && X + Wd < CV.width && Y + Ht < CV.height) {
        CLOUD_SEEN.add(key);
        log('Взгляните на небо: облако похоже на ' + EGG_NAMES[CLOUD.eggs.indexOf(sh)] + '!', 'good');
      }
      // над героем облако редеет, чтобы не мешать
      const over = cx > X && cx < X + Wd && cy > Y && cy < Y + Ht ? 0.55 : 1;
      G.globalAlpha = clA * dens * over;
      G.drawImage(sh.cv, X, Y, Wd, Ht);
    }
  }
  G.restore();
}
