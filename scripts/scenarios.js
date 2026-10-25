// Balance scenarios: the same expedition played many times with one thing
// changed, reported side by side. Where `npm run balance` plays whole
// campaigns, this holds the guild fixed (level, gear, supplies) per region so
// the difference between party make-ups, qualities and revive rules shows up.
//
//   npm run scenarios                         # every group, default regions
//   npm run scenarios -- --group party        # party make-ups only
//   npm run scenarios -- --group qualities    # every innate quality (whole party), plus best/worst loadouts
//   npm run scenarios -- --group revives      # revive rules
//   npm run scenarios -- --trips 40           # more trips per scenario (less noise)
//   npm run scenarios -- --regions ashen,blightmire
//   npm run scenarios -- --active             # fire abilities as soon as they're ready
//   npm run scenarios -- --gear uncommon      # gear rarity (default common)
//
// Every trip is unattended: the party decides every prompt on its own. Camp
// (on 20+ minute trips) revives fallen heroes at 10% HP in every scenario.
// Half the trips start at noon and half at midnight.
import { classlessMaxHp } from "../src/combat/classlessCombatEffects";
import { GEAR_SLOTS, PROVISION_KEYS } from "../src/combat/gear";
import { INNATE_KEYS, TRAITS } from "../src/combat/traits";
import { debugSetLevels } from "../src/game/debug";
import { createGuild, expeditionDurationMs, recruitHero, startExpedition, tick } from "../src/game/guild";
import { createGearItem } from "../src/game/items";
import { getRegion } from "../src/game/regions";
import { activePlayer, developHeroes } from "./simKit";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const GROUP = flag("--group") || "all";
const TRIPS = Number(flag("--trips")) || 16;
const ACTIVE = args.includes("--active");
// Gear rarity for every slot: common keeps the baseline party near the edge,
// where differences between scenarios show.
const GEAR = flag("--gear") || "common";

// The bar is set low on purpose (the lowest level allowed in, gear a tier
// below the region's), so the baseline isn't a sure win and differences show.
const SETUPS = {
  boneyard: { level: 3, tier: 1 },
  frostfang: { level: 4, tier: 2 },
  ashen: { level: 6, tier: 3 },
  blightmire: { level: 10, tier: 4 },
};
const REGIONS = (flag("--regions") || (GROUP === "qualities" ? "frostfang" : Object.keys(SETUPS).join(","))).split(",");

const MIXED = ["sword", "bow", "staff", "sword"];

// Build a guild for one scenario. `weapons` sets the party size and make-up.
function buildGuild(region, { weapons = MIXED, qualities = null, ring = null, quivers = 1 }) {
  const { level, tier } = SETUPS[region];
  let state = createGuild();
  state.gold = 1e9;
  while (state.heroes.length < weapons.length) state = recruitHero(state).state;
  state.heroes = state.heroes.slice(0, weapons.length);
  state = debugSetLevels(state, level).state;
  state = developHeroes(state);
  state.heroes.forEach((hero, index) => {
    hero.traits = qualities ? [qualities[index % qualities.length]].filter(Boolean) : [];
    hero.qualityTiers = {};
    // Keep each scenario's qualities fixed: no new ones develop mid-trip.
    hero.milestones = [10, 16];
    for (const slot of GEAR_SLOTS) {
      hero.equipment[slot] = slot === "weapon"
        ? createGearItem({ slot, variant: weapons[index], rarity: GEAR, tier })
        : createGearItem({ slot, rarity: GEAR, tier });
    }
    if (ring) hero.equipment.trinket = createGearItem({ legendary: ring, tier });
    hero.quickSlots = [
      weapons[index] === "bow" && quivers > 1 ? { key: "arrows", qty: 50 } : { key: "bandage", qty: 5 },
      weapons[index] === "bow" ? { key: "arrows", qty: 50 } : { key: "potion", qty: 3 },
    ];
    hero.combat.hp = classlessMaxHp(hero);
  });
  state.stash = { bandage: 40, potion: 12, arrows: 300 };
  for (const key of PROVISION_KEYS) state.stash[key] = 8;
  return state;
}

