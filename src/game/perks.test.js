import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { createGearItem } from "./items";
import { getRegion } from "./regions";

function hero(nodes, id = "a") {
  const model = structuredClone(createGuild().heroes[0]);
  model.identity = { ...model.identity, id, name: id };
  model.traits = [];
  model.equipment = { weapon: createGearItem({ slot: "weapon", variant: "bow", rarity: "common", tier: 1 }) };
  model.progression.ownedNodeIds = nodes;
  model.progression.level = 10;
  model.combat.hp = classlessMaxHp(model);
  return model;
}

function engineWith(heroes) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  const base = C.ENEMIES.orc;
  const target = { id: "orc", type: "orc", name: base.name, tier: base.tier, hp: 99999, maxHp: 99999, speed: 0, damage: 0, color: base.color,
    x: 0, y: 0, dmgBy: {}, atkCd: 99, affinities: {}, families: [] };
  engine.active = [target];
  engine.heroes.forEach((h, i) => { h.x = 300 + i * 40; h.y = 400; });
  target.x = engine.heroes[0].x; target.y = 250;
  return { engine, target };
}

const hit = (engine, target, h) => engine._applyHit({ sourceId: `H${h.i}`, target, dmg: 100, magic: false, damageType: null,
  critChance: 0, critMult: 2, classless: true, heroIndex: h.i, damageCategory: "weapon" });

describe("the last pending perks", () => {
  test("Ward shields the lowest-HP ally within 150 for 80 damage, or the caster", () => {
    const { engine } = engineWith([hero(["C1", "C2a"], "a"), hero([], "b")]);
    const [caster, ally] = engine.heroes;
    ally.ref.hp = 50;
    expect(engine.useHeroAbility(0, "C2a")).toMatchObject({ ok: true });
    expect(ally.ref.shield).toBe(80);
    const alone = engineWith([hero(["C1", "C2a"], "a")]).engine;
    alone.useHeroAbility(0, "C2a");
    expect(alone.heroes[0].ref.shield).toBe(80);
    expect(caster.abilityCooldowns.C2a).toBeGreaterThan(0);
  });

  test("Jackpot makes the next 3 direct hits crits", () => {
    const { engine, target } = engineWith([hero(["F1", "F2", "F3"])]);
    const [h] = engine.heroes;
    h.d.critChance = 0;
    const roll = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      engine.useHeroAbility(0, "F3");
      const before = target.hp;
      hit(engine, target, h);
      const crit = before - target.hp;
      for (let i = 0; i < 2; i += 1) hit(engine, target, h);
      const third = target.hp;
      hit(engine, target, h);
      expect(third - target.hp).toBeLessThan(crit);
      expect(h.jackpotHits).toBe(0);
    } finally {
      roll.mockRestore();
    }
  });

  test("Loaded Dice: 10% of hits ×1.5, 20% ×0.75, otherwise as usual", () => {
    const damageAt = (rollValue) => {
      const { engine, target } = engineWith([hero(["F1", "F2"])]);
      engine.heroes[0].d.critChance = 0;
      const roll = vi.spyOn(Math, "random").mockReturnValue(rollValue);
      try {
        hit(engine, target, engine.heroes[0]);
        return 99999 - target.hp;
      } finally {
        roll.mockRestore();
      }
    };
    const normal = damageAt(0.5);
    expect(damageAt(0.05)).toBeCloseTo(normal * 1.5);
    expect(damageAt(0.2)).toBeCloseTo(normal * 0.75);
  });
});
