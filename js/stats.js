'use strict';
// Статистика производства и потребления: счётчики по предметам и графики за 1, 10 и 60 минут.

const PSTAT = {
  cur: { p: {}, c: {} },               // накопление за текущую секунду
  series: [                             // по 60 отсчётов в каждом масштабе
    { step: 1, p: [], c: [], acc: null, n: 0 },
    { step: 10, p: [], c: [], acc: null, n: 0 },
    { step: 60, p: [], c: [], acc: null, n: 0 },
  ],
  view: 0, mode: 'p', pick: [],
};

function statP(id, n) { if (n > 0) PSTAT.cur.p[id] = (PSTAT.cur.p[id] || 0) + n; }
function statC(id, n) { if (n > 0) PSTAT.cur.c[id] = (PSTAT.cur.c[id] || 0) + n; }
function statCAll(cost, mult) { for (const id in cost) statC(id, cost[id] * (mult || 1)); }

function addInto(dst, src) { for (const id in src) dst[id] = (dst[id] || 0) + src[id]; }
function pushSample(s, p, c) {
  s.p.push(p); s.c.push(c);
  if (s.p.length > 60) { s.p.shift(); s.c.shift(); }
}

// раз в секунду
function statsTick() {
  const p = PSTAT.cur.p, c = PSTAT.cur.c;
  PSTAT.cur = { p: {}, c: {} };
  pushSample(PSTAT.series[0], p, c);
  for (let k = 1; k < PSTAT.series.length; k++) {
    const s = PSTAT.series[k];
    if (!s.acc) s.acc = { p: {}, c: {} };
    addInto(s.acc.p, p); addInto(s.acc.c, c);
    s.n++;
    if (s.n >= s.step) { pushSample(s, s.acc.p, s.acc.c); s.acc = null; s.n = 0; }
  }
}

// сумма за окно выбранного масштаба (в штуках за минуту)
function statRates(k) {
  const s = PSTAT.series[k];
  const P = {}, C = {};
  for (const o of s.p) addInto(P, o);
  for (const o of s.c) addInto(C, o);
  const minutes = Math.max(1 / 60, s.p.length * s.step / 60);
  for (const id in P) P[id] /= minutes;
  for (const id in C) C[id] /= minutes;
  return { P, C, minutes };
}

function renderStatsWin() {
  const k = PSTAT.view, R = statRates(k);
  const ids = [...new Set([...Object.keys(R.P), ...Object.keys(R.C)])].filter(id => ITEMS[id]);
  ids.sort((a, b) => Math.max(R.P[b] || 0, R.C[b] || 0) - Math.max(R.P[a] || 0, R.C[a] || 0));
  if (!PSTAT.pick.length) PSTAT.pick = ids.slice(0, 5);
  const fmt = (v) => v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  let h = `<div class="row">${['1 мин', '10 мин', '60 мин'].map((n, i) => `<button data-act="statView" data-arg="${i}" class="${k === i ? 'primary' : ''}">${n}</button>`).join('')}
    <span style="flex:1"></span>
    <button data-act="statMode" data-arg="p" class="${PSTAT.mode === 'p' ? 'primary' : ''}">Производство</button><button data-act="statMode" data-arg="c" class="${PSTAT.mode === 'c' ? 'primary' : ''}">Потребление</button></div>`;
  h += `<canvas id="statCv" width="560" height="190" style="width:100%;background:#120e0a;border:1px solid #3a2e22;border-radius:4px;margin:6px 0"></canvas>`;
  h += `<div class="dim">Штук в минуту ${k === 0 ? 'за последнюю минуту' : k === 1 ? 'за последние 10 минут' : 'за последний час'}. Клик по строке — показать на графике. Красным — дефицит: тратится больше, чем производится.</div>`;
  const short = ids.filter(id => (R.C[id] || 0) > (R.P[id] || 0) * 1.05 && (R.C[id] || 0) > 0.5).slice(0, 6);
  if (short.length) h += `<div class="bad" style="margin:4px 0">Не хватает: ${short.map(id => `${iconHtml(id)} ${ITEMS[id].name} (−${fmtRate((R.C[id] || 0) - (R.P[id] || 0))}/мин)`).join(', ')}</div>`;
  let idle = 0, idleWhy = {};
  for (const b of S.buildings.values()) { const d = BUILDINGS[b.type]; if ((d.kind === 'machine' || d.kind === 'lab') && b.status && b.status !== 'работает' && !b.active) { idle++; idleWhy[b.status] = (idleWhy[b.status] || 0) + 1; } }
  if (idle) h += `<div class="dim">Простаивают машины: ${idle} — ${Object.keys(idleWhy).slice(0, 4).map(k => k + ' ×' + idleWhy[k]).join(', ')}</div>`;
  h += `<div class="list" style="max-height:260px;overflow:auto">` + ids.slice(0, 60).map(id => {
    const on = PSTAT.pick.includes(id), col = on ? statColor(PSTAT.pick.indexOf(id)) : 'transparent';
    const p = R.P[id] || 0, c = R.C[id] || 0, bal = p - c;
    return `<div class="line" data-act="statPick" data-arg="${id}" style="cursor:pointer;border-left:4px solid ${col};padding-left:4px">${iconHtml(id)} <span style="flex:1">${ITEMS[id].name}</span>
      <span style="color:#8fd070;width:70px;text-align:right">+${fmt(p)}</span><span style="color:#e08a6a;width:70px;text-align:right">−${fmt(c)}</span>
      <span style="width:70px;text-align:right;color:${bal >= 0 ? '#c8d0a0' : '#ff8070'}">${bal >= 0 ? '+' : ''}${fmt(bal)}</span></div>`;
  }).join('') + (ids.length ? '' : '<div class="dim">Пока ничего не произведено.</div>') + `</div>`;
  if (UI.wins.stats) setWinBody('stats', h); else openWin('stats', 'Статистика производства (O)', h, { width: 600 });
  drawStatChart();
}

