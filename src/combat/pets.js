// Familiars: a pet that travels with one hero and helps in battle on its own.
// Each species has a role; each pet is born with one quality, and at levels
// 3, 6 and 9 the player picks one of two upgrades ("mods"). Pets can't be hurt:
// they're too quick (or too stubborn) for enemies to pin down.
//
// `attack` describes how the pet fights (null for support pets); effects use
// a small shared vocabulary the engine reads (see petStats):
//   damage, speed      multiply its attacks
//   slow, bleed, burn  on-hit effects (slow share; dot share of the hit)
//   mark               its target takes this much more damage from its partner
//   heal               support: share of the partner's max HP restored per pulse
//   lifelink           share of its damage that heals its partner
//   guard, shield      partner takes less damage / gains a shield every 8s
// `road` effects join the party's road qualities (see combat/traits.js);
// hazardDodge and envDrain stay with the pet's own partner.

export const PET_SPECIES = Object.freeze({
  wolf: {
    key: "wolf", name: "Wolf", role: "Hunter", color: "#CBD5E1", price: 150,
    desc: "Lunges at whatever its partner is fighting.",
    attack: { range: 26, interval: 1.2, damage: 6, speed: 175 },
    mods: {
      3: [{ id: "fangs", name: "Sharper Fangs", desc: "+25% bite damage.", effects: { damage: 0.25 } },
        { id: "pack", name: "Pack Instinct", desc: "+20% bite speed.", effects: { speed: 0.2 } }],
      6: [{ id: "hamstring", name: "Hamstring", desc: "Bites slow foes 30%.", effects: { slow: 0.3 } },
        { id: "bloodbond", name: "Blood Bond", desc: "20% of bite damage heals its partner.", effects: { lifelink: 0.2 } }],
      9: [{ id: "alpha", name: "Alpha", desc: "+35% bite damage.", effects: { damage: 0.35 } },
        { id: "rend", name: "Rend", desc: "Bites bleed for 50% more over 3s.", effects: { bleed: 0.5 } }],
    },
  },
  hawk: {
    key: "hawk", name: "Hawk", role: "Scout", color: "#FBBF24", price: 150,
    desc: "Strikes from the air and marks prey for its partner. Spots ambushes on the road.",
    attack: { range: 230, interval: 1.6, damage: 4, mark: 0.1 },
    road: { spotAmbush: 0.1, stalkerDetect: 0.06 },
    mods: {
      3: [{ id: "talons", name: "Razor Talons", desc: "+30% strike damage.", effects: { damage: 0.3 } },
        { id: "eyes", name: "Hawk Eyes", desc: "Marked prey takes +8% more damage.", effects: { mark: 0.08 } }],
      6: [{ id: "dive", name: "Dive", desc: "+25% strike speed.", effects: { speed: 0.25 } },
        { id: "lookout", name: "Lookout", desc: "Spots more ambushes and stalkers.", road: { spotAmbush: 0.1, stalkerDetect: 0.08 } }],
      9: [{ id: "raptor", name: "Raptor", desc: "+40% strike damage.", effects: { damage: 0.4 } },
        { id: "hunter", name: "Hunter's Mark", desc: "Marked prey takes +12% more damage.", effects: { mark: 0.12 } }],
    },
  },
  imp: {
    key: "imp", name: "Imp", role: "Firestarter", color: "#FB7185", price: 200,
    desc: "Flings sparks that set foes alight.",
    attack: { range: 200, interval: 2, damage: 5, burn: 0.5 },
    mods: {
      3: [{ id: "kindling", name: "Kindling", desc: "+25% spark damage.", effects: { damage: 0.25 } },
        { id: "embers", name: "Lingering Embers", desc: "Burns deal 40% more.", effects: { burn: 0.4 } }],
      6: [{ id: "quickfire", name: "Quickfire", desc: "+25% spark speed.", effects: { speed: 0.25 } },
        { id: "warmth", name: "Hearth Spirit", desc: "Its warmth halves what harsh environments cost its partner on the road.", road: { envDrain: 0.5 } }],
      9: [{ id: "inferno", name: "Inferno", desc: "+40% spark damage.", effects: { damage: 0.4 } },
        { id: "wildfire", name: "Wildfire", desc: "Burns deal 60% more.", effects: { burn: 0.6 } }],
    },
  },
  sprite: {
    key: "sprite", name: "Sprite", role: "Healer", color: "#A7F3D0", price: 200,
    desc: "Mends its partner's wounds in battle. Its glow lifts spirits on the road.",
    attack: null,
    support: { heal: 0.03, interval: 3 },
    road: { moraleBase: 3 },
    mods: {
      3: [{ id: "bloom", name: "Bloom", desc: "Heals 1% more of max HP per pulse.", effects: { heal: 0.01 } },
        { id: "flutter", name: "Flutter", desc: "Heals 25% more often.", effects: { speed: 0.25 } }],
      6: [{ id: "ward", name: "Ward", desc: "Partner takes 5% less damage.", effects: { guard: 0.05 } },
        { id: "cheer", name: "Cheer", desc: "The party's mood settles higher.", road: { moraleBase: 5 } }],
      9: [{ id: "renewal", name: "Renewal", desc: "Heals 2% more of max HP per pulse.", effects: { heal: 0.02 } },
        { id: "sanctuary", name: "Sanctuary", desc: "Partner takes 8% less damage.", effects: { guard: 0.08 } }],
    },
  },
  tortoise: {
    key: "tortoise", name: "Stonebark Tortoise", role: "Guardian", color: "#86EFAC", price: 200,
    desc: "Shields its partner: they take less damage and gain a stone shield every few seconds.",
    attack: null,
    support: { guard: 0.06, shield: 0.05, interval: 8 },
    mods: {
      3: [{ id: "bark", name: "Thick Bark", desc: "Shields are 3% of max HP stronger.", effects: { shield: 0.03 } },
        { id: "steady", name: "Steady", desc: "Partner takes 3% less damage.", effects: { guard: 0.03 } }],
      6: [{ id: "moss", name: "Mossback", desc: "Shields come 25% more often.", effects: { speed: 0.25 } },
        { id: "rooted", name: "Rooted", desc: "Its partner dodges travel hazards far more often.", road: { hazardDodge: 0.2 } }],
      9: [{ id: "bastion", name: "Bastion", desc: "Shields are 5% of max HP stronger.", effects: { shield: 0.05 } },
        { id: "ancient", name: "Ancient Shell", desc: "Partner takes 5% less damage.", effects: { guard: 0.05 } }],
    },
  },
});
export const PET_SPECIES_KEYS = Object.freeze(Object.keys(PET_SPECIES));

