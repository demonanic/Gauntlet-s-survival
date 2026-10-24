// Runtime support for the currently implemented Phase 1 classless passives.
// Keep this list explicit: catalog ownership alone never implies an effect.
const IMPLEMENTED_PASSIVES = Object.freeze({
  V1: { weaponDamage: 0.08 },
  V2: { followThroughDamage: 0.10 },
  V2a: { momentumDamagePerStack: 0.04 },
  W1: { maxHp: 0.08 },
  W2: { damageReduction: 0.06 },
  W2a: { regenerationBelowHalf: 0.015 },
  P1: { critChance: 0.08 },
  P2: { markDamage: 0.10 },
  P2a: { critDamage: 0.20 },
  S1: { attackSpeed: 0.05 },
  S2: { evasion: 0.08 },
  S3: { ambushDamage: 0.25 },
  T1: { cooldownReduction: 0.05 },
  T2: { disruptSlow: 0.15 },
  T3: { openingDamage: 0.08 },
  T3a: { formationMitigation: 0.05 },
  C1: { activeTargetDamage: 0.08 },
  C2: { echoDamageFraction: 0.20, echoCooldownSeconds: 10, echoDurationSeconds: 4 },
  W3a: { lastStand: 0.25 },
  H1: { lifesteal: 0.02 },
  H2: { bloodPriceBonus: 0.12, bloodPriceCost: 0.05 },
  F1: { critDamage: 0.15 },
  N1: { regeneration: 0.01 },
  I1: { fullHpEvasion: 0.08 },
  I2: { decoyChance: 0.15 },
  N2: { rootEverySeconds: 12 },
});

export const IMPLEMENTED_CLASSLESS_PASSIVES = Object.freeze(Object.keys(IMPLEMENTED_PASSIVES));

export function classlessCombatEffects(ownedNodeIds = []) {
  const totals = { weaponDamage: 0, critChance: 0, critDamage: 0, attackSpeed: 0, cooldownReduction: 0,
    maxHp: 0, damageReduction: 0, markDamage: 0, evasion: 0, fullHpEvasion: 0,
    lastStand: 0, lifesteal: 0, regeneration: 0, regenerationBelowHalf: 0, decoyChance: 0,
    followThroughDamage: 0, momentumDamagePerStack: 0, ambushDamage: 0, disruptSlow: 0,
    activeTargetDamage: 0, openingDamage: 0, formationMitigation: 0,
    echoDamageFraction: 0, echoCooldownSeconds: 0, echoDurationSeconds: 0,
    rootEverySeconds: 0, bloodPriceBonus: 0, bloodPriceCost: 0 };
  for (const id of new Set(ownedNodeIds)) {
    const effect = IMPLEMENTED_PASSIVES[id];
    if (!effect) continue;
    for (const [key, value] of Object.entries(effect)) totals[key] += value;
  }
  totals.weaponDamage = Math.min(0.5, totals.weaponDamage);
  totals.attackSpeed = Math.min(0.2, totals.attackSpeed);
  totals.critChance = Math.min(0.5, totals.critChance);
  totals.critDamage = Math.min(1, totals.critDamage);
  totals.cooldownReduction = Math.min(0.3, totals.cooldownReduction);
  totals.damageReduction = Math.min(0.3, totals.damageReduction);
  totals.evasion = Math.min(0.5, totals.evasion);
  totals.fullHpEvasion = Math.min(0.5, totals.fullHpEvasion);
  totals.maxHp = Math.min(0.5, totals.maxHp);
  totals.followThroughDamage = Math.min(0.5, totals.followThroughDamage);
  totals.momentumDamagePerStack = Math.min(0.2, totals.momentumDamagePerStack);
  totals.ambushDamage = Math.min(0.5, totals.ambushDamage);
  totals.disruptSlow = Math.min(0.5, totals.disruptSlow);
  totals.activeTargetDamage = Math.min(0.5, totals.activeTargetDamage);
  totals.openingDamage = Math.min(0.5, totals.openingDamage);
  return totals;
}

export function classlessMaxHp(hero) {
  const maxHp = Number(hero?.combat?.maxHp);
  if (!Number.isFinite(maxHp) || maxHp <= 0) return 300;
  return Math.round(maxHp * (1 + classlessCombatEffects(hero.progression?.ownedNodeIds).maxHp));
}
