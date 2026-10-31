// Watched fights (screens/Battle.jsx) and unattended fights (expedition.js
// autoFight) both hand an engine result to applyFightResult. These tests pin
// down that both paths give it the same fight result, and that equal engine
// results lead to the same expedition state either way.
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { withPendingFight } from "../test/expeditionFixtures";
import { buildBossEncounter } from "./encounters";
import { buildFightOutcome } from "./fightOutcome";
import { createGuild, currentEncounterParty, resolveEncounter, startExpedition, tick } from "./guild";
import { debugSetLevels } from "./debug";
import { getRegion } from "./regions";
import { simulateEncounter } from "./simulate";

// The unattended path calls simulateEncounter; the tests hand it a recorded
// real fight so that both paths start from the same engine result.
vi.mock("./simulate", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, simulateEncounter: vi.fn(actual.simulateEncounter) };
});
const { simulateEncounter: realSimulate } = await vi.importActual("./simulate");

const T0 = 1_000_000;

// The mappings as they were written before Phase 3, copied verbatim, so the
// tests show what each path produced.
function legacyWatchedOutcome(result, sim) {
  // Battle.jsx: onEnd stored { ...outcome, gold: sim.gold, items: [...sim.vault] }, then finish().
  const stored = { ...result, gold: sim.gold, items: [...sim.vault] };
  return {
    victory: !!stored.victory,
    party: sim.heroes,
    xpGains: stored.xpGains?.heroes || {},
    gold: stored.gold,
    items: stored.items,
    wavesCleared: stored.wavesCleared || 0,
    downed: stored.downed || {},
    nemesisSlain: stored.nemesisSlain || null,
    nemesisFled: stored.nemesisFled || null,
    clutches: stored.clutches || [],
    spellCasts: stored.spellCasts || {},
  };
}
// Battle.jsx onError stored this, and finish() then mapped it like any result.
function legacyWatchedErrorOutcome(sim) {
  const stored = { victory: false, reason: "error", error: "boom", gold: 0, items: [] };
  // finish() read gold and items from the stored result: 0 and [].
  return legacyWatchedOutcome(stored, { ...sim, gold: stored.gold, vault: stored.items });
}
function legacyAutoOutcome(result, sim) {
  return {
    victory: !!result?.victory, party: sim.heroes, xpGains: result?.xpGains?.heroes || {},
    gold: sim.gold, items: sim.vault, wavesCleared: result?.wavesCleared || 0,
    downed: result?.downed || {}, nemesisSlain: result?.nemesisSlain || null, nemesisFled: result?.nemesisFled || null,
    clutches: result?.clutches || [], spellCasts: result?.spellCasts || {},
  };
}

function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function freshGuild(level = 1) {
  let state = createGuild();
  if (level > 1) state = debugSetLevels(state, level).state;
  for (const hero of state.heroes) hero.combat.hp = classlessMaxHp(hero);
  return state;
}
const allIds = (state) => state.heroes.map((hero) => hero.identity.id);

// A guild with an ordinary fight waiting for the party to decide alone.
function wildFight() {
  const guild = freshGuild();
  const started = startExpedition(guild, "gutter", allIds(guild), T0, () => 0.75);
  const state = withPendingFight(started.state, T0 + 1000, "ambush");
  delete state.expedition.pending.engagedAt;
  return state;
}
// A boss far too strong for a level 1 party: a defeat.
function hopelessFight() {
  const state = wildFight();
  state.expedition.pending.kind = "boss";
  state.expedition.pending.wave = buildBossEncounter(getRegion("blightmire"), 0);
  return state;
}
// An Endless Rift run, which starts with its fight already waiting.
function riftFight() {
  const state = freshGuild(5);
  return startExpedition(state, "rift", allIds(state), T0, () => 0.5).state;
}

// Run the waiting fight for real, once, and keep its engine result and sim.
function recordFight(state, { returnAfter = null } = {}) {
  const pending = state.expedition.pending;
  const region = getRegion(state.expedition.regionId);
  const run = realSimulate(currentEncounterParty(state), pending.wave, {
    regionTier: region.tier, endless: pending.kind === "rift",
    shouldReturn: returnAfter == null ? () => false : (engine) => engine.wavesCleared >= returnAfter,
  });
  return structuredClone({ result: run.result, sim: { heroes: run.sim.heroes, gold: run.sim.gold, vault: run.sim.vault }, elapsed: run.elapsed });
}

