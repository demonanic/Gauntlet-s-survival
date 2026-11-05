import { buildBossEncounter, buildWildEncounter } from "../game/encounters";
import { getRegion } from "../game/regions";
import { previousRegion } from "../game/expedition";

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

// Campaign regions open in order (expedition.js regionOpen): mark the region
// before `regionId` cleared so a test can start there. Returns a copy.
export function openRegion(state, regionId) {
  const region = getRegion(regionId);
  const before = previousRegion(region);
  if (!before || (state.clears?.[before.id] || 0) > 0) return state;
  return { ...state, clears: { ...(state.clears || {}), [before.id]: 1 } };
}
