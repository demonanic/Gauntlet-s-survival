import { Engine } from "./engine";
import { HERO_BASELINE } from "./heroModel";
import {
  MASTERY, heroMastery, masteredMove, masteryEffects, masteryRank, moveRank, nextMasteryCount, normalizeMastery, recordMastery,
} from "./mastery";
import { createGuild } from "../game/guild";
import { masteryLine } from "../game/fightResults";

function testSim(heroes) {
  return {
    heroes, gold: 0, vault: [], kills: { total: 0, byType: {} },
    rollDrop: () => null,
    makeMinion: (type) => { throw new Error(`Unexpected summon (${type})`); },
  };
}
const swordHero = () => createGuild().heroes.find((hero) => hero.equipment.weapon.weaponType === "sword");
const bowHero = () => createGuild().heroes.find((hero) => hero.equipment.weapon.weaponType === "bow");
function engineFor(hero) {
  const engine = new Engine({ getContext: () => null }, testSim([hero]), { enemies: [], total: 100 }, { onEnd: () => {} });
  return { engine, h: engine.heroes[0] };
}
function dummy(x, y) {
  return { name: "Dummy", type: "targetDummy", hp: 5000, maxHp: 5000, x, y, speed: 0, lane: -1, floats: true, dmgBy: {}, affinities: {} };
}

describe("mastery ranks", () => {
  test("ranks I-V by count, with the next goal", () => {
    expect([0, 14, 15, 44, 45, 199, 200, 9999].map((n) => masteryRank(n, MASTERY.moveCounts))).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
    expect(nextMasteryCount(20, MASTERY.moveCounts)).toBe(45);
    expect(nextMasteryCount(200, MASTERY.moveCounts)).toBeNull();
    expect(masteryRank(5000, MASTERY.weaponCounts)).toBe(5);
  });

  test("a mastered move scales its numbers and shortens its cooldown; rank I is untouched", () => {
    const move = { id: "X", damageMultiplier: 2, durationSeconds: 4, absorb: 50, cooldownSeconds: 10, range: 150 };
    expect(masteredMove(move, 1)).toBe(move);
    const v = masteredMove(move, 5);
    expect(v.damageMultiplier).toBeCloseTo(2.4);
    expect(v.durationSeconds).toBeCloseTo(4.8);
    expect(v.absorb).toBeCloseTo(60);
    expect(v.cooldownSeconds).toBeCloseTo(8.8);
    expect(v.range).toBe(150);
    expect(move.damageMultiplier).toBe(2);
  });

  test("effects by rank: weapon damage, bow crit, dodge, backstab", () => {
    const hero = { mastery: { moves: {}, weapons: { bow: 5000, sword: 1000 }, dodges: 600, backstabs: 300 } };
    expect(masteryEffects(hero, "bow")).toEqual({ weaponDamage: 0.08, critChance: 0.02, dodge: 0.02, backstabDamage: 0.08 });
    expect(masteryEffects(hero, "sword")).toMatchObject({ weaponDamage: 0.04, critChance: 0 });
    expect(masteryEffects({}, "sword")).toEqual({ weaponDamage: 0, critChance: 0, dodge: 0, backstabDamage: 0 });
  });
});

describe("recording mastery after a fight", () => {
  test("folds moves, hits by weapon, dodges and backstabs, and reports rank-ups", () => {
    const hero = { identity: { name: "Brann" } };
    expect(recordMastery(hero, {}, "sword")).toEqual([]);
    expect("mastery" in hero).toBe(false);
    const ups = recordMastery(hero, { moveUses: { P3: 15 }, meleeHits: 280, rangedHits: 25, dodges: 3, backstabs: 100 }, "sword");
    expect(hero.mastery).toEqual({ moves: { P3: 15 }, weapons: { sword: 305 }, dodges: 3, backstabs: 100 });
    expect(ups).toEqual(expect.arrayContaining([
      { kind: "move", id: "P3", rank: 2 }, { kind: "weapon", id: "sword", rank: 2 }, { kind: "backstab", id: "backstab", rank: 2 },
    ]));
    expect(ups.length).toBe(3);
    expect(recordMastery(hero, { meleeHits: 10 }, null)).toEqual([]);
    expect(hero.mastery.weapons.sword).toBe(305);
    expect(masteryLine(hero, { kind: "weapon", id: "sword", rank: 2 })).toBe("Brann reaches sword mastery II.");
    expect(masteryLine(hero, { kind: "move", id: HERO_BASELINE.sharedStrike.id, rank: 3 })).toBe("Brann's Shared Strike reaches mastery III.");
  });

  test("saved mastery is repaired: bad counts dropped, unknown weapons dropped, empty becomes none", () => {
    expect(normalizeMastery({ moves: { P3: "12", bad: -4 }, weapons: { sword: 9, axe: 50 }, dodges: 2.7, backstabs: "x" }))
      .toEqual({ moves: { P3: 12 }, weapons: { sword: 9 }, dodges: 2, backstabs: 0 });
    expect(normalizeMastery({ moves: {}, weapons: {}, dodges: 0 })).toBeNull();
    expect(normalizeMastery("junk")).toBeNull();
    expect(heroMastery({})).toEqual({ moves: {}, weapons: {}, dodges: 0, backstabs: 0 });
  });
});

