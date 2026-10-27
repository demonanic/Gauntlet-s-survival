import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { CONSUMABLES, FLETCHING, GEAR_SETS, GEAR_SLOTS, activeSetBonuses, heroGearStats } from "../combat/gear";
import { buildBossEncounter, buildWildEncounter, createEncounterSim } from "./encounters";
import { ENVIRONMENTS, combatEnvironment, heroResistance, rollEnvironmentEvent } from "./environment";
import { createGuild, currentEncounterParty, resolveEncounter, startExpedition } from "./guild";
import {
  AFFIXES, LEGENDARIES, createGearItem, fletchArrows, reforgeCost, reforgeGear, restockQuickSlots, rollLoot,
  salvageGear, salvageValue,
} from "./items";
import { REGIONS, getRegion } from "./regions";
import { withPendingFight } from "../test/expeditionFixtures";

const T0 = 1_000_000;
const STEP = 1 / 30;

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

function plainHero(weapon = "sword", quickSlots = [null, null]) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.guildBonus = { damage: 0, maxHp: 0 };
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: weapon, rarity: "common", tier: 1 }) };
  hero.quickSlots = quickSlots;
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}

function engineWith(heroes) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = [];
  return engine;
}

function enemy(type, x, y, extra = {}) {
  const base = C.ENEMIES[type];
  return {
    id: `${type}-${x}-${y}`, type, name: base.name, tier: base.tier, hp: base.hp, maxHp: base.hp, speed: base.speed,
    damage: base.damage, color: base.color, boss: !!base.boss, bomber: !!base.bomber, x, y, dmgBy: {}, atkCd: 0,
    affinities: {}, ...extra,
  };
}

const run = (engine, seconds) => { for (let t = 0; t < seconds; t += STEP) engine.update(STEP); };
// Drive one enemy's AI on its own, advancing the engine clock.
const think = (engine, unit, seconds = STEP) => {
  for (let t = 0; t < seconds; t += STEP) {
    engine.time += STEP;
    unit.atkCd -= STEP;
    engine._updateEnemy(unit, STEP);
  }
};

describe("arrows", () => {
  test("a bow spends an arrow every few shots and can't shoot without them", () => {
    const engine = engineWith([plainHero("bow", [{ key: "arrows", qty: 2 }, null])]);
    const hero = engine.heroes[0];
    const target = enemy("goblin", hero.x, hero.y - 200, { hp: 10_000, maxHp: 10_000, speed: 0, atkCd: 99 });
    engine.active = [target];
    run(engine, 2);
    expect(hero.model.quickSlots[0].qty).toBe(2); // the first shots reuse the same arrow
    run(engine, 20);
    expect(hero.model.quickSlots[0].qty).toBe(0);
    expect(hero.model.arrowsSpent.arrows).toBe(2);
    expect(engine.floaters.some((floater) => floater.text === "NO ARROWS") || hero.outOfArrows).toBe(true);
  });

  test("special arrows poison, burst and slow", () => {
    for (const [key, check] of [
      ["venomArrows", (target) => expect(target.dots?.length || target.hp < 10_000 - 20).toBeTruthy()],
      ["frostArrows", (target) => expect(target.slowUntil).toBeGreaterThan(0)],
    ]) {
      const engine = engineWith([plainHero("bow", [{ key, qty: 20 }, null])]);
      const hero = engine.heroes[0];
      const target = enemy("goblin", hero.x, hero.y - 200, { hp: 10_000, maxHp: 10_000, speed: 0, atkCd: 99 });
      engine.active = [target];
      run(engine, 1.2);
      check(target);
    }
    const engine = engineWith([plainHero("bow", [{ key: "flameArrows", qty: 20 }, null])]);
    const hero = engine.heroes[0];
    const target = enemy("goblin", hero.x, hero.y - 200, { hp: 10_000, maxHp: 10_000, speed: 0, atkCd: 99 });
    const bystander = enemy("goblin", hero.x + 20, hero.y - 205, { hp: 10_000, maxHp: 10_000, speed: 0, atkCd: 99 });
    engine.active = [target, bystander];
    run(engine, 1.2);
    expect(bystander.hp).toBeLessThan(10_000);
  });

  test("departure restocks quick slots and hands a bow hero arrows", () => {
    const state = createGuild();
    const archer = state.heroes.find((hero) => hero.equipment.weapon.weaponType === "bow");
    expect(archer.quickSlots.every((slot) => !slot)).toBe(true);
    const started = startExpedition(state, "gutter", [archer.identity.id], T0).state;
    const loaded = started.heroes.find((hero) => hero.identity.id === archer.identity.id);
    expect(loaded.quickSlots.find((slot) => slot?.key === "arrows").qty).toBe(CONSUMABLES.arrows.stackCap);
    expect(started.stash.arrows).toBe(state.stash.arrows - CONSUMABLES.arrows.stackCap);

    const broke = { ...createGuild(), stash: { arrows: 0 } };
    const bare = startExpedition(broke, "gutter", [broke.heroes[1].identity.id], T0).state;
    expect(bare.expedition.feed.some((entry) => /no arrows/.test(entry.text))).toBe(true);
  });

  test("emptied slots remember their item and refill from the stash", () => {
    const state = createGuild();
    state.heroes[0].quickSlots = [{ key: "bandage", qty: 0 }, null];
    restockQuickSlots(state, [state.heroes[0].identity.id]);
    expect(state.heroes[0].quickSlots[0]).toEqual({ key: "bandage", qty: 5 });
  });

  test("most of the plain arrows fired are picked up after a win", () => {
    let state = createGuild();
    const archer = state.heroes[1];
    state = startExpedition(state, "gutter", [archer.identity.id], T0).state;
    state = withPendingFight(state, T0 + 1000, "sighting");
    const party = currentEncounterParty(state);
    party[0].quickSlots = [{ key: "arrows", qty: 6 }, null];
    party[0].arrowsSpent = { arrows: 14 };
    const done = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 0, items: [] }, T0 + 2000).state;
    const hero = done.heroes.find((entry) => entry.identity.id === archer.identity.id);
    expect(hero.quickSlots[0]).toEqual({ key: "arrows", qty: 16 });
    expect(hero.arrowsSpent).toBeUndefined();
  });

  test("the Fletcher turns plain arrows into special ones", () => {
    const state = { ...createGuild(), gold: 100 };
    const made = fletchArrows(state, "flameArrows").state;
    expect(made.stash.arrows).toBe(state.stash.arrows - FLETCHING.batch);
    expect(made.stash.flameArrows).toBe(FLETCHING.batch);
    expect(made.gold).toBe(100 - FLETCHING.recipes.flameArrows);
    expect(fletchArrows({ ...state, stash: { arrows: 3 } }, "venomArrows").reason).toBe("not_enough_arrows");
  });
});

