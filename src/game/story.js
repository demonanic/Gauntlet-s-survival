// Story mode (owner's design, Nov 2026): hand-written campaigns of chapters
// of battles, fought hands-on (never by the party alone), against a real
// countdown. Campaigns live in campaigns/; DESIGN.md "Story mode" has the rules.
//
// A campaign in progress is `state.story.run`:
//   campaignId, startedAt (ms), limitMs     the countdown
//   pausedMs, pausedAt                      time frozen while signed out
//   battle                                  index of the next battle (0-based)
//   party, joining                          heroes in the line-up; swaps in transit
//   redoUsed                                chapters whose Redo is spent
//   failed                                  a wipe waiting on Redo or Accept
//   penaltyMs                               countdown lost to missed goals
//   lastGoal                                how the last battle's second goal went
// Times are the game's clock (the server's, once signed in; App.jsx).
import { buildScenarioWave, roamZombies } from "./encounters";
import { addFeed, findHero } from "./expeditionRun";
import { LEGENDARIES, chestCrystal, randomLegendary } from "./items";
import { TIME_WARP } from "./campaigns/timeWarp";
import { startExpedition } from "./expedition";
import { serializeGameState } from "../combat/heroModel";

export const CAMPAIGNS = Object.freeze({ [TIME_WARP.id]: TIME_WARP });

export const STORY = Object.freeze({
  battlesPerChapter: 4,
  minLevel: 6,
  // Signing out freezes the countdown for at most this long; after that it runs again.
  pauseCapMs: 24 * 60 * 60 * 1000,
  // A campaign won: a fortune, one random legendary, and Radiant crystals or shards.
  bounty: Object.freeze({ gold: Object.freeze([15000, 25000]), legendaryTier: 5, crystals: 2, crystalTier: 3 }),
  // A battle's second goal (owner's outcome matrix, Nov 2026): done pays a
  // bonus; missed pays a quarter of it and costs countdown time; missed on a
  // story-critical battle sends the party back to the chapter's first battle.
  goals: Object.freeze({ bonusBase: 150, bonusPerBattle: 50, missShare: 0.25, missPenaltyMs: 2 * 60_000 }),
});

// The goal bonus for battle `number` (1-based).
export function goalBonus(number) {
  return STORY.goals.bonusBase + STORY.goals.bonusPerBattle * number;
}

// A battle's wave: its scenario, with its goal marked.
export function buildStoryWave(battle, heroes = []) {
  const threat = { hp: 1, dmg: 1 };
  const spec = { ...battle.wave, zombies: battle.wave.zombies ?? roamZombies(battle.wave.layer, battle.level) };
  const wave = buildScenarioWave(spec, battle.level, threat);
  const goal = battle.goal;
  if (!goal) return wave;
  wave.goal = { ...goal };
  const squadSize = (spec.boss ? 1 : 0) + (spec.leaders?.length || 0) + (spec.grunts?.length || 0);
  const squad = wave.enemies.slice(0, squadSize);
  if (goal.kind === "assassinate") {
    const target = squad[goal.targetIndex ?? 0];
    if (target) {
      target.quarry = { after: goal.escapeAfter || 30 };
      // The marked foe is tougher than its kind: it takes a plan to bring down in time.
      target.hp = target.maxHp = Math.round(target.maxHp * (goal.hpMult || 1));
    }
  } else if (goal.kind === "hold") {
    const raiders = new Set(goal.raiders || ["bandit", "goblin", "gnome"]);
    for (const enemy of squad) {
      if (raiders.has(enemy.type)) enemy.thief = { after: goal.raidAfter || 25, steal: enemy.thief?.steal || 0 };
    }
  }
  return wave;
}

export function storyState(state) {
  return state.story || { run: null, won: {}, lost: {}, lastLost: null, lastLegendary: null };
}

