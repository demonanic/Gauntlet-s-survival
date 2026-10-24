// Demonanic — v139 numerical baseline (data-driven config).
// The AUTHORITATIVE implementation reference. Tune here, not in UI code.
// OPEN placeholders are marked; smallest reversible values used.

export const TIME = {
  scoutCountdown: 5,        // s, pre-wave scout phase (LOCKED)
  tacticalSlowdown: 10,     // s, card-open slowdown (LOCKED)
  slowdownFactor: 0.2,      // gameplay speed during slowdown
  offlineCapHours: 12,      // LOCKED baseline
};

// Section A2 — castle recovery / return loop
// Baseline values are intentionally conservative and should be simulated before final balance lock.
export const RECOVERY = {
  moralePerHour: 4,         // passive morale recovery while resting
  heroHpPercentPerHour: 8,  // wounded heroes recover this % of max HP per hour
  offlineCapHours: 12,      // recovery uses the same offline cap as production
  reviveHpPercent: 50,      // paid/manual revive returns a defeated hero at 50% HP
};

// Section B — starting economy & workforce
export const STARTING = {
  gold: 500, stone: 150, metal: 100,
  workers: 2, workersGold: 1, workersStone: 1, mineGoldRatio: 0.5,
};
export const HERO_ROSTER = Object.freeze({
  startingHeroes: 1,
  maximumOwned: 6,
  maximumSquad: 6,
  recruitmentCostMultiplier: 2,
});
export const PRODUCTION = {
  goldPerWorkerMin: 8, stonePerWorkerMin: 3,
};
export const GUILD = { baseMetalStorage: 500, baseStoneStorage: 500, storagePerLevel: 250, baseAmmoCache: 300, ammoCachePerLevel: 150, baseManufacturingPerMinute: 2, guildLevelBonus: 0.25, cpBonusPerPointAbove20: 0.02, metalPerAmmo: 1, stonePerAmmo: 0.25 };


export function workforceOutput(baseRate, n) {
  if (n <= 0) return 0;
  return baseRate * n * (1 + 0.05 * (n - 1)); // per minute
}
export function moraleMultiplier(moraleFrac) {
  return Math.max(0.5, Math.min(1.25, 0.5 + 0.75 * moraleFrac));
}
export function castleEfficiency(hpFrac) {
  return Math.max(0.4, 1 - 0.6 * (1 - hpFrac));
}

// Section C — workforce purchase curves
export function workerCost(owned) { return Math.ceil(75 * Math.pow(1.20, owned)); }

// Section E — combat damage affinities and towers
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

export const TOWER_RESOURCE = {
  archer: { kind: "ammo", label: "AMMO", max: 120, shotCost: 1, resupplyGold: 1, resupplyStone: 0 },
  catapult: { kind: "ammo", label: "AMMO", max: 30, shotCost: 3, resupplyGold: 4, resupplyStone: 1 },
  wizard: { kind: "mana", label: "MANA", max: 100, shotCost: 8, resupplyGold: 3, resupplyStone: 0 },
  ballista: { kind: "ammo", label: "BOLTS", max: 40, shotCost: 2, resupplyGold: 3, resupplyStone: 1 },
};

export const TOWER_UPGRADE = {
  hpMult: 0.10,
  damageMult: 0.10,
  resourceMult: 0.12,
  baseGold: 180,
  baseStone: 45,
  levelScale: 1.32,
};

export function towerUpgradeCost(tower) {
  const t = TOWERS[tower.type];
  const level = Math.max(1, tower.level || 1);
  return {
    gold: Math.ceil((t.construction.gold * 0.9 + TOWER_UPGRADE.baseGold) * Math.pow(TOWER_UPGRADE.levelScale, level - 1)),
    stone: Math.ceil((t.construction.stone * 0.9 + TOWER_UPGRADE.baseStone) * Math.pow(TOWER_UPGRADE.levelScale, level - 1)),
  };
}

