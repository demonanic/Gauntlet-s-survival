import * as C from "../combat/config";
import { LEGENDARY, legendName } from "./adventure";
import { constrainSquad, fillEcology, rollEcology } from "./ecology";
import { luckEffects, partyLuck } from "../combat/luck";
import { NEMESIS, nemesisStats } from "./nemesis";
import { rollLoot } from "./items";
import { defaultRandom } from "./random";
import { BOSS_ROTATION, CHAMPIONS, bossForRank, bossRankScale, championFor } from "./regions";

// Enemies get tougher the deeper into an expedition the party is: +30% HP and
// damage by the time the timer runs out. The end boss fights at full depth.
const DEPTH_SCALE_AT_END = 0.3;

// Waves in an ordinary encounter, unless the region says otherwise.
export const ENCOUNTER_WAVES = 3;

// Combat pacing, applied to every enemy on top of the region's scales: more
// HP and softer blows, so a fight lasts long enough (60-90 s for an ordinary
// encounter) for heroes to use their abilities several times, without each
// hit being more dangerous. Bosses were already built for long fights, so
// they get their own, smaller factors (aiming at about 2-3 minutes).
export const COMBAT_PACING = Object.freeze({ hp: 2.6, dmg: 0.45, bossHp: 1.1, bossDmg: 0.45 });

// Endless Rift wave curve (wave 1 is the first wave). Like boss ranks it
// compounds, so every party is eventually overrun.
export const ENDLESS = Object.freeze({
  hpBase: 0.8, hpGrowth: 1.1,
  dmgBase: 0.8, dmgGrowth: 1.07,
  eliteEvery: 5, bossEvery: 10,
  maxSquad: 8,
  wavesPerLootTier: 5,
});
export const ENDLESS_POOLS = Object.freeze([
  { fromWave: 1, enemies: ["goblin", "ghost", "slime"] },
  { fromWave: 4, enemies: ["skeleton", "orc"] },
  { fromWave: 8, enemies: ["reaper", "darkElf", "warlock", "bulwark"] },
]);

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
//
// Hordes (owner's design, Nov 2026): a random event that takes the place of
// about `chance` of wild fights from `fromRegion` on, and can't be avoided.
// `count` zombies (C.ENEMIES.zombie: about 40% of an ordinary foe's HP and 60%
// of its damage) pour in from the top and both sides, one every `spawnEvery`
// s, at most `onField` at once. Winning pays `gold` and `xp` times a wild
// fight's, plus a chest (expedition.js).
export const HORDE = Object.freeze({
  enemy: "zombie", count: Object.freeze([35, 50]), onField: 18, spawnEvery: 0.3,
  chance: 1 / 8, fromRegion: "frostfang", gold: 2, xp: 1.5, chestGold: Object.freeze([60, 120]),
});

// The Dead March (owner's design, Nov 2026): an endless run like the Rift,
// but horde after horde of zombies. Wave n has `count.first` zombies plus
// `count.step` a wave (at most `count.max`); every `surgeEvery`th wave is a
// surge with `surge` times as many (at most `surgeMax`). HP and damage grow
// like the Rift's (ENDLESS growth) from `hpBase` and `dmgBase`. Bounty:
// `bounty` gold a wave cleared, and a chest every `chestEvery` waves.
export const MARCH = Object.freeze({
  count: Object.freeze({ first: 20, step: 3, max: 60 }),
  surgeEvery: 5, surge: 1.5, surgeMax: 80,
  hpBase: 1, dmgBase: 1,
  bounty: 15, chestEvery: 5, chestGold: Object.freeze([40, 80]),
  firstLootTier: 2,
});

