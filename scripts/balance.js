// Balance harness: plays scripted guilds from a fresh save through the real
// guild, item and engine code, and reports how progression unfolds.
//
//   npm run balance                 # 6 idle + 6 active playthroughs
//   npm run balance -- --runs 20    # more playthroughs per style
//   npm run balance -- --no-gear    # never equip drops (sell everything)
//   npm run balance -- --no-supplies  # never buy or load quick-slot supplies
//   npm run balance -- --no-shop    # never buy from the Armory or use the Forge
//   npm run balance -- --hours 12   # endgame length after the first Ashen clear
//
// "Idle" players never tap abilities (heroes only auto-attack and auto-use
// supplies). "Active" players fire every ability the moment it is ready.
//
// After the first Ashen Keep clear the guild keeps playing: it challenges the
// rotating boss, falls back to the Endless Rift after two straight losses,
// and spends spare gold in the Armory and the Forge.
import { allocateClasslessStat, purchaseClasslessNode } from "../src/combat/classlessProgression";
import { classlessMaxHp } from "../src/combat/classlessCombatEffects";
import {
  createGuild, currentEncounterParty, currentEncounterWave, recruitCost, recruitHero, resolveEncounter, startExpedition,
  tick, updateHero,
} from "../src/game/guild";
import { buyConsumable, equipGear, loadQuickSlot, sellGear, upgradeCost, upgradeGear } from "../src/game/items";
import { REGIONS, getRegion } from "../src/game/regions";
import { buyShopItem, shopStock } from "../src/game/shop";
import { simulateEncounter } from "../src/game/simulate";

const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf("--runs") + 1]) || 6;
const NO_GEAR = args.includes("--no-gear");
const NO_SUPPLIES = args.includes("--no-supplies");
const NO_SHOP = args.includes("--no-shop");
const ENDGAME_MINUTES = (Number(args[args.indexOf("--hours") + 1]) || 8) * 60;
const MAX_EXPEDITIONS = 70;
const CAMPAIGN = REGIONS.filter((region) => !region.endless);
// Gold kept back for supplies before spending in the Armory or Forge.
const GOLD_RESERVE = 250;
// The Rift party heads home once it is down to 40% of its total HP.
const RIFT_RETURN_HP = 0.4;
// A sensible generic build: survivability and damage first, then actives.
const PERK_ORDER = ["V1", "W1", "P1", "V2", "W2", "P2a", "P3", "W2a", "S1", "P2", "V3", "T1", "S2", "F1"];
const SP_ORDER = ["attack", "defense", "attack"];

const power = (item) => !item ? 0 : (item.stats.attack || 0) * 3 + (item.stats.defense || 0) * 2
  + (item.stats.maxHp || 0) * 0.25 + (item.stats.agility || 0) + (item.stats.critChance || 0) * 150;

function developHeroes(state) {
  for (const original of state.heroes) {
    let hero = original;
    for (const nodeId of PERK_ORDER) {
      const bought = purchaseClasslessNode(hero, nodeId);
      if (bought.ok) hero = bought.hero || { ...hero, progression: bought.progression };
    }
    let spent = 0;
    while (hero.progression.sp > 0) {
      const result = allocateClasslessStat(hero, SP_ORDER[spent++ % SP_ORDER.length]);
      if (!result.ok) break;
      hero = result.hero;
    }
    state = updateHero(state, hero);
  }
  return state;
}

function gearUp(state) {
  if (NO_GEAR) {
    for (const item of [...state.vault]) state = sellGear(state, item.id).state;
    return state;
  }
  for (const item of [...state.vault].sort((a, b) => power(b) - power(a))) {
    const target = state.heroes
      .filter((hero) => power(item) > power(hero.equipment?.[item.slot]))
      .sort((a, b) => power(a.equipment?.[item.slot]) - power(b.equipment?.[item.slot]))[0];
    if (target) state = equipGear(state, target.identity.id, item.id).state;
  }
  for (const item of [...state.vault]) state = sellGear(state, item.id).state;
  return state;
}

// Buy Armory gear that beats what some hero wears, best value first, then
// sink what is left into Forge upgrades on equipped gear, cheapest first.
function spend(state, clock) {
  if (NO_SHOP || NO_GEAR) return state;
  const offers = shopStock(state, clock).items.filter((item) => !item.sold)
    .map((item) => {
      const worst = Math.min(...state.heroes.map((hero) => power(hero.equipment?.[item.slot])));
      return { item, gain: power(item) - worst };
    })
    .filter((offer) => offer.gain > 0)
    .sort((a, b) => b.gain / b.item.price - a.gain / a.item.price);
  for (const { item } of offers) {
    if (state.gold - item.price < GOLD_RESERVE) continue;
    const bought = buyShopItem(state, item.id, clock);
    if (bought.ok) state = bought.state;
  }
  state = gearUp(state);
  for (;;) {
    const candidates = state.heroes.flatMap((hero) => Object.values(hero.equipment || {}))
      .filter((item) => (item.upgrade || 0) < 5)
      .sort((a, b) => upgradeCost(a) - upgradeCost(b));
    const cheapest = candidates[0];
    if (!cheapest || state.gold - upgradeCost(cheapest) < GOLD_RESERVE) break;
    state = upgradeGear(state, cheapest.id).state;
  }
  return state;
}

