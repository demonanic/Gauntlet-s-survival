import * as C from "../combat/config";
import { normalizeClasslessHero } from "../combat/heroModel";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { createGuild, rollCandidate, STATE_VERSION } from "./guild";
import { emptyLegacy, syncGuildBonuses } from "./legacy";
import { paletteForShift } from "../combat/heroPalette";
import { rollTrait, TRAITS } from "../combat/traits";
import { bankLoot, migrateVaultItem, normalizeHeroGear } from "./items";
import { normalizeQualityFields } from "./qualities";
import { PET_SPECIES } from "../combat/pets";
import { ECOLOGIES } from "./ecology";
import { normalizePet } from "./pets";
import { normalizeTutorial } from "./tutorial";
import { STASH_KEYS, crystalInfo } from "../combat/gear";

const STORAGE_KEY = "gauntlet.save.v1";

// Older saves predate traits and individual looks: heroes without a trait get
// one, and only a malformed look is replaced (preset colors stay as they were).
function normalizeHeroExtras(hero) {
  const traits = (Array.isArray(hero.traits) ? hero.traits : []).filter((key) => TRAITS[key]);
  const shift = Number(hero.appearance?.hueShift);
  const pet = normalizePet(hero.pet);
  return {
    ...normalizeQualityFields(hero),
    pet: pet || undefined,
    traits: traits.length ? traits : [rollTrait()],
    appearance: Number.isFinite(shift) ? { ...hero.appearance, ...paletteForShift(shift) } : hero.appearance,
  };
}

// Expeditions saved before timed adventures (no feed, fixed encounters) can't
// be resumed: the party comes home with what it had gathered.
function retireOldExpedition(state) {
  const run = state.expedition;
  if (!run || Array.isArray(run.feed)) return;
  const loot = { gold: Math.max(0, Math.round(Number(run.loot?.gold) || 0)), items: Array.isArray(run.loot?.items) ? run.loot.items : [] };
  state.gold += loot.gold;
  bankLoot(state, loot.items);
  for (const id of run.heroIds || []) {
    const hero = state.heroes.find((entry) => entry.identity.id === id);
    if (hero && hero.combat.hp <= 0) hero.combat.hp = 1;
  }
  state.lastReport = {
    regionId: run.regionId, outcome: "recalled", loot,
    log: [...(Array.isArray(run.log) ? run.log : []), "Expeditions are now timed adventures. The party came home with everything it found."],
  };
  state.expedition = null;
}

// Ordered save upgrades. SAVE_MIGRATIONS[i] turns a version i+1 save into a
// version i+2 save (so [0] is 1 -> 2), returning a new object. To change the
// save format: bump STATE_VERSION in guild.js, append one step here, and add a
// fixture test that loads a save of the previous version. Never remove a step:
// players may come back with a save of any older version. The field-by-field
// normalizing in normalizeGuild still runs after the last step.
export const SAVE_MIGRATIONS = Object.freeze([]);

// Bring raw save data up to `target`. Statuses: "ok" (already current),
// "upgraded", "future" (saved by a newer build than this one), "malformed".
export function migrateSave(parsed, { migrations = SAVE_MIGRATIONS, target = STATE_VERSION } = {}) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "malformed", data: null };
  const version = parsed.version;
  if (!Number.isInteger(version) || version < 1) return { status: "malformed", data: null };
  if (version > target) return { status: "future", data: null };
  let data = parsed;
  for (let from = version; from < target; from += 1) {
    const step = migrations[from - 1];
    if (typeof step !== "function") return { status: "malformed", data: null };
    data = step(structuredClone(data));
    if (!data || typeof data !== "object" || data.version !== from + 1) return { status: "malformed", data: null };
  }
  return { status: version === target ? "ok" : "upgraded", data };
}

// Turn saved JSON (local or cloud) into a valid guild, with why it failed if
// it did: { status, state }. `state` is null unless status is ok/upgraded.
export function readGuild(parsed, options) {
  const { status, data } = migrateSave(parsed, options);
  if (!data) return { status, state: null };
  const state = normalizeGuild(data);
  return state ? { status, state } : { status: "malformed", state: null };
}

// Turn saved JSON (local or cloud) into a valid guild, or null if unusable.
export function parseGuild(parsed) {
  return readGuild(parsed).state;
}

