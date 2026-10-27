'use strict';
// Кинетическая энергия (валы) и жидкости (акведуки) — сети как графы связности.
// Сеть пересчитывается только при постройке/сносе, а не каждый кадр.

let NETS = [];
let FNETS = [];
let WIND = 1;

function isPowerConductor(b) { const k = BUILDINGS[b.type].kind; return k === 'shaft' || k === 'gen' || k === 'accum'; }
function isFluidConductor(b) { const k = BUILDINGS[b.type].kind; return k === 'pipe' || k === 'pump'; }

function neighborsOf(b) {
  const out = [];
  for (const [x, y] of perimeter(b.x, b.y, b.w, b.h)) {
    const c = peekChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    if (!c) continue;
    const nb = c.bld[tidx(x, y)];
    if (nb && nb !== b && !out.includes(nb)) out.push(nb);
  }
  return out;
}

function rebuildNets() {
  NETS = []; FNETS = [];
  for (const b of S.buildings.values()) { b.net = -1; b.fnets = []; b.powerSat = 0; b.fnet = -1; }
  for (const b of S.buildings.values()) {
    if (b.net < 0 && isPowerConductor(b)) {
      const net = { id: NETS.length, gens: [], accs: [], cons: [], demand: 0, supply: 0, sat: 0, stored: 0, cap: 0 };
      NETS.push(net);
      const stack = [b]; b.net = net.id;
      while (stack.length) {
        const cur = stack.pop();
        const k = BUILDINGS[cur.type].kind;
        if (k === 'gen') net.gens.push(cur);
        else if (k === 'accum') net.accs.push(cur);
        const nbs = neighborsOf(cur);
        // подземный вал: энергия проходит к своей паре под землёй
        for (const pid of [cur.pair, cur.exitOf]) { const o = pid && S.buildings.get(pid); if (o && !nbs.includes(o)) nbs.push(o); }
        for (const nb of nbs) {
          if (isPowerConductor(nb)) { if (nb.net < 0) { nb.net = net.id; stack.push(nb); } }
          else if (BUILDINGS[nb.type].power && nb.net < 0) { nb.net = net.id; net.cons.push(nb); }
        }
      }
    }
    if (b.fnet < 0 && isFluidConductor(b)) {
      const net = { id: FNETS.length, fluid: null, amount: 0, cap: 0, pumps: [] };
      FNETS.push(net);
      const stack = [b]; b.fnet = net.id;
      while (stack.length) {
        const cur = stack.pop();
        net.cap += BUILDINGS[cur.type].tankCap || 25;
        if (BUILDINGS[cur.type].kind === 'pump') net.pumps.push(cur);
        for (const nb of neighborsOf(cur)) {
          if (isFluidConductor(nb)) { if (nb.fnet < 0) { nb.fnet = net.id; stack.push(nb); } }
          else if ((BUILDINGS[nb.type].kind === 'machine' || BUILDINGS[nb.type].water) && !nb.fnets.includes(net.id)) nb.fnets.push(net.id);
        }
      }
    }
  }
  // манипуляторы на энергии питаются и от соседней запитанной постройки (мастерской и т. п.), и цепочкой друг от друга —
  // не нужно вести вал к каждому
  const pv = [];
  for (const b of S.buildings.values()) if (BUILDINGS[b.type].kind === 'vector' && BUILDINGS[b.type].power && b.net < 0) pv.push(b);
  for (let changed = true; changed;) {
    changed = false;
    for (const v of pv) {
      if (v.net >= 0) continue;
      for (const nb of neighborsOf(v)) if (nb.net >= 0 && (isPowerConductor(nb) || BUILDINGS[nb.type].power)) { v.net = nb.net; NETS[nb.net].cons.push(v); changed = true; break; }
    }
  }
  rebuildBeltGroups();
  // сохранённые количества жидкости переносим, чтобы стройка не обнуляла сеть
  if (S._fluidCarry) {
    for (const n of FNETS) {
      const p = n.pumps[0];
      if (p && S._fluidCarry[p.id]) { n.fluid = S._fluidCarry[p.id].f; n.amount = Math.min(n.cap, S._fluidCarry[p.id].a); }
    }
  }
}

// конвейеры: цепочка связанных конвейеров (по ходу ленты, через разделители и подземные пары) — один потребитель энергии.
// Вал или генератор вплотную к любому конвейеру цепочки питает её целиком; чем длиннее цепочка, тем больше нужно энергии.
let BELT_GROUPS = [];
function rebuildBeltGroups() {
  BELT_GROUPS = [];
  const par = new Map();
  const find = (id) => { let r = id; while (par.get(r) !== r) r = par.get(r); while (par.get(id) !== r) { const n = par.get(id); par.set(id, r); id = n; } return r; };
  const join = (a, b) => { const ra = find(a.id), rb = find(b.id); if (ra !== rb) par.set(ra, rb); };
  const belts = [];
  for (const b of S.buildings.values()) if (BUILDINGS[b.type].kind === 'belt') { belts.push(b); par.set(b.id, b.id); }
  for (const b of belts) {
    const nb = beltNext(b);
    if (nb && par.has(nb.id)) join(b, nb);
    if (BUILDINGS[b.type].split) for (const [dx, dy] of DIRS) { const o = bldAt(b.x + dx, b.y + dy); if (o && par.has(o.id)) join(b, o); }
  }
  const byRoot = new Map();
  for (const b of belts) {
    const r = find(b.id);
    let g = byRoot.get(r);
    if (!g) { g = { belts: [], wantPower: 0, powerSat: 0, net: -1, beltGroup: true }; byRoot.set(r, g); BELT_GROUPS.push(g); }
    g.belts.push(b); g.wantPower += BUILDINGS[b.type].beltPower || 1; b.bg = g;
  }
  for (const g of BELT_GROUPS) {
    for (const b of g.belts) {
      for (const nb of neighborsOf(b)) if (isPowerConductor(nb) && nb.net >= 0) { g.net = nb.net; break; }
      if (g.net >= 0) break;
    }
    if (g.net >= 0) NETS[g.net].cons.push(g);
  }
}

