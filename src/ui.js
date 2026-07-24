import { Vector3 } from 'three';
import { ITEMS, RECIPES, HOTBAR_FIXED_COUNT, isBodyCarried } from './items.js';
import { icon, hydrateIcons } from './icons.js';
import { areaDangerTier, biomeAt, terrainHeight, RIVERS, TRAIL_PATHS, WATER_Y } from './world.js';
import { t, onLangChange } from './i18n.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    hydrateIcons();
    // Bei Sprachwechsel das sichtbare Overlay neu übersetzen (Titel/Untertitel/
    // Buttons werden dynamisch gesetzt, nicht über data-i18n).
    onLangChange(() => {
      if (this._overlayState && !this.overlay.classList.contains('hidden')) {
        this.showOverlay(this._overlayState.kind, this._overlayState.opts);
      }
    });
    this.hud = $('hud');
    this.crosshair = $('crosshair');
    this.hitMarkerEl = $('hitMarker');
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
    this.fishingHud = $('fishingHud');
    this.fishingPhase = $('fishingPhase');
    this.fishingStatus = $('fishingStatus');
    this.fishingProgress = $('fishingProgress');
    this.fishingTension = $('fishingTension');
    this.fishingHint = $('fishingHint');
    this.craftEl = $('craft');
    this.recipeList = $('recipeList');
    this.invGrid = $('invGrid');
    this.loadoutGrid = $('loadoutGrid');
    this.overlay = $('overlay');
    this.ovTitle = $('ovTitle');
    this.ovSub = $('ovSub');
    this.ovKicker = $('ovKicker');
    this.ovControls = $('ovControls');
    this.btnPlay = $('btnPlay');
    this.btnRespawnPartner = $('btnRespawnPartner');
    this.btnNew = $('btnNew');
    this.btnMainMenu = $('btnMainMenu');
    this.cameraChoice = $('cameraChoice');
    this.cameraChoiceStatus = $('cameraChoiceStatus');
    this.cameraModeToggle = $('cameraModeToggle');
    this._coopPartner = null;
    this.vignette = $('vignette');
    this.survivalVignette = $('survivalVignette');
    this.sleepFade = $('sleepFade');
    this.selName = $('selName');
    this.storageEl = $('storage');
    this.storageTitle = $('storageTitle');
    this.storagePlayer = $('storagePlayer');
    this.storageLoadout = $('storageLoadout');
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
    this.waypointMarker = $('waypointMarker');
    this.waypointTarget = null;
    this._waypointWorld = new Vector3();
    this._waypointForward = new Vector3();
    this._waypointOffset = new Vector3();
    this._waypointHeight = 0;
    this.waypoints = [];
    this.radialMenu = $('radialMenu');
    this.radialItems = $('radialItems');
    this.radialName = $('radialName');
    this.craftStationLabel = $('craftStationLabel');
    this._selNameTimer = null;
    this.onCraft = null;
    this.onSelectSlot = null;
    this.onStorageMove = null;
    this.onRadialChange = null;
    this.capacityProvider = null;
    this.craftRequirementProvider = null;
    this.craftStation = 'hand';
    this.craftCategory = 'workshop';
    this.playerLevel = 1;
    this._saveTimer = null;
    this._hitMarkerTimer = null;
    this._staminaPulseTimer = null;
  }

  showHud(show) {
    this.hud.classList.toggle('hidden', !show);
  }

  setCameraMode(mode) {
    const third = mode === 'third';
    this.cameraChoiceStatus.textContent = third ? t('camera.third') : t('camera.first');
    this.cameraModeToggle.textContent = third ? t('camera.toFirst') : t('camera.toThird');
    this.cameraModeToggle.setAttribute('aria-pressed', String(third));
  }

  setFishing(state = null) {
    this.fishingHud.classList.toggle('hidden', !state);
    if (!state) return;
    this.fishingPhase.textContent = state.phase || t('fishing.phase');
    this.fishingStatus.textContent = state.status || '';
    this.fishingHint.textContent = state.hint || '';
    this.fishingProgress.style.width = `${Math.max(0, Math.min(100, state.progress || 0))}%`;
    this.fishingTension.style.width = `${Math.max(0, Math.min(100, state.tension || 0))}%`;
    this.fishingHud.classList.toggle('bite', state.bite === true);
    this.fishingHud.classList.toggle('danger', state.danger === true);
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
    this.setSurvivalVignette(hp, hunger, thirst, warmth);
  }

  setSurvivalVignette(hp, hunger, thirst, warmth) {
    const healthDanger=hp<100?{id:'health',value:hp,threshold:100,color:'190 24 26'}:null;
    const states = [
      { id: 'thirst', value: thirst, threshold: 16, color: '27 101 154' },
      { id: 'cold', value: warmth, threshold: 19, color: '82 157 202' },
      { id: 'hunger', value: hunger, threshold: 12, color: '159 91 27' },
    ].filter((state) => state.value < state.threshold)
      .sort((a, b) => (a.value / a.threshold) - (b.value / b.threshold));
    // Niedrige Gesundheit hat bewusst Vorrang: Der rote Gefahrenrand darf
    // nicht von einer gleichzeitig aktiven Durst-/Kältefarbe verdeckt werden.
    const critical = healthDanger||states[0];
    this.survivalVignette.classList.toggle('active', !!critical);
    if (!critical) return;
    const severity=1-Math.max(0,critical.value)/critical.threshold;
    const intensity = critical.id==='health'?.04+severity*.78:.18+severity*.46;
    const clearRadius=critical.id==='health'?62-severity*51:48;
    const edgeRadius=critical.id==='health'?100-severity*19:100;
    this.survivalVignette.dataset.state = critical.id;
    this.survivalVignette.style.setProperty('--survival-color', critical.color);
    this.survivalVignette.style.setProperty('--survival-opacity', intensity.toFixed(2));
    this.survivalVignette.style.setProperty('--survival-clear',`${clearRadius.toFixed(1)}%`);
    this.survivalVignette.style.setProperty('--survival-edge',`${edgeRadius.toFixed(1)}%`);
    this.survivalVignette.style.setProperty('--survival-pulse',`${(2.2-severity*1.05).toFixed(2)}s`);
  }

  setThreat(show, level = 1, bloodMoon = false) {
    this.threatPanel.classList.toggle('hidden', !show);
    this.threatPanel.classList.toggle('blood', bloodMoon);
    if (show) this.threatPanel.textContent = t(bloodMoon ? 'hud.threatBlood' : 'hud.threatNight', { n: level });
  }
  setBiome(name, compass = '') { this.biomePanel.textContent = `${name}${compass ? ` · ${compass}` : ''}`; }

  setWaypointTarget(point) {
    this.waypointTarget = point;
    // Der Marker sitzt räumlich über dem Boden am Ziel und nicht auf einer
    // festen Bildschirmzeile. Die Höhe ändert sich erst beim neuen Ziel.
    this._waypointHeight = point ? terrainHeight(point.x, point.z) + 1.8 : 0;
  }

  // Blendet den Wegpunkt ins Spielbild ein. Liegt er hinter dem Spieler oder
  // seitlich außerhalb, klebt der Marker am Bildschirmrand und zeigt mit einem
  // Pfeil die Richtung — sonst wüsste man nur, dass man ihn nicht sieht.
  updateWaypointMarker(playerPos, yaw, camera) {
    const ziel = this.waypointTarget;
    if (!ziel || !playerPos) { this.waypointMarker.classList.add('hidden'); return; }
    const dx = ziel.x - playerPos.x, dz = ziel.z - playerPos.z;
    const entfernung = Math.hypot(dx, dz);
    if (entfernung < 4) { this.waypointMarker.classList.add('hidden'); return; }

    // Blickrichtung des Spielers ist (-sin yaw, -cos yaw). Für die Position
    // auf dem Bildschirm brauchen wir den Winkel von der Zielpeilung zur
    // Blickrichtung (nicht umgekehrt): Bei yaw=0 liegt +X rechts im Bild.
    // Die frühere Subtraktionsreihenfolge spiegelte links und rechts; nur ein
    // Ziel genau geradeaus wirkte dadurch zufällig korrekt.
    let relativ = yaw - Math.atan2(-dx, -dz);
    relativ = Math.atan2(Math.sin(relativ), Math.cos(relativ));
    const breite = innerWidth, hoehe = innerHeight;
    // Die echte Weltposition durch die Kamera projizieren. So bewegt sich der
    // Marker beim Hoch-/Runterschauen relativ zum Bild und bleibt über dem
    // gesetzten Punkt auf seiner Geländehöhe verankert.
    camera.updateMatrixWorld();
    this._waypointWorld.set(ziel.x, this._waypointHeight, ziel.z);
    camera.getWorldDirection(this._waypointForward);
    const vorKamera = this._waypointOffset.copy(this._waypointWorld).sub(camera.position).dot(this._waypointForward) > 0;
    const projektion = this._waypointWorld.project(camera);
    const imBild = vorKamera && Math.abs(projektion.x) < .88 && Math.abs(projektion.y) < .82;

    // Sichtbare Ziele stehen exakt an ihrer projizierten Position. Verlässt
    // das Ziel das Sichtfeld, bleibt der Hinweis am nächstgelegenen Rand.
    const x = vorKamera
      ? breite * (.5 + Math.max(-.46, Math.min(.46, projektion.x * .5)))
      : breite * (.5 + (relativ > 0 ? .46 : -.46));
    const y = vorKamera
      ? Math.max(54, Math.min(hoehe - 70, hoehe * (.5 - projektion.y * .5)))
      : hoehe * .5;
    this.waypointMarker.classList.remove('hidden');
    this.waypointMarker.classList.toggle('offscreen', !imBild);
    this.waypointMarker.style.left = `${Math.max(46, Math.min(breite - 46, x))}px`;
    this.waypointMarker.style.top = `${y}px`;
    this.waypointMarker.querySelector('b').textContent = ziel.remote
      ? (ziel.authorName || t('hud.teammate')) : t('hud.waypoint');
    this.waypointMarker.querySelector('small').textContent = `${Math.round(entfernung)} m`;
    this.waypointMarker.classList.toggle('remote', !!ziel.remote);
  }
  setLevel(level, xp, current, next) {
    this.playerLevel = level;
    this.levelLabel.textContent = t('hud.level', { n: level });
    const statBonus = Math.max(0, level - 1) * 5;
    this.levelLabel.title = t('hud.levelBonus', { n: statBonus });
    const span = Math.max(1, next - current);
    this.xpFill.style.width = `${Math.max(0, Math.min(100, (xp - current) / span * 100))}%`;
    this.xpLabel.textContent = next <= current ? t('hud.xpMax', { xp }) : `${xp - current} / ${span} XP`;
  }
  showMap(show, player, landmarks = [], discovered = [], radius = 320, heading = 0, signal = null, playerLevel = 1, partners = [], camps = []) {
    this.mapOverlay.classList.toggle('hidden', !show); if (!show) return;
    // Argumente merken, damit Zoom und Verschieben neu zeichnen können, ohne
    // dass main.js bei jeder Mausbewegung erneut aufrufen muss.
    this._mapArgs = { player, landmarks, discovered, radius, heading, signal, playerLevel, partners, camps };
    this.drawMapTerrain(radius);
    this.ensureMapInteractions();

    const zoom = this.mapZoom || 1;
    // Normalisierte Kartenkoordinate 0..1; 0,47 statt 0,5 lässt den Rand frei.
    const einheit = (wert) => .5 + wert / radius * .47;
    const mitteU = einheit(this.mapCenterX || 0);
    const mitteV = einheit(this.mapCenterZ || 0);
    const bruch = (x, z) => [.5 + zoom * (einheit(x) - mitteU), .5 + zoom * (einheit(z) - mitteV)];
    this._mapToWorld = (fx, fz) => [
      ((fx - .5) / zoom + mitteU - .5) / .47 * radius,
      ((fz - .5) / zoom + mitteV - .5) / .47 * radius,
    ];
    const pos = (x, z) => {
      const [fx, fz] = bruch(x, z);
      return `left:${fx * 100}%;top:${fz * 100}%`;
    };
    // Das Gelände wird als Ganzes skaliert und verschoben; die Beschriftungen
    // dagegen behalten ihre Größe, damit sie beim Hineinzoomen lesbar bleiben.
    this.mapTerrain.style.transformOrigin = '0 0';
    this.mapTerrain.style.transform = `translate(${(.5 - zoom * mitteU) * 100}%,${(.5 - zoom * mitteV) * 100}%) scale(${zoom})`;
    const glyphs = { steinkreis: '◉', jaegerlager: '⌂', uralter_baum: '♣', pilzhain:'♣', frostwarte:'▲', kuestenwrack: '⚓', erzinsel: '◆', nordwacht:'♜', wurzelhoehle:'▰', eiskluft:'❖', gezeitengrotte:'≋', schattenhoehle:'▰', sternfall:'✦', versunkene_ruinen:'◫', ostpass:'♜', westheiligtum:'◉', nordgratstation:'♜', westklippenposten:'♜', suedaue:'◉',
      ostfurt_lager:'♜', schuppenbank:'◆', ostmuendung:'◉', suedwest_wacht:'♜',
      moorruine:'◫', suedwestrand:'◉', nordfurt_station:'♜', schluchtkrater:'✦',
      nordkap:'◉', ostgrat:'▲', westkliff:'◆', suedwrack:'⚓' };
    const found = landmarks.filter((l) => discovered.includes(l.id));
    // Die Stufe wird nicht mehr eingetippt, sondern aus derselben Funktion
    // berechnet, die auch die Gegner-Tiers bestimmt. Vorher standen hier feste
    // Zahlen bis 7, die nach der Kartenvergrößerung nicht mehr stimmten.
    const regions = [
      ['meadow',0,0], ['forest',90,-70], ['coast',-55,235],
      ['moor',-455,305], ['alpine',440,-320], ['outer',-440,48],
      ['northridge',-150,-600], ['westcliffs',-625,50], ['southmeadow',-125,625],
      ['eastriver',760,-130], ['northgorge',430,-880], ['swamp',-560,650],
      ['westcliff',-980,-230], ['southmarsh',150,980], ['eastridge',890,340],
    ].map(([id, x, z]) => [t(`region.${id}`), x, z]);
    const regionHtml = regions.map(([name,x,z]) => {
      const level = areaDangerTier(x, z);
      const locked = playerLevel < level;
      return `<span class="mapRegion ${locked ? 'locked' : ''}" style="${pos(x,z)}">${locked ? '◇ ' : ''}${name}<small>${t('map.tier', { n: level })}</small></span>`;
    }).join('');
    const signalLabel = t(signal?.type === 'flare' ? 'map.signalFlare'
      : signal?.type === 'smoke' ? 'map.signalSmoke'
        : signal?.type === 'track' ? 'map.signalTrack'
          : signal?.type === 'hunt' ? 'map.signalHunt' : 'map.signalLoot');
    const trackingSignal = signal && !['flare', 'smoke'].includes(signal.type);
    const beaconSites = landmarks.filter((landmark) => landmark.beacon);
    const activeBeacons = beaconSites.filter((landmark) => landmark.beaconLit).length;
    const cacheSites = landmarks.filter((landmark) => landmark.caveCache);
    const readyCaches = cacheSites.filter((landmark) => landmark.cacheReady).length;
    this.mapMarkers.innerHTML = regionHtml + found.map((l) => {
      // Gefahrenstufe des Ortes. Liegt sie über dem Spielerlevel, wird der
      // Eintrag als Warnung markiert — dieselbe Logik wie bei den Regionen.
      const level = areaDangerTier(l.x, l.z);
      const risky = playerLevel < level;
      return `<span class="mapLandmark ${risky ? 'risky' : ''} ${l.beacon ? `beacon ${l.beaconLit ? 'lit' : 'unlit'}` : ''} ${l.caveCache ? `caveCache ${l.cacheReady ? 'ready' : 'empty'}` : ''}" style="${pos(l.x,l.z)}" title="${l.name} · ${t('map.tier', { n: level })}${risky ? t('map.aboveLevel') : ''}${l.beacon ? t(l.beaconLit ? 'map.beaconOn' : 'map.beaconOff') : ''}${l.caveCache ? l.cacheReady ? t('map.cacheReady') : t('map.cacheNext', { n: l.cacheNextDay }) : ''}"><i>${l.beacon ? l.beaconLit ? '♨' : '◇' : glyphs[l.id] || '◆'}<u>${level}</u></i><b>${l.name.replace(/^(Der|Die|Das) /, '')}</b></span>`;
    }).join('')
      + (signal ? `<span class="mapSignal ${trackingSignal ? 'tracking' : ''}" style="${pos(signal.x,signal.z)}" title="${t('map.signalTitle')}"><i></i><b>${signalLabel} · ${Math.ceil(signal.remaining)}s</b></span>` : '')
      + camps.map((camp, index) => `<span class="mapCamp" style="${pos(camp.x,camp.z)}" title="${t('map.camp')}${camps.length > 1 ? ` ${index + 1}` : ''}"><i>⌂</i><b>${t('map.camp')}${camps.length > 1 ? ` ${index + 1}` : ''}</b></span>`).join('')
      + partners.map((p) => `<span class="mapPartner" style="${pos(p.x,p.z)}" title="${(p.name || t('hud.teammate')).replace(/"/g, '')}"><i></i><b>${(p.name || t('hud.teammate')).replace(/</g, '')}</b></span>`).join('')
      + (this.waypoints || []).map((w) => `<span class="mapWaypoint ${w.remote ? 'remote' : ''}" style="${pos(w.x,w.z)}" title="${w.remote ? t('map.waypointOf', { name: (w.authorName || t('hud.teammate')).replace(/"/g,'') }) : t('map.yourWaypoint')}"><i>◈</i><b>${w.remote ? (w.authorName || t('hud.teammate')).replace(/</g,'') : t('hud.waypoint')}</b></span>`).join('')
      + `<span class="mapPlayer" style="${pos(player.x,player.z)};--heading:${-heading}rad" title="${t('map.yourPosition')}"><i></i></span>`;
    // Erst im nächsten Frame entzerren: Direkt nach dem Setzen von innerHTML
    // steht das Layout der Karte noch nicht, alle Rechtecke wären leer und die
    // Kollisionsprüfung liefe ins Leere.
    cancelAnimationFrame(this._declutterFrame);
    this._declutterFrame = requestAnimationFrame(() => this.declutterMapLabels());
    this.mapCoords.textContent = `X ${Math.round(player.x)} · Z ${Math.round(player.z)}`;
    $('mapLegend').innerHTML = `<span><i class="legendPlayer"></i>${t('map.legendYou')}</span>${partners.length ? `<span><i class="legendPartner"></i>${t('map.legendPartner')}</span>` : ''}${camps.length ? `<span><i class="legendCamp">⌂</i>${t('map.legendCamp', { n: camps.length })}</span>` : ''}<span><i class="legendPlace">◆</i>${t('map.legendPlace')}</span>${beaconSites.length ? `<span class="legendBeacons">♨ ${t('map.legendBeacons', { a: activeBeacons, b: beaconSites.length })}</span>` : ''}${cacheSites.length ? `<span class="legendCaches">▰ ${t('map.legendCaches', { a: readyCaches, b: cacheSites.length })}</span>` : ''}${signal ? `<span><i class="legendSignal"></i>${t(trackingSignal ? 'map.legendTrack' : 'map.legendSignal')}</span>` : ''}<b>${t('map.discovered', { a: found.length, b: landmarks.length })}</b>`;
  }
  // Im Kerngebiet liegen bis zu sechs Orte auf engem Raum; ihre Namensschilder
  // überlagern sich dort unlesbar. Kollidierende Namen werden ausgeblendet,
  // Symbol und Stufenplakette bleiben immer stehen — der Ort verschwindet also
  // nie, nur seine Beschriftung. Der vollständige Name bleibt im Tooltip.
  // Zoom, Verschieben und Wegpunkt-Setzen. Wird einmalig verdrahtet; das
  // Neuzeichnen läuft danach über showMap mit den gemerkten Argumenten.
  ensureMapInteractions() {
    if (this._mapInteractionsReady) return;
    this._mapInteractionsReady = true;
    this.mapZoom = 1;
    this.mapCenterX = 0;
    this.mapCenterZ = 0;
    const karte = this.worldMap;

    const neuZeichnen = () => {
      const a = this._mapArgs;
      if (a) this.showMap(true, a.player, a.landmarks, a.discovered, a.radius, a.heading, a.signal, a.playerLevel, a.partners, a.camps);
    };
    this._redrawMap = neuZeichnen;

    const zoomSetzen = (neu, ankerX = .5, ankerZ = .5) => {
      const vorher = this.mapZoom;
      const begrenzt = Math.max(1, Math.min(6, neu));
      if (begrenzt === vorher) return;
      // Auf den Mauszeiger zoomen: Der Weltpunkt unter dem Cursor bleibt
      // stehen, statt dass die Ansicht zur Mitte springt.
      const [weltX, weltZ] = this._mapToWorld(ankerX, ankerZ);
      this.mapZoom = begrenzt;
      this.mapCenterX += (weltX - this.mapCenterX) * (1 - vorher / begrenzt);
      this.mapCenterZ += (weltZ - this.mapCenterZ) * (1 - vorher / begrenzt);
      this.begrenzeMapMitte();
      neuZeichnen();
    };
    this._setMapZoom = zoomSetzen;

    karte.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = karte.getBoundingClientRect();
      zoomSetzen(this.mapZoom * (e.deltaY < 0 ? 1.22 : 1 / 1.22),
        (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    }, { passive: false });

    let zieht = false, zogGerade = false, startX = 0, startZ = 0;
    karte.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      zieht = true; zogGerade = false;
      startX = e.clientX; startZ = e.clientY;
      karte.setPointerCapture(e.pointerId);
    });
    karte.addEventListener('pointermove', (e) => {
      if (!zieht) return;
      const dx = e.clientX - startX, dz = e.clientY - startZ;
      if (Math.hypot(dx, dz) < 4) return;
      zogGerade = true;
      const r = karte.getBoundingClientRect();
      const a = this._mapArgs;
      if (!a) return;
      // Bildschirmversatz in Weltmeter umrechnen
      const proPixel = a.radius / .47 / r.width / this.mapZoom;
      this.mapCenterX -= dx * proPixel;
      this.mapCenterZ -= dz * proPixel;
      startX = e.clientX; startZ = e.clientY;
      this.begrenzeMapMitte();
      neuZeichnen();
    });
    const beenden = () => { zieht = false; };
    karte.addEventListener('pointerup', (e) => {
      // Ein Klick ohne Ziehbewegung setzt den Wegpunkt.
      if (zieht && !zogGerade && e.button === 0) {
        const r = karte.getBoundingClientRect();
        const [wx, wz] = this._mapToWorld((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        this.onWaypointSet?.(wx, wz);
      }
      beenden();
    });
    karte.addEventListener('pointercancel', beenden);
    karte.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onWaypointSet?.(null, null); });
  }

  // Verhindert, dass man die Karte aus dem Sichtfeld schiebt.
  begrenzeMapMitte() {
    const radius = this._mapArgs?.radius || 1;
    const spielraum = radius * (1 - 1 / this.mapZoom);
    this.mapCenterX = Math.max(-spielraum, Math.min(spielraum, this.mapCenterX));
    this.mapCenterZ = Math.max(-spielraum, Math.min(spielraum, this.mapCenterZ));
  }

  declutterMapLabels() {
    const regionen = [...this.mapMarkers.querySelectorAll('.mapRegion')];
    const marken = [...this.mapMarkers.querySelectorAll('.mapLandmark')];
    for (const el of [...regionen, ...marken]) el.classList.remove('labelHidden');

    const ueberlappt = (a, b) => a.left < b.right && b.left < a.right
      && a.top < b.bottom && b.top < a.bottom;

    // Erster Durchgang: Ortsnamen. Signalfeuer und Höhlenvorräte zuerst, sie
    // tragen Zustandsinformation, die man auf einen Blick braucht.
    const rang = (m) => (m.classList.contains('beacon') ? 0 : m.classList.contains('caveCache') ? 1 : 2);
    const belegt = [];
    for (const marke of marken.sort((a, b) => rang(a) - rang(b))) {
      const label = marke.querySelector('b');
      if (!label) continue;
      const kasten = label.getBoundingClientRect();
      if (!kasten.width) continue;
      if (belegt.some((r) => ueberlappt(kasten, r))) marke.classList.add('labelHidden');
      else belegt.push(kasten);
    }

    // Zweiter Durchgang: Regionen. Sie verdrängen bewusst keinen Ortsnamen —
    // ein Ort ist die konkretere Information. Eine Region blendet sich nur
    // selbst aus, statt halb überdeckt als Buchstabensalat stehen zu bleiben.
    for (const region of regionen) {
      const kasten = region.getBoundingClientRect();
      if (!kasten.width) continue;
      if (belegt.some((r) => ueberlappt(kasten, r))) region.classList.add('labelHidden');
      else belegt.push(kasten);
    }
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
    this.drawMapRoutes(ctx, radius, width);
  }

  // Wege und Flüsse werden über das Gelände gezeichnet. Ohne sie ist die
  // Karte nur ein Farbverlauf: Das Routennetz ist der eigentliche Grund,
  // warum man sie öffnet, und die Flüsse markieren die Krokodilreviere.
  drawMapRoutes(ctx, radius, size) {
    const zuPixel = (x, z) => [(x / radius * .5 + .5) * size, (z / radius * .5 + .5) * size];
    const linie = (pfad, breite, farbe, gestrichelt = false) => {
      if (pfad.length < 2) return;
      ctx.beginPath();
      ctx.setLineDash(gestrichelt ? [size * .012, size * .012] : []);
      ctx.lineWidth = breite;
      ctx.strokeStyle = farbe;
      ctx.lineJoin = ctx.lineCap = 'round';
      pfad.forEach((punkt, i) => {
        const [px, py] = zuPixel(punkt[0], punkt[1]);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.stroke();
    };

    // Flüsse zuerst: Wege queren sie an den Furten sichtbar oben.
    for (const fluss of RIVERS) {
      linie(fluss.path, size * .009, '#3f7f96cc');
      // Krokodilflüsse bekommen eine zweite, hellere Ader als Warnhinweis.
      if (fluss.crocodiles) linie(fluss.path, size * .004, '#7fd88fbb');
    }
    for (const route of TRAIL_PATHS) linie(route, size * .0045, '#e8d5a355', true);
    ctx.setLineDash([]);
  }
  showRadial(show, ids = [], selectedId = 'hand') {
    this.radialMenu.classList.toggle('hidden', !show); if (!show) return;
    this.radialIds = ids;
    const preferred = ids.length > 12 ? 190 : 165;
    const radius = Math.min(preferred, Math.max(118, innerWidth / 2 - 48), Math.max(118, innerHeight / 2 - 72));
    this.radialItems.innerHTML = ids.map((id,i)=>{const a=-Math.PI/2+i/ids.length*Math.PI*2;return `<div class="radialItem ${id===selectedId?'sel':''}" data-i="${i}" style="left:${Math.cos(a)*radius}px;top:${Math.sin(a)*radius}px"><span>${icon(ITEMS[id].icon)}</span><small>${ITEMS[id].name}</small></div>`}).join('');
    this.radialSelected = Math.max(0,ids.indexOf(selectedId)); this.radialName.textContent=ITEMS[ids[this.radialSelected]]?.name||'';
  }
  selectRadialByVector(x,y) {
    if (!this.radialIds?.length || Math.hypot(x,y)<18) return this.radialIds?.[this.radialSelected];
    let a=Math.atan2(y,x)+Math.PI/2;if(a<0)a+=Math.PI*2;
    const previous = this.radialSelected;
    this.radialSelected=Math.round(a/(Math.PI*2)*this.radialIds.length)%this.radialIds.length;
    for(const el of this.radialItems.children)el.classList.toggle('sel',+el.dataset.i===this.radialSelected);
    const id=this.radialIds[this.radialSelected];this.radialName.textContent=ITEMS[id].name;
    if (previous !== this.radialSelected) this.onRadialChange?.(id);
    return id;
  }

  setClock(day, elevation) {
    this.dayLabel.textContent = t('hud.day', { n: day });
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
    // 1–6 bleiben als feste Muskelgedächtnis-Plätze immer sichtbar. Alles
    // dahinter erscheint nur, wenn der Gegenstand tatsächlich vorhanden ist.
    const visible = hotbar.map((id, i) => ({ id, i }))
      .filter(({ id, i }) => i < HOTBAR_FIXED_COUNT || (inv[id] || 0) > 0);
    this.hotbarEl.innerHTML = visible.map(({ id, i }) => {
      const def = ITEMS[id];
      const usable = id === 'hand' || (inv[id] || 0) > 0;
      const amountId = id === 'bogen' ? 'pfeil' : id;
      const amount = inv[amountId] || 0;
      const durability = def.dura && usable ? Math.max(0, dura[id] ?? def.dura) : null;
      const durabilityPct = def.dura ? Math.max(0, Math.min(1, durability / def.dura)) : 0;
      const showAmount = id === 'bogen' || !['hand', 'tool', 'gear', 'armor'].includes(id === 'hand' ? 'hand' : def.type);
      const amountLabel = showAmount
        ? `<span class="count${id === 'bogen' ? ' ammoCount' : ''}" aria-label="${ITEMS[amountId]?.name || def.name}: ${amount}">${amount}</span>`
        : '';
      const durabilityBar = durability !== null
        ? `<span class="dura ${durabilityPct > 0.5 ? '' : durabilityPct > 0.25 ? 'mid' : 'low'}" aria-hidden="true"><i style="width:${Math.round(durabilityPct * 100)}%"></i></span>`
        : '';
      const keyLabel = i < HOTBAR_FIXED_COUNT ? `<span class="key">${i + 1}</span>` : '';
      return `<button class="slot ${i === idx ? 'sel' : ''} ${usable ? '' : 'empty'}" data-i="${i}" data-id="${id}" title="${def.name}${usable ? '' : t('hotbar.notCrafted')}" aria-label="${t('hotbar.selectAria', { name: def.name })}" ${usable ? '' : 'disabled'}>${keyLabel}<span class="itemIcon">${icon(def.icon)}</span>${amountLabel}${durabilityBar}</button>`;
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
    this.saveStatus.textContent = t(failed ? 'hud.saveFail' : 'hud.saveOk');
    this.saveStatus.className = `saveStatus show${failed ? ' failed' : ''}`;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveStatus.classList.remove('show'), 1800);
  }

  discovery(title, story, found, total) {
    const el = document.createElement('div');
    el.className = 'discoveryCard';
    el.innerHTML = `<small>${t('chronicle.header', { a: found, b: total })}</small><strong>${title}</strong><p>${story}</p>`;
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

  target(text, progress = null) {
    this.targetEl.replaceChildren();
    this.crosshair.classList.toggle('aimed', !!text);
    if (!text) return;
    const label = document.createElement('span');
    label.className = 'targetLabel';
    label.textContent = text;
    this.targetEl.appendChild(label);
    if (progress && progress.max > 0) {
      const track = document.createElement('span');
      track.className = `targetHealth${progress.danger ? ' danger' : ''}`;
      const fill = document.createElement('i');
      fill.style.width = `${Math.max(0, Math.min(100, progress.current / progress.max * 100))}%`;
      track.appendChild(fill);
      this.targetEl.appendChild(track);
    }
  }

  hitFeedback(kind = 'hit', strong = false) {
    clearTimeout(this._hitMarkerTimer);
    this.hitMarkerEl.className = '';
    void this.hitMarkerEl.offsetWidth;
    this.hitMarkerEl.classList.add('show', kind);
    if (strong) this.hitMarkerEl.classList.add('strong');
    this._hitMarkerTimer = setTimeout(() => { this.hitMarkerEl.className = ''; }, strong ? 300 : 190);

    const impactClass = strong ? 'impact-strong' : 'impact-soft';
    const app = $('app');
    app.classList.remove('impact-soft', 'impact-strong');
    void app.offsetWidth;
    app.classList.add(impactClass);
    setTimeout(() => app.classList.remove(impactClass), strong ? 230 : 130);
  }

  staminaExhausted() {
    const track = this.staminaFill.parentElement;
    clearTimeout(this._staminaPulseTimer);
    track.classList.remove('exhausted');
    void track.offsetWidth;
    track.classList.add('exhausted');
    this._staminaPulseTimer = setTimeout(() => track.classList.remove('exhausted'), 850);
  }

  damageFlash() {
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth; // Animation neu starten
    this.vignette.classList.add('flash');
    const app = $('app');
    app.classList.remove('impact-damage');
    void app.offsetWidth;
    app.classList.add('impact-damage');
    setTimeout(() => app.classList.remove('impact-damage'), 260);
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
      ['workshop', t('craft.cat.workshop'), ['axt', 'spitzhacke', 'hammer', 'angel', 'eisen', 'metallaxt', 'metallhacke', 'werkzeugpflege']],
      ['hunting', t('craft.cat.hunting'), ['bogen', 'pfeil', 'bogensehne', 'jagdkoecher', 'eisenspitzen', 'praezisionsschaefte']],
      ['camp', t('craft.cat.camp'), ['lagerfeuer', 'holzwand', 'steinmauer', 'wildtor', 'zelt', 'regenfaenger', 'truhe', 'werkbank', 'holzdach', 'hochsitz']],
      ['vehicles', t('craft.cat.vehicles'), ['floss', 'fahrrad', 'gelaendereifen', 'gepaecktraeger']],
      ['gear', t('craft.cat.gear'), ['verband', 'fackel', 'pelzmantel', 'pfadfinderstiefel', 'verstaerkte_hose', 'schutzhemd', 'laterne', 'feldflasche', 'grosser_rucksack', 'sammlergurt', 'survivalset', 'expeditionsrucksack', 'veteranenabzeichen']],
    ];
    const categoryOf = (r) => categories.find(([, , recipes]) => recipes.includes(r.out))?.[0] || 'workshop';
    this.craftStationLabel.textContent = this.craftStation === 'workbench' ? t('craft.stationBench') : t('craft.stationField');
    this.craftStationLabel.classList.toggle('bench', this.craftStation === 'workbench');
    $('craftTabs').innerHTML = categories.map(([id, name]) =>
      `<button class="craftTab ${this.craftCategory === id ? 'active' : ''}" data-category="${id}">${name}</button>`).join('');
    for (const tab of $('craftTabs').querySelectorAll('.craftTab')) tab.onclick = () => {
      this.craftCategory = tab.dataset.category;
      this.renderCraft(inv);
    };

    this.recipeList.innerHTML = RECIPES.map((r, i) => ({ r, i })).filter(({ r }) => categoryOf(r) === this.craftCategory).map(({ r, i }) => {
      const def = ITEMS[r.out];
      const upgraded = r.out === 'grosser_rucksack' && (inv.expeditionsrucksack || 0) > 0;
      const owned = def.once && ((inv[r.out] || 0) > 0 || upgraded);
      const stationOk = !r.station || this.craftStation === r.station;
      const levelOk = this.playerLevel >= (r.level || 1);
      const requirement = this.craftRequirementProvider?.(r) || { ok: true, message: '' };
      let can = !owned && stationOk && levelOk && requirement.ok;
      const costHtml = Object.entries(r.cost)
        .map(([id, n]) => {
          const have = inv[id] || 0;
          if (have < n) can = false;
          return `<span class="chip ${have < n ? 'miss' : ''}" title="${t('craft.chip', { name: ITEMS[id].name, have, need: n })}">${icon(ITEMS[id].icon)}${have}/${n}</span>`;
        })
        .join('');
      return `<div class="recipe ${can ? '' : 'off'}">
        <span class="ric">${icon(def.icon)}</span>
        <div class="rmid">
          <b>${def.name}</b>
          <span class="rdesc">${r.desc}${stationOk ? '' : t('craft.needBench')}${levelOk ? '' : t('craft.needLevel', { n: r.level })}${requirement.ok ? '' : ` · ${requirement.message}`}</span>
          <span class="rcost">${costHtml}</span>
        </div>
        <button data-r="${i}" ${can ? '' : 'disabled'}>${owned ? (isBodyCarried(r.out) ? t('craft.equipped') : t('craft.built')) : !requirement.ok ? t('craft.needBike') : !levelOk ? t('craft.levelBtn', { n: r.level }) : t('craft.make')}</button>
      </div>`;
    }).join('');

    for (const btn of this.recipeList.querySelectorAll('button[data-r]')) {
      btn.addEventListener('click', () => {
        if (this.onCraft) this.onCraft(RECIPES[+btn.dataset.r]);
      });
    }

    const entries = Object.entries(inv).filter(([, n]) => n > 0);
    const loadout = entries.filter(([id]) => isBodyCarried(id));
    const backpack = entries.filter(([id]) => !isBodyCarried(id));
    const cap = this.capacityProvider?.() || { used: backpack.length, max: 16 };
    $('invTitle').innerHTML = `${icon('backpack')} ${t('craft.invTitle', { used: cap.used, max: cap.max })}`;
    this.loadoutGrid.innerHTML = loadout.map(([id]) => `<div class="loadoutItem" title="${ITEMS[id].name} · ${ITEMS[id].carried}${ITEMS[id].bonus ? ` · ${ITEMS[id].bonus}` : ''}"><span>${icon(ITEMS[id].icon)}</span><div><b>${ITEMS[id].name}</b><small>${ITEMS[id].carried}${ITEMS[id].bonus ? ` · ${ITEMS[id].bonus}` : ''}</small></div></div>`).join('')
      || `<span class="loadoutEmpty">${t('craft.noGear')}</span>`;
    const cells = backpack.flatMap(([id,n]) => { const type=ITEMS[id].type,max=['gear','armor'].includes(type)?1:type==='placeable'?10:20; const out=[]; for(let left=n;left>0;left-=max)out.push([id,Math.min(max,left)]); return out; });
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
    const stacks = (obj, includeBodyCarried = true) => Object.entries(obj).filter(([id, n]) => n > 0 && (includeBodyCarried || !isBodyCarried(id))).flatMap(([id, n]) => {
      const max = stackMax(id), out = [];
      for (let left = n; left > 0; left -= max) out.push({ id, amount: Math.min(max, left) });
      return out;
    });
    const render = (obj, from, emptyLabel = true) => stacks(obj).map(({ id, amount }) =>
      `<button class="storageItem" data-id="${id}" data-from="${from}" data-amount="${amount}" title="${t('storage.moveStack')}"><span>${icon(ITEMS[id]?.icon || 'backpack')}</span><em>${ITEMS[id]?.name || id}</em><b>×${amount}</b></button>`).join('') || (emptyLabel ? `<span class="empty">${t('storage.empty')}</span>` : '');
    const playerStacks = stacks(inv, false);
    const equipped = Object.entries(inv).filter(([id, n]) => n > 0 && isBodyCarried(id));
    const used = capacity?.used ?? playerStacks.length, max = capacity?.max ?? 16;
    $('storagePlayerTitle').textContent = t('storage.playerTitle', { used, max });
    $('storageContainerTitle').textContent = t('storage.containerTitle', { n: stacks(storage).length });
    this.storageLoadout.innerHTML = equipped.length
      ? `<small>${t('storage.onBody')}</small><span>${equipped.map(([id]) => `<i title="${ITEMS[id].name} · ${ITEMS[id].carried}">${icon(ITEMS[id].icon)}</i>`).join('')}</span>`
      : '';
    this.storagePlayer.innerHTML = playerStacks.map(({ id, amount }) =>
      `<button class="storageItem" data-id="${id}" data-from="player" data-amount="${amount}" title="${t('storage.moveStack')}"><span>${icon(ITEMS[id]?.icon || 'backpack')}</span><em>${ITEMS[id]?.name || id}</em><b>×${amount}</b></button>`).join('')
      + Array.from({ length: Math.max(0, max - used) }, () => `<span class="storageSlotEmpty" title="${t('storage.freeSlot')}"></span>`).join('');
    this.storageContainer.innerHTML = render(storage, 'container');
    for (const btn of this.storageEl.querySelectorAll('.storageItem')) btn.onclick = () => this.onStorageMove?.(btn.dataset.from, btn.dataset.id, +btn.dataset.amount);
  }

  // ---- Overlay (Menü / Pause / Tod) ----
  showOverlay(kind, opts = {}) {
    if (!kind) {
      this.overlay.classList.add('hidden');
      delete this.overlay.dataset.kind;
      this.toasts.classList.remove('suppressed');
      return;
    }
    this.overlay.classList.remove('hidden');
    this.overlay.dataset.kind = kind;
    // Zustand merken, damit ein Sprachwechsel das Overlay neu übersetzen kann.
    this._overlayState = { kind, opts };
    // Menü-Wizard: Das Hauptmenü startet beim Login- bzw. Modus-Schritt,
    // Pause und Tod zeigen direkt die Spiel-Buttons ("game").
    this.overlay.dataset.step = kind === 'menu' ? (opts.startStep || 'login') : 'game';
    this.toasts.classList.toggle('suppressed', kind === 'pause');
    this.ovControls.classList.toggle('hidden', kind === 'dead');
    this.cameraChoice.classList.toggle('hidden', kind === 'dead');
    this.btnNew.classList.toggle('hidden', kind === 'pause');
    // Aus der Pause führt der Weg zurück zur Modus-Auswahl (Solo wie Koop).
    this.btnMainMenu.classList.toggle('hidden', kind !== 'pause');
    // Der Mitspieler-Respawn ist nur auf dem Todesbildschirm relevant.
    this._coopPartner = kind === 'dead' ? (opts.coopPartner || null) : null;
    this.btnRespawnPartner.classList.toggle('hidden', !this._coopPartner);
    if (kind === 'menu') {
      this.ovKicker.textContent = t('menu.kicker');
      this.ovTitle.innerHTML = `${icon('tent')} ${t('menu.title')}`;
      this.ovSub.textContent = t('menu.tagline');
      this.btnPlay.innerHTML = `${icon('play')} ${opts.hasSave ? t('menu.continueGame') : t('menu.play')}`;
      this.btnNew.classList.toggle('hidden', !opts.hasSave);
      this.btnNew.innerHTML = `${icon('sprout')} ${t('menu.newGame')}`;
    } else if (kind === 'pause') {
      this.ovKicker.textContent = opts.coop ? t('pause.kickerCoop') : t('pause.kickerSolo');
      this.ovTitle.innerHTML = `${icon('pause')} ${opts.coop ? t('pause.titleCoop') : t('pause.titleSolo')}`;
      this.ovSub.textContent = opts.coop ? t('pause.subCoop') : t('pause.subSolo');
      this.btnPlay.innerHTML = `${icon('play')} ${t('pause.resume')}`;
    } else if (kind === 'dead') {
      this.ovKicker.textContent = t('dead.kicker');
      this.ovTitle.innerHTML = `${icon('skull')} ${t('dead.title')}`;
      this.ovSub.textContent = t('dead.survived', {
        days: opts.days,
        dayWord: opts.days === 1 ? t('dead.day') : t('dead.days'),
        cause: opts.cause || '',
      });
      this.btnPlay.disabled = true;
      this.btnRespawnPartner.disabled = true;
      this.setRespawnCountdown(opts.wait ?? 20000);
      this.btnNew.classList.remove('hidden');
      this.btnNew.innerHTML = `${icon('sprout')} ${t('menu.newGame')}`;
    }
    if (kind !== 'dead') this.btnPlay.disabled = false;
  }

  setRespawnCountdown(ms) {
    const ready = ms <= 0;
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const min = Math.floor(seconds / 60);
    const sec = String(seconds % 60).padStart(2, '0');
    const partner = this._coopPartner;
    this.btnPlay.disabled = !ready;
    if (partner) {
      // Im Koop wählt man den Spawnpunkt: eigenes Zelt oder beim Mitspieler.
      const name = partner.length > 14 ? `${partner.slice(0, 13)}…` : partner;
      this.btnPlay.innerHTML = ready ? `${icon('tent')} Am Zelt wiederbeleben` : `${icon('clock')} Wiederbeleben in ${min}:${sec}`;
      this.btnRespawnPartner.disabled = !ready;
      this.btnRespawnPartner.innerHTML = `${icon('tent')} Bei ${name}`;
    } else {
      this.btnPlay.innerHTML = ready ? `${icon('rotate')} Jetzt wiederbeleben` : `${icon('clock')} Wiederbeleben in ${min}:${sec}`;
    }
  }
}
