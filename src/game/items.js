// Gauntlet items: gear generation, loot drops, and the pure state mutators for
// equipping gear, loading quick slots, selling and buying. Every mutator
// returns { ok, state } (or { ok: false, reason }) and never touches its input.
import { classlessCombatEffects, classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import {
  CONSUMABLES, CORE_STAT_KEYS, CRYSTAL_KEYS, CRYSTALS, FLETCHING, GEAR_SETS, PROVISIONS, crystalFits, crystalInfo, itemSockets, GEAR_SLOTS, GEAR_STAT_KEYS, GEAR_STAT_LABELS, PERCENT_STATS,
  QUICK_SLOT_COUNT, SUPPLY_STYLES, heroGearStats, heroUsesArrows, heroWeaponProfile,
} from "../combat/gear";
import { HERO_BASELINE, serializeGameState, statDefense } from "../combat/heroModel";
import { luckEffects } from "../combat/luck";
import { heroTraitEffects } from "../combat/traits";

export const RARITIES = Object.freeze({
  common: { key: "common", name: "Common", word: "Scrap", color: "#94A3B8", mult: 1, sell: 6 },
  uncommon: { key: "uncommon", name: "Uncommon", word: "Neon", color: "#39FF14", mult: 1.5, sell: 15 },
  rare: { key: "rare", name: "Rare", word: "Void", color: "#00F3FF", mult: 2.2, sell: 40 },
  epic: { key: "epic", name: "Epic", word: "Demon", color: "#A855F7", mult: 3.2, sell: 100 },
  legendary: { key: "legendary", name: "Legendary", word: "Legendary", color: "#FF9F1C", mult: 4.2, sell: 250 },
});
export const RARITY_ORDER = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);
// Random affixes per rarity (legendary items have fixed powers instead).
const AFFIX_COUNT = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 0 };

// Gear tier scales every stat: 1 = The Gutter, 2 = Boneyard Crypt, 3 = Frostfang Pass, 4 = Ashen Keep, 5 = The Blightmire.
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
    { id: "quiver", name: "Quiver", stats: { attack: 2, arrowSaver: 0.2 } },
  ],
  trinket: [
    { id: "amulet", name: "Amulet", stats: { maxHp: 20, defense: 2 } },
    { id: "ring", name: "Ring", stats: { critChance: 0.04, attack: 1 } },
  ],
});

// Affixes: a prefix or suffix adds one stat to an item. `slots` limits where
// it can roll. Flat values grow with the item's tier; percentages a little.
export const AFFIXES = Object.freeze({
  vampiric: { name: "Vampiric", kind: "prefix", stat: "lifesteal", value: 0.04, slots: ["weapon", "trinket"] },
  spiked: { name: "Spiked", kind: "prefix", stat: "thorns", value: 0.15, slots: ["chest", "secondary", "arms"] },
  brutal: { name: "Brutal", kind: "prefix", stat: "critDamage", value: 0.15, slots: ["weapon", "arms", "trinket"] },
  swift: { name: "Swift", kind: "prefix", stat: "attackSpeed", value: 0.05, slots: ["weapon", "arms", "legs", "trinket"] },
  mighty: { name: "Mighty", kind: "prefix", stat: "damageBonus", value: 0.05, slots: ["weapon", "head", "trinket"] },
  stout: { name: "Stout", kind: "prefix", stat: "healthBonus", value: 0.06, slots: ["head", "chest", "legs"] },
  lucky: { name: "Lucky", kind: "prefix", stat: "goldFind", value: 0.1, slots: ["head", "trinket"] },
  fletchers: { name: "Fletcher's", kind: "prefix", stat: "arrowSaver", value: 0.12, slots: ["secondary", "arms"] },
  sturdy: { name: "Sturdy", kind: "prefix", stat: "defense", value: 3, slots: ["head", "chest", "legs", "arms", "secondary"] },
  keen: { name: "Keen", kind: "prefix", stat: "critChance", value: 0.03, slots: ["weapon", "head", "trinket"] },
  sight: { name: "of Sight", kind: "suffix", stat: "darkResist", value: 0.2, slots: ["head", "trinket"] },
  warmth: { name: "of Warmth", kind: "suffix", stat: "coldResist", value: 0.2, slots: ["head", "chest", "legs", "arms"] },
  emberWard: { name: "of the Ember Ward", kind: "suffix", stat: "heatResist", value: 0.2, slots: ["chest", "secondary", "trinket"] },
  purity: { name: "of Purity", kind: "suffix", stat: "toxicResist", value: 0.2, slots: ["head", "chest", "trinket"] },
  mending: { name: "of Mending", kind: "suffix", stat: "regen", value: 1.5, slots: ["chest", "legs", "trinket"] },
  frost: { name: "of Frost", kind: "suffix", stat: "chill", value: 0.15, slots: ["weapon"] },
  embers: { name: "of Embers", kind: "suffix", stat: "burn", value: 0.15, slots: ["weapon"] },
  bear: { name: "of the Bear", kind: "suffix", stat: "maxHp", value: 20, slots: GEAR_SLOTS },
  fox: { name: "of the Fox", kind: "suffix", stat: "agility", value: 3, slots: GEAR_SLOTS },
});
const RESIST_STATS = new Set(["darkResist", "coldResist", "heatResist", "toxicResist"]);

