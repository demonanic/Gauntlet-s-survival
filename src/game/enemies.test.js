// Enemy-definition coverage. An enemy is described across several tables
// (stats in C.ENEMIES, behavior families, squad roles, spawn sources, and the
// engine's behavior and sprite code). These tests make a missing or misspelt
// entry fail loudly instead of silently falling back to a default.
//
// Intentional defaults, checked as such below:
// - Bosses have no behavior families (C.ENEMY_FAMILIES) and no squad roles
//   (C.ENEMY_ROLES); rolesOf() reads them as "frontline".
// - Enemies without a special handler use the engine's generic enemy update,
//   and the generic body shape is the sprite fallback.
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { ECOLOGIES, FODDER, FRONTLINE, SQUAD_LIMITS, rolesOf } from "./ecology";
import { ENDLESS_POOLS, buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { BOSS_ROTATION, REGIONS } from "./regions";

const ENEMY_KEYS = Object.keys(C.ENEMIES);
const BOSSES = ENEMY_KEYS.filter((key) => C.ENEMIES[key].boss);
const NON_BOSSES = ENEMY_KEYS.filter((key) => !C.ENEMIES[key].boss);
const DAMAGE_TYPE_VALUES = new Set(Object.values(C.DAMAGE_TYPES));
const STEP = 1 / 30;

// Every list or table, outside C.ENEMIES itself, that names enemies a fight can contain.
function spawnSources() {
  const sources = {};
  for (const region of REGIONS) {
    if (region.wildlife?.pool) sources[`${region.id} wildlife`] = Object.keys(region.wildlife.pool);
    if (region.boss) sources[`${region.id} boss squad`] = region.boss;
    if (region.wildlife?.eliteChance > 0) sources[`${region.id} elite`] = ["lieutenant"];
  }
  sources["boss rotation"] = [...BOSS_ROTATION];
  sources["Endless Rift pools"] = ENDLESS_POOLS.flatMap((entry) => entry.enemies);
  sources["Endless Rift elite"] = ["lieutenant"];
  sources["ecology templates"] = Object.values(ECOLOGIES).flatMap((template) => template.slots)
    .filter((slot) => slot !== "fodder" && slot !== "frontline");
  sources["plain fodder"] = [...FODDER];
  sources["plain frontline"] = [...FRONTLINE];
  sources.stalker = ["stalker"];
  return sources;
}

describe("enemy stats (C.ENEMIES)", () => {
  test.each(ENEMY_KEYS)("%s has a complete, valid stat block", (key) => {
    const enemy = C.ENEMIES[key];
    expect(enemy.key).toBe(key);
    expect(typeof enemy.name).toBe("string");
    expect(enemy.name.length).toBeGreaterThan(0);
    expect(Object.keys(C.ENEMY_TIERS)).toContain(enemy.tier);
    expect(!!enemy.boss).toBe(enemy.tier === "boss");
    for (const stat of ["hp", "speed", "damage"]) {
      expect(Number.isFinite(enemy[stat]) && enemy[stat] > 0).toBe(true);
    }
    expect(enemy.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    for (const [damageType, level] of Object.entries(enemy.affinities || {})) {
      expect(DAMAGE_TYPE_VALUES.has(damageType)).toBe(true);
      expect(Object.keys(C.AFFINITY_MULTIPLIERS)).toContain(level);
    }
    for (const stat of ["attackRange", "splashRadius"]) {
      if (enemy[stat] != null) expect(enemy[stat]).toBeGreaterThan(0);
    }
    for (const multiplier of Object.values(enemy.shield || {})) expect(multiplier).toBeGreaterThan(0);
  });

  test("display names are unique", () => {
    const names = ENEMY_KEYS.map((key) => C.ENEMIES[key].name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("behavior families and squad roles", () => {
  test("every non-boss enemy declares its families and roles, even when it has none", () => {
    for (const key of NON_BOSSES) {
      expect(C.ENEMY_FAMILIES, key).toHaveProperty(key);
      expect(C.ENEMY_ROLES, key).toHaveProperty(key);
      expect(C.ENEMY_ROLES[key].length, key).toBeGreaterThan(0);
    }
  });

  test("bosses use the intended defaults: no families, read as frontline", () => {
    for (const key of BOSSES) {
      expect(C.ENEMY_FAMILIES[key], key).toBeUndefined();
      expect(C.ENEMY_ROLES[key], key).toBeUndefined();
      expect(rolesOf(key)).toEqual(["frontline"]);
    }
  });

  test("the tables only name real enemies, known families and known roles", () => {
    for (const [key, families] of Object.entries(C.ENEMY_FAMILIES)) {
      expect(C.ENEMIES, `family table: ${key}`).toHaveProperty(key);
      for (const family of families) expect(C.FAMILY_LABELS, `${key}: ${family}`).toHaveProperty(family);
    }
    for (const [key, roles] of Object.entries(C.ENEMY_ROLES)) {
      expect(C.ENEMIES, `role table: ${key}`).toHaveProperty(key);
      for (const role of roles) expect(C.ROLE_LABELS, `${key}: ${role}`).toHaveProperty(role);
    }
    for (const role of C.WARDED_ROLES) expect(C.ROLE_LABELS).toHaveProperty(role);
  });

  test("squad limits only name real enemies and known roles", () => {
    for (const key of Object.keys(SQUAD_LIMITS.types)) expect(C.ENEMIES).toHaveProperty(key);
    for (const role of Object.keys(SQUAD_LIMITS.roles)) expect(C.ROLE_LABELS).toHaveProperty(role);
  });
});

describe("spawn sources", () => {
  test("every spawn source only names real enemies", () => {
    for (const [source, keys] of Object.entries(spawnSources())) {
      for (const key of keys) expect(C.ENEMIES, `${source}: ${key}`).toHaveProperty(key);
    }
  });

  test("the boss rotation and region boss squads lead with a boss", () => {
    for (const key of BOSS_ROTATION) expect(C.ENEMIES[key].boss, key).toBe(true);
    for (const region of REGIONS.filter((entry) => entry.boss)) {
      expect(C.ENEMIES[region.boss[0]].boss || C.ENEMIES[region.boss[0]].tier === "elite", region.id).toBe(true);
    }
  });

  test("region ecology settings only name real templates", () => {
    for (const region of REGIONS) {
      for (const template of Object.keys(region.wildlife?.ecology?.templates || {})) {
        expect(ECOLOGIES, `${region.id}: ${template}`).toHaveProperty(template);
      }
    }
  });

  test("every defined enemy can actually appear in a fight", () => {
    const reachable = new Set(Object.values(spawnSources()).flat());
    expect(ENEMY_KEYS.filter((key) => !reachable.has(key))).toEqual([]);
  });
});

describe("every enemy in a real fight", () => {
  // A stub 2D context: every drawing call is accepted, every property can be set.
  function stubCanvas() {
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get: (target, prop) => (prop in target ? target[prop] : () => gradient),
      set: (target, prop, value) => { target[prop] = value; return true; },
    });
    return { width: 420, height: 760, getContext: () => ctx };
  }

  test.each(ENEMY_KEYS)("%s spawns through the encounter builder, acts, summons only real enemies and draws", (key) => {
    // A one-enemy region: the real encounter code builds the squad. Squads are
    // never only support (ecology.js), so a support-only enemy gets a second
    // slot, which the squad limits fill with a plain fighter.
    const supportOnly = rolesOf(key).every((role) => role === "support" || role === "wildcard");
    const size = supportOnly ? 2 : 1;
    const region = { id: "probe", tier: 1, hpScale: 1, dmgScale: 1, wildlife: { pool: { [key]: 1 }, squad: [size, size], eliteChance: 0, waves: 1 } };
    const wave = buildWildEncounter(region, 0, () => 0, { ecology: false, waves: 1 });
    expect(wave.enemies[0].type).toBe(key);
    expect(wave.enemies).toHaveLength(size);

    const sim = createEncounterSim(createGuild().heroes, 1, wave);
    const summoned = [];
    const makeMinion = sim.makeMinion;
    sim.makeMinion = (type) => { summoned.push(type); return makeMinion(type); };
    const errors = [];
    const engine = new Engine(stubCanvas(), sim, structuredClone(wave), { onError: (error) => errors.push(error) });

    let acted = false;
    for (let step = 0; step < 20 / STEP && !engine.ended; step += 1) {
      const before = engine.active.map((enemy) => `${enemy.x},${enemy.y}`).join();
      engine.update(STEP);
      if (engine.active.map((enemy) => `${enemy.x},${enemy.y}`).join() !== before) acted = true;
      if (step % 60 === 0) engine.render();
    }
    engine.stop();

    expect(errors).toEqual([]);
    expect(acted).toBe(true);
    for (const type of summoned) expect(C.ENEMIES, `${key} summoned ${type}`).toHaveProperty(type);
  });
});
