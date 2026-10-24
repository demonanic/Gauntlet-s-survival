// Adventure feed content and rules for timed expeditions: what can happen on
// the road (flavor, finds, hazards, story choices, encounters), how sneaking
// works, and how morale moves. The expedition lifecycle that uses this lives
// in expedition.js.
import { heroGearStats } from "../combat/gear";
import { heroTraitEffects } from "../combat/traits";

export const ADVENTURE = Object.freeze({
  // Seconds between feed events (random within the range).
  eventEverySeconds: [20, 40],
  eventWeights: Object.freeze({ flavor: 40, find: 20, hazard: 12, encounter: 22, story: 6 }),
  // Share of encounters that are ambushes (no choice) rather than sightings.
  ambushShare: 0.35,
  // An unanswered prompt is decided by the party after this long.
  autoDecideMs: 45_000,
  // A battle the player started but never finished resolves on its own after this long.
  engagedTimeoutMs: 10 * 60_000,
  startMorale: 60,
  // Each event pulls morale this share of the way back toward startMorale,
  // so a good or bad streak fades instead of pinning morale at an extreme.
  moraleDrift: 0.1,
  // Morale 0 gives -10% damage, 100 gives +10%.
  moraleDamageSwing: 0.1,
  ambushVolley: 0.08,
});

const pick = (list, rng) => list[Math.floor(rng() * list.length)];
export const clampMorale = (value) => Math.max(0, Math.min(100, Math.round(value)));

export function moraleDamageBonus(morale) {
  return ((clampMorale(morale) - 50) / 50) * ADVENTURE.moraleDamageSwing;
}

export function moraleLabel(morale) {
  const value = clampMorale(morale);
  if (value >= 80) return "Fired up";
  if (value >= 60) return "Upbeat";
  if (value >= 40) return "Steady";
  if (value >= 20) return "Shaken";
  return "Despairing";
}

// ---------------- flavor ----------------
// {hero} is replaced with a random living party member's name.
// `morale` nudges the party's mood; `tone` colors the feed line.
const FLAVOR = {
  common: [
    { text: "The air is still. The vibes are chill.", morale: 3 },
    { text: "{hero} hums an old tavern song. Spirits lift.", morale: 4 },
    { text: "{hero} trips over nothing and pretends it was on purpose.", morale: 2 },
    { text: "The party shares stale bread and a few bad jokes.", morale: 3 },
    { text: "Footsteps echo somewhere behind them. Nobody looks back.", morale: -3, tone: "danger" },
    { text: "{hero} swears the shadows just moved.", morale: -2 },
    { text: "A long, quiet stretch. Boots, breathing, nothing else." },
    { text: "{hero} sharpens their gear during a short break." },
  ],
  gutter: [
    { text: "Water drips somewhere in the dark. Drip. Drip. Drip." },
    { text: "Rats scatter from the lantern light." },
    { text: "The smell down here is... a lot. {hero} gags.", morale: -2 },
    { text: "Graffiti on the wall reads: 'TURN BACK'. Someone added a smiley face.", morale: 2 },
    { text: "A pipe groans overhead like a sleeping beast." },
  ],
  boneyard: [
    { text: "Candles flicker in empty alcoves. Who lit them?", morale: -2 },
    { text: "Bones crunch underfoot with every step." },
    { text: "{hero} reads an epitaph aloud: 'Here lies Gerald. He was fine.'", morale: 3 },
    { text: "A cold draft whispers through the ossuary.", morale: -2 },
    { text: "Distant chanting drifts up from below.", tone: "danger", morale: -3 },
  ],
  ashen: [
    { text: "Ash falls like grey snow. Everything tastes of smoke.", morale: -2 },
    { text: "The ground is warm. Something burns far below." },
    { text: "{hero} spots a banner of the old keep, still proud through the soot.", morale: 4 },
    { text: "A roar shakes dust from the ceiling. Something big is awake.", tone: "danger", morale: -4 },
    { text: "Embers swirl in the wind like fireflies.", morale: 2 },
  ],
};

// `recent` holds the last few flavor templates, which are not repeated.
export function rollFlavor(region, heroName, rng = Math.random, recent = []) {
  const lines = [...FLAVOR.common, ...(FLAVOR[region.id] || [])];
  const fresh = lines.filter((entry) => !recent.includes(entry.text));
  const line = pick(fresh.length ? fresh : lines, rng);
  return { template: line.text, text: line.text.replaceAll("{hero}", heroName), morale: line.morale || 0, tone: line.tone || "flavor" };
}

// ---------------- hazards ----------------
// An agility check by one hero: pass and it's a near miss, fail and the
// hazard costs HP (never fatal). `all` hazards hit the whole party.
const HAZARDS = [
  { pass: "Barely missed a disaster! A ceiling collapses right behind {hero}.", fail: "Rockfall! {hero} is caught under the debris.", damage: 0.15 },
  { pass: "{hero} spots a tripwire just in time.", fail: "A hidden trap snaps shut on {hero}'s leg.", damage: 0.12 },
  { pass: "{hero} catches the crumbling ledge and pulls everyone across.", fail: "The floor gives way and {hero} takes a nasty fall.", damage: 0.14 },
  { pass: "A cloud of spores drifts past. Everyone holds their breath in time.", fail: "Choking spores! The whole party coughs and wheezes.", damage: 0.06, all: true },
];

export function heroAgility(hero) {
  return (hero.combat?.stats?.agility || 10) + heroGearStats(hero).agility + heroTraitEffects(hero).agility;
}

