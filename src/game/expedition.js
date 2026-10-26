// Timed expeditions. The party explores a region for its duration while the
// adventure feed fills with events every 20-40 seconds (adventure.js). Some
// events need an answer (an enemy sighting, an ambush, a story choice, the end
// boss): they become `pending`, which pauses the expedition timer.
//
// While the game is open (`interactive`), a pending prompt waits for the
// player, who can fight it live on the Battle screen. If the player is away,
// or doesn't answer within ADVENTURE.autoDecideMs, the party decides on its
// own and fights through the headless combat simulator, so expeditions keep
// going with the app closed. `tick` catches up on everything that happened
// since it last ran.
import { mergeClasslessBattleResults } from "../combat/classlessBattleResults";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { ARROW_RECOVERY, CONSUMABLES, GEAR_SLOTS, PROVISIONS, crystalInfo, heroArrowCount, heroUsesArrows } from "../combat/gear";
import { serializeGameState } from "../combat/heroModel";
import { PET_MOD_LEVELS, PET_SPECIES, PET_XP_SHARE } from "../combat/pets";
import { heroTraitEffects, partyRoadEffects, roadEffect } from "../combat/traits";
import {
  ADVENTURE, LEGENDARY, NIGHT, RARE_EVENTS, STORIES, STORY_KEYS, WEATHER, clampMorale, conditionEffects, findLine, isNight,
  moraleDamageBonus, rollBanter, rollFlavor, rollHazard, rollWeather, sneakChance,
} from "./adventure";
import {
  buildBossEncounter, buildEndlessWave, buildLegendaryEncounter, buildStalkerEncounter, buildWildEncounter, describeSquad,
} from "./encounters";
import { ECOLOGIES } from "./ecology";
import { awardPetXp, earnPetCrate } from "./pets";
import { developQualities, recordFight, recordHistory, sharedQualities } from "./qualities";
import { combatEnvironment, getEnvironment, heroResistance, rollEnvironmentEvent } from "./environment";
import { bankLoot, createGearItem, normalizeHeroGear, randomCrystal, restockQuickSlots, tierMult } from "./items";
import { legacyBonuses } from "./legacy";
import { BOSS_RANK_SCALING, bossForRank, getRegion } from "./regions";
import { simulateEncounter } from "./simulate";

export const MAX_PARTY_SIZE = 4;
// Heroes resting at the guild recover this fraction of max HP per second;
// heroes out exploring patch themselves up much more slowly between events.
const REST_HEAL_FRACTION_PER_SECOND = 1 / 90;
const EXPLORE_HEAL_FRACTION_PER_SECOND = 1 / 450;
// Loot share kept when a defeated party limps home.
const RETREAT_LOOT_SHARE = 0.5;
const MAX_FEED_LINES = 200;
// When the party decides alone, it sneaks if the odds are at least this good,
// and only challenges an end boss with at least this share of its HP left.
const AUTO_SNEAK_AT = 0.6;
const AUTO_BOSS_HP = 0.5;
// An unattended Rift party heads home at 40% of its total HP.
const RIFT_AUTO_RETURN_HP = 0.4;
// An unattended party this badly hurt tries to sneak past everything, and
// heads home with its loot after a fight that leaves it below the second line.
const AUTO_CAUTIOUS_HP = 0.35;
const AUTO_RETREAT_HP = 0.25;
const RECENT_FLAVOR = 6;
// Events can't shorten an expedition to less than this from now.
const MIN_REMAINING_MS = 30_000;
const FIGHT_KINDS = new Set(["sighting", "ambush", "boss", "rift"]);
// Weight of environment events in regions with an environment (see ADVENTURE.eventWeights).
const ENVIRONMENT_EVENT_WEIGHT = 12;
// Stalkers: in regions of this tier or higher, this share of encounters is
// instead something that starts following the party unseen. It strikes when
// a hero is badly hurt or the party is worn down, or after STALKER_PATIENCE
// events. Each event, the party may notice it (STALKER_BASE_DETECT plus
// qualities like Tracker and Paranoid).
const STALKER_FROM_TIER = 2;
const STALKER_CHANCE = 0.15;
const STALKER_PATIENCE = 12;
const STALKER_BASE_DETECT = 0.03;
const STALKER_STRIKE_HERO_HP = 0.35;
const STALKER_STRIKE_PARTY_HP = 0.55;
// Extra opening blow an unnoticed stalker lands on the weakest hero.
const STALKER_POUNCE = 0.12;
// Share of max HP each hero recovers just before the end boss.
const BOSS_BREATHER_HEAL = 0.3;
// The tutorial trip's first event: this soon, and an easy sighting.
const TUTORIAL_FIRST_EVENT_MS = 6_000;

// Fallen heroes come around at camp with this share of max HP; heroes below
// CAMP_BANDAGE_BELOW use a healing item from their quick slots there.
const CAMP_REVIVE_HP = 0.1;
const CAMP_BANDAGE_BELOW = 0.4;
// Arrows each bow hero makes at camp.
const CAMP_ARROWS = 15;
// Chance the camp is raided while the party rests.
const CAMP_RAID_CHANCE = 0.2;
// The wandering merchant charges this multiple of an item's sell value.
const MERCHANT_PRICE_MULT = 4;

const heroId = (hero) => hero.identity.id;
const findHero = (state, id) => state.heroes.find((hero) => heroId(hero) === id) || null;
const randomBetween = ([min, max], rng) => min + rng() * (max - min);
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// Endless Rift bounty paid for the waves cleared on one run.
export function riftBounty(wavesCleared) {
  return 10 * wavesCleared;
}

// Expedition length after Swift Roads.
export function expeditionDurationMs(state, region) {
  return region.durationMinutes * 60_000 * (1 - legacyBonuses(state).travel);
}

function nextEventGap(rng) {
  return randomBetween(ADVENTURE.eventEverySeconds, rng) * 1000;
}

// `notify` marks big moments worth a notification while the game is in the background.
function addFeed(run, at, text, tone = "flavor", notify = false) {
  run.feed.push(notify ? { at, text, tone, notify: true } : { at, text, tone });
  if (run.feed.length > MAX_FEED_LINES) run.feed.splice(0, run.feed.length - MAX_FEED_LINES);
}

function livingParty(state) {
  return state.expedition.heroIds.map((id) => findHero(state, id)).filter((hero) => hero && hero.combat.hp > 0);
}

function partyHpFraction(state) {
  const party = state.expedition.heroIds.map((id) => findHero(state, id)).filter(Boolean);
  const max = party.reduce((sum, hero) => sum + classlessMaxHp(hero), 0);
  return max ? party.reduce((sum, hero) => sum + Math.max(0, hero.combat.hp), 0) / max : 0;
}

// The party's road qualities (see combat/traits.js), from whoever is still standing.
function road(state) {
  return partyRoadEffects(livingParty(state));
}

// Steadfast (and similar) qualities soften every morale loss.
function changeMorale(state, delta) {
  const run = state.expedition;
  const cut = delta < 0 ? roadEffect(road(state), "moraleLossCut") : 0;
  run.morale = clampMorale(run.morale + delta * (1 - cut));
}

const firstName = (heroes, rng) => (heroes?.length ? pick(heroes, rng).identity.name : null);

