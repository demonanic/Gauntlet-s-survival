import { buildBossEncounter, buildWildEncounter } from "../game/encounters";
import { getRegion } from "../game/regions";

// Put a running expedition straight into an engaged fight prompt, as if the
// player had tapped Attack. Mutates and returns `state`.
export function withPendingFight(state, at, kind = "ambush") {
  const region = getRegion(state.expedition.regionId);
  const wave = kind === "boss" ? buildBossEncounter(region, state.bossRank || 0) : buildWildEncounter(region, 0, () => 0.5);
  state.expedition.pending = { kind, wave, label: "the test squad", at, promptAt: at, engagedAt: at };
  return state;
}

// Take off a hero's starter armor (mutates and returns the hero), for tests
// that work out exact numbers for a hero in nothing but their weapon.
export function withoutArmor(hero) {
  for (const slot of ["head", "chest", "legs", "arms"]) delete hero.equipment[slot];
  return hero;
}
