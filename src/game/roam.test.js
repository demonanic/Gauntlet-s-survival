import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { Engine } from "../combat/engine";
import { FACTIONS, HORDE, ROAM, buildRoamWave, createEncounterSim, endlessWave } from "./encounters";
import { createGuild } from "./guild";
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
