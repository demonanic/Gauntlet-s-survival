import * as C from "../combat/config";
import { LEGENDARY, legendName } from "./adventure";
import { constrainSquad, fillEcology, rollEcology } from "./ecology";
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
  { fromWave: 8, enemies: ["reaper", "darkElf", "warlock", "bulwark"] },
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
// plus Gauntlet's lootTier, the scale used for any minions summoned mid-fight,
// and the region's gear set (`set`), which its drops can belong to.

// A random squad from the region's wildlife. `progress` is how far through
// the expedition timer the party is (0 to 1).
// Some regions field a tactical composition instead (ecology.js); pass
// `ecology: false` for a squad that must stay ordinary (tutorial, escorts).
export function buildWildEncounter(region, progress = 0, rng = Math.random, { ecology = true } = {}) {
  const wildlife = region?.wildlife;
  if (!wildlife) throw new RangeError(`Region ${region?.id} has no wildlife`);
  const template = ecology ? rollEcology(wildlife, rng) : null;
  let squad;
  if (template) {
    squad = fillEcology(template, wildlife.pool, rng);
  } else {
    const [min, max] = wildlife.squad;
    const size = min + Math.floor(rng() * (max - min + 1 + Math.min(1, progress)));
    squad = Array.from({ length: Math.min(size, max + 1) }, () => weightedPick(wildlife.pool, rng));
    if (rng() < (wildlife.eliteChance || 0)) squad[0] = "lieutenant";
  }
  squad = constrainSquad(squad, wildlife.pool, rng);
  const depth = 1 + DEPTH_SCALE_AT_END * Math.max(0, Math.min(1, progress));
  return {
    ...assembleWave(squad, { hp: region.hpScale * depth, dmg: region.dmgScale * depth }, region.tier),
    set: region.set || null,
    ...(template ? { ecology: template } : {}),
  };
}

// A legendary monster: the toughest creature in the region's wildlife, grown
// huge (LEGENDARY hp and damage), with two ordinary followers and better loot.
export function buildLegendaryEncounter(region, progress = 0, rng = Math.random) {
  const wave = buildWildEncounter({ ...region, wildlife: { ...region.wildlife, squad: [2, 2], eliteChance: 0 } }, progress, rng, { ecology: false });
  const toughest = Object.keys(region.wildlife.pool).sort((a, b) => C.ENEMIES[b].hp - C.ENEMIES[a].hp)[0];
  const depth = 1 + DEPTH_SCALE_AT_END * Math.max(0, Math.min(1, progress));
  const legend = makeEnemy(C.ENEMIES[toughest], region.hpScale * depth * LEGENDARY.hp, region.dmgScale * depth * LEGENDARY.dmg);
  legend.name = legendName(C.ENEMIES[toughest].name, rng);
  legend.tier = "elite";
  legend.legendary = true;
  // Legends combine archetypes: whatever they were, they now hunt the wounded.
  legend.families = [...new Set([...legend.families, "hunter", "predator"])];
  wave.enemies.unshift(legend);
  return { ...wave, total: wave.enemies.length, lootTier: region.tier + 1, legendary: true };
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
  return { ...assembleWave(squad, scale, region.tier + Math.floor(rank / 2)), set: region.set || null };
}

// A short description of a squad for the adventure feed: "3 Skeletons and a Ghost".
export function describeSquad(wave) {
  const counts = new Map();
  for (const enemy of wave.enemies) counts.set(enemy.name, (counts.get(enemy.name) || 0) + 1);
  const parts = [...counts].map(([name, count]) => (count > 1 ? `${count} ${name}s` : `${/^[AEIOU]/i.test(name) ? "an" : "a"} ${name}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] || "nothing";
}

// Something that has been following the party: a Stalker and one of the
// region's creatures, at the expedition's current depth.
export function buildStalkerEncounter(region, progress = 0, rng = Math.random) {
  const wave = buildWildEncounter({ ...region, wildlife: { ...region.wildlife, squad: [1, 1], eliteChance: 0 } }, progress, rng, { ecology: false });
  const depth = 1 + DEPTH_SCALE_AT_END * Math.max(0, Math.min(1, progress));
  wave.enemies.unshift(makeEnemy(C.ENEMIES.stalker, region.hpScale * depth, region.dmgScale * depth));
  return { ...wave, total: wave.enemies.length };
}

// One Endless Rift wave. Squads grow, then tougher enemy types join; every 5th
// wave adds a lieutenant and every 10th wave brings a boss from the rotation.
export function buildEndlessWave(waveNumber, rng = Math.random) {
  const n = Math.max(1, Math.floor(waveNumber));
  const pool = ENDLESS_POOLS.filter((entry) => n >= entry.fromWave).flatMap((entry) => entry.enemies);
  const size = Math.min(ENDLESS.maxSquad, 3 + Math.floor(n / 2));
  const squad = constrainSquad(Array.from({ length: size }, () => pool[Math.floor(rng() * pool.length)]),
    Object.fromEntries(pool.map((key) => [key, 1])), rng);
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
    ...(base.bomber ? { bomber: true } : {}),
    ...(base.shield ? { shield: { ...base.shield } } : {}),
    families: [...(C.ENEMY_FAMILIES[base.key] || [])],
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
    set: wave?.set ?? null,
  };
  sim.rollDrop = (enemy) => rollLoot(enemy, sim.lootTier, Math.random, { set: sim.set });
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
