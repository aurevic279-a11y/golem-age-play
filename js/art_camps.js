'use strict';
// Постройки лагерей гоблинов и орков: объёмные, с тенями и деталями.
// Каждая картинка: ширина = размер постройки, высота больше (постройка выше своей клетки), низ = низ основания.

const CAMP_ART = {};

// ---------- общие материалы ----------
function woodPlanks(g, x, y, w, h, base, vertical) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = base; g.fillRect(x, y, w, h);
  const n = vertical ? Math.max(2, Math.round(w / 10)) : Math.max(2, Math.round(h / 9));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    g.fillStyle = i % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,230,190,0.07)';
    if (vertical) g.fillRect(x + t * w, y, w / n, h); else g.fillRect(x, y + t * h, w, h / n);
    g.fillStyle = 'rgba(30,18,8,0.5)';
    if (vertical) g.fillRect(x + t * w, y, 1.2, h); else g.fillRect(x, y + t * h, w, 1.2);
  }
  g.restore();
}
function bricks(g, x, y, w, h, base) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = base; g.fillRect(x, y, w, h);
  const bh = 9, bw = 18;
  for (let r = 0; r * bh < h; r++) {
    for (let c = -1; c * bw < w; c++) {
      const bx = x + c * bw + (r % 2 ? bw / 2 : 0), by = y + r * bh;
      g.fillStyle = `rgba(255,255,255,${0.04 + ((r * 7 + c * 3) % 5) * 0.015})`;
      g.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    }
    g.fillStyle = 'rgba(20,18,15,0.55)'; g.fillRect(x, y + r * bh, w, 1.3);
    for (let c = -1; c * bw < w; c++) g.fillRect(x + c * bw + (r % 2 ? bw / 2 : 0), y + r * bh, 1.3, bh);
  }
  g.restore();
}
function groundShadow(g, cx, cy, rx, ry, a) {
  g.fillStyle = `rgba(0,0,0,${a || 0.35})`;
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, 7); g.fill();
}
function skull(g, x, y, s) {
  g.fillStyle = '#e8e0cc'; g.beginPath(); g.ellipse(x, y, s, s * 0.9, 0, 0, 7); g.fill();
  g.fillRect(x - s * 0.55, y + s * 0.4, s * 1.1, s * 0.55);
  g.fillStyle = '#1a1410'; g.beginPath(); g.ellipse(x - s * 0.38, y, s * 0.26, s * 0.3, 0, 0, 7); g.ellipse(x + s * 0.38, y, s * 0.26, s * 0.3, 0, 0, 7); g.fill();
}
function stake(g, x, yb, h, w, col) {
  poly(g, [[x - w / 2, yb], [x - w / 2, yb - h + w], [x, yb - h], [x + w / 2, yb - h + w], [x + w / 2, yb]], lin(g, x - w / 2, 0, x + w / 2, 0, [[0, shade(col, 0.15)], [0.5, col], [1, shade(col, -0.45)]]));
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.stroke();
}