export function campaignBattles(campaign) {
  return campaign.chapters.flatMap((chapter, chapterIndex) =>
    chapter.battles.map((battle, index) => ({ ...battle, chapter: chapterIndex, number: chapterIndex * STORY.battlesPerChapter + index + 1, comingSoon: !!chapter.comingSoon })));
}

// The battle the run fights next, with its chapter.
export function currentBattle(run) {
  const campaign = CAMPAIGNS[run.campaignId];
  return campaignBattles(campaign)[run.battle] || null;
}

// The countdown left at `now`. Time signed out counts only past pauseCapMs.
export function storyTimeLeft(run, now) {
  let frozen = run.pausedMs || 0;
  if (run.pausedAt != null) frozen += Math.min(STORY.pauseCapMs, Math.max(0, now - run.pausedAt));
  return run.limitMs - (run.penaltyMs || 0) - Math.max(0, now - run.startedAt - frozen);
}

// The campaign a new run would play: never the one just lost, if there is another.
export function nextCampaignId(story, rng = Math.random) {
  const ids = Object.keys(CAMPAIGNS);
  const choices = ids.length > 1 ? ids.filter((id) => id !== story.lastLost) : ids;
  return story.queued && CAMPAIGNS[story.queued] ? story.queued : choices[Math.floor(rng() * choices.length)];
}

// Start the queued campaign with up to four heroes. Signing in is required.
export function startCampaign(state, heroIds, now, { signedIn = false, rng = Math.random } = {}) {
  const story = storyState(state);
  if (!signedIn) return { ok: false, reason: "sign_in" };
  if (story.run) return { ok: false, reason: "campaign_active" };
  const ids = [...new Set(heroIds)];
  if (ids.length < 1 || ids.length > 4) return { ok: false, reason: "invalid_party_size" };
  for (const id of ids) if (!findHero(state, id)) return { ok: false, reason: "unknown_hero" };
  if (Math.max(...ids.map((id) => findHero(state, id).progression.level)) < STORY.minLevel) return { ok: false, reason: "level_required" };
  const campaignId = nextCampaignId(story, rng);
  const next = serializeGameState(state);
  next.story = {
    ...storyState(next), queued: null,
    run: {
      campaignId, startedAt: now, limitMs: CAMPAIGNS[campaignId].timerMinutes * 60_000,
      pausedMs: 0, pausedAt: null, battle: 0, party: ids, joining: [], redoUsed: [], failed: null, penaltyMs: 0, lastGoal: null,
    },
  };
  return { ok: true, state: next };
}

// Signing out freezes the countdown; signing back in starts it again.
export function pauseStory(state, now) {
  const run = state.story?.run;
  if (!run || run.pausedAt != null) return state;
  const next = serializeGameState(state);
  next.story.run.pausedAt = now;
  return next;
}

export function resumeStory(state, now) {
  const run = state.story?.run;
  if (!run || run.pausedAt == null) return state;
  const next = serializeGameState(state);
  next.story.run.pausedMs += Math.min(STORY.pauseCapMs, Math.max(0, now - run.pausedAt));
  next.story.run.pausedAt = null;
  return next;
}

// The heroes fighting battle `run.battle`: the line-up, plus swaps that have arrived.
export function storyLineup(run) {
  return [...run.party, ...run.joining.filter((entry) => entry.from <= run.battle).map((entry) => entry.id)];
}

// Between battles: send `outId` back and call `inId`. The one sent back
// leaves now, so the next battle is fought one short; the one called joins
// for the battle after. Someone has to stay for the next battle.
export function swapStoryHero(state, outId, inId) {
  const run = state.story?.run;
  if (!run || run.failed || state.expedition) return { ok: false, reason: "not_now" };
  const lineup = storyLineup(run);
  const coming = run.joining.map((entry) => entry.id);
  if (!lineup.includes(outId)) return { ok: false, reason: "not_in_party" };
  if (!findHero(state, inId) || lineup.includes(inId) || coming.includes(inId)) return { ok: false, reason: "not_available" };
  if (lineup.length < 2) return { ok: false, reason: "last_hero" };
  const next = serializeGameState(state);
  const nextRun = next.story.run;
  nextRun.party = storyLineup(nextRun).filter((id) => id !== outId);
  nextRun.joining = [...nextRun.joining.filter((entry) => entry.from > nextRun.battle), { id: inId, from: nextRun.battle + 1 }];
  return { ok: true, state: next };
}

