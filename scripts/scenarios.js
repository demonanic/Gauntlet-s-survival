// Balance scenarios: the same expedition played many times with one thing
// changed, reported side by side. Where `npm run balance` plays whole
// campaigns, this holds the guild fixed (level, gear, supplies) per region so
// the difference between party make-ups, qualities and revive rules shows up.
//
//   npm run scenarios                         # every group, default regions
//   npm run scenarios -- --group party        # party make-ups only
//   npm run scenarios -- --group qualities    # every innate quality (whole party), plus best/worst loadouts
//   npm run scenarios -- --group revives      # revive rules
//   npm run scenarios -- --group companions   # familiars and weapon crystals
//   npm run scenarios -- --group luck         # stat points into luck vs attack/defense
//   npm run scenarios -- --group ecology      # enemy formations vs party make-ups (single fights)
//   npm run scenarios -- --group bosses       # each region's boss vs party make-ups (fresh party)
//   npm run scenarios -- --trips 40           # more trips per scenario (less noise)
//   npm run scenarios -- --regions ashen,blightmire
//   npm run scenarios -- --active             # fire abilities as soon as they're ready
//   npm run scenarios -- --gear uncommon      # gear rarity (default common)
//
// Every trip is unattended: the party decides every prompt on its own. Camp
// (on 20+ minute trips) revives fallen heroes at 10% HP in every scenario.
// Half the trips start at noon and half at midnight.
import { classlessMaxHp } from "../src/combat/classlessCombatEffects";
import { ARROW_STACK, GEAR_SLOTS, PROVISION_KEYS, itemSockets } from "../src/combat/gear";
import { PET_SPECIES_KEYS, PET_XP } from "../src/combat/pets";
import { INNATE_KEYS, TRAITS } from "../src/combat/traits";
import { debugSetLevels } from "../src/game/debug";
import { ECOLOGIES } from "../src/game/ecology";
import { buildBossEncounter, buildWildEncounter } from "../src/game/encounters";
import { createGuild, expeditionDurationMs, recruitHero, startExpedition, tick } from "../src/game/guild";
import { simulateEncounter } from "../src/game/simulate";
import { composeStats, createGearItem } from "../src/game/items";
import { createPet } from "../src/game/pets";
import { getRegion } from "../src/game/regions";
import { activePlayer, developHeroes } from "./simKit";

// Tuning: TUNE="boneyard:1.3:1.3,frostfang:1:1.2" npm run scenarios ... multiplies
// those regions' enemy HP and damage scales for this run only.
for (const entry of (process.env.TUNE || "").split(",").filter(Boolean)) {
  const [id, hp, dmg] = entry.split(":");
  const region = getRegion(id);
  region.hpScale *= Number(hp);
  region.dmgScale *= Number(dmg);
}
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
function buildGuild(region, { weapons = MIXED, qualities = null, ring = null, quivers = 1, pet = null, crystal = null, spOrder }) {
  const { level, tier } = SETUPS[region];
  let state = createGuild();
  state.gold = 1e9;
  while (state.heroes.length < weapons.length) state = recruitHero(state).state;
  state.heroes = state.heroes.slice(0, weapons.length);
  state = debugSetLevels(state, level).state;
  state = developHeroes(state, spOrder);
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
    if (pet) hero.pet = { ...createPet(pet, () => 0.3), level: 6, xp: PET_XP[5], quality: "quick" };
    if (crystal) {
      // Fill every weapon socket with this crystal.
      const weapon = hero.equipment.weapon;
      weapon.baseStats ||= { ...weapon.stats };
      weapon.runes = Array.from({ length: itemSockets(weapon) }, () => crystal);
      weapon.stats = composeStats(weapon);
    }
    hero.quickSlots = [
      weapons[index] === "bow" && quivers > 1 ? { key: "arrows", qty: ARROW_STACK } : { key: "bandage", qty: 5 },
      weapons[index] === "bow" ? { key: "arrows", qty: ARROW_STACK } : { key: "potion", qty: 3 },
    ];
    hero.combat.hp = classlessMaxHp(hero);
  });
  state.stash = { bandage: 40, potion: 12, arrows: 600 };
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
    // Winning means finishing the trip; pushing deeper afterwards is extra.
    totals.wins += report.outcome === "victory" || report.depth > 0 ? 1 : 0;
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

// Ecology: one fight at a time, every formation the region fields (and an
// ordinary squad of the same size range) against several party make-ups.
// Reports what a single fight costs: wins, HP left, knockouts, supplies and
// arrows used, how long it took, and how much of the damage taken landed on
// the single most-hit hero ("focus": hunters push it up).
const ECOLOGY_PARTIES = {
  mixed: MIXED, swords: ["sword", "sword", "sword", "sword"], bows: ["bow", "bow", "bow", "bow"], staves: ["staff", "staff", "staff", "staff"],
};

