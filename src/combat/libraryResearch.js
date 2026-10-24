// Data-driven Library spell research. Research is owned by one mage and saves with the profile.
import * as C from "./config";

export const SPELL_ELEMENTS = ["fire", "ice", "poison", "electric", "mind"];
export const SPELL_EFFECTS = ["area", "time", "intensity"];
export const MAGE_SECONDARY_AFFINITY_LEVEL = 10;
export const MAGE_SPELL_LOADOUT_SIZE = 4;

export const SPELL_DATABASE = [
  { id: "ember_bolt", name: "Ember Bolt", element: "fire", effect: "intensity", basePower: 1.15, baseMana: 12, requiredIntelligence: 10, description: "A focused burst of fire." },
  { id: "cinder_field", name: "Cinder Field", element: "fire", effect: "area", basePower: 0.75, baseMana: 20, requiredIntelligence: 12, description: "Burns enemies across a small area." },
  { id: "flare_bind", name: "Flare Bind", element: "fire", effect: "time", basePower: 0.7, baseMana: 19, requiredIntelligence: 13, description: "Leaves a burning curse that disrupts enemies." },
  { id: "glacier_bind", name: "Glacier Bind", element: "ice", effect: "time", basePower: 0.65, baseMana: 18, requiredIntelligence: 12, description: "Slows a target for a sustained duration." },
  { id: "shard_burst", name: "Shard Burst", element: "ice", effect: "area", basePower: 0.9, baseMana: 22, requiredIntelligence: 14, description: "Scatters frost shards across an area." },
  { id: "rime_lance", name: "Rime Lance", element: "ice", effect: "intensity", basePower: 1.2, baseMana: 20, requiredIntelligence: 14, description: "Drives a concentrated spike of freezing energy into one foe." },
  { id: "venom_mark", name: "Venom Mark", element: "poison", effect: "time", basePower: 0.8, baseMana: 19, requiredIntelligence: 12, description: "Applies lingering poison." },
  { id: "toxic_cloud", name: "Toxic Cloud", element: "poison", effect: "area", basePower: 0.65, baseMana: 24, requiredIntelligence: 15, description: "Fills an area with toxic fumes." },
  { id: "venom_spike", name: "Venom Spike", element: "poison", effect: "intensity", basePower: 1.05, baseMana: 21, requiredIntelligence: 14, description: "Pierces a target with concentrated venom." },
  { id: "arc_surge", name: "Arc Surge", element: "electric", effect: "intensity", basePower: 1.3, baseMana: 24, requiredIntelligence: 15, description: "A high-intensity electrical strike." },
  { id: "chain_pulse", name: "Chain Pulse", element: "electric", effect: "area", basePower: 0.85, baseMana: 27, requiredIntelligence: 16, description: "Arcs between nearby targets." },
  { id: "static_snare", name: "Static Snare", element: "electric", effect: "time", basePower: 0.72, baseMana: 23, requiredIntelligence: 15, description: "Disrupts movement with lingering static." },
  { id: "thought_lance", name: "Thought Lance", element: "mind", effect: "intensity", basePower: 1.05, baseMana: 17, requiredIntelligence: 13, description: "Pierces a target's mental defenses." },
  { id: "dread_haze", name: "Dread Haze", element: "mind", effect: "time", basePower: 0.55, baseMana: 21, requiredIntelligence: 14, description: "Weakens foes over time." },
  { id: "nightmare_field", name: "Nightmare Field", element: "mind", effect: "area", basePower: 0.62, baseMana: 25, requiredIntelligence: 16, description: "Unsettles every enemy caught in a mental pulse." },
];

export const LIBRARY_RULES = {
  discoveryGold: 80, discoveryStone: 20, researchGoldPerHour: 20, researchStonePerHour: 8,
  baseSuccessPercent: 45, intelligencePercentPerPoint: 1.5, levelPercentPerLevel: 8,
  maxSuccessPercent: 92, minResearchHours: 1, maxResearchHours: 24,
};

function stableIndex(value, length) {
  let hash = 0;
  for (const char of String(value || "mage")) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return hash % length;
}

export function ensureMageSpellData(hero) {
  if (!hero || hero.cls !== "mage") return hero;
  if (!SPELL_ELEMENTS.includes(hero.primaryAffinity)) {
    hero.primaryAffinity = SPELL_ELEMENTS[stableIndex(hero.id || hero.name, SPELL_ELEMENTS.length)];
  }
  if (!hero.secondaryAffinity || !SPELL_ELEMENTS.includes(hero.secondaryAffinity) || hero.secondaryAffinity === hero.primaryAffinity) {
    hero.secondaryAffinity = null;
  }
  if (!Array.isArray(hero.spellbook)) hero.spellbook = [];
  if (!Array.isArray(hero.equippedSpells)) hero.equippedSpells = [];
  return hero;
}

