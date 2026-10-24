// Gauntlet gear: a deliberately small equipment model (not Demonanic's 11-slot
// system). Seven gear slots feed flat stats into the classless hero; two quick
// slots hold stacks of consumables the engine can fire mid-battle.

export const GEAR_SLOTS = Object.freeze(["head", "chest", "legs", "arms", "weapon", "secondary", "trinket"]);

export const GEAR_SLOT_LABELS = Object.freeze({
  head: "Head", chest: "Chest", legs: "Legs", arms: "Arms",
  weapon: "Weapon", secondary: "Secondary", trinket: "Amulet / Ring",
});

export const QUICK_SLOT_COUNT = 2;

export const GEAR_STAT_KEYS = Object.freeze(["attack", "defense", "maxHp", "agility", "critChance"]);

export const GEAR_STAT_LABELS = Object.freeze({
  attack: "ATK", defense: "DEF", maxHp: "HP", agility: "AGI", critChance: "CRIT",
});

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
    key: "ammo", name: "Barbed Ammo", short: "AMMO", color: "#FFE600",
    desc: "Next 8 basic attacks deal +50% damage. Used automatically on elites and bosses.",
    shots: 8, damageBonus: 0.5, price: 20, stackCap: 3, autoVsElite: true,
  }),
});

export const CONSUMABLE_KEYS = Object.freeze(Object.keys(CONSUMABLES));

// Shared per-hero cooldown between quick-slot uses, in seconds.
export const QUICK_ITEM_COOLDOWN = 4;

export function emptyGearStats() {
  return { attack: 0, defense: 0, maxHp: 0, agility: 0, critChance: 0 };
}

// Sum of every equipped gear piece's stats. Unknown slots and stats are ignored.
export function heroGearStats(hero) {
  const total = emptyGearStats();
  const equipment = hero?.equipment && typeof hero.equipment === "object" ? hero.equipment : {};
  for (const slot of GEAR_SLOTS) {
    const stats = equipment[slot]?.stats;
    if (!stats) continue;
    for (const key of GEAR_STAT_KEYS) {
      const value = Number(stats[key]);
      if (Number.isFinite(value)) total[key] += value;
    }
  }
  return total;
}

// How each weapon fights. Gauntlet weapons override the classless baseline
// attack (a 220-range "midline" shot), so a sword closes in and slashes while a
// bow and a staff shoot from range. Heroes with no Gauntlet weapon keep the
// baseline attack.
export const WEAPON_PROFILES = Object.freeze({
  sword: Object.freeze({ label: "Sword", style: "Melee", rangeMode: "melee", range: 46, damage: 1.3, intervalScale: 0.9 }),
  bow: Object.freeze({ label: "Bow", style: "Ranged", rangeMode: "midline", range: 250, damage: 1, intervalScale: 1 }),
  staff: Object.freeze({ label: "Staff", style: "Magic", rangeMode: "midline", range: 200, damage: 1.1, intervalScale: 1.15 }),
});

export function heroWeaponProfile(hero) {
  return WEAPON_PROFILES[hero?.equipment?.weapon?.weaponType] || null;
}
