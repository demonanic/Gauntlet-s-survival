import * as C from "./config";
import { IMPLEMENTED_CLASSLESS_PASSIVES } from "./classlessCombatEffects";
import { IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS } from "./classlessAbilities";

// Bible v1.0 purchase metadata. Effect execution is owned by combat consumers.
const BRANCHES = [
  ["Vanguard", [["V1", 1], ["V2", 2], ["V2a", 2], ["V3", 3], ["V3a", 3]]],
  ["Warden", [["W1", 1], ["W2", 2], ["W2a", 2], ["W3", 3], ["W3a", 3]]],
  ["Precision", [["P1", 1], ["P2", 2], ["P2a", 2], ["P3", 3], ["P3a", 3]]],
  ["Shadowcraft", [["S1", 1], ["S2", 2], ["S2a", 2], ["S3", 3], ["S3a", 3]]],
  ["Arcana", [["A1", 1], ["A2", 2], ["A2a", 2], ["A3", 3], ["A3a", 3]]],
  ["Tactics", [["T1", 1], ["T2", 2], ["T2a", 2], ["T3", 3], ["T3a", 3]]],
  ["Conjuration", [["C1", 1], ["C2", 2], ["C2a", 2], ["C3", 3], ["C3a", 3]]],
  ["Hemomancy", [["H1", 1], ["H2", 2], ["H3", 3]]],
  ["Fortune", [["F1", 1], ["F2", 2], ["F3", 3]]],
  ["Wilds", [["N1", 1], ["N2", 2], ["N3", 3]]],
  ["Illusion", [["I1", 1], ["I2", 2], ["I3", 3]]],
];

const PHASE_2_NODES = new Set(["C3", "C3a", "N3"]);

const NODE_PRESENTATION = {
  V1: ["Edge Training", "+8% direct weapon damage."], V2: ["Follow-Through", "+10% damage to an enemy hit within the previous 4 seconds."],
  V2a: ["Momentum", "+4% consecutive-hit damage per stack, up to 5; resets on target change or 4 seconds without a hit."],
  V3: ["Cleaving Strike", "Active · 20s cooldown · 160% weapon damage to one target and 40% to one adjacent enemy."],
  V3a: ["War Cry", "Active · 30s cooldown · allies within 8 units gain +15% attack speed for 6 seconds."],
  W1: ["Vitality", "+8% maximum HP."], W2: ["Guard", "−6% incoming damage; shares the 30% progression reduction cap."],
  W2a: ["Regeneration", "Heal 1.5% maximum HP per second while below 50% HP; shares the 4% sustain cap."],
  W3: ["Interpose", "Active · 24s cooldown · lowest-HP ally in range takes 25% less damage for 5 seconds."],
  W3a: ["Last Stand", "Below 25% HP, gain 25% damage reduction for 5 seconds; 60s internal cooldown."],
  P1: ["Focus", "+8 percentage points critical chance."], P2: ["Mark", "First hit on a new target marks it for 5 seconds; deal +10% damage to that target."],
  P2a: ["Deadeye", "+20 percentage points critical damage."],
  P3: ["Execution", "Active · 22s cooldown · 180% weapon damage; +25% if target is below 35% HP."],
  P3a: ["Killshot", "Active · 18s cooldown · 200% weapon damage against a target below 40% HP; cooldown refunded on kill."],
  S1: ["Quickstep", "+5% attack speed."], S2: ["Evasion", "8% chance to evade a direct attack; not area attacks or status effects."],
  S2a: ["Smoke Bomb", "Active · 20s cooldown · untargetable for 1.5 seconds."],
  S3: ["Ambush", "First hit after 3 seconds without dealing damage gains +25%, once per target per combat."],
  S3a: ["Vanish", "Active · 25s cooldown · untargetable for 3 seconds; next hit gains +80% damage."],
  A1: ["Arcane Spark", "Unlocks Arcane damage capability and grants +8% Arcane damage; does not grant Library research."],
  A2: ["Elementalism", "Choose Fire, Ice, Poison, or Mind in preparation; +10% damage of the selected element."],
  A2a: ["Chain Spark", "Elemental direct hits jump to up to 2 additional targets for 40% damage."],
  A3: ["Arcane Channel", "Active · 20s cooldown · single-target Arcane bolt for 175% Arcane damage; magic immunity applies."],
  A3a: ["Meteor", "Active · 25s cooldown · 2-second telegraph, then 180% Arcane damage in radius 4, up to 5 targets."],
  T1: ["Readiness", "+5% active cooldown recovery."],
  T2: ["Disrupt", "First direct hit every 8 seconds slows enemy movement and attack speed by 15% for 3 seconds; bosses receive 5%."],
  T2a: ["Rally", "Active · 22s cooldown · allies within 8 units heal 10% maximum HP."],
  T3: ["Opening", "Allies deal +8% damage to an enemy currently controlled by this hero; ends 4 seconds after control."],
  T3a: ["Formation", "Allies within 5 units take 5% less damage; shares the 30% reduction cap."],
  C1: ["Conjuration Focus", "+8% damage to targets affected by your active ability within 4 seconds."],
  C2: ["Echo", "First ability hit every 10 seconds marks for 4 seconds; next allied hit adds bonus damage equal to 20% of your attack."],
  C2a: ["Ward", "Active · 18s cooldown · absorb the next 80 damage dealt to the lowest-HP ally in range."],
  C3: ["Construct", "Phase 2 gated · stationary construct, 6-second lifetime."],
  C3a: ["Familiar", "Phase 2 gated · companion attacks your target for 8% of your attack every 3 seconds."],
  H1: ["Sanguine Edge", "Direct weapon hits restore 2% of damage dealt as HP; abilities and area damage do not trigger it."],
  H2: ["Blood Price", "Active abilities cost 5% current HP and deal +12% damage; refuses activation that would leave you below 1 HP."],
  H3: ["Crimson Covenant", "Active · 30s cooldown · for 6 seconds double lifesteal and cannot drop below 1 HP; survival clause once per 60 seconds."],
  F1: ["Lucky Edge", "+15 percentage points critical damage."],
  F2: ["Loaded Dice", "Each direct hit has 10% chance for 150% damage and 10% chance for 75% damage."],
  F3: ["Jackpot", "Active · 35s cooldown · next 3 direct hits are guaranteed critical hits."],
  N1: ["Verdant Vigor", "Regenerate 1% maximum HP every 3 seconds after 5 seconds without taking damage."],
  N2: ["Ensnaring Roots", "Every 12 seconds, your next direct hit roots the target for 1.5 seconds (bosses: 0.5s)."],
  N3: ["Primal Bond", "Phase 2 gated · spirit beast attacks your current target for 8 seconds."],
  I1: ["Fade", "Gain 8% evasion while at full HP."],
  I2: ["Mirror Image", "When hit, 15% chance to spawn a decoy that absorbs the next hit; 15s internal cooldown."],
  I3: ["Phantom Strike", "Active · 22s cooldown · teleport behind target and deal 150% weapon damage, +50% if it was not targeting you."],
};

