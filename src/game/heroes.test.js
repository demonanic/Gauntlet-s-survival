import { withoutArmor, withPendingFight } from "../test/expeditionFixtures";
import { Engine } from "../combat/engine";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { distinctHueShift, heroSpriteFilter, isHexColor, paletteForShift, rollHeroPalette } from "../combat/heroPalette";
import { TRAITS, TRAIT_KEYS, heroQuality, heroTraitEffects } from "../combat/traits";
import { needsSaveChoice, summarizeSave } from "../cloud/cloudSave";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import {
  CANDIDATE_REROLL_COST, cleanHeroName, createGuild, recruitCost, recruitHero, renameHero, rerollCandidate,
  resolveEncounter, startExpedition, tick,
} from "./guild";
import { buyLegacyUpgrade, legacyBonuses, retireHero, syncGuildBonuses } from "./legacy";
import { getRegion } from "./regions";
import { parseGuild } from "./storage";

const T0 = 1_000_000;
const rich = (state, gold = 100_000) => ({ ...state, gold });
const heroId = (state, index = 0) => state.heroes[index].identity.id;
const withRenown = (state, renown) => ({ ...state, legacy: { ...state.legacy, renown } });

function levelUp(hero, level = 20) {
  hero.progression.level = level;
  hero.progression.xp = C.HERO_XP[level - 1];
  return hero;
}

