// Familiars in the guild. Pets are rare: the first time the guild beats each
// boss with a level 10+ hero leading the party, it finds a weird crate with
// breathing holes. The player picks one of several identical crates; the pet
// inside bonds with the party's leader. Pets displaced by a newcomer wait in
// guild.kennel and can be paired again; a paired pet lives on its hero
// (hero.pet). Mutators return { ok, state }.
import { serializeGameState } from "../combat/heroModel";
import {
  PET_MAX_LEVEL, PET_MOD_LEVELS, PET_QUALITY_KEYS, PET_SPECIES, PET_SPECIES_KEYS, PET_XP,
} from "../combat/pets";

const PET_NAMES = ["Fang", "Ember", "Pip", "Moss", "Talon", "Biscuit", "Cinder", "Wisp", "Boulder", "Rook", "Nib", "Saffron", "Juniper", "Grit"];
// The party leader must be at least this level for a boss to leave a crate.
export const CRATE_LEVEL = 10;

const heroId = (hero) => hero.identity.id;

export function createPet(species, rng = Math.random) {
  return {
    id: `pet-${Date.now().toString(36)}-${Math.floor(rng() * 1e9).toString(36)}`,
    species,
    name: PET_NAMES[Math.floor(rng() * PET_NAMES.length)],
    quality: PET_QUALITY_KEYS[Math.floor(rng() * PET_QUALITY_KEYS.length)],
    level: 1,
    xp: 0,
    mods: {},
  };
}

// Repair a saved pet, or drop it.
export function normalizePet(pet) {
  if (!pet || !PET_SPECIES[pet.species]) return null;
  const level = Math.max(1, Math.min(PET_MAX_LEVEL, Math.floor(Number(pet.level) || 1)));
  return {
    ...pet,
    quality: PET_QUALITY_KEYS.includes(pet.quality) ? pet.quality : PET_QUALITY_KEYS[0],
    level,
    xp: Math.max(0, Number(pet.xp) || 0),
    mods: pet.mods && typeof pet.mods === "object" ? pet.mods : {},
  };
}

// After a boss falls (mutates `state`): the first time each boss is beaten
// with a level 10+ leader, a crate is waiting. Returns true if one was found.
export function earnPetCrate(state, bossType, leaderId, rng = Math.random) {
  const leader = state.heroes.find((hero) => heroId(hero) === leaderId);
  if (!leader || leader.progression.level < CRATE_LEVEL) return false;
  state.crateBosses ||= [];
  if (state.crateBosses.includes(bossType)) return false;
  state.crateBosses.push(bossType);
  // Every species is in one of the crates, in an order the player can't see.
  const options = [...PET_SPECIES_KEYS];
  for (let index = options.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [options[index], options[swap]] = [options[swap], options[index]];
  }
  state.petCrates = [...(state.petCrates || []), { heroId: leaderId, bossType, options }];
  return true;
}

// Open crate number `choice` of the first waiting crate set. The pet bonds with
// the leader who earned it (their old pet goes to the kennel); if that hero
// has left the guild it waits in the kennel instead. Also returns the pet.
export function openPetCrate(state, choice, rng = Math.random) {
  const crate = state.petCrates?.[0];
  if (!crate) return { ok: false, reason: "no_crate" };
  const species = crate.options[choice];
  if (!species) return { ok: false, reason: "invalid_choice" };
  const next = serializeGameState(state);
  next.petCrates = next.petCrates.slice(1);
  const pet = createPet(species, rng);
  const hero = next.heroes.find((entry) => heroId(entry) === crate.heroId);
  if (hero) {
    if (hero.pet) next.kennel = [...(next.kennel || []), hero.pet];
    hero.pet = pet;
  } else {
    next.kennel = [...(next.kennel || []), pet];
  }
  return { ok: true, state: next, pet, heroName: hero?.identity.name || null };
}

// Pair a kennel pet with a hero who's home. A pet the hero already had goes back to the kennel.
export function assignPet(state, id, petId) {
  const next = serializeGameState(state);
  const hero = next.heroes.find((entry) => heroId(entry) === id);
  if (!hero) return { ok: false, reason: "unknown_hero" };
  if (next.expedition?.heroIds.includes(id)) return { ok: false, reason: "hero_away" };
  const index = (next.kennel || []).findIndex((pet) => pet.id === petId);
  if (index < 0) return { ok: false, reason: "unknown_pet" };
  const [pet] = next.kennel.splice(index, 1);
  if (hero.pet) next.kennel.push(hero.pet);
  hero.pet = pet;
  return { ok: true, state: next };
}

export function unassignPet(state, id) {
  const next = serializeGameState(state);
  const hero = next.heroes.find((entry) => heroId(entry) === id);
  if (!hero?.pet) return { ok: false, reason: "no_pet" };
  if (next.expedition?.heroIds.includes(id)) return { ok: false, reason: "hero_away" };
  next.kennel = [...(next.kennel || []), hero.pet];
  delete hero.pet;
  return { ok: true, state: next };
}

// Mod levels the pet has reached but not chosen for yet.
export function pendingPetMods(pet) {
  return PET_MOD_LEVELS.filter((level) => (pet?.level || 1) >= level && !pet.mods?.[level]);
}

export function choosePetMod(state, id, level, modId) {
  const next = serializeGameState(state);
  const hero = next.heroes.find((entry) => heroId(entry) === id);
  const pet = hero?.pet;
  if (!pet) return { ok: false, reason: "no_pet" };
  if (!pendingPetMods(pet).includes(level)) return { ok: false, reason: "not_available" };
  if (!PET_SPECIES[pet.species].mods[level].some((mod) => mod.id === modId)) return { ok: false, reason: "unknown_mod" };
  pet.mods = { ...pet.mods, [level]: modId };
  return { ok: true, state: next };
}

// Give a pet XP (mutates it). Returns the levels it reached.
export function awardPetXp(pet, xp) {
  const reached = [];
  pet.xp = (pet.xp || 0) + Math.max(0, xp);
  while (pet.level < PET_MAX_LEVEL && pet.xp >= PET_XP[pet.level]) {
    pet.level += 1;
    reached.push(pet.level);
  }
  return reached;
}
