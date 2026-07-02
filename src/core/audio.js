// Synthesized SFX via WebAudio — no external assets.
// Safe to call play()/setVolume() before init() (no-ops until context exists).

import { clamp } from "./utils.js";
import { save } from "./save.js";

let ctx = null;
let masterGain = null;
let noiseBuffer = null;
let volume = 0.8;

// ---- managed loops (spin buzz / low-hp heartbeat) ---------------------
let spinNodes = null; // { osc, osc2, filter, gain } — created lazily, torn down at amount<=0
let spinAmount = 0;
let heartbeatOn = false;
let heartbeatTimerId = null;

function createNoiseBuffer(context) {
  const length = Math.floor(context.sampleRate * 1); // 1s of white noise, reused/sliced per play
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function ensureContext() {
  if (ctx) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  ctx = new AudioCtx();
  masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);
  noiseBuffer = createNoiseBuffer(ctx);
}

function now() {
  return ctx.currentTime;
}

// Returns a BufferSource playing a random slice of the shared noise buffer.
function makeNoiseSource(duration) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const maxOffset = Math.max(0, noiseBuffer.duration - duration - 0.02);
  const offset = Math.random() * maxOffset;
  return { src, offset };
}

function expDecayGain(startGain, endGain = 0.0008) {
  const g = ctx.createGain();
  g.gain.value = startGain;
  return g;
}

// ---- individual synthesized sounds -----------------------------------

function playThumpAndNoise({ freq, noiseDur, thumpDur, gain, filterFreq = null }) {
  const t0 = now();

  // Noise burst (transient "crack").
  const { src, offset } = makeNoiseSource(noiseDur);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(gain * 0.6, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + noiseDur);
  let tail = src;
  if (filterFreq) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    src.connect(filter);
    tail = filter;
  }
  tail.connect(noiseGain);
  noiseGain.connect(masterGain);
  src.start(t0, offset, noiseDur);
  src.stop(t0 + noiseDur + 0.02);

  // Low sine thump.
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.5), t0 + thumpDur);
  const oGain = ctx.createGain();
  oGain.gain.setValueAtTime(gain, t0);
  oGain.gain.exponentialRampToValueAtTime(0.001, t0 + thumpDur);
  osc.connect(oGain);
  oGain.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + thumpDur + 0.02);
}

// Short metallic "ping" tail — a couple of quickly-decaying square-wave
// partials layered a few ms after the crack for a brassy/casing flavor.
function metallicTail(t0, { freq = 2200, gain = 0.1, dur = 0.08, delay = 0.012 } = {}) {
  const start = t0 + delay;
  [1, 1.6].forEach((mult, i) => {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq * mult, start);
    osc.frequency.exponentialRampToValueAtTime(freq * mult * 0.6, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * (i === 0 ? 1 : 0.5), start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  });
}

// Long low decaying boom that lingers after the initial thump (shotHeavy).
function boomTail(t0, { freq = 42, gain = 0.3, dur = 0.35, delay = 0.03 } = {}) {
  const start = t0 + delay;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// Tiny high-passed noise tick — the mechanical action click under a
// suppressed shot's filtered thud.
function mechClick(t0, { freq = 3200, gain = 0.13, dur = 0.011, delay = 0.045 } = {}) {
  const start = t0 + delay;
  const { src, offset } = makeNoiseSource(dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  src.start(start, offset, dur);
  src.stop(start + dur + 0.02);
}

function playShot() {
  const t0 = now();
  playThumpAndNoise({ freq: 95, noiseDur: 0.045, thumpDur: 0.12, gain: 0.85 });
  metallicTail(t0, { freq: 2400, gain: 0.1, dur: 0.07, delay: 0.015 });
}

function playShotSuppressed() {
  const t0 = now();
  playThumpAndNoise({ freq: 85, noiseDur: 0.03, thumpDur: 0.08, gain: 0.3, filterFreq: 1100 });
  mechClick(t0, { freq: 3200, gain: 0.12, dur: 0.01, delay: 0.045 });
}

function playShotHeavy() {
  const t0 = now();
  playThumpAndNoise({ freq: 58, noiseDur: 0.065, thumpDur: 0.2, gain: 1.0 });
  boomTail(t0, { freq: 42, gain: 0.28, dur: 0.4, delay: 0.04 });
  metallicTail(t0, { freq: 1800, gain: 0.08, dur: 0.08, delay: 0.02 });
}

function playClick({ dur = 0.03, freq = 2200, gain = 0.5 } = {}) {
  const t0 = now();
  const { src, offset } = makeNoiseSource(dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  src.start(t0, offset, dur);
  src.stop(t0 + dur + 0.02);
}

function playDry() {
  playClick({ dur: 0.025, freq: 2500, gain: 0.45 });
}

function playReload() {
  const t0 = now();
  const gaps = [0.0, 0.22];
  for (const gap of gaps) {
    const start = t0 + gap;
    const { src, offset } = makeNoiseSource(0.02);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2800;
    filter.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, start);
    g.gain.setValueAtTime(0.55, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.03);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(start, offset, 0.02);
    src.stop(start + 0.04);
  }
}

function playHit() {
  const t0 = now();
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(900, t0);
  osc.frequency.exponentialRampToValueAtTime(500, t0 + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.08);
}

function playHitmarker() {
  const t0 = now();
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(2600, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.28, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.045);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.06);
}

function playDing() {
  const t0 = now();
  const partials = [660, 990, 1320, 1980];
  for (const freq of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + 0.62);
  }
}