// Dead March wave `n` (1 is the first).
export function buildMarchWave(n, rng = Math.random, threat = { hp: 1, dmg: 1 }) {
  const surge = n % MARCH.surgeEvery === 0;
  const base = Math.min(MARCH.count.max, MARCH.count.first + MARCH.count.step * (n - 1));
  const count = surge ? Math.min(MARCH.surgeMax, Math.round(base * MARCH.surge)) : base;
  const scale = {
    hp: MARCH.hpBase * ENDLESS.hpGrowth ** (n - 1) * threat.hp,
    dmg: MARCH.dmgBase * ENDLESS.dmgGrowth ** (n - 1) * threat.dmg,
  };
  const squad = Array.from({ length: count }, () => HORDE.enemy);
  return {
    ...assembleWave(squad, scale, MARCH.firstLootTier + Math.floor((n - 1) / ENDLESS.wavesPerLootTier)),
    horde: true, fieldCap: HORDE.onField, spawnEvery: HORDE.spawnEvery,
    waveNumber: n, threat, ...(surge ? { surge: true } : {}),
  };
}

// Free Roam (owner's design, Nov 2026): an endless run where every wave is its
// own scenario, a faction's squad with (from wave `hordeFrom`) a horde layer
// behind it. Squads are `squad.first` foes plus one every `squad.every` waves
// (at most `squad.max`), about a third of them the faction's leaders. Horde
// layer odds are `layer`: a trickle of `trickle.count` zombies spread out, or a
// horde of `horde.first` plus `horde.step` a wave (at most `horde.max`). Every
// `bigEvery`th wave is a big event (squad and a full horde); every `bossEvery`th
// a boss leads the squad. HP and damage grow like the Rift's.
export const ROAM = Object.freeze({
  squad: Object.freeze({ first: 3, every: 3, max: 10 }),
  leaderShare: 1 / 3,
  hordeFrom: 3,
  layer: Object.freeze({ none: 0.4, trickle: 0.35, horde: 0.25 }),
  trickle: Object.freeze({ count: 10, gap: 2.5 }),
  horde: Object.freeze({ first: 20, step: 2, max: 40, gap: 0.3 }),
  squadGap: 0.75,
  zombiesOnField: 12,
  bigEvery: 5, bossEvery: 10,
  hpBase: 0.8, dmgBase: 0.8,
  bounty: 12, chestEvery: 5, chestGold: Object.freeze([40, 80]),
  // Twists: `chance` of a wave from `twistFrom` on (never a boss wave).
  // Warded: grunts take `wardCut` less damage from the party's hits while a
  // leader stands. Late horde: the zombies wait until `lateAt` s. Thieves:
  // a bandit still standing `after` s in runs off with `steal` gold × loot
  // tier. Flanked: the squad comes in from both edges.
  twistFrom: 4, twistChance: 0.3,
  twists: Object.freeze({
    warded: Object.freeze({ wardCut: 0.5 }),
    lateHorde: Object.freeze({ lateAt: 20 }),
    thieves: Object.freeze({ after: 25, steal: 20 }),
    flanked: Object.freeze({}),
  }),
});

// Free Roam factions: who leads (`leaders`, at most `maxLeaders`) and who follows.
export const FACTIONS = Object.freeze([
  { id: "chaos", name: "Chaos", band: "warband", leaders: ["warlock"], grunts: ["orc", "bandit"] },
  { id: "outlaws", name: "Outlaw", band: "gang", leaders: ["bandit"], grunts: ["gnome", "goblin"] },
  { id: "undead", name: "Undead", band: "procession", leaders: ["lesserNecromancer", "carrionPriest"], grunts: ["skeleton", "reaper"] },
  { id: "darkElves", name: "Dark Elf", band: "raiding party", leaders: ["darkElf"], grunts: ["harrier", "watcher"] },
  { id: "iron", name: "Iron Legion", band: "column", leaders: ["lieutenant"], maxLeaders: 1, grunts: ["bulwark", "orc"] },
]);

const plural = (name, count) => (count > 1 ? `${count} ${name}s` : `${/^[AEIOU]/i.test(name) ? "an" : "a"} ${name}`);
const listNames = (keys) => {
  const counts = new Map();
  for (const key of keys) counts.set(C.ENEMIES[key].name, (counts.get(C.ENEMIES[key].name) || 0) + 1);
  const parts = [...counts].map(([name, count]) => plural(name, count));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
};

// The event card for a Free Roam wave: "A Chaos warband of 3 Warlocks and their
// grunts (2 Orcs and a Bandit) attacks, a horde close behind."
const TWIST_LINES = Object.freeze({
  warded: " Their leaders ward the rest: bring them down first.",
  thieves: " Their bandits are after your gold.",
  flanked: " They come at you from both sides.",
});