export const TOWERS = {
  archer:   { key: "archer",   name: "Archer Tower", icon: "bow",
    construction: { gold: 100, stone: 20 }, upkeep: { gold: 8, stone: 2 },
    role: "sustained_single_target", targetPriority: "nearest", damageType: DAMAGE_TYPES.ARCHER_RANGED, baseHp: 625, range: 260, fireRate: 0.9, damage: 22, spyBonus: 5, color: "#00F3FF" },
  catapult: { key: "catapult", name: "Catapult", icon: "axe",
    construction: { gold: 150, stone: 35 }, upkeep: { gold: 12, stone: 3 },
    role: "group_control", targetPriority: "cluster", damageType: DAMAGE_TYPES.KNIGHT_MELEE, baseHp: 813, range: 320, fireRate: 2.2, damage: 70, splash: 55, spyBonus: 0, color: "#FF6600" },
  wizard:   { key: "wizard",   name: "Wizard Tower", icon: "sun",
    construction: { gold: 175, stone: 30 }, upkeep: { gold: 14, stone: 3 },
    role: "magic", targetPriority: "vulnerable", damageType: DAMAGE_TYPES.ARCANE, baseHp: 719, range: 240, fireRate: 1.4, damage: 40, magic: true, spyBonus: 10, color: "#A855F7" },
  ballista: { key: "ballista", name: "Ballista / Tower 4", icon: "gear",
    construction: { gold: 225, stone: 50 }, upkeep: { gold: 18, stone: 5 },
    role: "elite_boss_hunter", targetPriority: "elite_boss", damageType: DAMAGE_TYPES.ARCHER_RANGED, baseHp: 875, range: 380, fireRate: 1.7, damage: 95, spyBonus: 0, color: "#FF0055" },
};
export const TOWER_ORDER = ["archer", "catapult", "wizard", "ballista"];

// Tower specialization is chosen at levels 3 and 5. Choices are saved per tower.
// The regular paid level-up still grants the existing HP, damage, and capacity growth.
export const TOWER_SPECIALIZATIONS = {
  archer: [
    { milestone: 3, id: "rapid_volley", name: "Rapid Volley", desc: "+15% fire rate.", effect: { fireRatePct: 0.15 } },
    { milestone: 3, id: "deadeye", name: "Deadeye", desc: "+20% damage.", effect: { damagePct: 0.20 } },
    { milestone: 5, id: "deep_quiver", name: "Deep Quiver", desc: "+25% ammo capacity.", effect: { capacityPct: 0.25 } },
    { milestone: 5, id: "farshot", name: "Farshot", desc: "+15% range.", effect: { rangePct: 0.15 } },
  ],
  catapult: [
    { milestone: 3, id: "siege_payload", name: "Siege Payload", desc: "+15% damage and +20% splash radius.", effect: { damagePct: 0.15, splashPct: 0.20 } },
    { milestone: 3, id: "reinforced_frame", name: "Reinforced Frame", desc: "+20% maximum HP.", effect: { hpPct: 0.20 } },
    { milestone: 5, id: "quick_reload", name: "Quick Reload", desc: "+12% fire rate.", effect: { fireRatePct: 0.12 } },
    { milestone: 5, id: "heavy_stone", name: "Heavy Stone", desc: "+25% damage.", effect: { damagePct: 0.25 } },
  ],
  wizard: [
    { milestone: 3, id: "mana_efficiency", name: "Mana Efficiency", desc: "Each shot costs 2 less mana.", effect: { shotCostReduction: 2 } },
    { milestone: 3, id: "arcane_overcharge", name: "Arcane Overcharge", desc: "+20% damage.", effect: { damagePct: 0.20 } },
    { milestone: 5, id: "crystal_reservoir", name: "Crystal Reservoir", desc: "+25% mana capacity.", effect: { capacityPct: 0.25 } },
    { milestone: 5, id: "long_channel", name: "Long Channel", desc: "+15% range.", effect: { rangePct: 0.15 } },
  ],
  ballista: [
    { milestone: 3, id: "siegebreaker", name: "Siegebreaker", desc: "+20% damage.", effect: { damagePct: 0.20 } },
    { milestone: 3, id: "long_draw", name: "Long Draw", desc: "+15% range.", effect: { rangePct: 0.15 } },
    { milestone: 5, id: "boss_piercer", name: "Boss Piercer", desc: "+30% damage against bosses.", effect: { bossDamagePct: 0.30 } },
    { milestone: 5, id: "reinforced_limbs", name: "Reinforced Limbs", desc: "+20% maximum HP.", effect: { hpPct: 0.20 } },
  ],
};

// underfunded state penalties
export const UNDERFUNDED = { damageMult: 0.65, fireRateMult: 1.25, hpLossPerMin: 0.04 };

// Towers gain XP from kills and level up (player picks stat vs ability on level-up).
export function towerLevelForXp(xp) {
  let lvl = 1;
  while (lvl < 30 && xp >= 150 * lvl * (lvl + 1) / 2) lvl++;
  return lvl;
}
export const TOWER_UPGRADE_CHOICES = {
  stat: { key: "stat", label: "+Combat Stat", desc: "+12% damage & HP this level." },
  ability: { key: "ability", label: "Ability Unlock", desc: "Unlock/boost tower ability." },
};

// Repairs use Stone; hero healing uses Gold.
export const REPAIR_STONE_PER_10HP = 1;
export function repairStoneCost(missingHp) { return Math.ceil(missingHp / 10); }
export const HERO_HEAL_GOLD_PER_10HP = 1;