// Build a case and record its fight with Math.random seeded, so the guild
// (traits, looks) and the fight itself are the same on every run.
function prepare(setup, options = {}) {
  const random = vi.spyOn(Math, "random").mockImplementation(seeded(3));
  try {
    const state = setup();
    return { state, recorded: recordFight(state, options) };
  } finally {
    random.mockRestore();
  }
}

// Same fight, both ways, with Math.random and the event rng replayed identically.
function playBothWays(state, recorded, watchedOutcome) {
  const at = state.expedition.pending.promptAt;
  const random = vi.spyOn(Math, "random");

  random.mockImplementation(seeded(11));
  simulateEncounter.mockReturnValueOnce(structuredClone(recorded));
  const unattended = tick(structuredClone(state), at, { interactive: false, rng: seeded(5) });

  // The watched path gets the same rng the unattended tick would have used:
  // first for applying the result, then for the rest of the tick.
  random.mockImplementation(seeded(11));
  const rng = seeded(5);
  const copy = structuredClone(recorded);
  const resolved = resolveEncounter(structuredClone(state), watchedOutcome(copy.result, copy.sim), at, { rng });
  expect(resolved.ok).toBe(true);
  const watched = tick(resolved.state, at, { interactive: false, rng });

  random.mockRestore();
  return { unattended, watched };
}

// The only expected differences: the unattended path counts its fight time.
function comparable(state) {
  const copy = structuredClone(state);
  const stats = (copy.expedition || copy.lastReport)?.stats;
  if (stats) delete stats.autoFightSeconds;
  return copy;
}

const CASES = [
  ["an ordinary win", wildFight, {}, { victory: true, reason: "cleared" }],
  ["a hopeless defeat", hopelessFight, {}, { victory: false, reason: "heroes" }],
  ["an Endless Rift return", riftFight, { returnAfter: 2 }, { victory: true, reason: "returned" }],
];

// Written and passing before the refactor. They still run: the old watched
// mapping against the unattended path as it is now.
describe("characterization: the old watched mapping and the unattended path", () => {
  test.each(CASES)("%s: both paths built the same fight result", (_name, setup, options, ending) => {
    const { result, sim } = prepare(setup, options).recorded;
    expect(result).toMatchObject(ending);
    expect(legacyWatchedOutcome(result, sim)).toEqual(legacyAutoOutcome(result, sim));
  });

  test("an engine result with every field set is carried the same way", () => {
    const sim = { heroes: [{ identity: { id: "h1" } }], gold: 42, vault: [{ kind: "gear", id: "x" }] };
    const result = {
      victory: true, reason: "squad", xpGains: { heroes: { 0: 30 }, towers: {} }, killed: 5, wavesCleared: 2,
      downed: { 0: { type: "orc", name: "Orc", nemesisId: null, boss: false, summoned: false } },
      nemesisSlain: "n1", nemesisFled: "n2", clutches: [{ hero: 0, choice: "crit", landed: true }], spellCasts: { 0: { firebolt: 2 } },
    };
    expect(legacyWatchedOutcome(result, sim)).toEqual(legacyAutoOutcome(result, sim));
  });

  test.each(CASES)("%s: equal engine results led to the same expedition state", (_name, setup, options) => {
    const { state, recorded } = prepare(setup, options);
    const { unattended, watched } = playBothWays(state, recorded, legacyWatchedOutcome);
    expect(simulateEncounter).toHaveBeenCalled();
    expect(comparable(watched)).toEqual(comparable(unattended));
    // The fight was really applied, not skipped by both paths alike.
    const fights = (next) => (next.expedition || next.lastReport).stats.fights;
    expect(fights(watched)).toBe(state.expedition.stats.fights + 1);
  });

  test("the state comparison notices a different result", () => {
    const { state, recorded } = prepare(wildFight);
    const oneGoldMore = (result, sim) => ({ ...legacyWatchedOutcome(result, sim), gold: sim.gold + 1 });
    const { unattended, watched } = playBothWays(state, recorded, oneGoldMore);
    expect(comparable(watched)).not.toEqual(comparable(unattended));
  });
});

