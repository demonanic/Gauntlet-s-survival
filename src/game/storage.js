import { normalizeClasslessHero } from "../combat/heroModel";
import { createGuild, STATE_VERSION } from "./guild";

const STORAGE_KEY = "gauntlet.save.v1";

// Local-only save for the prototype. Supabase-backed saves can replace this
// behind the same load/save pair.
export function loadGuild(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return createGuild();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.heroes)) return createGuild();
    return {
      ...createGuild(),
      ...parsed,
      heroes: parsed.heroes.map(normalizeClasslessHero),
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
