// The battle arena's size and body sizes, shared by the engine, the renderer
// and the hero and enemy modules.
export const W = 420, H = 760;
export const HERO_Y = 0.85 * H;   // heroes line
export const FLOOR_Y = H - 6;     // bottom edge of the arena

// Body radii for collisions, sized to the drawn art so units don't pile on top
// of each other. They grew by 4-5 px (Oct 2026); every melee reach grew by
// BODY_PAD, the extra distance between two touching bodies, so who can hit
// whom from contact is unchanged (BODY_PAD lives in enemies/tuning.js).
export const HERO_BODY_RADIUS = 20;
export const ENEMY_BODY_RADIUS = (e) => (e.boss ? 33 : e.tier === "elite" ? 24 : 18);
