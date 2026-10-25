// Gauntlet gear: a deliberately small equipment model (not Demonanic's 11-slot
// system). Seven gear slots feed flat stats into the classless hero; two quick
// slots hold stacks of consumables the engine can fire mid-battle.

export const GEAR_SLOTS = Object.freeze(["head", "chest", "legs", "arms", "weapon", "secondary", "trinket"]);

export const GEAR_SLOT_LABELS = Object.freeze({
  head: "Head", chest: "Chest", legs: "Legs", arms: "Arms",
  weapon: "Weapon", secondary: "Secondary", trinket: "Amulet / Ring",
});

export const QUICK_SLOT_COUNT = 2;

// Core stats every slot template rolls. Special stats come from affixes, sets
// and legendary items; the engine reads them in classlessHeroDerived and the
// hit, heal and damage paths. Fractions are shown as percentages.
export const CORE_STAT_KEYS = Object.freeze(["attack", "defense", "maxHp", "agility", "critChance"]);
export const SPECIAL_STAT_KEYS = Object.freeze([
  "damageBonus", "healthBonus", "attackSpeed", "critDamage", "lifesteal", "thorns", "regen", "goldFind",
  "arrowSaver", "chill", "burn", "cleave", "volley", "revive", "blastWard",
  "darkResist", "coldResist", "heatResist", "toxicResist",
]);
export const GEAR_STAT_KEYS = Object.freeze([...CORE_STAT_KEYS, ...SPECIAL_STAT_KEYS]);

export const GEAR_STAT_LABELS = Object.freeze({
  attack: "ATK", defense: "DEF", maxHp: "HP", agility: "AGI", critChance: "CRIT",
  damageBonus: "DMG", healthBonus: "MAX HP", attackSpeed: "ATK SPD", critDamage: "CRIT DMG", lifesteal: "LIFESTEAL",
  thorns: "THORNS", regen: "REGEN", goldFind: "GOLD FIND", arrowSaver: "ARROW SAVE", chill: "CHILL", burn: "BURN",
  cleave: "CLEAVE", volley: "VOLLEY", revive: "REVIVE", blastWard: "BLAST WARD",
  darkResist: "DARK RES", coldResist: "COLD RES", heatResist: "HEAT RES", toxicResist: "TOXIC RES",
});

// Stats stored as fractions (0.05 = 5%). regen is HP per second, volley a count.
export const PERCENT_STATS = new Set(GEAR_STAT_KEYS.filter((key) => !["attack", "defense", "maxHp", "agility", "regen", "volley"].includes(key)));

export const RESIST_KEYS = Object.freeze(["darkResist", "coldResist", "heatResist", "toxicResist"]);

// Gear sets: pieces drop in their home region. Wearing 2 or 4 pieces of one
// set adds its bonuses on top of the pieces' own stats.
export const GEAR_SETS = Object.freeze({
  gravewatch: Object.freeze({
    key: "gravewatch", name: "Gravewatch", region: "boneyard", color: "#FF3366",
    bonuses: Object.freeze({ 2: { darkResist: 0.4, critChance: 0.04 }, 4: { healthBonus: 0.15, lifesteal: 0.05 } }),
  }),
  frostwarden: Object.freeze({
    key: "frostwarden", name: "Frostwarden", region: "frostfang", color: "#7DD3FC",
    bonuses: Object.freeze({ 2: { coldResist: 0.4, healthBonus: 0.08 }, 4: { chill: 0.25, defense: 12 } }),
  }),
  emberforged: Object.freeze({
    key: "emberforged", name: "Emberforged", region: "ashen", color: "#FF6600",
    bonuses: Object.freeze({ 2: { heatResist: 0.4, damageBonus: 0.06 }, 4: { burn: 0.3, damageBonus: 0.08 } }),
  }),
  mirewalker: Object.freeze({
    key: "mirewalker", name: "Mirewalker", region: "blightmire", color: "#A3E635",
    bonuses: Object.freeze({ 2: { toxicResist: 0.4, regen: 3 }, 4: { lifesteal: 0.08, attackSpeed: 0.1 } }),
  }),
});

