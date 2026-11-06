// Hero moves and spells fingerprint (Phase 8C): seeded fights in which every
// special move gets fired and every spell school gets cast (on auto, by hand,
// through the queue, with a marked target), played frame by frame with what
// the heroes, enemies, shots, familiars and meteors do hashed. Recorded in CI
// on the code before moves and spells moved out of engine.js; moving them
// must not change a single value.
import { createHash } from "node:crypto";
import { Engine } from "./engine";
import { classlessMaxHp } from "./classlessCombatEffects";
import { CANONICAL_NODES } from "./classlessProgression";
import { RANK_CASTS, SPELLS } from "./spells";
import { createGuild, recruitHero } from "../game/guild";
import { debugSetLevels } from "../game/debug";
import { buildBossEncounter, buildWildEncounter, createEncounterSim } from "../game/encounters";
import { createGearItem } from "../game/items";
import { createPet } from "../game/pets";
import { getRegion } from "../game/regions";
import { seededRandom } from "../game/random";

const SLOTS = ["weapon", "head", "chest", "legs", "arms"];
const branchNodes = (branch) => CANONICAL_NODES.filter((node) => node.branch === branch).map((node) => node.id);
// The first spell of a school, cast enough to make the school proficiency V.
const firstSpell = (school) => Object.keys(SPELLS).find((id) => SPELLS[id].element === school && SPELLS[id].unlock === 1);

// heroes: [{ weapon, nodes, schools }]
function party(heroes, level = 20) {
  let state = createGuild();
  state.gold = 1e9;
  while (state.heroes.length < heroes.length) state = recruitHero(state).state;
  state = debugSetLevels(state, level).state;
  return state.heroes.slice(0, heroes.length).map((hero, i) => {
    const spec = heroes[i];
    hero.traits = [];
    for (const slot of SLOTS) {
      hero.equipment[slot] = createGearItem(slot === "weapon"
        ? { slot, variant: spec.weapon, rarity: "rare", tier: 4 } : { slot, rarity: "uncommon", tier: 4 }, seededRandom(40 + i));
    }
    hero.progression.ownedNodeIds = spec.nodes || [];
    if (spec.schools) {
      hero.combat.stats.intelligence = 24;
      hero.magic = { elements: spec.schools, casts: Object.fromEntries(spec.schools.map((school) => [firstSpell(school), RANK_CASTS[4]])) };
    }
    if (spec.pet) hero.pet = createPet(spec.pet, seededRandom(50 + i));
    // Bows shoot arrows; give every hero a full quiver as a player would.
    if (spec.weapon === "bow") hero.quickSlots = [{ key: "arrows", qty: 200 }, null];
    hero.combat.hp = classlessMaxHp(hero);
    return hero;
  });
}

const round = (value) => Math.round(value * 1000) / 1000;
// Every number, string and flag an object holds; references as a type or index.
function flat(object) {
  const out = {};
  for (const key of Object.keys(object).sort()) {
    if (key === "id" || key === "master") continue;
    const value = object[key];
    if (typeof value === "number") out[key] = round(value);
    else if (typeof value === "string" || typeof value === "boolean" || value == null) out[key] = value;
    else if (Array.isArray(value)) out[key] = value.length;
    else if (value && typeof value === "object" && "i" in value) out[key] = `@hero${value.i}`;
    else if (value && typeof value === "object" && "type" in value) out[key] = `@${value.type}`;
  }
  return out;
}
const cooldowns = (map) => Object.keys(map || {}).sort().map((key) => [key, round(map[key])]);

