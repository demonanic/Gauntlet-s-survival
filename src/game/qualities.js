// Quality development: heroes become who they are by what they do. Every
// hero keeps a quiet history of their career (hero.history), filled in after
// each fight and expedition. At milestone levels a hero may develop a new
// quality that fits that history: a hero who fought mostly from range becomes
// a Marksman, one who keeps limping out of near-death fights a Survivor.
//
// The player sees the result and the story behind it, never the counters or
// the thresholds: which quality emerges is weighted by the history, with a
// little chance in it, so it can't be farmed like a checklist.
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { EVOLVED_KEYS, INNATE_KEYS, TRAITS, heroQuality } from "../combat/traits";

export const HISTORY_KEYS = Object.freeze([
  "trips", "fights", "wins", "kills", "eliteKills", "bossKills", "meleeHits", "rangedHits", "crits", "damage", "taken",
  "heals", "nearDeaths", "knockouts", "sneaks", "ambushes", "lowMoraleWins",
]);

// Levels at which a hero can develop a new quality (the guild retires heroes at 20).
export const QUALITY_MILESTONES = Object.freeze([10, 16]);
// A milestone waits until the hero has this many fights on record, so a hero
// who arrives already high level (Mentorship) develops from real experience.
export const MIN_FIGHTS_FOR_QUALITY = 15;
// A won fight finished below this share of max HP counts as a narrow escape.
const NEAR_DEATH_HP = 0.2;
// Morale below this counts as fighting on when spirits are low.
const LOW_MORALE = 35;
// Score needed for each tier of an evolved quality.
const TIER_SCORES = [0.8, 1.6, 2.4];
// An ambush only marks a hero who took this share of their max HP in it.
const HARD_AMBUSH_TAKEN = 0.25;
// A quality another hero in the guild already has is this much less likely,
// so a roster grows distinct roles rather than four of the same.
const SHARED_QUALITY_WEIGHT = 0.4;

export function emptyHistory() {
  return Object.fromEntries(HISTORY_KEYS.map((key) => [key, 0]));
}

// Safe defaults for saves from before quality development.
export function normalizeQualityFields(hero) {
  const saved = hero.history && typeof hero.history === "object" ? hero.history : {};
  const history = Object.fromEntries(HISTORY_KEYS.map((key) => [key, Math.max(0, Number(saved[key]) || 0)]));
  const tiers = hero.qualityTiers && typeof hero.qualityTiers === "object" ? hero.qualityTiers : {};
  return {
    ...hero,
    history,
    qualityTiers: Object.fromEntries(Object.entries(tiers).filter(([key, tier]) => TRAITS[key]?.tiers && tier >= 1 && tier <= 3)),
    milestones: (Array.isArray(hero.milestones) ? hero.milestones : []).filter((level) => QUALITY_MILESTONES.includes(level)),
    qualityLog: Array.isArray(hero.qualityLog) ? hero.qualityLog : [],
  };
}

// Fold one fight into a hero's history. `battleStats` is what the engine
// tallied for this hero (hits, crits, kills, damage, heals).
export function recordFight(hero, battleStats = {}, { victory, morale, ambush }) {
  hero.history ||= emptyHistory();
  const history = hero.history;
  for (const key of ["kills", "eliteKills", "bossKills", "meleeHits", "rangedHits", "crits", "heals"]) {
    history[key] += Math.max(0, Math.round(Number(battleStats[key]) || 0));
  }
  history.damage += Math.round(Number(battleStats.damage) || 0);
  history.taken += Math.round(Number(battleStats.taken) || 0);
  history.fights += 1;
  if (hero.combat.hp <= 0) history.knockouts += 1;
  if (!victory) return;
  history.wins += 1;
  if (hero.combat.hp > 0 && hero.combat.hp < classlessMaxHp(hero) * NEAR_DEATH_HP) history.nearDeaths += 1;
  if (ambush && (Number(battleStats.taken) || 0) >= classlessMaxHp(hero) * HARD_AMBUSH_TAKEN) history.ambushes += 1;
  if (morale < LOW_MORALE) history.lowMoraleWins += 1;
}

export function recordHistory(hero, key, amount = 1) {
  hero.history ||= emptyHistory();
  hero.history[key] = (hero.history[key] || 0) + amount;
}

// How strongly a history points at each evolved quality (0 = not at all).
// Most scores compare the hero against what's normal (calibrated on
// `npm run balance -- --histories`), so volume alone doesn't earn a quality.
function specialization(history, mine) {
  const hits = history.meleeHits + history.rangedHits;
  if (hits < 100) return 0;
  const share = history[mine] / hits;
  if (share < 0.65) return 0;
  return (share - 0.65) * 4 + Math.min(0.6, (history.crits / hits) * 2) + Math.min(0.8, history.kills / 300);
}

