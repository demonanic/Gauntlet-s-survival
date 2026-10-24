import { createNewState } from "./logic";
import { createHeroModel, normalizeClasslessHero, serializeGameState } from "./heroModel";
import { mergeClasslessBattleResults } from "./classlessBattleResults";

describe("classless battle result persistence foundation", () => {
  const makeState = () => {
    const state = createNewState();
    state.heroes = [createHeroModel({ id: "classless-result", name: "Aster", appearanceId: "look-a" })];
    state.heroes[0].combat.hp = 241;
    state.heroes[0].progression = { level: 2, xp: 35, ap: 1, sp: 1, ownedNodeIds: ["owned-a"] };
    state.gold = 432;
    state.castleHp = 876;
    state.accountMarker = { preserved: true };
    return state;
  };

  test("merges wounded runtime HP and awarded XP through serialize/normalize without losing profile fields", () => {
    const source = makeState();
    const savedBefore = JSON.stringify(source);
    const result = mergeClasslessBattleResults(source, {
      heroIds: ["classless-result"],
      runtimeHeroes: [{ identity: { id: "classless-result" }, combat: { hp: 0, maxHp: 300 } }],
      xpGains: { 0: 18 },
    });
    expect(JSON.stringify(source)).toBe(savedBefore);
    const serialized = serializeGameState(result);
    const loaded = normalizeClasslessHero(JSON.parse(JSON.stringify(serialized.heroes[0])));
    expect(loaded.identity).toEqual(source.heroes[0].identity);
    expect(loaded.appearance).toEqual(source.heroes[0].appearance);
    expect(loaded.combat.hp).toBe(0);
    expect(loaded.combat.maxHp).toBe(300);
    expect(loaded.progression).toEqual({ ...source.heroes[0].progression, xp: 53 });
    expect(result.gold).toBe(432);
    expect(result.castleHp).toBe(876);
    expect(result.accountMarker).toEqual({ preserved: true });
  });

  test("applies a zero HP defeat without reviving and preserves the classless model", () => {
    const result = mergeClasslessBattleResults(makeState(), {
      heroIds: ["classless-result"],
      runtimeHeroes: [{ combat: { hp: 0 } }],
      xpGains: {},
    });
    expect(result.heroes[0].combat.hp).toBe(0);
    expect(result.heroes[0].cls).toBeUndefined();
    expect(result.heroes[0].combat.capabilities.sharedStrike.cooldownSeconds).toBe(12);
  });

  test("battle XP can cross multiple shared level thresholds and grants AP/SP per level", () => {
    const state = makeState();
    const hero = state.heroes[0];
    hero.progression = { level: 1, xp: 0, ap: 0, sp: 0, ownedNodeIds: [] };
    const result = mergeClasslessBattleResults(state, {
      heroIds: [hero.identity.id], runtimeHeroes: [{ combat: { hp: 280 } }], xpGains: { 0: 700 },
    });
    expect(result.heroes[0].progression).toEqual({ level: 4, xp: 700, ap: 3, sp: 3, ownedNodeIds: [] });
    expect(state.heroes[0].progression).toEqual({ level: 1, xp: 0, ap: 0, sp: 0, ownedNodeIds: [] });
  });

  test("leaves legacy heroes and legacy awards for the existing progression path", () => {
    const state = createNewState(["knight"]);
    const before = JSON.stringify(state.heroes[0]);
    const result = mergeClasslessBattleResults(state, {
      heroIds: [state.heroes[0].id], runtimeHeroes: [{ hp: 17 }], xpGains: { 0: 99 },
    });
    expect(result.heroes[0]).toEqual(JSON.parse(before));
    expect(state.heroes[0]).toEqual(JSON.parse(before));
  });

  test("rejects malformed results atomically", () => {
    const state = makeState();
    const before = JSON.stringify(state);
    expect(() => mergeClasslessBattleResults(state, {
      heroIds: ["classless-result"], runtimeHeroes: [{ combat: { hp: 301 } }], xpGains: { 0: 3 },
    })).toThrow("Invalid classless runtime HP");
    expect(() => mergeClasslessBattleResults(state, {
      heroIds: ["classless-result"], runtimeHeroes: [{ combat: { hp: 20 } }], xpGains: { 0: -2 },
    })).toThrow("Invalid classless XP award");
    expect(JSON.stringify(state)).toBe(before);
  });
});
