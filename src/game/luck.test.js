import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { allocateClasslessStat } from "../combat/classlessProgression";
import { Engine } from "../combat/engine";
import { LUCK, describeLuck, effectiveLuck, luckEffects, partyLuck } from "../combat/luck";
import { DEFENSE_PER_POINT, normalizeClasslessHero } from "../combat/heroModel";
import { partyRoadEffects } from "../combat/traits";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { createGearItem, heroCombatSummary, rollLoot } from "./items";
import { getRegion } from "./regions";

function plainHero(luck = 0) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.guildBonus = { damage: 0, maxHp: 0 };
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "sword", rarity: "common", tier: 1 }) };
  hero.combat.stats.luck = luck;
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}

const derived = (hero) => new Engine({ getContext: () => null }, createEncounterSim([hero], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5), {}).heroes[0].d;

describe("luck", () => {
  test("new heroes start with none, old saves gain it at zero, and stat points buy it", () => {
    const hero = createGuild().heroes[0];
    expect(hero.combat.stats.luck).toBe(0);
    const old = structuredClone(hero);
    delete old.combat.stats.luck;
    expect(normalizeClasslessHero(old).combat.stats.luck).toBe(0);
    const bought = allocateClasslessStat({ ...hero, progression: { ...hero.progression, sp: 1 } }, "luck");
    expect(bought.ok).toBe(true);
    expect(bought.hero.combat.stats.luck).toBe(1);
    expect(bought.hero.progression.sp).toBe(0);
  });

  test("points past the soft cap count half", () => {
    expect(effectiveLuck(10)).toBe(10);
    expect(effectiveLuck(LUCK.softCap + 10)).toBe(LUCK.softCap + 5);
    expect(luckEffects(1000).merchantDiscount).toBe(LUCK.maxMerchantDiscount);
    expect(describeLuck(10)).toContain("+2% crit chance");
  });

  test("in battle it adds crit chance and dodge, never past their caps, and no damage", () => {
    const [plain, lucky, absurd] = [plainHero(0), plainHero(20), plainHero(10_000)].map(derived);
    expect(lucky.critChance).toBeCloseTo(plain.critChance + 20 * LUCK.perPoint.critChance);
    expect(lucky.dodge).toBeCloseTo(plain.dodge + 20 * LUCK.perPoint.dodge);
    expect(lucky.damage).toBe(plain.damage);
    expect(lucky.maxHp).toBe(plain.maxHp);
    expect(absurd.critChance).toBeLessThanOrEqual(0.5);
    expect(absurd.dodge).toBeLessThanOrEqual(0.35);
  });

  test("road odds and merchant prices follow the party's average luck", () => {
    expect(partyLuck([plainHero(20), plainHero(0)])).toBe(10);
    const plainRoad = partyRoadEffects([plainHero(0), plainHero(0)]);
    const luckyRoad = partyRoadEffects([plainHero(20), plainHero(0)]);
    for (const stat of ["gambleLuck", "findChance", "rareChance", "merchantDiscount"]) {
      expect((luckyRoad[stat] || 0) - (plainRoad[stat] || 0)).toBeCloseTo(luckEffects(10)[stat]);
    }
  });

  test("luck makes better gear drops likelier", () => {
    const share = (luck) => {
      let better = 0;
      let drops = 0;
      for (let i = 0; i < 4000; i += 1) {
        const item = rollLoot({ tier: "elite" }, 1, Math.random, { luck });
        if (item?.kind !== "gear") continue;
        drops += 1;
        if (item.rarity !== "common") better += 1;
      }
      return better / drops;
    };
    expect(share(1)).toBeGreaterThan(share(0) + 0.04);
  });
});

describe("stat points", () => {
  const withStat = (hero, stat, value) => ({ ...hero, combat: { ...hero.combat, stats: { ...hero.combat.stats, [stat]: value } } });

  test("a Defense point is worth about as much as an Attack point", () => {
    const hero = plainHero();
    const base = derived(hero);
    const tougher = derived(withStat(hero, "defense", hero.combat.stats.defense + 1));
    const stronger = derived(withStat(hero, "attack", hero.combat.stats.attack + 1));
    expect(tougher.defense - base.defense).toBe(DEFENSE_PER_POINT);
    const survival = (100 + tougher.defense) / (100 + base.defense) - 1;
    const damage = stronger.attack / base.attack - 1;
    expect(survival).toBeGreaterThan(damage * 0.5);
    expect(survival).toBeLessThan(damage * 2);
  });

  test("the hero summary matches what battle uses, Luck included", () => {
    const hero = withStat(withStat(plainHero(20), "defense", 13), "agility", 14);
    const summary = heroCombatSummary(hero);
    const battle = derived(hero);
    expect(summary.defense).toBe(battle.defense);
    expect(summary.dodge).toBeCloseTo(battle.dodge);
    expect(summary.critChance).toBeCloseTo(battle.critChance);
  });
});