const perFight = (history, key) => history[key] / Math.max(1, history.fights);

const SCORES = {
  marksman: (history) => specialization(history, "rangedHits"),
  bladesworn: (history) => specialization(history, "meleeHits"),
  survivor: (history) => history.nearDeaths * 0.2,
  giantslayer: (history) => history.eliteKills * 0.1 + history.bossKills * 0.25,
  ghostStep: (history) => history.sneaks * 0.05,
  bulwark: (history) => (history.damage >= 2000 ? Math.min(3, (history.taken / history.damage) * 5) : 0),
  fieldSurgeon: (history) => (history.heals >= 10 ? Math.max(0, (perFight(history, "heals") - 0.15) * 6) : 0),
  unshakable: (history) => history.ambushes * 0.08,
  rallyingHeart: (history) => history.lowMoraleWins * 0.15,
};

const tierFor = (score) => TIER_SCORES.reduce((tier, threshold, index) => (score >= threshold ? index + 1 : tier), 0);

// Every evolved quality this history qualifies for, with the tier it earns.
// The tier is nudged a little at random so the edges aren't predictable.
// `shared` holds the qualities other heroes in the guild already have.
export function qualityCandidates(hero, rng = Math.random, shared = new Set()) {
  const history = hero.history || emptyHistory();
  const candidates = [];
  for (const key of EVOLVED_KEYS) {
    const score = SCORES[key](history) * (0.9 + rng() * 0.2);
    const tier = tierFor(score);
    if (!tier) continue;
    const owned = hero.traits?.includes(key);
    if (owned && (hero.qualityTiers?.[key] || 1) >= tier) continue;
    candidates.push({ key, tier, score, weight: score * (shared.has(key) && !owned ? SHARED_QUALITY_WEIGHT : 1), upgrade: owned });
  }
  return candidates;
}

// Qualities held by every hero in `heroes` except `hero`.
export function sharedQualities(heroes, hero) {
  return new Set(heroes.filter((other) => other !== hero).flatMap((other) => other.traits || []));
}

// Check the hero's milestones and develop a quality at each one reached.
// Mutates `hero`; returns the developments as [{ key, tier, upgrade, text }].
export function developQualities(hero, at, rng = Math.random, shared = new Set()) {
  const developed = [];
  hero.milestones ||= [];
  for (const level of QUALITY_MILESTONES) {
    if (hero.progression.level < level || hero.milestones.includes(level)) continue;
    if ((hero.history?.fights || 0) < MIN_FIGHTS_FOR_QUALITY) break;
    hero.milestones.push(level);
    const development = pickDevelopment(hero, rng, shared);
    if (!development) continue;
    applyDevelopment(hero, development, level, at);
    developed.push(development);
  }
  return developed;
}

function pickDevelopment(hero, rng, shared) {
  const candidates = qualityCandidates(hero, rng, shared);
  if (candidates.length) {
    let roll = rng() * candidates.reduce((sum, entry) => sum + entry.weight, 0);
    const chosen = candidates.find((entry) => (roll -= entry.weight) < 0) || candidates[candidates.length - 1];
    return { key: chosen.key, tier: chosen.tier, upgrade: chosen.upgrade };
  }
  // Nothing stood out: the road still leaves its mark, as a new innate quality.
  const fresh = INNATE_KEYS.filter((key) => !hero.traits?.includes(key));
  if (!fresh.length) return null;
  return { key: fresh[Math.floor(rng() * fresh.length)], tier: 1, upgrade: false };
}

function applyDevelopment(hero, development, level, at) {
  const { key, tier, upgrade } = development;
  if (!upgrade) hero.traits = [...(hero.traits || []), key];
  if (TRAITS[key].tiers) hero.qualityTiers = { ...(hero.qualityTiers || {}), [key]: tier };
  const quality = heroQuality(hero, key);
  const name = hero.identity.name;
  development.name = quality.name;
  development.text = upgrade
    ? `${name} has grown into a ${quality.name}. ${TRAITS[key].story.replaceAll("{hero}", name)}`
    : TRAITS[key].story
      ? `NEW QUALITY: ${quality.name}. ${TRAITS[key].story.replaceAll("{hero}", name)}`
      : `NEW QUALITY: ${quality.name}. Life on the road has changed ${name}: ${quality.desc}`;
  hero.qualityLog = [...(hero.qualityLog || []), { key, tier, level, at, text: development.text }];
}