// `script(engine, frame)`: what the player does each frame (moves, taps).
function fight({ heroes, regionId, boss = false, seed, frames = 900, level, script, auto = true, straightToBoss = false }) {
  const rng = seededRandom(seed);
  const region = getRegion(regionId);
  const wave = boss ? buildBossEncounter(region, 0, rng) : buildWildEncounter(region, 0.5, rng);
  if (straightToBoss) wave.vanguard = [];
  const sim = createEncounterSim(party(heroes, level), region.tier, wave, { rng });
  const engine = new Engine({ getContext: () => null }, sim, structuredClone(wave), { onEnd: () => {} });
  if (!auto) engine.heroes.forEach((h) => { h.manual = true; h.ref.manual = true; });
  const lines = [];
  for (let frame = 0; frame < frames && !engine.ended; frame += 1) {
    script?.(engine, frame);
    engine.update(1 / 30);
    if (frame % 6 !== 0) continue;
    lines.push(JSON.stringify({
      t: round(engine.time),
      heroes: engine.heroes.map((h) => ({ ...flat(h), hp: round(h.ref.hp), shield: round(h.ref.shield || 0),
        abilities: cooldowns(h.abilityCooldowns), spells: cooldowns(h.spellCooldowns), queue: h.spellQueue?.join(",") })),
      enemies: engine.active.map(flat),
      shots: engine.projectiles.map((p) => [p.kind, round(p.x), round(p.y), round(p.dmg || 0)]),
      pets: engine.pets.map(flat),
      meteors: engine.meteors.length,
      floats: engine.floaters.map((f) => f.text).join("|"),
      casts: JSON.stringify(engine.spellSuccesses), killed: engine.killed,
    }));
  }
  if (process.env.PRINT_GOLDEN) {
    globalThis.SEEN ||= { moves: new Set(), spells: new Set() };
    for (const h of engine.heroes) for (const id of Object.keys(h.model.battleStats?.moveUses || {})) globalThis.SEEN.moves.add(id);
    for (const per of Object.values(engine.spellSuccesses || {})) for (const id of Object.keys(per)) globalThis.SEEN.spells.add(id);
  }
  return { hash: createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16), frames: lines.length };
}

// The player fires every move the moment it's ready.
const fireMoves = (engine, frame) => {
  for (const h of engine.heroes) for (const ability of engine.getHeroAbilityStatus(h.i)) if (ability.available) engine.useHeroAbility(h.i, ability.id);
};
// The player taps spells (queue), holds one now and then, and marks targets.
const tapSpells = (engine, frame) => {
  for (const h of engine.heroes) {
    const spells = engine.getHeroSpellStatus(h.i).filter((spell) => spell.available);
    if (!spells.length) continue;
    const pick = spells[(Math.floor(frame / 20) + h.i) % spells.length];
    if (frame % 20 === 0) engine.queueHeroSpell(h.i, pick.id);
    if (frame % 97 === 0) engine.castHeroSpell(h.i, pick.id, null, { announce: true });
    if (frame % 61 === 0 && !engine.active.some((enemy) => enemy.boss)) engine.markHeroTarget(h.i, engine.active[(frame + h.i) % Math.max(1, engine.active.length)] || null);
  }
};

// The staff hero gets Arcane Spark (mana) so Mana Surge can fire.
// The same, aiming every spell at the boss.
const tapSpellsAtBoss = (engine, frame) => {
  const boss = engine.active.find((enemy) => enemy.boss && enemy.hp > 0);
  if (boss) for (const h of engine.heroes) if (engine.heroSpellTarget(h.i) !== boss) engine.markHeroTarget(h.i, boss);
  tapSpells(engine, frame + 1);
};

const melee = (nodes) => [{ weapon: "sword", nodes }, { weapon: "bow", nodes }, { weapon: "staff", nodes: [...nodes, "A1"] }, { weapon: "sword", nodes }];
const casters = (a, b) => [{ weapon: "sword" }, { weapon: "bow" },
  { weapon: "staff", nodes: ["A1", "A2", "A2a", "A3", "A3a"], schools: a }, { weapon: "staff", nodes: ["A1", "A2", "A2a", "A3", "A3a"], schools: b }];

