// The running expedition: the small helpers every part of a trip uses (the
// adventure feed, the party, morale, prompts, pushing deeper, and bringing
// the trip home). expedition.js runs the trip and fightResults.js applies the
// outcome of its fights; both build on these. Nothing here imports either of
// them.
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { CONSUMABLES } from "../combat/gear";
import { partyRoadEffects, roadEffect } from "../combat/traits";
import { clampMorale } from "./adventure";
import { bankLoot } from "./items";
import { applyAutoClear } from "./armory";
import { legacyBonuses } from "./legacy";
import { recordHistory } from "./qualities";

// Loot share kept when a defeated party limps home.
const RETREAT_LOOT_SHARE = 0.5;

const MAX_FEED_LINES = 200;

// Push deeper: when a trip is done (end boss beaten, or the timer out where
// there is none) the party may press on for another leg. Each leg makes the
// creatures stronger and the spoils richer; a wipe down there loses
// everything found past the trip's end. Owner-approved numbers (Oct 2026).
export const DEEPER = Object.freeze({
  legMs: 3 * 60_000,
  // Enemy HP and damage grow ×1.15 per leg, compounding (leg 3: +52%, leg 10:
  // ×4), so even the strongest party meets a wall eventually.
  danger: 0.15,
  loot: 0.3, // extra gold per leg, on the gold found during that leg
  // Each leg survived also pays this share × depth of the bounty the trip
  // earned, so a leg pays about as well per minute as starting a new trip.
  bountyShare: 0.2,
  // Left alone, the party presses on while this healthy and nobody is down;
  // a Reckless or Berserker along lowers the bar.
  autoPushHp: 0.6,
  gamblerPushHp: 0.45,
  gamblers: Object.freeze(["reckless", "berserker"]),
  // An unattended party never goes further than this on its own.
  autoMaxDepth: 3,
});

// How much stronger the creatures are `depth` legs past the trip's end.
export function deeperDanger(depth = 0) {
  return (1 + DEEPER.danger) ** depth;
}

// The region as it is `depth` legs past the end of the trip.
export function deeperRegion(region, depth = 0) {
  if (!depth) return region;
  const danger = deeperDanger(depth);
  return { ...region, hpScale: region.hpScale * danger, dmgScale: region.dmgScale * danger };
}

export const heroId = (hero) => hero.identity.id;

export const findHero = (state, id) => state.heroes.find((hero) => heroId(hero) === id) || null;

export const randomBetween = ([min, max], rng) => min + rng() * (max - min);

export const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// `notify` marks big moments worth a notification while the game is in the background.
export function addFeed(run, at, text, tone = "flavor", notify = false) {
  run.feed.push(notify ? { at, text, tone, notify: true } : { at, text, tone });
  if (run.feed.length > MAX_FEED_LINES) run.feed.splice(0, run.feed.length - MAX_FEED_LINES);
}

export function livingParty(state) {
  return state.expedition.heroIds.map((id) => findHero(state, id)).filter((hero) => hero && hero.combat.hp > 0);
}

// The party's road qualities (see combat/traits.js), from whoever is still standing.
export function road(state) {
  return partyRoadEffects(livingParty(state));
}

// Steadfast (and similar) qualities soften every morale loss.
export function changeMorale(state, delta) {
  const run = state.expedition;
  const cut = delta < 0 ? roadEffect(road(state), "moraleLossCut") : 0;
  run.morale = clampMorale(run.morale + delta * (1 - cut));
}

export const firstName = (heroes, rng) => (heroes?.length ? pick(heroes, rng).identity.name : null);

export function heal(hero, fraction) {
  const max = classlessMaxHp(hero);
  hero.combat.hp = Math.min(max, hero.combat.hp + max * fraction);
}

export function openPending(run, at, details) {
  run.pending = { ...details, at, promptAt: at, engagedAt: null };
}

// Resume the expedition timer, which stood still while the prompt was open.
export function closePending(run, resolvedAt) {
  const paused = Math.max(0, resolvedAt - run.pending.at);
  if (run.endsAt != null) run.endsAt += paused;
  if (run.nextEventAt != null) run.nextEventAt += paused;
  if (run.campAt != null) run.campAt += paused;
  if (run.treasureAt != null) run.treasureAt += paused;
  run.healedAt = resolvedAt;
  run.pending = null;
}

// The trip is done: head home, or push deeper for another leg.
export function offerDeeper(state, at) {
  const run = state.expedition;
  if (run.guided || !livingParty(state).length) {
    completeExpedition(state, "victory", at);
    return;
  }
  const depth = (run.depth || 0) + 1;
  const atStake = run.depth ? run.loot.gold - run.banked.gold : 0;
  const text = `Push deeper (leg ${depth}: creatures +${Math.round((deeperDanger(depth) - 1) * 100)}%, spoils +${Math.round(DEEPER.loot * depth * 100)}%) or head home?`;
  addFeed(run, at, run.depth
    ? `Leg ${run.depth} survived. The dark goes on. ${atStake} gold found down here so far, and all of it lost if the party falls.`
    : "The way home is clear. But the path goes on, deeper, and the deeper it goes the richer it gets.", "story", true);
  openPending(run, at, { kind: "deeper", depth, atStake, text });
}

// Put recovered plain arrows back in a hero's quiver; any that don't fit go
// into the trip's loot. Returns how many were picked up.
export function returnArrows(state, hero, count) {
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

export function halveLoot(run) {
  // Falling past the trip's end loses everything found down there first.
  if (run.depth && run.banked) {
    run.loot.gold = Math.min(run.loot.gold, run.banked.gold);
    run.loot.items = run.loot.items.slice(0, run.banked.items);
  }
  run.loot.gold = Math.floor(run.loot.gold * RETREAT_LOOT_SHARE);
  run.loot.items = run.loot.items.slice(0, Math.floor(run.loot.items.length * RETREAT_LOOT_SHARE));
}

export function completeExpedition(state, outcome, at) {
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
  // The player's auto-clear setting (off by default) runs on the new gear.
  const autoCleared = applyAutoClear(state, loot.items);
  state.lastReport = {
    regionId, outcome, loot, stats: run.stats, morale: run.morale, wavesCleared: run.wavesCleared, depth: run.depth || 0, endedAt: at,
    log: run.feed.map((entry) => entry.text),
    ...(autoCleared ? { autoCleared } : {}),
  };
  state.expedition = null;
}