// ---------- гоблины ----------
function artGhut(size) {
  return artCanvas(size, size + 0.9, (g, w, h) => {
    const cx = w / 2, base = h - ART * 0.2, R = prng(17 + size);
    groundShadow(g, cx + ART * 0.25, base, w * 0.5, ART * 0.45 * size / 2);
    // шкуры на каркасе — конус
    const top = ART * 0.15, half = w * 0.46;
    poly(g, [[cx - half, base], [cx, top], [cx + half, base]], lin(g, cx - half, 0, cx + half, 0, [[0, '#a0784a'], [0.45, '#7a5430'], [1, '#3e2a16']]));
    // заплаты из шкур
    for (let i = 0; i < 9; i++) {
      const t = 0.25 + R() * 0.65, side = (R() - 0.5) * 1.6, py = lerp(top, base, t), px0 = cx + side * half * t * 0.6;
      g.fillStyle = pick(['#8a6a40', '#6a4a2a', '#b08a58', '#5a3e22']);
      g.beginPath(); g.ellipse(px0, py, ART * 0.12 * size / 2, ART * 0.08 * size / 2, R(), 0, 7); g.fill();
      g.strokeStyle = 'rgba(30,20,10,0.6)'; g.setLineDash([2, 2]); g.stroke(); g.setLineDash([]);
    }
    // шесты наверху
    g.strokeStyle = '#3a2614'; g.lineWidth = 3;
    for (const d of [-1, 0.3, 1]) { g.beginPath(); g.moveTo(cx + d * 3, top + 8); g.lineTo(cx + d * 12, top - ART * 0.14); g.stroke(); }
    // вход
    g.fillStyle = '#140c06';
    g.beginPath(); g.moveTo(cx - half * 0.28, base); g.quadraticCurveTo(cx, base - (base - top) * 0.62, cx + half * 0.28, base); g.closePath(); g.fill();
    // кости у входа
    skull(g, cx + half * 0.55, base - ART * 0.22, ART * 0.09 * size / 2 + 2);
    g.strokeStyle = '#d8d0bc'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(cx - half * 0.7, base - 2); g.lineTo(cx - half * 0.45, base - ART * 0.3); g.stroke();
  });
}
function artGtotem() {
  return artCanvas(1, 2.4, (g, w, h) => {
    const cx = w / 2, base = h - ART * 0.12;
    groundShadow(g, cx + ART * 0.15, base, ART * 0.32, ART * 0.12);
    // столб
    g.fillStyle = lin(g, cx - 5, 0, cx + 5, 0, [[0, '#7a5430'], [1, '#3a2614']]);
    g.fillRect(cx - 4, ART * 0.2, 8, base - ART * 0.2);
    // перекладина и рваное знамя
    g.fillStyle = '#4a3018'; g.fillRect(cx - ART * 0.32, ART * 0.32, ART * 0.64, 5);
    poly(g, [[cx - ART * 0.28, ART * 0.36], [cx + ART * 0.28, ART * 0.36], [cx + ART * 0.26, ART * 1.15], [cx + ART * 0.12, ART * 1.0], [cx, ART * 1.18], [cx - ART * 0.14, ART * 1.02], [cx - ART * 0.27, ART * 1.14]],
      lin(g, 0, ART * 0.36, 0, ART * 1.15, [[0, '#4a7a2a'], [1, '#2a4a18']]), 'rgba(0,0,0,0.4)', 1.5);
    skull(g, cx, ART * 0.7, ART * 0.11);
    // перья и черепок наверху
    g.fillStyle = '#c03030'; poly(g, [[cx - 2, ART * 0.2], [cx - 10, ART * 0.02], [cx + 2, ART * 0.16]], '#c03030');
    poly(g, [[cx + 2, ART * 0.2], [cx + 11, ART * 0.04], [cx - 1, ART * 0.15]], '#e8b84a');
  });
}
function artPalisadeC() {
  return artCanvas(1, 1.7, (g, w, h) => {
    const base = h - ART * 0.1;
    groundShadow(g, w / 2 + ART * 0.15, base, ART * 0.5, ART * 0.13, 0.3);
    for (let i = 0; i < 4; i++) stake(g, ART * (0.14 + i * 0.24), base, ART * (1.15 + (i % 2) * 0.2), ART * 0.22, i % 2 ? '#6a4a28' : '#7a5632');
    g.fillStyle = '#c8b090'; g.fillRect(0, base - ART * 0.62, w, 3);
  });
}

