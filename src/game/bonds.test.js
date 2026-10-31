import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { Engine } from "../combat/engine";
import { createGearItem } from "./items";
import { BONDS, bondKey, combatBonds, heroBonds, memorialDamage, recordSharedWin, swornPartner } from "./bonds";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild, currentEncounterParty, resolveEncounter, startExpedition } from "./guild";
import { retireHero } from "./legacy";
import { getRegion } from "./regions";
import { parseGuild } from "./storage";
import { withPendingFight } from "../test/expeditionFixtures";

const T0 = 1_000_000;
const ids = (state) => state.heroes.map((hero) => hero.identity.id);
const win = (state, heroIds, times) => { for (let i = 0; i < times; i += 1) recordSharedWin(state, heroIds); };

function fighter(id, { bonds = [], traits = [] } = {}) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.identity = { ...hero.identity, id, name: id };
  hero.traits = traits;
  hero.guildBonus = { damage: 0, maxHp: 0 };
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "sword", rarity: "common", tier: 1 }) };
  hero.combat.hp = classlessMaxHp(hero);
  hero.bonds = bonds;
  return hero;
}

function engineWith(heroes) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = [];
  return engine;
}

describe("bonds grow", () => {
  test("shared wins make heroes Acquainted, then Comrades, then Sworn", () => {
    const state = createGuild();
    const [a, b] = ids(state);
    win(state, [a, b], BONDS.acquainted - 1);
    expect(heroBonds(state, a)).toEqual([]);
    expect(recordSharedWin(state, [a, b])).toEqual([{ a, b, level: "acquainted" }]);
    win(state, [a, b], BONDS.comrades - BONDS.acquainted);
    expect(heroBonds(state, a)[0]).toMatchObject({ partnerId: b, level: "comrades" });
    win(state, [a, b], BONDS.sworn - BONDS.comrades);
    expect(heroBonds(state, b)[0]).toMatchObject({ partnerId: a, level: "sworn" });
    expect(swornPartner(state, a)).toBe(b);
  });

  test("a hero has only one Sworn partner; other close bonds stay Comrades", () => {
    const state = createGuild();
    const [a, b, c] = ids(state);
    win(state, [a, b, c], BONDS.sworn);
    const levels = [bondKey(a, b), bondKey(a, c), bondKey(b, c)].map((key) => state.bonds[key].sworn || false);
    expect(levels.filter(Boolean)).toHaveLength(1);
    expect(heroBonds(state, c).map((bond) => bond.level).sort()).toEqual(["comrades", "comrades"]);
  });

  test("winning a fight on the road bonds the heroes still standing, and the feed marks a new level", () => {
    let state = createGuild();
    const party = ids(state).slice(0, 3);
    state = startExpedition(state, "gutter", party, T0, () => 0.5).state;
    state.bonds = { [bondKey(party[0], party[1])]: { wins: BONDS.comrades - 1 } };
    withPendingFight(state, T0 + 1000);
    const fought = structuredClone(currentEncounterParty(state));
    fought[2].combat.hp = 0;
    state = resolveEncounter(state, { victory: true, party: fought, xpGains: {}, gold: 0, items: [] }, T0 + 2000).state;
    expect(state.bonds[bondKey(party[0], party[1])].wins).toBe(BONDS.comrades);
    expect(state.bonds[bondKey(party[0], party[2])]).toBeUndefined();
    const names = party.slice(0, 2).map((id) => state.heroes.find((hero) => hero.identity.id === id).identity.name);
    expect(state.expedition.feed.some((line) => line.text === `${names[0]} and ${names[1]} are Comrades now.`)).toBe(true);
    // ...and the next fight's party carries the bond into battle.
    expect(currentEncounterParty(state)[0].bonds).toEqual([{ partnerId: party[1], level: "comrades" }]);
  });

  test("bonds survive a save and reload", () => {
    const state = createGuild();
    win(state, ids(state).slice(0, 2), 40);
    expect(parseGuild(JSON.parse(JSON.stringify(state))).bonds).toEqual(state.bonds);
  });
});

describe("bonds in battle", () => {
  test("Comrades hit 5% harder while both are standing", () => {
    const engine = engineWith([fighter("a", { bonds: [{ partnerId: "b", level: "comrades" }] }), fighter("b")]);
    const [a, b] = engine.heroes;
    expect(engine._bondDamage(a)).toBeCloseTo(BONDS.comradesDamage);
    b.alive = false;
    expect(engine._bondDamage(a)).toBe(0);
  });

  test("when a bonded partner falls, most heroes fly into Vengeance; calm ones are Shaken", () => {
    const engine = engineWith([
      fighter("a", { bonds: [{ partnerId: "c", level: "comrades" }] }),
      fighter("b", { bonds: [{ partnerId: "c", level: "comrades" }], traits: ["stalwart"] }),
      fighter("c"),
    ]);
    const [a, b, c] = engine.heroes;
    engine._resolveClasslessHeroDamage(c, c.ref.hp + 10);
    expect(c.alive).toBe(false);
    expect(engine._bondDamage(a)).toBeCloseTo(BONDS.vengeanceDamage);
    expect(engine._bondDamage(b)).toBeCloseTo(BONDS.shakenDamage);
    engine.time += BONDS.vengeanceSeconds + 1;
    expect(engine._bondDamage(a)).toBe(0);
  });

  test("a Sworn partner shields the other when they drop low, once a fight", () => {
    const engine = engineWith([fighter("a", { bonds: [{ partnerId: "b", level: "sworn" }] }), fighter("b", { bonds: [{ partnerId: "a", level: "sworn" }] })]);
    const [a] = engine.heroes;
    engine._resolveClasslessHeroDamage(a, a.d.maxHp * 0.8);
    expect(a.ref.shield).toBeCloseTo(a.d.maxHp * BONDS.guardShield);
    a.ref.shield = 0;
    engine._resolveClasslessHeroDamage(a, 1);
    expect(a.ref.shield).toBe(0);
  });
});

describe("retiring a bonded hero", () => {
  test("Comrade and Sworn partners keep a memory (+3% damage, up to three); the bonds end", () => {
    let state = createGuild();
    const [a, b, c] = ids(state);
    win(state, [a, b], BONDS.comrades);
    win(state, [a, c], BONDS.acquainted);
    state.heroes[0].progression.level = 20;
    state = retireHero(state, a, T0).state;
    const partner = state.heroes.find((hero) => hero.identity.id === b);
    expect(partner.memorials).toEqual([{ name: createGuild().heroes[0].identity.name, level: "comrades" }]);
    expect(state.heroes.find((hero) => hero.identity.id === c).memorials).toBeUndefined();
    expect(Object.keys(state.bonds).some((key) => key.includes(a))).toBe(false);
    expect(memorialDamage(partner)).toBeCloseTo(BONDS.memorialDamage);
    expect(memorialDamage({ memorials: Array(5).fill({ name: "x" }) })).toBeCloseTo(BONDS.memorialDamage * BONDS.maxMemorials);
    expect(combatBonds(state, partner, [b, c])).toEqual([]);
  });
});
