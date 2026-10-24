import { classlessMaxHp } from "./classlessCombatEffects";

export const NEON_IDENTITY_COLORS = Object.freeze([
  "#22D3EE", "#F02DCA", "#A855F7", "#2563EB",
  "#EF4444", "#F97316", "#22C55E", "#EAB308",
  "#EC4899", "#14B8A6", "#A3E635", "#F8FAFC",
]);

export function isNeonIdentityColor(value) {
  return NEON_IDENTITY_COLORS.includes(value);
}

export function randomNeonIdentityColor(rng = Math.random) {
  const random = typeof rng === "function" ? Number(rng()) : 0;
  const index = Math.min(NEON_IDENTITY_COLORS.length - 1,
    Math.max(0, Math.floor((Number.isFinite(random) ? random : 0) * NEON_IDENTITY_COLORS.length)));
  return NEON_IDENTITY_COLORS[index];
}

function migratedIdentityColor(hero) {
  const source = hero.identity?.id || hero.id || [hero.cls || hero.key || "hero", hero.name || ""].join(":");
  let hash = 2166136261;
  for (const character of String(source)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return NEON_IDENTITY_COLORS[(hash >>> 0) % NEON_IDENTITY_COLORS.length];
}

// Backward-compatible visual-only migration. Returns an unchanged hero when
// it already has a valid color. Older saves use a stable identity hash, so
// repeated loads before the next save cannot reroll their migration color.
export function ensureHeroIdentityColor(hero) {
  if (!hero || typeof hero !== "object" || Array.isArray(hero)) return hero;
  if (isNeonIdentityColor(hero.appearance?.identityColor)) return hero;
  const appearance = hero.appearance && typeof hero.appearance === "object" && !Array.isArray(hero.appearance)
    ? hero.appearance : {};
  return { ...hero, appearance: { ...appearance, identityColor: migratedIdentityColor(hero) } };
}

// Authoritative starting combat profile for newly created classless heroes.
// Appearance and progression are deliberately separate from combat identity.
export const HERO_BASELINE = Object.freeze({
  hp: 300,
  stats: Object.freeze({ attack: 10, defense: 10, agility: 10, intelligence: 10 }),
  basicAttack: Object.freeze({
    damage: 16,
    intervalSeconds: 1.05,
    range: 220,
    rangeMode: "midline",
    movementSpeed: 155,
    targetPolicy: "nearest_valid_retain_reacquire",
    targetTieBreak: "stable_spawn_order",
    criticalChance: 0.05,
    criticalDamageMultiplier: 1.5,
    dodgeChance: 0.05,
  }),
  sharedStrike: Object.freeze({
    id: "shared_strike",
    damageMultiplier: 1.5,
    damageCategory: "weapon",
    targetMode: "single_valid_target",
    cooldownSeconds: 12,
    resourceCost: 0,
    effects: Object.freeze({
      stun: false,
      slow: false,
      healing: false,
      areaDamage: false,
      summon: false,
      damageTypeConversion: false,
    }),
  }),
});

let heroSequence = 0;

function newHeroId() {
  heroSequence += 1;
  return `hero-${Date.now().toString(36)}-${heroSequence.toString(36)}`;
}

export function createHeroModel(options = {}) {
  options = options && typeof options === "object" ? options : {};
  const id = typeof options.id === "string" && options.id.trim() ? options.id.trim() : newHeroId();
  const name = typeof options.name === "string" && options.name.trim() ? options.name.trim() : "Hero";
  const appearanceId = typeof options.appearanceId === "string" && options.appearanceId.trim()
    ? options.appearanceId.trim()
    : null;
  const identityColor = isNeonIdentityColor(options.identityColor)
    ? options.identityColor
    : randomNeonIdentityColor(options.rng);

  return {
    identity: { id, name },
    appearance: { id: appearanceId, identityColor },
    combat: {
      hp: HERO_BASELINE.hp,
      maxHp: HERO_BASELINE.hp,
      stats: { ...HERO_BASELINE.stats },
      basicAttack: { ...HERO_BASELINE.basicAttack },
      capabilities: {
        sharedStrike: {
          ...HERO_BASELINE.sharedStrike,
          effects: { ...HERO_BASELINE.sharedStrike.effects },
        },
      },
    },
    progression: {
      level: 1,
      xp: 0,
      ap: 0,
      sp: 0,
      ownedNodeIds: [],
    },
  };
}

// Pure update: a rejected appearance change never mutates or partially copies
// the supplied hero. Null clears the configurable appearance selection.
export function withHeroAppearance(hero, appearanceId) {
  if (!hero || typeof hero !== "object" || !hero.identity || !hero.combat || !hero.progression) {
    return { ok: false, reason: "invalid_hero" };
  }
  if (appearanceId !== null && (typeof appearanceId !== "string" || !appearanceId.trim())) {
    return { ok: false, reason: "invalid_appearance" };
  }
  return {
    ok: true,
    hero: { ...hero, appearance: { ...(hero.appearance || {}), id: appearanceId?.trim() || null } },
  };
}

// Persistence adapter for the pre-combat classless model. It preserves known
// extensions while repairing malformed optional fields from the approved baseline.
export function normalizeClasslessHero(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid classless hero");
  const hero = JSON.parse(JSON.stringify(input));
  const identity = hero.identity && typeof hero.identity === "object" ? hero.identity : {};
  const combat = hero.combat && typeof hero.combat === "object" ? hero.combat : {};
  const progression = hero.progression && typeof hero.progression === "object" ? hero.progression : {};
  const numeric = (value, fallback, min = 0) => value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= min ? Number(value) : fallback;
  const stats = combat.stats && typeof combat.stats === "object" ? combat.stats : {};
  const attack = combat.basicAttack && typeof combat.basicAttack === "object" ? combat.basicAttack : {};
  const appearance = hero.appearance && typeof hero.appearance === "object" ? hero.appearance : {};
  const baseMaxHp = numeric(combat.maxHp, HERO_BASELINE.hp, 1);
  hero.identity = {
    ...identity,
    id: typeof identity.id === "string" && identity.id.trim() ? identity.id.trim() : newHeroId(),
    name: typeof identity.name === "string" && identity.name.trim() ? identity.name.trim() : "Hero",
  };
  hero.appearance = {
    ...appearance,
    id: typeof appearance.id === "string" && appearance.id.trim() ? appearance.id.trim() : null,
    identityColor: isNeonIdentityColor(appearance.identityColor)
      ? appearance.identityColor : migratedIdentityColor(hero),
  };
  hero.combat = {
    ...combat,
    hp: Math.min(numeric(combat.hp, HERO_BASELINE.hp), classlessMaxHp({ combat: { maxHp: baseMaxHp }, progression })),
    maxHp: baseMaxHp,
    stats: { ...stats, ...Object.fromEntries(Object.entries(HERO_BASELINE.stats).map(([key, base]) => [key, numeric(stats[key], base)])) },
    basicAttack: {
      ...attack,
      damage: numeric(attack.damage, HERO_BASELINE.basicAttack.damage, 0.01),
      intervalSeconds: numeric(attack.intervalSeconds, HERO_BASELINE.basicAttack.intervalSeconds, 0.01),
      range: numeric(attack.range, HERO_BASELINE.basicAttack.range, 0),
      rangeMode: typeof attack.rangeMode === "string" && attack.rangeMode ? attack.rangeMode : HERO_BASELINE.basicAttack.rangeMode,
      movementSpeed: numeric(attack.movementSpeed, HERO_BASELINE.basicAttack.movementSpeed, 0),
      targetPolicy: typeof attack.targetPolicy === "string" && attack.targetPolicy ? attack.targetPolicy : HERO_BASELINE.basicAttack.targetPolicy,
      targetTieBreak: typeof attack.targetTieBreak === "string" && attack.targetTieBreak ? attack.targetTieBreak : HERO_BASELINE.basicAttack.targetTieBreak,
      criticalChance: numeric(attack.criticalChance, HERO_BASELINE.basicAttack.criticalChance, 0),
      criticalDamageMultiplier: numeric(attack.criticalDamageMultiplier, HERO_BASELINE.basicAttack.criticalDamageMultiplier, 1),
      dodgeChance: numeric(attack.dodgeChance, HERO_BASELINE.basicAttack.dodgeChance, 0),
    },
    capabilities: {
      ...(combat.capabilities && typeof combat.capabilities === "object" ? combat.capabilities : {}),
      sharedStrike: {
        ...HERO_BASELINE.sharedStrike,
        effects: { ...HERO_BASELINE.sharedStrike.effects },
      },
    },
  };
  hero.progression = {
    ...progression,
    level: Math.floor(numeric(progression.level, 1, 1)),
    xp: numeric(progression.xp, 0), ap: numeric(progression.ap, 0), sp: numeric(progression.sp, 0),
    ownedNodeIds: Array.isArray(progression.ownedNodeIds) ? progression.ownedNodeIds.filter((id) => typeof id === "string") : [],
  };
  return hero;
}

// JSON-compatible snapshot for the existing profile API. JSON.stringify is
// intentionally performed before any caller state is touched.
export function serializeGameState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new TypeError("Invalid game state");
  const serialized = JSON.stringify(state);
  if (serialized === undefined) throw new TypeError("Game state is not serializable");
  return JSON.parse(serialized);
}
