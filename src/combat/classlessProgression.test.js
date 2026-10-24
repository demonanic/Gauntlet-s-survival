import { allocateClasslessStat, awardClasslessXp, CANONICAL_NODES, getCanonicalNode, purchaseClasslessNode, purchaseNode } from "./classlessProgression";
import { createHero } from "./logic";

const CANONICAL_IDS = [
  "V1", "V2", "V2a", "V3", "V3a", "W1", "W2", "W2a", "W3", "W3a",
  "P1", "P2", "P2a", "P3", "P3a", "S1", "S2", "S2a", "S3", "S3a",
  "A1", "A2", "A2a", "A3", "A3a", "T1", "T2", "T2a", "T3", "T3a",
  "C1", "C2", "C2a", "C3", "C3a", "H1", "H2", "H3", "F1", "F2", "F3",
  "N1", "N2", "N3", "I1", "I2", "I3",
];

describe("classless progression catalog", () => {
  test("contains the 47 permanent bible IDs exactly once", () => {
    const ids = CANONICAL_NODES.map(({ id }) => id);
    expect(ids).toHaveLength(47);
    expect(new Set(ids).size).toBe(47);
    expect(ids).toEqual(CANONICAL_IDS);
  });

  test("records costs, level gates, same-branch prerequisites, and Phase 2 nodes", () => {
    expect(getCanonicalNode("V1")).toMatchObject({ tier: 1, apCost: 1, minLevel: 1, prerequisites: [] });
    expect(getCanonicalNode("V2a")).toMatchObject({ tier: 2, apCost: 2, minLevel: 5, prerequisites: ["V1"] });
    expect(getCanonicalNode("V3a")).toMatchObject({ tier: 3, apCost: 3, minLevel: 10, prerequisites: ["V2", "V2a"] });
    expect(CANONICAL_NODES.filter(({ gated }) => gated).map(({ id }) => id)).toEqual(["C3", "C3a", "N3"]);
    expect(getCanonicalNode("nope")).toBeNull();
  });

  test("maps all four expansion branches to their bible-defined Tier III node", () => {
    for (const [nodeId, prerequisite] of [["H3", "H2"], ["F3", "F2"], ["N3", "N2"], ["I3", "I2"]]) {
      expect(getCanonicalNode(nodeId)).toMatchObject({ tier: 3, apCost: 3, minLevel: 10, prerequisites: [prerequisite] });
    }
  });
});

