// Gauntlet spells (the Arcana branch). Not every hero casts: Arcane Spark (A1)
// opens casting and gives Arcane Bolt; Elementalism (A2) adds an element and
// its spells. Casts can fizzle: success depends on Intelligence, a little
// Luck and the hero's proficiency in the element. Only successful casts count
// toward a spell's rank (I-V) and the element's proficiency (I-V), which
// unlock the element's other spells and, later, a second and third element.
// Owner-approved design (Oct 2026).
import { effectiveLuck } from "./luck";
import { heroTraitEffects } from "./traits";

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
  enchanting: { name: "Enchanting", color: "#F472B6" },
  conjuration: { name: "Conjuration", color: "#60A5FA" },
});
export const SCHOOLS = Object.freeze(["fire", "ice", "poison", "electric", "mind", "restoration", "warding", "shadow", "wild", "enchanting", "conjuration"]);
// Schools whose spells help the party instead of hurting a foe (owner-approved,
// Nov 2026). Their spells need no enemy target.
export const SUPPORT_SCHOOLS = Object.freeze(["restoration", "warding", "enchanting"]);

// Successful casts needed for ranks I-V (spells and element proficiency alike).
export const RANK_CASTS = Object.freeze([0, 15, 45, 100, 200]);
export const ROMAN = Object.freeze(["I", "II", "III", "IV", "V"]);

// One spell at a time. Auto-cast waits `autoGap` after any cast. Casting by
// hand inside `strainWindow` of the last cast strains the caster: each quick
// cast in a row costs `strainPerCast` success (stacking). Taps while the caster
// is busy go in a queue (up to `queueCap`), which plays out strain-free.
export const CASTING = Object.freeze({
  lock: 0.8, // the swing of one cast
  autoGap: 2.5,
  strainWindow: 2.5,
  strainPerCast: 0.2,
  queueCap: 3,
});

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
  // Hexes (owner-approved, Nov 2026): no damage, they weaken foes. Blind,
  // Enfeeble and Disarm take every foe within `radius` of the target; Silence
  // and Expose one. `strength` (Blind: chance its attacks miss; Enfeeble: damage
  // cut) and Silence and Disarm's `seconds` are full on ordinary foes and elites,
  // half on bosses (`HEX`). Expose: the party's main kind of damage hits harder.
  blind: { name: "Blind", element: "shadow", shape: "blind", power: 0, strength: 0.75, mana: 16, cooldown: 12, range: 300, radius: 70, seconds: 6, unlock: 1, desc: "foes around the target miss 75% of the time for 6 s" },
  disarm: { name: "Disarm", element: "shadow", shape: "disarm", power: 0, mana: 18, cooldown: 14, range: 300, radius: 70, seconds: 3, unlock: 2, desc: "foes around the target can't attack for 3 s" },
  enfeeble: { name: "Enfeeble", element: "mind", shape: "enfeeble", power: 0, strength: 0.75, mana: 16, cooldown: 12, range: 300, radius: 70, seconds: 6, unlock: 1, desc: "foes around the target deal 75% less damage for 6 s" },
  silence: { name: "Silence", element: "mind", shape: "silence", power: 0, mana: 18, cooldown: 14, range: 300, seconds: 5, unlock: 2, desc: "no abilities, spells, heals or summons for 5 s" },
  // Enchanting (spells part 3, Nov 2026) and two Warding wards: buffs with fixed
  // strengths (`amount`), not scaled by rank. Haste and True Aim take every ally
  // within `radius` of the caster (owner's call after measuring); Insight the
  // party; the rest one ally.
  haste: { name: "Haste", element: "enchanting", shape: "haste", power: 0, amount: 0.3, mana: 18, cooldown: 14, radius: 220, seconds: 10, unlock: 1, support: true, desc: "allies nearby attack and move 30% faster for 10 s" },
  true_aim: { name: "True Aim", element: "enchanting", shape: "true_aim", power: 0, amount: 0.15, mana: 16, cooldown: 12, radius: 220, seconds: 10, unlock: 1, support: true, desc: "allies nearby can't miss in the dark, and +15% crit chance, for 10 s" },
  endless_quiver: { name: "Endless Quiver", element: "enchanting", shape: "quiver", power: 0, mana: 18, cooldown: 20, range: 300, seconds: 10, unlock: 2, support: true, desc: "a bow ally shoots without using arrows (even with none left) for 10 s" },
  kindred_bond: { name: "Kindred Bond", element: "enchanting", shape: "kindred", power: 0, amount: 0.5, guard: 0.3, mana: 20, cooldown: 20, range: 300, seconds: 15, unlock: 2, support: true, desc: "an ally's familiar deals 50% more and takes 30% less for 15 s" },
  insight: { name: "Insight", element: "enchanting", shape: "insight", power: 0, amount: 0.25, mana: 24, cooldown: 60, unlock: 4, support: true, desc: "the party earns 25% more XP from the rest of this fight (once a fight)" },
  iron_skin: { name: "Iron Skin", element: "warding", shape: "iron_skin", power: 0, amount: 0.75, mana: 22, cooldown: 25, range: 300, seconds: 6, unlock: 2, support: true, desc: "an ally takes 75% less from melee hits and arrows for 6 s" },
  spellguard: { name: "Spellguard", element: "warding", shape: "spellguard", power: 0, amount: 0.75, mana: 22, cooldown: 25, range: 300, seconds: 6, unlock: 2, support: true, desc: "an ally takes 75% less from magic bolts and bombs for 6 s" },
  // Conjuration (spells part 4, Nov 2026). Summons that fight beside the
  // caster and stack with a spirit beast (owner's call). `damage`:
  // each hit as a share of the caster's attack, before spell power.
  // Spectral Blades: one sword per spell rank; they can't be hit, and cut every
  // foe within `reach` of them every `interval` s. Blades at 15% and the
  // elemental at 80% / 40% HP / 24 mana: owner's picks after measuring.
  spectral_blades: { name: "Spectral Blades", element: "conjuration", shape: "blades", power: 1, damage: 0.15, reach: 22, interval: 1, mana: 20, cooldown: 18, seconds: 10, unlock: 1, support: true, desc: "one spinning sword per spell rank (up to 5) for 10 s; they can't be hit and cut foes that come close" },
  summon_elemental: { name: "Summon Elemental", element: "conjuration", shape: "elemental", power: 1, damage: 0.8, hp: 0.4, mana: 24, cooldown: 30, seconds: 12, unlock: 4, support: true, desc: "an elemental of the caster's best other school fights for 12 s" },
  // Mirror Self (Shadow V): a fixed 60% copy (not scaled by rank); every foe
  // on the caster but a boss turns on it (owner's pick after measuring).
  mirror_self: { name: "Mirror Self", element: "shadow", shape: "mirror", power: 0, damage: 0.6, hp: 0.6, pull: 1, mana: 30, cooldown: 35, seconds: 8, unlock: 5, support: true, desc: "a 60% copy of the caster fights for 8 s; every foe on the caster but a boss turns on it" },
  expose: { name: "Expose", element: "mind", shape: "expose", power: 0, bonus: 0.3, mana: 20, cooldown: 16, range: 300, seconds: 6, unlock: 4, desc: "the party's main kind of damage hits it 30% harder for 6 s" },
});

