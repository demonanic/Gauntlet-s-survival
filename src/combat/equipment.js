// Demonanic equipment system.
// Numeric gear stats are taken directly from sim/equipment.js (equipment1.docx Section 3).
// Material tilts, secondary identity modifiers, and quick-slot combat rules remain unresolved.
// The shop/drop economy values below are gameplay tuning and are intentionally separate.

import * as C from "./config";

export const EQUIPMENT_RARITIES = {
  E1: { key: "E1", name: "Common", short: "C", color: "#94A3B8" },
  E2: { key: "E2", name: "Uncommon", short: "U", color: "#39FF14" },
  E3: { key: "E3", name: "Rare", short: "R", color: "#00F3FF" },
  E4: { key: "E4", name: "Epic", short: "E", color: "#A855F7" },
  E5: { key: "E5", name: "Legendary", short: "L", color: "#FFE600" },
};

export const EQUIPMENT_SLOTS = [
  "Helm",
  "Chest",
  "Legs",
  "Arms",
  "Boots",
  "PrimaryWeapon",
  "SecondaryWeapon",
  "Cloak",
  "Ring1",
  "Ring2",
  "Necklace",
];

export const QUICK_SLOT_COUNT = 3;
export const QUICK_SLOT_LABELS = ["Q1", "Q2", "Q3"];

export const EQUIPMENT_SLOT_LABELS = {
  Helm: "Helm",
  Chest: "Chest",
  Legs: "Legs",
  Arms: "Arms",
  Boots: "Boots",
  PrimaryWeapon: "Primary",
  SecondaryWeapon: "Secondary",
  Cloak: "Cloak",
  Ring1: "Ring I",
  Ring2: "Ring II",
  Necklace: "Necklace",
};

export const CLASS_SECONDARY_TYPE = {
  knight: "Shield",
  rouge: "SecondDagger",
  mage: "Wand",
  archer: "Arrows",
};

// Secondary identities are metadata only for now. Their identity modifiers
// remain unresolved in the simulation/source specification and are NOT applied
// here. The four identities are the locked class mapping from sim/equipment.js.
export const SECONDARY_TYPES = ["Shield", "SecondDagger", "Wand", "Arrows"];

export const SECONDARY_TYPE_LABELS = {
  Shield: "Shield",
  SecondDagger: "Second Dagger",
  Wand: "Wand",
  Arrows: "Arrows",
};

// Verified neutral stat templates from the equipment source.
export const EQUIPMENT_CATALOG = {
  E1: {
    Helm: { defense: 2 },
    Chest: { defense: 2 },
    Legs: { defense: 1, maxHP: 5 },
    Arms: { defense: 1, maxHP: 5 },
    Boots: { agility: 2 },
    PrimaryWeapon: { attack: 2, critDamage: 1 },
    SecondaryWeapon: { defense: 2 },
    Cloak: { agility: 2 },
    Ring1: { critDamage: 5 },
    Ring2: { critDamage: 5 },
    Necklace: { intelligence: 2 },
  },
  E2: {
    Helm: { defense: 4, maxHP: 10 },
    Chest: { defense: 5, maxHP: 10 },
    Legs: { defense: 3, maxHP: 10 },
    Arms: { attack: 2, critDamage: 5 },
    Boots: { agility: 5 },
    PrimaryWeapon: { attack: 5, critDamage: 2 },
    SecondaryWeapon: { defense: 4, maxHP: 10 },
    Cloak: { agility: 5, maxHP: 5 },
    Ring1: { critChance: 3, critDamage: 6 },
    Ring2: { critChance: 3, critDamage: 6 },
    Necklace: { intelligence: 4, maxHP: 10 },
  },
  E3: {
    Helm: { defense: 7, maxHP: 30 },
    Chest: { defense: 8, maxHP: 40 },
    Legs: { defense: 5, maxHP: 30 },
    Arms: { attack: 4, critDamage: 10 },
    Boots: { agility: 10 },
    PrimaryWeapon: { attack: 9, critDamage: 7 },
    SecondaryWeapon: { defense: 7, maxHP: 30 },
    Cloak: { agility: 8, maxHP: 20 },
    Ring1: { critChance: 6, critDamage: 12 },
    Ring2: { critChance: 6, critDamage: 12 },
    Necklace: { intelligence: 6, maxHP: 30 },
  },
  E4: {
    Helm: { defense: 11, maxHP: 50 },
    Chest: { defense: 12, maxHP: 60 },
    Legs: { defense: 8, maxHP: 40 },
    Arms: { attack: 6, critDamage: 15 },
    Boots: { agility: 15 },
    PrimaryWeapon: { attack: 14, critDamage: 12 },
    SecondaryWeapon: { defense: 10, maxHP: 50 },
    Cloak: { agility: 12, maxHP: 40 },
    Ring1: { critChance: 9, critDamage: 18 },
    Ring2: { critChance: 9, critDamage: 18 },
    Necklace: { intelligence: 10, maxHP: 50 },
  },
  E5: {
    Helm: { defense: 16, maxHP: 90 },
    Chest: { defense: 18, maxHP: 100 },
    Legs: { defense: 12, maxHP: 60 },
    Arms: { attack: 9, critDamage: 22 },
    Boots: { agility: 22 },
    PrimaryWeapon: { attack: 22, critDamage: 17 },
    SecondaryWeapon: { defense: 15, maxHP: 80 },
    Cloak: { agility: 18, maxHP: 70 },
    Ring1: { critChance: 14, critDamage: 30 },
    Ring2: { critChance: 14, critDamage: 30 },
    Necklace: { intelligence: 15, maxHP: 80 },
  },
};

