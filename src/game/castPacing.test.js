import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { CASTING } from "../combat/spells";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild } from "./guild";
import { createGearItem } from "./items";
import { getRegion } from "./regions";

function caster(nodes = ["A1", "A3", "A3a"]) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "staff", rarity: "common", tier: 1 }) };
  hero.progression.ownedNodeIds = nodes;
  hero.progression.level = 15;
  hero.combat.stats.intelligence = 20;
  hero.magic = { elements: [], casts: {} };
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}

const foe = (i) => {
  const base = C.ENEMIES.orc;
  return { id: `o${i}`, type: "orc", name: base.name, tier: base.tier, hp: 9000, maxHp: 9000, speed: 0, damage: 0, color: base.color,
    boss: false, x: 260 + i * 25, y: 220 + (i % 2) * 20, dmgBy: {}, atkCd: 99, affinities: {}, families: [] };
};

function fight({ manual = false } = {}) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim([caster()], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = [0, 1, 2, 3, 4].map(foe);
  const h = engine.heroes[0];
  h.x = 300; h.y = 420; h.mana = h.maxMana; h.manual = manual;
  const casts = [];
  const cast = engine.castHeroSpell.bind(engine);
  engine.castHeroSpell = (...args) => { const ok = cast(...args); if (ok) casts.push({ t: engine.time, id: args[1], strain: h.strain }); return ok; };
  return { engine, h, casts };
}

const run = (engine, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) engine.update(1 / 60); };

describe("one spell at a time", () => {
  test("auto-cast waits 2.5 s between spells and never strains", () => {
    const { engine, casts } = fight();
    run(engine, 20);
    expect(casts.length).toBeGreaterThan(3);
    for (let k = 1; k < casts.length; k += 1) expect(casts[k].t - casts[k - 1].t).toBeGreaterThanOrEqual(CASTING.autoGap - 1e-9);
    expect(casts.every((entry) => entry.strain === 0)).toBe(true);
  });

  test("casting by hand inside the window strains: -20% per quick cast, stacking", () => {
    const { engine, h } = fight({ manual: true });
    const base = engine.getHeroSpellStatus(0).find((spell) => spell.id === "arcane_bolt").success;
    expect(engine.castHeroSpell(0, "meteor")).toBe(true);
    expect(h.strain).toBe(0);
    const bolt = engine.getHeroSpellStatus(0).find((spell) => spell.id === "arcane_bolt");
    expect(bolt.strain).toBeCloseTo(0.2);
    expect(bolt.nowSuccess).toBeCloseTo(Math.max(0.05, base - 0.2));
    engine.castHeroSpell(0, "arcane_bolt");
    expect(h.strain).toBe(1);
    engine.castHeroSpell(0, "arcane_channel");
    expect(h.strain).toBe(2);
    expect(engine.floaters.some((floater) => floater.text === "STRAINED -40%")).toBe(true);
  });

  test("strain clears once the caster rests for the window", () => {
    const { engine, h } = fight({ manual: true });
    engine.castHeroSpell(0, "meteor");
    run(engine, CASTING.strainWindow + 0.05);
    engine.castHeroSpell(0, "arcane_bolt");
    expect(h.strain).toBe(0);
  });
});

describe("the spell queue", () => {
  test("a tap on a free caster casts at once; taps while busy queue up to 3", () => {
    const { engine, h } = fight({ manual: true });
    h.mana = 9999; h.maxMana = 9999;
    expect(engine.queueHeroSpell(0, "meteor")).toBe("cast");
    expect(engine.queueHeroSpell(0, "arcane_channel")).toBe("queued");
    expect(engine.queueHeroSpell(0, "arcane_bolt")).toBe("queued");
    expect(h.spellQueue).toEqual(["arcane_channel", "arcane_bolt"]);
    expect(engine.getHeroSpellStatus(0).find((spell) => spell.id === "arcane_bolt").queued).toBe(true);
    h.spellQueue.push("x1");
    expect(engine.queueHeroSpell(0, "arcane_bolt")).toBe("unqueued");
    expect(h.spellQueue).toEqual(["arcane_channel", "x1"]);
    h.spellQueue.push("x2");
    expect(h.spellQueue.length).toBe(CASTING.queueCap);
    expect(engine.unqueueHeroSpell(0, "x1")).toBe(true);
    expect(engine.unqueueHeroSpell(0, "x2")).toBe(true);
    expect(engine.queueHeroSpell(0, "arcane_bolt")).toBe("queued");
  });

  test("the queue fires in order at the safe pace, with no strain", () => {
    const { engine, h, casts } = fight({ manual: true });
    h.mana = 9999; h.maxMana = 9999;
    engine.queueHeroSpell(0, "meteor");
    engine.queueHeroSpell(0, "arcane_channel");
    engine.queueHeroSpell(0, "arcane_bolt");
    run(engine, 6);
    expect(casts.map((entry) => entry.id)).toEqual(["meteor", "arcane_channel", "arcane_bolt"]);
    expect(casts.every((entry) => entry.strain === 0)).toBe(true);
    expect(casts[1].t - casts[0].t).toBeGreaterThanOrEqual(CASTING.strainWindow - 1e-9);
    expect(h.spellQueue).toEqual([]);
  });

  test("a queued spell it can't afford by then is dropped; auto-cast waits for the queue", () => {
    const { engine, h, casts } = fight();
    engine.castHeroSpell(0, "arcane_bolt");
    h.spellQueue = ["meteor"];
    h.mana = 0;
    run(engine, 0.5);
    expect(casts.length).toBe(1);
    run(engine, CASTING.strainWindow);
    expect(h.spellQueue).toEqual([]);
    expect(casts.some((entry) => entry.id === "meteor")).toBe(false);
  });

  test("hold to cast now skips the queue (and takes the strain)", () => {
    const { engine, h } = fight({ manual: true });
    engine.queueHeroSpell(0, "meteor");
    expect(engine.castHeroSpell(0, "arcane_bolt", null, { announce: true })).toBe(true);
    expect(h.strain).toBe(1);
  });
});
