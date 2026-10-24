// Gauntlet: every hero gets an individual neon look. The shared sprite art is
// hue-rotated by `hueShift` degrees, and the hero's UI and glow colors are the
// sprite's own two neon tones (magenta body, cyan trim) rotated by the same amount.

const SPRITE_BODY_HUE = 300;
const SPRITE_TRIM_HUE = 185;

export function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value);
}

export function paletteForShift(hueShift) {
  const shift = ((Math.round(Number(hueShift) || 0) % 360) + 360) % 360;
  return {
    hueShift: shift,
    identityColor: hslToHex((SPRITE_BODY_HUE + shift) % 360, 100, 62),
    accentColor: hslToHex((SPRITE_TRIM_HUE + shift) % 360, 100, 58),
  };
}

export function rollHeroPalette(rng = Math.random) {
  return paletteForShift(Math.floor(rng() * 360));
}

// Canvas/CSS filter that tints the shared sprite art for one hero.
export function heroSpriteFilter(appearance) {
  const shift = Number(appearance?.hueShift);
  return Number.isFinite(shift) && shift !== 0 ? `hue-rotate(${shift}deg) saturate(1.25)` : "none";
}
