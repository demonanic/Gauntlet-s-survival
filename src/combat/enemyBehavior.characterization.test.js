// Enemy behavior fingerprint (Phase 8B): for every enemy type, a seeded fight
// against a fixed party is played frame by frame, and what the enemies, heroes,
// shots and familiars do is hashed. Recorded in CI on the code before enemy
// behavior moved out of engine.js; moving it must not change a single value.
import { createHash } from "node:crypto";
import * as C from "./config";
import { Engine } from "./engine";
import { classlessMaxHp } from "./classlessCombatEffects";
import { createGuild, recruitHero } from "../game/guild";
import { debugSetLevels } from "../game/debug";
import { buildBossEncounter, buildWildEncounter, createEncounterSim } from "../game/encounters";
import { createGearItem } from "../game/items";
import { createPet } from "../game/pets";
import { getRegion } from "../game/regions";
import { seededRandom } from "../game/random";

const SLOTS = ["weapon", "head", "chest", "legs", "arms"];
function party(level = 6, tier = 3, pet = "wolf") {
  let state = createGuild();
  state.gold = 1e9;
  while (state.heroes.length < 4) state = recruitHero(state).state;
  state = debugSetLevels(state, level).state;
  const weapons = ["sword", "bow", "staff", "sword"];
  state.heroes.forEach((hero, i) => {
    hero.traits = [];
    for (const slot of SLOTS) {
      hero.equipment[slot] = createGearItem(slot === "weapon"
        ? { slot, variant: weapons[i], rarity: "rare", tier } : { slot, rarity: "uncommon", tier }, seededRandom(30 + i));
    }
    hero.combat.hp = classlessMaxHp(hero);
  });
  state.heroes[0].pet = createPet(pet, seededRandom(5));
  return state.heroes;
}

const round = (value) => Math.round(value * 1000) / 1000;
// Every number, string and flag an enemy holds (a hero is written as its
// index, another foe as its type; enemy ids come from a global counter, so
// they are left out to keep each case independent of the ones before it).
function flat(object) {
  const out = {};
  for (const key of Object.keys(object).sort()) {
    // A summoned minion's `master` (added after recording) shows up in its
    // master's health instead.
    if (key === "id" || key === "master") continue;
    const value = object[key];
    if (typeof value === "number") out[key] = round(value);
    else if (typeof value === "string" || typeof value === "boolean" || value == null) out[key] = value;
    else if (value && typeof value === "object" && "i" in value) out[key] = `@hero${value.i}`;
    else if (value && typeof value === "object" && "type" in value) out[key] = `@${value.type}`;
    else if (Array.isArray(value)) out[key] = value.length;
  }
  return out;
}

// One enemy type on its own (three of it, or one boss started at 37% health,
// so a boss's low-health power (the Abomination's enrage) shows up too).
function typeFight(type, seed, champion = null) {
  const rng = seededRandom(seed);
  const region = getRegion("frostfang");
  const wave = buildWildEncounter(region, 0.5, rng, { waves: 1 });
  const sim = createEncounterSim(party(), region.tier, wave, { rng });
  const count = C.ENEMIES[type].boss ? 1 : 3;
  wave.enemies = Array.from({ length: count }, () => sim.makeMinion(type));
  for (const enemy of wave.enemies) if (enemy.boss) { enemy.hp = Math.round(enemy.maxHp * 0.37); if (champion) enemy.champion = champion; }
  return { engine: new Engine({ getContext: () => null }, sim, wave, { onEnd: () => {} }), sim, frames: 600 };
}

// A real squad or boss fight from a region (mixed roles, vanguards, champions).
// `bossHp`: start the boss at this share of its health (to reach a champion's
// half-health power within the fight). `straightToBoss`: no vanguard squad first.
function regionFight({ regionId, boss, rank = 0, level, tier, seed, frames = 900, bossHp = 1, straightToBoss = false, pet }) {
  const rng = seededRandom(seed);
  const region = getRegion(regionId);
  const wave = boss ? buildBossEncounter(region, rank, rng) : buildWildEncounter(region, 0.5, rng);
  const sim = createEncounterSim(party(level, tier, pet), region.tier, wave, { rng });
  for (const enemy of wave.enemies) if (enemy.boss) enemy.hp = Math.round(enemy.maxHp * bossHp);
  if (straightToBoss) wave.vanguard = [];
  return { engine: new Engine({ getContext: () => null }, sim, structuredClone(wave), { onEnd: () => {} }), sim, frames };
}

function fingerprint({ engine, frames: total }) {
  const lines = [];
  for (let frame = 0; frame < total && !engine.ended; frame += 1) {
    engine.update(1 / 30);
    if (frame % 6 !== 0) continue;
    lines.push(JSON.stringify({
      t: round(engine.time),
      enemies: engine.active.map(flat),
      heroes: engine.heroes.map((h) => [round(h.x), round(h.y), round(h.ref.hp), round(h.ref.shield || 0), h.alive, round(h.exposedUntil || 0)]),
      shots: engine.projectiles.map((p) => [p.kind, round(p.x), round(p.y), round(p.dmg || 0)]),
      pets: engine.pets.map((pet) => [round(pet.x), round(pet.y), round(pet.hp), !!pet.down]),
      killed: engine.killed, fallen: engine.fallen.length,
    }));
  }
  return { hash: createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16), frames: lines.length };
}

