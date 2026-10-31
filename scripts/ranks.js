// Endgame boss ranks: how a maxed-out guild (four level-20 heroes in Epic gear
// of the tier each rank drops) fares against the Ashen Keep boss, rank by rank.
// Fresh party each fight, after the usual pre-boss breather (full HP).
//   npm run ranks -- --ranks 0,5,10,15,20,25,30 --fights 8 [--active] [--rarity epic]
import { classlessMaxHp } from "../src/combat/classlessCombatEffects";
import { GEAR_SLOTS } from "../src/combat/gear";
import { debugSetLevels } from "../src/game/debug";
import { buildBossEncounter } from "../src/game/encounters";
import { createGuild, currentEncounterParty, recruitHero } from "../src/game/guild";
import { createGearItem } from "../src/game/items";
import { championFor, getRegion } from "../src/game/regions";
import { simulateEncounter } from "../src/game/simulate";
import { activePlayer, applySeedFlag, developHeroes } from "./simKit";

const args = process.argv.slice(2);
applySeedFlag(args);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const RANKS = (flag("--ranks") || "0,5,10,15,20,25,30").split(",").map(Number);
const FIGHTS = Number(flag("--fights")) || 8;
const RARITY = flag("--rarity") || "epic";
const ACTIVE = args.includes("--active");
const WEAPONS = ["sword", "bow", "staff", "sword"];
const region = getRegion("ashen");

function maxedParty(rank) {
  let state = createGuild();
  state.gold = 1e9;
  while (state.heroes.length < 4) state = recruitHero(state).state;
  state.heroes = state.heroes.slice(0, 4);
  state = debugSetLevels(state, 20).state;
  state = developHeroes(state);
  const tier = region.tier + Math.floor(rank / 2);
  state.heroes.forEach((hero, index) => {
    hero.traits = [];
    for (const slot of GEAR_SLOTS) {
      hero.equipment[slot] = slot === "weapon"
        ? createGearItem({ slot, variant: WEAPONS[index], rarity: RARITY, tier })
        : createGearItem({ slot, rarity: RARITY, tier });
    }
    hero.quickSlots = [{ key: index === 1 ? "arrows" : "bandage", qty: index === 1 ? 100 : 5 }, index === 1 ? { key: "arrows", qty: 100 } : { key: "potion", qty: 3 }];
    hero.combat.hp = classlessMaxHp(hero);
  });
  state.expedition = { regionId: "ashen", heroIds: state.heroes.map((hero) => hero.identity.id), morale: 50, packed: [] };
  return currentEncounterParty(state);
}

console.log(`=== Ashen Keep boss ranks · ${FIGHTS} fights each · LV 20 · ${RARITY} gear · ${ACTIVE ? "active" : "idle"} ===`);
console.log("rank  champion   win   endHP  secs  boss left");
for (const rank of RANKS) {
  let wins = 0, hp = 0, secs = 0, left = 0;
  for (let fight = 0; fight < FIGHTS; fight += 1) {
    const party = maxedParty(rank);
    const wave = buildBossEncounter(region, rank);
    const { result, sim, engine, elapsed } = simulateEncounter(party, wave, { regionTier: wave.lootTier ?? region.tier, onStep: ACTIVE ? activePlayer : null });
    if (result?.victory) wins += 1;
    hp += sim.heroes.reduce((sum, hero) => sum + Math.max(0, hero.combat.hp) / classlessMaxHp(hero), 0) / sim.heroes.length;
    secs += elapsed;
    const boss = engine.active.find((enemy) => enemy.boss) || engine.spawnQueue.find((enemy) => enemy.boss);
    left += boss ? boss.hp / boss.maxHp : 0;
  }
  const pct = (value) => `${Math.round((100 * value) / FIGHTS)}%`.padStart(4);
  console.log(`${String(rank + 1).padStart(4)}  ${(championFor(rank) || "-").padEnd(9)} ${pct(wins)}  ${pct(hp)}  ${String(Math.round(secs / FIGHTS)).padStart(4)}  ${pct(left)}`);
}
