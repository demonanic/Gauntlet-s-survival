import {
  createGuild, heroStatus, recallExpedition, recruitCost, recruitHero, resolveEncounter,
  startExpedition, tick, currentEncounterParty,
} from "./guild";
import { buildEncounter } from "./encounters";
import { getRegion } from "./regions";
import { simulateEncounter } from "./simulate";
import { loadGuild, saveGuild } from "./storage";

const T0 = 1_000_000;
const ids = (state) => state.heroes.map((hero) => hero.identity.id);

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}

describe("guild roster", () => {
  test("starts with three classless heroes and starting gold", () => {
    const state = createGuild();
    expect(state.heroes).toHaveLength(3);
    expect(state.heroes.every((hero) => hero.combat && !hero.cls)).toBe(true);
    expect(state.gold).toBe(100);
  });

  test("recruiting spends gold and grows the cost", () => {
    const state = createGuild();
    const first = recruitHero(state);
    expect(first.ok).toBe(true);
    expect(first.state.heroes).toHaveLength(4);
    expect(first.state.gold).toBe(100 - 80);
    expect(recruitCost(first.state)).toBe(128);
    expect(recruitHero(first.state)).toEqual({ ok: false, reason: "insufficient_gold" });
    expect(state.heroes).toHaveLength(3); // input untouched
  });
});

describe("expedition lifecycle", () => {
  test("rejects regions above the party's level", () => {
    const state = createGuild();
    expect(startExpedition(state, "boneyard", ids(state), T0)).toEqual({ ok: false, reason: "level_required" });
  });

  test("travel timer makes the first encounter ready", () => {
    const state = createGuild();
    const started = startExpedition(state, "gutter", ids(state).slice(0, 2), T0).state;
    expect(started.expedition.phase).toBe("traveling");
    expect(heroStatus(started, started.heroes[0], T0)).toBe("away");
    expect(heroStatus(started, started.heroes[2], T0)).toBe("ready");
    expect(tick(started, T0 + 19_000).expedition.phase).toBe("traveling");
    expect(tick(started, T0 + 20_000).expedition.phase).toBe("ready");
  });

  test("a full simulated run clears the Gutter and banks loot on return", () => {
    const region = getRegion("gutter");
    let state = createGuild();
    state = startExpedition(state, "gutter", ids(state), T0).state;
    let now = T0;
    for (let i = 0; i < region.encounters.length; i++) {
      now += 60_000;
      state = tick(state, now);
      expect(state.expedition.phase).toBe("ready");
      const party = currentEncounterParty(state);
      const { result, sim } = simulateEncounter(party, buildEncounter(region, i));
      expect(result.victory).toBe(true);
      state = resolveEncounter(state, {
        victory: true, party: sim.heroes, xpGains: result.xpGains.heroes, gold: sim.gold, items: sim.vault,
      }, now).state;
    }
    expect(state.expedition).toMatchObject({ phase: "returning", outcome: "victory" });
    const lootGold = state.expedition.loot.gold;
    expect(lootGold).toBeGreaterThan(region.completionGold);
    state = tick(state, now + region.travelSeconds * 1000);
    expect(state.expedition).toBeNull();
    expect(state.gold).toBe(100 + lootGold);
    expect(state.clears.gutter).toBe(1);
    expect(state.heroes.some((hero) => hero.progression.xp > 0)).toBe(true);
  });

  test("a defeat sends the party home injured with half the loot", () => {
    let state = createGuild();
    state = startExpedition(state, "gutter", ids(state).slice(0, 1), T0).state;
    state = tick(state, T0 + 20_000);
    const [hero] = currentEncounterParty(state);
    const fallen = { ...hero, combat: { ...hero.combat, hp: 0 } };
    state = resolveEncounter(state, { victory: false, party: [fallen], xpGains: {}, gold: 21, items: [] }, T0 + 30_000).state;
    expect(state.expedition).toMatchObject({ phase: "returning", outcome: "retreat" });
    expect(state.expedition.loot.gold).toBe(10);
    state = tick(state, T0 + 50_000);
    expect(state.expedition).toBeNull();
    expect(state.gold).toBe(110);
    const home = state.heroes.find((entry) => entry.identity.id === hero.identity.id);
    expect(home.combat.hp).toBeGreaterThan(0);
    expect(heroStatus(state, home, T0 + 50_000)).toBe("injured");
    expect(heroStatus(state, home, T0 + 30_000 + 60_000)).toBe("ready");
  });

  test("recalling between encounters keeps all loot", () => {
    let state = createGuild();
    state = startExpedition(state, "gutter", ids(state), T0).state;
    const recalled = recallExpedition(state, T0 + 5_000);
    expect(recalled.ok).toBe(true);
    expect(recalled.state.expedition).toMatchObject({ phase: "returning", outcome: "recalled" });
  });

  test("resting at the guild heals wounded heroes", () => {
    let state = createGuild();
    state.heroes[0].traits = []; // no trait, so max HP is exactly 300
    state.heroes[0].combat.hp = 100;
    state = tick(state, T0);
    state = tick(state, T0 + 30_000);
    expect(state.heroes[0].combat.hp).toBeCloseTo(200, 0);
  });
});

describe("storage", () => {
  test("round-trips the guild and falls back to a fresh guild on bad data", () => {
    const storage = memoryStorage();
    const state = recruitHero(createGuild()).state;
    expect(saveGuild(state, storage)).toBe(true);
    expect(loadGuild(storage).heroes).toHaveLength(4);
    storage.setItem("gauntlet.save.v1", "{not json");
    expect(loadGuild(storage).heroes).toHaveLength(3);
  });
});
