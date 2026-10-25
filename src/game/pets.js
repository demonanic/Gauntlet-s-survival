// Familiars in the guild: adopting, pairing a pet with a hero, levelling up
// and choosing mods. Pets waiting for a partner live in guild.kennel; a
// paired pet is stored on its hero (hero.pet). Mutators return { ok, state }.
import { serializeGameState } from "../combat/heroModel";
import {
  PET_MAX_LEVEL, PET_MOD_LEVELS, PET_QUALITY_KEYS, PET_SPECIES, PET_SPECIES_KEYS, PET_XP,
} from "../combat/pets";

const PET_NAMES = ["Fang", "Ember", "Pip", "Moss", "Talon", "Biscuit", "Cinder", "Wisp", "Boulder", "Rook", "Nib", "Saffron", "Juniper", "Grit"];
// Pets a guild can keep in total (paired and in the kennel).
export const MAX_PETS = 8;

const heroId = (hero) => hero.identity.id;
const ownedPets = (state) => (state.kennel || []).length + state.heroes.filter((hero) => hero.pet).length;

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

export function randomSpecies(rng = Math.random) {
  return PET_SPECIES_KEYS[Math.floor(rng() * PET_SPECIES_KEYS.length)];
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

export function adoptPet(state, species, rng = Math.random) {
  const info = PET_SPECIES[species];
  if (!info) return { ok: false, reason: "unknown_species" };
  if (ownedPets(state) >= MAX_PETS) return { ok: false, reason: "kennel_full" };
  if (state.gold < info.price) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  next.gold -= info.price;
  next.kennel = [...(next.kennel || []), createPet(species, rng)];
  return { ok: true, state: next };
}

// A stray found on the road joins the kennel for free (if there's room).
export function takeInStray(state, pet) {
  if (ownedPets(state) >= MAX_PETS) return false;
  state.kennel = [...(state.kennel || []), pet];
  return true;
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
