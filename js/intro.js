'use strict';
// Катсцена-предыстория при новой игре: город, насмешки и драка, ярость и луч с неба, чужой лес, Тёмные Эльфы.
// Рисуется теми же 3D-спрайтами, что и игра (подменяем холст и камеру), ~35 секунд, пропуск — пробел, Esc или клик.

let INTRO_ON = false;
// цвета одежды горожан (перекраска плаща модели)
const INTRO_CLOTH = ['rgba(170,60,40,0.55)', 'rgba(60,100,170,0.55)', 'rgba(70,130,60,0.55)', 'rgba(180,140,60,0.55)', 'rgba(130,80,150,0.55)', 'rgba(150,110,80,0.6)', 'rgba(60,140,140,0.55)'];
const INTRO = { cv: null, g: null, t: 0, last: 0, done: null, cobble: null, grass: null, people: [] };

function playIntro(done) {
  if (INTRO_ON) return;
  INTRO_ON = true; INTRO.t = 0; INTRO.done = done || null; INTRO.last = performance.now();
  const cv = INTRO.cv = document.createElement('canvas');
  cv.id = 'introCv';
  Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', zIndex: 9999, background: '#000', cursor: 'pointer' });
  document.body.appendChild(cv);
  const skip = document.createElement('div');
  skip.id = 'introSkip';
  skip.textContent = 'Пропустить ▶ (пробел)';
  Object.assign(skip.style, { position: 'fixed', right: '18px', bottom: '16px', zIndex: 10000, color: '#e8dcc0', font: '14px Segoe UI, sans-serif', background: 'rgba(0,0,0,0.55)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' });
  document.body.appendChild(skip);
  skip.onclick = cv.onclick = () => endIntro();
  addEventListener('keydown', introKey, true);
  // горожане: идут по площади туда-сюда
  INTRO.people = [];
  for (let i = 0; i < 7; i++) INTRO.people.push({ k: 'merchant', tint: INTRO_CLOTH[i % INTRO_CLOTH.length], x: -10 + i * 3.3, y: 0.6 + (i % 3) * 1.1, v: (i % 2 ? 1 : -1) * (0.9 + (i % 3) * 0.25), ph: i * 0.7 });
  requestAnimationFrame(introFrame);
}
function introKey(e) {
  if (!INTRO_ON) return;
  if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); endIntro(); }
}
function endIntro() {
  if (!INTRO_ON) return;
  INTRO_ON = false;
  removeEventListener('keydown', introKey, true);
  if (INTRO.cv) INTRO.cv.remove();
  const s = document.getElementById('introSkip'); if (s) s.remove();
  INTRO.cv = null;
  if (INTRO.done) INTRO.done();
}

// ---------- кадр ----------
const INTRO_LEN = 35.5;
function introFrame(now) {
  if (!INTRO_ON) return;
  const dt = Math.min(0.05, (now - INTRO.last) / 1000); INTRO.last = now;
  INTRO.t += dt;
  if (INTRO.t >= INTRO_LEN) { endIntro(); return; }
  const cv = INTRO.cv, dpr = Math.min(1.5, devicePixelRatio || 1);
  const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d');
  // рисуем игровыми функциями: подменяем холст и камеру
  const sG = G, sV = VIEW;
  G = g;
  try { introDraw(g, W, H, INTRO.t, dt); }
  catch (e) { console.error('Катсцена:', e); G = sG; VIEW = sV; endIntro(); return; }
  G = sG; VIEW = sV;
  requestAnimationFrame(introFrame);
}

