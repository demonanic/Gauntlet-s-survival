// Demonanic — v139 numerical baseline (data-driven config).
// The AUTHORITATIVE implementation reference. Tune here, not in UI code.
// OPEN placeholders are marked; smallest reversible values used.

// Section E — combat damage affinities
export const DAMAGE_TYPES = {
  KNIGHT_MELEE: "knight_melee",
  ROUGE_MELEE: "rouge_melee",
  ARCHER_RANGED: "archer_ranged",
  ARCANE: "arcane",
  FIRE: "fire",
  LIGHTNING: "lightning",
  FROST: "frost",
  DARK_SOUL: "dark_soul",
};

export const AFFINITY_MULTIPLIERS = {
  susceptible: 1.25,
  normal: 1,
  tolerant: 0.6,
  resistant: 0.3,
  immune: 0,
};

export function affinityMultiplier(target, damageType) {
  return AFFINITY_MULTIPLIERS[target?.affinities?.[damageType] || "normal"] ?? 1;
}

const NORMAL_AFFINITIES = {
  [DAMAGE_TYPES.KNIGHT_MELEE]: "normal",
  [DAMAGE_TYPES.ROUGE_MELEE]: "normal",
  [DAMAGE_TYPES.ARCHER_RANGED]: "normal",
  [DAMAGE_TYPES.ARCANE]: "normal",
  [DAMAGE_TYPES.FIRE]: "normal",
  [DAMAGE_TYPES.LIGHTNING]: "normal",
  [DAMAGE_TYPES.FROST]: "normal",
  [DAMAGE_TYPES.DARK_SOUL]: "normal",
};

export const BOSS_AFFINITIES = {
  threeHeadedDemon: {
    ...NORMAL_AFFINITIES,
    [DAMAGE_TYPES.ARCANE]: "tolerant",
    [DAMAGE_TYPES.FIRE]: "resistant",
    [DAMAGE_TYPES.DARK_SOUL]: "tolerant",
  },
  imperialNecromancer: {
    ...NORMAL_AFFINITIES,
    [DAMAGE_TYPES.KNIGHT_MELEE]: "susceptible",
    [DAMAGE_TYPES.ARCANE]: "tolerant",
    [DAMAGE_TYPES.LIGHTNING]: "tolerant",
    [DAMAGE_TYPES.FROST]: "tolerant",
    [DAMAGE_TYPES.DARK_SOUL]: "resistant",
  },
  nuclearBehemoth: {
    ...NORMAL_AFFINITIES,
    [DAMAGE_TYPES.ARCHER_RANGED]: "susceptible",
    [DAMAGE_TYPES.ARCANE]: "resistant",
    [DAMAGE_TYPES.LIGHTNING]: "resistant",
    [DAMAGE_TYPES.FROST]: "resistant",
    [DAMAGE_TYPES.DARK_SOUL]: "resistant",
  },
};

// Section H — hero progression
export const HERO_XP = [0,150,360,650,1030,1500,2070,2760,3550,4450,5450,6600,7900,9350,10950,12700,14600,16700,19050,21600];
export function heroLevelForXp(xp) {
  let lvl = 1;
  for (let i = 0; i < HERO_XP.length; i++) if (xp >= HERO_XP[i]) lvl = i + 1;
  return lvl;
}

// Section I — combat math
export function damageAfterDefense(raw, def) { return raw * 100 / (100 + def); }
export const CRIT_MULT = 1.75;
export const BASE_CRIT = 0.05;
export function dodgeChance(agi) { return Math.max(0, Math.min(0.35, 0.005 * agi)); }

// Section L — enemy XP & rewards
export const ENEMY_TIERS = {
  basic:       { xp: 10, gold: 4 },
  specialized: { xp: 20, gold: 7 },
  elite:       { xp: 60, gold: 20 },
  boss:        { xp: 600, gold: 150 },
};

