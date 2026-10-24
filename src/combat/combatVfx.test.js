import fs from "fs";
import path from "path";
import {
  COMBAT_VFX_ASSETS,
  combatVfxAssetId,
  drawCombatVfx,
  getCombatVfxImage,
  projectileVfxAssetId,
} from "./combatVfx";

describe("source-bundle combat VFX assets", () => {
  test("all registered PNGs exist and contain nonempty transparent image data", () => {
    for (const assetPath of Object.values(COMBAT_VFX_ASSETS)) {
      const filePath = path.join(__dirname, "../../public", assetPath);
      const bytes = fs.readFileSync(filePath);
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
      expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
      expect(bytes.readUInt8(25)).toBe(6); // RGBA source crop retains the alpha channel.
    }
  });

  test("maps real combat events to supplied slash, impact, ability, and status artwork", () => {
    expect(combatVfxAssetId({ kind: "weapon_swing" })).toBe("impactSlash04");
    expect(combatVfxAssetId({ kind: "hit", crit: false })).toBe("impactStar01");
    expect(combatVfxAssetId({ kind: "hit", crit: true })).toBe("impactBurst07");
    expect(combatVfxAssetId({ kind: "spell_cast" })).toBe("impactOrbit05");
    expect(combatVfxAssetId({ kind: "shared_strike" })).toBe("impactCrescent08");
    expect(combatVfxAssetId({ kind: "smoke" })).toBe("impactVortex06");
    expect(combatVfxAssetId({ kind: "echo_hit" })).toBe("impactStar02");
    expect(combatVfxAssetId({ kind: "not_a_runtime_event" })).toBeNull();
  });

  test("chooses stable original projectile variants without changing combat state", () => {
    const arrow = projectileVfxAssetId({ visualType: "arrow", sourceId: "H0" });
    const energy = projectileVfxAssetId({ visualType: "magic", sourceId: "H0" });
    expect(arrow).toMatch(/^arrow0[1-4]$/);
    expect(projectileVfxAssetId({ visualType: "arrow", sourceId: "H0" })).toBe(arrow);
    expect(energy).toMatch(/^magicEnergy0[1-4]$/);
    expect(projectileVfxAssetId({ visualType: "none", sourceId: "H0" })).toBeNull();
  });

  test("caches image requests and skips drawing until the source asset is loaded", () => {
    const cache = new Map();
    const instances = [];
    class MockImage { constructor() { instances.push(this); this.complete = false; this.naturalWidth = 0; } }
    const image = getCombatVfxImage("arrow01", cache, { ImageConstructor: MockImage, publicUrl: "/game" });
    expect(image.src).toBe("/game/sprites/vfx/projectiles/arrow-01.png");
    expect(getCombatVfxImage("arrow01", cache, { ImageConstructor: MockImage })).toBe(image);
    expect(instances).toHaveLength(1);
    const ctx = { save: jest.fn(), restore: jest.fn(), translate: jest.fn(), rotate: jest.fn(), drawImage: jest.fn() };
    expect(drawCombatVfx(ctx, image, { kind: "projectile", x: 2, y: 3 })).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();

    image.complete = true; image.naturalWidth = 200; image.naturalHeight = 80;
    expect(drawCombatVfx(ctx, image, { kind: "projectile", x: 2, y: 3, rotation: 1, vfxSize: 40 }, 0.8)).toBe(true);
    expect(ctx.translate).toHaveBeenCalledWith(2, 3);
    expect(ctx.rotate).toHaveBeenCalledWith(1);
    const [, x, y, width, height] = ctx.drawImage.mock.calls[0];
    expect(x).toBeCloseTo(-width / 2);
    expect(y).toBeCloseTo(-height / 2);
    expect(width / height).toBeCloseTo(2.5);
  });
});
