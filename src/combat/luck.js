// Luck: a stat bought with stat points like Attack or Defense. It never adds
// damage or HP; it tilts the odds. Everything it does is listed here, small,
// and kept inside the caps that already exist (crit chance 50%, agility dodge
// 35%), so it can't outgrow the stats it sits beside.
//
// Combat effects use the hero's own Luck. Party-wide odds (road events, loot,
// merchants) use the party's average Luck, so one lucky hero can't carry the
// whole group.

export const LUCK = Object.freeze({
  // Points past this count half (diminishing returns).
  softCap: 20,
  perPoint: Object.freeze({
    critChance: 0.002, // +0.2% crit chance (inside the 50% cap)
    dodge: 0.001, // +0.1% dodge (inside agility's 35% dodge cap)
    rareLoot: 0.02, // +2% weight on uncommon-or-better gear drops
    gambleLuck: 0.005, // +0.5% chance a gamble on the road goes your way
    findChance: 0.01, // finds turn up 1% more often
    rareChance: 0.02, // rare encounters (merchants, maps, legends) 2% more often
    merchantDiscount: 0.01, // 1% off a wandering merchant's price
  }),
  maxMerchantDiscount: 0.25,
});

export function effectiveLuck(luck) {
  const value = Math.max(0, Number(luck) || 0);
  return value <= LUCK.softCap ? value : LUCK.softCap + (value - LUCK.softCap) / 2;
}

// What a given amount of Luck does, as fractions.
export function luckEffects(luck) {
  const points = effectiveLuck(luck);
  const effects = Object.fromEntries(Object.entries(LUCK.perPoint).map(([key, per]) => [key, points * per]));
  effects.merchantDiscount = Math.min(LUCK.maxMerchantDiscount, effects.merchantDiscount);
  return effects;
}

export function heroLuck(hero) {
  return Math.max(0, Number(hero?.combat?.stats?.luck) || 0);
}

export function partyLuck(party = []) {
  return party.length ? party.reduce((sum, hero) => sum + heroLuck(hero), 0) / party.length : 0;
}

// Lines for a hero's stat sheet: exactly what their Luck is doing.
export function describeLuck(luck) {
  const effects = luckEffects(luck);
  const pct = (value) => `${Math.round(value * 1000) / 10}%`;
  return [
    `+${pct(effects.critChance)} crit chance`,
    `+${pct(effects.dodge)} dodge`,
    `+${pct(effects.rareLoot)} better gear drops`,
    `+${pct(effects.gambleLuck)} on road gambles`,
    `+${pct(effects.findChance)} finds, +${pct(effects.rareChance)} rare encounters`,
    `${pct(effects.merchantDiscount)} off merchants`,
  ];
}
