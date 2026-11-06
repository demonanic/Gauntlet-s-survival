import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { enemyTurn } from "../combat/enemies/turn";
import { Engine } from "../combat/engine";
import { RANK_CASTS, heroElementalSchool, knownSpells, learnElement } from "../combat/spells";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild, recruitHero } from "./guild";
import { createGearItem } from "./items";
import { getRegion } from "./regions";

// specs: { weapon, elements, casts }
function heroes(specs) {
  let state = createGuild();
  state.gold = 1e9;
  while (state.heroes.length < specs.length) state = recruitHero(state).state;
  return state.heroes.slice(0, specs.length).map((hero, i) => {
    const spec = specs[i];
    hero.traits = spec.traits || [];
    hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: spec.weapon || "sword", rarity: "common", tier: 1 }) };
    hero.progression.level = 15;
    hero.progression.ownedNodeIds = spec.elements ? ["A1", "A2"] : [];
    hero.magic = { elements: spec.elements || [], casts: spec.casts || {} };
    hero.combat.hp = classlessMaxHp(hero);
    return hero;
  });
}
const foe = (x, y, extra = {}) => {
  const base = C.ENEMIES.orc;
  return { id: `o-${x}-${y}`, type: "orc", name: base.name, tier: base.tier, hp: 5000, maxHp: 5000, speed: 60, damage: 40, color: base.color,
    boss: false, x, y, dmgBy: {}, atkCd: 0, affinities: {}, families: [], ...extra };
};
function fight(specs, enemies) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes(specs), 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = enemies;
  engine.heroes.forEach((h, i) => { h.x = 280 + i * 40; h.y = 420; h.mana = h.maxMana = 999; });
  return engine;
}
const withRoll = (value, fn) => { const spy = vi.spyOn(Math, "random").mockReturnValue(value); try { return fn(); } finally { spy.mockRestore(); } };
const cast = (engine, id, target, i = 0) => withRoll(0, () => engine.castHeroSpell(i, id, target));
const conjurer = (blades = 0, extra = {}) => ({ weapon: "staff", elements: ["conjuration"], casts: { spectral_blades: blades }, ...extra });
const blades = (engine) => engine.pets.filter((pet) => pet.summonKind === "blades");

describe("Conjuration: Spectral Blades", () => {
  test("Conjuration is a school; Spectral Blades opens at I", () => {
    const hero = heroes([conjurer()])[0];
    expect(knownSpells(hero).map((s) => s.id)).toContain("spectral_blades");
    const fresh = { ...hero, magic: { elements: [], casts: {} } };
    expect(learnElement(fresh, "conjuration").ok).toBe(true);
  });

  test("one sword per spell rank, up to 5, for 10 s", () => {
    for (const [casts, count] of [[0, 1], [RANK_CASTS[1], 2], [RANK_CASTS[2], 3], [RANK_CASTS[3], 4], [RANK_CASTS[4], 5], [9999, 5]]) {
      const engine = fight([conjurer(casts)], [foe(300, 380)]);
      expect(cast(engine, "spectral_blades", null)).toBe(true);
      expect(blades(engine)).toHaveLength(count);
    }
    const engine = fight([conjurer()], [foe(300, 380)]);
    cast(engine, "spectral_blades", null);
    // One set at a time.
    expect(engine.getHeroSpellStatus(0).find((s) => s.id === "spectral_blades").available).toBe(false);
    engine.time += 10;
    engine._updatePets(0.1);
    expect(blades(engine)).toHaveLength(0);
  });

  test("the blades fly to a foe near the party and cut every foe close to them", () => {
    const near = foe(300, 340, { speed: 0 });
    const beside = foe(310, 345, { speed: 0 });
    const far = foe(60, 60, { speed: 0 });
    const engine = fight([conjurer(RANK_CASTS[4])], [near, beside, far]);
    cast(engine, "spectral_blades", null);
    for (let i = 0; i < 60; i += 1) engine._updatePets(1 / 30);
    expect(near.hp).toBeLessThan(5000);
    expect(beside.hp).toBeLessThan(5000);
    expect(far.hp).toBe(5000); // beyond the blades' reach from the caster
    const h = engine.heroes[0];
    // Each cut: 25% of the caster's attack, scaled by spell power (more than the bare 25%).
    const cut = blades(engine)[0].damage;
    expect(cut).toBeGreaterThan(h.d.attack * 0.25);
  });

  test("foes can't hit a blade: they walk past it to the hero", () => {
    const orc = foe(300, 380, { speed: 0 });
    const engine = fight([conjurer()], [orc]);
    cast(engine, "spectral_blades", null);
    const blade = blades(engine)[0];
    blade.x = orc.x; blade.y = orc.y + 5;
    expect(engine._nearestPetInReach(orc.x, orc.y, 60)).toBeNull();
    const hp = engine.heroes[0].ref.hp;
    orc.x = engine.heroes[0].x; orc.y = engine.heroes[0].y - 30;
    withRoll(0.99, () => enemyTurn(engine, orc, 0.1));
    expect(blade.hp).toBe(1);
    expect(engine.heroes[0].ref.hp).toBeLessThan(hp);
  });

  test("blades stack with a spirit beast (owner's call)", () => {
    const engine = fight([{ weapon: "staff", elements: ["wild", "conjuration"], casts: { ensnare: RANK_CASTS[3] }, traits: ["brawny"] }], [foe(300, 380)]);
    expect(cast(engine, "summon_beast", null)).toBe(true);
    engine.heroes[0].lastCastAt = -99; engine.heroes[0].castCd = 0;
    expect(cast(engine, "spectral_blades", null)).toBe(true);
    expect(engine.pets.filter((pet) => pet.summoned && !pet.summonKind)).toHaveLength(1);
    expect(blades(engine)).toHaveLength(1);
  });

  test("on auto, blades wait until a foe is near the party", () => {
    const orc = foe(300, 60, { speed: 0 });
    const engine = fight([conjurer()], [orc]);
    const h = engine.heroes[0];
    const spell = engine.getHeroSpellStatus(0).find((s) => s.id === "spectral_blades");
    expect(engine._supportTarget(h, spell, true)).toBeNull();
    orc.y = 300;
    expect(engine._supportTarget(h, spell, true)).toBe(h);
  });
});

