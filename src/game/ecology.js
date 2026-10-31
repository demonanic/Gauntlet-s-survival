// Enemy ecology: squads built as tactical compositions rather than piles of
// enemies. Each template pairs enemies whose existing behaviors feed each
// other (a Watcher marks, Harriers exploit it); none of them gets a hidden
// bonus for being in one. Regions name which templates they field and how
// often (region.wildlife.ecology). Every squad, templated or random, then
// passes the anti-frustration limits below.
import * as C from "../combat/config";

// `slots` are enemy keys, or "fodder" / "frontline" for a plain fighter from
// the region's own wildlife. `sign` is what a party that doesn't recognise
// the formation notices; a party that does sees its name.
export const ECOLOGIES = Object.freeze({
  huntPack: {
    name: "Hunt Pack",
    sign: "They're moving together, spreading out to cut someone off.",
    slots: ["watcher", "harrier", "harrier"],
  },
  deathCult: {
    name: "Death Cult",
    sign: "One of them chants over the others, and none of them seem afraid to die.",
    slots: ["bulwark", "carrionPriest", "fodder", "fodder"],
  },
  graveCourt: {
    name: "Grave Court",
    sign: "A shield-bearer keeps close to a robed figure. The ground behind them is freshly dug.",
    slots: ["bulwark", "lesserNecromancer", "frontline", "frontline"],
  },
  killTeam: {
    name: "Kill Team",
    sign: "They're quiet, and they keep looking at whoever is hurt.",
    slots: ["darkElf", "bandit", "watcher"],
  },
  demolitionCrew: {
    name: "Demolition Crew",
    sign: "Something behind a big shield is hissing.",
    slots: ["bulwark", "gnome", "gnome"],
  },
});

// Plain fighters for template "fodder" / "frontline" slots and squad fixes.
export const FODDER = Object.freeze(["goblin", "skeleton", "ghost", "slime"]);
export const FRONTLINE = Object.freeze(["skeleton", "orc", "goblin", "ghost"]);

// Anti-frustration limits, per squad. One Bulwark (two would wall off the
// backline completely), one of each resurrector or sacrificer, no more than
// two Sappers or Dark Elves, no more than two support or two control enemies,
// and never a squad of nothing but support.
export const SQUAD_LIMITS = Object.freeze({
  types: { bulwark: 1, watcher: 1, lesserNecromancer: 1, carrionPriest: 1, gnome: 2, darkElf: 2 },
  roles: { support: 2, control: 2 },
});

export const rolesOf = (key) => C.ENEMY_ROLES[key] || ["frontline"];

function weightedPick(weights, rng) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  let roll = rng() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

// A plain fighter of the given kind, preferring the region's own creatures.
function plainFighter(kind, pool, rng) {
  const list = kind === "fodder" ? FODDER : FRONTLINE;
  const local = Object.fromEntries(Object.entries(pool || {}).filter(([key]) => list.includes(key)));
  return Object.keys(local).length ? weightedPick(local, rng) : list[Math.floor(rng() * list.length)];
}

// The enemy keys for one template, at the region's wildlife.
export function fillEcology(key, pool, rng = Math.random) {
  const template = ECOLOGIES[key];
  if (!template) throw new RangeError(`Unknown ecology ${key}`);
  return template.slots.map((slot) => (slot === "fodder" || slot === "frontline" ? plainFighter(slot, pool, rng) : slot));
}

// Pick a template for a region's encounter, or null for an ordinary squad.
export function rollEcology(wildlife, rng = Math.random) {
  const ecology = wildlife?.ecology;
  if (!ecology || !(rng() < ecology.chance)) return null;
  return weightedPick(ecology.templates, rng);
}

// Bring a squad within SQUAD_LIMITS by swapping offenders for plain fighters
// from the pool. Returns a new array.
export function constrainSquad(squad, pool, rng = Math.random) {
  const result = [];
  const types = {};
  const roles = {};
  const fits = (key) => (types[key] || 0) < (SQUAD_LIMITS.types[key] ?? Infinity) &&
    rolesOf(key).every((role) => (roles[role] || 0) < (SQUAD_LIMITS.roles[role] ?? Infinity));
  const add = (key) => {
    result.push(key);
    types[key] = (types[key] || 0) + 1;
    for (const role of rolesOf(key)) roles[role] = (roles[role] || 0) + 1;
  };
  for (const key of squad) {
    if (C.ENEMIES[key]?.boss || fits(key)) add(key);
    else add(plainFighter("frontline", pool, rng));
  }
  // Never a squad of healers and nothing else.
  const fighters = result.filter((key) => !rolesOf(key).every((role) => role === "support" || role === "wildcard"));
  if (!fighters.length && result.length) result[result.length - 1] = plainFighter("frontline", pool, rng);
  return result;
}

// The roles in a squad, for the encounter prompt.
export function squadRoles(enemies) {
  return [...new Set(enemies.flatMap((enemy) => rolesOf(enemy.type)))];
}