// Section F — tower slot progression (CP thresholds)
export const SLOT_THRESHOLDS = [0, 8, 15, 24, 36]; // slot 1..5
export function slotCapacity(cp) {
  let cap = 1;
  for (let i = 1; i < SLOT_THRESHOLDS.length; i++) if (cp >= SLOT_THRESHOLDS[i]) cap = i + 1;
  return cap;
}

// Section G — barricades (5 positions)
export const BARRICADE = {
  positions: 5, goldToHp: 2, minGold: 25, maxGold: 500, maxHp: 1000,
  collisionDamage: 8,
  repairStonePer10Hp: 1,
};
export const GUILD_BLOCKADE = {
  requiredGuildLevel: 2,
  upgradeGold: 500,
  upgradeStone: 250,
  activationGold: 100,
  activationStone: 50,
  durationMs: 8000,
  cooldownMs: 60000,
};

// Section H — hero progression
export const HERO_XP = [0,150,360,650,1030,1500,2070,2760,3550,4450,5450,6600,7900,9350,10950,12700,14600,16700,19050,21600];
export function heroLevelForXp(xp) {
  let lvl = 1;
  for (let i = 0; i < HERO_XP.length; i++) if (xp >= HERO_XP[i]) lvl = i + 1;
  return lvl;
}
export const AP_COST = { 1: 1, 2: 2, 3: 3 };

export const HERO_CLASSES = {
  knight: { key: "knight", name: "Knight", role: "Offensive Heavy", color: "#00F3FF",
    mods: { defense: 3 }, baseHp: 320, attackRange: 70, attackRate: 1.1,
    ability: { name: "Shield Bash", desc: "Stuns and deals bonus melee damage." },
    perks: ["Bulwark (+DEF)", "Cleave (hit 2 targets)", "Iron Wall (+15% max HP)"] },
  rouge: { key: "rouge", name: "Rouge", role: "Blitz", color: "#FF007F",
    mods: { agility: 3 }, baseHp: 240, attackRange: 90, attackRate: 0.5,
    ability: { name: "Blitz Strike", desc: "Rapid multi-hit on nearest enemy." },
    perks: ["Flurry (+atk speed)", "Backstab (+crit)", "Evasion (+dodge)"] },
  mage: { key: "mage", name: "Mage", role: "Configurable Spell", color: "#A855F7",
    mods: { intelligence: 3 }, baseHp: 210, attackRange: 300, attackRate: 1.6, magic: true,
    ability: { name: "Arcane Bolt", desc: "Magic damage; configurable to heal/buff." },
    perks: ["Firestorm (AoE)", "Mend (heal squad)", "Barrier (shield)"] },
  archer: { key: "archer", name: "Archer", role: "Sniper / Targeting", color: "#39FF14",
    mods: { attack: 3 }, baseHp: 230, attackRange: 340, attackRate: 1.0,
    ability: { name: "Piercing Shot", desc: "Long-range shot; can snipe a type." },
    perks: ["Eagle Eye (+range)", "Rapid Draw (+atk speed)", "Focus Fire (+dmg vs low HP)"] },
};
export const HERO_ORDER = ["knight", "rouge", "mage", "archer"];
// Recruitment should require saving beyond the starting treasury.
export function recruitCost(ownedHeroes) {
  const over = Math.max(0, ownedHeroes - 3);
  // Subtract a tiny epsilon so floating-point noise doesn't round exact prices up.
  return Math.ceil(550 * Math.pow(1.6, over - 1) - 1e-9);
}
export function classlessRecruitCost(ownedHeroes) {
  // A fresh classless profile starts with one hero. Price its next recruit at
  // twice the established fourth-hero cost, then retain the existing 1.6 curve.
  return Math.ceil(HERO_ROSTER.recruitmentCostMultiplier * recruitCost(ownedHeroes + 3) - 1e-9);
}
export const BASE_STATS = { attack: 10, defense: 10, agility: 10, intelligence: 10 };
export const ATTACK_CONFIGS = {
  knight: ["Offensive Heavy", "Defensive Guard"],
  rouge: ["Blitz Nearest", "Assassinate Weakest"],
  mage: ["Offensive Spells", "Support / Heal", "Defensive Barrier"],
  archer: ["Sniper (strongest)", "Closest Enemy"],
};
export const EQUIP_SLOTS = ["Helm", "Chest", "Legs", "Arms", "Boots", "PrimaryWeapon", "SecondaryWeapon", "Cloak", "Ring1", "Ring2", "Necklace"];

// Section I — combat math
export function damageAfterDefense(raw, def) { return raw * 100 / (100 + def); }
export const CRIT_MULT = 1.75;
export const BASE_CRIT = 0.05;
export function dodgeChance(agi) { return Math.max(0, Math.min(0.35, 0.005 * agi)); }
export const REVIVE_PROTECT_S = 5;

