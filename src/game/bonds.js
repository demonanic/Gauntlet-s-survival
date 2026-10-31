// Bonds between heroes. Two heroes who both come through a won fight
// standing grow closer: Acquainted, then Comrades (+5% damage while both are
// up), then Sworn (one Sworn partner each: when one drops low, the other
// shields them, once a fight). Becoming Comrades and swearing the Sworn pact
// are the player's choice, made on a card at the guild (`bondOffers`); "not
// now" asks again after a few more shared wins. Leaving a Comrade or Sworn
// partner behind when the party sets out costs a little morale. When a bonded partner falls mid-fight a hero
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
  // "Not now" on a bond offer: ask again after this many more shared wins.
  snoozeWins: 10,
  // Morale lost when the party sets out without a hero's Comrade / Sworn partner.
  separationMorale: Object.freeze({ comrades: 2, sworn: 4 }),
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
  if (bond.comrades) return "comrades";
  if (bond.wins >= BONDS.acquainted) return "acquainted";
  return "none";
}

// The step a pair has earned but not yet been offered or accepted: "comrades",
// "sworn", or null.
function earnedStep(state, a, b, bond) {
  if (!bond || bond.sworn || bond.wins < (bond.askAt || 0)) return null;
  if (!bond.comrades) return bond.wins >= BONDS.comrades ? "comrades" : null;
  if (bond.wins < BONDS.sworn || swornPartner(state, a) || swornPartner(state, b)) return null;
  return "sworn";
}

// Bonds waiting on the player: [{ a, b, step, wins }], Sworn first.
export function bondOffers(state) {
  const present = new Set((state.heroes || []).map((hero) => hero.identity.id));
  return Object.entries(state.bonds || {})
    .map(([key, bond]) => {
      const [a, b] = key.split("|");
      if (!present.has(a) || !present.has(b)) return null;
      const step = earnedStep(state, a, b, bond);
      return step ? { a, b, step, wins: bond.wins } : null;
    })
    .filter(Boolean)
    .sort((x, y) => (y.step === "sworn") - (x.step === "sworn") || y.wins - x.wins);
}

// The player answers a bond offer. Returns { ok, state } with a copy of `state`.
export function answerBond(state, a, b, accept) {
  const offer = bondOffers(state).find((entry) => bondKey(entry.a, entry.b) === bondKey(a, b));
  if (!offer) return { ok: false, reason: "no_offer" };
  const next = structuredClone(state);
  const bond = next.bonds[bondKey(a, b)];
  if (!accept) bond.askAt = bond.wins + BONDS.snoozeWins;
  else if (offer.step === "comrades") bond.comrades = true;
  else bond.sworn = true;
  return { ok: true, state: next };
}

// Wins still needed for the next step (null at Sworn, or when one is waiting).
export function winsToNext(bond) {
  if (!bond || bond.sworn) return null;
  const target = bond.comrades ? BONDS.sworn : bond.wins < BONDS.acquainted ? BONDS.acquainted : BONDS.comrades;
  return Math.max(0, target - bond.wins);
}

// Morale the party loses setting out without some heroes' bonded partners,
// and who is missed: { morale, missed: [{ hero, partner }] }.
export function separation(state, partyIds) {
  const missed = [];
  for (const id of partyIds) {
    for (const { partnerId, level } of heroBonds(state, id)) {
      if ((level === "comrades" || level === "sworn") && !partyIds.includes(partnerId)) missed.push({ hero: id, partner: partnerId, level });
    }
  }
  return { morale: missed.reduce((sum, entry) => sum + BONDS.separationMorale[entry.level], 0), missed };
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

// A hero's bonds of Acquainted or better: [{ partnerId, level, wins, toNext }], strongest first.
export function heroBonds(state, id) {
  return Object.entries(state.bonds || {})
    .map(([key, bond]) => {
      const [a, b] = key.split("|");
      if (a !== id && b !== id) return null;
      const level = bondLevel(bond);
      return level === "none" ? null : { partnerId: a === id ? b : a, level, wins: bond.wins, toNext: winsToNext(bond) };
    })
    .filter(Boolean)
    .sort((x, y) => BOND_LEVELS.indexOf(y.level) - BOND_LEVELS.indexOf(x.level) || y.wins - x.wins);
}

// Every pair among `ids` (heroes still standing after a won fight) grows
// closer. Mutates `state`; returns what changed as [{ a, b, level }] for a pair
// that just became Acquainted, or [{ a, b, offer }] for one that just earned
// the chance to become Comrades or Sworn (the player decides at the guild).
export function recordSharedWin(state, ids) {
  state.bonds ||= {};
  const grown = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const [a, b] = [ids[i], ids[j]];
      const bond = (state.bonds[bondKey(a, b)] ||= { wins: 0 });
      const before = bondLevel(bond);
      const offered = earnedStep(state, a, b, bond);
      bond.wins += 1;
      if (bondLevel(bond) !== before) grown.push({ a, b, level: bondLevel(bond) });
      const offer = earnedStep(state, a, b, bond);
      if (offer && offer !== offered) grown.push({ a, b, offer });
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