function normalizeGuild(parsed) {
  if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.heroes)) return null;
  const stash = Object.fromEntries(STASH_KEYS.map((key) => [key, Math.max(0, Math.floor(Number(parsed.stash?.[key]) || 0))]));
  // Saves from before bows needed arrows get a starting bundle.
  if (parsed.stash && parsed.stash.arrows == null) stash.arrows = 100;
  const base = createGuild();
  const state = {
    ...base,
    ...parsed,
    heroes: parsed.heroes.map((hero) => normalizeHeroExtras(normalizeHeroGear(normalizeClasslessHero(hero)))),
    vault: (Array.isArray(parsed.vault) ? parsed.vault : []).map(migrateVaultItem).filter(Boolean),
    stash: parsed.stash ? stash : base.stash,
    essence: Math.max(0, Math.floor(Number(parsed.essence) || 0)),
    crystals: Object.fromEntries(Object.entries(parsed.crystals && typeof parsed.crystals === "object" ? parsed.crystals : {})
      .filter(([id, count]) => crystalInfo(id) && count > 0).map(([id, count]) => [id, Math.floor(count)])),
    tutorial: normalizeTutorial(parsed.tutorial),
    kennel: (Array.isArray(parsed.kennel) ? parsed.kennel : []).map(normalizePet).filter(Boolean),
    crateBosses: (Array.isArray(parsed.crateBosses) ? parsed.crateBosses : []).filter((key) => typeof key === "string"),
    ecologySeen: Object.fromEntries(Object.entries(parsed.ecologySeen && typeof parsed.ecologySeen === "object" ? parsed.ecologySeen : {})
      .filter(([key, count]) => ECOLOGIES[key] && Number(count) > 0).map(([key, count]) => [key, Math.floor(Number(count))])),
    bonds: Object.fromEntries(Object.entries(parsed.bonds && typeof parsed.bonds === "object" ? parsed.bonds : {})
      .filter(([key, bond]) => key.split("|").length === 2 && Number(bond?.wins) > 0)
      .map(([key, bond]) => [key, {
        wins: Math.floor(Number(bond.wins)),
        ...(bond.comrades || bond.sworn ? { comrades: true } : {}),
        ...(bond.sworn ? { sworn: true } : {}),
        ...(Number(bond.askAt) > 0 ? { askAt: Math.floor(Number(bond.askAt)) } : {}),
      }])),
    nemeses: (Array.isArray(parsed.nemeses) ? parsed.nemeses : [])
      .filter((nemesis) => C.ENEMIES[nemesis?.type] && typeof nemesis.name === "string" && typeof nemesis.regionId === "string"
        && Array.isArray(nemesis.victims) && Number(nemesis.level) >= 1),
    petCrates: (Array.isArray(parsed.petCrates) ? parsed.petCrates : [])
      .filter((crate) => Array.isArray(crate?.options) && crate.options.length && crate.options.every((key) => PET_SPECIES[key])),
    legacy: { ...emptyLegacy(), ...(parsed.legacy && typeof parsed.legacy === "object" ? parsed.legacy : {}) },
  };
  state.candidate = parsed.candidate?.trait && TRAITS[parsed.candidate.trait] ? parsed.candidate : rollCandidate(state);
  retireOldExpedition(state);
  syncGuildBonuses(state);
  // A newly assigned trait (e.g. Glass Cannon) can lower max HP below current HP.
  for (const hero of state.heroes) hero.combat.hp = Math.min(hero.combat.hp, classlessMaxHp(hero));
  return state;
}

// Saves this build could not read, kept so autosave never destroys them:
// a JSON list of { at, reason, raw }, newest last, at most MAX_BACKUPS long.
export const BACKUP_KEY = "gauntlet.save.v1.backups";
const MAX_BACKUPS = 5;

export function readSaveBackups(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(BACKUP_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Keep `raw` before it can be overwritten. Saving the same text twice (React
// StrictMode runs the loader twice in development) keeps one copy.
function backupRawSave(storage, raw, reason, now) {
  try {
    const list = readSaveBackups(storage);
    if (list.some((entry) => entry?.raw === raw)) return true;
    const next = [...list, { at: now, reason, raw }].slice(-MAX_BACKUPS);
    storage.setItem(BACKUP_KEY, JSON.stringify(next));
    return readSaveBackups(storage).some((entry) => entry?.raw === raw);
  } catch {
    return false;
  }
}

// Local save in this browser; cloud saves (cloud/cloudSave.js) sync on top.
// Returns { state, status, replaced, preserved }:
// - status: "new" (nothing saved), "ok", "upgraded", "future", "malformed" or
//   "unreadable" (not JSON, or storage failed);
// - replaced: the stored save could not be used and `state` is a fresh guild;
// - preserved: when replaced, whether the old save was kept in BACKUP_KEY.
//   If it could not be kept, the caller must not autosave over it.
export function loadSave(storage = globalThis.localStorage, now = Date.now()) {
  let raw = null;
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return { state: createGuild(), status: "unreadable", replaced: false, preserved: true };
  }
  if (!raw) return { state: createGuild(), status: "new", replaced: false, preserved: true };
  let result;
  try {
    result = readGuild(JSON.parse(raw));
  } catch {
    result = { status: "unreadable", state: null };
  }
  if (result.state) return { state: result.state, status: result.status, replaced: false, preserved: true };
  const preserved = backupRawSave(storage, raw, result.status, now);
  return { state: createGuild(), status: result.status, replaced: true, preserved };
}

export function loadGuild(storage = globalThis.localStorage) {
  return loadSave(storage).state;
}

export function saveGuild(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearGuild(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode); nothing to clear.
  }
}