// Enemy archetypes (base stats; scaled at spawn). Neon roster from reference art.
export const ENEMIES = {
  ghost:    { key: "ghost", name: "Ghost", tier: "basic", hp: 40, speed: 34, damage: 6, color: "#00F3FF", floats: true, affinities: { [DAMAGE_TYPES.DARK_SOUL]: "tolerant" } },
  slime:    { key: "slime", name: "Slime", tier: "basic", hp: 55, speed: 22, damage: 8, color: "#39FF14", magicImmune: true, affinities: { [DAMAGE_TYPES.ARCANE]: "immune", [DAMAGE_TYPES.LIGHTNING]: "resistant", [DAMAGE_TYPES.DARK_SOUL]: "resistant" } },
  goblin:   { key: "goblin",   name: "Goblin",   tier: "basic",       hp: 45,  speed: 40, damage: 7,  color: "#FFE600" },
  skeleton: { key: "skeleton", name: "Skeleton", tier: "specialized", hp: 70,  speed: 30, damage: 12, color: "#FF3366" },
  orc:      { key: "orc", name: "Orc", tier: "specialized", hp: 120, speed: 24, damage: 18, color: "#FF6600", affinities: { [DAMAGE_TYPES.ARCHER_RANGED]: "tolerant", [DAMAGE_TYPES.FROST]: "susceptible" } },
  reaper:   { key: "reaper", name: "Reaper", tier: "specialized", hp: 90, speed: 32, damage: 15, color: "#A855F7", floats: true, affinities: { [DAMAGE_TYPES.KNIGHT_MELEE]: "tolerant", [DAMAGE_TYPES.ARCHER_RANGED]: "tolerant", [DAMAGE_TYPES.DARK_SOUL]: "resistant" } },
  darkElf: { key: "darkElf", name: "Dark Elf", tier: "specialized", hp: 105, speed: 38, damage: 17, color: "#F43F5E", affinities: { [DAMAGE_TYPES.DARK_SOUL]: "susceptible", [DAMAGE_TYPES.ARCHER_RANGED]: "tolerant" } },
  warlock: { key: "warlock", name: "Warlock", tier: "specialized", hp: 115, speed: 20, damage: 13, color: "#C026D3", affinities: { [DAMAGE_TYPES.ARCANE]: "tolerant", [DAMAGE_TYPES.DARK_SOUL]: "resistant" } },
  lieutenant:{ key: "lieutenant", name: "Lieutenant", tier: "elite",  hp: 300, speed: 26, damage: 30, color: "#00F3FF" },
  demon: { key: "demon", name: "Three-Headed Demon", tier: "boss", hp: 2800, speed: 20, damage: 55, color: "#FF0055", boss: true, attackFx: "napalm", attackRange: 420, splashRadius: 68, affinities: BOSS_AFFINITIES.threeHeadedDemon },
imperialNecromancer: { key: "imperialNecromancer", name: "Imperial Necromancer", tier: "boss", hp: 3300, speed: 18, damage: 48, color: "#8B5CF6", boss: true, attackRange: 380, splashRadius: 52, affinities: BOSS_AFFINITIES.imperialNecromancer },
  // Gauntlet roster additions: each has a role in engine._updateSpecialEnemy.
  harrier: { key: "harrier", name: "Harrier", tier: "specialized", hp: 75, speed: 46, damage: 11, color: "#F97316" },
  carrionPriest: { key: "carrionPriest", name: "Carrion Priest", tier: "specialized", hp: 95, speed: 22, damage: 8, color: "#BE123C", affinities: { [DAMAGE_TYPES.DARK_SOUL]: "resistant" } },
  watcher: { key: "watcher", name: "Watcher", tier: "specialized", hp: 70, speed: 26, damage: 9, color: "#2DD4BF", floats: true },
  stalker: { key: "stalker", name: "Stalker", tier: "elite", hp: 210, speed: 40, damage: 20, color: "#A16207" },
  gnome: { key: "gnome", name: "Gnome Sapper", tier: "basic", hp: 38, speed: 44, damage: 7, color: "#FB923C", bomber: true },
  bandit: { key: "bandit", name: "Bandit", tier: "specialized", hp: 80, speed: 42, damage: 12, color: "#FBBF24" },
  lesserNecromancer: { key: "lesserNecromancer", name: "Lesser Necromancer", tier: "specialized", hp: 90, speed: 22, damage: 9, color: "#8B5CF6", affinities: { [DAMAGE_TYPES.DARK_SOUL]: "resistant" } },
  // The anchor: a slow shield-bearer that stands between the heroes and its
  // squad's casters and archers (engine._updateSpecialEnemy). Arrows glance
  // off the shield, spells get around it (`shield`: damage taken by weapon).
  bulwark: { key: "bulwark", name: "Bulwark", tier: "specialized", hp: 180, speed: 26, damage: 12, color: "#60A5FA", shield: { bow: 0.8, staff: 1.15 } },
  banditWarlord: { key: "banditWarlord", name: "Bandit Warlord", tier: "boss", hp: 1500, speed: 30, damage: 32, color: "#FBBF24", boss: true },
  bogLich: { key: "bogLich", name: "The Bog Lich", tier: "boss", hp: 9000, speed: 16, damage: 70, color: "#A3E635", boss: true, attackRange: 400, splashRadius: 60, affinities: BOSS_AFFINITIES.imperialNecromancer },
nuclearBehemoth: { key: "nuclearBehemoth", name: "The Abomination", tier: "boss", hp: 3800, speed: 16, damage: 60, color: "#84CC16", boss: true, affinities: BOSS_AFFINITIES.nuclearBehemoth },
};
// Gauntlet behavior families. Squads are read by what they do, not just how
// tough they are. Some families drive engine behavior directly: "hunter"
// (chases the most wounded hero) and "predator" (hits wounded heroes 40%
// harder); "watcher" makes sneaking past a squad harder (adventure.js). The
// rest describe roles implemented per enemy in engine._updateSpecialEnemy.
export const ENEMY_FAMILIES = Object.freeze({
  ghost: ["skirmisher"], slime: ["attrition"], goblin: ["skirmisher"], skeleton: [], orc: [],
  reaper: ["hunter"], darkElf: ["hunter", "skirmisher"], warlock: ["disruptor"], lieutenant: ["protector"],
  gnome: ["ambusher", "attrition"], bandit: ["hunter", "ambusher"], lesserNecromancer: ["protector"],
  harrier: ["hunter", "predator"], carrionPriest: ["protector"], watcher: ["watcher", "disruptor"],
  stalker: ["hunter", "predator", "ambusher"], bulwark: ["protector", "attrition"],
});

