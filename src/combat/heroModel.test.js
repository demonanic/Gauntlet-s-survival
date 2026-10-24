import { createHeroModel, HERO_BASELINE, NEON_IDENTITY_COLORS, normalizeClasslessHero, serializeGameState, withHeroAppearance } from "./heroModel";

describe("classless hero model", () => {
  test("creates a stable identity without a permanent class and shares the approved baseline", () => {
    const first = createHeroModel({ id: "hero-a", name: "Aster" });
    const second = createHeroModel({ id: "hero-b", name: "Briar" });

    expect(first.identity).toEqual({ id: "hero-a", name: "Aster" });
    expect(first).not.toHaveProperty("cls");
    expect(first.identity).not.toHaveProperty("class");
    expect(first.combat).toEqual(second.combat);
    expect(first.progression).toEqual(second.progression);
    expect(first.combat).toMatchObject({
      hp: 300,
      maxHp: 300,
      stats: { attack: 10, defense: 10, agility: 10, intelligence: 10 },
      basicAttack: {
        damage: 16,
        intervalSeconds: 1.05,
        range: 220,
        rangeMode: "midline",
        movementSpeed: 155,
        targetPolicy: "nearest_valid_retain_reacquire",
        targetTieBreak: "stable_spawn_order",
        criticalChance: 0.05,
        criticalDamageMultiplier: 1.5,
        dodgeChance: 0.05,
      },
    });
    expect(HERO_BASELINE.sharedStrike).toMatchObject({
      id: "shared_strike",
      damageMultiplier: 1.5,
      damageCategory: "weapon",
      targetMode: "single_valid_target",
      cooldownSeconds: 12,
      resourceCost: 0,
      effects: {
        stun: false,
        slow: false,
        healing: false,
        areaDamage: false,
        summon: false,
        damageTypeConversion: false,
      },
    });
    expect(first.combat.capabilities.sharedStrike.damageMultiplier * first.combat.basicAttack.damage).toBe(24);
  });

  test("chooses a neon identity color once and retains it through serialization and normalization", () => {
    const created = createHeroModel({ id: "color-persist", rng: () => 0.51 });
    expect(NEON_IDENTITY_COLORS).toContain(created.appearance.identityColor);
    const saved = serializeGameState({ heroes: [created] });
    const loaded = normalizeClasslessHero(saved.heroes[0]);
    expect(loaded.appearance.identityColor).toBe(created.appearance.identityColor);
    expect(normalizeClasslessHero(loaded).appearance.identityColor).toBe(created.appearance.identityColor);
  });

  test("adds a color to a pre-color classless save without replacing existing visual fields", () => {
    const prior = createHeroModel({ id: "old-color-save", rng: () => 0 });
    delete prior.appearance.identityColor;
    prior.appearance.id = "existing-look";
    const migrated = normalizeClasslessHero(prior);
    expect(NEON_IDENTITY_COLORS).toContain(migrated.appearance.identityColor);
    expect(migrated.appearance.id).toBe("existing-look");
    expect(normalizeClasslessHero(prior).appearance.identityColor).toBe(migrated.appearance.identityColor);
    expect(prior.appearance).not.toHaveProperty("identityColor");
  });

  test("appearance changes do not affect combat or progression", () => {
    const hero = createHeroModel({ id: "appearance-test", appearanceId: "silhouette-a" });
    const result = withHeroAppearance(hero, "silhouette-b");

    expect(result.ok).toBe(true);
    expect(result.hero.appearance.id).toBe("silhouette-b");
    expect(result.hero.combat).toEqual(hero.combat);
    expect(result.hero.progression).toEqual(hero.progression);
    expect(hero.appearance.id).toBe("silhouette-a");
  });

  test("ignores absent and unknown legacy class fields", () => {
    expect(createHeroModel()).not.toHaveProperty("cls");
    const legacyShapedInput = createHeroModel({ id: "legacy-input", cls: "unrecognized-class", class: "mage" });
    expect(legacyShapedInput.identity.id).toBe("legacy-input");
    expect(legacyShapedInput).not.toHaveProperty("cls");
    expect(legacyShapedInput).not.toHaveProperty("class");
  });

  test("rejects invalid appearance changes without mutating the hero", () => {
    const hero = createHeroModel({ id: "immutable" });
    const before = JSON.stringify(hero);
    expect(withHeroAppearance(hero, " ")).toEqual({ ok: false, reason: "invalid_appearance" });
    expect(withHeroAppearance(null, "sprite")).toEqual({ ok: false, reason: "invalid_hero" });
    expect(JSON.stringify(hero)).toBe(before);
  });
});
