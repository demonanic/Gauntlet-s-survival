// Gauntlet hero traits: every hero is born with one. Combat traits are read by
// the engine (classlessHeroDerived and the hit/heal/kill paths); xp and gold
// traits are applied by the guild when an encounter resolves.

export const TRAITS = Object.freeze({
  brawny: { key: "brawny", name: "Brawny", desc: "+12% max HP.", effects: { maxHp: 0.12 } },
  keenEye: { key: "keenEye", name: "Keen Eye", desc: "+6% crit chance.", effects: { critChance: 0.06 } },
  nimble: { key: "nimble", name: "Nimble", desc: "+8 agility (dodge).", effects: { agility: 8 } },
  ironhide: { key: "ironhide", name: "Ironhide", desc: "+8 defense.", effects: { defense: 8 } },
  berserker: { key: "berserker", name: "Berserker", desc: "+20% damage while below half HP.", effects: { berserk: 0.2 } },
  quickHands: { key: "quickHands", name: "Quick Hands", desc: "+8% attack speed.", effects: { attackSpeed: 0.08 } },
  medic: { key: "medic", name: "Field Medic", desc: "Bandages and potions heal 40% more.", effects: { healBonus: 0.4 } },
  fastLearner: { key: "fastLearner", name: "Fast Learner", desc: "+25% XP.", effects: { xpBonus: 0.25 } },
  treasureHunter: { key: "treasureHunter", name: "Treasure Hunter", desc: "Kills drop +50% gold.", effects: { goldFind: 0.5 } },
  glassCannon: { key: "glassCannon", name: "Glass Cannon", desc: "+15% damage, -10% max HP.", effects: { damage: 0.15, maxHp: -0.1 } },
  stalwart: { key: "stalwart", name: "Stalwart", desc: "-8% damage taken.", effects: { damageTaken: 0.08 } },
  swift: { key: "swift", name: "Swift", desc: "+20% movement speed.", effects: { moveSpeed: 0.2 } },
});

export const TRAIT_KEYS = Object.freeze(Object.keys(TRAITS));

export function rollTrait(rng = Math.random) {
  return TRAIT_KEYS[Math.floor(rng() * TRAIT_KEYS.length)];
}

const EMPTY = Object.freeze({
  maxHp: 0, critChance: 0, agility: 0, defense: 0, berserk: 0, attackSpeed: 0, healBonus: 0,
  xpBonus: 0, goldFind: 0, damage: 0, damageTaken: 0, moveSpeed: 0,
});

// Summed trait effects for one hero, plus the guild's Hall of Legends bonuses
// stamped on the hero (hero.guildBonus: { damage, maxHp }) and, during an
// expedition fight, the party's morale (hero.moraleBonus: { damage }).
export function heroTraitEffects(hero) {
  const total = { ...EMPTY };
  for (const key of Array.isArray(hero?.traits) ? hero.traits : []) {
    for (const [stat, value] of Object.entries(TRAITS[key]?.effects || {})) total[stat] += value;
  }
  total.damage += Number(hero?.guildBonus?.damage) || 0;
  total.maxHp += Number(hero?.guildBonus?.maxHp) || 0;
  total.damage += Number(hero?.moraleBonus?.damage) || 0;
  return total;
}
