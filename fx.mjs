// Sound, confetti and number animations. All synthesised in the browser:
// no audio files, no images, nothing extra to download or host.

import { fmt } from './dom.mjs';

// ───────────────────────────── sound ─────────────────────────────
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('pt:muted') === '1'; } catch { /* private mode */ }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, at = 0, dur = 0.15, { type = 'sine', gain = 0.12, slide = 1 } = {}) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(at = 0, dur = 0.3, gain = 0.08) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(600, c.currentTime + at);
  f.frequency.exponentialRampToValueAtTime(3200, c.currentTime + at + dur);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + at);
}

export const sfx = {
  get muted() { return muted; },
  setMuted(v) { muted = Boolean(v); try { localStorage.setItem('pt:muted', muted ? '1' : '0'); } catch { /* ignore */ } },
  unlock() { audio(); },
  correct() { tone(660, 0, 0.12, { type: 'triangle' }); tone(990, 0.09, 0.2, { type: 'triangle' }); },
  wrong() { tone(200, 0, 0.28, { type: 'sawtooth', gain: 0.07, slide: 0.55 }); },
  tick() { tone(900, 0, 0.05, { type: 'square', gain: 0.035 }); },
  go() { tone(523, 0, 0.1, { type: 'triangle' }); tone(784, 0.1, 0.1, { type: 'triangle' }); tone(1046, 0.2, 0.32, { type: 'triangle' }); },
  streak() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.06, 0.12, { type: 'triangle', gain: 0.1 })); },
  whoosh() { noise(0, 0.45, 0.07); },
  horn() { tone(220, 0, 0.5, { type: 'sawtooth', gain: 0.08 }); tone(277, 0, 0.5, { type: 'sawtooth', gain: 0.06 }); },
  drum() { tone(110, 0, 0.18, { type: 'sine', gain: 0.25, slide: 0.5 }); },
  fanfare() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.13, 0.28, { type: 'triangle', gain: 0.11 }));
  },
};

// ───────────────────────────── confetti ─────────────────────────────
const COLORS = ['#ff9900', '#ffb84d', '#37c0d8', '#3ddc97', '#ffffff', '#c99a5b'];
let canvas = null;
let cctx = null;
let parts = [];
let raf = 0;
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function ensureCanvas() {
  if (!canvas) {
    canvas = document.getElementById('fx') || Object.assign(document.createElement('canvas'), { id: 'fx' });
    if (!canvas.isConnected) document.body.append(canvas);
    cctx = canvas.getContext('2d');
    addEventListener('resize', sizeCanvas);
  }
  sizeCanvas();
}
function sizeCanvas() {
  if (!canvas) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function confetti({ x = 0.5, y = 0.4, count = 110, power = 1 } = {}) {
  if (reduced) return;
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (4 + Math.random() * 9) * power;
    parts.push({
      x: x * innerWidth, y: y * innerHeight,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5 * power,
      w: 6 + Math.random() * 8, h: 4 + Math.random() * 6,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)], life: 0, max: 90 + Math.random() * 70,
    });
  }
  if (!raf) raf = requestAnimationFrame(step);
}

export function confettiRain(ms = 3500) {
  const end = performance.now() + ms;
  const tick = () => {
    confetti({ x: Math.random(), y: -0.05, count: 6, power: 0.45 });
    if (performance.now() < end) setTimeout(tick, 90);
  };
  tick();
}

function step() {
  cctx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life < p.max && p.y < innerHeight + 40);
  for (const p of parts) {
    p.life++;
    p.vy += 0.28;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    cctx.save();
    cctx.globalAlpha = Math.min(1, (p.max - p.life) / 25);
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    cctx.restore();
  }
  raf = parts.length ? requestAnimationFrame(step) : 0;
  if (!parts.length) cctx.clearRect(0, 0, innerWidth, innerHeight);
}

// ───────────────────────────── numbers ─────────────────────────────
const counters = new WeakMap();

/** Smoothly count a number element up (or down) to a new value. */
export function countTo(node, to, ms = 700) {
  const from = counters.get(node)?.value ?? Number(node.dataset.v ?? 0);
  counters.get(node)?.cancel?.();
  if (from === to) { node.textContent = fmt(to); node.dataset.v = to; return; }
  const t0 = performance.now();
  let alive = true;
  const state = { value: from, cancel: () => { alive = false; } };
  counters.set(node, state);
  const frame = (t) => {
    if (!alive) return;
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    state.value = from + (to - from) * e;
    node.textContent = fmt(state.value);
    if (k < 1) requestAnimationFrame(frame);
    else { state.value = to; node.dataset.v = to; node.textContent = fmt(to); }
  };
  requestAnimationFrame(frame);
}

export const vibrate = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* ignore */ } };
