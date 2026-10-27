// Nemesis enemies. A creature that knocks out a hero may rise as a named
// nemesis: it remembers who it beat, grows stronger over time and with every
// hero it downs, and waits for the party on later trips to its region. It
// may flee a losing fight to come back stronger. Killing it pays out.

export const NEMESIS = Object.freeze({
  // Chance a creature that downs a hero rises as a nemesis (always, if it
  // wiped the party).
  riseChance: 0.35,
  // Only from this region tier on: the Gutter stays a safe place to learn.
  fromTier: 2,
  // At most this many nemeses hunt the guild at once, one per region.
  maxActive: 3,
  maxLevel: 10,
  // Levels gained on its own, one every this many hours of real time.
  growthHours: 2,
  // Levels gained for each hero it downs, and for wiping the party.
  levelsPerKnockout: 1,
  levelsForWipe: 1,
  // Chance an encounter in its region is the nemesis instead (at most once a
  // trip), doubled when a hero it beat is in the party.
  appearChance: 0.12,
  // Stats on top of its region's scaling: ×hp and ×dmg at level 1, plus these
  // shares of the base per level after the first.
  hp: 3,
  hpPerLevel: 0.3,
  dmg: 1.3,
  dmgPerLevel: 0.08,
  // Below this share of its HP it may flee (once per fight), gaining a level.
  fleeBelow: 0.2,
  fleeChance: 0.5,
  // Gold per level for killing it (× the region's tier multiplier).
  rewardGold: 45,
  // Bonus XP per level for each hero in the party it once beat.
  vengeanceXp: 40,
  // Slain nemeses kept for the guild's records.
  keepSlain: 12,
});

// Abilities a nemesis picks up as it levels.
export const NEMESIS_TRAITS = Object.freeze([
  { id: "relentless", level: 3, name: "Relentless", text: "attacks 25% faster" },
  { id: "ironhide", level: 5, name: "Ironhide", text: "+25% HP" },
  { id: "regenerating", level: 7, name: "Regenerating", text: "heals 1% of its HP every second" },
  { id: "dread", level: 9, name: "Dread", text: "never flees; +15% damage" },
]);

const FIRST = ["Grak", "Murza", "Skarn", "Vellik", "Ozzra", "Thrug", "Kesh", "Ruvok", "Brakka", "Ilsith", "Gorm", "Zaddok", "Nhal", "Urkka"];
const EPITHETS = ["the Bonebreaker", "Gutripper", "the Grudge", "Skullsplitter", "the Unforgiving", "Hollowtooth",
  "the Hunter", "Blackmaw", "the Scarred", "Ironjaw", "the Widowmaker", "Rotfang", "the Patient", "Ashgrin"];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

export function nemesisName(rng = Math.random) {
  return `${pick(FIRST, rng)} ${pick(EPITHETS, rng)}`;
}

// A nemesis's level right now: what it has earned plus its growth over time.
export function nemesisLevel(nemesis, now) {
  const grown = Math.floor(Math.max(0, now - (nemesis.grewAt ?? now)) / (NEMESIS.growthHours * 3_600_000));
  return Math.min(NEMESIS.maxLevel, nemesis.level + grown);
}

export function nemesisTraits(level) {
  return NEMESIS_TRAITS.filter((trait) => level >= trait.level);
}

export function activeNemeses(state) {
  return (state.nemeses || []).filter((nemesis) => !nemesis.slainAt);
}

export function regionNemesis(state, regionId) {
  return activeNemeses(state).find((nemesis) => nemesis.regionId === regionId) || null;
}

// Settle time-based growth into the stored level, then add `levels`.
export function growNemesis(nemesis, levels, now) {
  nemesis.level = Math.min(NEMESIS.maxLevel, nemesisLevel(nemesis, now) + levels);
  nemesis.grewAt = now;
  return nemesis.level;
}

// A creature that downed `heroes` (names and ids) may rise as a nemesis.
// Returns the new nemesis, or null.
export function riseNemesis(state, { type, typeName, regionId, heroes, wiped }, now, rng = Math.random) {
  const active = activeNemeses(state);
  if (active.length >= NEMESIS.maxActive || active.some((nemesis) => nemesis.regionId === regionId)) return null;
  if (!wiped && rng() >= NEMESIS.riseChance) return null;
  const nemesis = {
    id: `nem_${now.toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`,
    type, typeName, regionId,
    name: nemesisName(rng),
    level: 1, grewAt: now, createdAt: now,
    victims: heroes.map((hero) => ({ id: hero.id, name: hero.name })),
    knockouts: heroes.length, fled: 0, met: 0,
  };
  (state.nemeses ||= []).push(nemesis);
  return nemesis;
}

// The nemesis downed more heroes (or wiped the party): it grows and remembers.
export function nemesisTriumphs(nemesis, heroes, wiped, now) {
  for (const hero of heroes) {
    if (!nemesis.victims.some((victim) => victim.id === hero.id)) nemesis.victims.push({ id: hero.id, name: hero.name });
  }
  nemesis.knockouts += heroes.length;
  return growNemesis(nemesis, heroes.length * NEMESIS.levelsPerKnockout + (wiped ? NEMESIS.levelsForWipe : 0), now);
}

export function slayNemesis(state, nemesis, heroIds, now) {
  nemesis.slainAt = now;
  nemesis.slainBy = heroIds;
  nemesis.level = nemesisLevel(nemesis, now);
  const slain = state.nemeses.filter((entry) => entry.slainAt).sort((a, b) => b.slainAt - a.slainAt);
  const drop = new Set(slain.slice(NEMESIS.keepSlain).map((entry) => entry.id));
  state.nemeses = state.nemeses.filter((entry) => !drop.has(entry.id));
}

// How often its encounter replaces an ordinary one on this trip.
export function nemesisAppearChance(nemesis, partyIds) {
  const grudge = nemesis.victims.some((victim) => partyIds.includes(victim.id));
  return NEMESIS.appearChance * (grudge ? 2 : 1);
}

// Combat stats for a nemesis of `level`, as multipliers on its base creature
// (on top of the region's scaling), plus engine flags.
export function nemesisStats(level) {
  const has = (id) => level >= NEMESIS_TRAITS.find((trait) => trait.id === id).level;
  return {
    hp: (NEMESIS.hp + NEMESIS.hpPerLevel * (level - 1)) * (has("ironhide") ? 1.25 : 1),
    dmg: (NEMESIS.dmg + NEMESIS.dmgPerLevel * (level - 1)) * (has("dread") ? 1.15 : 1),
    attackSpeed: has("relentless") ? 1.25 : 1,
    regen: has("regenerating") ? 0.01 : 0,
    fleeChance: has("dread") ? 0 : NEMESIS.fleeChance,
  };
}