describe("individual neon looks", () => {
  test("palettes are valid neon hex colors derived from the hue shift", () => {
    const palette = paletteForShift(120);
    expect(palette.hueShift).toBe(120);
    expect(isHexColor(palette.identityColor)).toBe(true);
    expect(isHexColor(palette.accentColor)).toBe(true);
    expect(paletteForShift(480)).toEqual(palette);
    expect(rollHeroPalette(() => 0.5).hueShift).toBe(180);
    expect(heroSpriteFilter(palette)).toBe("hue-rotate(120deg) saturate(1.25)");
    expect(heroSpriteFilter({})).toBe("none");
  });

  test("UI colors are the sprite's own colors after the same filter, readable on dark backgrounds", () => {
    // No shift: still the sprite's magenta body (strong red and blue, little green).
    const [r0, g0, b0] = [1, 3, 5].map((i) => parseInt(paletteForShift(0).identityColor.slice(i, i + 2), 16));
    expect(r0).toBeGreaterThan(200);
    expect(b0).toBeGreaterThan(180);
    expect(g0).toBeLessThan(60);
    for (const shift of [0, 90, 180, 240, 300]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(paletteForShift(shift).identityColor.slice(i, i + 2), 16));
      expect((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toBeGreaterThanOrEqual(0.31);
    }
  });

  test("new hues keep away from the roster's, and starters are spread out", () => {
    const sequence = [0.01, 0.02, 0.5, 0.03];
    let index = 0;
    expect(distinctHueShift([0, 10], () => sequence[index++ % sequence.length])).toBe(180);
    const shifts = createGuild().heroes.map((hero) => hero.appearance.hueShift).sort((a, b) => a - b);
    expect(shifts[1] - shifts[0]).toBe(120);
    expect(shifts[2] - shifts[1]).toBe(120);
  });

  test("every new hero gets their own look and a trait", () => {
    const state = createGuild();
    for (const hero of state.heroes) {
      expect(Number.isFinite(hero.appearance.hueShift)).toBe(true);
      expect(hero.appearance.identityColor).toBe(paletteForShift(hero.appearance.hueShift).identityColor);
      expect(TRAIT_KEYS).toContain(hero.traits[0]);
      expect(hero.combat.hp).toBe(classlessMaxHp(hero));
    }
  });
});

describe("recruiting", () => {
  test("hires the candidate with the player's name and look", () => {
    const state = rich(createGuild());
    const { trait } = state.candidate;
    const hired = recruitHero(state, { name: "  Nyx   Vale  ", hueShift: 42 }).state;
    const recruit = hired.heroes.at(-1);
    expect(recruit.identity.name).toBe("Nyx Vale");
    expect(recruit.appearance.hueShift).toBe(42);
    expect(recruit.traits).toEqual([trait]);
    expect(hired.candidate).not.toBe(state.candidate);
  });

  test("blank names fall back to the suggestion; names are cleaned", () => {
    const state = rich(createGuild());
    expect(recruitHero(state, { name: "   " }).state.heroes.at(-1).identity.name).toBe(state.candidate.suggestedName);
    expect(cleanHeroName("<b>Ashe</b>")).toBe("bAshe/b");
    expect(cleanHeroName("A very long hero name indeed")).toHaveLength(16);
    expect(cleanHeroName(" ")).toBeNull();
  });

  test("seeing another candidate costs gold", () => {
    const state = createGuild();
    const rerolled = rerollCandidate(state).state;
    expect(rerolled.gold).toBe(state.gold - CANDIDATE_REROLL_COST);
    expect(rerollCandidate({ ...state, gold: 0 })).toEqual({ ok: false, reason: "insufficient_gold" });
  });

  test("renaming a hero", () => {
    const state = createGuild();
    expect(renameHero(state, heroId(state), "Brannigan").state.heroes[0].identity.name).toBe("Brannigan");
    expect(renameHero(state, heroId(state), "  ")).toEqual({ ok: false, reason: "invalid_name" });
  });

  test("recruit cost follows the roster size; the first recruit for a short roster is free", () => {
    const state = rich(createGuild());
    expect(recruitCost(state)).toBe(0);
    expect(recruitCost(recruitHero(state).state)).toBe(128);
    expect(recruitCost({ ...state, freeRecruitUsed: true })).toBe(80);
  });
});

describe("traits", () => {
  const heroWith = (trait) => {
    const hero = structuredClone(createGuild().heroes[0]);
    hero.traits = [trait];
    delete hero.equipment.weapon; // unarmed and unarmored, so only the trait changes the numbers
    return withoutArmor(hero);
  };

  test("stat traits change the hero's combat numbers", () => {
    expect(classlessMaxHp(heroWith("brawny"))).toBe(Math.round(300 * 1.12));
    expect(classlessMaxHp(heroWith("glassCannon"))).toBe(270);
    const engine = new Engine({ getContext: () => null }, createEncounterSim([heroWith("ironhide"), heroWith("quickHands")], 1), buildWildEncounter(getRegion("gutter"), 0, () => 0.5), {});
    expect(engine.heroes[0].d.defense).toBe(18);
    expect(engine.heroes[1].d.rate).toBeCloseTo(1.05 / 1.08);
  });

  test("every trait has a name, description and known effects", () => {
    for (const key of TRAIT_KEYS) {
      const quality = heroQuality(heroWith(key), key);
      expect(quality.name && quality.desc).toBeTruthy();
      // Every quality does something: in combat, on the road, or both.
      expect(Object.keys(quality.effects || {}).length + Object.keys(quality.road || {}).length).toBeGreaterThan(0);
      for (const stat of Object.keys(quality.effects || {})) expect(Object.keys(heroTraitEffects(heroWith(key)))).toContain(stat);
    }
  });

  test("Fast Learner earns more XP", () => {
    let state = createGuild();
    state.heroes[0].traits = ["fastLearner"];
    state.heroes[1].traits = [];
    for (const hero of state.heroes) hero.combat.hp = classlessMaxHp(hero);
    state = startExpedition(state, "gutter", [heroId(state), heroId(state, 1)], T0).state;
    withPendingFight(state, T0 + 20_000);
    const party = structuredClone(state.heroes.slice(0, 2));
    const resolved = resolveEncounter(state, { victory: true, party, xpGains: { 0: 100, 1: 100 }, gold: 0, items: [] }, T0 + 21_000).state;
    expect(resolved.heroes[0].progression.xp).toBe(125);
    expect(resolved.heroes[1].progression.xp).toBe(100);
  });
});

describe("prestige", () => {
  test("retiring a level 20 hero earns renown and returns their gear", () => {
    const state = createGuild();
    levelUp(state.heroes[0]);
    state.heroes[0].quickSlots = [{ key: "potion", qty: 2 }, null];
    const retired = retireHero(state, heroId(state), T0);
    expect(retired.ok).toBe(true);
    expect(retired.state.heroes).toHaveLength(2);
    expect(retired.state.legacy.renown).toBe(3);
    expect(retired.state.legacy.legends[0]).toMatchObject({ name: state.heroes[0].identity.name, level: 20 });
    expect(retired.state.vault.map((item) => item.slot).sort()).toEqual(["arms", "chest", "head", "legs", "weapon"]);
    expect(retired.state.stash.potion).toBe(2);
    expect(retireHero(state, heroId(state, 1), T0)).toEqual({ ok: false, reason: "level_required" });
    expect(retireHero({ ...state, bossRank: 10 }, heroId(state), T0).state.legacy.renown).toBe(5);
  });

  test("upgrades cost increasing renown and stamp combat bonuses on heroes", () => {
    let state = withRenown(createGuild(), 10);
    state = buyLegacyUpgrade(state, "might").state;
    state = buyLegacyUpgrade(state, "might").state;
    expect(state.legacy.renown).toBe(10 - 1 - 2);
    expect(legacyBonuses(state).damage).toBeCloseTo(0.08);
    expect(state.heroes[0].guildBonus.damage).toBeCloseTo(0.08);
    expect(buyLegacyUpgrade(withRenown(state, 0), "vigor")).toEqual({ ok: false, reason: "insufficient_renown" });
    const vigor = buyLegacyUpgrade(withRenown(state, 1), "vigor").state;
    vigor.heroes[0].traits = [];
    expect(classlessMaxHp(withoutArmor(vigor.heroes[0]))).toBe(312);
  });

  test("Mentorship starts recruits at a higher level; Swift Roads and Fortune apply on expeditions", () => {
    let state = withRenown(rich(createGuild()), 100);
    for (const key of ["mentorship", "roads", "fortune"]) state = buyLegacyUpgrade(state, key).state;
    const recruit = recruitHero(state).state.heroes.at(-1);
    expect(recruit.progression).toMatchObject({ level: 3, ap: 2, sp: 2 });
    expect(recruit.guildBonus).toBeDefined();

    const run = startExpedition(state, "gutter", [heroId(state)], T0).state;
    expect(run.expedition.endsAt - T0).toBe(10 * 60_000 * 0.92);
    // At the end of the timer: 100 found + 80 Gutter bounty, then Fortune adds 10%.
    run.expedition.loot.gold = 100;
    run.expedition.endsAt = T0 + 5;
    run.expedition.nextEventAt = T0 + 10;
    const home = tick(run, T0 + 5);
    expect(home.lastReport.loot.gold).toBe(198);
    expect(home.gold).toBe(run.gold + 198);
  });
});

describe("saves", () => {
  test("older saves gain traits and keep their preset colors", () => {
    const state = createGuild();
    const old = structuredClone(state);
    delete old.heroes[0].traits;
    old.heroes[0].appearance = { id: null, identityColor: "#22D3EE" };
    delete old.legacy;
    delete old.candidate;
    const parsed = parseGuild(old);
    expect(TRAIT_KEYS).toContain(parsed.heroes[0].traits[0]);
    expect(parsed.heroes[0].appearance.identityColor).toBe("#22D3EE");
    expect(parsed.legacy).toEqual({ renown: 0, upgrades: {}, legends: [] });
    expect(TRAIT_KEYS).toContain(parsed.candidate.trait);
    expect(parsed.heroes[0].combat.hp).toBeLessThanOrEqual(classlessMaxHp(parsed.heroes[0]));
    expect(parseGuild({ version: 99 })).toBeNull();
  });

  test("guild bonuses are re-stamped from the saved legacy", () => {
    const state = withRenown(createGuild(), 5);
    const upgraded = buyLegacyUpgrade(state, "vigor").state;
    delete upgraded.heroes[0].guildBonus;
    expect(parseGuild(upgraded).heroes[0].guildBonus.maxHp).toBeCloseTo(0.04);
    expect(syncGuildBonuses(createGuild()).heroes[0].guildBonus).toEqual({ damage: 0, maxHp: 0 });
  });
});

describe("cloud save helpers", () => {
  test("asks only when the cloud holds a save this device has not synced", () => {
    const remote = { data: {}, updatedAt: 500 };
    expect(needsSaveChoice(null, "u1", null)).toBe(false);
    expect(needsSaveChoice(null, "u1", remote)).toBe(true);
    expect(needsSaveChoice({ userId: "u1", updatedAt: 500 }, "u1", remote)).toBe(false);
    expect(needsSaveChoice({ userId: "u1", updatedAt: 400 }, "u1", remote)).toBe(true);
    expect(needsSaveChoice({ userId: "u2", updatedAt: 500 }, "u1", remote)).toBe(true);
  });

  test("summarizes a save for the choice dialog", () => {
    const state = { ...createGuild(), gold: 321.6, bossRank: 4, records: { riftBest: 12 } };
    levelUp(state.heroes[1], 9);
    expect(summarizeSave(state)).toMatchObject({ gold: 322, heroes: 3, topLevel: 9, bossRank: 4, riftBest: 12, renown: 0 });
  });
});
