import { fetchLatestBuild, isNewerBuild, reloadUrl } from "./updateCheck";

describe("new-version check", () => {
  test("reads the live build id, and gives null when it can't", async () => {
    const ok = (body) => async () => ({ ok: true, json: async () => body });
    expect(await fetchLatestBuild("/g/", ok({ build: "abc123" }))).toBe("abc123");
    expect(await fetchLatestBuild("/g/", ok({}))).toBeNull();
    expect(await fetchLatestBuild("/g/", async () => ({ ok: false }))).toBeNull();
    expect(await fetchLatestBuild("/g/", async () => { throw new Error("offline"); })).toBeNull();
    const seen = [];
    await fetchLatestBuild("/Gauntlet-s-survival/", async (url, options) => { seen.push([url, options]); return { ok: false }; });
    expect(seen[0][0]).toMatch(/^\/Gauntlet-s-survival\/version\.json\?t=\d+$/);
    expect(seen[0][1]).toEqual({ cache: "no-store" });
  });

  test("only a different live build counts as newer, and never on the dev server", () => {
    expect(isNewerBuild("aaa", "bbb")).toBe(true);
    expect(isNewerBuild("aaa", "aaa")).toBe(false);
    expect(isNewerBuild("aaa", null)).toBe(false);
    expect(isNewerBuild("dev", "bbb")).toBe(false);
  });

  test("the reload address carries the new build so a cached page isn't reused", () => {
    expect(reloadUrl("https://x.io/Gauntlet-s-survival/", "bbb")).toBe("https://x.io/Gauntlet-s-survival/?v=bbb");
    expect(reloadUrl("https://x.io/g/?v=aaa#hall", "bbb")).toBe("https://x.io/g/?v=bbb#hall");
  });
});
