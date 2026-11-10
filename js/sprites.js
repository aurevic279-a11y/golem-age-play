'use strict';
// Пиксель-арт, нарисованный кодом. Все спрайты 16px на клетку.

const SPR = {};          // имя -> canvas
const ICON_URL = {};     // предмет -> dataURL для интерфейса

function mk(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g, w, h);
  return c;
}
function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function shade(h, f) {
  let [r, gg, b] = hexRgb(h);
  if (f > 0) { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; }
  else { r *= 1 + f; gg *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}
// попиксельная заливка по функции
function pix(g, x0, y0, w, h, fn) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y);
    if (c) { g.fillStyle = c; g.fillRect(x0 + x, y0 + y, 1, 1); }
  }
}
function circle(g, cx, cy, r, c) {
  pix(g, Math.floor(cx - r), Math.floor(cy - r), Math.ceil(r * 2) + 1, Math.ceil(r * 2) + 1, (x, y) => {
    const dx = x + Math.floor(cx - r) - cx + 0.5, dy = y + Math.floor(cy - r) - cy + 0.5;
    return dx * dx + dy * dy <= r * r ? c : null;
  });
}
function bevel(g, x, y, w, h, base) {
  px(g, x, y, w, h, base);
  px(g, x, y, w, 1, shade(base, 0.25)); px(g, x, y, 1, h, shade(base, 0.15));
  px(g, x, y + h - 1, w, 1, shade(base, -0.4)); px(g, x + w - 1, y, 1, h, shade(base, -0.3));
}
function gearPix(g, cx, cy, r, teeth, col, dark, ang) {
  const s = Math.ceil(r + 2);
  pix(g, Math.floor(cx - s), Math.floor(cy - s), s * 2, s * 2, (x, y) => {
    const dx = x + Math.floor(cx - s) - cx + 0.5, dy = y + Math.floor(cy - s) - cy + 0.5;
    const d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx) + ang;
    const tooth = Math.cos(a * teeth) > 0.2;
    const R = tooth ? r + 1.2 : r;
    if (d > R) return null;
    if (d < r * 0.3) return dark;
    if (d > r - 0.6 && !tooth) return dark;
    return dy < 0 ? shade(col, 0.15) : col;
  });
}
function rotCanvas(src, dir) {
  if (!dir) return src;
  return mk(src.width, src.height, g => {
    g.translate(src.width / 2, src.height / 2);
    g.rotate(dir * Math.PI / 2);
    g.drawImage(src, -src.width / 2, -src.height / 2);
  });
}

// ---------------- ресурсы ----------------
function genResources() {
  SPR.res = [];
  SPR.res[1] = [0, 1, 2].map(v => mk(16, 16, g => {
    const leaf = ['#2f6a2a', '#3a7a30', '#2a5a35'][v];
    px(g, 7, 10, 2, 5, '#5e3a18'); px(g, 7, 10, 1, 5, '#7a4a20');
    circle(g, 8, 7, 6, shade(leaf, -0.25));
    circle(g, 7.5, 6.5, 5, leaf);
    circle(g, 6, 5, 2.5, shade(leaf, 0.2));
    px(g, 5, 4, 1, 1, shade(leaf, 0.4));
    px(g, 3, 15, 10, 1, 'rgba(0,0,0,0.25)');
  }));
  const rocks = (base, spec, n) => [0, 1].map(v => mk(16, 16, g => {
    for (let k = 0; k < n; k++) {
      const x = 2 + Math.floor(hash2(k, v, 11) * 9), y = 3 + Math.floor(hash2(k, v, 13) * 9);
      const r = 2 + hash2(k, v, 17) * 1.6;
      circle(g, x + 1, y + 1, r, shade(base, -0.4));
      circle(g, x, y, r, base);
      px(g, x - 1, y - 1, 1, 1, shade(base, 0.35));
      if (spec) { px(g, x, y, 1, 1, spec); px(g, x + 1, y - 1, 1, 1, spec); }
    }
  }));
  SPR.res[2] = rocks('#9a968e', null, 3);
  SPR.res[3] = rocks('#7a6a62', '#d8946a', 3);
  SPR.res[4] = rocks('#6e6a5e', '#f0884a', 3);
  SPR.res[5] = rocks('#2e2e2e', '#555555', 3);
  SPR.res[6] = rocks('#a89a3a', '#fff070', 3);
  SPR.res[7] = rocks('#7a7060', '#ffe040', 3);
  SPR.res[8] = rocks('#4a5a6a', '#b0f8ff', 3);
  SPR.res[9] = [0, 1].map(v => mk(16, 16, g => {
    circle(g, 8, 9, 5.5, '#2a5a25'); circle(g, 7, 8, 4, '#3a7030');
    for (let k = 0; k < 5; k++) px(g, 4 + Math.floor(hash2(k, v, 3) * 8), 5 + Math.floor(hash2(k, v, 4) * 7), 2, 2, '#c0304a');
  }));
  SPR.res[10] = [0, 1].map(v => mk(16, 16, g => {
    for (let k = 0; k < 6; k++) px(g, 2 + Math.floor(hash2(k, v, 21) * 12), 2 + Math.floor(hash2(k, v, 22) * 12), 2, 1, '#e8d898');
  }));
  SPR.res[11] = [0, 1].map(v => mk(16, 16, g => {
    bevel(g, 2, 7, 5, 8, '#8a8478'); bevel(g, 9, 4 + v * 2, 5, 11 - v * 2, '#7a7468');
    px(g, 3, 9, 3, 1, '#5a5448'); px(g, 10, 7, 2, 2, '#c9a0ff');
  }));
}

