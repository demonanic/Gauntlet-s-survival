import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { Engine } from "../combat/engine";
import { debugSetLevels, debugTestEndless } from "./debug";
import { FACTIONS, HORDE, ROAM, buildRoamWave, createEncounterSim, endlessWave, endlessWaveSource } from "./encounters";
import { buildFightOutcome } from "./fightOutcome";
import { regionOpen } from "./expedition";
import { benchHeroes, createGuild, currentEncounterParty, recruitHero, resolveEncounter, startExpedition } from "./guild";
import { endlessRecordKey, getRegion } from "./regions";
import { simulateEncounter } from "./simulate";
import { createGearItem } from "./items";
import { seededRandom } from "./random";

const zombiesOf = (wave) => wave.enemies.filter((enemy) => enemy.type === HORDE.enemy);
const squadOf = (wave) => wave.enemies.filter((enemy) => enemy.type !== HORDE.enemy);

describe("Free Roam scenarios", () => {
  test("wave 1 is a small squad from one faction, with no horde, and an event card", () => {
    const wave = buildRoamWave(1, seededRandom(3));
    const faction = FACTIONS.find((entry) => entry.id === wave.scenario.faction);
    expect(wave.enemies).toHaveLength(ROAM.squad.first);
    for (const enemy of wave.enemies) expect([...faction.leaders, ...faction.grunts]).toContain(enemy.type);
    expect(zombiesOf(wave)).toHaveLength(0);
    expect(wave.event).toContain(faction.name);
    expect(wave.event).toMatch(/attacks\.$/);
  });

  test("no zombies before the horde layer starts; every big event brings a full horde", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const rng = seededRandom(seed);
      for (let n = 1; n < ROAM.hordeFrom; n += 1) expect(zombiesOf(buildRoamWave(n, rng))).toHaveLength(0);
    }
    const big = buildRoamWave(5, seededRandom(1));
    expect(big.bigEvent).toBe(true);
    expect(big.scenario.layer).toBe("horde");
    expect(zombiesOf(big)).toHaveLength(ROAM.horde.first + ROAM.horde.step * 4);
    expect(big.event).toMatch(/a horde close behind\.$/);
  });

  test("the horde layer comes in all three kinds at about the planned odds", () => {
    const counts = { none: 0, trickle: 0, horde: 0 };
    const rng = seededRandom(11);
    for (let i = 0; i < 2000; i += 1) counts[buildRoamWave(4, rng).scenario.layer] += 1;
    for (const kind of Object.keys(counts)) expect(counts[kind] / 2000).toBeCloseTo(ROAM.layer[kind], 1);
    let trickle = null;
    for (let seed = 0; !trickle; seed += 1) {
      const wave = buildRoamWave(4, seededRandom(seed));
      if (wave.scenario.layer === "trickle") trickle = wave;
    }
    expect(zombiesOf(trickle)).toHaveLength(ROAM.trickle.count);
    for (const zombie of zombiesOf(trickle)) expect(zombie.spawnGap).toBe(ROAM.trickle.gap);
  });

  test("the squad walks in first, then the zombies come from every side", () => {
    const wave = buildRoamWave(5, seededRandom(1));
    const squad = squadOf(wave).length;
    expect(wave.enemies.slice(0, squad).every((enemy) => enemy.type !== HORDE.enemy && !enemy.hordeEntry)).toBe(true);
    expect(wave.enemies.slice(squad).every((enemy) => enemy.hordeEntry && enemy.spawnGap === ROAM.horde.gap)).toBe(true);
    expect(wave.fieldCap).toBe(squad + ROAM.zombiesOnField);
  });

  test("squads grow to their cap; every 10th wave a boss leads, with no horde", () => {
    expect(squadOf(buildRoamWave(4, seededRandom(2)))).toHaveLength(ROAM.squad.first + 1);
    expect(squadOf(buildRoamWave(41, seededRandom(2)))).toHaveLength(ROAM.squad.max);
    const boss = buildRoamWave(10, seededRandom(2));
    expect(boss.hasBoss).toBe(true);
    expect(zombiesOf(boss)).toHaveLength(0);
    expect(boss.event).toMatch(/^The .+ leads .+ into battle\.$/);
  });

  test("waves grow like the Rift's; endlessWave picks the kind", () => {
    const one = buildRoamWave(1, seededRandom(4));
    const six = buildRoamWave(6, seededRandom(4));
    expect(six.scale.hp / one.scale.hp).toBeCloseTo(1.1 ** 5, 5);
    expect(endlessWave("roam", 3, seededRandom(4)).scenario).toBeTruthy();
    expect(endlessWave("rift", 3, seededRandom(4)).scenario).toBeUndefined();
  });

  test("in a fight, the zombies of a mixed wave enter from the sides as well as the top", () => {
    const hero = structuredClone(createGuild().heroes[0]);
    hero.traits = [];
    hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "sword", rarity: "common", tier: 1 }) };
    hero.combat.hp = classlessMaxHp(hero);
    const wave = buildRoamWave(5, seededRandom(1));
    const engine = new Engine({ getContext: () => null }, createEncounterSim([hero], 1, wave, { rng: seededRandom(5) }), wave, {});
    engine.godMode = true;
    const entered = new Map();
    for (let frame = 0; frame < 30 * 40 && engine.spawnQueue.length; frame += 1) {
      engine.update(1 / 30);
      for (const enemy of engine.active) if (!entered.has(enemy)) entered.set(enemy, { x: enemy.x, y: enemy.y });
    }
    const spots = [...entered].map(([enemy, at]) => ({ zombie: enemy.type === HORDE.enemy, ...at }));
    // Lanes start at the top (y at most 30); only a horde comes in down the edges.
    expect(spots.filter((spot) => !spot.zombie).every((spot) => spot.y <= 30)).toBe(true);
    expect(spots.some((spot) => spot.zombie && spot.y > 30)).toBe(true);
  });
});

