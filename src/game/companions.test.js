import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { Engine } from "../combat/engine";
import { CONSUMABLES, crystalInfo, healThreshold, heroGearStats, itemSockets } from "../combat/gear";
import { PET_SPECIES, PET_XP, petStats } from "../combat/pets";
import { heroRoadEffects, partyRoadEffects } from "../combat/traits";
import { buildWildEncounter, createEncounterSim } from "./encounters";
import { choosePending, createGuild, startExpedition } from "./guild";
import {
  CRYSTAL_PRICE, EXTRACT_COST, buyCrystal, createGearItem, extractCrystal, fuseCrystals, infuseCrystal, setSupplyStyle,
} from "./items";
import { adoptPet, assignPet, awardPetXp, choosePetMod, createPet, pendingPetMods, unassignPet } from "./pets";
import { getRegion } from "./regions";
import { parseGuild } from "./storage";

const STEP = 1 / 30;
const fixed = (value) => () => value;

function plainHero(weapon = "sword") {
  const hero = structuredClone(createGuild().heroes[0]);
  hero.traits = [];
  hero.guildBonus = { damage: 0, maxHp: 0 };
  hero.equipment = { weapon: createGearItem({ slot: "weapon", variant: weapon, rarity: "common", tier: 1 }) };
  hero.quickSlots = [null, null];
  hero.combat.hp = classlessMaxHp(hero);
  return hero;
}

function arena(heroes) {
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1), buildWildEncounter(getRegion("gutter"), 0, fixed(0.5)), {});
  engine.spawnQueue = [];
  engine.active = [];
  return engine;
}

const dummy = (x, y, extra = {}) => ({
  id: `d${x}${y}`, type: "goblin", name: "Goblin", tier: "basic", hp: 5000, maxHp: 5000, speed: 0, damage: 0, x, y, dmgBy: {}, atkCd: 99, affinities: {}, ...extra,
});
const run = (engine, seconds) => { for (let t = 0; t < seconds; t += STEP) engine.update(STEP); };

describe("supply styles", () => {
  test("styles move the HP line for healing items; potions can be saved for bosses", () => {
    const hero = plainHero();
    expect(healThreshold(hero, CONSUMABLES.bandage)).toBe(0.5);
    hero.supplyStyle = "cautious";
    expect(healThreshold(hero, CONSUMABLES.bandage)).toBeCloseTo(0.65);
    hero.supplyStyle = "thrifty";
    expect(healThreshold(hero, CONSUMABLES.potion)).toBeCloseTo(0.195);

    const saver = plainHero();
    saver.savePotions = true;
    saver.quickSlots = [{ key: "potion", qty: 3 }, null];
    saver.combat.hp = Math.round(classlessMaxHp(saver) * 0.2);
    const engine = arena([saver]);
    engine.active = [dummy(100, 100)];
    engine._tickQuickItems(engine.heroes[0], STEP);
    expect(saver.quickSlots[0].qty).toBe(3);
    engine.active = [dummy(100, 100, { tier: "elite" })];
    engine._tickQuickItems(engine.heroes[0], STEP);
    expect(engine.heroes[0].model.quickSlots[0].qty).toBe(2);
  });

  test("the style is saved per hero, even mid-expedition", () => {
    let state = createGuild();
    const id = state.heroes[0].identity.id;
    state = startExpedition(state, "gutter", [id], 0).state;
    state = setSupplyStyle(state, id, { style: "cautious", savePotions: true }).state;
    expect(state.heroes[0]).toMatchObject({ supplyStyle: "cautious", savePotions: true });
    expect(setSupplyStyle(state, id, { style: "reckless" }).reason).toBe("unknown_style");
  });
});

