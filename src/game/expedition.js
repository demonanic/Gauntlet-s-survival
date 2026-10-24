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
import { GEAR_SLOTS } from "../combat/gear";
import { serializeGameState } from "../combat/heroModel";
import { heroTraitEffects } from "../combat/traits";
import {
  ADVENTURE, STORIES, STORY_KEYS, clampMorale, findLine, moraleDamageBonus, rollFlavor, rollHazard, sneakChance,
} from "./adventure";
import { buildBossEncounter, buildEndlessWave, buildWildEncounter, describeSquad } from "./encounters";
import { bankLoot, createGearItem, normalizeHeroGear, tierMult } from "./items";
import { legacyBonuses } from "./legacy";
import { BOSS_RANK_SCALING, bossForRank, getRegion } from "./regions";
import { simulateEncounter } from "./simulate";

export const MAX_PARTY_SIZE = 4;
// Heroes resting at the guild recover this fraction of max HP per second;
// heroes out exploring patch themselves up much more slowly between events.
const REST_HEAL_FRACTION_PER_SECOND = 1 / 90;
const EXPLORE_HEAL_FRACTION_PER_SECOND = 1 / 900;
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

function addFeed(run, at, text, tone = "flavor") {
  run.feed.push({ at, text, tone });
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

function changeMorale(run, delta) {
  run.morale = clampMorale(run.morale + delta);
}

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

export function startExpedition(state, regionId, heroIds, now, rng = Math.random) {
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
    morale: ADVENTURE.startMorale,
    feed: [],
    loot: { gold: 0, items: [] },
    stats: { events: 0, encounters: 0, fights: 0, sneaks: 0, ambushes: 0, autoFightSeconds: 0 },
    outcome: null,
  };
  next.expedition = run;
  addFeed(run, now, `The party sets out for ${region.name}.`, "good");
  if (region.endless) {
    addFeed(run, now, "The Rift tears open before them. Something stirs on the other side.", "danger");
    openPending(run, now, { kind: "rift", wave: buildEndlessWave(1, rng) });
  }
  return { ok: true, state: next };
}

function openPending(run, at, details) {
  run.pending = { ...details, at, promptAt: at, engagedAt: null };
}

// Resume the expedition timer, which stood still while the prompt was open.
function closePending(run, resolvedAt) {
  const paused = Math.max(0, resolvedAt - run.pending.at);
  if (run.endsAt != null) run.endsAt += paused;
  if (run.nextEventAt != null) run.nextEventAt += paused;
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
    const at = Math.min(run.nextEventAt, run.endsAt);
    if (at > now) {
      healParty(state, now);
      return;
    }
    healParty(state, at);
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
    const wave = buildBossEncounter(region, state.bossRank || 0);
    const boss = wave.enemies.find((enemy) => enemy.boss || enemy.tier === "elite") || wave.enemies[0];
    addFeed(run, at, `The way out is blocked: ${boss.name} stands guard with ${describeSquad({ enemies: wave.enemies.filter((enemy) => enemy !== boss) })}.`, "danger");
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
  changeMorale(run, (ADVENTURE.startMorale - run.morale) * ADVENTURE.moraleDrift);
  const hero = pick(party, rng);
  const roll = rng() * Object.values(ADVENTURE.eventWeights).reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  const kind = Object.entries(ADVENTURE.eventWeights).find(([, weight]) => (cursor += weight) > roll)[0];

  if (kind === "flavor") {
    run.recentFlavor ||= [];
    const line = rollFlavor(region, hero.identity.name, rng, run.recentFlavor);
    run.recentFlavor = [...run.recentFlavor, line.template].slice(-RECENT_FLAVOR);
    changeMorale(run, line.morale);
    addFeed(run, at, line.text, line.tone);
  } else if (kind === "find") {
    findSomething(state, region, hero, at, rng);
  } else if (kind === "hazard") {
    const hazard = rollHazard(hero, rng);
    if (hazard.damage) for (const target of hazard.all ? party : [hero]) hurt(target, hazard.damage);
    changeMorale(run, hazard.morale);
    addFeed(run, at, hazard.text, hazard.tone);
  } else if (kind === "encounter") {
    const progress = 1 - (run.endsAt - at) / run.durationMs;
    startEncounter(state, region, at, buildWildEncounter(region, progress, rng), rng() < ADVENTURE.ambushShare);
  } else {
    const key = pick(STORY_KEYS, rng);
    addFeed(run, at, STORIES[key].prompt, "story");
    openPending(run, at, { kind: "story", story: key });
  }
}

function findSomething(state, region, hero, at, rng) {
  const run = state.expedition;
  const roll = rng();
  if (roll < 0.5) {
    const gold = Math.round(randomBetween([5, 20], rng) * tierMult(region.tier));
    run.loot.gold += gold;
    addFeed(run, at, findLine("gold", hero.identity.name, gold, rng), "loot");
  } else if (roll < 0.8) {
    const key = pick(["bandage", "bandage", "bandage", "potion", "ammo"], rng);
    run.loot.items.push({ kind: "consumable", key, qty: 1 });
    addFeed(run, at, findLine("supply", hero.identity.name, key === "potion" ? "Health Potion" : key === "ammo" ? "pouch of Barbed Ammo" : "Bandage", rng), "loot");
  } else {
    const rarity = pick(["common", "common", "uncommon", "uncommon", "rare"], rng);
    const item = createGearItem({ slot: pick(GEAR_SLOTS, rng), rarity, tier: region.tier }, rng);
    run.loot.items.push(item);
    addFeed(run, at, findLine("gear", hero.identity.name, item.name, rng), "loot");
  }
  changeMorale(run, 3);
}

