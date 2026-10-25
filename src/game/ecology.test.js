import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { ECOLOGIES, SQUAD_LIMITS, constrainSquad, fillEcology, rolesOf } from "./ecology";
import { buildEndlessWave, buildWildEncounter, createEncounterSim } from "./encounters";
import { readFormation } from "./expedition";
import { createGuild, startExpedition } from "./guild";
import { createGearItem } from "./items";
import { REGIONS, getRegion } from "./regions";
import { parseGuild } from "./storage";

const STEP = 1 / 30;
const fixed = (value) => () => value;

function plainHero(weapon = "sword") {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.guildBonus = { damage: 0, maxHp: 0 };
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: weapon, rarity: "common", tier: 1 }) };
  hero.quickSlots = [{ key: "arrows", qty: 50 }, null];
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}

function arena(heroes) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, fixed(0.5)), {});
  engine.spawnQueue = [];
  engine.active = [];
  return engine;
}

const make = (type, x, y, extra = {}) => {
  const base = C.ENEMIES[type];
  return {
    id: `${type}${x}${y}`, type, name: base.name, tier: base.tier, hp: base.hp, maxHp: base.hp, speed: base.speed, damage: base.damage,
    color: base.color, x, y, dmgBy: {}, atkCd: 0, affinities: {}, families: [...(C.ENEMY_FAMILIES[type] || [])],
    ...(base.shield ? { shield: { ...base.shield } } : {}), ...extra,
  };
};
const think = (engine, unit, seconds) => {
  for (let t = 0; t < seconds; t += STEP) { engine.time += STEP; unit.atkCd -= STEP; engine._updateEnemy(unit, STEP); }
};
const hit = (engine, target, dmg = 100) => engine._applyClasslessHit({ target, heroIndex: 0, sourceId: "H0", dmg, damageCategory: "weapon", classless: true });

describe("the Bulwark", () => {
  test("plants itself between its ward and the hero closing in", () => {
    const engine = arena([plainHero()]);
    const h = engine.heroes[0];
    const priest = make("carrionPriest", h.x, h.y - 260, { atkCd: 99 });
    const bulwark = make("bulwark", h.x + 120, h.y - 300);
    engine.active = [priest, bulwark];
    think(engine, bulwark, 8);
    expect(bulwark.guarding).toBe(priest);
    // Now between the two, close to the priest, on the hero's side.
    expect(Math.abs(bulwark.x - h.x)).toBeLessThan(12);
    expect(bulwark.y).toBeGreaterThan(priest.y);
    expect(bulwark.y).toBeLessThan(h.y);
  });

  test("takes half of a shot aimed past it; a hero who gets around it is not blocked", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const engine = arena([plainHero("bow")]);
    const h = engine.heroes[0];
    const priest = make("carrionPriest", h.x, h.y - 150, { hp: 5000, maxHp: 5000 });
    const bulwark = make("bulwark", h.x, h.y - 110, { hp: 5000, maxHp: 5000 });
    engine.active = [priest, bulwark];
    hit(engine, priest);
    const covered = 5000 - priest.hp;
    // Half of it hits the shield instead.
    expect(5000 - bulwark.hp).toBeCloseTo(covered);

    // Step around to the side: the line is clear, only its guard aura remains.
    h.x += 150;
    priest.hp = 5000;
    hit(engine, priest);
    const flanked = 5000 - priest.hp;
    expect(flanked).toBeGreaterThan(covered * 1.5);
    // And far from the Bulwark there is no guard at all.
    bulwark.x += 200;
    priest.hp = 5000;
    hit(engine, priest);
    expect(5000 - priest.hp).toBeCloseTo(flanked / 0.9);
    random.mockRestore();
  });

  test("arrows glance off the shield; spells get around it", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const damageFrom = (weapon) => {
      const engine = arena([plainHero(weapon)]);
      const bulwark = make("bulwark", engine.heroes[0].x, engine.heroes[0].y - 30, { hp: 5000, maxHp: 5000 });
      engine.active = [bulwark];
      hit(engine, bulwark);
      return 5000 - bulwark.hp;
    };
    const [sword, bow, staff] = ["sword", "bow", "staff"].map(damageFrom);
    random.mockRestore();
    expect(bow).toBeCloseTo(sword * C.ENEMIES.bulwark.shield.bow);
    expect(bow).toBeLessThan(sword);
    expect(staff).toBeCloseTo(sword * C.ENEMIES.bulwark.shield.staff);
    expect(staff).toBeGreaterThan(sword);
  });
});

