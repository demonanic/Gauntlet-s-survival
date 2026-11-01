// Gauntlet spells (the Arcana branch). Not every hero casts: Arcane Spark (A1)
// opens casting and gives Arcane Bolt; Elementalism (A2) adds an element and
// its spells. Casts can fizzle: success depends on Intelligence, a little
// Luck and the hero's proficiency in the element. Only successful casts count
// toward a spell's rank (I-V) and the element's proficiency (I-V), which
// unlock the element's other spells and, later, a second and third element.
// Owner-approved design (Oct 2026).
import { effectiveLuck } from "./luck";

export const ELEMENTS = Object.freeze({
  arcane: { name: "Arcane", color: "#E879F9" },
  fire: { name: "Fire", color: "#FF6600" },
  ice: { name: "Ice", color: "#00F3FF" },
  poison: { name: "Poison", color: "#39FF14" },
  electric: { name: "Lightning", color: "#FFE600" },
  mind: { name: "Mind", color: "#A855F7" },
  restoration: { name: "Restoration", color: "#A7F3D0" },
  warding: { name: "Warding", color: "#FFB547" },
});
export const SCHOOLS = Object.freeze(["fire", "ice", "poison", "electric", "mind", "restoration", "warding"]);
// Schools whose spells help the party instead of hurting a foe (owner-approved,
// Nov 2026). Their spells need no enemy target.
export const SUPPORT_SCHOOLS = Object.freeze(["restoration", "warding"]);

// Successful casts needed for ranks I-V (spells and element proficiency alike).
export const RANK_CASTS = Object.freeze([0, 15, 45, 100, 200]);
export const ROMAN = Object.freeze(["I", "II", "III", "IV", "V"]);

export const MAGIC = Object.freeze({
  baseSuccess: 0.6,
  successPerInt: 0.015, // per Intelligence point above 10
  successPerLuck: 0.003,
  successPerRank: 0.05, // per proficiency rank above I
  maxSuccess: 0.95,
  rankPower: 0.1, // +10% power per spell rank above I
  rankArea: 0.08, // +8% radius per spell rank above I
  elementBonus: 0.1, // Elementalism: +10% damage with your elements
  arcaneBonus: 0.08, // Arcane Spark: +8% arcane damage
  intPower: 0.012, // spell power per Intelligence point above 10
  staffPower: 0.2, // casting with a staff in hand
  chainShare: 0.4, // Chain Spark: bolts jump to 2 more foes for 40%
  chainJumps: 2,
  // A 2nd element opens at proficiency III and LV 12, a 3rd at V and LV 18; each costs 2 AP.
  extraElements: Object.freeze([{ rank: 3, level: 12 }, { rank: 5, level: 18 }]),
  extraElementAp: 2,
});