// Damage that never kills: hazards and ambush volleys leave at least 1 HP.
function hurt(hero, fraction) {
  const amount = Math.round(classlessMaxHp(hero) * fraction);
  hero.combat.hp = Math.max(1, hero.combat.hp - amount);
  return amount;
}

function heal(hero, fraction) {
  const max = classlessMaxHp(hero);
  hero.combat.hp = Math.min(max, hero.combat.hp + max * fraction);
}

// `options.revives`: second chances for the trip (a lost fight revives the
// party instead of ending it). Nothing in the game grants them yet; the
// balance scenarios use them to model revive items or ad revives.
// `options.tutorial`: the tutorial's first trip, whose first event comes
// quickly and is an easy encounter that waits for the player.
export function startExpedition(state, regionId, heroIds, now, rng = Math.random, { revives = 0, tutorial = false } = {}) {
  const region = getRegion(regionId);
  if (!region) return { ok: false, reason: "unknown_region" };
  if (state.expedition) return { ok: false, reason: "expedition_active" };
  const ids = [...new Set(heroIds)];
  if (ids.length < 1 || ids.length > MAX_PARTY_SIZE) return { ok: false, reason: "invalid_party_size" };
  for (const id of ids) {
    const hero = findHero(state, id);
    if (!hero) return { ok: false, reason: "unknown_hero" };
    if ((state.injuries[id] || 0) > now || hero.combat.hp <= 0) return { ok: false, reason: "hero_unavailable" };
  }
  const partyLevel = Math.max(...ids.map((id) => findHero(state, id).progression.level));
  if (partyLevel < region.minLevel) return { ok: false, reason: "level_required" };

  const next = serializeGameState(state);
  const durationMs = region.endless ? null : expeditionDurationMs(state, region);
  const run = {
    regionId,
    heroIds: ids,
    startedAt: now,
    durationMs,
    endsAt: region.endless ? null : now + durationMs,
    nextEventAt: region.endless ? null : now + nextEventGap(rng),
    pending: null,
    healedAt: now,
    bossDone: false,
    // Conditions: weather (may turn mid-trip) and whether it is night.
    weather: rollWeather(rng),
    night: isNight(now),
    scouted: false,
    // Long trips make camp halfway; a followed treasure map pays out at treasureAt.
    campAt: !region.endless && region.durationMinutes >= ADVENTURE.campFromMinutes ? now + durationMs / 2 : null,
    treasureAt: null,
    morale: ADVENTURE.startMorale,
    feed: [],
    loot: { gold: 0, items: [] },
    stats: { events: 0, encounters: 0, fights: 0, sneaks: 0, ambushes: 0, autoFightSeconds: 0 },
    // Heroes carrying a provision against the region's environment.
    packed: [],
    revives: Math.max(0, Math.floor(revives)),
    tutorial: !!tutorial && !region.endless,
    outcome: null,
  };
  next.expedition = run;
  if (run.tutorial) run.nextEventAt = now + TUTORIAL_FIRST_EVENT_MS;
  addFeed(run, now, `The party sets out for ${region.name}.`, "good");
  const unarmed = restockQuickSlots(next, ids);
  for (const name of unarmed) addFeed(run, now, `${name} has no arrows and can't use their bow! Buy some in the Market.`, "danger");
  packProvisions(next, region, now);
  if (!region.endless) {
    addFeed(run, now, `${run.night ? "Night has fallen. Ambushes are likelier, but so is treasure. " : ""}${WEATHER[run.weather].intro}`, "flavor");
  }
  if (region.endless) {
    addFeed(run, now, "The Rift tears open before them. Something stirs on the other side.", "danger");
    openPending(run, now, { kind: "rift", wave: buildEndlessWave(1, rng) });
  }
  return { ok: true, state: next };
}

// One provision per hero against the region's environment, from the stash,
// skipping heroes whose gear already makes them immune.
function packProvisions(state, region, at) {
  const environment = getEnvironment(region);
  const run = state.expedition;
  if (!environment) return;
  const provision = PROVISIONS[environment.provision];
  for (const id of run.heroIds) {
    const hero = findHero(state, id);
    if (heroResistance(hero, environment) >= 1 || !(state.stash[provision.key] > 0)) continue;
    state.stash[provision.key] -= 1;
    run.packed.push(id);
  }
  const bare = run.heroIds.length - run.packed.length;
  addFeed(run, at, run.packed.length
    ? `${environment.name} ahead. Packed ${run.packed.length} ${provision.name}${run.packed.length > 1 ? "s" : ""}${bare ? `; ${bare} hero${bare > 1 ? "es go" : " goes"} without` : ""}.`
    : `${environment.name} ahead, and no ${provision.name}s in the stash. ${environment.desc}`, run.packed.length ? "flavor" : "danger");
}

function openPending(run, at, details) {
  run.pending = { ...details, at, promptAt: at, engagedAt: null };
}

// Resume the expedition timer, which stood still while the prompt was open.
function closePending(run, resolvedAt) {
  const paused = Math.max(0, resolvedAt - run.pending.at);
  if (run.endsAt != null) run.endsAt += paused;
  if (run.nextEventAt != null) run.nextEventAt += paused;
  if (run.campAt != null) run.campAt += paused;
  if (run.treasureAt != null) run.treasureAt += paused;
  run.healedAt = resolvedAt;
  run.pending = null;
}

// Advance timers. Call on every UI tick and on load (covers time spent away).
// `interactive` means the player is looking at the game and can answer prompts.
export function tick(state, now, { interactive = false, rng = Math.random, onStep = null } = {}) {
  const next = restAtGuild(state, now);
  if (next.expedition) advanceExpedition(next, now, { interactive, rng, onStep });
  return next;
}

function restAtGuild(state, now) {
  const last = state.lastTickAt ?? now;
  const seconds = Math.max(0, (now - last) / 1000);
  const next = serializeGameState(state);
  next.lastTickAt = now;
  if (seconds <= 0) return next;
  for (const hero of next.heroes) {
    // Heroes out on an expedition heal step by step in advanceExpedition instead.
    if (next.expedition?.heroIds.includes(heroId(hero))) continue;
    const maxHp = classlessMaxHp(hero);
    hero.combat.hp = Math.min(maxHp, hero.combat.hp + maxHp * REST_HEAL_FRACTION_PER_SECOND * seconds);
  }
  return next;
}

function shouldDecideAlone(pending, now, interactive) {
  if (pending.engagedAt != null) return now - pending.engagedAt >= ADVENTURE.engagedTimeoutMs;
  if (pending.patient && interactive) return false;
  return !interactive || now - pending.promptAt >= ADVENTURE.autoDecideMs;
}

// Living party members patch up between events, up to time `until`. Fallen
// heroes stay down, and nobody heals while a prompt holds the party.
function healParty(state, until) {
  const run = state.expedition;
  const seconds = Math.max(0, (until - (run.healedAt ?? until)) / 1000);
  run.healedAt = Math.max(run.healedAt ?? until, until);
  if (run.pending || seconds <= 0) return;
  for (const hero of livingParty(state)) heal(hero, EXPLORE_HEAL_FRACTION_PER_SECOND * seconds);
}

