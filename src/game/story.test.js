import { debugSetLevels } from "./debug";
import { TIME_WARP } from "./campaigns/timeWarp";
import { HORDE } from "./encounters";
import { tick } from "./expedition";
import { createGuild, currentEncounterParty, recruitHero, resolveEncounter } from "./guild";
import { seededRandom } from "./random";
import {
  CAMPAIGNS, STORY, answerStoryLoss, beginStoryBattle, campaignBattles, checkStoryTimer, currentBattle, nextCampaignId,
  pauseStory, recordStoryBattle, resumeStory, startCampaign, storyLineup, storyTimeLeft, swapStoryHero,
} from "./story";

const T0 = 1_000_000;
const guild = () => {
  let state = { ...createGuild(), gold: 1e6 };
  state = recruitHero(state).state;
  state = recruitHero(state).state;
  return debugSetLevels(state, 12).state;
};
const ids = (state, n = 4) => state.heroes.slice(0, n).map((hero) => hero.identity.id);
const started = () => {
  const state = guild();
  return startCampaign(state, ids(state), T0, { signedIn: true, rng: () => 0 }).state;
};
// Fight the current battle and report `victory`.
const fight = (state, victory, at = T0 + 1000) => {
  const begun = beginStoryBattle(state, at, seededRandom(3));
  expect(begun.ok).toBe(true);
  const party = currentEncounterParty(begun.state);
  return resolveEncounter(begun.state, { victory, party, xpGains: {}, gold: 0, items: [] }, at + 1000, { rng: seededRandom(4) }).state;
};

