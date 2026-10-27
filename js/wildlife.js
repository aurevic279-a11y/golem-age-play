'use strict';
// Живой мир: олени и зайцы бродят по лесам и убегают от героя (на них можно охотиться — мясо и кожа),
// над картой пролетают стаи птиц, днём порхают бабочки, ночью мерцают светлячки, над лагерями тянется дым.

// охота как на обычного моба: кликните по зверю — герой подбегает и стреляет, когда достаёт оружием;
// зверь пугливый и убегает, но быстро выдыхается
const ANIMALS = {
  deer: { name: 'Олень', hp: 24, speed: 1.1, flee: 5.4, loot: { raw_meat: 3, leather: 2 } },
  rabbit: { name: 'Заяц', hp: 8, speed: 1.4, flee: 6, loot: { raw_meat: 1 } },
};
const WILD = { animals: [], birds: [], carcasses: [], spawnT: 0, birdT: 8, fx: [], nid: 0 };

// стервятники — летающие мобы: вдали от базы стайка из 3–5 птиц налетает на героя; летают над водой и стенами,
// получив отпор, разлетаются. С них падают перья (для стрел) и мясо
function crowsTick(dt) {
  WILD.crowT = (WILD.crowT == null ? 120 : WILD.crowT) - dt;
  if (WILD.crowT > 0) return;
  WILD.crowT = rand(120, 240);
  for (const h of heroList()) {
    if (h.dead > 0 || inDungeonY(h.y) || nearestBldWhere(h.x, h.y, 30) || Math.hypot(h.x, h.y) < 50) continue;
    if (S.enemies.filter(e => e.type === 'crow').length > 10) return;
    const a = rand(0, 6.28), n = randi(3, 5);
    for (let i = 0; i < n; i++) {
      const e = spawnEnemy('crow', h.x + Math.cos(a) * 22 + rand(-2, 2), h.y + Math.sin(a) * 22 + rand(-2, 2), 'wild');
      e.flyH = rand(0.9, 1.4);
    }
    if (h === S.player) log('Над вами кружат стервятники!', 'warn');
    return;
  }
}
function wildTick(dt) {
  const p = S.player;
  if (inDungeonY(p.y)) return;
  // в совместной игре зверей ведёт хозяин и присылает гостю; гость только рисует их
  const guest = typeof MP !== 'undefined' && MP.role === 'client';
  if (!guest) { wildAnimalsTick(dt); if (!S.peaceful) crowsTick(dt); }
  wildAmbientTick(dt, p);
}
// звери: до 14 рядом с каждым героем, на траве и в лесу; убегают от ближайшего героя
function wildAnimalsTick(dt) {
  const heroes = heroList().filter(h => !inDungeonY(h.y));
  if (!heroes.length) return;
  const nearH = (x, y) => { let best = heroes[0], bd = 1e18; for (const h of heroes) { const d = dist2(h.x, h.y, x, y); if (d < bd) { bd = d; best = h; } } return best; };
  WILD.spawnT -= dt;
  if (WILD.spawnT <= 0) {
    WILD.spawnT = 2 / heroes.length;
    WILD.animals = WILD.animals.filter(a => !a.dead && heroes.some(h => dist2(a.x, a.y, h.x, h.y) < 70 * 70));
    const p = heroes[Math.floor(Math.random() * heroes.length)];
    if (WILD.animals.filter(a => dist2(a.x, a.y, p.x, p.y) < 70 * 70).length < 14) {
      const a = rand(0, 6.28), r = rand(26, 44), x = Math.floor(p.x + Math.cos(a) * r), y = Math.floor(p.y + Math.sin(a) * r);
      const c = chunkOf(x, y), i = tidx(x, y);
      const g0 = c.ground[i], ok = (g0 === GROUND.grass || g0 === GROUND.dark || g0 === GROUND.autumn || g0 === GROUND.snow) && !c.bld[i] && !campStructAt(x, y);
      let near = false;
      near = !!nearestBldWhere(x, y, 18);
      if (ok && !near) {
        const kind = Math.random() < 0.45 ? 'deer' : 'rabbit';
        const n = kind === 'deer' ? 1 + Math.floor(Math.random() * 3) : 1;
        for (let k = 0; k < n; k++) WILD.animals.push({ id: ++WILD.nid, kind, x: x + 0.5 + rand(-1, 1), y: y + 0.5 + rand(-1, 1), hp: ANIMALS[kind].hp, tx: null, ty: null, wait: rand(0, 3), ang: rand(0, 6.28), walk: 0 });
      }
    }
  }
  for (const a of WILD.animals) {
    const A = ANIMALS[a.kind], p = nearH(a.x, a.y);
    const dp = dist(a.x, a.y, p.x, p.y) || 0.01;
    let sp = A.speed;
    // силы на бег кончаются за 3 секунды и восстанавливаются, пока зверь спокоен
    a.stam = a.stam == null ? 3 : a.stam;
    if (dp < 6 && p.dead <= 0 || a.scared > 0) {
      // убегает от героя; выдохшись — еле бежит
      a.scared = (a.scared || 0) - dt;
      a.tx = a.x + (a.x - p.x) / dp * 6; a.ty = a.y + (a.y - p.y) / dp * 6; a.wait = 0;
      a.stam -= dt; sp = a.stam > 0 ? A.flee : A.speed * 1.6;
    } else if (a.tx == null) {
      a.wait -= dt;
      if (a.wait <= 0) { a.tx = a.x + rand(-5, 5); a.ty = a.y + rand(-5, 5); }
    }
    if (dp >= 6) a.stam = Math.min(3, a.stam + dt * 0.5);
    a.moving = false;
    if (a.tx != null) {
      const d = dist(a.x, a.y, a.tx, a.ty);
      if (d < 0.2) { a.tx = null; a.wait = rand(2, 6); continue; }
      const nx = a.x + (a.tx - a.x) / d * sp * dt, ny = a.y + (a.ty - a.y) / d * sp * dt;
      if (!walkable(Math.floor(nx), Math.floor(ny))) { a.tx = null; a.wait = 1; continue; }
      a.ang = Math.atan2(ny - a.y, nx - a.x); a.x = nx; a.y = ny; a.moving = true; a.walk += dt * sp;
    }
  }
}
function wildAmbientTick(dt, p) {
  // стаи птиц пролетают над картой днём
  WILD.birdT -= dt;
  if (WILD.birdT <= 0) {
    WILD.birdT = rand(70, 160); // стаи над головой — изредка
    if (!isNight()) {
      const ang = rand(0, 6.28), n = 4 + Math.floor(Math.random() * 6);
      const sx0 = p.x - Math.cos(ang) * 40, sy0 = p.y - Math.sin(ang) * 30;
      WILD.birds.push({ x: sx0, y: sy0, vx: Math.cos(ang) * 5, vy: Math.sin(ang) * 3.5, n, life: 18, ph: rand(0, 6) });
    }
  }
  for (const c of WILD.carcasses) c.t += dt;
  WILD.carcasses = WILD.carcasses.filter(c => c.t < CORPSE_LIFE);
  for (const a of WILD.animals) if (a.flash > 0) a.flash -= dt;
  for (const b of WILD.birds) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
  WILD.birds = WILD.birds.filter(b => b.life > 0);
  // дым над кострами лагерей в поле зрения
  for (const c of S.camps) {
    if (!c.alive || !inView(c.x, c.y)) continue;
    for (const s of c.structs) if (s.kind === 'bonfire' && s.hp > 0 && Math.random() < dt * 3)
      FX.push({ x: s.x + 0.5 + rand(-0.1, 0.1), y: s.y - 0.2, vx: rand(-0.2, 0.2), vy: rand(-0.8, -0.5), life: rand(1.4, 2.4), c: pick(['rgba(90,86,80,0.45)', 'rgba(120,116,110,0.4)']), s: rand(0.15, 0.28) });
  }
}