function introCam(W, H, cx, cy, tilesTall, shake) {
  const z = H / tilesTall, sh = shake ? (Math.random() - 0.5) * shake * z * 0.15 : 0;
  VIEW = { z, ox: Math.round(W / 2 - cx * z + sh), oy: Math.round(H / 2 - cy * z + sh * 0.7), x0: cx - 40, x1: cx + 40, y0: cy - 30, y1: cy + 30 };
}
function introPattern(kind) {
  if (INTRO[kind]) return INTRO[kind];
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  if (kind === 'cobble') {
    g.fillStyle = '#7a7266'; g.fillRect(0, 0, 96, 96);
    for (let y = 0; y < 96; y += 12) for (let x = (y / 12 % 2) * 8; x < 96; x += 16) {
      g.fillStyle = ['#948b7c', '#8a8172', '#9e9584'][(x + y) % 3]; g.fillRect(x + 1, y + 1, 14, 10);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 1, y + 1, 14, 2);
    }
  } else {
    g.fillStyle = '#5a9244'; g.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 160; i++) { g.fillStyle = ['#4e8a3c', '#68a84e', '#5e9a46'][i % 3]; g.fillRect((i * 37) % 96, (i * 53) % 96, 3, 5); }
  }
  return (INTRO[kind] = g.createPattern(c, 'repeat'));
}
function introBubble(g, x, y, text, a) {
  if (a <= 0) return;
  const z = VIEW.z;
  g.save(); g.globalAlpha = Math.min(1, a);
  g.font = `bold ${Math.round(z * 0.32)}px Segoe UI, sans-serif`; g.textAlign = 'center';
  const tw = g.measureText(text).width + z * 0.5, X = sx(x) - tw / 2, Y = sy(y) - z * 0.55, h = z * 0.55;
  g.fillStyle = 'rgba(255,248,230,0.95)'; g.strokeStyle = '#2a2018'; g.lineWidth = 2;
  g.beginPath(); g.roundRect ? g.roundRect(X, Y, tw, h, z * 0.12) : g.rect(X, Y, tw, h); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(sx(x) - z * 0.12, Y + h); g.lineTo(sx(x), Y + h + z * 0.2); g.lineTo(sx(x) + z * 0.12, Y + h); g.fill();
  g.fillStyle = '#2a2018'; g.fillText(text, sx(x), Y + h * 0.7);
  g.restore();
}
function introCaption(g, W, H, text, t0, t) {
  const a = Math.min(1, (t - t0) * 1.5), n = Math.min(text.length, Math.floor((t - t0) * 45));
  if (a <= 0) return;
  const s = text.slice(0, n), fs = Math.round(H * 0.032);
  g.save(); g.globalAlpha = a;
  g.font = `${fs}px Georgia, serif`; g.textAlign = 'center';
  const w = Math.min(W * 0.86, g.measureText(text).width + fs * 2);
  g.fillStyle = 'rgba(10,8,6,0.7)'; g.fillRect(W / 2 - w / 2, H * 0.84, w, fs * 2);
  g.fillStyle = '#f0e2c0'; g.fillText(s, W / 2, H * 0.84 + fs * 1.35);
  g.restore();
}
// список «по глубине»: юниты и постройки сортируются по низу, как в игре
function introDrawList(list) {
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.f();
}

function introDraw(g, W, H, t, dt) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (t < 17.5) introCity(g, W, H, t);
  else introForest(g, W, H, t);
  // затемнение в начале и в конце
  const fade = t < 1 ? 1 - t : t > INTRO_LEN - 1.2 ? (t - (INTRO_LEN - 1.2)) / 1.2 : 0;
  if (fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; g.fillRect(0, 0, W, H); }
}