// Arrows: a bow fires one per shot from the hero's quick slots and cannot
// shoot without them. Plain arrows are bought; the others are made from plain
// arrows at the Fletcher. `effect` is applied to the enemy hit.
const ARROW_DESC = "Bows need arrows: one per shot. 60% are picked back up after a won fight.";
export const ARROW_KEYS = Object.freeze(["arrows", "venomArrows", "flameArrows", "frostArrows"]);

// Consumables live in the guild stash and are loaded into quick slots in
// stacks. `auto` is the HP fraction (or condition) at which a hero uses one
// without being told to, so idle fights still benefit from them.
export const CONSUMABLES = Object.freeze({
  bandage: Object.freeze({
    key: "bandage", name: "Bandage", short: "BNDG", color: "#F8FAFC",
    desc: "Heal 20% max HP.", heal: 0.20, price: 12, stackCap: 5, autoBelowHp: 0.5,
  }),
  potion: Object.freeze({
    key: "potion", name: "Health Potion", short: "POT", color: "#FF2A5F",
    desc: "Heal 45% max HP.", heal: 0.45, price: 35, stackCap: 3, autoBelowHp: 0.3,
  }),
  ammo: Object.freeze({
    key: "ammo", name: "Whetstone", short: "WHET", color: "#FFE600",
    desc: "Next 8 attacks deal +50% damage, with any weapon. Used automatically on elites and bosses.",
    shots: 8, damageBonus: 0.5, price: 20, stackCap: 3, autoVsElite: true,
  }),
  arrows: Object.freeze({
    key: "arrows", name: "Arrows", short: "ARW", color: "#E2E8F0", arrow: true,
    desc: ARROW_DESC, price: 1, stackCap: 50, effect: null,
  }),
  venomArrows: Object.freeze({
    key: "venomArrows", name: "Venom Arrows", short: "VNM", color: "#39FF14", arrow: true,
    desc: "Poisons the target for 60% of the hit over 4s. Spent on use.", price: 4, stackCap: 50,
    effect: Object.freeze({ dot: 0.6, dotSeconds: 4, dotColor: "#39FF14" }),
  }),
  flameArrows: Object.freeze({
    key: "flameArrows", name: "Flame Arrows", short: "FLM", color: "#FF6600", arrow: true,
    desc: "Bursts for 35% damage around the target and burns it for 30% over 3s. Spent on use.", price: 4, stackCap: 50,
    effect: Object.freeze({ splash: 0.35, splashRadius: 42, dot: 0.3, dotSeconds: 3, dotColor: "#FF6600" }),
  }),
  frostArrows: Object.freeze({
    key: "frostArrows", name: "Frost Arrows", short: "FRS", color: "#7DD3FC", arrow: true,
    desc: "Slows the target's movement and attacks by 35% for 2.5s. Spent on use.", price: 4, stackCap: 50,
    effect: Object.freeze({ slow: 0.35, slowSeconds: 2.5 }),
  }),
});

export const CONSUMABLE_KEYS = Object.freeze(Object.keys(CONSUMABLES));

// Fletcher: turns plain arrows into special ones, a batch at a time.
export const FLETCHING = Object.freeze({
  batch: 10,
  recipes: Object.freeze({ venomArrows: 25, flameArrows: 30, frostArrows: 25 }),
});

// Share of plain arrows a party picks back up after winning a fight.
export const ARROW_RECOVERY = 0.6;

