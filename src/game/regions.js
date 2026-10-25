// Expedition destinations. An expedition is a timed adventure: for
// `durationMinutes` the party explores, and the adventure feed fills with events
// (see adventure.js). Encounters are random squads drawn from `wildlife`;
// regions with a `boss` end with that squad as a final showdown. Enemy keys
// reference the vendored roster in combat/config.js (C.ENEMIES). `tier` sets
// loot strength. The Endless Rift is one nonstop fight instead (encounters.js).

// After the first Ashen Keep clear its final boss rotates through these, and
// every boss kill raises the guild's boss rank. Difficulty compounds per rank
// (gear eventually tops out, so every guild meets a ceiling); the bounty grows
// linearly.
export const BOSS_ROTATION = Object.freeze(["demon", "imperialNecromancer", "nuclearBehemoth"]);
export const BOSS_RANK_SCALING = Object.freeze({ hpGrowth: 1.15, dmgGrowth: 1.09, bounty: 0.15 });

export function bossForRank(rank = 0) {
  return BOSS_ROTATION[Math.max(0, rank) % BOSS_ROTATION.length];
}

// `environment` is a key in environment.js; `set` is the gear set that drops there.
export const REGIONS = Object.freeze([
  {
    id: "gutter",
    name: "The Gutter",
    blurb: "Sewer tunnels under the guild hall. Goblins, ghosts and worse.",
    color: "#39FF14",
    tier: 1,
    minLevel: 1,
    durationMinutes: 10,
    hpScale: 0.9,
    dmgScale: 0.9,
    completionGold: 80,
    recoverySeconds: 60,
    wildlife: { pool: { goblin: 4, ghost: 3, slime: 3, skeleton: 1 }, squad: [2, 4], eliteChance: 0 },
    boss: null,
    environment: null,
    set: null,
  },
  {
    id: "boneyard",
    name: "Boneyard Crypt",
    blurb: "A pitch-black ossuary that refuses to stay buried. Its lieutenant guards the deepest vault.",
    color: "#FF3366",
    tier: 2,
    minLevel: 3,
    durationMinutes: 20,
    hpScale: 2.0,
    dmgScale: 1.7,
    completionGold: 300,
    recoverySeconds: 120,
    wildlife: { pool: { skeleton: 4, ghost: 3, reaper: 2, orc: 2, goblin: 1, lesserNecromancer: 1, gnome: 1 }, squad: [2, 4], eliteChance: 0.05 },
    boss: ["lieutenant", "skeleton", "skeleton"],
    environment: "darkness",
    set: "gravewatch",
  },
  {
    id: "frostfang",
    name: "Frostfang Pass",
    blurb: "A frozen mountain pass where bandits and gnome sappers prey on travelers. The Bandit Warlord takes a toll from everyone.",
    color: "#7DD3FC",
    tier: 3,
    minLevel: 4,
    durationMinutes: 25,
    hpScale: 2.1,
    dmgScale: 1.6,
    completionGold: 500,
    recoverySeconds: 180,
    wildlife: { pool: { bandit: 4, gnome: 3, orc: 2, darkElf: 2, ghost: 1 }, squad: [2, 4], eliteChance: 0.06 },
    boss: ["banditWarlord", "bandit", "bandit"],
    environment: "cold",
    set: "frostwarden",
  },
  {
    id: "ashen",
    name: "Ashen Keep",
    blurb: "A burning fortress where a three-headed demon holds court. Once it falls, darker masters take the throne.",
    color: "#FF0055",
    tier: 4,
    bossRotation: true,
    minLevel: 6,
    durationMinutes: 30,
    hpScale: 2.0,
    dmgScale: 1.5,
    completionGold: 800,
    recoverySeconds: 240,
    wildlife: { pool: { darkElf: 3, orc: 3, warlock: 2, reaper: 2, skeleton: 2, gnome: 2, goblin: 1, lesserNecromancer: 1 }, squad: [2, 4], eliteChance: 0.08 },
    boss: ["demon", "skeleton", "skeleton"],
    environment: "heat",
    set: "emberforged",
  },
  {
    id: "blightmire",
    name: "The Blightmire",
    blurb: "A drowned swamp where the dead won't rest and the air itself is poison. The Bog Lich rules the mire.",
    color: "#A3E635",
    tier: 5,
    minLevel: 10,
    durationMinutes: 40,
    hpScale: 3.0,
    dmgScale: 2.2,
    completionGold: 1600,
    recoverySeconds: 300,
    wildlife: { pool: { slime: 3, lesserNecromancer: 3, skeleton: 2, bandit: 2, darkElf: 2, gnome: 2, reaper: 2 }, squad: [2, 4], eliteChance: 0.1 },
    boss: ["bogLich", "skeleton", "skeleton"],
    environment: "toxic",
    set: "mirewalker",
  },
  {
    id: "rift",
    name: "The Endless Rift",
    blurb: "A wound in the world that never stops bleeding monsters. Waves keep coming until you return home.",
    color: "#00F3FF",
    tier: 1,
    endless: true,
    minLevel: 3,
    durationMinutes: null,
    hpScale: 1,
    dmgScale: 1,
    completionGold: 0,
    recoverySeconds: 180,
    wildlife: null,
    boss: null,
    environment: null,
    set: null,
  },
]);

export function getRegion(regionId) {
  return REGIONS.find((region) => region.id === regionId) || null;
}
