// Enemy behavior numbers shared by the engine and the enemy behavior modules
// (Phase 8B moved them out of engine.js unchanged).

// The extra distance between two touching bodies: every melee reach includes
// it, so who can hit whom from contact matches the drawn body sizes.
export const BODY_PAD = 9;
// Sappers sheltering behind a Bulwark break cover inside this range.
export const SAPPER_SPRINT_RANGE = 110;
