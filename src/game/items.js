// Gauntlet items: gear generation, loot drops, and the pure state mutators for
// equipping gear, loading quick slots, selling and buying. Every mutator
// returns { ok, state } (or { ok: false, reason }) and never touches its input.
import { classlessCombatEffects, classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import {
  CONSUMABLES, GEAR_SLOTS, GEAR_STAT_KEYS, GEAR_STAT_LABELS, QUICK_SLOT_COUNT, heroGearStats,
} from "../combat/gear";
import { HERO_BASELINE, serializeGameState } from "../combat/heroModel";

export const RARITIES = Object.freeze({
  common: { key: "common", name: "Common", word: "Scrap", color: "#94A3B8", mult: 1, sell: 6 },
  uncommon: { key: "uncommon", name: "Uncommon", word: "Neon", color: "#39FF14", mult: 1.5, sell: 15 },
  rare: { key: "rare", name: "Rare", word: "Void", color: "#00F3FF", mult: 2.2, sell: 40 },
  epic: { key: "epic", name: "Epic", word: "Demon", color: "#A855F7", mult: 3.2, sell: 100 },
});
export const RARITY_ORDER = Object.freeze(["common", "uncommon", "rare", "epic"]);

// Gear tier scales every stat: 1 = The Gutter, 2 = Boneyard Crypt, 3 = Ashen Keep.
// Higher tiers come from ranked bosses, deep Rift waves and the shop's featured item.
export const MAX_GEAR_TIER = 10;
const clampTier = (tier) => Math.min(MAX_GEAR_TIER, Math.max(1, Math.floor(tier) || 1));
export function tierMult(tier) {
  const t = clampTier(tier);
  return t <= 3 ? [1, 1.6, 2.4][t - 1] : 2.4 + 0.8 * (t - 3);
}

// Forge: each upgrade level adds 15% of the item's base stats, up to +5.
export const MAX_UPGRADE = 5;
const UPGRADE_STEP = 0.15;

// Common, tier-1 stats per slot variant. critChance is a fraction (0.03 = 3%).
export const GEAR_TEMPLATES = Object.freeze({
  head: [{ id: "helm", name: "Helm", stats: { defense: 3, maxHp: 15 } }],
  chest: [{ id: "cuirass", name: "Cuirass", stats: { defense: 5, maxHp: 25 } }],
  legs: [{ id: "greaves", name: "Greaves", stats: { defense: 3, agility: 2 } }],
  arms: [{ id: "bracers", name: "Bracers", stats: { attack: 2, defense: 2 } }],
  weapon: [
    { id: "sword", name: "Sword", weaponType: "sword", stats: { attack: 5 } },
    { id: "bow", name: "Bow", weaponType: "bow", stats: { attack: 4, critChance: 0.03 } },
    { id: "staff", name: "Staff", weaponType: "staff", stats: { attack: 4, maxHp: 15 } },
  ],
  secondary: [
    { id: "shield", name: "Shield", stats: { defense: 4, maxHp: 20 } },
    { id: "dagger", name: "Dagger", stats: { attack: 3, critChance: 0.02 } },
    { id: "orb", name: "Focus Orb", stats: { agility: 3, critChance: 0.02 } },
  ],
  trinket: [
    { id: "amulet", name: "Amulet", stats: { maxHp: 20, defense: 2 } },
    { id: "ring", name: "Ring", stats: { critChance: 0.04, attack: 1 } },
  ],
});

// Per-enemy loot. At most one drop per kill: gear is rolled first, then supplies.
export const LOOT_TABLE = Object.freeze({
  gearChance: { basic: 0.04, specialized: 0.08, elite: 0.3, boss: 1 },
  supplyChance: { basic: 0.06, specialized: 0.1, elite: 0.4, boss: 0 },
  rarityWeights: {
    basic: { common: 75, uncommon: 22, rare: 3, epic: 0 },
    specialized: { common: 55, uncommon: 33, rare: 10, epic: 2 },
    elite: { common: 20, uncommon: 45, rare: 28, epic: 7 },
    boss: { common: 0, uncommon: 0, rare: 65, epic: 35 },
  },
  supplyWeights: {
    basic: { bandage: 60, ammo: 25, potion: 15 },
    specialized: { bandage: 50, ammo: 25, potion: 25 },
    elite: { bandage: 20, ammo: 30, potion: 50 },
    boss: { bandage: 0, ammo: 0, potion: 1 },
  },
});

function weightedPick(weights, rng) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

let itemSequence = 0;
function newItemId() {
  itemSequence += 1;
  return `gear-${Date.now().toString(36)}-${itemSequence.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createGearItem({ slot, variant, rarity = "common", tier = 1 } = {}, rng = Math.random) {
  const templates = GEAR_TEMPLATES[slot];
  if (!templates) throw new RangeError(`Unknown gear slot ${slot}`);
  const template = templates.find((entry) => entry.id === variant) || templates[Math.floor(rng() * templates.length)];
  const info = RARITIES[rarity] || RARITIES.common;
  const stats = scaleStats(template.stats, info.mult * tierMult(tier));
  return {
    id: newItemId(),
    kind: "gear",
    slot,
    variant: template.id,
    name: `${info.word} ${template.name}`,
    rarity: info.key,
    tier: clampTier(tier),
    ...(template.weaponType ? { weaponType: template.weaponType } : {}),
    stats,
    value: Math.round(info.sell * tierMult(tier)),
  };
}

function scaleStats(stats, scale) {
  const scaled = {};
  for (const [key, base] of Object.entries(stats)) {
    scaled[key] = key === "critChance"
      ? Math.round(base * scale * 100) / 100
      : Math.max(1, Math.round(base * scale));
  }
  return scaled;
}

export function itemLabel(item) {
  return `${item.name}${item.upgrade ? ` +${item.upgrade}` : ""}`;
}

export function upgradeCost(item) {
  const info = RARITIES[item.rarity] || RARITIES.common;
  return Math.round(30 * info.mult * tierMult(item.tier) * ((item.upgrade || 0) + 1) ** 1.5);
}

// Find a gear item in the vault or on any hero (with that hero's id).
function locateGear(state, itemId) {
  const inVault = state.vault.find((item) => item.id === itemId);
  if (inVault) return { item: inVault, ownerId: null };
  for (const hero of state.heroes) {
    for (const item of Object.values(hero.equipment || {})) {
      if (item?.id === itemId) return { item, ownerId: hero.identity.id };
    }
  }
  return {};
}

// Forge upgrade. Works on vault gear and on gear worn by heroes who are home.
export function upgradeGear(state, itemId) {
  const next = serializeGameState(state);
  const { item, ownerId } = locateGear(next, itemId);
  if (!item) return { ok: false, reason: "unknown_item" };
  if (ownerId && next.expedition?.heroIds.includes(ownerId)) return { ok: false, reason: "hero_away" };
  if ((item.upgrade || 0) >= MAX_UPGRADE) return { ok: false, reason: "max_upgrade" };
  const cost = upgradeCost(item);
  if (next.gold < cost) return { ok: false, reason: "insufficient_gold" };
  next.gold -= cost;
  item.baseStats ||= { ...item.stats };
  item.upgrade = (item.upgrade || 0) + 1;
  item.stats = scaleStats(item.baseStats, 1 + UPGRADE_STEP * item.upgrade);
  item.value = Math.round((item.value || 0) + cost * 0.25);
  return { ok: true, state: next };
}

export function isConsumableDrop(item) {
  return item?.kind === "consumable" && !!CONSUMABLES[item.key];
}

// Loot for one kill, or null. Handed to the engine as sim.rollDrop.
export function rollLoot(enemy, tier = 1, rng = Math.random) {
  const enemyTier = LOOT_TABLE.gearChance[enemy?.tier] != null ? enemy.tier : "basic";
  if (rng() < LOOT_TABLE.gearChance[enemyTier]) {
    const slot = GEAR_SLOTS[Math.floor(rng() * GEAR_SLOTS.length)];
    const rarity = weightedPick(LOOT_TABLE.rarityWeights[enemyTier], rng);
    return createGearItem({ slot, rarity, tier }, rng);
  }
  if (rng() < LOOT_TABLE.supplyChance[enemyTier]) {
    return { kind: "consumable", key: weightedPick(LOOT_TABLE.supplyWeights[enemyTier], rng), qty: 1 };
  }
  return null;
}

// Gear goes to the vault; consumables stack in the stash.
export function bankLoot(state, items = []) {
  for (const item of items) {
    if (isConsumableDrop(item)) state.stash[item.key] = (state.stash[item.key] || 0) + Math.max(1, item.qty || 1);
    else if (item?.kind === "gear") state.vault.push(item);
  }
  return state;
}

// Demonanic-format vault items from early saves become Gauntlet gear.
const LEGACY_SLOTS = {
  Helm: "head", Chest: "chest", Cloak: "chest", Legs: "legs", Boots: "legs", Arms: "arms",
  PrimaryWeapon: "weapon", SecondaryWeapon: "secondary", Ring1: "trinket", Ring2: "trinket", Necklace: "trinket",
};
const LEGACY_RARITIES = { E1: "common", E2: "uncommon", E3: "rare", E4: "epic", E5: "epic" };

export function migrateVaultItem(item) {
  if (!item || typeof item !== "object") return null;
  if (item.kind === "gear" && GEAR_TEMPLATES[item.slot] && item.stats) return item;
  const slot = LEGACY_SLOTS[item.slot];
  if (!slot) return null;
  return createGearItem({ slot, rarity: LEGACY_RARITIES[item.rarity] || "common", tier: 1 });
}

// Repair a saved hero's gear fields: only known slots, exactly two quick slots.
export function normalizeHeroGear(hero) {
  const equipment = {};
  const saved = hero.equipment && typeof hero.equipment === "object" && !Array.isArray(hero.equipment) ? hero.equipment : {};
  for (const slot of GEAR_SLOTS) {
    if (saved[slot]?.kind === "gear" && saved[slot].slot === slot) equipment[slot] = saved[slot];
  }
  const quick = Array.isArray(hero.quickSlots) ? hero.quickSlots : [];
  const quickSlots = Array.from({ length: QUICK_SLOT_COUNT }, (_, index) => {
    const entry = quick[index];
    const item = entry && CONSUMABLES[entry.key];
    const qty = Math.min(item?.stackCap || 0, Math.floor(Number(entry?.qty) || 0));
    return item && qty > 0 ? { key: entry.key, qty } : null;
  });
  return { ...hero, equipment, quickSlots };
}

const heroId = (hero) => hero.identity.id;

// Gear and quick slots are locked while the hero is out on an expedition.
function editableHero(state, id) {
  const hero = state.heroes.find((entry) => heroId(entry) === id);
  if (!hero) return { error: "unknown_hero" };
  if (state.expedition?.heroIds.includes(id)) return { error: "hero_away" };
  return { hero };
}

function clampHp(hero) {
  hero.combat.hp = Math.min(hero.combat.hp, classlessMaxHp(hero));
}

export function equipGear(state, id, itemId) {
  const next = serializeGameState(state);
  const { hero, error } = editableHero(next, id);
  if (error) return { ok: false, reason: error };
  const index = next.vault.findIndex((item) => item.id === itemId);
  if (index < 0) return { ok: false, reason: "unknown_item" };
  const item = next.vault[index];
  if (!GEAR_SLOTS.includes(item.slot)) return { ok: false, reason: "not_equippable" };
  hero.equipment ||= {};
  const previous = hero.equipment[item.slot];
  next.vault.splice(index, 1);
  if (previous) next.vault.push(previous);
  hero.equipment[item.slot] = item;
  clampHp(hero);
  return { ok: true, state: next };
}

export function unequipGear(state, id, slot) {
  const next = serializeGameState(state);
  const { hero, error } = editableHero(next, id);
  if (error) return { ok: false, reason: error };
  const item = hero.equipment?.[slot];
  if (!item) return { ok: false, reason: "slot_empty" };
  delete hero.equipment[slot];
  next.vault.push(item);
  clampHp(hero);
  return { ok: true, state: next };
}

export function sellGear(state, itemId) {
  const next = serializeGameState(state);
  const index = next.vault.findIndex((item) => item.id === itemId);
  if (index < 0) return { ok: false, reason: "unknown_item" };
  const [item] = next.vault.splice(index, 1);
  next.gold += Math.max(0, Math.round(item.value || 0));
  return { ok: true, state: next };
}

export function buyConsumable(state, key, qty = 1) {
  const item = CONSUMABLES[key];
  if (!item) return { ok: false, reason: "unknown_item" };
  const count = Math.max(1, Math.floor(qty));
  const cost = item.price * count;
  if (state.gold < cost) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  next.gold -= cost;
  next.stash[key] = (next.stash[key] || 0) + count;
  return { ok: true, state: next };
}

// Fill a quick slot from the stash up to the item's stack cap. A different
// item already in the slot goes back to the stash first.
export function loadQuickSlot(state, id, slotIndex, key) {
  const item = CONSUMABLES[key];
  if (!item) return { ok: false, reason: "unknown_item" };
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= QUICK_SLOT_COUNT) return { ok: false, reason: "invalid_slot" };
  const next = serializeGameState(state);
  const { hero, error } = editableHero(next, id);
  if (error) return { ok: false, reason: error };
  hero.quickSlots ||= Array(QUICK_SLOT_COUNT).fill(null);
  const current = hero.quickSlots[slotIndex];
  if (current && current.key !== key) {
    next.stash[current.key] = (next.stash[current.key] || 0) + current.qty;
    hero.quickSlots[slotIndex] = null;
  }
  const have = hero.quickSlots[slotIndex]?.qty || 0;
  const moved = Math.min(item.stackCap - have, next.stash[key] || 0);
  if (moved <= 0) return { ok: false, reason: have >= item.stackCap ? "stack_full" : "none_in_stash" };
  next.stash[key] -= moved;
  hero.quickSlots[slotIndex] = { key, qty: have + moved };
  return { ok: true, state: next };
}

export function unloadQuickSlot(state, id, slotIndex) {
  const next = serializeGameState(state);
  const { hero, error } = editableHero(next, id);
  if (error) return { ok: false, reason: error };
  const current = hero.quickSlots?.[slotIndex];
  if (!current) return { ok: false, reason: "slot_empty" };
  next.stash[current.key] = (next.stash[current.key] || 0) + current.qty;
  hero.quickSlots[slotIndex] = null;
  return { ok: true, state: next };
}

// Display-only combat sheet; mirrors the engine's classlessHeroDerived maths.
export function heroCombatSummary(hero) {
  const gear = heroGearStats(hero);
  const effects = classlessCombatEffects(hero.progression?.ownedNodeIds);
  const stats = hero.combat.stats;
  const attack = hero.combat.basicAttack;
  return {
    attack: Math.round((attack.damage + (stats.attack - HERO_BASELINE.stats.attack) + gear.attack) * (1 + effects.weaponDamage)),
    defense: stats.defense + gear.defense,
    maxHp: classlessMaxHp(hero),
    dodge: C.dodgeChance(stats.agility + gear.agility),
    critChance: Math.min(0.5, attack.criticalChance + effects.critChance + gear.critChance),
  };
}

export function formatGearStats(stats = {}) {
  return GEAR_STAT_KEYS.filter((key) => stats[key])
    .map((key) => `${GEAR_STAT_LABELS[key]} +${key === "critChance" ? `${Math.round(stats[key] * 100)}%` : stats[key]}`)
    .join(" · ");
}

// Per-stat change from swapping `current` for `candidate` (either may be null).
export function gearStatDelta(candidate, current) {
  const delta = {};
  for (const key of GEAR_STAT_KEYS) {
    const value = (candidate?.stats?.[key] || 0) - (current?.stats?.[key] || 0);
    if (value) delta[key] = key === "critChance" ? Math.round(value * 100) / 100 : value;
  }
  return delta;
}