describe("story mode: the Time Warp Breach", () => {
  test("five chapters of four battles; battles 1-16 are scripted scenarios, chapter 5 waits for its bosses", () => {
    const battles = campaignBattles(TIME_WARP);
    expect(TIME_WARP.chapters).toHaveLength(5);
    expect(battles).toHaveLength(20);
    expect(battles.map((battle) => battle.number)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const battle of battles.slice(0, 16)) expect(battle.wave.faction).toBeTruthy();
    expect(battles.slice(16).every((battle) => battle.comingSoon && battle.boss)).toBe(true);
    // Difficulty climbs, battle by battle.
    const levels = battles.slice(0, 16).map((battle) => battle.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  test("starting needs a signed-in player and a hero of level 6", () => {
    const state = guild();
    expect(startCampaign(state, ids(state), T0).reason).toBe("sign_in");
    const fresh = createGuild();
    expect(startCampaign(fresh, ids(fresh, 3), T0, { signedIn: true }).reason).toBe("level_required");
    const run = started().story.run;
    expect(run.campaignId).toBe("timeWarp");
    expect(run.limitMs).toBe(TIME_WARP.timerMinutes * 60_000);
    expect(run.battle).toBe(0);
  });

  test("a battle is a one-fight trip, started at once; winning moves on", () => {
    const state = started();
    const begun = beginStoryBattle(state, T0 + 1000, seededRandom(3)).state;
    expect(begun.expedition.regionId).toBe("story");
    expect(begun.expedition.pending).toMatchObject({ kind: "campaign", label: "Scouts on the ridge", engagedAt: T0 + 1000 });
    expect(begun.expedition.pending.wave.enemies.map((enemy) => enemy.type)).toEqual(["warlock", "bandit", "bandit"]);
    const after = fight(state, true);
    expect(after.expedition).toBeNull();
    expect(after.story.run.battle).toBe(1);
    expect(after.lastReport.regionId).toBe("story");
  });

  test("a lost battle: Redo once a chapter, or fall back to the chapter before", () => {
    let state = started();
    state.story.run.battle = 9; // chapter 3, battle 10
    state = fight(state, false);
    expect(state.story.run.failed).toEqual({ battle: 9 });
    expect(beginStoryBattle(state, T0 + 5000).reason).toBe("failed");
    state = answerStoryLoss(state, "redo").state;
    expect(state.story.run).toMatchObject({ battle: 9, failed: null, redoUsed: [2] });
    // Redo spent: the next loss in the chapter falls straight back to chapter 2.
    state = fight(state, false);
    expect(state.story.run).toMatchObject({ battle: 4, failed: null });
    // Accepting a loss in chapter 1 restarts chapter 1.
    let first = started();
    first.story.run.battle = 2;
    first = answerStoryLoss(fight(first, false), "accept").state;
    expect(first.story.run.battle).toBe(0);
  });

  test("the countdown runs on real time; signing out freezes it for up to 24 hours", () => {
    let state = started();
    const run = () => state.story.run;
    expect(storyTimeLeft(run(), T0 + 60_000)).toBe(run().limitMs - 60_000);
    state = pauseStory(state, T0 + 60_000);
    expect(storyTimeLeft(run(), T0 + 60_000 + 3_600_000)).toBe(run().limitMs - 60_000);
    state = resumeStory(state, T0 + 60_000 + 3_600_000);
    expect(storyTimeLeft(run(), T0 + 120_000 + 3_600_000)).toBe(run().limitMs - 120_000);
    // Two days signed out: the first day is frozen, the second counts.
    const away = pauseStory(started(), T0);
    const twoDays = 2 * STORY.pauseCapMs;
    expect(storyTimeLeft(away.story.run, T0 + twoDays)).toBe(away.story.run.limitMs - STORY.pauseCapMs);
  });

  test("out of time: the campaign is lost and a different one is queued (or this one, while it's the only one)", () => {
    const state = started();
    const late = T0 + state.story.run.limitMs + 1;
    // Never mid-battle: the battle is finished first.
    const fighting = beginStoryBattle(state, T0 + 1000, seededRandom(3)).state;
    expect(checkStoryTimer(fighting, late).story.run).not.toBeNull();
    const lost = checkStoryTimer(state, late);
    expect(lost.story.run).toBeNull();
    expect(lost.story.lost).toEqual({ timeWarp: 1 });
    expect(lost.story.lastResult.outcome).toBe("out_of_time");
    expect(lost.story.queued).toBe("timeWarp");
    expect(beginStoryBattle(lost, late).reason).toBe("no_campaign");
    expect(nextCampaignId({ lastLost: "timeWarp" }, () => 0)).toBe(Object.keys(CAMPAIGNS)[0]);
  });

  test("swaps between battles: the one sent back leaves now, the one called joins for the battle after", () => {
    let state = started();
    const b = ids(state, 2)[1];
    const extra = state.heroes[4].identity.id;
    state = swapStoryHero(state, b, extra).state;
    expect(storyLineup(state.story.run)).not.toContain(b);
    expect(storyLineup(state.story.run)).not.toContain(extra);
    const begun = beginStoryBattle(state, T0 + 1000, seededRandom(3)).state;
    expect(begun.expedition.heroIds).not.toContain(extra);
    state = fight(state, true);
    expect(storyLineup(state.story.run)).toContain(extra);
    expect(beginStoryBattle(state, T0 + 9000, seededRandom(3)).state.expedition.heroIds).toContain(extra);
    // Someone has to stay.
    const solo = startCampaign(guild(), [], T0, { signedIn: true });
    expect(solo.reason).toBe("invalid_party_size");
    const one = guild();
    const alone = startCampaign(one, ids(one, 1), T0, { signedIn: true }).state;
    expect(swapStoryHero(alone, ids(one, 1)[0], one.heroes[4].identity.id).reason).toBe("last_hero");
  });

  test("winning the last battle pays a legendary bounty, a different legendary each time", () => {
    const win = (state, seed) => {
      state.story.run.battle = 19;
      state.expedition = { feed: [], loot: { gold: 0, items: [] } };
      recordStoryBattle(state, true, T0, seededRandom(seed));
      return state;
    };
    const first = win(started(), 1);
    const { gold, items } = first.expedition.loot;
    expect(gold).toBeGreaterThanOrEqual(STORY.bounty.gold[0]);
    expect(gold).toBeLessThanOrEqual(STORY.bounty.gold[1]);
    expect(items.filter((item) => item.rarity === "legendary")).toHaveLength(1);
    expect(items.filter((item) => item.kind === "crystal")).toHaveLength(STORY.bounty.crystals);
    expect(first.story).toMatchObject({ run: null, won: { timeWarp: 1 }, lastResult: { outcome: "won" } });
    // The next win never repeats the last legendary.
    for (let seed = 2; seed < 12; seed += 1) {
      const again = started();
      again.story.lastLegendary = first.story.lastLegendary;
      const legendary = win(again, seed).expedition.loot.items.find((item) => item.rarity === "legendary");
      expect(legendary.legendary).not.toBe(first.story.lastLegendary);
    }
  });

  test("story battles are never fought for the player: one left unfought is called off", () => {
    const state = started();
    const begun = beginStoryBattle(state, T0, seededRandom(3)).state;
    const later = tick(begun, T0 + 11 * 60_000, { rng: seededRandom(2) });
    expect(later.expedition).toBeNull();
    expect(later.lastReport.outcome).toBe("recalled");
    expect(later.story.run.battle).toBe(0);
  });

  test("story waves carry their twists and zombies", () => {
    const battles = campaignBattles(TIME_WARP);
    const begun = (index) => {
      const state = started();
      state.story.run.battle = index;
      return beginStoryBattle(state, T0, seededRandom(3)).state.expedition.pending.wave;
    };
    expect(begun(3).twist).toBe("warded");
    expect(begun(4).enemies.some((enemy) => enemy.type === HORDE.enemy)).toBe(true);
    expect(begun(6).enemies.some((enemy) => enemy.thief)).toBe(true);
    expect(battles[6].wave.twist).toBe("thieves");
  });
});