// Play events forward to `now`, mutating `state` (already a private copy).
// Healing is applied in step with the events, so a party catching up after
// time away plays out exactly as one the player watched.
function advanceExpedition(state, now, options) {
  for (let guard = 0; guard < 1000 && state.expedition; guard += 1) {
    const run = state.expedition;
    const region = getRegion(run.regionId);
    if (run.pending) {
      if (!shouldDecideAlone(run.pending, now, options.interactive)) return;
      decideAlone(state, region, options);
      continue;
    }
    if (run.endsAt == null) return;
    const at = Math.min(run.nextEventAt, run.endsAt, run.campAt ?? Infinity, run.treasureAt ?? Infinity);
    if (at > now) {
      healParty(state, now);
      return;
    }
    healParty(state, at);
    if (run.treasureAt != null && at >= run.treasureAt) {
      run.treasureAt = null;
      findTreasure(state, region, at, options.rng);
      continue;
    }
    if (run.campAt != null && at >= run.campAt && at < run.endsAt) {
      run.campAt = null;
      tendCamp(state, at);
      openStory(state, at, "camp", options.rng);
      continue;
    }
    if (at >= run.endsAt) {
      reachEnd(state, region, at);
      continue;
    }
    runEvent(state, region, at, options.rng);
    run.nextEventAt = at + nextEventGap(options.rng);
  }
}

function reachEnd(state, region, at) {
  const run = state.expedition;
  if (region.boss && !run.bossDone) {
    // A last breather before the final fight, so the boss tests the party,
    // not just how worn down the road left it.
    // Heroes knocked out on the road are helped back to their feet for it.
    const party = run.heroIds.map((id) => findHero(state, id)).filter(Boolean);
    const fallen = party.filter((hero) => hero.combat.hp <= 0);
    for (const hero of fallen) hero.combat.hp = 1;
    for (const hero of party) heal(hero, BOSS_BREATHER_HEAL);
    // Archers scour the trail for spent arrows.
    for (const hero of party.filter((member) => heroUsesArrows(member))) returnArrows(state, hero, CAMP_ARROWS);
    addFeed(run, at, fallen.length
      ? `The party catches its breath before the final stretch. ${fallen.map((hero) => hero.identity.name).join(" and ")} ${fallen.length > 1 ? "are" : "is"} back on their feet.`
      : "The party catches its breath and binds its wounds before the final stretch.", "good");
    const wave = buildBossEncounter(region, state.bossRank || 0);
    const boss = wave.enemies.find((enemy) => enemy.boss || enemy.tier === "elite") || wave.enemies[0];
    addFeed(run, at, `The way out is blocked: ${boss.name} stands guard with ${describeSquad({ enemies: wave.enemies.filter((enemy) => enemy !== boss) })}.`, "danger", true);
    openPending(run, at, { kind: "boss", wave, label: boss.name });
    return;
  }
  run.loot.gold += region.completionGold;
  state.clears[region.id] = (state.clears[region.id] || 0) + 1;
  addFeed(run, at, `${region.name} explored! +${region.completionGold} gold bounty.`, "good");
  completeExpedition(state, "victory", at);
}

function runEvent(state, region, at, rng) {
  const run = state.expedition;
  const party = livingParty(state);
  if (!party.length) return;
  run.stats.events += 1;
  updateConditions(run, at, rng);
  const conditions = conditionEffects(run.weather, run.night, run.scouted);
  const qualities = road(state);
  // Charismatic heroes raise the mood the party settles back to; Optimists
  // pull it up when it sinks.
  const settle = ADVENTURE.startMorale + roadEffect(qualities, "moraleBase");
  changeMorale(state, (settle - run.morale) * ADVENTURE.moraleDrift + conditions.moralePerEvent);
  if (run.morale < 30 && roadEffect(qualities, "moraleWhenLow")) changeMorale(state, roadEffect(qualities, "moraleWhenLow"));
  if (stalkerTurn(state, region, at, rng)) return;
  if (run.tutorial) {
    tutorialEncounter(state, region, at, rng);
    return;
  }
  const hero = pick(party, rng);
  const environment = getEnvironment(region);
  const weights = {
    ...ADVENTURE.eventWeights,
    find: ADVENTURE.eventWeights.find * (1 + roadEffect(qualities, "findChance")),
    rare: ADVENTURE.eventWeights.rare * (1 + roadEffect(qualities, "rareChance")),
    hazard: ADVENTURE.eventWeights.hazard * conditions.hazard,
    environment: environment ? ENVIRONMENT_EVENT_WEIGHT : 0,
  };
  const roll = rng() * Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  // Never a long dry spell: after maxQuietEvents events without a fight, it's an encounter.
  const quiet = (run.quietEvents || 0) >= ADVENTURE.maxQuietEvents;
  const kind = quiet ? "encounter" : Object.entries(weights).find(([, weight]) => (cursor += weight) > roll)[0];
  run.quietEvents = (run.quietEvents || 0) + 1;

  const banter = kind === "flavor" && rng() < ADVENTURE.banterShare ? rollBanter(hero, run.morale, rng) : null;
  if (banter) {
    changeMorale(state, banter.morale);
    addFeed(run, at, banter.text, banter.tone);
  } else if (kind === "flavor") {
    run.recentFlavor ||= [];
    const line = rollFlavor(region, hero.identity.name, rng, run.recentFlavor);
    run.recentFlavor = [...run.recentFlavor, line.template].slice(-RECENT_FLAVOR);
    changeMorale(state, line.morale);
    // Paranoid heroes take every bad sign to heart.
    if (line.tone === "danger") changeMorale(state, roadEffect(qualities, "moralePerDanger"));
    addFeed(run, at, line.text, line.tone);
  } else if (kind === "find") {
    findSomething(state, region, hero, at, rng);
  } else if (kind === "hazard") {
    const hazard = rollHazard(hero, rng);
    if (hazard.damage) for (const target of hazard.all ? party : [hero]) hurt(target, hazard.damage);
    changeMorale(state, hazard.morale);
    addFeed(run, at, hazard.text, hazard.tone);
  } else if (kind === "environment") {
    const event = rollEnvironmentEvent(environment, party, run.packed || [], rng);
    changeMorale(state, event.morale);
    addFeed(run, at, event.hurt.length ? `${event.text} (${event.hurt.join(", ")} hurt)` : `${event.text} The party's gear holds up.`, event.hurt.length ? "danger" : "good");
  } else if (kind === "encounter") {
    const progress = 1 - (run.endsAt - at) / run.durationMs;
    if (region.tier >= STALKER_FROM_TIER && !run.stalker && rng() < STALKER_CHANCE) {
      startStalking(state, region, at, progress, rng);
      return;
    }
    startEncounter(state, region, at, buildWildEncounter(region, progress, rng), rng() < ambushChance(state, conditions, environment));
  } else if (kind === "rare") {
    rareEvent(state, region, hero, at, rng);
  } else {
    openStory(state, at, pick(STORY_KEYS, rng), rng);
  }
}

// The tutorial's first encounter: a small squad, spotted in time (never an
// ambush), and the prompt waits for the player however long they take.
function tutorialEncounter(state, region, at, rng) {
  const run = state.expedition;
  run.tutorial = false;
  const wave = buildWildEncounter({ ...region, wildlife: { ...region.wildlife, squad: [2, 2], eliteChance: 0 } }, 0, rng, { ecology: false });
  startEncounter(state, region, at, wave, false);
  run.pending.patient = true;
}