// Fight the next battle: a one-fight trip to the story region, started at
// once (story battles are always watched). Heroes injured or down sit it out.
export function beginStoryBattle(state, now, rng = Math.random) {
  const run = state.story?.run;
  if (!run) return { ok: false, reason: "no_campaign" };
  if (run.failed) return { ok: false, reason: "failed" };
  if (storyTimeLeft(run, now) <= 0) return { ok: false, reason: "out_of_time" };
  const battle = currentBattle(run);
  if (!battle || battle.comingSoon) return { ok: false, reason: "coming_soon" };
  const ready = storyLineup(run).filter((id) => {
    const hero = findHero(state, id);
    return hero && hero.combat.hp > 0 && !((state.injuries?.[id] || 0) > now);
  });
  if (!ready.length) return { ok: false, reason: "no_heroes" };
  const started = startExpedition(state, "story", ready, now, rng);
  if (!started.ok) return started;
  const trip = started.state.expedition;
  const wave = buildStoryWave(battle, ready.map((id) => findHero(started.state, id)).filter(Boolean));
  trip.pending = {
    kind: "campaign", wave, label: battle.title, campaignId: run.campaignId, battle: run.battle,
    at: now, promptAt: now, engagedAt: now,
  };
  addFeed(trip, now, `${CAMPAIGNS[run.campaignId].title}, battle ${battle.number}: ${battle.title}.`, "danger");
  return { ok: true, state: started.state };
}

// The first battle of chapter `chapter`.
const chapterStart = (chapter) => chapter * STORY.battlesPerChapter;

// After a story battle (fightResults.js, with the trip still open). The
// owner's outcome matrix (Nov 2026):
//   party survives, goal done       next battle, goal bonus
//   party survives, goal missed     next battle, a quarter of the bonus, and
//                                   STORY.goals.missPenaltyMs off the countdown
//   ...missed on a critical battle  back to the chapter's first battle, no bonus
//   whole party falls               Redo the chapter (once a chapter) or the
//                                   campaign starts again from battle 1
// Winning the last battle pays the bounty into the trip's loot.
export function recordStoryBattle(state, victory, at, rng = Math.random, goal = null) {
  const story = storyState(state);
  const run = story.run;
  if (!run) return;
  const trip = state.expedition;
  const battle = currentBattle(run);
  if (!victory) {
    run.lastGoal = null;
    if (!run.redoUsed.includes(battle.chapter)) {
      run.failed = { battle: run.battle, chapter: battle.chapter };
      addFeed(trip, at, `The whole party has fallen. Redo chapter ${battle.chapter + 1}, or start the campaign again.`, "danger");
    } else {
      restartCampaign(run);
      addFeed(trip, at, "The whole party has fallen. The campaign starts again from the first battle.", "danger");
    }
    return;
  }
  if (goal) {
    const bonus = goalBonus(battle.number);
    if (goal.done) {
      trip.loot.gold += bonus;
      run.lastGoal = { battle: battle.number, done: true, bonus };
      addFeed(trip, at, `Goal complete: +${bonus} gold.`, "good");
    } else if (goal.critical) {
      run.lastGoal = { battle: battle.number, done: false, critical: true };
      run.battle = chapterStart(battle.chapter);
      run.party = storyLineup(run);
      run.joining = run.joining.filter((entry) => entry.from > run.battle);
      addFeed(trip, at, `The goal was missed, and this one mattered. Back to the start of chapter ${battle.chapter + 1}.`, "danger");
      return;
    } else {
      const partial = Math.round(bonus * STORY.goals.missShare);
      trip.loot.gold += partial;
      run.penaltyMs = (run.penaltyMs || 0) + STORY.goals.missPenaltyMs;
      run.lastGoal = { battle: battle.number, done: false, bonus: partial, penaltyMs: STORY.goals.missPenaltyMs };
      addFeed(trip, at, `Goal missed: only +${partial} gold, and ${STORY.goals.missPenaltyMs / 60_000} minutes lost.`, "danger");
    }
  } else {
    run.lastGoal = null;
  }
  run.battle += 1;
  run.party = storyLineup(run);
  run.joining = run.joining.filter((entry) => entry.from > run.battle);
  const total = campaignBattles(CAMPAIGNS[run.campaignId]).length;
  if (run.battle < total) {
    addFeed(trip, at, "Victory. On to the next battle.", "good");
    return;
  }
  addFeed(trip, at, `${CAMPAIGNS[run.campaignId].title}: the campaign is won!`, "good", true);
  payBounty(state, trip, at, rng);
  story.won = { ...story.won, [run.campaignId]: (story.won[run.campaignId] || 0) + 1 };
  story.run = null;
  story.lastResult = { campaignId: run.campaignId, outcome: "won", at };
  story.queued = null;
  story.queued = nextCampaignId(story, rng);
}