describe("crystals", () => {
  test("sockets come with rarity, and weapons get one more", () => {
    expect(itemSockets(createGearItem({ slot: "weapon", rarity: "common" }))).toBe(1);
    expect(itemSockets(createGearItem({ slot: "head", rarity: "common" }))).toBe(0);
    expect(itemSockets(createGearItem({ slot: "head", rarity: "rare" }))).toBe(1);
    expect(itemSockets(createGearItem({ slot: "chest", rarity: "epic" }))).toBe(2);
  });

  test("buy, infuse, extract and fuse", () => {
    let state = { ...createGuild(), gold: 1000 };
    const sword = state.heroes.find((hero) => hero.equipment.weapon.weaponType === "sword").equipment.weapon;
    state = buyCrystal(state, "ember").state;
    expect(state.gold).toBe(1000 - CRYSTAL_PRICE);
    expect(state.crystals["ember-1"]).toBe(1);
    state = infuseCrystal(state, sword.id, "ember-1").state;
    const infused = state.heroes.flatMap((hero) => Object.values(hero.equipment)).find((item) => item.id === sword.id);
    expect(infused.runes).toEqual(["ember-1"]);
    expect(infused.stats.burn).toBeCloseTo(crystalInfo("ember-1").value);
    expect(infused.stats.attack).toBe(sword.stats.attack);
    // One socket on a common weapon; armor crystals don't fit weapons.
    state.crystals["stone-1"] = 1;
    expect(infuseCrystal(state, sword.id, "stone-1").reason).toBe("wrong_kind");
    state = extractCrystal(state, sword.id, 0).state;
    expect(state.crystals["ember-1"]).toBe(1);
    expect(state.gold).toBe(1000 - CRYSTAL_PRICE - EXTRACT_COST);
    state.crystals["frost-1"] = 3;
    state = fuseCrystals(state, "frost-1").state;
    expect(state.crystals).toMatchObject({ "frost-1": 0, "frost-2": 1 });
    expect(fuseCrystals(state, "frost-2").reason).toBe("not_enough");
  });

  test("an armor crystal adds its resistance to the wearer", () => {
    let state = { ...createGuild(), crystals: { "hearth-3": 1 } };
    const hero = state.heroes[0];
    hero.equipment.chest = createGearItem({ slot: "chest", rarity: "rare", tier: 1 });
    const before = heroGearStats(hero).coldResist;
    state = infuseCrystal(state, hero.equipment.chest.id, "hearth-3").state;
    expect(heroGearStats(state.heroes[0]).coldResist).toBeCloseTo(Math.min(1, before + 0.4));
  });

  test("venom poisons and storm arcs to a second foe", () => {
    const hero = plainHero();
    hero.equipment.weapon.stats = { ...hero.equipment.weapon.stats, venom: 0.5, shock: 1 };
    const engine = arena([hero]);
    const h = engine.heroes[0];
    const first = dummy(h.x, h.y - 30);
    const second = dummy(h.x + 40, h.y - 40);
    engine.active = [first, second];
    engine._applyClasslessHit({ target: first, heroIndex: 0, sourceId: "H0", dmg: 50, damageCategory: "weapon", classless: true });
    expect(first.dots.length).toBeGreaterThan(0);
    expect(second.hp).toBeLessThan(5000);
  });

  test("crystals survive a save round trip", () => {
    const state = { ...createGuild(), crystals: { "ember-2": 2, "bogus-9": 4 } };
    expect(parseGuild(JSON.parse(JSON.stringify(state))).crystals).toEqual({ "ember-2": 2 });
  });
});

