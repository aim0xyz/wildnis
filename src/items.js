// Item- und Rezept-Definitionen

export const ITEMS = {
  hand: { name: 'Hand', icon: 'fist', type: 'tool' },
  holz: { name: 'Holz', icon: 'wood', type: 'material' },
  stein: { name: 'Stein', icon: 'rock', type: 'material' },
  fell: { name: 'Fell', icon: 'wool', type: 'material' },
  eisenerz: { name: 'Eisenerz', icon: 'ore', type: 'material' },
  eisen: { name: 'Eisenbarren', icon: 'metal', type: 'material' },
  pelzmantel: { name: 'Pelzmantel', icon: 'coat', type: 'armor', once: true },
  beeren: { name: 'Beeren', icon: 'berries', type: 'food', hunger: 14, thirst: 5, hp: 0 },
  fleisch_roh: { name: 'Rohes Fleisch', icon: 'meat', type: 'food', hunger: 10, hp: -6 },
  fleisch: { name: 'Gebratenes Fleisch', icon: 'food', type: 'food', hunger: 38, thirst: -3, hp: 10 },
  // Werkzeuge mit Haltbarkeit (dura = maximale Nutzungen; bei der Fackel: Brenndauer in Sekunden)
  axt: { name: 'Axt', icon: 'axe', type: 'tool', once: true, dura: 70 },
  spitzhacke: { name: 'Spitzhacke', icon: 'pickaxe', type: 'tool', once: true, dura: 70 },
  bogen: { name: 'Bogen', icon: 'bow', type: 'tool', once: true, dura: 60, ranged: true },
  fackel: { name: 'Fackel', icon: 'torch', type: 'tool', once: true, dura: 100, burns: true },
  hammer: { name: 'Bauhammer', icon: 'hammer', type: 'tool', once: true, dura: 30 },
  angel: { name: 'Angel', icon: 'fishing', type: 'tool', once: true, dura: 80 },
  laterne: { name: 'Laterne', icon: 'lantern', type: 'tool', once: true, dura: 240, burns: true },
  metallaxt: { name: 'Metallaxt', icon: 'axe', type: 'tool', once: true, dura: 160 },
  metallhacke: { name: 'Metallspitzhacke', icon: 'pickaxe', type: 'tool', once: true, dura: 160 },
  feldflasche: { name: 'Feldflasche', icon: 'bottle', type: 'gear', once: true },
  grosser_rucksack: { name: 'Großer Rucksack', icon: 'backpack', type: 'gear', once: true },
  pfeil: { name: 'Pfeil', icon: 'arrow', type: 'ammo' },
  lagerfeuer: { name: 'Lagerfeuer', icon: 'fire', type: 'placeable', build: 'campfire' },
  holzwand: { name: 'Holzwand', icon: 'wall', type: 'placeable', build: 'wall' },
  wildtor: { name: 'Wildtor', icon: 'gate', type: 'placeable', build: 'gate' },
  zelt: { name: 'Zelt', icon: 'tent', type: 'placeable', build: 'tent' },
  regenfaenger: { name: 'Regenfänger', icon: 'raincatcher', type: 'placeable', build: 'raincatcher' },
  floss: { name: 'Floß', icon: 'raft', type: 'placeable', build: 'raft' },
  truhe: { name: 'Holztruhe', icon: 'chest', type: 'placeable', build: 'chest' },
  werkbank: { name: 'Werkbank', icon: 'workbench', type: 'placeable', build: 'workbench' },
  holzdach: { name: 'Holzdach', icon: 'roof', type: 'placeable', build: 'roof' },
};

