import { icon as svgIcon } from './icons.js';

// Touch-Steuerung: virtueller Joystick (links), Wisch-Kamera (rechts),
// Action-/Sprung-/Interaktions-Buttons. Nutzt Pointer-Events (Multi-Touch via pointerId).

const JOY_R = 52; // Joystick-Radius in px
const JOY_DEADZONE = 0.12;

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
    this.actionPid = null;
    this.actionLast = { x: 0, y: 0 };
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
        this.moveCenter.x = Math.min(innerWidth * 0.38, Math.max(68, e.clientX));
        this.moveCenter.y = Math.min(innerHeight - 68, Math.max(100, e.clientY));
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
        const raw = cl / JOY_R;
        const strength = raw <= JOY_DEADZONE ? 0 : (raw - JOY_DEADZONE) / (1 - JOY_DEADZONE);
        this.vec.x = len ? (dx / cl) * strength : 0;
        this.vec.y = len ? (-dy / cl) * strength : 0;
        this.sprint = raw > 0.88;
      } else if (e.pointerId === this.lookPid) {
        if (this.player.canLook && !this.player.canLook()) return;
        const dx = e.clientX - this.lookLast.x;
        const dy = e.clientY - this.lookLast.y;
        this.lookLast.x = e.clientX;
        this.lookLast.y = e.clientY;
        this.look(this.clampDelta(dx), this.clampDelta(dy));
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
        onDown(e);
      });
      const up = () => {
        el.classList.remove('pressed');
        if (onUp) onUp();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };

    bind(this.btnAction, (e) => {
      this.actionPid = e.pointerId;
      this.actionLast.x = e.clientX;
      this.actionLast.y = e.clientY;
      this.actions.primary();
      clearInterval(this.repeatTimer);
      this.repeatTimer = setInterval(() => this.actions.primary(), 480);
    }, () => {
      this.actionPid = null;
      clearInterval(this.repeatTimer);
    });

    this.btnAction.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.actionPid) return;
      const dx = this.clampDelta(e.clientX - this.actionLast.x);
      const dy = this.clampDelta(e.clientY - this.actionLast.y);
      this.actionLast.x = e.clientX;
      this.actionLast.y = e.clientY;
      this.look(dx, dy);
    });

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

  clampDelta(v) {
    return Math.max(-32, Math.min(32, v));
  }

  look(dx, dy) {
    if (this.player.canLook && !this.player.canLook()) return;
    this.player.yaw -= dx * 0.0037;
    this.player.pitch = Math.max(-1.45, Math.min(1.45, this.player.pitch - dy * 0.0037));
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
      this.actionPid = null;
      this.player.keys.Space = false;
    }
  }

  setActionIcon(icon) {
    if (this.enabled && this.btnAction.dataset.currentIcon !== icon) {
      this.btnAction.dataset.currentIcon = icon;
      this.btnAction.innerHTML = svgIcon(icon);
    }
  }

  setInteract(icon) {
    if (!this.enabled) return;
    this.btnInteract.classList.toggle('hidden', !icon);
    if (icon && this.btnInteract.dataset.currentIcon !== icon) {
      this.btnInteract.dataset.currentIcon = icon;
      this.btnInteract.innerHTML = svgIcon(icon);
    }
  }

  setRotateVisible(v) {
    if (this.enabled) this.btnRotate.classList.toggle('hidden', !v);
  }
}
