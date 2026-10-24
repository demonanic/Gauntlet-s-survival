// Balance harness: plays scripted guilds from a fresh save through the real
// guild, item and engine code, and reports how progression unfolds.
//
//   npm run balance                 # 6 idle + 6 active playthroughs
//   npm run balance -- --runs 20    # more playthroughs per style
//   npm run balance -- --no-gear    # never equip drops (sell everything)
//   npm run balance -- --no-supplies  # never buy or load quick-slot supplies
//
// "Idle" players never tap abilities (heroes only auto-attack and auto-use
// supplies). "Active" players fire every ability the moment it is ready.
import { allocateClasslessStat, purchaseClasslessNode } from "../src/combat/classlessProgression";
import { classlessMaxHp } from "../src/combat/classlessCombatEffects";
import { buildEncounter } from "../src/game/encounters";
import {
  createGuild, currentEncounterParty, recruitCost, recruitHero, resolveEncounter, startExpedition, tick, updateHero,
} from "../src/game/guild";
import { buyConsumable, equipGear, loadQuickSlot, sellGear } from "../src/game/items";
import { REGIONS, getRegion } from "../src/game/regions";
import { simulateEncounter } from "../src/game/simulate";

const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf("--runs") + 1]) || 6;
const NO_GEAR = args.includes("--no-gear");
const NO_SUPPLIES = args.includes("--no-supplies");
const MAX_EXPEDITIONS = 70;
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
  const unlocked = REGIONS.filter((region) => topLevel >= region.minLevel);
  // Stay in a region until it has been cleared twice, then push on.
  const region = [...unlocked].reverse().find((entry, index) => index === 0 && (preferHarder(entry) || unlocked.length === 1))
    || unlocked[unlocked.length - 2] || unlocked[0];
  return { region, party: party.map((hero) => hero.identity.id) };
}

function playthrough(active) {
  let state = createGuild();
  state.lastTickAt = 0;
  let clock = 0;
  const log = [];
  const firstClear = {};
  const attempts = {};
  for (let run = 0; run < MAX_EXPEDITIONS; run++) {
    ({ state, clock } = restFully(state, clock));
    while (state.heroes.length < 4 && state.gold >= recruitCost(state)) state = recruitHero(state).state;
    state = developHeroes(gearUp(state));
    const { region, party } = chooseRun(state, clock, (entry) => (state.clears[entry.id] || 0) < 2 || entry === REGIONS.at(-1));
    state = stockUp(state, party);
    const started = startExpedition(state, region.id, party, clock);
    if (!started.ok) throw new Error(`could not start ${region.id}: ${started.reason}`);
    state = started.state;
    attempts[region.id] = (attempts[region.id] || 0) + 1;
    let reached = 0;
    while (state.expedition) {
      clock = state.expedition.phaseEndsAt ?? clock;
      state = tick(state, clock);
      if (state.expedition?.phase !== "ready") continue;
      const onStep = active ? (engine) => engine.heroes.forEach((hero) => {
        for (const ability of engine.getHeroAbilityStatus(hero.i)) if (ability.available) engine.useHeroAbility(hero.i, ability.id);
      }) : null;
      const encounterParty = currentEncounterParty(state);
      const { result, sim, elapsed } = simulateEncounter(encounterParty,
        buildEncounter(region, state.expedition.encounterIndex), { regionTier: REGIONS.indexOf(region) + 1, onStep });
      clock += elapsed * 1000;
      reached = state.expedition.encounterIndex + (result?.victory ? 1 : 0);
      state = resolveEncounter(state, {
        victory: !!result?.victory, party: sim.heroes, xpGains: result?.xpGains?.heroes || {},
        gold: sim.gold, items: sim.vault,
      }, clock).state;
    }
    const outcome = state.lastReport.outcome;
    if (outcome === "victory" && firstClear[region.id] == null) {
      firstClear[region.id] = { minutes: clock / 60000, attempts: attempts[region.id], level: Math.max(...state.heroes.map((hero) => hero.progression.level)) };
    }
    log.push({ region: region.id, outcome, reached, levels: state.heroes.map((hero) => hero.progression.level) });
    if (firstClear.ashen) break;
  }
  const rarities = state.heroes.flatMap((hero) => Object.values(hero.equipment || {}).map((item) => item.rarity));
  return { firstClear, attempts, log, state, minutes: clock / 60000, rarities };
}

function summarize(label, results) {
  const fmt = (values) => values.length ? `${Math.round(Math.min(...values))}-${Math.round(Math.max(...values))}` : "never";
  console.log(`\n=== ${label} players (${results.length} playthroughs) ===`);
  for (const region of REGIONS) {
    const clears = results.map((result) => result.firstClear[region.id]).filter(Boolean);
    const runs = results.flatMap((result) => result.log.filter((entry) => entry.region === region.id));
    const wins = runs.filter((entry) => entry.outcome === "victory").length;
    console.log(`${region.name.padEnd(15)} first clear in ${clears.length}/${results.length} · ` +
      `at ${fmt(clears.map((clear) => clear.minutes))} min · attempt ${fmt(clears.map((clear) => clear.attempts))} · ` +
      `top level ${fmt(clears.map((clear) => clear.level))} · win rate ${runs.length ? Math.round(100 * wins / runs.length) : 0}% of ${runs.length} runs`);
  }
  for (const [index, result] of results.entries()) {
    const ashen = result.log.filter((entry) => entry.region === "ashen");
    const reached = ashen.map((entry) => entry.reached).join(",");
    console.log(`  #${index + 1}: ${Math.round(result.minutes)} min · ${result.log.length} expeditions · levels ${result.state.heroes.map((hero) => hero.progression.level).join("/")}` +
      ` · gold ${result.state.gold} · gear ${["common", "uncommon", "rare", "epic"].map((rarity) => result.rarities.filter((entry) => entry === rarity).length).join("/")} (C/U/R/E)` +
      ` · Ashen encounters reached per run: ${reached || "-"}`);
  }
}

summarize("Idle", Array.from({ length: RUNS }, () => playthrough(false)));
summarize("Active", Array.from({ length: RUNS }, () => playthrough(true)));
