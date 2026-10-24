import {
  createGuild, recruitCost, recruitHero, startExpedition, tick,
} from "./guild";
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

describe("guild basics", () => {
  test("rejects regions above the party's level", () => {
    const state = createGuild();
    expect(startExpedition(state, "boneyard", ids(state), T0)).toEqual({ ok: false, reason: "level_required" });
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
