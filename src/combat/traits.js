// Gauntlet hero qualities (stored as hero.traits). Qualities are who a hero
// is, not choices: every recruit is born with one innate quality, and veterans
// develop more from what they actually did (game/qualities.js). Perks, abilities
// and gear are the player's build; qualities are the hero's identity.
//
// `effects` are combat numbers read by the engine (classlessHeroDerived and the
// hit, heal and kill paths); xp and gold are applied when a fight resolves.
// `road` effects shape the expedition itself (sneaking, ambushes, morale,
// finds, hazards, stalkers): see partyRoadEffects and game/expedition.js.
// Evolved qualities have three tiers; hero.qualityTiers[key] says which one.

import { petRoadEffects } from "./pets";

const tiers = (names, list) => list.map((tier, index) => ({ name: names[index], ...tier }));

export const TRAITS = Object.freeze({
  // ---------- innate: combat ----------
  brawny: { key: "brawny", name: "Brawny", kind: "combat", desc: "+12% max HP.", effects: { maxHp: 0.12 } },
  keenEye: { key: "keenEye", name: "Keen Eye", kind: "combat", desc: "+6% crit chance.", effects: { critChance: 0.06 } },
  nimble: { key: "nimble", name: "Nimble", kind: "combat", desc: "+8 agility (dodge); light on their feet when sneaking.", effects: { agility: 8 }, road: { sneak: 0.05 } },
  ironhide: { key: "ironhide", name: "Ironhide", kind: "combat", desc: "+8 defense.", effects: { defense: 8 } },
  berserker: { key: "berserker", name: "Berserker", kind: "combat", desc: "+20% damage while below half HP.", effects: { berserk: 0.2 } },
  quickHands: { key: "quickHands", name: "Quick Hands", kind: "combat", desc: "+8% attack speed.", effects: { attackSpeed: 0.08 } },
  medic: { key: "medic", name: "Field Medic", kind: "combat", desc: "Bandages and potions heal 40% more.", effects: { healBonus: 0.4 } },
  fastLearner: { key: "fastLearner", name: "Fast Learner", kind: "combat", desc: "+25% XP.", effects: { xpBonus: 0.25 } },
  treasureHunter: { key: "treasureHunter", name: "Treasure Hunter", kind: "combat", desc: "Kills drop +50% gold.", effects: { goldFind: 0.5 } },
  stalwart: { key: "stalwart", name: "Stalwart", kind: "combat", desc: "-8% damage taken.", effects: { damageTaken: 0.08 } },
  swift: { key: "swift", name: "Swift", kind: "combat", desc: "+20% movement speed; light on their feet when sneaking.", effects: { moveSpeed: 0.2 }, road: { sneak: 0.05 } },

  // ---------- innate: on the road ----------
  tracker: { key: "tracker", name: "Tracker", kind: "road", desc: "Reads the trail behind the party: far likelier to notice something stalking it.", road: { stalkerDetect: 0.18 } },
  keenEared: { key: "keenEared", name: "Keen-Eared", kind: "road", desc: "Hears trouble coming: fewer ambushes, and they hit the party softer.", road: { ambush: -0.06, ambushVolley: 0.4, stalkerDetect: 0.05 } },
  nightEyes: { key: "nightEyes", name: "Night Eyes", kind: "road", desc: "Sees in the dark: the party is no likelier to be ambushed at night.", road: { nightAmbush: 1 } },
  trailwise: { key: "trailwise", name: "Trailwise", kind: "road", desc: "Spots danger on the path ahead: may turn an ambush into a sighting.", road: { spotAmbush: 0.3 } },
  lightSleeper: { key: "lightSleeper", name: "Light Sleeper", kind: "road", desc: "Wakes at the faintest sound: raids on the camp find the party ready.", road: { campGuard: 1 } },
  sureFooted: { key: "sureFooted", name: "Sure-Footed", kind: "road", desc: "Dodges traps and falls far more often, and shrugs off half the environment's toll.", road: { hazardDodge: 0.25, envDrain: 0.5 } },
  scavenger: { key: "scavenger", name: "Scavenger", kind: "road", desc: "Finds more along the way, and picks over the fallen after a win.", road: { findChance: 0.4, scavengeOnWin: 0.3 } },
  bloodhound: { key: "bloodhound", name: "Bloodhound", kind: "road", desc: "Follows the strange trails: rare events and legendary monsters turn up more often.", road: { rareChance: 0.8 } },
  charismatic: { key: "charismatic", name: "Charismatic", kind: "road", desc: "The party's mood settles higher with them around.", road: { moraleBase: 10 } },
  inspiring: { key: "inspiring", name: "Inspiring", kind: "road", desc: "Rallies the party after every victory, and more after a hard one.", road: { moraleOnWin: 6 } },
  steadfast: { key: "steadfast", name: "Steadfast", kind: "road", desc: "Unshaken: the party loses less morale to bad news and scares.", road: { moraleLossCut: 0.4 } },
  optimist: { key: "optimist", name: "Optimist", kind: "road", desc: "When spirits sink, they keep finding the bright side.", road: { moraleWhenLow: 3 } },

  // ---------- innate: mixed blessings ----------
  glassCannon: { key: "glassCannon", name: "Glass Cannon", kind: "mixed", desc: "+15% damage, -10% max HP.", effects: { damage: 0.15, maxHp: -0.1 } },
  reckless: { key: "reckless", name: "Reckless", kind: "mixed", desc: "+12% damage, but makes sneaking harder and walks into more ambushes.", effects: { damage: 0.12 }, road: { sneak: -0.08, ambush: 0.04 } },
  loud: { key: "loud", name: "Loud", kind: "mixed", desc: "Terrible at sneaking, but their victory roars lift the whole party.", road: { sneak: -0.1, moraleOnWin: 5 } },
  frail: { key: "frail", name: "Frail", kind: "mixed", desc: "-15% max HP, but learns 30% faster.", effects: { maxHp: -0.15, xpBonus: 0.3 } },
  greedy: { key: "greedy", name: "Greedy", kind: "mixed", desc: "+30% gold from finds and kills, but grabs at every chest and offering, and is unlucky doing it.", effects: { goldFind: 0.3 }, road: { goldFind: 0.3, gambleLuck: -0.15, greedy: 1 } },
  paranoid: { key: "paranoid", name: "Paranoid", kind: "mixed", desc: "Sees threats everywhere and is often right: fewer ambushes, spots stalkers, but every bad sign hits morale harder.", road: { ambush: -0.06, stalkerDetect: 0.12, moralePerDanger: -2 } },

  // ---------- evolved: earned from a hero's history (game/qualities.js) ----------
  marksman: {
    key: "marksman", name: "Marksman", kind: "evolved",
    story: "Years of fighting from a distance have honed {hero}'s aim.",
    tiers: tiers(["Marksman", "Skilled Marksman", "Master Marksman"], [
      { desc: "+5% crit chance with ranged attacks.", effects: { rangedCrit: 0.05 } },
      { desc: "+7% ranged crit chance, +15% crit damage.", effects: { rangedCrit: 0.07, critDamage: 0.15 } },
      { desc: "+9% ranged crit chance, +25% crit damage; ranged crits finish off wounded common foes (below 20% HP).", effects: { rangedCrit: 0.09, critDamage: 0.25, execute: 0.2 } },
    ]),
  },
  bladesworn: {
    key: "bladesworn", name: "Bladesworn", kind: "evolved",
    story: "A lifetime in the thick of the fighting has made {hero} deadly up close.",
    tiers: tiers(["Bladesworn", "Seasoned Bladesworn", "Bladesworn Master"], [
      { desc: "+6% melee damage.", effects: { meleeDamage: 0.06 } },
      { desc: "+9% melee damage, +4% attack speed.", effects: { meleeDamage: 0.09, attackSpeed: 0.04 } },
      { desc: "+13% melee damage, +6% attack speed.", effects: { meleeDamage: 0.13, attackSpeed: 0.06 } },
    ]),
  },
  survivor: {
    key: "survivor", name: "Survivor", kind: "evolved",
    story: "{hero} has crawled out of more fights than anyone should. They don't go down easy.",
    tiers: tiers(["Survivor", "Hardened Survivor", "Unkillable"], [
      { desc: "Takes 10% less damage below 30% HP.", effects: { lowHpGuard: 0.1 } },
      { desc: "Takes 16% less damage below 30% HP.", effects: { lowHpGuard: 0.16 } },
      { desc: "Takes 22% less damage below 30% HP.", effects: { lowHpGuard: 0.22 } },
    ]),
  },
  giantslayer: {
    key: "giantslayer", name: "Giantslayer", kind: "evolved",
    story: "{hero} has stared down lieutenants and lords. The big ones don't scare them anymore.",
    tiers: tiers(["Giantslayer", "Veteran Giantslayer", "Bane of Tyrants"], [
      { desc: "+8% damage to elites and bosses.", effects: { eliteDamage: 0.08 } },
      { desc: "+12% damage to elites and bosses.", effects: { eliteDamage: 0.12 } },
      { desc: "+16% damage to elites and bosses.", effects: { eliteDamage: 0.16 } },
    ]),
  },
  ghostStep: {
    key: "ghostStep", name: "Ghost-Step", kind: "evolved",
    story: "{hero} has slipped past so many monsters that silence comes naturally now.",
    tiers: tiers(["Ghost-Step", "Shadow-Step", "Living Shadow"], [
      { desc: "+4% party sneak chance, +3 agility.", effects: { agility: 3 }, road: { sneak: 0.04 } },
      { desc: "+6% party sneak chance, +5 agility.", effects: { agility: 5 }, road: { sneak: 0.06 } },
      { desc: "+8% party sneak chance, +7 agility.", effects: { agility: 7 }, road: { sneak: 0.08 } },
    ]),
  },
  bulwark: {
    key: "bulwark", name: "Bulwark", kind: "evolved",
    story: "{hero} has taken every hit meant for someone else. It shows.",
    tiers: tiers(["Bulwark", "Iron Bulwark", "Living Fortress"], [
      { desc: "+4 defense, 3% less damage taken.", effects: { defense: 4, damageTaken: 0.03 } },
      { desc: "+7 defense, 5% less damage taken.", effects: { defense: 7, damageTaken: 0.05 } },
      { desc: "+10 defense, 7% less damage taken.", effects: { defense: 10, damageTaken: 0.07 } },
    ]),
  },
  fieldSurgeon: {
    key: "fieldSurgeon", name: "Field Surgeon", kind: "evolved",
    story: "{hero} has bandaged so many wounds they could do it blindfolded.",
    tiers: tiers(["Field Surgeon", "Battle Surgeon", "Miracle Worker"], [
      { desc: "Supplies heal 15% more; patches the party up 3% after each win.", effects: { healBonus: 0.15 }, road: { postFightHeal: 0.03 } },
      { desc: "Supplies heal 25% more; patches the party up 5% after each win.", effects: { healBonus: 0.25 }, road: { postFightHeal: 0.05 } },
      { desc: "Supplies heal 35% more; patches the party up 7% after each win.", effects: { healBonus: 0.35 }, road: { postFightHeal: 0.07 } },
    ]),
  },
  unshakable: {
    key: "unshakable", name: "Unshakable", kind: "evolved",
    story: "{hero} has lived through so many ambushes that surprise barely registers.",
    tiers: tiers(["Unshakable", "Ambush-Proof", "Nerves of Iron"], [
      { desc: "Ambushes hit the party 20% softer; morale losses 10% smaller.", road: { ambushVolley: 0.2, moraleLossCut: 0.1 } },
      { desc: "Ambushes hit the party 30% softer; morale losses 15% smaller.", road: { ambushVolley: 0.3, moraleLossCut: 0.15 } },
      { desc: "Ambushes hit the party 40% softer; morale losses 20% smaller.", road: { ambushVolley: 0.4, moraleLossCut: 0.2 } },
    ]),
  },
  rallyingHeart: {
    key: "rallyingHeart", name: "Rallying Heart", kind: "evolved",
    story: "When everything fell apart, {hero} kept the party together. Everyone remembers.",
    tiers: tiers(["Rallying Heart", "Beacon", "Heart of the Guild"], [
      { desc: "Lifts sinking morale and every victory.", road: { moraleWhenLow: 2, moraleOnWin: 2 } },
      { desc: "Lifts sinking morale and every victory more.", road: { moraleWhenLow: 3, moraleOnWin: 3 } },
      { desc: "Keeps the party's spirits up through anything.", road: { moraleWhenLow: 4, moraleOnWin: 4, moraleBase: 5 } },
    ]),
  },
});

