// Item- und Rezept-Definitionen

export const ITEMS = {
  hand: { name: 'Hand', icon: 'fist', type: 'tool' },
  holz: { name: 'Holz', icon: 'wood', type: 'material' },
  stein: { name: 'Stein', icon: 'rock', type: 'material' },
  fell: { name: 'Fell', icon: 'wool', type: 'material' },
  krokodilleder: { name: 'Krokodilleder', icon: 'wool', type: 'material' },
  eisenerz: { name: 'Eisenerz', icon: 'ore', type: 'material' },
  eisen: { name: 'Eisenbarren', icon: 'metal', type: 'material' },
  pelzmantel: { name: 'Pelzmantel', icon: 'coat', type: 'armor', once: true, carried: 'Kleidung' },
  beeren: { name: 'Beeren', icon: 'berries', type: 'food', hunger: 14, thirst: 5, hp: 0 },
  fleisch_roh: { name: 'Rohes Fleisch', icon: 'meat', type: 'food', hunger: 10, hp: -6 },
  fleisch: { name: 'Gebratenes Fleisch', icon: 'food', type: 'food', hunger: 38, thirst: -3, hp: 10 },
  pilz: { name: 'Waldpilz', icon: 'mushroom', type: 'food', hunger: 6, thirst: 1, hp: 0 },
  leuchtpilz: { name: 'Leuchtpilz', icon: 'mushroom', type: 'ingredient' },
  heilkraut: { name: 'Heilkraut', icon: 'sprout', type: 'ingredient' },
  verband: { name: 'Kräuterverband', icon: 'heart', type: 'medicine', hp: 35 },
  pilzpfanne: { name: 'Pilzpfanne', icon: 'food', type: 'food', hunger: 42, thirst: 7, hp: 6, warmthSeconds: 150 },
  hoehlenragout: { name: 'Höhlenragout', icon: 'food', type: 'food', hunger: 58, thirst: 12, hp: 16, warmthSeconds: 300 },
  // Werkzeuge mit Haltbarkeit (dura = maximale Nutzungen; bei der Fackel: Brenndauer in Sekunden)
  axt: { name: 'Axt', icon: 'axe', type: 'tool', once: true, dura: 70, carried: 'Werkzeuggürtel' },
  spitzhacke: { name: 'Spitzhacke', icon: 'pickaxe', type: 'tool', once: true, dura: 70, carried: 'Werkzeuggürtel' },
  bogen: { name: 'Bogen', icon: 'bow', type: 'tool', once: true, dura: 60, ranged: true, carried: 'Rücken' },
  fackel: { name: 'Fackel', icon: 'torch', type: 'tool', once: true, dura: 100, burns: true, carried: 'Werkzeuggürtel' },
  hammer: { name: 'Bauhammer', icon: 'hammer', type: 'tool', once: true, dura: 30, carried: 'Werkzeuggürtel' },
  angel: { name: 'Angel', icon: 'fishing', type: 'tool', once: true, dura: 80, carried: 'Rücken' },
  laterne: { name: 'Laterne', icon: 'lantern', type: 'tool', once: true, dura: 240, burns: true, carried: 'Werkzeuggürtel' },
  metallaxt: { name: 'Metallaxt', icon: 'axe', type: 'tool', once: true, dura: 160, carried: 'Werkzeuggürtel' },
  metallhacke: { name: 'Metallspitzhacke', icon: 'pickaxe', type: 'tool', once: true, dura: 160, carried: 'Werkzeuggürtel' },
  feldflasche: { name: 'Feldflasche', icon: 'bottle', type: 'gear', once: true },
  pfadfinderstiefel: { name: 'Pfadfinderstiefel', icon: 'boots', type: 'armor', once: true, carried: 'Schuhe', bonus: '+12% Lauftempo' },
  verstaerkte_hose: { name: 'Verstärkte Wildnishose', icon: 'pants', type: 'armor', once: true, carried: 'Beine', bonus: '+25 Ausdauer' },
  schutzhemd: { name: 'Verstärktes Schutzhemd', icon: 'shirt', type: 'armor', once: true, carried: 'Oberkörper', bonus: '+20 maximales Leben' },
  grosser_rucksack: { name: 'Großer Rucksack', icon: 'backpack', type: 'gear', once: true, carried: 'Rücken' },
  sammlergurt: { name: 'Sammlergurt', icon: 'backpack', type: 'gear', once: true, carried: 'Gürtel' },
  jagdkoecher: { name: 'Jagdköcher', icon: 'arrow', type: 'gear', once: true, carried: 'Köcher' },
  bogensehne: { name: 'Geflochtene Sehne', icon: 'bow', type: 'gear', once: true, carried: 'Bogen-Upgrade' },
  eisenspitzen: { name: 'Eisen-Pfeilspitzen', icon: 'arrow', type: 'gear', once: true, carried: 'Bogen-Upgrade' },
  praezisionsschaefte: { name: 'Präzisionsschäfte', icon: 'arrow', type: 'gear', once: true, carried: 'Bogen-Upgrade' },
  hornbogen: { name: 'Hornverstärkter Bogen', icon: 'bow', type: 'gear', once: true, carried: 'Bogen-Upgrade' },
  wildmeisterbogen: { name: 'Wildmeisterbogen', icon: 'bow', type: 'gear', once: true, carried: 'Bogen-Upgrade' },
  jagdspeer: { name: 'Jagdspeer', icon: 'axe', type: 'tool', once: true, dura: 140, carried: 'Werkzeuggürtel' },
  // Die Lederrüstung ist die erste echte Schadensreduktion im Spiel. Drei
  // Teile ergeben zusammen 35 % — der Unterschied zwischen 3,5 und 5,4
  // überlebten Treffern eines Tier-12-Bären.
  lederweste: { name: 'Krokodilleder-Weste', icon: 'shirt', type: 'armor', once: true, carried: 'Oberkörper', bonus: '15% weniger Schaden', armor: .15 },
  lederbeinschutz: { name: 'Krokodilleder-Beinschutz', icon: 'pants', type: 'armor', once: true, carried: 'Beine', bonus: '10% weniger Schaden', armor: .10 },
  lederhelm: { name: 'Krokodilleder-Haube', icon: 'coat', type: 'armor', once: true, carried: 'Kopf', bonus: '10% weniger Schaden', armor: .10 },
  survivalset: { name: 'Survival-Set', icon: 'food', type: 'gear', once: true },
  expeditionsrucksack: { name: 'Expeditionsrucksack', icon: 'backpack', type: 'gear', once: true, carried: 'Rücken' },
  werkzeugpflege: { name: 'Werkzeugpflege-Set', icon: 'hammer', type: 'gear', once: true },
  veteranenabzeichen: { name: 'Veteranenabzeichen', icon: 'compass', type: 'gear', once: true, carried: 'Abzeichen' },
  gelaendereifen: { name: 'Geländereifen', icon: 'bike', type: 'gear', once: true, carried: 'Fahrrad-Upgrade' },
  gepaecktraeger: { name: 'Expeditions-Gepäckträger', icon: 'backpack', type: 'gear', once: true, carried: 'Fahrrad-Upgrade' },
  pfeil: { name: 'Pfeil', icon: 'arrow', type: 'ammo' },
  lagerfeuer: { name: 'Lagerfeuer', icon: 'fire', type: 'placeable', build: 'campfire' },
  holzwand: { name: 'Holzwand', icon: 'wall', type: 'placeable', build: 'wall' },
  steinmauer: { name: 'Steinmauer', icon: 'wall', type: 'placeable', build: 'stonewall' },
  wildtor: { name: 'Wildtor', icon: 'gate', type: 'placeable', build: 'gate' },
  zelt: { name: 'Zelt', icon: 'tent', type: 'placeable', build: 'tent' },
  regenfaenger: { name: 'Regenfänger', icon: 'raincatcher', type: 'placeable', build: 'raincatcher' },
  floss: { name: 'Floß', icon: 'raft', type: 'placeable', build: 'raft' },
  truhe: { name: 'Holztruhe', icon: 'chest', type: 'placeable', build: 'chest' },
  werkbank: { name: 'Werkbank', icon: 'workbench', type: 'placeable', build: 'workbench' },
  holzdach: { name: 'Holzdach', icon: 'roof', type: 'placeable', build: 'roof' },
  fahrrad: { name: 'Geländefahrrad', icon: 'bike', type: 'placeable', build: 'bike' },
  hochsitz: { name: 'Hochsitz', icon: 'tower', type: 'placeable', build: 'watchtower' },
};