describe("new enemies", () => {
  test("a gnome sapper lights its fuse next to a hero and blows up", () => {
    const engine = engineWith([plainHero("sword"), plainHero("sword")]);
    const [a, b] = engine.heroes;
    b.x = a.x + 30;
    const gnome = enemy("gnome", a.x, a.y - 80);
    engine.active = [gnome];
    for (const hero of engine.heroes) hero.protect = 99; // heroes stand still
    const before = [a.ref.hp, b.ref.hp];
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99); // nobody dodges
    run(engine, 2.5);
    random.mockRestore();
    expect(gnome.detonated).toBe(true);
    expect(a.ref.hp).toBeLessThan(before[0]);
    expect(b.ref.hp).toBeLessThan(before[1]);
    expect(engine.sim.kills.total).toBe(0); // blowing itself up earns nothing
  });

  test("a sapper killed before it reaches the party still goes off", () => {
    const engine = engineWith([plainHero("sword")]);
    const gnome = enemy("gnome", 100, 100, { hp: 1 });
    engine.active = [gnome];
    engine._killEnemy(gnome, "H0");
    expect(gnome.detonated).toBe(true);
  });

  test("bandits blitz the weakest hero", () => {
    const engine = engineWith([plainHero("sword"), plainHero("sword")]);
    const [healthy, hurt] = engine.heroes;
    hurt.x = healthy.x + 160;
    hurt.ref.hp = 50;
    const bandit = enemy("bandit", healthy.x, healthy.y - 150);
    engine.active = [bandit];
    think(engine, bandit, 0.6);
    const towardHurt = Math.hypot(bandit.x - hurt.x, bandit.y - hurt.y);
    expect(towardHurt).toBeLessThan(Math.hypot(healthy.x + 160 - healthy.x, 150));
  });

  test("dark elf snipers aim at ranged heroes, then fire one heavy shot", () => {
    const engine = engineWith([plainHero("sword"), plainHero("bow", [{ key: "arrows", qty: 20 }, null])]);
    const archer = engine.heroes[1];
    const elf = enemy("darkElf", archer.x, archer.y - 300);
    engine.active = [elf];
    think(engine, elf);
    expect(elf.aimTarget).toBe(archer);
    expect(engine.projectiles).toHaveLength(0);
    think(engine, elf, 1);
    const shot = engine.projectiles.find((projectile) => projectile.kind === "enemyBolt");
    expect(shot.dmg).toBeCloseTo(elf.damage * 2);
    expect(shot.target.obj).toBe(archer);
  });

  test("a lesser necromancer heals the wounded and raises one fallen ally", () => {
    const engine = engineWith([plainHero("sword")]);
    const hero = engine.heroes[0];
    const necro = enemy("lesserNecromancer", hero.x, hero.y - 200, { healCd: 0, raiseCd: 0 });
    const wounded = enemy("skeleton", hero.x + 40, hero.y - 210, { hp: 10, maxHp: 70, speed: 0, atkCd: 99 });
    const dead = enemy("orc", hero.x - 40, hero.y - 210);
    engine.active = [necro, wounded, dead];
    engine._killEnemy(dead, "H0");
    engine.active = engine.active.filter((entry) => entry.hp > 0);
    think(engine, necro);
    expect(wounded.hp).toBeGreaterThan(10);
    think(engine, necro, 2);
    const risen = engine.active.find((entry) => entry.raised);
    expect(risen).toMatchObject({ type: "orc", hp: Math.round(dead.maxHp * 0.5) });
    engine._killEnemy(risen, "H0");
    expect(engine.fallen.some((corpse) => corpse.enemy === risen)).toBe(false);
  });

  test("the new regions end with their own bosses", () => {
    expect(buildBossEncounter(getRegion("frostfang")).enemies[0].type).toBe("banditWarlord");
    expect(buildBossEncounter(getRegion("blightmire")).enemies[0].type).toBe("bogLich");
    for (const region of REGIONS.filter((entry) => entry.wildlife)) {
      for (const key of Object.keys(region.wildlife.pool)) expect(C.ENEMIES[key]).toBeDefined();
    }
  });
});