const CASES = {
  "starter moves": () => fight({ heroes: melee([]), regionId: "frostfang", seed: 301, level: 6, script: fireMoves }),
  ...Object.fromEntries(["Vanguard", "Warden", "Precision", "Shadowcraft", "Tactics", "Conjuration", "Hemomancy", "Fortune", "Wilds", "Illusion"]
    .map((branch, i) => [`${branch} moves`, () => fight({ heroes: melee(branchNodes(branch)), regionId: branch === "Vanguard" ? "boneyard" : "ashen", boss: i % 2 === 1, seed: 310 + i, level: 20, script: fireMoves })])),
  "fire and ice": () => fight({ heroes: casters(["fire"], ["ice"]), regionId: "ashen", seed: 330 }),
  "poison and lightning": () => fight({ heroes: casters(["poison"], ["electric"]), regionId: "blightmire", seed: 331 }),
  "mind and shadow": () => fight({ heroes: casters(["mind"], ["shadow"]), regionId: "ashen", seed: 332 }),
  "restoration and warding": () => fight({ heroes: casters(["restoration"], ["warding"]), regionId: "ashen", boss: true, seed: 333 }),
  "wild and arcane": () => fight({ heroes: casters(["wild"], []), regionId: "frostfang", boss: true, seed: 334 }),
  "spells by hand": () => fight({ heroes: casters(["fire", "mind"], ["shadow", "restoration"]), regionId: "ashen", seed: 335, frames: 1800, auto: false, script: tapSpells }),
  "spells by hand on a boss": () => fight({ heroes: casters(["mind", "warding"], ["shadow", "wild"]), regionId: "ashen", boss: true, straightToBoss: true, seed: 337, frames: 1200, auto: false, script: tapSpellsAtBoss }),
  "spells by hand on auto": () => fight({ heroes: casters(["electric", "shadow"], ["mind", "ice"]), regionId: "blightmire", seed: 336, frames: 1800, script: tapSpells }),
  // Spells part 4: Spectral Blades, a Fire elemental and Mirror Self.
  "conjuration and mirror self": () => fight({ heroes: casters(["fire", "conjuration"], ["shadow", "restoration"]), regionId: "ashen", seed: 338, frames: 1800, script: tapSpells }),
};

// Recorded in CI on the code before the move (Phase 8C).
const GOLDEN = {
  "Conjuration moves": "9bcd1243371713c1",
  "Fortune moves": "d0d2b6de550a8ab9",
  "Hemomancy moves": "a795243dc0a67cd5",
  "Illusion moves": "7a81460edf92abbd",
  "Precision moves": "77254c0b59c68169",
  "Shadowcraft moves": "2614bfad1fe7d484",
  "Tactics moves": "dfbd8bd02853ec79",
  "Vanguard moves": "7646cae69d71990a",
  "Warden moves": "ad1eca7430423f77",
  "Wilds moves": "ad8297df7a117522",
  "conjuration and mirror self": "02855749377a065e",
  "fire and ice": "3e974a840e84e03d",
  "mind and shadow": "90d9c7aebf4291f8",
  "poison and lightning": "0d23c7231de48cc3",
  "restoration and warding": "6441e7b6bfb0f617",
  "spells by hand": "5d8ee0ecb17c73ab",
  "spells by hand on a boss": "a025eb670a60c02f",
  "spells by hand on auto": "e51c2922a1dd6c92",
  "starter moves": "c4db6cdfaae10260",
  "wild and arcane": "e0ad4da28ed4e03b",
};

describe("hero moves and spells (characterization)", () => {
  afterAll(() => { if (process.env.PRINT_GOLDEN && globalThis.SEEN) console.log("SEEN", JSON.stringify({ moves: [...globalThis.SEEN.moves].sort(), spells: [...globalThis.SEEN.spells].sort() })); });
  let random;
  beforeEach(() => { random = vi.spyOn(Math, "random").mockImplementation(seededRandom(88)); });
  afterEach(() => random.mockRestore());

  for (const [name, run] of Object.entries(CASES)) {
    test(`${name}: the same fight`, () => {
      const { hash, frames } = run();
      expect(frames).toBeGreaterThan(10);
      if (process.env.PRINT_GOLDEN) console.log(`FRAMES ${name} ${frames}`);
      if (process.env.PRINT_GOLDEN || !GOLDEN[name]) console.log(`GOLDEN ${name} ${hash}`);
      expect(hash).toBe(GOLDEN[name]);
    });
  }
});