export function describeRoamEvent({ faction, boss, leaders, grunts, layer, twist }) {
  const f = FACTIONS.find((entry) => entry.id === faction);
  const an = (word) => (/^[AEIOU]/i.test(word) ? "an" : "a");
  const tail = (layer === "horde" ? (twist === "lateHorde" ? ", a horde gathering behind them." : ", a horde close behind.")
    : layer === "trickle" ? (twist === "lateHorde" ? ", the dead gathering behind them." : ", the dead trickling in after them.") : ".")
    + (TWIST_LINES[twist] || "");
  if (boss) {
    const guards = [...leaders, ...grunts];
    const name = C.ENEMIES[boss].name;
    return `${/^The /.test(name) ? name : `The ${name}`} leads ${an(f.name)} ${f.name} ${f.band}${guards.length ? ` (${listNames(guards)})` : ""} into battle${tail}`;
  }
  const followers = grunts.length ? ` and their grunts (${listNames(grunts)})` : "";
  return `${an(f.name) === "an" ? "An" : "A"} ${f.name} ${f.band} of ${listNames(leaders)}${followers} attacks${tail}`;
}

// Free Roam wave `n` (1 is the first).
export function buildRoamWave(n, rng = Math.random, threat = { hp: 1, dmg: 1 }) {
  const faction = FACTIONS[Math.floor(rng() * FACTIONS.length)];
  const size = Math.min(ROAM.squad.max, ROAM.squad.first + Math.floor((n - 1) / ROAM.squad.every));
  const leaderCount = Math.min(faction.maxLeaders ?? size, Math.max(1, Math.round(size * ROAM.leaderShare)));
  const pick = (keys) => keys[Math.floor(rng() * keys.length)];
  const bossWave = n % ROAM.bossEvery === 0;
  const bigEvent = !bossWave && n % ROAM.bigEvery === 0;
  const boss = bossWave ? BOSS_ROTATION[(n / ROAM.bossEvery - 1) % BOSS_ROTATION.length] : null;
  // A boss takes the place of three of its squad, as in the Rift.
  const squadSize = bossWave ? Math.max(1, size - 3) : size;
  const leaders = Array.from({ length: Math.min(leaderCount, squadSize) }, () => pick(faction.leaders));
  const grunts = Array.from({ length: squadSize - leaders.length }, () => pick(faction.grunts));
  let layer = "none";
  if (bossWave) layer = "none";
  else if (bigEvent) layer = "horde";
  else if (n >= ROAM.hordeFrom) {
    const roll = rng();
    layer = roll < ROAM.layer.horde ? "horde" : roll < ROAM.layer.horde + ROAM.layer.trickle ? "trickle" : "none";
  }
  // A twist on some waves, from those that fit this one.
  let twist = null;
  if (!bossWave && n >= ROAM.twistFrom && rng() < ROAM.twistChance) {
    const fits = [
      ...(grunts.length ? ["warded"] : []),
      ...(layer !== "none" ? ["lateHorde"] : []),
      ...([...leaders, ...grunts].includes("bandit") ? ["thieves"] : []),
      "flanked",
    ];
    twist = fits[Math.floor(rng() * fits.length)];
  }
  const zombies = roamZombies(layer, n);
  return buildScenarioWave({ faction: faction.id, boss, leaders, grunts, layer, zombies, twist }, n, threat, { bigEvent });
}

// Zombies in a Free Roam horde layer at wave `n`.
export function roamZombies(layer, n) {
  return layer === "horde" ? Math.min(ROAM.horde.max, ROAM.horde.first + ROAM.horde.step * (n - 1))
    : layer === "trickle" ? ROAM.trickle.count : 0;
}