export const CANONICAL_NODES = Object.freeze(BRANCHES.flatMap(([branch, entries]) => entries.map(([id, tier]) => {
  const tierTwoIds = entries.filter(([, nodeTier]) => nodeTier === 2).map(([nodeId]) => nodeId);
  const prerequisites = tier === 1
    ? []
    : tier === 2
      ? [entries[0][0]]
      : tierTwoIds;

  return Object.freeze({
    id,
    branch,
    name: NODE_PRESENTATION[id][0],
    description: NODE_PRESENTATION[id][1],
    tier,
    apCost: tier,
    minLevel: tier === 1 ? 1 : tier === 2 ? 5 : 10,
    prerequisites: Object.freeze(prerequisites),
    gated: PHASE_2_NODES.has(id),
  });
})));

const NODE_BY_ID = new Map(CANONICAL_NODES.map((node) => [node.id, node]));

export function getCanonicalNode(nodeId) {
  return NODE_BY_ID.get(nodeId) || null;
}

function validateProgressionShape(progression) {
  if (!progression || typeof progression !== "object" ||
    !Number.isInteger(progression.level) || progression.level < 1 ||
    !Number.isInteger(progression.ap) || progression.ap < 0 ||
    !Array.isArray(progression.ownedNodeIds)) {
    return "invalid_progression";
  }

  const seen = new Set();
  for (const ownedId of progression.ownedNodeIds) {
    const ownedNode = NODE_BY_ID.get(ownedId);
    if (!ownedNode || ownedNode.gated || seen.has(ownedId) || progression.level < ownedNode.minLevel) {
      return "invalid_progression";
    }
    seen.add(ownedId);
  }

  if (CANONICAL_NODES.filter((node) => node.tier === 3 && seen.has(node.id)).length > 2) {
    return "invalid_progression";
  }
  for (const ownedId of seen) {
    const ownedNode = NODE_BY_ID.get(ownedId);
    const hasPrerequisite = ownedNode.tier === 3
      ? ownedNode.prerequisites.some((id) => seen.has(id))
      : ownedNode.prerequisites.every((id) => seen.has(id));
    if (!hasPrerequisite) return "invalid_progression";
  }
  return null;
}

