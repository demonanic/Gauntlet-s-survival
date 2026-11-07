import { debugClearRegions, debugSetLevels } from "./debug";
import { ENDLESS, HORDE, MARCH, buildMarchWave, createEncounterSim, endlessWaveSource } from "./encounters";
import { regionOpen } from "./expedition";
import { createGuild, currentEncounterParty, recruitHero, resolveEncounter, startExpedition } from "./guild";
import { getRegion } from "./regions";
import { simulateEncounter } from "./simulate";
import { seededRandom } from "./random";

const ready = () => {
  let state = createGuild();
  state = recruitHero(state).state;
  return debugSetLevels(state, 12).state;
};

describe("the Dead March", () => {
  test("an endless region that opens once Frostfang is cleared", () => {
    const march = getRegion("march");
    expect(march.endless).toBe(true);
    expect(march.endlessKind).toBe("march");
    const state = ready();
    expect(regionOpen(state, march)).toBe(false);
    expect(regionOpen(state, getRegion("rift"))).toBe(true);
    expect(regionOpen({ ...state, clears: { frostfang: 1 } }, march)).toBe(true);
  });

  test("waves: 20 zombies, +3 a wave up to 60; every 5th a surge of 1.5x (up to 80); HP and damage grow like the Rift's", () => {
    const counts = [1, 2, 4, 5, 10, 14, 15, 20, 25].map((n) => buildMarchWave(n, () => 0.5).enemies.length);
    expect(counts).toEqual([20, 23, 29, 48, 71, 59, 80, 80, 80]);
    const one = buildMarchWave(1, () => 0.5);
    const six = buildMarchWave(6, () => 0.5);
    expect(one.enemies.every((enemy) => enemy.type === HORDE.enemy)).toBe(true);
    expect(one.horde).toBe(true);
    expect(one.fieldCap).toBe(HORDE.onField);
    expect(six.enemies[0].maxHp / one.enemies[0].maxHp).toBeCloseTo(ENDLESS.hpGrowth ** 5, 1);
    expect(buildMarchWave(5, () => 0.5).surge).toBe(true);
    expect(buildMarchWave(6, () => 0.5).lootTier).toBe(MARCH.firstLootTier + 1);
  });

  test("a trip opens a march prompt; the fight rolls from wave to wave until the party heads home", () => {
    const state = { ...ready(), clears: { frostfang: 1 } };
    const ids = state.heroes.map((hero) => hero.identity.id);
    const started = startExpedition(state, "march", ids, 1000, seededRandom(4));
    expect(started.ok).toBe(true);
    const pending = started.state.expedition.pending;
    expect(pending.kind).toBe("rift");
    expect(pending.march).toBe(true);
    expect(pending.wave.enemies.length).toBe(MARCH.count.first);
    const party = currentEncounterParty(started.state);
    for (const hero of party) hero.combat.hp = 1e7;
    const { result, engine } = simulateEncounter(party, pending.wave, {
      regionTier: 2, endless: true, endlessKind: "march", rng: seededRandom(5), shouldReturn: (e) => e.wavesCleared >= 3,
    });
    expect(result.victory).toBe(true);
    expect(engine.wavesCleared).toBeGreaterThanOrEqual(3);
    expect(engine.wave.enemies.every((enemy) => enemy.type === "zombie")).toBe(true);
  });

  test("results: 15 gold a wave, a chest every 5 waves, and the best wave on record", () => {
    const state = { ...ready(), clears: { frostfang: 1 } };
    const ids = state.heroes.map((hero) => hero.identity.id);
    const started = startExpedition(state, "march", ids, 1000, () => 0.5).state;
    const party = currentEncounterParty(started);
    const next = resolveEncounter(started, { victory: true, party, xpGains: {}, gold: 0, items: [], wavesCleared: 11 }, 2000, { rng: () => 0.5 }).state;
    expect(next.records.marchBest).toBe(11);
    expect(next.records.riftBest || 0).toBe(0);
    expect(next.lastReport.outcome).toBe("returned");
    expect(next.lastReport.loot.gold).toBeGreaterThanOrEqual(MARCH.bounty * 11 + 2 * MARCH.chestGold[0]);
    expect(next.lastReport.loot.items.filter((item) => item.kind === "crystal")).toHaveLength(2);
    expect(next.lastReport.log.some((line) => /Held the line for 11 waves/.test(line))).toBe(true);
  });

  test("the Rift is unchanged: its own waves and record", () => {
    const sim = createEncounterSim(createGuild().heroes, 1);
    const wave = endlessWaveSource(sim, () => 0.5)(0);
    expect(wave.enemies.some((enemy) => enemy.type === "zombie")).toBe(false);
  });
});