// Chance an encounter is an ambush: the base share, weather and night,
// darkness, and the party's qualities (Keen-Eared, Paranoid, Reckless; Night
// Eyes cancels the night's share).
function ambushChance(state, conditions, environment) {
  const run = state.expedition;
  const qualities = road(state);
  const nightCancel = run.night ? NIGHT.ambush * Math.min(1, roadEffect(qualities, "nightAmbush")) : 0;
  return Math.max(0, ADVENTURE.ambushShare + conditions.ambush - nightCancel + darknessAmbush(state, environment) + roadEffect(qualities, "ambush"));
}

// ---------------- stalkers ----------------
// Something starts following the party. Nothing is said outright; at most a
// vague sound in the feed.
function startStalking(state, region, at, progress, rng) {
  const run = state.expedition;
  run.stalker = { wave: buildStalkerEncounter(region, progress, rng), since: at, events: 0, detected: false, braced: false };
  addFeed(run, at, pick([
    "A twig snaps somewhere behind the party. Probably nothing.",
    "For a moment it sounds like a fifth set of footsteps. Then it doesn't.",
    "The birds go quiet behind the party.",
  ], rng), "flavor");
}

// Each event, a stalker may be noticed, or decide it's time to strike.
// Returns true when it used up the event.
function stalkerTurn(state, region, at, rng) {
  const run = state.expedition;
  const stalker = run.stalker;
  if (!stalker) return false;
  stalker.events += 1;
  const party = livingParty(state);
  const weakest = party.reduce((best, hero) => (hero.combat.hp / classlessMaxHp(hero) < best.combat.hp / classlessMaxHp(best) ? hero : best));
  const wounded = weakest.combat.hp / classlessMaxHp(weakest) < STALKER_STRIKE_HERO_HP || partyHpFraction(state) < STALKER_STRIKE_PARTY_HP;
  if (wounded || stalker.events >= STALKER_PATIENCE) {
    stalkerStrikes(state, at, weakest);
    return true;
  }
  if (stalker.detected) return false;
  const qualities = road(state);
  const nightBonus = run.night ? 0.05 * Math.min(1, roadEffect(qualities, "nightAmbush")) : 0;
  if (rng() < STALKER_BASE_DETECT + roadEffect(qualities, "stalkerDetect") + nightBonus) {
    stalker.detected = true;
    const spotter = firstName(qualities.who.stalkerDetect, rng) || pick(party, rng).identity.name;
    const text = STORIES.stalker.prompt.replaceAll("{hero}", spotter);
    addFeed(run, at, text, "danger", true);
    openPending(run, at, { kind: "story", story: "stalker", text });
    return true;
  }
  return false;
}

function stalkerStrikes(state, at, weakest) {
  const run = state.expedition;
  const { wave, braced } = run.stalker;
  run.stalker = null;
  run.stats.encounters += 1;
  run.quietEvents = 0;
  const label = describeSquad(wave);
  if (braced) {
    addFeed(run, at, `The thing that was following the party finally attacks, but they were ready for it: ${label}!`, "danger", true);
  } else {
    hurt(weakest, STALKER_POUNCE);
    ambushParty(state, at, `${label} lunge out of nowhere, straight for ${weakest.identity.name}! The party never knew it was being followed.`);
  }
  openPending(run, at, { kind: "ambush", wave, label });
}

// The player (or the party) answers a detected stalker.
function answerStalker(state, region, choice, at, rng) {
  const run = state.expedition;
  const stalker = run.stalker;
  if (!stalker) return false;
  const label = describeSquad(stalker.wave);
  if (choice === "brace") {
    stalker.braced = true;
    return false;
  }
  if (choice === "shake") {
    const conditions = conditionEffects(run.weather, run.night, run.scouted);
    const chance = sneakChance(livingParty(state), stalker.wave, run.morale, region, conditions.sneak);
    if (rng() < chance) {
      run.stalker = null;
      recordSneak(state);
      addFeed(run, at, "The party doubles back through the shadows and loses whatever was following it.", "good");
      return false;
    }
    addFeed(run, at, `It isn't fooled. ${label} come out of hiding!`, "danger");
  } else {
    addFeed(run, at, `Out of the dark: ${label}!`, "danger");
  }
  run.stalker = null;
  run.stats.encounters += 1;
  run.pending = { ...run.pending, kind: "ambush", wave: stalker.wave, label, promptAt: at };
  return true;
}

function recordSneak(state) {
  for (const hero of livingParty(state)) recordHistory(hero, "sneaks");
}

// Darkness makes ambushes likelier, less so for a well-lit party.
function darknessAmbush(state, environment) {
  if (!environment?.road.ambush) return 0;
  const party = livingParty(state);
  const run = state.expedition;
  const exposed = party.reduce((sum, hero) => sum + 1 - heroResistance(hero, environment, run.packed?.includes(heroId(hero))), 0);
  return party.length ? environment.road.ambush * (exposed / party.length) : 0;
}

function openStory(state, at, key, rng) {
  const run = state.expedition;
  const text = STORIES[key].prompt.replaceAll("{hero}", pick(livingParty(state), rng).identity.name);
  addFeed(run, at, text, "story");
  openPending(run, at, { kind: "story", story: key, text });
}

// Weather can turn between events, and a long trip can run into dusk or dawn.
function updateConditions(run, at, rng) {
  if (rng() < ADVENTURE.weatherChangeChance) {
    run.weather = rollWeather(rng, run.weather);
    addFeed(run, at, `The weather turns. ${WEATHER[run.weather].intro}`, "flavor");
  }
  const night = isNight(at);
  if (night !== run.night) {
    run.night = night;
    addFeed(run, at, night ? "Night falls. Every shadow could hide something." : "Dawn breaks, and the party breathes a little easier.", "flavor");
  }
}

// Rare events: a wandering merchant, a treasure map, or a legendary monster.
function rareEvent(state, region, hero, at, rng) {
  const run = state.expedition;
  const kind = pick(RARE_EVENTS, rng);
  if (kind === "map") {
    openStory(state, at, "map", rng);
  } else if (kind === "legend") {
    const progress = 1 - (run.endsAt - at) / run.durationMs;
    startEncounter(state, region, at, buildLegendaryEncounter(region, progress, rng), false);
  } else {
    const rarity = pick(["uncommon", "rare", "rare", "epic"], rng);
    const item = createGearItem({ slot: pick(GEAR_SLOTS, rng), rarity, tier: region.tier + 1 }, rng);
    // A lucky party gets a better deal.
    const price = Math.max(1, Math.round(item.value * MERCHANT_PRICE_MULT * (1 - roadEffect(road(state), "merchantDiscount"))));
    addFeed(run, at, `A wandering merchant waves the party over. "Fine wares, fair prices!" They're selling a ${item.name} for ${price} gold.`, "story", true);
    openPending(run, at, { kind: "merchant", item, price, text: `A wandering merchant offers a ${item.name} for ${price} gold.` });
  }
}

