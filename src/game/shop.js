// The Market's gear shop. Stock rotates every 4 hours and is generated from a
// seeded RNG (guild seed + rotation + rerolls), so it is stable across reloads
// without being stored. Only the rotation, its reroll count and the ids sold
// this rotation are saved.
import { serializeGameState } from "../combat/heroModel";
import { GEAR_SLOTS } from "../combat/gear";
import { composeStats, createGearItem, tierMult } from "./items";
import { seededRandom } from "./random";
import { REGIONS } from "./regions";

export const SHOP_ROTATION_MS = 4 * 60 * 60 * 1000;
export const SHOP_REGULAR_COUNT = 5;
const REGULAR_RARITY_WEIGHTS = { common: 35, uncommon: 45, rare: 20 };
const REGULAR_PRICE_MULT = 6;
// The featured Masterwork: Epic, one tier above the guild's progress, +15% stats.
const FEATURED_STAT_BONUS = 1.15;
const FEATURED_PRICE_MULT = 10;
const BASE_REROLL_COST = 60;

export function shopRotation(now) {
  return Math.floor(now / SHOP_ROTATION_MS);
}

// The best gear tier the guild has earned access to: its strongest cleared
// region, plus one tier for every two boss ranks.
export function shopTier(state) {
  const cleared = REGIONS.filter((region) => !region.endless && state.clears?.[region.id] > 0).map((region) => region.tier);
  return Math.max(1, ...cleared) + Math.floor((state.bossRank || 0) / 2);
}

function weightedPick(weights, rng) {
  const entries = Object.entries(weights);
  let roll = rng() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

function rotationState(state, now) {
  const rotation = shopRotation(now);
  const saved = state.shop?.rotation === rotation ? state.shop : null;
  return { rotation, rerolls: saved?.rerolls || 0, sold: saved?.sold || [] };
}

export function rerollCost(state, now) {
  const { rerolls } = rotationState(state, now);
  return Math.round(BASE_REROLL_COST * tierMult(shopTier(state)) * 2 ** rerolls);
}

export function shopStock(state, now) {
  const { rotation, rerolls, sold } = rotationState(state, now);
  const rng = seededRandom((state.seed || 1) * 31 + rotation * 7919 + rerolls * 104729);
  const tier = shopTier(state);
  const items = [];
  for (let index = 0; index < SHOP_REGULAR_COUNT; index += 1) {
    const slot = GEAR_SLOTS[Math.floor(rng() * GEAR_SLOTS.length)];
    const item = createGearItem({ slot, rarity: weightedPick(REGULAR_RARITY_WEIGHTS, rng), tier }, rng);
    items.push({ ...item, id: `shop-${rotation}-${rerolls}-${index}`, price: item.value * REGULAR_PRICE_MULT, featured: false });
  }
  const slot = GEAR_SLOTS[Math.floor(rng() * GEAR_SLOTS.length)];
  const masterwork = createGearItem({ slot, rarity: "epic", tier: tier + 1 }, rng);
  for (const key of Object.keys(masterwork.baseStats)) {
    masterwork.baseStats[key] = key === "critChance"
      ? Math.round(masterwork.baseStats[key] * FEATURED_STAT_BONUS * 100) / 100
      : Math.round(masterwork.baseStats[key] * FEATURED_STAT_BONUS);
  }
  masterwork.stats = composeStats(masterwork);
  items.push({
    ...masterwork,
    id: `shop-${rotation}-${rerolls}-featured`,
    name: `Masterwork ${masterwork.name.replace(/^Demon /, "")}`,
    masterwork: true,
    price: masterwork.value * FEATURED_PRICE_MULT,
    featured: true,
  });
  return {
    rotation,
    endsAt: (rotation + 1) * SHOP_ROTATION_MS,
    tier,
    rerollCost: rerollCost(state, now),
    items: items.map((item) => ({ ...item, sold: sold.includes(item.id) })),
  };
}

export function buyShopItem(state, itemId, now) {
  const stock = shopStock(state, now);
  const offer = stock.items.find((item) => item.id === itemId);
  if (!offer) return { ok: false, reason: "unknown_item" };
  if (offer.sold) return { ok: false, reason: "sold_out" };
  if (state.gold < offer.price) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  const { rotation, rerolls, sold } = rotationState(state, now);
  const { price, featured, sold: _sold, ...item } = offer;
  next.gold -= price;
  next.vault.push({ ...item, id: `${item.id}-${(state.seed || 1).toString(36)}` });
  next.shop = { rotation, rerolls, sold: [...sold, itemId] };
  return { ok: true, state: next };
}

export function rerollShop(state, now) {
  const cost = rerollCost(state, now);
  if (state.gold < cost) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  const { rotation, rerolls } = rotationState(state, now);
  next.gold -= cost;
  next.shop = { rotation, rerolls: rerolls + 1, sold: [] };
  return { ok: true, state: next };
}