function stockUp(state, party) {
  if (NO_SUPPLIES) return state;
  for (const id of party) {
    for (const [slot, key, keepGold] of [[0, "bandage", 0], [1, "potion", 150]]) {
      const hero = state.heroes.find((entry) => entry.identity.id === id);
      const have = hero.quickSlots[slot]?.key === key ? hero.quickSlots[slot].qty : 0;
      const want = key === "bandage" ? 5 : 3;
      while ((state.stash[key] || 0) < want - have && state.gold - keepGold >= 35) {
        const bought = buyConsumable(state, key, 1);
        if (!bought.ok) break;
        state = bought.state;
      }
      const loaded = loadQuickSlot(state, id, slot, key);
      if (loaded.ok) state = loaded.state;
    }
  }
  return state;
}

function restFully(state, clock) {
  // Wait until injuries clear and HP is full (heroes heal 1/90 max HP per second).
  const injuredUntil = Math.max(clock, ...Object.values(state.injuries));
  const missing = Math.max(0, ...state.heroes.map((hero) => 1 - hero.combat.hp / classlessMaxHp(hero)));
  const until = Math.max(injuredUntil, clock + missing * 90_000);
  return { state: tick(state, until), clock: until };
}

function chooseRun(state, clock, preferHarder) {
  const party = [...state.heroes]
    .filter((hero) => (state.injuries[hero.identity.id] || 0) <= clock)
    .sort((a, b) => b.progression.level - a.progression.level).slice(0, 4);
  const topLevel = party[0]?.progression.level || 1;
  const unlocked = CAMPAIGN.filter((region) => topLevel >= region.minLevel);
  // Stay in a region until it has been cleared twice, then push on.
  const region = [...unlocked].reverse().find((entry, index) => index === 0 && (preferHarder(entry) || unlocked.length === 1))
    || unlocked[unlocked.length - 2] || unlocked[0];
  return { region, party: party.map((hero) => hero.identity.id) };
}

function activePlayer(engine) {
  engine.heroes.forEach((hero) => {
    for (const ability of engine.getHeroAbilityStatus(hero.i)) if (ability.available) engine.useHeroAbility(hero.i, ability.id);
  });
}

function riftShouldReturn(engine) {
  const hp = engine.heroes.reduce((sum, hero) => sum + Math.max(0, hero.ref.hp), 0);
  const max = engine.heroes.reduce((sum, hero) => sum + hero.d.maxHp, 0);
  return hp / max < RIFT_RETURN_HP;
}

// Run one expedition to completion through the real guild code.
function runExpedition(state, clock, region, party, active) {
  state = stockUp(state, party);
  const started = startExpedition(state, region.id, party, clock);
  if (!started.ok) throw new Error(`could not start ${region.id}: ${started.reason}`);
  state = started.state;
  let reached = 0;
  while (state.expedition) {
    clock = state.expedition.phaseEndsAt ?? clock;
    state = tick(state, clock);
    if (state.expedition?.phase !== "ready") continue;
    const { result, sim, elapsed } = simulateEncounter(currentEncounterParty(state), currentEncounterWave(state), {
      regionTier: region.tier, onStep: active ? activePlayer : null,
      endless: !!region.endless, shouldReturn: riftShouldReturn,
    });
    clock += elapsed * 1000;
    reached = region.endless ? result?.wavesCleared || 0 : state.expedition.encounterIndex + (result?.victory ? 1 : 0);
    state = resolveEncounter(state, {
      victory: !!result?.victory, party: sim.heroes, xpGains: result?.xpGains?.heroes || {},
      gold: sim.gold, items: sim.vault, wavesCleared: result?.wavesCleared || 0,
    }, clock).state;
  }
  return { state, clock, reached, outcome: state.lastReport.outcome, gold: state.lastReport.loot.gold };
}

function prepare(state, clock) {
  ({ state, clock } = restFully(state, clock));
  while (state.heroes.length < 4 && state.gold >= recruitCost(state)) state = recruitHero(state).state;
  state = developHeroes(spend(gearUp(state), clock));
  return { state, clock };
}

