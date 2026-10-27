import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { ENCOUNTER_WAVES, buildNemesisEncounter, buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild, currentEncounterParty, resolveEncounter, startExpedition, tick } from "./guild";
import { createGearItem } from "./items";
import {
  NEMESIS, activeNemeses, growNemesis, nemesisLevel, nemesisStats, nemesisTraits, regionNemesis, riseNemesis,
} from "./nemesis";
import { getRegion } from "./regions";
import { parseGuild } from "./storage";

const T0 = 1_000_000;
const HOUR = 3_600_000;
const STEP = 1 / 30;
const victim = { id: "h1", name: "Kestra" };

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function plainHero() {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.guildBonus = { damage: 0, maxHp: 0 };
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "sword", rarity: "common", tier: 1 }) };
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}

function boneyardRun() {
  const state = createGuild();
  for (const hero of state.heroes) { hero.traits = []; hero.combat.hp = classlessMaxHp(hero); }
  const ids = state.heroes.map((hero) => hero.identity.id).slice(0, 3);
  for (const hero of state.heroes) hero.progression.level = Math.max(hero.progression.level, 3);
  return startExpedition(state, "boneyard", ids, T0, () => 0.5).state;
}

// Put a running expedition into an engaged fight against `wave`.
function fight(state, wave) {
  state.expedition.pending = { kind: "ambush", wave, label: "the squad", at: T0, promptAt: T0, engagedAt: T0, nemesisId: wave.nemesisId };
  return state;
}

describe("nemesis growth", () => {
  test("a nemesis levels up over time and with every win, up to a cap", () => {
    const state = createGuild();
    const nemesis = riseNemesis(state, { type: "orc", typeName: "Orc", regionId: "boneyard", heroes: [victim], wiped: true }, T0);
    expect(nemesis).toMatchObject({ level: 1, victims: [victim] });
    expect(nemesisLevel(nemesis, T0 + NEMESIS.growthHours * HOUR - 1)).toBe(1);
    expect(nemesisLevel(nemesis, T0 + 2 * NEMESIS.growthHours * HOUR)).toBe(3);
    expect(growNemesis(nemesis, 2, T0 + NEMESIS.growthHours * HOUR)).toBe(4);
    expect(nemesisLevel(nemesis, T0 + 1000 * HOUR)).toBe(NEMESIS.maxLevel);
  });

  test("traits come with levels, and stats grow with them", () => {
    expect(nemesisTraits(1)).toEqual([]);
    expect(nemesisTraits(5).map((trait) => trait.id)).toEqual(["relentless", "ironhide"]);
    const low = nemesisStats(1);
    const high = nemesisStats(9);
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(high.dmg).toBeGreaterThan(low.dmg);
    expect(high).toMatchObject({ attackSpeed: 1.25, regen: 0.01, fleeChance: 0 });
    expect(low.fleeChance).toBe(NEMESIS.fleeChance);
  });

  test("one nemesis per region and a few at most; a knockout only sometimes makes one", () => {
    const state = createGuild();
    const rise = (regionId, wiped, roll = 0) => riseNemesis(state, { type: "orc", typeName: "Orc", regionId, heroes: [victim], wiped }, T0, () => roll);
    expect(rise("boneyard", false, 0.99)).toBeNull();
    expect(rise("boneyard", false, 0)).not.toBeNull();
    expect(rise("boneyard", true)).toBeNull();
    expect(rise("frostfang", true)).not.toBeNull();
    expect(rise("ashen", true)).not.toBeNull();
    expect(rise("blightmire", true)).toBeNull();
    expect(activeNemeses(state)).toHaveLength(NEMESIS.maxActive);
    expect(regionNemesis(state, "frostfang").regionId).toBe("frostfang");
  });

  test("nemeses survive a save and reload", () => {
    const state = createGuild();
    riseNemesis(state, { type: "orc", typeName: "Orc", regionId: "boneyard", heroes: [victim], wiped: true }, T0);
    const loaded = parseGuild(JSON.parse(JSON.stringify({ ...state, nemeses: [...state.nemeses, { type: "nope", name: "x" }] })));
    expect(loaded.nemeses).toHaveLength(1);
    expect(loaded.nemeses[0].victims).toEqual([victim]);
  });
});

describe("nemesis encounters", () => {
  test("the nemesis leads the first wave, named, as a stronger elite", () => {
    const region = getRegion("boneyard");
    const nemesis = { id: "nem1", type: "orc", name: "Grak the Grudge" };
    const wave = buildNemesisEncounter(region, nemesis, 4, 0, () => 0.5);
    const [foe] = wave.enemies;
    expect(foe).toMatchObject({ name: "Grak the Grudge", tier: "elite", nemesisId: "nem1", nemesisLevel: 4 });
    expect(wave.nemesisId).toBe("nem1");
    const orcHp = C.ENEMIES.orc.hp * region.hpScale;
    expect(foe.maxHp).toBeGreaterThan(orcHp * 2 * nemesisStats(4).hp);
    expect(wave.reinforcements).toHaveLength(ENCOUNTER_WAVES - 1);
  });

  test("the engine records who downed each hero, and a nemesis may flee when nearly dead", () => {
    const wave = buildNemesisEncounter(getRegion("boneyard"), { id: "nem1", type: "orc", name: "Grak" }, 2, 0, () => 0.5);
    const hero = plainHero();
    hero.combat.hp = 1;
    let outcome = null;
    const engine = new Engine({ getContext: () => null }, createEncounterSim([hero], 2), { ...wave, reinforcements: [] }, { onEnd: (result) => { outcome = result; } });
    for (let t = 0; t < 120 && !outcome; t += STEP) engine.update(STEP);
    expect(outcome.victory).toBe(false);
    expect(outcome.downed[0]).toMatchObject({ type: expect.any(String) });

    const flee = new Engine({ getContext: () => null }, createEncounterSim([plainHero()], 2), { ...wave, reinforcements: [] }, {});
    const foe = { ...wave.enemies[0], x: 400, y: 100, dmgBy: {}, atkCd: 0, hp: 1, fleeChance: 1 };
    flee.spawnQueue = [];
    flee.active = [foe];
    flee.update(STEP);
    expect(flee.nemesisFled).toBe("nem1");
    expect(flee.active).not.toContain(foe);
  });
});

