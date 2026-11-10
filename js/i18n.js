'use strict';
// Язык игры: английский по умолчанию, русский выбирается в главном меню и в настройках.
// Весь текст в коде написан по-русски и обёрнут в L('…') или L`…`; перевод — в js/i18n_en.js.
// Смена языка перезагружает страницу: таблицы предметов и построек собираются при загрузке.
const LANG_KEY = 'golem-age-lang';
let LANG = 'en';
try { const l = localStorage.getItem(LANG_KEY); if (l === 'ru' || l === 'en') LANG = l; } catch (e) {}
const _L_TPL = new WeakMap();
function L(s, ...v) {
  if (typeof s === 'string') { if (LANG === 'ru') return s; const t = I18N_EN[s]; return t != null ? t : s; }
  // шаблон: неизменные куски s, вставки v; в переводе вставки помечены {0}, {1}…
  let t = _L_TPL.get(s);
  if (t === undefined) {
    const tr = LANG === 'en' ? I18N_EN[s.map((p, i) => (i ? '{' + (i - 1) + '}' : '') + p).join('')] : null;
    t = tr != null ? tr.split(/\{(\d+)\}/) : null;
    _L_TPL.set(s, t);
  }
  let o = '';
  if (!t) { o = s[0]; for (let i = 0; i < v.length; i++) o += v[i] + s[i + 1]; return o; }
  for (let i = 0; i < t.length; i++) o += i % 2 ? v[+t[i]] : t[i];
  return o;
}
// слово из словаря на текущем языке, с какого бы языка оно ни пришло (имена в старых сохранениях)
let _L_BACK = null;
function langName(s) {
  if (LANG === 'en') return I18N_EN[s] != null ? I18N_EN[s] : s;
  if (!_L_BACK) { _L_BACK = {}; for (const k in I18N_EN) if (!(I18N_EN[k] in _L_BACK)) _L_BACK[I18N_EN[k]] = k; }
  return _L_BACK[s] != null ? _L_BACK[s] : s;
}
function setLang(l) {
  if (l === LANG) return;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  // идущую игру сохраняем, чтобы после перезагрузки продолжить с того же места
  try { if (typeof S !== 'undefined' && S && typeof saveGame === 'function' && !(typeof MP !== 'undefined' && MP.role)) saveGame(); } catch (e) {}
  try { if (typeof SAVE_TO !== 'undefined' && SAVE_TO !== SAVE_KEY) sessionStorage.setItem('golem-age-resume-demo', '1'); } catch (e) {}
  window.onbeforeunload = null;
  location.reload();
}
// переключатель для меню: две кнопки, текущая подсвечена
function langSwitchHtml() {
  return ['en', 'ru'].map(l => `<button data-lang="${l}" class="lang-btn${l === LANG ? ' on' : ''}">${l === 'en' ? 'English' : 'Русский'}</button>`).join('');
}
// неизменный текст страницы (index.html)
(function i18nDom() {
  const sw = document.getElementById('langSwitch'); if (sw) sw.innerHTML = langSwitchHtml();
  document.documentElement.lang = LANG;
  document.title = L(document.title);
  if (LANG === 'ru' || typeof NodeFilter === 'undefined') return;
  const cyr = /[А-Яа-яЁё]/, walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.nodeValue.trim();
    if (t && cyr.test(t)) n.nodeValue = n.nodeValue.replace(t, L(t));
  }
  for (const el of document.querySelectorAll('[title],[placeholder]')) for (const a of ['title', 'placeholder']) { const v = el.getAttribute(a); if (v && cyr.test(v)) el.setAttribute(a, L(v.trim())); }
})();
document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
