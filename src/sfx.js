// Winzige WebAudio-Soundeffekte (synthetisiert, keine Dateien)

let ctx = null;
let noiseBuf = null;
let lastUiSound = 0;
let lastChaseSound = 0;
let lastWallScratch = 0;

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

function uiReady(gap = 35) {
  if (sfx.muted || !ctx || ctx.state !== 'running') return false;
  const now = performance.now();
  if (now - lastUiSound < gap) return false;
  lastUiSound = now;
  return true;
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

  // Reifenrollen mit leisem mechanischem Rattern; unebener Boden klingt rauer.
  bikeRoll(intensity = 0.5, rough = false) {
    if (sfx.muted) return;
    const force = Math.max(0.1, Math.min(1, intensity));
    softNoise(0.12 + force * 0.08, 0.018 + force * 0.032, 'bandpass', (rough ? 1450 : 820) + force * 520, rough ? 1.1 : 0.65);
    tone(92 + force * 38 + Math.random() * 8, 0.055, 'triangle', 0.008 + force * 0.009, 75 + force * 20);
    if (rough && Math.random() < .45) softNoise(0.045, 0.014 + force * 0.012, 'highpass', 2400, 1.2);
  },

  wallScratch(intensity=1) {
    if(sfx.muted)return;
    const now=performance.now();
    if(now-lastWallScratch<130)return;
    lastWallScratch=now;
    const force=Math.max(.15,Math.min(1,intensity));
    // Mehrere kurze, trockene Schabimpulse lesen sich als Krallen auf Holz.
    for(let i=0;i<3;i++)setTimeout(()=>{
      softNoise(.1+Math.random()*.055,.025+force*.045,'bandpass',1050+Math.random()*650,1.35);
      tone(135+Math.random()*35,.07,'sawtooth',.008+force*.012,92);
    },i*78+Math.random()*22);
  },

  wallBreak(intensity=1) {
    if(sfx.muted)return;
    const force=Math.max(.2,Math.min(1,intensity));
    // Tiefer Balkenbruch, breites Splittern und zwei nachfallende Holzteile.
    softNoise(.7,.09+force*.14,'lowpass',470,1.1);
    softNoise(.38,.055+force*.09,'highpass',1450,.8);
    tone(92,.48,'sawtooth',.045+force*.055,42);
    setTimeout(()=>softNoise(.2,.04+force*.06,'bandpass',720,1.2),120);
    setTimeout(()=>tone(68,.24,'triangle',.035+force*.035,39),210);
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

  // Kurze, materialartige UI-Sounds: gedämpft und trocken, damit Menüs wie
  // echte Ausrüstung reagieren, ohne nach Arcade-Spiel zu klingen.
  uiHover() {
    if (!uiReady(55)) return;
    tone(760, .026, 'sine', .012, 650);
  },
  uiMove() {
    if (!uiReady(42)) return;
    tone(285, .038, 'triangle', .026, 390);
    tone(930, .024, 'sine', .009, 780);
  },
  uiOpen() {
    if (!uiReady(90)) return;
    softNoise(.075, .025, 'bandpass', 1250, .8);
    tone(112, .13, 'triangle', .035, 148);
    setTimeout(() => tone(224, .055, 'sine', .018, 270), 42);
  },
  uiClose() {
    if (!uiReady(75)) return;
    softNoise(.06, .018, 'lowpass', 850, .6);
    tone(190, .085, 'triangle', .025, 112);
  },
  uiConfirm() {
    if (!uiReady(45)) return;
    softNoise(.035, .02, 'bandpass', 1800, 1.1);
    tone(410, .052, 'triangle', .025, 510);
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
  resourceBreak(kind = 'tree') {
    if (kind === 'rock') {
      noiseBurst(.18, .46, 1850);
      tone(145, .18, 'triangle', .22, 62);
      setTimeout(() => noiseBurst(.11, .2, 1100), 55);
    } else {
      noiseBurst(.16, .44, 620);
      tone(92, .24, 'triangle', .28, 42);
      setTimeout(() => noiseBurst(.09, .19, 430), 70);
    }
  },
  killConfirm() {
    tone(210, .07, 'triangle', .15, 155);
    setTimeout(() => tone(420, .11, 'sine', .12, 540), 48);
  },
  revive() {
    softNoise(.18, .045, 'lowpass', 520, .55);
    tone(260, .12, 'sine', .08, 390);
    setTimeout(() => tone(520, .16, 'sine', .075, 780), 105);
  },
  exhausted() {
    softNoise(.22, .055, 'lowpass', 360, .55);
    tone(112, .22, 'triangle', .06, 72);
  },
  trackingCue() {
    tone(390, .07, 'sine', .075, 510);
    setTimeout(() => tone(585, .08, 'sine', .065, 720), 72);
    setTimeout(() => tone(780, .11, 'sine', .055, 650), 152);
  },
  beaconLit() {
    softNoise(.38, .11, 'lowpass', 620, .55);
    tone(145, .2, 'triangle', .11, 92);
    setTimeout(() => tone(440, .14, 'sine', .09, 660), 110);
    setTimeout(() => tone(880, .22, 'sine', .07, 720), 245);
  },
  caveCache() {
    softNoise(.14, .07, 'bandpass', 980, .65);
    tone(245, .09, 'triangle', .08, 360);
    setTimeout(() => tone(490, .12, 'sine', .085, 735), 85);
    setTimeout(() => tone(735, .18, 'sine', .065, 980), 190);
  },
  hurt() { tone(150, 0.22, 'sawtooth', 0.35, 80); },
  // Weiter Wolfsruf mit natürlichem Anstieg, leichtem Vibrato, Atemanteil und
  // einem schwachen Geländeecho. Wird vom Ambient-System ausschließlich nachts
  // und mit großen Abständen zwischen den Rufen ausgelöst.
  wolfHowl() {
    if (sfx.muted) return;
    const c = ac(), start = c.currentTime;
    const master = c.createGain(); master.gain.value = .8; master.connect(c.destination);

    const makeVoice = (at, base, volume, pan) => {
      const voice = c.createGain();
      const panner = typeof c.createStereoPanner === 'function' ? c.createStereoPanner() : null;
      if (panner) { panner.pan.value = pan; voice.connect(panner).connect(master); }
      else voice.connect(master);

      // Leises Echo lässt den Ruf aus der Landschaft und nicht aus der UI kommen.
      const delay = c.createDelay(1); delay.delayTime.value = .29;
      const feedback = c.createGain(); feedback.gain.value = .12;
      const wet = c.createGain(); wet.gain.value = .18;
      voice.connect(delay); delay.connect(feedback).connect(delay); delay.connect(wet).connect(master);

      const body = c.createOscillator(), bodyFilter = c.createBiquadFilter(), bodyGain = c.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(base * .72, at);
      body.frequency.exponentialRampToValueAtTime(base, at + .72);
      body.frequency.exponentialRampToValueAtTime(base * .96, at + 2.15);
      body.frequency.exponentialRampToValueAtTime(base * .79, at + 3.55);
      bodyFilter.type = 'bandpass'; bodyFilter.frequency.value = 520; bodyFilter.Q.value = .72;
      bodyGain.gain.setValueAtTime(.0001, at);
      bodyGain.gain.exponentialRampToValueAtTime(volume, at + .24);
      bodyGain.gain.setValueAtTime(volume * .92, at + 1.8);
      bodyGain.gain.exponentialRampToValueAtTime(.0001, at + 3.65);
      body.connect(bodyFilter).connect(bodyGain).connect(voice);

      // Schwache Oberstimme erzeugt den vokalen, nicht rein sinusförmigen Klang.
      const overtone = c.createOscillator(), overtoneFilter = c.createBiquadFilter(), overtoneGain = c.createGain();
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(base * 1.48, at);
      overtone.frequency.exponentialRampToValueAtTime(base * 2.02, at + .75);
      overtone.frequency.exponentialRampToValueAtTime(base * 1.62, at + 3.45);
      overtoneFilter.type = 'bandpass'; overtoneFilter.frequency.value = 920; overtoneFilter.Q.value = 1.05;
      overtoneGain.gain.setValueAtTime(.0001, at);
      overtoneGain.gain.exponentialRampToValueAtTime(volume * .24, at + .38);
      overtoneGain.gain.exponentialRampToValueAtTime(.0001, at + 3.5);
      overtone.connect(overtoneFilter).connect(overtoneGain).connect(voice);

      const vibrato = c.createOscillator(), vibratoDepth = c.createGain();
      vibrato.type = 'sine'; vibrato.frequency.value = 5.15; vibratoDepth.gain.value = 5.2;
      vibrato.connect(vibratoDepth); vibratoDepth.connect(body.frequency); vibratoDepth.connect(overtone.frequency);

      const breath = c.createBufferSource(), breathFilter = c.createBiquadFilter(), breathGain = c.createGain();
      breath.buffer = longNoise(c, 3.8);
      breathFilter.type = 'bandpass'; breathFilter.frequency.value = 760; breathFilter.Q.value = .45;
      breathGain.gain.setValueAtTime(.0001, at);
      breathGain.gain.exponentialRampToValueAtTime(volume * .12, at + .28);
      breathGain.gain.exponentialRampToValueAtTime(.0001, at + 3.5);
      breath.connect(breathFilter).connect(breathGain).connect(voice);

      body.start(at); overtone.start(at); vibrato.start(at); breath.start(at);
      body.stop(at + 3.7); overtone.stop(at + 3.62); vibrato.stop(at + 3.72); breath.stop(at + 3.7);
    };

    const side = Math.random() < .5 ? -1 : 1;
    makeVoice(start, 335 + Math.random() * 45, .075, side * (.38 + Math.random() * .32));
    // Nicht jeder Ruf erhält eine Antwort – dadurch bleibt das Ereignis selten.
    if (Math.random() < .48) makeVoice(start + 2.05 + Math.random() * .35, 295 + Math.random() * 38, .041, -side * (.5 + Math.random() * .25));
  },
  owlHoot() {
    if (sfx.muted) return;
    const c = ac(), start = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const at = start + i * .58, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(315 - i * 18, at); o.frequency.exponentialRampToValueAtTime(235 - i * 12, at + .42);
      f.type = 'lowpass'; f.frequency.value = 720;
      g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.035, at + .06); g.gain.exponentialRampToValueAtTime(.0001, at + .46);
      o.connect(f).connect(g).connect(c.destination); o.start(at); o.stop(at + .48);
    }
  },
  insectChirp() {
    if (sfx.muted) return;
    const c = ac(), start = c.currentTime, base = 3400 + Math.random() * 800;
    for (let i = 0; i < 4; i++) {
      const at = start + i * .052, o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(base, at); o.frequency.exponentialRampToValueAtTime(base * .9, at + .035);
      g.gain.setValueAtTime(.0001, at); g.gain.exponentialRampToValueAtTime(.011, at + .006); g.gain.exponentialRampToValueAtTime(.0001, at + .04);
      o.connect(g).connect(c.destination); o.start(at); o.stop(at + .045);
    }
  },
  frogCroak() {
    if (sfx.muted) return;
    const c = ac(), now = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(155, now); o.frequency.exponentialRampToValueAtTime(92, now + .24);
    f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 1.2;
    g.gain.setValueAtTime(.0001, now); g.gain.exponentialRampToValueAtTime(.045, now + .045); g.gain.exponentialRampToValueAtTime(.0001, now + .3);
    o.connect(f).connect(g).connect(c.destination); o.start(now); o.stop(now + .32);
  },
  // Atmosphärischer Nacht-Stinger: tiefer Fell-/Trommelimpuls mit einem
  // gedämpften Hornkörper statt des früheren harten Sägezahn-Fehlertons.
  dangerCue(intensity = .75) {
    if (sfx.muted) return;
    const c = ac(), now = c.currentTime;
    const power = Math.max(.45, Math.min(1.1, intensity));
    const master = c.createGain();
    master.gain.value = .82;
    master.connect(c.destination);

    const impact = c.createOscillator(), impactGain = c.createGain();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(72, now);
    impact.frequency.exponentialRampToValueAtTime(42, now + .82);
    impactGain.gain.setValueAtTime(.0001, now);
    impactGain.gain.exponentialRampToValueAtTime(.15 * power, now + .018);
    impactGain.gain.exponentialRampToValueAtTime(.0001, now + .86);
    impact.connect(impactGain).connect(master);
    impact.start(now); impact.stop(now + .9);

    const horn = c.createOscillator(), hornFilter = c.createBiquadFilter(), hornGain = c.createGain();
    horn.type = 'triangle';
    horn.frequency.setValueAtTime(112, now + .035);
    horn.frequency.exponentialRampToValueAtTime(78, now + 1.18);
    hornFilter.type = 'lowpass'; hornFilter.frequency.value = 310; hornFilter.Q.value = .7;
    hornGain.gain.setValueAtTime(.0001, now);
    hornGain.gain.exponentialRampToValueAtTime(.052 * power, now + .11);
    hornGain.gain.setValueAtTime(.044 * power, now + .42);
    hornGain.gain.exponentialRampToValueAtTime(.0001, now + 1.22);
    horn.connect(hornFilter).connect(hornGain).connect(master);
    horn.start(now); horn.stop(now + 1.26);

    const breath = c.createBufferSource(), breathFilter = c.createBiquadFilter(), breathGain = c.createGain();
    breath.buffer = longNoise(c, 1.45);
    breathFilter.type = 'lowpass'; breathFilter.frequency.value = 260; breathFilter.Q.value = .8;
    breathGain.gain.setValueAtTime(.0001, now);
    breathGain.gain.exponentialRampToValueAtTime(.038 * power, now + .09);
    breathGain.gain.exponentialRampToValueAtTime(.0001, now + 1.35);
    breath.connect(breathFilter).connect(breathGain).connect(master);
    breath.start(now); breath.stop(now + 1.4);
  },
  // Unmittelbare Warnung, sobald ein Raubtier die Verfolgung aufnimmt. Der
  // kurze Gefahrspuls ist auch dann hörbar, wenn das Tier hinter dem Spieler
  // steht; das Stereo-Panning verrät zusätzlich grob seine Richtung.
  chaseAlert(kind = 'wolf', pan = 0) {
    if (sfx.muted) return false;
    const stamp = performance.now();
    // Ein Rudel darf den Cue nicht für jedes einzelne Tier stapeln.
    if (stamp - lastChaseSound < 2800) return false;
    lastChaseSound = stamp;
    const c = ac(), now = c.currentTime;
    const master = c.createGain();
    master.gain.value = .9;
    const panner = typeof c.createStereoPanner === 'function' ? c.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-.85, Math.min(.85, Number(pan) || 0));
      master.connect(panner).connect(c.destination);
    } else master.connect(c.destination);

    // Zwei schnelle, tiefe Pulse – klar als Gefahr lesbar, aber kein UI-Piep.
    for (let i = 0; i < 2; i++) {
      const at = now + i * .22;
      const pulse = c.createOscillator(), gain = c.createGain();
      pulse.type = 'sine';
      pulse.frequency.setValueAtTime(82 - i * 8, at);
      pulse.frequency.exponentialRampToValueAtTime(46, at + .2);
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(.13 - i * .02, at + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, at + .21);
      pulse.connect(gain).connect(master); pulse.start(at); pulse.stop(at + .23);
    }
    const rush = c.createBufferSource(), filter = c.createBiquadFilter(), rushGain = c.createGain();
    rush.buffer = longNoise(c, .55); filter.type = 'bandpass'; filter.frequency.value = 720; filter.Q.value = .7;
    rushGain.gain.setValueAtTime(.0001, now);
    rushGain.gain.exponentialRampToValueAtTime(.065, now + .055);
    rushGain.gain.exponentialRampToValueAtTime(.0001, now + .52);
    rush.connect(filter).connect(rushGain).connect(master); rush.start(now); rush.stop(now + .55);

    // Der Tierlaut folgt leicht versetzt auf den universellen Warnimpuls.
    setTimeout(() => {
      if (kind === 'baer') sfx.bearRoar();
      else if (kind === 'wildschwein') sfx.boarSnort();
      else sfx.growl();
    }, 90);
    return true;
  },
  // Tierknurren bleibt räumlich/organisch und wird nur bei tatsächlicher Nähe
  // eines Wolfs verwendet.
  growl() {
    if (sfx.muted) return;
    const c = ac(), now = c.currentTime;
    const src = c.createBufferSource(); src.buffer = longNoise(c, .62);
    const filter = c.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 165; filter.Q.value = 1.15;
    const gain = c.createGain();
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.11, now + .07);
    gain.gain.setValueAtTime(.085, now + .3);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .6);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(now); src.stop(now + .62);
    tone(68, .48, 'triangle', .045, 52);
  },
  boarSnort() { softNoise(0.28, 0.16, 'lowpass', 480, 0.8); setTimeout(() => tone(115, .16, 'triangle', .08, 75), 45); },
  bearRoar() { softNoise(0.7, 0.24, 'lowpass', 360, 1.1); tone(72, .75, 'sawtooth', .16, 43); },
  cook() { noiseBurst(0.35, 0.18, 500); },
  sleep() { tone(520, 0.4, 'sine', 0.22, 260); },
  die() { tone(220, 0.9, 'sawtooth', 0.3, 50); },
};
