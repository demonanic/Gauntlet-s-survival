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
    hpScale: 3.3,
    dmgScale: 2.8,
    completionGold: 300,
    recoverySeconds: 120,
    // Death sustains death: priests, necromancers and the shields that guard them.
    wildlife: {
      // The first formations a guild meets, so a little rarer than further out.
      pool: { skeleton: 4, ghost: 3, reaper: 2, orc: 2, goblin: 1, lesserNecromancer: 1, gnome: 1, carrionPriest: 1 }, squad: [2, 4], eliteChance: 0.05,
      ecology: { chance: 0.2, templates: { deathCult: 3, graveCourt: 3 } },
    },
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
    hpScale: 2.95,
    dmgScale: 2.25,
    completionGold: 500,
    recoverySeconds: 180,
    // Hunters: everything here goes for whoever is weakest.
    wildlife: {
      pool: { bandit: 4, gnome: 3, harrier: 2, orc: 2, darkElf: 2, watcher: 1, ghost: 1 }, squad: [2, 4], eliteChance: 0.06,
      ecology: { chance: 0.3, templates: { huntPack: 3, killTeam: 2 } },
    },
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
    hpScale: 3.07,
    dmgScale: 2.31,
    completionGold: 800,
    recoverySeconds: 240,
    // Organized warfare: shields, snipers and sappers in formation.
    wildlife: {
      pool: { darkElf: 3, orc: 3, warlock: 2, reaper: 2, skeleton: 2, gnome: 2, bulwark: 2, goblin: 1, lesserNecromancer: 1, harrier: 1, carrionPriest: 1, watcher: 1 },
      squad: [2, 4], eliteChance: 0.08,
      ecology: { chance: 0.35, templates: { demolitionCrew: 2, killTeam: 2, graveCourt: 1, deathCult: 1 } },
    },
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
    hpScale: 4.63,
    dmgScale: 3.35,
    completionGold: 1600,
    recoverySeconds: 300,
    // Attrition and corruption: the dead get back up, the hunters wait for you to weaken.
    wildlife: {
      pool: { slime: 3, lesserNecromancer: 3, skeleton: 2, bandit: 2, darkElf: 2, gnome: 2, reaper: 2, carrionPriest: 2, watcher: 1, harrier: 1, bulwark: 1 },
      squad: [2, 4], eliteChance: 0.1,
      ecology: { chance: 0.35, templates: { deathCult: 2, huntPack: 2, graveCourt: 2 } },
    },
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
