import { createHeroModel } from "./heroModel";
import {
  getClasslessAbilityDefinition,
  getUnlockedClasslessAbilities,
  IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS,
  validateClasslessAbilityUse,
} from "./classlessAbilities";

describe("canonical classless active ability definitions", () => {
  test("exposes implemented Phase 1 Warden, Vanguard, Precision, Shadowcraft, Illusion, and Hemomancy abilities", () => {
    expect(IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS).toEqual(["P3", "P3a", "V3", "V3a", "T2a", "W3", "S2a", "S3a", "I3", "H3"]);
    expect(getClasslessAbilityDefinition("P3")).toMatchObject({
      unlockNodeId: "P3", name: "Execution", cooldownSeconds: 22, resourceCost: 0,
      targetMode: "enemy", damageMultiplier: 1.8, conditionalTargetHpBelow: 0.35, conditionalDamageBonus: 0.25,
    });
    expect(getClasslessAbilityDefinition("P3a")).toMatchObject({
      unlockNodeId: "P3a", name: "Killshot", cooldownSeconds: 18, resourceCost: 0,
      damageMultiplier: 2, conditionalTargetHpBelow: 0.4, refundCooldownOnKill: true,
    });
    expect(getClasslessAbilityDefinition("V3")).toMatchObject({
      unlockNodeId: "V3", name: "Cleaving Strike", cooldownSeconds: 20, resourceCost: 0,
      effect: "weapon_cleave", damageMultiplier: 1.6, adjacentDamageMultiplier: 0.4,
      adjacentRadius: 55, requiresTarget: true,
    });
    expect(getClasslessAbilityDefinition("V3a")).toMatchObject({
      unlockNodeId: "V3a", name: "War Cry", cooldownSeconds: 30, resourceCost: 0,
      effect: "attack_speed_aura", range: 8, durationSeconds: 6, attackSpeedBonus: 0.15,
      targetMode: null, requiresTarget: false,
    });
    expect(getClasslessAbilityDefinition("W3")).toMatchObject({
      unlockNodeId: "W3", name: "Interpose", cooldownSeconds: 24, resourceCost: 0,
      range: 150, durationSeconds: 5, damageReduction: 0.25, effect: "interpose", requiresTarget: false,
    });
    expect(getClasslessAbilityDefinition("H3")).toMatchObject({
      unlockNodeId: "H3", name: "Crimson Covenant", cooldownSeconds: 30, resourceCost: 0,
      durationSeconds: 6, effect: "crimson_covenant", requiresTarget: false,
    });
    expect(getClasslessAbilityDefinition("T2a")).toMatchObject({
      unlockNodeId: "T2a", name: "Rally", cooldownSeconds: 22, resourceCost: 0,
      range: 8, healMaxHpFraction: 0.1, effect: "rally", requiresTarget: false,
    });
    expect(getClasslessAbilityDefinition("S2a")).toMatchObject({
      unlockNodeId: "S2a", name: "Smoke Bomb", cooldownSeconds: 20, durationSeconds: 1.5,
      effect: "untargetable", targetMode: null, requiresTarget: false,
    });
    expect(getClasslessAbilityDefinition("S3a")).toMatchObject({
      unlockNodeId: "S3a", name: "Vanish", cooldownSeconds: 25, durationSeconds: 3,
      nextHitDamageBonus: 0.8, effect: "vanish", targetMode: null, requiresTarget: false,
    });
    expect(getClasslessAbilityDefinition("I3")).toMatchObject({
      unlockNodeId: "I3", name: "Phantom Strike", cooldownSeconds: 22,
      damageMultiplier: 1.5, conditionalDamageBonus: 0.5, effect: "phantom_strike",
      targetMode: "enemy", requiresTarget: true,
    });
    expect(getClasslessAbilityDefinition("C2a")).toBeNull();
    expect(getClasslessAbilityDefinition("A3")).toBeNull();
  });

  test("derives unlocks solely from canonical node ownership", () => {
    const hero = createHeroModel({ id: "precision-hero" });
    expect(getUnlockedClasslessAbilities(hero)).toEqual([]);
    hero.progression.ownedNodeIds = ["P3"];
    expect(getUnlockedClasslessAbilities(hero).map((ability) => ability.id)).toEqual(["P3"]);
    hero.cls = "mage";
    expect(getUnlockedClasslessAbilities(hero).map((ability) => ability.id)).toEqual(["P3"]);
  });

  test.each([
    [{ alive: false }, "unavailable"],
    [{ alive: true, cooldown: 2 }, "cooldown"],
    [{ alive: true, target: null }, "no_target"],
    [{ alive: true, target: { hp: 200, maxHp: 500 } }, "target_health"],
  ])("rejects invalid activation without a successful validation result: %s", (scenario, reason) => {
    const hero = createHeroModel({ id: "precision-hero" });
    hero.progression.ownedNodeIds = ["P3"];
    const target = scenario.target;
    const result = validateClasslessAbilityUse({ hero: { ...hero, alive: scenario.alive }, abilityId: "P3",
      cooldown: scenario.cooldown || 0, target, targetValid: !!target, battleActive: true });
    expect(result).toMatchObject({ ok: false, reason });
  });

  test("does not unlock unknown or unowned abilities", () => {
    const hero = createHeroModel({ id: "precision-hero" });
    const validTarget = { hp: 100, maxHp: 500 };
    expect(validateClasslessAbilityUse({ hero, abilityId: "P3", target: validTarget, targetValid: true })).toMatchObject({ ok: false, reason: "locked" });
    hero.progression.ownedNodeIds = ["P3"];
    expect(validateClasslessAbilityUse({ hero, abilityId: "P3a", target: validTarget, targetValid: true })).toMatchObject({ ok: false, reason: "locked" });
  });

  test("validates a targetless War Cry activation through the same eligibility path", () => {
    const hero = createHeroModel({ id: "vanguard-hero" });
    hero.progression.ownedNodeIds = ["V3a"];
    expect(validateClasslessAbilityUse({ hero: { ...hero, alive: true }, abilityId: "V3a",
      cooldown: 0, battleActive: true })).toMatchObject({ ok: true, reason: null, abilityId: "V3a" });
    expect(validateClasslessAbilityUse({ hero: { ...hero, alive: true }, abilityId: "V3a",
      cooldown: 4, battleActive: true })).toMatchObject({ ok: false, reason: "cooldown", cooldown: 4 });
  });
});
