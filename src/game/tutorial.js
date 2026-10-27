// The first-run tutorial: a short guided tour that moves on when the player
// actually does each thing (open a hero's gear, send a party, face the first
// encounter), not by clicking "next" through a wall of text. Progress lives in
// the save (guild.tutorial), so it survives reloads and syncs to the cloud.
//
// A player who has already sent a party out skips the guild-hall steps.
import { FULL_PARTY, freeRecruitAvailable } from "./guild";

const home = (guild) => !guild.expedition;

// Each step names the element it points at (`target`, a CSS selector) and
// either a `next` button label or an `advance(guild, ui)` check; a step whose
// `skipUnless` check fails is passed over. `ui` is the screen state the App
// knows about: { tab, gearOpen, inBattle }.

export const TUTORIAL_STEPS = Object.freeze([
  {
    id: "welcome",
    title: "Welcome to the Gauntlet",
    text: "You run a guild of neon heroes. Send them on timed expeditions, where they fight, sneak, find loot and grow. Want a quick tour? It takes about two minutes.",
    next: "Show me",
  },
  {
    id: "roster",
    title: "Your heroes",
    text: "These are your starting heroes. Each was born with a quality, like Brawny or Tracker: who they are, not something you pick. Veterans develop more qualities from how they fight.",
    target: "[data-testid='roster']",
    placement: "top",
    tab: "hall",
    next: "Next",
  },
  {
    id: "recruit",
    title: "One more hero",
    text: "Three heroes struggle once the real fights start; a full party is four. A fighter wants to join, and your first recruit is free. Tap Recruit, give them a name (or keep this one), then tap Hire.",
    // The Recruit button, then the Hire button once the dialog is open.
    target: ["[data-testid='recruit-hire']", "[data-testid='recruit']"],
    tab: "hall",
    skipUnless: (guild) => home(guild) && freeRecruitAvailable(guild),
    advance: (guild) => guild.heroes.length >= FULL_PARTY,
  },
  {
    id: "gear",
    title: "Gear",
    text: "Tap Gear on your first hero to see their equipment.",
    target: "[data-testid^='gear-']",
    tab: "hall",
    skipUnless: home,
    advance: (guild, ui) => ui.gearOpen,
  },
  {
    id: "gearSheet",
    title: "Gear and quick slots",
    text: "Seven gear slots; armor you put on shows on the hero in its rarity's colour. The weapon decides how they fight: swords up close, bows (which need arrows) and staves from range. Better gear has sockets for crystals (fire, frost, venom and more, from the Market). Quick slots hold bandages, potions or arrows, used on their own in battle; the supply style sets when. Close this when you're done.",
    target: "[data-testid='hero-gear'] section",
    // The sheet's Close button is at its top.
    placement: "bottom",
    skipUnless: (guild, ui) => ui.gearOpen || home(guild),
    advance: (guild, ui) => !ui.gearOpen,
  },
  {
    id: "board",
    title: "Expeditions",
    text: "Time for a first trip. Open the Expeditions tab.",
    target: "[data-testid='tab-board']",
    skipUnless: home,
    advance: (guild, ui) => ui.tab === "board",
  },
  {
    id: "party",
    title: "Send a party",
    text: "The Gutter, a short and safe trip, is already picked. Tap all four heroes to add them, then tap Send party. The first hero you pick is the Leader. Later regions have harsh weather: the readiness check tells you which provisions to pack.",
    target: "[data-testid='party-panel']",
    placement: "top",
    tab: "board",
    advance: (guild) => !!guild.expedition,
  },
  {
    id: "feed",
    title: "On the road",
    text: "The party is out. The feed tells you what happens: finds, close calls, weather, story choices. The timer only runs while nothing needs your answer. Something's coming...",
    target: "[data-testid='expedition-panel']",
    advance: (guild) => !guild.expedition || !!guild.expedition.pending,
  },
  {
    id: "prompt",
    title: "An encounter",
    text: "Attack to fight it live, or Sneak by and roll the dice (agility, qualities and the enemies decide the odds). If you're away, the party decides on its own. This first one is easy: try Attack.",
    target: "[data-testid='expedition-prompt']",
    advance: (guild, ui) => ui.inBattle || !guild.expedition?.pending,
  },
  {
    id: "battle",
    title: "Battle",
    text: "Heroes fight on their own. Tap an ability to use it, or a hero card and then the field to move them. They use bandages and potions by themselves when they're hurt.",
    target: "[data-testid='battle-canvas']",
    // Below the battle header, so its speed and return buttons stay reachable.
    placement: "under-header",
    skipUnless: (guild, ui) => ui.inBattle,
    advance: (guild, ui) => !ui.inBattle,
  },
  {
    id: "done",
    title: "You're ready",
    text: "The trip goes on with more fights, finds and choices until the timer runs out. When the party is home: spend points in Perks, restock in the Market, and push on to harder regions. One secret for later: beat a boss for the first time with a level 10+ Leader, and it may leave a crate with breathing holes. Whatever is inside becomes the Leader's familiar. Hints in the Guild Hall will point out what needs attention.",
    next: "Let's go",
  },
]);

export function newTutorial() {
  return { step: 0, done: false };
}

// Saves from before the tutorial belong to players who already know the game.
export function normalizeTutorial(saved) {
  if (!saved || typeof saved !== "object") return { step: 0, done: true };
  const step = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, Math.floor(Number(saved.step) || 0)));
  return { step, done: !!saved.done };
}

export function tutorialActive(guild) {
  return !!guild?.tutorial && !guild.tutorial.done;
}

export function currentStep(guild) {
  return tutorialActive(guild) ? TUTORIAL_STEPS[guild.tutorial.step] : null;
}

function withStep(guild, step) {
  if (step >= TUTORIAL_STEPS.length) return { ...guild, tutorial: { step: TUTORIAL_STEPS.length - 1, done: true } };
  return { ...guild, tutorial: { step, done: false } };
}

// Move past every step whose condition is already met (or that doesn't apply,
// like the battle step when the player snuck past). Returns the same object
// when nothing changes, so React can skip the update.
export function advanceTutorial(guild, ui) {
  if (!tutorialActive(guild)) return guild;
  let step = guild.tutorial.step;
  for (;;) {
    const current = TUTORIAL_STEPS[step];
    if (!current) break;
    const skipped = current.skipUnless && !current.skipUnless(guild, ui);
    if (!skipped && !(current.advance && current.advance(guild, ui))) break;
    step += 1;
  }
  return step === guild.tutorial.step ? guild : withStep(guild, step);
}

// The player tapped the step's button.
export function nextTutorialStep(guild) {
  if (!tutorialActive(guild)) return guild;
  return withStep(guild, guild.tutorial.step + 1);
}

export function skipTutorial(guild) {
  return { ...guild, tutorial: { ...guild.tutorial, done: true } };
}

export function restartTutorial(guild) {
  return { ...guild, tutorial: newTutorial() };
}
