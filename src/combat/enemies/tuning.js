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