// A scenario as a wave the engine can fight, at Free Roam wave `n`'s strength:
// the squad (boss first) down the lanes, then `zombies` from every side, with
// the scenario's twist. Used by Free Roam and by story battles.
export function buildScenarioWave(scenario, n, threat = { hp: 1, dmg: 1 }, { bigEvent = false } = {}) {
  const { boss = null, leaders = [], grunts = [], layer = "none", zombies = 0, twist = null } = scenario;
  const scale = {
    hp: ROAM.hpBase * ENDLESS.hpGrowth ** (n - 1) * threat.hp,
    dmg: ROAM.dmgBase * ENDLESS.dmgGrowth ** (n - 1) * threat.dmg,
  };
  const squad = [...(boss ? [boss] : []), ...leaders, ...grunts];
  const wave = assembleWave([...squad, ...Array.from({ length: zombies }, () => HORDE.enemy)],
    scale, 1 + Math.floor((n - 1) / ENDLESS.wavesPerLootTier));
  // The squad walks in down the lanes; the zombies come from every side behind it.
  const gap = layer === "trickle" ? ROAM.trickle.gap : ROAM.horde.gap;
  wave.enemies.forEach((enemy, index) => {
    if (index < squad.length) enemy.spawnGap = ROAM.squadGap;
    else { enemy.hordeEntry = true; enemy.spawnGap = gap; }
  });
  const squadFoes = wave.enemies.slice(0, squad.length);
  const leaderFoes = squadFoes.slice(boss ? 1 : 0, (boss ? 1 : 0) + leaders.length);
  if (twist === "warded") {
    for (const enemy of squadFoes) {
      if (leaderFoes.includes(enemy)) enemy.wardSource = true;
      else if (!enemy.boss) enemy.warded = ROAM.twists.warded.wardCut;
    }
  } else if (twist === "lateHorde") {
    // The last of the squad holds the gap until the zombies come.
    squadFoes.at(-1).spawnGap = Math.max(ROAM.squadGap, ROAM.twists.lateHorde.lateAt - ROAM.squadGap * (squad.length - 1));
  } else if (twist === "thieves") {
    for (const enemy of squadFoes) {
      if (enemy.type === "bandit") enemy.thief = { after: ROAM.twists.thieves.after, steal: ROAM.twists.thieves.steal * wave.lootTier };
    }
  } else if (twist === "flanked") {
    for (const enemy of squadFoes) enemy.flank = true;
  }
  const described = { faction: scenario.faction, boss, leaders, grunts, layer, zombies, twist };
  return {
    ...wave,
    fieldCap: squad.length + (zombies ? ROAM.zombiesOnField : 0),
    waveNumber: n, threat, scenario: described, event: describeRoamEvent(described),
    ...(bigEvent ? { bigEvent: true } : {}),
    ...(twist ? { twist } : {}),
  };
}

// The first wave of an endless region (`region.endlessKind`: "rift", "march" or "roam").
export function buildFirstEndlessWave(region, rng = Math.random, threat = { hp: 1, dmg: 1 }) {
  return endlessWave(region?.endlessKind, 1, rng, threat);
}

// Wave `n` of an endless run of `kind` ("rift", "march" or "roam").
export function endlessWave(kind, n, rng = Math.random, threat = { hp: 1, dmg: 1 }) {
  if (kind === "march") return buildMarchWave(n, rng, threat);
  if (kind === "roam") return buildRoamWave(n, rng, threat);
  return buildEndlessWave(n, rng, threat);
}

// A horde for `region`, scaled like its wild squads at `progress` (0-1).
export function buildHordeEncounter(region, progress = 0, rng = Math.random) {
  const [min, max] = HORDE.count;
  const count = min + Math.floor(rng() * (max - min + 1));
  const depth = 1 + DEPTH_SCALE_AT_END * Math.max(0, Math.min(1, progress));
  const squad = Array.from({ length: count }, () => HORDE.enemy);
  return {
    ...assembleWave(squad, { hp: region.hpScale * depth, dmg: region.dmgScale * depth }, region.tier),
    horde: true, fieldCap: HORDE.onField, spawnEvery: HORDE.spawnEvery, set: region.set || null,
  };
}

