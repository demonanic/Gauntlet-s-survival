import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { createGearItem } from "./items";
import { choosePending, createGuild, recruitHero, startExpedition, tick } from "./guild";
import { guildHints } from "./hints";
import { parseGuild } from "./storage";
import {
  TUTORIAL_STEPS, advanceTutorial, currentStep, nextTutorialStep, restartTutorial, skipTutorial, tutorialActive,
} from "./tutorial";

const T0 = 1_000_000;
const ui = (extra = {}) => ({ tab: "hall", gearOpen: false, inBattle: false, ...extra });
const stepId = (guild) => currentStep(guild)?.id;
const ids = (guild) => guild.heroes.map((hero) => hero.identity.id);

describe("tutorial", () => {
  test("new guilds start it; saves from before it don't", () => {
    expect(stepId(createGuild())).toBe("welcome");
    const old = JSON.parse(JSON.stringify(createGuild()));
    delete old.tutorial;
    expect(tutorialActive(parseGuild(old))).toBe(false);
    const midway = { ...JSON.parse(JSON.stringify(createGuild())), tutorial: { step: TUTORIAL_STEPS.findIndex((step) => step.id === "board"), done: false } };
    expect(stepId(parseGuild(midway))).toBe("board");
  });

  test("steps move on when the player does what they ask", () => {
    let guild = createGuild();
    guild = nextTutorialStep(guild);
    expect(stepId(guild)).toBe("roster");
    expect(advanceTutorial(guild, ui())).toBe(guild); // a "next" step waits for its button
    guild = nextTutorialStep(guild);
    expect(stepId(guild)).toBe("recruit");
    expect(advanceTutorial(guild, ui())).toBe(guild);
    guild = recruitHero(guild).state;
    guild = advanceTutorial(guild, ui());
    expect(stepId(guild)).toBe("gear");
    guild = advanceTutorial(guild, ui({ gearOpen: true }));
    expect(stepId(guild)).toBe("gearSheet");
    guild = advanceTutorial(guild, ui({ gearOpen: false }));
    expect(stepId(guild)).toBe("board");
    guild = advanceTutorial(guild, ui({ tab: "board" }));
    expect(stepId(guild)).toBe("party");
    guild = startExpedition(guild, "gutter", ids(guild), T0, Math.random, { tutorial: true }).state;
    guild = advanceTutorial(guild, ui({ tab: "board" }));
    expect(stepId(guild)).toBe("feed");
  });

  test("a player who already sent a party skips the guild-hall steps", () => {
    let guild = nextTutorialStep(nextTutorialStep(createGuild()));
    guild = startExpedition(guild, "gutter", ids(guild), T0).state;
    expect(stepId(advanceTutorial(guild, ui()))).toBe("feed");
  });

  test("sneaking past the first encounter skips the battle step", () => {
    let guild = createGuild();
    guild.tutorial = { step: TUTORIAL_STEPS.findIndex((step) => step.id === "prompt"), done: false };
    guild = startExpedition(guild, "gutter", ids(guild), T0, Math.random, { tutorial: true }).state;
    guild = tick(guild, T0 + 7_000, { interactive: true, rng: () => 0.5 });
    expect(stepId(advanceTutorial(guild, ui()))).toBe("prompt");
    guild = choosePending(guild, "sneak", T0 + 8_000, { rng: () => 0 }).state;
    expect(stepId(advanceTutorial(guild, ui()))).toBe("done");
    expect(stepId(advanceTutorial(guild, ui({ inBattle: true })))).toBe("battle");
  });

  test("skip ends it; replay starts over", () => {
    const skipped = skipTutorial(createGuild());
    expect(tutorialActive(skipped)).toBe(false);
    expect(stepId(restartTutorial(skipped))).toBe("welcome");
    let guild = createGuild();
    for (let index = 0; index < TUTORIAL_STEPS.length; index += 1) guild = nextTutorialStep(guild);
    expect(tutorialActive(guild)).toBe(false);
  });

  test("the tutorial trip's first event is a quick, easy encounter that waits for the player", () => {
    let guild = createGuild();
    guild = startExpedition(guild, "gutter", ids(guild), T0, Math.random, { tutorial: true }).state;
    expect(guild.expedition.nextEventAt).toBe(T0 + 6_000);
    guild = tick(guild, T0 + 6_000, { interactive: true, rng: () => 0.99 });
    expect(guild.expedition.pending).toMatchObject({ kind: "sighting", patient: true });
    expect(guild.expedition.pending.wave.enemies).toHaveLength(2);
    // Long after the usual 45 seconds, it still waits while the game is open...
    expect(tick(guild, T0 + 10 * 60_000, { interactive: true }).expedition.pending).not.toBeNull();
    // ...but a party left alone still decides for itself.
    expect(tick(guild, T0 + 10 * 60_000, { interactive: false }).expedition?.pending ?? null).toBeNull();
    expect(guild.expedition.tutorial).toBe(false);
  });
});

describe("guild hints", () => {
  const ready = () => {
    const guild = createGuild();
    for (const hero of guild.heroes) {
      hero.traits = [];
      hero.combat.hp = classlessMaxHp(hero);
      hero.quickSlots = [{ key: "bandage", qty: 5 }, null];
    }
    guild.freeRecruitUsed = true;
    return guild;
  };

  test("a quiet guild has nothing to say", () => {
    expect(guildHints(ready(), T0)).toEqual([]);
  });

  test("a short roster hears about its free recruit first", () => {
    const guild = { ...ready(), freeRecruitUsed: false };
    expect(guildHints(guild, T0)[0]).toMatchObject({ id: "free-recruit", action: { kind: "recruit" } });
    expect(guildHints(recruitHero(guild).state, T0).map((hint) => hint.id)).not.toContain("free-recruit");
  });

  test("players who already have a full roster skip the recruit step", () => {
    let guild = nextTutorialStep(nextTutorialStep(createGuild()));
    guild = { ...recruitHero(guild).state, tutorial: guild.tutorial };
    expect(stepId(advanceTutorial(guild, ui()))).toBe("gear");
  });

  test("unspent points, better gear, low arrows and empty quick slots", () => {
    const guild = ready();
    guild.heroes[0].progression.ap = 2;
    guild.vault.push(createGearItem({ slot: "head", rarity: "rare", tier: 3 }));
    guild.stash.arrows = 0;
    guild.heroes[2].quickSlots = [null, null];
    const hints = guildHints(guild, T0);
    expect(hints.map((hint) => hint.id)).toEqual(["points", `gear-${guild.heroes[0].identity.id}`, "arrows"]);
    expect(hints[0].action).toMatchObject({ kind: "perks", heroId: guild.heroes[0].identity.id });
    expect(hints[2].action).toMatchObject({ kind: "tab", tab: "market" });
  });

  test("a weapon of another kind is not suggested as an upgrade", () => {
    const guild = ready();
    const swordsman = guild.heroes.find((hero) => hero.equipment.weapon.weaponType === "sword");
    guild.heroes = [swordsman];
    guild.vault.push(createGearItem({ slot: "weapon", variant: "bow", rarity: "epic", tier: 5 }));
    expect(guildHints(guild, T0).some((hint) => hint.id.startsWith("gear-"))).toBe(false);
  });

  test("a newly opened region is pointed out", () => {
    const guild = ready();
    guild.clears = { gutter: 1 };
    guild.heroes[0].progression.level = 3;
    expect(guildHints(guild, T0).find((hint) => hint.id === "region-boneyard")).toBeTruthy();
  });
});