const STAT_COLS = ['#e8b84a', '#5affc0', '#ff7a5a', '#7ab0ff', '#d08aff', '#b8e060', '#ffffff', '#ff60a0'];
function statColor(i) { return STAT_COLS[i % STAT_COLS.length]; }

function drawStatChart() {
  const cv = document.getElementById('statCv');
  if (!cv || !cv.getContext) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, s = PSTAT.series[PSTAT.view];
  const arr = s[PSTAT.mode];
  g.clearRect(0, 0, W, H);
  const perMin = 60 / s.step;
  // посекундные отсчёты рваные — сглаживаем скользящим средним
  const sm = PSTAT.view === 0 ? 6 : PSTAT.view === 1 ? 2 : 1;
  let max = 1;
  for (let k = 0; k < arr.length; k++) for (const id of PSTAT.pick) max = Math.max(max, smoothAt(arr, k, id, sm) * perMin);
  // сетка
  g.strokeStyle = '#2a2018'; g.lineWidth = 1; g.fillStyle = '#7a6a58'; g.font = '11px sans-serif';
  for (let i = 0; i <= 4; i++) {
    const y = 8 + (H - 24) * i / 4;
    g.beginPath(); g.moveTo(36, y); g.lineTo(W - 4, y); g.stroke();
    g.fillText(fmtNum(max * (1 - i / 4)), 2, y + 4);
  }
  g.fillText(PSTAT.view === 0 ? '−1 мин' : PSTAT.view === 1 ? '−10 мин' : '−60 мин', 38, H - 3);
  g.fillText('сейчас', W - 44, H - 3);
  PSTAT.pick.forEach((id, i) => {
    g.strokeStyle = statColor(i); g.lineWidth = 2; g.beginPath();
    for (let k = 0; k < arr.length; k++) {
      const x = 36 + (W - 40) * (k + 60 - arr.length) / 59, y = 8 + (H - 24) * (1 - smoothAt(arr, k, id, sm) * perMin / max);
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  });
}

function smoothAt(arr, k, id, n) {
  let s = 0, c = 0;
  for (let i = Math.max(0, k - n + 1); i <= k; i++) { s += arr[i][id] || 0; c++; }
  return c ? s / c : 0;
}

ACT.statView = (i) => { PSTAT.view = +i; renderStatsWin(); };
ACT.statMode = (m) => { PSTAT.mode = m; renderStatsWin(); };
ACT.statPick = (id) => { const k = PSTAT.pick.indexOf(id); if (k >= 0) PSTAT.pick.splice(k, 1); else { PSTAT.pick.push(id); if (PSTAT.pick.length > 8) PSTAT.pick.shift(); } renderStatsWin(); };