function animalAtPoint(x, y) {
  let best = null, bd = 0.7 * 0.7;
  for (const a of WILD.animals) { const d = dist2(a.x, a.y - 0.3, x, y); if (d < bd) { bd = d; best = a; } }
  return best;
}
// попадание по зверю (снаряд или посох героя)
// who — герой, который попал (добыча — ему); у гостя совместной игры только вспышка, остальное решает хозяин
function hurtAnimal(a, dmg, who) {
  if (a.dead) return;
  const p = who || S.player;
  a.flash = 0.15;
  spawnBurst(a.x, a.y - 0.3, '#a03030', 3);
  if (typeof MP !== 'undefined' && MP.role === 'client') return;
  a.hp -= dmg; a.scared = 4;
  if (a.hp > 0) return;
  a.dead = true;
  if (typeof MP !== 'undefined' && MP.role === 'host') (MP.adeaths || (MP.adeaths = [])).push([a.id, a.kind, +a.x.toFixed(2), +a.y.toFixed(2), Math.cos(a.ang) > 0 ? -1 : 1]);
  const loot = ANIMALS[a.kind].loot;
  for (const id in loot) p.inv.add(id, loot[id]);
  floatText(a.x, a.y - 0.4, Object.keys(loot).map(id => '+' + loot[id] + ' ' + ITEMS[id].name).join(', '), '#e8dcbc');
  WILD.carcasses.push({ kind: a.kind, x: a.x, y: a.y, side: Math.cos(a.ang) > 0 ? -1 : 1, t: 0 });
  if (WILD.carcasses.length > 20) WILD.carcasses.shift();
  S.stats.hunted = (S.stats.hunted || 0) + 1;
}

