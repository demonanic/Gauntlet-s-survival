import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { withPendingFight } from "../test/expeditionFixtures";
import {
  ADVENTURE, WEATHER, conditionEffects, isNight, moraleDamageBonus, rollBanter, rollWeather, sneakChance,
} from "./adventure";
import { buildLegendaryEncounter, buildWildEncounter } from "./encounters";
import { createGearItem } from "./items";
import {
  choosePending, createGuild, currentEncounterParty, engagePending, heroStatus, recallExpedition, resolveEncounter,
  startExpedition, tick,
} from "./guild";
import { getRegion } from "./regions";
import { parseGuild } from "./storage";

const T0 = 1_000_000;
const MINUTE = 60_000;
const ids = (state) => state.heroes.map((hero) => hero.identity.id);
// rng 0.8: events every 36s, and each event roll lands on "encounter", as a sighting.
const sightingRng = () => 0.8;

function seeded(seed = 7) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gutterRun(rng = sightingRng, heroCount = 3) {
  const state = createGuild();
  return startExpedition(state, "gutter", ids(state).slice(0, heroCount), T0, rng).state;
}

describe("timed expeditions", () => {
  test("an expedition runs for the region's duration and starts the feed", () => {
    const state = gutterRun();
    expect(state.expedition).toMatchObject({ endsAt: T0 + 10 * MINUTE, morale: ADVENTURE.startMorale, pending: null });
    expect(state.expedition.nextEventAt).toBe(T0 + 36_000);
    expect(state.expedition.feed[0].text).toBe("The party sets out for The Gutter.");
    expect(heroStatus(state, state.heroes[0], T0)).toBe("away");
    expect(getRegion("boneyard").durationMinutes).toBe(20);
    expect(getRegion("ashen").durationMinutes).toBe(30);
  });

  test("left alone, a party plays the whole trip and comes home with a report", () => {
    let state = gutterRun(seeded(3));
    state = tick(state, T0 + 20 * MINUTE, { rng: seeded(4) }); // room for a treasure map detour
    expect(state.expedition).toBeNull();
    const report = state.lastReport;
    expect(["victory", "retreat"]).toContain(report.outcome);
    expect(report.stats.events).toBeGreaterThan(10);
    expect(report.log.length).toBeGreaterThan(report.stats.events);
    expect(state.heroes.some((hero) => hero.progression.xp > 0) || report.stats.fights === 0).toBe(true);
    if (report.outcome === "victory") {
      expect(state.clears.gutter).toBe(1);
      expect(report.loot.gold).toBeGreaterThanOrEqual(getRegion("gutter").completionGold);
    }
  });

  test("while the player is watching, a sighting waits for an answer and pauses the timer", () => {
    let state = gutterRun();
    state = tick(state, T0 + 36_000, { interactive: true, rng: sightingRng });
    const { pending } = state.expedition;
    expect(pending).toMatchObject({ kind: "sighting", at: T0 + 36_000 });
    expect(pending.sneakChance).toBeGreaterThan(0);
    expect(pending.wave.enemies.length).toBeGreaterThan(0);
    // Still waiting 30 seconds later, and the timer hasn't moved.
    state = tick(state, T0 + 66_000, { interactive: true, rng: sightingRng });
    expect(state.expedition.pending).not.toBeNull();
    expect(state.expedition.endsAt).toBe(T0 + 10 * MINUTE);
  });

  test("an unanswered prompt is decided by the party after a while", () => {
    let state = gutterRun();
    state = tick(state, T0 + 36_000, { interactive: true, rng: sightingRng });
    state = tick(state, T0 + 36_000 + ADVENTURE.autoDecideMs, { interactive: true, rng: sightingRng });
    const lines = state.expedition?.feed.map((entry) => entry.text).join(" ") ?? state.lastReport.log.join(" ");
    expect(lines).toMatch(/Victory over|Slipped past|overrun/);
  });

  test("sneaking: success slips past and resumes the timer; failure turns into an ambush", () => {
    let state = tick(gutterRun(), T0 + 36_000, { interactive: true, rng: sightingRng });
    const sneaked = choosePending(state, "sneak", T0 + 46_000, { rng: () => 0 }).state;
    expect(sneaked.expedition.pending).toBeNull();
    expect(sneaked.expedition.stats.sneaks).toBe(1);
    expect(sneaked.expedition.endsAt).toBe(T0 + 10 * MINUTE + 10_000); // paused 10 seconds
    expect(sneaked.expedition.feed.at(-1).text).toMatch(/^Slipped past/);

    const spotted = choosePending(state, "sneak", T0 + 46_000, { rng: () => 0.999 }).state;
    expect(spotted.expedition.pending).toMatchObject({ kind: "ambush", promptAt: T0 + 46_000 });
    const before = state.heroes[0].combat.hp;
    expect(spotted.heroes[0].combat.hp).toBe(before - Math.round(classlessMaxHp(state.heroes[0]) * ADVENTURE.ambushVolley));
    expect(choosePending(spotted, "sneak", T0 + 47_000)).toEqual({ ok: false, reason: "invalid_choice" });
  });

  test("attacking holds the prompt for a live battle; winning resumes the trip", () => {
    let state = tick(gutterRun(), T0 + 36_000, { interactive: true, rng: sightingRng });
    state = engagePending(state, T0 + 40_000).state;
    expect(state.expedition.pending.engagedAt).toBe(T0 + 40_000);
    // A battle in progress is never decided by the party, and can't be recalled.
    expect(tick(state, T0 + 5 * MINUTE, { interactive: true }).expedition.pending).not.toBeNull();
    expect(recallExpedition(state, T0 + 50_000)).toEqual({ ok: false, reason: "cannot_recall" });
    const party = structuredClone(currentEncounterParty(state));
    const won = resolveEncounter(state, { victory: true, party, xpGains: { 0: 30 }, gold: 12, items: [] }, T0 + 96_000).state;
    expect(won.expedition.pending).toBeNull();
    expect(won.expedition.loot.gold).toBe(12);
    expect(won.expedition.endsAt).toBe(T0 + 10 * MINUTE + 60_000);
    expect(won.expedition.morale).toBe(ADVENTURE.startMorale + 8);
    expect(won.heroes[0].progression.xp).toBeGreaterThan(0);
  });

  test("a lost battle sends the party home with half the loot and the fallen injured", () => {
    let state = gutterRun();
    withPendingFight(state, T0 + 1000);
    state.expedition.loot.gold = 40;
    const party = structuredClone(currentEncounterParty(state)).map((hero) => ({ ...hero, combat: { ...hero.combat, hp: 0 } }));
    state = resolveEncounter(state, { victory: false, party, xpGains: {}, gold: 0, items: [] }, T0 + 2000).state;
    expect(state.expedition).toBeNull();
    expect(state.lastReport).toMatchObject({ outcome: "retreat", loot: { gold: 20 } });
    expect(heroStatus(state, state.heroes[0], T0 + 3000)).toBe("injured");
    expect(state.heroes[0].combat.hp).toBe(1);
  });

  test("story choices apply their effects", () => {
    let state = gutterRun();
    state.heroes[0].combat.hp = 100;
    state.expedition.pending = { kind: "story", story: "shrine", at: T0 + 1000, promptAt: T0 + 1000, engagedAt: null };
    const prayed = choosePending(state, "pray", T0 + 2000).state;
    expect(prayed.heroes[0].combat.hp).toBeGreaterThan(100);
    expect(prayed.expedition.pending).toBeNull();
    expect(choosePending(state, "dance", T0 + 2000)).toEqual({ ok: false, reason: "invalid_choice" });

    state.expedition.pending = { kind: "story", story: "fork", at: T0 + 1000, promptAt: T0 + 1000, engagedAt: null };
    const trap = choosePending(state, "shortcut", T0 + 2000, { rng: () => 0.99 }).state;
    expect(trap.expedition.pending.kind).toBe("ambush");
  });

  test("the end boss waits at the end of the timer; beating it conquers the region", () => {
    const state = createGuild();
    state.heroes[0].progression.level = 3;
    let run = startExpedition(state, "boneyard", [ids(state)[0]], T0, sightingRng).state;
    run.expedition.endsAt = T0 + 1000;
    run = tick(run, T0 + 1000, { interactive: true });
    expect(run.expedition.pending).toMatchObject({ kind: "boss", label: "Lieutenant" });

    const left = choosePending(run, "leave", T0 + 2000).state;
    expect(left.lastReport.outcome).toBe("recalled");
    expect(left.clears.boneyard).toBeUndefined();

    run = engagePending(run, T0 + 2000).state;
    const party = structuredClone(currentEncounterParty(run));
    const won = resolveEncounter(run, { victory: true, party, xpGains: {}, gold: 0, items: [] }, T0 + 60_000).state;
    expect(won.lastReport).toMatchObject({ outcome: "victory", loot: { gold: 300 } });
    expect(won.clears.boneyard).toBe(1);
  });

  test("regions without a boss just end when the timer runs out", () => {
    const run = gutterRun();
    run.expedition.endsAt = T0 + 1000;
    const home = tick(run, T0 + 1000, { interactive: true });
    expect(home.expedition).toBeNull();
    expect(home.lastReport.outcome).toBe("victory");
    expect(home.clears.gutter).toBe(1);
  });

  test("the party patches up slowly between events, but not while a prompt holds it", () => {
    let state = gutterRun(() => 0.999); // first event at 40s
    state.heroes[0].traits = [];
    state.heroes[0].combat.hp = 100;
    state = tick(state, T0 + 30_000, { interactive: true });
    expect(state.heroes[0].combat.hp).toBeCloseTo(110, 0); // 300 max HP / 900 per second x 30s
    withPendingFight(state, T0 + 30_000);
    state = tick(state, T0 + 90_000, { interactive: true });
    expect(state.heroes[0].combat.hp).toBeCloseTo(110, 0);
  });

  test("an unattended party heads home after a fight leaves it badly hurt", () => {
    let state = gutterRun(sightingRng, 1);
    state.heroes[0].combat.hp = 5;
    state = tick(state, T0 + 36_000 + ADVENTURE.autoDecideMs, { rng: sightingRng });
    const lines = state.lastReport.log.join(" ");
    expect(state.expedition).toBeNull();
    expect(lines).toMatch(/limps home|overrun|Slipped past/);
  });

  test("flavor lines don't repeat back to back", () => {
    let state = gutterRun(seeded(11));
    state = tick(state, T0 + 20 * MINUTE, { rng: seeded(12), interactive: false });
    const flavor = state.lastReport.log.filter((line) => !/Victory|spots|Ambush|explored|sets out|gold|Slipped|Picked up|out of arrows/.test(line));
    for (let index = 1; index < flavor.length; index += 1) expect(flavor[index]).not.toBe(flavor[index - 1]);
  });

  test("shortcuts shorten a trip but never lengthen it", () => {
    const state = gutterRun();
    state.expedition.pending = { kind: "story", story: "campfire", at: T0 + 590_000, promptAt: T0 + 590_000, engagedAt: null };
    const pressed = choosePending(state, "press", T0 + 590_000).state;
    expect(pressed.expedition.endsAt).toBe(T0 + 10 * MINUTE);
    state.expedition.pending.at = state.expedition.pending.promptAt = T0 + 60_000;
    expect(choosePending(state, "press", T0 + 60_000).state.expedition.endsAt).toBe(T0 + 9 * MINUTE);
  });

  test("recalling heads home at once with everything found so far", () => {
    const run = gutterRun();
    run.expedition.loot.gold = 33;
    const recalled = recallExpedition(run, T0 + 5000).state;
    expect(recalled.expedition).toBeNull();
    expect(recalled.lastReport).toMatchObject({ outcome: "recalled", loot: { gold: 33 } });
  });
});