function genPotential(g) {
  const def = BUILDINGS[g.type];
  if (g.type === 'treadwheel') {
    const orc = workerAt(g.id, 'orc');
    if (orc) return 60 * orcEff(orc); // орк на ягодах — 108 КМ, на пирогах — 180
    // колесо крутит голем внутри (мини-голем из инвентаря), на топливе
    if (!g.wheelGolem) { g.status = 'нужен голем: положите мини-голема в колесо (или посадите орка)'; return 0; }
    return (g.burn > 0 || FUEL_ITEMS.some(f => g.fuel.count(f) > 0)) ? def.out : 0;
  }
  if (def.wind) return def.out * WIND;
  if (def.water) {
    // паровой двигатель: нужна вода в акведуке и топливо
    const hasWater = (g.fnets || []).some(id => FNETS[id] && FNETS[id].fluid === 'water' && FNETS[id].amount > 1);
    const hasFuel = g.burn > 0 || FUEL_ITEMS.some(f => g.fuel.count(f) > 0);
    g.status = !hasWater ? 'нет воды — подведите акведук от насоса' : !hasFuel ? 'нет топлива' : 'работает';
    return hasWater && hasFuel ? def.out : 0;
  }
  return def.out;
}

function updatePower(dt) {
  if (netsDirty) {
    S._fluidCarry = {};
    for (const n of FNETS) if (n.pumps[0] && n.fluid) S._fluidCarry[n.pumps[0].id] = { f: n.fluid, a: n.amount };
    rebuildNets();
    netsDirty = false;
  }
  WIND = clamp(0.55 + 0.35 * Math.sin(S.time / 97) * Math.cos(S.time / 41) + 0.1 * Math.sin(S.time / 13), 0.1, 1);
  for (const net of NETS) {
    let demand = 0;
    for (const c of net.cons) demand += c.wantPower || 0;
    let potential = 0;
    for (const g of net.gens) { g.pot = genPotential(g); potential += g.pot; }
    const fromGen = Math.min(potential, demand);
    const load = potential > 0 ? fromGen / potential : 0;
    for (const g of net.gens) {
      g.load = load;
      const def = BUILDINGS[g.type];
      if (def.fuel && g.pot > 0 && !(g.type === 'treadwheel' && workerAt(g.id, 'orc'))) {
        // топка горит всё время, даже если энергия сейчас никому не нужна
        if (g.burn <= 0) {
          const f = FUEL_ITEMS.find(id => g.fuel.count(id) > 0);
          if (f) { g.fuel.remove(f, 1); statC(f, 1); g.burn += ITEMS[f].fuel; }
        }
        if (g.burn > 0) g.burn -= dt * def.burn;
      }
      if (def.water && g.pot > 0 && load > 0) {
        let need = def.water * load * dt;
        for (const id of g.fnets || []) { const n = FNETS[id]; if (!n || n.fluid !== 'water') continue; const t = Math.min(need, n.amount); n.amount -= t; need -= t; if (need <= 0) break; }
      }
    }
    let deficit = demand - fromGen, surplus = potential - fromGen, drawn = 0, stored = 0, cap = 0;
    for (const a of net.accs) {
      const def = BUILDINGS[a.type];
      if (deficit > 0) {
        const give = Math.min(def.rate, a.stored / dt, deficit);
        a.stored -= give * dt; deficit -= give; drawn += give;
      } else if (surplus > 0) {
        const take = Math.min(def.rate, (def.cap - a.stored) / dt, surplus);
        a.stored += take * dt; surplus -= take;
      }
      stored += a.stored; cap += def.cap;
    }
    const sat = demand > 0 ? Math.min(1, (fromGen + drawn) / demand) : 1;
    for (const c of net.cons) c.powerSat = sat;
    net.demand = demand; net.supply = potential; net.sat = sat; net.stored = stored; net.cap = cap;
  }
  // жидкости
  for (const net of FNETS) {
    for (const p of net.pumps) {
      const def = BUILDINGS[p.type];
      let rate = def.rate;
      if (def.power) { p.wantPower = def.power; rate *= p.powerSat || 0; }
      if (rate <= 0) continue;
      if (net.fluid && net.fluid !== def.fluid && net.amount > 0.5) { p.status = 'в сети другая жидкость'; continue; }
      net.fluid = def.fluid;
      net.amount = Math.min(net.cap, net.amount + rate * dt);
      p.status = 'качает';
    }
  }
}

function pullFluids(b, r) {
  for (const f in r.fin) {
    let want = r.fin[f] * 2 - (b.fluid[f] || 0);
    if (want <= 0) continue;
    for (const id of b.fnets || []) {
      const net = FNETS[id];
      if (!net || net.fluid !== f || net.amount <= 0) continue;
      const t = Math.min(want, net.amount, 30 * DT);
      net.amount -= t; want -= t;
      b.fluid[f] = (b.fluid[f] || 0) + t;
      if (want <= 0) break;
    }
  }
}