export function mageAffinities(hero) {
  ensureMageSpellData(hero);
  return hero?.cls === "mage" ? [hero.primaryAffinity, ...(hero.secondaryAffinity ? [hero.secondaryAffinity] : [])] : [];
}

export function mageSpellbookCapacity(hero) { return 2 + Math.floor((Math.max(1, Number(hero?.level) || 1) - 1) / 3); }

export function customSpellIntelligenceRequirement(hero) { return 10 + Math.floor(Math.max(1, Number(hero?.level) || 1) / 3); }

export function mageIntelligence(hero) {
  const base = Number(hero?.stats?.intelligence) || 10;
  const gear = Number(hero?.equipment && Object.values(hero.equipment).reduce((sum, item) => sum + (Number(item?.stats?.intelligence) || 0), 0)) || 0;
  return base + gear;
}

export function spellIntelligenceRequirement(spell) {
  return Math.max(10, Number(spell?.requiredIntelligence) || (10 + Math.floor((Number(spell?.baseMana) || 15) / 5)));
}

export function mageCanUseSpell(hero, spell) {
  if (!hero || hero.cls !== "mage" || !spell) return false;
  return mageAffinities(hero).includes(spell.element) && mageIntelligence(hero) >= spellIntelligenceRequirement(spell);
}

export function unlockMageSecondaryAffinity(hero, element) {
  ensureMageSpellData(hero);
  if (!hero || hero.cls !== "mage" || (Number(hero.level) || 1) < MAGE_SECONDARY_AFFINITY_LEVEL) return { ok: false, reason: "level" };
  if (!SPELL_ELEMENTS.includes(element) || element === hero.primaryAffinity) return { ok: false, reason: "element" };
  if (hero.secondaryAffinity) return { ok: false, reason: "already" };
  hero.secondaryAffinity = element;
  return { ok: true, element };
}

export function librarySuccessChance(state, intelligence = null) {
  const level = Math.max(1, Number(state.buildings?.library?.level) || 1);
  const bestInt = intelligence == null
    ? Math.max(10, ...(state.heroes || []).concat(state.bench || []).filter((hero) => hero?.cls === "mage").map(mageIntelligence))
    : Math.max(1, Number(intelligence) || 10);
  return Math.max(5, Math.min(LIBRARY_RULES.maxSuccessPercent,
    LIBRARY_RULES.baseSuccessPercent + (bestInt - 10) * LIBRARY_RULES.intelligencePercentPerPoint +
    (level - 1) * LIBRARY_RULES.levelPercentPerLevel));
}

function libraryReady(state) {
  const library = state.buildings?.library;
  return !!library && library.unlocked !== false && Number(library.hp) > 0;
}

function spellName(element, effect) {
  const a = { fire: "Cinder", ice: "Glacial", poison: "Venom", electric: "Volt", mind: "Psyche" };
  const b = { area: "Nova", time: "Bind", intensity: "Lance" };
  return `${a[element] || "Arcane"} ${b[effect] || "Pulse"}`;
}

function allMages(state) {
  return [...(state.heroes || []), ...(state.bench || [])].filter((hero) => hero?.cls === "mage");
}

export function randomDiscoveryPool(state, mage) {
  if (!mage || mage.cls !== "mage") return [];
  ensureMageSpellData(mage);
  // Discovery is personal: a spell known by another mage is not a global unlock.
  const learnedIds = new Set((mage.spellbook || []).map((spell) => spell.id));
  const pendingIds = new Set((state.libraryBlueprints || [])
    .filter((blueprint) => blueprint.mageId === mage.id)
    .map((blueprint) => blueprint.catalogId || blueprint.spellId));
  return SPELL_DATABASE.filter((spell) =>
    mageCanUseSpell(mage, spell) && !learnedIds.has(spell.id) && !pendingIds.has(spell.id));
}

// Explain why a mage's random pool is empty and show the nearest valid routes forward.
export function randomDiscoveryAlternatives(state, mage) {
  if (!mage || mage.cls !== "mage") return { eligible: [], intelligenceLocked: [], affinityLocked: [] };
  ensureMageSpellData(mage);
  const learnedIds = new Set((mage.spellbook || []).map((spell) => spell.id));
  const pendingIds = new Set((state.libraryBlueprints || [])
    .filter((blueprint) => blueprint.mageId === mage.id)
    .map((blueprint) => blueprint.catalogId || blueprint.spellId));
  const unseen = SPELL_DATABASE.filter((spell) => !learnedIds.has(spell.id) && !pendingIds.has(spell.id));
  const affinities = mageAffinities(mage);
  const intelligence = mageIntelligence(mage);
  return {
    eligible: unseen.filter((spell) => mageCanUseSpell(mage, spell)),
    intelligenceLocked: unseen.filter((spell) => affinities.includes(spell.element) && intelligence < spellIntelligenceRequirement(spell)),
    affinityLocked: unseen.filter((spell) => !affinities.includes(spell.element)),
  };
}

