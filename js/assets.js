'use strict';
// Слой внешних картинок: если для спрайта есть файл в assets/ (список — в assets/manifest.js),
// берём его, иначе остаётся графика, нарисованная кодом. Только Image() — работает при запуске с file://.

const ASSETS = { loaded: {}, failed: [], pending: 0 };
const RES_NAME = { tree: 1, stone: 2, iron: 3, copper: 4, coal: 5, sulfur: 6, gold: 7, mithril: 8, bush: 9, sand: 10, ruins: 11 };

function loadAssets(onDone) {
  const man = (typeof ASSET_MANIFEST !== 'undefined' && ASSET_MANIFEST) || {};
  const keys = Object.keys(man);
  if (!keys.length) { if (onDone) onDone(); return; }
  ASSETS.pending = keys.length;
  const fin = () => {
    if (--ASSETS.pending > 0) return;
    // перестроить кэш карты и панель построек уже с картинками
    for (const c of W.values()) { if (c.canvas) c.oldCanvas = c.canvas; c.canvas = null; }
    UI.dirty = true;
    if (ASSETS.failed.length) console.warn('Не найдены картинки (рисую кодом):', ASSETS.failed.join(', '));
    if (onDone) onDone();
  };
  for (const key of keys) {
    const img = new Image();
    img.onload = () => { try { applyAsset(key, img); ASSETS.loaded[key] = img; } catch (e) { console.warn('Картинка не подошла:', key, e); } fin(); };
    img.onerror = () => { ASSETS.failed.push(man[key]); fin(); };
    img.src = verUrl('assets/' + man[key]);
  }
}

// холст из картинки; _url — адрес для <img> в интерфейсе (toDataURL с file:// запрещён браузером)
function assetCanvas(img, w, h) {
  const c = mk(w || img.naturalWidth, h || img.naturalHeight, g => { g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, g.canvas.width, g.canvas.height); });
  c._url = img.src; c._asset = true;
  return c;
}

function applyAsset(key, img) {
  const [kind, id, v] = key.split(':');
  switch (kind) {
    case 'building': {
      const d = BUILDINGS[id];
      if (!d || d.kind === 'belt' || d.kind === 'mgolem') return;
      const c = assetCanvas(img);
      SPR.b[id] = d.kind === 'vector' ? [0, 1, 2, 3].map(dd => { const r = rotCanvas(c, dd); r._url = c._url; r._asset = true; return r; }) : c;
      if (SPR.bShadow) SPR.bShadow[id] = d.kind === 'vector' ? SPR.b[id].map(s => silhouette(s, 'rgba(0,0,0,0.3)')) : silhouette(c, 'rgba(0,0,0,0.3)');
      break;
    }
    case 'camp':
      if (!SPR.camp[id]) return;
      SPR.camp[id] = assetCanvas(img);
      if (SPR.campShadow) SPR.campShadow[id] = silhouette(SPR.camp[id], 'rgba(0,0,0,0.3)');
      break;
    case 'res': {
      const r = RES_NAME[id];
      if (!r) return;
      SPR.res[r] = [assetCanvas(img, TILE, TILE)];
      break;
    }
    case 'item':
      if (!ITEMS[id]) return;
      SPR.item[id] = assetCanvas(img, 16, 16);
      ICON_URL[id] = img.src;
      break;
  }
}
