import { debugClearRegions, debugSetLevels, debugTestFight } from "./debug";
import { HORDE } from "./encounters";
import { hordeRegion } from "./expedition";
import { createGuild, currentEncounterParty, recruitHero, resolveEncounter } from "./guild";
import { REGIONS, getRegion } from "./regions";

describe("horde events", () => {
  test("hordes come from Frostfang on, never in the Rift", () => {
    expect(REGIONS.filter(hordeRegion).map((region) => region.id)).toEqual(
      REGIONS.slice(REGIONS.findIndex((region) => region.id === "frostfang")).filter((region) => !region.endless).map((region) => region.id));
    expect(hordeRegion(getRegion("gutter"))).toBe(false);
    expect(hordeRegion(getRegion("rift"))).toBe(false);
  });

  test("a horde won pays its kills' gold twice, 1.5× XP, a chest of gold and a crystal", () => {
    let state = createGuild();
    state = recruitHero(state).state;
    state = debugClearRegions(debugSetLevels(state, 12).state).state;
    const fight = (horde) => {
      const started = debugTestFight(state, "ashen", { now: 1000, rng: () => 0.5 }).state;
      started.expedition.pending.horde = horde;
      const party = currentEncounterParty(started);
      const xpGains = Object.fromEntries(party.map((hero, i) => [i, 100]));
      const next = resolveEncounter(started, { victory: true, party, xpGains, gold: 200, items: [] }, 2000, { rng: () => 0.5 }).state;
      return { started, next };
    };
    const plain = fight(false);
    const horde = fight(true);
    const gold = (run) => run.next.expedition.loot.gold - run.started.expedition.loot.gold;
    expect(gold(horde) - gold(plain)).toBeGreaterThanOrEqual(200 * (HORDE.gold - 1) + HORDE.chestGold[0]);
    expect(horde.next.expedition.loot.items.length).toBe(plain.next.expedition.loot.items.length + 1);
    expect(horde.next.expedition.stats.hordes).toBe(1);
    expect(horde.next.expedition.feed.some((line) => /horde is broken/i.test(line.text))).toBe(true);
    const xp = (run) => run.next.heroes[0].progression.xp;
    const plainGain = xp(plain) - plain.started.heroes[0].progression.xp;
    const hordeGain = xp(horde) - horde.started.heroes[0].progression.xp;
    expect(plainGain).toBeGreaterThan(0);
    expect(hordeGain / plainGain).toBeCloseTo(HORDE.xp, 1);
  });
});
