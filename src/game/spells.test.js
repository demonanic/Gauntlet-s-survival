import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { purchaseNode } from "../combat/classlessProgression";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import {
  MAGIC, RANK_CASTS, castSuccessChance, canCast, elementSlot, knownSpells, learnElement, maxMana, proficiency,
  recordCasts, spellPower, supportPower, heroBeast, chooseBeast,
} from "../combat/spells";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild, currentEncounterParty, resolveEncounter, startExpedition } from "./guild";
import { createGearItem } from "./items";
import { getRegion } from "./regions";
import { parseGuild } from "./storage";
import { withPendingFight } from "../test/expeditionFixtures";

function caster({ nodes = ["A1"], elements = [], casts = {}, intelligence = 10, level = 12, weapon = "staff" } = {}) {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: weapon, rarity: "common", tier: 1 }) };
  hero.progression.ownedNodeIds = nodes;
  hero.progression.level = level;
  hero.combat.stats.intelligence = intelligence;
  hero.magic = { elements, casts };
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}

function foe(type = "orc", x = 300, y = 200, extra = {}) {
  const base = C.ENEMIES[type];
  return { id: `${type}-${x}`, type, name: base.name, tier: base.tier, hp: 5000, maxHp: 5000, speed: 0, damage: 0, color: base.color,
    boss: false, x, y, dmgBy: {}, atkCd: 99, affinities: {}, families: [], ...extra };
}

function engineWith(hero, enemies) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim([hero], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
  engine.spawnQueue = [];
  engine.active = enemies;
  const h = engine.heroes[0];
  h.x = 300; h.y = 420;
  return { engine, h };
}

const withRoll = (value, fn) => {
  const roll = vi.spyOn(Math, "random").mockReturnValue(value);
  try { return fn(); } finally { roll.mockRestore(); }
};

describe("learning magic", () => {
  test("Arcane Spark opens casting: mana and Arcane Bolt; the Arcana nodes can be bought", () => {
    expect(canCast(caster({ nodes: [] }))).toBe(false);
    expect(maxMana(caster({ nodes: [] }))).toBe(0);
    expect(knownSpells(caster()).map((spell) => spell.id)).toEqual(["arcane_bolt"]);
    expect(maxMana(caster({ intelligence: 15 }))).toBe(60 + 20 + 24);
    expect(purchaseNode({ level: 1, ap: 1, ownedNodeIds: [] }, "A1").ok).toBe(true);
    expect(purchaseNode({ level: 5, ap: 2, ownedNodeIds: ["A1"] }, "A2").ok).toBe(true);
    expect(purchaseNode({ level: 10, ap: 3, ownedNodeIds: ["A1", "A2"] }, "A3a").ok).toBe(true);
    expect(knownSpells(caster({ nodes: ["A1", "A2", "A3", "A3a"] })).map((spell) => spell.id)).toEqual(["arcane_bolt", "arcane_channel", "meteor"]);
  });

  test("Elementalism picks an element; proficiency teaches its area spell (II) and curse (IV)", () => {
    const hero = caster({ nodes: ["A1", "A2"] });
    expect(elementSlot(caster())).toMatchObject({ ok: false, reason: "needs_elementalism" });
    const fire = learnElement(hero, "fire").hero;
    expect(fire.magic.elements).toEqual(["fire"]);
    expect(knownSpells(fire).map((spell) => spell.id)).toEqual(["arcane_bolt", "ember_bolt"]);
    fire.magic.casts = { ember_bolt: RANK_CASTS[1] };
    expect(knownSpells(fire).map((spell) => spell.id)).toContain("cinder_field");
    expect(knownSpells(fire).map((spell) => spell.id)).not.toContain("flare_bind");
    fire.magic.casts = { ember_bolt: RANK_CASTS[3] };
    expect(knownSpells(fire).map((spell) => spell.id)).toContain("flare_bind");
  });

  test("a 2nd element needs proficiency III and level 12 (2 AP); a 3rd needs V and level 18", () => {
    const base = caster({ nodes: ["A1", "A2"], elements: ["fire"], level: 12 });
    base.progression.ap = 5;
    expect(elementSlot(base)).toMatchObject({ ok: false, reason: "proficiency", rank: 3 });
    base.magic.casts = { ember_bolt: RANK_CASTS[2] };
    const second = learnElement(base, "ice");
    expect(second.ok).toBe(true);
    expect(second.hero.progression.ap).toBe(3);
    expect(second.hero.magic.elements).toEqual(["fire", "ice"]);
    expect(elementSlot(second.hero)).toMatchObject({ ok: false, reason: "proficiency", rank: 5 });
    second.hero.magic.casts.ember_bolt = RANK_CASTS[4];
    expect(elementSlot(second.hero)).toMatchObject({ ok: false, reason: "level", level: 18 });
    second.hero.progression.level = 18;
    expect(learnElement(second.hero, "mind").hero.magic.elements).toEqual(["fire", "ice", "mind"]);
    expect(elementSlot({ ...second.hero, magic: { elements: ["fire", "ice", "mind"], casts: second.hero.magic.casts } })).toMatchObject({ reason: "all_elements" });
  });

  test("casts land more often with Intelligence, Luck and proficiency, up to 95%", () => {
    expect(castSuccessChance(caster(), "arcane")).toBeCloseTo(0.6);
    expect(castSuccessChance(caster({ intelligence: 20 }), "arcane")).toBeCloseTo(0.75);
    const lucky = caster();
    lucky.combat.stats.luck = 10;
    expect(castSuccessChance(lucky, "arcane")).toBeCloseTo(0.63);
    expect(castSuccessChance(caster({ casts: { arcane_bolt: RANK_CASTS[4] } }), "arcane")).toBeCloseTo(0.8);
    expect(castSuccessChance(caster({ intelligence: 60, casts: { arcane_bolt: 500 } }), "arcane")).toBe(MAGIC.maxSuccess);
  });

  test("only successful casts count; spells and proficiency rank up", () => {
    const hero = caster({ nodes: ["A1", "A2"], elements: ["fire"] });
    expect(recordCasts(hero, { ember_bolt: 14 })).toEqual([]);
    expect(recordCasts(hero, { ember_bolt: 1 })).toEqual([{ kind: "spell", id: "ember_bolt", rank: 2 }, { kind: "element", id: "fire", rank: 2 }]);
    expect(proficiency(hero, "fire")).toBe(2);
    expect(spellPower(hero, "ember_bolt")).toBeGreaterThan(spellPower(caster({ nodes: ["A1", "A2"], elements: ["fire"] }), "ember_bolt"));
  });
});

