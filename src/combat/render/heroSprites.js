// Hero sprites (Phase 8A): the sprite sheet frame, weapon, gear marks and
// state rings for one hero. Reads the engine's state only.
import { HERO_SPRITE_ATLAS, selectHeroSpriteFrame } from "../heroSprite";
import { getEquippedHeroWeaponType, HERO_WEAPON_ASSETS } from "../heroWeapon";
import { isNeonIdentityColor } from "../heroModel";
import { heroSpriteFilter } from "../heroPalette";
import { drawGearMarks, heroGearMarks } from "../heroLook";

let heroSpriteImage = null;
const classlessWeaponImages = new Map();
function getHeroSpriteImage() {
  if (heroSpriteImage || typeof Image === "undefined") return heroSpriteImage;
  heroSpriteImage = new Image();
  heroSpriteImage.src = `${process.env.PUBLIC_URL || ""}${HERO_SPRITE_ATLAS.path}`;
  return heroSpriteImage;
}

function getClasslessWeaponImage(type) {
  if (!HERO_WEAPON_ASSETS[type] || typeof Image === "undefined") return null;
  if (classlessWeaponImages.has(type)) return classlessWeaponImages.get(type);
  const image = new Image();
  image.src = `${process.env.PUBLIC_URL || ""}${HERO_WEAPON_ASSETS[type]}`;
  classlessWeaponImages.set(type, image);
  return image;
}

// Where each hero was last drawn (for the walk cycle): kept here, not on the
// hero, so drawing changes nothing in the fight.
const lastDrawn = new WeakMap();

export function drawHeroSprite(engine, h) {
  const ctx = engine.ctx;
  // Where this hero was last drawn (for the walk cycle): kept by the drawing
  // code, not on the hero, so drawing changes nothing in the fight. A hero
  // not yet drawn counts as standing at its starting point.
  const previous = lastDrawn.get(h) || { x: h.home.x, y: h.home.y };
  const dx = h.x - previous.x, dy = h.y - previous.y;
  const moving = dx * dx + dy * dy > 0.12;
  const target = [h.facingTarget, h.manualTarget, h.currentTarget]
    .find((candidate) => candidate && candidate.hp > 0);
  const facingX = target ? target.x - h.x : moving ? dx : 0;
  const facingY = target ? target.y - h.y : moving ? dy : -1;
  const facing = Math.atan2(facingX, -facingY);
  const action = h.visualActionUntil > engine.time ? h.visualActionKind : null;
  const frame = selectHeroSpriteFrame({
    alive: h.alive,
    hit: h.hitUntil > engine.time,
    moving,
    running: h.retreating || !!h.manualPoint,
    action,
  }, action ? engine.time - h.visualActionStartedAt : engine.time);
  const alpha = h.alive ? (h.protect > 0 ? 0.58 : 1) : 0.52;
  const identityColor = isNeonIdentityColor(h.model?.appearance?.identityColor)
    ? h.model.appearance.identityColor : h.d.color || "#22D3EE";
  const accentColor = h.model?.appearance?.accentColor || identityColor;
  const weaponType = getEquippedHeroWeaponType(h.model);

  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.globalAlpha = alpha;
  // All heroes now share the supplied body art. Class remains gameplay data;
  // legacy weapons are preserved as compatible visual overlays.
  ctx.rotate(facing);
  const image = getHeroSpriteImage();
  const hasArt = image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  // The body art sits 20 px ahead of the hero's position; shift it back so
  // the picture is centred on the body (otherwise a hero facing an enemy
  // pokes into it even when their bodies don't touch).
  if (hasArt) ctx.translate(0, 20);
  if (hasArt) {
    // Gauntlet: each hero's own neon shade, plus a soft glow in that color.
    ctx.filter = heroSpriteFilter(h.model?.appearance);
    ctx.shadowBlur = 7;
    ctx.shadowColor = identityColor;
    ctx.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, -24, -44, 48, 48);
    ctx.filter = "none";
    // Equipped armor shows as simple shapes in each piece's rarity colour.
    if (h.alive && h.model?.equipment) {
      ctx.save();
      ctx.translate(-24, -44);
      ctx.scale(0.75, 0.75);
      drawGearMarks(ctx, heroGearMarks(h.model.equipment));
      ctx.restore();
    }
  } else {
    // Missing-image fallback is a neutral silhouette, never the old
    // class-specific procedural character artwork.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowBlur = 12;
    ctx.shadowColor = h.hitUntil > engine.time ? "#F02DCA" : identityColor;
    ctx.fillStyle = "#050912";
    ctx.strokeStyle = h.hitUntil > engine.time ? "#F02DCA" : identityColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, 10); ctx.lineTo(-7, -8); ctx.lineTo(0, -17);
    ctx.lineTo(7, -8); ctx.lineTo(9, 10); ctx.lineTo(0, 15); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#F02DCA";
    ctx.beginPath(); ctx.moveTo(7, 5); ctx.lineTo(11, -14); ctx.stroke();
  }

  const weaponImage = getClasslessWeaponImage(weaponType);
  if (weaponImage?.complete && weaponImage.naturalWidth > 0) {
    ctx.shadowBlur = 5;
    ctx.shadowColor = identityColor;
    // Drawn a little larger than the body frame so the weapon reads clearly.
    ctx.drawImage(weaponImage, 0, 0, 48, 48, -30, -50, 60, 60);
  }
  ctx.shadowBlur = 6;
  ctx.shadowColor = accentColor;
  ctx.fillStyle = accentColor;
  ctx.fillRect(-1.75, -34, 3.5, 3.5);
  ctx.restore();

  const formation = h.d.classlessEffects?.formationMitigation || 0;
  const allyNearby = engine.heroes.some((ally) => ally !== h && ally.alive && Math.hypot(ally.x - h.x, ally.y - h.y) <= 5);
  if (formation > 0 && allyNearby) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#22D3EE";
    ctx.lineWidth = 1.5;
    ctx.setLineDash?.([3, 3]);
    ctx.beginPath(); ctx.arc(h.x, h.y - 3, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  lastDrawn.set(h, { x: h.x, y: h.y });
}