// Encounter-composition roles, layered over the behavior families: what an
// enemy does for its squad. Pressure forces an immediate reaction; support
// grows stronger while allies live; control bends positioning, targeting or
// vulnerability; an anchor holds the heroes off its squad; a wildcard changes
// the normal rules of a fight. Plain fighters are "frontline". Encounter
// generation (game/ecology.js) builds squads from these.
export const ENEMY_ROLES = Object.freeze({
  ghost: ["frontline"], slime: ["frontline"], goblin: ["frontline"], skeleton: ["frontline"], orc: ["frontline"],
  reaper: ["pressure"], lieutenant: ["frontline"],
  harrier: ["pressure"], bandit: ["pressure"], stalker: ["pressure"], gnome: ["pressure", "wildcard"],
  carrionPriest: ["support"], lesserNecromancer: ["support", "wildcard"],
  watcher: ["control"], darkElf: ["control"], warlock: ["control"],
  bulwark: ["anchor"],
});
export const ROLE_LABELS = Object.freeze({
  pressure: "Pressure", support: "Support", control: "Control", anchor: "Anchor", wildcard: "Wildcard", frontline: "Frontline",
});
// Allies a Bulwark keeps behind its shield.
export const WARDED_ROLES = Object.freeze(["support", "control"]);
export const FAMILY_LABELS = Object.freeze({
  hunter: "Hunter", predator: "Predator", protector: "Protector", disruptor: "Disruptor", attrition: "Attrition",
  ambusher: "Ambusher", skirmisher: "Skirmisher", watcher: "Watcher",
});