const CASES = {
  ...Object.fromEntries(Object.keys(C.ENEMIES).map((type, i) => [type, () => typeFight(type, 100 + i)])),
  "gutter squad": () => regionFight({ regionId: "gutter", level: 2, tier: 1, seed: 201 }),
  "boneyard squad": () => regionFight({ regionId: "boneyard", level: 4, tier: 2, seed: 202 }),
  "frostfang squad": () => regionFight({ regionId: "frostfang", level: 6, tier: 3, seed: 203 }),
  "ashen squad": () => regionFight({ regionId: "ashen", level: 8, tier: 4, seed: 204 }),
  "blightmire squad": () => regionFight({ regionId: "blightmire", level: 10, tier: 5, seed: 205 }),
  "blightmire squad 2": () => regionFight({ regionId: "blightmire", level: 10, tier: 5, seed: 206 }),
  // A Stonebark Tortoise taunts foes into chasing it.
  "ashen squad, tortoise": () => regionFight({ regionId: "ashen", level: 8, tier: 4, seed: 207, pet: "tortoise" }),
  "boneyard boss": () => regionFight({ regionId: "boneyard", boss: true, level: 5, tier: 2, seed: 211 }),
  "frostfang boss": () => regionFight({ regionId: "frostfang", boss: true, level: 7, tier: 3, seed: 212 }),
  "ashen boss": () => regionFight({ regionId: "ashen", boss: true, level: 9, tier: 4, seed: 213 }),
  "blightmire boss": () => regionFight({ regionId: "blightmire", boss: true, level: 12, tier: 5, seed: 214 }),
  "ashen warded champion": () => regionFight({ regionId: "ashen", boss: true, rank: 4, level: 25, tier: 6, seed: 215, frames: 2400, straightToBoss: true }),
  "ashen swarming champion": () => regionFight({ regionId: "ashen", boss: true, rank: 9, level: 14, tier: 5, seed: 216, straightToBoss: true }),
  "ashen frenzied champion": () => regionFight({ regionId: "ashen", boss: true, rank: 14, level: 16, tier: 5, seed: 217, frames: 1500, bossHp: 0.52, straightToBoss: true }),
  "ashen vampiric champion": () => regionFight({ regionId: "ashen", boss: true, rank: 19, level: 18, tier: 5, seed: 218, bossHp: 0.6, straightToBoss: true }),
  // Rank 19's Vampiric boss (the Necromancer) never hits anyone itself; these do.
  "vampiric demon": () => typeFight("demon", 220, "vampiric"),
  "vampiric abomination": () => typeFight("nuclearBehemoth", 221, "vampiric"),
};

// Recorded in CI on the code before the move (Phase 8B).
const GOLDEN = {
  "ashen boss": "c42dac93851861b9",
  "ashen frenzied champion": "287dab1ab56c05d5",
  "ashen squad": "0aa7b6dc733d2bef",
  "ashen squad, tortoise": "204ba1ad44962880",
  "ashen swarming champion": "f2db11aed8258fc6",
  "ashen vampiric champion": "9e2b46dc7bdca51a",
  "ashen warded champion": "02bee9cfbc868bfa",
  "bandit": "8bffbe62b76bef73",
  "banditWarlord": "d69def74831fba1c",
  "blightmire boss": "161a2457b61ee0e2",
  "blightmire squad 2": "b7e38c69f5aac772",
  "blightmire squad": "f9dc79ffa02fc64f",
  "bogLich": "7bd6735bd143c413",
  "boneyard boss": "ebae13e40f040fee",
  "boneyard squad": "1ccf0060972204f7",
  "bulwark": "86e00f88d3d8da16",
  "carrionPriest": "36dbf602d205819d",
  "darkElf": "0b0c08e58968d005",
  "demon": "d8a61c70ab1888e1",
  "frostfang boss": "802bfa033eb58f31",
  "frostfang squad": "67064d369c62f62f",
  "ghost": "a45d361357f7795f",
  "gnome": "dccbce7d13cf40c5",
  "goblin": "2018cdfd9de532af",
  "gutter squad": "9a1920e3da85974b",
  "harrier": "197437a46c75c159",
  "imperialNecromancer": "4d00d458b878c70d",
  "lesserNecromancer": "44e39254ee159110",
  "lieutenant": "1675e6bed7060a6b",
  "nuclearBehemoth": "ca14216bc16618fb",
  "orc": "7dd92ef6c8a4cb37",
  "reaper": "32d964d92f9ab9e6",
  "skeleton": "b3588ecafb429a95",
  "slime": "0c9e1d4a8e192276",
  "stalker": "c0fb8c83f6c11921",
  "vampiric abomination": "424e1c3834897972",
  "vampiric demon": "e624205d3ca8064b",
  "warlock": "20960c3a2099c87f",
  "watcher": "b2e0e7aa3aca15bb",
  "zombie": "4502166d3297ece1",
};

describe("enemy behavior (characterization)", () => {
  let random;
  beforeEach(() => { random = vi.spyOn(Math, "random").mockImplementation(seededRandom(77)); });
  afterEach(() => random.mockRestore());

  for (const [name, setup] of Object.entries(CASES)) {
    test(`${name}: the same behavior`, () => {
      const { hash, frames } = fingerprint(setup());
      expect(frames).toBeGreaterThan(10);
      if (process.env.PRINT_GOLDEN) console.log(`FRAMES ${name} ${frames}`);
      if (process.env.PRINT_GOLDEN || !GOLDEN[name]) console.log(`GOLDEN ${name} ${hash}`);
      expect(hash).toBe(GOLDEN[name]);
    });
  }
});
