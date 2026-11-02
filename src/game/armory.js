// The armory: how well a piece of gear suits a hero, picking the best vault
// gear for one hero or the whole party, and (later steps) sorting and clearing
// the vault. Menus only: nothing here runs during a fight.
import { GEAR_SLOTS, heroGearStats } from "../combat/gear";
import { serializeGameState } from "../combat/heroModel";
import { RARITY_ORDER, equipGear, gearScore, salvageValue } from "./items";

// What each stat is worth to a hero, by the weapon they fight with. Stats a
// hero can't use (arrow saving without a bow, cleave without a sword) are worth
// nothing to them. Everyone values survival, resistances and on-hit effects.
const SHARED_WEIGHTS = Object.freeze({
  defense: 2, maxHp: 0.25, agility: 1, healthBonus: 100, damageBonus: 120, critDamage: 40, regen: 4, thorns: 20,
  revive: 60, blastWard: 20, chill: 40, burn: 40, venom: 40, shock: 40, goldFind: 10,
  darkResist: 15, coldResist: 15, heatResist: 15, toxicResist: 15,
});
export const ROLE_WEIGHTS = Object.freeze({
  sword: Object.freeze({ ...SHARED_WEIGHTS, attack: 3, critChance: 150, attackSpeed: 120, lifesteal: 120, cleave: 60 }),
  bow: Object.freeze({ ...SHARED_WEIGHTS, attack: 3, critChance: 170, attackSpeed: 130, lifesteal: 80, volley: 50, arrowSaver: 40 }),
  staff: Object.freeze({ ...SHARED_WEIGHTS, attack: 2.5, critChance: 120, attackSpeed: 100, lifesteal: 80, volley: 40, maxHp: 0.35, defense: 2.5 }),
  none: Object.freeze({ ...SHARED_WEIGHTS, attack: 3, critChance: 150, attackSpeed: 120, lifesteal: 120 }),
});

// A swap counts as an upgrade only if it adds at least 1% fit (and a little in
// absolute terms), so near-identical pieces aren't shuffled back and forth.
export const UPGRADE_MIN = Object.freeze({ share: 0.01, points: 0.5 });

const heroId = (hero) => hero.identity.id;

export function heroRole(hero) {
  const type = hero?.equipment?.weapon?.weaponType;
  return ROLE_WEIGHTS[type] ? type : "none";
}

// One number for everything a hero wears, set bonuses included.
export function heroFit(hero) {
  const weights = ROLE_WEIGHTS[heroRole(hero)];
  const stats = heroGearStats(hero);
  let fit = 0;
  for (const [key, weight] of Object.entries(weights)) fit += (stats[key] || 0) * weight;
  return fit;
}

// A hero keeps their kind of weapon: a sword user is only offered swords.
// An empty-handed hero can take any weapon.
export function canWear(hero, item) {
  if (!item || item.kind !== "gear" || !GEAR_SLOTS.includes(item.slot)) return false;
  const weapon = hero?.equipment?.weapon;
  return !(item.slot === "weapon" && weapon && item.weaponType !== weapon.weaponType);
}

function wearing(hero, item) {
  return { ...hero, equipment: { ...(hero.equipment || {}), [item.slot]: item } };
}

// What swapping `item` in would change: { gain, share } (share of current fit),
// or null if the hero can't wear it.
export function fitChange(hero, item) {
  if (!canWear(hero, item)) return null;
  const before = heroFit(hero);
  const gain = heroFit(wearing(hero, item)) - before;
  return { gain, share: gain / Math.max(1, before) };
}

export function isUpgrade(change, hero) {
  return !!change && change.gain > Math.max(UPGRADE_MIN.points, UPGRADE_MIN.share * Math.max(1, heroFit(hero)));
}

// "+12%", "Worse" or "Same" for the gear picker.
export function fitTag(hero, item) {
  const change = fitChange(hero, item);
  if (!change) return null;
  if (isUpgrade(change, hero)) return { kind: "upgrade", text: `Upgrade +${Math.max(1, Math.round(change.share * 100))}%`, change };
  if (change.gain < -UPGRADE_MIN.points) return { kind: "worse", text: "Worse", change };
  return { kind: "same", text: "About the same", change };
}

// Vault pieces for one slot, best fit first.
export function rankForSlot(hero, vault, slot) {
  return vault.filter((item) => item.slot === slot)
    .map((item) => ({ item, change: fitChange(hero, item) }))
    .sort((a, b) => (b.change?.gain ?? -Infinity) - (a.change?.gain ?? -Infinity));
}