// Provisions are packed from the stash when a party sets out for a region
// with harsh conditions: one per hero, adding `resist` against that
// environment for the whole trip.
export const PROVISIONS = Object.freeze({
  torch: Object.freeze({ key: "torch", name: "Torch Bundle", color: "#FDE047", resist: "darkResist", amount: 0.5, price: 15,
    desc: "Lights the dark: +50% dark resistance for one hero for a whole trip." }),
  warmingDraught: Object.freeze({ key: "warmingDraught", name: "Warming Draught", color: "#7DD3FC", resist: "coldResist", amount: 0.5, price: 20,
    desc: "Keeps the cold out: +50% cold resistance for one hero for a whole trip." }),
  coolingSalve: Object.freeze({ key: "coolingSalve", name: "Cooling Salve", color: "#FB923C", resist: "heatResist", amount: 0.5, price: 25,
    desc: "Soothes burns: +50% heat resistance for one hero for a whole trip." }),
  antitoxin: Object.freeze({ key: "antitoxin", name: "Antitoxin", color: "#A3E635", resist: "toxicResist", amount: 0.5, price: 30,
    desc: "Purges poison: +50% toxic resistance for one hero for a whole trip." }),
});
export const PROVISION_KEYS = Object.freeze(Object.keys(PROVISIONS));

// Everything the stash can hold.
export const STASH_KEYS = Object.freeze([...CONSUMABLE_KEYS, ...PROVISION_KEYS]);

// Shared per-hero cooldown between quick-slot uses, in seconds.
export const QUICK_ITEM_COOLDOWN = 4;

export function emptyGearStats() {
  return Object.fromEntries(GEAR_STAT_KEYS.map((key) => [key, 0]));
}

// Pieces of each set a hero is wearing.
export function heroSetCounts(hero) {
  const counts = {};
  const equipment = hero?.equipment && typeof hero.equipment === "object" ? hero.equipment : {};
  for (const slot of GEAR_SLOTS) {
    const set = equipment[slot]?.set;
    if (GEAR_SETS[set]) counts[set] = (counts[set] || 0) + 1;
  }
  return counts;
}

// Set bonuses currently active for a hero: [{ set, pieces, stats }].
export function activeSetBonuses(hero) {
  const active = [];
  for (const [key, count] of Object.entries(heroSetCounts(hero))) {
    for (const [pieces, stats] of Object.entries(GEAR_SETS[key].bonuses)) {
      if (count >= Number(pieces)) active.push({ set: key, pieces: Number(pieces), stats });
    }
  }
  return active;
}

// Sum of every equipped gear piece's stats plus active set bonuses.
// Unknown slots and stats are ignored. Resistances cap at 100%.
export function heroGearStats(hero) {
  const total = emptyGearStats();
  const add = (stats) => {
    for (const key of GEAR_STAT_KEYS) {
      const value = Number(stats?.[key]);
      if (Number.isFinite(value)) total[key] += value;
    }
  };
  const equipment = hero?.equipment && typeof hero.equipment === "object" ? hero.equipment : {};
  for (const slot of GEAR_SLOTS) add(equipment[slot]?.stats);
  for (const bonus of activeSetBonuses(hero)) add(bonus.stats);
  for (const key of RESIST_KEYS) total[key] = Math.min(1, total[key]);
  return total;
}

// How each weapon fights. Gauntlet weapons override the classless baseline
// attack (a 220-range "midline" shot), so a sword closes in and slashes while a
// bow and a staff shoot from range. Heroes with no Gauntlet weapon keep the
// baseline attack.
export const WEAPON_PROFILES = Object.freeze({
  sword: Object.freeze({ label: "Sword", style: "Melee", rangeMode: "melee", range: 46, damage: 1.3, intervalScale: 0.9 }),
  bow: Object.freeze({ label: "Bow", style: "Ranged", rangeMode: "midline", range: 250, damage: 1, intervalScale: 1, usesArrows: true }),
  staff: Object.freeze({ label: "Staff", style: "Magic", rangeMode: "midline", range: 200, damage: 1.1, intervalScale: 1.15 }),
});

export function heroWeaponProfile(hero) {
  return WEAPON_PROFILES[hero?.equipment?.weapon?.weaponType] || null;
}

export function heroUsesArrows(hero) {
  return !!heroWeaponProfile(hero)?.usesArrows;
}

// Arrows a hero carries in their quick slots.
export function heroArrowCount(hero) {
  return (Array.isArray(hero?.quickSlots) ? hero.quickSlots : [])
    .reduce((sum, slot) => sum + (CONSUMABLES[slot?.key]?.arrow ? Math.max(0, slot.qty || 0) : 0), 0);
}
