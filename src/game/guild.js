// Gauntlet meta layer: guild hall and roster (expeditions are in expedition.js).
// Pure functions over a JSON-serializable state; every mutator returns a new
// state and never touches its input. Combat itself lives in combat/ (vendored Demonanic).
import { createHeroModel, serializeGameState } from "../combat/heroModel";
import { awardClasslessXp } from "../combat/classlessProgression";
import { distinctHueShift, paletteForShift, rollHeroPalette } from "../combat/heroPalette";
import { TRAITS, rollTrait } from "../combat/traits";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { createGearItem, normalizeHeroGear } from "./items";
import { emptyLegacy, legacyBonuses, syncGuildBonuses } from "./legacy";
import { normalizeQualityFields } from "./qualities";
import { newTutorial } from "./tutorial";

// Expeditions live in expedition.js; re-exported so the guild stays the one entry point.
export {
  MAX_PARTY_SIZE, choosePending, currentEncounterParty, currentEncounterWave, dismissReport, engagePending,
  expeditionDurationMs, recallExpedition, resolveEncounter, riftBounty, startExpedition, tick,
} from "./expedition";

export const STATE_VERSION = 1;
export const STARTING_GOLD = 100;
const STARTER_NAMES = ["Brann", "Kestra", "Odo"];
const RECRUIT_NAMES = ["Vex", "Morrow", "Ilsa", "Tamsin", "Garrick", "Pell", "Wren", "Corvin", "Saoirse", "Dunstan", "Yara", "Fenn"];
const BASE_RECRUIT_COST = 80;
const RECRUIT_COST_GROWTH = 1.6;
const STARTER_WEAPONS = ["sword", "bow", "staff"];
const STARTING_STASH = { bandage: 6, arrows: 100 };
export const MAX_NAME_LENGTH = 16;
// Gold to turn away the current recruit candidate and see another.
export const CANDIDATE_REROLL_COST = 25;

// Every hero arrives with one trait, an individual neon look, an empty gear
// sheet and a common weapon. Mentorship can start them above level 1.
function newHero(name, weaponVariant, { trait = rollTrait(), hueShift = null, level = 1 } = {}) {
  const palette = hueShift == null ? rollHeroPalette() : paletteForShift(hueShift);
  const hero = normalizeQualityFields(normalizeHeroGear(createHeroModel({ name, identityColor: palette.identityColor })));
  hero.appearance = { ...hero.appearance, ...palette };
  hero.traits = [trait];
  hero.equipment.weapon = createGearItem({ slot: "weapon", variant: weaponVariant, rarity: "common", tier: 1 });
  if (level > 1) {
    const awarded = awardClasslessXp(hero.progression, C.HERO_XP[Math.min(level, C.HERO_XP.length) - 1]);
    if (awarded.ok) hero.progression = awarded.progression;
  }
  return hero;
}