// The stash at the end of a treasure map detour.
function findTreasure(state, region, at, rng) {
  const run = state.expedition;
  const conditions = conditionEffects(run.weather, run.night, run.scouted);
  const gold = Math.round(randomBetween([40, 90], rng) * tierMult(region.tier) * conditions.loot);
  const item = createGearItem({ slot: pick(GEAR_SLOTS, rng), rarity: pick(["rare", "rare", "epic"], rng), tier: region.tier + 1 }, rng);
  const crystal = randomCrystal(1, rng);
  run.loot.gold += gold;
  run.loot.items.push(item, crystal);
  changeMorale(state, 10);
  addFeed(run, at, `X marks the spot! The party digs up ${gold} gold, a ${item.name} and a ${crystalInfo(crystal.key).fullName}!`, "loot", true);
}

function findSomething(state, region, hero, at, rng) {
  const run = state.expedition;
  const roll = rng();
  if (roll < 0.5) {
    const gold = Math.round(randomBetween([5, 20], rng) * tierMult(region.tier) * conditionEffects(run.weather, run.night).loot
      * (1 + roadEffect(road(state), "goldFind")));
    run.loot.gold += gold;
    addFeed(run, at, findLine("gold", hero.identity.name, gold, rng), "loot");
  } else if (roll < 0.8) {
    const key = pick(["bandage", "bandage", "bandage", "potion", "ammo", "arrows", "arrows"], rng);
    const qty = key === "arrows" ? 5 + Math.floor(rng() * 6) : 1;
    run.loot.items.push({ kind: "consumable", key, qty });
    addFeed(run, at, findLine("supply", hero.identity.name, key === "arrows" ? `bundle of ${qty} arrows` : CONSUMABLES[key].name, rng), "loot");
  } else {
    const rarity = pick(["common", "common", "uncommon", "uncommon", "rare"], rng);
    const item = createGearItem({ slot: pick(GEAR_SLOTS, rng), rarity, tier: region.tier }, rng);
    run.loot.items.push(item);
    addFeed(run, at, findLine("gear", hero.identity.name, item.name, rng), "loot", rarity === "rare");
  }
  changeMorale(state, 3);
}

// A sighting asks the player to attack or sneak; an ambush skips the choice
// and opens with a volley that costs every hero a little HP.
function startEncounter(state, region, at, wave, ambush) {
  const run = state.expedition;
  run.stats.encounters += 1;
  run.quietEvents = 0;
  const legend = wave.enemies.find((enemy) => enemy.legendary);
  const squad = legend
    ? `${legend.name} with ${describeSquad({ enemies: wave.enemies.filter((enemy) => enemy !== legend) })}`
    : describeSquad(wave);
  const extra = legend ? { legendary: true } : {};
  // A Trailwise hero may spot the ambush before it springs.
  const qualities = road(state);
  if (ambush && Math.random() < roadEffect(qualities, "spotAmbush")) {
    ambush = false;
    addFeed(run, at, `${firstName(qualities.who.spotAmbush, Math.random)} spots the ambush before it springs.`, "good");
  }
  if (ambush) {
    ambushParty(state, at, `Ambush! ${squad} burst from the shadows!`);
    openPending(run, at, { kind: "ambush", wave, label: squad, ...extra, ...readFormation(state, wave) });
  } else {
    const chance = sneakChance(livingParty(state), wave, run.morale, region, conditionEffects(run.weather, run.night, run.scouted).sneak);
    addFeed(run, at, legend
      ? `A legend walks these halls: ${legend.name}, a monster out of the old stories, with ${describeSquad({ enemies: wave.enemies.filter((enemy) => enemy !== legend) })}. Fortune favours the bold... or the quiet.`
      : `The party spots ${squad} ahead. They haven't noticed yet.`, "danger", !!legend);
    const formation = readFormation(state, wave);
    if (formation.formation) {
      const ecology = ECOLOGIES[formation.formation];
      addFeed(run, at, formation.formationKnown ? `They move like a ${ecology.name}. ${ecology.sign}` : ecology.sign, "danger");
    }
    openPending(run, at, { kind: "sighting", wave, label: squad, sneakChance: chance, ...extra, ...formation });
  }
}

// Reading an enemy formation. A guild that has met this ecology before, or a
// party with a veteran along, knows it by name; otherwise the party only sees
// the signs. Either way it never says what to do about it.
export const FORMATION_VETERAN_LEVEL = 8;

export function readFormation(state, wave) {
  if (!wave?.ecology || !ECOLOGIES[wave.ecology]) return {};
  const seen = (state.ecologySeen ||= {});
  const known = (seen[wave.ecology] || 0) > 0 || livingParty(state).some((hero) => hero.progression.level >= FORMATION_VETERAN_LEVEL);
  seen[wave.ecology] = (seen[wave.ecology] || 0) + 1;
  return { formation: wave.ecology, formationKnown: known };
}

function ambushParty(state, at, text) {
  const run = state.expedition;
  run.stats.ambushes += 1;
  // Keen-Eared and Unshakable heroes blunt the opening volley.
  const volley = ADVENTURE.ambushVolley * (1 - roadEffect(road(state), "ambushVolley"));
  for (const hero of livingParty(state)) hurt(hero, volley);
  changeMorale(state, -8);
  addFeed(run, at, `${text} The party takes an opening volley.`, "danger");
}

// Heroes for the next fight, carrying the party's morale as a damage bonus.
// The region's environment rides along as hero.environment (after resistance).
export function currentEncounterParty(state) {
  const run = state.expedition;
  const bonus = moraleDamageBonus(run?.morale ?? ADVENTURE.startMorale);
  const environment = getEnvironment(getRegion(run?.regionId));
  return livingParty(state).map((hero) => ({
    ...hero,
    moraleBonus: { damage: bonus },
    environment: combatEnvironment(hero, environment, !!run?.packed?.includes(heroId(hero))),
  }));
}

// The wave waiting in the current fight prompt.
export function currentEncounterWave(state) {
  return structuredClone(state.expedition.pending.wave);
}

// The player taps Attack/Fight: the prompt is held open while they battle live.
export function engagePending(state, now) {
  const pending = state.expedition?.pending;
  if (!pending || !FIGHT_KINDS.has(pending.kind)) return { ok: false, reason: "no_fight" };
  const next = serializeGameState(state);
  next.expedition.pending.engagedAt = now;
  return { ok: true, state: next };
}

// Answer a prompt without fighting: "sneak", "leave" (boss or Rift), or a
// story option id. A failed sneak turns into an ambush that must be fought.
export function choosePending(state, choice, now, { rng = Math.random } = {}) {
  const pending = state.expedition?.pending;
  if (!pending || pending.engagedAt != null) return { ok: false, reason: "no_choice" };
  const next = serializeGameState(state);
  const region = getRegion(next.expedition.regionId);
  if (pending.kind === "sighting" && choice === "sneak") {
    attemptSneak(next, now, rng);
  } else if ((pending.kind === "boss" || pending.kind === "rift") && choice === "leave") {
    leaveFight(next, region, now);
  } else if (pending.kind === "story" && STORIES[pending.story].options.some((option) => option.id === choice)) {
    resolveStory(next, region, choice, now, rng);
  } else if (pending.kind === "merchant" && (choice === "buy" || choice === "decline")) {
    if (choice === "buy" && next.gold < pending.price) return { ok: false, reason: "insufficient_gold" };
    tradeWithMerchant(next, choice === "buy", now);
  } else {
    return { ok: false, reason: "invalid_choice" };
  }
  return { ok: true, state: next };
}