function fightStats(region, weapons, wave, quivers = 1) {
  const state = buildGuild(region, { weapons, quivers });
  const party = state.heroes;
  const before = party.map((hero) => hero.quickSlots.map((slot) => ({ ...slot })));
  const { result, sim, elapsed, engine } = simulateEncounter(party, wave, { regionTier: getRegion(region).tier, onStep: ACTIVE ? activePlayer : null });
  const boss = engine.active.find((enemy) => enemy.boss);
  const used = (match) => sim.heroes.reduce((sum, hero, index) => sum + hero.quickSlots.reduce((inner, slot, k) =>
    inner + (match(before[index][k]?.key) ? (before[index][k].qty || 0) - (slot?.qty || 0) : 0), 0), 0);
  const taken = sim.heroes.map((hero) => hero.battleStats?.taken || 0);
  const totalTaken = taken.reduce((a, b) => a + b, 0);
  return {
    win: result?.victory ? 1 : 0,
    endHp: sim.heroes.reduce((sum, hero) => sum + Math.max(0, hero.combat.hp) / classlessMaxHp(hero), 0) / sim.heroes.length,
    kos: sim.heroes.filter((hero) => hero.combat.hp <= 0).length,
    supplies: used((key) => key === "bandage" || key === "potion"),
    arrows: used((key) => key === "arrows"),
    seconds: elapsed,
    focus: totalTaken > 0 ? Math.max(...taken) / totalTaken : 0,
    bossLeft: boss ? Math.max(0, boss.hp) / boss.maxHp : 0,
  };
}

function runEcology() {
  const regions = flag("--regions") ? REGIONS : REGIONS.filter((region) => getRegion(region).wildlife.ecology);
  console.log(`\n=== Enemy ecology (${TRIPS} fights each, ${ACTIVE ? "active" : "idle"}, ${GEAR} gear, mid-trip depth) ===`);
  for (const region of regions) {
    const info = getRegion(region);
    const templates = Object.keys(info.wildlife.ecology?.templates || {});
    console.log(`\n${info.name} · LV ${SETUPS[region].level}`);
    console.log(`${"formation".padEnd(17)}${"party".padEnd(8)} win endHP  KOs  supply arrows  secs focus`);
    for (const formation of ["random", ...templates]) {
      for (const [partyName, weapons] of Object.entries(ECOLOGY_PARTIES)) {
        const sum = { win: 0, endHp: 0, kos: 0, supplies: 0, arrows: 0, seconds: 0, focus: 0 };
        for (let fight = 0; fight < TRIPS; fight += 1) {
          const wildlife = formation === "random"
            ? info.wildlife
            : { ...info.wildlife, ecology: { chance: 1, templates: { [formation]: 1 } } };
          const wave = buildWildEncounter({ ...info, wildlife }, 0.5, Math.random, { ecology: formation !== "random" });
          const stats = fightStats(region, weapons, wave);
          for (const key of Object.keys(sum)) sum[key] += stats[key];
        }
        const avg = (key) => sum[key] / TRIPS;
        const name = formation === "random" ? "ordinary squad" : ECOLOGIES[formation].name;
        console.log(`${name.padEnd(17)}${partyName.padEnd(8)}${pct(avg("win"))}  ${pct(avg("endHp"))} ${num(avg("kos"))} ${num(avg("supplies"))} ${num(avg("arrows"))}  ${num(avg("seconds"))} ${pct(avg("focus"))}`);
      }
    }
  }
}

// Bosses: a fresh party (full HP, full quivers) against each region's end
// boss, by party make-up ("bows x2": two arrow stacks each, no bandages).
// "boss left" is the boss's HP share when the fight ended.
function runBosses() {
  console.log(`\n=== Boss fights (${TRIPS} each, ${ACTIVE ? "active" : "idle"}, ${GEAR} gear, fresh party) ===`);
  for (const region of REGIONS) {
    const info = getRegion(region);
    if (!info.boss) continue;
    console.log(`\n${info.name} · LV ${SETUPS[region].level}`);
    console.log(`${"party".padEnd(8)} win endHP  KOs  supply arrows  secs  boss left`);
    for (const [partyName, weapons, quivers] of [...Object.entries(ECOLOGY_PARTIES), ["bows x2", ECOLOGY_PARTIES.bows, 2]]) {
      const sum = { win: 0, endHp: 0, kos: 0, supplies: 0, arrows: 0, seconds: 0, bossLeft: 0 };
      for (let fight = 0; fight < TRIPS; fight += 1) {
        const stats = fightStats(region, weapons, buildBossEncounter(info, 0), quivers);
        for (const key of Object.keys(sum)) sum[key] += stats[key];
      }
      const avg = (key) => sum[key] / TRIPS;
      console.log(`${partyName.padEnd(8)}${pct(avg("win"))}  ${pct(avg("endHp"))} ${num(avg("kos"))} ${num(avg("supplies"))} ${num(avg("arrows"))}  ${num(avg("seconds"))}  ${pct(avg("bossLeft"))}`);
    }
  }
}

const groups = {
  ecology: runEcology,
  bosses: runBosses,
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
  companions: () => runGroup("Familiars (level 6, on every hero) and weapon crystals (Flawless, every weapon socket)", [
    { name: "none" },
    ...PET_SPECIES_KEYS.map((key) => ({ name: `pet: ${key}`, pet: key })),
    ...["ember-2", "frost-2", "venom-2", "storm-2", "swift-2", "blood-2"].map((id) => ({ name: `crystal: ${id}`, crystal: id })),
  ]),
  luck: () => runGroup("Where stat points go (mixed party; level 3 has 2 SP, level 10 has 9)", [
    { name: "attack/defense (default)" },
    { name: "all into luck", spOrder: ["luck"] },
    { name: "half luck, half attack", spOrder: ["luck", "attack"] },
    { name: "all into attack", spOrder: ["attack"] },
    { name: "all into defense", spOrder: ["defense"] },
  ]),
  revives: () => runGroup("Revives (mixed party, no qualities)", [
    { name: "current rules (camp + boss rest)" },
    { name: "Gravebinder Ring on everyone", ring: "gravebinder" },
    { name: "1 second chance (ad revive)", revives: 1 },
    { name: "2 second chances", revives: 2 },
  ]),
};

for (const [name, run] of Object.entries(groups)) if (GROUP === "all" || GROUP === name) run();
