import { createGuild, recruitHero, STATE_VERSION } from "./guild";
import {
  BACKUP_KEY, SAVE_MIGRATIONS, loadSave, migrateSave, parseGuild, readGuild, readSaveBackups, saveGuild,
} from "./storage";
import { needsSaveChoice } from "../cloud/cloudSave";

const SAVE_KEY = "gauntlet.save.v1";
const NOW = 1_700_000_000_000;

function memoryStorage({ failWritesTo = null } = {}) {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (key === failWritesTo) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
  };
}

// A version 1 save as an early build wrote it: before traits, legacy, the
// recruit candidate, the tutorial, pets, crystals, bonds and nemeses.
function earlyVersionOneSave() {
  const save = JSON.parse(JSON.stringify(recruitHero(createGuild()).state));
  for (const hero of save.heroes) delete hero.traits;
  for (const key of ["legacy", "candidate", "tutorial", "kennel", "crystals", "bonds", "nemeses", "petCrates", "essence"]) delete save[key];
  return save;
}

describe("save versions", () => {
  test("the current format has no upgrade steps yet, and every step must exist", () => {
    expect(STATE_VERSION).toBe(1);
    expect(SAVE_MIGRATIONS).toHaveLength(STATE_VERSION - 1);
  });

  test("a current save loads as ok", () => {
    const save = JSON.parse(JSON.stringify(createGuild()));
    expect(migrateSave(save)).toEqual({ status: "ok", data: save });
    const { status, state } = readGuild(save);
    expect(status).toBe("ok");
    expect(state.heroes).toHaveLength(3);
  });

  test("an early version 1 save loads with nothing lost", () => {
    const save = earlyVersionOneSave();
    const { status, state } = readGuild(save);
    expect(status).toBe("ok");
    expect(state.heroes.map((hero) => hero.identity.id)).toEqual(save.heroes.map((hero) => hero.identity.id));
    expect(state.gold).toBe(save.gold);
    expect(state.heroes.every((hero) => hero.traits.length === 1)).toBe(true);
    expect(state.legacy).toEqual({ renown: 0, upgrades: {}, legends: [] });
    expect(state.candidate).toBeTruthy();
  });

  test("older saves run every upgrade step in order, without changing their input", () => {
    const seen = [];
    const step = (from) => (data) => { seen.push(from); return { ...data, version: from + 1, [`v${from + 1}`]: true }; };
    const migrations = [step(1), step(2), step(3)];
    const save = { version: 2, heroes: [] };
    const result = migrateSave(save, { migrations, target: 4 });
    expect(result.status).toBe("upgraded");
    expect(seen).toEqual([2, 3]);
    expect(result.data).toEqual({ version: 4, heroes: [], v3: true, v4: true });
    expect(save).toEqual({ version: 2, heroes: [] });
    // Upgrading is deterministic.
    expect(migrateSave(save, { migrations, target: 4 }).data).toEqual(result.data);
  });

  test("a missing or broken upgrade step makes the save malformed instead of half-upgraded", () => {
    expect(migrateSave({ version: 1 }, { migrations: [], target: 2 }).status).toBe("malformed");
    const wrongVersion = [(data) => ({ ...data, version: 5 })];
    expect(migrateSave({ version: 1 }, { migrations: wrongVersion, target: 2 }).status).toBe("malformed");
  });

  test("a save from a newer build is reported as future, not as damage", () => {
    expect(migrateSave({ version: STATE_VERSION + 1, heroes: [] }).status).toBe("future");
    expect(readGuild({ version: 99 })).toEqual({ status: "future", state: null });
    expect(parseGuild({ version: 99 })).toBeNull();
  });

  test("damaged saves are malformed", () => {
    for (const bad of [null, [], "save", { heroes: [] }, { version: "1", heroes: [] }, { version: 0 }, { version: 1.5 }, { version: 1, heroes: "x" }]) {
      expect(readGuild(bad)).toEqual({ status: "malformed", state: null });
    }
  });
});

describe("loading this browser's save", () => {
  test("nothing saved starts a new guild", () => {
    const result = loadSave(memoryStorage(), NOW);
    expect(result).toMatchObject({ status: "new", replaced: false, preserved: true });
    expect(result.state.heroes).toHaveLength(3);
  });

  test("a good save loads and nothing is backed up", () => {
    const storage = memoryStorage();
    saveGuild(recruitHero(createGuild()).state, storage);
    const result = loadSave(storage, NOW);
    expect(result).toMatchObject({ status: "ok", replaced: false, preserved: true });
    expect(result.state.heroes).toHaveLength(4);
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
  });

  test.each([
    ["future", JSON.stringify({ ...createGuild(), version: STATE_VERSION + 1 })],
    ["malformed", JSON.stringify({ version: 1, heroes: "broken" })],
    ["unreadable", "{not json"],
  ])("a %s save is backed up before a fresh guild replaces it", (status, raw) => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, raw);
    const result = loadSave(storage, NOW);
    expect(result).toMatchObject({ status, replaced: true, preserved: true });
    expect(result.state.heroes).toHaveLength(3);
    expect(readSaveBackups(storage)).toEqual([{ at: NOW, reason: status, raw }]);
    // The fresh guild is then saved over the original, which the backup still holds.
    saveGuild(result.state, storage);
    expect(readSaveBackups(storage)[0].raw).toBe(raw);
  });

  test("loading the same unreadable save twice keeps one backup", () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, "{not json");
    loadSave(storage, NOW);
    loadSave(storage, NOW + 1);
    expect(readSaveBackups(storage)).toHaveLength(1);
  });

  test("backups keep the five newest", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 7; i += 1) {
      storage.setItem(SAVE_KEY, `{broken ${i}`);
      loadSave(storage, NOW + i);
    }
    expect(readSaveBackups(storage).map((entry) => entry.raw)).toEqual([2, 3, 4, 5, 6].map((i) => `{broken ${i}`));
  });

  test("when the backup cannot be written, the caller is told not to autosave", () => {
    const storage = memoryStorage({ failWritesTo: BACKUP_KEY });
    storage.setItem(SAVE_KEY, "{not json");
    const result = loadSave(storage, NOW);
    expect(result).toMatchObject({ status: "unreadable", replaced: true, preserved: false });
    expect(storage.getItem(SAVE_KEY)).toBe("{not json");
  });

  test("storage that cannot be read at all starts a new guild without claiming a replacement", () => {
    const broken = { getItem: () => { throw new Error("SecurityError"); } };
    expect(loadSave(broken, NOW)).toMatchObject({ status: "unreadable", replaced: false, preserved: true });
  });
});

describe("cloud sign-in after a replaced local save", () => {
  test("always asks before the fresh guild can overwrite the cloud copy", () => {
    const remote = { data: {}, updatedAt: 500 };
    const synced = { userId: "u1", updatedAt: 500 };
    expect(needsSaveChoice(synced, "u1", remote)).toBe(false);
    expect(needsSaveChoice(synced, "u1", remote, true)).toBe(true);
    expect(needsSaveChoice(synced, "u1", null, true)).toBe(false);
  });
});