export function rollHazard(target, rng = Math.random) {
  const hazard = pick(HAZARDS, rng);
  const dodgeChance = Math.min(0.85, 0.35 + (heroAgility(target) - 10) * 0.015);
  const dodged = rng() < dodgeChance;
  return {
    text: (dodged ? hazard.pass : hazard.fail).replaceAll("{hero}", target.identity.name),
    damage: dodged ? 0 : hazard.damage,
    all: !!hazard.all,
    morale: dodged ? 2 : -5,
    tone: dodged ? "good" : "danger",
  };
}

// ---------------- finds ----------------
const FIND_LINES = {
  gold: ["{hero} pries {gold} gold from a cracked lockbox.", "A dead adventurer's purse: {gold} gold.", "{hero} finds {gold} gold glinting in the muck."],
  supply: ["{hero} finds a {item} in an abandoned pack.", "A forgotten stash! Inside: a {item}."],
  gear: ["{hero} uncovers a {item} beneath the rubble!", "Hidden in an alcove: a {item}!"],
};

export function findLine(kind, heroName, detail, rng = Math.random) {
  return pick(FIND_LINES[kind], rng).replaceAll("{hero}", heroName).replace("{gold}", detail).replace("{item}", detail);
}

// ---------------- story events ----------------
// Each option lists effects the expedition applies. `auto` picks the option
// the party takes when the player doesn't answer.
export const STORIES = Object.freeze({
  shrine: {
    prompt: "A forgotten shrine hums with soft blue light.",
    options: [
      { id: "pray", label: "Pray", result: "The party kneels. Warmth washes over them.", effects: { healAll: 0.25, morale: 6 } },
      { id: "loot", label: "Loot the offerings", result: null, effects: { gamble: { chance: 0.6, win: { gold: [30, 80] }, lose: { hurtAll: 0.1, morale: -12, text: "A curse lashes out! The shrine was not amused." } } } },
    ],
    auto: () => "pray",
  },
  traveler: {
    prompt: "A wounded traveler slumps against the wall, begging for help.",
    options: [
      { id: "help", label: "Help them", result: "{hero} patches them up. They press a few coins into your hand.", effects: { morale: 10, gold: [5, 25] } },
      { id: "ignore", label: "Keep moving", result: "The party walks on. Nobody talks for a while.", effects: { morale: -6 } },
    ],
    auto: () => "help",
  },
  chest: {
    prompt: "A heavy iron chest sits in the middle of the path. Too convenient?",
    options: [
      { id: "open", label: "Open it", result: null, effects: { gamble: { chance: 0.7, win: { gear: true }, lose: { hurtAll: 0.12, morale: -6, text: "It's a mimic! It bites before scuttling away." } } } },
      { id: "leave", label: "Leave it", result: "Not today, chest.", effects: {} },
    ],
    auto: ({ partyHp }) => (partyHp > 0.5 ? "open" : "leave"),
  },
  campfire: {
    prompt: "The embers of an old campfire still glow. A good spot to rest.",
    options: [
      { id: "rest", label: "Rest a while", result: "The party rests by the fire and patches their wounds.", effects: { healAll: 0.15, morale: 5 } },
      { id: "press", label: "Press on", result: "No time to waste. The party pushes deeper.", effects: { morale: 2, shorten: 60_000 } },
    ],
    auto: ({ partyHp }) => (partyHp < 0.8 ? "rest" : "press"),
  },
  fork: {
    prompt: "The path forks: a dark shortcut, or the long, well-trodden way.",
    options: [
      { id: "shortcut", label: "Take the shortcut", result: null, effects: { shorten: 120_000, gamble: { chance: 0.65, win: { text: "The shortcut pays off. The party makes good time." }, lose: { ambush: true, text: "The shortcut was a trap!" } } } },
      { id: "safe", label: "Stay on the path", result: "Slow and steady. Nothing jumps out.", effects: { morale: 1 } },
    ],
    auto: () => "safe",
  },
});
export const STORY_KEYS = Object.freeze(Object.keys(STORIES));

// ---------------- sneaking ----------------
// Shadowcraft and Illusion perks make a party quieter.
const STEALTH_NODES = new Set(["S1", "S2", "S2a", "S3", "S3a", "I1", "I2", "I3"]);
const STEALTH_TRAITS = new Set(["nimble", "swift"]);
const WATCHFUL = new Set(["ghost", "reaper", "darkElf", "warlock", "lieutenant"]);

// Chance (0.05 to 0.95) that `party` slips past `wave` unseen.
export function sneakChance(party, wave, morale, region) {
  if (!party.length) return 0;
  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  let chance = 0.55;
  chance += (avg(party.map(heroAgility)) - 10) * 0.01;
  chance += Math.min(0.15, party.reduce((sum, hero) =>
    sum + (hero.progression?.ownedNodeIds || []).filter((id) => STEALTH_NODES.has(id)).length * 0.03, 0));
  chance += party.reduce((sum, hero) => sum + (hero.traits || []).filter((key) => STEALTH_TRAITS.has(key)).length * 0.05, 0);
  chance += Math.max(-0.1, Math.min(0.1, (avg(party.map((hero) => hero.progression?.level || 1)) - (region.minLevel + 2)) * 0.02));
  chance -= Math.max(0, party.length - 1) * 0.04;
  chance -= Math.max(0, wave.enemies.length - 2) * 0.06;
  chance -= wave.enemies.filter((enemy) => WATCHFUL.has(enemy.type)).length * 0.04;
  chance += (clampMorale(morale) - 50) / 500;
  return Math.max(0.05, Math.min(0.95, chance));
}
