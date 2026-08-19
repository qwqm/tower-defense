// 原创合成音效（WebAudio），无外部素材依赖
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
let bgmTimer: number | null = null;
let sfxOn = true;
let bgmOn = true;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      const c2: AudioContext = new AC();
      ctx = c2;
      master = c2.createGain();
      master.gain.value = 0.5;
      master.connect(c2.destination);
    } catch { return null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function setSfx(v: boolean) { sfxOn = v; }
export function setBgmEnabled(v: boolean) {
  bgmOn = v;
  if (!v) stopBgm();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  const c = ac(); if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.03);
}

function noise(dur: number, vol: number, filterFreq: number, delay = 0) {
  const c = ac(); if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, Math.max(1, len), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

export type SfxName =
  | 'click' | 'recruit' | 'merge' | 'hero' | 'hit' | 'skill' | 'boss' | 'win' | 'lose'
  | 'crit' | 'star' | 'error' | 'damage';

export function sfx(name: SfxName) {
  if (!sfxOn) return;
  switch (name) {
    case 'click': tone(620, 0.07, 'triangle', 0.14); break;
    case 'recruit': tone(420, 0.1, 'square', 0.1); tone(660, 0.12, 'triangle', 0.1, 880, 0.05); break;
    case 'merge': tone(520, 0.1, 'triangle', 0.14, 900); tone(780, 0.16, 'sine', 0.12, 1300, 0.06); break;
    case 'hero':
      tone(220, 0.5, 'sawtooth', 0.14, 440);
      tone(330, 0.6, 'triangle', 0.13, 660, 0.08);
      tone(550, 0.7, 'sine', 0.12, 1100, 0.16);
      noise(0.5, 0.16, 2200, 0.02);
      break;
    case 'hit': tone(180 + Math.random() * 60, 0.05, 'square', 0.045, 90); break;
    case 'crit': tone(900, 0.09, 'sawtooth', 0.11, 300); noise(0.12, 0.1, 4000); break;
    case 'skill': tone(300, 0.3, 'sawtooth', 0.13, 720); noise(0.3, 0.12, 3000); break;
    case 'boss':
      tone(90, 1.1, 'sawtooth', 0.2, 60); tone(120, 1.0, 'square', 0.12, 70, 0.1);
      noise(0.9, 0.2, 800, 0.05);
      break;
    case 'damage': tone(160, 0.18, 'square', 0.12, 70); break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.32, 'triangle', 0.14, undefined, i * 0.11));
      break;
    case 'lose':
      [440, 370, 294, 220].forEach((f, i) => tone(f, 0.4, 'sine', 0.14, undefined, i * 0.14));
      break;
    case 'star': tone(880, 0.16, 'triangle', 0.13, 1400); break;
    case 'error': tone(160, 0.12, 'square', 0.09, 110); break;
  }
}

// 简单的循环背景乐（五声音阶）
const SCALE = [196, 220, 262, 294, 330, 392, 440, 523];
let step = 0;
export function startBgm() {
  if (!bgmOn || bgmTimer !== null) return;
  const c = ac(); if (!c || !master) return;
  bgmGain = c.createGain(); bgmGain.gain.value = 0.16; bgmGain.connect(master);
  const play = () => {
    if (!ctx || !bgmGain) return;
    const t = ctx.currentTime;
    const note = SCALE[(step * 3 + (step % 5)) % SCALE.length];
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = note;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(bgmGain); o.start(t); o.stop(t + 1.0);
    if (step % 4 === 0) {
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.type = 'triangle'; o2.frequency.value = note / 2;
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.2, t + 0.06);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o2.connect(g2); g2.connect(bgmGain); o2.start(t); o2.stop(t + 1.5);
    }
    step++;
  };
  play();
  bgmTimer = window.setInterval(play, 620);
}

export function stopBgm() {
  if (bgmTimer !== null) { clearInterval(bgmTimer); bgmTimer = null; }
  if (bgmGain) { try { bgmGain.disconnect(); } catch { /* */ } bgmGain = null; }
}

export function vibrate(ms: number, enabled: boolean) {
  if (!enabled) return;
  try { navigator.vibrate?.(ms); } catch { /* */ }
}
