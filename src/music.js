// Intro-Musik: bewusst als separate Datei laden. Dadurch kann der Browser die
// große MP3 cachen und die eigentliche Spiel-HTML bleibt klein.
const introUrl = './music/Intro.mp3';

export class Music {
  constructor(maxVol = 0.18) {
    this.audio = null;
    this.maxVol = maxVol;
    this.target = 0;       // Zielpegel (0 = aus)
    this.timer = null;
    this.lastT = 0;
    this.fadeSeam = 1.4;   // Sekunden Ein-/Ausblendung an Loop-Naht
    this.rate = 0.7;       // Fade-Geschwindigkeit (Pegel pro Sekunde)
    this.muted = false;
    this.active = false;
  }

  _ensure() {
    if (this.audio) return;
    this.audio = new Audio(introUrl);
    this.audio.loop = true;
    this.audio.volume = 0;
    this.audio.preload = 'auto';
  }

  play() {
    this._ensure();
    this.active = true;
    this.target = this.muted ? 0 : this.maxVol;
    const p = this.audio.play();
    if (p && p.catch) p.catch(() => { /* Autoplay evtl. blockiert – startet beim nächsten Gesten-Aufruf */ });
    this._startFade();
  }

  stop() {
    this.active = false;
    this.target = 0;
    this._startFade();
  }

  setMuted(m) {
    this.muted = m;
    this.target = !m && this.active ? this.maxVol : 0;
    if (!m && this.active && this.audio?.paused) {
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => {});
    }
    this._startFade();
  }

  _startFade() {
    if (!this.audio) return;
    // Timer statt requestAnimationFrame: Browser pausieren RAF, sobald der Tab
    // nicht sichtbar/fokussiert ist – dann bliebe die Lautstärke bei 0 stehen
    // und die Musik wäre stumm, obwohl der Track läuft. setInterval läuft weiter.
    clearInterval(this.timer);
    this.lastT = performance.now();
    const step = () => {
      if (!this.audio) return;
      const now = performance.now();
      const dt = Math.min((now - this.lastT) / 1000, 0.1);
      this.lastT = now;

      // Nur am Loop-Ende ausblenden. Der Track startet direkt; ein zusätzlicher
      // Anfangs-Fade ließ die Intro-Musik unnötig verspätet einsetzen.
      let seam = 1;
      const d = this.audio.duration;
      if (d && isFinite(d)) {
        const ct = this.audio.currentTime;
        const rem = d - ct;
        if (rem < this.fadeSeam) seam = Math.max(0, rem / this.fadeSeam);
      }
      const goal = this.target * seam;
      const diff = goal - this.audio.volume;
      const move = Math.sign(diff) * Math.min(Math.abs(diff), this.rate * dt);
      this.audio.volume = Math.max(0, Math.min(1, this.audio.volume + move));

      if (this.target === 0 && this.audio.volume <= 0.002) {
        this.audio.pause();
        clearInterval(this.timer);
        this.timer = null;
      }
    };
    this.timer = setInterval(step, 40);
    step();
  }
}