const ready = () => {
  let state = createGuild();
  state = recruitHero(state).state;
  return { ...debugSetLevels(state, 12).state, clears: { frostfang: 1 } };
};

describe("Free Roam, the mode", () => {
  test("an endless region that opens with the Dead March, once Frostfang is cleared", () => {
    const roam = getRegion("roam");
    expect(roam.endless).toBe(true);
    expect(roam.endlessKind).toBe("roam");
    expect(regionOpen({ ...ready(), clears: {} }, roam)).toBe(false);
    expect(regionOpen(ready(), roam)).toBe(true);
    expect(endlessRecordKey("roam")).toBe("roamBest");
  });

  test("a trip opens a road prompt with the first event; the fight rolls on from scenario to scenario", () => {
    const state = ready();
    const ids = state.heroes.map((hero) => hero.identity.id);
    const started = startExpedition(state, "roam", ids, 1000, seededRandom(4));
    expect(started.ok).toBe(true);
    const run = started.state.expedition;
    expect(run.pending.kind).toBe("rift");
    expect(run.pending.roam).toBe(true);
    expect(run.pending.wave.event).toMatch(/attacks\.$/);
    expect(run.feed.some((line) => /no road in mind/.test(line.text))).toBe(true);
    const party = currentEncounterParty(started.state);
    for (const hero of party) hero.combat.hp = 1e7;
    const { result, engine } = simulateEncounter(party, run.pending.wave, {
      regionTier: 2, endless: true, endlessKind: "roam", rng: seededRandom(5), shouldReturn: (e) => e.wavesCleared >= 5,
    });
    expect(result.victory).toBe(true);
    expect(engine.wavesCleared).toBeGreaterThanOrEqual(5);
    expect(engine.wave.scenario).toBeTruthy();
  });

  test("results: 12 gold a fight, a chest every 5, and its own best on record", () => {
    const state = ready();
    const ids = state.heroes.map((hero) => hero.identity.id);
    const started = startExpedition(state, "roam", ids, 1000, () => 0.5).state;
    const party = currentEncounterParty(started);
    const next = resolveEncounter(started, { victory: true, party, xpGains: {}, gold: 0, items: [], wavesCleared: 10 }, 2000, { rng: () => 0.5 }).state;
    expect(next.records.roamBest).toBe(10);
    expect(next.records.marchBest || 0).toBe(0);
    expect(next.records.riftBest || 0).toBe(0);
    expect(next.lastReport.loot.gold).toBeGreaterThanOrEqual(ROAM.bounty * 10 + 2 * ROAM.chestGold[0]);
    expect(next.lastReport.loot.items).toHaveLength(2);
    expect(next.lastReport.log.some((line) => /Back from the road after 10 fights/.test(line))).toBe(true);
  });

  test("test mode starts Free Roam at any wave", () => {
    const result = debugTestEndless(ready(), "roam", 5, { now: 1000, rng: seededRandom(2) });
    expect(result.ok).toBe(true);
    const pending = result.state.expedition.pending;
    expect(pending.roam).toBe(true);
    expect(pending.startWave).toBe(5);
    expect(pending.wave.bigEvent).toBe(true);
    expect(debugTestEndless({ ...ready(), clears: {} }, "roam", 1).reason).toBe("previous_region");
  });
});

