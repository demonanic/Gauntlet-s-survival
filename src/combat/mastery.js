// Mastery: heroes get better at what they actually do. Special moves the
// player lands, weapon hits, dodges and backstabs each count toward a rank,
// I to V, like spells (spells.js). Rank I gives nothing; each rank above it
// adds a small bonus. Counts are kept on the hero (hero.mastery) and grow
// after every fight, watched or not. Owner-approved (Nov 2026).
//
// A backstab is a melee weapon hit on a foe that isn't fighting this hero, or
// a Phantom Strike (which lands behind its target).
import { WEAPON_PROFILES } from "./gear";

export const MASTERY = Object.freeze({
  // Uses or hits needed for ranks I-V.
  moveCounts: Object.freeze([0, 15, 45, 100, 200]),
  weaponCounts: Object.freeze([0, 300, 1000, 2500, 5000]),
  dodgeCounts: Object.freeze([0, 40, 120, 300, 600]),
  backstabCounts: Object.freeze([0, 100, 300, 750, 1500]),
  // Per rank above I.
  movePower: 0.05, // a move's damage, healing, shield or duration
  moveCooldown: 0.03, // a move's cooldown
  weaponDamage: 0.02, // weapon hits with that kind of weapon
  bowCrit: 0.005, // bows only
  dodge: 0.005, // still under the agility dodge cap
  backstabDamage: 0.04,
});

export const MASTERY_ROMAN = Object.freeze(["I", "II", "III", "IV", "V"]);

export function masteryRank(count, table) {
  let rank = 1;
  table.forEach((needed, index) => { if ((Number(count) || 0) >= needed) rank = index + 1; });
  return rank;
}

// Count needed for the next rank, or null at V.
export function nextMasteryCount(count, table) {
  return table.find((needed) => needed > (Number(count) || 0)) ?? null;
}

const count = (value) => Math.max(0, Math.floor(Number(value) || 0));
const counts = (saved) => Object.fromEntries(Object.entries(saved && typeof saved === "object" ? saved : {})
  .map(([key, value]) => [key, count(value)]).filter(([, value]) => value > 0));

// A saved hero's mastery, repaired; null when they have none yet.
export function normalizeMastery(saved) {
  if (!saved || typeof saved !== "object") return null;
  const mastery = {
    moves: counts(saved.moves),
    weapons: Object.fromEntries(Object.entries(counts(saved.weapons)).filter(([key]) => WEAPON_PROFILES[key])),
    dodges: count(saved.dodges),
    backstabs: count(saved.backstabs),
  };
  const empty = !Object.keys(mastery.moves).length && !Object.keys(mastery.weapons).length && !mastery.dodges && !mastery.backstabs;
  return empty ? null : mastery;
}

export function heroMastery(hero) {
  return normalizeMastery(hero?.mastery) || { moves: {}, weapons: {}, dodges: 0, backstabs: 0 };
}

export const moveRank = (hero, id) => masteryRank(heroMastery(hero).moves[id], MASTERY.moveCounts);
export const weaponRank = (hero, type) => masteryRank(heroMastery(hero).weapons[type], MASTERY.weaponCounts);
export const dodgeRank = (hero) => masteryRank(heroMastery(hero).dodges, MASTERY.dodgeCounts);
export const backstabRank = (hero) => masteryRank(heroMastery(hero).backstabs, MASTERY.backstabCounts);

// The fight bonuses a hero's mastery gives, for the engine's derived stats.
// `weaponType` is the weapon they fight with this fight.
export function masteryEffects(hero, weaponType) {
  const weapon = WEAPON_PROFILES[weaponType] ? weaponRank(hero, weaponType) - 1 : 0;
  return {
    weaponDamage: MASTERY.weaponDamage * weapon,
    critChance: weaponType === "bow" ? MASTERY.bowCrit * weapon : 0,
    dodge: MASTERY.dodge * (dodgeRank(hero) - 1),
    backstabDamage: MASTERY.backstabDamage * (backstabRank(hero) - 1),
  };
}

// Numbers on a move definition a rank scales up (damage, healing, shields,
// buff size and duration), and the cooldown it shortens.
const MOVE_SCALED = ["damageMultiplier", "adjacentDamageMultiplier", "healMaxHpFraction", "absorb", "durationSeconds",
  "attackSpeedBonus", "nextHitDamageBonus"];

export function masteredMove(definition, rank) {
  if (!definition || rank <= 1) return definition;
  const scale = 1 + MASTERY.movePower * (rank - 1);
  const scaled = { ...definition };
  for (const key of MOVE_SCALED) if (Number.isFinite(definition[key])) scaled[key] = definition[key] * scale;
  if (Number.isFinite(definition.cooldownSeconds)) scaled.cooldownSeconds = definition.cooldownSeconds * (1 - MASTERY.moveCooldown * (rank - 1));
  return scaled;
}

// Fold one fight into a hero's mastery. `battleStats` is what the engine
// tallied (moveUses, meleeHits, rangedHits, dodges, backstabs); `weaponType`
// what they fought with. Mutates `hero`; returns rank-ups as
// [{ kind: "move" | "weapon" | "dodge" | "backstab", id, rank }].
export function recordMastery(hero, battleStats = {}, weaponType = null) {
  const before = heroMastery(hero);
  const after = structuredClone(before);
  for (const [id, uses] of Object.entries(battleStats?.moveUses || {})) after.moves[id] = (after.moves[id] || 0) + count(uses);
  const hits = count(battleStats?.meleeHits) + count(battleStats?.rangedHits);
  if (WEAPON_PROFILES[weaponType] && hits) after.weapons[weaponType] = (after.weapons[weaponType] || 0) + hits;
  after.dodges += count(battleStats?.dodges);
  after.backstabs += count(battleStats?.backstabs);
  const normalized = normalizeMastery(after);
  if (!normalized) return [];
  hero.mastery = normalized;
  const ups = [];
  for (const id of Object.keys(after.moves)) {
    const rank = masteryRank(after.moves[id], MASTERY.moveCounts);
    if (rank > masteryRank(before.moves[id], MASTERY.moveCounts)) ups.push({ kind: "move", id, rank });
  }
  for (const type of Object.keys(after.weapons)) {
    const rank = masteryRank(after.weapons[type], MASTERY.weaponCounts);
    if (rank > masteryRank(before.weapons[type], MASTERY.weaponCounts)) ups.push({ kind: "weapon", id: type, rank });
  }
  for (const [kind, key, table] of [["dodge", "dodges", MASTERY.dodgeCounts], ["backstab", "backstabs", MASTERY.backstabCounts]]) {
    const rank = masteryRank(after[key], table);
    if (rank > masteryRank(before[key], table)) ups.push({ kind, id: kind, rank });
  }
  return ups;
}
