// Plattform-Abstraktion. Der normale Web-Build (`npm run build`) läuft komplett
// ohne diese Schicht in ihrer aktiven Form: IS_CRAZYGAMES ist dann false und
// jede Funktion hier ist ein sicherer No-Op. Nur der CrazyGames-Build
// (`npm run build:crazygames`, setzt VITE_TARGET=crazygames) aktiviert das SDK.
//
// Das CrazyGames-SDK v3 wird per <script> aus deren CDN geladen (in
// index.html von vite.config.js nur im crazygames-Modus injiziert). init() ist
// asynchron; bis dahin sind alle SDK-Aufrufe tabu. Das Data-Modul ist
// API-gleich zu localStorage (synchron) und synchronisiert für eingeloggte
// CrazyGames-Nutzer automatisch in die Cloud.

export const IS_CRAZYGAMES = import.meta.env.VITE_TARGET === 'crazygames';

let sdk = null;
let ready = false;
let environment = 'disabled';

// SDK-Aufrufe sind nur erlaubt, wenn wir im CrazyGames-Build sind, init()
// durchlief und wir nicht auf einer nicht autorisierten Domain ('disabled')
// laufen. Auf 'local' (localhost) liefert das SDK Demo-Verhalten — gut zum
// Testen.
function usable() {
  return IS_CRAZYGAMES && ready && environment !== 'disabled';
}

export function isPlatformReady() { return ready; }
export function platformEnvironment() { return environment; }

// Initialisiert das SDK. Fehlt das Script (Offline/Dev) oder wirft init(),
// bleibt ready=false und das Spiel läuft mit reinem localStorage weiter.
export async function initPlatform() {
  if (!IS_CRAZYGAMES) return;
  try {
    sdk = window.CrazyGames?.SDK || null;
    if (!sdk) { console.warn('[platform] CrazyGames SDK script not found'); return; }
    await sdk.init();
    environment = sdk.environment || 'disabled';
    ready = true;
  } catch (error) {
    console.warn('[platform] CrazyGames SDK init failed', error);
  }
}

// --- Lifecycle-Signale (No-Op auf Web / bei disabled) ----------------------
export function loadingStart() { if (usable()) try { sdk.game.loadingStart(); } catch { /* ignore */ } }
export function loadingStop() { if (usable()) try { sdk.game.loadingStop(); } catch { /* ignore */ } }
export function gameplayStart() { if (usable()) try { sdk.game.gameplayStart(); } catch { /* ignore */ } }
export function gameplayStop() { if (usable()) try { sdk.game.gameplayStop(); } catch { /* ignore */ } }
export function happytime() { if (usable()) try { sdk.game.happytime(); } catch { /* ignore */ } }

// --- Cloud-Speicher über das Data-Modul ------------------------------------
// Gibt auf Web/Dev null bzw. No-Op zurück; der Aufrufer nutzt dann weiter
// localStorage. Auf CrazyGames ist dies der cloud-synchronisierte Speicher.
export function cloudGet(key) {
  if (usable()) { try { return sdk.data.getItem(key); } catch { /* ignore */ } }
  return null;
}
export function cloudSet(key, value) {
  if (usable()) { try { sdk.data.setItem(key, value); } catch { /* ignore */ } }
}
export function cloudRemove(key) {
  if (usable()) { try { sdk.data.removeItem(key); } catch { /* ignore */ } }
}

// --- Audio-Mute über die Plattform (CrazyGames-Einstellungen) --------------
// CrazyGames stellt kein eigenes Mute-Event bereit, sondern das game.settings-
// Objekt mit `muteAudio`. Dessen Wert hat laut Doku Vorrang vor den eigenen
// Audio-Einstellungen des Spiels. Beide Helfer sind No-Op/false auf Web & Dev.
// Liefert den aktuellen muteAudio-Zustand der Plattform (false, wenn unbekannt).
export function platformMuteAudio() {
  if (usable()) { try { return !!sdk.game?.settings?.muteAudio; } catch { /* ignore */ } }
  return false;
}
// Registriert einen Callback, der bei jeder Änderung der Plattform-Einstellungen
// den aktuellen muteAudio-Zustand (bool) erhält.
export function onPlatformMuteChange(callback) {
  if (usable() && typeof sdk.game?.addSettingsChangeListener === 'function') {
    try {
      sdk.game.addSettingsChangeListener((s) => callback(!!s?.muteAudio));
    } catch { /* ignore */ }
  }
}