export const RECIPES = [
  { out: 'axt', cost: { holz: 3, stein: 2 }, desc: 'Fällt Bäume 3× schneller · nutzt sich mit der Zeit ab' },
  { out: 'spitzhacke', cost: { holz: 3, stein: 3 }, desc: 'Baut Steine 3× schneller ab · nutzt sich ab' },
  { out: 'bogen', cost: { holz: 4, fell: 1 }, desc: 'Fernkampf-Bogen — verschießt Pfeile auf die Jagd', level: 2 },
  { out: 'pfeil', cost: { holz: 2, stein: 1 }, yield: 4, desc: 'Munition für den Bogen — 4 Pfeile pro Craft', level: 2 },
  { out: 'fackel', cost: { holz: 2 }, desc: 'Tragbares Licht in der Hand — brennt herunter, hält Wölfe fern', level: 2 },
  { out: 'verband', cost: { heilkraut: 3, fell: 1 }, desc: 'Unterwegs anwendbar · stellt 35 Gesundheit wieder her', level: 2 },
  { out: 'hammer', cost: { holz: 3, stein: 1 }, desc: 'Gebäude abbauen und Material retten · nutzt sich ab' },
  { out: 'lagerfeuer', cost: { holz: 5, stein: 3 }, desc: 'Fleisch braten (E) · mit Holz anfeuern (E) — hält Wölfe fern' },
  { out: 'holzwand', cost: { holz: 4 }, desc: 'Schützt dein Camp' },
  { out: 'steinmauer', cost: { stein: 10 }, desc: 'Massive, verbindbare Lagerbegrenzung aus überschüssigem Stein', station: 'workbench', level: 4 },
  { out: 'wildtor', cost: { holz: 4, stein: 2 }, desc: 'Ersetzt eine Wand — du kommst durch, Tiere nicht' },
  { out: 'zelt', cost: { holz: 10, fell: 2 }, desc: 'Schlafen bei Nacht (E) + Spawnpunkt', level: 2 },
  { out: 'regenfaenger', cost: { holz: 7, stein: 2 }, desc: 'Sammelt bei Regen sauberes Trinkwasser', level: 2 },
  { out: 'pelzmantel', cost: { fell: 6 }, desc: 'Schützt dauerhaft vor Kälte in Bergen und bei Regen', level: 4 },
  { out: 'floss', cost: { holz: 16, fell: 2 }, desc: 'Auf Wasser platzieren · mit E einsteigen und die Küste erkunden', level: 3 },
  { out: 'truhe', cost: { holz: 8 }, desc: 'Lagert Vorräte sicher im Camp' },
  { out: 'werkbank', cost: { holz: 12, stein: 6 }, desc: 'Schaltet fortgeschrittene Ausrüstung frei', level: 3 },
  { out: 'holzdach', cost: { holz: 7 }, desc: 'Schützt vor Regen und Auskühlung', level: 3 },
  { out: 'hochsitz', cost: { holz: 18, fell: 2 }, desc: 'Sichere erhöhte Jagdplattform · mit E die Leiter benutzen', station: 'workbench', level: 4 },
  { out: 'angel', cost: { holz: 5, fell: 1 }, desc: 'Fische an tiefem Wasser fangen', station: 'workbench', level: 3 },
  { out: 'eisen', cost: { eisenerz: 2, stein: 2, holz: 1 }, yield: 1, desc: 'Erz mit einer steinernen Ofenauskleidung an der Werkbank verhütten', station: 'workbench', level: 4 },
  { out: 'metallaxt', cost: { holz: 3, eisen: 3 }, desc: 'Langlebige Axt mit hoher Schlagkraft', station: 'workbench', level: 5 },
  { out: 'metallhacke', cost: { holz: 3, eisen: 3 }, desc: 'Langlebige Spitzhacke für Erz', station: 'workbench', level: 5 },
  { out: 'laterne', cost: { eisen: 2, holz: 1 }, desc: 'Helles, lang brennendes Expeditionslicht', station: 'workbench', level: 5 },
  { out: 'feldflasche', cost: { fell: 2, eisen: 1 }, desc: 'Durst sinkt 35% langsamer', station: 'workbench', level: 4 },
  { out: 'pfadfinderstiefel', cost: { fell: 4, eisen: 1 }, desc: 'Am Körper getragen · 12% schneller laufen und sprinten', station: 'workbench', level: 5 },
  { out: 'verstaerkte_hose', cost: { fell: 6, eisen: 2 }, desc: 'Am Körper getragen · 25 zusätzliche Ausdauer', station: 'workbench', level: 6 },
  { out: 'schutzhemd', cost: { fell: 7, eisen: 4 }, desc: 'Am Körper getragen · 20 zusätzliche maximale Lebenspunkte', station: 'workbench', level: 7 },
  { out: 'grosser_rucksack', cost: { fell: 5, eisen: 2 }, desc: 'Erweitert das Inventar von 16 auf 28 Plätze', station: 'workbench', level: 6 },
  { out: 'fahrrad', cost: { holz: 8, eisen: 8, fell: 2 }, desc: 'Auf festem Boden platzieren · mit E aufsteigen · deutlich schneller reisen', station: 'workbench', level: 6 },
  { out: 'gelaendereifen', cost: { eisen: 4, fell: 5 }, desc: 'Upgrade: höheres Tempo und bessere Steigfähigkeit für alle Fahrräder', station: 'workbench', level: 7, requiresBike: true },
  { out: 'gepaecktraeger', cost: { eisen: 5, holz: 4, fell: 3 }, desc: 'Upgrade: senkt Hunger- und Durstverbrauch während der Fahrt um 25%', station: 'workbench', level: 8, requiresBike: true },
  { out: 'sammlergurt', cost: { fell: 6, eisen: 2 }, desc: 'Sichere Taschen bringen dauerhaft 25% mehr Holz, Stein und Erz', station: 'workbench', level: 7 },
  { out: 'bogensehne', cost: { fell: 3, holz: 2 }, desc: 'Upgrade: Bogen spannt sich 35% schneller, kürzere Pause zwischen Schüssen', station: 'workbench', level: 6, upgrade: true },
  { out: 'jagdkoecher', cost: { fell: 5, eisen: 3, pfeil: 8 }, desc: 'Jeder Pfeil-Craft ergibt 8 Pfeile · Bogen verursacht +1 Schaden', station: 'workbench', level: 8 },
  { out: 'eisenspitzen', cost: { eisen: 4, stein: 3 }, desc: 'Upgrade: Pfeile mit Eisenspitze — Bogen verursacht +2 Schaden', station: 'workbench', level: 9, upgrade: true },
  { out: 'praezisionsschaefte', cost: { holz: 6, eisen: 2, fell: 1 }, desc: 'Upgrade: Pfeile fliegen 40% schneller und weiter', station: 'workbench', level: 10, upgrade: true },
  { out: 'survivalset', cost: { fell: 8, eisen: 3, fleisch: 4 }, desc: 'Hunger und Durst sinken dauerhaft 18% langsamer', station: 'workbench', level: 9 },
  { out: 'expeditionsrucksack', cost: { grosser_rucksack: 1, fell: 8, eisen: 5 }, desc: 'Rüstet den großen Rucksack auf 40 Inventarplätze auf', station: 'workbench', level: 10 },
  { out: 'werkzeugpflege', cost: { eisen: 7, holz: 5 }, desc: '35% Chance, dass Werkzeuge bei Benutzung keine Haltbarkeit verlieren', station: 'workbench', level: 11 },
  { out: 'veteranenabzeichen', cost: { eisen: 10, fell: 10 }, desc: 'Alle Waffen verursachen +1 Schaden · tägliche Überlebensvorräte verdoppelt', station: 'workbench', level: 12 },
  // Ab hier das Endgame. Vorher endete die Freischaltungskurve bei Level 12,
  // während die XP-Kurve bis 20 weiterlief — 73 % der Progression ohne ein
  // einziges neues Rezept. Rüstung und Bogen wechseln sich jetzt ab, damit
  // jeder zweite Aufstieg spürbar etwas ändert.
  { out: 'lederweste', cost: { krokodilleder: 8, fell: 4, eisen: 3 }, desc: 'Am Körper getragen · 15% weniger Schaden durch Angriffe', station: 'workbench', level: 13 },
  { out: 'hornbogen', cost: { krokodilleder: 5, holz: 8, eisen: 4 }, desc: 'Upgrade: verstärkter Bogen — +2 Schaden pro Pfeil', station: 'workbench', level: 14, upgrade: true },
  { out: 'lederbeinschutz', cost: { krokodilleder: 7, fell: 3, eisen: 3 }, desc: 'Am Körper getragen · 10% weniger Schaden durch Angriffe', station: 'workbench', level: 15 },
  { out: 'jagdspeer', cost: { krokodilleder: 4, eisen: 6, holz: 5 }, desc: 'Nahkampfwaffe mit 7 Schaden — die erste echte Alternative zum Bogen', station: 'workbench', level: 16 },
  { out: 'lederhelm', cost: { krokodilleder: 6, fell: 3, eisen: 2 }, desc: 'Am Körper getragen · 10% weniger Schaden durch Angriffe', station: 'workbench', level: 17 },
  { out: 'wildmeisterbogen', cost: { hornbogen: 1, krokodilleder: 9, eisen: 8 }, desc: 'Upgrade: Meisterbogen — nochmals +2 Schaden pro Pfeil', station: 'workbench', level: 19, upgrade: true },
];

