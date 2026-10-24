// The runtime artwork is cropped losslessly from
// public/sprites/demonanic-sprite-assets-source-bundle.zip's transparent VFX sheet.
// The two labeled Spritepack PNGs are references, not clean transparent assets.
export const COMBAT_VFX_ASSETS = Object.freeze({
  arrow01: "/sprites/vfx/projectiles/arrow-01.png",
  arrow02: "/sprites/vfx/projectiles/arrow-02.png",
  arrow03: "/sprites/vfx/projectiles/arrow-03.png",
  arrow04: "/sprites/vfx/projectiles/arrow-04.png",
  magicEnergy01: "/sprites/vfx/projectiles/magic-energy-01.png",
  magicEnergy02: "/sprites/vfx/projectiles/magic-energy-02.png",
  magicEnergy03: "/sprites/vfx/projectiles/magic-energy-03.png",
  magicEnergy04: "/sprites/vfx/projectiles/magic-energy-04.png",
  impactStar01: "/sprites/vfx/impacts/star-01.png",
  impactStar02: "/sprites/vfx/impacts/star-02.png",
  impactBurst03: "/sprites/vfx/impacts/burst-03.png",
  impactSlash04: "/sprites/vfx/impacts/slash-04.png",
  impactOrbit05: "/sprites/vfx/impacts/orbit-05.png",
  impactVortex06: "/sprites/vfx/impacts/vortex-06.png",
  impactBurst07: "/sprites/vfx/impacts/burst-07.png",
  impactCrescent08: "/sprites/vfx/impacts/crescent-08.png",
});

const ARROWS = ["arrow01", "arrow02", "arrow03", "arrow04"];
const MAGIC_PROJECTILES = ["magicEnergy01", "magicEnergy02", "magicEnergy03", "magicEnergy04"];

function stableVariant(sourceId, variants) {
  let hash = 0;
  for (const character of String(sourceId || "")) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  return variants[(hash >>> 0) % variants.length];
}

export function projectileVfxAssetId(projectile) {
  if (!projectile || projectile.visualType === "none") return null;
  if (projectile.visualType === "arrow") return stableVariant(projectile.sourceId, ARROWS);
  if (projectile.visualType === "magic") return stableVariant(projectile.sourceId, MAGIC_PROJECTILES);
  return null;
}

export function combatVfxAssetId(effect) {
  if (!effect) return null;
  if (effect.vfxAssetId && COMBAT_VFX_ASSETS[effect.vfxAssetId]) return effect.vfxAssetId;
  switch (effect.kind) {
    case "weapon_swing": return "impactSlash04";
    case "shared_strike": return "impactCrescent08";
    case "hit": return effect.crit ? "impactBurst07" : "impactStar01";
    case "spell_cast": return "impactOrbit05";
    case "spell_area": return "impactOrbit05";
    case "heal": return "impactOrbit05";
    case "shield":
    case "guard":
    case "covenant": return "impactOrbit05";
    case "smoke": return "impactVortex06";
    case "trail": return "magicEnergy03";
    case "opening": return "impactSlash04";
    case "echo_mark": return "impactOrbit05";
    case "echo_hit": return "impactStar02";
    case "death": return "impactBurst03";
    case "napalm": return "impactBurst07";
    case "impact": return "impactStar01";
    default: return null;
  }
}

export function getCombatVfxImage(assetId, cache, options = {}) {
  const path = COMBAT_VFX_ASSETS[assetId];
  if (!path || !(cache instanceof Map)) return null;
  if (cache.has(assetId)) return cache.get(assetId);
  const ImageConstructor = options.ImageConstructor || (typeof Image === "undefined" ? null : Image);
  if (!ImageConstructor) return null;
  const image = new ImageConstructor();
  image.src = `${options.publicUrl ?? (typeof process !== "undefined" ? process.env.PUBLIC_URL || "" : "")}${path}`;
  cache.set(assetId, image);
  return image;
}

export function drawCombatVfx(ctx, image, effect, alpha = 1) {
  if (!ctx || !image?.complete || !(image.naturalWidth > 0) || !(image.naturalHeight > 0) || !effect) return false;
  const aspect = image.naturalWidth / image.naturalHeight;
  const defaultSize = effect.kind === "shared_strike" ? 58
    : effect.kind === "death" ? 48
      : effect.kind === "hit" ? (effect.crit ? 60 : 46)
        : effect.kind === "weapon_swing" || effect.kind === "spell_area" ? 52 : 46;
  const size = Math.max(1, Number(effect.vfxSize) || defaultSize);
  const fade = 1 - Math.max(0, Math.min(1, alpha));
  const scale = 1 + fade * 0.08;
  const width = (aspect >= 1 ? size : size * aspect) * scale;
  const height = (aspect >= 1 ? size / aspect : size) * scale;
  const x = effect.kind === "trail" && Number.isFinite(effect.toX) ? (effect.x + effect.toX) / 2 : effect.x;
  const y = effect.kind === "trail" && Number.isFinite(effect.toY) ? (effect.y + effect.toY) / 2 : effect.y;
  const rotation = Number.isFinite(effect.rotation) ? effect.rotation
    : effect.kind === "trail" && Number.isFinite(effect.toX) && Number.isFinite(effect.toY)
      ? Math.atan2(effect.toY - effect.y, effect.toX - effect.x) : 0;
  ctx.save();
  // Source-sheet glows are intentionally soft. Lift short hit cues above the
  // original low alpha while preserving a visible fade through the Engine's
  // existing lifetime; this adds no timers or persistent screen coverage.
  const opacity = Math.max(0, Math.min(1, Number(alpha) || 0));
  ctx.globalAlpha = 0.4 + opacity * 0.6;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
  return true;
}
