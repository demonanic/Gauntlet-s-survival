import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { enemyTurn } from "../combat/enemies/turn";
import { Engine } from "../combat/engine";
import { RANK_CASTS, knownSpells, learnElement } from "../combat/spells";
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
