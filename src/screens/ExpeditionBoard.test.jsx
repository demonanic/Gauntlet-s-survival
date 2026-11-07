import { describe, expect, test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExpeditionBoard from "./ExpeditionBoard";
import { createGuild } from "../game/guild";

// The board must draw for a new guild, with every locked region saying what opens it.
describe("expedition board", () => {
  test("draws for a new guild, with the Dead March locked behind Frostfang", () => {
    const html = renderToStaticMarkup(createElement(ExpeditionBoard, { guild: createGuild(), now: 0, onLaunch: () => {} }));
    expect(html).toContain("The Dead March");
    expect(html).toContain('data-testid="region-locked-march"');
    expect(html).toMatch(/region-locked-march[^>]*>[^<]*Clear Frostfang/);
  });

  test("draws once Frostfang is cleared, with the Dead March open", () => {
    const guild = { ...createGuild(), clears: { frostfang: 1 } };
    const html = renderToStaticMarkup(createElement(ExpeditionBoard, { guild, now: 0, onLaunch: () => {} }));
    expect(html).not.toContain('data-testid="region-locked-march"');
  });
});