function playPopup() {
  const t0 = now();
  const dur = 0.28;
  const { src, offset } = makeNoiseSource(dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(300, t0);
  filter.frequency.exponentialRampToValueAtTime(1600, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t0);
  g.gain.linearRampToValueAtTime(0.3, t0 + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  src.start(t0, offset, dur);
  src.stop(t0 + dur + 0.02);
}

function playFall() {
  const t0 = now();
  const dur = 0.35;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, t0);
  osc.frequency.exponentialRampToValueAtTime(40, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.8, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);

  const { src, offset } = makeNoiseSource(0.08);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.25, t0);
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
  src.connect(ng);
  ng.connect(masterGain);
  src.start(t0, offset, 0.08);
  src.stop(t0 + 0.1);
}

function playExplosion() {
  const t0 = now();
  const dur = 0.5;
  const { src, offset } = makeNoiseSource(dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(4000, t0);
  filter.frequency.exponentialRampToValueAtTime(150, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(1.0, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  src.start(t0, offset, dur);
  src.stop(t0 + dur + 0.02);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(55, t0);
  osc.frequency.exponentialRampToValueAtTime(25, t0 + 0.4);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.9, t0);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
  osc.connect(og);
  og.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.42);
}

function playUiClick() {
  playClick({ dur: 0.018, freq: 3200, gain: 0.3 });
}

function playBeep() {
  const t0 = now();
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 880;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t0);
  g.gain.linearRampToValueAtTime(0.3, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.1);
}

function playFinish() {
  const t0 = now();
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((freq, i) => {
    const start = t0 + i * 0.12;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, start);
    g.gain.linearRampToValueAtTime(0.32, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.24);
  });
}

// Zombie moan: detuned saw + sine wobble, random pitch/variant each play.
const GROAN_VARIANTS = [
  { base: 90, wobbleFreq: 4.5, wobbleDepth: 10, dur: 0.9 },
  { base: 68, wobbleFreq: 3.2, wobbleDepth: 14, dur: 1.1 },
  { base: 112, wobbleFreq: 5.6, wobbleDepth: 8, dur: 0.75 },
];

function playGroan() {
  const t0 = now();
  const v = GROAN_VARIANTS[Math.floor(Math.random() * GROAN_VARIANTS.length)];
  const pitchMult = 0.85 + Math.random() * 0.3; // random pitch each play
  const dur = v.dur;

  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(v.base * pitchMult, t0);
  osc.frequency.exponentialRampToValueAtTime(v.base * pitchMult * 0.72, t0 + dur);
  osc.detune.setValueAtTime(-18, t0);

  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(v.base * pitchMult * 0.5, t0);
  osc2.detune.setValueAtTime(12, t0);

  // Slow pitch wobble modulating osc's detune — the "moan" waver.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = v.wobbleFreq;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = v.wobbleDepth;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.detune);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 700;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t0);
  g.gain.linearRampToValueAtTime(0.2, t0 + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(g);
  g.connect(masterGain);

  osc.start(t0);
  osc2.start(t0);
  lfo.start(t0);
  osc.stop(t0 + dur + 0.05);
  osc2.stop(t0 + dur + 0.05);
  lfo.stop(t0 + dur + 0.05);
}

function playZombieHit() {
  const t0 = now();
  const dur = 0.09;
  const { src, offset } = makeNoiseSource(dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, t0);
  filter.frequency.exponentialRampToValueAtTime(220, t0 + dur);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.42, t0);
  ng.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(ng);
  ng.connect(masterGain);
  src.start(t0, offset, dur);
  src.stop(t0 + dur + 0.02);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, t0);
  osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.1);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.38, t0);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
  osc.connect(og);
  og.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + 0.12);
}

