// How special moves and spells look on the battle screen: a colour per perk
// branch, an icon per move and per spell shape (24×24 stroke paths), and
// which moves are big enough for a hit-stop. Presentation only: nothing here
// changes a fight.
import { IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS } from "./classlessAbilities";
import { ELEMENTS, SPELLS } from "./spells";

// Ring colour of a special move, by the perk branch it comes from.
export const BRANCH_COLORS = Object.freeze({
  Basic: "#E2E8F0",
  Precision: "#FFE600",
  Vanguard: "#FF7A3D",
  Warden: "#3DA5FF",
  Tactics: "#39FF14",
  Shadowcraft: "#B37BFF",
  Conjuration: "#2DD4BF",
  Hemomancy: "#FF5A7E",
  Fortune: "#FBBF24",
  Illusion: "#F0A6FF",
  Wilds: "#9BE15D",
  Arcana: "#E879F9",
});

export const ICON_PATHS = Object.freeze({
  strike: "M5 19L19 5M15 5h4v4M5 15l4 4",
  target: "M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
  skull: "M12 3a7 7 0 0 0-7 7c0 2.6 1.4 4.3 3 5.2V19h8v-3.8c1.6-.9 3-2.6 3-5.2a7 7 0 0 0-7-7zM9.5 11h.01M14.5 11h.01M10 19v2M14 19v2",
  cleave: "M4 20L20 4M14 4h6v6M4 14l6 6",
  horn: "M4 10v4h3l6 4V6l-6 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  rally: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10zM12 9v5M9.5 11.5h5",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6z",
  ward: "M12 3l7 3v6c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6zM9 12l2 2l4-4",
  smoke: "M5 16a4 4 0 0 1 1-7.9A5 5 0 0 1 15.5 7A4 4 0 0 1 19 15M7 20h10",
  vanish: "M3 3l18 18M10.6 6.1A9 9 0 0 1 21 12a12 12 0 0 1-2.4 3.2M6.6 6.6A12 12 0 0 0 3 12s3.5 6 9 6a8 8 0 0 0 4-1.1",
  phantom: "M9 4a5 5 0 0 1 5 5v11l-2.5-2l-2.5 2l-2.5-2L4 20V9a5 5 0 0 1 5-5zM7.5 10h.01M10.5 10h.01M16 7l4-3M17 12h4",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  dice: "M5 5h14v14H5zM9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01",
  bolt: "M13 3L5 14h6l-1 7l8-11h-6z",
  burst: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
  linger: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1",
  meteor: "M4 4l8 8M8 3l6 6M3 8l6 6M17 14a3 3 0 1 1-3 3a3 3 0 0 1 3-3z",
  mend: "M12 5v14M5 12h14",
  renew: "M5 19c0-8 6-14 14-14c0 8-6 14-14 14zM5 19l7-7",
  lifeline: "M3 12h4l2-5l4 10l2-5h6",
  barrier: "M12 3l8 4.5v9L12 21l-8-4.5v-9z",
  empower: "M12 3l3 6h-6zM12 9v12M8 15h8",
  aegis: "M3 18a9 9 0 0 1 18 0zM12 9v-6",
});

// Icon per special move (Shared Strike is every hero's basic move).
export const MOVE_ICONS = Object.freeze({
  sharedStrike: "strike",
  P3: "target", P3a: "skull", V3: "cleave", V3a: "horn", T2a: "rally", W3: "shield",
  S2a: "smoke", S3a: "vanish", I3: "phantom", H3: "drop", C2a: "ward", F3: "dice",
});

// Icon per spell shape.
export const SPELL_SHAPE_ICONS = Object.freeze({
  bolt: "bolt", area: "burst", linger: "linger", meteor: "meteor",
  heal: "mend", renew: "renew", lifeline: "lifeline", barrier: "barrier", empower: "empower", aegis: "aegis",
});

// Moves and spells that hit hard enough to freeze the frame for a moment.
export const HIT_STOP_SECONDS = 0.09;
export const BIG_MOVES = Object.freeze(new Set(["P3", "P3a", "V3", "I3"]));
export const BIG_SPELLS = Object.freeze(new Set(["arcane_channel", "meteor"]));

export function branchColor(branch) {
  return BRANCH_COLORS[branch] || BRANCH_COLORS.Basic;
}

export function moveIcon(abilityId) {
  return ICON_PATHS[MOVE_ICONS[abilityId] || "strike"];
}

export function spellIcon(spell) {
  return ICON_PATHS[SPELL_SHAPE_ICONS[spell?.shape] || "bolt"];
}

// Every move the game defines, for the coverage test.
export const KNOWN_MOVE_IDS = Object.freeze(["sharedStrike", ...IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS]);
export const KNOWN_SPELL_SHAPES = Object.freeze([...new Set(Object.values(SPELLS).map((spell) => spell.shape))]);
export const KNOWN_ELEMENTS = Object.freeze(Object.keys(ELEMENTS));
