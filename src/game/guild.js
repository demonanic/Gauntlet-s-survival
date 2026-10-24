// Gauntlet meta layer: guild hall, roster, and expeditions. Pure functions over
// a JSON-serializable state; every mutator returns a new state and never
// touches its input. Combat itself lives in combat/ (vendored Demonanic).
import { createHeroModel, serializeGameState } from "../combat/heroModel";
import { mergeClasslessBattleResults } from "../combat/classlessBattleResults";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { getRegion } from "./regions";

export const STATE_VERSION = 1;
export const MAX_PARTY_SIZE = 4;
export const STARTING_GOLD = 100;
const STARTER_NAMES = ["Brann", "Kestra", "Odo"];
const RECRUIT_NAMES = ["Vex", "Morrow", "Ilsa", "Tamsin", "Garrick", "Pell", "Wren", "Corvin", "Saoirse", "Dunstan", "Yara", "Fenn"];
const BASE_RECRUIT_COST = 80;
const RECRUIT_COST_GROWTH = 1.6;
// Heroes resting at the guild recover this fraction of max HP per second.
const REST_HEAL_FRACTION_PER_SECOND = 1 / 90;
// Between encounters the party travels for this fraction of the region's travel time.
const LEG_TRAVEL_FRACTION = 0.5;
// Loot share kept when a defeated party limps home.
const RETREAT_LOOT_SHARE = 0.5;

export function createGuild() {
  return {
    version: STATE_VERSION,
    gold: STARTING_GOLD,
    heroes: STARTER_NAMES.map((name) => createHeroModel({ name })),
    bench: [],
    injuries: {},
    vault: [],
    expedition: null,
    clears: {},
    recruits: 0,
    lastTickAt: null,
  };
}

const heroId = (hero) => hero.identity.id;

export function findHero(state, id) {
  return state.heroes.find((hero) => heroId(hero) === id) || null;
}

export function heroStatus(state, hero, now) {
  if (state.expedition?.heroIds.includes(heroId(hero))) return "away";
  if ((state.injuries[heroId(hero)] || 0) > now) return "injured";
  return "ready";
}

export function recruitCost(state) {
  return Math.round(BASE_RECRUIT_COST * RECRUIT_COST_GROWTH ** state.recruits);
}

export function recruitHero(state) {
  const cost = recruitCost(state);
  if (state.gold < cost) return { ok: false, reason: "insufficient_gold" };
  const next = serializeGameState(state);
  const name = RECRUIT_NAMES[next.recruits % RECRUIT_NAMES.length];
  next.heroes.push(createHeroModel({ name }));
  next.gold -= cost;
  next.recruits += 1;
  return { ok: true, state: next };
}

// Replace one hero (perk purchase, stat allocation) without touching the rest.
export function updateHero(state, updatedHero) {
  const next = serializeGameState(state);
  const index = next.heroes.findIndex((hero) => heroId(hero) === heroId(updatedHero));
  if (index < 0) return state;
  next.heroes[index] = serializeGameState(updatedHero);
  return next;
}

export function startExpedition(state, regionId, heroIds, now) {
  const region = getRegion(regionId);
  if (!region) return { ok: false, reason: "unknown_region" };
  if (state.expedition) return { ok: false, reason: "expedition_active" };
  const ids = [...new Set(heroIds)];
  if (ids.length < 1 || ids.length > MAX_PARTY_SIZE) return { ok: false, reason: "invalid_party_size" };
  for (const id of ids) {
    const hero = findHero(state, id);
    if (!hero) return { ok: false, reason: "unknown_hero" };
    if (heroStatus(state, hero, now) !== "ready") return { ok: false, reason: "hero_unavailable" };
    if (hero.combat.hp <= 0) return { ok: false, reason: "hero_unavailable" };
  }
  const partyLevel = Math.max(...ids.map((id) => findHero(state, id).progression.level));
  if (partyLevel < region.minLevel) return { ok: false, reason: "level_required" };

  const next = serializeGameState(state);
  next.expedition = {
    regionId,
    heroIds: ids,
    encounterIndex: 0,
    phase: "traveling",
    phaseEndsAt: now + region.travelSeconds * 1000,
    startedAt: now,
    loot: { gold: 0, items: [] },
    log: [`Set out for ${region.name}.`],
    outcome: null,
  };
  return { ok: true, state: next };
}