// ---------------- иконки предметов ----------------
const ICON_DRAW = {
  log(g, a, b) { px(g, 2, 5, 12, 6, a); px(g, 2, 5, 12, 1, shade(a, 0.3)); px(g, 2, 10, 12, 1, b); circle(g, 13, 8, 3, '#d8a868'); px(g, 12, 7, 2, 2, '#a07038'); },
  rock(g, a, b) { circle(g, 8, 9, 5, b); circle(g, 7, 8, 4.5, a); px(g, 5, 5, 2, 1, shade(a, 0.4)); },
  ore(g, a, b) { circle(g, 8, 9, 5, shade(a, -0.3)); circle(g, 7.5, 8.5, 4.5, a); px(g, 5, 7, 2, 2, b); px(g, 9, 9, 2, 2, b); px(g, 8, 5, 1, 1, b); },
  dust(g, a, b) { for (let y = 0; y < 6; y++) px(g, 8 - y - 1, 7 + y, 2 * y + 3, 1, y % 2 ? a : b); },
  relic(g, a, b) { px(g, 6, 2, 4, 12, b); px(g, 3, 5, 10, 4, b); px(g, 7, 3, 2, 10, a); px(g, 4, 6, 8, 2, a); px(g, 7, 6, 2, 2, '#ffffff'); },
  berry(g, a, b) { px(g, 7, 2, 2, 3, b); px(g, 5, 3, 3, 2, b); circle(g, 6, 9, 3, a); circle(g, 10.5, 10, 3, shade(a, -0.15)); px(g, 5, 8, 1, 1, '#ffb0c0'); },
  meat(g, a, b) { circle(g, 7, 9, 5, a); px(g, 11, 4, 3, 2, b); px(g, 10, 5, 2, 3, b); circle(g, 6, 8, 2, shade(a, 0.2)); },
  wheat(g, a, b) { for (let i = 0; i < 3; i++) { px(g, 4 + i * 3, 6, 1, 9, b); for (let k = 0; k < 4; k++) px(g, 3 + i * 3, 2 + k * 2, 3, 2, a); } },
  leather(g, a, b) { px(g, 3, 3, 10, 10, a); px(g, 2, 5, 1, 6, a); px(g, 13, 5, 1, 6, a); px(g, 4, 4, 8, 1, shade(a, 0.25)); px(g, 3, 12, 10, 1, b); },
  plank(g, a, b) { for (let i = 0; i < 3; i++) { px(g, 1, 3 + i * 4, 14, 3, i % 2 ? shade(a, -0.1) : a); px(g, 1, 5 + i * 4, 14, 1, b); } },
  gear(g, a, b) { gearPix(g, 8, 8, 5, 8, a, b, 0); },
  shaft(g, a, b) { for (let i = 0; i < 12; i++) px(g, 2 + i, 12 - i, 2, 2, i % 3 ? a : b); px(g, 2, 12, 3, 3, b); px(g, 12, 1, 3, 3, b); },
  golem(g, a, b) { bevel(g, 4, 5, 8, 8, a); bevel(g, 5, 1, 6, 5, shade(a, 0.1)); px(g, 6, 3, 1, 1, b); px(g, 9, 3, 1, 1, b); px(g, 2, 6, 2, 5, a); px(g, 12, 6, 2, 5, a); px(g, 5, 13, 2, 3, a); px(g, 9, 13, 2, 3, a); px(g, 7, 8, 2, 2, b); },
  block(g, a, b) { bevel(g, 2, 3, 12, 10, a); px(g, 2, 8, 12, 1, b); px(g, 8, 3, 1, 5, b); px(g, 5, 8, 1, 5, b); },
  ingot(g, a, b) { px(g, 2, 8, 12, 5, b); px(g, 4, 5, 8, 4, a); px(g, 3, 8, 10, 4, a); px(g, 5, 5, 6, 1, shade(a, 0.4)); px(g, 3, 12, 11, 1, shade(b, -0.3)); },
  glass(g, a, b) { px(g, 3, 3, 10, 10, a); px(g, 3, 3, 10, 1, '#ffffff'); px(g, 4, 5, 1, 5, '#ffffff'); px(g, 12, 3, 1, 10, b); },
  flask(g, a, b) { px(g, 6, 1, 4, 5, '#d0e8f0'); px(g, 5, 1, 6, 1, '#8a6a3a'); circle(g, 8, 10, 5, '#d0e8f0'); circle(g, 8, 10.5, 4, a); px(g, 6, 8, 1, 2, b); },
  spring(g, a, b) { for (let i = 0; i < 6; i++) { px(g, 3, 2 + i * 2, 10, 1, i % 2 ? a : b); px(g, i % 2 ? 3 : 12, 2 + i * 2, 1, 2, a); } },
  clock(g, a, b) { circle(g, 8, 8, 6.5, shade(a, -0.3)); circle(g, 8, 8, 5.5, a); gearPix(g, 8, 8, 3, 6, b, shade(b, -0.4), 0.3); px(g, 7, 0, 2, 2, b); },
  boiler(g, a, b) { px(g, 3, 4, 10, 10, a); px(g, 4, 2, 8, 2, a); px(g, 3, 6, 10, 1, b); px(g, 3, 11, 10, 1, b); px(g, 7, 0, 2, 2, '#888'); px(g, 3, 4, 1, 10, shade(a, 0.3)); },
  drop(g, a, b) { for (let y = 0; y < 12; y++) { const w = Math.round(Math.min(y, 8) * 0.8); px(g, 8 - w, 2 + y, w * 2 + 1, 1, y > 8 ? b : a); } px(g, 6, 9, 1, 2, '#8a6a4a'); },
  bomb(g, a, b) { circle(g, 8, 10, 5, a); px(g, 7, 3, 2, 3, '#8a6a3a'); px(g, 9, 1, 2, 2, b); px(g, 6, 8, 2, 1, shade(a, 0.4)); },
  chain(g, a, b) { for (let i = 0; i < 4; i++) { const x = 2 + i * 3, y = 2 + i * 3; px(g, x, y, 4, 1, a); px(g, x, y + 3, 4, 1, b); px(g, x, y, 1, 4, a); px(g, x + 3, y, 1, 4, b); } },
  bowl(g, a, b) { px(g, 2, 8, 12, 2, b); px(g, 3, 10, 10, 2, a); px(g, 5, 12, 6, 2, a); px(g, 4, 7, 8, 1, '#a07040'); px(g, 6, 3, 1, 3, '#ddd'); px(g, 9, 2, 1, 3, '#ddd'); },
  pie(g, a, b) { px(g, 2, 8, 12, 5, a); px(g, 3, 6, 10, 2, shade(a, 0.2)); px(g, 4, 7, 2, 1, b); px(g, 8, 7, 2, 1, b); px(g, 2, 12, 12, 1, shade(a, -0.3)); },
  chair(g, a, b) { px(g, 4, 2, 2, 12, a); px(g, 4, 8, 8, 2, b); px(g, 10, 8, 2, 6, a); px(g, 4, 2, 6, 2, b); },
  shirt(g, a, b) { px(g, 4, 3, 8, 11, a); px(g, 1, 3, 3, 5, a); px(g, 12, 3, 3, 5, a); px(g, 6, 3, 4, 2, b); px(g, 4, 13, 8, 1, b); },
  heater(g, a, b) { bevel(g, 3, 4, 10, 10, a); px(g, 5, 8, 6, 4, '#2a1a10'); px(g, 6, 9, 4, 3, b); px(g, 7, 1, 2, 3, '#666'); },
  book(g, a, b) { px(g, 3, 2, 10, 12, a); px(g, 3, 2, 2, 12, shade(a, -0.35)); px(g, 6, 5, 5, 1, b); px(g, 6, 7, 5, 1, b); px(g, 12, 3, 1, 10, '#f0e8d0'); px(g, 7, 10, 3, 2, b); },
  bolt(g, a, b) { for (let i = 0; i < 3; i++) { const o = i * 4; for (let k = 0; k < 8; k++) px(g, 2 + k + o / 2, 12 - k + o / 3 - 2, 1, 1, a); px(g, 9 + o / 2, 3 + o / 3, 2, 2, b); } },
  crossbow(g, a, b) { px(g, 7, 2, 2, 12, a); for (let i = 0; i < 6; i++) px(g, 2 + i, 5 - Math.floor(i / 2) + 1, 1, 1, b), px(g, 13 - i, 5 - Math.floor(i / 2) + 1, 1, 1, b); px(g, 2, 6, 12, 1, b); px(g, 6, 12, 4, 2, shade(a, -0.3)); },
  flamer(g, a, b) { px(g, 2, 7, 9, 3, a); px(g, 3, 4, 4, 3, shade(a, -0.2)); px(g, 11, 7, 2, 3, '#555'); px(g, 13, 6, 2, 5, b); px(g, 4, 10, 2, 4, '#5a3a1a'); },
  sword(g, a, b) { for (let i = 0; i < 9; i++) px(g, 5 + i, 10 - i, 2, 2, i < 1 ? b : a); for (let i = 0; i < 8; i++) px(g, 6 + i, 10 - i, 1, 1, shade(a, 0.35)); px(g, 2, 9, 6, 2, b); px(g, 4, 7, 2, 6, b); px(g, 1, 12, 3, 3, shade(b, -0.3)); },
  hammer(g, a, b) { for (let i = 0; i < 10; i++) px(g, 3 + i * 0.7 | 0, 14 - i, 2, 1, b); bevel(g, 7, 1, 8, 5, a); px(g, 7, 1, 8, 1, shade(a, 0.4)); },
  spear(g, a, b) { for (let i = 0; i < 11; i++) px(g, 2 + i, 13 - i, 1, 2, a); px(g, 12, 1, 3, 3, b); px(g, 13, 0, 2, 2, shade(b, 0.4)); px(g, 11, 4, 2, 1, b); },
  bow(g, a, b) { for (let y = 1; y < 15; y++) { const x = 4 + Math.round(Math.sin((y - 1) / 13 * Math.PI) * 6); px(g, x, y, 2, 1, a); } px(g, 4, 1, 1, 14, b); px(g, 3, 7, 9, 1, '#d8d0c0'); px(g, 11, 6, 2, 3, '#9a9a9a'); },
  sling(g, a, b) { px(g, 3, 2, 1, 7, a); px(g, 12, 2, 1, 7, a); for (let i = 0; i < 5; i++) { px(g, 3 + i, 9 + (i > 2 ? 4 - i : i), 1, 1, a); px(g, 12 - i, 9 + (i > 2 ? 4 - i : i), 1, 1, a); } circle(g, 8, 11, 2.5, b); },
  arrow(g, a, b) { for (let k = 0; k < 2; k++) { for (let i = 0; i < 10; i++) px(g, 2 + i + k * 3, 12 - i + k, 1, 1, a); px(g, 11 + k * 3, 2 + k, 2, 2, b); px(g, 2 + k * 3, 12 + k, 2, 2, '#e0e0e0'); } },
  cannon(g, a, b) { px(g, 2, 6, 11, 5, a); px(g, 2, 6, 11, 1, shade(a, 0.4)); px(g, 12, 5, 3, 7, b); px(g, 1, 7, 2, 3, b); px(g, 5, 11, 3, 3, '#6a4a2a'); },
  staff(g, a, b) { for (let i = 0; i < 12; i++) px(g, 3 + i * 0.6 | 0, 15 - i, 2, 1, a); circle(g, 11, 3, 3, b); px(g, 10, 2, 1, 1, '#fff'); },
  armor(g, a, b) { px(g, 3, 2, 10, 11, a); px(g, 1, 2, 3, 5, b); px(g, 12, 2, 3, 5, b); px(g, 6, 2, 4, 2, shade(a, -0.4)); px(g, 7, 5, 2, 7, shade(a, 0.25)); px(g, 3, 12, 10, 2, b); },
  module(g, a, b) { bevel(g, 2, 3, 12, 10, '#5a4a3a'); px(g, 4, 5, 8, 6, a); px(g, 6, 7, 4, 2, b); px(g, 3, 13, 2, 2, '#c8a050'); px(g, 11, 13, 2, 2, '#c8a050'); },
  spider(g, a, b) { circle(g, 8, 8, 3.5, a); for (let i = 0; i < 4; i++) { px(g, 1, 4 + i * 3, 4, 1, b); px(g, 11, 4 + i * 3, 4, 1, b); } px(g, 7, 7, 1, 1, '#f04040'); px(g, 9, 7, 1, 1, '#f04040'); },
};

