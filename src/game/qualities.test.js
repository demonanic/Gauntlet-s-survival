import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { Engine } from "../combat/engine";
import { INNATE_KEYS, TRAITS, heroQuality, heroTraitEffects, partyRoadEffects, rollTrait } from "../combat/traits";
import { ADVENTURE, STORIES, sneakChance } from "./adventure";
import { buildLegendaryEncounter, buildStalkerEncounter, buildWildEncounter, createEncounterSim } from "./encounters";
import { choosePending, createGuild, currentEncounterParty, resolveEncounter, startExpedition, tick } from "./guild";
import { createGearItem } from "./items";
import {
  MIN_FIGHTS_FOR_QUALITY, QUALITY_MILESTONES, developQualities, emptyHistory, normalizeQualityFields, qualityCandidates,
  recordFight,
} from "./qualities";
import { getRegion } from "./regions";
import { parseGuild } from "./storage";
import { withPendingFight } from "../test/expeditionFixtures";

const T0 = 1_000_000;
const STEP = 1 / 30;
const fixed = (value) => () => value;

function plainGuild() {
  const state = createGuild();
  for (const hero of state.heroes) {
    hero.traits = [];
    hero.combat.hp = classlessMaxHp(hero);
  }
  return state;
}

function veteran(history, level = 10) {
  const hero = normalizeQualityFields(structuredClone(plainGuild().heroes[0]));
  hero.progression.level = level;
  hero.history = { ...emptyHistory(), fights: 60, wins: 55, ...history };
  return hero;
}

const ARCHER = { rangedHits: 900, meleeHits: 60, crits: 200, kills: 220 };

describe("innate qualities", () => {
  test("recruits are born with innate qualities only", () => {
    for (let index = 0; index < 200; index += 1) expect(INNATE_KEYS).toContain(rollTrait());
    expect(INNATE_KEYS).not.toContain("marksman");
  });

  test("road qualities combine across the party, with caps and the heroes who bring them", () => {
    const party = plainGuild().heroes;
    party[0].traits = ["tracker"];
    party[1].traits = ["paranoid"];
    party[2].traits = ["keenEared"];
    const road = partyRoadEffects(party);
    expect(road.stalkerDetect).toBeCloseTo(0.18 + 0.12 + 0.05);
    expect(road.ambush).toBeCloseTo(-0.12);
    expect(road.who.stalkerDetect.map((hero) => hero.identity.id)).toHaveLength(3);
    party[1].traits = ["tracker"];
    party[2].traits = ["tracker"];
    expect(partyRoadEffects(party).stalkerDetect).toBe(0.5);
  });

  test("mixed qualities cut both ways", () => {
    const [quiet, loud] = plainGuild().heroes;
    loud.traits = ["loud"];
    const wave = buildWildEncounter(getRegion("gutter"), 0, fixed(0.5));
    expect(sneakChance([loud], wave, 50, getRegion("gutter"))).toBeLessThan(sneakChance([quiet], wave, 50, getRegion("gutter")));
    quiet.traits = ["frail"];
    expect(heroTraitEffects(quiet)).toMatchObject({ maxHp: -0.15, xpBonus: 0.3 });
  });
});