// ---------- город: прогулка, насмешки, драка, ярость, луч ----------
function introCity(g, W, H, t) {
  const beam = t >= 14 ? Math.min(1, (t - 14) / 1.2) : 0;
  introCam(W, H, 0, 0.5, 11, beam > 0 ? 1 + beam * 2 : t > 7.5 && t < 11 ? 0.3 : 0);
  // мостовая
  g.save(); g.fillStyle = introPattern('cobble'); g.translate(VIEW.ox % 96, VIEW.oy % 96); g.fillRect(-96, -96, W + 192, H + 192); g.restore();
  const L = [];
  // дома по краю площади
  for (const [k, x, y] of [['house', -9, -4.2], ['scriptorium', -4.5, -4.6], ['workshop', 0.5, -4.2], ['mill', 5, -4.2], ['house', 9, -4.4], ['windmill', 12.5, -4.8], ['barracks', -13, -4.2]])
    L.push({ y: y + 2, f: () => drawProp('build', k, x, y) });
  // горожане гуляют (в сцене драки — расходятся)
  for (const p of INTRO.people) {
    if (t < 6) p.x += p.v * (1 / 60);
    else if (t > 12) p.x += Math.sign(p.x || 1) * 3 / 60;
    if (p.x > 14) p.x = -14; if (p.x < -14) p.x = 14;
    const moving = t < 6 || t > 12;
    L.push({ y: p.y, f: () => drawUnit3D(p.k, p.x, p.y, { ang: p.v > 0 ? 0 : Math.PI, anim: moving ? 'run' : 'stance', t: t * 1.2 + p.ph, scale: 0.9, tint: p.tint }) });
  }
  // обидчики: подходят к герою, бьют, потом убегают
  const hx = 0, hy = 2.2;
  const bullies = [[-1.3, 2.4, INTRO_CLOTH[0]], [1.3, 2.3, INTRO_CLOTH[3]], [0.2, 3.3, INTRO_CLOTH[5]]];
  bullies.forEach(([bx, by, bk], i) => {
    let x, y, anim = 'stance', ang;
    if (t < 6) return;
    if (t < 7.5) { const k = (t - 6) / 1.5; x = bx * 6 * (1 - k) + bx * k; y = by + (1 - k) * 2; anim = 'run'; }
    else if (t < 12) { x = bx; y = by; anim = (t + i * 0.4) % 1.1 < 0.5 ? 'swing' : 'stance'; }
    else { const k = Math.min(1, (t - 12) / 2); x = bx + bx * 8 * k; y = by + k * 3; anim = 'run'; }
    ang = Math.atan2(hy - y, hx - x);
    if (t >= 12) ang += Math.PI;
    L.push({ y, f: () => drawUnit3D('merchant', x, y, { tint: bk, ang, anim, t: t * 1.4 + i, k: anim === 'swing' ? ((t + i * 0.4) % 1.1) / 0.5 : null, scale: 0.9 }) });
  });
  // герой
  const hit = t > 7.6 && t < 11.8 && (t % 1.1) < 0.35;
  const heroA = beam > 0.75 ? Math.max(0, 1 - (t - 15.6) / 0.7) : 1;
  if (heroA > 0) L.push({ y: hy, f: () => {
    // ярость: красное свечение вокруг
    if (t > 12) { const r = VIEW.z * (0.8 + Math.min(1.5, (t - 12) * 0.5)) * (1 + Math.sin(t * 9) * 0.08); const gr = g.createRadialGradient(sx(hx), sy(hy - 0.5), 0, sx(hx), sy(hy - 0.5), r); gr.addColorStop(0, 'rgba(255,60,20,0.55)'); gr.addColorStop(1, 'rgba(255,40,0,0)'); g.fillStyle = gr; g.fillRect(sx(hx) - r, sy(hy - 0.5) - r, r * 2, r * 2); }
    drawUnit3D('player', hx, hy - (beam > 0.6 ? (t - 15) * 0.8 : 0), { ang: Math.PI / 2, anim: t > 12 ? 'cast' : hit ? 'hit' : 'stance', t: t * 1.3, k: t > 12 ? ((t * 0.9) % 1) : hit ? ((t % 1.1) / 0.35) : null, alpha: heroA, flash: hit });
  } });
  introDrawList(L);
  // реплики
  if (t > 7.6 && t < 9.4) introBubble(g, -1.3, 0.9, 'Колдун!', (9.4 - t) * 2);
  if (t > 8.6 && t < 10.6) introBubble(g, 1.3, 0.8, 'Чудак с железками!', (10.6 - t) * 2);
  if (t > 9.8 && t < 11.9) introBubble(g, 0.2, 1.8, 'Проваливай из города!', (11.9 - t) * 2);
  // темнеет от ярости
  if (t > 12) { g.fillStyle = `rgba(30,0,0,${Math.min(0.45, (t - 12) * 0.15)})`; g.fillRect(0, 0, W, H); }
  // луч с неба: радужный столб с белой сердцевиной
  if (beam > 0) {
    const X = sx(hx), w = VIEW.z * (0.3 + beam * 1.4);
    const cols = ['255,80,80', '255,180,60', '255,255,120', '120,255,140', '100,200,255', '170,120,255'];
    g.save(); g.globalCompositeOperation = 'lighter';
    cols.forEach((c, i) => {
      const off = Math.sin(t * 6 + i) * w * 0.15, ww = w * (1 - i * 0.12);
      const gr = g.createLinearGradient(X - ww / 2 + off, 0, X + ww / 2 + off, 0);
      gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.5, `rgba(${c},${0.35 * beam})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(X - ww / 2 + off, 0, ww, sy(hy) + VIEW.z * 0.2);
    });
    const core = g.createLinearGradient(X - w * 0.25, 0, X + w * 0.25, 0);
    core.addColorStop(0, 'rgba(255,255,255,0)'); core.addColorStop(0.5, `rgba(255,255,255,${0.9 * beam})`); core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core; g.fillRect(X - w * 0.25, 0, w * 0.5, sy(hy) + VIEW.z * 0.2);
    // кольца у земли
    for (let i = 0; i < 3; i++) { const r = VIEW.z * (((t * 1.6 + i / 3) % 1) * 2.2); g.strokeStyle = `rgba(200,240,255,${0.6 * beam * (1 - r / (VIEW.z * 2.2))})`; g.lineWidth = VIEW.z * 0.08; g.beginPath(); g.ellipse(X, sy(hy), r, r * 0.4, 0, 0, 7); g.stroke(); }
    g.restore();
  }
  // вспышка, уносящая героя
  if (t > 16.2) { g.fillStyle = `rgba(255,255,255,${Math.min(1, (t - 16.2) / 0.8)})`; g.fillRect(0, 0, W, H); }
  if (t < 6) introCaption(g, W, H, 'Город Аркхольм. Здесь жил Анимансер — механик, что вдыхал жизнь в шестерни и камень.', 0.6, t);
  else if (t < 12) introCaption(g, W, H, 'Люди боялись его големов. Однажды на площади его высмеяли и избили.', 6.2, t);
  else introCaption(g, W, H, 'Ярость разбудила древнюю силу… и с неба ударил луч.', 12.3, t);
}

// ---------- чужой лес: «Где я?», Тёмные Эльфы ----------
const INTRO_TREES = [];
function introForest(g, W, H, t) {
  introCam(W, H, 0, 0.3, 11, t < 18.3 ? 1.5 : 0);
  g.save(); g.fillStyle = introPattern('grass'); g.translate(VIEW.ox % 96, VIEW.oy % 96); g.fillRect(-96, -96, W + 192, H + 192); g.restore();
  if (!INTRO_TREES.length) {
    for (let i = 0; i < 46; i++) {
      const a = i * 2.39996, r = 5.2 + (i % 7) * 0.9 + (i % 3) * 0.6;
      INTRO_TREES.push({ x: Math.cos(a) * r * 1.5, y: Math.sin(a) * r * 0.85, k: 'tree' + (i % 10) });
    }
  }
  const L = [];
  for (const tr of INTRO_TREES) L.push({ y: tr.y + 0.5, f: () => drawProp('nature', tr.k, tr.x, tr.y) });
  const hx = 0, hy = 1.2;
  // герой оглядывается
  const look = t < 19.5 ? Math.PI / 2 : t < 20.5 ? Math.PI : t < 21.5 ? 0 : t < 24 ? Math.PI / 2 : Math.atan2(-0.7, 2.5);
  L.push({ y: hy, f: () => drawUnit3D('player', hx, hy, { ang: look, anim: 'stance', t: t, alpha: Math.min(1, (t - 17.5) * 2) }) });
  // портал и эльфы
  const px = 5, py = -0.8;
  if (t > 24) {
    const open = Math.min(1, (t - 24) / 1.2);
    L.push({ y: py - 0.5, f: () => {
      g.save(); g.translate(sx(px), sy(py)); g.rotate(t * 1.5);
      const r = VIEW.z * 1.1 * open;
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(20,0,40,0.95)'); gr.addColorStop(0.6, 'rgba(120,40,200,0.8)'); gr.addColorStop(1, 'rgba(200,120,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, r, r * 1.3, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(220,160,255,0.8)'; g.lineWidth = VIEW.z * 0.06; g.beginPath(); g.ellipse(0, 0, r * 0.8, r * 1.05, 0, 0, 5); g.stroke();
      g.restore();
    } });
    const elves = [['envoy', 2.4, 0.4, 25.0], ['elf_blade', 3.4, -0.4, 25.4], ['elf_blade', 3.5, 1.3, 25.8], ['elf_mage', 4.6, 0.5, 26.2]];
    for (const [kind, ex, ey, t0] of elves) {
      if (t < t0) continue;
      const k = Math.min(1, (t - t0) / 1.4), x = px + (ex - px) * k, y = py + (ey - py) * k;
      L.push({ y, f: () => drawUnit3D(kind, x, y, { ang: Math.atan2(hy - y, hx - x), anim: k < 1 ? 'run' : 'stance', t: t * 1.3, alpha: Math.min(1, (t - t0) * 2), scale: kind === 'envoy' ? 1.05 : 1 }) });
    }
  }
  introDrawList(L);
  // луч, оставивший героя
  if (t < 18.4) {
    const a = 1 - (t - 17.5) / 0.9, X = sx(hx), w = VIEW.z * 1.2;
    g.save(); g.globalCompositeOperation = 'lighter';
    const core = g.createLinearGradient(X - w / 2, 0, X + w / 2, 0);
    core.addColorStop(0, 'rgba(180,220,255,0)'); core.addColorStop(0.5, `rgba(255,255,255,${0.85 * a})`); core.addColorStop(1, 'rgba(180,220,255,0)');
    g.fillStyle = core; g.fillRect(X - w / 2, 0, w, sy(hy) + VIEW.z * 0.2);
    g.restore();
    g.fillStyle = `rgba(255,255,255,${Math.max(0, 0.9 - (t - 17.5) * 1.5)})`; g.fillRect(0, 0, W, H);
  }
  // лёгкая дымка у кромки леса
  const mist = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
  mist.addColorStop(0, 'rgba(10,20,15,0)'); mist.addColorStop(1, 'rgba(10,20,15,0.55)');
  g.fillStyle = mist; g.fillRect(0, 0, W, H);
  if (t > 19.4 && t < 23.6) introBubble(g, hx, hy - 1.25, 'Воу… Где я?..', Math.min(1, (23.6 - t) * 2));
  if (t > 26.6 && t < 29.4) introBubble(g, 2.4, -0.85, 'Чужак. Эти земли принадлежат Тёмным Эльфам.', Math.min(1, (29.4 - t) * 2));
  if (t > 29.5 && t < 32.3) introBubble(g, 2.4, -0.85, 'Отныне ты платишь нам дань — или умрёшь.', Math.min(1, (32.3 - t) * 2));
  if (t > 32.4 && t < 35.2) introBubble(g, 2.4, -0.85, 'Жди нашего сборщика податей.', Math.min(1, (35.2 - t) * 2));
  if (t < 24) introCaption(g, W, H, 'Луч вышвырнул его в чужой мир — на дикий континент.', 18.6, t);
  else introCaption(g, W, H, 'Здесь правят Тёмные Эльфы. Но у механика есть разум, шестерни… и големы.', 24.4, t);
}
