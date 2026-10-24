import * as C from "../combat/config";
import { rollLoot } from "./items";
import { BOSS_RANK_SCALING, BOSS_ROTATION, bossForRank } from "./regions";

// Later encounters in the same region hit a little harder.
const DEPTH_SCALE_PER_ENCOUNTER = 0.06;

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

// Build the `wave` object the combat engine expects for one encounter.
// Shape matches Demonanic's buildWave output: { enemies, total, groups, hasBoss },
// plus Gauntlet's lootTier and the scale used for any minions summoned mid-fight.
// In a boss-rotation region the final encounter's boss follows the guild's boss rank.
export function buildEncounter(region, encounterIndex, { bossRank = 0 } = {}) {
  const template = region?.encounters?.[encounterIndex];
  if (!template) throw new RangeError(`No encounter ${encounterIndex} in region ${region?.id}`);
  const depth = 1 + DEPTH_SCALE_PER_ENCOUNTER * encounterIndex;
  const bossFight = !!region.bossRotation && encounterIndex === region.encounters.length - 1;
  const rank = bossFight ? Math.max(0, bossRank) : 0;
  const squad = bossFight ? template.map((key) => (C.ENEMIES[key]?.boss ? bossForRank(rank) : key)) : template;
  const scale = {
    hp: region.hpScale * depth * BOSS_RANK_SCALING.hpGrowth ** rank,
    dmg: region.dmgScale * depth * BOSS_RANK_SCALING.dmgGrowth ** rank,
  };
  return assembleWave(squad, scale, region.tier + (bossFight ? Math.floor(rank / 2) : 0));
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
