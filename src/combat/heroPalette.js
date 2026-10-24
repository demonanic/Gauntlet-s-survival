// Gauntlet: every hero gets an individual neon look. The shared sprite art is
// tinted with the CSS/canvas filter `hue-rotate(hueShift) saturate(1.25)`, and
// the hero's identity (glow, name) and accent colors are the sprite's own
// magenta body and cyan trim run through that same filter maths, so the UI
// colors always match what the sprite looks like.

const SPRITE_BODY = "#F02DCA";
const SPRITE_TRIM = "#22D3EE";
const SATURATE = 1.25;
// Text colors darker than this relative luminance are lifted toward white.
const MIN_LUMINANCE = 0.32;
// Random hues tried when picking one far from the roster's.
const HUE_CANDIDATES = 12;

const toRgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const toHex = (rgb) => `#${rgb.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// The W3C filter-effects matrices for hue-rotate() and saturate().
function hueRotate([r, g, b], degrees) {
  const a = Math.cos((degrees * Math.PI) / 180);
  const s = Math.sin((degrees * Math.PI) / 180);
  return [
    (0.213 + a * 0.787 - s * 0.213) * r + (0.715 - a * 0.715 - s * 0.715) * g + (0.072 - a * 0.072 + s * 0.928) * b,
    (0.213 - a * 0.213 + s * 0.143) * r + (0.715 + a * 0.285 + s * 0.14) * g + (0.072 - a * 0.072 - s * 0.283) * b,
    (0.213 - a * 0.213 - s * 0.787) * r + (0.715 - a * 0.715 + s * 0.715) * g + (0.072 + a * 0.928 + s * 0.072) * b,
  ];
}

function saturate([r, g, b], amount) {
  return [
    (0.213 + 0.787 * amount) * r + (0.715 - 0.715 * amount) * g + (0.072 - 0.072 * amount) * b,
    (0.213 - 0.213 * amount) * r + (0.715 + 0.285 * amount) * g + (0.072 - 0.072 * amount) * b,
    (0.213 - 0.213 * amount) * r + (0.715 - 0.715 * amount) * g + (0.072 + 0.928 * amount) * b,
  ];
}

// The sprite color after the hero's filter, lifted if it would be too dark to read.
function tintedColor(hex, shift) {
  let rgb = saturate(hueRotate(toRgb(hex), shift), SATURATE).map((value) => Math.max(0, Math.min(255, value)));
  const light = luminance(rgb);
  if (light < MIN_LUMINANCE) {
    const mix = (MIN_LUMINANCE - light) / (1 - light);
    rgb = rgb.map((value) => value + (255 - value) * mix);
  }
  return toHex(rgb);
}

export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value);
}

export function paletteForShift(hueShift) {
  const shift = ((Math.round(Number(hueShift) || 0) % 360) + 360) % 360;
  return {
    hueShift: shift,
    identityColor: tintedColor(SPRITE_BODY, shift),
    accentColor: tintedColor(SPRITE_TRIM, shift),
  };
}

export function rollHeroPalette(rng = Math.random) {
  return paletteForShift(Math.floor(rng() * 360));
}

const hueGap = (a, b) => Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360));

// A random hue kept as far as practical from the hues already in use, so a
// roster never ends up with look-alikes.
export function distinctHueShift(takenShifts = [], rng = Math.random) {
  const taken = takenShifts.filter(Number.isFinite);
  let best = Math.floor(rng() * 360);
  if (!taken.length) return best;
  let bestGap = -1;
  for (let attempt = 0; attempt < HUE_CANDIDATES; attempt += 1) {
    const hue = Math.floor(rng() * 360);
    const gap = Math.min(...taken.map((other) => hueGap(hue, other)));
    if (gap > bestGap) {
      best = hue;
      bestGap = gap;
    }
  }
  return best;
}

// Canvas/CSS filter that tints the shared sprite art for one hero.
export function heroSpriteFilter(appearance) {
  const shift = Number(appearance?.hueShift);
  return Number.isFinite(shift) && shift !== 0 ? `hue-rotate(${shift}deg) saturate(${SATURATE})` : "none";
}