describe("mastery in battle", () => {
  test("rank I heroes fight exactly as before; ranked heroes get their bonuses", () => {
    const plain = engineFor(bowHero()).h.d;
    const ranked = bowHero();
    ranked.mastery = { moves: {}, weapons: { bow: 5000 }, dodges: 600, backstabs: 0 };
    const d = engineFor(ranked).h.d;
    expect(plain.masteryWeaponDamage).toBe(0);
    expect(plain.backstabDamage).toBe(0);
    expect(d.masteryWeaponDamage).toBeCloseTo(0.08);
    expect(d.critChance).toBeCloseTo(plain.critChance + 0.02);
    expect(d.dodge).toBeCloseTo(Math.min(0.35, plain.dodge + 0.02));
  });

  test("a melee hit on a foe busy fighting someone else is a backstab, and backstab mastery adds damage", () => {
    const random = jest.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      const hitFor = (backstabs, busyWith) => {
        const hero = swordHero();
        if (backstabs) hero.mastery = { moves: {}, weapons: {}, dodges: 0, backstabs };
        const { engine, h } = engineFor(hero);
        const target = dummy(h.x + 20, h.y);
        engine.active = [target];
        if (busyWith) engine._engage(target, busyWith === "self" ? h : { id: "someone else" });
        engine._applyHit({ sourceId: "H0", target, dmg: 100, heroIndex: 0, damageCategory: "weapon" });
        return { damage: 5000 - target.hp, stats: h.model.battleStats };
      };
      const front = hitFor(0, "self");
      expect(front.stats.meleeHits).toBe(1);
      expect(front.stats.backstabs).toBeUndefined();
      expect(hitFor(0, null).stats.backstabs).toBeUndefined();
      const behind = hitFor(0, "other");
      expect(behind.stats).toMatchObject({ meleeHits: 1, backstabs: 1 });
      expect(behind.damage).toBeCloseTo(front.damage);
      expect(hitFor(1500, "other").damage).toBeCloseTo(front.damage * 1.16);
      expect(hitFor(1500, "self").damage).toBeCloseTo(front.damage);
    } finally {
      random.mockRestore();
    }
  });

  test("a landed move counts toward its mastery, and a mastered Shared Strike hits harder", () => {
    const random = jest.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      const strike = (uses) => {
        const hero = swordHero();
        if (uses) hero.mastery = { moves: { [HERO_BASELINE.sharedStrike.id]: uses }, weapons: {}, dodges: 0, backstabs: 0 };
        const { engine, h } = engineFor(hero);
        const target = dummy(h.x + 10, h.y);
        engine.active = [target];
        expect(engine.useHeroAbility(0, HERO_BASELINE.sharedStrike.id, target)).toBeTruthy();
        return { damage: 5000 - target.hp, h };
      };
      const plain = strike(0);
      expect(plain.h.model.battleStats.moveUses).toEqual({ [HERO_BASELINE.sharedStrike.id]: 1 });
      expect(plain.h.model.battleStats.moves).toBe(1);
      const master = strike(200);
      expect(moveRank(master.h.model, HERO_BASELINE.sharedStrike.id)).toBe(5);
      expect(master.damage).toBeCloseTo(plain.damage * 1.2);
      expect(master.h.abilityCooldowns[HERO_BASELINE.sharedStrike.id]).toBeCloseTo(plain.h.abilityCooldowns[HERO_BASELINE.sharedStrike.id] * 0.88);
    } finally {
      random.mockRestore();
    }
  });
});
