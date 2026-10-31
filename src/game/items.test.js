import { withoutArmor, withPendingFight } from "../test/expeditionFixtures";
import { Engine } from "../combat/engine";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { heroGearStats } from "../combat/gear";
import { getEquippedHeroWeaponType } from "../combat/heroWeapon";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { createGuild, resolveEncounter, startExpedition, tick } from "./guild";
import {
  GEAR_VERSION, bankLoot, buyConsumable, createGearItem, equipGear, heroCombatSummary, loadQuickSlot, migrateVaultItem,
  rollLoot, sellGear, unequipGear, unloadQuickSlot,
} from "./items";
import { getRegion } from "./regions";
import { loadGuild, saveGuild } from "./storage";

const T0 = 1_000_000;
const heroId = (state, index = 0) => state.heroes[index].identity.id;
const sequence = (...values) => { let i = 0; return () => values[i++ % values.length]; };

function withVaultItem(state, item) {
  return { ...state, vault: [...state.vault, item] };
}

describe("gear items", () => {
  test("stats scale with rarity and region tier", () => {
    const common = createGearItem({ slot: "chest", rarity: "common", tier: 1 });
    const epic = createGearItem({ slot: "chest", rarity: "epic", tier: 3 });
    expect(common.stats).toEqual({ defense: 5, maxHp: 25 });
    // Rarity ×1.8 and tier ×2.4 (plus affixes).
    expect(epic.baseStats.defense).toBe(Math.round(5 * 1.8 * 2.4));
    expect(epic.value).toBeGreaterThan(common.value);
    expect(createGearItem({ slot: "weapon", variant: "bow" }).weaponType).toBe("bow");
  });

  test("gear saved before the rarity rescale is brought in line on load", () => {
    const fresh = createGearItem({ slot: "chest", rarity: "epic", tier: 3 }, () => 0.4);
    const old = { ...fresh, baseStats: { defense: Math.round(5 * 3.2 * 2.4), maxHp: Math.round(25 * 3.2 * 2.4) }, gearVersion: undefined };
    old.stats = { ...old.baseStats };
    const migrated = migrateVaultItem(old);
    expect(migrated.baseStats).toEqual({ defense: Math.round(38 * 1.8 / 3.2), maxHp: Math.round(192 * 1.8 / 3.2) });
    expect(migrated.gearVersion).toBe(GEAR_VERSION);
    expect(migrateVaultItem(migrated)).toBe(migrated);
  });

  test("new heroes start with a common weapon and two empty quick slots", () => {
    const state = createGuild();
    expect(state.heroes.map(getEquippedHeroWeaponType)).toEqual(["sword", "bow", "staff"]);
    expect(state.heroes[0].quickSlots).toEqual([null, null]);
    expect(state.stash.bandage).toBe(6);
  });

  test("equipping swaps the old piece into the vault and adds stats", () => {
    const state = createGuild();
    state.heroes[0].traits = []; // no trait and no armor, so max HP is exactly base + gear
    withoutArmor(state.heroes[0]);
    const helm = createGearItem({ slot: "head", rarity: "rare", tier: 1 });
    const equipped = equipGear(withVaultItem(state, helm), heroId(state), helm.id);
    expect(equipped.ok).toBe(true);
    const hero = equipped.state.heroes[0];
    expect(hero.equipment.head.id).toBe(helm.id);
    expect(equipped.state.vault).toHaveLength(0);
    expect(heroGearStats(hero).defense).toBe(helm.stats.defense);
    expect(classlessMaxHp(hero)).toBe(Math.round((300 + helm.stats.maxHp) * (1 + (helm.stats.healthBonus || 0))));
    expect(heroCombatSummary(hero).defense).toBe(10 + helm.stats.defense);

    const sword = createGearItem({ slot: "weapon", variant: "sword", rarity: "epic" });
    const swapped = equipGear(withVaultItem(equipped.state, sword), heroId(state), sword.id).state;
    expect(swapped.heroes[0].equipment.weapon.id).toBe(sword.id);
    expect(swapped.vault.map((item) => item.slot)).toEqual(["weapon"]); // starter sword returned
    expect(state.heroes[0].equipment.head).toBeUndefined(); // input untouched
  });

  test("unequipping HP gear clamps current HP to the new maximum", () => {
    const state = createGuild();
    state.heroes[0].traits = []; // no trait and no armor, so max HP is exactly 300
    withoutArmor(state.heroes[0]);
    const amulet = createGearItem({ slot: "trinket", variant: "amulet", rarity: "epic", tier: 3 });
    const equipped = equipGear(withVaultItem(state, amulet), heroId(state), amulet.id).state;
    equipped.heroes[0].combat.hp = classlessMaxHp(equipped.heroes[0]);
    const removed = unequipGear(equipped, heroId(state), "trinket").state;
    expect(removed.heroes[0].combat.hp).toBe(300);
    expect(removed.vault[0].id).toBe(amulet.id);
  });

  test("gear is locked while the hero is on an expedition", () => {
    const state = createGuild();
    const helm = createGearItem({ slot: "head" });
    const away = startExpedition(withVaultItem(state, helm), "gutter", [heroId(state)], T0).state;
    expect(equipGear(away, heroId(state), helm.id)).toEqual({ ok: false, reason: "hero_away" });
    expect(equipGear(away, heroId(state, 1), helm.id).ok).toBe(true);
  });

  test("selling removes the item and pays its value", () => {
    const state = createGuild();
    const ring = createGearItem({ slot: "trinket", variant: "ring", rarity: "rare", tier: 2 });
    const sold = sellGear(withVaultItem(state, ring), ring.id).state;
    expect(sold.vault).toHaveLength(0);
    expect(sold.gold).toBe(state.gold + ring.value);
  });
});