describe("hero history", () => {
  test("fights are recorded: hits, kills, narrow escapes, ambushes, low morale", () => {
    const hero = veteran({}, 3);
    hero.history = emptyHistory();
    hero.combat.hp = Math.round(classlessMaxHp(hero) * 0.1);
    recordFight(hero, { rangedHits: 12, crits: 3, kills: 2, damage: 400.6, taken: 90 }, { victory: true, morale: 20, ambush: true });
    expect(hero.history).toMatchObject({
      fights: 1, wins: 1, rangedHits: 12, crits: 3, kills: 2, damage: 401, taken: 90, nearDeaths: 1, ambushes: 1, lowMoraleWins: 1,
    });
    hero.combat.hp = 0;
    recordFight(hero, {}, { victory: false, morale: 60, ambush: false });
    expect(hero.history).toMatchObject({ fights: 2, wins: 1, knockouts: 1 });
  });

  test("the engine tallies each hero's hits, crits, kills and damage", () => {
    const hero = structuredClone(plainGuild().heroes[0]);
    const engine = new Engine({ getContext: () => null }, createEncounterSim([hero], 1), buildWildEncounter(getRegion("gutter"), 0, fixed(0.5)), {});
    engine.spawnQueue = [];
    const h = engine.heroes[0];
    engine.active = [{ id: 1, type: "goblin", name: "Goblin", tier: "basic", hp: 60, maxHp: 60, speed: 0, damage: 0, x: h.x, y: h.y - 30, dmgBy: {}, atkCd: 99, affinities: {} }];
    for (let t = 0; t < 10 && engine.active.length; t += STEP) engine.update(STEP);
    expect(h.model.battleStats.meleeHits).toBeGreaterThan(0);
    expect(h.model.battleStats.kills).toBe(1);
    expect(h.model.battleStats.damage).toBeGreaterThanOrEqual(60);
  });

  test("fight results fold into the saved hero's history", () => {
    let state = plainGuild();
    state = startExpedition(state, "gutter", [state.heroes[0].identity.id], T0).state;
    state = withPendingFight(state, T0 + 1000, "ambush");
    const party = currentEncounterParty(state);
    party[0].battleStats = { meleeHits: 9, kills: 3, taken: classlessMaxHp(party[0]) };
    const done = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 0, items: [] }, T0 + 2000).state;
    expect(done.heroes[0].history).toMatchObject({ fights: 1, wins: 1, meleeHits: 9, kills: 3, ambushes: 1 });
    expect(done.heroes[0].battleStats).toBeUndefined();
  });

  test("old saves load with empty histories", () => {
    const save = structuredClone(createGuild());
    for (const hero of save.heroes) {
      delete hero.history;
      delete hero.qualityTiers;
      delete hero.milestones;
    }
    const loaded = parseGuild(JSON.parse(JSON.stringify(save)));
    expect(loaded.heroes[0].history).toEqual(emptyHistory());
    expect(loaded.heroes[0]).toMatchObject({ qualityTiers: {}, milestones: [], qualityLog: [] });
  });
});