// How much of a hex an elite or a boss takes (strength, or Silence/Disarm time).
// Owner's pick after measuring (Nov 2026): area hexes, elites full, bosses half.
export const HEX = Object.freeze({ elite: 1, boss: 0.5 });

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
  mind: "stuns for 0.6 s; hexes weaken foes",
  arcane: "pure arcane damage",
  restoration: "heals allies; spell heals ignore the regeneration limit",
  warding: "shields and strengthens allies",
  shadow: "hides allies; frightens, confuses, blinds and disarms foes; at V, a mirror copy",
  wild: "roots foes; calls a spirit beast",
  enchanting: "speeds, sharpens and strengthens allies",
  conjuration: "spinning blades and an elemental fight beside the caster",
});

// Reactions (combos, Nov 2026, owner's design): a hit of one school on a foe
// carrying another school's effect can set one off. The chance is
// `chance.base` plus `chance.perRank` for each rank of the hitting school past
// I (30% at I, 50% at V); one reaction per foe every `cooldown` s; on bosses a
// reaction's damage is halved and Nightmare doesn't frighten. Each uses up
// the effect that set it off (heroes/reactions.js).
//   Shatter: Lightning on a slowed foe: the hit again at `bonus` share.
//   Ignite: Fire on a poisoned foe: its remaining poison lands at once at
//     `burst`, and `splash` of that hits foes within `radius`.
//   Steam: Ice on a burning foe: the burn goes out; foes within `radius` miss
//     `blind` of their attacks for `seconds`.
//   Wildfire: Fire on a rooted foe: foes within `radius` (up to `max`) catch a
//     burn worth `burn` of the hit over 3 s.
//   Nightmare: a Shadow spell on a stunned or confused foe: `burst` of the
//     caster's attack, and it flees in fear for `seconds`.
export const REACTIONS = Object.freeze({
  chance: Object.freeze({ base: 0.3, perRank: 0.05 }),
  cooldown: 4,
  boss: 0.5,
  shatter: Object.freeze({ name: "Shatter", by: "electric", bonus: 0.5 }),
  ignite: Object.freeze({ name: "Ignite", by: "fire", burst: 1.5, splash: 0.5, radius: 60 }),
  steam: Object.freeze({ name: "Steam", by: "ice", blind: 0.3, seconds: 2, radius: 70 }),
  wildfire: Object.freeze({ name: "Wildfire", by: "fire", burn: 0.5, radius: 70, max: 4 }),
  nightmare: Object.freeze({ name: "Nightmare", by: "shadow", burst: 0.6, seconds: 2 }),
});

