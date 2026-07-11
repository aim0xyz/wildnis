// Item- und Rezept-Definitionen

export const ITEMS = {
  hand: { name: 'Hand', icon: 'fist', type: 'tool' },
  holz: { name: 'Holz', icon: 'wood', type: 'material' },
  stein: { name: 'Stein', icon: 'rock', type: 'material' },
  fell: { name: 'Fell', icon: 'wool', type: 'material' },
  beeren: { name: 'Beeren', icon: 'berries', type: 'food', hunger: 14, hp: 0 },
  fleisch_roh: { name: 'Rohes Fleisch', icon: 'meat', type: 'food', hunger: 10, hp: -6 },
  fleisch: { name: 'Gebratenes Fleisch', icon: 'food', type: 'food', hunger: 38, hp: 10 },
  axt: { name: 'Axt', icon: 'axe', type: 'tool', once: true },
  spitzhacke: { name: 'Spitzhacke', icon: 'pickaxe', type: 'tool', once: true },
  speer: { name: 'Speer', icon: 'spear', type: 'tool', once: true },
  fackel: { name: 'Fackel', icon: 'torch', type: 'placeable', build: 'torch' },
  lagerfeuer: { name: 'Lagerfeuer', icon: 'fire', type: 'placeable', build: 'campfire' },
  holzwand: { name: 'Holzwand', icon: 'wall', type: 'placeable', build: 'wall' },
  wildtor: { name: 'Wildtor', icon: 'gate', type: 'placeable', build: 'gate' },
  zelt: { name: 'Zelt', icon: 'tent', type: 'placeable', build: 'tent' },
};

export const RECIPES = [
  { out: 'axt', cost: { holz: 3, stein: 2 }, desc: 'Fällt Bäume 3× schneller' },
  { out: 'spitzhacke', cost: { holz: 3, stein: 3 }, desc: 'Baut Steine 3× schneller ab' },
  { out: 'speer', cost: { holz: 4, stein: 2 }, desc: 'Waffe für die Jagd (hoher Schaden, mehr Reichweite)' },
  { out: 'fackel', cost: { holz: 2 }, desc: 'Platzierbares Licht — hält Wölfe fern' },
  { out: 'lagerfeuer', cost: { holz: 5, stein: 3 }, desc: 'Fleisch braten (E) — hält Wölfe fern' },
  { out: 'holzwand', cost: { holz: 4 }, desc: 'Schützt dein Camp' },
  { out: 'wildtor', cost: { holz: 6 }, desc: 'Passt an Holzwände — du kommst durch, Tiere nicht' },
  { out: 'zelt', cost: { holz: 10, fell: 2 }, desc: 'Schlafen bei Nacht (E) + Spawnpunkt' },
];

// Reihenfolge der Hotbar-Slots (nur vorhandene Items werden angezeigt)
export const HOTBAR_ORDER = [
  'hand', 'axt', 'spitzhacke', 'speer',
  'beeren', 'fleisch_roh', 'fleisch',
  'fackel', 'lagerfeuer', 'holzwand', 'wildtor', 'zelt',
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
