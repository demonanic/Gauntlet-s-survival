import { WEB_GAME_URL, gameUrl } from "./cloudSave";

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