export const TRAIT_KEYS = Object.freeze(Object.keys(TRAITS));
// Qualities a recruit can be born with (evolved ones are earned).
export const INNATE_KEYS = Object.freeze(TRAIT_KEYS.filter((key) => TRAITS[key].kind !== "evolved"));
export const EVOLVED_KEYS = Object.freeze(TRAIT_KEYS.filter((key) => TRAITS[key].kind === "evolved"));

export function rollTrait(rng = Math.random) {
  return INNATE_KEYS[Math.floor(rng() * INNATE_KEYS.length)];
}

export function qualityTier(hero, key) {
  return TRAITS[key]?.tiers ? Math.max(1, Math.min(3, Number(hero?.qualityTiers?.[key]) || 1)) : 1;
}

// A quality as it applies to this hero: tiered qualities resolve to their tier.
export function heroQuality(hero, key) {
  const quality = TRAITS[key];
  if (!quality) return null;
  if (!quality.tiers) return quality;
  const tier = quality.tiers[qualityTier(hero, key) - 1];
  return { ...quality, ...tier, tier: qualityTier(hero, key) };
}

export function heroQualities(hero) {
  return (Array.isArray(hero?.traits) ? hero.traits : []).map((key) => heroQuality(hero, key)).filter(Boolean);
}

