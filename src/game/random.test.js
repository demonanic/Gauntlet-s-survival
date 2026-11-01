// Seedable randomness (roadmap Phase 4): the same seed and the same state give
// the same result, and play without a seed still uses Math.random.
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { withPendingFight } from "../test/expeditionFixtures";
import { buildBossEncounter, buildEndlessWave, buildWildEncounter } from "./encounters";
import { debugSetLevels } from "./debug";
import { createGuild, startExpedition, tick } from "./guild";
import { defaultRandom, seededRandom } from "./random";
import { getRegion } from "./regions";
import { simulateEncounter } from "./simulate";

// One fixed party for every fight (createGuild itself rolls traits and looks).
const PARTY = (() => {
  const random = vi.spyOn(Math, "random").mockImplementation(seededRandom(99));
  const heroes = createGuild().heroes;
  random.mockRestore();
  for (const hero of heroes) hero.combat.hp = classlessMaxHp(hero);
  return heroes;
})();

const FIGHTS = {
  wild: () => ({ wave: buildWildEncounter(getRegion("gutter"), 0, seededRandom(1), { waves: 2 }), options: { regionTier: 1 } }),
  // The Imperial Necromancer summons minions, so summons and their drops are covered.
  boss: () => ({ wave: buildBossEncounter(getRegion("ashen"), 1, seededRandom(2)), options: { regionTier: 3 } }),
  rift: () => ({
    wave: buildEndlessWave(1, seededRandom(3)),
    options: { regionTier: 1, endless: true, shouldReturn: (engine) => engine.wavesCleared >= 3 || engine.time > 240 },
  }),
};

// Everything a fight decides, without item ids (they carry the clock, by design).
function fightRecord({ result, sim, elapsed }) {
  return structuredClone({
    result, elapsed, gold: sim.gold,
    items: sim.vault.map(({ id, ...item }) => item),
    heroes: sim.heroes.map((hero) => ({ hp: hero.combat.hp, quickSlots: hero.quickSlots, stats: hero.battleStats })),
  });
}
const fight = (kind, rng) => {
  const { wave, options } = FIGHTS[kind]();
  return fightRecord(simulateEncounter(PARTY, wave, { ...options, rng }));
};

describe("seededRandom", () => {
  test("equal seeds give equal sequences, different seeds differ, values are in [0, 1)", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const first = Array.from({ length: 100 }, () => a());
    expect(Array.from({ length: 100 }, () => b())).toEqual(first);
    expect(Array.from({ length: 100 }, () => c())).not.toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  test("defaultRandom reads Math.random on every call", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.25);
    expect(defaultRandom()).toBe(0.25);
    random.mockReturnValue(0.75);
    expect(defaultRandom()).toBe(0.75);
    random.mockRestore();
  });
});

describe("a seeded fight", () => {
  test.each(Object.keys(FIGHTS))("%s: the same seed gives the same fight", (kind) => {
    expect(fight(kind, seededRandom(42))).toEqual(fight(kind, seededRandom(42)));
  });

  test.each(Object.keys(FIGHTS))("%s: no roll bypasses the seed (Math.random has no effect)", (kind) => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.01);
    const low = fight(kind, seededRandom(42));
    random.mockReturnValue(0.99);
    const high = fight(kind, seededRandom(42));
    random.mockRestore();
    expect(high).toEqual(low);
  });

  test("different seeds give different fights", () => {
    const outcomes = new Set([1, 2, 3, 4, 5].map((seed) => JSON.stringify(fight("wild", seededRandom(seed)))));
    expect(outcomes.size).toBeGreaterThan(1);
  });
});

describe("an unseeded fight still uses Math.random", () => {
  test("Math.random drives it, read at roll time", () => {
    const random = vi.spyOn(Math, "random");
    random.mockImplementation(seededRandom(5));
    const first = fight("wild");
    random.mockImplementation(seededRandom(5));
    const again = fight("wild");
    random.mockImplementation(seededRandom(6));
    const other = fight("wild");
    random.mockRestore();
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });
});

// A whole unattended trip: events, choices, fights and rewards, from one seed.
describe("a seeded trip", () => {
  const T0 = 1_000_000;
  const MINUTE = 60_000;
  // One guild per level, copied for every trip, so heroes, traits, looks and
  // ids are identical (createGuild uses Math.random and the clock).
  const guilds = {};
  function guildAt(level) {
    if (!guilds[level]) {
      const random = vi.spyOn(Math, "random").mockImplementation(seededRandom(77));
      let state = createGuild();
      if (level > 1) state = debugSetLevels(state, level).state;
      random.mockRestore();
      for (const hero of state.heroes) hero.combat.hp = classlessMaxHp(hero);
      guilds[level] = state;
    }
    return structuredClone(guilds[level]);
  }
  // Gear ids carry the clock and an entropy suffix by design; drop them.
  const withoutGearIds = (value) => JSON.parse(JSON.stringify(value, (key, entry) =>
    (key === "id" && typeof entry === "string" && entry.startsWith("gear-") ? undefined : entry)));
  function playTrip(regionId, level, seed) {
    const rng = seededRandom(seed);
    let state = guildAt(level);
    state = startExpedition(state, regionId, state.heroes.map((hero) => hero.identity.id), T0, rng).state;
    for (let step = 1; step <= 200 && state.expedition; step += 1) state = tick(state, T0 + step * 20 * MINUTE, { rng });
    expect(state.expedition).toBeNull();
    return withoutGearIds(state);
  }

  // Gutter: a full trip of events and unattended fights. Boneyard at level 10:
  // over-levelled heroes in starter gear meet scaled-up enemies and retreat,
  // which exercises defeats and nemesis creation.
  test.each([["gutter", 1], ["boneyard", 10]])("%s trip: no roll bypasses the seed (Math.random has no effect)", (regionId, level) => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.01);
    const low = playTrip(regionId, level, 21);
    random.mockReturnValue(0.99);
    const high = playTrip(regionId, level, 21);
    random.mockRestore();
    expect(high).toEqual(low);
    expect(low.lastReport.stats.fights).toBeGreaterThan(1);
  });

  // A boss fight the party decides alone and wins: the end-boss rewards, the
  // region clear, a pet crate (level 10 leader), the Scavenger's pickings and
  // a quality developing.
  function bossFight(seed) {
    const rng = seededRandom(seed);
    let state = guildAt(10);
    // A Scavenger picks over the fallen after a win, and heroes with enough
    // fights behind them develop a quality at level 10: both roll on this win.
    // (Every hero is one, so a hero who falls in the fight still leaves one standing.)
    for (const hero of state.heroes) hero.traits = ["scavenger"];
    for (const hero of state.heroes) hero.history = { ...hero.history, fights: 20 };
    state = startExpedition(state, "boneyard", state.heroes.map((hero) => hero.identity.id), T0, rng).state;
    state = withPendingFight(state, T0 + 1000, "boss");
    // The fixture builds its wave with Math.random; build it from the seed.
    state.expedition.pending.wave = buildBossEncounter(getRegion("boneyard"), 0, rng);
    delete state.expedition.pending.engagedAt;
    return withoutGearIds(tick(state, T0 + 1000, { interactive: false, rng }));
  }
  test("boss victory: no roll bypasses the seed, and the boss rewards are reached", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0.01);
    const low = bossFight(4);
    random.mockReturnValue(0.99);
    const high = bossFight(4);
    random.mockRestore();
    expect(high).toEqual(low);
    expect(low.clears.boneyard).toBe(1);
    expect(low.petCrates).toHaveLength(1);
    expect(low.heroes.some((hero) => hero.milestones?.includes(10))).toBe(true);
  });
});
