import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { RANK_CASTS, SPELLS, knownSpells } from "../combat/spells";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild, recruitHero } from "./guild";
import { createGearItem } from "./items";
import { createPet } from "./pets";
import { getRegion } from "./regions";

function heroes(specs) {
  let state = createGuild();
  state.gold = 1e9;
  while (state.heroes.length < specs.length) state = recruitHero(state).state;
  return state.heroes.slice(0, specs.length).map((hero, i) => {
    const spec = specs[i];
    hero.traits = [];
    hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: spec.weapon || "sword", rarity: "common", tier: 1 }) };
    hero.progression.level = 15;
    hero.progression.ownedNodeIds = spec.school ? ["A1", "A2"] : [];
    hero.magic = spec.school ? { elements: [spec.school], casts: { [spec.first]: RANK_CASTS[4] } } : { elements: [], casts: {} };
    if (spec.pet) hero.pet = createPet(spec.pet);
    if (spec.weapon === "bow") hero.quickSlots = [{ key: "arrows", qty: spec.arrows ?? 50 }, null];
    hero.combat.hp = classlessMaxHp(hero);
    return hero;
  });
}
const foe = (x, y, extra = {}) => {
  const base = C.ENEMIES.orc;
  return { id: `o-${x}-${y}`, type: "orc", name: base.name, tier: base.tier, hp: 5000, maxHp: 5000, speed: 0, damage: 40, color: base.color,
    boss: false, x, y, dmgBy: {}, atkCd: 99, affinities: {}, families: [], ...extra };
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
const enchanter = { weapon: "staff", school: "enchanting", first: "haste" };
const warder = { weapon: "staff", school: "warding", first: "barrier" };

describe("Enchanting and the new wards", () => {
  test("Enchanting is a school: Haste and True Aim at I, Endless Quiver and Kindred Bond at II, Insight at IV; Warding adds Iron Skin and Spellguard at II", () => {
    const ids = (casts) => knownSpells({ ...heroes([enchanter])[0], magic: { elements: ["enchanting"], casts } }).map((s) => s.id);
    expect(ids({})).toEqual(expect.arrayContaining(["haste", "true_aim"]));
    expect(ids({})).not.toContain("endless_quiver");
    expect(ids({ haste: RANK_CASTS[1] })).toEqual(expect.arrayContaining(["endless_quiver", "kindred_bond"]));
    expect(ids({ haste: RANK_CASTS[3] })).toContain("insight");
    const wards = knownSpells({ ...heroes([warder])[0], magic: { elements: ["warding"], casts: { barrier: RANK_CASTS[1] } } }).map((s) => s.id);
    expect(wards).toEqual(expect.arrayContaining(["iron_skin", "spellguard"]));
  });

  test("Haste: allies nearby +30% attack and move speed for 10 s, on top of the attack speed cap", () => {
    const engine = fight([enchanter, { weapon: "sword" }], [foe(300, 100)]);
    const ally = engine.heroes[1];
    cast(engine, "haste", null);
    expect(engine.heroes[0].hasteUntil).toBeCloseTo(engine.time + 10);
    expect(ally.hasteUntil).toBeCloseTo(engine.time + 10);
    ally.cd = 10;
    engine.update(0.1);
    expect(ally.cd).toBeCloseTo(10 - 0.1 * 1.3, 5);
  });

  test("True Aim: allies nearby: no darkness misses, +15% crit", () => {
    const engine = fight([enchanter, { weapon: "sword" }], [foe(320, 400)]);
    const ally = engine.heroes[1];
    ally.d.env = { miss: 1 };
    ally.d.critChance = 0;
    const target = engine.active[0];
    const hit = () => withRoll(0.1, () => engine._applyHit({ sourceId: "H1", target, dmg: 10, damageCategory: "weapon", heroIndex: 1, critChance: 0, critMult: 2 }));
    expect(hit()).toBe(false);
    cast(engine, "true_aim", null);
    expect(hit()).toBe(true);
    expect(engine.floaters.some((f) => /^CRIT/.test(f.text))).toBe(true);
  });

  test("Endless Quiver: no arrows spent, and shots even with an empty quiver", () => {
    const engine = fight([enchanter, { weapon: "bow", arrows: 1 }], [foe(300, 100)]);
    const archer = engine.heroes[1];
    archer.model.quickSlots[0].qty = 0;
    expect(engine._drawArrow(archer)).toBe(false);
    cast(engine, "endless_quiver", archer);
    expect(engine._drawArrow(archer)).not.toBe(false);
    archer.model.quickSlots[0].qty = 5;
    for (let k = 0; k < 8; k += 1) engine._drawArrow(archer);
    expect(archer.model.quickSlots[0].qty).toBe(5);
  });

  test("Kindred Bond: the familiar hits 50% harder and takes 30% less", () => {
    const engine = fight([enchanter, { weapon: "sword", pet: "wolf" }], [foe(300, 380)]);
    const owner = engine.heroes[1];
    const pet = engine.pets.find((p) => p.owner === owner);
    const target = engine.active[0];
    const strike = () => { const before = target.hp; engine._petStrike(pet, target); return before - target.hp; };
    const plain = strike();
    cast(engine, "kindred_bond", owner);
    expect(strike()).toBeCloseTo(plain * 1.5, 0);
    const bite = () => { const before = pet.hp; withRoll(0.99, () => engine._enemyHitPet(target, pet)); return before - pet.hp; };
    const taken = bite();
    owner.kindredUntil = 0;
    pet.hp = pet.maxHp;
    expect(bite()).toBeCloseTo(taken / 0.7, 0);
  });

  test("Insight: +25% XP for the rest of the fight, once", () => {
    const engine = fight([{ ...enchanter, first: "haste" }], [foe(300, 100)]);
    const model = engine.heroes[0].model;
    model.magic.casts.haste = RANK_CASTS[4];
    engine._awardXp("H0", 100);
    cast(engine, "insight", null);
    engine._awardXp("H0", 100);
    expect(engine.xpGains.heroes[0]).toBeCloseTo(225);
    expect(engine._supportTarget(engine.heroes[0], SPELLS.insight, false)).toBeNull();
  });

  test("Iron Skin cuts melee and arrows by 75%; Spellguard cuts magic bolts and bombs", () => {
    const engine = fight([{ ...warder }, { weapon: "sword" }], [foe(320, 400)]);
    const ally = engine.heroes[1];
    expect(engine._wardCut(ally, "weapon")).toBe(1);
    cast(engine, "iron_skin", ally);
    expect(engine._wardCut(ally, "weapon")).toBeCloseTo(0.25);
    expect(engine._wardCut(ally, "magic")).toBe(1);
    engine.heroes[0].spellCooldowns = {};
    cast(engine, "spellguard", ally);
    expect(engine._wardCut(ally, "magic")).toBeCloseTo(0.25);
    const orc = engine.active[0];
    const hp = ally.ref.hp;
    withRoll(0.99, () => engine._enemyAttack(orc, { kind: "hero", obj: ally }));
    const lost = hp - ally.ref.hp;
    ally.ironSkinUntil = 0;
    ally.ref.hp = hp;
    withRoll(0.99, () => engine._enemyAttack(orc, { kind: "hero", obj: ally }));
    expect(lost).toBeCloseTo((hp - ally.ref.hp) * 0.25, 0);
  });

  test("on auto: Haste once two allies nearby lack it and someone is fighting; wards wait for a hurt ally under the right kind of attack", () => {
    const engine = fight([warder, { weapon: "sword" }], [foe(320, 400)]);
    const [caster, ally] = engine.heroes;
    expect(engine._supportTarget(caster, SPELLS.iron_skin, true)).toBeNull();
    ally.ref.hp = ally.d.maxHp * 0.5;
    ally.lastHurtAt = engine.time;
    expect(engine._supportTarget(caster, SPELLS.iron_skin, true)).toBe(ally);
    expect(engine._supportTarget(caster, SPELLS.spellguard, true)).toBeNull();
    const haste = fight([enchanter, { weapon: "sword" }, { weapon: "bow" }], [foe(320, 300)]);
    expect(haste._supportTarget(haste.heroes[0], SPELLS.haste, true)).toBe(haste.heroes[0]);
    haste.heroes[1].hasteUntil = haste.time + 5;
    expect(haste._supportTarget(haste.heroes[0], SPELLS.haste, true)).toBe(haste.heroes[0]);
    haste.heroes[2].hasteUntil = haste.time + 5;
    expect(haste._supportTarget(haste.heroes[0], SPELLS.haste, true)).toBeNull();
    expect(haste._supportTarget(haste.heroes[0], SPELLS.haste, false)).toBe(haste.heroes[0]);
  });
});