describe("Conjuration: Summon Elemental", () => {
  const elementalist = (other, otherCasts = {}) => ({ weapon: "staff", elements: [...other, "conjuration"],
    casts: { spectral_blades: RANK_CASTS[3], ...otherCasts } });
  const elemental = (engine) => engine.pets.find((pet) => pet.summonKind === "elemental");

  test("opens at Conjuration IV; its school is the caster's best other one (none: Arcane)", () => {
    const [low, high] = heroes([conjurer(RANK_CASTS[2]), elementalist(["fire", "ice"], { rime_lance: RANK_CASTS[2], ember_bolt: RANK_CASTS[1] })]);
    expect(knownSpells(low).map((s) => s.id)).not.toContain("summon_elemental");
    expect(knownSpells(high).map((s) => s.id)).toContain("summon_elemental");
    expect(heroElementalSchool(high)).toBe("ice");
    expect(heroElementalSchool(heroes([elementalist(["fire", "ice"])])[0])).toBe("fire"); // a tie: the first learned
    expect(heroElementalSchool(heroes([conjurer(RANK_CASTS[3])])[0])).toBe("arcane");
  });

  test("fights for 12 s with 30% of the caster's HP and its school's touch", () => {
    const orc = foe(300, 380, { speed: 0 });
    const engine = fight([elementalist(["fire"], { ember_bolt: RANK_CASTS[2] })], [orc]);
    expect(cast(engine, "summon_elemental", null)).toBe(true);
    const pet = elemental(engine);
    const h = engine.heroes[0];
    expect(pet.name).toBe("Fire Elemental");
    expect(pet.maxHp).toBe(Math.round(h.d.maxHp * 0.3));
    expect(pet.stats.attack.burn).toBe(0.3);
    expect(pet.stats.attack.damage).toBeGreaterThan(h.d.attack * 0.5);
    for (let i = 0; i < 60; i += 1) engine._updatePets(1 / 30);
    expect(orc.hp).toBeLessThan(5000);
    expect((orc.dots || []).length).toBeGreaterThan(0);
    // Foes can hit it.
    expect(engine._nearestPetInReach(pet.x, pet.y, 10)?.pet).toBe(pet);
    engine.time += 12;
    engine._updatePets(0.1);
    expect(elemental(engine)).toBeUndefined();
  });

  test("Mind stuns, Shadow blinds, Lightning arcs", () => {
    const touch = (school, first) => {
      const orc = foe(300, 380, { speed: 0 });
      const other = foe(330, 380, { speed: 0 });
      const engine = fight([elementalist([school], { [first]: RANK_CASTS[2] })], [orc, other]);
      cast(engine, "summon_elemental", null);
      const pet = elemental(engine);
      pet.x = orc.x; pet.y = orc.y + 20; pet.cd = 0; pet.target = orc;
      engine._updatePets(1 / 30);
      return { orc, other, engine };
    };
    const mind = touch("mind", "thought_lance");
    expect(mind.orc.stunUntil).toBeCloseTo(mind.engine.time + 0.3);
    const shadow = touch("shadow", "veil");
    expect(shadow.orc.blindChance).toBeCloseTo(0.3);
    const lightning = touch("electric", "arc_surge");
    expect(lightning.other.hp).toBeLessThan(5000);
  });

  test("support schools: half damage, and help allies within 120 every second", () => {
    const engine = fight([elementalist(["restoration"], { mend: RANK_CASTS[2] }), { weapon: "sword" }], [foe(300, 100, { speed: 0 })]);
    const [h, ally] = engine.heroes;
    cast(engine, "summon_elemental", null);
    const pet = elemental(engine);
    expect(pet.stats.attack.damage).toBeLessThan(h.d.attack * 0.5);
    ally.ref.hp = ally.d.maxHp * 0.5;
    pet.x = ally.x; pet.y = ally.y; pet.pulseCd = 0;
    engine._elementalPulse(pet, 0);
    expect(ally.ref.hp).toBeCloseTo(ally.d.maxHp * 0.53);

    const warding = fight([elementalist(["warding"], { barrier: RANK_CASTS[2] })], [foe(300, 100)]);
    cast(warding, "summon_elemental", null);
    const ward = elemental(warding);
    ward.pulseCd = 0;
    warding._elementalPulse(ward, 0);
    const caster = warding.heroes[0];
    expect(caster.ref.shield).toBeCloseTo(caster.d.maxHp * 0.02);

    const enchant = fight([elementalist(["enchanting"], { haste: RANK_CASTS[2] })], [foe(300, 100)]);
    cast(enchant, "summon_elemental", null);
    const spark = elemental(enchant);
    spark.pulseCd = 0;
    enchant._elementalPulse(spark, 0);
    expect(enchant.heroes[0].hasteAmount).toBe(0.1);
  });

  test("stacks with blades and a spirit beast; one elemental at a time", () => {
    const engine = fight([{ weapon: "staff", elements: ["wild", "conjuration"], casts: { ensnare: RANK_CASTS[3], spectral_blades: RANK_CASTS[3] }, traits: ["brawny"] }], [foe(300, 380)]);
    const h = engine.heroes[0];
    const again = () => { h.lastCastAt = -99; h.castCd = 0; };
    expect(cast(engine, "summon_beast", null)).toBe(true); again();
    expect(cast(engine, "spectral_blades", null)).toBe(true); again();
    expect(cast(engine, "summon_elemental", null)).toBe(true); again();
    expect(elemental(engine).name).toBe("Wild Magic Elemental");
    h.spellCooldowns = {};
    expect(engine.getHeroSpellStatus(0).find((s) => s.id === "summon_elemental").available).toBe(false);
  });
});

