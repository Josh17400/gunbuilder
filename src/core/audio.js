// Synthesized SFX via WebAudio — no external assets.
// Safe to call play()/setVolume() before init() (no-ops until context exists).

import { clamp } from "./utils.js";
import { save } from "./save.js";

let ctx = null;
let masterGain = null;
let noiseBuffer = null;
let volume = 0.8;

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

function playShot() {
  playThumpAndNoise({ freq: 95, noiseDur: 0.045, thumpDur: 0.12, gain: 0.9 });
}

function playShotSuppressed() {
  playThumpAndNoise({ freq: 85, noiseDur: 0.03, thumpDur: 0.08, gain: 0.32, filterFreq: 1100 });
}

function playShotHeavy() {
  playThumpAndNoise({ freq: 58, noiseDur: 0.065, thumpDur: 0.2, gain: 1.15 });
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
};

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
};