describe("enemies read the battlefield", () => {
  test("Sappers keep to a Bulwark's shadow, then sprint once they're close", () => {
    const engine = arena([plainHero()]);
    const h = engine.heroes[0];
    const bulwark = make("bulwark", h.x, h.y - 300, { atkCd: 99 });
    const sapper = make("gnome", h.x + 80, h.y - 340, { bomber: true });
    engine.active = [bulwark, sapper];
    think(engine, sapper, 3);
    // Behind the shield, not out in front of it.
    expect(Math.abs(sapper.x - h.x)).toBeLessThan(8);
    expect(sapper.y).toBeLessThan(bulwark.y);
    // The Bulwark reaches the heroes: the sapper breaks cover and lights up.
    bulwark.y = h.y - 60;
    think(engine, sapper, 7);
    expect(sapper.fuseAt != null || !!sapper.detonated).toBe(true);
  });

  test("a Harrier skirmishes the nearest hero until someone is hurt, then hunts them", () => {
    const engine = arena([plainHero(), plainHero()]);
    const [near, far] = engine.heroes;
    far.x = near.x + 260;
    const harrier = make("harrier", near.x + 20, near.y - 150, { atkCd: 99 });
    engine.active = [harrier];
    think(engine, harrier, 0.5);
    expect(Math.hypot(harrier.x - near.x, harrier.y - near.y)).toBeLessThan(Math.hypot(harrier.x - far.x, harrier.y - far.y));
    far.ref.hp = far.d.maxHp * 0.5;
    const before = Math.hypot(harrier.x - far.x, harrier.y - far.y);
    think(engine, harrier, 1);
    expect(Math.hypot(harrier.x - far.x, harrier.y - far.y)).toBeLessThan(before);
  });

  test("a Watcher marks the hero its squad is best placed to punish", () => {
    const engine = arena([plainHero(), plainHero()]);
    const [alone, crowded] = engine.heroes;
    crowded.x = alone.x + 200;
    const watcher = make("watcher", (alone.x + crowded.x) / 2, alone.y - 210);
    engine.active = [watcher, make("orc", crowded.x, crowded.y - 40, { atkCd: 99 }), make("goblin", crowded.x + 30, crowded.y - 30, { atkCd: 99 })];
    think(engine, watcher, STEP);
    expect(crowded.exposedUntil).toBeGreaterThan(engine.time);
    expect(alone.exposedUntil || 0).toBeLessThanOrEqual(engine.time);
  });
});

describe("composition", () => {
  test("templates are built from real enemies and fill plain slots from the region", () => {
    const boneyard = getRegion("boneyard");
    const squad = fillEcology("deathCult", boneyard.wildlife.pool, fixed(0.1));
    expect(squad.slice(0, 2)).toEqual(["bulwark", "carrionPriest"]);
    expect(squad.slice(2).every((key) => rolesOf(key).includes("frontline"))).toBe(true);
    for (const template of Object.values(ECOLOGIES)) {
      for (const slot of template.slots) expect(slot === "fodder" || slot === "frontline" || C.ENEMIES[slot]).toBeTruthy();
    }
    for (const region of REGIONS) {
      for (const key of Object.keys(region.wildlife?.ecology?.templates || {})) expect(ECOLOGIES[key]).toBeTruthy();
    }
  });

  test("regions field their formations, labelled on the wave", () => {
    const seen = new Set();
    for (let i = 0; i < 300; i += 1) {
      const wave = buildWildEncounter(getRegion("frostfang"), 0.5);
      if (wave.ecology) seen.add(wave.ecology);
    }
    expect([...seen].sort()).toEqual(["huntPack", "killTeam"]);
    // The Gutter teaches the basics: never a formation.
    for (let i = 0; i < 100; i += 1) expect(buildWildEncounter(getRegion("gutter"), 0.5).ecology).toBeUndefined();
  });

  test("anti-frustration limits hold for every squad", () => {
    expect(constrainSquad(["bulwark", "bulwark", "gnome", "gnome", "gnome"], { skeleton: 1 })).toEqual(["bulwark", "skeleton", "gnome", "gnome", "skeleton"]);
    expect(constrainSquad(["carrionPriest", "lesserNecromancer"], { orc: 1 })).toEqual(["carrionPriest", "orc"]);
    const waves = [
      ...REGIONS.filter((region) => region.wildlife).flatMap((region) => Array.from({ length: 300 }, () => buildWildEncounter(region, Math.random()))),
      ...Array.from({ length: 40 }, (_, index) => buildEndlessWave(index + 1)),
    ];
    for (const wave of waves) {
      const types = {};
      const roles = {};
      for (const enemy of wave.enemies) {
        types[enemy.type] = (types[enemy.type] || 0) + 1;
        for (const role of rolesOf(enemy.type)) roles[role] = (roles[role] || 0) + 1;
      }
      for (const [type, max] of Object.entries(SQUAD_LIMITS.types)) expect(types[type] || 0).toBeLessThanOrEqual(max);
      for (const [role, max] of Object.entries(SQUAD_LIMITS.roles)) expect(roles[role] || 0).toBeLessThanOrEqual(max);
      expect(wave.enemies.some((enemy) => !rolesOf(enemy.type).every((role) => role === "support" || role === "wildcard"))).toBe(true);
    }
  });

  test("a formation is read by its signs at first, by name once the guild knows it", () => {
    let state = createGuild();
    state.heroes[0].progression.level = 4;
    state = startExpedition(state, "frostfang", [state.heroes[0].identity.id], 0).state;
    const wave = buildWildEncounter(getRegion("frostfang"), 0, fixed(0.01));
    expect(wave.ecology).toBe("huntPack");
    expect(wave.enemies.map((enemy) => enemy.type)).toEqual(["watcher", "harrier", "harrier"]);
    expect(readFormation(state, wave)).toEqual({ formation: "huntPack", formationKnown: false });
    expect(readFormation(state, wave).formationKnown).toBe(true);
    expect(parseGuild(JSON.parse(JSON.stringify(state))).ecologySeen).toEqual({ huntPack: 2 });
    // A veteran recognises a formation the guild has never met.
    state.heroes[0].progression.level = 8;
    expect(readFormation(state, { ...wave, ecology: "killTeam" }).formationKnown).toBe(true);
    expect(readFormation(state, { enemies: [] })).toEqual({});
  });
});
