'use strict';
// Главный цикл: фиксированный шаг симуляции 60 тиков в секунду.

let S = null;
let running = false;

function freshState() {
  return {
    time: 0, nextId: 1, spawn: { x: 0.5, y: 0.5 }, worldVer: 2, admin: {},
    player: newPlayer(), buildings: new Map(), golems: [], enemies: [], projs: [], camps: [], campChunks: [], delayed: [],
    research: { done: [], cur: null, units: 0, progress: {} }, workers: [],
    elves: { next: 30 * 60, demand: null, refusals: 0, paid: 0, final: false, defeated: false },
    merchant: null, nextMerchant: 15 * 60, quests: [], blueprints: [],
    stats: { mined: {}, made: {}, built: {}, kills: 0, camps: 0 }, tutorial: { step: 0, hidden: false },
    raidT: 12 * 60, bonus: {}, envoy: null, floor: {}, enemyScale: 1, crops: {}, carts: [], ghosts: [], ach: {}, colossus: null, dungeons: [],
    quick: ['chest', 'lumber', 'miner', 'furnace', 'woodpile', 'palisade', 'gate', 'belt', 'vector', null],
  };
}

function newGame() {
  SEED = Math.floor(Math.random() * 1e9);
  W.clear(); POLL.clear(); RESV.clear(); PATCH_CACHE.clear(); CAMP_CACHE.clear(); CIT_CACHE.clear(); CIT_LAYOUT.clear(); CAVE_CACHE.clear(); DUNGEON_CACHE.clear();
  SAVED_CHUNKS = new Map();
  S = freshState(); DEMO = null;
  recomputeBonus();
  // стартовый набор: немного построек уже в кармане
  S.player.inv.add('wood', 10);
  S.player.inv.add('chest', 1);
  S.player.inv.add('furnace', 1);
  for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) getChunk(cx, cy);
  explore(0.5, 0.5, 14);
  CAM.x = S.player.x; CAM.y = S.player.y;
  startGame();
  log('Изгнанный Анимансер прибыл на дикий континент. Ни капли боевой магии — только разум и механика.');
  log('Следуйте заданиям слева вверху. H — справка.', 'good');
  // предыстория (пропуск — пробел); игра стоит, пока она идёт
  playIntro();
}

function startGame() {
  document.getElementById('startScreen').style.display = 'none';
  UI.dirty = true;
  for (const id of Object.keys(UI.wins)) closeWin(id);
  explore(S.player.x, S.player.y, 14);
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
}

let slowAcc = 0, saveAcc = 0, trimAcc = 0;
// доля шага симуляции, прошедшая к моменту кадра: герой и камера рисуются между шагами — без рывков
let RALPHA = 1;
function tick() {
  S.time += DT;
  const pl = S.player; pl.px = pl.x; pl.py = pl.y;
  for (const g of S.golems) { g.ipx = g.x; g.ipy = g.y; }
  for (const e of S.enemies) { e.ipx = e.x; e.ipy = e.y; }
  updatePlayer(DT);
  if (MP.role === 'host') mpHostTick();
  else if (MP.role === 'client') mpClientTick();
  updatePower(DT);
  updateLogistics(DT);
  updateBuildings(DT);
  // у гостя совместной игры големы, повозки и строители только плавно догоняют положения от хозяина
  if (MP.role === 'client') mpSmoothTick();
  else { updateGolems(DT); updateCarts(DT); updateGuards(DT); updateBuilders(DT); }
  wildTick(DT);
  featuresTick(DT);
  dungeonHintTick(DT);
  if (MP.role === 'client') { EHASH.clear(); for (const e of S.enemies) EHASH.insert(e); }
  else updateEnemies(DT);
  updateTowers(DT);
  updateCampTowers(DT);
  playerCombat(DT);
  updateProjs(DT);
  runDelayed();
  updateFx(DT);
  slowAcc += DT;
  if (slowAcc >= 1) {
    slowAcc -= 1;
    diffusePollution();
    // в гостях мир (набеги, эльфы, торговец, рост леса) ведёт хозяин
    if (MP.role !== 'client') {
      regrowTrees();
      if (!S.peaceful) { updateCamps(); updateElves(); }
      updateMerchant();
    }
    updateWorkers();
    slowBuildings();
    dayNightTick();
    achTick();
    statsTick();
    updateTutorial();
    saveAcc += 1;
    if (saveAcc >= (SETTINGS.autosave || 120)) { saveAcc = 0; saveGame(false); }
  }
}

// ошибка в одной части кадра не должна останавливать всю игру
let errCount = 0, lastErrMsg = -1e9;
function reportError(where, e) {
  errCount++;
  console.error('Ошибка (' + where + '):', e);
  const now = performance.now();
  if (now - lastErrMsg > 5000) {
    lastErrMsg = now;
    try { log('Внутренняя ошибка игры (' + where + '): ' + (e && e.message ? e.message : e) + '. Игра продолжается.', 'warn'); } catch (e2) { /* ничего */ }
  }
}

let last = 0, acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt >= 0)) dt = 0;
  if (dt > 0.25) dt = 0.25;
  if (!UI.paused && !INTRO_ON) {
    const spd = (S.cheats && S.cheats.speed) || 1;
    acc += dt * spd;
    let n = 0;
    while (acc >= DT && n < 8 * spd) {
      try { tick(); } catch (e) { reportError('симуляция', e); }
      acc -= DT; n++;
    }
    if (n >= 8 * spd) acc = 0;
    RALPHA = clamp(acc / DT, 0, 1);
  } else RALPHA = 1;
  try { render(); } catch (e) { reportError('отрисовка', e); }
  // курсор неподвижен, а мир под ним едет (герой бежит) — обновляем клетку под курсором и продолжаем стройку
  try {
    if (S && !INPUT.overUI) {
      const w = screenToWorld(INPUT.sx, INPUT.sy);
      if (Math.abs(w.x - INPUT.wx) + Math.abs(w.y - INPUT.wy) > 0.01) {
        INPUT.wx = w.x; INPUT.wy = w.y;
        if (INPUT.ldown && UI.tool) dragPlace();
        if ((UI.mode === 'select' || UI.mode === 'decon') && BP.sel) { BP.sel.x1 = INPUT.wx; BP.sel.y1 = INPUT.wy; }
      }
    }
  } catch (e) { reportError('ввод', e); }
  try { updateDeconHold(dt); updateHud(dt); refreshWindows(dt); } catch (e) { reportError('интерфейс', e); }
  trimAcc += dt;
  if (trimAcc > 5) { trimAcc = 0; trimChunkCanvases(CAM.x, CAM.y); }
}

window.addEventListener('load', () => {
  applySettings();
  initSprites();
  initGfx();
  loadAssets();
  loadSprites3D();
  initRender();
  initInput();
  if (hasSave()) document.getElementById('btnContinue').classList.remove('hidden');
  document.getElementById('btnNew').onclick = () => { initAudio(); newGame(); };
  document.getElementById('btnDemo').onclick = () => { initAudio(); startWorkersDemo(); };
  document.getElementById('btnContinue').onclick = () => {
    initAudio();
    try { loadLocal(); log('Игра загружена.', 'good'); }
    catch (e) { alert('Сохранение повреждено: ' + e.message); }
  };
  document.getElementById('btnLoadFile').onclick = () => document.getElementById('fileInput').click();
  document.getElementById('btnJoin').onclick = () => { initAudio(); renderMpWin(); };
});
window.addEventListener('beforeunload', () => { if (S && running) saveGame(false); });
