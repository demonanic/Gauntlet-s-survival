import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Story, { formatCountdown } from "./Story";
import { createGuild } from "../game/guild";
import { debugSetLevels } from "../game/debug";
import { startCampaign } from "../game/story";

const T0 = 1_000_000;
const draw = (guild, props = {}) => renderToStaticMarkup(createElement(Story, {
  guild, now: T0, signedIn: true, onStart: () => ({ ok: true }), onFight: () => ({ ok: true }), onSwap: () => ({ ok: true }), onLoss: () => {}, ...props,
}));
const running = () => {
  const guild = debugSetLevels(createGuild(), 8).state;
  return startCampaign(guild, guild.heroes.map((hero) => hero.identity.id), T0, { signedIn: true }).state;
};

describe("the story screen", () => {
  test("before a campaign: the pitch, the rules, and a sign-in reminder when signed out", () => {
    const html = draw(createGuild(), { signedIn: false });
    expect(html).toContain("The Time Warp Breach");
    expect(html).toContain("nothing here plays itself");
    expect(html).toContain('data-testid="story-sign-in"');
    expect(draw(createGuild())).not.toContain('data-testid="story-sign-in"');
  });

  test("a campaign under way: the countdown, chapter 1's opening, the first battle and the line-up", () => {
    const html = draw(running());
    expect(html).toMatch(/data-testid="story-timer"[^>]*>45:00</);
    expect(html).toContain("Chapter 1: The Omen");
    expect(html).toContain("Scouts on the ridge");
    expect(html).toContain('data-testid="story-fight"');
    expect(html).toContain('data-testid="story-lineup"');
    // Its second goal.
    expect(html).toContain("Kill the warlock before he slips away");
  });

  test("signed out the countdown shows as paused; a wipe offers Redo or starting again", () => {
    const guild = running();
    guild.story.run.pausedAt = T0;
    expect(draw(guild, { now: T0 + 60_000 })).toMatch(/PAUSED <!-- -->45:00|PAUSED 45:00/);
    guild.story.run.pausedAt = null;
    guild.story.run.failed = { battle: 0, chapter: 0 };
    const html = draw(guild);
    expect(html).toContain('data-testid="story-redo"');
    expect(html).toContain("Start the campaign again");
    expect(html).toMatch(/Redo chapter (<!-- -->)?1/);
    expect(html).not.toContain('data-testid="story-fight"');
  });

  test("countdown format", () => {
    expect(formatCountdown(45 * 60_000)).toBe("45:00");
    expect(formatCountdown(3_909_000)).toBe("1:05:09");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
