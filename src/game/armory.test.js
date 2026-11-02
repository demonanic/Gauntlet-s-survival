import { createGuild } from "./guild";
import { createGearItem, salvageGear, sellGear, toggleItemLock } from "./items";
import {
  applyAutoClear, autoClearSettings, canWear, clearGear, equipBest, equipBestParty, fitChange, fitTag, heroFit, heroRole, junkItems,
  rankForSlot, setAutoClear, upgradeFor, vaultView,
} from "./armory";
import { completeExpedition } from "./expeditionRun";
import { parseGuild } from "./storage";

const T0 = 1_000_000;
const byWeapon = (state, type) => state.heroes.find((hero) => hero.equipment.weapon?.weaponType === type);
const id = (hero) => hero.identity.id;
// A plain piece with exactly these stats (no random affixes).
function piece(slot, stats, extra = {}) {
  const item = createGearItem({ slot, rarity: "common", tier: 1, ...extra });
  return { ...item, affixes: [], baseStats: { ...stats }, stats: { ...stats } };
}

describe("armory: hero fit", () => {
  test("the starting guild has a sword, a bow and a staff hero", () => {
    const state = createGuild();
    expect(["sword", "bow", "staff"].every((type) => heroRole(byWeapon(state, type)) === type)).toBe(true);
    expect(heroFit(byWeapon(state, "sword"))).toBeGreaterThan(0);
  });

  test("a stat a hero can't use is worth nothing to them", () => {
    const state = createGuild();
    const quiver = piece("secondary", { arrowSaver: 0.3 });
    expect(fitChange(byWeapon(state, "sword"), quiver).gain).toBe(0);
    expect(fitChange(byWeapon(state, "bow"), quiver).gain).toBeGreaterThan(0);
  });

  test("heroes keep their kind of weapon", () => {
    const state = createGuild();
    const bow = createGearItem({ slot: "weapon", variant: "bow", rarity: "epic", tier: 5 });
    expect(canWear(byWeapon(state, "sword"), bow)).toBe(false);
    expect(canWear(byWeapon(state, "bow"), bow)).toBe(true);
    expect(fitTag(byWeapon(state, "sword"), bow)).toBeNull();
  });

  test("tags say upgrade, about the same or worse, and the picker lists the best first", () => {
    const state = createGuild();
    const hero = byWeapon(state, "sword");
    const better = createGearItem({ slot: "head", rarity: "rare", tier: 4 });
    const same = { ...hero.equipment.head, id: "copy" };
    const worse = piece("head", { defense: 1 });
    expect(fitTag(hero, better)).toMatchObject({ kind: "upgrade" });
    expect(fitTag(hero, better).text).toMatch(/^Upgrade \+\d+%$/);
    expect(fitTag(hero, same).kind).toBe("same");
    expect(fitTag(hero, worse).kind).toBe("worse");
    const ranked = rankForSlot(hero, [worse, same, better, piece("chest", { defense: 50 })], "head").map(({ item }) => item);
    expect(ranked).toEqual([better, same, worse]);
  });

  test("set bonuses count toward fit", () => {
    const state = createGuild();
    const hero = byWeapon(state, "sword");
    for (const slot of ["head"]) hero.equipment[slot] = piece(slot, { defense: 3 }, { set: "gravewatch" });
    const plain = piece("chest", { defense: 5, maxHp: 25 });
    const setPiece = piece("chest", { defense: 5, maxHp: 25 }, { set: "gravewatch" });
    expect(fitChange(hero, setPiece).gain).toBeGreaterThan(fitChange(hero, plain).gain);
  });
});

