// How special moves and spells look on the battle screen: a colour per perk
// branch, an icon per move and per spell shape (24×24 stroke paths), and
// which moves are big enough for a hit-stop. Presentation only: nothing here
// changes a fight.
import { IMPLEMENTED_CLASSLESS_ABILITY_NODE_IDS } from "./classlessAbilities";
import { ELEMENTS, SPELLS } from "./spells";

// Ring colour of a special move, by the perk branch it comes from.
export const BRANCH_COLORS = Object.freeze({
  Basic: "#E2E8F0",
  Starter: "#F8FAFC",
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
  lunge: "M3 12h11M10 7l5 5l-5 5M17 5v14M21 8v8",
  pin: "M4 20L14 10M11 7l6 6M14 4l6 6M4 20l3-1l-2-2z",
  surge: "M12 3l2.5 5.5L20 9l-4 4l1 6l-5-3l-5 3l1-6l-4-4l5.5-.5z",
  meteor: "M4 4l8 8M8 3l6 6M3 8l6 6M17 14a3 3 0 1 1-3 3a3 3 0 0 1 3-3z",
  mend: "M12 5v14M5 12h14",
  renew: "M5 19c0-8 6-14 14-14c0 8-6 14-14 14zM5 19l7-7",
  lifeline: "M3 12h4l2-5l4 10l2-5h6",
  barrier: "M12 3l8 4.5v9L12 21l-8-4.5v-9z",
  empower: "M12 3l3 6h-6zM12 9v12M8 15h8",
  aegis: "M3 18a9 9 0 0 1 18 0zM12 9v-6",
  veil: "M3 12s3.5-6 9-6s9 6 9 6s-3.5 6-9 6s-9-6-9-6zM4 20L20 4",
  terror: "M12 3v12M12 19v.01M5 21h14L12 3z",
  confusion: "M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V15M12 19v.01",
  ensnare: "M4 20c4-2 4-8 8-8s4 6 8 8M8 20c0-4 2-6 4-6s4 2 4 6",
  thornfield: "M3 20h18M6 20l2-6l2 6M12 20l2-8l2 8M17 20l1.5-4l1.5 4",
  summon: "M5 15l2-7l3 3l2-6l2 6l3-3l2 7zM7 19h10",
  dominate: "M8 6a4 4 0 1 1 8 0v2H8zM6 8h12v4l-6 9l-6-9z",
  blind: "M3 12s3.5-6 9-6s9 6 9 6s-3.5 6-9 6s-9-6-9-6zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 9h18",
  disarm: "M5 19L15 9M13 7l4 4M15 5l4 4M4 4l16 16",
  enfeeble: "M6 6l6 6l6-6M6 12l6 6l6-6",
  silence: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M5.6 5.6l12.8 12.8M9 10h.01M15 10h.01",
  expose: "M12 2v5M12 17v5M2 12h5M17 12h5M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 11.5v1",
  haste: "M13 3L6 13h5l-1 8l8-11h-5zM3 8h4M2 12h4M3 16h4",
  true_aim: "M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M18 6l-3 3",
  quiver: "M6 21l12-18M14 3h4v4M9 21v-4M5 17h4M12 19l3-3M16 15l2 2",
  kindred: "M8 9a3 3 0 1 0 0-6a3 3 0 1 0 0 6zM16 9a3 3 0 1 0 0-6a3 3 0 1 0 0 6zM4 21v-3a4 4 0 0 1 8 0M12 18a4 4 0 0 1 8 0v3",
  insight: "M2 12s4-7 10-7s10 7 10 7s-4 7-10 7s-10-7-10-7zM12 9v6M9 12h6",
  iron_skin: "M12 3l7 3v6c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6zM8 9h8M8 13h8",
  spellguard: "M12 3l7 3v6c0 4.5-3 7.5-7 9c-4-1.5-7-4.5-7-9V6zM12 8l1.5 3l3 .5l-2.2 2l.6 3l-2.9-1.5l-2.9 1.5l.6-3l-2.2-2l3-.5z",
  elemental: "M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-4 3-6 6-10zM12 11c1.5 2 3 3 3 5a3 3 0 0 1-6 0c0-2 1.5-3 3-5z",
  mirror: "M8 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6M3 20v-3a5 5 0 0 1 10 0v3M16 4a3 3 0 1 1 0 6M21 20v-3a5 5 0 0 0-5-5M12 2v20",
  blades: "M4 20l9-9M13 11l6-7l1 1l-7 6M6 14l4 4M3 21l2-2M14 20l4-4M18 16l2 2M12 20h2",
});

// Icon per special move (Shared Strike is every hero's basic move).
export const MOVE_ICONS = Object.freeze({
  sharedStrike: "strike",
  P3: "target", P3a: "skull", V3: "cleave", V3a: "horn", T2a: "rally", W3: "shield",
  S2a: "smoke", S3a: "vanish", I3: "phantom", H3: "drop", C2a: "ward", F3: "dice",
  SW1: "lunge", BW1: "pin", ST1: "surge",
});

// Icon per spell shape.
export const SPELL_SHAPE_ICONS = Object.freeze({
  bolt: "bolt", area: "burst", linger: "linger", meteor: "meteor",
  heal: "mend", renew: "renew", lifeline: "lifeline", barrier: "barrier", empower: "empower", aegis: "aegis",
  veil: "veil", terror: "terror", confusion: "confusion", ensnare: "ensnare", thornfield: "thornfield", summon: "summon", dominate: "dominate",
  blind: "blind", disarm: "disarm", enfeeble: "enfeeble", silence: "silence", expose: "expose",
  haste: "haste", true_aim: "true_aim", quiver: "quiver", kindred: "kindred", insight: "insight", iron_skin: "iron_skin", spellguard: "spellguard",
  blades: "blades", elemental: "elemental", mirror: "mirror",
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