// The single best upgrade in the vault for a hero, or null.
function bestUpgrade(hero, vault) {
  let best = null;
  for (const item of vault) {
    const change = fitChange(hero, item);
    if (isUpgrade(change, hero) && (!best || change.gain > best.change.gain)) best = { item, change };
  }
  return best;
}

const isHome = (state, id) => !state.expedition?.heroIds.includes(id);

// Put the best vault gear on one hero, slot by slot, until nothing beats what
// they wear. Swapped-out gear goes back to the vault. Never takes gear from
// another hero.
export function equipBest(state, id) {
  let next = state;
  let count = 0;
  for (let guard = 0; guard < GEAR_SLOTS.length * 3; guard += 1) {
    const hero = next.heroes.find((entry) => heroId(entry) === id);
    if (!hero) return { ok: false, reason: "unknown_hero" };
    if (!isHome(next, id)) return { ok: false, reason: "hero_away" };
    const best = bestUpgrade(hero, next.vault);
    if (!best) break;
    const result = equipGear(next, id, best.item.id);
    if (!result.ok) break;
    next = result.state;
    count += 1;
  }
  return count ? { ok: true, state: next, count } : { ok: false, reason: "no_upgrades" };
}

// Share the vault out across every hero at home: repeatedly make the swap that
// adds the most fit to anyone. Gear a hero takes off can go to someone else.
export function equipBestParty(state) {
  let next = state;
  let count = 0;
  for (let guard = 0; guard < GEAR_SLOTS.length * Math.max(1, state.heroes.length) * 3; guard += 1) {
    let pick = null;
    for (const hero of next.heroes) {
      if (!isHome(next, heroId(hero))) continue;
      const best = bestUpgrade(hero, next.vault);
      if (best && (!pick || best.change.gain > pick.change.gain)) pick = { ...best, id: heroId(hero) };
    }
    if (!pick) break;
    const result = equipGear(next, pick.id, pick.item.id);
    if (!result.ok) break;
    next = result.state;
    count += 1;
  }
  return count ? { ok: true, state: next, count } : { ok: false, reason: "no_upgrades" };
}

// Every hero (home or away) this item would be an upgrade for, best first.
export function upgradeFor(state, item) {
  return state.heroes
    .map((hero) => ({ hero, change: fitChange(hero, item) }))
    .filter(({ hero, change }) => isUpgrade(change, hero))
    .sort((a, b) => b.change.share - a.change.share);
}

// ---------------- vault view (sorting and filtering) ----------------
export const VAULT_SORTS = Object.freeze({
  fit: "Best for hero",
  newest: "Newest",
  rarity: "Rarity",
  value: "Sell value",
});

// The vault as shown: filtered by slot and rarity ("all" for either), then
// sorted. "fit" ranks by how much the piece adds for `hero` (pieces they can't
// wear last); the vault keeps arrival order, so newest is the end of it.
export function vaultView(vault, { slot = "all", rarity = "all", sort = "rarity", hero = null } = {}) {
  const items = vault.map((item, index) => ({ item, index }))
    .filter(({ item }) => (slot === "all" || item.slot === slot) && (rarity === "all" || item.rarity === rarity));
  const rank = (item) => RARITY_ORDER.indexOf(item.rarity);
  const gain = (item) => (hero ? fitChange(hero, item)?.gain ?? -Infinity : 0);
  const compare = {
    fit: (a, b) => gain(b.item) - gain(a.item) || rank(b.item) - rank(a.item),
    newest: (a, b) => b.index - a.index,
    rarity: (a, b) => rank(b.item) - rank(a.item) || (b.item.tier || 1) - (a.item.tier || 1) || a.item.slot.localeCompare(b.item.slot),
    value: (a, b) => (b.item.value || 0) - (a.item.value || 0),
  }[VAULT_SORTS[sort] ? sort : "rarity"];
  return items.sort(compare).map(({ item }) => item);
}

// ---------------- clearing the vault ----------------
// Gear that Clear junk never picks and auto-clear never touches: locked,
// forged, holding a crystal, a set piece or a Legendary. (Clear junk can still
// sell a set piece or Legendary if the player ticks it by hand.)
export function isProtected(item) {
  return !!(item.locked || (item.upgrade || 0) > 0 || item.runes?.some(Boolean) || item.set || item.legendary);
}

const spareGroup = (item) => (item.slot === "weapon" ? `weapon:${item.weaponType || ""}` : item.slot);

