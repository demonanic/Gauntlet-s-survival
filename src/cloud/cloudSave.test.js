import { WEB_GAME_URL, clockOffset, gameUrl } from "./cloudSave";
import { gameNow, setClockOffset } from "./gameClock";

describe("cloud email links", () => {
  test("send the player back to the game itself, subfolder included", () => {
    const location = { origin: "https://demonanic.github.io" };
    expect(gameUrl(location, "/Gauntlet-s-survival/")).toBe("https://demonanic.github.io/Gauntlet-s-survival/");
    expect(gameUrl(location, "/")).toBe("https://demonanic.github.io/");
    expect(gameUrl(undefined, "/")).toBeUndefined();
    // The Android app serves the game from https://localhost; links go to the web game.
    expect(gameUrl({ origin: "https://localhost", protocol: "https:" }, "/")).toBe(WEB_GAME_URL);
    // The dev server (http://localhost:5173) keeps its own address.
    expect(gameUrl({ origin: "http://localhost:5173", protocol: "http:" }, "/")).toBe("http://localhost:5173/");
  });
});

describe("the server clock (story mode's countdown)", () => {
  test("the offset is measured from the middle of the round trip", () => {
    // Sent at 1000, answered at 1200 (device time); the server said 61100.
    expect(clockOffset(61_100, 1000, 1200)).toBe(60_000);
  });

  test("the game clock follows the offset", () => {
    setClockOffset(5000);
    expect(Math.abs(gameNow() - (Date.now() + 5000))).toBeLessThan(50);
    setClockOffset(Number.NaN);
    expect(Math.abs(gameNow() - Date.now())).toBeLessThan(50);
  });
});
