// Characterization of how a finished fight changes the expedition (Phase 7).
// Written and recorded on the code before the fight-result helpers moved out
// of expedition.js: each case below must keep producing exactly the same
// guild state. A case reduces that state to a hash (hero and gear ids taken
// out, since they come from a clock and a counter). If a hash changes, the
// move changed behavior.
import { createHash } from "node:crypto";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { withPendingFight } from "../test/expeditionFixtures";
import { debugSetLevels } from "./debug";
import { createGuild, currentEncounterParty, expeditionDurationMs, resolveEncounter, startExpedition, tick } from "./guild";
import { getRegion } from "./regions";

const T0 = Date.UTC(2026, 0, 1, 12);

// Recorded in CI on the code before the move (expedition.js as of 05eb19e).
const GOLDEN = {
  "victory, ambush": "d1fdfde3d9142ef4",
  "victory with a hero down": "ca4b339b7c18c722",
  "defeat": "92686cf7ab8e202b",
  "defeat with a second chance": "b5f12ac82212984c",
  "boss defeat with a second chance": "47175c066bd0f42c",
  "boss victory": "820ad2be3d834b71",
  "rotating boss victory": "a8919aad7d58a175",
  "nemesis slain by its victim": "f9cf9fc20633d864",
  "legendary victory": "b9355659b94347d9",
  "rift return": "e7b4e24fad16a07b",
  "rift overrun": "ae86912155d1c03d",
  "unattended trip, gutter": "bbf6abbedcad8501",
  "unattended trip, boneyard": "b52a8e0f83057718",
  "unattended trip, frostfang": "3fd6e7c52be95209",
  "unattended trip, rift": "71fa8480457c4ed6",
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

// Every case runs with the clock pinned and Math.random seeded, so guild
// creation, loot and ids repeat exactly.
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

function guild(level) {
  let state = createGuild();
  state.gold = 1e6;
  if (level > 1) state = debugSetLevels(state, level).state;
  for (const hero of state.heroes) hero.combat.hp = classlessMaxHp(hero);
  return state;
}
const ids = (state) => state.heroes.map((hero) => hero.identity.id);

// A guild on a trip with a fight of `kind` waiting.
function fightWaiting(regionId, level, kind, { revives = 0 } = {}) {
  const state = guild(level);
  const started = startExpedition(state, regionId, ids(state), T0, () => 0.5, { revives });
  expect(started.ok).toBe(true);
  if (kind === "rift") return started.state;
  return withPendingFight(started.state, T0 + 60_000, kind);
}

// A synthetic engine outcome for the waiting fight: every hero alive at
// `hp` of their max HP, some XP each, some gold, two drops.
function outcome(state, { victory = true, hp = 0.6, fallen = [], wavesCleared = 0, ...extra } = {}) {
  const party = structuredClone(currentEncounterParty(state));
  party.forEach((hero, index) => {
    hero.combat.hp = fallen.includes(index) ? 0 : Math.round(classlessMaxHp(hero) * hp);
    hero.arrowsSpent = { arrows: 9 };
  });
  return {
    victory, party,
    xpGains: Object.fromEntries(party.map((_, index) => [index, 120 + 40 * index])),
    gold: 37,
    items: [{ kind: "consumable", key: "potion", qty: 1 }, { kind: "consumable", key: "bandage", qty: 2 }],
    wavesCleared, downed: {}, nemesisSlain: null, nemesisFled: null, clutches: [], spellCasts: {},
    ...extra,
  };
}

function resolve(state, result, seed = 7) {
  const at = state.expedition.pending.promptAt;
  const resolved = resolveEncounter(state, result, at + 30_000, { rng: mulberry32(seed) });
  expect(resolved.ok).toBe(true);
  return resolved.state;
}

const feed = (state) => (state.expedition?.feed || []).map((entry) => entry.text).join("\n");
const report = (state) => state.lastReport?.log.join("\n") || "";

// What each case must show, so a case can't drift onto another branch.
const CHECKS = {
  "victory, ambush": (state) => { expect(state.expedition.pending).toBe(null); expect(feed(state)).toMatch(/CLUTCH!/); },
  "victory with a hero down": (state) => expect(feed(state)).toMatch(/is down/),
  "defeat": (state) => { expect(state.expedition).toBe(null); expect(state.lastReport.outcome).toBe("retreat"); },
  "defeat with a second chance": (state) => { expect(state.expedition.revives).toBe(0); expect(feed(state)).toMatch(/A second chance!/); },
  "boss defeat with a second chance": (state) => expect(state.expedition.pending.kind).toBe("boss"),
  "boss victory": (state) => { expect(state.expedition.bossDone).toBe(true); expect(state.expedition.pending.kind).toBe("deeper"); },
  "rotating boss victory": (state) => expect(state.bossRank).toBe(5),
  "nemesis slain by its victim": (state) => expect(state.nemeses[0].slainAt).toBeGreaterThan(0),
  "legendary victory": (state) => expect(feed(state)).toMatch(/The legend falls!/),
  "rift return": (state) => expect(state.lastReport.outcome).toBe("returned"),
  "rift overrun": (state) => { expect(state.lastReport.outcome).toBe("retreat"); expect(report(state)).toMatch(/Overrun/); },
};

const CASES = {
  "victory, ambush": () => {
    const state = fightWaiting("gutter", 3, "ambush");
    return resolve(state, outcome(state, { clutches: [{ hero: 0, choice: "crit", landed: true }, { hero: 1, choice: "potion" }] }));
  },
  "victory with a hero down": () => {
    const state = fightWaiting("boneyard", 4, "sighting");
    return resolve(state, outcome(state, { fallen: [1] }));
  },
  "defeat": () => {
    const state = fightWaiting("boneyard", 3, "ambush");
    return resolve(state, outcome(state, { victory: false, fallen: [0, 1, 2] }));
  },
  "defeat with a second chance": () => {
    const state = fightWaiting("boneyard", 3, "ambush", { revives: 1 });
    return resolve(state, outcome(state, { victory: false, fallen: [0, 1, 2] }));
  },
  "boss defeat with a second chance": () => {
    const state = fightWaiting("frostfang", 6, "boss", { revives: 1 });
    return resolve(state, outcome(state, { victory: false, fallen: [0, 1, 2] }));
  },
  "boss victory": () => {
    const state = fightWaiting("frostfang", 6, "boss");
    return resolve(state, outcome(state));
  },
  "rotating boss victory": () => {
    const state = fightWaiting("ashen", 8, "boss");
    state.bossRank = 4;
    expect(getRegion("ashen").bossRotation).toBe(true);
    return resolve(state, outcome(state));
  },
  "nemesis slain by its victim": () => {
    const state = fightWaiting("frostfang", 6, "sighting");
    const victim = state.expedition.heroIds[0];
    state.nemeses = [{ id: "nem-1", name: "Gristle", type: "orc", typeName: "Orc", regionId: "frostfang", level: 3, grewAt: T0, createdAt: T0 - 1e6, victims: [{ id: victim, name: "V" }], knockouts: 1, fled: 0, met: 1 }];
    state.expedition.pending.nemesisId = "nem-1";
    return resolve(state, outcome(state, { nemesisSlain: "nem-1" }));
  },
  "legendary victory": () => {
    const state = fightWaiting("frostfang", 6, "sighting");
    state.expedition.pending.legendary = true;
    return resolve(state, outcome(state));
  },
  "rift return": () => {
    const state = fightWaiting("rift", 6, "rift");
    return resolve(state, outcome(state, { wavesCleared: 4 }));
  },
  "rift overrun": () => {
    const state = fightWaiting("rift", 6, "rift");
    return resolve(state, outcome(state, { victory: false, wavesCleared: 2, fallen: [0, 1, 2] }));
  },
};

// Whole unattended trips (autoFight, applyFightResult and everything after),
// played with one seeded rng.
const TRIPS = [["gutter", 1], ["boneyard", 3], ["frostfang", 6], ["rift", 6]];
for (const [regionId, level] of TRIPS) {
  CASES[`unattended trip, ${regionId}`] = () => {
    const rng = mulberry32(41);
    const state = guild(level);
    const started = startExpedition(state, regionId, ids(state), T0, rng);
    expect(started.ok).toBe(true);
    const end = T0 + expeditionDurationMs(started.state, getRegion(regionId)) + 2 * 3_600_000;
    return tick({ ...started.state, lastTickAt: T0 }, end, { rng });
  };
}

describe("fight results (characterization)", () => {
  for (const [name, play] of Object.entries(CASES)) {
    it(name, () => {
      const state = pinned(12345, play);
      if (CHECKS[name]) CHECKS[name](state);
      else expect(state.lastReport?.stats.fights).toBeGreaterThan(0);
      expect(digest(state), name).toBe(GOLDEN[name]);
    });
  }
});