// --- CrazyGames-Nutzerkonto (optional, nur für Anzeige) --------------------
export async function getCrazyUser() {
  if (usable() && sdk.user?.isUserAccountAvailable) {
    try { return await sdk.user.getUser(); } catch { /* ignore */ }
  }
  return null;
}
export function onCrazyAuthChange(callback) {
  if (usable() && typeof sdk.user?.addAuthListener === 'function') {
    try { sdk.user.addAuthListener(callback); } catch { /* ignore */ }
  }
}
// Ist überhaupt ein CrazyGames-Konto-Login möglich? (Portal ja, eingebettet je
// nach Domain.) Nur dann macht der Anmelden-Button Sinn.
export function isCrazyAuthAvailable() {
  return usable() && !!sdk.user?.isUserAccountAvailable;
}
// Öffnet den CrazyGames-eigenen Login-Dialog. Liefert bei Erfolg den Nutzer,
// sonst null (abgebrochen/nicht verfügbar). Kein eigenes E-Mail/Passwort — das
// übernimmt komplett das SDK.
export async function showCrazyAuthPrompt() {
  if (isCrazyAuthAvailable() && typeof sdk.user?.showAuthPrompt === 'function') {
    try { return await sdk.user.showAuthPrompt(); } catch { /* abgebrochen */ }
  }
  return null;
}
// Ein möglichst stabiles CrazyGames-Token pro Nutzer (für Realtime-Kanäle). Das
// SDK liefert für eingeloggte Nutzer ein Token; sonst null → Aufrufer nutzt eine
// lokale Gast-ID (siehe main.js).
export async function getCrazyUserToken() {
  if (isCrazyAuthAvailable() && typeof sdk.user?.getUserToken === 'function') {
    try { return await sdk.user.getUserToken(); } catch { /* ignore */ }
  }
  return null;
}

// --- CrazyGames-Einladungslinks (Raum-Mechanik für Koop) -------------------
// Baut einen Einladungslink, der die übergebenen Parameter trägt (z.B. Raum-ID).
export function createInviteLink(params) {
  if (usable() && typeof sdk.game?.inviteLink === 'function') {
    try { return sdk.game.inviteLink(params); } catch { /* ignore */ }
  }
  return null;
}
// Liest einen Parameter, wenn das Spiel über einen Einladungslink geöffnet wurde.
export function getInviteParam(key) {
  if (usable() && typeof sdk.game?.getInviteParam === 'function') {
    try { return sdk.game.getInviteParam(key); } catch { /* ignore */ }
  }
  return null;
}
// Zeigt CrazyGames' native Einladen-Schaltfläche; liefert eine ID zum Ausblenden.
export function showInviteButton(params) {
  if (usable() && typeof sdk.game?.showInviteButton === 'function') {
    try { return sdk.game.showInviteButton(params); } catch { /* ignore */ }
  }
  return null;
}
export function hideInviteButton(id) {
  if (usable() && id != null && typeof sdk.game?.hideInviteButton === 'function') {
    try { sdk.game.hideInviteButton(id); } catch { /* ignore */ }
  }
}
// True, wenn das Spiel gerade im „Instant Multiplayer"-Kontext läuft (über einen
// Einladungslink geöffnet).
export function isInstantMultiplayer() {
  return usable() && !!sdk.game?.isInstantMultiplayer;
}

// --- Plattform-Räume (Party-System / Instant Multiplayer) ------------------
// Meldet der Plattform den aktuellen Raum-Zustand: mit `isJoinable`, `roomId`
// und `inviteParams` weiß deren Party-/Freundes-System, ob und wo Gäste
// beitreten können. No-Op auf Web/Dev.
export function updateRoom(input) {
  if (usable() && typeof sdk.game?.updateRoom === 'function') {
    try { sdk.game.updateRoom(input); } catch { /* ignore */ }
  }
}
// Signalisiert der Plattform, dass der Spieler den Raum verlassen hat.
export function leftRoom() {
  if (usable() && typeof sdk.game?.leftRoom === 'function') {
    try { sdk.game.leftRoom(); } catch { /* ignore */ }
  }
}
// Registriert einen Callback, der die `inviteParams` erhält, wenn ein Nutzer über
// eine Einladung beitritt — auch mitten im laufenden Spiel.
export function onJoinRoom(callback) {
  if (usable() && typeof sdk.game?.addJoinRoomListener === 'function') {
    try { sdk.game.addJoinRoomListener(callback); } catch { /* ignore */ }
  }
}