describe("casting in battle", () => {
  test("a cast spends mana; it can fizzle (no damage, no credit) or land (damage, credit)", () => {
    const target = foe();
    const { engine, h } = engineWith(caster(), [target]);
    const mana = h.mana;
    withRoll(0.99, () => engine.castHeroSpell(0, "arcane_bolt", target));
    expect(h.mana).toBe(mana - 10);
    expect(target.hp).toBe(5000);
    expect(engine.spellSuccesses).toEqual({});
    h.spellCooldowns.arcane_bolt = 0;
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt", target));
    expect(target.hp).toBeLessThan(5000);
    expect(engine.spellSuccesses).toEqual({ 0: { arcane_bolt: 1 } });
    // On cooldown now.
    expect(engine.castHeroSpell(0, "arcane_bolt", target)).toBe(false);
  });

  test("area spells hit a crowd, curses linger, Chain Spark jumps, meteors land late", () => {
    const area = caster({ nodes: ["A1", "A2", "A2a", "A3a"], elements: ["fire"], casts: { ember_bolt: RANK_CASTS[1] } });
    const crowd = [foe("orc", 300, 200), foe("goblin", 330, 210), foe("skeleton", 600, 200)];
    const { engine, h } = engineWith(area, crowd);
    withRoll(0, () => engine.castHeroSpell(0, "cinder_field", crowd[0]));
    expect(crowd[0].hp).toBeLessThan(5000);
    expect(crowd[1].hp).toBeLessThan(5000);
    expect(crowd[2].hp).toBe(5000);
    expect(crowd[0].dots.length).toBeGreaterThan(0);

    const chain = [foe("orc", 300, 200), foe("goblin", 380, 200), foe("skeleton", 460, 200)];
    const second = engineWith(area, chain);
    withRoll(0, () => second.engine.castHeroSpell(0, "ember_bolt", chain[0]));
    expect(chain.every((enemy) => enemy.hp < 5000)).toBe(true);

    const meteorFoes = [foe("orc", 300, 200)];
    const third = engineWith(area, meteorFoes);
    withRoll(0, () => third.engine.castHeroSpell(0, "meteor", meteorFoes[0]));
    expect(meteorFoes[0].hp).toBe(5000);
    third.engine.time += 2.1;
    third.engine._landMeteors(meteorFoes[0]);
    expect(meteorFoes[0].hp).toBeLessThan(5000);
    expect(h.mana).toBeLessThan(h.maxMana);
  });

  test("magic-immune foes shrug spells off", () => {
    const target = foe("orc", 300, 200, { magicImmune: true });
    const { engine } = engineWith(caster(), [target]);
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt", target));
    expect(target.hp).toBe(5000);
  });

  test("on auto, casters cast by themselves: an area spell on a crowd", () => {
    const hero = caster({ nodes: ["A1", "A2"], elements: ["ice"], casts: { rime_lance: RANK_CASTS[1] } });
    const crowd = [foe("orc", 300, 250), foe("goblin", 320, 260)];
    const { engine, h } = engineWith(hero, crowd);
    h.currentTarget = crowd[0];
    withRoll(0, () => engine._autoCast(h));
    expect(h.spellCooldowns.shard_burst).toBeGreaterThan(0);
    expect(crowd.every((enemy) => enemy.hp < 5000)).toBe(true);
  });
});