// shape: "bolt" (one target), "area" (around the target), "linger" (a curse
// that burns over time), "channel" (A3), "meteor" (A3a: lands after 2 s).
// `unlock`: the element proficiency rank (1-5) that teaches it.
export const SPELLS = Object.freeze({
  arcane_bolt: { name: "Arcane Bolt", element: "arcane", shape: "bolt", power: 1.0, mana: 10, cooldown: 4, range: 300, unlock: 1, node: "A1" },
  arcane_channel: { name: "Arcane Channel", element: "arcane", shape: "bolt", power: 1.75, mana: 24, cooldown: 20, range: 320, unlock: 1, node: "A3" },
  meteor: { name: "Meteor", element: "arcane", shape: "meteor", power: 1.8, mana: 34, cooldown: 25, range: 340, radius: 90, maxTargets: 5, delay: 2, unlock: 1, node: "A3a" },
  ember_bolt: { name: "Ember Bolt", element: "fire", shape: "bolt", power: 1.15, mana: 12, cooldown: 5, range: 300, unlock: 1 },
  cinder_field: { name: "Cinder Field", element: "fire", shape: "area", power: 0.75, mana: 20, cooldown: 9, range: 280, radius: 70, unlock: 2 },
  flare_bind: { name: "Flare Bind", element: "fire", shape: "linger", power: 0.7, mana: 19, cooldown: 10, range: 300, seconds: 6, unlock: 4 },
  rime_lance: { name: "Rime Lance", element: "ice", shape: "bolt", power: 1.2, mana: 14, cooldown: 5, range: 300, unlock: 1 },
  shard_burst: { name: "Shard Burst", element: "ice", shape: "area", power: 0.9, mana: 22, cooldown: 9, range: 280, radius: 70, unlock: 2 },
  glacier_bind: { name: "Glacier Bind", element: "ice", shape: "linger", power: 0.65, mana: 18, cooldown: 10, range: 300, seconds: 6, unlock: 4 },
  venom_spike: { name: "Venom Spike", element: "poison", shape: "bolt", power: 1.05, mana: 12, cooldown: 5, range: 300, unlock: 1 },
  toxic_cloud: { name: "Toxic Cloud", element: "poison", shape: "area", power: 0.65, mana: 22, cooldown: 9, range: 280, radius: 75, unlock: 2 },
  venom_mark: { name: "Venom Mark", element: "poison", shape: "linger", power: 0.8, mana: 19, cooldown: 10, range: 300, seconds: 7, unlock: 4 },
  arc_surge: { name: "Arc Surge", element: "electric", shape: "bolt", power: 1.3, mana: 16, cooldown: 6, range: 300, unlock: 1 },
  chain_pulse: { name: "Chain Pulse", element: "electric", shape: "area", power: 0.85, mana: 24, cooldown: 9, range: 280, radius: 70, unlock: 2 },
  static_snare: { name: "Static Snare", element: "electric", shape: "linger", power: 0.72, mana: 21, cooldown: 10, range: 300, seconds: 6, unlock: 4 },
  thought_lance: { name: "Thought Lance", element: "mind", shape: "bolt", power: 1.05, mana: 12, cooldown: 5, range: 300, unlock: 1 },
  nightmare_field: { name: "Nightmare Field", element: "mind", shape: "area", power: 0.62, mana: 22, cooldown: 9, range: 280, radius: 75, unlock: 2 },
  dread_haze: { name: "Dread Haze", element: "mind", shape: "linger", power: 0.55, mana: 19, cooldown: 10, range: 300, seconds: 6, unlock: 4 },
  // Support schools. `power` is a share of the target's max HP (heals, shields),
  // or the buff's strength (Empower: damage; Aegis: damage taken), before scaling.
  mend: { name: "Mend", element: "restoration", shape: "heal", power: 0.18, mana: 14, cooldown: 6, range: 300, unlock: 1, support: true },
  renewal: { name: "Renewal", element: "restoration", shape: "renew", power: 0.12, mana: 26, cooldown: 14, radius: 220, seconds: 6, unlock: 2, support: true },
  lifeline: { name: "Lifeline", element: "restoration", shape: "lifeline", power: 0.25, mana: 30, cooldown: 30, range: 300, seconds: 8, unlock: 4, support: true },
  barrier: { name: "Barrier", element: "warding", shape: "barrier", power: 0.15, mana: 14, cooldown: 7, range: 300, seconds: 10, unlock: 1, support: true },
  empower: { name: "Empower", element: "warding", shape: "empower", power: 0.12, speed: 0.1, mana: 24, cooldown: 20, radius: 220, seconds: 8, unlock: 2, support: true },
  aegis: { name: "Aegis", element: "warding", shape: "aegis", power: 0.15, mana: 28, cooldown: 24, radius: 220, seconds: 6, unlock: 4, support: true },
});

// What each element's spells do besides damage.
export const ELEMENT_EFFECTS = Object.freeze({
  fire: "burns for 30% more over 3 s",
  ice: "slows by 30% for 2.5 s",
  poison: "poisons for 40% more over 5 s",
  electric: "arcs to one more foe for 50%",
  mind: "stuns for 0.6 s",
  arcane: "pure arcane damage",
  restoration: "heals allies; spell heals ignore the regeneration limit",
  warding: "shields and strengthens allies",
});

// Shields from Barrier stack up to this share of a hero's max HP.
export const SHIELD_CAP = 0.3;

export function emptyMagic() {
  return { elements: [], casts: {} };
}

const owns = (hero, id) => (hero?.progression?.ownedNodeIds || []).includes(id);

export function canCast(hero) {
  return owns(hero, "A1");
}

export function heroMagic(hero) {
  return hero?.magic && typeof hero.magic === "object" ? hero.magic : emptyMagic();
}

// Successful casts of one spell, and of all an element's spells.
export function spellCasts(hero, spellId) {
  return Math.max(0, Number(heroMagic(hero).casts?.[spellId]) || 0);
}

export function elementCasts(hero, element) {
  return Object.entries(heroMagic(hero).casts || {})
    .filter(([id]) => SPELLS[id]?.element === element)
    .reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
}

// Rank 1-5 for a number of successful casts.
export function rankFor(casts) {
  let rank = 1;
  RANK_CASTS.forEach((needed, index) => { if (casts >= needed) rank = index + 1; });
  return rank;
}

export function nextRankAt(casts) {
  return RANK_CASTS.find((needed) => needed > casts) ?? null;
}

export function proficiency(hero, element) {
  return rankFor(elementCasts(hero, element));
}

// The elements a hero casts with: Arcane (with A1) and the schools learned.
export function heroElements(hero) {
  if (!canCast(hero)) return [];
  return ["arcane", ...heroMagic(hero).elements.filter((element) => SCHOOLS.includes(element))];
}

// Spells a hero can cast right now.
export function knownSpells(hero) {
  const elements = heroElements(hero);
  return Object.entries(SPELLS)
    .filter(([, spell]) => elements.includes(spell.element) && (!spell.node || owns(hero, spell.node)))
    .filter(([, spell]) => proficiency(hero, spell.element) >= spell.unlock)
    .map(([id, spell]) => ({ id, ...spell, rank: rankFor(spellCasts(hero, id)), casts: spellCasts(hero, id) }));
}

