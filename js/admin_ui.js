'use strict';
// Окно админ-меню (данные и применение правок — js/admin.js)

// ---------- окно ----------
const ADM = { tab: 'world', q: '', grp: '', gfield: '', gk: 1.5 };
// русские названия групп построек
const ADM_GRP_RU = { accum: 'накопители', barracks: 'казармы', beacon: 'маяки', belt: 'конвейеры', bhub: 'гильдии строителей', cart: 'повозки', chest: 'сундуки',
  csite: 'колосс', deco: 'украшения', gen: 'генераторы', gforge: 'кузни големов', house: 'дома', lab: 'лаборатории', machine: 'машины (печи, мастерские…)',
  mgolem: 'големы', mine: 'шахты', nest: 'гнёзда', pipe: 'трубы', pump: 'насосы', road: 'дороги', shaft: 'валы', spikes: 'шипы', tower: 'башни', trap: 'ловушки',
  vector: 'манипуляторы', wall: 'стены и ворота', watch: 'дозорные вышки', hand: 'в руках' };
const admGrpName = (g) => g.split(',').map(x => ADM_GRP_RU[x] || x).join(', ');
function renderAdminWin() {
  if (!SETTINGS.admin) { closeWin('admin'); return; }
  const tabs = [['world', 'Мир']].concat(Object.keys(ADMIN_TABLES).map(t => [t, ADMIN_TABLES[t].name]));
  let h = `<div class="row" style="flex-wrap:wrap">${tabs.map(([k, n]) => `<button data-act="admTab" data-arg="${k}" class="${ADM.tab === k ? 'primary' : ''}">${n}</button>`).join('')}</div>`;
  h += `<div class="dim" style="margin:4px 0">Изменено полей: <b>${adminCount()}</b>. Всё сохраняется в файле сохранения. Жёлтым — изменённое, в скобках — исходное.</div>`;
  const inp = (t, id, p, val, base) => `<input type="number" step="any" value="${+(+val).toPrecision(6)}" data-adm="${t}|${id}|${p}" style="width:84px${val !== base ? ';background:#5a4a10;color:#ffe080' : ''}">`;
  if (ADM.tab === 'world') {
    let grp = '';
    for (const [k, name, def, g] of TUNE_DEFS) {
      if (g !== grp) { h += `<h3>${g}</h3>`; grp = g; }
      h += `<div class="row" style="justify-content:space-between"><span>${name}</span><span>${inp('world', '-', k, TUNE[k], def)} <span class="dim">(${def})</span></span></div>`;
    }
  } else {
    const T = ADMIN_TABLES[ADM.tab], base = adminBase()[ADM.tab], live = T.data();
    const groups = [...new Set(Object.keys(base).map(id => T.group(base[id], id)).filter(Boolean))].sort();
    h += `<div class="row"><input id="admQ" placeholder="поиск…" value="${ADM.q}" style="width:160px"><select id="admGrp"><option value="">все группы</option>${groups.map(g => `<option value="${g}" ${ADM.grp === g ? 'selected' : ''}>${admGrpName(g)}</option>`).join('')}</select></div>`;
    const ids = Object.keys(base).filter(id => (!ADM.grp || T.group(base[id], id) === ADM.grp) && (!ADM.q || (T.label(base[id], id) + ' ' + id).toLowerCase().includes(ADM.q.toLowerCase())));
    // групповое изменение: поле × множитель для всех найденных
    const allF = [...new Set(ids.flatMap(id => adminFields(ADM.tab, id)))].sort();
    h += `<div class="row" style="margin-top:4px">Всем найденным (${ids.length}): <select id="admGF">${allF.map(f => `<option ${ADM.gfield === f ? 'selected' : ''}>${f}</option>`).join('')}</select> × <input id="admGK" type="number" step="any" value="${ADM.gk}" style="width:60px"><button data-act="admGroup">Применить</button><button data-act="admGroupReset">Вернуть исходное</button></div>`;
    for (const id of ids.slice(0, 80)) {
      const fs = adminFields(ADM.tab, id);
      if (!fs.length) continue;
      h += `<div class="worker" style="display:block"><b>${T.label(live[id] || base[id], id)}</b> <span class="dim">${id}</span><div class="row" style="flex-wrap:wrap;gap:6px 12px">`;
      for (const p of fs) {
        const b = adminBaseVal(ADM.tab, id, p), [a, c] = p.split('.'), lv = live[id] ? (c ? live[id][a] && live[id][a][c] : live[id][a]) : b;
        h += `<span>${p} ${inp(ADM.tab, id, p, lv != null ? lv : b, b)}</span>`;
      }
      h += `</div></div>`;
    }
    if (ids.length > 80) h += `<div class="dim">Показаны первые 80 из ${ids.length} — уточните поиск.</div>`;
  }
  h += `<div class="row" style="margin-top:10px"><button data-act="admExport">Скачать настройки (JSON)</button><button class="danger" data-act="admReset">Сбросить всё</button></div>`;
  if (UI.wins.admin) setWinBody('admin', h); else openWin('admin', 'Админ-меню', h, { width: 640 });
}
ACT.adminwin = () => { if (UI.wins.admin) closeWin('admin'); else renderAdminWin(); };
ACT.admTab = (t) => { ADM.tab = t; ADM.q = ''; ADM.grp = ''; renderAdminWin(); };
ACT.admGroup = () => {
  const f = $('admGF') && $('admGF').value, k = +($('admGK') && $('admGK').value);
  if (!f || !(k > 0)) return;
  ADM.gfield = f; ADM.gk = k;
  const T = ADMIN_TABLES[ADM.tab], base = adminBase()[ADM.tab], live = T.data();
  let n = 0;
  for (const id of Object.keys(base)) {
    if (ADM.grp && T.group(base[id], id) !== ADM.grp) continue;
    if (ADM.q && !(T.label(base[id], id) + ' ' + id).toLowerCase().includes(ADM.q.toLowerCase())) continue;
    if (!adminFields(ADM.tab, id).includes(f)) continue;
    const [a, c] = f.split('.'), cur = live[id] ? (c ? live[id][a] && live[id][a][c] : live[id][a]) : null;
    const v = cur != null ? cur : adminBaseVal(ADM.tab, id, f);
    if (v == null) continue;
    adminEdit(ADM.tab, id, f, +(v * k).toPrecision(6)); n++;
  }
  hint(`${f} ×${k}: изменено ${n}`); renderAdminWin();
};
ACT.admGroupReset = () => {
  const f = $('admGF') && $('admGF').value; if (!f) return;
  const T = ADMIN_TABLES[ADM.tab], base = adminBase()[ADM.tab];
  for (const id of Object.keys(base)) {
    if (ADM.grp && T.group(base[id], id) !== ADM.grp) continue;
    if (ADM.q && !(T.label(base[id], id) + ' ' + id).toLowerCase().includes(ADM.q.toLowerCase())) continue;
    if (adminFields(ADM.tab, id).includes(f)) adminEdit(ADM.tab, id, f, adminBaseVal(ADM.tab, id, f));
  }
  renderAdminWin();
};
ACT.admReset = () => { if (!confirm('Сбросить все правки админ-меню?')) return; S.admin = {}; applyAdmin(); if (typeof MP !== 'undefined' && MP.role === 'client') mpCmd({ f: 'admin', admin: S.admin }); renderAdminWin(); };
ACT.admExport = () => {
  const blob = new Blob([JSON.stringify(S.admin || {}, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'golem-age-admin.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
// ввод чисел: правка применяется сразу, окно не перерисовывается (чтобы не терять фокус)
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'admQ') { ADM.q = el.value; renderAdminWin(); return; }
  if (el.id === 'admGrp') { ADM.grp = el.value; renderAdminWin(); return; }
  const k = el.dataset && el.dataset.adm;
  if (!k || !S) return;
  const [t, id, p] = k.split('|');
  adminEdit(t, id, p, el.value === '' ? NaN : +el.value);
  const base = t === 'world' ? TUNE_DEFS.find(x => x[0] === p)[2] : adminBaseVal(t, id, p);
  const changed = el.value !== '' && +el.value !== base;
  el.style.background = changed ? '#5a4a10' : ''; el.style.color = changed ? '#ffe080' : '';
});