describe("spells on the road", () => {
  test("a trip's successful casts rank up the hero's spells, and it all survives a save", () => {
    let state = createGuild();
    state.heroes[0].progression.ownedNodeIds = ["A1"];
    state.heroes[0].magic = { elements: [], casts: { arcane_bolt: 14 } };
    state = startExpedition(state, "gutter", [state.heroes[0].identity.id], 1_000_000).state;
    withPendingFight(state, 1_001_000);
    const party = structuredClone(currentEncounterParty(state));
    state = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 0, items: [], spellCasts: { 0: { arcane_bolt: 2 } } }, 1_060_000).state;
    expect(state.heroes[0].magic.casts.arcane_bolt).toBe(16);
    expect(state.expedition.feed.some((line) => line.text.includes("Arcane Bolt reaches rank II"))).toBe(true);
    expect(parseGuild(JSON.parse(JSON.stringify(state))).heroes[0].magic).toEqual(state.heroes[0].magic);
  });
});

describe("battle screen feedback", () => {
  test("a tapped spell flashes its name over the caster; an auto cast or a fizzle does not", () => {
    const target = foe();
    const { engine, h } = engineWith(caster({ nodes: ["A1", "A3"] }), [target]);
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt", target));
    expect(engine.callouts).toEqual([]);
    h.spellCooldowns.arcane_bolt = 0;
    withRoll(0.99, () => engine.castHeroSpell(0, "arcane_bolt", target, { announce: true }));
    expect(engine.callouts).toEqual([]);
    h.spellCooldowns.arcane_bolt = 0;
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt", target, { announce: true }));
    expect(engine.callouts).toMatchObject([{ hero: h, text: "ARCANE BOLT" }]);
    expect(engine.hitStop).toBe(0);
    h.mana = h.maxMana;
    withRoll(0, () => engine.castHeroSpell(0, "arcane_channel", target, { announce: true }));
    expect(engine.callouts.map((callout) => callout.text)).toEqual(["ARCANE CHANNEL"]);
    expect(engine.hitStop).toBeGreaterThan(0);
  });

  test("spell status carries the cooldown the cast actually sets", () => {
    const target = foe();
    const { engine, h } = engineWith(caster(), [target]);
    const bolt = engine.getHeroSpellStatus(0).find((spell) => spell.id === "arcane_bolt");
    withRoll(0, () => engine.castHeroSpell(0, "arcane_bolt", target));
    expect(h.spellCooldowns.arcane_bolt).toBeCloseTo(bolt.cooldownTotal);
  });

  test("callouts age only in the live frame loop, so headless updates leave the fight unchanged", () => {
    const target = foe();
    const { engine, h } = engineWith(caster(), [target]);
    engine._callout(h, "TEST", "#fff", true);
    engine.update(0.5);
    expect(engine.callouts[0].age).toBe(0);
    engine._tickCallouts(2);
    expect(engine.callouts).toEqual([]);
  });
});