describe("environments", () => {
  test("resistance scales the effect down to nothing", () => {
    const hero = plainHero();
    const cold = ENVIRONMENTS.cold;
    expect(combatEnvironment(hero, cold)).toMatchObject({ attackSlow: 0.25, moveSlow: 0.15 });
    expect(combatEnvironment(hero, cold, true).attackSlow).toBeCloseTo(0.125);
    hero.equipment.chest = createGearItem({ legendary: "heartOfTheMountain", tier: 1 });
    expect(heroResistance(hero, cold)).toBe(1);
    expect(combatEnvironment(hero, cold)).toBeNull();
  });

  test("environment events on the road hurt only unprotected heroes", () => {
    const exposed = plainHero();
    const warded = plainHero();
    warded.identity = { ...warded.identity, id: "warded", name: "Warded" };
    warded.equipment.chest = createGearItem({ legendary: "heartOfTheMountain", tier: 1 });
    warded.combat.hp = classlessMaxHp(warded);
    const event = rollEnvironmentEvent(ENVIRONMENTS.heat, [exposed, warded], [], () => 0.1);
    expect(event.hurt).toEqual([exposed.identity.name]);
    expect(warded.combat.hp).toBe(classlessMaxHp(warded));
  });

  test("provisions are packed at departure and carried into battle", () => {
    const state = createGuild();
    state.heroes[0].progression.level = 6;
    state.stash.coolingSalve = 1;
    const started = startExpedition(state, "ashen", state.heroes.map((hero) => hero.identity.id), T0).state;
    expect(started.expedition.packed).toEqual([state.heroes[0].identity.id]);
    expect(started.stash.coolingSalve).toBe(0);
    const party = currentEncounterParty(started);
    expect(party[0].environment.dot).toBeCloseTo(ENVIRONMENTS.heat.combat.dot * 0.5);
    expect(party[1].environment.dot).toBeCloseTo(ENVIRONMENTS.heat.combat.dot);
  });

  test("heat burns heroes in battle but never knocks one out", () => {
    const hero = plainHero();
    hero.environment = combatEnvironment(hero, ENVIRONMENTS.heat);
    hero.combat.hp = 3;
    const engine = engineWith([hero]);
    run(engine, 10);
    expect(engine.heroes[0].ref.hp).toBe(1);
    expect(engine.heroes[0].alive).toBe(true);
  });

  test("darkness makes attacks miss", () => {
    const hero = plainHero("sword");
    hero.environment = { miss: 1 };
    const engine = engineWith([hero]);
    const target = enemy("goblin", engine.heroes[0].x, engine.heroes[0].y - 30, { hp: 500, maxHp: 500, speed: 0, atkCd: 99 });
    engine.active = [target];
    run(engine, 3);
    expect(target.hp).toBe(500);
  });
});

