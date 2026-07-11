// Touch-Steuerung: virtueller Joystick (links), Wisch-Kamera (rechts),
// Action-/Sprung-/Interaktions-Buttons. Nutzt Pointer-Events (Multi-Touch via pointerId).

const JOY_R = 52; // Joystick-Radius in px

export class TouchControls {
  constructor(canvas, player, actions) {
    this.forced = location.search.includes('touch=1');
    this.enabled = this.forced || matchMedia('(pointer: coarse), (hover: none)').matches;
    this.player = player;
    this.actions = actions;
    this.vec = { x: 0, y: 0 }; // Bewegung: x = seitlich, y = vor/zurück
    this.sprint = false;
    this.movePid = null;
    this.lookPid = null;
    this.moveCenter = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };
    this.repeatTimer = null;
    if (!this.enabled) return;

    document.body.classList.add('touch');
    this.ui = document.getElementById('touchUI');
    this.joy = document.getElementById('joystick');
    this.knob = document.getElementById('joyKnob');
    this.btnAction = document.getElementById('btnAction');
    this.btnInteract = document.getElementById('btnInteract');
    this.btnJump = document.getElementById('btnJump');
    this.btnRotate = document.getElementById('btnRotate');

    this.bindCanvas(canvas);
    this.bindButtons();
  }

  bindCanvas(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && !this.forced) return;
      e.preventDefault(); // verhindert synthetische Maus-Events (Doppel-Aktionen)
      canvas.setPointerCapture(e.pointerId);
      if (this.movePid === null && e.clientX < innerWidth * 0.45) {
        this.movePid = e.pointerId;
        this.moveCenter.x = Math.max(75, e.clientX);
        this.moveCenter.y = Math.min(innerHeight - 80, Math.max(90, e.clientY));
        this.joy.style.left = this.moveCenter.x + 'px';
        this.joy.style.top = this.moveCenter.y + 'px';
        this.joy.classList.add('active');
        this.setKnob(0, 0);
      } else if (this.lookPid === null) {
        this.lookPid = e.pointerId;
        this.lookLast.x = e.clientX;
        this.lookLast.y = e.clientY;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.movePid) {
        let dx = e.clientX - this.moveCenter.x;
        let dy = e.clientY - this.moveCenter.y;
        const len = Math.hypot(dx, dy);
        const cl = Math.min(len, JOY_R);
        if (len > 0) { dx = (dx / len) * cl; dy = (dy / len) * cl; }
        this.setKnob(dx, dy);
        this.vec.x = dx / JOY_R;
        this.vec.y = -dy / JOY_R;
        this.sprint = cl / JOY_R > 0.92;
      } else if (e.pointerId === this.lookPid) {
        if (this.player.canLook && !this.player.canLook()) return;
        const dx = e.clientX - this.lookLast.x;
        const dy = e.clientY - this.lookLast.y;
        this.lookLast.x = e.clientX;
        this.lookLast.y = e.clientY;
        this.player.yaw -= dx * 0.0045;
        this.player.pitch = Math.max(-1.5, Math.min(1.5, this.player.pitch - dy * 0.0045));
      }
    });

    const end = (e) => {
      if (e.pointerId === this.movePid) this.resetMove();
      if (e.pointerId === this.lookPid) this.lookPid = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  bindButtons() {
    const bind = (el, onDown, onUp) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        el.classList.add('pressed');
        onDown();
      });
      const up = () => {
        el.classList.remove('pressed');
        if (onUp) onUp();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };

    bind(this.btnAction, () => {
      this.actions.primary();
      clearInterval(this.repeatTimer);
      this.repeatTimer = setInterval(() => this.actions.primary(), 480);
    }, () => clearInterval(this.repeatTimer));

    bind(this.btnJump,
      () => { this.player.keys.Space = true; },
      () => { this.player.keys.Space = false; });

    bind(this.btnInteract, () => this.actions.interact());
    bind(this.btnRotate, () => this.actions.rotate());
    bind(document.getElementById('btnCraftM'), () => this.actions.toggleCraft());
    bind(document.getElementById('btnPauseM'), () => this.actions.pause());
  }

  setKnob(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  resetMove() {
    this.movePid = null;
    this.vec.x = 0;
    this.vec.y = 0;
    this.sprint = false;
    this.joy.classList.remove('active');
  }

  show(on) {
    if (!this.enabled) return;
    this.ui.classList.toggle('hidden', !on);
    if (!on) {
      this.resetMove();
      this.lookPid = null;
      clearInterval(this.repeatTimer);
      this.player.keys.Space = false;
    }
  }

  setActionIcon(icon) {
    if (this.enabled && this.btnAction.textContent !== icon) this.btnAction.textContent = icon;
  }

  setInteract(icon) {
    if (!this.enabled) return;
    this.btnInteract.classList.toggle('hidden', !icon);
    if (icon && this.btnInteract.textContent !== icon) this.btnInteract.textContent = icon;
  }

  setRotateVisible(v) {
    if (this.enabled) this.btnRotate.classList.toggle('hidden', !v);
  }
}