describe("spell effects in battle", () => {
  // A context that accepts every drawing call (a live battle's canvas).
  const liveCanvas = () => {
    const gradient = { addColorStop() {} };
    const ctx = new Proxy({}, {
      get: (target, prop) => (prop in target ? target[prop] : prop.toString().startsWith("create") ? () => gradient : prop === "measureText" ? () => ({ width: 10 }) : () => {}),
      set: (target, prop, value) => { target[prop] = value; return true; },
    });
    return { getContext: () => ctx };
  };
  const build = (canvas, hero, enemies) => {
    const engine = new Engine(canvas, createEncounterSim([hero], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
    engine.spawnQueue = [];
    engine.active = enemies;
    const h = engine.heroes[0];
    h.x = 300; h.y = 420;
    return { engine, h };
  };

  test("headless fights make no effects; live ones do, without changing the fight", () => {
    const hero = caster({ nodes: ["A1", "A2"], elements: ["fire"] });
    const headless = build({ getContext: () => null }, structuredClone(hero), [foe(), foe("goblin", 330, 220)]);
    const live = build(liveCanvas(), structuredClone(hero), [foe(), foe("goblin", 330, 220)]);
    expect(headless.engine.vfx).toBe(null);
    expect(live.engine.vfx).toBeTruthy();
    for (const { engine } of [headless, live]) withRoll(0, () => engine.castHeroSpell(0, "ember_bolt", engine.active[0]));
    expect(live.engine.active.map((enemy) => enemy.hp)).toEqual(headless.engine.active.map((enemy) => enemy.hp));
    expect(live.engine.active[0].dots).toEqual(headless.engine.active[0].dots);
    expect(live.engine.vfx.particles.length).toBeGreaterThan(0);
    expect(live.engine.vfx.auras.map((aura) => aura.element)).toEqual(["fire"]);
  });

  test("a fizzle shows the fizzle effect instead of a plain floater in a live battle", () => {
    const { engine } = build(liveCanvas(), caster(), [foe()]);
    withRoll(0.99, () => engine.castHeroSpell(0, "arcane_bolt", engine.active[0]));
    expect(engine.floaters.some((floater) => floater.text === "FIZZLE")).toBe(false);
    for (let i = 0; i < 20; i += 1) engine.vfx.update(1 / 60);
    expect(engine.vfx.particles.some((particle) => particle.kind === "fizzleText")).toBe(true);
  });
});

describe("Restoration and Warding", () => {
  const healer = (school = "restoration", casts = {}) => caster({ nodes: ["A1", "A2"], elements: [school], casts });
  const fighter = () => { const hero = caster({ nodes: [] }); hero.identity = { ...hero.identity, id: "fighter" }; return hero; };
  const party = (heroes, enemies = [foe()]) => {
    const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
    engine.spawnQueue = [];
    engine.active = enemies;
    engine.heroes.forEach((h, i) => { h.x = 280 + i * 40; h.y = 420; });
    return engine;
  };

  test("they are learned like elements, and their spells unlock at I, II and IV", () => {
    const learned = learnElement(caster({ nodes: ["A1", "A2"] }), "restoration");
    expect(learned.ok).toBe(true);
    expect(knownSpells(learned.hero).map((spell) => spell.id)).toContain("mend");
    expect(knownSpells(learned.hero).map((spell) => spell.id)).not.toContain("renewal");
    const seasoned = healer("restoration", { mend: RANK_CASTS[3] });
    expect(knownSpells(seasoned).map((spell) => spell.id)).toEqual(expect.arrayContaining(["mend", "renewal", "lifeline"]));
    expect(knownSpells(healer("warding")).map((spell) => spell.id)).toContain("barrier");
  });

  test("support power scales with spell rank, Intelligence and a staff", () => {
    expect(supportPower(healer(), "mend")).toBeCloseTo(0.18 * 1.1);
    expect(supportPower(healer(), "mend", { staff: true })).toBeCloseTo(0.18 * 1.1 * 1.2);
    expect(supportPower(healer("restoration", { mend: RANK_CASTS[1] }), "mend")).toBeCloseTo(0.18 * 1.1 * 1.1);
    expect(supportPower(caster({ nodes: ["A1", "A2"], elements: ["restoration"], intelligence: 20 }), "mend")).toBeCloseTo(0.18 * 1.1 * 1.12);
  });

  test("Mend heals the most-hurt ally, and can't be cast when nobody is hurt", () => {
    const engine = party([healer(), fighter()]);
    const [caster0, ally] = engine.heroes;
    expect(engine.getHeroSpellStatus(0).find((spell) => spell.id === "mend")).toMatchObject({ available: false, noTarget: true });
    ally.ref.hp = ally.d.maxHp * 0.4;
    caster0.ref.hp = caster0.d.maxHp * 0.9;
    expect(engine.getHeroSpellStatus(0).find((spell) => spell.id === "mend").available).toBe(true);
    withRoll(0, () => expect(engine.castHeroSpell(0, "mend")).toBe(true));
    expect(ally.ref.hp).toBeCloseTo(ally.d.maxHp * (0.4 + supportPower(caster0.model, "mend", { staff: true })));
    expect(engine.spellSuccesses).toEqual({ 0: { mend: 1 } });
  });

  test("Barrier shields up to the cap and runs out; Aegis cuts damage; Empower speeds and strengthens", () => {
    const engine = party([healer("warding", { barrier: RANK_CASTS[3] }), fighter()]);
    const [h, ally] = engine.heroes;
    ally.ref.hp = ally.d.maxHp * 0.5;
    h.ref.hp = h.d.maxHp;
    withRoll(0, () => engine.castHeroSpell(0, "barrier", ally));
    expect(ally.ref.shield).toBeGreaterThan(0);
    expect(ally.ref.shield).toBeLessThanOrEqual(ally.d.maxHp * 0.3);
    // A second Barrier skips the ally who has one and goes to the caster.
    const barrier = engine.getHeroSpellStatus(0).find((spell) => spell.id === "barrier");
    expect(engine._supportTarget(h, barrier, false)).toBe(h);
    engine.time += 11;
    engine._tickSupport(ally, 0.01);
    expect(ally.ref.shield).toBe(0);

    const raw = 100;
    const before = engine._classlessReducedDamage(ally, raw);
    h.spellCooldowns = {};
    h.mana = h.maxMana;
    withRoll(0, () => engine.castHeroSpell(0, "aegis"));
    expect(engine._classlessReducedDamage(ally, raw)).toBeLessThan(before);
    withRoll(0, () => engine.castHeroSpell(0, "empower"));
    expect(ally.empowerUntil).toBeGreaterThan(engine.time);
    expect(ally.empowerDamage).toBeGreaterThan(0.12);
  });

  test("Renewal heals over time; Lifeline catches a killing blow once", () => {
    const engine = party([healer("restoration", { mend: RANK_CASTS[3] }), fighter()]);
    const [h, ally] = engine.heroes;
    ally.ref.hp = ally.d.maxHp * 0.3;
    withRoll(0, () => engine.castHeroSpell(0, "renewal"));
    const hp = ally.ref.hp;
    engine._tickSupport(ally, 1);
    expect(ally.ref.hp).toBeGreaterThan(hp);

    withRoll(0, () => engine.castHeroSpell(0, "lifeline", ally));
    expect(ally.lifelineUntil).toBeGreaterThan(engine.time);
    ally.ref.hp = 5;
    engine._resolveClasslessHeroDamage(ally, 500);
    expect(ally.alive).toBe(true);
    expect(ally.ref.hp).toBeGreaterThan(1);
    ally.ref.hp = 5;
    engine._resolveClasslessHeroDamage(ally, 500);
    expect(ally.alive).toBe(false);
    void h;
  });

  test("on auto a healer waits until the help is needed", () => {
    const engine = party([healer(), fighter()]);
    const [h, ally] = engine.heroes;
    ally.ref.hp = ally.d.maxHp * 0.8;
    withRoll(0, () => engine._autoCast(h));
    expect(h.spellCooldowns.mend || 0).toBe(0);
    // (It cast a bolt at the foe instead; let its next cast come.)
    h.castCd = 0;
    ally.ref.hp = ally.d.maxHp * 0.4;
    withRoll(0, () => engine._autoCast(h));
    expect(h.spellCooldowns.mend).toBeGreaterThan(0);
    expect(ally.ref.hp).toBeGreaterThan(ally.d.maxHp * 0.4);
  });
});

describe("Shadow, Wild Magic and Dominate", () => {
  const mage = (school, casts = {}, extra = {}) => caster({ nodes: ["A1", "A2"], elements: [school], casts, ...extra });
  const ally = () => { const hero = caster({ nodes: [] }); hero.identity = { ...hero.identity, id: "ally" }; return hero; };
  const fight = (heroes, enemies) => {
    const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5, { waves: 1 }), {});
    engine.spawnQueue = [];
    engine.active = enemies;
    engine.heroes.forEach((h, i) => { h.x = 280 + i * 40; h.y = 420; });
    return engine;
  };
  const cast = (engine, id, target) => withRoll(0, () => engine.castHeroSpell(0, id, target));

  test("learned like elements; Dominate comes with Mind V", () => {
    expect(knownSpells(mage("shadow")).map((s) => s.id)).toContain("veil");
    expect(knownSpells(mage("wild", { ensnare: RANK_CASTS[3] })).map((s) => s.id)).toEqual(expect.arrayContaining(["ensnare", "thornfield", "summon_beast"]));
    expect(knownSpells(mage("mind", { thought_lance: RANK_CASTS[3] })).map((s) => s.id)).not.toContain("dominate");
    expect(knownSpells(mage("mind", { thought_lance: RANK_CASTS[4] })).map((s) => s.id)).toContain("dominate");
  });

  test("the spirit beast comes from the trait, a Spellbook choice, or Wild Magic V", () => {
    expect(heroBeast({ ...mage("wild"), traits: ["brawny"] })).toBe("tiger");
    expect(heroBeast({ ...mage("wild"), traits: ["reckless"] })).toBe("wasp");
    expect(heroBeast({ ...mage("wild"), traits: [] })).toBe("wolf");
    const picked = chooseBeast({ ...mage("wild"), traits: ["brawny"] }, "spider");
    expect(heroBeast(picked.hero)).toBe("spider");
    expect(heroBeast(chooseBeast(picked.hero, null).hero)).toBe("tiger");
    expect(chooseBeast(mage("wild"), "dragon").ok).toBe(false);
    expect(heroBeast(mage("wild", { ensnare: RANK_CASTS[4] }))).toBe("dragon");
  });

  test("Veil hides an ally and sharpens their next hit", () => {
    const engine = fight([mage("shadow"), ally()], [foe()]);
    const friend = engine.heroes[1];
    expect(cast(engine, "veil", friend)).toBe(true);
    expect(engine._isHeroUntargetable(friend)).toBe(true);
    expect(friend.classlessCombatState.vanishDamagePending).toBeGreaterThan(0.4);
  });

  test("Terror sends foes fleeing; a boss only flinches", () => {
    const grunt = foe("goblin", 300, 380, { damage: 5 });
    const boss = foe("demon", 320, 390, { boss: true });
    const engine = fight([mage("shadow", { veil: RANK_CASTS[1] })], [grunt, boss]);
    expect(cast(engine, "terror", grunt)).toBe(true);
    expect(grunt.fearUntil).toBeCloseTo(engine.time + 2.5);
    expect(boss.fearUntil).toBeUndefined();
    expect(boss.stunUntil).toBeCloseTo(engine.time + 0.5);
    const h = engine.heroes[0];
    const before = Math.hypot(grunt.x - h.x, grunt.y - h.y);
    grunt.speed = 40;
    engine._updateEnemy(grunt, 0.5);
    expect(Math.hypot(grunt.x - h.x, grunt.y - h.y)).toBeGreaterThan(before);
  });

  test("Confusion turns a foe on its own side; bosses resist; elites for half as long", () => {
    const victim = foe("goblin", 330, 300);
    const turned = foe("orc", 335, 300, { damage: 20, atkCd: 0 });
    const elite = foe("lieutenant", 360, 300);
    const boss = foe("demon", 380, 300, { boss: true });
    const engine = fight([mage("shadow", { veil: RANK_CASTS[3] })], [victim, turned, elite, boss]);
    cast(engine, "confusion", turned);
    expect(turned.confusedUntil).toBeCloseTo(engine.time + 4);
    engine._updateEnemy(turned, 0.05);
    expect(victim.hp).toBeLessThan(5000);
    expect(victim.dmgBy.H0).toBeGreaterThan(0);
    engine.heroes[0].spellCooldowns = {};
    cast(engine, "confusion", boss);
    expect(boss.confusedUntil).toBeUndefined();
    engine.heroes[0].spellCooldowns = {};
    engine.heroes[0].mana = engine.heroes[0].maxMana;
    cast(engine, "confusion", elite);
    expect(elite.confusedUntil).toBeCloseTo(engine.time + 2);
  });

  test("Ensnare and Thornfield root (less on bosses); Thornfield also bleeds", () => {
    const a = foe("goblin", 320, 300);
    const b = foe("goblin", 340, 310);
    const boss = foe("demon", 600, 300, { boss: true });
    const engine = fight([mage("wild", { ensnare: RANK_CASTS[1] })], [a, b, boss]);
    cast(engine, "ensnare", boss);
    expect(boss.rootUntil).toBeCloseTo(engine.time + 0.5);
    engine.heroes[0].mana = engine.heroes[0].maxMana;
    cast(engine, "thornfield", a);
    expect(a.rootUntil).toBeGreaterThan(engine.time);
    expect(b.rootUntil).toBeGreaterThan(engine.time);
    expect(a.dots.some((dot) => dot.color === "#DC2626")).toBe(true);
  });

  test("Dominate takes an ordinary foe for the party, never an elite, boss or legend", () => {
    const grunt = foe("orc", 320, 300, { damage: 30, atkCd: 0 });
    const other = foe("goblin", 330, 300);
    const elite = foe("lieutenant", 340, 300);
    const legend = foe("orc", 345, 300, { legendary: true });
    const engine = fight([mage("mind", { thought_lance: RANK_CASTS[4] }, { intelligence: 40 })], [grunt, other, elite, legend]);
    const h = engine.heroes[0];
    cast(engine, "dominate", elite);
    expect(elite.dominatedUntil).toBeUndefined();
    h.spellCooldowns = {}; h.mana = h.maxMana;
    cast(engine, "dominate", legend);
    expect(legend.dominatedUntil).toBeUndefined();
    h.spellCooldowns = {}; h.mana = h.maxMana;
    cast(engine, "dominate", grunt);
    expect(grunt.dominatedUntil).toBeCloseTo(engine.time + 6);
    expect(engine._isValidClasslessTarget(h, grunt)).toBe(false);
    engine._updateEnemy(grunt, 0.05);
    expect(other.hp).toBeLessThan(5000);
  });

  test("a spirit beast fights for its caster and leaves after 10 s; a rat swarm is three", () => {
    const tigerMage = { ...mage("wild", { ensnare: RANK_CASTS[3] }), traits: ["brawny"] };
    const prey = foe("goblin", 330, 380);
    const engine = fight([tigerMage], [prey]);
    expect(cast(engine, "summon_beast")).toBe(true);
    const beast = engine.pets.find((pet) => pet.summoned);
    expect(beast.stats.species).toBe("tiger");
    expect(beast.maxHp).toBe(Math.round(engine.heroes[0].d.maxHp * 0.3));
    // A second summon waits until this one is gone.
    expect(engine.getHeroSpellStatus(0).find((spell) => spell.id === "summon_beast").available).toBe(false);
    for (let i = 0; i < 40; i += 1) engine._updatePets(0.1);
    expect(prey.hp).toBeLessThan(5000);
    engine.time += 10;
    engine._updatePets(0.1);
    expect(engine.pets.some((pet) => pet.summoned)).toBe(false);

    const ratMage = { ...mage("wild", { ensnare: RANK_CASTS[3] }), traits: ["scavenger"] };
    const swarm = fight([ratMage], [foe()]);
    cast(swarm, "summon_beast");
    expect(swarm.pets.filter((pet) => pet.summoned)).toHaveLength(3);
  });

  test("a downed spirit beast doesn't take the partner's familiar bonus with it", () => {
    const hero = { ...mage("wild", { ensnare: RANK_CASTS[3] }), traits: [] };
    hero.pet = { species: "tortoise", name: "Shelly", level: 1, xp: 0, quality: "loyal", mods: {} };
    const engine = fight([hero], [foe()]);
    const guard = engine.heroes[0].petGuard;
    cast(engine, "summon_beast");
    const beast = engine.pets.find((pet) => pet.summoned);
    beast.hp = 1;
    engine._enemyHitPet(foe("orc", 0, 0, { damage: 50 }), beast);
    expect(beast.down).toBe(true);
    expect(engine.heroes[0].petGuard).toBe(guard);
  });

  test("on auto, Dominate keeps a mana reserve", () => {
    const grunt = foe("orc", 320, 300, { damage: 30 });
    const engine = fight([mage("mind", { thought_lance: RANK_CASTS[4] })], [grunt]);
    const h = engine.heroes[0];
    h.mana = 45;
    withRoll(0, () => engine._autoCast(h));
    expect(grunt.dominatedUntil).toBeUndefined();
    h.mana = h.maxMana; h.castCd = 0; h.spellCooldowns = {};
    withRoll(0, () => engine._autoCast(h));
    expect(grunt.dominatedUntil).toBeGreaterThan(engine.time);
  });
});
