import { Engine } from "./engine";
import { STARTER_MOVES, getUnlockedClasslessAbilities } from "./classlessAbilities";
import { SPELLS } from "./spells";
import { createGuild } from "../game/guild";
import { createGearItem } from "../game/items";

function testSim(heroes) {
  return {
    heroes, gold: 0, vault: [], kills: { total: 0, byType: {} },
    rollDrop: () => null,
    makeMinion: (type) => { throw new Error(`Unexpected summon (${type})`); },
  };
}
const withWeapon = (type) => createGuild().heroes.find((hero) => hero.equipment.weapon.weaponType === type);
function engineFor(hero) {
  const engine = new Engine({ getContext: () => null }, testSim([hero]), { enemies: [], total: 100 }, { onEnd: () => {} });
  return { engine, h: engine.heroes[0] };
}
function dummy(x, y, extra = {}) {
  return { name: "Dummy", type: "targetDummy", hp: 5000, maxHp: 5000, x, y, speed: 0, lane: -1, floats: true, dmgBy: {}, affinities: {}, ...extra };
}
const status = (engine, id) => engine.getHeroAbilityStatus(0).find((move) => move.id === id);

describe("starter moves", () => {
  let random;
  beforeEach(() => { random = jest.spyOn(Math, "random").mockReturnValue(0.9); });
  afterEach(() => random.mockRestore());

  test("each weapon brings its own move from level 1, no perk needed", () => {
    expect(STARTER_MOVES.map((move) => [move.starterWeapon, move.name])).toEqual([["sword", "Lunge"], ["bow", "Pinning Shot"], ["staff", "Mana Surge"]]);
    for (const [weapon, id] of [["sword", "SW1"], ["bow", "BW1"], ["staff", "ST1"]]) {
      const hero = withWeapon(weapon);
      expect(hero.progression.level).toBe(1);
      expect(getUnlockedClasslessAbilities(hero).map((move) => move.id)).toEqual([id]);
    }
    // Holding another weapon swaps the starter; perk moves stay.
    const hero = withWeapon("sword");
    hero.progression.ownedNodeIds = ["P3"];
    hero.equipment.weapon = createGearItem({ slot: "weapon", variant: "bow", rarity: "common", tier: 1 });
    expect(getUnlockedClasslessAbilities(hero).map((move) => move.id)).toEqual(["BW1", "P3"]);
  });

  test("Lunge reaches 160, dashes in, hits and stuns (less on bosses)", () => {
    const { engine, h } = engineFor(withWeapon("sword"));
    const far = dummy(h.x, h.y - 150);
    const tooFar = dummy(h.x + 400, h.y - 400);
    engine.active = [far, tooFar];
    expect(status(engine, "SW1")).toMatchObject({ name: "Lunge", available: true, branch: "Starter" });
    const result = engine.useHeroAbility(0, "SW1", far);
    expect(result).toMatchObject({ ok: true, abilityId: "SW1" });
    expect(far.hp).toBeLessThan(5000);
    expect(Math.hypot(far.x - h.x, far.y - h.y)).toBeLessThanOrEqual(engine._meleeReach(h, far));
    expect(far.stunUntil).toBeCloseTo(engine.time + 1);
    expect(h.abilityCooldowns.SW1).toBeCloseTo(14 * h.d.moveCooldownMultiplier);
    expect(engine.useHeroAbility(0, "SW1", far)).toMatchObject({ ok: false, reason: "cooldown" });

    const boss = engineFor(withWeapon("sword"));
    const big = dummy(boss.h.x, boss.h.y - 100, { boss: true });
    boss.engine.active = [big];
    boss.engine.useHeroAbility(0, "SW1", big);
    expect(big.stunUntil).toBeCloseTo(boss.engine.time + 0.3);

    const out = engineFor(withWeapon("sword"));
    const away = dummy(out.h.x, out.h.y - 300);
    out.engine.active = [away];
    expect(status(out.engine, "SW1")).toMatchObject({ available: false, reason: "no_target" });
  });

  test("Pinning Shot hits from range and roots (less on bosses)", () => {
    const { engine, h } = engineFor(withWeapon("bow"));
    const foe = dummy(h.x, h.y - Math.min(150, h.d.range - 10));
    engine.active = [foe];
    const start = { x: h.x, y: h.y };
    expect(engine.useHeroAbility(0, "BW1", foe)).toMatchObject({ ok: true });
    expect(foe.hp).toBeLessThan(5000);
    expect(foe.rootUntil).toBeCloseTo(engine.time + 2);
    expect({ x: h.x, y: h.y }).toEqual(start);

    const boss = engineFor(withWeapon("bow"));
    const big = dummy(boss.h.x, boss.h.y - 100, { boss: true });
    boss.engine.active = [big];
    boss.engine.useHeroAbility(0, "BW1", big);
    expect(big.rootUntil).toBeCloseTo(boss.engine.time + 0.5);
  });

  test("Mana Surge needs spells; it restores mana and makes the next spell free", () => {
    const plain = engineFor(withWeapon("staff"));
    expect(status(plain.engine, "ST1")).toMatchObject({ available: false, reason: "no_mana" });
    expect(plain.engine.useHeroAbility(0, "ST1")).toMatchObject({ ok: false, reason: "no_mana" });

    const hero = withWeapon("staff");
    hero.progression.ownedNodeIds = ["A1"];
    hero.magic = { elements: [], casts: {} };
    const { engine, h } = engineFor(hero);
    engine.active = [dummy(h.x, h.y - 100)];
    h.mana = 10;
    expect(engine.useHeroAbility(0, "ST1")).toMatchObject({ ok: true });
    expect(h.mana).toBe(Math.min(h.maxMana, 35));
    const bolt = engine.getHeroSpellStatus(0).find((spell) => spell.id === "arcane_bolt");
    expect(bolt).toMatchObject({ cost: 0, free: true, available: true });
    const before = h.mana;
    expect(engine.castHeroSpell(0, "arcane_bolt", engine.active[0])).toBe(true);
    expect(h.mana).toBe(before);
    expect(engine.getHeroSpellStatus(0).find((spell) => spell.id === "arcane_bolt")).toMatchObject({ free: false, cost: SPELLS.arcane_bolt.mana });
  });
});