describe("nemeses on the road", () => {
  test("a creature that wipes the party rises as a nemesis and remembers its victims", () => {
    const state = fight(boneyardRun(), buildWildEncounter(getRegion("boneyard"), 0, () => 0.5));
    const party = structuredClone(currentEncounterParty(state)).map((hero) => ({ ...hero, combat: { ...hero.combat, hp: 0 } }));
    const downed = { 0: { type: "orc", name: "Orc" }, 1: { type: "orc", name: "Orc" }, 2: { type: "skeleton", name: "Skeleton", summoned: true } };
    const next = resolveEncounter(state, { victory: false, party, xpGains: {}, gold: 0, items: [], downed }, T0 + 1000).state;
    const [nemesis] = next.nemeses;
    expect(nemesis).toMatchObject({ type: "orc", regionId: "boneyard", level: 1 });
    expect(nemesis.victims.map((entry) => entry.name)).toEqual(party.slice(0, 2).map((hero) => hero.identity.name));
    expect(next.lastReport.log.some((line) => line.includes(nemesis.name))).toBe(true);
  });

  test("the Gutter never makes a nemesis", () => {
    const state = createGuild();
    const ids = state.heroes.map((hero) => hero.identity.id).slice(0, 3);
    let run = startExpedition(state, "gutter", ids, T0, () => 0.5).state;
    run = fight(run, buildWildEncounter(getRegion("gutter"), 0, () => 0.5));
    const party = structuredClone(currentEncounterParty(run)).map((hero) => ({ ...hero, combat: { ...hero.combat, hp: 0 } }));
    const next = resolveEncounter(run, { victory: false, party, xpGains: {}, gold: 0, items: [], downed: { 0: { type: "goblin", name: "Goblin" } } }, T0 + 1000).state;
    expect(next.nemeses).toEqual([]);
  });

  test("a nemesis turns up on a later trip to its region, and beating it pays out and avenges its victims", () => {
    let state = boneyardRun();
    const victimHero = state.heroes.find((hero) => hero.identity.id === state.expedition.heroIds[0]);
    const nemesis = riseNemesis(state, { type: "orc", typeName: "Orc", regionId: "boneyard", heroes: [{ id: victimHero.identity.id, name: victimHero.identity.name }], wiped: true }, T0);
    // Walk the road (clearing every other prompt) until the nemesis shows up.
    state.expedition.endsAt = T0 + 1000 * HOUR;
    const rng = seeded(3);
    let pending = null;
    for (let i = 0; i < 400 && !pending?.nemesisId; i += 1) {
      state.expedition.pending = null;
      state = tick(state, state.expedition.nextEventAt, { interactive: true, rng });
      pending = state.expedition.pending;
    }
    expect(pending.nemesisId).toBe(nemesis.id);
    expect(state.expedition.feed.some((line) => line.text.includes(`It remembers ${victimHero.identity.name}`))).toBe(true);

    state.expedition.pending.engagedAt = pending.promptAt;
    const party = structuredClone(currentEncounterParty(state));
    const goldBefore = state.expedition.loot.gold;
    const xpBefore = victimHero.progression.xp;
    const next = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 0, items: [], nemesisSlain: nemesis.id }, pending.promptAt + 60_000).state;
    const slain = next.nemeses.find((entry) => entry.id === nemesis.id);
    expect(slain.slainAt).toBeGreaterThan(0);
    expect(regionNemesis(next, "boneyard")).toBeNull();
    expect(next.expedition.loot.gold).toBeGreaterThan(goldBefore);
    const avenger = next.heroes.find((hero) => hero.identity.id === victimHero.identity.id);
    expect(avenger.progression.xp + (avenger.progression.level - victimHero.progression.level) * 1000).toBeGreaterThan(xpBefore);
  });

  test("a nemesis that downs heroes or escapes grows stronger", () => {
    const state = boneyardRun();
    const nemesis = riseNemesis(state, { type: "orc", typeName: "Orc", regionId: "boneyard", heroes: [victim], wiped: true }, T0);
    const wave = buildNemesisEncounter(getRegion("boneyard"), nemesis, 1, 0, () => 0.5);
    fight(state, wave);
    const party = structuredClone(currentEncounterParty(state));
    const downed = { 1: { type: "orc", name: nemesis.name, nemesisId: nemesis.id } };
    const next = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 0, items: [], downed, nemesisFled: nemesis.id }, T0 + 1000).state;
    const grown = next.nemeses[0];
    expect(grown.level).toBe(1 + NEMESIS.levelsPerKnockout + 1);
    expect(grown.victims).toHaveLength(2);
    expect(grown.fled).toBe(1);
    expect(grown.slainAt).toBeUndefined();
  });
});
