import { classlessMaxHp } from "./classlessCombatEffects";
import * as C from "./config";
import { Engine } from "./engine";
import { BattleLog, LOG_CAP, SUMMARY_EVERY, formatTime } from "./battleLog";
import { buildWildEncounter, createEncounterSim } from "../game/encounters";
import { createGuild } from "../game/guild";
import { createGearItem } from "../game/items";
import { getRegion } from "../game/regions";

describe("the log itself", () => {
  test("newest first, capped, with a colour per kind", () => {
    const log = new BattleLog(["Odo"]);
    for (let i = 0; i < LOG_CAP + 5; i += 1) log.add(i, "spell", `line ${i}`);
    expect(log.lines.length).toBe(LOG_CAP);
    expect(log.lines[0].text).toBe(`line ${LOG_CAP + 4}`);
    expect(log.lines[0].color).toMatch(/^#/);
  });

  test("a summary line per active hero every 10 s, then a whole-fight line each at the end", () => {
    const log = new BattleLog(["Brann", "Odo"]);
    log.count(0, "hits", 3); log.count(0, "misses", 1); log.count(0, "dealt", 120.4); log.count(0, "taken", 30);
    log.tick(SUMMARY_EVERY - 0.1);
    expect(log.lines).toEqual([]);
    log.tick(SUMMARY_EVERY);
    expect(log.lines.map((line) => line.text)).toEqual(["Brann · 3 hits, 1 miss, 120 dmg, took 30"]);
    log.count(1, "spells", 2); log.count(1, "fizzles", 1);
    log.finish(15, "Victory");
    expect(log.filtered("summary").map((line) => line.text)).toEqual([
      "Odo (whole fight) · 2 spells (1 fizzled), 0 dmg, took 0",
      "Brann (whole fight) · 3 hits, 1 miss, 120 dmg, took 30",
      "Victory",
      "Brann · 3 hits, 1 miss, 120 dmg, took 30",
    ]);
  });

  test("filters and plain text for Copy (oldest first)", () => {
    const log = new BattleLog(["Odo"]);
    log.add(1, "spell", "Odo · Ember Bolt → Orc");
    log.add(65, "death", "Odo is down (Orc)");
    expect(log.filtered("spells").map((line) => line.text)).toEqual(["Odo · Ember Bolt → Orc"]);
    expect(log.filtered("deaths").map((line) => line.text)).toEqual(["Odo is down (Orc)"]);
    expect(log.text()).toBe("0:01 Odo · Ember Bolt → Orc\n1:05 Odo is down (Orc)");
    expect(formatTime(125.9)).toBe("2:05");
  });
});

describe("what a fight writes", () => {
  function caster(nodes = ["A1"]) {
    const hero = structuredClone(createGuild().heroes[0]);
    hero.traits = [];
    hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: "staff", rarity: "common", tier: 1 }) };
    hero.progression.ownedNodeIds = nodes;
    hero.progression.level = 10;
    hero.magic = { elements: [], casts: {} };
    hero.combat.hp = classlessMaxHp(hero);
    return hero;
  }
  const foe = (extra = {}) => {
    const base = C.ENEMIES.orc;
    return { id: "o", type: "orc", name: base.name, tier: base.tier, hp: 5000, maxHp: 5000, speed: 0, damage: 30, color: base.color,
      boss: false, x: 300, y: 360, dmgBy: {}, atkCd: 99, affinities: {}, families: [], ...extra };
  };
  function fight(enemies) {
    const engine = new Engine({ getContext: () => null }, createEncounterSim([caster()], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
    engine.spawnQueue = [];
    engine.active = enemies;
    const h = engine.heroes[0];
    h.x = 300; h.y = 420; h.mana = h.maxMana = 999;
    return { engine, h };
  }
  const withRoll = (value, fn) => { const spy = vi.spyOn(Math, "random").mockReturnValue(value); try { return fn(); } finally { spy.mockRestore(); } };

  test("a spell that lands names its target; a fizzle says so", () => {
    const orc = foe();
    const { engine, h } = fight([orc]);
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt"));
    h.spellCooldowns = {};
    withRoll(0.99, () => engine.castHeroSpell(0, "arcane_bolt"));
    const texts = engine.battleLog.lines.map((line) => line.text);
    expect(texts).toContain(`${engine._name(h)} · Arcane Bolt → ${orc.name}`);
    expect(texts.some((text) => /Arcane Bolt fizzled \(strained −20%\)/.test(text))).toBe(true);
  });

  test("an elite slain, a hero down, and the end of the fight", () => {
    const elite = foe({ tier: "elite" });
    const { engine, h } = fight([elite]);
    engine._killEnemy(elite, "H0");
    h.lastHitBy = foe();
    engine._heroDowned(h);
    h.alive = false;
    engine._checkEnd();
    const texts = engine.battleLog.lines.map((line) => line.text);
    expect(texts).toContain(`Elite ${elite.name} slain by ${engine._name(h)}`);
    expect(texts).toContain(`${engine._name(h)} is down (${elite.name})`);
    expect(texts).toContain("Defeat");
  });

  test("a real fight fills in summaries", () => {
    const { engine } = fight([foe({ damage: 5 })]);
    for (let t = 0; t < 21; t += 1 / 30) engine.update(1 / 30);
    expect(engine.battleLog.filtered("summary").length).toBeGreaterThanOrEqual(2);
  });
});
