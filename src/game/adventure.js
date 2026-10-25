// Adventure feed content and rules for timed expeditions: what can happen on
// the road (flavor, finds, hazards, story choices, encounters), how sneaking
// works, and how morale moves. The expedition lifecycle that uses this lives
// in expedition.js.
import { heroGearStats } from "../combat/gear";
import { heroRoadEffects, heroTraitEffects, partyRoadEffects } from "../combat/traits";

export const ADVENTURE = Object.freeze({
  // Seconds between feed events (random within the range).
  eventEverySeconds: [20, 40],
  eventWeights: Object.freeze({ flavor: 40, find: 20, hazard: 12, encounter: 22, story: 6, rare: 3 }),
  // Share of flavor events told as a hero's own banter instead.
  banterShare: 0.35,
  // Chance per event that the weather turns.
  weatherChangeChance: 0.06,
  // Long trips (this many minutes or more) stop to make camp halfway.
  campFromMinutes: 20,
  // A treasure map detour adds this long to the trip; the stash is found at its end.
  treasureDetourMs: 3 * 60_000,
  // Night is from 20:00 to 06:00 local time.
  nightHours: Object.freeze([20, 6]),
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
  const dodgeChance = Math.min(0.9, 0.35 + (heroAgility(target) - 10) * 0.015 + (heroRoadEffects(target).hazardDodge || 0));
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
    // A Greedy hero can't keep their hands off the offerings.
    auto: ({ greedy }) => (greedy ? "loot" : "pray"),
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
    auto: ({ partyHp, greedy }) => (greedy || partyHp > 0.5 ? "open" : "leave"),
  },
  campfire: {
    prompt: "The embers of an old campfire still glow. A good spot to rest.",
    options: [
      { id: "rest", label: "Rest a while", result: "The party rests by the fire and patches their wounds.", effects: { healAll: 0.15, morale: 5 } },
      { id: "press", label: "Press on", result: "No time to waste. The party pushes deeper.", effects: { morale: 2, shorten: 60_000 } },
    ],
    auto: ({ partyHp }) => (partyHp < 0.8 ? "rest" : "press"),
  },
  camp: {
    prompt: "Halfway there. The party makes camp for the night watch.",
    options: [
      { id: "rest", label: "Rest", result: "The party sleeps in shifts and wakes refreshed.", effects: { healAll: 0.3, morale: 5 } },
      { id: "scout", label: "Scout ahead", result: "{hero} scouts the path ahead and marks the safest routes.", effects: { scout: true, morale: 2 } },
      { id: "forage", label: "Forage", result: "The party spreads out to search the area.", effects: { forage: true } },
    ],
    auto: ({ partyHp }) => (partyHp < 0.7 ? "rest" : "forage"),
  },
  map: {
    prompt: "{hero} finds a scrap of map with an X scrawled on it. A detour, maybe three minutes.",
    options: [
      { id: "follow", label: "Follow the map", result: "The party turns off the path to follow the map.", effects: { extend: true, treasure: true } },
      { id: "ignore", label: "Ignore it", result: "Probably a trap anyway.", effects: {} },
    ],
    auto: () => "follow",
  },
  fork: {
    prompt: "The path forks: a dark shortcut, or the long, well-trodden way.",
    options: [
      { id: "shortcut", label: "Take the shortcut", result: null, effects: { shorten: 120_000, gamble: { chance: 0.65, win: { text: "The shortcut pays off. The party makes good time." }, lose: { ambush: true, text: "The shortcut was a trap!" } } } },
      { id: "safe", label: "Stay on the path", result: "Slow and steady. Nothing jumps out.", effects: { morale: 1 } },
    ],
    auto: () => "safe",
  },
  // Something has been following the party, and someone noticed (expedition.js).
  stalker: {
    prompt: "{hero} stops abruptly. Something has been following the party.",
    options: [
      { id: "confront", label: "Turn and fight", result: "The party wheels around and charges into the dark.", effects: { stalker: "confront" } },
      { id: "shake", label: "Try to lose it", result: null, effects: { stalker: "shake" } },
      { id: "brace", label: "Keep going, stay ready", result: "The party presses on, weapons loose in their hands, ears open.", effects: { stalker: "brace" } },
    ],
    auto: ({ partyHp }) => (partyHp > 0.6 ? "confront" : "brace"),
  },
});
// Stories that come up at random on the road (camp and map are triggered by the trip itself).
export const STORY_KEYS = Object.freeze(["shrine", "traveler", "chest", "campfire", "fork"]);

// ---------------- sneaking ----------------
// Shadowcraft and Illusion perks make a party quieter; qualities (Nimble,
// Ghost-Step, Reckless, Loud, ...) add their road `sneak` effect.
const STEALTH_NODES = new Set(["S1", "S2", "S2a", "S3", "S3a", "I1", "I2", "I3"]);
const WATCHFUL = new Set(["ghost", "reaper", "darkElf", "warlock", "lieutenant", "bandit"]);
// Watchers (the family) make slipping past a squad much harder.
const WATCHER_PENALTY = 0.12;