// Trim, collapse spaces, drop markup characters, cap the length.
export function cleanHeroName(name) {
  const cleaned = String(name ?? "").replace(/[<>\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
  return cleaned || null;
}

// The recruit waiting at the guild door: a trait and a look, shown before hiring.
export function rollCandidate(state, rng = Math.random) {
  return {
    trait: rollTrait(rng),
    hueShift: distinctHueShift((state.heroes || []).map((hero) => hero.appearance?.hueShift), rng),
    suggestedName: RECRUIT_NAMES[(state.recruits || 0) % RECRUIT_NAMES.length],
  };
}

export function createGuild() {
  // The three starters are spread evenly around the color wheel.
  const starterHue = Math.floor(Math.random() * 360);
  const state = {
    version: STATE_VERSION,
    gold: STARTING_GOLD,
    heroes: STARTER_NAMES.map((name, index) => newHero(name, STARTER_WEAPONS[index % STARTER_WEAPONS.length],
      { hueShift: starterHue + index * (360 / STARTER_NAMES.length) })),
    bench: [],
    injuries: {},
    vault: [],
    // Salvaged gear becomes essence, spent at the Reforge.
    essence: 0,
    stash: { ...STARTING_STASH },
    expedition: null,
    clears: {},
    recruits: 0,
    // Ashen Keep boss kills so far; picks the next boss and its difficulty.
    bossRank: 0,
    records: { riftBest: 0 },
    // Shop rotation bookkeeping (see shop.js) and the guild's shop seed.
    shop: null,
    seed: Math.floor(Math.random() * 2 ** 31),
    // Prestige: renown, Hall of Legends upgrades and retired heroes.
    legacy: emptyLegacy(),
    candidate: null,
    // First-run tutorial progress (tutorial.js).
    tutorial: newTutorial(),
    lastTickAt: null,
  };
  state.candidate = rollCandidate(state);
  syncGuildBonuses(state);
  for (const hero of state.heroes) hero.combat.hp = classlessMaxHp(hero);
  return state;
}

// Infirmary: pay to cure an injury at once and heal to full.
export function treatmentCost(state, id, now) {
  const remainingSeconds = Math.max(0, ((state.injuries[id] || 0) - now) / 1000);
  return remainingSeconds > 0 ? 10 + Math.ceil(remainingSeconds / 3) : 0;
}

export function treatInjury(state, id, now) {
  const cost = treatmentCost(state, id, now);
  if (cost <= 0) return { ok: false, reason: "not_injured" };
  if (state.gold < cost) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  const hero = findHero(next, id);
  if (!hero) return { ok: false, reason: "unknown_hero" };
  next.gold -= cost;
  delete next.injuries[id];
  hero.combat.hp = classlessMaxHp(hero);
  return { ok: true, state: next };
}

const heroId = (hero) => hero.identity.id;

export function findHero(state, id) {
  return state.heroes.find((hero) => heroId(hero) === id) || null;
}

export function heroStatus(state, hero, now) {
  if (state.expedition?.heroIds.includes(heroId(hero))) return "away";
  if ((state.injuries[heroId(hero)] || 0) > now) return "injured";
  return "ready";
}

// Cost grows with the size of the roster, so retiring heroes keeps recruiting affordable.
export function recruitCost(state) {
  return Math.round(BASE_RECRUIT_COST * RECRUIT_COST_GROWTH ** Math.max(0, state.heroes.length - STARTER_NAMES.length));
}

// Hire the waiting candidate. `name` is the player's choice (the suggestion
// otherwise); `hueShift` lets the player pick a different neon look for free.
export function recruitHero(state, { name, hueShift } = {}) {
  const cost = recruitCost(state);
  if (state.gold < cost) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  const candidate = next.candidate || rollCandidate(next);
  const level = 1 + legacyBonuses(next).recruitLevels;
  next.heroes.push(newHero(cleanHeroName(name) || candidate.suggestedName,
    STARTER_WEAPONS[next.recruits % STARTER_WEAPONS.length],
    { trait: candidate.trait, hueShift: hueShift ?? candidate.hueShift, level }));
  next.gold -= cost;
  next.recruits += 1;
  next.candidate = rollCandidate(next);
  syncGuildBonuses(next);
  const recruit = next.heroes[next.heroes.length - 1];
  recruit.combat.hp = classlessMaxHp(recruit);
  return { ok: true, state: next };
}

export function rerollCandidate(state) {
  if (state.gold < CANDIDATE_REROLL_COST) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  next.gold -= CANDIDATE_REROLL_COST;
  next.candidate = rollCandidate(next);
  return { ok: true, state: next };
}

export function renameHero(state, id, name) {
  const cleaned = cleanHeroName(name);
  if (!cleaned) return { ok: false, reason: "invalid_name" };
  const next = serializeGameState(state);
  const hero = findHero(next, id);
  if (!hero) return { ok: false, reason: "unknown_hero" };
  hero.identity.name = cleaned;
  return { ok: true, state: next };
}

export function traitOf(hero) {
  return TRAITS[hero?.traits?.[0]] || null;
}

// Replace one hero (perk purchase, stat allocation) without touching the rest.
export function updateHero(state, updatedHero) {
  const next = serializeGameState(state);
  const index = next.heroes.findIndex((hero) => heroId(hero) === heroId(updatedHero));
  if (index < 0) return state;
  next.heroes[index] = serializeGameState(updatedHero);
  return next;
}