describe("Free Roam swaps between waves", () => {
  const roamFight = () => {
    let state = { ...createGuild(), gold: 1e6 };
    state = recruitHero(state).state;
    state = recruitHero(state).state;
    state = { ...debugSetLevels(state, 12).state, clears: { frostfang: 1 } };
    const ids = state.heroes.slice(0, 4).map((hero) => hero.identity.id);
    state = startExpedition(state, "roam", ids, 1000, seededRandom(4)).state;
    const party = currentEncounterParty(state);
    const wave = state.expedition.pending.wave;
    const sim = createEncounterSim(party, 2, wave, { rng: seededRandom(6) });
    let result = null;
    const engine = new Engine({ getContext: () => null }, sim, structuredClone(wave), {
      onEnd: (outcome) => { result = outcome; }, nextWave: endlessWaveSource(sim, sim.rng, "roam"),
    });
    engine.godMode = true;
    return { state, engine, sim, result: () => result };
  };
  // Clear the field and step until the next wave has begun.
  const nextWave = (engine) => {
    const wave = engine.wavesCleared;
    for (let frame = 0; frame < 30 * 60 && engine.wavesCleared === wave; frame += 1) {
      engine.debugCheat("kill");
      engine.spawnQueue = [];
      engine.update(1 / 30);
    }
  };

  test("the hero sent back leaves when the next wave starts; the one called joins the wave after", () => {
    const { state, engine, sim } = roamFight();
    const bench = benchHeroes(state, 2000);
    expect(bench.map((hero) => hero.identity.id)).toEqual([state.heroes[4].identity.id]);
    const out = engine.heroes[1];
    expect(engine.requestSwap(1, bench[0]).ok).toBe(true);
    expect(engine.requestSwap(1, bench[0]).ok).toBe(false);
    expect(out.away).toBeFalsy();
    nextWave(engine);
    expect(out.away).toBe(true);
    expect(out.alive).toBe(false);
    expect(engine.heroes).toHaveLength(4);
    expect(engine.pets.some((pet) => pet.owner === out)).toBe(false);
    nextWave(engine);
    expect(engine.heroes).toHaveLength(5);
    const joined = engine.heroes[4];
    expect(joined.model.identity.id).toBe(bench[0].identity.id);
    expect(joined.alive).toBe(true);
    expect(joined.x).toBe(out.home.x);
    expect(sim.heroes).toHaveLength(5);
    engine.returnHome();
  });

  test("someone has to stay on the field", () => {
    const { state, engine } = roamFight();
    const bench = benchHeroes(state, 2000);
    for (const index of [0, 2, 3]) engine.heroes[index].alive = false;
    expect(engine.requestSwap(1, bench[0])).toEqual({ ok: false, reason: "last_hero" });
  });

  test("after the fight the trip's party is who was there at the end", () => {
    const { state, engine, result } = roamFight();
    const bench = benchHeroes(state, 2000);
    const leaving = engine.heroes[1].model.identity.id;
    engine.requestSwap(1, bench[0]);
    nextWave(engine);
    nextWave(engine);
    // A wave fought with the newcomer on the field.
    for (let frame = 0; frame < 30 * 60 && !(engine.xpGains.heroes[4] > 0); frame += 1) engine.update(1 / 30);
    engine.returnHome();
    const outcome = buildFightOutcome(result(), engine.sim);
    expect(outcome.swaps).toEqual({ left: [leaving], joined: [bench[0].identity.id] });
    const fighting = { ...state, expedition: { ...state.expedition, pending: { ...state.expedition.pending, engagedAt: 1500 } } };
    const next = resolveEncounter(fighting, outcome, 3000, { rng: () => 0.5 }).state;
    expect(next.lastReport.log.some((line) => /Back to camp: /.test(line))).toBe(true);
    expect(next.lastReport.log.some((line) => /Joined on the road: /.test(line))).toBe(true);
    // The hero who joined learned from the fight.
    const before = state.heroes.find((hero) => hero.identity.id === bench[0].identity.id).progression.xp;
    expect(next.heroes.find((hero) => hero.identity.id === bench[0].identity.id).progression.xp).toBeGreaterThan(before);
  });

  test("an injured hero can't be called", () => {
    const { state } = roamFight();
    const hurt = { ...state, injuries: { [state.heroes[4].identity.id]: 99999 } };
    expect(benchHeroes(hurt, 2000)).toEqual([]);
  });
});
