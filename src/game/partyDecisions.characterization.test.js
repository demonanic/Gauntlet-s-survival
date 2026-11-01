// Characterization of what a party does when it decides alone (decideAlone,
// decideDeeper, autoFight), recorded before its thresholds moved out of
// expedition.js (Phase 7, second step). Each case leaves one prompt
// unanswered with nobody watching, lets tick() decide it, and compares a
// hash of the guild state (hero and gear ids removed) with one recorded on
// the unmoved code.
import { createHash } from "node:crypto";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { withPendingFight } from "../test/expeditionFixtures";
import { debugSetLevels } from "./debug";
import { createGuild, startExpedition, tick } from "./guild";

const T0 = Date.UTC(2026, 0, 1, 12);
const AT = T0 + 60_000;

// Recorded in CI on the code before the move (expedition.js as of 3aa2c7d).
const GOLDEN = {
  "sighting, good odds: sneak": "57b568336f2ae319",
  "sighting, poor odds, badly hurt: sneak": "a7f139a57f4d62c2",
  "sighting, poor odds, healthy: fight": "fd9be69d6b008fa3",
  "boss, worn down: leave": "cbee4c7dd15d92de",
  "boss, healthy: fight": "28eb9f51e1a05181",
  "merchant: decline": "985430ca9d85feb3",
  "story, healthy": "4764d1a00d4e957c",
  "story, badly hurt": "52fe1d3c9f904374",
  "deeper, healthy: push": "79222edcae60b410",
  "deeper, a hero down: home": "4e265a0dd1289867",
  "deeper, worn down: home": "37bdec2fe18eb5c7",
};

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID = /^(gear|hero)-/;
function stripIds(value) {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [ID.test(key) ? "ID" : key, stripIds(inner)]));
  }
  return typeof value === "string" && ID.test(value) ? "ID" : value;
}
const digest = (value) => createHash("sha256").update(JSON.stringify(stripIds(value))).digest("hex").slice(0, 16);

function pinned(seed, body) {
  const random = vi.spyOn(Math, "random").mockImplementation(mulberry32(seed));
  const now = vi.spyOn(Date, "now").mockReturnValue(T0);
  try {
    return body();
  } finally {
    random.mockRestore();
    now.mockRestore();
  }
}

// A guild out on `regionId` with every hero at `hp` of max HP and `pending`
// waiting, unanswered and not engaged.
function waiting(regionId, level, pending, { hp = 1, down = [] } = {}) {
  let state = createGuild();
  if (level > 1) state = debugSetLevels(state, level).state;
  const started = startExpedition(state, regionId, state.heroes.map((hero) => hero.identity.id), T0, () => 0.5);
  expect(started.ok).toBe(true);
  state = started.state;
  state.heroes.forEach((hero, index) => {
    hero.combat.hp = down.includes(index) ? 0 : Math.max(1, Math.round(classlessMaxHp(hero) * hp));
  });
  if (pending.kind === "sighting" || pending.kind === "boss") {
    withPendingFight(state, AT, pending.kind === "boss" ? "boss" : "ambush");
    Object.assign(state.expedition.pending, pending);
  } else {
    state.expedition.pending = { ...pending, at: AT, promptAt: AT };
  }
  delete state.expedition.pending.engagedAt;
  state.expedition.pending.engagedAt = null;
  state.lastTickAt = AT;
  return state;
}

const decide = (state) => tick(state, AT + 1, { interactive: false, rng: mulberry32(23) });
const feed = (state) => [...(state.expedition?.feed || []), ...(state.lastReport?.log || []).map((text) => ({ text }))].map((entry) => entry.text).join("\n");

const CASES = {
  "sighting, good odds: sneak": [() => waiting("boneyard", 3, { kind: "sighting", label: "the squad", sneakChance: 0.8 }),
    (state) => expect(feed(state)).toMatch(/Slipped past|Spotted!/)],
  "sighting, poor odds, badly hurt: sneak": [() => waiting("boneyard", 3, { kind: "sighting", label: "the squad", sneakChance: 0.3 }, { hp: 0.2 }),
    (state) => expect(feed(state)).toMatch(/Slipped past|Spotted!/)],
  "sighting, poor odds, healthy: fight": [() => waiting("boneyard", 3, { kind: "sighting", label: "the squad", sneakChance: 0.3 }),
    (state) => { expect(feed(state)).not.toMatch(/Slipped past|Spotted!/); expect((state.expedition || state.lastReport).stats.fights).toBe(1); }],
  "boss, worn down: leave": [() => waiting("frostfang", 6, { kind: "boss", label: "the boss" }, { hp: 0.4 }),
    (state) => { expect(state.expedition).toBe(null); expect(state.lastReport.outcome).toBe("recalled"); }],
  "boss, healthy: fight": [() => waiting("frostfang", 6, { kind: "boss", label: "the boss" }),
    (state) => expect((state.expedition || state.lastReport).stats.fights).toBe(1)],
  "merchant: decline": [() => waiting("gutter", 1, { kind: "merchant", item: { kind: "consumable", key: "potion", qty: 1, name: "Potion" }, price: 40, text: "A merchant." }),
    (state) => expect(feed(state)).toMatch(/waves the merchant off/)],
  "story, healthy": [() => waiting("boneyard", 3, { kind: "story", story: "chest", text: "A chest." }),
    (state) => expect(state.expedition.pending).toBe(null)],
  "story, badly hurt": [() => waiting("boneyard", 3, { kind: "story", story: "chest", text: "A chest." }, { hp: 0.3 }),
    (state) => expect(state.expedition.pending).toBe(null)],
  "deeper, healthy: push": [() => waiting("gutter", 3, { kind: "deeper", depth: 1, atStake: 0, text: "Deeper?" }),
    (state) => expect(state.expedition.depth).toBe(1)],
  "deeper, a hero down: home": [() => waiting("gutter", 3, { kind: "deeper", depth: 1, atStake: 0, text: "Deeper?" }, { down: [1] }),
    (state) => expect(state.lastReport.outcome).toBe("victory")],
  "deeper, worn down: home": [() => waiting("gutter", 3, { kind: "deeper", depth: 1, atStake: 0, text: "Deeper?" }, { hp: 0.3 }),
    (state) => expect(state.lastReport.outcome).toBe("victory")],
};

describe("party decisions (characterization)", () => {
  for (const [name, [setup, check]] of Object.entries(CASES)) {
    it(name, () => {
      const state = pinned(777, () => decide(setup()));
      check(state);
      expect(digest(state), name).toBe(GOLDEN[name]);
    });
  }
});
