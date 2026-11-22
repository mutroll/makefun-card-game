// audio.js — all sounds are WebAudio oscillators: no audio files, no network.
// The context is created lazily on the first user gesture (browser autoplay
// policy) and every sound is a short envelope so it never drones.

let ctx = null;
let muted = false;

export function isMuted() { return muted; }
export function toggleMute() { muted = !muted; return muted; }

function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
  if (muted) return;
  const ac = audioContext();
  if (!ac) return;
  const t0 = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function soundClick() { tone(660, 0.07, 'triangle', 0.12); }
export function soundDeal() { tone(520, 0.09, 'triangle', 0.10); tone(780, 0.09, 'triangle', 0.08, 0.06); }
export function soundPlayCard() { tone(440, 0.10, 'sine', 0.16); tone(660, 0.12, 'sine', 0.12, 0.07); }
export function soundHit() { tone(180, 0.22, 'sawtooth', 0.18, 0, 70); }
export function soundGuard() { tone(300, 0.16, 'square', 0.08, 0, 240); }
export function soundHeal() { tone(523, 0.14, 'sine', 0.12); tone(784, 0.18, 'sine', 0.10, 0.09); }
export function soundSurge() { tone(392, 0.10, 'triangle', 0.14); tone(523, 0.10, 'triangle', 0.14, 0.08); tone(784, 0.16, 'triangle', 0.14, 0.16); }
export function soundError() { tone(140, 0.14, 'square', 0.10); }
export function soundTurn() { tone(587, 0.12, 'triangle', 0.10); }
export function soundWin() {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, i * 0.13));
  tone(1319, 0.5, 'sine', 0.10, 0.55);
}
export function soundLose() {
  [392, 330, 262, 196].forEach((f, i) => tone(f, 0.30, 'sine', 0.14, i * 0.16));
}