// тёмный контур в 1 пиксель вокруг значка — чтобы он читался на любом фоне
function outlineIcon(src) {
  const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  return mk(w, h, g => {
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (sd[i + 3] > 0) continue;
      let near = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && sd[(yy * w + xx) * 4 + 3] > 0) near = true; }
      if (near) { d[i] = 20; d[i + 1] = 16; d[i + 2] = 12; d[i + 3] = 220; }
    }
    g.putImageData(img, 0, 0);
    g.drawImage(src, 0, 0);
  });
}
function genIcons() {
  SPR.item = {};
  for (const id in ITEMS) {
    const ic = ITEMS[id].icon;
    const raw = mk(16, 16, g => (ICON_DRAW[ic[0]] || ICON_DRAW.rock)(g, ic[1], ic[2]));
    const c = outlineIcon(raw);
    SPR.item[id] = c;
    ICON_URL[id] = c.toDataURL();
  }
  for (const f in FLUIDS) {
    const c = mk(16, 16, g => ICON_DRAW.drop(g, FLUIDS[f].color, shade(FLUIDS[f].color, -0.3)));
    ICON_URL['fluid_' + f] = c.toDataURL();
  }
}

// ---------------- постройки ----------------
function roof(g, x, y, w, h, c) {
  for (let i = 0; i < h; i++) px(g, x + i, y + i, w - i * 2, 1, i === 0 ? shade(c, 0.25) : (i % 2 ? c : shade(c, -0.1)));
}
const BDRAW = {
  chest(g) { bevel(g, 2, 4, 12, 10, '#8a5a2a'); px(g, 2, 7, 12, 1, '#4a4a4a'); px(g, 7, 7, 2, 3, '#c8a050'); px(g, 2, 4, 12, 1, '#b07a40'); },
  altar(g) { bevel(g, 3, 8, 26, 20, '#5a4a6a'); bevel(g, 6, 4, 20, 6, '#6a5a7a'); px(g, 12, 12, 8, 8, '#2a1a3a'); circle(g, 16, 16, 3, '#c9a0ff'); px(g, 15, 15, 2, 2, '#fff');
    px(g, 4, 26, 24, 2, '#3a2a4a'); px(g, 6, 2, 2, 4, '#e8b84a'); px(g, 24, 2, 2, 4, '#e8b84a'); },
  provchest(g) { bevel(g, 2, 4, 12, 10, '#4a6a8a'); px(g, 2, 7, 12, 1, '#9fe8ff'); px(g, 7, 7, 2, 3, '#e8b84a'); },
  reqchest(g) { bevel(g, 2, 4, 12, 10, '#8a4a4a'); px(g, 2, 7, 12, 1, '#9fe8ff'); px(g, 7, 7, 2, 3, '#e8b84a'); },
  vector(g) { circle(g, 8, 10, 5, '#5a5048'); circle(g, 8, 10, 4, '#7a6a5a'); bevel(g, 6, 7, 4, 5, '#9a8a70'); px(g, 7, 8, 1, 1, '#5affc0'); px(g, 7, 1, 2, 7, '#8a7a60'); px(g, 6, 0, 4, 2, '#c8a050'); },
  fvector(g) { BDRAW.vector(g); px(g, 4, 12, 8, 3, '#3a6ad0'); px(g, 6, 13, 4, 1, '#c0e0ff'); },
  lvector(g) { circle(g, 8, 11, 4, '#5a5048'); bevel(g, 6, 8, 4, 5, '#9a8a70'); px(g, 7, 9, 1, 1, '#5affc0'); px(g, 7, 0, 2, 9, '#8a7a60'); px(g, 6, 0, 4, 1, '#c8a050'); px(g, 6, 4, 4, 1, '#5e3a18'); },
  mvector(g) { circle(g, 8, 10, 5, '#3a4048'); circle(g, 8, 10, 4, '#6a7480'); bevel(g, 6, 7, 4, 5, '#9aa6b8'); px(g, 7, 8, 1, 1, '#e8b84a'); px(g, 7, 1, 2, 7, '#8a96a8'); px(g, 6, 0, 4, 2, '#c8a050'); },
  shaft(g) { px(g, 0, 7, 16, 2, '#7a4a20'); px(g, 7, 0, 2, 16, '#7a4a20'); px(g, 0, 7, 16, 1, '#a06a30'); gearPix(g, 8, 8, 4, 6, '#b07a40', '#5e3a18', 0); },
  treadwheel(g) { bevel(g, 1, 24, 30, 7, '#6a5040'); circle(g, 16, 14, 12, '#5e3a18'); circle(g, 16, 14, 10, '#3a2a1a'); for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4; for (let r = 2; r < 10; r++) px(g, 16 + Math.cos(an) * r | 0, 14 + Math.sin(an) * r | 0, 1, 1, '#8a5a2b'); } bevel(g, 13, 14, 6, 8, '#9a8a70'); px(g, 14, 15, 1, 1, '#5affc0'); px(g, 17, 15, 1, 1, '#5affc0'); },
  watermill(g) { bevel(g, 10, 6, 21, 24, '#8a6a4a'); roof(g, 8, 1, 25, 7, '#6a3a2a'); px(g, 16, 14, 6, 8, '#3a2a1a'); circle(g, 6, 18, 6, '#5e3a18'); for (let a = 0; a < 8; a++) { const an = a * Math.PI / 4; px(g, 6 + Math.cos(an) * 5 | 0, 18 + Math.sin(an) * 5 | 0, 2, 2, '#a07040'); } px(g, 0, 26, 12, 6, '#2a5a9a'); },
  windmill(g) { for (let y = 8; y < 31; y++) { const w = 6 + (y - 8) / 3 | 0; px(g, 16 - w, y, w * 2, 1, y % 4 ? '#c8b89a' : '#a8987a'); } px(g, 14, 22, 4, 9, '#5a3a1a'); roof(g, 9, 4, 14, 5, '#6a3a2a'); },
  spring_acc(g) { bevel(g, 1, 1, 14, 14, '#4a4a52'); for (let i = 0; i < 5; i++) { px(g, 3, 3 + i * 2, 10, 1, '#9aa6b8'); px(g, i % 2 ? 3 : 12, 3 + i * 2, 1, 2, '#9aa6b8'); } px(g, 7, 13, 2, 2, '#c8a050'); },
  furnace(g) { bevel(g, 2, 4, 28, 26, '#7a756b'); for (let y = 6; y < 28; y += 4) for (let x = 3 + (y % 8 ? 0 : 3); x < 28; x += 6) px(g, x, y, Math.min(5, 28 - x), 3, '#8a857a'); px(g, 10, 16, 12, 10, '#1a1210'); px(g, 11, 17, 10, 8, '#2a1a10'); px(g, 22, 0, 5, 8, '#5a554b'); },
  efurnace(g) { BDRAW.furnace(g); px(g, 10, 16, 12, 10, '#203048'); px(g, 12, 18, 8, 6, '#9fe8ff'); },
  workshop(g) { bevel(g, 2, 9, 28, 21, '#9a7048'); roof(g, 0, 2, 32, 8, '#7a3a2a'); px(g, 5, 18, 7, 12, '#4a2a18'); gearPix(g, 21, 19, 5, 8, '#c8a050', '#6a4a20', 0); },
  stonecutter(g) { bevel(g, 2, 10, 28, 20, '#8a8478'); roof(g, 1, 4, 30, 7, '#5a5a62'); bevel(g, 6, 18, 10, 8, '#b8b0a0'); px(g, 20, 14, 2, 14, '#6a4a2a'); px(g, 17, 13, 8, 3, '#9aa6b8'); },
  forge(g) { bevel(g, 2, 8, 28, 22, '#6a5a50'); roof(g, 0, 2, 32, 7, '#3a3a40'); px(g, 4, 16, 10, 10, '#1a1210'); px(g, 18, 20, 10, 4, '#3a4250'); px(g, 20, 17, 6, 3, '#5a6270'); px(g, 25, 0, 4, 6, '#3a3a3a'); },
  mill(g) { bevel(g, 2, 10, 28, 20, '#8a7a60'); roof(g, 1, 4, 30, 7, '#5a4030'); circle(g, 16, 21, 7, '#9a968e'); circle(g, 16, 21, 2, '#5a564e'); },
  alchemy(g) { bevel(g, 2, 12, 28, 18, '#5a4a40'); circle(g, 12, 12, 8, '#7a6a50'); circle(g, 12, 12, 6, '#c8a050'); px(g, 18, 6, 10, 2, '#c8a050'); px(g, 26, 6, 2, 12, '#c8a050'); circle(g, 26, 22, 4, '#bfe8f0'); px(g, 6, 22, 10, 6, '#1a1210'); },
  scriptorium(g) { bevel(g, 2, 10, 28, 20, '#a89070'); roof(g, 0, 2, 32, 9, '#3a4a7a'); px(g, 13, 20, 6, 10, '#3a2a1a'); px(g, 5, 15, 5, 5, '#e0d0a0'); px(g, 22, 15, 5, 5, '#e0d0a0'); px(g, 5, 17, 5, 1, '#8a5a2a'); px(g, 22, 17, 5, 1, '#8a5a2a'); px(g, 15, 3, 2, 2, '#e8b84a'); },
  nursery(g) { px(g, 1, 1, 30, 30, '#5a3e24'); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const x = 6 + c * 10, y = 7 + r * 9, big = (r + c) % 2;
      px(g, x - 1 + (big ? 0 : 1), y + 1, big ? 2 : 1, 4, '#6a4a2a'); circle(g, x, y, big ? 3.5 : 2.2, big ? '#2f6a2a' : '#4a8a3a'); px(g, x - 1, y - 2, 1, 1, '#6aaa4a'); }
    px(g, 0, 0, 32, 1, '#8a5a2b'); px(g, 0, 31, 32, 1, '#8a5a2b'); px(g, 0, 0, 1, 32, '#8a5a2b'); px(g, 31, 0, 1, 32, '#8a5a2b'); },
  mine(g) { px(g, 1, 1, 30, 30, '#4a3a2a'); bevel(g, 3, 14, 26, 16, '#6a5a48'); px(g, 11, 18, 10, 12, '#140c08'); px(g, 10, 17, 12, 2, '#8a5a2b'); px(g, 10, 17, 2, 13, '#8a5a2b'); px(g, 20, 17, 2, 13, '#8a5a2b');
    px(g, 6, 2, 2, 14, '#7a4a20'); px(g, 24, 2, 2, 14, '#7a4a20'); px(g, 5, 2, 22, 3, '#8a5a2b'); gearPix(g, 16, 7, 4, 6, '#b07a40', '#5e3a18', 0); px(g, 15, 9, 2, 8, '#5a564e');
    px(g, 4, 26, 5, 3, '#9a968e'); px(g, 24, 25, 4, 4, '#c98d6a'); },
  deepdrill(g) { bevel(g, 3, 3, 26, 26, '#4a5260'); px(g, 14, 0, 4, 32, '#8a96a8'); gearPix(g, 16, 16, 7, 8, '#9aa6b8', '#3a4250', 0); circle(g, 16, 16, 2, '#9fe8ff'); },
  pipe(g) { px(g, 0, 4, 16, 8, '#8a8478'); px(g, 0, 4, 16, 1, '#aaa498'); px(g, 0, 11, 16, 1, '#5a564e'); px(g, 0, 6, 16, 4, '#3a3632'); },
  waterpump(g) { bevel(g, 2, 3, 12, 12, '#6a5a4a'); circle(g, 8, 9, 4, '#3a7ad0'); px(g, 7, 0, 2, 5, '#8a6a3a'); px(g, 3, 1, 10, 2, '#5e3a18'); },
  resinpump(g) { bevel(g, 2, 3, 12, 12, '#4a3a2a'); circle(g, 8, 9, 4, '#5a3a1a'); px(g, 7, 0, 2, 5, '#8a96a8'); px(g, 3, 1, 10, 2, '#3a4250'); },
  berryfarm(g) { px(g, 1, 1, 30, 30, '#5a3a22'); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { circle(g, 5 + c * 7, 5 + r * 7, 3, '#2f6a2a'); px(g, 4 + c * 7, 4 + r * 7, 2, 2, '#c0304a'); } px(g, 0, 0, 32, 1, '#8a5a2b'); px(g, 0, 31, 32, 1, '#8a5a2b'); },
  wheatfield(g) { px(g, 1, 1, 30, 30, '#6a4a2a'); for (let r = 0; r < 7; r++) for (let x = 2; x < 30; x += 2) px(g, x, 2 + r * 4, 1, 3, r % 2 ? '#e2c050' : '#c8a838'); px(g, 0, 0, 32, 1, '#8a5a2b'); px(g, 0, 31, 32, 1, '#8a5a2b'); },
  barn(g) { bevel(g, 2, 10, 28, 20, '#8a2a20'); roof(g, 0, 3, 32, 8, '#5a3a2a'); px(g, 11, 16, 10, 14, '#4a1a10'); px(g, 11, 16, 10, 1, '#e0d0c0'); px(g, 11, 16, 1, 14, '#e0d0c0'); px(g, 20, 16, 1, 14, '#e0d0c0'); for (let i = 0; i < 10; i++) px(g, 11 + i, 16 + i * 1.4 | 0, 1, 1, '#e0d0c0'); },
  kitchen(g) { bevel(g, 2, 10, 28, 20, '#a08060'); roof(g, 0, 3, 32, 8, '#8a4a2a'); circle(g, 16, 22, 6, '#3a3a3a'); px(g, 11, 17, 10, 2, '#5a5a5a'); px(g, 24, 0, 4, 6, '#6a6a6a'); px(g, 13, 26, 6, 3, '#e05020'); },
  barracks(g) { bevel(g, 2, 8, 28, 22, '#6a6258'); roof(g, 0, 2, 32, 7, '#4a3a2a'); for (let x = 6; x < 28; x += 4) px(g, x, 14, 1, 10, '#2a2a2a'); px(g, 5, 14, 22, 1, '#2a2a2a'); px(g, 5, 24, 22, 1, '#2a2a2a'); },
  house(g) { bevel(g, 3, 11, 26, 19, '#c8b090'); roof(g, 0, 3, 32, 9, '#3a6a3a'); px(g, 13, 20, 6, 10, '#6a4a2a'); px(g, 6, 15, 5, 5, '#ffe090'); px(g, 21, 15, 5, 5, '#ffe090'); px(g, 23, 0, 3, 5, '#7a6a5a'); },
  palisade(g) { for (let i = 0; i < 4; i++) { px(g, 1 + i * 4, 3, 3, 13, '#7a4a20'); px(g, 1 + i * 4, 3, 1, 13, '#a06a30'); px(g, 2 + i * 4, 1, 1, 2, '#7a4a20'); } px(g, 0, 8, 16, 1, '#5e3a18'); },
  stonewall(g) { bevel(g, 0, 1, 16, 15, '#8a8478'); for (let y = 1; y < 16; y += 4) { px(g, 0, y, 16, 1, '#5a564e'); px(g, (y % 8 ? 4 : 10), y, 1, 4, '#5a564e'); } },
  spikes(g) { px(g, 0, 0, 16, 16, '#3a2a1a'); for (let i = 0; i < 9; i++) { const x = (i % 3) * 5 + 2, y = Math.floor(i / 3) * 5 + 2; px(g, x, y, 2, 3, '#a07040'); px(g, x, y - 1, 1, 1, '#d0b080'); } },
  archer(g) { bevel(g, 2, 6, 12, 10, '#7a5a3a'); bevel(g, 1, 3, 14, 4, '#8a6a4a'); px(g, 1, 1, 2, 2, '#8a6a4a'); px(g, 7, 1, 2, 2, '#8a6a4a'); px(g, 13, 1, 2, 2, '#8a6a4a'); bevel(g, 6, 0, 4, 4, '#9a8a70'); px(g, 7, 1, 1, 1, '#5affc0'); },
  firetower(g) { bevel(g, 2, 5, 12, 11, '#8a7a60'); bevel(g, 1, 2, 14, 4, '#c8a050'); px(g, 6, 0, 4, 3, '#6a4a20'); px(g, 7, 0, 2, 1, '#e05020'); px(g, 5, 9, 6, 4, '#2a1a10'); },
  trebuchet(g) { px(g, 4, 26, 24, 4, '#6a4a2a'); px(g, 6, 12, 3, 16, '#7a5a3a'); px(g, 23, 12, 3, 16, '#7a5a3a'); px(g, 6, 12, 20, 2, '#8a6a4a'); for (let i = 0; i < 22; i++) px(g, 4 + i, 22 - i * 0.8 | 0, 2, 2, '#5e3a18'); bevel(g, 3, 18, 6, 6, '#5a5a5a'); },
  guardian(g) { bevel(g, 8, 10, 16, 16, '#7a756b'); bevel(g, 10, 2, 12, 9, '#8a857a'); px(g, 12, 5, 2, 2, '#9fe8ff'); px(g, 18, 5, 2, 2, '#9fe8ff'); bevel(g, 2, 11, 6, 13, '#6a655b'); bevel(g, 24, 11, 6, 13, '#6a655b'); bevel(g, 9, 26, 6, 6, '#6a655b'); bevel(g, 17, 26, 6, 6, '#6a655b'); },
  nest(g) { for (let y = 2; y < 31; y++) { const w = 3 + (y - 2) / 2.3 | 0; px(g, 16 - w, y, w * 2, 1, y % 5 ? '#3a3a4a' : '#5a5a6a'); } circle(g, 16, 8, 3, '#9fe8ff'); px(g, 12, 22, 8, 9, '#1a1a24'); },
};
// конвейеры: 4 кадра анимации для направления «вверх», остальные — поворотом
function beltFrames(fast) {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    frames.push(mk(16, 16, g => {
      px(g, 0, 0, 16, 16, fast ? '#3a4250' : '#3a3028');
      px(g, 0, 0, 2, 16, fast ? '#8a96a8' : '#6a5440'); px(g, 14, 0, 2, 16, fast ? '#8a96a8' : '#6a5440');
      for (let y = -4; y < 16; y += 4) {
        const yy = y + f;
        px(g, 2, yy, 12, 1, fast ? '#5a6474' : '#54463a');
      }
      for (let y = -8; y < 16; y += 8) {
        const yy = y + f * 2;
        px(g, 7, yy + 2, 2, 1, '#5affc0'); px(g, 6, yy + 3, 1, 1, '#3ac090'); px(g, 9, yy + 3, 1, 1, '#3ac090');
      }
    }));
  }
  return [0, 1, 2, 3].map(d => frames.map(fr => rotCanvas(fr, d)));
}

