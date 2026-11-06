import { classlessMaxHp } from "./classlessCombatEffects";
import * as C from "./config";
import { Engine } from "./engine";
import { RANK_CASTS } from "./spells";
import { buildWildEncounter, createEncounterSim } from "../game/encounters";
import { createGuild } from "../game/guild";
import { createGearItem } from "../game/items";
import { getRegion } from "../game/regions";

function engineWith(enemies) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "staff", rarity: "common", tier: 1 }) };
  hero.progression.ownedNodeIds = ["A1", "A2"];
  hero.magic = { elements: ["fire"], casts: { ember_bolt: RANK_CASTS[2] } };
  hero.combat.hp = classlessMaxHp(hero);
  const engine = new Engine({ getContext: () => null }, createEncounterSim([hero], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = enemies;
  return engine;
}
const foe = (x, y) => ({ id: `o-${x}`, type: "orc", name: "Orc", tier: C.ENEMIES.orc.tier, hp: 500, maxHp: 500, speed: 0, damage: 40,
  color: "#fff", boss: false, x, y, dmgBy: {}, atkCd: 99, affinities: {}, families: [] });

describe("test mode cheats in battle", () => {
  test("mana, cooldowns, god mode and kill all", () => {
    const orcs = [foe(100, 100), foe(200, 100)];
    const engine = engineWith(orcs);
    const h = engine.heroes[0];
    h.mana = 0; h.spellCooldowns = { ember_bolt: 4 }; h.abilityCooldowns = { x: 9 }; h.castCd = 0.5; h.strain = 2;
    engine.debugCheat("mana");
    expect(h.mana).toBe(h.maxMana);
    engine.debugCheat("cooldowns");
    expect(h.spellCooldowns).toEqual({});
    expect(h.abilityCooldowns).toEqual({});
    expect(h.strain).toBe(0);

    h.ref.hp = 10;
    expect(engine.debugCheat("god")).toBe(true);
    expect(h.ref.hp).toBe(h.d.maxHp);
    expect(engine._resolveClasslessHeroDamage(h, 50)).toBe(0);
    expect(h.ref.hp).toBe(h.d.maxHp);
    expect(engine.debugCheat("god")).toBe(false);
    expect(engine._resolveClasslessHeroDamage(h, 50)).toBe(50);

    engine.debugCheat("kill");
    expect(orcs.every((e) => e.hp === 0 && e._dead)).toBe(true);
  });
});
