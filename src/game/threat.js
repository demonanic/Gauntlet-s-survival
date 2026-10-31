// Enemies that keep up with the party. A region is tuned for the party players
// really arrive with: its minimum level, Common gear a tier below it (about 70%
// of idle trips won; `npm run scenarios`). A party stronger than that meets
// enemies grown to close most of the gap: enemy HP follows the party's offense,
// enemy damage its toughness. Weaker parties meet the region as tuned.
// Owner-approved (Oct 2026): before this, a party in Rare gear came home from
// the Blightmire at 99% HP. A first try tuned regions for Rare gear at a higher
// level instead; real parties never had that gear yet and hit a wall.
import { awardClasslessXp, allocateClasslessStat } from "../combat/classlessProgression";
import { GEAR_SLOTS } from "../combat/gear";
import { createHeroModel } from "../combat/heroModel";
import * as C from "../combat/config";
import { createGearItem, heroCombatSummary } from "./items";

export const THREAT = Object.freeze({
  // Share of the gap closed: enemies scale by (party / reference) ^ CLOSE.
  close: 0.75,
  max: 4,
  // The reference hero's stat points, in this order.
  spOrder: Object.freeze(["attack", "defense", "attack"]),
  rarity: "common",
});

// Offense: attack, with crits. Toughness: HP through defense and dodge.
export function heroPower(hero) {
  const s = heroCombatSummary(hero);
  return {
    offense: s.attack * (1 + s.critChance * (C.CRIT_MULT - 1)),
    toughness: s.maxHp * (1 + s.defense / 100) / Math.max(0.5, 1 - s.dodge),
  };
}

export function partyPower(heroes) {
  const powers = heroes.map(heroPower);
  const mean = (key) => powers.reduce((sum, power) => sum + power[key], 0) / Math.max(1, powers.length);
  return { offense: mean("offense"), toughness: mean("toughness") };
}

const references = new Map();

// The party a region is tuned for: { level, tier }.
export function regionReference(region) {
  return { level: Math.max(1, region.minLevel || 1), tier: Math.max(1, (region.tier || 1) - 1) };
}

// A reference hero: `level`, every slot in THREAT.rarity gear of `tier`.
export function referencePower(level, tier) {
  const key = `${level}:${tier}`;
  if (references.has(key)) return references.get(key);
  let hero = createHeroModel({ name: "Reference" });
  const awarded = awardClasslessXp(hero.progression, Math.max(0, C.HERO_XP[Math.max(1, level) - 1] - hero.progression.xp));
  if (awarded.ok) hero = { ...hero, progression: awarded.progression };
  for (let spent = 0; hero.progression.sp > 0; spent += 1) {
    const result = allocateClasslessStat(hero, THREAT.spOrder[spent % THREAT.spOrder.length]);
    if (!result.ok) break;
    hero = result.hero;
  }
  const rng = () => 0.5;
  hero.equipment = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, slot === "weapon"
    ? createGearItem({ slot, variant: "sword", rarity: THREAT.rarity, tier }, rng)
    : createGearItem({ slot, rarity: THREAT.rarity, tier }, rng)]));
  hero.traits = [];
  const power = heroPower(hero);
  references.set(key, power);
  return power;
}

// Enemy HP and damage multipliers for `heroes` setting out to `region`.
export function partyThreat(heroes, region) {
  if (!heroes.length || !region) return { hp: 1, dmg: 1 };
  const party = partyPower(heroes);
  const { level, tier } = regionReference(region);
  const reference = referencePower(level, tier);
  const grow = (ratio) => Math.min(THREAT.max, Math.max(1, ratio) ** THREAT.close);
  return {
    hp: Math.round(grow(party.offense / reference.offense) * 100) / 100,
    dmg: Math.round(grow(party.toughness / reference.toughness) * 100) / 100,
  };
}