describe("sneaking and morale", () => {
  const gutter = getRegion("gutter");
  const squad = (size, type = "goblin") => ({ enemies: Array.from({ length: size }, () => ({ type })) });
  const hero = (overrides = {}) => {
    const base = structuredClone(createGuild().heroes[0]);
    base.traits = [];
    return { ...base, ...overrides };
  };

  test("agility, stealth perks, traits and level help; numbers, watchful enemies and big parties hurt", () => {
    const plain = sneakChance([hero()], squad(2), 50, gutter);
    const nimble = sneakChance([hero({ traits: ["nimble"] })], squad(2), 50, gutter);
    const shadowy = sneakChance([hero({ progression: { ...hero().progression, ownedNodeIds: ["S1", "S2"] } })], squad(2), 50, gutter);
    expect(nimble).toBeGreaterThan(plain);
    expect(shadowy).toBeGreaterThan(plain);
    expect(sneakChance([hero()], squad(5), 50, gutter)).toBeLessThan(plain);
    expect(sneakChance([hero()], squad(2, "ghost"), 50, gutter)).toBeLessThan(plain);
    expect(sneakChance([hero(), hero(), hero()], squad(2), 50, gutter)).toBeLessThan(plain);
    expect(sneakChance([hero()], squad(2), 100, gutter)).toBeGreaterThan(plain);
    expect(sneakChance([hero()], squad(40), 0, gutter)).toBe(0.05);
  });

  test("morale swings damage by up to 10% either way", () => {
    expect(moraleDamageBonus(50)).toBe(0);
    expect(moraleDamageBonus(100)).toBeCloseTo(0.1);
    expect(moraleDamageBonus(0)).toBeCloseTo(-0.1);
    const run = gutterRun();
    run.expedition.morale = 100;
    expect(currentEncounterParty(run)[0].moraleBonus.damage).toBeCloseTo(0.1);
  });

  test("wild squads get tougher deeper into the trip", () => {
    const early = buildWildEncounter(gutter, 0, () => 0.5);
    const late = buildWildEncounter(gutter, 1, () => 0.5);
    expect(late.enemies[0].maxHp).toBeGreaterThan(early.enemies[0].maxHp);
  });
});

