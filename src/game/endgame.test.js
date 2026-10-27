import { Engine } from "../combat/engine";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { COMBAT_PACING, buildBossEncounter, buildEndlessWave, createEncounterSim, endlessWaveSource } from "./encounters";
import { withPendingFight } from "../test/expeditionFixtures";
import {
  createGuild, currentEncounterWave, engagePending, resolveEncounter, riftBounty, startExpedition, treatInjury, treatmentCost,
} from "./guild";
import { createGearItem, equipGear, upgradeCost, upgradeGear } from "./items";
import { BOSS_ROTATION, getRegion } from "./regions";
import { SHOP_ROTATION_MS, buyShopItem, rerollShop, shopStock, shopTier } from "./shop";

const T0 = 1_000_000;
const heroId = (state, index = 0) => state.heroes[index].identity.id;
const rich = (state, gold = 100_000) => ({ ...state, gold });

describe("armory shop", () => {
  test("stock is stable within a rotation and changes with the next one", () => {
    const state = createGuild();
    const first = shopStock(state, T0);
    expect(shopStock(state, T0 + 1000).items).toEqual(first.items);
    expect(first.items).toHaveLength(6);
    const next = shopStock(state, first.endsAt);
    expect(next.rotation).toBe(first.rotation + 1);
    expect(next.items.map((item) => item.id)).not.toEqual(first.items.map((item) => item.id));
    expect(first.endsAt - T0).toBeLessThanOrEqual(SHOP_ROTATION_MS);
  });

  test("the featured Masterwork is an Epic one tier above progress", () => {
    const state = { ...createGuild(), clears: { gutter: 1, boneyard: 2 } };
    expect(shopTier(state)).toBe(2);
    const featured = shopStock(state, T0).items.find((item) => item.featured);
    expect(featured).toMatchObject({ rarity: "epic", tier: 3, masterwork: true });
    expect(featured.name.startsWith("Masterwork")).toBe(true);
    expect(featured.price).toBeGreaterThan(Math.max(...shopStock(state, T0).items.filter((item) => !item.featured).map((item) => item.price)));
  });

  test("shop tier rises with boss ranks", () => {
    expect(shopTier({ ...createGuild(), clears: { ashen: 1 }, bossRank: 4 })).toBe(6);
  });

  test("buying moves the item to the vault once", () => {
    const state = rich(createGuild());
    const offer = shopStock(state, T0).items[0];
    const bought = buyShopItem(state, offer.id, T0).state;
    expect(bought.gold).toBe(state.gold - offer.price);
    expect(bought.vault).toHaveLength(1);
    expect(bought.vault[0]).toMatchObject({ slot: offer.slot, stats: offer.stats });
    expect(bought.vault[0].price).toBeUndefined();
    expect(shopStock(bought, T0).items[0].sold).toBe(true);
    expect(buyShopItem(bought, offer.id, T0)).toEqual({ ok: false, reason: "sold_out" });
    expect(buyShopItem(createGuild(), shopStock(createGuild(), T0).items[5].id, T0).reason).toBe("insufficient_gold");
  });

  test("rerolling costs gold, doubles in price, and resets with the rotation", () => {
    const state = rich(createGuild());
    const before = shopStock(state, T0);
    const rerolled = rerollShop(state, T0).state;
    expect(rerolled.gold).toBe(state.gold - before.rerollCost);
    const after = shopStock(rerolled, T0);
    expect(after.items[0].id).not.toBe(before.items[0].id);
    expect(after.rerollCost).toBe(before.rerollCost * 2);
    expect(shopStock(rerolled, before.endsAt).rerollCost).toBe(before.rerollCost);
  });
});