describe("supplies and quick slots", () => {
  test("buying spends gold into the stash", () => {
    const state = createGuild();
    const bought = buyConsumable(state, "potion", 2).state;
    expect(bought.gold).toBe(100 - 70);
    expect(bought.stash.potion).toBe(2);
    expect(buyConsumable(state, "potion", 3)).toEqual({ ok: false, reason: "insufficient_gold" });
  });

  test("loading fills a quick slot up to the stack cap and unloading returns it", () => {
    const state = createGuild();
    const loaded = loadQuickSlot(state, heroId(state), 0, "bandage").state;
    expect(loaded.heroes[0].quickSlots[0]).toEqual({ key: "bandage", qty: 5 });
    expect(loaded.stash.bandage).toBe(1);
    expect(loadQuickSlot(loaded, heroId(state), 0, "bandage")).toEqual({ ok: false, reason: "stack_full" });
    expect(loadQuickSlot(loaded, heroId(state), 1, "potion")).toEqual({ ok: false, reason: "none_in_stash" });

    const withAmmo = { ...loaded, stash: { ...loaded.stash, ammo: 4 } };
    const replaced = loadQuickSlot(withAmmo, heroId(state), 0, "ammo").state;
    expect(replaced.heroes[0].quickSlots[0]).toEqual({ key: "ammo", qty: 3 });
    expect(replaced.stash).toMatchObject({ bandage: 6, ammo: 1 });

    const emptied = unloadQuickSlot(replaced, heroId(state), 0).state;
    expect(emptied.heroes[0].quickSlots[0]).toBeNull();
    expect(emptied.stash.ammo).toBe(4);
  });
});

describe("loot", () => {
  test("rolls gear first, then supplies, otherwise nothing", () => {
    expect(rollLoot({ tier: "basic" }, 1, sequence(0.01, 0.5, 0.5, 0.5)).kind).toBe("gear");
    expect(rollLoot({ tier: "basic" }, 1, sequence(0.9, 0.01, 0.1))).toEqual({ kind: "consumable", key: "bandage", qty: 1 });
    expect(rollLoot({ tier: "basic" }, 1, sequence(0.9, 0.9))).toBeNull();
    const bossDrop = rollLoot({ tier: "boss" }, 3, sequence(0.5));
    expect(["rare", "epic"]).toContain(bossDrop.rarity);
    expect(bossDrop.tier).toBe(3);
  });

  test("banking splits gear into the vault and supplies into the stash", () => {
    const state = createGuild();
    const helm = createGearItem({ slot: "head" });
    bankLoot(state, [helm, { kind: "consumable", key: "potion", qty: 1 }, { kind: "consumable", key: "bandage", qty: 2 }]);
    expect(state.vault).toEqual([helm]);
    expect(state.stash).toMatchObject({ potion: 1, bandage: 8 });
  });

  test("legacy Demonanic vault items migrate to Gauntlet gear", () => {
    const migrated = migrateVaultItem({ slot: "Boots", rarity: "E3", stats: { agility: 10 } });
    expect(migrated).toMatchObject({ kind: "gear", slot: "legs", rarity: "rare" });
    expect(migrateVaultItem({ slot: "Mystery" })).toBeNull();
  });
});

