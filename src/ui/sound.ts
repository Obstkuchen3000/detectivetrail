import type { Sfx } from '../game/game';

/** Synthetische Soundeffekte (WebAudio, keine Dateien nötig) */
let ctx: AudioContext | null = null;
let muted = (() => { try { return localStorage.getItem('dt-muted') === '1'; } catch { return false; } })();
export const isMuted = () => muted;
export function setMuted(m: boolean) { muted = m; try { localStorage.setItem('dt-muted', m ? '1' : '0'); } catch { /* egal */ } }

function ac() {
  if (!ctx) { const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, when = 0, slide?: number) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + when;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, vol = 0.1, when = 0, hp = 800) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + when;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination); src.start(t);
}

export function play(s: Sfx) {
  if (muted) return;
  switch (s) {
    case 'click': tone(900, 0.04, 'square', 0.04); break;
    case 'pin': noise(0.05, 0.12, 0, 2000); tone(180, 0.08, 'sine', 0.12); break;
    case 'thread': tone(523, 0.12, 'triangle', 0.12); tone(659, 0.12, 'triangle', 0.12, 0.08); tone(784, 0.25, 'triangle', 0.12, 0.16); break;
    case 'snap': tone(420, 0.25, 'sawtooth', 0.08, 0, 90); noise(0.08, 0.08, 0, 3000); break;
    case 'found': tone(880, 0.1, 'sine', 0.12); tone(1320, 0.2, 'sine', 0.1, 0.07); break;
    case 'phone': for (let i = 0; i < 2; i++) { tone(440, 0.35, 'sine', 0.07, i * 0.5); tone(480, 0.35, 'sine', 0.07, i * 0.5); } break;
    case 'answer': for (let i = 0; i < 5; i++) noise(0.03, 0.08, i * 0.06, 3500); break;
    case 'radio': noise(0.18, 0.06, 0, 1200); tone(1200, 0.05, 'square', 0.03, 0.18); break;
    case 'trace': tone(660, 0.08, 'square', 0.05); tone(990, 0.12, 'square', 0.05, 0.1); break;
    case 'move': tone(300, 0.08, 'sine', 0.05, 0, 200); break;
    case 'siren': for (let i = 0; i < 3; i++) { tone(700, 0.3, 'sawtooth', 0.06, i * 0.6, 1000); tone(1000, 0.3, 'sawtooth', 0.06, i * 0.6 + 0.3, 700); } break;
    case 'fail': tone(300, 0.3, 'triangle', 0.12, 0, 200); tone(200, 0.5, 'triangle', 0.12, 0.25, 110); break;
    case 'warrant': noise(0.06, 0.2, 0, 400); tone(110, 0.25, 'sine', 0.2); break;
    case 'chapter': tone(196, 0.5, 'triangle', 0.1); tone(247, 0.5, 'triangle', 0.1, 0.15); tone(294, 0.8, 'triangle', 0.1, 0.3); break;
  }
}