const EMPTY = Object.freeze({
  maxHp: 0, critChance: 0, agility: 0, defense: 0, berserk: 0, attackSpeed: 0, healBonus: 0,
  xpBonus: 0, goldFind: 0, damage: 0, damageTaken: 0, moveSpeed: 0,
  rangedCrit: 0, critDamage: 0, execute: 0, meleeDamage: 0, lowHpGuard: 0, eliteDamage: 0,
});

// Summed quality effects for one hero, plus the guild's Hall of Legends bonuses
// stamped on the hero (hero.guildBonus: { damage, maxHp }) and, during an
// expedition fight, the party's morale (hero.moraleBonus: { damage }).
export function heroTraitEffects(hero) {
  const total = { ...EMPTY };
  for (const quality of heroQualities(hero)) {
    for (const [stat, value] of Object.entries(quality.effects || {})) total[stat] += value;
  }
  total.damage += Number(hero?.guildBonus?.damage) || 0;
  total.maxHp += Number(hero?.guildBonus?.maxHp) || 0;
  total.damage += Number(hero?.moraleBonus?.damage) || 0;
  return total;
}

// Road effects that belong to the hero alone (their own dodge, their own toll).
const PERSONAL_ROAD = new Set(["hazardDodge", "envDrain"]);
// Caps on the party's summed road effects.
const ROAD_CAPS = Object.freeze({
  ambushVolley: 0.75, spotAmbush: 0.6, nightAmbush: 1, campGuard: 1, stalkerDetect: 0.5, moraleLossCut: 0.6,
  scavengeOnWin: 0.6, findChance: 1, rareChance: 1.5, moraleBase: 20, postFightHeal: 0.1,
});

// A hero's road effects: their qualities, plus their familiar's.
export function heroRoadEffects(hero) {
  const total = {};
  const sources = [...heroQualities(hero).map((quality) => quality.road), hero?.pet ? petRoadEffects(hero.pet) : null];
  for (const road of sources) {
    for (const [stat, value] of Object.entries(road || {})) total[stat] = (total[stat] || 0) + value;
  }
  return total;
}

// The party's combined road effects, plus who brings each one (`who[stat]`,
// for feed lines like "Rook stops abruptly...").
export function partyRoadEffects(party) {
  const total = { who: {} };
  for (const hero of party) {
    for (const [stat, value] of Object.entries(heroRoadEffects(hero))) {
      if (PERSONAL_ROAD.has(stat)) continue;
      total[stat] = (total[stat] || 0) + value;
      if (value > 0 || stat === "moralePerDanger") (total.who[stat] ||= []).push(hero);
    }
  }
  for (const [stat, cap] of Object.entries(ROAD_CAPS)) if (total[stat] > cap) total[stat] = cap;
  return total;
}

export function roadEffect(road, stat) {
  return Number(road?.[stat]) || 0;
}
