import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { GEAR_SLOTS } from "../combat/gear";
import {
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
