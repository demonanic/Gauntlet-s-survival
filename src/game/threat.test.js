import { GEAR_SLOTS } from "../combat/gear";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { buildEndlessWave, createEncounterSim, endlessWaveSource } from "./encounters";
import { createGuild, startExpedition } from "./guild";
import { debugSetLevels } from "./debug";
import { createGearItem } from "./items";
import { getRegion } from "./regions";
import { THREAT, endgameThreat, partyPower, partyThreat, referencePower, regionReference } from "./threat";

function geared(level, rarity, tier) {
  const state = debugSetLevels(createGuild(), level).state;
  for (const hero of state.heroes) {
    for (const slot of GEAR_SLOTS) {
      hero.equipment[slot] = slot === "weapon"
        ? createGearItem({ slot, variant: "sword", rarity, tier }, () => 0.5)
        : createGearItem({ slot, rarity, tier }, () => 0.5);
    }
    hero.combat.hp = classlessMaxHp(hero);
  }
  return state;
}

describe("enemies that keep up with the party", () => {
  test("a party no stronger than the region's reference meets it as tuned", () => {
    const region = getRegion("blightmire");
    expect(partyThreat(createGuild().heroes, region)).toEqual({ hp: 1, dmg: 1 });
    expect(regionReference(region)).toEqual({ level: 10, tier: 4 });
    expect(referencePower(10, 4)).toBe(referencePower(10, 4));
  });

  test("a stronger party meets stronger enemies, capped", () => {
    const region = getRegion("frostfang");
    const strong = geared(20, "epic", 8).heroes;
    const threat = partyThreat(strong, region);
    const party = partyPower(strong);
    const { level, tier } = regionReference(region);
    const reference = referencePower(level, tier);
    expect(threat.hp).toBeGreaterThan(1);
    expect(threat.dmg).toBeGreaterThan(1);
    expect(threat.hp).toBeLessThanOrEqual(THREAT.max);
    expect(threat.dmg).toBeLessThanOrEqual(THREAT.maxDmg);
    expect(threat.hp).toBeCloseTo(Math.min(THREAT.max, (party.offense / reference.offense / THREAT.slack) ** THREAT.close), 1);
    expect(threat.dmg).toBeCloseTo(Math.min(THREAT.maxDmg, (party.toughness / reference.toughness / THREAT.slack) ** THREAT.close), 1);
  });

  // Calibration (Nov 2026): damage was capped at 3x with HP, and parties
  // 5+ levels over a region stopped losing HP. Damage now grows further.
  test("enemy damage keeps growing past 3x for a far stronger party", () => {
    const threat = partyThreat(geared(20, "epic", 8).heroes, getRegion("frostfang"));
    expect(threat.dmg).toBeGreaterThan(3);
    expect(THREAT.maxDmg).toBeGreaterThan(THREAT.max);
  });

  // Endless runs and ranked bosses escalate on their own and keep the old cap.
  test("endless runs and ranked bosses keep the endgame cap", () => {
    const strong = geared(20, "epic", 8).heroes;
    for (const id of ["rift", "march", "roam"]) {
      const threat = partyThreat(strong, getRegion(id));
      expect(threat.hp).toBeLessThanOrEqual(THREAT.endgameMax);
      expect(threat.dmg).toBeLessThanOrEqual(THREAT.endgameMax);
    }
    expect(endgameThreat({ hp: 4.2, dmg: 25 })).toEqual({ hp: THREAT.endgameMax, dmg: THREAT.endgameMax });
    expect(endgameThreat({ hp: 1.5, dmg: 2 })).toEqual({ hp: 1.5, dmg: 2 });
  });

  test("the trip remembers the threat, and the Rift carries it to every wave", () => {
    const state = geared(20, "epic", 8);
    const ids = state.heroes.map((hero) => hero.identity.id);
    const rift = startExpedition(state, "rift", ids, 1_000_000).state;
    const { threat } = rift.expedition;
    expect(threat.hp).toBeGreaterThan(1);
    const plain = buildEndlessWave(1, () => 0.5);
    const scaled = rift.expedition.pending.wave;
    expect(scaled.threat).toEqual(threat);
    const sim = createEncounterSim(state.heroes, 1, scaled);
    const next = endlessWaveSource(sim, () => 0.5)(1);
    expect(next.threat).toEqual(threat);
    expect(next.enemies[0].maxHp).toBeGreaterThan(buildEndlessWave(2, () => 0.5).enemies[0].maxHp);
    expect(plain.threat).toEqual({ hp: 1, dmg: 1 });
  });
});