// ---------- орки ----------
function artOtent(size) {
  return artCanvas(size, size + 1.1, (g, w, h) => {
    const cx = w / 2, base = h - ART * 0.2, top = ART * 0.1, half = w * 0.48;
    groundShadow(g, cx + ART * 0.3, base, w * 0.52, ART * 0.5 * size / 2);
    // шатёр: две грани (светлая и тёмная) в красную полоску
    const mid = [cx + half * 0.1, base - ART * 0.1];
    poly(g, [[cx - half, base], [cx, top], mid], lin(g, cx - half, 0, cx, 0, [[0, '#a8402c'], [1, '#7a2a1c']]));
    poly(g, [[cx, top], [cx + half, base], mid], lin(g, cx, 0, cx + half, 0, [[0, '#5a1e14'], [1, '#3a120c']]));
    g.strokeStyle = 'rgba(40,10,6,0.5)'; g.lineWidth = 3;
    for (let i = 1; i < 4; i++) { const t = i / 4; g.beginPath(); g.moveTo(cx, top); g.lineTo(lerp(cx - half, mid[0], t), lerp(base, mid[1], t)); g.stroke(); }
    // шипы на верхушке
    g.strokeStyle = '#2a1c10'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx, top + 6); g.lineTo(cx, top - ART * 0.28); g.stroke();
    g.fillStyle = '#b8bcc0'; poly(g, [[cx - 4, top - ART * 0.26], [cx, top - ART * 0.45], [cx + 4, top - ART * 0.26]], '#b8bcc0');
    // вход и эмблема
    g.fillStyle = '#120806'; poly(g, [[cx - half * 0.22, base], [cx - 2, base - (base - top) * 0.5], [cx + half * 0.16, base - 2]], '#120806');
    skull(g, cx - half * 0.42, base - (base - top) * 0.38, ART * 0.1 * size / 2 + 2);
    // колья у шатра
    stake(g, cx + half * 0.95, base + 2, ART * 0.55, 7, '#6a4a28');
    stake(g, cx - half * 0.98, base + 2, ART * 0.5, 7, '#6a4a28');
  });
}
function artWarhall() {
  return artCanvas(3, 4.4, (g, w, h) => {
    const base = h - ART * 0.25, wallH = ART * 1.05, wallTop = base - wallH, roofTop = wallTop - ART * 1.55;
    groundShadow(g, w / 2 + ART * 0.4, base, w * 0.55, ART * 0.65);
    // стена фасада из брёвен
    woodPlanks(g, ART * 0.15, wallTop, w - ART * 0.3, wallH, '#6a4828', true);
    g.fillStyle = lin(g, 0, wallTop, 0, base, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]); g.fillRect(ART * 0.15, wallTop, w - ART * 0.3, wallH);
    // крыша: светлый и тёмный скаты (солома/дранка)
    poly(g, [[0, wallTop + 6], [w / 2, roofTop], [w / 2, wallTop - 8], [ART * 0.1, wallTop + 6]], lin(g, 0, roofTop, w / 2, wallTop, [[0, '#9a7a4a'], [1, '#6a5230']]));
    poly(g, [[w / 2, roofTop], [w, wallTop + 6], [w - ART * 0.1, wallTop + 6], [w / 2, wallTop - 8]], lin(g, w / 2, roofTop, w, wallTop, [[0, '#4a3a22'], [1, '#2e2414']]));
    g.strokeStyle = 'rgba(30,20,8,0.45)'; g.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) { const t = i / 10; g.beginPath(); g.moveTo(w / 2, roofTop); g.lineTo(t * w, wallTop + 6); g.stroke(); }
    // конёк с рогами
    g.strokeStyle = '#e8e0cc'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w / 2 - 4, roofTop + 4); g.quadraticCurveTo(w / 2 - ART * 0.35, roofTop - ART * 0.15, w / 2 - ART * 0.3, roofTop - ART * 0.5); g.stroke();
    g.beginPath(); g.moveTo(w / 2 + 4, roofTop + 4); g.quadraticCurveTo(w / 2 + ART * 0.35, roofTop - ART * 0.15, w / 2 + ART * 0.3, roofTop - ART * 0.5); g.stroke();
    g.lineCap = 'butt';
    // ворота
    g.fillStyle = '#1a0e06'; g.beginPath(); g.moveTo(w / 2 - ART * 0.38, base); g.lineTo(w / 2 - ART * 0.38, base - ART * 0.6); g.quadraticCurveTo(w / 2, base - ART * 0.95, w / 2 + ART * 0.38, base - ART * 0.6); g.lineTo(w / 2 + ART * 0.38, base); g.fill();
    g.strokeStyle = '#3a2614'; g.lineWidth = 4; g.stroke();
    skull(g, w / 2, base - ART * 0.95, ART * 0.13);
    // знамёна по бокам
    for (const sx of [ART * 0.45, w - ART * 0.45]) {
      g.fillStyle = '#3a2614'; g.fillRect(sx - 2, wallTop - ART * 0.2, 4, wallH + ART * 0.2);
      poly(g, [[sx + 2, wallTop - ART * 0.15], [sx + ART * 0.3, wallTop - ART * 0.1], [sx + ART * 0.28, wallTop + ART * 0.5], [sx + ART * 0.15, wallTop + ART * 0.38], [sx + 2, wallTop + ART * 0.5]], '#8a1e14', 'rgba(0,0,0,0.4)', 1);
    }
  });
}
function artWatchtower() {
  return artCanvas(2, 4.2, (g, w, h) => {
    const base = h - ART * 0.2, plat = base - ART * 2.2;
    groundShadow(g, w / 2 + ART * 0.5, base, w * 0.55, ART * 0.45);
    // ноги и раскосы
    g.strokeStyle = '#4a3018'; g.lineWidth = 7;
    for (const x of [ART * 0.3, w - ART * 0.3]) { g.beginPath(); g.moveTo(x, base); g.lineTo(x + (x < w / 2 ? 8 : -8), plat); g.stroke(); }
    g.lineWidth = 4; g.strokeStyle = '#5a3a1e';
    for (let k = 0; k < 2; k++) {
      const y0 = plat + (base - plat) * (k * 0.5), y1 = plat + (base - plat) * (k * 0.5 + 0.5);
      g.beginPath(); g.moveTo(ART * 0.32, y0); g.lineTo(w - ART * 0.32, y1); g.moveTo(w - ART * 0.32, y0); g.lineTo(ART * 0.32, y1); g.stroke();
    }
    // площадка с бортиком
    woodPlanks(g, ART * 0.05, plat - ART * 0.45, w - ART * 0.1, ART * 0.5, '#7a5632', true);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(ART * 0.05, plat, w - ART * 0.1, 5);
    // лучник-орк над бортиком
    g.fillStyle = '#4a7a3a'; g.beginPath(); g.arc(w / 2, plat - ART * 0.55, ART * 0.15, 0, 7); g.fill();
    g.fillStyle = '#5a3a2a'; g.fillRect(w / 2 - ART * 0.14, plat - ART * 0.45, ART * 0.28, ART * 0.05);
    g.strokeStyle = '#8a5a2a'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2 + ART * 0.2, plat - ART * 0.6, ART * 0.2, -1.3, 1.3); g.stroke();
    // крыша-конус
    const rt = plat - ART * 1.45;
    poly(g, [[ART * -0.05, plat - ART * 0.75], [w / 2, rt], [w / 2, plat - ART * 0.8]], lin(g, 0, rt, w / 2, plat, [[0, '#9a4a2a'], [1, '#6a2a18']]));
    poly(g, [[w / 2, rt], [w + ART * 0.05, plat - ART * 0.75], [w / 2, plat - ART * 0.8]], lin(g, w / 2, rt, w, plat, [[0, '#4a1e10'], [1, '#2e120a']]));
    g.fillStyle = '#8a1e14'; poly(g, [[w / 2, rt], [w / 2, rt - ART * 0.35], [w / 2 + ART * 0.28, rt - ART * 0.25], [w / 2, rt - ART * 0.15]], '#8a1e14');
  });
}
function artTotem() {
  return artCanvas(1, 2.5, (g, w, h) => {
    const cx = w / 2, base = h - ART * 0.12;
    groundShadow(g, cx + ART * 0.2, base, ART * 0.36, ART * 0.13);
    // три вырезанных лика друг на друге
    const cols = ['#7a5430', '#6a4a2a', '#8a603a'];
    for (let i = 0; i < 3; i++) {
      const y1 = base - i * ART * 0.62, y0 = y1 - ART * 0.6;
      g.fillStyle = lin(g, cx - ART * 0.3, 0, cx + ART * 0.3, 0, [[0, shade(cols[i], 0.15)], [1, shade(cols[i], -0.45)]]);
      g.fillRect(cx - ART * 0.28, y0, ART * 0.56, ART * 0.6);
      g.fillStyle = '#a03030'; g.fillRect(cx - ART * 0.28, y0 + ART * 0.06, ART * 0.56, 3);
      g.fillStyle = '#1a0e06'; g.fillRect(cx - ART * 0.16, y0 + ART * 0.4, ART * 0.32, ART * 0.08);
      g.fillStyle = '#a0ffa0';
      g.fillRect(cx - ART * 0.16, y0 + ART * 0.2, ART * 0.1, ART * 0.08); g.fillRect(cx + ART * 0.06, y0 + ART * 0.2, ART * 0.1, ART * 0.08);
    }
    // крылья наверху
    const ty = base - 3 * ART * 0.62;
    poly(g, [[cx - ART * 0.28, ty + 4], [cx - ART * 0.5, ty - ART * 0.2], [cx - ART * 0.1, ty - 2]], '#c8a050');
    poly(g, [[cx + ART * 0.28, ty + 4], [cx + ART * 0.5, ty - ART * 0.2], [cx + ART * 0.1, ty - 2]], '#a8803a');
  });
}
function artSpikewall() {
  return artCanvas(1, 1.4, (g, w, h) => {
    const base = h - ART * 0.12;
    groundShadow(g, w / 2 + ART * 0.12, base, ART * 0.5, ART * 0.12, 0.28);
    g.fillStyle = '#4a3018'; g.fillRect(0, base - ART * 0.3, w, ART * 0.12);
    for (let i = 0; i < 3; i++) {
      const x = ART * (0.18 + i * 0.32);
      g.save(); g.translate(x, base); g.rotate(-0.45 + i * 0.1);
      stake(g, 0, 0, ART * 0.85, ART * 0.16, '#7a5632'); g.restore();
    }
  });
}
function artKeep() {
  return artCanvas(3, 5.2, (g, w, h) => {
    const base = h - ART * 0.25, top = base - ART * 3.2;
    groundShadow(g, w / 2 + ART * 0.55, base, w * 0.58, ART * 0.7);
    // основной объём: фасад и правая грань
    const fx0 = ART * 0.15, fx1 = w - ART * 0.55;
    bricks(g, fx0, top, fx1 - fx0, base - top, '#7a756b');
    g.fillStyle = lin(g, 0, top, 0, base, [[0, 'rgba(255,240,210,0.12)'], [1, 'rgba(0,0,0,0.3)']]); g.fillRect(fx0, top, fx1 - fx0, base - top);
    poly(g, [[fx1, top], [w - ART * 0.1, top - ART * 0.35], [w - ART * 0.1, base - ART * 0.35], [fx1, base]], '#4a463f');
    bricks(g, fx1, top, 1, 1, '#4a463f');
    // верхняя площадка и зубцы
    poly(g, [[fx0, top], [fx0 + ART * 0.45, top - ART * 0.35], [w - ART * 0.1, top - ART * 0.35], [fx1, top]], '#8a857a');
    for (let x = fx0; x < fx1 - 4; x += ART * 0.34) { g.fillStyle = '#8a857a'; g.fillRect(x, top - ART * 0.22, ART * 0.2, ART * 0.24); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + ART * 0.16, top - ART * 0.22, ART * 0.04, ART * 0.24); }
    // окна-бойницы со светом
    for (const [ox, oy] of [[0.28, 0.25], [0.62, 0.25], [0.28, 0.55], [0.62, 0.55]]) {
      const x = fx0 + (fx1 - fx0) * ox, y = top + (base - top) * oy;
      g.fillStyle = '#0e0a06'; g.fillRect(x - 5, y, 10, ART * 0.32);
      g.fillStyle = 'rgba(255,150,60,0.55)'; g.fillRect(x - 3, y + 3, 6, ART * 0.24);
    }
    // ворота с решёткой
    const gx = (fx0 + fx1) / 2;
    g.fillStyle = '#120c08'; g.beginPath(); g.moveTo(gx - ART * 0.42, base); g.lineTo(gx - ART * 0.42, base - ART * 0.75); g.quadraticCurveTo(gx, base - ART * 1.15, gx + ART * 0.42, base - ART * 0.75); g.lineTo(gx + ART * 0.42, base); g.fill();
    g.strokeStyle = '#4a4a4a'; g.lineWidth = 2.5;
    for (let x = gx - ART * 0.35; x <= gx + ART * 0.36; x += ART * 0.14) { g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - ART * 0.85); g.stroke(); }
    // знамя на шпиле
    g.fillStyle = '#2a2a2a'; g.fillRect(gx - 2, top - ART * 1.1, 4, ART * 0.9);
    poly(g, [[gx + 2, top - ART * 1.08], [gx + ART * 0.55, top - ART * 0.98], [gx + ART * 0.4, top - ART * 0.8], [gx + ART * 0.55, top - ART * 0.62], [gx + 2, top - ART * 0.68]], '#8a1e14', 'rgba(0,0,0,0.5)', 1);
    skull(g, gx + ART * 0.22, top - ART * 0.86, ART * 0.07);
  });
}
function artStonewallC() {
  return artCanvas(1, 1.8, (g, w, h) => {
    const base = h - ART * 0.12, top = base - ART * 1.05;
    groundShadow(g, w / 2 + ART * 0.2, base, ART * 0.55, ART * 0.14, 0.3);
    bricks(g, 0, top, w, base - top, '#7a756b');
    g.fillStyle = lin(g, 0, top, 0, base, [[0, 'rgba(255,240,210,0.1)'], [1, 'rgba(0,0,0,0.35)']]); g.fillRect(0, top, w, base - top);
    g.fillStyle = '#8a857a'; g.fillRect(0, top - ART * 0.12, w, ART * 0.14);
    for (let x = 2; x < w; x += ART * 0.36) g.fillRect(x, top - ART * 0.32, ART * 0.2, ART * 0.22);
  });
}
function artCage() {
  return artCanvas(1, 1.7, (g, w, h) => {
    const base = h - ART * 0.1, top = base - ART * 1.1;
    groundShadow(g, w / 2 + ART * 0.15, base, ART * 0.5, ART * 0.14);
    // пленник
    g.fillStyle = '#3a6a9a'; g.fillRect(w / 2 - ART * 0.16, base - ART * 0.62, ART * 0.32, ART * 0.5);
    g.fillStyle = '#e0b090'; g.beginPath(); g.arc(w / 2, base - ART * 0.75, ART * 0.13, 0, 7); g.fill();
    // клетка
    g.fillStyle = '#4a3018'; g.fillRect(ART * 0.05, top, w - ART * 0.1, ART * 0.1); g.fillRect(ART * 0.05, base - ART * 0.1, w - ART * 0.1, ART * 0.1);
    g.strokeStyle = '#5e3e20'; g.lineWidth = 4;
    for (let x = ART * 0.1; x <= w - ART * 0.08; x += ART * 0.2) { g.beginPath(); g.moveTo(x, top); g.lineTo(x, base); g.stroke(); }
    g.strokeStyle = '#8a8a8a'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, base - ART * 0.35, ART * 0.08, 0, 7); g.stroke();
  });
}
function artBonfireBase() {
  return artCanvas(1, 1.2, (g, w, h) => {
    const cx = w / 2, cy = h - ART * 0.35;
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      g.fillStyle = i % 2 ? '#7a756b' : '#5a564e';
      g.beginPath(); g.ellipse(cx + Math.cos(a) * ART * 0.32, cy + Math.sin(a) * ART * 0.16, ART * 0.09, ART * 0.07, 0, 0, 7); g.fill();
    }
    g.strokeStyle = '#3a2614'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - ART * 0.22, cy + 3); g.lineTo(cx + ART * 0.18, cy - 6); g.moveTo(cx + ART * 0.22, cy + 3); g.lineTo(cx - ART * 0.16, cy - 6); g.stroke();
    g.lineCap = 'butt';
    g.fillStyle = '#1a0e06'; g.beginPath(); g.ellipse(cx, cy, ART * 0.14, ART * 0.06, 0, 0, 7); g.fill();
  });
}