describe("forge", () => {
  test("upgrades add 15% of base stats per level up to +5", () => {
    const sword = createGearItem({ slot: "weapon", variant: "sword", rarity: "rare", tier: 2 });
    let state = rich({ ...createGuild(), vault: [sword] });
    const cost = upgradeCost(sword);
    state = upgradeGear(state, sword.id).state;
    expect(state.vault[0]).toMatchObject({ upgrade: 1, baseStats: sword.baseStats, affixes: sword.affixes });
    expect(state.vault[0].stats.attack).toBe(Math.round(sword.stats.attack * 1.15));
    // Affixes ride along unchanged; only base stats are forged.
    for (const affix of sword.affixes) expect(state.vault[0].stats[affix.stat]).toBeCloseTo(sword.stats[affix.stat], 5);
    expect(state.gold).toBe(100_000 - cost);
    for (let level = 2; level <= 5; level += 1) state = upgradeGear(state, sword.id).state;
    expect(state.vault[0].stats.attack).toBe(Math.round(sword.stats.attack * 1.75));
    expect(upgradeGear(state, sword.id)).toEqual({ ok: false, reason: "max_upgrade" });
  });

  test("equipped gear can be upgraded only while the hero is home", () => {
    const state = rich(createGuild());
    const weaponId = state.heroes[0].equipment.weapon.id;
    expect(upgradeGear(state, weaponId).state.heroes[0].equipment.weapon.upgrade).toBe(1);
    const away = startExpedition(state, "gutter", [heroId(state)], T0).state;
    expect(upgradeGear(away, weaponId)).toEqual({ ok: false, reason: "hero_away" });
  });
});

describe("infirmary", () => {
  test("treating cures the injury and heals to full for gold", () => {
    const state = { ...createGuild(), injuries: {} };
    state.injuries[heroId(state)] = T0 + 60_000;
    state.heroes[0].combat.hp = 1;
    expect(treatmentCost(state, heroId(state), T0)).toBe(30);
    const treated = treatInjury(state, heroId(state), T0).state;
    expect(treated.injuries[heroId(state)]).toBeUndefined();
    expect(treated.heroes[0].combat.hp).toBe(classlessMaxHp(treated.heroes[0]));
    expect(treated.gold).toBe(state.gold - 30);
    expect(treatInjury(treated, heroId(state), T0)).toEqual({ ok: false, reason: "not_injured" });
  });
});

describe("boss rotation", () => {
  const ashen = getRegion("ashen");

  test("the Ashen Keep end boss follows the boss rank and scales with it", () => {
    const types = [0, 1, 2, 3].map((rank) => buildBossEncounter(ashen, rank).enemies.find((enemy) => enemy.boss).type);
    expect(types).toEqual([...BOSS_ROTATION, BOSS_ROTATION[0]]);
    const rank0 = buildBossEncounter(ashen, 0);
    const rank3 = buildBossEncounter(ashen, 3);
    // Rank 3 is the demon again, with HP compounded 15% per rank.
    expect(Math.abs(rank3.enemies[0].maxHp - rank0.enemies[0].maxHp * 1.15 ** 3)).toBeLessThan(2);
    expect(rank3.lootTier).toBe(rank0.lootTier + 1);
    // Boneyard's boss doesn't rotate.
    expect(buildBossEncounter(getRegion("boneyard"), 5).enemies[0].type).toBe("lieutenant");
  });

  test("beating the Ashen Keep boss raises the rank and the bounty grows with it", () => {
    const clearAshen = (rank) => {
      let state = { ...createGuild(), bossRank: rank };
      state.heroes[0].progression.level = 6;
      state = startExpedition(state, "ashen", [heroId(state)], T0).state;
      withPendingFight(state, T0 + 1000, "boss");
      const party = structuredClone(state.heroes.slice(0, 1));
      return resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 0, items: [] }, T0 + 2000).state;
    };
    const first = clearAshen(0);
    expect(first.bossRank).toBe(1);
    expect(first.expedition).toBeNull();
    expect(first.lastReport).toMatchObject({ outcome: "victory", loot: { gold: 800 } });
    expect(first.lastReport.log.join(" ")).toMatch(/Three-Headed Demon slain! Next on the throne: Imperial Necromancer \(rank 2\)/);
    expect(first.clears.ashen).toBe(1);
    expect(clearAshen(2).lastReport.loot.gold).toBe(1040);
  });
});

