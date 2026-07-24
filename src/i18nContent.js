// Lokalisierung des strukturierten Contents (Items & Rezepte). Deutsch ist in
// items.js eingebaut und wird beim Modul-Load als Snapshot gesichert; EN-Tabellen
// überschreiben die Anzeige-Felder in-place. applyContentLanguage() schaltet um.
import { ITEMS, RECIPES } from './items.js';

// --- Deutsch-Snapshot der übersetzbaren Felder (Rückschaltung) -------------
const DE_ITEMS = {};
for (const [id, def] of Object.entries(ITEMS)) {
  DE_ITEMS[id] = { name: def.name, carried: def.carried, bonus: def.bonus };
}
const DE_RECIPES = {};
for (const r of RECIPES) DE_RECIPES[r.out] = r.desc;

// --- Englische Item-Namen (+ carried/bonus wo vorhanden) -------------------
const EN_ITEMS = {
  hand: { name: 'Hand' },
  holz: { name: 'Wood' },
  stein: { name: 'Stone' },
  fell: { name: 'Hide' },
  krokodilleder: { name: 'Crocodile Leather' },
  eisenerz: { name: 'Iron Ore' },
  eisen: { name: 'Iron Ingot' },
  pelzmantel: { name: 'Fur Coat', carried: 'Clothing' },
  beeren: { name: 'Berries' },
  fleisch_roh: { name: 'Raw Meat' },
  fleisch: { name: 'Cooked Meat' },
  pilz: { name: 'Forest Mushroom' },
  leuchtpilz: { name: 'Glowing Mushroom' },
  heilkraut: { name: 'Healing Herb' },
  verband: { name: 'Herbal Bandage' },
  pilzpfanne: { name: 'Mushroom Skillet' },
  hoehlenragout: { name: 'Cave Stew' },
  axt: { name: 'Axe', carried: 'Tool Belt' },
  spitzhacke: { name: 'Pickaxe', carried: 'Tool Belt' },
  bogen: { name: 'Bow', carried: 'Back' },
  fackel: { name: 'Torch', carried: 'Tool Belt' },
  hammer: { name: 'Build Hammer', carried: 'Tool Belt' },
  angel: { name: 'Fishing Rod', carried: 'Back' },
  laterne: { name: 'Lantern', carried: 'Tool Belt' },
  metallaxt: { name: 'Metal Axe', carried: 'Tool Belt' },
  metallhacke: { name: 'Metal Pickaxe', carried: 'Tool Belt' },
  feldflasche: { name: 'Canteen' },
  pfadfinderstiefel: { name: 'Scout Boots', carried: 'Shoes', bonus: '+12% Move Speed' },
  verstaerkte_hose: { name: 'Reinforced Trousers', carried: 'Legs', bonus: '+25 Stamina' },
  schutzhemd: { name: 'Reinforced Vest', carried: 'Torso', bonus: '+20 Max Health' },
  grosser_rucksack: { name: 'Large Backpack', carried: 'Back' },
  sammlergurt: { name: "Gatherer's Belt", carried: 'Belt' },
  jagdkoecher: { name: 'Hunting Quiver', carried: 'Quiver' },
  bogensehne: { name: 'Braided Bowstring', carried: 'Bow Upgrade' },
  eisenspitzen: { name: 'Iron Arrowheads', carried: 'Bow Upgrade' },
  praezisionsschaefte: { name: 'Precision Shafts', carried: 'Bow Upgrade' },
  hornbogen: { name: 'Horn-Reinforced Bow', carried: 'Bow Upgrade' },
  wildmeisterbogen: { name: 'Wildmaster Bow', carried: 'Bow Upgrade' },
  jagdspeer: { name: 'Hunting Spear', carried: 'Tool Belt' },
  lederweste: { name: 'Croc Leather Vest', carried: 'Torso', bonus: '15% Less Damage' },
  lederbeinschutz: { name: 'Croc Leather Legguards', carried: 'Legs', bonus: '10% Less Damage' },
  lederhelm: { name: 'Croc Leather Hood', carried: 'Head', bonus: '10% Less Damage' },
  survivalset: { name: 'Survival Kit' },
  expeditionsrucksack: { name: 'Expedition Backpack', carried: 'Back' },
  werkzeugpflege: { name: 'Tool Care Kit' },
  veteranenabzeichen: { name: "Veteran's Badge", carried: 'Badge' },
  gelaendereifen: { name: 'All-Terrain Tires', carried: 'Bike Upgrade' },
  gepaecktraeger: { name: 'Expedition Rack', carried: 'Bike Upgrade' },
  pfeil: { name: 'Arrow' },
  lagerfeuer: { name: 'Campfire' },
  holzwand: { name: 'Wooden Wall' },
  steinmauer: { name: 'Stone Wall' },
  wildtor: { name: 'Wild Gate' },
  zelt: { name: 'Tent' },
  regenfaenger: { name: 'Rain Catcher' },
  floss: { name: 'Raft' },
  truhe: { name: 'Wooden Chest' },
  werkbank: { name: 'Workbench' },
  holzdach: { name: 'Wooden Roof' },
  fahrrad: { name: 'Off-Road Bike' },
  hochsitz: { name: 'Hunting Stand' },
};

