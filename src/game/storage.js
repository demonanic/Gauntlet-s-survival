import { normalizeClasslessHero } from "../combat/heroModel";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { createGuild, rollCandidate, STATE_VERSION } from "./guild";
import { emptyLegacy, syncGuildBonuses } from "./legacy";
import { paletteForShift } from "../combat/heroPalette";
import { rollTrait, TRAITS } from "../combat/traits";
import { migrateVaultItem, normalizeHeroGear } from "./items";
import { CONSUMABLE_KEYS } from "../combat/gear";

const STORAGE_KEY = "gauntlet.save.v1";

// Older saves predate traits and individual looks: heroes without a trait get
// one, and only a malformed look is replaced (preset colors stay as they were).
function normalizeHeroExtras(hero) {
  const traits = (Array.isArray(hero.traits) ? hero.traits : []).filter((key) => TRAITS[key]);
  const shift = Number(hero.appearance?.hueShift);
  return {
    ...hero,
    traits: traits.length ? traits : [rollTrait()],
    appearance: Number.isFinite(shift) ? { ...hero.appearance, ...paletteForShift(shift) } : hero.appearance,
  };
}

// Turn saved JSON (local or cloud) into a valid guild, or null if unusable.
export function parseGuild(parsed) {
  if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.heroes)) return null;
  const stash = Object.fromEntries(CONSUMABLE_KEYS.map((key) => [key, Math.max(0, Math.floor(Number(parsed.stash?.[key]) || 0))]));
  const base = createGuild();
  const state = {
    ...base,
    ...parsed,
    heroes: parsed.heroes.map((hero) => normalizeHeroExtras(normalizeHeroGear(normalizeClasslessHero(hero)))),
    vault: (Array.isArray(parsed.vault) ? parsed.vault : []).map(migrateVaultItem).filter(Boolean),
    stash: parsed.stash ? stash : base.stash,
    legacy: { ...emptyLegacy(), ...(parsed.legacy && typeof parsed.legacy === "object" ? parsed.legacy : {}) },
  };
  state.candidate = parsed.candidate?.trait && TRAITS[parsed.candidate.trait] ? parsed.candidate : rollCandidate(state);
  syncGuildBonuses(state);
  // A newly assigned trait (e.g. Glass Cannon) can lower max HP below current HP.
  for (const hero of state.heroes) hero.combat.hp = Math.min(hero.combat.hp, classlessMaxHp(hero));
  return state;
}

// Local save in this browser; cloud saves (cloud/cloudSave.js) sync on top.
export function loadGuild(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return (raw && parseGuild(JSON.parse(raw))) || createGuild();
  } catch {
    return createGuild();
  }
}

export function saveGuild(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearGuild(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode); nothing to clear.
  }
}