const LEGACY_FIELDS = ["victory", "party", "xpGains", "gold", "items", "wavesCleared", "downed", "nemesisSlain", "nemesisFled", "clutches", "spellCasts"];
const CANONICAL_FIELDS = [...LEGACY_FIELDS, "reason", "killed"].sort();
const legacyPart = (outcome) => Object.fromEntries(LEGACY_FIELDS.map((key) => [key, outcome[key]]));
const FULL_RESULT = {
  victory: true, reason: "cleared", xpGains: { heroes: { 0: 30, 1: 12 }, towers: {} }, killed: 5, wavesCleared: 2,
  downed: { 1: { type: "orc", name: "Orc", nemesisId: "n2", boss: false, summoned: false } },
  nemesisSlain: "n1", nemesisFled: "n2", clutches: [{ hero: 0, choice: "crit", landed: true }], spellCasts: { 0: { firebolt: 2 } },
};
const FULL_SIM = { heroes: [{ identity: { id: "h1" } }, { identity: { id: "h2" } }], gold: 42, vault: [{ kind: "gear", id: "x" }] };

describe("buildFightOutcome: the canonical fight result", () => {
  test("has exactly the canonical fields", () => {
    expect(Object.keys(buildFightOutcome(FULL_RESULT, FULL_SIM)).sort()).toEqual(CANONICAL_FIELDS);
    expect(Object.keys(buildFightOutcome(null, FULL_SIM)).sort()).toEqual(CANONICAL_FIELDS);
  });

  test("carries every engine field and the sim's spoils", () => {
    expect(buildFightOutcome(FULL_RESULT, FULL_SIM)).toEqual({
      victory: true, reason: "cleared", party: FULL_SIM.heroes, xpGains: { 0: 30, 1: 12 }, gold: 42, items: [{ kind: "gear", id: "x" }],
      wavesCleared: 2, killed: 5, downed: FULL_RESULT.downed, nemesisSlain: "n1", nemesisFled: "n2",
      clutches: FULL_RESULT.clutches, spellCasts: { 0: { firebolt: 2 } },
    });
  });

  test("copies the item list instead of sharing the sim's", () => {
    const outcome = buildFightOutcome(FULL_RESULT, FULL_SIM);
    expect(outcome.items).not.toBe(FULL_SIM.vault);
    expect(outcome.party).toBe(FULL_SIM.heroes);
  });

  test("matches what both old mappings built, field for field", () => {
    expect(legacyPart(buildFightOutcome(FULL_RESULT, FULL_SIM))).toEqual(legacyWatchedOutcome(FULL_RESULT, FULL_SIM));
    expect(legacyPart(buildFightOutcome(FULL_RESULT, FULL_SIM))).toEqual(legacyAutoOutcome(FULL_RESULT, FULL_SIM));
  });

  test("a headless fight that hit the time limit keeps its spoils, as the unattended path did", () => {
    const outcome = buildFightOutcome(null, FULL_SIM);
    expect(outcome).toMatchObject({ victory: false, reason: null, gold: 42, items: FULL_SIM.vault, killed: 0, wavesCleared: 0 });
    expect(legacyPart(outcome)).toEqual(legacyAutoOutcome(null, FULL_SIM));
  });

  test("a fight the engine failed to finish pays nothing, as the Battle screen did", () => {
    const outcome = buildFightOutcome({ victory: false, reason: "error" }, FULL_SIM);
    expect(outcome).toMatchObject({ victory: false, reason: "error", gold: 0, items: [], xpGains: {}, downed: {} });
    expect(legacyPart(outcome)).toEqual(legacyWatchedErrorOutcome(FULL_SIM));
  });

  test.each(CASES)("%s: real engine result, same as both old mappings", (_name, setup, options) => {
    const { result, sim } = prepare(setup, options).recorded;
    const outcome = buildFightOutcome(result, sim);
    expect(legacyPart(outcome)).toEqual(legacyWatchedOutcome(result, sim));
    expect(legacyPart(outcome)).toEqual(legacyAutoOutcome(result, sim));
    expect(outcome.reason).toBe(result.reason);
    expect(outcome.killed).toBe(result.killed);
  });
});

describe("after Phase 3: both paths go through buildFightOutcome", () => {
  test.each(CASES)("%s: watched and unattended reach the same expedition state", (_name, setup, options) => {
    const { state, recorded } = prepare(setup, options);
    const { unattended, watched } = playBothWays(state, recorded, buildFightOutcome);
    expect(comparable(watched)).toEqual(comparable(unattended));
  });

  test.each(CASES)("%s: the new path reaches the same state as the old watched mapping", (_name, setup, options) => {
    const { state, recorded } = prepare(setup, options);
    const before = playBothWays(state, recorded, legacyWatchedOutcome).watched;
    const after = playBothWays(state, recorded, buildFightOutcome).watched;
    expect(after).toEqual(before);
  });
});