describe("familiars", () => {
  test("adopt into the kennel, pair with a hero, swap, send back", () => {
    let state = { ...createGuild(), gold: 1000 };
    const id = state.heroes[0].identity.id;
    state = adoptPet(state, "wolf", fixed(0.1)).state;
    state = adoptPet(state, "hawk", fixed(0.2)).state;
    expect(state.gold).toBe(1000 - PET_SPECIES.wolf.price - PET_SPECIES.hawk.price);
    const [wolf, hawk] = state.kennel;
    state = assignPet(state, id, wolf.id).state;
    expect(state.heroes[0].pet.species).toBe("wolf");
    state = assignPet(state, id, hawk.id).state;
    expect(state.heroes[0].pet.species).toBe("hawk");
    expect(state.kennel.map((pet) => pet.species)).toEqual(["wolf"]);
    state = unassignPet(state, id).state;
    expect(state.heroes[0].pet).toBeUndefined();
    expect(state.kennel).toHaveLength(2);
  });

  test("pets level up from their partner's XP and pick a trick at 3, 6 and 9", () => {
    const pet = createPet("wolf", fixed(0.3));
    expect(awardPetXp(pet, PET_XP[2])).toEqual([2, 3]);
    expect(pendingPetMods(pet)).toEqual([3]);
    let state = createGuild();
    state.heroes[0].pet = pet;
    const id = state.heroes[0].identity.id;
    expect(choosePetMod(state, id, 6, "hamstring").reason).toBe("not_available");
    state = choosePetMod(state, id, 3, "fangs").state;
    expect(pendingPetMods(state.heroes[0].pet)).toEqual([]);
    expect(petStats(state.heroes[0].pet).attack.damage).toBeGreaterThan(petStats(pet).attack.damage);
  });

  test("a wolf bites, a hawk marks its prey for its partner", () => {
    const hero = plainHero();
    hero.pet = createPet("hawk", fixed(0.99));
    const engine = arena([hero]);
    const h = engine.heroes[0];
    const prey = dummy(h.x, h.y - 120);
    engine.active = [prey];
    run(engine, 3);
    expect(prey.hp).toBeLessThan(5000);
    expect(prey.petMarkOwner).toBe(0);

    const biter = plainHero();
    biter.pet = createPet("wolf");
    const wolfEngine = arena([biter]);
    for (const unit of wolfEngine.heroes) unit.protect = 99;
    const target = dummy(wolfEngine.heroes[0].x + 60, wolfEngine.heroes[0].y - 150);
    wolfEngine.active = [target];
    run(wolfEngine, 4);
    expect(target.hp).toBeLessThan(5000);
  });

  test("a sprite heals its partner; a tortoise guards and shields", () => {
    const hurt = plainHero();
    hurt.pet = createPet("sprite");
    hurt.combat.hp = Math.round(classlessMaxHp(hurt) * 0.5);
    const engine = arena([hurt]);
    const before = engine.heroes[0].ref.hp;
    run(engine, 4);
    expect(engine.heroes[0].ref.hp).toBeGreaterThan(before);

    const guarded = plainHero();
    guarded.pet = createPet("tortoise");
    const shell = arena([guarded]);
    expect(shell.heroes[0].petGuard).toBeCloseTo(PET_SPECIES.tortoise.support.guard + (guarded.pet.quality === "loyal" ? 0.04 : 0));
    run(shell, 9);
    expect(shell.heroes[0].ref.shield).toBeGreaterThan(0);
  });

  test("pets bring their road effects to the party", () => {
    const hero = plainHero();
    hero.pet = { ...createPet("hawk"), quality: "keenNose" };
    expect(heroRoadEffects(hero)).toMatchObject({ spotAmbush: 0.1, findChance: 0.15 });
    expect(partyRoadEffects([hero]).stalkerDetect).toBeCloseTo(0.12);
  });

  test("a stray on the road can be taken in", () => {
    let state = createGuild();
    state = startExpedition(state, "gutter", [state.heroes[0].identity.id], 0).state;
    const pet = createPet("sprite");
    state.expedition.pending = { kind: "story", story: "stray", text: "", pet, at: 0, promptAt: 0, engagedAt: null };
    state = choosePending(state, "adopt", 1000).state;
    expect(state.kennel.map((entry) => entry.id)).toEqual([pet.id]);
  });

  test("pets survive a save round trip; broken ones are dropped", () => {
    const state = createGuild();
    state.heroes[0].pet = createPet("imp");
    state.kennel = [createPet("wolf"), { species: "dragon" }];
    const loaded = parseGuild(JSON.parse(JSON.stringify(state)));
    expect(loaded.heroes[0].pet.species).toBe("imp");
    expect(loaded.kennel.map((pet) => pet.species)).toEqual(["wolf"]);
  });
});
