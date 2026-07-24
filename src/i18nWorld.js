// Lokalisierung des Welt-Contents: Biome, Tiere, Bauwerke, Entdeckungsorte.
// Gleiches Prinzip wie i18nContent.js — die Datenobjekte behalten ihre Struktur
// und ihre IDs, nur die Anzeigefelder werden in-place überschrieben. Dadurch
// funktionieren alle bestehenden Lesestellen (name, story, cache.name)
// unverändert weiter.
import { BIOME_NAMES } from './world.js';
import { KINDS } from './animals.js';
import { DEFS } from './buildings.js';
import { DEFINITIONS } from './landmarks.js';

// --- Deutsch-Snapshot (Rückschaltung) --------------------------------------
const DE_BIOMES = { ...BIOME_NAMES };
const DE_ANIMALS = Object.fromEntries(Object.entries(KINDS).map(([id, k]) => [id, k.name]));
const DE_BUILDINGS = Object.fromEntries(Object.entries(DEFS).map(([id, d]) => [id, d.name]));
const DE_LANDMARKS = Object.fromEntries(DEFINITIONS.map((l) => [l.id, {
  name: l.name, story: l.story, cache: l.cache?.name,
}]));

// --- Englisch ---------------------------------------------------------------
const EN_BIOMES = {
  rivervalley: 'River Valley',
  crocriver: 'Crocodile River',
  coast: 'Coast',
  alpine: 'High Mountains',
  marsh: 'Moorland',
  forest: 'Deep Forest',
  meadow: 'Grasslands',
};

const EN_ANIMALS = {
  hase: 'Rabbit',
  hirsch: 'Deer',
  wolf: 'Wolf',
  wildschwein: 'Boar',
  baer: 'Bear',
  krokodil: 'Crocodile',
};

const EN_BUILDINGS = {
  campfire: 'Campfire',
  torch: 'Torch',
  wall: 'Wooden Wall',
  stonewall: 'Stone Wall',
  gate: 'Wild Gate',
  tent: 'Tent',
  raincatcher: 'Rain Catcher',
  raft: 'Raft',
  bike: 'Off-Road Bike',
  chest: 'Wooden Chest',
  workbench: 'Workbench',
  roof: 'Wooden Roof',
  watchtower: 'Hunting Stand',
};

