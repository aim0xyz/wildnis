// Zentrale Lokalisierung. Englisch ist Standard (Portal-Zielgruppe), Deutsch
// als Umschaltoption. UI-Chrome läuft über t(key); strukturierter Content
// (Items, Rezepte, Tiere, Bauten) wird über applyContentLanguage() direkt in
// den Datenobjekten lokalisiert, damit die ~100 bestehenden .name-Lesestellen
// unverändert weiterfunktionieren.
import { applyContentLanguage } from './i18nContent.js';
import { applyWorldLanguage } from './i18nWorld.js';
import { UI } from './i18nUI.js';

const STORAGE_KEY = 'wildnis.lang';
const SUPPORTED = ['en', 'de'];
const FALLBACK = 'en';

function detect() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch { /* localStorage evtl. gesperrt */ }
  const nav = (navigator.language || navigator.languages?.[0] || FALLBACK).slice(0, 2).toLowerCase();
  return nav === 'de' ? 'de' : FALLBACK;
}

let lang = detect();
const listeners = new Set();

export function getLang() { return lang; }

export function setLang(next) {
  if (!SUPPORTED.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* egal */ }
  applyContentLanguage(lang);
  applyWorldLanguage(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((fn) => fn(lang));
}

export function toggleLang() { setLang(lang === 'en' ? 'de' : 'en'); }

// Abonniert Sprachwechsel; gibt eine Abmelde-Funktion zurück.
export function onLangChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }

// Übersetzt einen UI-Schlüssel. params interpoliert {name}-Platzhalter.
export function t(key, params) {
  const table = UI[lang] || UI[FALLBACK];
  let str = table[key];
  if (str === undefined) str = UI[FALLBACK][key];
  if (str === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

// Setzt alle statischen [data-i18n*]-Knoten im DOM auf die aktuelle Sprache.
export function hydrateDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
}

// Verdrahtet den DE/EN-Umschalter im Menü-Footer und hält Statik synchron.
export function initI18nDom() {
  hydrateDom();
  onLangChange(() => hydrateDom());
  const btn = document.getElementById('langToggle');
  if (btn) {
    const sync = () => { btn.textContent = lang === 'en' ? 'DE' : 'EN'; };
    sync();
    onLangChange(sync);
    btn.addEventListener('click', () => toggleLang());
  }
}

// Beim Modul-Load sofort die erkannte Sprache auf den Content anwenden,
// bevor irgendein Screen rendert.
applyContentLanguage(lang);
applyWorldLanguage(lang);
if (typeof document !== 'undefined') document.documentElement.lang = lang;
