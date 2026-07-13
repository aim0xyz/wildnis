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

// Weicher Geräuschimpuls mit kurzer Einblendung – vermeidet die harten Klicks
// der bisherigen Schrittgeräusche und erlaubt unterschiedliche Bodenfarben.
function softNoise(dur, vol, filterType, filterFreq, q = 0.7) {
  if (sfx.muted) return;
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = c.createGain();
  const now = c.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + Math.min(0.025, dur * 0.22));
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(now);
  src.stop(now + dur + 0.02);
}

// ---- Ambient-Klanglandschaft (Regen als Dauerschleife) ----
let amb = null; // { master, rainGain, rainDropGain, windGain, windFilter }

function longNoise(c, seconds = 2) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function ensureAmbient() {
  if (amb) return amb;
  const c = ac();
  const nb = longNoise(c, 2);

  const master = c.createGain();
  master.gain.value = sfx.muted ? 0 : 1;
  master.connect(c.destination);

  // Regen: höherfrequentes Rauschen (Bandpass), Lautstärke nach Intensität
  const rain = c.createBufferSource();
  rain.buffer = nb; rain.loop = true;
  const rainFilter = c.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.value = 3200;
  rainFilter.Q.value = 0.5;
  const rainGain = c.createGain();
  rainGain.gain.value = 0.0001;
  rain.connect(rainFilter).connect(rainGain).connect(master);
  rain.start();

  // Zweite, feinere Schicht: unregelmäßige Tropfen statt reinem Dauerrauschen.
  const drops = c.createBufferSource();
  drops.buffer = nb; drops.loop = true;
  drops.playbackRate.value = 0.73;
  const dropFilter = c.createBiquadFilter();
  dropFilter.type = 'highpass';
  dropFilter.frequency.value = 4300;
  const rainDropGain = c.createGain();
  rainDropGain.gain.value = 0.0001;
  drops.connect(dropFilter).connect(rainDropGain).connect(master);
  drops.start(c.currentTime + 0.17);

  // Wind: tiefer, breitbandiger Luftstrom; Filter und Pegel folgen den Böen.
  const wind = c.createBufferSource();
  wind.buffer = longNoise(c, 3.7); wind.loop = true;
  const windFilter = c.createBiquadFilter();
  windFilter.type = 'bandpass'; windFilter.frequency.value = 520; windFilter.Q.value = 0.32;
  const windGain = c.createGain(); windGain.gain.value = 0.0001;
  wind.connect(windFilter).connect(windGain).connect(master); wind.start(c.currentTime + 0.08);

  amb = { master, rainGain, rainDropGain, windGain, windFilter };
  return amb;
}