// What Clear junk ticks: unprotected vault gear that isn't an upgrade for any
// hero, home or away. One spare per slot (per weapon type) is kept back, the
// best of the junk, unless the vault already holds another piece for it, so a
// new recruit always has something to wear.
export function junkItems(state) {
  const junk = state.vault.filter((item) => !isProtected(item) && upgradeFor(state, item).length === 0);
  const junkIds = new Set(junk.map((item) => item.id));
  const keep = new Set();
  const groups = {};
  for (const item of junk) (groups[spareGroup(item)] ||= []).push(item);
  for (const [group, items] of Object.entries(groups)) {
    if (state.vault.some((item) => !junkIds.has(item.id) && spareGroup(item) === group)) continue;
    keep.add(items.reduce((best, item) => (gearScore(item) > gearScore(best) ? item : best)).id);
  }
  return junk.filter((item) => !keep.has(item.id));
}

// Sell (gold) or salvage (essence) many vault pieces at once. Locked pieces
// and unknown ids are skipped.
export function clearGear(state, itemIds, mode = "sell") {
  if (mode !== "sell" && mode !== "salvage") return { ok: false, reason: "unknown_mode" };
  const wanted = new Set(itemIds);
  const next = serializeGameState(state);
  const cleared = next.vault.filter((item) => wanted.has(item.id) && !item.locked);
  if (!cleared.length) return { ok: false, reason: "nothing_to_clear" };
  const gone = new Set(cleared.map((item) => item.id));
  next.vault = next.vault.filter((item) => !gone.has(item.id));
  const gold = mode === "sell" ? cleared.reduce((sum, item) => sum + Math.max(0, Math.round(item.value || 0)), 0) : 0;
  const essence = mode === "salvage" ? cleared.reduce((sum, item) => sum + salvageValue(item), 0) : 0;
  next.gold += gold;
  next.essence = (next.essence || 0) + essence;
  return { ok: true, state: next, count: cleared.length, gold, essence };
}

// Auto-clear: off unless the player turns it on. When an expedition comes
// home, new gear at or below `maxRarity` that's unprotected and no upgrade for
// anyone is sold or salvaged. Only Common to Rare can be chosen.
export const AUTO_CLEAR_RARITIES = Object.freeze(["common", "uncommon", "rare"]);
export const AUTO_CLEAR_DEFAULT = Object.freeze({ enabled: false, maxRarity: "uncommon", mode: "sell" });

export function normalizeAutoClear(saved) {
  if (!saved || typeof saved !== "object") return null;
  return {
    enabled: saved.enabled === true,
    maxRarity: AUTO_CLEAR_RARITIES.includes(saved.maxRarity) ? saved.maxRarity : AUTO_CLEAR_DEFAULT.maxRarity,
    mode: saved.mode === "salvage" ? "salvage" : "sell",
  };
}

export function autoClearSettings(state) {
  return normalizeAutoClear(state.autoClear) || { ...AUTO_CLEAR_DEFAULT };
}

export function setAutoClear(state, patch = {}) {
  const next = serializeGameState(state);
  next.autoClear = normalizeAutoClear({ ...autoClearSettings(state), ...patch });
  return { ok: true, state: next };
}

// Clears from `items` (just-banked loot) in place; returns what it did, or null
// when auto-clear is off or found nothing. Mutates `state` (called from the
// expedition's own mutable completion step).
export function applyAutoClear(state, items = []) {
  const settings = normalizeAutoClear(state.autoClear);
  if (!settings?.enabled) return null;
  const limit = RARITY_ORDER.indexOf(settings.maxRarity);
  const fresh = new Set(items.filter((item) => item?.kind === "gear").map((item) => item.id));
  const picked = state.vault.filter((item) => fresh.has(item.id) && RARITY_ORDER.indexOf(item.rarity) <= limit
    && !isProtected(item) && upgradeFor(state, item).length === 0);
  if (!picked.length) return null;
  const gone = new Set(picked.map((item) => item.id));
  state.vault = state.vault.filter((item) => !gone.has(item.id));
  const gold = settings.mode === "sell" ? picked.reduce((sum, item) => sum + Math.max(0, Math.round(item.value || 0)), 0) : 0;
  const essence = settings.mode === "salvage" ? picked.reduce((sum, item) => sum + salvageValue(item), 0) : 0;
  state.gold += gold;
  state.essence = (state.essence || 0) + essence;
  return { count: picked.length, gold, essence, mode: settings.mode };
}
