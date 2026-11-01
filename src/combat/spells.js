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
  shadow: { name: "Shadow", color: "#8EA3C7" },
  wild: { name: "Wild Magic", color: "#9BE15D" },
});
export const SCHOOLS = Object.freeze(["fire", "ice", "poison", "electric", "mind", "restoration", "warding", "shadow", "wild"]);
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
  // Shadow, Wild Magic and Dominate (owner-approved, Nov 2026). Control spells:
  // `seconds` for ordinary foes; elites get half (`CONTROL.elite`), bosses `boss`.
  veil: { name: "Veil", element: "shadow", shape: "veil", power: 0.4, mana: 16, cooldown: 12, range: 300, seconds: 3, unlock: 1, support: true },
  terror: { name: "Terror", element: "shadow", shape: "terror", power: 0.4, mana: 22, cooldown: 14, range: 300, radius: 80, seconds: 2.5, boss: 0.5, unlock: 2 },
  confusion: { name: "Confusion", element: "shadow", shape: "confusion", power: 0, mana: 24, cooldown: 16, range: 300, seconds: 4, boss: 0, unlock: 4 },
  ensnare: { name: "Ensnare", element: "wild", shape: "ensnare", power: 0.5, mana: 12, cooldown: 7, range: 300, seconds: 2, boss: 0.5, unlock: 1 },
  thornfield: { name: "Thornfield", element: "wild", shape: "thornfield", power: 0.6, mana: 22, cooldown: 12, range: 280, radius: 70, seconds: 1.5, boss: 0.4, bleed: 0.3, unlock: 2 },
  summon_beast: { name: "Summon Spirit Beast", element: "wild", shape: "summon", power: 1, mana: 34, cooldown: 30, seconds: 10, hp: 0.3, unlock: 4, support: true },
  dominate: { name: "Dominate", element: "mind", shape: "dominate", power: 0, mana: 40, cooldown: 40, range: 300, seconds: 6, boss: 0, unlock: 5 },
});

// How long controls hold on tougher foes, and the mana an unattended caster
// keeps back before a big spell (Dominate, a summon) so it can still heal or shield.
export const CONTROL = Object.freeze({ elite: 0.5, manaReserve: 20 });

// The spirit beast a hero summons, from their trait (owner-approved, Nov 2026).
// The Spellbook can pick another (hero.magic.beast). At Wild Magic V it's a dragon.
export const BEASTS = Object.freeze({
  tiger: { name: "Tiger", color: "#FFB547", range: 28, interval: 1, damage: 0.6, pounce: 1.5, moveSpeed: 190 },
  wolf: { name: "Wolf", color: "#CBD5E1", range: 26, interval: 0.9, damage: 0.45, moveSpeed: 185, taunt: { every: 4, seconds: 2, radius: 80 } },
  hawk: { name: "Hawk", color: "#FBBF24", range: 200, interval: 0.8, damage: 0.35, airborne: true },
  bat: { name: "Bat", color: "#C4B5FD", range: 30, interval: 0.8, damage: 0.35, lifelink: 0.5, moveSpeed: 200, airborne: true },
  rat: { name: "Rat Swarm", color: "#D6B38A", range: 22, interval: 0.6, damage: 0.15, count: 3, moveSpeed: 170 },
  wasp: { name: "Wasp", color: "#FDE047", range: 30, interval: 0.9, damage: 0.3, poison: 0.4, moveSpeed: 210, airborne: true },
  spider: { name: "Spider", color: "#A78BFA", range: 32, interval: 1, damage: 0.3, web: { every: 4, seconds: 1 }, moveSpeed: 160 },
  dragon: { name: "Dragon", color: "#FF6A1A", range: 90, interval: 2, damage: 0.7, cone: 90, burn: 0.3, moveSpeed: 150, airborne: true },
});
export const BEAST_KEYS = Object.freeze(Object.keys(BEASTS).filter((key) => key !== "dragon"));
const BEAST_BY_TRAIT = Object.freeze({
  brawny: "tiger", berserker: "tiger",
  stalwart: "wolf", ironhide: "wolf", steadfast: "wolf", charismatic: "wolf", inspiring: "wolf", optimist: "wolf",
  nimble: "hawk", swift: "hawk", tracker: "hawk", trailwise: "hawk",
  loud: "bat", paranoid: "bat",
  scavenger: "rat", greedy: "rat", frail: "rat",
  reckless: "wasp",
  bloodhound: "spider", medic: "spider",
  // Traits not in the approved list, given the closest fit (Sam can change these):
  keenEye: "hawk", keenEared: "bat", nightEyes: "bat", lightSleeper: "bat", quickHands: "spider",
  sureFooted: "wolf", fastLearner: "wolf", treasureHunter: "rat", glassCannon: "wasp",
});

// The beast this hero summons now.
export function heroBeast(hero) {
  if (proficiency(hero, "wild") >= 5) return "dragon";
  const chosen = heroMagic(hero).beast;
  if (BEASTS[chosen] && chosen !== "dragon") return chosen;
  for (const trait of hero?.traits || []) if (BEAST_BY_TRAIT[trait]) return BEAST_BY_TRAIT[trait];
  return "wolf";
}

// Pick another beast in the Spellbook (null goes back to the trait's). Returns a copy.
export function chooseBeast(hero, beast) {
  if (beast != null && !BEAST_KEYS.includes(beast)) return { ok: false, reason: "invalid_beast" };
  const next = structuredClone(hero);
  next.magic = { ...emptyMagic(), ...heroMagic(hero), beast: beast || undefined };
  if (!beast) delete next.magic.beast;
  return { ok: true, hero: next };
}

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
  shadow: "hides allies; frightens and confuses foes",
  wild: "roots foes; calls a spirit beast",
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
