// Shared pieces for the balance scripts (balance.js, scenarios.js): how a
// scripted player builds heroes and plays a live fight.
import { allocateClasslessStat, purchaseClasslessNode } from "../src/combat/classlessProgression";
import { updateHero } from "../src/game/guild";
import { seededRandom } from "../src/game/random";

// `--seed N` makes a run repeatable: every random roll in it (guild creation,
// trips, fights, loot, the shop) comes from one seeded generator. Without the
// flag the run uses Math.random as before. Returns the seed, or null.
export function applySeedFlag(args) {
  if (!args.includes("--seed")) return null;
  const seed = Number(args[args.indexOf("--seed") + 1]);
  if (!Number.isInteger(seed)) throw new RangeError("--seed needs a whole number");
  Math.random = seededRandom(seed);
  console.log(`Seed ${seed}: this run can be repeated exactly with the same flags.`);
  return seed;
}

// A sensible generic build: survivability and damage first, then actives.
export const PERK_ORDER = ["V1", "W1", "P1", "V2", "W2", "P2a", "P3", "W2a", "S1", "P2", "V3", "T1", "S2", "F1"];
export const SP_ORDER = ["attack", "defense", "attack"];

// Spend every hero's AP on PERK_ORDER and SP on `spOrder` (SP_ORDER by default).
export function developHeroes(state, spOrder = SP_ORDER) {
  for (const original of state.heroes) {
    let hero = original;
    for (const nodeId of PERK_ORDER) {
      const bought = purchaseClasslessNode(hero, nodeId);
      if (bought.ok) hero = bought.hero || { ...hero, progression: bought.progression };
    }
    let spent = 0;
    while (hero.progression.sp > 0) {
      const result = allocateClasslessStat(hero, spOrder[spent++ % spOrder.length]);
      if (!result.ok) break;
      hero = result.hero;
    }
    state = updateHero(state, hero);
  }
  return state;
}

// An "active" player fires every ability the moment it's ready.
export function activePlayer(engine) {
  engine.heroes.forEach((hero) => {
    for (const ability of engine.getHeroAbilityStatus(hero.i)) if (ability.available) engine.useHeroAbility(hero.i, ability.id);
  });
}