function affixValue(stat, base, tier) {
  if (RESIST_STATS.has(stat)) return Math.min(0.35, Math.round((base + 0.02 * (clampTier(tier) - 1)) * 100) / 100);
  if (PERCENT_STATS.has(stat)) return Math.round(base * (1 + 0.1 * (clampTier(tier) - 1)) * 100) / 100;
  if (stat === "regen") return Math.round(base * tierMult(tier) * 10) / 10;
  return Math.max(1, Math.round(base * tierMult(tier)));
}

// Pick `count` different affixes for a slot: at most one prefix and one
// suffix first (they make the name), then any.
export function rollAffixes(slot, count, tier, rng = Math.random) {
  const pool = Object.entries(AFFIXES).filter(([, affix]) => affix.slots.includes(slot));
  const chosen = [];
  const take = (filter) => {
    const options = pool.filter(([key, affix]) => !chosen.some((entry) => entry.key === key) && filter(affix));
    if (!options.length) return;
    const [key, affix] = options[Math.floor(rng() * options.length)];
    chosen.push({ key, stat: affix.stat, value: affixValue(affix.stat, affix.value, tier) });
  };
  for (let index = 0; index < count; index += 1) {
    if (index === 0) take(rng() < 0.5 ? (affix) => affix.kind === "prefix" : (affix) => affix.kind === "suffix");
    else if (index === 1) take((affix) => !chosen.some((entry) => AFFIXES[entry.key].kind === affix.kind));
    else take(() => true);
  }
  return chosen;
}

// Legendary items: one per slot family, each with a power the engine knows.
export const LEGENDARIES = Object.freeze({
  dawnbreaker: { name: "Dawnbreaker", slot: "weapon", variant: "sword", power: "Every swing cleaves a second foe for 50%.", stats: { cleave: 0.5, critChance: 0.05 } },
  whisperwind: { name: "Whisperwind", slot: "weapon", variant: "bow", power: "Every third shot looses two extra arrows for free. 30% of arrows are saved.", stats: { volley: 2, arrowSaver: 0.3 } },
  embercall: { name: "Embercall", slot: "weapon", variant: "staff", power: "Bolts set foes ablaze for 40% of the hit.", stats: { burn: 0.4, damageBonus: 0.08 } },
  heartOfTheMountain: { name: "Heart of the Mountain", slot: "chest", variant: "cuirass", power: "Immune to darkness, cold, heat and toxins.", stats: { darkResist: 1, coldResist: 1, heatResist: 1, toxicResist: 1, healthBonus: 0.1 } },
  gnomebane: { name: "Gnomebane Buckler", slot: "secondary", variant: "shield", power: "Halves explosion damage and reflects 30% of melee hits.", stats: { blastWard: 0.5, thorns: 0.3 } },
  gravebinder: { name: "Gravebinder Ring", slot: "trinket", variant: "ring", power: "Once per fight, rise again at 30% HP.", stats: { revive: 0.3, lifesteal: 0.04 } },
});
export const LEGENDARY_KEYS = Object.freeze(Object.keys(LEGENDARIES));

