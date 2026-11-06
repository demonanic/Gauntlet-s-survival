import * as C from "../config";
import { ENEMY_ROLES, enemyRole } from "./roles";
import { buildWildEncounter, createEncounterSim } from "../../game/encounters";
import { getRegion } from "../../game/regions";

// Which role takes each enemy type's turn (null: the engine's common
// advance-and-attack). A misspelt type in a role, or a type that loses its
// role, shows up here.
const EXPECTED = {
  ghost: null, slime: null, goblin: null, skeleton: null, orc: null,
  reaper: "hunter", darkElf: "darkElf", warlock: null, lieutenant: null, demon: null, imperialNecromancer: null,
  harrier: "hunter", carrionPriest: "carrionPriest", watcher: "watcher", stalker: "hunter", gnome: "sapper",
  bandit: "bandit", lesserNecromancer: "lesserNecromancer", bulwark: "bulwark",
  banditWarlord: null, bogLich: null, nuclearBehemoth: null,
};

describe("enemy roles", () => {
  const sim = createEncounterSim([], 1, buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }));
  const engine = { time: 0 };

  test("every enemy type gets the role it had in engine.js", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(C.ENEMIES).sort());
    for (const type of Object.keys(C.ENEMIES)) expect([type, enemyRole(engine, sim.makeMinion(type))?.id || null]).toEqual([type, EXPECTED[type]]);
  });

  test("every role is used by some enemy (no role left behind by a renamed type)", () => {
    const used = new Set(Object.values(EXPECTED));
    for (const role of ENEMY_ROLES) expect(used.has(role.id)).toBe(true);
  });

  test("the Bandit Warlord takes the bandit role only while blitzing", () => {
    const warlord = sim.makeMinion("banditWarlord");
    expect(enemyRole({ time: 1 }, warlord)).toBeNull();
    warlord.blitzUntil = 2;
    expect(enemyRole({ time: 1 }, warlord)?.id).toBe("bandit");
  });
});
