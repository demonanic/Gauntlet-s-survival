// Drawing fingerprint (Phase 8A): seeded fights are played frame by frame on a
// fake canvas that records every drawing call, and the whole record is hashed.
// Recorded on the code before the renderer moved out of engine.js; moving the
// drawing must not change a single call. Also checks that drawing a frame
// leaves the fight itself untouched.
import { createHash } from "node:crypto";
import { Engine } from "./engine";
import { HERO_BASELINE } from "./heroModel";
import { classlessMaxHp } from "./classlessCombatEffects";
import { createGuild, recruitHero } from "../game/guild";
import { debugSetLevels } from "../game/debug";
import { buildBossEncounter, buildWildEncounter, createEncounterSim } from "../game/encounters";
import { createGearItem } from "../game/items";
import { createPet } from "../game/pets";
import { getRegion } from "../game/regions";
import { seededRandom } from "../game/random";

const round = (value) => (typeof value === "number" ? Math.round(value * 1000) / 1000 : value);
const show = (value) => {
  if (typeof value === "number") return String(round(value));
  if (value && typeof value === "object") return value.__id || (value.src ? `img:${value.src}` : "{}");
  return String(value);
};

// A 2D context that writes every call and property set into `log`.
function recordingContext(log) {
  let gradients = 0;
  const store = { globalAlpha: 1, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, font: "10px sans-serif" };
  const gradient = () => {
    const id = `grad${gradients += 1}`;
    return { __id: id, addColorStop: (...args) => log.push(`${id}.stop(${args.map(show).join(",")})`) };
  };
  return new Proxy(store, {
    get(target, key) {
      if (key === "createLinearGradient" || key === "createRadialGradient" || key === "createPattern") {
        return (...args) => { const made = gradient(); log.push(`${made.__id}=${String(key)}(${args.map(show).join(",")})`); return made; };
      }
      if (key === "measureText") return (text) => { log.push(`measureText(${text})`); return { width: String(text).length * 6 }; };
      if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (key in target) return target[key];
      return (...args) => { log.push(`${String(key)}(${args.map(show).join(",")})`); };
    },
    set(target, key, value) {
      target[key] = value;
      log.push(`${String(key)}=${show(value)}`);
      return true;
    },
  });
}

class FakeImage {
  constructor() {
    this.complete = true;
    this.naturalWidth = 64; this.naturalHeight = 64; this.width = 64; this.height = 64;
  }
}

const SLOTS = ["weapon", "head", "chest", "legs", "arms"];
function party(level, tier) {
  let state = createGuild();
  state.gold = 1e9;
  while (state.heroes.length < 4) state = recruitHero(state).state;
  state = debugSetLevels(state, level).state;
  const weapons = ["sword", "bow", "staff", "sword"];
  state.heroes.forEach((hero, i) => {
    hero.traits = [];
    for (const slot of SLOTS) {
      hero.equipment[slot] = createGearItem(slot === "weapon"
        ? { slot, variant: weapons[i], rarity: "rare", tier } : { slot, rarity: "uncommon", tier }, seededRandom(10 + i));
    }
    hero.combat.hp = classlessMaxHp(hero);
  });
  const caster = state.heroes[2];
  caster.progression.ownedNodeIds = ["A1", "A2"];
  caster.combat.stats.intelligence = 20;
  caster.magic = { elements: ["arcane", "fire", "restoration", "wild"], casts: { arcane_bolt: 120, fireball: 60, mend: 40, summon_beast: 30 } };
  state.heroes[0].pet = createPet("wolf", seededRandom(3));
  state.heroes[1].pet = createPet("hawk", seededRandom(4));
  return state.heroes;
}