function genBuildings() {
  SPR.b = {};
  for (const id in BUILDINGS) {
    const d = BUILDINGS[id];
    if (d.kind === 'belt' || d.kind === 'mgolem') continue;
    const w = d.size[0] * 16, h = d.size[1] * 16;
    const fn = BDRAW[id] || BDRAW.chest;
    const c = mk(w, h, fn);
    SPR.b[id] = (d.kind === 'vector') ? [0, 1, 2, 3].map(dd => rotCanvas(c, dd)) : c;
  }
  SPR.belt = beltFrames(false);
  SPR.fastbelt = beltFrames(true);
  // разделитель и подземный конвейер: обычный конвейер + накладка (рисуется для направления «вверх»)
  const variant = (fn) => {
    const up = SPR.belt[0];
    const ov = mk(16, 16, fn);
    const fr = up.map(f => mk(16, 16, g => { g.drawImage(f, 0, 0); g.drawImage(ov, 0, 0); }));
    return [0, 1, 2, 3].map(d => fr.map(f => rotCanvas(f, d)));
  };
  SPR.splitter = variant(g => {
    bevel(g, 0, 6, 3, 8, '#8a6a4a'); bevel(g, 13, 6, 3, 8, '#8a6a4a');
    px(g, 7, 9, 2, 5, '#c8a050'); px(g, 4, 6, 2, 4, '#c8a050'); px(g, 10, 6, 2, 4, '#c8a050'); px(g, 5, 8, 6, 2, '#c8a050');
    px(g, 3, 4, 3, 2, '#e8b84a'); px(g, 10, 4, 3, 2, '#e8b84a'); px(g, 7, 1, 2, 3, '#e8b84a');
  });
  SPR.ubelt_in = variant(g => { bevel(g, 0, 0, 16, 8, '#5a5048'); px(g, 3, 5, 10, 3, '#140c08'); px(g, 2, 0, 12, 1, '#8a7a60'); px(g, 7, 10, 2, 3, '#e8b84a'); px(g, 6, 9, 4, 1, '#e8b84a'); });
  SPR.ubelt_out = variant(g => { bevel(g, 0, 8, 16, 8, '#5a5048'); px(g, 3, 8, 10, 3, '#140c08'); px(g, 2, 15, 12, 1, '#3a3028'); px(g, 7, 3, 2, 3, '#e8b84a'); px(g, 6, 2, 4, 1, '#e8b84a'); });
  // лопасти ветряка (рисуются отдельно и вращаются)
  SPR.blades = mk(32, 32, g => {
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      for (let r = 2; r < 15; r++) {
        const x = 16 + Math.cos(a) * r, y = 16 + Math.sin(a) * r;
        const nx = -Math.sin(a), ny = Math.cos(a);
        for (let s = 0; s < 4; s++) px(g, x + nx * s | 0, y + ny * s | 0, 1, 1, s === 0 ? '#5e3a18' : '#e8dcc0');
      }
    }
    circle(g, 16, 16, 2, '#5e3a18');
  });
}