function availableCatalog(state, mage, mode, element, effect) {
  const pool = randomDiscoveryPool(state, mage);
  return mode === "random"
    ? pool
    : pool.filter((spell) => spell.element === element && spell.effect === effect);
}

export function createSpellBlueprint(state, { mageId, mode = "custom", element = "fire", effect = "intensity", roll = Math.random } = {}) {
  if (!libraryReady(state) || !SPELL_ELEMENTS.includes(element) || !SPELL_EFFECTS.includes(effect) || !["custom", "random"].includes(mode)) return { ok: false, reason: "library" };
  const mage = allMages(state).find((hero) => hero.id === mageId);
  if (!mage) return { ok: false, reason: "mage" };
  ensureMageSpellData(mage);
  state.libraryBlueprints = Array.isArray(state.libraryBlueprints) ? state.libraryBlueprints : [];
  const occupiedSlots = mage.spellbook.length + state.libraryBlueprints.filter((item) => item.mageId === mage.id).length;
  const spellCapacity = mageSpellbookCapacity(mage);
  if (occupiedSlots >= spellCapacity) return { ok: false, reason: "capacity", capacity: spellCapacity };
  if (mode === "custom" && mageIntelligence(mage) < customSpellIntelligenceRequirement(mage)) {
    return { ok: false, reason: "intelligence", requiredIntelligence: customSpellIntelligenceRequirement(mage) };
  }
  const costGold = LIBRARY_RULES.discoveryGold, costStone = LIBRARY_RULES.discoveryStone;
  if ((Number(state.gold) || 0) < costGold || (Number(state.stone) || 0) < costStone) return { ok: false, reason: "resources" };
  const catalog = availableCatalog(state, mage, mode, element, effect);
  if (!catalog.length) return { ok: false, reason: "incompatible" };
  state.gold -= costGold;
  state.stone -= costStone;
  const chance = librarySuccessChance(state, mageIntelligence(mage));
  if (roll() * 100 >= chance) {
    state.libraryFailedDesigns = (Number(state.libraryFailedDesigns) || 0) + 1;
    state.buildings.library.activity = "Design failed";
    return { ok: false, reason: "roll", chance };
  }
  let spell;
  if (mode === "random") {
    spell = catalog[Math.min(catalog.length - 1, Math.floor(Math.max(0, roll()) * catalog.length))];
  } else {
    // Custom designs inherit requirements from the selected mage and affinity.
    spell = { id: `custom_${Date.now().toString(36)}_${Math.floor(roll() * 0xffffff).toString(36)}`,
      name: spellName(element, effect), element, effect, basePower: 0.7, baseMana: 15,
      requiredIntelligence: customSpellIntelligenceRequirement(mage),
      description: `Custom ${element} spell focused on ${effect}.` };
  }
  const blueprint = { ...spell, id: `blueprint_${Date.now().toString(36)}_${Math.floor(roll() * 0xffffff).toString(36)}`,
    catalogId: spell.id, mageId: mage.id, mageName: mage.name, createdAt: Date.now() };
  state.libraryBlueprints.push(blueprint);
  state.buildings.library.activity = `Blueprint found: ${blueprint.name}`;
  return { ok: true, blueprint, chance };
}

function moveMageToLibrary(state, mageId) {
  const activeIndex = (state.heroes || []).findIndex((hero) => hero.id === mageId);
  if (activeIndex < 0) return;
  const [mage] = state.heroes.splice(activeIndex, 1);
  state.bench = Array.isArray(state.bench) ? state.bench : [];
  state.bench.push(mage);
  // Keep a full squad when possible by promoting the first available reserve.
  if (state.bench.length && state.heroes.length < C.HERO_ROSTER.maximumSquad) {
    const replacementIndex = state.bench.findIndex((hero) => hero.id !== mageId && hero.cls !== "mage");
    if (replacementIndex >= 0) state.heroes.push(state.bench.splice(replacementIndex, 1)[0]);
  }
  state.needsSquad = state.heroes.length === 0;
}