describe("Shadow: Mirror Self", () => {
  const shade = (weapon = "sword") => ({ weapon, elements: ["shadow"], casts: { veil: RANK_CASTS[4] } });
  const mirror = (engine) => engine.pets.find((pet) => pet.summonKind === "mirror");

  test("opens at Shadow V", () => {
    const [hero] = heroes([shade()]);
    expect(knownSpells(hero).map((s) => s.id)).toContain("mirror_self");
    const four = { ...hero, magic: { elements: ["shadow"], casts: { veil: RANK_CASTS[3] } } };
    expect(knownSpells(four).map((s) => s.id)).not.toContain("mirror_self");
  });

  test("a 40% copy for 8 s that half the foes on the caster turn on", () => {
    // Goblins: orcs and role foes peel to their own picks before a taunt counts (as with the tortoise).
    const orcs = [foe(300, 390, { type: "goblin" }), foe(320, 395, { type: "goblin" }), foe(280, 395, { type: "goblin" }), foe(310, 100, { type: "goblin" })];
    const engine = fight([shade()], orcs);
    const h = engine.heroes[0];
    expect(cast(engine, "mirror_self", null)).toBe(true);
    const copy = mirror(engine);
    expect(copy.maxHp).toBe(Math.round(h.d.maxHp * 0.4));
    expect(copy.stats.attack.damage).toBeCloseTo(h.d.attack * 0.4);
    expect(copy.stats.attack.range).toBe(30);
    // Three foes are on the caster (the fourth is far off): two turn.
    expect(orcs.filter((e) => e.tauntedBy === copy)).toHaveLength(2);
    expect(orcs[3].tauntedBy).toBeUndefined();
    // A fooled foe goes for the copy, not the hero.
    const fooled = orcs.find((e) => e.tauntedBy === copy);
    fooled.x = copy.x; fooled.y = copy.y - 20; fooled.atkCd = 0;
    const hp = h.ref.hp;
    withRoll(0.99, () => enemyTurn(engine, fooled, 0.05));
    expect(copy.hp).toBeLessThan(copy.maxHp);
    expect(h.ref.hp).toBe(hp);
    // When it goes, the foes stop chasing it.
    engine.time += 8;
    engine._updatePets(0.1);
    expect(mirror(engine)).toBeUndefined();
    expect(fooled.tauntUntil).toBe(0);
  });

  test("a bow copy shoots from range; bosses aren't fooled", () => {
    const boss = foe(300, 395, { boss: true });
    const engine = fight([shade("bow")], [boss]);
    cast(engine, "mirror_self", null);
    expect(mirror(engine).stats.attack.range).toBeGreaterThan(30);
    expect(boss.tauntedBy).toBeUndefined();
  });

  test("on auto: only when the caster is under 60% and under attack", () => {
    const engine = fight([shade()], [foe(300, 390)]);
    const h = engine.heroes[0];
    const spell = engine.getHeroSpellStatus(0).find((s) => s.id === "mirror_self");
    expect(engine._supportTarget(h, spell, true)).toBeNull();
    h.ref.hp = h.d.maxHp * 0.5;
    expect(engine._supportTarget(h, spell, true)).toBeNull();
    h.lastHurtAt = engine.time;
    expect(engine._supportTarget(h, spell, true)).toBe(h);
    expect(engine._supportTarget(h, spell, false)).toBe(h);
  });
});
