import { CRYSTALS, STAFF_SHARD_KEYS, crystalFits, crystalInfo } from "../combat/gear";
import { Engine } from "../combat/engine";
import { RANK_CASTS, maxMana, spellPower, spellRadius } from "../combat/spells";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { chestCrystal, composeStats, createGearItem, randomShard } from "./items";
import { getRegion } from "./regions";

const staff = (shard, tier = 1) => {
  const item = createGearItem({ slot: "weapon", variant: "staff", rarity: "rare", tier: 1 });
  item.runes = shard ? [`${shard}-${tier}`] : [];
  item.stats = composeStats(item);
  return item;
};
const caster = (weapon) => {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.equipment = { weapon };
  hero.progression.ownedNodeIds = ["A1", "A2"];
  hero.magic = { elements: ["fire"], casts: { ember_bolt: RANK_CASTS[2], cinder_field: RANK_CASTS[2] } };
  return hero;
};

describe("staff shards", () => {
  test("four shards in three tiers; they fit staves only", () => {
    expect(STAFF_SHARD_KEYS.every((key) => CRYSTALS[key].kind === "staff")).toBe(true);
    expect(crystalInfo("wellspring-1").fullName).toBe("Chipped Wellspring Shard");
    expect(crystalInfo("fury-3").fullName).toBe("Radiant Fury Shard");
    expect(crystalInfo("ember-1").fullName).toBe("Chipped Ember Crystal");
    const sword = createGearItem({ slot: "weapon", variant: "sword", rarity: "rare", tier: 1 });
    const helm = createGearItem({ slot: "head", rarity: "rare", tier: 1 });
    expect(crystalFits(staff(null), crystalInfo("focus-1"))).toBe(true);
    expect(crystalFits(sword, crystalInfo("focus-1"))).toBe(false);
    expect(crystalFits(helm, crystalInfo("focus-1"))).toBe(false);
    expect(crystalFits(staff(null), crystalInfo("ember-1"))).toBe(true); // weapon crystals still fit staves
  });

  test("Wellspring: max mana; Focus: damage spells; Reach: spell area", () => {
    const plain = caster(staff(null));
    expect(maxMana(caster(staff("wellspring", 1)))).toBe(Math.round(maxMana(plain) * 1.15));
    expect(maxMana(caster(staff("wellspring", 3)))).toBe(Math.round(maxMana(plain) * 1.4));
    expect(spellPower(caster(staff("focus", 2)), "ember_bolt", { staff: true }) / spellPower(plain, "ember_bolt", { staff: true })).toBeCloseTo(1.18);
    expect(spellRadius(caster(staff("reach", 3)), "cinder_field") / spellRadius(plain, "cinder_field")).toBeCloseTo(1.28);
  });

  test("Fury: the staff attacks faster, and its wielder's burns land sooner (same total)", () => {
    const fight = (weapon) => {
      const engine = new Engine({ getContext: () => null }, createEncounterSim([caster(weapon)], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
      return engine;
    };
    const plain = fight(staff(null));
    const fury = fight(staff("fury", 3));
    expect(plain.heroes[0].d.rate / fury.heroes[0].d.rate).toBeCloseTo(1.2);
    const foe = () => ({ hp: 1000, dmgBy: {} });
    const a = foe(); const b = foe();
    plain._applyDot(a, 120, 3, "#FF6600", "H0");
    fury._applyDot(b, 120, 3, "#FF6600", "H0");
    expect(a.dots[0].dps * 3).toBeCloseTo(120);
    expect(b.dots[0].dps * (3 / 1.2)).toBeCloseTo(120);
    expect(b.dots[0].until - fury.time).toBeCloseTo(2.5);
  });

  test("chests: a staff shard half the time", () => {
    expect(STAFF_SHARD_KEYS).toContain(crystalInfo(randomShard(2, () => 0.7).key).key);
    expect(STAFF_SHARD_KEYS).toContain(crystalInfo(chestCrystal(1, () => 0.2).key).key);
    expect(crystalInfo(chestCrystal(1, () => 0.6).key)).not.toBeNull();
  });
});