// Born with one of these.
export const PET_QUALITIES = Object.freeze({
  fierce: { key: "fierce", name: "Fierce", desc: "+20% damage (or healing and shields).", effects: { damage: 0.2, heal: 0.006, shield: 0.01 } },
  quick: { key: "quick", name: "Quick", desc: "Acts 20% more often.", effects: { speed: 0.2 } },
  loyal: { key: "loyal", name: "Loyal", desc: "Its partner takes 4% less damage.", effects: { guard: 0.04 } },
  keenNose: { key: "keenNose", name: "Keen Nose", desc: "Sniffs out finds and things following the party.", road: { findChance: 0.15, stalkerDetect: 0.06 } },
  lucky: { key: "lucky", name: "Lucky", desc: "Gold finds on the road are 15% bigger.", road: { goldFind: 0.15 } },
  brave: { key: "brave", name: "Brave", desc: "Victories lift the party's spirits.", road: { moraleOnWin: 3 } },
});
export const PET_QUALITY_KEYS = Object.freeze(Object.keys(PET_QUALITIES));

export const PET_MAX_LEVEL = 10;
export const PET_MOD_LEVELS = Object.freeze([3, 6, 9]);
// Total XP to reach each level (index 0 = level 1).
export const PET_XP = Object.freeze([0, 60, 150, 280, 450, 680, 980, 1350, 1800, 2400]);
// Share of its partner's fight XP a pet earns.
export const PET_XP_SHARE = 0.5;

const add = (total, effects) => {
  for (const [key, value] of Object.entries(effects || {})) total[key] = (total[key] || 0) + value;
};

function chosenMods(pet) {
  const species = PET_SPECIES[pet?.species];
  if (!species) return [];
  return Object.entries(pet.mods || {})
    .map(([level, id]) => species.mods[level]?.find((mod) => mod.id === id))
    .filter(Boolean);
}

// Everything a pet does in battle, for a partner at `heroLevel`. Its damage
// grows with its own level and its partner's.
export function petStats(pet, heroLevel = 1) {
  const species = PET_SPECIES[pet?.species];
  if (!species) return null;
  const bonus = {};
  add(bonus, PET_QUALITIES[pet.quality]?.effects);
  for (const mod of chosenMods(pet)) add(bonus, mod.effects);
  const level = Math.max(1, Math.min(PET_MAX_LEVEL, pet.level || 1));
  const growth = (1 + 0.12 * (level - 1)) * (1 + 0.08 * (Math.max(1, heroLevel) - 1));
  const stats = { species: species.key, color: species.color, guard: Math.min(0.3, (species.support?.guard || 0) + (bonus.guard || 0)) };
  if (species.attack) {
    stats.attack = {
      range: species.attack.range,
      moveSpeed: species.attack.speed || 0,
      interval: species.attack.interval / (1 + (bonus.speed || 0)),
      damage: species.attack.damage * growth * (1 + (bonus.damage || 0)),
      mark: (species.attack.mark || 0) + (bonus.mark || 0),
      burn: (species.attack.burn || 0) * (1 + (bonus.burn || 0)),
      bleed: bonus.bleed || 0,
      slow: bonus.slow || 0,
      lifelink: bonus.lifelink || 0,
    };
  }
  if (species.support) {
    stats.support = {
      interval: species.support.interval / (1 + (bonus.speed || 0)),
      heal: species.support.heal ? species.support.heal + (bonus.heal || 0) : 0,
      shield: species.support.shield ? species.support.shield + (bonus.shield || 0) : 0,
    };
  }
  return stats;
}

// Road effects a pet brings (species, quality and chosen mods).
export function petRoadEffects(pet) {
  const total = {};
  add(total, PET_SPECIES[pet?.species]?.road);
  add(total, PET_QUALITIES[pet?.quality]?.road);
  for (const mod of chosenMods(pet)) add(total, mod.road);
  return total;
}
