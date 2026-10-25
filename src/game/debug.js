// Test mode (open the game with ?debug in the address). Shortcuts for
// playtesting; each returns { ok, state } like the other guild mutators and
// never touches its input.
import { awardClasslessXp } from "../combat/classlessProgression";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { GEAR_SLOTS, STASH_KEYS } from "../combat/gear";
import { serializeGameState } from "../combat/heroModel";
import { LEGENDARY_KEYS, createGearItem } from "./items";
import { emptyLegacy } from "./legacy";
import { REGIONS } from "./regions";

export const MAX_HERO_LEVEL = C.HERO_XP.length;

export function isDebugMode(search = globalThis.location?.search || "") {
  return new URLSearchParams(search).has("debug");
}

export function debugAddGold(state, amount) {
  const next = serializeGameState(state);
  next.gold += amount;
  return { ok: true, state: next };
}

export function debugAddRenown(state, amount) {
  const next = serializeGameState(state);
  next.legacy = { ...emptyLegacy(), ...next.legacy };
  next.legacy.renown += amount;
  return { ok: true, state: next };
}

// Raise every hero to at least `level`, granting the matching AP and SP.
export function debugSetLevels(state, level) {
  const target = Math.max(1, Math.min(MAX_HERO_LEVEL, Math.floor(level)));
  const next = serializeGameState(state);
  for (const hero of next.heroes) {
    const missing = C.HERO_XP[target - 1] - hero.progression.xp;
    if (missing <= 0) continue;
    const awarded = awardClasslessXp(hero.progression, missing);
    if (awarded.ok) hero.progression = awarded.progression;
  }
  return { ok: true, state: next };
}

// Trigger the next expedition event now, clear injuries, and heal everyone to full.
export function debugSkipTimers(state, now) {
  const next = serializeGameState(state);
  if (next.expedition?.nextEventAt != null && !next.expedition.pending) next.expedition.nextEventAt = now;
  next.injuries = {};
  for (const hero of next.heroes) hero.combat.hp = classlessMaxHp(hero);
  return { ok: true, state: next };
}

// Jump to the end of the expedition timer (the boss, or home).
export function debugEndExpedition(state, now) {
  if (!state.expedition || state.expedition.endsAt == null || state.expedition.pending) return { ok: false, reason: "no_timer" };
  const next = serializeGameState(state);
  next.expedition.endsAt = now;
  next.expedition.nextEventAt = now + 1;
  return { ok: true, state: next };
}

export function debugSetBossRank(state, rank) {
  const next = serializeGameState(state);
  next.bossRank = Math.max(0, Math.floor(rank));
  return { ok: true, state: next };
}

// Mark every campaign region cleared (unlocks shop tiers and the boss rotation).
export function debugClearRegions(state) {
  const next = serializeGameState(state);
  for (const region of REGIONS) if (!region.endless) next.clears[region.id] = Math.max(1, next.clears[region.id] || 0);
  return { ok: true, state: next };
}

// One piece per gear slot, straight into the vault. "legendary" hands out
// every legendary item instead; `set` makes the pieces part of that gear set.
export function debugGiveGearSet(state, rarity, tier, set = null) {
  const next = serializeGameState(state);
  if (rarity === "legendary") {
    for (const legendary of LEGENDARY_KEYS) next.vault.push(createGearItem({ legendary, tier }));
  } else {
    for (const slot of GEAR_SLOTS) next.vault.push(createGearItem({ slot, rarity, tier, set }));
  }
  return { ok: true, state: next };
}

export function debugGiveSupplies(state, amount = 10) {
  const next = serializeGameState(state);
  for (const key of STASH_KEYS) next.stash[key] = (next.stash[key] || 0) + (key === "arrows" ? amount * 4 : amount);
  next.essence = (next.essence || 0) + amount * 10;
  return { ok: true, state: next };
}