describe("armory: equip best", () => {
  test("one hero takes every upgrade; old gear goes to the vault; nobody else changes", () => {
    const state = createGuild();
    const hero = byWeapon(state, "sword");
    const helm = createGearItem({ slot: "head", rarity: "rare", tier: 3 });
    const sword = createGearItem({ slot: "weapon", variant: "sword", rarity: "rare", tier: 3 });
    const bow = createGearItem({ slot: "weapon", variant: "bow", rarity: "epic", tier: 5 });
    state.vault = [helm, sword, bow];
    const others = JSON.stringify(state.heroes.filter((entry) => entry !== hero));
    const before = JSON.stringify(state);
    const result = equipBest(state, id(hero));
    expect(result).toMatchObject({ ok: true, count: 2 });
    expect(JSON.stringify(state)).toBe(before);
    const after = result.state.heroes.find((entry) => id(entry) === id(hero));
    expect(after.equipment.head.id).toBe(helm.id);
    expect(after.equipment.weapon.id).toBe(sword.id);
    expect(result.state.vault.map((item) => item.id)).toEqual(expect.arrayContaining([bow.id, hero.equipment.head.id, hero.equipment.weapon.id]));
    expect(JSON.stringify(result.state.heroes.filter((entry) => id(entry) !== id(hero)))).toBe(others);
    expect(equipBest(result.state, id(hero))).toEqual({ ok: false, reason: "no_upgrades" });
  });

  test("heroes away on an expedition are left alone", () => {
    const state = createGuild();
    const hero = byWeapon(state, "bow");
    state.vault = [createGearItem({ slot: "head", rarity: "epic", tier: 4 })];
    state.expedition = { heroIds: [id(hero)], startedAt: T0 };
    expect(equipBest(state, id(hero))).toEqual({ ok: false, reason: "hero_away" });
    const party = equipBestParty(state);
    expect(party.ok).toBe(true);
    expect(party.state.heroes.find((entry) => id(entry) === id(hero)).equipment.head.id).toBe(hero.equipment.head.id);
  });

  test("the party share-out gives each piece to whoever gains most, and passes cast-offs on", () => {
    const state = createGuild();
    const [a, b] = [byWeapon(state, "sword"), byWeapon(state, "staff")];
    delete b.equipment.head;
    const great = createGearItem({ slot: "head", rarity: "epic", tier: 5 });
    state.vault = [great];
    const result = equipBestParty(state);
    expect(result.ok).toBe(true);
    const heads = Object.fromEntries(result.state.heroes.map((hero) => [id(hero), hero.equipment.head?.id]));
    // The bare-headed staff hero gains most from the great helm; they had no
    // helm to hand back, so the vault ends empty.
    expect(heads[id(b)]).toBe(great.id);
    expect(heads[id(a)]).toBe(a.equipment.head.id);
    expect(result.state.vault).toEqual([]);
  });

  test("upgradeFor names the heroes an item helps, best first", () => {
    const state = createGuild();
    const ring = piece("trinket", { critChance: 0.08, attack: 2 });
    const helped = upgradeFor(state, ring);
    expect(helped.length).toBe(state.heroes.length);
    expect(helped.map(({ change }) => change.share)).toEqual([...helped.map(({ change }) => change.share)].sort((x, y) => y - x));
  });
});

