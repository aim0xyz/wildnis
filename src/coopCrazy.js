// Broadcast-only Realtime für den CrazyGames-Build.
//
// Koop läuft auf CrazyGames NICHT über den Supabase-E-Mail-Login (der ist dort
// nicht erlaubt), sondern über einen eigenen anon-Client, der ausschließlich
// Realtime-Broadcast/Presence nutzt: kein Login, keine Session-Persistenz, keine
// DB-Schreibzugriffe. Die Räume kommen aus den CrazyGames-Einladungslinks
// (siehe platform.js), der Host bleibt autoritativ und speichert nur lokal.
//
// Der verwendete Schlüssel ist der öffentliche anon/publishable Key — derselbe,
// der ohnehin im Web-Bundle steckt; er trägt keine Rechte über die anon-Rolle
// hinaus. Vite lädt .env.local auch im crazygames-Modus, daher sind URL & Key
// beim `build:crazygames` verfügbar.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

const ANON_ID_KEY = 'wildnis_cg_guest_id';

// Stabile lokale Gast-ID (falls kein CrazyGames-Konto vorliegt), damit ein Gerät
// über Reloads hinweg dieselbe Spieler-Identität in der Koop-Welt behält.
export function localGuestId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = `guest_${(crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))}`;
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return `guest_${Math.random().toString(36).slice(2)}`;
  }
}

// Erzeugt den anon-Realtime-Client. null, wenn keine Supabase-Konfiguration
// vorliegt — dann bleibt Koop im CrazyGames-Build einfach aus.
export function createBroadcastClient() {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function isBroadcastConfigured() {
  return !!(url && key);
}
