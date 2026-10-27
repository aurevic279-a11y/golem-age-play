'use strict';
// Исследования: скриптории поглощают фолианты и двигают текущую технологию.

function techAvailable(id) {
  const t = TECHS[id];
  if (t.infinite) return t.req.every(r => S.research.done.includes(r));
  return !S.research.done.includes(id) && t.req.every(r => S.research.done.includes(r));
}
// уровень бесконечного исследования и сколько единиц нужно на следующий
function techLevel(id) { return (S.research.levels && S.research.levels[id]) || 0; }
function techUnits(id) { const t = TECHS[id]; return t.infinite ? Math.round(t.units * Math.pow(1.5, techLevel(id))) : t.units; }
function techName(id) { const t = TECHS[id]; return t.infinite ? `${t.name} ${techLevel(id) + 1}` : t.name; }

function setResearch(id) {
  if (!techAvailable(id)) return;
  S.research.cur = id;
  S.research.units = S.research.progress[id] || 0;
  sfx('click');
}

function updateLab(b, dt) {
  const def = BUILDINGS[b.type];
  b.active = false;
  b.wantPower = 0;
  const cur = S.research.cur;
  if (!cur) { b.status = 'не выбрано исследование (T)'; return; }
  const t = TECHS[cur];
  if (!b.loaded) {
    if (!b.inv.has(t.cost)) { b.status = 'нужны фолианты: ' + Object.keys(t.cost).map(id => ITEMS[id].name).join(', '); return; }
    b.inv.pay(t.cost);
    statCAll(t.cost);
    b.loaded = cur; b.prog = 0;
  }
  b.wantPower = def.power;
  if (!b.powerSat) { b.status = 'нет энергии'; return; }
  const speed = b.powerSat * TUNE.research * (1 + (S.bonus.research || 0)) * workerMult(b) * modSpeed(b) * (1 + (S.bonus.machine || 0));
  if (speed <= 0) return;
  b.active = true;
  b.status = 'исследует';
  addPollution(b.x, b.y, def.pollution * dt);
  const lt = TECHS[b.loaded] || t;
  b.prog += dt * speed / lt.time;
  if (b.prog >= 1) {
    b.loaded = null; b.prog = 0;
    if (S.research.cur) {
      const id = S.research.cur;
      S.research.units = (S.research.units || 0) + 1;
      S.research.progress[id] = S.research.units;
      if (S.research.units >= techUnits(id)) completeTech(id);
    }
  }
}

function completeTech(id) {
  const ti = TECHS[id];
  if (ti.infinite) {
    // уровень растёт, исследование продолжается со следующим уровнем
    S.research.levels = S.research.levels || {};
    S.research.levels[id] = techLevel(id) + 1;
    delete S.research.progress[id];
    S.research.units = 0;
    recomputeBonus();
    log(`Исследовано: «${ti.name}» уровень ${S.research.levels[id]}. Следующий уровень изучается дальше.`, 'good');
    sfx('research'); UI.dirty = true;
    return;
  }
  S.research.done.push(id);
  netsDirty = true; // конвейеры после «Механических векторов» начинают требовать энергию
  delete S.research.progress[id];
  S.research.cur = null;
  S.research.units = 0;
  recomputeBonus();
  const t = TECHS[id];
  const unl = techUnlocks(id);
  log(`Исследовано: «${t.name}»${unl.length ? '. Открыто: ' + unl.join(', ') : ''}`, 'good');
  if (t.spell) log(t.spell === 'meteor' ? 'Заклинание «Метеоритный дождь» — клавиша Z (по курсору).' : 'Заклинание «Землетрясение» — клавиша X (вокруг вас).', 'good');
  if (id === 'overthrow') log('Ритуал свержения готов! Когда будете готовы — откажитесь от дани в окне эльфов (кнопка справа вверху).', 'elf');
  sfx('research');
  UI.dirty = true;
}

function techUnlocks(id) {
  const out = [];
  for (const b in BUILDINGS) if (BUILDINGS[b].tech === id) out.push(BUILDINGS[b].name);
  for (const r in RECIPES) if (RECIPES[r].tech === id) { const o = Object.keys(RECIPES[r].out)[0]; if (o) out.push(ITEMS[o].name); }
  const t = TECHS[id];
  if (t.bonus) {
    const B = t.bonus;
    if (B.speed) out.push(`+${Math.round(B.speed * 100)}% к скорости бега`);
    if (B.reach) out.push(`+${B.reach} к радиусу строительства`);
    if (B.mining) out.push(`+${Math.round(B.mining * 100)}% к скорости добычи`);
    if (B.hp) out.push(`+${B.hp} к здоровью`);
    if (B.golem) out.push(`+${Math.round(B.golem * 100)}% к скорости големов`);
    if (B.research) out.push(`+${Math.round(B.research * 100)}% к скорости исследований`);
    if (B.bag) out.push(`+${B.bag} клеток инвентаря`);
  }
  if (t.spell) out.push(t.spell === 'meteor' ? 'заклинание Метеоритный дождь (Z)' : 'заклинание Землетрясение (X)');
  if (t.desc) out.push(t.desc);
  return [...new Set(out)];
}

function recomputeBonus() {
  const B = { speed: 0, reach: 0, mining: 0, hp: 0, golem: 0, research: 0, inv: 0, bag: 0, prod: 0, machine: 0 };
  const add = (o, k2) => { for (const k in o) B[k] += o[k] * (k2 || 1); };
  for (const id of S.research.done) if (TECHS[id] && TECHS[id].bonus) add(TECHS[id].bonus);
  for (const id in (S.research.levels || {})) if (TECHS[id] && TECHS[id].bonusPer) add(TECHS[id].bonusPer, S.research.levels[id]);
  for (const id of S.blueprints) if (BLUEPRINTS[id].bonus) add(BLUEPRINTS[id].bonus);
  S.bonus = B;
  if (S.player) { S.player.inv.slots = true; S.player.inv.cap = 40 + B.bag + B.inv * 40; }
}
