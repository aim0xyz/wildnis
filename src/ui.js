import { ITEMS, RECIPES } from './items.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    hydrateIcons();
    this.hud = $('hud');
    this.hpFill = $('hpFill');
    this.hungerFill = $('hungerFill');
    this.oxygenFill = $('oxygenFill');
    this.oxygenBar = $('oxygenBar');
    this.dayLabel = $('dayLabel');
    this.timeIcon = $('timeIcon');
    this.matPanel = $('matPanel');
    this.objectivePanel = $('objectivePanel');
    this.objectiveText = $('objectiveText');
    this.objectiveIcon = $('objectiveIcon');
    this.hotbarEl = $('hotbar');
    this.toasts = $('toasts');
    this.promptEl = $('prompt');
    this.targetEl = $('targetName');
    this.craftEl = $('craft');
    this.recipeList = $('recipeList');
    this.invGrid = $('invGrid');
    this.overlay = $('overlay');
    this.ovTitle = $('ovTitle');
    this.ovSub = $('ovSub');
    this.ovControls = $('ovControls');
    this.btnPlay = $('btnPlay');
    this.btnNew = $('btnNew');
    this.vignette = $('vignette');
    this.sleepFade = $('sleepFade');
    this.selName = $('selName');
    this._selNameTimer = null;
    this.onCraft = null;
    this.onSelectSlot = null;
  }

  showHud(show) {
    this.hud.classList.toggle('hidden', !show);
  }

  setBars(hp, hunger, starving, oxygen = 100, showOxygen = false) {
    this.hpFill.style.width = `${hp}%`;
    this.hungerFill.style.width = `${hunger}%`;
    this.hungerFill.parentElement.classList.toggle('warn', starving);
    this.oxygenFill.style.width = `${oxygen}%`;
    this.oxygenBar.classList.toggle('hidden', !showOxygen);
  }

  setClock(day, elevation) {
    this.dayLabel.textContent = `Tag ${day}`;
    this.timeIcon.innerHTML = icon(elevation > 0.15 ? 'sun' : elevation > -0.02 ? 'sunset' : 'moon');
  }

  setMaterials(inv) {
    const mats = ['holz', 'stein', 'fell'];
    this.matPanel.innerHTML = mats
      .map((id) => `<div class="mat"><span>${icon(ITEMS[id].icon)}</span><b>${inv[id] || 0}</b></div>`)
      .join('');
  }

  setObjective(text, iconName = 'sprout', done = false) {
    this.objectiveText.textContent = text;
    this.objectiveIcon.innerHTML = icon(iconName);
    this.objectivePanel.classList.toggle('done', done);
  }

  renderHotbar(hotbar, idx, inv) {
    this.hotbarEl.innerHTML = hotbar
      .map((id, i) => {
        const def = ITEMS[id];
        const count = def.type === 'material' || def.type === 'food' || def.type === 'placeable'
          ? `<span class="count">${inv[id] || 0}</span>` : '';
        return `<div class="slot ${i === idx ? 'sel' : ''}" data-i="${i}" title="${def.name}">
          <span class="key">${i + 1}</span><span class="itemIcon">${icon(def.icon)}</span>${count}
        </div>`;
      })
      .join('');
    for (const el of this.hotbarEl.querySelectorAll('.slot')) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onSelectSlot) this.onSelectSlot(+el.dataset.i);
      });
    }
  }

  showSelName(name) {
    this.selName.textContent = name;
    this.selName.classList.add('show');
    clearTimeout(this._selNameTimer);
    this._selNameTimer = setTimeout(() => this.selName.classList.remove('show'), 1200);
  }

  toast(text, cls = '') {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, 2800);
  }

  discovery(title, story, found, total) {
    const el = document.createElement('div');
    el.className = 'discoveryCard';
    el.innerHTML = `<small>CHRONIK DER WILDNIS · ${found}/${total}</small><strong>${title}</strong><p>${story}</p>`;
    this.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 600);
    }, 6200);
  }

  prompt(text) {
    this.promptEl.textContent = text || '';
    this.promptEl.classList.toggle('hidden', !text);
  }

  target(text) {
    this.targetEl.textContent = text || '';
  }

  damageFlash() {
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth; // Animation neu starten
    this.vignette.classList.add('flash');
  }

  sleepTransition(onDark, onDone) {
    this.sleepFade.classList.remove('closingEyes');
    void this.sleepFade.offsetWidth;
    this.sleepFade.classList.add('closingEyes');
    setTimeout(() => onDark?.(), 500);
    setTimeout(() => {
      this.sleepFade.classList.remove('closingEyes');
      onDone?.();
    }, 1150);
  }

  // ---- Crafting-Panel ----
  showCraft(show) {
    this.craftEl.classList.toggle('hidden', !show);
  }

  renderCraft(inv) {
    this.recipeList.innerHTML = RECIPES.map((r, i) => {
      const def = ITEMS[r.out];
      const owned = def.once && (inv[r.out] || 0) > 0;
      let can = !owned;
      const costHtml = Object.entries(r.cost)
        .map(([id, n]) => {
          const have = inv[id] || 0;
          if (have < n) can = false;
          return `<span class="chip ${have < n ? 'miss' : ''}">${icon(ITEMS[id].icon)}${n}</span>`;
        })
        .join('');
      return `<div class="recipe ${can ? '' : 'off'}">
        <span class="ric">${icon(def.icon)}</span>
        <div class="rmid">
          <b>${def.name}</b>
          <span class="rdesc">${r.desc}</span>
          <span class="rcost">${costHtml}</span>
        </div>
        <button data-r="${i}" ${can ? '' : 'disabled'}>${owned ? '✓ Gebaut' : 'Craften'}</button>
      </div>`;
    }).join('');

    for (const btn of this.recipeList.querySelectorAll('button[data-r]')) {
      btn.addEventListener('click', () => {
        if (this.onCraft) this.onCraft(RECIPES[+btn.dataset.r]);
      });
    }

    const entries = Object.entries(inv).filter(([, n]) => n > 0);
    this.invGrid.innerHTML = entries.length
      ? entries.map(([id, n]) => `<div class="invItem" title="${ITEMS[id].name}"><span>${icon(ITEMS[id].icon)}</span><b>${n}</b></div>`).join('')
      : '<span class="empty">Noch nichts gesammelt…</span>';
  }

  // ---- Overlay (Menü / Pause / Tod) ----
  showOverlay(kind, opts = {}) {
    if (!kind) {
      this.overlay.classList.add('hidden');
      return;
    }
    this.overlay.classList.remove('hidden');
    this.ovControls.classList.toggle('hidden', kind === 'dead');
    this.btnNew.classList.toggle('hidden', kind === 'pause');
    if (kind === 'menu') {
      this.ovTitle.innerHTML = `${icon('tent')} WILDNIS`;
      this.ovSub.textContent = 'Low-Poly Survival — Sammle, baue, überlebe die Nacht.';
      this.btnPlay.innerHTML = `${icon('play')} ${opts.hasSave ? 'Weiterspielen' : 'Spiel starten'}`;
      this.btnNew.classList.toggle('hidden', !opts.hasSave);
      this.btnNew.innerHTML = `${icon('sprout')} Neues Spiel`;
    } else if (kind === 'pause') {
      this.ovTitle.innerHTML = `${icon('pause')} Pause`;
      this.ovSub.textContent = 'Klicke auf Weiter, um zurückzukehren.';
      this.btnPlay.innerHTML = `${icon('play')} Weiter`;
    } else if (kind === 'dead') {
      this.ovTitle.innerHTML = `${icon('skull')} Du bist gestorben`;
      this.ovSub.textContent = `${opts.days} Tag${opts.days === 1 ? '' : 'e'} überlebt. ${opts.cause || ''}`;
      this.btnPlay.innerHTML = `${icon('clock')} Wiederbeleben in 5:00`;
      this.btnPlay.disabled = true;
      this.btnNew.classList.remove('hidden');
      this.btnNew.innerHTML = `${icon('sprout')} Neues Spiel`;
    }
    if (kind !== 'dead') this.btnPlay.disabled = false;
  }

  setRespawnCountdown(ms) {
    const ready = ms <= 0;
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const min = Math.floor(seconds / 60);
    const sec = String(seconds % 60).padStart(2, '0');
    this.btnPlay.disabled = !ready;
    this.btnPlay.innerHTML = ready ? `${icon('rotate')} Jetzt wiederbeleben` : `${icon('clock')} Wiederbeleben in ${min}:${sec}`;
  }
}