describe("quality development", () => {
  test("a hero who fought from range becomes a Marksman at the milestone", () => {
    const hero = veteran(ARCHER);
    const [development] = developQualities(hero, T0, fixed(0.5));
    expect(development).toMatchObject({ key: "marksman", upgrade: false });
    expect(hero.traits).toContain("marksman");
    expect(hero.qualityTiers.marksman).toBeGreaterThanOrEqual(2);
    expect(hero.milestones).toEqual([QUALITY_MILESTONES[0]]);
    // The story explains why, without counters or thresholds.
    expect(development.text).toMatch(/Marksman/);
    expect(development.text).not.toMatch(/\d/);
    expect(developQualities(hero, T0, fixed(0.5))).toEqual([]);
  });

  test("the tier follows how strongly the hero showed the behavior", () => {
    const light = veteran({ rangedHits: 160, meleeHits: 60, crits: 10, kills: 30 });
    const heavy = veteran({ rangedHits: 2000, meleeHits: 40, crits: 600, kills: 400 });
    developQualities(light, T0, fixed(0.5));
    developQualities(heavy, T0, fixed(0.5));
    expect(light.qualityTiers.marksman || 0).toBeLessThan(heavy.qualityTiers.marksman);
    expect(heroQuality(heavy, "marksman").name).toBe("Master Marksman");
  });

  test("a milestone waits for enough fights on record", () => {
    const rookie = veteran({ ...ARCHER, fights: MIN_FIGHTS_FOR_QUALITY - 1 });
    expect(developQualities(rookie, T0, fixed(0.5))).toEqual([]);
    expect(rookie.milestones).toEqual([]);
    rookie.history.fights = MIN_FIGHTS_FOR_QUALITY;
    expect(developQualities(rookie, T0, fixed(0.5))).toHaveLength(1);
  });

  test("a later milestone can deepen a quality the hero already has", () => {
    const hero = veteran({ rangedHits: 400, meleeHits: 40, crits: 60, kills: 80 });
    developQualities(hero, T0, fixed(0.5));
    const before = hero.qualityTiers.marksman;
    hero.progression.level = QUALITY_MILESTONES[1];
    hero.history = { ...hero.history, rangedHits: 3000, crits: 900, kills: 500 };
    const [development] = developQualities(hero, T0, fixed(0.5));
    expect(development).toMatchObject({ key: "marksman", upgrade: true });
    expect(hero.qualityTiers.marksman).toBeGreaterThan(before);
    expect(hero.traits.filter((key) => key === "marksman")).toHaveLength(1);
  });

  test("a quality another hero already has is less likely, so roles spread out", () => {
    const both = { ...ARCHER, sneaks: 40 };
    const picks = (shared) => {
      const counts = { marksman: 0, ghostStep: 0 };
      let seed = 1;
      const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let index = 0; index < 300; index += 1) {
        const [development] = developQualities(veteran(both), T0, rng, shared);
        counts[development.key] += 1;
      }
      return counts;
    };
    expect(picks(new Set(["marksman"])).marksman).toBeLessThan(picks(new Set()).marksman);
  });

  test("histories point at different qualities; a quiet career still leaves a mark", () => {
    const keys = (history) => qualityCandidates(veteran(history), fixed(0.5)).map((entry) => entry.key);
    expect(keys({ nearDeaths: 12 })).toContain("survivor");
    expect(keys({ sneaks: 20 })).toContain("ghostStep");
    expect(keys({ ambushes: 15 })).toContain("unshakable");
    expect(keys({ heals: 25 })).toContain("fieldSurgeon");
    expect(keys({ heals: 5 })).not.toContain("fieldSurgeon");
    expect(keys({ bossKills: 4 })).toContain("giantslayer");
    const quiet = veteran({});
    const [development] = developQualities(quiet, T0, fixed(0.5));
    expect(INNATE_KEYS).toContain(development.key);
    expect(TRAITS[development.key].kind).not.toBe("evolved");
  });

  test("Master Marksman crits finish off wounded common foes, never elites or bosses", () => {
    const archer = veteran(ARCHER);
    archer.traits = ["marksman"];
    archer.qualityTiers = { marksman: 3 };
    archer.equipment.weapon = createGearItem({ slot: "weapon", variant: "bow", rarity: "common", tier: 1 });
    archer.quickSlots = [{ key: "arrows", qty: 50 }, null];
    const engine = new Engine({ getContext: () => null }, createEncounterSim([archer], 1), buildWildEncounter(getRegion("gutter"), 0, fixed(0.5)), {});
    const hero = engine.heroes[0];
    const target = (tier, extra = {}) => ({ id: tier, type: "goblin", name: "Goblin", tier, hp: 15, maxHp: 100, speed: 0, damage: 0, x: hero.x, y: hero.y - 200, dmgBy: {}, atkCd: 99, affinities: {}, ...extra });
    const hit = (enemy) => engine._applyClasslessHit({ target: enemy, heroIndex: 0, sourceId: "H0", dmg: 1, damageCategory: "weapon", classless: true, guaranteedCrit: true });
    const common = target("basic");
    const elite = target("elite");
    const boss = target("boss", { boss: true });
    engine.active = [common, elite, boss];
    hit(common);
    hit(elite);
    hit(boss);
    expect(common.hp).toBe(0);
    expect(elite.hp).toBeGreaterThan(0);
    expect(boss.hp).toBeGreaterThan(0);
  });
});