function intelligence(hero) {
  return Number(hero?.combat?.stats?.intelligence) || 10;
}

export function castSuccessChance(hero, element) {
  const chance = MAGIC.baseSuccess + MAGIC.successPerInt * Math.max(0, intelligence(hero) - 10)
    + MAGIC.successPerLuck * effectiveLuck(hero?.combat?.stats?.luck) + MAGIC.successPerRank * (proficiency(hero, element) - 1);
  return Math.min(MAGIC.maxSuccess, Math.max(0.05, chance));
}

// Damage multiplier for a spell (on the hero's attack), before the element's effects.
export function spellPower(hero, spellId, { staff = false } = {}) {
  const spell = SPELLS[spellId];
  const rank = rankFor(spellCasts(hero, spellId));
  const elementBonus = spell.element === "arcane" ? MAGIC.arcaneBonus : MAGIC.elementBonus;
  return spell.power * (1 + MAGIC.rankPower * (rank - 1)) * (1 + elementBonus)
    * (1 + MAGIC.intPower * Math.max(0, intelligence(hero) - 10)) * (staff ? 1 + MAGIC.staffPower : 1);
}

// Strength of a support spell (a share of max HP, or a buff), scaled like
// spell damage: spell rank, the school bonus, Intelligence and a staff.
export function supportPower(hero, spellId, { staff = false } = {}) {
  const spell = SPELLS[spellId];
  const rank = rankFor(spellCasts(hero, spellId));
  return spell.power * (1 + MAGIC.rankPower * (rank - 1)) * (1 + MAGIC.elementBonus)
    * (1 + MAGIC.intPower * Math.max(0, intelligence(hero) - 10)) * (staff ? 1 + MAGIC.staffPower : 1);
}

export function spellRadius(hero, spellId) {
  const spell = SPELLS[spellId];
  return (spell.radius || 0) * (1 + MAGIC.rankArea * (rankFor(spellCasts(hero, spellId)) - 1));
}

export function maxMana(hero) {
  if (!canCast(hero)) return 0;
  return Math.round(60 + 4 * Math.max(0, intelligence(hero) - 10) + 2 * (Number(hero?.progression?.level) || 1));
}

// Can the hero learn another element now? Returns { ok, reason, cost }.
export function elementSlot(hero) {
  const learned = heroMagic(hero).elements;
  if (!owns(hero, "A2")) return { ok: false, reason: "needs_elementalism" };
  if (learned.length === 0) return { ok: true, cost: 0 };
  const next = MAGIC.extraElements[learned.length - 1];
  if (!next) return { ok: false, reason: "all_elements" };
  const best = Math.max(...learned.map((element) => proficiency(hero, element)));
  if (best < next.rank) return { ok: false, reason: "proficiency", rank: next.rank };
  if ((hero.progression?.level || 1) < next.level) return { ok: false, reason: "level", level: next.level };
  if ((hero.progression?.ap || 0) < MAGIC.extraElementAp) return { ok: false, reason: "ap", cost: MAGIC.extraElementAp };
  return { ok: true, cost: MAGIC.extraElementAp };
}

// Learn an element (the first comes with Elementalism; later ones cost AP).
// Returns { ok, hero } with a copy of the hero.
export function learnElement(hero, element) {
  if (!SCHOOLS.includes(element) || heroMagic(hero).elements.includes(element)) return { ok: false, reason: "invalid_element" };
  const slot = elementSlot(hero);
  if (!slot.ok) return slot;
  const next = structuredClone(hero);
  next.magic = { ...emptyMagic(), ...heroMagic(hero), elements: [...heroMagic(hero).elements, element] };
  next.progression.ap -= slot.cost;
  return { ok: true, hero: next };
}

// Add a fight's successful casts ({ spellId: count }) to a hero. Mutates the
// hero; returns what ranked up as [{ kind: "spell"|"element", id, rank }].
export function recordCasts(hero, successes) {
  hero.magic = { ...emptyMagic(), ...heroMagic(hero) };
  hero.magic.casts = { ...hero.magic.casts };
  const before = Object.fromEntries(Object.keys(ELEMENTS).map((element) => [element, proficiency(hero, element)]));
  const ups = [];
  for (const [id, count] of Object.entries(successes || {})) {
    if (!SPELLS[id] || !(count > 0)) continue;
    const old = rankFor(spellCasts(hero, id));
    hero.magic.casts[id] = spellCasts(hero, id) + count;
    const now = rankFor(hero.magic.casts[id]);
    if (now > old) ups.push({ kind: "spell", id, rank: now });
  }
  for (const element of Object.keys(ELEMENTS)) {
    const now = proficiency(hero, element);
    if (now > before[element]) ups.push({ kind: "element", id: element, rank: now });
  }
  return ups;
}
