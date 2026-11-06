import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { HEX, RANK_CASTS, SPELLS, knownSpells } from "../combat/spells";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { createGearItem } from "./items";
import { getRegion } from "./regions";

function hero({ id = "h", school = null, casts = {}, weapon = "staff" } = {}) {
  const model = structuredClone(createGuild().heroes[0]);
  model.identity = { ...model.identity, id };
  model.traits = [];
  model.equipment = { weapon: createGearItem({ slot: "weapon", variant: weapon, rarity: "common", tier: 1 }) };
  model.progression.ownedNodeIds = school ? ["A1", "A2"] : [];
  model.progression.level = 15;
  model.combat.stats.intelligence = 20;
  model.magic = { elements: school ? [school] : [], casts };
  model.combat.hp = classlessMaxHp(model);
  return model;
}
const shadow = (extra = {}) => hero({ school: "shadow", casts: { veil: RANK_CASTS[4] }, ...extra });
const mind = (extra = {}) => hero({ school: "mind", casts: { thought_lance: RANK_CASTS[4] }, ...extra });

function foe(type = "orc", x = 300, y = 380, extra = {}) {
  const base = C.ENEMIES[type];
  return { id: `${type}-${x}-${y}`, type, name: base.name, tier: base.tier, hp: 5000, maxHp: 5000, speed: 0, damage: 40, color: base.color,
    boss: false, x, y, dmgBy: {}, atkCd: 99, affinities: {}, families: [], ...extra };
}

function fight(heroes, enemies) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = enemies;
  engine.heroes.forEach((h, i) => { h.x = 280 + i * 40; h.y = 420; h.mana = h.maxMana = 999; });
  return engine;
}
const withRoll = (value, fn) => {
  const spy = vi.spyOn(Math, "random").mockReturnValue(value);
  try { return fn(); } finally { spy.mockRestore(); }
};
const cast = (engine, id, target, i = 0) => withRoll(0, () => engine.castHeroSpell(i, id, target));

describe("hexes are learned like the rest of their school", () => {
  test("Shadow: Blind at I, Disarm at II; Mind: Enfeeble at I, Silence at II, Expose at IV", () => {
    const ids = (model) => knownSpells(model).map((spell) => spell.id);
    expect(ids(hero({ school: "shadow" }))).toContain("blind");
    expect(ids(hero({ school: "shadow" }))).not.toContain("disarm");
    expect(ids(hero({ school: "shadow", casts: { veil: RANK_CASTS[1] } }))).toContain("disarm");
    expect(ids(hero({ school: "mind" }))).toContain("enfeeble");
    expect(ids(hero({ school: "mind", casts: { thought_lance: RANK_CASTS[1] } }))).toContain("silence");
    expect(ids(hero({ school: "mind", casts: { thought_lance: RANK_CASTS[2] } }))).not.toContain("expose");
    expect(ids(hero({ school: "mind", casts: { thought_lance: RANK_CASTS[3] } }))).toContain("expose");
  });
});