// Section J — morale
export const MORALE = {
  base: 50, freeLifeReset: 20,
  waveComplete: 3, heroKill: 2, specialistKill: 1, eliteKill: 3, bossKill: 10,
  heroDefeat: -12, towerDestroyed: -8, surrender: -25,
  castleLossPerPct: -0.5,
};
// Tavern morale service. Costs keep morale recovery useful without allowing free spam.
export const TAVERN_FEAST = { gold: 80, stone: 20, morale: 8 };

export function healRateMultiplier(moraleFrac) {
  return Math.min(1.25, 0.5 + 0.75 * moraleFrac);
}

// Section K — castle
export function castleMaxHp(highestWaveCleared) { return 1000 + 50 * highestWaveCleared; }

// Section L — enemy XP & rewards
export const ENEMY_TIERS = {
  basic:       { xp: 10, gold: 4 },
  specialized: { xp: 20, gold: 7 },
  elite:       { xp: 60, gold: 20 },
  boss:        { xp: 600, gold: 150 },
};

// Section M — wave scaling
// Reduce standard wave density by about 20% without removing boss milestones.
export function targetEnemyCount(wave, cp) { return Math.max(5, Math.round((12 + 2.5 * wave + 0.75 * cp) * 0.8)); }
// Global combat tuning: reduce enemy durability by 15% and damage by 25%.
// Keep wave/kingdom scaling intact so later waves still become progressively harder.
export function enemyHpScale(wave, cp) { return (1 + 0.05 * (wave - 1) + 0.02 * cp) * 0.85; }
export function enemyDmgScale(wave, cp) { return (1 + 0.032 * (wave - 1) + 0.015 * cp) * 0.75; }

// Early-game correction based on live Android playtesting:
// W1/W2/W3 were reading as too difficult for a fresh squad. Keep the
// established mid/late-game curve intact while giving new players a softer
// opening window to learn positioning, towers, and hero commands.
export function earlyWaveCombatScale(wave) {
  if (wave <= 1) return 0.75;
  if (wave === 2) return 0.82;
  if (wave === 3) return 0.88;
  return 1;
}

export function earlyWaveEnemyCount(wave, cp) {
  if (wave === 1) return 8;
  if (wave === 2) return 10;
  if (wave === 3) return 11;
  return Math.max(5, Math.round((12 + 2.5 * wave + 0.75 * cp) * 0.8));
}

export const GROUP_WEIGHTS = [0.25, 0.20, 0.20, 0.15, 0.20];

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
imperialNecromancer: { key: "imperialNecromancer", name: "Imperial Necromancer", tier: "boss", hp: 3300, speed: 18, damage: 48, color: "#8B5CF6", boss: true, affinities: BOSS_AFFINITIES.imperialNecromancer },
nuclearBehemoth: { key: "nuclearBehemoth", name: "Nuclear Behemoth", tier: "boss", hp: 3800, speed: 16, damage: 60, color: "#84CC16", boss: true, affinities: BOSS_AFFINITIES.nuclearBehemoth },
};
export const BASIC_POOL = ["ghost", "slime", "goblin"];
export const SPEC_POOL = ["skeleton", "orc", "reaper", "darkElf", "warlock"];

// Real-world early-game calibration: use deliberate compositions for the
// first three waves instead of relying on random specialist percentages.
// This makes the opening difficulty and enemy identity actually change
// from wave to wave and gives a fresh player a readable learning curve.
export const EARLY_WAVE_POOLS = {
  1: ["ghost", "goblin"],
  2: ["ghost", "goblin", "slime"],
  3: ["ghost", "goblin", "slime", "skeleton"],
};

// Section O — surrender / revival
export function surrenderTaxRate(wave) { return Math.min(0.25, 0.05 + 0.02 * Math.floor(wave / 5)); }
// A minimum fee keeps low-level revival from being effectively disposable.
export function paidRevivalCost(heroLevel) { return Math.min(2000, Math.max(300, 100 * heroLevel)); }
export const FREE_LIFE = { keepResourceFrac: 0.30, moraleReset: 20 };

// Scout knowledge (Section N)
export const SCOUT = { successAdd: 20, decayPerWave: 0.15, towerSpyBase: 0.15, cancelFrac: 0.5, maxCancel: 0.75 };

export const CP_NOTE = "CP = sum(hero levels) + sum(deployed tower levels).";

// Academy: six-hour base course; CP and Intelligence tune duration.
export const ACADEMY = { baseHours: 6, cpScalePerPointAbove20: 0.002, intelligenceReductionPerPointAbove10: 0.02, maxIntelligenceReduction: 0.5, startingSeats: 2, extraSeatEveryLevels: 3 };