// Per-enemy loot. At most one drop per kill: gear is rolled first, then supplies.
export const LOOT_TABLE = Object.freeze({
  gearChance: { basic: 0.04, specialized: 0.08, elite: 0.3, boss: 1 },
  supplyChance: { basic: 0.06, specialized: 0.1, elite: 0.4, boss: 0 },
  // Chance a kill drops a crystal instead of nothing (checked after gear and supplies).
  crystalChance: { basic: 0.01, specialized: 0.03, elite: 0.12, boss: 0 },
  rarityWeights: {
    basic: { common: 75, uncommon: 22, rare: 3, epic: 0 },
    specialized: { common: 55, uncommon: 33, rare: 10, epic: 2 },
    elite: { common: 20, uncommon: 45, rare: 28, epic: 7 },
    boss: { common: 0, uncommon: 0, rare: 65, epic: 35 },
  },
  // A boss's gear drop is a legendary this often; legends of the road drop one more often.
  legendaryChance: { boss: 0.08, legend: 0.15 },
  // Share of a region's gear drops that are pieces of its set (elites and bosses: more).
  setChance: { basic: 0.06, specialized: 0.08, elite: 0.2, boss: 0.25 },
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

// `set` makes the item a piece of that gear set; `legendary` a legendary item
// by key (its slot and variant are fixed). Rarity sets the base stat strength
// and how many random affixes roll.
export function createGearItem({ slot, variant, rarity = "common", tier = 1, set = null, legendary = null } = {}, rng = Math.random) {
  const unique = legendary ? LEGENDARIES[legendary] : null;
  if (legendary && !unique) throw new RangeError(`Unknown legendary ${legendary}`);
  const slotKey = unique ? unique.slot : slot;
  const templates = GEAR_TEMPLATES[slotKey];
  if (!templates) throw new RangeError(`Unknown gear slot ${slotKey}`);
  const wanted = unique ? unique.variant : variant;
  const template = templates.find((entry) => entry.id === wanted) || templates[Math.floor(rng() * templates.length)];
  const info = unique ? RARITIES.legendary : RARITIES[rarity] || RARITIES.common;
  const baseStats = scaleStats(template.stats, info.mult * tierMult(tier));
  const affixes = unique
    ? Object.entries(unique.stats).map(([stat, value]) => ({ key: "legendary", stat, value }))
    : rollAffixes(slotKey, AFFIX_COUNT[info.key] || 0, tier, rng);
  const setInfo = !unique && GEAR_SETS[set] ? GEAR_SETS[set] : null;
  const item = {
    id: newItemId(),
    kind: "gear",
    slot: slotKey,
    variant: template.id,
    name: unique ? unique.name : setInfo ? `${setInfo.name} ${template.name}` : gearName(info, template.name, affixes),
    rarity: info.key,
    tier: clampTier(tier),
    ...(template.weaponType ? { weaponType: template.weaponType } : {}),
    baseStats,
    affixes,
    ...(setInfo ? { set: setInfo.key } : {}),
    ...(unique ? { legendary } : {}),
    stats: {},
    value: Math.round(info.sell * tierMult(tier) * (setInfo ? 1.5 : 1)),
  };
  item.stats = composeStats(item);
  return item;
}

// "Vampiric Sword of Warmth": first prefix and first suffix. Plain items keep the rarity word.
function gearName(info, base, affixes) {
  const prefix = affixes.find((entry) => AFFIXES[entry.key]?.kind === "prefix");
  const suffix = affixes.find((entry) => AFFIXES[entry.key]?.kind === "suffix");
  if (!prefix && !suffix) return `${info.word} ${base}`;
  return [prefix && AFFIXES[prefix.key].name, base, suffix && AFFIXES[suffix.key].name].filter(Boolean).join(" ");
}

// Core stats scale with rarity and tier; a template's special stats (a
// quiver's arrow saving) stay as they are.
function scaleStats(stats, scale) {
  const scaled = {};
  for (const [key, base] of Object.entries(stats)) {
    if (!CORE_STAT_KEYS.includes(key)) scaled[key] = base;
    else if (key === "critChance") scaled[key] = Math.round(base * scale * 100) / 100;
    else scaled[key] = Math.max(1, Math.round(base * scale));
  }
  return scaled;
}

const roundStat = (key, value) => {
  if (PERCENT_STATS.has(key)) return Math.round(value * 100) / 100;
  return key === "regen" ? Math.round(value * 10) / 10 : Math.round(value);
};

// An item's total stats: its (forged) base stats plus its affixes and the
// crystals infused into its sockets.
export function composeStats(item) {
  const upgrade = item.upgrade || 0;
  const base = item.baseStats || item.stats || {};
  const stats = upgrade ? scaleStats(base, 1 + UPGRADE_STEP * upgrade) : { ...base };
  for (const affix of item.affixes || []) stats[affix.stat] = roundStat(affix.stat, (stats[affix.stat] || 0) + affix.value);
  for (const id of item.runes || []) {
    const crystal = crystalInfo(id);
    if (crystal) stats[crystal.stat] = roundStat(crystal.stat, (stats[crystal.stat] || 0) + crystal.value);
  }
  return stats;
}

// ---------------- crystals ----------------
// Crystals live in guild.crystals ({ "ember-1": 2 }) until infused.
export const CRYSTAL_PRICE = 45;
// Gold to pull a crystal back out of a socket, per crystal tier.
export const EXTRACT_COST = 30;
export const FUSE_COUNT = 3;

export function buyCrystal(state, key) {
  if (!CRYSTALS[key]) return { ok: false, reason: "unknown_item" };
  if (state.gold < CRYSTAL_PRICE) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  next.gold -= CRYSTAL_PRICE;
  next.crystals ||= {};
  next.crystals[`${key}-1`] = (next.crystals[`${key}-1`] || 0) + 1;
  return { ok: true, state: next };
}

// Three of a kind make one of the next tier.
export function fuseCrystals(state, id) {
  const crystal = crystalInfo(id);
  if (!crystal) return { ok: false, reason: "unknown_item" };
  if (crystal.tier >= 3) return { ok: false, reason: "max_tier" };
  if ((state.crystals?.[id] || 0) < FUSE_COUNT) return { ok: false, reason: "not_enough" };
  const next = serializeGameState(state);
  next.crystals[id] -= FUSE_COUNT;
  const fused = `${crystal.key}-${crystal.tier + 1}`;
  next.crystals[fused] = (next.crystals[fused] || 0) + 1;
  return { ok: true, state: next };
}

// Set a crystal into the next free socket of a vault item or a home hero's gear.
export function infuseCrystal(state, itemId, id) {
  const next = serializeGameState(state);
  const { item, ownerId } = locateGear(next, itemId);
  if (!item) return { ok: false, reason: "unknown_item" };
  if (ownerId && next.expedition?.heroIds.includes(ownerId)) return { ok: false, reason: "hero_away" };
  const crystal = crystalInfo(id);
  if (!crystal || !(next.crystals?.[id] > 0)) return { ok: false, reason: "no_crystal" };
  if (!crystalFits(item, crystal)) return { ok: false, reason: "wrong_kind" };
  if ((item.runes || []).length >= itemSockets(item)) return { ok: false, reason: "no_free_socket" };
  next.crystals[id] -= 1;
  item.baseStats ||= { ...item.stats };
  item.runes = [...(item.runes || []), id];
  item.stats = composeStats(item);
  if (ownerId) clampHp(next.heroes.find((hero) => heroId(hero) === ownerId));
  return { ok: true, state: next };
}

// Pull a crystal back out (it returns to the stash) for a little gold.
export function extractCrystal(state, itemId, index) {
  const next = serializeGameState(state);
  const { item, ownerId } = locateGear(next, itemId);
  if (!item) return { ok: false, reason: "unknown_item" };
  if (ownerId && next.expedition?.heroIds.includes(ownerId)) return { ok: false, reason: "hero_away" };
  const id = item.runes?.[index];
  const crystal = crystalInfo(id);
  if (!crystal) return { ok: false, reason: "socket_empty" };
  const cost = EXTRACT_COST * crystal.tier;
  if (next.gold < cost) return { ok: false, reason: "insufficient_gold" };
  next.gold -= cost;
  item.runes = item.runes.filter((_, position) => position !== index);
  item.stats = composeStats(item);
  next.crystals ||= {};
  next.crystals[id] = (next.crystals[id] || 0) + 1;
  if (ownerId) clampHp(next.heroes.find((hero) => heroId(hero) === ownerId));
  return { ok: true, state: next };
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
  item.stats = composeStats(item);
  item.value = Math.round((item.value || 0) + cost * 0.25);
  return { ok: true, state: next };
}

// Salvage: break vault gear down into essence for the Reforge.
export const SALVAGE_ESSENCE = Object.freeze({ common: 1, uncommon: 3, rare: 8, epic: 20, legendary: 60 });
export function salvageValue(item) {
  return Math.round((SALVAGE_ESSENCE[item.rarity] || 1) * (1 + 0.25 * (clampTier(item.tier) - 1)) * (item.set ? 1.5 : 1));
}

export function salvageGear(state, itemId) {
  const next = serializeGameState(state);
  const index = next.vault.findIndex((item) => item.id === itemId);
  if (index < 0) return { ok: false, reason: "unknown_item" };
  const [item] = next.vault.splice(index, 1);
  next.essence = (next.essence || 0) + salvageValue(item);
  return { ok: true, state: next };
}

// Reforge: reroll an item's random affixes for essence and a little gold.
// Legendary powers and common items (no affixes) can't be reforged.
const REFORGE_ESSENCE = Object.freeze({ uncommon: 4, rare: 10, epic: 24 });
export function reforgeCost(item) {
  const essence = REFORGE_ESSENCE[item.rarity];
  return essence ? { essence: Math.round(essence * (1 + 0.25 * (clampTier(item.tier) - 1))), gold: Math.round(20 * tierMult(item.tier)) } : null;
}

export function reforgeGear(state, itemId, rng = Math.random) {
  const next = serializeGameState(state);
  const { item, ownerId } = locateGear(next, itemId);
  if (!item) return { ok: false, reason: "unknown_item" };
  if (ownerId && next.expedition?.heroIds.includes(ownerId)) return { ok: false, reason: "hero_away" };
  const cost = reforgeCost(item);
  if (!cost) return { ok: false, reason: "cannot_reforge" };
  if ((next.essence || 0) < cost.essence) return { ok: false, reason: "insufficient_essence" };
  if (next.gold < cost.gold) return { ok: false, reason: "insufficient_gold" };
  next.essence -= cost.essence;
  next.gold -= cost.gold;
  item.baseStats ||= { ...item.stats };
  item.affixes = rollAffixes(item.slot, AFFIX_COUNT[item.rarity] || 0, item.tier, rng);
  if (!item.set) item.name = gearName(RARITIES[item.rarity] || RARITIES.common, (GEAR_TEMPLATES[item.slot].find((entry) => entry.id === item.variant) || GEAR_TEMPLATES[item.slot][0]).name, item.affixes);
  item.stats = composeStats(item);
  if (ownerId) clampHp(next.heroes.find((hero) => heroId(hero) === ownerId));
  return { ok: true, state: next };
}

// Fletcher: turn a batch of plain arrows into special ones.
export function fletchArrows(state, key) {
  const cost = FLETCHING.recipes[key];
  if (!cost) return { ok: false, reason: "unknown_item" };
  if ((state.stash.arrows || 0) < FLETCHING.batch) return { ok: false, reason: "not_enough_arrows" };
  if (state.gold < cost) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  next.gold -= cost;
  next.stash.arrows -= FLETCHING.batch;
  next.stash[key] = (next.stash[key] || 0) + FLETCHING.batch;
  return { ok: true, state: next };
}

export function isConsumableDrop(item) {
  return item?.kind === "consumable" && (!!CONSUMABLES[item.key] || !!PROVISIONS[item.key]);
}

export function randomLegendary(tier, rng = Math.random) {
  return createGearItem({ legendary: LEGENDARY_KEYS[Math.floor(rng() * LEGENDARY_KEYS.length)], tier }, rng);
}

// Loot for one kill, or null. Handed to the engine as sim.rollDrop.
// `set` is the region's gear set, if it has one.
// `luck` (a fraction, from the party's Luck) adds weight to every gear rarity
// above common.
export function rollLoot(enemy, tier = 1, rng = Math.random, { set = null, luck = 0 } = {}) {
  const enemyTier = LOOT_TABLE.gearChance[enemy?.tier] != null ? enemy.tier : "basic";
  if (rng() < LOOT_TABLE.gearChance[enemyTier]) {
    const legendChance = enemy?.legendary ? LOOT_TABLE.legendaryChance.legend : enemyTier === "boss" ? LOOT_TABLE.legendaryChance.boss : 0;
    if (legendChance && rng() < legendChance) return randomLegendary(tier, rng);
    const slot = GEAR_SLOTS[Math.floor(rng() * GEAR_SLOTS.length)];
    const weights = Object.fromEntries(Object.entries(LOOT_TABLE.rarityWeights[enemyTier])
      .map(([key, weight]) => [key, key === "common" ? weight : weight * (1 + luck)]));
    const rarity = weightedPick(weights, rng);
    if (set && GEAR_SETS[set] && rng() < LOOT_TABLE.setChance[enemyTier]) {
      return createGearItem({ slot, rarity: rarity === "epic" ? "epic" : "rare", tier, set }, rng);
    }
    return createGearItem({ slot, rarity, tier }, rng);
  }
  if (rng() < LOOT_TABLE.supplyChance[enemyTier]) {
    return { kind: "consumable", key: weightedPick(LOOT_TABLE.supplyWeights[enemyTier], rng), qty: 1 };
  }
  if (rng() < LOOT_TABLE.crystalChance[enemyTier]) return randomCrystal(1, rng);
  return null;
}

export function randomCrystal(tier = 1, rng = Math.random) {
  return { kind: "crystal", key: `${CRYSTAL_KEYS[Math.floor(rng() * CRYSTAL_KEYS.length)]}-${tier}`, qty: 1 };
}

// Gear goes to the vault; consumables stack in the stash.
export function bankLoot(state, items = []) {
  for (const item of items) {
    if (isConsumableDrop(item)) state.stash[item.key] = (state.stash[item.key] || 0) + Math.max(1, item.qty || 1);
    else if (item?.kind === "crystal" && crystalInfo(item.key)) {
      state.crystals ||= {};
      state.crystals[item.key] = (state.crystals[item.key] || 0) + Math.max(1, item.qty || 1);
    } else if (item?.kind === "gear") state.vault.push(item);
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
    // An emptied slot remembers its item (qty 0) so it can be refilled at departure.
    const qty = Math.max(0, Math.min(item?.stackCap || 0, Math.floor(Number(entry?.qty) || 0)));
    return item ? { key: entry.key, qty } : null;
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

// Supplies and provisions both go to the stash.
export function buyConsumable(state, key, qty = 1) {
  const item = CONSUMABLES[key] || PROVISIONS[key];
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

// How a hero uses healing supplies in battle (any time, even mid-expedition).
export function setSupplyStyle(state, id, { style, savePotions } = {}) {
  const next = serializeGameState(state);
  const hero = next.heroes.find((entry) => heroId(entry) === id);
  if (!hero) return { ok: false, reason: "unknown_hero" };
  if (style !== undefined) {
    if (!SUPPLY_STYLES[style]) return { ok: false, reason: "unknown_style" };
    hero.supplyStyle = style;
  }
  if (savePotions !== undefined) hero.savePotions = !!savePotions;
  return { ok: true, state: next };
}

// Top up every quick slot from the stash before a trip. A bow hero with no
// arrows loaded takes plain arrows into a free slot. Mutates `state` (a
// private copy); returns the names of bow heroes left without arrows.
export function restockQuickSlots(state, heroIds) {
  const unarmed = [];
  for (const id of heroIds) {
    const hero = state.heroes.find((entry) => heroId(entry) === id);
    if (!hero) continue;
    hero.quickSlots ||= Array(QUICK_SLOT_COUNT).fill(null);
    if (heroUsesArrows(hero) && !hero.quickSlots.some((slot) => CONSUMABLES[slot?.key]?.arrow)) {
      const free = hero.quickSlots.findIndex((slot) => !slot || !(slot.qty > 0));
      if (free >= 0) hero.quickSlots[free] = { key: "arrows", qty: 0 };
    }
    for (const slot of hero.quickSlots) {
      if (!slot || !CONSUMABLES[slot.key]) continue;
      const moved = Math.min(CONSUMABLES[slot.key].stackCap - slot.qty, state.stash[slot.key] || 0);
      if (moved > 0) {
        state.stash[slot.key] -= moved;
        slot.qty += moved;
      }
    }
    if (heroUsesArrows(hero) && !hero.quickSlots.some((slot) => CONSUMABLES[slot?.key]?.arrow && slot.qty > 0)) unarmed.push(hero.identity.name);
  }
  return unarmed;
}

// Display-only combat sheet; mirrors the engine's classlessHeroDerived maths.
export function heroCombatSummary(hero) {
  const gear = heroGearStats(hero);
  const traits = heroTraitEffects(hero);
  const effects = classlessCombatEffects(hero.progression?.ownedNodeIds);
  const stats = hero.combat.stats;
  const attack = hero.combat.basicAttack;
  const weapon = (attack.damage + (stats.attack - HERO_BASELINE.stats.attack) + gear.attack) * (heroWeaponProfile(hero)?.damage ?? 1);
  return {
    attack: Math.round(weapon * (1 + effects.weaponDamage) * (1 + traits.damage)),
    defense: statDefense(stats) + gear.defense + traits.defense,
    maxHp: classlessMaxHp(hero),
    dodge: Math.min(C.dodgeChance(Infinity), C.dodgeChance(stats.agility + gear.agility + traits.agility) + luckEffects(stats.luck).dodge),
    critChance: Math.min(0.5, attack.criticalChance + effects.critChance + gear.critChance + traits.critChance + luckEffects(stats.luck).critChance),
  };
}

export function formatStatValue(key, value) {
  if (PERCENT_STATS.has(key)) return `${Math.round(value * 100)}%`;
  if (key === "regen") return `${value}/s`;
  return `${value}`;
}

export function formatGearStats(stats = {}) {
  return GEAR_STAT_KEYS.filter((key) => stats[key])
    .map((key) => `${GEAR_STAT_LABELS[key]} +${formatStatValue(key, stats[key])}`)
    .join(" · ");
}

// Per-stat change from swapping `current` for `candidate` (either may be null).
export function gearStatDelta(candidate, current) {
  const delta = {};
  for (const key of GEAR_STAT_KEYS) {
    const value = (candidate?.stats?.[key] || 0) - (current?.stats?.[key] || 0);
    if (value) delta[key] = roundStat(key, value);
  }
  return delta;
}

// A rough single number for comparing two pieces for the same slot (used by
// the Guild Hall hints): core stats plus the specials most heroes want.
export function gearScore(item) {
  const stats = item?.stats || {};
  if (!item) return 0;
  return (stats.attack || 0) * 3 + (stats.defense || 0) * 2 + (stats.maxHp || 0) * 0.25 + (stats.agility || 0)
    + (stats.critChance || 0) * 150 + ((stats.damageBonus || 0) + (stats.attackSpeed || 0) + (stats.lifesteal || 0)) * 120
    + (stats.healthBonus || 0) * 100 + (stats.critDamage || 0) * 40;
}