describe("armory: vault view and locks", () => {
  test("filters by slot and rarity and sorts four ways", () => {
    const state = createGuild();
    const hero = byWeapon(state, "bow");
    const rareHelm = createGearItem({ slot: "head", rarity: "rare", tier: 2 });
    const commonHelm = createGearItem({ slot: "head", rarity: "common", tier: 1 });
    const epicSword = createGearItem({ slot: "weapon", variant: "sword", rarity: "epic", tier: 4 });
    const ring = piece("trinket", { critChance: 0.06 });
    const vault = [rareHelm, commonHelm, epicSword, ring];
    expect(vaultView(vault, { slot: "head" })).toEqual([rareHelm, commonHelm]);
    expect(vaultView(vault, { rarity: "epic" })).toEqual([epicSword]);
    expect(vaultView(vault, { sort: "rarity" })[0]).toBe(epicSword);
    expect(vaultView(vault, { sort: "newest" })).toEqual([ring, epicSword, commonHelm, rareHelm]);
    expect(vaultView(vault, { sort: "value" })[0]).toBe(epicSword);
    // Best for the bow hero: the sword can't be worn, so it goes last.
    const fit = vaultView(vault, { sort: "fit", hero });
    expect(fit[fit.length - 1]).toBe(epicSword);
    expect(fitChange(hero, fit[0]).gain).toBeGreaterThanOrEqual(fitChange(hero, fit[1]).gain);
  });

  test("a locked piece can't be sold or salvaged until unlocked; worn gear can be locked too", () => {
    const state = createGuild();
    const helm = createGearItem({ slot: "head", rarity: "rare", tier: 2 });
    state.vault = [helm];
    const locked = toggleItemLock(state, helm.id).state;
    expect(locked.vault[0].locked).toBe(true);
    expect(state.vault[0].locked).toBeUndefined();
    expect(sellGear(locked, helm.id)).toEqual({ ok: false, reason: "locked" });
    expect(salvageGear(locked, helm.id)).toEqual({ ok: false, reason: "locked" });
    const unlocked = toggleItemLock(locked, helm.id).state;
    expect("locked" in unlocked.vault[0]).toBe(false);
    expect(sellGear(unlocked, helm.id).ok).toBe(true);
    const worn = state.heroes[0].equipment.weapon.id;
    expect(toggleItemLock(state, worn).state.heroes[0].equipment.weapon.locked).toBe(true);
    expect(toggleItemLock(state, "nope")).toEqual({ ok: false, reason: "unknown_item" });
  });
});

describe("armory: clearing junk", () => {
  // Pieces worse than what the starting heroes wear in that slot.
  const junkHelm = () => piece("head", { defense: 1 });
  test("junk is unprotected gear nobody needs, keeping one spare per slot", () => {
    const state = createGuild();
    const [a, b, c] = [junkHelm(), junkHelm(), junkHelm()];
    b.stats.defense = 2;
    const locked = { ...junkHelm(), locked: true };
    const forged = { ...junkHelm(), upgrade: 1 };
    const crystal = { ...junkHelm(), runes: ["ember-1"] };
    const setPiece = piece("head", { defense: 1 }, { set: "gravewatch" });
    const upgrade = createGearItem({ slot: "head", rarity: "epic", tier: 5 });
    const swordA = piece("weapon", { attack: 1 }, { variant: "sword" });
    const bowA = piece("weapon", { attack: 1 }, { variant: "bow" });
    state.vault = [a, b, c, locked, forged, crystal, setPiece, upgrade, swordA, bowA];
    const ids = junkItems(state).map((item) => item.id);
    // The protected helms already stand as spares, so all three plain ones go.
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
    expect(ids).not.toEqual(expect.arrayContaining([locked.id]));
    for (const kept of [locked, forged, crystal, setPiece, upgrade, swordA, bowA]) expect(ids).not.toContain(kept.id);
    // With nothing else for the slot, the best junk helm stays back as a spare.
    state.vault = [a, b, c];
    expect(junkItems(state).map((item) => item.id).sort()).toEqual([a.id, c.id].sort());
  });

  test("bulk sell or salvage pays the same as one by one and skips locked gear", () => {
    const state = createGuild();
    const items = [createGearItem({ slot: "head", rarity: "uncommon", tier: 2 }), createGearItem({ slot: "legs", rarity: "rare", tier: 3 })];
    const locked = { ...createGearItem({ slot: "arms", rarity: "rare", tier: 3 }), locked: true };
    state.vault = [...items, locked];
    const ids = [...items, locked].map((item) => item.id);
    const sold = clearGear(state, ids, "sell");
    expect(sold).toMatchObject({ ok: true, count: 2, gold: items[0].value + items[1].value, essence: 0 });
    expect(sold.state.gold).toBe(state.gold + sold.gold);
    expect(sold.state.vault.map((item) => item.id)).toEqual([locked.id]);
    const salvaged = clearGear(state, ids, "salvage");
    expect(salvaged.state.essence).toBe((state.essence || 0) + salvaged.essence);
    expect(salvaged.gold).toBe(0);
    expect(clearGear(state, [locked.id], "sell")).toEqual({ ok: false, reason: "nothing_to_clear" });
    expect(clearGear(state, ids, "burn")).toEqual({ ok: false, reason: "unknown_mode" });
  });
});

