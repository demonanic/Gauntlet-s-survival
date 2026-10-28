import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { DEEPER, deeperDanger, deeperRegion } from "./expedition";
import { choosePending, createGuild, currentEncounterParty, recallExpedition, resolveEncounter, startExpedition, tick } from "./guild";
import { getRegion } from "./regions";
import { withPendingFight } from "../test/expeditionFixtures";

const T0 = 1_000_000;

function plainGuild() {
  const state = createGuild();
  for (const hero of state.heroes) { hero.traits = []; hero.combat.hp = classlessMaxHp(hero); }
  return state;
}

// A Gutter trip whose timer has just run out, waiting at the push-deeper prompt.
function atTheEnd({ tutorial = false, gold = 100 } = {}) {
  const state = plainGuild();
  const ids = state.heroes.map((hero) => hero.identity.id).slice(0, 3);
  const run = startExpedition(state, "gutter", ids, T0, () => 0.5, { tutorial }).state;
  run.expedition.loot.gold = gold;
  run.expedition.endsAt = T0 + 1000;
  run.expedition.nextEventAt = T0 + 5000;
  return tick(run, T0 + 1000, { interactive: true });
}

describe("pushing deeper", () => {
  test("a finished trip asks: push deeper or head home", () => {
    const end = atTheEnd();
    expect(end.expedition.pending).toMatchObject({ kind: "deeper", depth: 1, atStake: 0 });
    expect(end.expedition.loot.gold).toBe(100 + getRegion("gutter").completionGold);
    const home = choosePending(end, "home", T0 + 2000).state;
    expect(home.lastReport).toMatchObject({ outcome: "victory", depth: 0 });
    expect(home.clears.gutter).toBe(1);
  });

  test("each leg is 3 minutes of stronger creatures", () => {
    const deeper = choosePending(atTheEnd(), "push", T0 + 2000).state;
    const run = deeper.expedition;
    expect(run).toMatchObject({ depth: 1, endsAt: T0 + 2000 + DEEPER.legMs, pending: null });
    expect(run.banked).toEqual({ gold: 180, items: 0 });
    expect(deeper.records.deepest.gutter).toBe(1);
    const gutter = getRegion("gutter");
    expect(deeperRegion(gutter, 3).hpScale).toBeCloseTo(gutter.hpScale * 1.15 ** 3);
    expect(deeperRegion(gutter, 3).dmgScale).toBeCloseTo(gutter.dmgScale * 1.15 ** 3);
    expect(deeperDanger(10)).toBeGreaterThan(4);
    expect(deeperRegion(gutter, 0)).toBe(gutter);
  });

  test("surviving a leg pays its spoils bonus and a cache, but the bounty only once; then it asks again", () => {
    let state = choosePending(atTheEnd(), "push", T0 + 2000).state;
    state.expedition.loot.gold += 50; // found during leg 1
    state.expedition.endsAt = T0 + 3000;
    state.expedition.nextEventAt = T0 + 9000;
    state = tick(state, T0 + 3000, { interactive: true });
    const run = state.expedition;
    expect(run.loot.gold).toBe(180 + 50 + Math.round(50 * DEEPER.loot));
    expect(run.loot.items).toHaveLength(1);
    expect(run.pending).toMatchObject({ kind: "deeper", depth: 2, atStake: 50 + Math.round(50 * DEEPER.loot) });
    expect(state.clears.gutter).toBe(1);
    const home = choosePending(state, "home", T0 + 4000).state;
    expect(home.lastReport).toMatchObject({ outcome: "victory", depth: 1 });
    expect(home.clears.gutter).toBe(1);
  });

  test("a wipe down there loses everything found past the trip's end, then half the rest as usual", () => {
    let state = choosePending(atTheEnd(), "push", T0 + 2000).state;
    state.expedition.loot.gold += 500;
    state.expedition.loot.items.push({ kind: "consumable", key: "potion", qty: 1 });
    withPendingFight(state, T0 + 3000);
    const party = structuredClone(currentEncounterParty(state)).map((hero) => ({ ...hero, combat: { ...hero.combat, hp: 0 } }));
    state = resolveEncounter(state, { victory: false, party, xpGains: {}, gold: 0, items: [] }, T0 + 4000).state;
    expect(state.lastReport).toMatchObject({ outcome: "retreat", loot: { gold: 90, items: [] } });
  });

  test("recalling from the depths keeps everything", () => {
    const state = choosePending(atTheEnd(), "push", T0 + 2000).state;
    state.expedition.loot.gold += 500;
    const home = recallExpedition(state, T0 + 3000).state;
    expect(home.lastReport.loot.gold).toBe(680);
  });

  test("left alone, a healthy, whole party presses on; a hurt one heads home; gamblers dare more", () => {
    const decide = (setup) => {
      const end = atTheEnd();
      setup(end);
      return tick(end, end.expedition.pending.promptAt, { interactive: false });
    };
    expect(decide(() => {}).expedition?.depth).toBe(1);
    const party = (state) => state.heroes.filter((hero) => state.expedition.heroIds.includes(hero.identity.id));
    const hurt = (state, share) => { for (const hero of party(state)) hero.combat.hp = classlessMaxHp(hero) * share; };
    expect(decide((state) => hurt(state, 0.5)).expedition).toBeNull();
    expect(decide((state) => { hurt(state, 0.5); party(state)[0].traits = ["reckless"]; }).expedition?.depth).toBe(1);
    expect(decide((state) => { party(state)[1].combat.hp = 0; }).expedition).toBeNull();
    // ...and never more than a few legs on its own.
    expect(decide((state) => { state.expedition.depth = DEEPER.autoMaxDepth; state.expedition.banked = { gold: 0, items: 0 }; }).expedition).toBeNull();
  });

  test("the guided first trip just ends", () => {
    const end = atTheEnd({ tutorial: true });
    expect(end.expedition).toBeNull();
    expect(end.lastReport.outcome).toBe("victory");
  });

  test("beating an end boss leads to the same choice", () => {
    const state = plainGuild();
    state.heroes[0].progression.level = 3;
    let run = startExpedition(state, "boneyard", [state.heroes[0].identity.id], T0, () => 0.5).state;
    withPendingFight(run, T0 + 1000, "boss");
    const party = structuredClone(currentEncounterParty(run));
    run = resolveEncounter(run, { victory: true, party, xpGains: {}, gold: 0, items: [] }, T0 + 2000).state;
    expect(run.expedition.pending).toMatchObject({ kind: "deeper", depth: 1 });
    expect(run.clears.boneyard).toBe(1);
  });
});
