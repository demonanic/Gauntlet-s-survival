// Test mode (open the game with ?debug in the address). Shortcuts for
// playtesting; each returns { ok, state } like the other guild mutators and
// never touches its input.
import { awardClasslessXp } from "../combat/classlessProgression";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { CRYSTAL_KEYS, GEAR_SLOTS, STASH_KEYS } from "../combat/gear";
import { PET_SPECIES_KEYS, PET_XP } from "../combat/pets";
import { createPet } from "./pets";
import { serializeGameState } from "../combat/heroModel";
import { LEGENDARY_KEYS, createGearItem } from "./items";
import { emptyLegacy } from "./legacy";
import { developQualities, sharedQualities } from "./qualities";
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
  next.crystals ||= {};
  for (const key of CRYSTAL_KEYS) next.crystals[`${key}-1`] = (next.crystals[`${key}-1`] || 0) + 3;
  return { ok: true, state: next };
}

// Give every hero home a plausible career shaped by their weapon (archers
// fight from range, swordsmen up close; everyone has scars), then let any
// milestone they have reached develop. Heroes below level 10 just keep the history.
export function debugCareer(state, now) {
  const next = serializeGameState(state);
  for (const hero of next.heroes) {
    if (next.expedition?.heroIds.includes(hero.identity.id)) continue;
    const ranged = hero.equipment?.weapon?.weaponType !== "sword";
    const history = hero.history;
    Object.assign(history, {
      trips: history.trips + 12, fights: history.fights + 60, wins: history.wins + 55, kills: history.kills + 120,
      meleeHits: history.meleeHits + (ranged ? 40 : 700), rangedHits: history.rangedHits + (ranged ? 700 : 20),
      crits: history.crits + 120, damage: history.damage + 40_000, taken: history.taken + 12_000,
      nearDeaths: history.nearDeaths + Math.floor(Math.random() * 8), sneaks: history.sneaks + Math.floor(Math.random() * 10),
      ambushes: history.ambushes + Math.floor(Math.random() * 10), heals: history.heals + Math.floor(Math.random() * 15),
    });
    developQualities(hero, now, Math.random, sharedQualities(next.heroes, hero));
  }
  return { ok: true, state: next };
}

// One of every familiar, at `level`, into the kennel.
export function debugGivePets(state, level = 6) {
  const next = serializeGameState(state);
  next.kennel = [...(next.kennel || []), ...PET_SPECIES_KEYS.map((species) => ({ ...createPet(species), level, xp: PET_XP[level - 1] }))];
  return { ok: true, state: next };
}