describe("armory: auto-clear", () => {
  // An expedition on its way home with this loot (completeExpedition banks it).
  function run(state, items) {
    state.expedition = { loot: { gold: 10, items }, regionId: "boneyard", heroIds: [], feed: [], stats: {}, morale: 1, wavesCleared: 0 };
    return state;
  }

  test("off by default: a returning expedition banks everything and the guild gains no setting", () => {
    const state = createGuild();
    expect("autoClear" in state).toBe(false);
    expect(autoClearSettings(state)).toEqual({ enabled: false, maxRarity: "uncommon", mode: "sell" });
    const loot = [piece("head", { defense: 1 })];
    run(state, loot);
    completeExpedition(state, "victory", 1);
    expect(state.vault.map((item) => item.id)).toContain(loot[0].id);
    expect("autoCleared" in state.lastReport).toBe(false);
  });

  test("on: clears new loot up to the chosen rarity that nobody needs, and reports it", () => {
    let state = createGuild();
    state = setAutoClear(state, { enabled: true, maxRarity: "uncommon", mode: "sell" }).state;
    const junk = piece("head", { defense: 1 });
    const junk2 = { ...piece("legs", { defense: 1 }), rarity: "uncommon" };
    const rare = { ...piece("arms", { defense: 1 }), rarity: "rare" };
    const setPiece = piece("chest", { defense: 1 }, { set: "gravewatch" });
    const upgrade = createGearItem({ slot: "head", rarity: "uncommon", tier: 6 });
    const old = piece("head", { defense: 1 });
    state.vault.push(old);
    run(state, [junk, junk2, rare, setPiece, upgrade]);
    const gold = state.gold;
    completeExpedition(state, "victory", 1);
    const left = state.vault.map((item) => item.id);
    expect(left).toEqual(expect.arrayContaining([old.id, rare.id, setPiece.id, upgrade.id]));
    expect(left).not.toContain(junk.id);
    expect(left).not.toContain(junk2.id);
    expect(state.lastReport.autoCleared).toEqual({ count: 2, gold: junk.value + junk2.value, essence: 0, mode: "sell" });
    expect(state.gold).toBe(gold + 10 + junk.value + junk2.value);
  });

  test("salvage mode pays essence; the setting survives a save and bad values are repaired", () => {
    let state = createGuild();
    state = setAutoClear(state, { enabled: true, mode: "salvage", maxRarity: "common" }).state;
    const items = [piece("head", { defense: 1 })];
    state.vault.push(...items);
    const result = applyAutoClear(state, items);
    expect(result).toMatchObject({ count: 1, gold: 0, mode: "salvage" });
    expect(result.essence).toBeGreaterThan(0);
    const loaded = parseGuild(JSON.parse(JSON.stringify(state)));
    expect(loaded.autoClear).toEqual({ enabled: true, maxRarity: "common", mode: "salvage" });
    const repaired = parseGuild({ ...JSON.parse(JSON.stringify(state)), autoClear: { enabled: "yes", maxRarity: "legendary", mode: 3 } });
    expect(repaired.autoClear).toEqual({ enabled: false, maxRarity: "uncommon", mode: "sell" });
    const none = parseGuild(JSON.parse(JSON.stringify(createGuild())));
    expect("autoClear" in none).toBe(false);
  });
});