describe("endless rift", () => {
  test("waves grow, add elites every 5th wave and bosses every 10th", () => {
    const wave1 = buildEndlessWave(1, () => 0);
    expect(wave1.enemies).toHaveLength(3);
    expect(wave1.lootTier).toBe(1);
    expect(buildEndlessWave(5, () => 0).enemies[0].type).toBe("lieutenant");
    const wave10 = buildEndlessWave(10, () => 0);
    expect(wave10.hasBoss).toBe(true);
    expect(wave10.enemies[0].type).toBe("demon");
    expect(buildEndlessWave(20, () => 0).enemies[0].type).toBe("imperialNecromancer");
    expect(buildEndlessWave(12, () => 0).lootTier).toBe(3);
    expect(buildEndlessWave(9, () => 0).enemies[0].maxHp).toBeGreaterThan(wave1.enemies[0].maxHp);
  });

  test("the engine rolls into the next wave and ends only on return", () => {
    const party = structuredClone(createGuild().heroes);
    const wave = buildEndlessWave(1);
    const sim = createEncounterSim(party, 1, wave);
    let ended = null;
    const engine = new Engine({ getContext: () => null }, sim, wave, { nextWave: endlessWaveSource(sim), onEnd: (outcome) => { ended = outcome; } });
    engine.spawnQueue = [];
    engine.active = [];
    engine.update(1 / 30);
    expect(ended).toBeNull();
    expect(engine.wavesCleared).toBe(1);
    expect(engine.spawnQueue.length).toBeGreaterThan(0);
    expect(engine.returnHome()).toBe(true);
    expect(ended).toMatchObject({ victory: true, reason: "returned", wavesCleared: 1 });
    expect(engine.returnHome()).toBe(false);
  });

  test("the Rift opens at once; returning banks loot plus the wave bounty and records the best run", () => {
    expect(startExpedition(createGuild(), "rift", [], T0)).toEqual({ ok: false, reason: "invalid_party_size" });
    const guild = createGuild();
    guild.heroes[0].progression.level = 3;
    let state = startExpedition(guild, "rift", [heroId(guild)], T0).state;
    expect(state.expedition.pending.kind).toBe("rift");
    expect(currentEncounterWave(state).waveNumber).toBe(1);
    state = engagePending(state, T0 + 1000).state;
    const party = structuredClone(state.heroes.slice(0, 1));
    const returned = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 40, items: [], wavesCleared: 7 }, T0 + 31_000).state;
    expect(returned.lastReport).toMatchObject({ outcome: "returned", wavesCleared: 7 });
    expect(returned.lastReport.loot.gold).toBe(40 + riftBounty(7));
    expect(returned.records.riftBest).toBe(7);

    const overrun = resolveEncounter(state, { victory: false, party, xpGains: {}, gold: 40, items: [], wavesCleared: 3 }, T0 + 31_000).state;
    expect(overrun.lastReport.outcome).toBe("retreat");
    expect(overrun.lastReport.loot.gold).toBe(Math.floor((40 + riftBounty(3)) / 2));
  });
});

describe("boss mechanics", () => {
  function bossFight(type) {
    const party = structuredClone(createGuild().heroes);
    const wave = buildBossEncounter({ ...getRegion("ashen"), bossRotation: false, boss: [type] }, 0);
    delete wave.vanguard; // straight to the boss, without its guards
    const sim = createEncounterSim(party, 3, wave);
    const engine = new Engine({ getContext: () => null }, sim, wave, {});
    engine.update(1 / 30); // spawn the boss
    return engine;
  }

  test("the Abomination enrages below 35% HP", () => {
    const engine = bossFight("nuclearBehemoth");
    const boss = engine.active[0];
    const { speed, damage } = boss;
    boss.hp = boss.maxHp * 0.3;
    engine.update(1 / 30);
    expect(boss.enraged).toBe(true);
    expect(boss.speed).toBeCloseTo(speed * 1.5);
    expect(boss.damage).toBeCloseTo(damage * 1.3);
  });

  test("the Necromancer raises scaled minions", () => {
    const engine = bossFight("imperialNecromancer");
    const boss = engine.active[0];
    boss.y = 500; // well inside its range of the party
    boss.abilityCd = 0;
    engine.update(1 / 30);
    const minions = engine.active.filter((enemy) => !enemy.boss);
    expect(minions.map((enemy) => enemy.type).sort()).toEqual(["ghost", "skeleton", "skeleton"]);
    // Minions spawn at 60% of the encounter's HP scale (with ordinary combat pacing).
    expect(minions.find((enemy) => enemy.type === "skeleton").maxHp).toBe(Math.round(70 * engine.sim.minionScale.hp * 0.6 * COMBAT_PACING.hp));
  });
});
