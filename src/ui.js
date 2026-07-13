import { ITEMS, RECIPES } from './items.js';
import { icon, hydrateIcons } from './icons.js';
import { biomeAt, terrainHeight, WATER_Y } from './world.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    hydrateIcons();
    this.hud = $('hud');
    this.hpFill = $('hpFill');
    this.hungerFill = $('hungerFill');
    this.thirstFill = $('thirstFill');
    this.staminaFill = $('staminaFill');
    this.warmthFill = $('warmthFill');
    this.oxygenFill = $('oxygenFill');
    this.oxygenBar = $('oxygenBar');
    this.dayLabel = $('dayLabel');
    this.threatPanel = $('threatPanel');
    this.timeIcon = $('timeIcon');
    this.matPanel = $('matPanel');
    this.objectivePanel = $('objectivePanel');
    this.objectiveText = $('objectiveText');
    this.objectiveIcon = $('objectiveIcon');
    this.hotbarEl = $('hotbar');
    this.toasts = $('toasts');
    this.saveStatus = $('saveStatus');
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
    this.storageEl = $('storage');
    this.storageTitle = $('storageTitle');
    this.storagePlayer = $('storagePlayer');
    this.storageContainer = $('storageContainer');
    this.biomePanel = $('biomePanel');
    this.levelLabel = $('levelLabel');
    this.xpFill = $('xpFill');
    this.xpLabel = $('xpLabel');
    this.mapOverlay = $('mapOverlay');
    this.worldMap = $('worldMap');
    this.mapTerrain = $('mapTerrain');
    this.mapMarkers = $('mapMarkers');
    this.mapCoords = $('mapCoords');
    this.radialMenu = $('radialMenu');
    this.radialItems = $('radialItems');
    this.radialName = $('radialName');
    this._selNameTimer = null;
    this.onCraft = null;
    this.onSelectSlot = null;
    this.onStorageMove = null;
    this.capacityProvider = null;
    this.craftStation = 'hand';
    this.craftCategory = 'tools';
    this.playerLevel = 1;
    this._saveTimer = null;
  }

  showHud(show) {
    this.hud.classList.toggle('hidden', !show);
  }

  setBars(hp, hunger, starving, oxygen = 100, showOxygen = false, stamina = 100, thirst = 100, warmth = 100) {
    this.hpFill.style.width = `${hp}%`;
    this.hungerFill.style.width = `${hunger}%`;
    this.hungerFill.parentElement.classList.toggle('warn', starving);
    this.staminaFill.style.width = `${stamina}%`;
    this.staminaFill.parentElement.classList.toggle('warn', stamina < 15);
    this.thirstFill.style.width = `${thirst}%`;
    this.thirstFill.parentElement.classList.toggle('warn', thirst < 15);
    this.warmthFill.style.width = `${warmth}%`;
    this.warmthFill.parentElement.classList.toggle('warn', warmth < 18);
    this.oxygenFill.style.width = `${oxygen}%`;
    this.oxygenBar.classList.toggle('hidden', !showOxygen);
  }

  setThreat(show, level = 1, bloodMoon = false) {
    this.threatPanel.classList.toggle('hidden', !show);
    this.threatPanel.classList.toggle('blood', bloodMoon);
    if (show) this.threatPanel.textContent = bloodMoon ? `Blutnacht · Gefahr ${level}` : `Nacht · Gefahr ${level}`;
  }
  setBiome(name, compass = '') { this.biomePanel.textContent = `${name}${compass ? ` · ${compass}` : ''}`; }
  setLevel(level, xp, current, next) {
    this.playerLevel = level;
    this.levelLabel.textContent = `Level ${level}`;
    const span = Math.max(1, next - current);
    this.xpFill.style.width = `${Math.max(0, Math.min(100, (xp - current) / span * 100))}%`;
    this.xpLabel.textContent = level >= 7 ? `${xp} XP · MAX` : `${xp - current} / ${span} XP`;
  }
  showMap(show, player, landmarks = [], discovered = [], radius = 320, heading = 0, signal = null, playerLevel = 1) {
    this.mapOverlay.classList.toggle('hidden', !show); if (!show) return;
    this.drawMapTerrain(radius);
    const pos = (x, z) => `left:${50 + x / radius * 47}%;top:${50 + z / radius * 47}%`;
    const glyphs = { steinkreis: '◉', jaegerlager: '⌂', uralter_baum: '♣', kuestenwrack: '⚓', erzinsel: '◆', nordwacht: '♜', schattenhoehle: '▰', sternfall:'✦', versunkene_ruinen:'◫', ostpass:'♜', westheiligtum:'◉' };
    const found = landmarks.filter((l) => discovered.includes(l.id));
    const regions = [
      ['Grasland',0,0,1], ['Dichter Wald',90,-70,2], ['Küste',-55,235,3],
      ['Moorland',-455,305,4], ['Hochgebirge',440,-320,5], ['Äußere Wildnis',-440,20,6],
    ];
    const regionHtml = regions.map(([name,x,z,level]) => `<span class="mapRegion ${playerLevel < level ? 'locked' : ''}" style="${pos(x,z)}">${playerLevel < level ? '◇ ' : ''}${name}<small>Level ${level}</small></span>`).join('');
    this.mapMarkers.innerHTML = regionHtml + found.map((l) => `<span class="mapLandmark" style="${pos(l.x,l.z)}" title="${l.name}"><i>${glyphs[l.id] || '◆'}</i><b>${l.name.replace(/^(Der|Die|Das) /, '')}</b></span>`).join('')
      + (signal ? `<span class="mapSignal" style="${pos(signal.x,signal.z)}" title="Zeitlich begrenztes Expeditionssignal"><i></i><b>${signal.type === 'flare' ? 'Notsignal' : 'Rauchsäule'} · ${Math.ceil(signal.remaining)}s</b></span>` : '')
      + `<span class="mapPlayer" style="${pos(player.x,player.z)};--heading:${-heading}rad" title="Deine Position"><i></i></span>`;
    this.mapCoords.textContent = `X ${Math.round(player.x)} · Z ${Math.round(player.z)}`;
    $('mapLegend').innerHTML = `<span><i class="legendPlayer"></i>Du & Blickrichtung</span><span><i class="legendPlace">◆</i>Entdeckter Ort</span>${signal ? '<span><i class="legendSignal"></i>Aktives Signal</span>' : ''}<b>${found.length}/${landmarks.length} Orte entdeckt</b>`;
  }
  drawMapTerrain(radius) {
    if (this._mapTerrainRadius === radius) return;
    this._mapTerrainRadius = radius;
    const canvas = this.mapTerrain, ctx = canvas.getContext('2d');
    const { width, height } = canvas, image = ctx.createImageData(width, height);
    const colors = { coast:[202,181,119], meadow:[111,145,76], forest:[54,101,61], marsh:[91,111,75], alpine:[151,149,137] };
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const x = (px / (width - 1) * 2 - 1) * radius;
      const z = (py / (height - 1) * 2 - 1) * radius;
      const h = terrainHeight(x, z), biome = biomeAt(x, z).id;
      let c = h < WATER_Y ? [45, 103, 126] : colors[biome] || colors.meadow;
      const shade = h < WATER_Y ? Math.max(-12, h * 3) : Math.max(-12, Math.min(22, h * 1.7));
      const p = (py * width + px) * 4;
      image.data[p] = c[0] + shade; image.data[p+1] = c[1] + shade; image.data[p+2] = c[2] + shade; image.data[p+3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }
  showRadial(show, ids = [], selectedId = 'hand') {
    this.radialMenu.classList.toggle('hidden', !show); if (!show) return;
    this.radialIds = ids;
    const radius = ids.length > 12 ? 190 : 165;
    this.radialItems.innerHTML = ids.map((id,i)=>{const a=-Math.PI/2+i/ids.length*Math.PI*2;return `<div class="radialItem ${id===selectedId?'sel':''}" data-i="${i}" style="left:${Math.cos(a)*radius}px;top:${Math.sin(a)*radius}px"><span>${icon(ITEMS[id].icon)}</span><small>${ITEMS[id].name}</small></div>`}).join('');
    this.radialSelected = Math.max(0,ids.indexOf(selectedId)); this.radialName.textContent=ITEMS[ids[this.radialSelected]]?.name||'';
  }
  selectRadialByVector(x,y) {
    if (!this.radialIds?.length || Math.hypot(x,y)<18) return this.radialIds?.[this.radialSelected];
    let a=Math.atan2(y,x)+Math.PI/2;if(a<0)a+=Math.PI*2;
    this.radialSelected=Math.round(a/(Math.PI*2)*this.radialIds.length)%this.radialIds.length;
    for(const el of this.radialItems.children)el.classList.toggle('sel',+el.dataset.i===this.radialSelected);
    const id=this.radialIds[this.radialSelected];this.radialName.textContent=ITEMS[id].name;return id;
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

  renderHotbar(hotbar, idx, inv, dura = {}) {
    // Nur tatsächlich benutzbare Slots anzeigen. So bleiben neue Werkzeuge und
    // Baugegenstände auch auf Touch-Geräten direkt auswählbar (dort gibt es kein Tab-Rad).
    const visible = hotbar.map((id, i) => ({ id, i })).filter(({ id }) => id === 'hand' || (inv[id] || 0) > 0);
    this.hotbarEl.innerHTML = visible.map(({ id, i }) => {
      const def = ITEMS[id];
      const amountId = id === 'bogen' ? 'pfeil' : id;
      const amount = inv[amountId] || 0;
      const durability = def.dura ? Math.max(0, dura[id] ?? def.dura) : null;
      const durabilityPct = def.dura ? Math.max(0, Math.min(1, durability / def.dura)) : 0;
      const showAmount = id === 'bogen' || !['hand', 'tool', 'gear', 'armor'].includes(id === 'hand' ? 'hand' : def.type);
      const amountLabel = showAmount
        ? `<span class="count${id === 'bogen' ? ' ammoCount' : ''}" aria-label="${ITEMS[amountId]?.name || def.name}: ${amount}">${amount}</span>`
        : '';
      const durabilityBar = durability !== null
        ? `<span class="dura ${durabilityPct > 0.5 ? '' : durabilityPct > 0.25 ? 'mid' : 'low'}" aria-hidden="true"><i style="width:${Math.round(durabilityPct * 100)}%"></i></span>`
        : '';
      return `<button class="slot ${i === idx ? 'sel' : ''}" data-i="${i}" data-id="${id}" title="${def.name}" aria-label="${def.name} auswählen"><span class="itemIcon">${icon(def.icon)}</span>${amountLabel}${durabilityBar}</button>`;
    }).join('');
    for (const el of this.hotbarEl.querySelectorAll('.slot')) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onSelectSlot) this.onSelectSlot(+el.dataset.i);
      });
    }
  }

  // Aktualisiert nur den Haltbarkeitsbalken eines Slots (z.B. Fackel, die live herunterbrennt)
  updateDuraBar(id, pct) {
    const slot = this.hotbarEl.querySelector(`.slot[data-id="${id}"]`);
    if (!slot) return;
    const bar = slot.querySelector('.dura');
    const fill = slot.querySelector('.dura i');
    if (!bar || !fill) return;
    const p = Math.max(0, Math.min(1, pct));
    fill.style.width = `${(p * 100).toFixed(0)}%`;
    bar.className = `dura ${p > 0.5 ? '' : p > 0.25 ? 'mid' : 'low'}`;
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

  saved(failed = false) {
    this.saveStatus.textContent = failed ? 'Speichern fehlgeschlagen' : 'Spiel gespeichert';
    this.saveStatus.className = `saveStatus show${failed ? ' failed' : ''}`;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveStatus.classList.remove('show'), 1800);
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
    const categories = [
      ['tools', 'Werkzeuge'], ['build', 'Bauen'], ['gear', 'Ausrüstung'], ['bench', 'Werkbank'],
    ];
    const categoryOf = (r) => r.station ? 'bench'
      : ['lagerfeuer','holzwand','wildtor','zelt','regenfaenger','floss','truhe','werkbank','holzdach'].includes(r.out) ? 'build'
        : ['pelzmantel'].includes(r.out) ? 'gear' : 'tools';
    $('craftTabs').innerHTML = categories.map(([id, name]) =>
      `<button class="craftTab ${this.craftCategory === id ? 'active' : ''}" data-category="${id}">${name}</button>`).join('');
    for (const tab of $('craftTabs').querySelectorAll('.craftTab')) tab.onclick = () => {
      this.craftCategory = tab.dataset.category;
      this.renderCraft(inv);
    };

    this.recipeList.innerHTML = RECIPES.map((r, i) => ({ r, i })).filter(({ r }) => categoryOf(r) === this.craftCategory).map(({ r, i }) => {
      const def = ITEMS[r.out];
      const owned = def.once && (inv[r.out] || 0) > 0;
      const stationOk = !r.station || this.craftStation === r.station;
      const levelOk = this.playerLevel >= (r.level || 1);
      let can = !owned && stationOk && levelOk;
      const costHtml = Object.entries(r.cost)
        .map(([id, n]) => {
          const have = inv[id] || 0;
          if (have < n) can = false;
          return `<span class="chip ${have < n ? 'miss' : ''}" title="${ITEMS[id].name}: ${have} von ${n}">${icon(ITEMS[id].icon)}${have}/${n}</span>`;
        })
        .join('');
      return `<div class="recipe ${can ? '' : 'off'}">
        <span class="ric">${icon(def.icon)}</span>
        <div class="rmid">
          <b>${def.name}</b>
          <span class="rdesc">${r.desc}${stationOk ? '' : ' · Werkbank benötigt'}${levelOk ? '' : ` · Level ${r.level} benötigt`}</span>
          <span class="rcost">${costHtml}</span>
        </div>
        <button data-r="${i}" ${can ? '' : 'disabled'}>${owned ? (def.type === 'tool' ? '✓ Im Werkzeuggürtel' : '✓ Gebaut') : !levelOk ? `Level ${r.level}` : 'Craften'}</button>
      </div>`;
    }).join('');

    for (const btn of this.recipeList.querySelectorAll('button[data-r]')) {
      btn.addEventListener('click', () => {
        if (this.onCraft) this.onCraft(RECIPES[+btn.dataset.r]);
      });
    }

    const entries = Object.entries(inv).filter(([, n]) => n > 0);
    const cap = this.capacityProvider?.() || { used: entries.length, max: 16 };
    $('invTitle').innerHTML = `${icon('backpack')} Inventar · ${cap.used}/${cap.max} Plätze`;
    const cells = entries.flatMap(([id,n]) => { const type=ITEMS[id].type,max=['tool','gear','armor'].includes(type)?1:type==='placeable'?10:20; const out=[]; for(let left=n;left>0;left-=max)out.push([id,Math.min(max,left)]); return out; });
    this.invGrid.innerHTML = cells.map(([id, n]) => `<div class="invItem" title="${ITEMS[id].name}"><span>${icon(ITEMS[id].icon)}</span><b>${n}</b></div>`).join('')
      + Array.from({ length: Math.max(0, cap.max - cap.used) }, () => '<div class="invItem empty"></div>').join('');
  }

  showStorage(show) { this.storageEl.classList.toggle('hidden', !show); }

  renderStorage(title, inv, storage, capacity = null) {
    this.storageTitle.textContent = title;
    const stackMax = (id) => {
      const type = ITEMS[id]?.type;
      return ['tool','gear','armor'].includes(type) ? 1 : type === 'placeable' ? 10 : 20;
    };
    const stacks = (obj) => Object.entries(obj).filter(([, n]) => n > 0).flatMap(([id, n]) => {
      const max = stackMax(id), out = [];
      for (let left = n; left > 0; left -= max) out.push({ id, amount: Math.min(max, left) });
      return out;
    });
    const render = (obj, from, emptyLabel = true) => stacks(obj).map(({ id, amount }) =>
      `<button class="storageItem" data-id="${id}" data-from="${from}" data-amount="${amount}" title="Einen Stapel verschieben"><span>${icon(ITEMS[id]?.icon || 'backpack')}</span><em>${ITEMS[id]?.name || id}</em><b>×${amount}</b></button>`).join('') || (emptyLabel ? '<span class="empty">Leer</span>' : '');
    const playerStacks = stacks(inv);
    const used = capacity?.used ?? playerStacks.length, max = capacity?.max ?? 16;
    $('storagePlayerTitle').textContent = `Rucksack · ${used}/${max} Plätze`;
    $('storageContainerTitle').textContent = `Lager · ${stacks(storage).length} Stapel`;
    this.storagePlayer.innerHTML = render(inv, 'player', false)
      + Array.from({ length: Math.max(0, max - used) }, () => '<span class="storageSlotEmpty" title="Freier Rucksackplatz"></span>').join('');
    this.storageContainer.innerHTML = render(storage, 'container');
    for (const btn of this.storageEl.querySelectorAll('.storageItem')) btn.onclick = () => this.onStorageMove?.(btn.dataset.from, btn.dataset.id, +btn.dataset.amount);
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
      this.btnPlay.innerHTML = `${icon('clock')} Wiederbeleben in 0:20`;
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
