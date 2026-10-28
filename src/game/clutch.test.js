import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { getCanonicalNode, purchaseNode } from "../combat/classlessProgression";
import * as C from "../combat/config";
import { CLUTCH, Engine } from "../combat/engine";
import { CONSUMABLES } from "../combat/gear";
import { LUCK } from "../combat/luck";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild, currentEncounterParty, resolveEncounter, startExpedition } from "./guild";
import { createGearItem } from "./items";
import { getRegion } from "./regions";

const STEP = 1 / 30;

function clutchHero({ perk = true, traits = [], quickSlots = [null, null], luck = 0 } = {}) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = traits;
  hero.guildBonus = { damage: 0, maxHp: 0 };
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "sword", rarity: "common", tier: 1 }) };
  hero.quickSlots = quickSlots;
  hero.combat.stats.luck = luck;
  hero.progression.ownedNodeIds = perk ? ["F1", "F2a"] : ["F1"];
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}

function engineWith(hero, callbacks = {}) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim([hero], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), callbacks);
  engine.spawnQueue = [];
  engine.active = [];
  return engine;
}

function foe(type = "orc", extra = {}) {
  const base = C.ENEMIES[type];
  return { id: type, type, name: base.name, tier: base.tier, hp: 500, maxHp: 500, speed: 0, damage: 0, color: base.color,
    boss: !!base.boss, x: 400, y: 100, dmgBy: {}, atkCd: 99, affinities: {}, families: [], ...extra };
}

// Hit the hero so the same hit again would finish them.
function bringToTheBrink(engine) {
  const hero = engine.heroes[0];
  const hit = hero.ref.hp * 0.6;
  engine._resolveClasslessHeroDamage(hero, hit);
  return hero;
}