describe("what each hex does", () => {
  test("Blind: 75% of its attacks miss on an ordinary foe, half that on an elite, a quarter on a boss", () => {
    const grunt = foe("orc");
    const elite = foe("orc", 320, 380, { tier: "elite" });
    const boss = foe("orc", 340, 380, { boss: true });
    const engine = fight([shadow()], [grunt, elite, boss]);
    for (const target of [grunt, elite, boss]) { engine.heroes[0].spellCooldowns = {}; cast(engine, "blind", target); }
    expect(grunt.blindChance).toBeCloseTo(SPELLS.blind.strength);
    expect(elite.blindChance).toBeCloseTo(SPELLS.blind.strength * HEX.elite);
    expect(boss.blindChance).toBeCloseTo(SPELLS.blind.strength * HEX.boss);
    const h = engine.heroes[0];
    const hp = h.ref.hp;
    withRoll(0.5, () => engine._enemyAttack(grunt, { kind: "hero", obj: h }));
    expect(h.ref.hp).toBe(hp);
    expect(engine.floaters.some((floater) => floater.text === "MISS")).toBe(true);
    grunt.blindUntil = 0;
    withRoll(0.99, () => engine._enemyAttack(grunt, { kind: "hero", obj: h }));
    expect(h.ref.hp).toBeLessThan(hp);
  });

  test("Enfeeble: the foe deals 75% less (bosses 18.75% less), in melee and with bolts", () => {
    const grunt = foe("orc");
    const engine = fight([mind()], [grunt]);
    const h = engine.heroes[0];
    const hit = () => { const before = h.ref.hp; withRoll(0.99, () => engine._enemyAttack(grunt, { kind: "hero", obj: h })); const lost = before - h.ref.hp; h.ref.hp = h.d.maxHp; return lost; };
    const full = hit();
    cast(engine, "enfeeble", grunt);
    expect(grunt.enfeebleCut).toBeCloseTo(0.75);
    expect(hit()).toBeCloseTo(full * 0.25, 0);
    engine._throwEnemyBolt(grunt, { kind: "hero", obj: h }, 100, "#fff");
    expect(engine.projectiles.at(-1).dmg).toBeCloseTo(25);
    const boss = foe("orc", 320, 380, { boss: true });
    engine.active.push(boss);
    h.spellCooldowns = {};
    cast(engine, "enfeeble", boss);
    expect(boss.enfeebleCut).toBeCloseTo(0.75 * HEX.boss);
  });

  test("Disarm: no attacks for 3 s (elites 1.5 s, bosses 0.75 s)", () => {
    const grunt = foe("orc");
    const boss = foe("orc", 320, 380, { boss: true });
    const engine = fight([shadow()], [grunt, boss]);
    const h = engine.heroes[0];
    cast(engine, "disarm", grunt);
    h.spellCooldowns = {};
    cast(engine, "disarm", boss);
    expect(grunt.disarmUntil).toBeCloseTo(engine.time + 3);
    expect(boss.disarmUntil).toBeCloseTo(engine.time + 3 * HEX.boss);
    const hp = h.ref.hp;
    withRoll(0.99, () => engine._enemyAttack(grunt, { kind: "hero", obj: h }));
    engine._throwEnemyBolt(grunt, { kind: "hero", obj: h }, 100, "#fff");
    expect(h.ref.hp).toBe(hp);
    expect(engine.projectiles.some((p) => p.kind === "enemyBolt")).toBe(false);
  });

  test("Silence: a boss uses no ability, a necromancer stops mending and raising", () => {
    const boss = foe("orc", 300, 380, { boss: true, type: "bogLich", abilityCd: 0 });
    const ally = foe("orc", 320, 380, { hp: 1000 });
    const engine = fight([mind({ casts: { thought_lance: RANK_CASTS[1] } })], [boss, ally]);
    cast(engine, "silence", boss);
    expect(boss.silenceUntil).toBeCloseTo(engine.time + SPELLS.silence.seconds * HEX.boss);
    engine._updateEnemy(boss, 0.1);
    expect(ally.hp).toBe(1000);
    expect(boss.abilityCd).toBe(0);
    boss.silenceUntil = 0;
    engine._updateEnemy(boss, 0.1);
    expect(ally.hp).toBeGreaterThan(1000);
  });

  test("Expose: +30% from the party's main kind of damage, for 6 s", () => {
    const grunt = foe("orc");
    const engine = fight([mind({ casts: { thought_lance: RANK_CASTS[3] } }), hero({ id: "s1", weapon: "sword" }), hero({ id: "s2", weapon: "sword" })], [grunt]);
    cast(engine, "expose", grunt);
    expect(grunt.exposeKind).toBe("melee");
    expect(grunt.exposeUntil).toBeCloseTo(engine.time + 6);
    const [caster, sword] = engine.heroes;
    expect(engine._exposeMatches("melee", sword, false, true)).toBe(true);
    expect(engine._exposeMatches("melee", caster, true, true)).toBe(false);
    expect(engine._exposeMatches("magic", caster, true, false)).toBe(true);
    // A spell on a magic-exposed foe hits 30% harder.
    grunt.exposeKind = "magic";
    const before = grunt.hp;
    engine._spellHit(caster, grunt, 100, "mind", "H0", false);
    expect(before - grunt.hp).toBeCloseTo(130, 0);
  });

  test("magic-immune foes shrug hexes off", () => {
    const warded = foe("orc", 300, 380, { magicImmune: true });
    const engine = fight([shadow()], [warded]);
    cast(engine, "blind", warded);
    expect(warded.blindUntil).toBeUndefined();
  });
});

describe("hexes on auto", () => {
  test("Silence goes on a foe with abilities first", () => {
    const grunt = foe("orc", 300, 380);
    const warlock = foe("warlock", 330, 380);
    const engine = fight([mind({ casts: { thought_lance: RANK_CASTS[1] } })], [grunt, warlock]);
    const h = engine.heroes[0];
    expect(engine._autoHex(h, engine.getHeroSpellStatus(0).filter((s) => s.available))).toMatchObject({ spell: { id: "silence" }, foe: warlock });
  });

  test("Enfeeble, Disarm and Blind wait for a big foe in the thick of it, or one on a hurt hero", () => {
    const grunt = foe("orc", 300, 380);
    const engine = fight([shadow()], [grunt]);
    const h = engine.heroes[0];
    const ready = () => engine.getHeroSpellStatus(0).filter((s) => s.available);
    expect(engine._autoHex(h, ready())).toBeNull();
    h.ref.hp = h.d.maxHp * 0.3;
    // Disarm comes before Blind; a foe already held by one gets the other.
    expect(engine._autoHex(h, ready())).toMatchObject({ spell: { id: "disarm" }, foe: grunt });
    h.ref.hp = h.d.maxHp;
    grunt.tier = "elite";
    grunt.disarmUntil = engine.time + 2;
    expect(engine._autoHex(h, ready())).toMatchObject({ spell: { id: "blind" }, foe: grunt });
    grunt.blindUntil = engine.time + 3;
    expect(engine._autoHex(h, ready())).toBeNull();
  });

  test("an auto-caster really casts it", () => {
    const elite = foe("orc", 300, 380, { tier: "elite" });
    const engine = fight([mind()], [elite]);
    withRoll(0, () => engine._autoCast(engine.heroes[0]));
    expect(elite.enfeebleUntil).toBeGreaterThan(engine.time);
  });
});
