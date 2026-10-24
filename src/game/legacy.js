// Prestige: retire a level-20 hero to earn Renown, then spend it in the Hall
// of Legends on permanent guild upgrades. Combat bonuses are stamped onto each
// hero as hero.guildBonus so the engine and max-HP maths can read them.
import { serializeGameState } from "../combat/heroModel";
import { QUICK_SLOT_COUNT } from "../combat/gear";

export const RETIRE_LEVEL = 20;
const BASE_RENOWN = 3;
const BOSS_RANKS_PER_EXTRA_RENOWN = 5;

export const LEGACY_UPGRADES = Object.freeze({
  might: { key: "might", name: "Might", desc: "+4% hero damage per rank.", max: 10, per: 0.04 },
  vigor: { key: "vigor", name: "Vigor", desc: "+4% hero max HP per rank.", max: 10, per: 0.04 },
  fortune: { key: "fortune", name: "Fortune", desc: "+10% gold from expeditions per rank.", max: 10, per: 0.1 },
  wisdom: { key: "wisdom", name: "Wisdom", desc: "+10% XP per rank.", max: 10, per: 0.1 },
  roads: { key: "roads", name: "Swift Roads", desc: "-8% travel time per rank.", max: 5, per: 0.08 },
  mentorship: { key: "mentorship", name: "Mentorship", desc: "New recruits start 2 levels higher per rank.", max: 5, per: 2 },
});
export const LEGACY_KEYS = Object.freeze(Object.keys(LEGACY_UPGRADES));

export function emptyLegacy() {
  return { renown: 0, upgrades: {}, legends: [] };
}

export function legacyRank(state, key) {
  return Math.max(0, Math.floor(Number(state.legacy?.upgrades?.[key]) || 0));
}

// Renown cost of the next rank of an upgrade.
export function legacyUpgradeCost(state, key) {
  return legacyRank(state, key) + 1;
}

export function legacyBonuses(state) {
  const value = (key) => legacyRank(state, key) * LEGACY_UPGRADES[key].per;
  return {
    damage: value("might"),
    maxHp: value("vigor"),
    gold: value("fortune"),
    xp: value("wisdom"),
    travel: value("roads"),
    recruitLevels: value("mentorship"),
  };
}

// Copy the guild's combat bonuses onto every hero (mutates `state`).
export function syncGuildBonuses(state) {
  const { damage, maxHp } = legacyBonuses(state);
  for (const hero of state.heroes) hero.guildBonus = { damage, maxHp };
  return state;
}

export function renownForRetiring(state) {
  return BASE_RENOWN + Math.floor((state.bossRank || 0) / BOSS_RANKS_PER_EXTRA_RENOWN);
}

export function canRetire(state, hero) {
  if (!hero) return "unknown_hero";
  if (hero.progression.level < RETIRE_LEVEL) return "level_required";
  if (state.expedition?.heroIds.includes(hero.identity.id)) return "hero_away";
  if (state.heroes.length <= 1) return "last_hero";
  return null;
}

// The hero leaves the roster for the Hall of Legends. Their gear returns to
// the vault and their quick-slot supplies to the stash.
export function retireHero(state, id, now) {
  const next = serializeGameState(state);
  const hero = next.heroes.find((entry) => entry.identity.id === id);
  const blocked = canRetire(next, hero);
  if (blocked) return { ok: false, reason: blocked };
  next.vault.push(...Object.values(hero.equipment || {}).filter(Boolean));
  for (const slot of (hero.quickSlots || []).slice(0, QUICK_SLOT_COUNT)) {
    if (slot) next.stash[slot.key] = (next.stash[slot.key] || 0) + slot.qty;
  }
  const renown = renownForRetiring(next);
  next.legacy = { ...emptyLegacy(), ...next.legacy };
  next.legacy.renown += renown;
  next.legacy.legends = [...next.legacy.legends, {
    name: hero.identity.name,
    appearance: hero.appearance,
    traits: hero.traits || [],
    level: hero.progression.level,
    bossRank: next.bossRank || 0,
    renown,
    retiredAt: now,
  }];
  next.heroes = next.heroes.filter((entry) => entry !== hero);
  delete next.injuries[id];
  return { ok: true, state: next, renown };
}

export function buyLegacyUpgrade(state, key) {
  const upgrade = LEGACY_UPGRADES[key];
  if (!upgrade) return { ok: false, reason: "unknown_upgrade" };
  const rank = legacyRank(state, key);
  if (rank >= upgrade.max) return { ok: false, reason: "max_rank" };
  const cost = legacyUpgradeCost(state, key);
  if ((state.legacy?.renown || 0) < cost) return { ok: false, reason: "insufficient_renown" };
  const next = serializeGameState(state);
  next.legacy = { ...emptyLegacy(), ...next.legacy };
  next.legacy.renown -= cost;
  next.legacy.upgrades = { ...next.legacy.upgrades, [key]: rank + 1 };
  return { ok: true, state: syncGuildBonuses(next) };
}