function playthrough(active) {
  let state = createGuild();
  state.lastTickAt = 0;
  let clock = 0;
  const log = [];
  const firstClear = {};
  const attempts = {};
  for (let run = 0; run < MAX_EXPEDITIONS && !firstClear.ashen; run++) {
    ({ state, clock } = prepare(state, clock));
    const { region, party } = chooseRun(state, clock, (entry) => (state.clears[entry.id] || 0) < 2 || entry === CAMPAIGN.at(-1));
    attempts[region.id] = (attempts[region.id] || 0) + 1;
    const run_ = runExpedition(state, clock, region, party, active);
    ({ state, clock } = run_);
    if (run_.outcome === "victory" && firstClear[region.id] == null) {
      firstClear[region.id] = { minutes: clock / 60000, attempts: attempts[region.id], level: Math.max(...state.heroes.map((hero) => hero.progression.level)) };
    }
    log.push({ region: region.id, outcome: run_.outcome, reached: run_.reached });
  }

  // Endgame: chase boss ranks, fall back to the Rift after two straight losses.
  const endgame = { start: clock, rankAt: {}, rift: [], boss: [], losses: 0 };
  const endAt = clock + ENDGAME_MINUTES * 60_000;
  while (firstClear.ashen && clock < endAt) {
    ({ state, clock } = prepare(state, clock));
    const party = [...state.heroes].sort((a, b) => b.progression.level - a.progression.level).slice(0, 4).map((hero) => hero.identity.id);
    const region = getRegion(endgame.losses >= 2 ? "rift" : "ashen");
    const begin = clock;
    const run_ = runExpedition(state, clock, region, party, active);
    ({ state, clock } = run_);
    const entry = { minutes: (clock - begin) / 60000, gold: run_.gold, reached: run_.reached, outcome: run_.outcome };
    if (region.endless) {
      endgame.rift.push(entry);
      endgame.losses = 0;
    } else {
      endgame.boss.push(entry);
      endgame.losses = run_.outcome === "victory" ? 0 : endgame.losses + 1;
    }
    for (const hours of [2, 4, 8, 12, 24]) {
      if (clock - endgame.start <= hours * 3_600_000) endgame.rankAt[hours] = state.bossRank;
    }
  }
  const rarities = state.heroes.flatMap((hero) => Object.values(hero.equipment || {}).map((item) => item.rarity));
  return { firstClear, attempts, log, state, minutes: clock / 60000, rarities, endgame };
}

function summarize(label, results) {
  const fmt = (values) => values.length ? `${Math.round(Math.min(...values))}-${Math.round(Math.max(...values))}` : "never";
  const perMinute = (runs) => {
    const minutes = runs.reduce((sum, run) => sum + run.minutes, 0);
    return minutes ? Math.round(runs.reduce((sum, run) => sum + run.gold, 0) / minutes) : 0;
  };
  console.log(`\n=== ${label} players (${results.length} playthroughs) ===`);
  for (const region of CAMPAIGN) {
    const clears = results.map((result) => result.firstClear[region.id]).filter(Boolean);
    const runs = results.flatMap((result) => result.log.filter((entry) => entry.region === region.id));
    const wins = runs.filter((entry) => entry.outcome === "victory").length;
    console.log(`${region.name.padEnd(15)} first clear in ${clears.length}/${results.length} · ` +
      `at ${fmt(clears.map((clear) => clear.minutes))} min · attempt ${fmt(clears.map((clear) => clear.attempts))} · ` +
      `top level ${fmt(clears.map((clear) => clear.level))} · win rate ${runs.length ? Math.round(100 * wins / runs.length) : 0}% of ${runs.length} runs`);
  }
  const boss = results.flatMap((result) => result.endgame.boss);
  const rift = results.flatMap((result) => result.endgame.rift);
  console.log(`Endgame (${ENDGAME_MINUTES / 60}h after first Ashen clear): boss rank reached ` +
    [2, 4, 8, 12, 24].filter((hours) => hours * 60 <= ENDGAME_MINUTES).map((hours) => `${hours}h ${fmt(results.map((result) => result.endgame.rankAt[hours] ?? 0))}`).join(" · "));
  console.log(`  Ashen runs: ${boss.length}, win rate ${boss.length ? Math.round(100 * boss.filter((run) => run.outcome === "victory").length / boss.length) : 0}%, ${perMinute(boss)} gold/min`);
  console.log(`  Rift runs: ${rift.length}, waves ${fmt(rift.map((run) => run.reached))} (median ${rift.map((run) => run.reached).sort((a, b) => a - b)[Math.floor(rift.length / 2)] ?? "-"}), ${perMinute(rift)} gold/min`);
  for (const [index, result] of results.entries()) {
    console.log(`  #${index + 1}: first Ashen clear ${result.firstClear.ashen ? Math.round(result.firstClear.ashen.minutes) + " min" : "never"} · final rank ${result.state.bossRank}` +
      ` · levels ${result.state.heroes.map((hero) => hero.progression.level).join("/")} · gold ${result.state.gold}` +
      ` · best Rift wave ${result.state.records.riftBest}` +
      ` · gear ${["common", "uncommon", "rare", "epic"].map((rarity) => result.rarities.filter((entry) => entry === rarity).length).join("/")} (C/U/R/E)` +
      ` · avg +${Math.round(result.state.heroes.flatMap((hero) => Object.values(hero.equipment || {})).reduce((sum, item, _, all) => sum + (item.upgrade || 0) / all.length, 0) * 10) / 10}`);
  }
}

summarize("Idle", Array.from({ length: RUNS }, () => playthrough(false)));
summarize("Active", Array.from({ length: RUNS }, () => playthrough(true)));