// The campaign starts over from its first battle; the countdown keeps running.
function restartCampaign(run) {
  run.battle = 0;
  run.failed = null;
}

// The whole party fell: Redo the chapter from its first battle (once a
// chapter; a stand-in for a rewarded ad), after any swaps, gear or supplies,
// or accept and start the campaign again from battle 1.
export function answerStoryLoss(state, choice) {
  const run = state.story?.run;
  if (!run?.failed) return { ok: false, reason: "nothing_failed" };
  const next = serializeGameState(state);
  const nextRun = next.story.run;
  const chapter = nextRun.failed.chapter ?? currentBattle(nextRun).chapter;
  if (choice === "redo") {
    nextRun.redoUsed = [...nextRun.redoUsed, chapter];
    nextRun.battle = chapterStart(chapter);
    nextRun.failed = null;
  } else {
    restartCampaign(nextRun);
  }
  return { ok: true, state: next };
}

// Out of time: the campaign is lost, and a different one waits next time.
// Never during a story battle; that one is fought to the end first.
export function checkStoryTimer(state, now, rng = Math.random) {
  const run = state.story?.run;
  if (!run || run.pausedAt != null || state.expedition?.pending?.kind === "campaign") return state;
  if (storyTimeLeft(run, now) > 0) return state;
  const next = serializeGameState(state);
  const story = next.story;
  story.lost = { ...story.lost, [run.campaignId]: (story.lost[run.campaignId] || 0) + 1 };
  story.lastLost = run.campaignId;
  story.run = null;
  story.queued = null;
  story.queued = nextCampaignId(story, rng);
  story.lastResult = { campaignId: run.campaignId, outcome: "out_of_time", at: now };
  return next;
}

// A fortune, one legendary (never the same as last time), and crystals or shards.
function payBounty(state, trip, at, rng) {
  const { gold, legendaryTier, crystals, crystalTier } = STORY.bounty;
  const fortune = Math.round(gold[0] + rng() * (gold[1] - gold[0]));
  let item = randomLegendary(legendaryTier, rng);
  for (let tries = 0; tries < 5 && item.legendary === state.story?.lastLegendary && Object.keys(LEGENDARIES).length > 1; tries += 1) {
    item = randomLegendary(legendaryTier, rng);
  }
  trip.loot.gold += fortune;
  trip.loot.items.push(item);
  for (let i = 0; i < crystals; i += 1) trip.loot.items.push(chestCrystal(crystalTier, rng));
  state.story.lastLegendary = item.legendary;
  addFeed(trip, at, `The legendary bounty: ${fortune} gold, ${item.name}, and ${crystals} Radiant stones.`, "loot", true);
}