// ---------------- лагеря (запасной вариант, если нет картинок) ----------------
function genUnits() {
  // лагеря
  SPR.camp = {
    hut: mk(16, 16, g => { for (let y = 3; y < 15; y++) { const w = (y - 3) * 0.6 + 1 | 0; px(g, 8 - w, y, w * 2, 1, y % 3 ? '#7a5a2a' : '#5a3a1a'); } px(g, 7, 10, 2, 5, '#1a1008'); px(g, 7, 1, 1, 3, '#8a6a3a'); }),
    tent: mk(16, 16, g => { for (let y = 2; y < 15; y++) { const w = (y - 2) * 0.62 + 1 | 0; px(g, 8 - w, y, w * 2, 1, y % 4 ? '#8a4a2a' : '#6a2a1a'); } px(g, 6, 9, 4, 6, '#1a1008'); px(g, 7, 0, 1, 3, '#ddd'); px(g, 8, 0, 3, 2, '#a02020'); }),
    totem: mk(16, 16, g => { bevel(g, 6, 2, 4, 14, '#6a4a2a'); px(g, 4, 3, 8, 3, '#a03030'); px(g, 6, 7, 1, 1, '#a0ffa0'); px(g, 9, 7, 1, 1, '#a0ffa0'); px(g, 4, 10, 8, 2, '#3a6a3a'); }),
    cage: mk(16, 16, g => { px(g, 2, 3, 12, 1, '#5a5a5a'); px(g, 2, 14, 12, 1, '#5a5a5a'); for (let x = 2; x < 15; x += 3) px(g, x, 3, 1, 12, '#7a7a7a'); px(g, 6, 7, 4, 7, '#3a6a9a'); px(g, 6, 5, 4, 3, '#e0b090'); }),
    portal: mk(32, 32, g => { for (let r = 14; r > 0; r -= 2) circle(g, 16, 16, r, r % 4 ? '#5a1a8a' : '#a040ff'); circle(g, 16, 16, 3, '#ffffff'); }),
  };
}

function initSprites() {
  genResources();
  genIcons();
  genBuildings();
  genUnits();
}

// HTML-иконка предмета
function iconHtml(id, n) {
  const name = ITEMS[id] ? ITEMS[id].name : (FLUIDS[id] ? FLUIDS[id].name : id);
  if (ITEMS[id] && ITEMS[id].bld) return `<span class="ci" title="${name}">${buildIconHtml(id, 18)}${n != null ? fmtNum(n) : ''}</span>`;
  const url = ICON_URL[id] || ICON_URL['fluid_' + id];
  return `<span class="ci" title="${name}"><img src="${url}">${n != null ? fmtNum(n) : ''}</span>`;
}