// An encounter comes in `waves` (default: the region's `wildlife.waves`, else
// ENCOUNTER_WAVES): the first is the squad the party sees, the rest arrive as
// `reinforcements` once it is beaten. Later waves are ordinary squads.
export function buildWildEncounter(region, progress = 0, rng = Math.random, { ecology = true, waves } = {}) {
  const wildlife = region?.wildlife;
  if (!wildlife) throw new RangeError(`Region ${region?.id} has no wildlife`);
  const count = Math.max(1, waves ?? wildlife.waves ?? ENCOUNTER_WAVES);
  const first = buildSquad(region, progress, rng, ecology);
  if (count === 1) return first;
  const reinforcements = Array.from({ length: count - 1 }, () => ({ enemies: buildSquad(region, progress, rng, false).enemies }));
  return { ...first, reinforcements };
}

function buildSquad(region, progress, rng, ecology) {
  const wildlife = region.wildlife;
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
  const wave = buildWildEncounter({ ...region, wildlife: { ...region.wildlife, squad: [2, 2], eliteChance: 0 } }, progress, rng, { ecology: false, waves: 1 });
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

// A nemesis at `level` leads the first wave of an ordinary encounter in its
// region. It is an elite that hunts the wounded, may flee once when nearly
// dead, and carries the traits it has earned (see nemesis.js).
export function buildNemesisEncounter(region, nemesis, level, progress = 0, rng = Math.random) {
  const wave = buildWildEncounter({ ...region, wildlife: { ...region.wildlife, squad: [2, 3], eliteChance: 0 } }, progress, rng, { ecology: false });
  const depth = 1 + DEPTH_SCALE_AT_END * Math.max(0, Math.min(1, progress));
  const stats = nemesisStats(level);
  const foe = makeEnemy(C.ENEMIES[nemesis.type], region.hpScale * depth * stats.hp, region.dmgScale * depth * stats.dmg);
  Object.assign(foe, {
    name: nemesis.name, tier: "elite", nemesisId: nemesis.id, nemesisLevel: level,
    attackSpeed: stats.attackSpeed, regen: stats.regen, fleeBelow: NEMESIS.fleeBelow, fleeChance: stats.fleeChance,
  });
  foe.families = [...new Set([...foe.families, "hunter"])];
  wave.enemies.unshift(foe);
  return { ...wave, total: wave.enemies.length, lootTier: region.tier + 1, nemesisId: nemesis.id };
}

// The region's end boss. In a boss-rotation region the boss follows the
// guild's boss rank, and each rank compounds its difficulty and loot tier.
// The party fights through a wave of the region's creatures guarding the boss
// (`vanguard`) before the boss itself comes out.
export function buildBossEncounter(region, bossRank = 0, rng = Math.random) {
  if (!region?.boss) throw new RangeError(`Region ${region?.id} has no boss`);
  const vanguard = region.wildlife ? [{ enemies: buildSquad(region, 1, rng, false).enemies }] : [];
  const rank = region.bossRotation ? Math.max(0, bossRank) : 0;
  const squad = region.boss.map((key) => (region.bossRotation && C.ENEMIES[key]?.boss ? bossForRank(rank) : key));
  const depth = 1 + DEPTH_SCALE_AT_END;
  const scale = {
    hp: region.hpScale * depth * bossRankScale(rank).hp,
    dmg: region.dmgScale * depth * bossRankScale(rank).dmg,
  };
  const wave = { ...assembleWave(squad, scale, region.tier + Math.floor(rank / 2)), set: region.set || null, vanguard };
  const champion = region.bossRotation ? championFor(rank) : null;
  const boss = champion && wave.enemies.find((enemy) => enemy.boss);
  if (boss) {
    boss.champion = champion;
    boss.name = `${CHAMPIONS[champion].name} ${boss.name}`;
    wave.champion = champion;
  }
  return wave;
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
  const wave = buildWildEncounter({ ...region, wildlife: { ...region.wildlife, squad: [1, 1], eliteChance: 0 } }, progress, rng, { ecology: false, waves: 1 });
  const depth = 1 + DEPTH_SCALE_AT_END * Math.max(0, Math.min(1, progress));
  wave.enemies.unshift(makeEnemy(C.ENEMIES.stalker, region.hpScale * depth, region.dmgScale * depth));
  return { ...wave, total: wave.enemies.length };
}

// One Endless Rift wave. Squads grow, then tougher enemy types join; every 5th
// wave adds a lieutenant and every 10th wave brings a boss from the rotation.
// `threat`: how much the party outclasses the Rift (threat.js); every wave of
// the run carries it on.
export function buildEndlessWave(waveNumber, rng = Math.random, threat = { hp: 1, dmg: 1 }) {
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
    hp: ENDLESS.hpBase * ENDLESS.hpGrowth ** (n - 1) * threat.hp,
    dmg: ENDLESS.dmgBase * ENDLESS.dmgGrowth ** (n - 1) * threat.dmg,
  };
  return { ...assembleWave(squad, scale, 1 + Math.floor((n - 1) / ENDLESS.wavesPerLootTier)), waveNumber: n, threat };
}

