// Bonds between heroes. Two heroes who both come through a won fight
// standing grow closer: Acquainted, then Comrades (+5% damage while both are
// up), then Sworn (one Sworn partner each: when one drops low, the other
// shields them, once a fight). When a bonded partner falls mid-fight a hero
// flies into Vengeance, or, if calm by nature, is Shaken. A Comrade or Sworn
// partner who retires is remembered: +3% damage, up to three memories.
// Owner-approved design (Oct 2026).

export const BONDS = Object.freeze({
  // Shared wins needed for each level.
  acquainted: 10,
  comrades: 30,
  sworn: 75,
  comradesDamage: 0.05,
  // Sworn: when a partner drops below this share of HP, the other shields
  // them for this share of the partner's max HP, once per fight.
  guardBelow: 0.25,
  guardShield: 0.2,
  vengeanceDamage: 0.25,
  vengeanceSeconds: 10,
  shakenDamage: -0.1,
  // Calm natures are Shaken by a partner's fall instead of enraged.
  calm: Object.freeze(["stalwart", "steadfast", "paranoid"]),
  memorialDamage: 0.03,
  maxMemorials: 3,
});

export const BOND_LEVELS = Object.freeze(["none", "acquainted", "comrades", "sworn"]);
export const BOND_NAMES = Object.freeze({ acquainted: "Acquainted", comrades: "Comrades", sworn: "Sworn" });

export function bondKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function bondFor(state, a, b) {
  return state.bonds?.[bondKey(a, b)] || null;
}

export function bondLevel(bond) {
  if (!bond) return "none";
  if (bond.sworn) return "sworn";
  if (bond.wins >= BONDS.comrades) return "comrades";
  if (bond.wins >= BONDS.acquainted) return "acquainted";
  return "none";
}

export function swornPartner(state, id) {
  for (const [key, bond] of Object.entries(state.bonds || {})) {
    if (!bond.sworn) continue;
    const [a, b] = key.split("|");
    if (a === id) return b;
    if (b === id) return a;
  }
  return null;
}

// A hero's bonds of Acquainted or better: [{ partnerId, level, wins }], strongest first.
export function heroBonds(state, id) {
  return Object.entries(state.bonds || {})
    .map(([key, bond]) => {
      const [a, b] = key.split("|");
      if (a !== id && b !== id) return null;
      const level = bondLevel(bond);
      return level === "none" ? null : { partnerId: a === id ? b : a, level, wins: bond.wins };
    })
    .filter(Boolean)
    .sort((x, y) => BOND_LEVELS.indexOf(y.level) - BOND_LEVELS.indexOf(x.level) || y.wins - x.wins);
}

// Every pair among `ids` (heroes still standing after a won fight) grows
// closer. Mutates `state`; returns the pairs that reached a new level as
// [{ a, b, level }].
export function recordSharedWin(state, ids) {
  state.bonds ||= {};
  const grown = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const key = bondKey(ids[i], ids[j]);
      const bond = (state.bonds[key] ||= { wins: 0 });
      const before = bondLevel(bond);
      bond.wins += 1;
      if (!bond.sworn && bond.wins >= BONDS.sworn && !swornPartner(state, ids[i]) && !swornPartner(state, ids[j])) bond.sworn = true;
      const after = bondLevel(bond);
      if (after !== before) grown.push({ a: ids[i], b: ids[j], level: after });
    }
  }
  return grown;
}

// What a hero carries into a fight: bonds (Comrades or better) with the
// others in this party, and their memories of retired partners.
export function combatBonds(state, hero, partyIds) {
  const id = hero.identity.id;
  return partyIds.filter((other) => other !== id)
    .map((other) => ({ partnerId: other, level: bondLevel(bondFor(state, id, other)) }))
    .filter((bond) => bond.level === "comrades" || bond.level === "sworn");
}

export function memorialDamage(hero) {
  return Math.min(BONDS.maxMemorials, (hero?.memorials || []).length) * BONDS.memorialDamage;
}

// A hero retires: Comrade and Sworn partners keep a memory of them, and every
// bond with them ends. Mutates `state`.
export function rememberRetired(state, retired) {
  const id = retired.identity.id;
  for (const { partnerId, level } of heroBonds(state, id)) {
    if (level !== "comrades" && level !== "sworn") continue;
    const partner = state.heroes.find((hero) => hero.identity.id === partnerId);
    if (partner) partner.memorials = [...(partner.memorials || []), { name: retired.identity.name, level }];
  }
  for (const key of Object.keys(state.bonds || {})) {
    if (key.split("|").includes(id)) delete state.bonds[key];
  }
}
