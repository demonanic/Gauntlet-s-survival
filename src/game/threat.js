// Enemies that keep up with the party. A region is tuned for a reference party
// (heroes at its recommended level in Rare gear of its tier). A party stronger
// than that meets enemies grown to close about half the gap: enemy HP follows
// the party's offense, enemy damage its toughness. Weaker parties meet the
// region as tuned. Owner-approved (Oct 2026): before this, a party in Rare gear
// came home from the Blightmire at 99% HP.
import { awardClasslessXp, allocateClasslessStat } from "../combat/classlessProgression";
import { GEAR_SLOTS } from "../combat/gear";
import { createHeroModel } from "../combat/heroModel";
import * as C from "../combat/config";
import { createGearItem, heroCombatSummary } from "./items";

export const THREAT = Object.freeze({
  // Share of the gap closed: enemies scale by (party / reference) ^ CLOSE.
  close: 0.5,
  max: 4,
  // The reference hero's stat points, in this order.
  spOrder: Object.freeze(["attack", "defense", "attack"]),
  rarity: "rare",
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

// The reference hero a region is tuned for.
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
  if (!heroes.length || !region?.level) return { hp: 1, dmg: 1 };
  const party = partyPower(heroes);
  const reference = referencePower(region.level, region.tier);
  const grow = (ratio) => Math.min(THREAT.max, Math.max(1, ratio) ** THREAT.close);
  return {
    hp: Math.round(grow(party.offense / reference.offense) * 100) / 100,
    dmg: Math.round(grow(party.toughness / reference.toughness) * 100) / 100,
  };
}
