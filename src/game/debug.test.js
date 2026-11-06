import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { GEAR_SLOTS } from "../combat/gear";
import { canCast, knownSpells, proficiency, rankFor, spellCasts } from "../combat/spells";
import {
  debugGiveCasting, debugLearnSchool, debugSetSchoolRank, debugSetSpellRank,
  debugAddGold, debugAddRenown, debugClearRegions, debugEndExpedition, debugGiveGearSet, debugGiveSupplies, debugSetBossRank,
  debugSetLevels, debugSkipTimers, isDebugMode,
} from "./debug";
import { createGuild, startExpedition } from "./guild";
import { shopTier } from "./shop";

const T0 = 1_000_000;

describe("test mode", () => {
  test("is enabled by ?debug in the address", () => {
    expect(isDebugMode("?debug")).toBe(true);
    expect(isDebugMode("?x=1&debug=1")).toBe(true);
    expect(isDebugMode("")).toBe(false);
  });

  test("adds gold and renown without touching the input", () => {
    const state = createGuild();
    expect(debugAddGold(state, 1000).state.gold).toBe(state.gold + 1000);
    expect(debugAddRenown(state, 10).state.legacy.renown).toBe(10);
    expect(state.legacy.renown).toBe(0);
  });

  test("levels heroes up with matching AP and SP, never down", () => {
    const leveled = debugSetLevels(createGuild(), 10).state;
    expect(leveled.heroes.every((hero) => hero.progression.level === 10)).toBe(true);
    expect(leveled.heroes[0].progression).toMatchObject({ ap: 9, sp: 9 });
    expect(debugSetLevels(leveled, 5).state.heroes[0].progression.level).toBe(10);
    expect(debugSetLevels(leveled, 99).state.heroes[0].progression.level).toBe(20);
  });

  test("skipping timers brings the next event forward, ends injuries and heals everyone", () => {
    let state = createGuild();
    state = startExpedition(state, "gutter", [state.heroes[0].identity.id], T0).state;
    state.injuries[state.heroes[1].identity.id] = T0 + 60_000;
    state.heroes[2].combat.hp = 1;
    const skipped = debugSkipTimers(state, T0 + 5).state;
    expect(skipped.expedition.nextEventAt).toBe(T0 + 5);
    const ended = debugEndExpedition(state, T0 + 5).state;
    expect(ended.expedition.endsAt).toBe(T0 + 5);
    expect(skipped.injuries).toEqual({});
    expect(skipped.heroes[2].combat.hp).toBe(classlessMaxHp(skipped.heroes[2]));
  });

  test("sets the boss rank, clears regions, and hands out gear and supplies", () => {
    const state = createGuild();
    expect(debugSetBossRank(state, 7).state.bossRank).toBe(7);
    expect(shopTier(debugClearRegions(state).state)).toBe(5);
    const geared = debugGiveGearSet(state, "epic", 6).state;
    expect(geared.vault.map((item) => item.slot)).toEqual([...GEAR_SLOTS]);
    expect(geared.vault.every((item) => item.rarity === "epic" && item.tier === 6)).toBe(true);
    const supplied = debugGiveSupplies(state).state;
    expect(supplied.stash).toMatchObject({ bandage: 16, potion: 10, ammo: 10, arrows: 140, flameArrows: 10, torch: 10, antitoxin: 10 });
    expect(supplied.essence).toBe(100);
  });
});

describe("test mode: magic", () => {
  test("casting, any school without a slot, a school's proficiency and a spell's rank", () => {
    const state = createGuild();
    const id = state.heroes[0].identity.id;
    expect(canCast(state.heroes[0])).toBe(false);
    const cast = debugGiveCasting(state, id).state;
    expect(canCast(cast.heroes[0])).toBe(true);
    expect(state.heroes[0].progression.ownedNodeIds).not.toContain("A1"); // input untouched

    let next = cast;
    for (const school of ["fire", "ice", "poison", "shadow", "conjuration"]) next = debugLearnSchool(next, id, school).state;
    expect(next.heroes[0].magic.elements).toEqual(["fire", "ice", "poison", "shadow", "conjuration"]);

    next = debugSetSchoolRank(next, id, "shadow", 5).state;
    expect(proficiency(next.heroes[0], "shadow")).toBe(5);
    expect(knownSpells(next.heroes[0]).map((s) => s.id)).toContain("mirror_self");
    next = debugSetSchoolRank(next, id, "shadow", 2).state;
    expect(proficiency(next.heroes[0], "shadow")).toBe(2);

    next = debugSetSpellRank(next, id, "spectral_blades", 3).state;
    expect(rankFor(spellCasts(next.heroes[0], "spectral_blades"))).toBe(3);
    // A school not learned yet is learned on the way.
    next = debugSetSchoolRank(next, id, "wild", 4).state;
    expect(next.heroes[0].magic.elements).toContain("wild");
    expect(knownSpells(next.heroes[0]).map((s) => s.id)).toContain("summon_beast");
    expect(debugSetSpellRank(next, id, "nope", 2).ok).toBe(false);
    expect(debugLearnSchool(next, "nobody", "fire").ok).toBe(false);
  });
});
