export const HERO_SPRITE_ATLAS = Object.freeze({
  // Cropped, background-masked character frames from the uploaded
  // Spritepack1 reference board (not the older recreated SVG atlas).
  path: "/sprites/hero/supplied-classless-hero-atlas.png",
  frameWidth: 64,
  frameHeight: 64,
  columns: 3,
  animations: Object.freeze({ idle: 0, walk: 1, run: 2, attack: 3, sharedStrike: 4, hit: 5, death: 6 }),
});

const FRAME_COUNTS = Object.freeze({ idle: 3, walk: 3, run: 3, attack: 3, sharedStrike: 3, hit: 3, death: 3 });

export function selectHeroSpriteFrame({ alive = true, moving = false, running = false, action = null, hit = false } = {}, elapsed = 0) {
  let animation = "idle";
  if (!alive) animation = "death";
  else if (hit) animation = "hit";
  else if (action === "sharedStrike") animation = "sharedStrike";
  else if (action === "attack") animation = "attack";
  else if (moving && running) animation = "run";
  else if (moving) animation = "walk";
  const frameCount = FRAME_COUNTS[animation];
  const frame = Math.floor(Math.max(0, elapsed) * (animation === "idle" ? 3 : 9)) % frameCount;
  const row = HERO_SPRITE_ATLAS.animations[animation];
  return {
    animation,
    frame,
    sx: frame * HERO_SPRITE_ATLAS.frameWidth,
    sy: row * HERO_SPRITE_ATLAS.frameHeight,
    sw: HERO_SPRITE_ATLAS.frameWidth,
    sh: HERO_SPRITE_ATLAS.frameHeight,
  };
}