// Die Zahlentasten 1–6 sind feste Aktionsplätze und werden immer angezeigt.
// Weitere Werkzeuge erscheinen erst dahinter, sobald sie hergestellt wurden.
export const TOOL_BELT = ['hand', 'axt', 'spitzhacke', 'bogen', 'fackel', 'hammer'];
export const HOTBAR_FIXED_COUNT = TOOL_BELT.length;
export const HOTBAR_EXTRA_TOOLS = ['angel', 'laterne', 'metallaxt', 'metallhacke', 'jagdspeer'];

// Dynamische Slots danach (nur wenn vorhanden): Nahrung & platzierbare Bauten.
// Pfeile sind Munition und erscheinen als Zähler auf dem Bogen-Slot.
export const HOTBAR_DYNAMIC = ['verband', 'beeren', 'pilz', 'pilzpfanne', 'hoehlenragout', 'fleisch_roh', 'fleisch', 'lagerfeuer', 'holzwand', 'steinmauer', 'wildtor', 'zelt', 'regenfaenger', 'floss', 'fahrrad', 'truhe', 'werkbank', 'holzdach', 'hochsitz'];

// Getragene Gegenstände gehören zum Loadout und nicht in den Rucksack.
// Feldflasche, Survival-Set und Werkzeugpflege bleiben echte Gepäckstücke.
export function isBodyCarried(id) {
  return id !== 'hand' && !!ITEMS[id]?.carried;
}

