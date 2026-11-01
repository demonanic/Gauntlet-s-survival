import { BIG_MOVES, BIG_SPELLS, BRANCH_COLORS, ICON_PATHS, KNOWN_MOVE_IDS, KNOWN_SPELL_SHAPES, MOVE_ICONS, SPELL_SHAPE_ICONS, branchColor, moveIcon, spellIcon } from "./abilityLook";
import { getClasslessAbilityDefinition } from "./classlessAbilities";
import { SPELLS } from "./spells";

describe("ability look", () => {
  test("every special move has its own icon", () => {
    for (const id of KNOWN_MOVE_IDS) {
      expect(MOVE_ICONS[id], id).toBeTruthy();
      expect(ICON_PATHS[MOVE_ICONS[id]], id).toMatch(/^M/);
    }
    expect(KNOWN_MOVE_IDS.length).toBeGreaterThan(10);
  });

  test("every move's branch has a colour", () => {
    for (const id of KNOWN_MOVE_IDS.filter((moveId) => moveId !== "sharedStrike")) {
      const branch = getClasslessAbilityDefinition(id)?.branch;
      expect(BRANCH_COLORS[branch], `${id} (${branch})`).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(branchColor("nonsense")).toBe(BRANCH_COLORS.Basic);
  });

  test("every spell shape has an icon", () => {
    for (const shape of KNOWN_SPELL_SHAPES) expect(ICON_PATHS[SPELL_SHAPE_ICONS[shape]], shape).toMatch(/^M/);
    for (const spell of Object.values(SPELLS)) expect(spellIcon(spell)).toMatch(/^M/);
  });

  test("big moves and spells exist", () => {
    for (const id of BIG_MOVES) expect(KNOWN_MOVE_IDS).toContain(id);
    for (const id of BIG_SPELLS) expect(SPELLS[id], id).toBeTruthy();
    expect(moveIcon("unknown")).toBe(ICON_PATHS.strike);
  });
});