// Plays `frames` frames the way the Battle screen's loop does and returns the
// hash of every drawing call, plus how many calls there were.
function fingerprint({ regionId, boss, level, tier, seed, frames = 900, drawEvery = 3 }) {
  const log = [];
  const ctx = recordingContext(log);
  const rng = seededRandom(seed);
  const region = getRegion(regionId);
  const wave = boss ? buildBossEncounter(region, 0, rng) : buildWildEncounter(region, 0.5, rng);
  const sim = createEncounterSim(party(level, tier), region.tier, wave, { rng });
  const engine = new Engine({ getContext: () => ctx }, sim, structuredClone(wave), { onEnd: () => {} });
  const dt = 1 / 30;
  for (let frame = 0; frame < frames && !engine.ended; frame += 1) {
    // A move and an announced spell, so callouts and hit-stop are drawn too.
    if (frame === 3) engine.castHeroSpell(2, "ember_bolt", engine.active[0], { announce: true });
    if (frame >= 40 && frame < 300 && frame % 10 === 0) {
      const target = engine.active.find((enemy) => engine._isValidClasslessTarget(engine.heroes[0], enemy));
      if (target) engine.useHeroAbility(0, HERO_BASELINE.sharedStrike.id, target);
    }
    engine._tickCallouts(dt);
    engine.vfx?.noteFrame(dt);
    if (engine.hitStop > 0) engine.hitStop = Math.max(0, engine.hitStop - dt);
    else {
      engine.vfx?.update(dt);
      engine.update(dt);
    }
    if (frame % drawEvery === 0) {
      log.push(`--frame ${frame}`);
      engine.render();
    }
  }
  if (process.env.DRAW_STATS) {
    const count = (re) => log.filter((line) => re.test(line)).length;
    console.log("DRAW", regionId, "frames", engine.time.toFixed(1), "ended", engine.ended, "calls", log.length,
      "drawImage", count(/^drawImage/), "gradients", count(/Gradient\(/), "fillText", count(/^fillText/),
      "callouts", count(/fillText\([A-Z ]+!/), "casts", JSON.stringify(engine.spellSuccesses || {}));
  }
  return { hash: createHash("sha256").update(log.join("\n")).digest("hex").slice(0, 16), calls: log.length };
}

const CASES = {
  "boneyard boss": { regionId: "boneyard", boss: true, level: 5, tier: 2, seed: 11 },
  "frostfang wild": { regionId: "frostfang", boss: false, level: 7, tier: 3, seed: 12 },
  "ashen boss": { regionId: "ashen", boss: true, level: 9, tier: 4, seed: 13 },
  "blightmire wild": { regionId: "blightmire", boss: false, level: 12, tier: 5, seed: 14 },
  "gutter wild": { regionId: "gutter", boss: false, level: 2, tier: 1, seed: 15 },
};

// Recorded in CI on the code before the renderer moved (Phase 8A).
const GOLDEN = {
  "boneyard boss": "18c9431b2e63c871",
  "frostfang wild": "b892f7305313e654",
  "ashen boss": "f25cb7715cab0855",
  "blightmire wild": "d1d84e8e00bfad61",
  "gutter wild": "0e53c7313d1898ec",
};

describe("drawing (characterization)", () => {
  let random;
  beforeEach(() => {
    globalThis.Image = FakeImage;
    random = jest.spyOn(Math, "random").mockImplementation(seededRandom(99));
  });
  afterEach(() => {
    random.mockRestore();
    delete globalThis.Image;
  });

  for (const [name, setup] of Object.entries(CASES)) {
    test(`${name}: the same drawing calls`, () => {
      const { hash, calls } = fingerprint(setup);
      expect(calls).toBeGreaterThan(5000);
      expect(`${hash}`).toBe(GOLDEN[name]);
    });
  }

  test("drawing a frame changes nothing in the fight", () => {
    const rng = seededRandom(21);
    const region = getRegion("boneyard");
    const wave = buildBossEncounter(region, 0, rng);
    const sim = createEncounterSim(party(5, 2), region.tier, wave, { rng });
    const engine = new Engine({ getContext: () => recordingContext([]) }, sim, structuredClone(wave), { onEnd: () => {} });
    for (let frame = 0; frame < 120; frame += 1) engine.update(1 / 30);
    // Everything the fight holds, as text (shared objects written once).
    const snapshot = () => {
      const seen = new WeakSet();
      return JSON.stringify({
        heroes: engine.heroes, active: engine.active, projectiles: engine.projectiles, pets: engine.pets,
        time: engine.time, callouts: engine.callouts, gold: sim.gold,
      }, (key, value) => {
        if (typeof value === "function") return undefined;
        if (value && typeof value === "object") {
          if (seen.has(value)) return "[seen]";
          seen.add(value);
        }
        return value;
      });
    };
    const before = snapshot();
    for (let i = 0; i < 5; i += 1) engine.render();
    expect(snapshot()).toBe(before);
  });
});
