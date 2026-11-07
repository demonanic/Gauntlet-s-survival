import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { ELEMENTS, RANK_CASTS, REACTIONS } from "../combat/spells";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { createGearItem } from "./items";
import { getRegion } from "./regions";

// One caster with every hitting school at `rank` (I-V).
function engineWith(enemies, rank = 1) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "staff", rarity: "common", tier: 1 }) };
  hero.progression.ownedNodeIds = ["A1", "A2"];
  const casts = rank > 1 ? RANK_CASTS[rank - 1] : 0;
  hero.magic = { elements: ["fire", "ice", "electric", "shadow", "poison"],
    casts: { ember_bolt: casts, rime_lance: casts, arc_surge: casts, blind: casts, venom_spike: casts } };
  hero.combat.hp = classlessMaxHp(hero);
  const engine = new Engine({ getContext: () => null }, createEncounterSim([hero], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = enemies;
  engine.rng = () => 0; // every roll succeeds unless a test says otherwise
  return engine;
}
const foe = (x, y, extra = {}) => ({ id: `o-${x}-${y}`, type: "orc", name: "Orc", tier: C.ENEMIES.orc.tier, hp: 5000, maxHp: 5000, speed: 0, damage: 40,
  color: "#fff", boss: false, x, y, dmgBy: {}, atkCd: 99, affinities: {}, families: [], ...extra });

describe("reactions (combos)", () => {
  test("Shatter: Lightning on a slowed foe hits again in full and ends the slow", () => {
    const orc = foe(200, 200);
    const engine = engineWith([orc]);
    const h = engine.heroes[0];
    engine._slowEnemy(orc, 0.3, 3);
    expect(engine._react(h, orc, "electric", 100, "H0")).toBe("shatter");
    expect(orc.hp).toBe(5000 - 100);
    expect(orc.slowUntil).toBe(engine.time);
  });

  test("Ignite: Fire on a poisoned foe lands the poison at once (2×) and splashes it all nearby", () => {
    const orc = foe(200, 200);
    const near = foe(230, 200);
    const engine = engineWith([orc, near]);
    const h = engine.heroes[0];
    engine._applyDot(orc, 100, 5, ELEMENTS.poison.color, "H0");
    expect(engine._react(h, orc, "fire", 50, "H0")).toBe("ignite");
    expect(orc.hp).toBeCloseTo(5000 - 200);
    expect(orc.dots.length).toBe(0);
    expect(near.hp).toBeCloseTo(5000 - 200);
  });

  test("Steam: Ice on a burning foe puts it out and blinds foes around it", () => {
    const orc = foe(200, 200);
    const near = foe(240, 200);
    const engine = engineWith([orc, near]);
    const h = engine.heroes[0];
    engine._applyDot(orc, 100, 3, ELEMENTS.fire.color, "H0");
    expect(engine._react(h, orc, "ice", 50, "H0")).toBe("steam");
    expect(orc.dots.length).toBe(0);
    for (const e of [orc, near]) { expect(e.blindChance).toBeCloseTo(REACTIONS.steam.blind); expect(e.blindUntil).toBeCloseTo(engine.time + 3); }
  });

  test("Wildfire: Fire on a rooted foe spreads a burn to up to six foes nearby", () => {
    const orc = foe(200, 200, { rootUntil: 99 });
    const others = [foe(230, 200), foe(170, 200), foe(200, 240), foe(200, 160), foe(240, 240), foe(160, 160), foe(250, 170)];
    const engine = engineWith([orc, ...others]);
    expect(engine._react(engine.heroes[0], orc, "fire", 100, "H0")).toBe("wildfire");
    const burning = others.filter((e) => e.dots?.length);
    expect(burning).toHaveLength(6);
    expect(burning[0].dots[0].dps * 3).toBeCloseTo(100);
  });

  test("Nightmare: Shadow on a stunned or confused foe: a burst and fear; a Shadow hex sets it off too", () => {
    const orc = foe(200, 200, { stunUntil: 5 });
    const engine = engineWith([orc]);
    const h = engine.heroes[0];
    expect(engine._react(h, orc, "shadow", 0, "H0")).toBe("nightmare");
    expect(orc.hp).toBeCloseTo(5000 - h.d.attack * 1.2);
    expect(orc.fearUntil).toBeCloseTo(engine.time + 3);
    const dazed = foe(200, 200, { confusedUntil: 5 });
    const second = engineWith([dazed]);
    second._hexOne(second.heroes[0], { element: "shadow", shape: "blind", strength: 0.3, seconds: 4, name: "Blind", color: "#000" }, dazed, 1);
    expect(dazed.fearUntil).toBeGreaterThan(second.time);
  });

  test("the chance: 20% at rank I, 5% more each rank, 40% at V", () => {
    const roll = (rank, value) => {
      const orc = foe(200, 200);
      const engine = engineWith([orc], rank);
      engine.rng = () => value;
      engine._slowEnemy(orc, 0.3, 3);
      return engine._react(engine.heroes[0], orc, "electric", 100, "H0");
    };
    expect(roll(1, 0.19)).toBe("shatter");
    expect(roll(1, 0.21)).toBeNull();
    expect(roll(3, 0.29)).toBe("shatter");
    expect(roll(5, 0.39)).toBe("shatter");
    expect(roll(5, 0.41)).toBeNull();
  });

  test("one per foe every 6 s; bosses take half and aren't frightened; no reaction without the effect or on the immune", () => {
    const orc = foe(200, 200);
    const engine = engineWith([orc]);
    const h = engine.heroes[0];
    engine._slowEnemy(orc, 0.3, 9);
    expect(engine._react(h, orc, "electric", 100, "H0")).toBe("shatter");
    engine._slowEnemy(orc, 0.3, 9);
    expect(engine._react(h, orc, "electric", 100, "H0")).toBeNull();
    engine.time += 6;
    expect(engine._react(h, orc, "electric", 100, "H0")).toBe("shatter");
    expect(engine._react(h, foe(1, 1), "electric", 100, "H0")).toBeNull();
    const immune = foe(200, 200, { magicImmune: true });
    engine._slowEnemy(immune, 0.3, 9);
    expect(engine._react(h, immune, "electric", 100, "H0")).toBeNull();
    const boss = foe(300, 300, { boss: true, stunUntil: 9 });
    expect(engine._react(h, boss, "shadow", 0, "H0")).toBe("nightmare");
    expect(boss.hp).toBeCloseTo(5000 - h.d.attack * 0.6);
    expect(boss.fearUntil).toBeUndefined();
  });

  test("a spell hit sets one off before its own effect: Ice on a burning foe steams, then slows", () => {
    const orc = foe(200, 200);
    const engine = engineWith([orc]);
    engine._applyDot(orc, 100, 3, ELEMENTS.fire.color, "H0");
    engine._spellHit(engine.heroes[0], orc, 40, "ice", "H0", false);
    expect(orc.blindUntil).toBeGreaterThan(engine.time);
    expect(orc.slowUntil).toBeGreaterThan(engine.time);
    expect(engine.reactionsBy.steam).toBe(1);
  });
});