function playWaveStart() {
  const t0 = now();
  const dur = 1.1;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(70, t0);
  osc.frequency.linearRampToValueAtTime(95, t0 + dur * 0.6);
  osc.frequency.exponentialRampToValueAtTime(60, t0 + dur);
  const osc2 = ctx.createOscillator();
  osc2.type = "sawtooth";
  osc2.frequency.setValueAtTime(70 * 1.5, t0);
  osc2.detune.value = 6;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(300, t0);
  filter.frequency.linearRampToValueAtTime(900, t0 + dur * 0.5);
  filter.frequency.exponentialRampToValueAtTime(200, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t0);
  g.gain.linearRampToValueAtTime(0.38, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  osc.start(t0);
  osc2.start(t0);
  osc.stop(t0 + dur + 0.05);
  osc2.stop(t0 + dur + 0.05);
}

function playBuy() {
  const t0 = now();
  const notes = [784, 988, 1175, 1568]; // bright ascending arpeggio, cha-ching
  notes.forEach((freq, i) => {
    const start = t0 + i * 0.055;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, start);
    g.gain.linearRampToValueAtTime(0.22, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.18);
  });
}

function lowThump(start, freq, gain, dur) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

// Low double-thump ("lub-dub") for low-HP feedback; also the loop tick used
// by setHeartbeat.
function playHeartbeat() {
  const t0 = now();
  lowThump(t0, 60, 0.48, 0.14);
  lowThump(t0 + 0.16, 50, 0.3, 0.12);
}

const SOUND_MAP = {
  shot: playShot,
  shotSuppressed: playShotSuppressed,
  shotHeavy: playShotHeavy,
  dry: playDry,
  reload: playReload,
  hit: playHit,
  hitmarker: playHitmarker,
  ding: playDing,
  popup: playPopup,
  fall: playFall,
  explosion: playExplosion,
  uiClick: playUiClick,
  beep: playBeep,
  finish: playFinish,
  groan: playGroan,
  zombieHit: playZombieHit,
  waveStart: playWaveStart,
  buy: playBuy,
  heartbeat: playHeartbeat,
};

// ---- setSpin(amount): managed looping buzz for spinUp receivers ---------
// Lazily creates a saw+lowpass drone the first time amount > 0; pitch/gain
// follow `amount` via setTargetAtTime (short smoothing to avoid zipper
// noise); torn down (fade + stop) once amount returns to ~0.
function stopSpinLoop() {
  if (!spinNodes) return;
  const t0 = now();
  const { osc, gain } = spinNodes;
  gain.gain.cancelScheduledValues(t0);
  gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t0);
  gain.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.06);
  osc.stop(t0 + 0.08);
  spinNodes = null;
}

function applySpinLoop(amount) {
  if (amount <= 0.001) {
    stopSpinLoop();
    return;
  }
  if (!spinNodes) {
    const t0 = now();
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    spinNodes = { osc, filter, gain };
  }
  const t0 = now();
  const freq = 90 + amount * 260; // pitch follows amount
  const gainTarget = 0.05 + amount * 0.22;
  spinNodes.osc.frequency.setTargetAtTime(freq, t0, 0.05);
  spinNodes.gain.gain.setTargetAtTime(gainTarget, t0, 0.05);
}

// ---- setHeartbeat(on): managed loop, ~880ms lub-dub interval -------------
function scheduleHeartbeat() {
  if (!heartbeatOn) return;
  if (ctx && masterGain) playHeartbeat();
  heartbeatTimerId = setTimeout(scheduleHeartbeat, 880);
}

export const audio = {
  init() {
    try {
      const settings = save.getSettings();
      volume = clamp(settings.volume, 0, 1);
    } catch (err) {
      // keep previous/default volume
    }
    ensureContext();
    if (!ctx) return;
    if (masterGain) masterGain.gain.value = volume;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  },

  play(name, opts = {}) {
    if (!ctx || !masterGain) return; // no-op before init()
    const fn = SOUND_MAP[name];
    if (!fn) return;
    try {
      fn(opts);
    } catch (err) {
      console.error(`audio: failed to play "${name}"`, err);
    }
  },

  setVolume(v) {
    volume = clamp(v, 0, 1);
    if (masterGain) masterGain.gain.value = volume;
  },

  // Debug/test-only: exposes the underlying AudioContext.state ("suspended" |
  // "running" | "closed" | "none" before init()). Not part of the module
  // contract's gameplay surface — used by the Playwright audio smoketest.
  getContextState() {
    return ctx ? ctx.state : "none";
  },

  // 0 = silent/stopped, >0 = looping buzz whose pitch/gain follow amount.
  // Safe to call before init() (no-op — just records the last amount).
  setSpin(amount) {
    spinAmount = clamp(amount, 0, 1);
    if (!ctx || !masterGain) return;
    applySpinLoop(spinAmount);
  },

  // Managed low-HP heartbeat loop. Not wired to any screen yet — available
  // for a future low-HP vignette hookup (see CONTRACTS.md Addendum v4).
  setHeartbeat(on) {
    on = !!on;
    if (on === heartbeatOn) return;
    heartbeatOn = on;
    if (heartbeatTimerId) {
      clearTimeout(heartbeatTimerId);
      heartbeatTimerId = null;
    }
    if (on) scheduleHeartbeat();
  },
};