describe("deeper gear", () => {
  test("affixes scale with rarity and name the item", () => {
    const rng = seeded(3);
    for (const [rarity, count] of [["common", 0], ["uncommon", 1], ["rare", 2], ["epic", 3]]) {
      const item = createGearItem({ slot: "weapon", rarity, tier: 2 }, rng);
      expect(item.affixes).toHaveLength(count);
      for (const affix of item.affixes) expect(AFFIXES[affix.key].slots).toContain("weapon");
    }
    const rare = createGearItem({ slot: "chest", variant: "cuirass", rarity: "rare", tier: 1 }, seeded(8));
    const prefix = rare.affixes.find((affix) => AFFIXES[affix.key].kind === "prefix");
    const suffix = rare.affixes.find((affix) => AFFIXES[affix.key].kind === "suffix");
    expect(rare.name).toBe(`${AFFIXES[prefix.key].name} Cuirass ${AFFIXES[suffix.key].name}`);
    expect(createGearItem({ slot: "head", rarity: "common" }).name).toBe("Scrap Helm");
  });

  test("set pieces add bonuses at two and four pieces", () => {
    const hero = plainHero();
    const piece = (slot) => createGearItem({ slot, rarity: "rare", tier: 3, set: "frostwarden" }, seeded(slot.length));
    hero.equipment.head = piece("head");
    expect(activeSetBonuses(hero)).toEqual([]);
    hero.equipment.chest = piece("chest");
    expect(activeSetBonuses(hero).map((bonus) => bonus.pieces)).toEqual([2]);
    const two = heroGearStats(hero).coldResist;
    hero.equipment.legs = piece("legs");
    hero.equipment.arms = piece("arms");
    expect(activeSetBonuses(hero).map((bonus) => bonus.pieces)).toEqual([2, 4]);
    expect(heroGearStats(hero).chill).toBeGreaterThanOrEqual(GEAR_SETS.frostwarden.bonuses[4].chill);
    expect(two).toBeGreaterThanOrEqual(GEAR_SETS.frostwarden.bonuses[2].coldResist);
    expect(hero.equipment.head.name).toBe("Frostwarden Helm");
  });

  test("regions drop their set; bosses sometimes drop legendaries", () => {
    const rng = seeded(21);
    const drops = Array.from({ length: 400 }, () => rollLoot({ tier: "boss" }, 3, rng, { set: "frostwarden" }));
    expect(drops.some((item) => item?.set === "frostwarden")).toBe(true);
    expect(drops.some((item) => item?.rarity === "legendary" && LEGENDARIES[item.legendary])).toBe(true);
    expect(drops.filter((item) => item?.rarity === "legendary").length).toBeLessThan(80);
  });

  test("legendary powers: cleave, thorns, and rising again", () => {
    const blade = plainHero("sword");
    blade.equipment.weapon = createGearItem({ legendary: "dawnbreaker", tier: 1 });
    const engine = engineWith([blade]);
    const hero = engine.heroes[0];
    const first = enemy("goblin", hero.x, hero.y - 30, { hp: 5000, maxHp: 5000, speed: 0, atkCd: 99 });
    const second = enemy("goblin", hero.x + 25, hero.y - 40, { hp: 5000, maxHp: 5000, speed: 0, atkCd: 99 });
    engine.active = [first, second];
    run(engine, 2);
    expect(first.hp).toBeLessThan(5000);
    expect(second.hp).toBeLessThan(5000);

    const ringed = plainHero("sword");
    ringed.equipment.trinket = createGearItem({ legendary: "gravebinder", tier: 1 });
    const second_ = engineWith([ringed]);
    const bearer = second_.heroes[0];
    second_._resolveClasslessHeroDamage(bearer, bearer.ref.hp + 10);
    expect(bearer.alive).toBe(true);
    expect(bearer.ref.hp).toBe(Math.round(bearer.d.maxHp * 0.3));
    second_._resolveClasslessHeroDamage(bearer, bearer.ref.hp + 10);
    expect(bearer.alive).toBe(false);
  });

  test("salvage turns gear into essence for the reforge", () => {
    const item = createGearItem({ slot: "weapon", variant: "bow", rarity: "rare", tier: 2 }, seeded(5));
    let state = { ...createGuild(), gold: 1000, vault: [item] };
    const spare = createGearItem({ slot: "head", rarity: "epic", tier: 3 }, seeded(6));
    state = salvageGear({ ...state, vault: [...state.vault, spare] }, spare.id).state;
    expect(state.essence).toBe(salvageValue(spare));
    const cost = reforgeCost(item);
    state.essence = cost.essence;
    const reforged = reforgeGear(state, item.id, seeded(99)).state;
    expect(reforged.essence).toBe(0);
    expect(reforged.gold).toBe(1000 - cost.gold);
    expect(reforged.vault[0].affixes).toHaveLength(2);
    expect(reforged.vault[0].affixes).not.toEqual(item.affixes);
    expect(reforgeGear(reforged, item.id).reason).toBe("insufficient_essence");
    expect(reforgeCost(createGearItem({ legendary: "whisperwind" }))).toBeNull();
  });

  test("every legendary and set is a valid piece for its slot", () => {
    for (const key of Object.keys(LEGENDARIES)) {
      const item = createGearItem({ legendary: key, tier: 2 });
      expect(GEAR_SLOTS).toContain(item.slot);
      expect(item.rarity).toBe("legendary");
    }
    for (const set of Object.values(GEAR_SETS)) expect(getRegion(set.region)?.set).toBe(set.key);
  });
});
