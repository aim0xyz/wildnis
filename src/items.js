// Item- und Rezept-Definitionen

export const ITEMS = {
  hand: { name: 'Hand', icon: '✊', type: 'tool' },
  holz: { name: 'Holz', icon: '🪵', type: 'material' },
  stein: { name: 'Stein', icon: '🪨', type: 'material' },
  fell: { name: 'Fell', icon: '🧶', type: 'material' },
  beeren: { name: 'Beeren', icon: '🫐', type: 'food', hunger: 14, hp: 0 },
  fleisch_roh: { name: 'Rohes Fleisch', icon: '🥩', type: 'food', hunger: 10, hp: -6 },
  fleisch: { name: 'Gebratenes Fleisch', icon: '🍖', type: 'food', hunger: 38, hp: 10 },
  axt: { name: 'Axt', icon: '🪓', type: 'tool', once: true },
  spitzhacke: { name: 'Spitzhacke', icon: '⛏️', type: 'tool', once: true },
  speer: { name: 'Speer', icon: '🔱', type: 'tool', once: true },
  fackel: { name: 'Fackel', icon: '🕯️', type: 'placeable', build: 'torch' },
  lagerfeuer: { name: 'Lagerfeuer', icon: '🔥', type: 'placeable', build: 'campfire' },
  holzwand: { name: 'Holzwand', icon: '🪚', type: 'placeable', build: 'wall' },
  zelt: { name: 'Zelt', icon: '⛺', type: 'placeable', build: 'tent' },
};

export const RECIPES = [
  { out: 'axt', cost: { holz: 3, stein: 2 }, desc: 'Fällt Bäume 3× schneller' },
  { out: 'spitzhacke', cost: { holz: 3, stein: 3 }, desc: 'Baut Steine 3× schneller ab' },
  { out: 'speer', cost: { holz: 4, stein: 2 }, desc: 'Waffe für die Jagd (hoher Schaden, mehr Reichweite)' },
  { out: 'fackel', cost: { holz: 2 }, desc: 'Platzierbares Licht — hält Wölfe fern' },
  { out: 'lagerfeuer', cost: { holz: 5, stein: 3 }, desc: 'Fleisch braten (E) — hält Wölfe fern' },
  { out: 'holzwand', cost: { holz: 4 }, desc: 'Schützt dein Camp' },
  { out: 'zelt', cost: { holz: 10, fell: 2 }, desc: 'Schlafen bei Nacht (E) + Spawnpunkt' },
];

// Reihenfolge der Hotbar-Slots (nur vorhandene Items werden angezeigt)
export const HOTBAR_ORDER = [
  'hand', 'axt', 'spitzhacke', 'speer',
  'beeren', 'fleisch_roh', 'fleisch',
  'fackel', 'lagerfeuer', 'holzwand', 'zelt',
];

// Schaden pro Waffe/Werkzeug
export function toolDamage(toolId, targetKind) {
  if (targetKind === 'tree') return toolId === 'axt' ? 3 : 1;
  if (targetKind === 'rock') return toolId === 'spitzhacke' ? 3 : 1;
  // Tiere
  if (toolId === 'speer') return 5;
  if (toolId === 'axt' || toolId === 'spitzhacke') return 2;
  return 1;
}
