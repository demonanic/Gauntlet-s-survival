import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { Engine } from "../combat/engine";
import { buildBossEncounter, buildWildEncounter, createEncounterSim } from "./encounters";
import { choosePending, createGuild, currentEncounterParty, resolveEncounter, startExpedition } from "./guild";
import { createGearItem } from "./items";
import { CHAMPIONS, championFor, getRegion } from "./regions";
import { withPendingFight } from "../test/expeditionFixtures";

const T0 = 1_000_000;

function engineWithBoss(rank) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.equipment.weapon = createGearItem({ slot: "weapon", variant: "bow", rarity: "common", tier: 1 });
  hero.combat.hp = classlessMaxHp(hero);
  const engine = new Engine({ getContext: () => null }, createEncounterSim([hero], 4), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  const boss = buildBossEncounter(getRegion("ashen"), rank).enemies.find((enemy) => enemy.boss);
  Object.assign(boss, { x: 300, y: 120, dmgBy: {}, atkCd: 99 });
  engine.spawnQueue = [];
  engine.active = [boss];
  return { engine, boss, hero: engine.heroes[0] };
}

describe("Champion bosses", () => {
  test("every 5th rank is a Champion, rotating through the four mechanics", () => {
    expect([0, 1, 2, 3].map(championFor)).toEqual([null, null, null, null]);
    expect([4, 9, 14, 19, 24].map(championFor)).toEqual(["warded", "swarming", "frenzied", "vampiric", "warded"]);
    const wave = buildBossEncounter(getRegion("ashen"), 9);
    const boss = wave.enemies.find((enemy) => enemy.boss);
    expect(wave.champion).toBe("swarming");
    expect(boss).toMatchObject({ champion: "swarming" });
    expect(boss.name.startsWith(CHAMPIONS.swarming.name)).toBe(true);
    expect(buildBossEncounter(getRegion("ashen"), 8).champion).toBeUndefined();
    expect(buildBossEncounter(getRegion("boneyard")).champion).toBeUndefined();
  });

  test("Warded shields itself at 66% and 33% HP", () => {
    const { engine, boss } = engineWithBoss(4);
    boss.hp = boss.maxHp * 0.6;
    engine._championTick(boss, 1 / 30);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.75);
    engine._championTick(boss, 1 / 30);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.75);
    boss.hp = boss.maxHp * 0.3;
    engine._championTick(boss, 1 / 30);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.45);
    boss.hp = boss.maxHp * 0.1;
    engine._championTick(boss, 1 / 30);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.1);
  });

  test("Swarming calls skeletons, up to six alive", () => {
    const { engine, boss } = engineWithBoss(9);
    for (let t = 0; t < 30; t += 1) engine._championTick(boss, 1);
    expect(engine.active.filter((enemy) => enemy.summoned).length).toBe(6);
  });

  test("Frenzied speeds up and hits harder below half HP, once", () => {
    const { engine, boss } = engineWithBoss(14);
    const damage = boss.damage;
    engine._championTick(boss, 1 / 30);
    expect(boss.frenzied).toBeUndefined();
    boss.hp = boss.maxHp * 0.4;
    engine._championTick(boss, 1 / 30);
    engine._championTick(boss, 1 / 30);
    expect(boss.damage).toBeCloseTo(damage * 1.2);
    expect(boss.attackSpeed).toBeCloseTo(1.4);
  });

  test("Vampiric heals with every hit it lands", () => {
    const { engine, boss } = engineWithBoss(19);
    boss.hp = boss.maxHp * 0.5;
    engine._vampiric(boss);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.52);
    const plain = engineWithBoss(18).boss;
    plain.hp = plain.maxHp * 0.5;
    engine._vampiric(plain);
    expect(plain.hp).toBeCloseTo(plain.maxHp * 0.5);
  });

  test("beating a Champion pays double bounty and an extra crystal", () => {
    const clear = (rank) => {
      let state = { ...createGuild(), bossRank: rank };
      state.heroes[0].progression.level = 6;
      state = startExpedition(state, "ashen", [state.heroes[0].identity.id], T0).state;
      withPendingFight(state, T0 + 1000, "boss");
      const party = structuredClone(currentEncounterParty(state));
      const won = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 0, items: [] }, T0 + 2000).state;
      return choosePending(won, "home", T0 + 3000).state.lastReport;
    };
    const normal = clear(3);
    const champion = clear(4);
    expect(champion.loot.gold).toBe(Math.round(800 * 1.6) * 2);
    expect(normal.loot.gold).toBe(Math.round(800 * 1.45));
    expect(champion.loot.items.filter((item) => item.kind === "crystal").length).toBe(2);
    expect(champion.log.join(" ")).toMatch(/Champion is broken/);
  });
});
