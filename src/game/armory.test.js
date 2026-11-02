import { createGuild } from "./guild";
import { createGearItem } from "./items";
import { canWear, equipBest, equipBestParty, fitChange, fitTag, heroFit, heroRole, rankForSlot, upgradeFor } from "./armory";

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