function attemptSneak(state, at, rng) {
  const run = state.expedition;
  const { label, sneakChance: chance } = run.pending;
  if (rng() < chance) {
    run.stats.sneaks += 1;
    recordSneak(state);
    changeMorale(state, 4);
    addFeed(run, at, `Slipped past ${label} unseen.`, "good");
    closePending(run, at);
    return;
  }
  ambushParty(state, at, `Spotted! ${label} turn and attack!`);
  run.pending.kind = "ambush";
  run.pending.promptAt = at;
}

function leaveFight(state, region, at) {
  const run = state.expedition;
  addFeed(run, at, run.pending.kind === "rift"
    ? "The party decides the Rift can wait and heads home."
    : `The party slips away before ${run.pending.label} notices them. No bounty this time.`, "flavor");
  run.pending = null;
  completeExpedition(state, "recalled", at);
}

// Bought gear joins the trip's loot; the price comes from the guild's gold.
function tradeWithMerchant(state, buy, at) {
  const run = state.expedition;
  const { item, price } = run.pending;
  if (buy) {
    state.gold -= price;
    run.loot.items.push(item);
    addFeed(run, at, `Bought the ${item.name} for ${price} gold. The merchant tips their hat and vanishes.`, "loot");
  } else {
    addFeed(run, at, "The party waves the merchant off. They shrug and wander on.", "flavor");
  }
  closePending(run, at);
}

function resolveStory(state, region, choice, at, rng) {
  const run = state.expedition;
  const story = STORIES[run.pending.story];
  const option = story.options.find((entry) => entry.id === choice);
  const hero = pick(livingParty(state), rng);
  if (option.result) addFeed(run, at, option.result.replaceAll("{hero}", hero.identity.name), "story");
  let ambushed = applyEffects(state, region, option.effects, at, rng);
  if (!ambushed && run.pending.story === "camp" && choice === "rest" && rng() < CAMP_RAID_CHANCE) ambushed = raidCamp(state, region, at, rng);
  if (!ambushed) closePending(run, at);
}

// Making camp: fallen heroes come around (weak, at CAMP_REVIVE_HP), and anyone
// badly hurt dresses their wounds with a bandage or potion from their quick
// slots. After that it's natural healing, or the camp's Rest option.
function tendCamp(state, at) {
  const run = state.expedition;
  const party = run.heroIds.map((id) => findHero(state, id)).filter(Boolean);
  const fallen = party.filter((hero) => hero.combat.hp <= 0);
  for (const hero of fallen) hero.combat.hp = Math.max(1, Math.round(classlessMaxHp(hero) * CAMP_REVIVE_HP));
  if (fallen.length) {
    addFeed(run, at, `By the campfire, ${fallen.map((hero) => hero.identity.name).join(" and ")} ${fallen.length > 1 ? "come" : "comes"} around: weak, but alive.`, "good");
  }
  // Archers whittle a few arrows by the fire.
  for (const hero of party.filter((member) => heroUsesArrows(member) && member.combat.hp > 0)) {
    returnArrows(state, hero, CAMP_ARROWS);
    addFeed(run, at, `${hero.identity.name} whittles ${CAMP_ARROWS} arrows by the fire.`, "flavor");
  }
  for (const hero of party) {
    if (hero.combat.hp / classlessMaxHp(hero) >= CAMP_BANDAGE_BELOW) continue;
    // A hero saving potions for bosses only dresses wounds with bandages here.
    const slot = (hero.quickSlots || []).find((entry) => CONSUMABLES[entry?.key]?.heal && entry.qty > 0 &&
      !(entry.key === "potion" && hero.savePotions));
    if (!slot) continue;
    const item = CONSUMABLES[slot.key];
    slot.qty -= 1;
    heal(hero, item.heal * (1 + heroTraitEffects(hero).healBonus));
    addFeed(run, at, `${hero.identity.name} dresses their wounds with a ${item.name}.`, "flavor");
  }
}

// Raiders hit the camp while the party sleeps. A Light Sleeper wakes everyone
// in time; otherwise the raid opens with a volley.
function raidCamp(state, region, at, rng) {
  const run = state.expedition;
  const progress = 1 - (run.endsAt - at) / run.durationMs;
  const wave = buildWildEncounter(region, progress, rng);
  const label = describeSquad(wave);
  run.stats.encounters += 1;
  const guard = road(state).who.campGuard;
  if (guard?.length) {
    addFeed(run, at, `${pick(guard, rng).identity.name} wakes at a faint sound and rouses the camp just as ${label} creep in.`, "good");
  } else {
    ambushParty(state, at, `${label} raid the camp in the night!`);
  }
  run.pending = { ...run.pending, kind: "ambush", wave, label, promptAt: at, ...readFormation(state, wave) };
  return true;
}

// Apply a story option's effects. Returns true if it led into an ambush.
function applyEffects(state, region, effects, at, rng) {
  const run = state.expedition;
  if (effects.healAll) for (const hero of livingParty(state)) heal(hero, effects.healAll);
  if (effects.hurtAll) for (const hero of livingParty(state)) hurt(hero, effects.hurtAll);
  if (effects.morale) changeMorale(state, effects.morale);
  if (effects.gold) {
    const gold = Math.round(randomBetween(effects.gold, rng) * tierMult(region.tier));
    run.loot.gold += gold;
    addFeed(run, at, `+${gold} gold.`, "loot");
  }
  if (effects.gear) {
    const item = createGearItem({ slot: pick(GEAR_SLOTS, rng), rarity: pick(["uncommon", "uncommon", "rare", "epic"], rng), tier: region.tier }, rng);
    run.loot.items.push(item);
    addFeed(run, at, `Inside: a ${item.name}!`, "loot");
  }
  // Shortcuts trim the trip but never past MIN_REMAINING_MS from now (and never lengthen it).
  if (effects.scout) run.scouted = true;
  if (effects.forage) {
    const gold = Math.round(randomBetween([10, 30], rng) * tierMult(region.tier));
    const supplies = ["bandage", "bandage", rng() < 0.4 ? "potion" : "ammo"];
    run.loot.gold += gold;
    for (const key of supplies) run.loot.items.push({ kind: "consumable", key, qty: 1 });
    run.loot.items.push({ kind: "consumable", key: "arrows", qty: 8 });
    addFeed(run, at, `Foraging turns up ${gold} gold and a few supplies.`, "loot");
  }
  if (effects.extend && run.endsAt != null) run.endsAt += ADVENTURE.treasureDetourMs;
  if (effects.treasure) run.treasureAt = at + ADVENTURE.treasureDetourMs;
  if (effects.shorten && run.endsAt != null) {
    run.endsAt = Math.min(run.endsAt, Math.max(at + MIN_REMAINING_MS, run.endsAt - effects.shorten));
  }
  if (effects.text) addFeed(run, at, effects.text, effects.ambush || effects.hurtAll ? "danger" : "story");
  if (effects.stalker) return answerStalker(state, region, effects.stalker, at, rng);
  if (effects.gamble) {
    // Greedy hands are unlucky ones.
    const outcome = rng() < effects.gamble.chance + roadEffect(road(state), "gambleLuck") ? effects.gamble.win : effects.gamble.lose;
    return applyEffects(state, region, outcome, at, rng);
  }
  if (effects.ambush) {
    const progress = 1 - (run.endsAt - at) / run.durationMs;
    const wave = buildWildEncounter(region, progress, rng);
    run.stats.encounters += 1;
    const label = describeSquad(wave);
    ambushParty(state, at, `${label} spring out!`);
    run.pending = { ...run.pending, kind: "ambush", wave, label, promptAt: at, ...readFormation(state, wave) };
    return true;
  }
  return false;
}

