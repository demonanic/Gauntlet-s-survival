import { GEAR_SLOTS } from "../combat/gear";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { buildEndlessWave, createEncounterSim, endlessWaveSource } from "./encounters";
import { createGuild, startExpedition } from "./guild";
import { debugSetLevels } from "./debug";
import { createGearItem } from "./items";
import { getRegion } from "./regions";
import { THREAT, heroPower, partyThreat, referencePower } from "./threat";

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
    expect(referencePower(13, 5)).toBe(referencePower(13, 5));
  });

  test("a stronger party meets enemies grown to close half the gap, capped", () => {
    const region = getRegion("frostfang");
    const strong = geared(20, "epic", 8).heroes;
    const threat = partyThreat(strong, region);
    const party = heroPower(strong[0]);
    const reference = referencePower(region.level, region.tier);
    expect(threat.hp).toBeGreaterThan(1);
    expect(threat.dmg).toBeGreaterThan(1);
    expect(threat.hp).toBeLessThanOrEqual(THREAT.max);
    expect(threat.hp).toBeLessThan(party.offense / reference.offense);
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