// размеры картинок (в клетках): [ширина, высота]
const CAMP_ART_GEN = {
  ghut: () => artGhut(2), hut: () => artGhut(1), gtotem: artGtotem, palisade_c: artPalisadeC,
  otent: () => artOtent(2), tent: () => artOtent(1), warhall: artWarhall, watchtower: artWatchtower,
  totem: artTotem, spikewall: artSpikewall, keep: artKeep, stonewall_c: artStonewallC, cage: artCage, bonfire: artBonfireBase,
};
function campArt(kind) {
  if (!CAMP_ART[kind] && CAMP_ART_GEN[kind]) CAMP_ART[kind] = CAMP_ART_GEN[kind]();
  return CAMP_ART[kind];
}

// живой огонь костра
function drawFlame(x, y, s, t, seed) {
  const X = sx(x), Y = sy(y), z = VIEW.z * s;
  G.save(); G.globalCompositeOperation = 'lighter';
  const glow = G.createRadialGradient(X, Y, 0, X, Y, z * 2.2);
  glow.addColorStop(0, 'rgba(255,150,50,0.35)'); glow.addColorStop(1, 'rgba(255,120,30,0)');
  G.fillStyle = glow; G.fillRect(X - z * 2.2, Y - z * 2.2, z * 4.4, z * 4.4);
  for (let i = 0; i < 3; i++) {
    const f = Math.sin(t * (9 + i * 3) + seed + i) * 0.15;
    const hgt = z * (0.9 - i * 0.22 + f), wd = z * (0.42 - i * 0.1);
    G.fillStyle = ['rgba(255,90,20,0.85)', 'rgba(255,170,40,0.85)', 'rgba(255,240,150,0.9)'][i];
    G.beginPath(); G.moveTo(X - wd, Y); G.quadraticCurveTo(X - wd * 0.8, Y - hgt * 0.6, X + f * z * 0.6, Y - hgt);
    G.quadraticCurveTo(X + wd * 0.8, Y - hgt * 0.6, X + wd, Y); G.closePath(); G.fill();
  }
  G.restore();
  if (Math.random() < 0.25) FX.push({ x, y: y - s * 0.5, vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.8), life: rand(0.5, 1), c: Math.random() < 0.5 ? '#ffb040' : '#ff6020', s: 0.05 });
}
