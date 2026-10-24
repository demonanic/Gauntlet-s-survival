import * as C from "../combat/config";
import { rollLoot } from "./items";
import { BOSS_RANK_SCALING, BOSS_ROTATION, bossForRank } from "./regions";

// Enemies get tougher the deeper into an expedition the party is: +30% HP and
// damage by the time the timer runs out. The end boss fights at full depth.
const DEPTH_SCALE_AT_END = 0.3;

// Endless Rift wave curve (wave 1 is the first wave). Like boss ranks it
// compounds, so every party is eventually overrun.
export const ENDLESS = Object.freeze({
  hpBase: 0.8, hpGrowth: 1.1,
  dmgBase: 0.8, dmgGrowth: 1.07,
  eliteEvery: 5, bossEvery: 10,
  maxSquad: 8,
  wavesPerLootTier: 5,
});
const ENDLESS_POOLS = [
  { fromWave: 1, enemies: ["goblin", "ghost", "slime"] },
  { fromWave: 4, enemies: ["skeleton", "orc"] },
  { fromWave: 8, enemies: ["reaper", "darkElf", "warlock"] },
];

let enemySequence = 0;
const nextEnemyId = () => { enemySequence += 1; return enemySequence; };

function weightedPick(weights, rng) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  let roll = rng() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

// Build the `wave` object the combat engine expects for one encounter.
// Shape matches Demonanic's buildWave output: { enemies, total, groups, hasBoss },
// plus Gauntlet's lootTier and the scale used for any minions summoned mid-fight.

// A random squad from the region's wildlife. `progress` is how far through
// the expedition timer the party is (0 to 1).
export function buildWildEncounter(region, progress = 0, rng = Math.random) {
  const wildlife = region?.wildlife;
  if (!wildlife) throw new RangeError(`Region ${region?.id} has no wildlife`);
  const [min, max] = wildlife.squad;
  const size = min + Math.floor(rng() * (max - min + 1 + Math.min(1, progress)));
  const squad = Array.from({ length: Math.min(size, max + 1) }, () => weightedPick(wildlife.pool, rng));
  if (rng() < (wildlife.eliteChance || 0)) squad[0] = "lieutenant";
  const depth = 1 + DEPTH_SCALE_AT_END * Math.max(0, Math.min(1, progress));
  return assembleWave(squad, { hp: region.hpScale * depth, dmg: region.dmgScale * depth }, region.tier);
}

// The region's end boss. In a boss-rotation region the boss follows the
// guild's boss rank, and each rank compounds its difficulty and loot tier.
export function buildBossEncounter(region, bossRank = 0) {
  if (!region?.boss) throw new RangeError(`Region ${region?.id} has no boss`);
  const rank = region.bossRotation ? Math.max(0, bossRank) : 0;
  const squad = region.boss.map((key) => (region.bossRotation && C.ENEMIES[key]?.boss ? bossForRank(rank) : key));
  const depth = 1 + DEPTH_SCALE_AT_END;
  const scale = {
    hp: region.hpScale * depth * BOSS_RANK_SCALING.hpGrowth ** rank,
    dmg: region.dmgScale * depth * BOSS_RANK_SCALING.dmgGrowth ** rank,
  };
  return assembleWave(squad, scale, region.tier + Math.floor(rank / 2));
}

// A short description of a squad for the adventure feed: "3 Skeletons and a Ghost".
export function describeSquad(wave) {
  const counts = new Map();
  for (const enemy of wave.enemies) counts.set(enemy.name, (counts.get(enemy.name) || 0) + 1);
  const parts = [...counts].map(([name, count]) => (count > 1 ? `${count} ${name}s` : `a ${name}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] || "nothing";
}

// One Endless Rift wave. Squads grow, then tougher enemy types join; every 5th
// wave adds a lieutenant and every 10th wave brings a boss from the rotation.
export function buildEndlessWave(waveNumber, rng = Math.random) {
  const n = Math.max(1, Math.floor(waveNumber));
  const pool = ENDLESS_POOLS.filter((entry) => n >= entry.fromWave).flatMap((entry) => entry.enemies);
  const size = Math.min(ENDLESS.maxSquad, 3 + Math.floor(n / 2));
  const squad = Array.from({ length: size }, () => pool[Math.floor(rng() * pool.length)]);
  if (n % ENDLESS.bossEvery === 0) {
    squad.splice(0, 3, BOSS_ROTATION[(n / ENDLESS.bossEvery - 1) % BOSS_ROTATION.length]);
  } else if (n % ENDLESS.eliteEvery === 0) {
    squad[0] = "lieutenant";
  }
  const scale = {
    hp: ENDLESS.hpBase * ENDLESS.hpGrowth ** (n - 1),
    dmg: ENDLESS.dmgBase * ENDLESS.dmgGrowth ** (n - 1),
  };
  return { ...assembleWave(squad, scale, 1 + Math.floor((n - 1) / ENDLESS.wavesPerLootTier)), waveNumber: n };
}

function assembleWave(squad, scale, lootTier) {
  const enemies = squad.map((key) => makeEnemy(C.ENEMIES[key], scale.hp, scale.dmg));
  return { enemies, total: enemies.length, groups: 1, hasBoss: enemies.some((enemy) => enemy.boss), lootTier, scale };
}

function makeEnemy(base, hpScale, dmgScale) {
  if (!base) throw new TypeError("Unknown enemy type in encounter");
  const maxHp = Math.round(base.hp * hpScale);
  return {
    id: nextEnemyId(), type: base.key, name: base.name, tier: base.tier,
    hp: maxHp, maxHp, speed: base.speed, damage: base.damage * dmgScale,
    color: base.color, floats: !!base.floats, magicImmune: !!base.magicImmune,
    boss: !!base.boss, group: 0, objective: "squad",
    affinities: { ...(base.affinities || {}) },
    ...(base.attackRange ? { attackRange: base.attackRange } : {}),
    ...(base.splashRadius ? { splashRadius: base.splashRadius } : {}),
  };
}

// Minions a boss summons mid-fight are fodder: weaker than the wave they join.
const MINION_SCALE = Object.freeze({ hp: 0.6, dmg: 0.7 });

// Disposable battle state handed to the engine. The engine mutates it (hero HP,
// gold per kill, equipment drops), so it never aliases the saved guild state.
// Loot and summoned minions follow the current wave's lootTier and scale.
export function createEncounterSim(party, regionTier, wave = null) {
  const sim = {
    heroes: structuredClone(party),
    towers: [],
    barricades: [],
    buildings: {},
    wave: regionTier,
    morale: 50,
    gold: 0,
    vault: [],
    kills: { total: 0, byType: {} },
    lootTier: wave?.lootTier ?? regionTier,
    minionScale: wave?.scale ?? { hp: 1, dmg: 1 },
  };
  sim.rollDrop = (enemy) => rollLoot(enemy, sim.lootTier);
  sim.makeMinion = (type) => makeEnemy(C.ENEMIES[type] || C.ENEMIES.skeleton,
    sim.minionScale.hp * MINION_SCALE.hp, sim.minionScale.dmg * MINION_SCALE.dmg);
  return sim;
}

// Engine `nextWave` callback for an Endless Rift fight: builds the next wave
// and moves the sim's loot tier and minion scale along with it.
export function endlessWaveSource(sim, rng = Math.random) {
  return (wavesCleared) => {
    const wave = buildEndlessWave(wavesCleared + 1, rng);
    sim.lootTier = wave.lootTier;
    sim.minionScale = wave.scale;
    return wave;
  };
}