function assembleWave(squad, scale, lootTier) {
  const enemies = squad.map((key) => makeEnemy(C.ENEMIES[key], scale.hp, scale.dmg));
  return { enemies, total: enemies.length, groups: 1, hasBoss: enemies.some((enemy) => enemy.boss), lootTier, scale };
}

function makeEnemy(base, hpScale, dmgScale) {
  if (!base) throw new TypeError("Unknown enemy type in encounter");
  const pacing = base.boss ? { hp: COMBAT_PACING.bossHp, dmg: COMBAT_PACING.bossDmg } : COMBAT_PACING;
  const maxHp = Math.round(base.hp * hpScale * pacing.hp);
  return {
    id: nextEnemyId(), type: base.key, name: base.name, tier: base.tier,
    hp: maxHp, maxHp, speed: base.speed, damage: base.damage * dmgScale * pacing.dmg,
    color: base.color, floats: !!base.floats, magicImmune: !!base.magicImmune,
    boss: !!base.boss, group: 0, objective: "squad",
    affinities: { ...(base.affinities || {}) },
    ...(base.attackRange ? { attackRange: base.attackRange } : {}),
    ...(base.splashRadius ? { splashRadius: base.splashRadius } : {}),
    ...(base.bomber ? { bomber: true } : {}),
    ...(base.shield ? { shield: { ...base.shield } } : {}),
    ...(base.portal ? { portal: true } : {}),
    families: [...(C.ENEMY_FAMILIES[base.key] || [])],
  };
}

// Minions a boss summons mid-fight are fodder: weaker than the wave they join.
const MINION_SCALE = Object.freeze({ hp: 0.6, dmg: 0.7 });

// Disposable battle state handed to the engine. The engine mutates it (hero HP,
// gold per kill, equipment drops), so it never aliases the saved guild state.
// Loot and summoned minions follow the current wave's lootTier and scale.
// `rng` (game/random.js) drives every roll in the fight: the engine's, loot
// drops and Endless Rift waves. Without it they use Math.random.
export function createEncounterSim(party, regionTier, wave = null, { rng = defaultRandom } = {}) {
  const sim = {
    heroes: structuredClone(party),
    wave: regionTier,
    gold: 0,
    vault: [],
    kills: { total: 0, byType: {} },
    lootTier: wave?.lootTier ?? regionTier,
    threat: wave?.threat ?? { hp: 1, dmg: 1 },
    minionScale: wave?.scale ?? { hp: 1, dmg: 1 },
    set: wave?.set ?? null,
    rng,
  };
  const luck = luckEffects(partyLuck(party)).rareLoot;
  sim.rollDrop = (enemy) => rollLoot(enemy, sim.lootTier, sim.rng, { set: sim.set, luck });
  sim.makeMinion = (type) => makeEnemy(C.ENEMIES[type] || C.ENEMIES.skeleton,
    sim.minionScale.hp * MINION_SCALE.hp, sim.minionScale.dmg * MINION_SCALE.dmg);
  return sim;
}

// Engine `nextWave` callback for an Endless Rift fight: builds the next wave
// and moves the sim's loot tier and minion scale along with it.
// `kind`: the endless region's `endlessKind` ("rift", the default, or "march").
export function endlessWaveSource(sim, rng = sim.rng, kind = "rift") {
  return (wavesCleared) => {
    const wave = endlessWave(kind, wavesCleared + 1, rng, sim.threat);
    sim.lootTier = wave.lootTier;
    sim.minionScale = wave.scale;
    return wave;
  };
}