describe("quick slots in battle", () => {
  function engineFor(heroes) {
    const region = getRegion("gutter");
    const sim = createEncounterSim(heroes, 1);
    return new Engine({ getContext: () => null }, sim, buildWildEncounter(region, 0, () => 0.5), {});
  }

  test("a wounded hero bandages themself and spends the stack", () => {
    const hero = structuredClone(createGuild().heroes[0]);
    hero.traits = []; // no trait, so max HP is exactly 300
    hero.quickSlots = [{ key: "bandage", qty: 2 }, null];
    hero.combat.hp = 100;
    const engine = engineFor([hero]);
    engine.update(1 / 30);
    expect(engine.sim.heroes[0].quickSlots[0].qty).toBe(1);
    expect(engine.sim.heroes[0].combat.hp).toBeGreaterThanOrEqual(160);
    expect(engine.getHeroQuickSlots(0)[0]).toMatchObject({ key: "bandage", qty: 1, available: false });
  });

  test("manual ammo boosts the next basic attacks", () => {
    const hero = structuredClone(createGuild().heroes[0]);
    hero.quickSlots = [{ key: "ammo", qty: 1 }, null];
    const engine = engineFor([hero]);
    expect(engine.useQuickItem(0, 0)).toBe(true);
    expect(engine.heroes[0].ammoShots).toBe(8);
    expect(engine._consumeAmmoShot(engine.heroes[0], true)).toBe(1.5);
    expect(engine.heroes[0].ammoShots).toBe(7);
    expect(engine.useQuickItem(0, 0)).toBe(false); // stack spent
  });

  test("spent quick-slot items persist after the encounter resolves", () => {
    const guild = createGuild();
    let state = loadQuickSlot(guild, heroId(guild), 0, "bandage").state;
    state = startExpedition(state, "gutter", [heroId(state)], T0).state;
    withPendingFight(state, T0 + 20_000);
    const party = structuredClone(state.heroes.slice(0, 1));
    party[0].quickSlots[0].qty = 2;
    const resolved = resolveEncounter(state, { victory: true, party, xpGains: {}, gold: 5, items: [] }, T0 + 21_000);
    expect(resolved.state.heroes[0].quickSlots[0]).toEqual({ key: "bandage", qty: 2 });
  });
});

describe("saves", () => {
  test("gear, quick slots and stash survive a save round trip", () => {
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
    const guild = createGuild();
    const state = loadQuickSlot(guild, heroId(guild), 1, "bandage").state;
    saveGuild(state, storage);
    const loaded = loadGuild(storage);
    expect(loaded.heroes[0].equipment.weapon.weaponType).toBe("sword");
    expect(loaded.heroes[0].quickSlots[1]).toEqual({ key: "bandage", qty: 5 });
    expect(loaded.stash.bandage).toBe(1);
  });

  test("older saves gain gear fields and keep full HP from gear", () => {
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
    const state = createGuild();
    const chest = createGearItem({ slot: "chest", rarity: "epic", tier: 3 });
    const geared = equipGear(withVaultItem(state, chest), heroId(state), chest.id).state;
    geared.heroes[0].combat.hp = classlessMaxHp(geared.heroes[0]);
    delete geared.heroes[1].equipment;
    delete geared.heroes[1].quickSlots;
    delete geared.stash;
    saveGuild(geared, storage);
    const loaded = loadGuild(storage);
    expect(loaded.heroes[0].combat.hp).toBe(classlessMaxHp(loaded.heroes[0]));
    expect(loaded.heroes[1].equipment).toEqual({});
    expect(loaded.heroes[1].quickSlots).toEqual([null, null]);
    expect(loaded.stash.bandage).toBe(6);
  });
});
