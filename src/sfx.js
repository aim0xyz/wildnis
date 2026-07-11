// Winzige WebAudio-Soundeffekte (synthetisiert, keine Dateien)

let ctx = null;
let noiseBuf = null;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'square', vol = 0.3, slideTo = null) {
  if (sfx.muted) return;
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

function noiseBurst(dur, vol = 0.3, filterFreq = 1000) {
  if (sfx.muted) return;
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start();
  src.stop(c.currentTime + dur + 0.02);
}

export const sfx = {
  muted: false,
  unlock() { try { ac(); } catch { /* kein Audio verfügbar */ } },
  chop() { noiseBurst(0.09, 0.5, 900); tone(120, 0.09, 'triangle', 0.5, 70); },
  stone() { noiseBurst(0.06, 0.5, 2400); tone(220, 0.05, 'square', 0.25, 150); },
  pickup() { tone(660, 0.07, 'sine', 0.3, 990); },
  eat() { tone(300, 0.06, 'triangle', 0.35, 200); setTimeout(() => tone(260, 0.06, 'triangle', 0.3, 180), 90); },
  craft() { tone(440, 0.08, 'square', 0.2); setTimeout(() => tone(660, 0.1, 'square', 0.2), 100); },
  place() { tone(180, 0.12, 'triangle', 0.4, 110); },
  attack() { noiseBurst(0.05, 0.2, 1400); },
  hit() { noiseBurst(0.07, 0.4, 700); tone(160, 0.08, 'triangle', 0.4, 90); },
  hurt() { tone(150, 0.22, 'sawtooth', 0.35, 80); },
  growl() { tone(85, 0.5, 'sawtooth', 0.28, 55); },
  cook() { noiseBurst(0.35, 0.18, 500); },
  sleep() { tone(520, 0.4, 'sine', 0.22, 260); },
  die() { tone(220, 0.9, 'sawtooth', 0.3, 50); },
};