function playTrips(region, scenario) {
  const totals = { wins: 0, fights: 0, sneaks: 0, ambushes: 0, knockouts: 0, endHp: 0, morale: 0 };
  for (let trip = 0; trip < TRIPS; trip += 1) {
    let state = buildGuild(region, scenario);
    const ids = state.heroes.map((hero) => hero.identity.id);
    // Half the trips set out at noon, half at midnight (night means more ambushes).
    const start = new Date(2026, 0, 1, trip % 2 ? 0 : 12).getTime();
    const started = startExpedition(state, region, ids, start, Math.random, { revives: scenario.revives || 0 });
    if (!started.ok) throw new Error(`${scenario.name} could not start ${region}: ${started.reason}`);
    state = started.state;
    state.lastTickAt = start;
    state = tick(state, start + expeditionDurationMs(state, getRegion(region)) + 2 * 3_600_000, { onStep: ACTIVE ? activePlayer : null });
    const report = state.lastReport;
    if (process.env.SCENARIO_DEBUG && report.outcome !== "victory") {
      const arrows = state.heroes.map((hero) => hero.quickSlots.map((slot) => (slot ? `${slot.key}${slot.qty}` : "-")).join("/")).join(" ");
      console.log(`  ${scenario.name} [${arrows}]: ${report.log.slice(-2).join(" | ").slice(0, 160)}`);
    }
    totals.wins += report.outcome === "victory" ? 1 : 0;
    totals.fights += report.stats.fights;
    totals.sneaks += report.stats.sneaks;
    totals.ambushes += report.stats.ambushes;
    totals.knockouts += report.log.filter((line) => / down( |\.)/.test(line)).length;
    totals.morale += report.morale;
    totals.endHp += state.heroes.reduce((sum, hero) => sum + hero.combat.hp / classlessMaxHp(hero), 0) / state.heroes.length;
  }
  const per = (key) => totals[key] / TRIPS;
  return { win: per("wins"), fights: per("fights"), sneaks: per("sneaks"), ambushes: per("ambushes"), knockouts: per("knockouts"), morale: per("morale"), endHp: per("endHp") };
}

const pct = (value) => `${Math.round(value * 100)}%`.padStart(4);
const num = (value) => value.toFixed(1).padStart(5);

function runGroup(title, scenarios) {
  console.log(`\n=== ${title} (${TRIPS} trips each, ${ACTIVE ? "active" : "idle"} fights) ===`);
  for (const region of REGIONS) {
    console.log(`\n${getRegion(region).name} · LV ${SETUPS[region].level} · ${GEAR} tier-${SETUPS[region].tier} gear`);
    console.log(`${"scenario".padEnd(30)} win  vs base  fights sneaks ambush  KOs  morale endHP`);
    let base = null;
    const rows = scenarios.map((scenario) => ({ scenario, result: playTrips(region, scenario) }));
    for (const { scenario, result } of rows) {
      base ??= result;
      const delta = Math.round((result.win - base.win) * 100);
      console.log(`${scenario.name.padEnd(30)} ${pct(result.win)}  ${(scenario === rows[0].scenario ? "" : `${delta > 0 ? "+" : ""}${delta}`).padStart(6)}  ` +
        `${num(result.fights)} ${num(result.sneaks)} ${num(result.ambushes)} ${num(result.knockouts)}  ${num(result.morale)} ${pct(result.endHp)}`);
    }
  }
}

const groups = {
  party: () => runGroup("Party make-ups (no qualities)", [
    { name: "mixed: sword/bow/staff/sword", weapons: MIXED },
    { name: "all swords", weapons: ["sword", "sword", "sword", "sword"] },
    { name: "all bows", weapons: ["bow", "bow", "bow", "bow"] },
    { name: "all bows, two arrow stacks", weapons: ["bow", "bow", "bow", "bow"], quivers: 2 },
    { name: "all staves", weapons: ["staff", "staff", "staff", "staff"] },
    { name: "trio: sword/bow/staff", weapons: ["sword", "bow", "staff"] },
    { name: "duo: sword/bow", weapons: ["sword", "bow"] },
    { name: "solo sword", weapons: ["sword"] },
  ]),
  qualities: () => runGroup("Qualities (every hero has it; mixed party)", [
    { name: "no qualities", qualities: null },
    { name: "best: Tracker/Keen-Eared/Charismatic/Medic", qualities: ["tracker", "keenEared", "charismatic", "medic"] },
    { name: "worst: Frail/Loud/Reckless/Greedy", qualities: ["frail", "loud", "reckless", "greedy"] },
    ...INNATE_KEYS.map((key) => ({ name: TRAITS[key].name, qualities: [key] })),
  ]),
  revives: () => runGroup("Revives (mixed party, no qualities)", [
    { name: "current rules (camp + boss rest)" },
    { name: "Gravebinder Ring on everyone", ring: "gravebinder" },
    { name: "1 second chance (ad revive)", revives: 1 },
    { name: "2 second chances", revives: 2 },
  ]),
};

for (const [name, run] of Object.entries(groups)) if (GROUP === "all" || GROUP === name) run();