// Advance timers. Call on every UI tick and on load (covers time spent away).
export function tick(state, now) {
  let next = state;
  const expedition = state.expedition;
  if (expedition && expedition.phaseEndsAt != null && now >= expedition.phaseEndsAt) {
    next = serializeGameState(state);
    if (expedition.phase === "traveling") {
      next.expedition.phase = "ready";
      next.expedition.phaseEndsAt = null;
    } else if (expedition.phase === "returning") {
      next = completeReturn(next);
    }
  }
  return restAtGuild(next, now);
}

function restAtGuild(state, now) {
  const last = state.lastTickAt ?? now;
  const seconds = Math.max(0, (now - last) / 1000);
  const next = serializeGameState(state);
  next.lastTickAt = now;
  if (seconds <= 0) return next;
  for (const hero of next.heroes) {
    if (heroStatus(next, hero, now) === "away") continue;
    const maxHp = classlessMaxHp(hero);
    hero.combat.hp = Math.min(maxHp, hero.combat.hp + maxHp * REST_HEAL_FRACTION_PER_SECOND * seconds);
  }
  return next;
}

export function currentEncounterParty(state) {
  return state.expedition.heroIds.map((id) => findHero(state, id)).filter((hero) => hero && hero.combat.hp > 0);
}

// Apply one finished encounter. `party` is the hero list the engine fought
// with (post-battle HP inside it), in the same order as its xpGains indices.
export function resolveEncounter(state, { victory, party, xpGains, gold, items }, now) {
  const expedition = state.expedition;
  if (!expedition || expedition.phase !== "ready") return { ok: false, reason: "no_encounter_ready" };
  const region = getRegion(expedition.regionId);

  let next = mergeClasslessBattleResults(state, {
    heroIds: party.map(heroId),
    runtimeHeroes: party,
    xpGains: xpGains || {},
  });
  const run = next.expedition;
  run.loot.gold += Math.round(gold || 0);
  run.loot.items.push(...(items || []));
  const encounterNumber = run.encounterIndex + 1;

  // Fallen heroes sit out the rest of the run and need recovery once home.
  for (const hero of party) {
    if (hero.combat.hp <= 0) next.injuries[heroId(hero)] = now + region.recoverySeconds * 1000;
  }

  if (!victory) {
    run.loot.gold = Math.floor(run.loot.gold * RETREAT_LOOT_SHARE);
    run.loot.items = run.loot.items.slice(0, Math.floor(run.loot.items.length * RETREAT_LOOT_SHARE));
    run.log.push(`Routed at encounter ${encounterNumber}. Retreating with half the loot.`);
    return { ok: true, state: beginReturn(next, region, now, "retreat") };
  }

  run.log.push(`Cleared encounter ${encounterNumber} of ${region.encounters.length}.`);
  run.encounterIndex += 1;
  if (run.encounterIndex >= region.encounters.length) {
    run.loot.gold += region.completionGold;
    run.log.push(`${region.name} conquered! +${region.completionGold} gold bounty.`);
    next.clears[region.id] = (next.clears[region.id] || 0) + 1;
    return { ok: true, state: beginReturn(next, region, now, "victory") };
  }
  run.phase = "traveling";
  run.phaseEndsAt = now + region.travelSeconds * LEG_TRAVEL_FRACTION * 1000;
  return { ok: true, state: next };
}

// Voluntary pull-out between encounters keeps all loot gathered so far.
export function recallExpedition(state, now) {
  const expedition = state.expedition;
  if (!expedition || !["traveling", "ready"].includes(expedition.phase)) return { ok: false, reason: "cannot_recall" };
  const next = serializeGameState(state);
  next.expedition.log.push("Recalled the party.");
  return { ok: true, state: beginReturn(next, getRegion(expedition.regionId), now, "recalled") };
}

function beginReturn(state, region, now, outcome) {
  state.expedition.phase = "returning";
  state.expedition.outcome = outcome;
  state.expedition.phaseEndsAt = now + region.travelSeconds * 1000;
  return state;
}

function completeReturn(state) {
  const { loot, log, outcome, regionId, heroIds } = state.expedition;
  for (const id of heroIds) {
    const hero = findHero(state, id);
    if (hero && hero.combat.hp <= 0) hero.combat.hp = 1;
  }
  state.gold += loot.gold;
  state.vault.push(...loot.items);
  state.lastReport = { regionId, outcome, loot, log };
  state.expedition = null;
  return state;
}

export function dismissReport(state) {
  const next = serializeGameState(state);
  delete next.lastReport;
  return next;
}
