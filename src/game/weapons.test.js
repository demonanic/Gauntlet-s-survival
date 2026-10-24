import { Engine } from "../combat/engine";
import { WEAPON_PROFILES } from "../combat/gear";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { createGearItem, heroCombatSummary } from "./items";
import { getRegion } from "./regions";

function heroWithWeapon(variant) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.guildBonus = { damage: 0, maxHp: 0 };
  if (variant) hero.equipment.weapon = createGearItem({ slot: "weapon", variant, rarity: "common", tier: 1 });
  else delete hero.equipment.weapon;
  return hero;
}

function engineWith(heroes) {
  return new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5), {});
}

function enemyAt(x, y) {
  return { id: 999, type: "goblin", name: "Goblin", tier: "basic", hp: 500, maxHp: 500, speed: 0, damage: 0, x, y, dmgBy: {}, atkCd: 99, affinities: {} };
}

describe("weapons decide how a hero fights", () => {
  test("swords are melee, bows and staves shoot from range, unarmed keeps the baseline", () => {
    const engine = engineWith(["sword", "bow", "staff", null].map(heroWithWeapon));
    const [sword, bow, staff, unarmed] = engine.heroes.map((hero) => hero.d);
    expect(sword).toMatchObject({ rangeMode: "melee", range: WEAPON_PROFILES.sword.range });
    expect(bow).toMatchObject({ rangeMode: "midline", range: 250 });
    expect(staff).toMatchObject({ rangeMode: "midline", range: 200 });
    expect(unarmed).toMatchObject({ rangeMode: "midline", range: 220 });
    // Common sword: (16 base + 5 attack) x 1.3 melee damage.
    expect(sword.damage).toBeCloseTo(21 * 1.3);
    expect(heroCombatSummary(heroWithWeapon("sword")).attack).toBe(Math.round(21 * 1.3));
  });

  test("a sword hero walks up to the enemy and hits it without a projectile", () => {
    const engine = engineWith([heroWithWeapon("sword")]);
    const hero = engine.heroes[0];
    engine.spawnQueue = [];
    const target = enemyAt(hero.x, hero.y - 150);
    engine.active = [target];
    for (let step = 0; step < 90 && target.hp === 500; step += 1) engine.update(1 / 30);
    expect(target.hp).toBeLessThan(500);
    expect(Math.hypot(target.x - hero.x, target.y - hero.y)).toBeLessThanOrEqual(WEAPON_PROFILES.sword.range);
    expect(engine.projectiles).toHaveLength(0);
  });

  test("a bow hero stays back and fires arrows", () => {
    const engine = engineWith([heroWithWeapon("bow")]);
    const hero = engine.heroes[0];
    engine.spawnQueue = [];
    const start = { x: hero.x, y: hero.y };
    engine.active = [enemyAt(hero.x, hero.y - 200)];
    engine.update(1 / 30);
    expect(engine.projectiles.some((shot) => shot.visualType === "arrow")).toBe(true);
    expect({ x: hero.x, y: hero.y }).toEqual(start);
  });
});
