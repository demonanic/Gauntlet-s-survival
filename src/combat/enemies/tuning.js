// Enemy behavior numbers shared by the engine and the enemy behavior modules
// (Phase 8B moved them out of engine.js unchanged).

// The extra distance between two touching bodies: every melee reach includes
// it, so who can hit whom from contact matches the drawn body sizes.
export const BODY_PAD = 9;
// Sappers sheltering behind a Bulwark break cover inside this range.
export const SAPPER_SPRINT_RANGE = 110;
// The most bandits the Bandit Warlord keeps around him at once.
export const WARLORD_GANG = 3;
// The most summoned minions the Demon or the Imperial Necromancer keeps alive.
export const BOSS_MINIONS = 4;
// Champion bosses: Warded heals this share of max HP at each ward; Swarming
// keeps up to this many summons alive; Vampiric heals this share per hit it
// lands, and this smaller share per hit one of its summoned minions lands.
export const CHAMPION_WARD = 0.15;
export const CHAMPION_SWARM = 6;
export const CHAMPION_VAMPIRIC = 0.02;
export const CHAMPION_VAMPIRIC_MINION = 0.005;
// Bulwarks: the share of a hit a Bulwark in the line of fire takes, and the
// damage reduction for allies standing beside one.
export const BULWARK_COVER = 0.5;
export const BULWARK_GUARD = 0.1;
export const BULWARK_GUARD_RADIUS = 60;
// Seconds a foe counts as busy with whoever it last attacked (backstabs).
export const BACKSTAB_WINDOW = 3;
// Story mode bosses (storyBosses.js; owner's design, Nov 2026).
// Gatewarden: a portal every `portalEvery` s (at most `maxPortals` open,
// `portalHp` of her max HP each), each spawning one of `spawns` every
// `spawnEvery` s until destroyed. Chronomancer: a time field every
// `fieldEvery` s on heroes within `fieldRadius` of one: attack, move and
// recover special-move and spell cooldowns `slow` slower for `slowSeconds`; once, below half HP, rewinds to `rewindTo`.
// Ritualist: a `channel` s ritual every `channelEvery` s (the first after
// `firstChannel`); `breakShare` of her max HP in damage meanwhile breaks it
// (stunned `brokenStun` s); finished, it blasts every hero for `blast` of
// their max HP. Ancient Evil: allies within `auraRadius` move and hit
// `auraBoost` x and take `auraCut` less; Confusion on `confuseCount` heroes
// every `confuseEvery` s for `confuseSeconds` (Spellguard or Aegis wards it
// off and breaks it); the wormhole opens at `wormholeAt` of its HP.
export const STORY_BOSS = Object.freeze({
  gatewarden: Object.freeze({ portalEvery: 14, firstPortal: 4, maxPortals: 2, portalHp: 0.1, spawnEvery: 6, spawns: Object.freeze(["bandit", "orc", "warlock"]) }),
  chronomancer: Object.freeze({ fieldEvery: 10, firstField: 5, fieldRadius: 160, slow: 0.4, slowSeconds: 5, rewindBelow: 0.5, rewindTo: 0.75 }),
  ritualist: Object.freeze({ channelEvery: 20, firstChannel: 8, channel: 12, breakShare: 0.12, brokenStun: 3, blast: 0.45 }),
  ancientEvil: Object.freeze({
    auraRadius: 150, auraBoost: 1.25, auraCut: 0.25,
    confuseEvery: 15, firstConfuse: 6, confuseCount: 2, confuseSeconds: 3.5,
    wormholeAt: Object.freeze([0.66, 0.33]), wormholeFoes: Object.freeze(["warlock", "orc", "orc", "bandit"]), wormholeZombies: 10,
  }),
});

// Heroes this close to a boss are in melee with it: it won't lob bombs at them.
export const BOSS_MELEE_REACH = 90;
