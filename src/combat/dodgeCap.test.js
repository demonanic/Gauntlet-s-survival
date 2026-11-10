import { Engine, HERO_DODGE_CAP } from "./engine";

// Calibration (Nov 2026): late heroes stacked agility, evasion and low-HP
// dodge to skip ~37% of all swings. Every source together now stops at 30%.
describe("hero dodge cap", () => {
  const chance = (d, hp = 100) => Engine.prototype._heroDodgeChance.call({}, { d: { maxHp: 100, ...d }, ref: { hp } });

  test("every source together stops at the cap", () => {
    expect(HERO_DODGE_CAP).toBe(0.3);
    expect(chance({ dodge: 0.35, evasion: 0.2, lowHpDodge: 0.2 }, 10)).toBe(0.3);
  });

  test("below the cap nothing changes", () => {
    expect(chance({ dodge: 0.1, evasion: 0.05 })).toBeCloseTo(0.15);
  });
});