// The party answers a prompt on its own (player away or too slow).
function decideAlone(state, region, { rng, onStep }) {
  const run = state.expedition;
  const pending = run.pending;
  const at = pending.engagedAt ?? pending.promptAt;
  if (pending.kind === "story") {
    resolveStory(state, region, STORIES[pending.story].auto({ partyHp: partyHpFraction(state), greedy: roadEffect(road(state), "greedy") > 0 }), at, rng);
  } else if (pending.kind === "merchant") {
    // Spending the guild's gold is the player's call, never the party's.
    tradeWithMerchant(state, false, at);
  } else if (pending.kind === "sighting" && (pending.sneakChance >= AUTO_SNEAK_AT || partyHpFraction(state) < AUTO_CAUTIOUS_HP)) {
    attemptSneak(state, at, rng);
  } else if (pending.kind === "boss" && partyHpFraction(state) < AUTO_BOSS_HP) {
    leaveFight(state, region, at);
  } else {
    autoFight(state, region, at, rng, onStep);
  }
}

function autoFight(state, region, at, rng, onStep) {
  const pending = state.expedition.pending;
  const endless = pending.kind === "rift";
  const { result, sim, elapsed } = simulateEncounter(currentEncounterParty(state), pending.wave, {
    regionTier: region.tier, onStep, endless,
    shouldReturn: (engine) => {
      const hp = engine.heroes.reduce((sum, hero) => sum + Math.max(0, hero.ref.hp), 0);
      return hp / engine.heroes.reduce((sum, hero) => sum + hero.d.maxHp, 0) < RIFT_AUTO_RETURN_HP;
    },
  });
  state.expedition.stats.autoFightSeconds += Math.round(elapsed);
  applyFightResult(state, region, {
    victory: !!result?.victory, party: sim.heroes, xpGains: result?.xpGains?.heroes || {},
    gold: sim.gold, items: sim.vault, wavesCleared: result?.wavesCleared || 0,
  }, at);
  // Left to themselves, a battered party doesn't push its luck.
  if (state.expedition && !state.expedition.pending && partyHpFraction(state) < AUTO_RETREAT_HP) {
    addFeed(state.expedition, at, "Too battered to go on, the party limps home with its loot.", "danger");
    completeExpedition(state, "recalled", at);
  }
}

// A live battle the player fought on the Battle screen has finished.
// `party` is the hero list the engine fought with, in the same order as its
// xpGains indices.
export function resolveEncounter(state, outcome, now) {
  const pending = state.expedition?.pending;
  if (!pending || !FIGHT_KINDS.has(pending.kind)) return { ok: false, reason: "no_encounter_ready" };
  const next = serializeGameState(state);
  applyFightResult(next, getRegion(next.expedition.regionId), outcome, now);
  return { ok: true, state: next };
}

function applyFightResult(state, region, { victory, party, xpGains, gold, items, wavesCleared = 0 }, at) {
  // Wisdom (guild) and Fast Learner (hero) boost the XP the engine awarded.
  const xpBonus = legacyBonuses(state).xp;
  const boostedXp = Object.fromEntries(Object.entries(xpGains || {}).map(([index, xp]) =>
    [index, Math.round(Number(xp) * (1 + xpBonus + heroTraitEffects(party[index]).xpBonus))]));
  const merged = mergeClasslessBattleResults(state, { heroIds: party.map(heroId), runtimeHeroes: party, xpGains: boostedXp });
  Object.assign(state, merged);
  const run = state.expedition;
  // Quick-slot stacks spent in the fight come back on the runtime party. After
  // a win, the party picks up some of the plain arrows it fired.
  let recovered = 0;
  for (const [index, runtime] of party.entries()) {
    const saved = findHero(state, heroId(runtime));
    if (!saved) continue;
    // Familiars learn alongside their partner.
    if (saved.pet) {
      for (const level of awardPetXp(saved.pet, (boostedXp[index] || 0) * PET_XP_SHARE)) {
        const mod = PET_MOD_LEVELS.includes(level) ? " A new trick to choose on the Gear screen!" : "";
        addFeed(run, at, `${saved.identity.name}'s ${PET_SPECIES[saved.pet.species].name.toLowerCase()} ${saved.pet.name} reaches level ${level}.${mod}`, "good", !!mod);
      }
    }
    saved.quickSlots = normalizeHeroGear(runtime).quickSlots;
    const spent = Math.floor((runtime.arrowsSpent?.arrows || 0) * ARROW_RECOVERY);
    if (victory && spent > 0) recovered += returnArrows(state, saved, spent);
    recordFight(saved, runtime.battleStats, { victory, morale: run.morale, ambush: run.pending?.kind === "ambush" });
    for (const development of developQualities(saved, at, Math.random, sharedQualities(state.heroes, saved))) {
      addFeed(run, at, development.text, "good", true);
    }
  }
  run.loot.gold += Math.round(gold || 0);
  run.loot.items.push(...(items || []));
  const fallen = party.filter((hero) => hero.combat.hp <= 0);
  for (const hero of fallen) state.injuries[heroId(hero)] = at + region.recoverySeconds * 1000;
  if (fallen.length && victory) {
    addFeed(run, at, `${fallen.map((hero) => hero.identity.name).join(" and ")} ${fallen.length > 1 ? "are" : "is"} down${run.campAt != null ? " until the party makes camp"
      : region.boss && !run.bossDone ? " until the party regroups for the final fight" : " and will sit out the rest of the trip"}.`, "danger");
  }
  const { pending } = run;
  run.stats.fights += 1;

  if (pending.kind === "rift") {
    const bounty = riftBounty(wavesCleared);
    run.loot.gold += bounty;
    run.wavesCleared = wavesCleared;
    state.records = { ...(state.records || {}), riftBest: Math.max(state.records?.riftBest || 0, wavesCleared) };
    run.pending = null;
    if (!victory) {
      halveLoot(run);
      addFeed(run, at, `Overrun on wave ${wavesCleared + 1}. Retreating with half the loot.`, "danger");
      completeExpedition(state, "retreat", at);
    } else {
      addFeed(run, at, `Returned from the Rift after ${wavesCleared} waves. +${bounty} gold bounty.`, "good");
      completeExpedition(state, "returned", at);
    }
    return;
  }
  if (!victory && run.revives > 0) {
    secondChance(state, at);
    return;
  }
  if (!victory) {
    halveLoot(run);
    addFeed(run, at, `The party is overrun by ${pending.label} and flees with half the loot.`, "danger");
    run.pending = null;
    completeExpedition(state, "retreat", at);
    return;
  }
  const qualities = road(state);
  changeMorale(state, 8 + roadEffect(qualities, "moraleOnWin"));
  afterVictory(state, qualities, at);
  if (recovered > 0) addFeed(run, at, `Picked up ${recovered} arrow${recovered > 1 ? "s" : ""} from the field.`, "flavor");
  for (const hero of party) {
    if (heroUsesArrows(hero) && hero.combat.hp > 0 && heroArrowCount(findHero(state, heroId(hero))) === 0) {
      addFeed(run, at, `${hero.identity.name} is out of arrows!`, "danger");
    }
  }
  addFeed(run, at, `Victory over ${pending.label}! +${Math.round(gold || 0)} gold${items?.length ? `, ${items.length} item${items.length > 1 ? "s" : ""}` : ""}.`, "good");
  if (pending.legendary) {
    const rng = Math.random;
    const bonus = Math.round(randomBetween(LEGENDARY.rewardGold, rng) * tierMult(region.tier));
    const trophy = createGearItem({ slot: pick(GEAR_SLOTS, rng), rarity: pick(["rare", "epic"], rng), tier: region.tier + 1 }, rng);
    run.loot.gold += bonus;
    run.loot.items.push(trophy);
    changeMorale(state, 15);
    addFeed(run, at, `The legend falls! Its hoard: ${bonus} gold and a ${trophy.name}.`, "loot", true);
  }
  if (pending.kind === "boss") {
    run.bossDone = true;
    let bounty = region.completionGold;
    if (region.bossRotation) {
      const rank = state.bossRank || 0;
      bounty = Math.round(bounty * (1 + BOSS_RANK_SCALING.bounty * rank));
      state.bossRank = rank + 1;
      addFeed(run, at, `${C.ENEMIES[bossForRank(rank)].name} slain! Next on the throne: ${C.ENEMIES[bossForRank(rank + 1)].name} (rank ${rank + 2}).`, "good");
    }
    run.loot.gold += bounty;
    state.clears[region.id] = (state.clears[region.id] || 0) + 1;
    // Every end boss leaves a Flawless crystal behind.
    const crystal = randomCrystal(2);
    run.loot.items.push(crystal);
    addFeed(run, at, `${region.name} conquered! +${bounty} gold bounty and a ${crystalInfo(crystal.key).fullName}.`, "good");
    // The first time each boss falls to a party led by a level 10+ hero, a crate turns up.
    const boss = pending.wave.enemies.find((enemy) => enemy.boss) || pending.wave.enemies[0];
    if (earnPetCrate(state, boss.type, run.heroIds[0])) {
      addFeed(run, at, `Among ${boss.name}'s hoard: a weird crate with breathing holes. Something inside is scratching.`, "loot", true);
    }
    run.pending = null;
    completeExpedition(state, "victory", at);
    return;
  }
  closePending(run, at);
  if (!livingParty(state).length) completeExpedition(state, "retreat", at);
}

