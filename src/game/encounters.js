import * as C from "../combat/config";

// Later encounters in the same region hit a little harder.
const DEPTH_SCALE_PER_ENCOUNTER = 0.06;

// Build the `wave` object the combat engine expects for one encounter.
// Shape matches Demonanic's buildWave output: { enemies, total, groups, hasBoss }.
export function buildEncounter(region, encounterIndex) {
  const squad = region?.encounters?.[encounterIndex];
  if (!squad) throw new RangeError(`No encounter ${encounterIndex} in region ${region?.id}`);
  const depth = 1 + DEPTH_SCALE_PER_ENCOUNTER * encounterIndex;
  const enemies = squad.map((key, id) => makeEnemy(id, C.ENEMIES[key], region.hpScale * depth, region.dmgScale * depth));
  return { enemies, total: enemies.length, groups: 1, hasBoss: enemies.some((enemy) => enemy.boss) };
}

function makeEnemy(id, base, hpScale, dmgScale) {
  if (!base) throw new TypeError("Unknown enemy type in encounter");
  const maxHp = Math.round(base.hp * hpScale);
  return {
    id, type: base.key, name: base.name, tier: base.tier,
    hp: maxHp, maxHp, speed: base.speed, damage: base.damage * dmgScale,
    color: base.color, floats: !!base.floats, magicImmune: !!base.magicImmune,
    boss: !!base.boss, group: 0, objective: "squad",
    affinities: { ...(base.affinities || {}) },
    ...(base.attackRange ? { attackRange: base.attackRange } : {}),
  };
}

// Disposable battle state handed to the engine. The engine mutates it (hero HP,
// gold per kill, equipment drops), so it never aliases the saved guild state.
export function createEncounterSim(party, regionTier) {
  return {
    heroes: structuredClone(party),
    towers: [],
    barricades: [],
    buildings: {},
    wave: regionTier,
    morale: 50,
    gold: 0,
    vault: [],
    kills: { total: 0, byType: {} },
  };
}
