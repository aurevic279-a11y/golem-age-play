'use strict';
// Простые синтезированные звуки (WebAudio), без файлов.

let AC = null, MASTER = null;
let SOUND_ON = true;
const lastSfx = {};

function initAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    MASTER = AC.createGain();
    MASTER.gain.value = 0.35;
    MASTER.connect(AC.destination);
    if (typeof startMusic === 'function') startMusic();
  } catch (e) { AC = null; }
}

function tone(freq, dur, type, vol, slide, delay) {
  const t = AC.currentTime + (delay || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(MASTER);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol, filt, delay) {
  const t = AC.currentTime + (delay || 0);
  const n = Math.floor(AC.sampleRate * dur);
  const buf = AC.createBuffer(1, n, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = filt || 2000;
  g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(MASTER);
  s.start(t);
}

function sfx(name, x, y) {
  if (typeof MP !== 'undefined' && MP.silent) return;
  if (!AC || !SOUND_ON || AC.state !== 'running') return;
  let vol = 1;
  if (x != null && S && S.player) {
    const d = dist(x, y, S.player.x, S.player.y);
    if (d > 28) return;
    vol = 1 - d / 30;
  }
  const now = performance.now();
  if (lastSfx[name] && now - lastSfx[name] < 60) return;
  lastSfx[name] = now;
  const v = 0.25 * vol;
  switch (name) {
    case 'click': tone(660, 0.05, 'square', v * 0.5); break;
    case 'build': tone(220, 0.08, 'square', v); tone(330, 0.1, 'square', v, null, 0.06); break;
    case 'remove': tone(330, 0.08, 'square', v); tone(200, 0.1, 'square', v, null, 0.06); break;
    case 'chop': noise(0.08, v * 0.8, 1200); tone(140, 0.06, 'triangle', v * 0.6); break;
    case 'mine': noise(0.06, v * 0.6, 3000); tone(500, 0.04, 'square', v * 0.3); break;
    case 'shoot': noise(0.05, v * 0.5, 4000); tone(900, 0.05, 'triangle', v * 0.3, 400); break;
    case 'throw': tone(120, 0.25, 'sawtooth', v * 0.4, 60); break;
    case 'fire': noise(0.15, v * 0.4, 800); break;
    case 'hit': noise(0.06, v * 0.6, 1500); break;
    case 'hurt': tone(200, 0.15, 'sawtooth', v * 0.6, 90); break;
    case 'crash': noise(0.35, v, 600); tone(80, 0.3, 'square', v * 0.5, 40); break;
    case 'boom': noise(0.6, v * 1.3, 400); tone(60, 0.5, 'sine', v, 30); break;
    case 'arcane': tone(800, 0.3, 'sine', v * 0.5, 1600); break;
    case 'death': tone(300, 0.6, 'sawtooth', v, 50); break;
    case 'alarm': tone(440, 0.15, 'square', v * 0.7); tone(330, 0.15, 'square', v * 0.7, null, 0.18); tone(440, 0.15, 'square', v * 0.7, null, 0.36); break;
    case 'elf': tone(220, 0.8, 'sine', v * 0.7, 110); tone(233, 0.8, 'sine', v * 0.5, 116); tone(880, 0.4, 'triangle', v * 0.2, 440, 0.2); break;
    case 'research': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, 'triangle', v * 0.6, null, i * 0.09)); break;
    case 'victory': [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, 'square', v * 0.5, null, i * 0.12)); break;
    case 'coins': [1200, 1500, 1800].forEach((f, i) => tone(f, 0.08, 'square', v * 0.4, null, i * 0.05)); break;
    case 'error': tone(150, 0.12, 'square', v * 0.6); break;
  }
}