// A sighting asks the player to attack or sneak; an ambush skips the choice
// and opens with a volley that costs every hero a little HP.
function startEncounter(state, region, at, wave, ambush) {
  const run = state.expedition;
  run.stats.encounters += 1;
  const squad = describeSquad(wave);
  if (ambush) {
    ambushParty(state, at, `Ambush! ${squad} burst from the shadows!`);
    openPending(run, at, { kind: "ambush", wave, label: squad });
  } else {
    const chance = sneakChance(livingParty(state), wave, run.morale, region);
    addFeed(run, at, `The party spots ${squad} ahead. They haven't noticed yet.`, "danger");
    openPending(run, at, { kind: "sighting", wave, label: squad, sneakChance: chance });
  }
}

function ambushParty(state, at, text) {
  const run = state.expedition;
  run.stats.ambushes += 1;
  for (const hero of livingParty(state)) hurt(hero, ADVENTURE.ambushVolley);
  changeMorale(run, -8);
  addFeed(run, at, `${text} The party takes an opening volley.`, "danger");
}

// Heroes for the next fight, carrying the party's morale as a damage bonus.
export function currentEncounterParty(state) {
  const bonus = moraleDamageBonus(state.expedition?.morale ?? ADVENTURE.startMorale);
  return livingParty(state).map((hero) => ({ ...hero, moraleBonus: { damage: bonus } }));
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
    changeMorale(run, 4);
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

function resolveStory(state, region, choice, at, rng) {
  const run = state.expedition;
  const story = STORIES[run.pending.story];
  const option = story.options.find((entry) => entry.id === choice);
  const hero = pick(livingParty(state), rng);
  if (option.result) addFeed(run, at, option.result.replaceAll("{hero}", hero.identity.name), "story");
  const ambushed = applyEffects(state, region, option.effects, at, rng);
  if (!ambushed) closePending(run, at);
}

// Apply a story option's effects. Returns true if it led into an ambush.
function applyEffects(state, region, effects, at, rng) {
  const run = state.expedition;
  if (effects.healAll) for (const hero of livingParty(state)) heal(hero, effects.healAll);
  if (effects.hurtAll) for (const hero of livingParty(state)) hurt(hero, effects.hurtAll);
  if (effects.morale) changeMorale(run, effects.morale);
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
  if (effects.shorten && run.endsAt != null) {
    run.endsAt = Math.min(run.endsAt, Math.max(at + MIN_REMAINING_MS, run.endsAt - effects.shorten));
  }
  if (effects.text) addFeed(run, at, effects.text, effects.ambush || effects.hurtAll ? "danger" : "story");
  if (effects.gamble) {
    const outcome = rng() < effects.gamble.chance ? effects.gamble.win : effects.gamble.lose;
    return applyEffects(state, region, outcome, at, rng);
  }
  if (effects.ambush) {
    const progress = 1 - (run.endsAt - at) / run.durationMs;
    const wave = buildWildEncounter(region, progress, rng);
    run.stats.encounters += 1;
    const label = describeSquad(wave);
    ambushParty(state, at, `${label} spring out!`);
    run.pending = { ...run.pending, kind: "ambush", wave, label, promptAt: at };
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
    resolveStory(state, region, STORIES[pending.story].auto({ partyHp: partyHpFraction(state) }), at, rng);
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
  // Quick-slot stacks spent in the fight come back on the runtime party.
  for (const runtime of party) {
    const saved = findHero(state, heroId(runtime));
    if (saved) saved.quickSlots = normalizeHeroGear(runtime).quickSlots;
  }
  run.loot.gold += Math.round(gold || 0);
  run.loot.items.push(...(items || []));
  const fallen = party.filter((hero) => hero.combat.hp <= 0);
  for (const hero of fallen) state.injuries[heroId(hero)] = at + region.recoverySeconds * 1000;
  if (fallen.length && victory) {
    addFeed(run, at, `${fallen.map((hero) => hero.identity.name).join(" and ")} ${fallen.length > 1 ? "are" : "is"} down and will sit out the rest of the trip.`, "danger");
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
  if (!victory) {
    halveLoot(run);
    addFeed(run, at, `The party is overrun by ${pending.label} and flees with half the loot.`, "danger");
    run.pending = null;
    completeExpedition(state, "retreat", at);
    return;
  }
  changeMorale(run, 8);
  addFeed(run, at, `Victory over ${pending.label}! +${Math.round(gold || 0)} gold${items?.length ? `, ${items.length} item${items.length > 1 ? "s" : ""}` : ""}.`, "good");
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
    addFeed(run, at, `${region.name} conquered! +${bounty} gold bounty.`, "good");
    run.pending = null;
    completeExpedition(state, "victory", at);
    return;
  }
  closePending(run, at);
  if (!livingParty(state).length) completeExpedition(state, "retreat", at);
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
    regionId, outcome, loot, stats: run.stats, morale: run.morale, wavesCleared: run.wavesCleared,
    log: run.feed.map((entry) => entry.text),
  };
  state.expedition = null;
}

export function dismissReport(state) {
  const next = serializeGameState(state);
  delete next.lastReport;
  return next;
}