// --- Englische Rezept-Beschreibungen (keyed nach out-id) -------------------
const EN_RECIPES = {
  axt: 'Fells trees 3× faster · wears down over time',
  spitzhacke: 'Mines stone 3× faster · wears down',
  bogen: 'Ranged bow — fires arrows on the hunt',
  pfeil: 'Ammo for the bow — 4 arrows per craft',
  fackel: 'Handheld light — burns down, keeps wolves away',
  verband: 'Use on the move · restores 35 health',
  hammer: 'Dismantle buildings and recover materials · wears down',
  lagerfeuer: 'Cook meat (E) · fuel with wood (E) — keeps wolves away',
  holzwand: 'Protects your camp',
  steinmauer: 'Massive, connectable camp barrier from spare stone',
  wildtor: 'Replaces a wall — you get through, animals don\'t',
  zelt: 'Sleep at night (E) + spawn point',
  regenfaenger: 'Collects clean drinking water when it rains',
  pelzmantel: 'Permanent protection from cold in mountains and rain',
  floss: 'Place on water · board with E and explore the coast',
  truhe: 'Stores supplies safely in camp',
  werkbank: 'Unlocks advanced equipment',
  holzdach: 'Shelters from rain and cooling',
  hochsitz: 'Safe elevated hunting platform · use the ladder with E',
  angel: 'Catch fish at deep water',
  eisen: 'Smelt ore with a stone furnace lining at the workbench',
  metallaxt: 'Durable axe with high impact',
  metallhacke: 'Durable pickaxe for ore',
  laterne: 'Bright, long-burning expedition light',
  feldflasche: 'Thirst drops 35% slower',
  pfadfinderstiefel: 'Worn on the body · move and sprint 12% faster',
  verstaerkte_hose: 'Worn on the body · 25 extra stamina',
  schutzhemd: 'Worn on the body · 20 extra max health',
  grosser_rucksack: 'Expands the inventory from 16 to 28 slots',
  fahrrad: 'Place on solid ground · mount with E · travel much faster',
  gelaendereifen: 'Upgrade: higher speed and better climbing for all bikes',
  gepaecktraeger: 'Upgrade: cuts hunger and thirst drain while riding by 25%',
  sammlergurt: 'Secure pouches yield 25% more wood, stone and ore',
  bogensehne: 'Upgrade: bow draws 35% faster, shorter pause between shots',
  jagdkoecher: 'Each arrow craft yields 8 arrows · bow deals +1 damage',
  eisenspitzen: 'Upgrade: iron-tipped arrows — bow deals +2 damage',
  praezisionsschaefte: 'Upgrade: arrows fly 40% faster and farther',
  survivalset: 'Hunger and thirst drop 18% slower permanently',
  expeditionsrucksack: 'Upgrades the large backpack to 40 inventory slots',
  werkzeugpflege: '35% chance tools lose no durability on use',
  veteranenabzeichen: 'All weapons deal +1 damage · daily survival supplies doubled',
  lederweste: 'Worn on the body · 15% less damage from attacks',
  hornbogen: 'Upgrade: reinforced bow — +2 damage per arrow',
  lederbeinschutz: 'Worn on the body · 10% less damage from attacks',
  jagdspeer: 'Melee weapon dealing 7 damage — the first real bow alternative',
  lederhelm: 'Worn on the body · 10% less damage from attacks',
  wildmeisterbogen: 'Upgrade: master bow — another +2 damage per arrow',
};

export function applyContentLanguage(lang) {
  const items = lang === 'de' ? DE_ITEMS : EN_ITEMS;
  for (const [id, def] of Object.entries(ITEMS)) {
    const loc = items[id];
    if (!loc) continue;
    if (loc.name !== undefined) def.name = loc.name;
    if ('carried' in def && loc.carried !== undefined) def.carried = loc.carried;
    if ('bonus' in def && loc.bonus !== undefined) def.bonus = loc.bonus;
  }
  const recipes = lang === 'de' ? DE_RECIPES : EN_RECIPES;
  for (const r of RECIPES) {
    const desc = recipes[r.out];
    if (desc !== undefined) r.desc = desc;
  }
}
