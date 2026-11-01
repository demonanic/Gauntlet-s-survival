import { ELEMENT_LOOKS, SpellVfx, VFX_QUALITY, mix, rankLook } from "./spellVfx";

// A canvas context that accepts every call and records nothing.
function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => gradient;
      if (prop === "measureText") return () => ({ width: 10 });
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

const ELEMENTS = Object.keys(ELEMENT_LOOKS);

describe("spell effects", () => {
  test("each element grows with proficiency in its own way", () => {
    expect(rankLook("fire", 1).core).not.toBe(rankLook("fire", 5).core);
    expect(rankLook("fire", 5).size).toBeGreaterThan(rankLook("fire", 1).size);
    expect([1, 2, 3, 4, 5].map((rank) => rankLook("ice", rank).shards)).toEqual([1, 2, 3, 4, 5]);
    expect([1, 5].map((rank) => rankLook("electric", rank).forks)).toEqual([1, 4]);
    expect(rankLook("mind", 5).pulse).toBeGreaterThan(rankLook("mind", 1).pulse);
    expect(rankLook("poison", 5).trail).toBeGreaterThan(rankLook("poison", 1).trail);
    expect([1, 3, 5].map((rank) => rankLook("arcane", rank).rings)).toEqual([1, 2, 3]);
    expect(rankLook("fire", 9)).toEqual(rankLook("fire", 5));
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  test("never draws on Math.random, so it can't shift a fight's rolls", () => {
    const random = vi.spyOn(Math, "random");
    const vfx = new SpellVfx();
    const ctx = fakeContext();
    const foe = { x: 200, y: 100, hp: 10 };
    for (const element of ELEMENTS) {
      vfx.cast(element, 50, 100, 3);
      vfx.bolt(element, { x: 50, y: 100 }, foe, 3);
      vfx.area(element, 200, 100, 60, 5);
      vfx.aura(element, foe, 2, 4);
      vfx.fizzle(element, 50, 100);
    }
    vfx.meteorWarning(200, 100, 50, 2);
    vfx.meteorImpact(200, 100, 50, 5);
    vfx.arc("electric", foe, { x: 230, y: 120 }, 5);
    for (let i = 0; i < 120; i += 1) { vfx.update(1 / 60); vfx.draw(ctx); }
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  test("effects end on their own and statuses end with the foe", () => {
    const vfx = new SpellVfx();
    const foe = { x: 200, y: 100, hp: 10 };
    vfx.aura("fire", foe, 10, 1);
    vfx.bolt("fire", { x: 0, y: 0 }, foe, 1);
    vfx.update(0.5);
    expect(vfx.auras).toHaveLength(1);
    foe.hp = 0;
    for (let i = 0; i < 200; i += 1) vfx.update(1 / 30);
    expect(vfx.auras).toHaveLength(0);
    expect(vfx.particles).toHaveLength(0);
    expect(vfx.beams).toHaveLength(0);
  });

  test("thins out when frames are slow and comes back when they recover", () => {
    const vfx = new SpellVfx();
    const frames = (fps, seconds) => { for (let i = 0; i < fps * seconds; i += 1) vfx.noteFrame(1 / fps); };
    frames(60, 2);
    expect(vfx.quality).toBe(1);
    frames(30, 1.1);
    expect(vfx.quality).toBe(VFX_QUALITY.steps[1]);
    frames(30, 3.3);
    expect(vfx.quality).toBe(VFX_QUALITY.steps[3]);
    frames(60, 8);
    expect(vfx.quality).toBe(1);
    // Fewer particles at low quality.
    const busy = (quality) => {
      const v = new SpellVfx();
      v.quality = quality;
      for (let i = 0; i < 6; i += 1) v.area("fire", 200, 100, 60, 5);
      return v.particles.length;
    };
    expect(busy(0.25)).toBeLessThan(busy(1));
  });
});
