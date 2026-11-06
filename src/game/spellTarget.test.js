import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { createGearItem } from "./items";
import { getRegion } from "./regions";

function caster() {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "staff", rarity: "common", tier: 1 }) };
  hero.progression.ownedNodeIds = ["A1"];
  hero.progression.level = 10;
  hero.magic = { elements: [], casts: {} };
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}
const foe = (x, y, extra = {}) => {
  const base = C.ENEMIES.orc;
  return { id: `o-${x}-${y}`, type: "orc", name: base.name, tier: base.tier, hp: 5000, maxHp: 5000, speed: 0, damage: 0, color: base.color,
    boss: false, x, y, dmgBy: {}, atkCd: 99, affinities: {}, families: [], ...extra };
};
function fight(enemies) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim([caster()], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = enemies;
  const h = engine.heroes[0];
  h.x = 300; h.y = 420; h.mana = h.maxMana = 999;
  return { engine, h };
}
const withRoll = (value, fn) => { const spy = vi.spyOn(Math, "random").mockReturnValue(value); try { return fn(); } finally { spy.mockRestore(); } };

describe("marking a spell target", () => {
  test("a tap finds the foe under the finger, with a little slack", () => {
    const near = foe(300, 300);
    const { engine } = fight([near, foe(500, 200)]);
    expect(engine.enemyAt(305, 310)).toBe(near);
    expect(engine.enemyAt(300, 340)).toBeNull();
  });

  test("tapped spells go at the marked foe, not the nearest; tapping it again clears the mark", () => {
    const nearest = foe(300, 360);
    const marked = foe(380, 220);
    const { engine, h } = fight([nearest, marked]);
    expect(engine.markHeroTarget(0, marked)).toBe(true);
    expect(engine.heroSpellTarget(0)).toBe(marked);
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt"));
    expect(marked.hp).toBeLessThan(5000);
    expect(nearest.hp).toBe(5000);
    engine.markHeroTarget(0, marked);
    expect(engine.heroSpellTarget(0)).toBeNull();
    void h;
  });

  test("queued spells aim at whatever is marked when they fire", () => {
    const a = foe(300, 360);
    const b = foe(380, 220);
    const { engine, h } = fight([a, b]);
    h.manual = true;
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt"));
    h.spellCooldowns = {};
    engine.queueHeroSpell(0, "arcane_bolt");
    engine.markHeroTarget(0, b);
    const before = b.hp;
    withRoll(0, () => { for (let t = 0; t < 3; t += 1 / 60) engine.update(1 / 60); });
    expect(b.hp).toBeLessThan(before);
  });

  test("out of range the spell falls back to the nearest foe and the mark stays; a dead foe clears it", () => {
    const nearest = foe(300, 360);
    const far = foe(300, 20);
    const { engine } = fight([nearest, far]);
    engine.markHeroTarget(0, far);
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt"));
    expect(nearest.hp).toBeLessThan(5000);
    expect(engine.heroSpellTarget(0)).toBe(far);
    far.hp = 0;
    expect(engine.heroSpellTarget(0)).toBeNull();
    expect(engine.heroes[0].spellTarget).toBeNull();
  });

  test("auto bolts follow the mark", () => {
    const nearest = foe(300, 360);
    const marked = foe(420, 240);
    const { engine, h } = fight([nearest, marked]);
    h.currentTarget = nearest;
    engine.markHeroTarget(0, marked);
    withRoll(0, () => engine._autoCast(h));
    expect(marked.hp).toBeLessThan(5000);
    expect(nearest.hp).toBe(5000);
  });

  test("without a mark, auto bolts go at the weakest foe in range", () => {
    const strong = foe(300, 360);
    const weak = foe(360, 300, { hp: 800 });
    const { engine, h } = fight([strong, weak]);
    h.currentTarget = strong;
    withRoll(0, () => engine._autoCast(h));
    expect(weak.hp).toBeLessThan(800);
    expect(strong.hp).toBe(5000);
  });
});
