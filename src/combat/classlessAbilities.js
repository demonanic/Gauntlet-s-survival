// Canonical classless active abilities whose runtime handlers are implemented.
// Node ownership is the unlock source; class/title fields never grant access.
const CLASSLESS_ABILITIES = Object.freeze([
  Object.freeze({
    id: "P3",
    branch: "Precision",
    unlockNodeId: "P3",
    name: "Execution",
    description: "Deal 180% direct weapon damage. Deals 25% more while the target is below 35% HP.",
    cooldownSeconds: 22,
    resourceCost: 0,
    targetMode: "enemy",
    rangeMode: "hero_attack_range",
    damageMultiplier: 1.8,
    conditionalTargetHpBelow: 0.35,
    conditionalDamageBonus: 0.25,
    refundCooldownOnKill: false,
    effect: "weapon_strike",
    requiresTarget: true,
  }),
  Object.freeze({
    id: "P3a",
    branch: "Precision",
    unlockNodeId: "P3a",
    name: "Killshot",
    description: "Deal 200% direct weapon damage to a target below 40% HP. Refreshes immediately if it kills.",
    cooldownSeconds: 18,
    resourceCost: 0,
    targetMode: "enemy",
    rangeMode: "hero_attack_range",
    damageMultiplier: 2,
    conditionalTargetHpBelow: 0.4,
    conditionalDamageBonus: 0,
    refundCooldownOnKill: true,
    effect: "weapon_strike",
    requiresTarget: true,
  }),
  Object.freeze({
    id: "V3",
    branch: "Vanguard",
    unlockNodeId: "V3",
    name: "Cleaving Strike",
    description: "Deal 160% direct weapon damage to one target and 40% to the nearest adjacent enemy.",
    cooldownSeconds: 20,
    resourceCost: 0,
    targetMode: "enemy",
    rangeMode: "hero_attack_range",
    damageMultiplier: 1.6,
    adjacentDamageMultiplier: 0.4,
    adjacentRadius: 55,
    effect: "weapon_cleave",
    requiresTarget: true,
  }),
  Object.freeze({
    id: "V3a",
    branch: "Vanguard",
    unlockNodeId: "V3a",
    name: "War Cry",
    description: "Allies within 8 units gain 15% attack speed for 6 seconds.",
    cooldownSeconds: 30,
    resourceCost: 0,
    targetMode: null,
    rangeMode: "allies_in_radius",
    range: 8,
    durationSeconds: 6,
    attackSpeedBonus: 0.15,
    effect: "attack_speed_aura",
    requiresTarget: false,
  }),
  Object.freeze({
    id: "T2a",
    branch: "Tactics",
    unlockNodeId: "T2a",
    name: "Rally",
    description: "Heal living allies within 8 units for 10% of their maximum HP.",
    cooldownSeconds: 22,
    resourceCost: 0,
    targetMode: null,
    rangeMode: "allies_in_radius",
    range: 8,
    healMaxHpFraction: 0.10,
    effect: "rally",
    requiresTarget: false,
  }),
  Object.freeze({
    id: "W3",
    branch: "Warden",
    unlockNodeId: "W3",
    name: "Interpose",
    description: "For 5 seconds, the lowest-HP allied hero within 150 battlefield units takes 25% less damage. Protects you if no ally qualifies.",
    cooldownSeconds: 24,
    resourceCost: 0,
    targetMode: null,
    rangeMode: "allies_in_radius",
    range: 150,
    durationSeconds: 5,
    damageReduction: 0.25,
    effect: "interpose",
    requiresTarget: false,
  }),
  Object.freeze({
    id: "S2a",
    branch: "Shadowcraft",
    unlockNodeId: "S2a",
    name: "Smoke Bomb",
    description: "Become untargetable for 1.5 seconds. Does not cleanse; area attacks still hit.",
    cooldownSeconds: 20,
    resourceCost: 0,
    targetMode: null,
    rangeMode: "self",
    durationSeconds: 1.5,
    effect: "untargetable",
    requiresTarget: false,
  }),
  Object.freeze({
    id: "S3a",
    branch: "Shadowcraft",
    unlockNodeId: "S3a",
    name: "Vanish",
    description: "Become untargetable for 3 seconds. Your next direct hit gains up to 50% damage under the shared situational cap.",
    cooldownSeconds: 25,
    resourceCost: 0,
    targetMode: null,
    rangeMode: "self",
    durationSeconds: 3,
    nextHitDamageBonus: 0.8,
    effect: "vanish",
    requiresTarget: false,
  }),
  Object.freeze({
    id: "I3",
    branch: "Illusion",
    unlockNodeId: "I3",
    name: "Phantom Strike",
    description: "Teleport behind a target and deal 150% weapon damage; gain 50% situational damage if it was not targeting you.",
    cooldownSeconds: 22,
    resourceCost: 0,
    targetMode: "enemy",
    rangeMode: "hero_attack_range",
    damageMultiplier: 1.5,
    conditionalDamageBonus: 0.5,
    effect: "phantom_strike",
    requiresTarget: true,
  }),
  Object.freeze({
    id: "H3",
    branch: "Hemomancy",
    unlockNodeId: "H3",
    name: "Crimson Covenant",
    description: "For 6 seconds, double lifesteal and survive one lethal hit at 1 HP. Survival protection can trigger once per 60 seconds.",
    cooldownSeconds: 30,
    resourceCost: 0,
    targetMode: null,
    rangeMode: "self",
    durationSeconds: 6,
    effect: "crimson_covenant",
    requiresTarget: false,
  }),
]);

const DEFINITIONS = new Map(CLASSLESS_ABILITIES.map((ability) => [ability.id, ability]));
export const IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS = Object.freeze(CLASSLESS_ABILITIES.map((ability) => ability.unlockNodeId));

export function getClasslessAbilityDefinition(abilityId) {
  return DEFINITIONS.get(abilityId) || null;
}

export function getUnlockedClasslessAbilities(hero) {
  const owned = new Set(hero?.progression?.ownedNodeIds || []);
  return CLASSLESS_ABILITIES.filter((ability) => owned.has(ability.unlockNodeId));
}

export function validateClasslessAbilityUse({
  hero,
  abilityId,
  cooldown = 0,
  battleActive = true,
  target = null,
  targetValid = false,
}) {
  const definition = DEFINITIONS.get(abilityId);
  if (!definition || !getUnlockedClasslessAbilities(hero).some((ability) => ability.id === abilityId)) {
    return { ok: false, reason: "locked", abilityId };
  }
  if (!battleActive || !hero?.alive || hero?.protect > 0 || hero?.retreating) {
    return { ok: false, reason: "unavailable", abilityId };
  }
  if (cooldown > 0) return { ok: false, reason: "cooldown", abilityId, cooldown };
  if (definition.requiresTarget && (!target || !targetValid || !(target.maxHp > 0) || !(target.hp > 0))) {
    return { ok: false, reason: "no_target", abilityId };
  }
  if (Number.isFinite(definition.conditionalTargetHpBelow) && target.hp / target.maxHp >= definition.conditionalTargetHpBelow) {
    return { ok: false, reason: "target_health", abilityId };
  }
  return { ok: true, reason: null, abilityId, definition, target };
}