const EN_LANDMARKS = {
  steinkreis: {
    name: 'The Old Stone Circle',
    story: 'Weathered marks tell of people who sought shelter here long ago.',
  },
  jaegerlager: {
    name: 'The Abandoned Hunting Camp',
    story: 'The embers are cold, but usable supplies still lie under the rotting roof.',
  },
  uralter_baum: {
    name: 'The Warden of the Forest',
    story: 'This tree is older than any path. A forgotten cache glimmers between its roots.',
  },
  pilzhain: {
    name: 'The Whispering Mushroom Grove',
    story: 'The damp forest floor is full of edible mushrooms. Three forest mushrooms make a warming skillet at the campfire.',
  },
  frostwarte: {
    name: 'The Frost Watch',
    story: 'You have conquered the highest ridge. The abandoned summit camp proves someone searched these mountains before you.',
  },
  kuestenwrack: {
    name: 'The Stranded Wreck',
    story: 'Beyond the old coast lies a broken ship carrying metal from another age.',
  },
  erzinsel: {
    name: 'The Ore Cliffs',
    story: 'Rust-coloured veins run through the rock. An expedition out here pays off.',
  },
  nordwacht: {
    name: 'The Abandoned North Watch',
    story: 'From the rotting tower you overlook a wilderness larger than any old map.',
  },
  wurzelhoehle: {
    name: 'The Tangled Root Cave',
    story: 'Beneath the western forest, ancient roots have opened a dry chamber. Mushrooms and forgotten gatherer caches keep growing back here.',
    cache: "Gatherer's Stash",
  },
  eiskluft: {
    name: 'The Singing Ice Rift',
    story: 'Blue ice sings in the mountain wind. Ore and gear from earlier summit expeditions lie between the crystals.',
    cache: 'Frozen Expedition Cache',
  },
  gezeitengrotte: {
    name: 'The Drowned Tide Grotto',
    story: 'Only in calm seas can the entrance be made out. Below the surface waits the cargo of a long-broken smuggler boat.',
    cache: 'Sunken Smuggler Crate',
  },
  schattenhoehle: {
    name: 'The Shadow Cave',
    story: 'You pushed through the wolf den into the sealed chamber. Ore veins and a lost expedition cache reward the way into the dark.',
    cache: 'Lost Expedition Cache',
  },
  sternfall: {
    name: 'The Starfall Crater',
    story: 'A strange rock still pulses faintly. Its splinters make exceptionally durable tools.',
  },
  versunkene_ruinen: {
    name: 'The Sunken Ruins',
    story: 'Between moor water and old walls you find signs of a forgotten expedition.',
  },
  ostpass: {
    name: 'The Broken East Pass',
    story: 'From here an old path leads into the remotest mountains. Someone tried to map them before you.',
  },
  westheiligtum: {
    name: "The Sanctuary at the World's Edge",
    story: 'The stones mark no ending but a beginning: behind every horizon waits another story.',
  },
  nordgratstation: {
    name: 'The North Ridge Station',
    story: 'Beyond the old map stands an iced-over survey station. Its markers point deeper still into the wild.',
  },
  westklippenposten: {
    name: 'The West Cliff Post',
    story: 'A lonely post marks the end of the old routes. Uncharted land begins behind it.',
  },
  suedaue: {
    name: 'The Stone Circle of the South Meadow',
    story: 'The far-off stones show that even the new south was once reached by travellers.',
  },
  ostfurt_lager: {
    name: 'The Camp at the East Ford',
    story: 'Whoever crossed the river here left supplies behind. The deep claw marks in the wood are from no wolf.',
  },
  schuppenbank: {
    name: 'The Scale Bank',
    story: 'A sandbank covered in shed armour scales. The leather of the river beasts is tougher than any hide.',
  },
  ostmuendung: {
    name: 'The Estuary Cliffs',
    story: 'The east river loses itself in the sea. From the cliffs you see how far the wilderness truly reaches.',
  },
  suedwest_wacht: {
    name: 'The Marsh Watch',
    story: 'An observation post above the moor. The ladder was recently repaired — someone was here not long ago.',
  },
  moorruine: {
    name: 'The Ruin in the Reeds',
    story: 'Half-sunken walls. Metal glints between the stones that nobody ever came back for.',
  },
  suedwestrand: {
    name: 'The Stone Circle at the Southwest Edge',
    story: 'The last stone set before the open water. Here ends everything that was ever mapped.',
  },
  nordfurt_station: {
    name: 'The Station at the North Ford',
    story: 'A survey station at the river crossing. The final entries in the logbook break off mid-sentence.',
  },
  schluchtkrater: {
    name: 'The Crater of the North Gorge',
    story: 'An impact tore the rock open. Nearby you hear something large crashing through the undergrowth.',
  },
  nordkap: {
    name: 'The North Cape',
    story: 'The northernmost point anyone has reached. The wind carries sounds you cannot place.',
  },
  ostgrat: {
    name: 'The East Ridge',
    story: 'A mountain spine between two river valleys. From above you can make out the territories of the great beasts.',
  },
  westkliff: {
    name: 'The West Bluff',
    story: 'Jagged rock above the surf. An old rope leads into a crevice breathing cold air.',
  },
  suedwrack: {
    name: 'The Second Wreck',
    story: 'Another stranded ship, far outside any route. Whoever landed here did not continue on foot.',
  },
};

export function applyWorldLanguage(lang) {
  const de = lang === 'de';

  const biomes = de ? DE_BIOMES : EN_BIOMES;
  for (const key of Object.keys(BIOME_NAMES)) {
    if (biomes[key] !== undefined) BIOME_NAMES[key] = biomes[key];
  }

  const animals = de ? DE_ANIMALS : EN_ANIMALS;
  for (const [id, kind] of Object.entries(KINDS)) {
    if (animals[id] !== undefined) kind.name = animals[id];
  }

  const buildings = de ? DE_BUILDINGS : EN_BUILDINGS;
  for (const [id, def] of Object.entries(DEFS)) {
    if (buildings[id] !== undefined) def.name = buildings[id];
  }

  const landmarks = de ? DE_LANDMARKS : EN_LANDMARKS;
  for (const landmark of DEFINITIONS) {
    const loc = landmarks[landmark.id];
    if (!loc) continue;
    if (loc.name !== undefined) landmark.name = loc.name;
    if (loc.story !== undefined) landmark.story = loc.story;
    if (landmark.cache && loc.cache !== undefined) landmark.cache.name = loc.cache;
  }
}