describe("qualities on the road", () => {
  test("Keen-Eared heroes blunt an ambush's opening volley", () => {
    const run = (traits) => {
      let state = plainGuild();
      state.heroes[0].traits = traits;
      state = startExpedition(state, "gutter", [state.heroes[0].identity.id], T0).state;
      // A sighting (rng 0.8), then a failed sneak: the squad attacks with a volley.
      const sighted = tick(state, state.expedition.nextEventAt, { interactive: true, rng: fixed(0.8) });
      const before = sighted.heroes[0].combat.hp;
      const next = choosePending(sighted, "sneak", sighted.expedition.pending.at, { rng: fixed(0.99) }).state;
      return { lost: before - next.heroes[0].combat.hp, pending: next.expedition.pending };
    };
    const plain = run([]);
    const eared = run(["keenEared"]);
    expect(plain.pending?.kind).toBe("ambush");
    expect(eared.lost).toBeLessThan(plain.lost);
  });

  test("Greedy heroes open every chest and loot every shrine", () => {
    expect(STORIES.chest.auto({ partyHp: 0.2, greedy: true })).toBe("open");
    expect(STORIES.chest.auto({ partyHp: 0.2 })).toBe("leave");
    expect(STORIES.shrine.auto({ greedy: true })).toBe("loot");
  });

  test("morale settles higher with a Charismatic hero", () => {
    const settle = (traits) => {
      let state = plainGuild();
      state.heroes[0].traits = traits;
      state = startExpedition(state, "gutter", [state.heroes[0].identity.id], T0).state;
      state.expedition.morale = 0;
      // rng 0.05: a flavor event (no morale of its own beyond the drift).
      return tick(state, state.expedition.nextEventAt, { interactive: true, rng: fixed(0.05) }).expedition.morale;
    };
    expect(settle(["charismatic"])).toBeGreaterThan(settle([]));
  });
});

describe("stalkers", () => {
  function stalked(traits, rng) {
    let state = plainGuild();
    state.heroes[0].progression.level = 3;
    state.heroes[0].traits = traits;
    state = startExpedition(state, "boneyard", [state.heroes[0].identity.id], T0).state;
    state.expedition.stalker = { wave: buildStalkerEncounter(getRegion("boneyard"), 0.3, fixed(0.5)), since: T0, events: 0, detected: false, braced: false };
    return tick(state, state.expedition.nextEventAt, { interactive: true, rng });
  }

  test("a Tracker notices what an ordinary party misses", () => {
    expect(stalked([], fixed(0.1)).expedition.pending).toBeNull();
    const tracked = stalked(["tracker"], fixed(0.1));
    expect(tracked.expedition.pending).toMatchObject({ kind: "story", story: "stalker" });
    expect(tracked.expedition.feed.at(-1).text).toMatch(/stops abruptly\. Something has been following the party/);
  });

  test("an unnoticed stalker waits for a wounded hero, then pounces on them", () => {
    let state = plainGuild();
    state.heroes[0].progression.level = 3;
    const ids = state.heroes.map((hero) => hero.identity.id);
    state = startExpedition(state, "boneyard", ids, T0).state;
    state.expedition.stalker = { wave: buildStalkerEncounter(getRegion("boneyard"), 0.3, fixed(0.5)), since: T0, events: 0, detected: false, braced: false };
    state.heroes[2].combat.hp = Math.round(classlessMaxHp(state.heroes[2]) * 0.3);
    const before = state.heroes[2].combat.hp;
    const next = tick(state, state.expedition.nextEventAt, { interactive: true, rng: fixed(0.9) });
    expect(next.expedition.pending).toMatchObject({ kind: "ambush" });
    expect(next.expedition.pending.wave.enemies[0].type).toBe("stalker");
    expect(next.expedition.stalker).toBeNull();
    expect(before - next.heroes[2].combat.hp).toBeGreaterThan(Math.round(classlessMaxHp(next.heroes[2]) * ADVENTURE.ambushVolley));
  });

  test("a detected stalker can be fought, braced for, or shaken off", () => {
    const tracked = stalked(["tracker"], fixed(0.1));
    const at = tracked.expedition.pending.at;
    expect(choosePending(tracked, "confront", at).state.expedition.pending).toMatchObject({ kind: "ambush" });
    const braced = choosePending(tracked, "brace", at).state;
    expect(braced.expedition.pending).toBeNull();
    expect(braced.expedition.stalker.braced).toBe(true);
    const shaken = choosePending(tracked, "shake", at, { rng: fixed(0.01) }).state;
    expect(shaken.expedition.stalker).toBeNull();
    expect(shaken.expedition.pending).toBeNull();
    expect(shaken.heroes[0].history.sneaks).toBe(1);
  });
});