export const RECIPES = [
  { out: 'axt', cost: { holz: 3, stein: 2 }, desc: 'Fällt Bäume 3× schneller · nutzt sich mit der Zeit ab' },
  { out: 'spitzhacke', cost: { holz: 3, stein: 3 }, desc: 'Baut Steine 3× schneller ab · nutzt sich ab' },
  { out: 'bogen', cost: { holz: 4, fell: 1 }, desc: 'Fernkampf-Bogen — verschießt Pfeile auf die Jagd', level: 2 },
  { out: 'pfeil', cost: { holz: 2, stein: 1 }, yield: 4, desc: 'Munition für den Bogen — 4 Pfeile pro Craft', level: 2 },
  { out: 'fackel', cost: { holz: 2 }, desc: 'Tragbares Licht in der Hand — brennt herunter, hält Wölfe fern', level: 2 },
  { out: 'hammer', cost: { holz: 3, stein: 1 }, desc: 'Gebäude abbauen und Material retten · nutzt sich ab' },
  { out: 'lagerfeuer', cost: { holz: 5, stein: 3 }, desc: 'Fleisch braten (E) · mit Holz anfeuern (E) — hält Wölfe fern' },
  { out: 'holzwand', cost: { holz: 4 }, desc: 'Schützt dein Camp' },
  { out: 'wildtor', cost: { holz: 4, stein: 2 }, desc: 'Ersetzt eine Holzwand — du kommst durch, Tiere nicht' },
  { out: 'zelt', cost: { holz: 10, fell: 2 }, desc: 'Schlafen bei Nacht (E) + Spawnpunkt', level: 2 },
  { out: 'regenfaenger', cost: { holz: 7, stein: 2 }, desc: 'Sammelt bei Regen sauberes Trinkwasser', level: 2 },
  { out: 'pelzmantel', cost: { fell: 6 }, desc: 'Schützt dauerhaft vor Kälte in Bergen und bei Regen', level: 4 },
  { out: 'floss', cost: { holz: 16, fell: 2 }, desc: 'Auf Wasser platzieren · mit E einsteigen und die Küste erkunden', level: 3 },
  { out: 'truhe', cost: { holz: 8 }, desc: 'Lagert Vorräte sicher im Camp' },
  { out: 'werkbank', cost: { holz: 12, stein: 6 }, desc: 'Schaltet fortgeschrittene Ausrüstung frei', level: 3 },
  { out: 'holzdach', cost: { holz: 7 }, desc: 'Schützt vor Regen und Auskühlung', level: 3 },
  { out: 'angel', cost: { holz: 5, fell: 1 }, desc: 'Fische an tiefem Wasser fangen', station: 'workbench', level: 3 },
  { out: 'eisen', cost: { eisenerz: 2, holz: 1 }, yield: 1, desc: 'Erz am Feuer der Werkbank verhütten', station: 'workbench', level: 4 },
  { out: 'metallaxt', cost: { holz: 3, eisen: 3 }, desc: 'Langlebige Axt mit hoher Schlagkraft', station: 'workbench', level: 5 },
  { out: 'metallhacke', cost: { holz: 3, eisen: 3 }, desc: 'Langlebige Spitzhacke für Erz', station: 'workbench', level: 5 },
  { out: 'laterne', cost: { eisen: 2, holz: 1 }, desc: 'Helles, lang brennendes Expeditionslicht', station: 'workbench', level: 5 },
  { out: 'feldflasche', cost: { fell: 2, eisen: 1 }, desc: 'Durst sinkt 35% langsamer', station: 'workbench', level: 4 },
  { out: 'grosser_rucksack', cost: { fell: 5, eisen: 2 }, desc: 'Erweitert das Inventar von 16 auf 28 Plätze', station: 'workbench', level: 6 },
];

// Feste Werkzeug-Slots: immer an derselben Nummer, ausgegraut wenn (noch) nicht vorhanden.
// So bleibt die Muskelerinnerung stabil – die Axt ist z.B. immer die 2.
export const TOOL_BELT = ['hand', 'axt', 'spitzhacke', 'bogen', 'fackel', 'hammer', 'angel', 'laterne', 'metallaxt', 'metallhacke'];

// Dynamische Slots danach (nur wenn vorhanden): Nahrung & platzierbare Bauten.
// Pfeile sind Munition und erscheinen als Zähler auf dem Bogen-Slot.
export const HOTBAR_DYNAMIC = ['beeren', 'fleisch_roh', 'fleisch', 'lagerfeuer', 'holzwand', 'wildtor', 'zelt', 'regenfaenger', 'floss', 'truhe', 'werkbank', 'holzdach'];

// Ein Slot ist benutzbar, wenn es die Hand ist oder das Item im Inventar liegt.
export function slotUsable(id, inv) {
  return id === 'hand' || (inv[id] || 0) > 0;
}

// Baut die Hotbar-Reihenfolge: feste Werkzeug-Slots + vorhandene dynamische Items.
export function buildHotbar(inv) {
  return [...TOOL_BELT, ...HOTBAR_DYNAMIC.filter((id) => (inv[id] || 0) > 0)];
}

// Schaden pro Waffe/Werkzeug
export function toolDamage(toolId, targetKind) {
  if (targetKind === 'tree' && toolId === 'metallaxt') return 5;
  if (targetKind === 'rock' && toolId === 'metallhacke') return 5;
  if (targetKind === 'tree') return toolId === 'axt' ? 3 : 1;
  if (targetKind === 'rock') return toolId === 'spitzhacke' ? 3 : 1;
  // Tiere
  if (toolId === 'bogen') return 5;
  if (toolId === 'axt' || toolId === 'spitzhacke') return 2;
  return 1;
}