export const EQUIPMENT_ECONOMY = {
  // Tuning only; not part of the verified combat-stat source.
  sellValue: { E1: 30, E2: 80, E3: 250, E4: 700, E5: 2000 },
  shopBuyMultiplier: 2.25,
  shopRotationMs: 2 * 60 * 60 * 1000,
  shopSlots: 6,
  dropChance: {
    basic: 0.06,
    specialized: 0.14,
    elite: 0.35,
    boss: 1,
  },
};

const SLOT_NAMES = {
  Helm: ["Neon Helm", "Void Helm", "Crown of the Keep"],
  Chest: ["Neon Cuirass", "Void Chest", "Demonplate"],
  Legs: ["Neon Greaves", "Void Legguards", "Demonwalkers"],
  Arms: ["Neon Bracers", "Void Arms", "Demonwraps"],
  Boots: ["Neon Boots", "Void Treads", "Demonstep"],
  PrimaryWeapon: ["Neon Blade", "Void Weapon", "Demonforged Weapon"],
  SecondaryWeapon: ["Neon Secondary", "Void Secondary", "Demonic Secondary"],
  Cloak: ["Neon Cloak", "Void Mantle", "Demon Veil"],
  Ring1: ["Neon Ring", "Void Ring", "Demonic Ring"],
  Ring2: ["Neon Ring", "Void Ring", "Demonic Ring"],
  Necklace: ["Neon Necklace", "Void Necklace", "Demonic Necklace"],
};

