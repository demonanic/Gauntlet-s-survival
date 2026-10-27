import { Engine } from "../combat/engine";
import { WEAPON_PROFILES } from "../combat/gear";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { createGearItem, heroCombatSummary } from "./items";
import { getRegion } from "./regions";
import { withoutArmor } from "../test/expeditionFixtures";

function heroWithWeapon(variant) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.guildBonus = { damage: 0, maxHp: 0 };
  withoutArmor(hero);
  if (variant) hero.equipment.weapon = createGearItem({ slot: "weapon", variant, rarity: "common", tier: 1 });
  else delete hero.equipment.weapon;
  hero.quickSlots = variant === "bow" ? [{ key: "arrows", qty: 20 }, null] : [null, null];
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

  test("a sword reaches a boss despite its bigger body, and can't shove it off the field", () => {
    const engine = engineWith([heroWithWeapon("sword")]);
    const hero = engine.heroes[0];
    engine.spawnQueue = [];
    const boss = { ...enemyAt(hero.x, 20), boss: true, tier: "boss", hp: 50_000, maxHp: 50_000 };
    engine.active = [boss];
    hero.y = 60;
    for (let step = 0; step < 300; step += 1) engine.update(1 / 30);
    expect(boss.hp).toBeLessThan(50_000);
    expect(boss.y).toBeGreaterThan(0);
  });

  test("the Bandit Warlord tops his gang up to three, never past it", () => {
    const engine = engineWith([heroWithWeapon("sword")]);
    engine.spawnQueue = [];
    const hero = engine.heroes[0];
    const warlord = { ...enemyAt(hero.x, 200), type: "banditWarlord", boss: true, tier: "boss", hp: 50_000, maxHp: 50_000, abilityCd: 0 };
    engine.active = [warlord];
    const bandits = () => engine.active.filter((enemy) => enemy.type === "bandit" && enemy.hp > 0).length;
    const call = () => { warlord.abilityCd = 0; engine._updateEnemy(warlord, 1 / 30); };
    call();
    expect(bandits()).toBe(2);
    call();
    expect(bandits()).toBe(3);
    call();
    expect(bandits()).toBe(3);
    for (const bandit of engine.active.filter((enemy) => enemy.type === "bandit").slice(0, 2)) bandit.hp = 0;
    call();
    expect(bandits()).toBe(3);
  });

  test("bosses lob bombs at heroes keeping their distance, not at those in melee", () => {
    const engine = engineWith([heroWithWeapon("sword"), heroWithWeapon("bow")]);
    const [sword, bow] = engine.heroes;
    engine.spawnQueue = [];
    const demon = { ...enemyAt(200, 300), type: "demon", boss: true, tier: "boss", hp: 50_000, maxHp: 50_000, abilityCd: 0, damage: 10 };
    engine.active = [demon];
    sword.x = 200; sword.y = 345;
    bow.x = 200; bow.y = 600;
    engine._updateEnemy(demon, 1 / 30);
    expect(engine.projectiles.find((shot) => shot.kind === "napalm").target).toBe(bow);
    engine.projectiles = [];
    bow.alive = false;
    demon.abilityCd = 0;
    engine._updateEnemy(demon, 1 / 30);
    expect(engine.projectiles.some((shot) => shot.kind === "napalm")).toBe(false);
  });

  test("a ranged hero backs away from an enemy closing in while reloading, and holds still otherwise", () => {
    const engine = engineWith([heroWithWeapon("bow")]);
    const hero = engine.heroes[0];
    engine.spawnQueue = [];
    hero.y = 400;
    const brute = enemyAt(hero.x, hero.y - 40);
    engine.active = [brute];
    engine.update(1 / 30);
    // It fired, then started stepping back during the reload.
    const afterShot = hero.y;
    for (let step = 0; step < 6; step += 1) engine.update(1 / 30);
    expect(hero.y).toBeGreaterThan(afterShot);
    // A distant enemy is no reason to move.
    brute.y = hero.y - 200;
    const before = { x: hero.x, y: hero.y };
    for (let step = 0; step < 20; step += 1) engine.update(1 / 30);
    expect({ x: hero.x, y: hero.y }).toEqual(before);
  });

  test("a sword hero doesn't kite; a hero under manual control isn't moved", () => {
    const engine = engineWith([heroWithWeapon("sword"), heroWithWeapon("bow")]);
    const [sword, bow] = engine.heroes;
    engine.spawnQueue = [];
    bow.manual = true;
    bow.x = 300; bow.y = 400;
    const start = { x: bow.x, y: bow.y };
    engine.active = [enemyAt(sword.x, sword.y - 30), enemyAt(bow.x, bow.y - 30)];
    for (let step = 0; step < 10; step += 1) engine.update(1 / 30);
    expect({ x: bow.x, y: bow.y }).toEqual(start);
    expect(engine._kite(bow, 1 / 30)).toBe(true);
  });

  test("heroes on auto step out from under a bomb about to land on them", () => {
    const engine = engineWith([heroWithWeapon("staff")]);
    const hero = engine.heroes[0];
    engine.spawnQueue = [];
    engine.active = [enemyAt(hero.x, 40)];
    hero.y = 500;
    const bomb = () => ({ kind: "napalm", x: hero.x, y: hero.y - 150, tx: hero.x + 10, ty: hero.y, spd: 250, splash: 60, dmg: 100, target: hero, t: 0 });
    const hp = hero.ref.hp;
    engine.projectiles = [bomb()];
    for (let step = 0; step < 30; step += 1) engine.update(1 / 30);
    expect(hero.ref.hp).toBe(hp);
    // Under manual control the hero stays where the player put it.
    hero.manual = true;
    engine.projectiles = [bomb()];
    for (let step = 0; step < 30; step += 1) engine.update(1 / 30);
    expect(hero.ref.hp).toBeLessThan(hp);
  });
});
