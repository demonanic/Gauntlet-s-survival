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
import { RANK_CASTS, SCHOOLS, SPELLS, emptyMagic } from "../combat/spells";
import { LEGENDARY_KEYS, createGearItem } from "./items";
import { emptyLegacy } from "./legacy";
import { developQualities, sharedQualities } from "./qualities";
import { REGIONS, getRegion } from "./regions";
import { buildBossEncounter, buildWildEncounter, describeSquad } from "./encounters";
import { MAX_PARTY_SIZE, startExpedition } from "./expedition";

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
// A boss crate for the first hero, as if they had just led a boss fight.
export function debugGiveCrate(state) {
  const next = serializeGameState(state);
  const options = [...PET_SPECIES_KEYS].sort(() => Math.random() - 0.5);
  next.petCrates = [...(next.petCrates || []), { heroId: next.heroes[0].identity.id, bossType: "debug", options }];
  return { ok: true, state: next };
}

export function debugGivePets(state, level = 6) {
  const next = serializeGameState(state);
  next.kennel = [...(next.kennel || []), ...PET_SPECIES_KEYS.map((species) => ({ ...createPet(species), level, xp: PET_XP[level - 1] }))];
  return { ok: true, state: next };
}

// ---- Magic (test mode) ----------------------------------------------------
// For trying spells in live play: casting for any hero, any school with no
// slot limit, and a school's proficiency or a spell's rank set straight away.

function debugHero(next, heroId) {
  return next.heroes.find((hero) => hero.identity.id === heroId) || null;
}

// Arcane Spark (casting, Arcane Bolt) and Elementalism (schools).
function giveCasting(hero) {
  const owned = new Set(hero.progression.ownedNodeIds || []);
  owned.add("A1"); owned.add("A2");
  hero.progression.ownedNodeIds = [...owned];
  hero.magic = { ...emptyMagic(), ...(hero.magic || {}) };
  hero.magic.casts = { ...hero.magic.casts };
}

export function debugGiveCasting(state, heroId) {
  const next = serializeGameState(state);
  const hero = debugHero(next, heroId);
  if (!hero) return { ok: false, reason: "no_hero" };
  giveCasting(hero);
  return { ok: true, state: next };
}

// Learn a school (casting comes with it if missing). No slot or AP limit.
export function debugLearnSchool(state, heroId, school) {
  if (!SCHOOLS.includes(school)) return { ok: false, reason: "invalid_element" };
  const next = serializeGameState(state);
  const hero = debugHero(next, heroId);
  if (!hero) return { ok: false, reason: "no_hero" };
  giveCasting(hero);
  if (!hero.magic.elements.includes(school)) hero.magic.elements = [...hero.magic.elements, school];
  return { ok: true, state: next };
}

// A school's proficiency to exactly `rank` (I-V): its first spell gets the
// casts that rank needs and its other spells start over at rank I. Learns
// the school first if needed (Arcane needs only casting).
export function debugSetSchoolRank(state, heroId, school, rank) {
  if (school !== "arcane" && !SCHOOLS.includes(school)) return { ok: false, reason: "invalid_element" };
  const learned = school === "arcane" ? debugGiveCasting(state, heroId) : debugLearnSchool(state, heroId, school);
  if (!learned.ok) return learned;
  const next = learned.state;
  const hero = debugHero(next, heroId);
  const r = Math.max(1, Math.min(5, Math.floor(rank)));
  const ids = Object.keys(SPELLS).filter((id) => SPELLS[id].element === school && !SPELLS[id].node);
  const first = ids.find((id) => SPELLS[id].unlock === 1) || ids[0];
  for (const id of ids) delete hero.magic.casts[id];
  if (first && r > 1) hero.magic.casts[first] = RANK_CASTS[r - 1];
  return { ok: true, state: next };
}

// One spell's rank (I-V). Its casts count toward the school too, so this can
// raise the school's proficiency.
export function debugSetSpellRank(state, heroId, spellId, rank) {
  const spell = SPELLS[spellId];
  if (!spell) return { ok: false, reason: "invalid_spell" };
  const learned = spell.element === "arcane" ? debugGiveCasting(state, heroId) : debugLearnSchool(state, heroId, spell.element);
  if (!learned.ok) return learned;
  const next = learned.state;
  const hero = debugHero(next, heroId);
  const r = Math.max(1, Math.min(5, Math.floor(rank)));
  if (r > 1) hero.magic.casts[spellId] = RANK_CASTS[r - 1];
  else delete hero.magic.casts[spellId];
  return { ok: true, state: next };
}

// ---- Test fight (test mode) -----------------------------------------------
// A fight to watch right now: a wild squad (at `depth` 0-1 into the region)
// or the region's boss (at the guild's boss rank). With no trip under way the
// first four heroes set out to `regionId`, healed and with injuries cleared;
// during a trip the fight is in that trip's region. It replaces any prompt
// waiting, and it's won or lost like any fight on the road.
export function debugTestFight(state, regionId, { boss = false, depth = 0.8, now = Date.now(), rng = Math.random } = {}) {
  if (state.expedition?.pending?.engagedAt != null) return { ok: false, reason: "in_fight" };
  let next = serializeGameState(state);
  if (!next.expedition) {
    const region = getRegion(regionId);
    if (!region || region.endless) return { ok: false, reason: "unknown_region" };
    next.injuries = {};
    for (const hero of next.heroes) hero.combat.hp = classlessMaxHp(hero);
    const ids = next.heroes.slice(0, MAX_PARTY_SIZE).map((hero) => hero.identity.id);
    const started = startExpedition(next, region.id, ids, now, rng);
    if (!started.ok) return started;
    next = started.state;
  }
  const region = getRegion(next.expedition.regionId);
  const wave = boss ? buildBossEncounter(region, next.bossRank || 0, rng) : buildWildEncounter(region, depth, rng);
  // As the road names a boss: the boss, else the elite, else the first foe.
  const label = boss ? (wave.enemies.find((enemy) => enemy.boss || enemy.tier === "elite") || wave.enemies[0])?.name || "Boss" : describeSquad(wave);
  next.expedition.pending = { kind: boss ? "boss" : "ambush", wave, label: `Test: ${label}`, promptAt: now, engagedAt: now };
  return { ok: true, state: next };
}