export function startSpellResearch(state, blueprintId, hours) {
  if (!libraryReady(state) || state.libraryResearch) return { ok: false, reason: "busy" };
  const blueprint = (state.libraryBlueprints || []).find((item) => item.id === blueprintId);
  if (!blueprint) return { ok: false, reason: "blueprint" };
  const mage = allMages(state).find((hero) => hero.id === blueprint.mageId);
  if (!mage || !mageCanUseSpell(mage, blueprint)) return { ok: false, reason: "mage" };
  const durationHours = Math.max(LIBRARY_RULES.minResearchHours, Math.min(LIBRARY_RULES.maxResearchHours, Number(hours) || 1));
  const costGold = Math.ceil(durationHours * LIBRARY_RULES.researchGoldPerHour);
  const costStone = Math.ceil(durationHours * LIBRARY_RULES.researchStonePerHour);
  if ((Number(state.gold) || 0) < costGold || (Number(state.stone) || 0) < costStone) return { ok: false, reason: "resources" };
  state.gold -= costGold;
  state.stone -= costStone;
  moveMageToLibrary(state, mage.id);
  state.libraryResearch = { blueprintId, mageId: mage.id, startedAt: Date.now(), durationSeconds: durationHours * 3600,
    remainingSeconds: durationHours * 3600, elapsedSeconds: 0, chosenHours: durationHours };
  state.buildings.library.activity = `Researching ${blueprint.name} · ${mage.name}`;
  return { ok: true, durationHours, costGold, costStone, mageName: mage.name };
}

// Repair legacy saves where research was persisted before squad removal was enforced.
export function ensureResearchMageBenched(state) {
  const mageId = state?.libraryResearch?.mageId;
  if (!mageId || !(state.heroes || []).some((hero) => hero?.id === mageId)) return false;
  moveMageToLibrary(state, mageId);
  return true;
}

export function advanceLibraryResearch(state, dtSeconds) {
  const order = state.libraryResearch;
  if (!order || !(Number(order.remainingSeconds) > 0) || !Number.isFinite(dtSeconds) || dtSeconds <= 0 || !libraryReady(state)) return false;
  order.remainingSeconds = Math.max(0, order.remainingSeconds - dtSeconds);
  order.elapsedSeconds = (Number(order.elapsedSeconds) || 0) + dtSeconds;
  if (order.remainingSeconds > 0.0001) return false;
  const index = (state.libraryBlueprints || []).findIndex((item) => item.id === order.blueprintId);
  if (index < 0) { state.libraryResearch = null; return false; }
  const blueprint = state.libraryBlueprints[index];
  const mage = allMages(state).find((hero) => hero.id === (order.mageId || blueprint.mageId));
  if (!mage) {
    // Never destroy completed research if a legacy save has lost its mage link.
    state.libraryResearch = { ...order, remainingSeconds: 1 };
    return false;
  }
  ensureMageSpellData(mage);
  const durationScale = 0.75 + Math.max(1, Number(order.chosenHours) || 1) / 12;
  const libraryLevel = Math.max(1, Number(state.buildings?.library?.level) || 1);
  const spell = { ...blueprint, id: blueprint.catalogId || blueprint.id, blueprintId: blueprint.id, unlockedAt: Date.now(),
    researchHours: order.chosenHours, strength: Math.round(blueprint.basePower * durationScale * (1 + (libraryLevel - 1) * 0.08) * 100) / 100,
    manaCost: Math.max(1, Math.ceil(blueprint.baseMana * (0.8 + durationScale * 0.2))) };
  if (!mage.spellbook.some((known) => known.id === spell.id)) mage.spellbook.push(spell);
  state.libraryBlueprints.splice(index, 1);
  state.libraryResearch = null;
  state.libraryCompletionNotice = { mageId: mage.id, mageName: mage.name, spellId: spell.id, spellName: spell.name, completedAt: Date.now() };
  if (state.buildings?.library) state.buildings.library.activity = `Research complete: ${spell.name}`;
  return { ...spell, mageId: mage.id };
}

export function resolveLibraryCompletion(state, choice) {
  const notice = state.libraryCompletionNotice;
  if (!notice || !["return", "roster"].includes(choice)) return false;
  const bench = state.bench || (state.bench = []);
  const mageIndex = bench.findIndex((hero) => hero.id === notice.mageId);
  if (choice === "return" && mageIndex >= 0) {
    const [mage] = bench.splice(mageIndex, 1);
    if (state.heroes?.length) {
      let lowest = 0;
      for (let i = 1; i < state.heroes.length; i++) {
        if ((Number(state.heroes[i].level) || 1) < (Number(state.heroes[lowest].level) || 1)) lowest = i;
      }
      bench.push(state.heroes[lowest]);
      state.heroes[lowest] = mage;
    } else state.heroes.push(mage);
  }
  state.libraryCompletionNotice = null;
  state.needsSquad = !state.heroes?.length;
  return true;
}
