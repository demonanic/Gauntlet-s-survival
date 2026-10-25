// Regional environments: the conditions a region imposes on everyone who
// travels there. Each one wears heroes down on the road (environment events in
// the adventure feed) and handicaps them in battle. Resistance cancels it out:
// gear affixes, set bonuses and legendaries add resistance, and a provision
// packed from the stash adds more for one trip. 100% resistance is immunity.
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { PROVISIONS, heroGearStats } from "../combat/gear";
import { heroRoadEffects } from "../combat/traits";

export const ENVIRONMENTS = Object.freeze({
  darkness: Object.freeze({
    key: "darkness", name: "Darkness", resist: "darkResist", provision: "torch", color: "#94A3B8",
    desc: "Heroes miss 15% of attacks and are ambushed more often.",
    combat: Object.freeze({ miss: 0.15 }),
    road: Object.freeze({ drain: 0.03, ambush: 0.1 }),
    lines: Object.freeze([
      "The lantern gutters. For a moment there is only black.",
      "{hero} walks face-first into a pillar in the dark.",
      "Something brushes past in the darkness. Nobody saw what.",
    ]),
  }),
  cold: Object.freeze({
    key: "cold", name: "Bitter Cold", resist: "coldResist", provision: "warmingDraught", color: "#7DD3FC",
    desc: "Frostbite on the road; in battle heroes attack 25% slower and move 15% slower.",
    combat: Object.freeze({ attackSlow: 0.25, moveSlow: 0.15 }),
    road: Object.freeze({ drain: 0.06 }),
    lines: Object.freeze([
      "A howling wind cuts through every layer of cloth.",
      "Frost creeps up {hero}'s gauntlets. Fingers go numb.",
      "Snow drifts to the knee. Every step is a fight.",
    ]),
  }),
  heat: Object.freeze({
    key: "heat", name: "Scorching Heat", resist: "heatResist", provision: "coolingSalve", color: "#FB923C",
    desc: "The heat saps strength on the road and burns heroes in battle (0.6% max HP per second).",
    combat: Object.freeze({ dot: 0.006 }),
    road: Object.freeze({ drain: 0.05, morale: -2 }),
    lines: Object.freeze([
      "The air shimmers. Armor grows too hot to touch.",
      "{hero}'s waterskin is already empty.",
      "A gout of flame bursts from a crack in the floor.",
    ]),
  }),
  toxic: Object.freeze({
    key: "toxic", name: "Toxic Miasma", resist: "toxicResist", provision: "antitoxin", color: "#A3E635",
    desc: "Poison on the road; in battle healing is halved and the miasma burns (0.4% max HP per second).",
    combat: Object.freeze({ dot: 0.004, healCut: 0.5 }),
    road: Object.freeze({ drain: 0.06 }),
    lines: Object.freeze([
      "A bubble of green gas bursts at {hero}'s feet.",
      "The fog tastes of rot. Everyone's eyes water.",
      "{hero} coughs up something unpleasant.",
    ]),
  }),
});

export function getEnvironment(region) {
  return ENVIRONMENTS[region?.environment] || null;
}

// A hero's resistance (0 to 1) to an environment, counting a packed provision.
export function heroResistance(hero, environment, packed = false) {
  if (!environment) return 1;
  const provision = PROVISIONS[environment.provision];
  return Math.min(1, heroGearStats(hero)[environment.resist] + (packed && provision ? provision.amount : 0));
}

// What the environment does to this hero in battle, after resistance.
// Handed to the engine as hero.environment.
export function combatEnvironment(hero, environment, packed = false) {
  if (!environment) return null;
  const left = 1 - heroResistance(hero, environment, packed);
  if (left <= 0) return null;
  const scaled = Object.fromEntries(Object.entries(environment.combat).map(([key, value]) => [key, value * left]));
  return { ...scaled, key: environment.key, color: environment.color };
}

// An environment event on the road: each hero loses HP by how unprotected
// they are (never fatal). Returns { text, hurt: [names], morale }.
export function rollEnvironmentEvent(environment, party, packedIds, rng = Math.random) {
  const hero = party[Math.floor(rng() * party.length)];
  const line = environment.lines[Math.floor(rng() * environment.lines.length)].replaceAll("{hero}", hero.identity.name);
  const hurt = [];
  for (const member of party) {
    // Sure-Footed heroes shrug off part of the toll.
    const left = (1 - heroResistance(member, environment, packedIds.includes(member.identity.id))) * (1 - (heroRoadEffects(member).envDrain || 0));
    if (left <= 0.05) continue;
    const amount = Math.round(classlessMaxHp(member) * environment.road.drain * left);
    if (amount <= 0) continue;
    member.combat.hp = Math.max(1, member.combat.hp - amount);
    hurt.push(member.identity.name);
  }
  return { text: line, hurt, morale: hurt.length ? (environment.road.morale || -1) : 1 };
}