// Summon Elemental: the kind comes from the caster's best other school (highest
// proficiency; ties go to the one learned first; none: Arcane). Each hits with
// its school's touch. Support schools' elementals hit for half and help allies
// within 120 every second instead: Restoration heals 3% of max HP, Warding
// shields 2% (up to SHIELD_CAP), Enchanting has them attack and move 10% faster.
export const ELEMENTALS = Object.freeze({
  arcane: { range: 150, moveSpeed: 150 },
  fire: { range: 30, moveSpeed: 160, burn: 0.3 },
  ice: { range: 150, moveSpeed: 140, slow: 0.3 },
  poison: { range: 30, moveSpeed: 160, poison: 0.4 },
  electric: { range: 150, moveSpeed: 170, arc: 0.5 },
  mind: { range: 150, moveSpeed: 140, stun: 0.3 },
  shadow: { range: 30, moveSpeed: 180, blind: 0.3 },
  wild: { range: 30, moveSpeed: 160, web: Object.freeze({ every: 4, seconds: 1 }) },
  restoration: { range: 150, moveSpeed: 150, support: true, pulse: Object.freeze({ heal: 0.03 }) },
  warding: { range: 30, moveSpeed: 140, support: true, pulse: Object.freeze({ shield: 0.02 }) },
  enchanting: { range: 150, moveSpeed: 150, support: true, pulse: Object.freeze({ haste: 0.1 }) },
});
export const ELEMENTAL_PULSE_RADIUS = 120;

// The school a hero's elemental comes from.
export function heroElementalSchool(hero) {
  let best = null, bestRank = 0;
  for (const element of heroMagic(hero).elements || []) {
    if (element === "conjuration" || !ELEMENTALS[element]) continue;
    const rank = proficiency(hero, element);
    if (rank > bestRank) { best = element; bestRank = rank; }
  }
  return best || "arcane";
}


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
    + MAGIC.successPerLuck * effectiveLuck(hero?.combat?.stats?.luck) + MAGIC.successPerRank * (proficiency(hero, element) - 1)
    + (heroTraitEffects(hero).castSuccess || 0);
  return Math.min(MAGIC.maxSuccess, Math.max(0.05, chance));
}

// Damage multiplier for a spell (on the hero's attack), before the element's effects.
export function spellPower(hero, spellId, { staff = false } = {}) {
  const spell = SPELLS[spellId];
  const rank = rankFor(spellCasts(hero, spellId));
  const elementBonus = spell.element === "arcane" ? MAGIC.arcaneBonus : MAGIC.elementBonus;
  return spell.power * (1 + MAGIC.rankPower * (rank - 1)) * (1 + elementBonus)
    * (1 + MAGIC.intPower * Math.max(0, intelligence(hero) - 10)) * (staff ? 1 + MAGIC.staffPower : 1)
    * (1 + (heroTraitEffects(hero).spellPower || 0));
}

// Strength of a support spell (a share of max HP, or a buff), scaled like
// spell damage: spell rank, the school bonus, Intelligence and a staff.
export function supportPower(hero, spellId, { staff = false } = {}) {
  const spell = SPELLS[spellId];
  const rank = rankFor(spellCasts(hero, spellId));
  return spell.power * (1 + MAGIC.rankPower * (rank - 1)) * (1 + MAGIC.elementBonus)
    * (1 + MAGIC.intPower * Math.max(0, intelligence(hero) - 10)) * (staff ? 1 + MAGIC.staffPower : 1)
    * (1 + (heroTraitEffects(hero).supportPower || 0));
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
