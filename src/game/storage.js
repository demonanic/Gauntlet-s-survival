import * as C from "../combat/config";
import { normalizeClasslessHero } from "../combat/heroModel";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { createGuild, rollCandidate, STATE_VERSION } from "./guild";
import { emptyLegacy, syncGuildBonuses } from "./legacy";
import { paletteForShift } from "../combat/heroPalette";
import { rollTrait, TRAITS } from "../combat/traits";
import { bankLoot, migrateVaultItem, normalizeHeroGear } from "./items";
import { normalizeQualityFields } from "./qualities";
import { PET_SPECIES } from "../combat/pets";
import { ECOLOGIES } from "./ecology";
import { normalizePet } from "./pets";
import { normalizeTutorial } from "./tutorial";
import { STASH_KEYS, crystalInfo } from "../combat/gear";

const STORAGE_KEY = "gauntlet.save.v1";

// Older saves predate traits and individual looks: heroes without a trait get
// one, and only a malformed look is replaced (preset colors stay as they were).
function normalizeHeroExtras(hero) {
  const traits = (Array.isArray(hero.traits) ? hero.traits : []).filter((key) => TRAITS[key]);
  const shift = Number(hero.appearance?.hueShift);
  const pet = normalizePet(hero.pet);
  return {
    ...normalizeQualityFields(hero),
    pet: pet || undefined,
    traits: traits.length ? traits : [rollTrait()],
    appearance: Number.isFinite(shift) ? { ...hero.appearance, ...paletteForShift(shift) } : hero.appearance,
  };
}

// Expeditions saved before timed adventures (no feed, fixed encounters) can't
// be resumed: the party comes home with what it had gathered.
function retireOldExpedition(state) {
  const run = state.expedition;
  if (!run || Array.isArray(run.feed)) return;
  const loot = { gold: Math.max(0, Math.round(Number(run.loot?.gold) || 0)), items: Array.isArray(run.loot?.items) ? run.loot.items : [] };
  state.gold += loot.gold;
  bankLoot(state, loot.items);
  for (const id of run.heroIds || []) {
    const hero = state.heroes.find((entry) => entry.identity.id === id);
    if (hero && hero.combat.hp <= 0) hero.combat.hp = 1;
  }
  state.lastReport = {
    regionId: run.regionId, outcome: "recalled", loot,
    log: [...(Array.isArray(run.log) ? run.log : []), "Expeditions are now timed adventures. The party came home with everything it found."],
  };
  state.expedition = null;
}

// Turn saved JSON (local or cloud) into a valid guild, or null if unusable.
export function parseGuild(parsed) {
  if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.heroes)) return null;
  const stash = Object.fromEntries(STASH_KEYS.map((key) => [key, Math.max(0, Math.floor(Number(parsed.stash?.[key]) || 0))]));
  // Saves from before bows needed arrows get a starting bundle.
  if (parsed.stash && parsed.stash.arrows == null) stash.arrows = 100;
  const base = createGuild();
  const state = {
    ...base,
    ...parsed,
    heroes: parsed.heroes.map((hero) => normalizeHeroExtras(normalizeHeroGear(normalizeClasslessHero(hero)))),
    vault: (Array.isArray(parsed.vault) ? parsed.vault : []).map(migrateVaultItem).filter(Boolean),
    stash: parsed.stash ? stash : base.stash,
    essence: Math.max(0, Math.floor(Number(parsed.essence) || 0)),
    crystals: Object.fromEntries(Object.entries(parsed.crystals && typeof parsed.crystals === "object" ? parsed.crystals : {})
      .filter(([id, count]) => crystalInfo(id) && count > 0).map(([id, count]) => [id, Math.floor(count)])),
    tutorial: normalizeTutorial(parsed.tutorial),
    kennel: (Array.isArray(parsed.kennel) ? parsed.kennel : []).map(normalizePet).filter(Boolean),
    crateBosses: (Array.isArray(parsed.crateBosses) ? parsed.crateBosses : []).filter((key) => typeof key === "string"),
    ecologySeen: Object.fromEntries(Object.entries(parsed.ecologySeen && typeof parsed.ecologySeen === "object" ? parsed.ecologySeen : {})
      .filter(([key, count]) => ECOLOGIES[key] && Number(count) > 0).map(([key, count]) => [key, Math.floor(Number(count))])),
    bonds: Object.fromEntries(Object.entries(parsed.bonds && typeof parsed.bonds === "object" ? parsed.bonds : {})
      .filter(([key, bond]) => key.split("|").length === 2 && Number(bond?.wins) > 0)
      .map(([key, bond]) => [key, { wins: Math.floor(Number(bond.wins)), ...(bond.sworn ? { sworn: true } : {}) }])),
    nemeses: (Array.isArray(parsed.nemeses) ? parsed.nemeses : [])
      .filter((nemesis) => C.ENEMIES[nemesis?.type] && typeof nemesis.name === "string" && typeof nemesis.regionId === "string"
        && Array.isArray(nemesis.victims) && Number(nemesis.level) >= 1),
    petCrates: (Array.isArray(parsed.petCrates) ? parsed.petCrates : [])
      .filter((crate) => Array.isArray(crate?.options) && crate.options.length && crate.options.every((key) => PET_SPECIES[key])),
    legacy: { ...emptyLegacy(), ...(parsed.legacy && typeof parsed.legacy === "object" ? parsed.legacy : {}) },
  };
  state.candidate = parsed.candidate?.trait && TRAITS[parsed.candidate.trait] ? parsed.candidate : rollCandidate(state);
  retireOldExpedition(state);
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