describe("purchaseNode", () => {
  test("returns a new value and leaves the input untouched on success", () => {
    const input = Object.freeze({ level: 1, ap: 1, ownedNodeIds: Object.freeze([]) });
    const result = purchaseNode(input, "V1");

    expect(result).toEqual({ ok: true, progression: { level: 1, ap: 0, ownedNodeIds: ["V1"] } });
    expect(input).toEqual({ level: 1, ap: 1, ownedNodeIds: [] });
    expect(result.progression).not.toBe(input);
  });

  test.each([
    [{ level: 1, ap: 10, ownedNodeIds: [] }, "V2", "level_required"],
    [{ level: 5, ap: 10, ownedNodeIds: [] }, "V2", "prerequisite_required"],
    [{ level: 10, ap: 10, ownedNodeIds: ["V1", "W1", "W2"] }, "V3", "prerequisite_required"],
    [{ level: 10, ap: 2, ownedNodeIds: ["V1", "V2"] }, "V3", "insufficient_ap"],
    [{ level: 10, ap: 3, ownedNodeIds: ["V1", "V2", "V3", "W1", "W2", "W3", "P1", "P2"] }, "P3", "tier_iii_mastery_cap"],
    [{ level: 10, ap: 3, ownedNodeIds: ["C1", "C2"] }, "C3", "phase_gated"],
    [{ level: 10, ap: 3, ownedNodeIds: [] }, "unknown", "unknown_node"],
    [{ level: 10, ap: 3, ownedNodeIds: ["V1"] }, "V1", "already_owned"],
    [{ level: 10, ap: 3, ownedNodeIds: ["unknown"] }, "V1", "invalid_progression"],
    [{ level: 10, ap: 3, ownedNodeIds: ["C3"] }, "V1", "invalid_progression"],
    [{ level: 10, ap: 3, ownedNodeIds: ["V1", "V2", "V3", "W1", "W2", "W3", "P1", "P2", "P3"] }, "I1", "invalid_progression"],
  ])("refuses invalid purchase %s %s with %s", (progression, nodeId, reason) => {
    const before = JSON.stringify(progression);
    const result = purchaseNode(progression, nodeId);

    expect(result).toEqual({ ok: false, reason });
    expect(JSON.stringify(progression)).toBe(before);
  });

  test("allows either Tier II prerequisite to unlock a same-branch Tier III", () => {
    const result = purchaseNode({ level: 10, ap: 3, ownedNodeIds: ["V1", "V2a"] }, "V3a");
    expect(result.ok).toBe(true);
    expect(result.progression.ownedNodeIds).toEqual(["V1", "V2a", "V3a"]);
    expect(result.progression.ap).toBe(0);
  });

  test("classless purchase adapter changes only progression after validation", () => {
    const hero = createHero();
    hero.progression.ap = 1;
    const originalIdentity = hero.identity;
    const originalCombat = hero.combat;
    const result = purchaseClasslessNode(hero, "V1");
    expect(result).toEqual({ ok: true, progression: { ...hero.progression, ap: 0, ownedNodeIds: ["V1"] } });
    expect(hero.identity).toBe(originalIdentity);
    expect(hero.combat).toBe(originalCombat);
    expect(hero.progression).toEqual({ level: 1, xp: 0, ap: 1, sp: 0, ownedNodeIds: [] });
  });

  test("Precision active nodes unlock only after their canonical purchase validates", () => {
    const hero = createHero();
    hero.progression = { level: 10, xp: 9000, ap: 3, sp: 9, ownedNodeIds: ["P1", "P2"] };
    expect(purchaseClasslessNode(hero, "P3")).toMatchObject({ ok: true, progression: { ap: 0, ownedNodeIds: ["P1", "P2", "P3"] } });
    expect(hero.progression.ownedNodeIds).toEqual(["P1", "P2"]);
    const secondAbility = createHero();
    secondAbility.progression = { level: 10, xp: 9000, ap: 3, sp: 9, ownedNodeIds: ["P1", "P2a"] };
    expect(purchaseClasslessNode(secondAbility, "P3a")).toMatchObject({ ok: true, progression: { ap: 0, ownedNodeIds: ["P1", "P2a", "P3a"] } });
  });

  test("Vanguard active nodes unlock only after their canonical purchase validates", () => {
    const hero = createHero();
    hero.progression = { level: 10, xp: 9000, ap: 6, sp: 9, ownedNodeIds: ["V1", "V2"] };
    const cleave = purchaseClasslessNode(hero, "V3");
    expect(cleave).toMatchObject({ ok: true, progression: { ap: 3, ownedNodeIds: ["V1", "V2", "V3"] } });
    const warCry = purchaseClasslessNode(hero, "V3a");
    expect(warCry).toMatchObject({ ok: true, progression: { ap: 3, ownedNodeIds: ["V1", "V2", "V3a"] } });
    const twoTierThree = purchaseClasslessNode({ ...hero, progression: cleave.progression }, "V3a");
    expect(twoTierThree).toMatchObject({ ok: true, progression: { ap: 0, ownedNodeIds: ["V1", "V2", "V3", "V3a"] } });
  });

  test.each([
    [{ level: 1, ap: 1, ownedNodeIds: [] }, "V2", "level_required"],
    [{ level: 1, ap: 1, ownedNodeIds: [] }, "H3", "level_required"],
    [{ level: 1, ap: 1, ownedNodeIds: [] }, "missing-node", "unknown_node"],
    [{ level: 10, ap: 2, ownedNodeIds: ["H1", "H2"] }, "H3", "insufficient_ap"],
  ])("classless adapter preserves the hero when purchase is rejected", (progression, nodeId, reason) => {
    const hero = createHero();
    hero.progression = { ...progression };
    const before = JSON.stringify(hero);
    expect(purchaseClasslessNode(hero, nodeId)).toEqual({ ok: false, reason });
    expect(JSON.stringify(hero)).toBe(before);
  });

  test("rejects legacy heroes at the classless adapter boundary", () => {
    expect(purchaseClasslessNode(createHero("knight"), "V1")).toEqual({ ok: false, reason: "not_classless_hero" });
  });

  test("purchases implemented Echo and keeps Ward pending while its range is unspecified", () => {
    const hero = createHero();
    hero.progression = { level: 5, xp: 0, ap: 4, sp: 4, ownedNodeIds: ["C1"] };
    expect(purchaseClasslessNode(hero, "C2")).toMatchObject({ ok: true,
      progression: { ap: 2, ownedNodeIds: ["C1", "C2"] } });
    expect(purchaseClasslessNode({ ...hero, progression: { ...hero.progression, ap: 2 } }, "C2a"))
      .toEqual({ ok: false, reason: "effect_pending" });
  });

  test("permits only the newly registered Interpose and Blood Price/Covenant effects after canonical prerequisites", () => {
    const warden = createHero();
    warden.progression = { level: 10, xp: 0, ap: 6, sp: 0, ownedNodeIds: ["W1", "W2"] };
    expect(purchaseClasslessNode(warden, "W3")).toMatchObject({ ok: true, progression: { ownedNodeIds: ["W1", "W2", "W3"] } });

    const hemomancer = createHero();
    hemomancer.progression = { level: 10, xp: 0, ap: 6, sp: 0, ownedNodeIds: ["H1", "H2"] };
    expect(purchaseClasslessNode(hemomancer, "H3")).toMatchObject({ ok: true, progression: { ownedNodeIds: ["H1", "H2", "H3"] } });
  });

  test("classless battle XP awards use the shared threshold curve and grant AP/SP per level", () => {
    const start = { level: 1, xp: 0, ap: 0, sp: 0, ownedNodeIds: [] };
    expect(awardClasslessXp(start, 700)).toEqual({
      ok: true, progression: { level: 4, xp: 700, ap: 3, sp: 3, ownedNodeIds: [] },
    });
    expect(start).toEqual({ level: 1, xp: 0, ap: 0, sp: 0, ownedNodeIds: [] });
  });

  test("classless stat allocation spends one SP on one combat attribute atomically", () => {
    const hero = createHero();
    hero.progression.sp = 1;
    const result = allocateClasslessStat(hero, "attack");
    expect(result.ok).toBe(true);
    expect(result.hero.combat.stats.attack).toBe(11);
    expect(result.hero.progression.sp).toBe(0);
    expect(hero.combat.stats.attack).toBe(10);
    expect(hero.progression.sp).toBe(1);
    expect(allocateClasslessStat(result.hero, "bogus").ok).toBe(false);
  });
});