/**
 * Validate one purchase without mutating the supplied progression. On success,
 * returns a new progression value; on failure, returns a stable reason code.
 */
export function purchaseNode(progression, nodeId) {
  const shapeError = validateProgressionShape(progression);
  if (shapeError) return { ok: false, reason: shapeError };

  const node = NODE_BY_ID.get(nodeId);
  if (!node) return { ok: false, reason: "unknown_node" };
  if (progression.ownedNodeIds.includes(nodeId)) return { ok: false, reason: "already_owned" };
  if (node.gated) return { ok: false, reason: "phase_gated" };
  if (progression.level < node.minLevel) return { ok: false, reason: "level_required" };

  const ownsPrerequisite = node.tier === 3
    ? node.prerequisites.some((id) => progression.ownedNodeIds.includes(id))
    : node.prerequisites.every((id) => progression.ownedNodeIds.includes(id));
  if (!ownsPrerequisite) return { ok: false, reason: "prerequisite_required" };

  if (node.tier === 3 && CANONICAL_NODES.filter((ownedNode) =>
    ownedNode.tier === 3 && progression.ownedNodeIds.includes(ownedNode.id)).length >= 2) {
    return { ok: false, reason: "tier_iii_mastery_cap" };
  }
  if (progression.ap < node.apCost) return { ok: false, reason: "insufficient_ap" };
  return {
    ok: true,
    progression: {
      ...progression,
      ap: progression.ap - node.apCost,
      ownedNodeIds: [...progression.ownedNodeIds, nodeId],
    },
  };
}

// Classless purchase adapter. It returns only the replacement progression so
// callers can install it after validation without changing identity, combat,
// appearance, or unrelated profile fields. Purchases are allowed only for
// passive effects and active ability nodes with registered runtime consumers.
export function purchaseClasslessNode(hero, nodeId) {
  if (!hero || typeof hero !== "object" || hero.cls || !hero.identity?.id || !hero.combat) {
    return { ok: false, reason: "not_classless_hero" };
  }
  const result = purchaseNode(hero.progression, nodeId);
  if (!result.ok) return result;
  if (!IMPLEMENTED_CLASSLESS_PASSIVES.includes(nodeId) && !IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS.includes(nodeId)) {
    return { ok: false, reason: "effect_pending" };
  }
  return result;
}
// The legacy progression curve is the only approved XP threshold schedule in
// the repository. Classless heroes use it without legacy class perks/fields.
export function awardClasslessXp(progression, amount) {
  if (!progression || !Number.isInteger(progression.level) || progression.level < 1 ||
    progression.level > C.HERO_XP.length || !Number.isFinite(progression.xp) || progression.xp < 0 ||
    !Number.isInteger(progression.ap) || progression.ap < 0 ||
    !Number.isInteger(progression.sp) || progression.sp < 0 ||
    !Array.isArray(progression.ownedNodeIds) || !Number.isFinite(amount) || amount < 0) {
    return { ok: false, reason: "invalid_progression_or_xp" };
  }
  const xp = progression.xp + amount;
  const level = Math.max(progression.level, C.heroLevelForXp(xp));
  const gainedLevels = level - progression.level;
  return {
    ok: true,
    progression: {
      ...progression,
      xp,
      level,
      ap: progression.ap + gainedLevels,
      sp: progression.sp + gainedLevels,
    },
  };
}

// SP modifies the stored classless base attributes once; combat consumers read
// combat.stats, so saves/reloads cannot compound a derived bonus.
export function allocateClasslessStat(hero, stat) {
  if (!hero || typeof hero !== "object" || hero.cls || !hero.identity?.id ||
    !hero.combat?.stats || !hero.progression || !Number.isInteger(hero.progression.sp) ||
    hero.progression.sp <= 0 || !["attack", "defense", "agility", "intelligence"].includes(stat) ||
    !Number.isInteger(hero.combat.stats[stat])) return { ok: false, reason: "invalid_allocation" };
  return {
    ok: true,
    hero: {
      ...hero,
      combat: { ...hero.combat, stats: { ...hero.combat.stats, [stat]: hero.combat.stats[stat] + 1 } },
      progression: { ...hero.progression, sp: hero.progression.sp - 1 },
    },
  };
}