function randomChoice(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function randomId(prefix = "itm") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function aggregateEquipmentStats(equipment) {
  const total = {
    attack: 0,
    defense: 0,
    agility: 0,
    intelligence: 0,
    maxHP: 0,
    critChance: 0,
    critDamage: 0,
  };

  for (const item of Object.values(equipment || {})) {
    if (!item?.stats) continue;
    for (const key of Object.keys(total)) total[key] += Number(item.stats[key] || 0);
  }

  return total;
}

export function equipmentScenarioForDrop(wave, tier, rng = Math.random) {
  const maxByWave = wave >= 15 ? 5 : wave >= 10 ? 4 : wave >= 5 ? 3 : 2;
  const minByTier = tier === "boss" ? 3 : tier === "elite" ? 2 : 1;
  const min = Math.min(minByTier, maxByWave);
  const span = Math.max(1, maxByWave - min + 1);

  // Higher-tier enemies lean toward the upper end of the currently unlocked
  // rarity band without making Legendary drops routine.
  let bias = rng();
  if (tier === "boss") bias = Math.min(0.98, 0.55 + bias * 0.45);
  else if (tier === "elite") bias = Math.min(0.92, 0.35 + bias * 0.57);

  return Math.min(maxByWave, min + Math.floor(bias * span));
}

export function createEquipmentItem(scenario, slot, rng = Math.random, source = "drop", secondaryType = null) {
  const stats = EQUIPMENT_CATALOG[`E${scenario}`]?.[slot];
  if (!stats) throw new Error(`Unknown equipment scenario/slot: E${scenario}/${slot}`);

  const rarityKey = `E${scenario}`;
  const rarity = EQUIPMENT_RARITIES[rarityKey];
  const resolvedSecondaryType = slot === "SecondaryWeapon"
    ? (secondaryType && SECONDARY_TYPES.includes(secondaryType)
      ? secondaryType
      : randomChoice(SECONDARY_TYPES, rng))
    : null;
  const secondaryNames = { Shield: "Shield", SecondDagger: "Second Dagger", Wand: "Wand", Arrows: "Arrows" };
  const baseName = slot === "SecondaryWeapon"
    ? `Void ${secondaryNames[resolvedSecondaryType] || "Secondary"}`
    : randomChoice(SLOT_NAMES[slot] || ["Unknown Gear"], rng);
  const primaryWeaponType = {
    "Neon Blade": "sword",
    "Void Weapon": "bow",
    "Demonforged Weapon": "staff",
  }[baseName];
  const prefix = rarity.name === "Common" ? "" : `${rarity.name} `;
  const sellValue = EQUIPMENT_ECONOMY.sellValue[rarityKey];

  return {
    id: randomId(),
    rarity: rarityKey,
    rarityName: rarity.name,
    slot,
    name: `${prefix}${baseName}`,
    ...(primaryWeaponType ? { weaponType: primaryWeaponType } : {}),
    ...(resolvedSecondaryType ? { secondaryType: resolvedSecondaryType } : {}),
    stats: { ...stats },
    sellValue,
    buyPrice: sellValue * EQUIPMENT_ECONOMY.shopBuyMultiplier,
    source,
    acquiredAt: Date.now(),
  };
}

export function rollEquipmentDrop(enemy, wave, rng = Math.random) {
  const tier = enemy?.tier || "basic";
  const baseChance = EQUIPMENT_ECONOMY.dropChance[tier] ?? 0.08;
  const waveBonus = Math.min(0.10, Math.max(0, wave - 1) * 0.005);
  const chance = Math.min(1, baseChance + waveBonus);

  if (rng() > chance) return null;

  const scenario = equipmentScenarioForDrop(wave, tier, rng);
  const slot = randomChoice(EQUIPMENT_SLOTS, rng);
  const secondaryType = slot === "SecondaryWeapon"
    ? randomChoice(SECONDARY_TYPES, rng)
    : null;
  return createEquipmentItem(
    scenario,
    slot,
    rng,
    `enemy:${enemy?.type || "unknown"}`,
    secondaryType,
  );
}

export function createShoppeRotation(state, rng = Math.random) {
  const wave = Math.max(1, Number(state?.wave || 1));
  const maxScenario = wave >= 15 ? 5 : wave >= 10 ? 4 : wave >= 5 ? 3 : 2;
  const items = [];

  for (let i = 0; i < EQUIPMENT_ECONOMY.shopSlots; i++) {
    const scenario = 1 + Math.floor(rng() * maxScenario);
    const slot = randomChoice(EQUIPMENT_SLOTS, rng);
    const secondaryType = slot === "SecondaryWeapon"
      ? randomChoice(SECONDARY_TYPES, rng)
      : null;
    items.push(createEquipmentItem(
      scenario,
      slot,
      rng,
      "kingdom-shoppe",
      secondaryType,
    ));
  }

  return items;
}

export function ensureShoppe(state, now = Date.now(), rng = Math.random) {
  if (!state.shoppe || !Array.isArray(state.shoppe.inventory) || !Number.isFinite(state.shoppe.nextRefreshAt)) {
    state.shoppe = {
      inventory: createShoppeRotation(state, rng),
      nextRefreshAt: now + EQUIPMENT_ECONOMY.shopRotationMs,
      lastRefreshAt: now,
    };
    return true;
  }

  if (now >= state.shoppe.nextRefreshAt) {
    state.shoppe.inventory = createShoppeRotation(state, rng);
    state.shoppe.lastRefreshAt = now;
    state.shoppe.nextRefreshAt = now + EQUIPMENT_ECONOMY.shopRotationMs;
    return true;
  }

  return false;
}

export function formatEquipmentStats(stats = {}) {
  return Object.entries(stats)
    .filter(([, value]) => Number(value))
    .map(([key, value]) => {
      const label = {
        attack: "ATK",
        defense: "DEF",
        agility: "AGI",
        intelligence: "INT",
        maxHP: "HP",
        critChance: "CRIT",
        critDamage: "CD",
      }[key] || key;
      return `${label}+${value}${key === "critChance" || key === "critDamage" ? "%" : ""}`;
    });
}

export function secondaryTypeMatchesHero(hero, item) {
  if (!hero || item?.slot !== "SecondaryWeapon") return true;
  // Legacy secondary items created before identity metadata remain equipable.
  if (!item.secondaryType) return true;
  return CLASS_SECONDARY_TYPE[hero.cls] === item.secondaryType;
}

export function equipItem(state, heroIndex, itemId, targetSlot = null) {
  const hero = state.heroes?.[heroIndex];
  const itemIndex = (state.vault || []).findIndex((item) => item.id === itemId);
  if (!hero || itemIndex < 0) return false;

  const item = state.vault[itemIndex];
  const slot = targetSlot || item.slot;
  if (!EQUIPMENT_SLOTS.includes(slot)) return false;
  if (!secondaryTypeMatchesHero(hero, item)) return false;

  // Ring I and Ring II are interchangeable physical slots. Every other item
  // must be equipped in the slot it was generated for; callers cannot use
  // targetSlot to turn armor into a weapon or vice versa.
  const ringCompatible = (item.slot === "Ring1" || item.slot === "Ring2")
    && (slot === "Ring1" || slot === "Ring2");
  if (item.slot !== slot && !ringCompatible) return false;

  const old = hero.equipment?.[slot];
  hero.equipment = { ...(hero.equipment || {}), [slot]: item };
  state.vault.splice(itemIndex, 1);
  if (old) state.vault.push(old);
  return true;
}

export function unequipItem(state, heroIndex, slot) {
  const hero = state.heroes?.[heroIndex];
  if (!hero?.equipment?.[slot]) return false;
  state.vault = state.vault || [];
  state.vault.push(hero.equipment[slot]);
  delete hero.equipment[slot];
  return true;
}

export function sellItem(state, itemId) {
  const index = (state.vault || []).findIndex((item) => item.id === itemId);
  if (index < 0) return false;
  const [item] = state.vault.splice(index, 1);
  state.gold += Number(item.sellValue || 0);
  return true;
}

export function destroyItem(state, itemId) {
  const index = (state.vault || []).findIndex((item) => item.id === itemId);
  if (index < 0) return false;
  state.vault.splice(index, 1);
  return true;
}

export function buyShoppeItem(state, index) {
  const item = state.shoppe?.inventory?.[index];
  if (!item) return false;
  const price = Number(item.buyPrice || 0);
  if (state.gold < price) return false;

  state.gold -= price;
  state.vault = state.vault || [];
  state.vault.push({ ...item, id: randomId("shop") });
  state.shoppe.inventory.splice(index, 1);
  return true;
}

export function emptyEquipmentState(state) {
  if (!Array.isArray(state.vault)) state.vault = [];
  if (!state.shoppe) state.shoppe = { inventory: [], nextRefreshAt: 0, lastRefreshAt: 0 };
  const secondaryNames = { Shield: "Shield", SecondDagger: "Second Dagger", Wand: "Wand", Arrows: "Arrows" };
  const repairSecondaryName = (item) => {
    if (!item || item.slot !== "SecondaryWeapon" || !SECONDARY_TYPES.includes(item.secondaryType)) return;
    if (/Secondary$/i.test(item.name || "")) {
      const rarity = EQUIPMENT_RARITIES[item.rarity]?.name || item.rarityName || "";
      item.name = `${rarity === "Common" ? "" : rarity + " "}Void ${secondaryNames[item.secondaryType] || "Secondary"}`.trim();
    }
  };
  state.vault.forEach(repairSecondaryName);
  if (Array.isArray(state.shoppe.inventory)) state.shoppe.inventory.forEach(repairSecondaryName);
  for (const hero of [...(state.heroes || []), ...(state.bench || [])]) {
    if (!hero.equipment || Array.isArray(hero.equipment)) hero.equipment = {};
    Object.values(hero.equipment).forEach(repairSecondaryName);
    if (!Array.isArray(hero.quickSlots) || hero.quickSlots.length !== QUICK_SLOT_COUNT) {
      hero.quickSlots = Array.from({ length: QUICK_SLOT_COUNT }, (_, i) => hero.quickSlots?.[i] || null);
    }
  }
}