describe("enemy behavior families", () => {
  function arena(heroes) {
    const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, fixed(0.5)), {});
    engine.spawnQueue = [];
    engine.active = [];
    return engine;
  }
  const make = (type, x, y, extra = {}) => {
    const base = C.ENEMIES[type];
    return { id: `${type}${x}`, type, name: base.name, tier: base.tier, hp: base.hp, maxHp: base.hp, speed: base.speed, damage: base.damage,
      color: base.color, x, y, dmgBy: {}, atkCd: 0, affinities: {}, families: [...(C.ENEMY_FAMILIES[type] || [])], ...extra };
  };
  const think = (engine, unit, seconds = STEP) => {
    for (let t = 0; t < seconds; t += STEP) { engine.time += STEP; unit.atkCd -= STEP; engine._updateEnemy(unit, STEP); }
  };

  test("harriers chase the most wounded hero and maul the wounded harder", () => {
    const engine = arena(plainGuild().heroes.slice(0, 2));
    const [healthy, hurt] = engine.heroes;
    hurt.ref.hp = Math.round(hurt.d.maxHp * 0.3);
    const harrier = make("harrier", (healthy.x + hurt.x) / 2, healthy.y - 120);
    engine.active = [harrier];
    think(engine, harrier, 0.5);
    expect(Math.hypot(harrier.x - hurt.x, harrier.y - hurt.y)).toBeLessThan(Math.hypot(harrier.x - healthy.x, harrier.y - healthy.y));
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const hpBefore = [healthy.ref.hp, hurt.ref.hp];
    engine._enemyAttack(harrier, { kind: "hero", obj: healthy });
    engine._enemyAttack(harrier, { kind: "hero", obj: hurt });
    random.mockRestore();
    expect(hpBefore[1] - hurt.ref.hp).toBeGreaterThan(hpBefore[0] - healthy.ref.hp);
  });

  test("a carrion priest sacrifices a dying ally to heal and empower the rest", () => {
    const engine = arena([plainGuild().heroes[0]]);
    const hero = engine.heroes[0];
    const priest = make("carrionPriest", hero.x, hero.y - 220, { feedCd: 0 });
    const dying = make("skeleton", hero.x + 30, hero.y - 220, { hp: 10, maxHp: 70 });
    const hurt = make("orc", hero.x - 30, hero.y - 220, { hp: 40, maxHp: 120 });
    engine.active = [priest, dying, hurt];
    think(engine, priest);
    expect(dying.hp).toBe(0);
    expect(hurt.hp).toBeGreaterThan(40);
    expect(hurt.empoweredUntil).toBeGreaterThan(engine.time);
  });

  test("watchers make sneaking harder and leave heroes exposed", () => {
    const party = plainGuild().heroes;
    const region = getRegion("frostfang");
    const plain = { enemies: [make("orc", 0, 0)] };
    const watched = { enemies: [make("orc", 0, 0), make("watcher", 0, 0)] };
    const bigger = { enemies: [make("orc", 0, 0), make("orc", 0, 0)] };
    expect(sneakChance(party, watched, 50, region)).toBeLessThan(sneakChance(party, bigger, 50, region));
    expect(sneakChance(party, plain, 50, region)).toBeGreaterThan(sneakChance(party, watched, 50, region));
    const engine = arena([party[0]]);
    const watcher = make("watcher", engine.heroes[0].x, engine.heroes[0].y - 220);
    engine.active = [watcher];
    think(engine, watcher);
    expect(engine.heroes[0].exposedUntil).toBeGreaterThan(engine.time);
  });

  test("legendary monsters combine archetypes: they hunt the wounded", () => {
    const wave = buildLegendaryEncounter(getRegion("ashen"), 0.5, fixed(0.5));
    expect(wave.enemies[0].families).toEqual(expect.arrayContaining(["hunter", "predator"]));
  });
});