// Chance (0.05 to 0.95) that `party` slips past `wave` unseen.
// `bonus` adds the trip's conditions (fog, night, scouting) on top.
export function sneakChance(party, wave, morale, region, bonus = 0) {
  if (!party.length) return 0;
  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  let chance = 0.55;
  chance += (avg(party.map(heroAgility)) - 10) * 0.01;
  chance += Math.min(0.15, party.reduce((sum, hero) =>
    sum + (hero.progression?.ownedNodeIds || []).filter((id) => STEALTH_NODES.has(id)).length * 0.03, 0));
  chance += partyRoadEffects(party).sneak || 0;
  chance += Math.max(-0.1, Math.min(0.1, (avg(party.map((hero) => hero.progression?.level || 1)) - (region.minLevel + 2)) * 0.02));
  chance -= Math.max(0, party.length - 1) * 0.04;
  chance -= Math.max(0, wave.enemies.length - 2) * 0.06;
  chance -= wave.enemies.filter((enemy) => WATCHFUL.has(enemy.type)).length * 0.04;
  chance -= wave.enemies.filter((enemy) => enemy.families?.includes("watcher")).length * WATCHER_PENALTY;
  chance += (clampMorale(morale) - 50) / 500;
  chance += bonus;
  return Math.max(0.05, Math.min(0.95, chance));
}

// ---------------- banter ----------------
// Lines a hero says because of who they are (trait) or how the trip is going (morale).
const BANTER = {
  brawny: ["{hero} carries everyone's packs without being asked.", "{hero} flexes at a statue. The statue loses."],
  keenEye: ["{hero} points out a crack in the wall nobody else noticed.", "\"Movement, two o'clock,\" says {hero}. It's a rat. Probably."],
  nimble: ["{hero} hops from stone to stone to keep their boots dry.", "{hero} juggles three pebbles while walking. Show-off."],
  ironhide: ["{hero} shrugs off a falling rock. \"Felt nothing.\"", "{hero} knocks on their own armor for luck."],
  berserker: ["{hero} cracks their knuckles. \"Something had better jump out soon.\"", "{hero} grins at every distant growl."],
  quickHands: ["{hero} has already re-tied everyone's laces.", "{hero} spins a dagger between their fingers, bored."],
  medic: ["{hero} checks everyone's bandages. Twice.", "{hero} lectures the party about drinking enough water."],
  fastLearner: ["{hero} scribbles notes about the local monsters.", "{hero} has started naming the rats. For science."],
  treasureHunter: ["{hero} keeps prying at loose bricks, hoping for gold.", "{hero} insists that every shiny thing is worth a look."],
  glassCannon: ["{hero} flinches at a drip of water, weapon already raised.", "\"Let me hit it first,\" {hero} says, about everything."],
  stalwart: ["{hero} takes the front without a word.", "{hero} plants their feet whenever the floor creaks."],
  swift: ["{hero} scouts ahead and back again before anyone blinks.", "{hero} keeps having to wait for the others to catch up."],
  tracker: ["{hero} kneels to study a print in the dirt. \"Fresh. Two hours, maybe less.\"", "{hero} keeps glancing back down the trail they came by."],
  keenEared: ["{hero} holds up a hand. Everyone freezes. ...Just the wind.", "{hero} can hear water running three tunnels away."],
  nightEyes: ["{hero} walks on ahead without a torch, perfectly at ease.", "\"Mind the step,\" says {hero}. Nobody else can see the step."],
  trailwise: ["{hero} steers the party around a patch of ground that looks completely normal.", "{hero} reads the path like a book."],
  lightSleeper: ["{hero} hasn't slept properly in years and says it's fine.", "{hero} jumps at every creak, but never misses one."],
  sureFooted: ["{hero} crosses a rotten beam without looking down.", "{hero} hasn't tripped once. It's unsettling."],
  scavenger: ["{hero} pockets something shiny from the rubble.", "{hero}'s pack is getting suspiciously heavy."],
  bloodhound: ["{hero} sniffs the air. \"Something big came through here.\"", "{hero} wants to follow a strange trail off the path. Again."],
  charismatic: ["{hero} tells a story so good the party forgets where they are.", "Everyone is laughing at something {hero} said."],
  inspiring: ["{hero} talks about the guild's old heroes until everyone stands a little taller.", "{hero} checks on each member of the party in turn."],
  steadfast: ["{hero} doesn't flinch when something howls in the distance.", "{hero} sets a steady pace and everyone falls in behind."],
  optimist: ["\"Could be worse,\" says {hero}, cheerfully, about everything.", "{hero} insists the smell means treasure is near."],
  reckless: ["{hero} kicks open a door before anyone can stop them.", "{hero} wants to take the dangerous-looking path. For fun."],
  loud: ["{hero} sneezes. It echoes for a full ten seconds.", "{hero} is humming again. Loudly."],
  frail: ["{hero} needs a breather. Again.", "{hero} wraps up warmer than everyone else and takes notes on everything."],
  greedy: ["{hero} is already counting the loot they haven't found yet.", "{hero} tries to pry a gem out of a statue's eye."],
  paranoid: ["{hero} is sure they're being followed. They might be right.", "{hero} insists on checking every corner twice."],
  marksman: ["{hero} picks a target off a distant wall just to stay sharp."],
  bladesworn: ["{hero} runs a whetstone along their blade, unhurried."],
  survivor: ["{hero} shows off a new scar like it's a medal."],
  giantslayer: ["{hero} looks bored by anything smaller than a lieutenant."],
  ghostStep: ["Nobody heard {hero} come back from scouting."],
  bulwark: ["{hero} takes the front without being asked, as always."],
  fieldSurgeon: ["{hero} re-dresses everyone's wounds during a short stop."],
  unshakable: ["{hero} naps through a rockfall."],
  rallyingHeart: ["{hero} starts a marching song, and everyone joins in."],
  high: ["{hero} is grinning ear to ear. This is the good stuff.", "{hero} starts a marching song and everyone joins in."],
  low: ["{hero} mutters that this was a terrible idea.", "{hero} keeps glancing back toward the exit."],
};