function drawAnimal(a, t) {
  const dir = Math.abs(Math.cos(a.ang)) > Math.abs(Math.sin(a.ang)) ? (Math.cos(a.ang) > 0 ? 1 : 3) : (Math.sin(a.ang) > 0 ? 2 : 0);
  const bob = a.moving ? Math.abs(Math.sin(a.walk * (a.kind === 'rabbit' ? 9 : 6))) * (a.kind === 'rabbit' ? 0.12 : 0.05) : 0;
  drawProp('build', a.kind + '_' + dir, a.x - 0.5, a.y - 0.5 - bob, a.flash > 0 ? { flash: true } : null);
}
// туша добытого зверя лежит на боку и тает, как трупы врагов
function drawCarcass(c) {
  const st = SPRITES3D.sets.build, it = st && st.items[c.kind + '_1'], img = st && S3D.img[st.file];
  if (!it || !img) return;
  const fade = c.t < CORPSE_LIFE - 3 ? 1 : Math.max(0, (CORPSE_LIFE - c.t) / 3);
  G.save(); G.globalAlpha = 0.4 * fade; G.fillStyle = '#5a1410';
  G.beginPath(); G.ellipse(sx(c.x), sy(c.y), VIEW.z * 0.4, VIEW.z * 0.16, 0, 0, 7); G.fill(); G.restore();
  const k = Math.min(1, c.t / 0.35) ** 2;
  G.save(); G.globalAlpha = fade;
  G.translate(sx(c.x), sy(c.y)); G.rotate(c.side * k * Math.PI / 2);
  G.translate(-sx(c.x), -sy(c.y));
  drawProp('build', c.kind + '_1', c.x - 0.5, c.y - 0.5);
  G.restore();
}

// птицы и их тени — поверх мира (летят высоко)
function drawBirds(t) {
  for (const b of WILD.birds) {
    for (let i = 0; i < b.n; i++) {
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      const bx = b.x - b.vx / 5 * row * 0.9 + (-b.vy / 5) * side * row * 0.7, by = b.y - b.vy / 5 * row * 0.9 + (b.vx / 5) * side * row * 0.5;
      if (!inView(bx, by)) continue;
      // тень на земле
      G.fillStyle = 'rgba(0,0,0,0.18)'; G.beginPath(); G.ellipse(sx(bx + 1.5), sy(by + 2.5), VIEW.z * 0.12, VIEW.z * 0.05, 0, 0, 7); G.fill();
      const flap = Math.sin(t * 9 + b.ph + i) * 0.12;
      G.strokeStyle = '#2a2420'; G.lineWidth = Math.max(1.5, VIEW.z * 0.04); G.lineCap = 'round';
      const X = sx(bx), Y = sy(by), w = VIEW.z * 0.22;
      G.beginPath(); G.moveTo(X - w, Y - w * flap * 3); G.lineTo(X, Y); G.lineTo(X + w, Y - w * flap * 3); G.stroke();
    }
  }
}
// светлячки ночью и бабочки днём — рядом с героем, только в траве и лесу
function drawAmbient(t) {
  const p = S.player;
  if (inDungeonY(p.y)) return;
  const night = darkness() > 0.5;
  G.save();
  if (night) G.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const bx = Math.floor(p.x / 12) * 12, by = Math.floor(p.y / 12) * 12;
    const cx = bx + (hash2(i, 7, 3) - 0.5) * 36, cy = by + (hash2(i, 9, 5) - 0.5) * 24;
    const x = cx + Math.sin(t * 0.7 + i) * 1.2, y = cy + Math.cos(t * 0.5 + i * 1.3) * 0.8;
    if (!inView(x, y)) continue;
    const c = peekChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    if (!c) continue;
    const gr = c.ground[tidx(Math.floor(x), Math.floor(y))];
    if (gr !== GROUND.grass && gr !== GROUND.dark && gr !== GROUND.autumn && !(night && gr === GROUND.mushroom)) continue;
    if (night) {
      const a = 0.4 + Math.sin(t * 3 + i * 2) * 0.4;
      if (a <= 0.05) continue;
      G.fillStyle = `rgba(200,255,120,${a.toFixed(2)})`; G.beginPath(); G.arc(sx(x), sy(y - 0.6), Math.max(1.5, VIEW.z * 0.05), 0, 7); G.fill();
    } else if (i < 10) {
      const flap = Math.abs(Math.sin(t * 14 + i));
      G.fillStyle = ['#f0e060', '#ffffff', '#f09040', '#a0c8ff'][i % 4];
      const X = sx(x), Y = sy(y - 0.5), w = VIEW.z * 0.06;
      G.fillRect(X - w * flap, Y, w * flap, w * 0.9); G.fillRect(X, Y, w * flap, w * 0.9);
    }
  }
  G.restore();
}