describe("saves from before timed expeditions", () => {
  test("an old fixed-encounter expedition ends on load and keeps its loot", () => {
    const state = createGuild();
    state.expedition = {
      regionId: "gutter", heroIds: [state.heroes[0].identity.id], encounterIndex: 1, phase: "traveling",
      phaseEndsAt: T0, startedAt: T0, loot: { gold: 42, items: [{ kind: "consumable", key: "potion", qty: 1 }] },
      log: ["Set out for The Gutter."], outcome: null,
    };
    const loaded = parseGuild(structuredClone(state));
    expect(loaded.expedition).toBeNull();
    expect(loaded.gold).toBe(state.gold + 42);
    expect(loaded.stash.potion).toBe(1);
    expect(loaded.lastReport).toMatchObject({ outcome: "recalled", loot: { gold: 42 } });
    // A new-style expedition survives a save round trip untouched.
    const fresh = gutterRun();
    expect(parseGuild(structuredClone(fresh)).expedition).toEqual(fresh.expedition);
  });
});

describe("world events", () => {
  test("night and weather change ambush odds, sneaking, hazards and loot", () => {
    const day = conditionEffects("clear", false);
    const night = conditionEffects("clear", true);
    expect(night.ambush).toBeGreaterThan(day.ambush);
    expect(night.loot).toBeGreaterThan(day.loot);
    expect(conditionEffects("fog", false).sneak).toBeGreaterThan(day.sneak);
    expect(conditionEffects("storm", false).hazard).toBeGreaterThan(day.hazard);
    expect(conditionEffects("clear", false, true).sneak).toBeCloseTo(0.15);
    expect(rollWeather(() => 0, "clear")).not.toBe("clear");
    expect(isNight(new Date(2026, 9, 24, 23, 0).getTime())).toBe(true);
    expect(isNight(new Date(2026, 9, 24, 13, 0).getTime())).toBe(false);
    const run = gutterRun().expedition;
    expect(Object.keys(WEATHER)).toContain(run.weather);
    expect(run.feed[1].text).toContain(WEATHER[run.weather].intro);
  });

  test("heroes banter about their trait and the party's mood", () => {
    const hero = structuredClone(createGuild().heroes[0]);
    hero.traits = ["berserker"];
    expect(rollBanter(hero, 50, () => 0).text).toContain(hero.identity.name);
    hero.traits = [];
    expect(rollBanter(hero, 50, () => 0)).toBeNull();
    expect(rollBanter(hero, 90, () => 0).text).toMatch(/grinning|marching/);
    expect(rollBanter(hero, 10, () => 0).morale).toBe(-2);
  });

  test("long trips make camp halfway; scouting improves sneak odds and foraging finds supplies", () => {
    const state = createGuild();
    state.heroes[0].progression.level = 3;
    let run = startExpedition(state, "boneyard", [ids(state)[0]], T0, () => 0.999).state;
    expect(run.expedition.campAt).toBe(T0 + 10 * MINUTE);
    expect(gutterRun().expedition.campAt).toBeNull();
    run.expedition.nextEventAt = T0 + 20 * MINUTE; // nothing else happens first
    run = tick(run, T0 + 10 * MINUTE, { interactive: true });
    expect(run.expedition.pending).toMatchObject({ kind: "story", story: "camp" });
    const scouted = choosePending(run, "scout", T0 + 10 * MINUTE).state;
    expect(scouted.expedition.scouted).toBe(true);
    const foraged = choosePending(run, "forage", T0 + 10 * MINUTE).state;
    expect(foraged.expedition.loot.items.filter((item) => item.kind === "consumable")).toHaveLength(4);
    expect(foraged.expedition.loot.gold).toBeGreaterThan(0);
  });

  test("a treasure map adds a detour that ends with a stash", () => {
    let state = gutterRun();
    const endsAt = state.expedition.endsAt;
    state.expedition.pending = { kind: "story", story: "map", text: "map", at: T0 + MINUTE, promptAt: T0 + MINUTE, engagedAt: null };
    state = choosePending(state, "follow", T0 + MINUTE).state;
    expect(state.expedition.endsAt).toBe(endsAt + ADVENTURE.treasureDetourMs);
    expect(state.expedition.treasureAt).toBe(T0 + MINUTE + ADVENTURE.treasureDetourMs);
    state.expedition.nextEventAt = T0 + 30 * MINUTE;
    state = tick(state, T0 + MINUTE + ADVENTURE.treasureDetourMs, { interactive: true });
    const stash = state.expedition.feed.at(-1);
    expect(stash).toMatchObject({ tone: "loot", notify: true });
    expect(stash.text).toMatch(/^X marks the spot!/);
    expect(state.expedition.loot.items.some((item) => ["rare", "epic"].includes(item.rarity))).toBe(true);
  });

  test("the wandering merchant sells for guild gold, and the party never buys on its own", () => {
    const state = gutterRun();
    const item = createGearItem({ slot: "head", rarity: "rare", tier: 2 });
    state.expedition.pending = { kind: "merchant", item, price: 90, text: "merchant", at: T0 + MINUTE, promptAt: T0 + MINUTE, engagedAt: null };
    const bought = choosePending({ ...state, gold: 100 }, "buy", T0 + MINUTE).state;
    expect(bought.gold).toBe(10);
    expect(bought.expedition.loot.items).toContainEqual(item);
    expect(choosePending({ ...state, gold: 50 }, "buy", T0 + MINUTE)).toEqual({ ok: false, reason: "insufficient_gold" });
    const away = tick({ ...state, gold: 1000 }, T0 + 2 * MINUTE);
    expect(away.gold).toBe(1000);
    expect(away.expedition.feed.some((entry) => /waves the merchant off/.test(entry.text))).toBe(true);
  });

  test("legendary monsters are huge, and beating one pays out a hoard", () => {
    const gutter = getRegion("gutter");
    const wave = buildLegendaryEncounter(gutter, 0, () => 0.5);
    const legend = wave.enemies[0];
    expect(legend).toMatchObject({ legendary: true, tier: "elite", type: "skeleton" });
    expect(legend.maxHp).toBeGreaterThanOrEqual(Math.round(70 * gutter.hpScale * 5) - 1);
    expect(wave.enemies).toHaveLength(3);
    expect(wave.lootTier).toBe(2);

    let state = gutterRun();
    withPendingFight(state, T0 + MINUTE);
    state.expedition.pending.legendary = true;
    const party = structuredClone(currentEncounterParty(state));
    state = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 0, items: [] }, T0 + 2 * MINUTE).state;
    expect(state.expedition.loot.gold).toBeGreaterThan(0);
    expect(state.expedition.loot.items[0].rarity).toMatch(/rare|epic/);
    expect(state.expedition.feed.at(-1)).toMatchObject({ notify: true });
  });

  test("big moments are flagged for notifications", () => {
    const state = createGuild();
    state.heroes[0].progression.level = 3;
    let run = startExpedition(state, "boneyard", [ids(state)[0]], T0, () => 0.999).state;
    run.expedition.endsAt = T0 + 1000;
    run.expedition.campAt = null;
    run = tick(run, T0 + 1000, { interactive: true });
    expect(run.expedition.feed.at(-1)).toMatchObject({ tone: "danger", notify: true });
  });
});