export const sfx = {
  muted: false,
  unlock() { try { ac(); } catch { /* kein Audio verfügbar */ } },

  // Ambient starten und Pegel setzen ------------------------------------
  startAmbient() { try { ensureAmbient(); } catch { /* kein Audio */ } },
  setRain(v) {
    if (!amb) return;
    const c = ac();
    // Gesamtpegel bleibt nahezu gleich, wird aber auf Körper und Tropfen verteilt.
    amb.rainGain.gain.setTargetAtTime(Math.max(0.0001, v * 0.78), c.currentTime, 0.6);
    amb.rainDropGain.gain.setTargetAtTime(Math.max(0.0001, v * 0.24), c.currentTime, 0.45);
  },
  setWind(v) {
    if (!amb) return;
    const c = ac(), force = Math.max(0, Math.min(1.25, v));
    amb.windGain.gain.setTargetAtTime(Math.max(0.0001, force * 0.045), c.currentTime, 0.7);
    amb.windFilter.frequency.setTargetAtTime(360 + force * 620, c.currentTime, 0.8);
  },

  // Untergrundabhängige, bewusst dezente Schritte.
  footstep(surface = 'grass') {
    if (sfx.muted) return;
    if (surface === 'water') {
      softNoise(0.17 + Math.random() * 0.05, 0.095, 'bandpass', 850 + Math.random() * 350, 0.55);
      tone(105 + Math.random() * 25, 0.12, 'sine', 0.025, 72);
    } else if (surface === 'stone') {
      softNoise(0.07 + Math.random() * 0.025, 0.075, 'bandpass', 2100 + Math.random() * 700, 1.1);
      tone(185 + Math.random() * 45, 0.045, 'sine', 0.018, 135);
    } else if (surface === 'sand') {
      softNoise(0.12 + Math.random() * 0.035, 0.07, 'lowpass', 1050 + Math.random() * 250, 0.5);
    } else {
      // Gras: tiefes, luftiges Rascheln ohne harten Anschlag.
      softNoise(0.11 + Math.random() * 0.035, 0.062, 'lowpass', 720 + Math.random() * 260, 0.45);
    }
  },

  swimStroke(underwater = false) {
    if (sfx.muted) return;
    if (underwater) {
      // Gedämpfte Wasserverdrängung plus kleine aufsteigende Luftblasen.
      softNoise(0.38 + Math.random() * 0.09, 0.055, 'lowpass', 360 + Math.random() * 90, 0.5);
      const bubbles = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < bubbles; i++) {
        const f = 190 + Math.random() * 210;
        setTimeout(() => tone(f, 0.055 + Math.random() * 0.04, 'sine', 0.012, f * 1.35), 45 + i * 55 + Math.random() * 35);
      }
    } else {
      // Breites Platschen, darunter der dumpfe Schub des Schwimmzugs.
      softNoise(0.24 + Math.random() * 0.07, 0.082, 'bandpass', 1050 + Math.random() * 380, 0.6);
      softNoise(0.34 + Math.random() * 0.06, 0.045, 'lowpass', 310 + Math.random() * 100, 0.55);
      setTimeout(() => softNoise(0.11, 0.032, 'highpass', 2300 + Math.random() * 800, 0.5), 35);
      tone(74 + Math.random() * 14, 0.2, 'sine', 0.016, 48);
    }
  },

  // Kurzes Vogelzwitschern (ein paar schnelle, gleitende Sinustöne)
  birdChirp() {
    if (sfx.muted) return;
    const c = ac(), start = c.currentTime, base = 1850 + Math.random() * 900;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i=0;i<notes;i++) {
      const at=start+i*(0.11+Math.random()*0.055), dur=0.095+Math.random()*0.055;
      const o=c.createOscillator(), g=c.createGain(); o.type='sine';
      const from=base*(0.82+Math.random()*.2), peak=base*(1.15+Math.random()*.32);
      o.frequency.setValueAtTime(from,at);o.frequency.exponentialRampToValueAtTime(peak,at+dur*.42);o.frequency.exponentialRampToValueAtTime(from*.9,at+dur);
      g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.027,at+.018);g.gain.exponentialRampToValueAtTime(.0001,at+dur);
      o.connect(g).connect(c.destination);o.start(at);o.stop(at+dur+.02);
    }
  },

  // Donnergrollen: tiefes gefiltertes Rauschen + Sub-Ton, Länge/Wucht nach Nähe
  thunder(intensity = 1) {
    if (sfx.muted) return;
    const c = ac();
    const near = Math.max(0.15, Math.min(1, intensity));
    const now = c.currentTime;
    const master = c.createGain();
    master.gain.value = 0.72;
    master.connect(c.destination);

    // Naher Einschlag: sehr kurzer, trockener Luftknall ohne Synthesizer-Ton.
    if (near > 0.48) {
      const crack = c.createBufferSource();
      crack.buffer = longNoise(c, 0.32);
      const hp = c.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 650;
      const cg = c.createGain();
      cg.gain.setValueAtTime(0.0001, now);
      cg.gain.exponentialRampToValueAtTime(0.22 + near * 0.34, now + 0.006);
      cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.16 + near * 0.08);
      crack.connect(hp).connect(cg).connect(master);
      crack.start(now); crack.stop(now + 0.34);
    }

    // Mehrere unterschiedlich lange Druckwellen erzeugen das rollende Donnern.
    const waves = 3 + Math.floor(near * 3);
    for (let i = 0; i < waves; i++) {
      const delay = 0.08 + i * (0.19 + Math.random() * 0.18);
      const dur = 1.5 + Math.random() * 1.8 + (1 - near) * 1.2;
      const src = c.createBufferSource();
      src.buffer = longNoise(c, dur + 0.2);
      const low = c.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.setValueAtTime(260 + near * 260, now + delay);
      low.frequency.exponentialRampToValueAtTime(55 + Math.random() * 35, now + delay + dur);
      const g = c.createGain();
      const peak = (0.075 + Math.random() * 0.075) * (0.6 + near * 0.8) / Math.sqrt(i + 1);
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.exponentialRampToValueAtTime(peak, now + delay + 0.06 + Math.random() * 0.13);
      g.gain.setValueAtTime(peak * (0.65 + Math.random() * 0.2), now + delay + dur * 0.34);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);
      src.connect(low).connect(g).connect(master);
      src.start(now + delay); src.stop(now + delay + dur + 0.05);
    }
  },

  setMuted(m) {
    sfx.muted = m;
    if (amb) {
      const c = ac();
      amb.master.gain.setTargetAtTime(m ? 0 : 1, c.currentTime, 0.15);
    }
  },

  chop() { noiseBurst(0.09, 0.5, 900); tone(120, 0.09, 'triangle', 0.5, 70); },
  stone() { noiseBurst(0.06, 0.5, 2400); tone(220, 0.05, 'square', 0.25, 150); },
  pickup() { tone(660, 0.07, 'sine', 0.3, 990); },
  eat() { tone(300, 0.06, 'triangle', 0.35, 200); setTimeout(() => tone(260, 0.06, 'triangle', 0.3, 180), 90); },
  // UI-Bestätigung bewusst leise halten, damit wiederholtes Craften nicht hervorsticht.
  craft() { tone(440, 0.08, 'square', 0.07); setTimeout(() => tone(660, 0.1, 'square', 0.065), 100); },
  place() { tone(180, 0.12, 'triangle', 0.4, 110); },
  attack() { noiseBurst(0.05, 0.2, 1400); },
  hit() { noiseBurst(0.07, 0.4, 700); tone(160, 0.08, 'triangle', 0.4, 90); },
  hurt() { tone(150, 0.22, 'sawtooth', 0.35, 80); },
  growl() { tone(85, 0.5, 'sawtooth', 0.28, 55); },
  boarSnort() { softNoise(0.28, 0.16, 'lowpass', 480, 0.8); setTimeout(() => tone(115, .16, 'triangle', .08, 75), 45); },
  bearRoar() { softNoise(0.7, 0.24, 'lowpass', 360, 1.1); tone(72, .75, 'sawtooth', .16, 43); },
  cook() { noiseBurst(0.35, 0.18, 500); },
  sleep() { tone(520, 0.4, 'sine', 0.22, 260); },
  die() { tone(220, 0.9, 'sawtooth', 0.3, 50); },
};