export function occupiesInventorySlot(id) {
  return id !== 'hand' && !isBodyCarried(id);
}

// Ein Slot ist benutzbar, wenn es die Hand ist oder das Item im Inventar liegt.
export function slotUsable(id, inv) {
  return id === 'hand' || (inv[id] || 0) > 0;
}

// Metall-Werkzeuge verdrängen ihre einfache Variante aus dem festen Slot,
// solange sie im Inventar sind. Zerbricht das Metall-Werkzeug, rückt das
// normale Werkzeug automatisch wieder auf Platz 2 bzw. 3.
export const TOOL_UPGRADES = { axt: 'metallaxt', spitzhacke: 'metallhacke' };

// Baut die Hotbar-Reihenfolge: feste Werkzeug-Slots + vorhandene dynamische Items.
export function buildHotbar(inv) {
  const belt = TOOL_BELT.map((id) => {
    const upgrade = TOOL_UPGRADES[id];
    return upgrade && (inv[upgrade] || 0) > 0 ? upgrade : id;
  });
  return [
    ...belt,
    ...HOTBAR_EXTRA_TOOLS.filter((id) => (inv[id] || 0) > 0 && !belt.includes(id)),
    ...HOTBAR_DYNAMIC.filter((id) => (inv[id] || 0) > 0),
  ];
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