describe("the Clutch perk", () => {
  test("is a tier 2 Fortune perk after Lucky Edge, and leads on to Jackpot", () => {
    expect(getCanonicalNode("F2a")).toMatchObject({ branch: "Fortune", name: "Clutch", tier: 2, apCost: 2, minLevel: 5, prerequisites: ["F1"] });
    expect(purchaseNode({ level: 5, ap: 2, ownedNodeIds: ["F1"] }, "F2a").ok).toBe(true);
    expect(purchaseNode({ level: 4, ap: 2, ownedNodeIds: ["F1"] }, "F2a")).toMatchObject({ ok: false, reason: "level_required" });
    expect(purchaseNode({ level: 10, ap: 3, ownedNodeIds: ["F1", "F2a"] }, "F3").ok).toBe(true);
  });

  test("one hit from falling, a hero without anyone watching drinks: a second wind with no healing item", () => {
    const engine = engineWith(clutchHero());
    const hero = bringToTheBrink(engine);
    expect(hero.ref.hp).toBeCloseTo(hero.d.maxHp * 0.4 + hero.d.maxHp * CLUTCH.secondWind);
    expect(engine.clutches).toEqual([{ hero: 0, choice: "drink", landed: true }]);
    // Once per fight.
    engine._resolveClasslessHeroDamage(hero, hero.ref.hp * 0.6);
    expect(engine.clutches).toHaveLength(1);
  });

  test("Drink uses the best healing item in the quick slots", () => {
    const engine = engineWith(clutchHero({ quickSlots: [{ key: "bandage", qty: 2 }, { key: "potion", qty: 1 }] }));
    const hero = bringToTheBrink(engine);
    expect(hero.model.quickSlots[1].qty).toBe(0);
    expect(hero.model.quickSlots[0].qty).toBe(2);
    expect(hero.ref.hp).toBeCloseTo(Math.min(hero.d.maxHp, hero.d.maxHp * (0.4 + CONSUMABLES.potion.heal)));
  });

  test("a Reckless hero gambles: a landed Ultra Crit kills the target outright, and takes a share off a boss", () => {
    const roll = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      let engine = engineWith(clutchHero({ traits: ["reckless"] }));
      const target = foe();
      engine.active = [target];
      bringToTheBrink(engine);
      expect(target.hp).toBe(0);
      expect(engine.clutches).toEqual([{ hero: 0, choice: "crit", landed: true }]);

      engine = engineWith(clutchHero({ traits: ["reckless"] }));
      const boss = foe("lieutenant", { hp: 4000, maxHp: 4000, boss: true });
      engine.active = [boss];
      bringToTheBrink(engine);
      expect(boss.hp).toBe(4000 * (1 - CLUTCH.bossDamage));
    } finally {
      roll.mockRestore();
    }
  });

  test("a missed Ultra Crit does nothing more; Luck raises the odds", () => {
    const roll = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      const engine = engineWith(clutchHero({ traits: ["berserker"] }));
      const target = foe();
      engine.active = [target];
      const hero = bringToTheBrink(engine);
      expect(target.hp).toBe(500);
      expect(hero.ref.hp).toBeCloseTo(hero.d.maxHp * 0.4);
      expect(engine.clutches[0]).toEqual({ hero: 0, choice: "crit", landed: false });
    } finally {
      roll.mockRestore();
    }
    const lucky = engineWith(clutchHero({ luck: 20 }));
    expect(lucky.clutchCritChance(lucky.heroes[0])).toBeCloseTo(CLUTCH.critChance + 20 * LUCK.perPoint.clutchChance);
  });

  test("heroes without the perk never get a Clutch moment", () => {
    const engine = engineWith(clutchHero({ perk: false }));
    const hero = bringToTheBrink(engine);
    expect(engine.clutches).toEqual([]);
    expect(hero.ref.hp).toBeCloseTo(hero.d.maxHp * 0.4);
  });

  test("in a live battle the fight slows down for the choice, and the hero's nature decides on timeout", () => {
    const seen = [];
    const engine = engineWith(clutchHero(), { onClutch: (info) => seen.push(info) });
    engine.active = [foe()];
    const hero = bringToTheBrink(engine);
    expect(seen[0]).toMatchObject({ heroIndex: 0, auto: "drink", drink: "Second wind", critChance: CLUTCH.critChance });
    const before = engine.time;
    engine.update(1);
    expect(engine.time - before).toBeCloseTo(CLUTCH.slowMotion);
    for (let t = 0; t < CLUTCH.seconds; t += STEP) engine.update(STEP);
    expect(seen.at(-1)).toBeNull();
    expect(engine.clutch).toBeNull();
    expect(engine.clutches).toEqual([{ hero: 0, choice: "drink", landed: true }]);
    expect(hero.ref.hp).toBeGreaterThan(hero.d.maxHp * 0.4);
  });

  test("the player's pick wins over the hero's nature", () => {
    const roll = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const engine = engineWith(clutchHero(), { onClutch: () => {} });
      const target = foe();
      engine.active = [target];
      bringToTheBrink(engine);
      expect(engine.resolveClutch("crit")).toBe(true);
      expect(target.hp).toBe(0);
      expect(engine.clutches).toEqual([{ hero: 0, choice: "crit", landed: true }]);
    } finally {
      roll.mockRestore();
    }
  });

  test("the trip's feed tells the story", () => {
    const state = createGuild();
    const ids = state.heroes.map((hero) => hero.identity.id).slice(0, 3);
    let run = startExpedition(state, "gutter", ids, 1_000_000, () => 0.5).state;
    run.expedition.pending = { kind: "ambush", wave: buildWildEncounter(getRegion("gutter"), 0, () => 0.5), label: "x", at: 1_000_000, promptAt: 1_000_000, engagedAt: 1_000_000 };
    const party = structuredClone(currentEncounterParty(run));
    run = resolveEncounter(run, { victory: true, party, xpGains: {}, gold: 0, items: [], clutches: [{ hero: 1, choice: "crit", landed: true }] }, 1_060_000).state;
    expect(run.expedition.feed.some((line) => line.text === `CLUTCH! One hit from falling, ${party[1].identity.name} lands an Ultra Crit!`)).toBe(true);
  });
});
