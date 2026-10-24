import { normalizeClasslessHero } from "../combat/heroModel";
import { createGuild, STATE_VERSION } from "./guild";
import { migrateVaultItem, normalizeHeroGear } from "./items";
import { CONSUMABLE_KEYS } from "../combat/gear";

const STORAGE_KEY = "gauntlet.save.v1";

// Local-only save for the prototype. Supabase-backed saves can replace this
// behind the same load/save pair.
export function loadGuild(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return createGuild();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.heroes)) return createGuild();
    const stash = Object.fromEntries(CONSUMABLE_KEYS.map((key) => [key, Math.max(0, Math.floor(Number(parsed.stash?.[key]) || 0))]));
    return {
      ...createGuild(),
      ...parsed,
      heroes: parsed.heroes.map((hero) => normalizeHeroGear(normalizeClasslessHero(hero))),
      vault: (Array.isArray(parsed.vault) ? parsed.vault : []).map(migrateVaultItem).filter(Boolean),
      stash: parsed.stash ? stash : createGuild().stash,
    };
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