// A banter line for `hero`, or null if they have nothing to say.
export function rollBanter(hero, morale, rng = Math.random) {
  const pools = [...(hero.traits || []).map((key) => BANTER[key]).filter(Boolean)];
  if (morale >= 75) pools.push(BANTER.high);
  if (morale <= 30) pools.push(BANTER.low);
  if (!pools.length) return null;
  const pool = pick(pools, rng);
  return { template: null, text: pick(pool, rng).replaceAll("{hero}", hero.identity.name), morale: pool === BANTER.low ? -2 : 1, tone: "flavor" };
}

// ---------------- time of day and weather ----------------
export const WEATHER = Object.freeze({
  clear: { key: "clear", name: "Clear", intro: "Clear air and good footing.", weight: 45, sneak: 0, ambush: 0, hazard: 1, loot: 1, moralePerEvent: 0.5 },
  rain: { key: "rain", name: "Rain", intro: "Rain hammers down. The noise covers their footsteps, and the floors run slick.", weight: 25, sneak: 0.05, ambush: 0, hazard: 1.3, loot: 1, moralePerEvent: -0.5 },
  fog: { key: "fog", name: "Fog", intro: "A thick fog rolls in. Easy to hide in, easy to be surprised in.", weight: 18, sneak: 0.12, ambush: 0.1, hazard: 1, loot: 1, moralePerEvent: 0 },
  storm: { key: "storm", name: "Storm", intro: "A storm howls overhead. Everything shakes.", weight: 12, sneak: 0.05, ambush: 0.05, hazard: 1.6, loot: 1.15, moralePerEvent: -1.5 },
});
const WEATHER_KEYS = Object.keys(WEATHER);
export const NIGHT = Object.freeze({ sneak: 0.05, ambush: 0.15, loot: 1.3 });

export function rollWeather(rng = Math.random, except = null) {
  const keys = WEATHER_KEYS.filter((key) => key !== except);
  let roll = rng() * keys.reduce((sum, key) => sum + WEATHER[key].weight, 0);
  for (const key of keys) {
    roll -= WEATHER[key].weight;
    if (roll < 0) return key;
  }
  return keys[keys.length - 1];
}

export function isNight(at) {
  const hour = new Date(at).getHours();
  const [dusk, dawn] = ADVENTURE.nightHours;
  return hour >= dusk || hour < dawn;
}

// Everything the trip's conditions change, combined.
export function conditionEffects(weatherKey, night, scouted = false) {
  const weather = WEATHER[weatherKey] || WEATHER.clear;
  return {
    sneak: weather.sneak + (night ? NIGHT.sneak : 0) + (scouted ? 0.15 : 0),
    ambush: weather.ambush + (night ? NIGHT.ambush : 0),
    hazard: weather.hazard,
    loot: weather.loot * (night ? NIGHT.loot : 1),
    moralePerEvent: weather.moralePerEvent,
  };
}

// ---------------- rare events ----------------
export const RARE_EVENTS = Object.freeze(["merchant", "map", "legend"]);
export const LEGENDARY = Object.freeze({ hp: 5, dmg: 1.6, rewardGold: [60, 140] });
const LEGEND_TITLES = ["the Undying", "Gutterking", "the Hollow", "Ironjaw", "the Ash-Born", "Old Bones", "the Patient"];

export function legendName(base, rng = Math.random) {
  return `${base} ${pick(LEGEND_TITLES, rng)}`;
}