// Qualities that kick in after a won fight: a Scavenger picks over the
// fallen, a Field Surgeon patches everyone up.
function afterVictory(state, qualities, at) {
  const run = state.expedition;
  if (Math.random() < roadEffect(qualities, "scavengeOnWin")) {
    const key = pick(["bandage", "bandage", "potion", "arrows"], Math.random);
    const qty = key === "arrows" ? 6 : 1;
    run.loot.items.push({ kind: "consumable", key, qty });
    addFeed(run, at, `${firstName(qualities.who.scavengeOnWin, Math.random)} scavenges ${key === "arrows" ? `${qty} arrows` : `a ${CONSUMABLES[key].name}`} from the fallen.`, "loot");
  }
  const patch = roadEffect(qualities, "postFightHeal");
  if (patch > 0) {
    for (const hero of livingParty(state)) heal(hero, patch);
    addFeed(run, at, `${firstName(qualities.who.postFightHeal, Math.random)} patches up the party's wounds.`, "good");
  }
}

// Put recovered plain arrows back in a hero's quiver; any that don't fit go
// into the trip's loot. Returns how many were picked up.
function returnArrows(state, hero, count) {
  let left = count;
  for (const slot of hero.quickSlots) {
    if (slot?.key !== "arrows") continue;
    const room = Math.min(left, CONSUMABLES.arrows.stackCap - slot.qty);
    slot.qty += room;
    left -= room;
  }
  // No plain-arrow stack with room: an empty quick slot takes them.
  const free = hero.quickSlots.findIndex((slot) => !slot || !(slot.qty > 0));
  if (left > 0 && free >= 0) {
    const moved = Math.min(left, CONSUMABLES.arrows.stackCap);
    hero.quickSlots[free] = { key: "arrows", qty: moved };
    left -= moved;
  }
  if (left > 0) state.expedition.loot.items.push({ kind: "consumable", key: "arrows", qty: left });
  return count;
}

// A second chance (see startExpedition): the whole party is back on its feet
// at half HP. An end boss has to be faced again; anything else has moved on.
function secondChance(state, at) {
  const run = state.expedition;
  run.revives -= 1;
  for (const id of run.heroIds) {
    const hero = findHero(state, id);
    if (hero) hero.combat.hp = Math.max(hero.combat.hp, Math.round(classlessMaxHp(hero) * 0.5));
  }
  addFeed(run, at, "A second chance! The party is back on its feet.", "good", true);
  if (run.pending.kind === "boss") {
    run.pending = { ...run.pending, promptAt: at, engagedAt: null };
  } else {
    closePending(run, at);
  }
}

function halveLoot(run) {
  run.loot.gold = Math.floor(run.loot.gold * RETREAT_LOOT_SHARE);
  run.loot.items = run.loot.items.slice(0, Math.floor(run.loot.items.length * RETREAT_LOOT_SHARE));
}

// Head home now with everything gathered so far (not mid-battle).
export function recallExpedition(state, now) {
  const run = state.expedition;
  if (!run || run.pending?.engagedAt != null) return { ok: false, reason: "cannot_recall" };
  const next = serializeGameState(state);
  addFeed(next.expedition, now, "Recalled the party.", "flavor");
  next.expedition.pending = null;
  completeExpedition(next, "recalled", now);
  return { ok: true, state: next };
}

function completeExpedition(state, outcome, at) {
  const run = state.expedition;
  const { loot, regionId, heroIds } = run;
  for (const id of heroIds) {
    const hero = findHero(state, id);
    if (hero && hero.combat.hp <= 0) hero.combat.hp = 1;
    if (hero) recordHistory(hero, "trips");
  }
  // Fortune adds its share when the gold reaches the guild.
  const fortune = Math.round(loot.gold * legacyBonuses(state).gold);
  if (fortune > 0) {
    loot.gold += fortune;
    addFeed(run, at, `Fortune: +${fortune} gold.`, "loot");
  }
  run.outcome = outcome;
  state.gold += loot.gold;
  bankLoot(state, loot.items);
  state.lastReport = {
    regionId, outcome, loot, stats: run.stats, morale: run.morale, wavesCleared: run.wavesCleared, endedAt: at,
    log: run.feed.map((entry) => entry.text),
  };
  state.expedition = null;
}

export function dismissReport(state) {
  const next = serializeGameState(state);
  delete next.lastReport;
  return next;
}
