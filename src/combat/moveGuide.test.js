import { lockedMoves, nextSpells } from "./moveGuide";
import { createGuild } from "../game/guild";

const hero = (weapon) => createGuild().heroes.find((entry) => entry.equipment.weapon.weaponType === weapon);

describe("unlock guide", () => {
  test("lists every perk move a hero lacks, soonest first, with how to get it", () => {
    const fresh = hero("sword");
    const locked = lockedMoves(fresh);
    expect(locked.length).toBe(12);
    expect(locked[0]).toMatchObject({ minLevel: 5 });
    expect(locked.find((move) => move.name === "Execution")).toMatchObject({ nodeId: "P3", minLevel: 5, apCost: 2, needs: ["Mark", "Deadeye"], anyPrerequisite: true });
    expect(locked.find((move) => move.name === "Rally")).toMatchObject({ minLevel: 5, apCost: 2, needs: ["Readiness"], anyPrerequisite: false });
    expect(locked.map((move) => move.minLevel)).toEqual([...locked.map((move) => move.minLevel)].sort((a, b) => a - b));
    fresh.progression.ownedNodeIds = ["P1", "P2", "P3"];
    expect(lockedMoves(fresh).some((move) => move.id === "P3")).toBe(false);
  });

  test("no spells: null (the panel says how to start); casters see the next spell per element", () => {
    expect(nextSpells(hero("staff"))).toBeNull();
    const caster = hero("staff");
    caster.progression.ownedNodeIds = ["A1", "A2"];
    caster.magic = { elements: ["electric"], casts: { arc_surge: 9 } };
    const lines = nextSpells(caster);
    expect(lines.find((line) => line.element === "electric")).toMatchObject({ spell: "Chain Pulse", casts: 9, needed: 15 });
    // Arcane's later spells come from perks, not casts.
    expect(lines.find((line) => line.element === "arcane")).toMatchObject({ spell: "Arcane Channel", minLevel: 10 });
  });
});
