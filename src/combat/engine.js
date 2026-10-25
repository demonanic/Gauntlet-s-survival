// Gauntlet encounter engine, vendored from Demonanic (demonanic/Demonanic,
// review/mobile-working-copy @ b0d430f) and trimmed to encounter mode: no castle,
// walls, gate, towers, barricades or kingdom buildings. A small enemy squad
// enters from the TOP and hunts the hero party at the BOTTOM.
// Simulation is separate from React; mutates a cloned `sim` fragment and
// accumulates XP gains, returned to the UI at wave end.
import { drawGearMarks, heroGearMarks } from "./heroLook";
import * as C from "./config";
import { heroDerived, makeSingleEnemy } from "./logic";
import { rollEquipmentDrop } from "./equipment";
import { unlockedAbilities, getAbility, MAGE_SPELLS } from "./perks";
import { HERO_BASELINE } from "./heroModel";
import { classlessCombatEffects, classlessMaxHp } from "./classlessCombatEffects";
import { getUnlockedClasslessAbilities, validateClasslessAbilityUse } from "./classlessAbilities";
import { HERO_SPRITE_ATLAS, selectHeroSpriteFrame } from "./heroSprite";
import { getEquippedHeroWeaponType, HERO_WEAPON_ASSETS } from "./heroWeapon";
import { CONSUMABLES, QUICK_ITEM_COOLDOWN, healThreshold, heroGearStats, heroUsesArrows, heroWeaponProfile } from "./gear";
import { petStats } from "./pets";
import { heroTraitEffects } from "./traits";
import { isNeonIdentityColor } from "./heroModel";
import { heroSpriteFilter } from "./heroPalette";
import { combatVfxAssetId, drawCombatVfx, getCombatVfxImage, projectileVfxAssetId } from "./combatVfx";

let heroSpriteImage = null;
const classlessWeaponImages = new Map();
const combatVfxImages = new Map();
function getHeroSpriteImage() {
  if (heroSpriteImage || typeof Image === "undefined") return heroSpriteImage;
  heroSpriteImage = new Image();
  heroSpriteImage.src = `${process.env.PUBLIC_URL || ""}${HERO_SPRITE_ATLAS.path}`;
  return heroSpriteImage;
}

function getClasslessWeaponImage(type) {
  if (!HERO_WEAPON_ASSETS[type] || typeof Image === "undefined") return null;
  if (classlessWeaponImages.has(type)) return classlessWeaponImages.get(type);
  const image = new Image();
  image.src = `${process.env.PUBLIC_URL || ""}${HERO_WEAPON_ASSETS[type]}`;
  classlessWeaponImages.set(type, image);
  return image;
}

function getCombatEffectImage(assetId) {
  return getCombatVfxImage(assetId, combatVfxImages);
}

const MAX_COMBAT_EFFECTS = 180;
const MAX_COMBAT_FLOATERS = 120;

export const W = 420, H = 760;
const HERO_Y = 0.85 * H;   // heroes line
const FLOOR_Y = H - 6;     // bottom edge of the arena
// The bible does not specify a Phantom Strike placement offset. Reuse the
// existing 30-unit hero/defender interaction radius as the reversible offset.
const PHANTOM_STRIKE_BEHIND_OFFSET = 30;

function isClasslessHero(hero) {
  return !!hero && !hero.cls && !!hero.combat?.basicAttack;
}

function classlessHeroRef(hero) {
  return {
    get id() { return hero.identity?.id; },
    get name() { return hero.identity?.name || "Hero"; },
    get level() { return hero.progression?.level || 1; },
    get hp() { return hero.combat.hp; },
    set hp(value) { hero.combat.hp = value; },
    get maxHp() { return hero.combat.maxHp; },
    get stats() { return hero.combat.stats; },
    get shield() { return Number(hero.combat.shield) || 0; },
    set shield(value) { hero.combat.shield = value; },
    get manual() { return !!hero.manual; },
    set manual(value) { hero.manual = !!value; },
  };
}

function classlessHeroDerived(hero) {
  const combat = hero.combat;
  const attack = combat.basicAttack;
  const stats = combat.stats;
  const effects = classlessCombatEffects(hero.progression?.ownedNodeIds);
  const gear = heroGearStats(hero);
  const traits = heroTraitEffects(hero);
  // Gauntlet: the equipped weapon decides range, melee vs ranged, and pace.
  const weapon = heroWeaponProfile(hero);
  // Gauntlet environments (darkness, cold, heat, toxins), already reduced by
  // the hero's resistance: see game/environment.js.
  const env = hero.environment || null;
  const baseDamage = attack.damage + ((Number(stats.attack) || 10) - HERO_BASELINE.stats.attack) + gear.attack;
  const attackDamage = baseDamage * (weapon?.damage ?? 1);
  return {
    maxHp: classlessMaxHp(hero),
    // Baseline attack stat 10 maps to the approved 16 weapon damage; each
    // allocated Attack point adds one weapon damage, matching legacy stat scaling.
    attack: attackDamage,
    damage: attackDamage,
    range: weapon?.range ?? attack.range,
    rangeMode: weapon?.rangeMode ?? attack.rangeMode,
    rate: (attack.intervalSeconds * (weapon?.intervalScale ?? 1) * (1 + (env?.attackSlow || 0)))
      / ((1 + effects.attackSpeed) * (1 + traits.attackSpeed) * (1 + gear.attackSpeed)),
    movementSpeed: attack.movementSpeed * (1 + traits.moveSpeed) * (1 - (env?.moveSlow || 0)),
    magic: false,
    damageType: null,
    defense: stats.defense + gear.defense + traits.defense,
    agility: stats.agility + gear.agility + traits.agility,
    intelligence: stats.intelligence,
    critChance: Math.min(0.5, attack.criticalChance + effects.critChance + gear.critChance + traits.critChance
      + ((weapon?.rangeMode ?? attack.rangeMode) === "midline" ? traits.rangedCrit : 0)),
    critMult: Math.min(3, attack.criticalDamageMultiplier + effects.critDamage + gear.critDamage + traits.critDamage),
    dodge: C.dodgeChance(stats.agility + gear.agility + traits.agility),
    lowHpDodge: 0,
    moveSpeedMultiplier: 1,
    abilityDamageMultiplier: 1,
    perkEffects: {},
    cooldownMultiplier: 1 - effects.cooldownReduction,
    damageReduction: effects.damageReduction,
    regeneration: effects.regeneration,
    regenerationBelowHalf: effects.regenerationBelowHalf,
    evasion: effects.evasion,
    fullHpEvasion: effects.fullHpEvasion,
    lastStand: effects.lastStand,
    lifesteal: effects.lifesteal + gear.lifesteal,
    decoyChance: effects.decoyChance,
    classlessEffects: effects,
    traits,
    // Gauntlet gear specials (thorns, burn, chill, cleave, volley, revive, ...).
    gear,
    env,
    usesArrows: heroUsesArrows(hero),
    bloodPriceBonus: effects.bloodPriceBonus,
    bloodPriceCost: effects.bloodPriceCost,
    color: hero.appearance?.identityColor || "#22D3EE",
    classless: true,
  };
}

function heroMovementSpeed(hero, legacyBase, currentTime, applyLegacyModifiers = false) {
  if (hero.classless) return hero.d.movementSpeed;
  const modifier = applyLegacyModifiers
    ? hero.d.moveSpeedMultiplier * (hero.speedRushUntil > currentTime ? 1.5 : 1)
    : 1;
  return legacyBase * modifier;
}

const LANES = 5;
const ENDLESS_WAVE_BREAK_SECONDS = 3;
// Enemy body radii for collisions (bosses and elites need more room).
// Bulwarks: the share of a hit a Bulwark in the line of fire takes, and the
// damage reduction for allies standing beside one.
const BULWARK_COVER = 0.5;
const BULWARK_GUARD = 0.1;
const BULWARK_GUARD_RADIUS = 60;
// Sappers sheltering behind a Bulwark break cover inside this range.
const SAPPER_SPRINT_RANGE = 110;
const ENEMY_BODY_RADIUS = (e) => (e.boss ? 29 : e.tier === "elite" ? 20 : 14);
// Heroes this close to a boss are in melee with it: it won't lob bombs at them.
const BOSS_MELEE_REACH = 90;
function laneX(i) { return (W / LANES) * (i + 0.5); }

export const LAYOUT = { W, H, HERO_Y, FLOOR_Y };

export class Engine {
  constructor(canvas, sim, wave, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sim = sim;              // cloned fragment (mutated)
    this.wave = wave;           // {enemies,total,...}
    this.cb = callbacks;
    this.speed = 1;
    this.running = false;
    this.last = 0;
    this.spawnQueue = [...wave.enemies];
    this.spawnTimer = 0;
    this.active = [];           // live enemies
    this.projectiles = [];
    this.actionCompletions = [];
    this.fallen = [];           // Gauntlet: corpses a necromancer can raise
    this.floaters = [];
    this.effects = [];
    this.killed = 0;
    this.wavesCleared = 0;
    this.xpGains = { heroes: {}, towers: {} };
    this.sim.vault = Array.isArray(this.sim.vault) ? this.sim.vault : [];
    this.time = 0;
    this.ended = false;
    this.selectedHero = null;
    this.targetingHero = null;
    this.forcedDefeat = false;

    // hero runtime
    const n = sim.heroes.length || 1;
    this.heroes = sim.heroes.map((h, i) => {
      const classless = isClasslessHero(h);
      const ref = classless ? classlessHeroRef(h) : h;
      const d = classless ? classlessHeroDerived(h) : heroDerived(h);
      const x = W * ((i + 0.5) / n);
      return {
        i,
        ref,
        model: h,
        classless,
        x,
        y: HERO_Y,
        home: { x, y: HERO_Y },
        d,
        cd: 0,
        alive: ref.hp > 0,
        protect: 0,
        manual: !!h.manual,
        manualTarget: null,
        manualPoint: null,
        rallyPoint: null,
        rallyHold: false,
        retreating: false,
        reactiveUntil: 0,
        reactiveAlly: null,
        reactiveReason: null,
        abilityCooldowns: {},
        spellCooldowns: {},
        visualActionKind: null,
        visualActionStartedAt: 0,
        visualActionUntil: 0,
        hitUntil: 0,
        lastDrawPosition: { x, y: HERO_Y },
        warCryUntil: 0,
        warCryAttackSpeedBonus: 0,
        interposeUntil: 0,
        interposeReduction: 0,
        interposeTarget: null,
        untargetableUntil: 0,
        quickCd: 0,
        ammoShots: 0,
        ammoBonus: 0,
        maxMana: classless ? 0 : Math.round(70 + (h.level || 1) * 5 + (d.intelligence || 10) * 1.5),
        mana: classless ? 0 : Math.round(70 + (h.level || 1) * 5 + (d.intelligence || 10) * 1.5),
        currentTarget: null,
        speedRushUntil: 0,
        classlessCombatState: classless ? { lastDamageAt: 0, sustainSecond: -1, sustainRestored: 0,
          nextRegenAt: 5, lastStandUntil: 0, lastStandReadyAt: 0, survivalUntil: 0,
          survivalReadyAt: 0, covenantUntil: 0, decoy: false, mirrorReadyAt: 0,
          nextDisruptAt: 0, nextRootAt: 0, lastDealtAt: 0, momentumTarget: null,
          momentumStacks: 0, ambushTargets: new Set(), vanishDamagePending: 0,
          echoReadyAt: 0 } : null,
      };
    });

    // Gauntlet familiars: one per hero that has a pet. They can't be hurt.
    this.pets = this.heroes.filter((h) => h.classless && h.model.pet).map((h) => {
      const stats = petStats(h.model.pet, h.model.progression?.level || 1);
      h.petGuard = stats?.guard || 0;
      return stats && { owner: h, name: h.model.pet.name, stats, x: h.x + 18, y: h.y + 14, cd: 1, supportCd: stats.support?.interval || 0, target: null };
    }).filter(Boolean);

    // Encounters have no castle defenses. Shared targeting helpers still
    // iterate these, so they stay as empty arrays.
    this.towers = [];
    this.barricades = [];
  }

  start() {
    this.running = true;
    this.last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }
  stop() { this.running = false; }
  setSpeed(s) { this.speed = s; }

  setSelectedHero(index) {
    this.selectedHero = Number.isInteger(index) ? index : null;
    return true;
  }

  setTargetSelection(index) {
    const h = this.heroes[index];
    this.targetingHero = h?.alive && (h.classless ? h.d.rangeMode === "midline" : h.d.range >= 130) ? index : null;
    return this.targetingHero !== null;
  }

  getRangedTargetStatus(index) {
    const h = this.heroes[index];
    if (!h?.alive || !(h.classless ? h.d.rangeMode === "midline" : h.d.range >= 130)) return null;
    const damageType = h.classless ? null : h.ref.cls === "mage" ? C.DAMAGE_TYPES.ARCANE
      : h.ref.cls === "archer" ? C.DAMAGE_TYPES.ARCHER_RANGED
      : h.ref.cls === "rouge" ? C.DAMAGE_TYPES.ROUGE_MELEE
      : C.DAMAGE_TYPES.KNIGHT_MELEE;
    const targets = this.active
      .filter((enemy) => h.classless ? this._isValidClasslessTarget(h, enemy) : this._isValidRangedTarget(h, enemy, damageType))
      .map((enemy) => ({
        type: enemy.type,
        name: enemy.name || enemy.type,
        hp: Math.max(0, Math.round(enemy.hp)),
        maxHp: Math.max(1, Math.round(enemy.maxHp)),
        distance: Math.round(Math.hypot(enemy.x - h.x, enemy.y - h.y)),
        enemy,
      }));
    return { heroName: h.ref.name, range: Math.round(h.d.range), targets };
  }

  _isValidRangedTarget(h, enemy, damageType) {
    return enemy?.hp > 0 &&
      Math.hypot(enemy.x - h.x, enemy.y - h.y) <= h.d.range &&
      C.affinityMultiplier(enemy, damageType) > 0 &&
      !(h.d.magic && enemy.magicImmune);
  }

  _isValidClasslessTarget(h, enemy) {
    return !!h?.classless && !!enemy && enemy.hp > 0 && this.active.includes(enemy) &&
      Math.hypot(enemy.x - h.x, enemy.y - h.y) <= h.d.range;
  }

  _isHeroUntargetable(hero) {
    return !!hero && hero.untargetableUntil > this.time;
  }

  getRangedTargetAt(index, x, y) {
    const status = this.getRangedTargetStatus(index);
    if (!status) return null;
    return status.targets
      .filter((target) => Math.hypot(target.enemy.x - x, target.enemy.y - y) <= 80)
      .sort((a, b) => Math.hypot(a.enemy.x - x, a.enemy.y - y) - Math.hypot(b.enemy.x - x, b.enemy.y - y))[0] || null;
  }

  getHeroAbilityStatus(index) {
    const h = this.heroes[index];
    if (!h) return [];
    if (h.classless) {
      const capability = HERO_BASELINE.sharedStrike;
      const cooldown = Math.max(0, h.abilityCooldowns[capability.id] || 0);
      const target = this._selectTarget(h);
      const baselineDamage = Math.round(h.d.attack * capability.damageMultiplier * (1 + h.d.classlessEffects.weaponDamage));
      const sharedStrike = { id: capability.id, name: "Shared Strike",
        desc: `${baselineDamage} raw direct-hit weapon damage at baseline (150%); 12s cooldown; no resource cost.`,
        damage: baselineDamage, cooldownSeconds: capability.cooldownSeconds * h.d.cooldownMultiplier,
        resourceCost: capability.resourceCost, color: h.d.color,
        cooldown, available: h.alive && cooldown <= 0 && !!target && this._classlessCanPayActiveCost(h), targetMode: "enemy", range: h.d.range,
        reason: !h.alive ? "unavailable" : cooldown > 0 ? "cooldown" : !this._classlessCanPayActiveCost(h) ? "health_cost" : target ? null : "no_target" };
      return [sharedStrike, ...getUnlockedClasslessAbilities(h.model).map((definition) => {
        const abilityCooldown = Math.max(0, h.abilityCooldowns[definition.id] || 0);
        const inRangeTargets = definition.requiresTarget
          ? this.active.filter((enemy) => this._isValidClasslessTarget(h, enemy)) : [];
        const validTargets = inRangeTargets.filter((enemy) => !Number.isFinite(definition.conditionalTargetHpBelow) ||
          enemy.hp / Math.max(1, enemy.maxHp) < definition.conditionalTargetHpBelow);
        const validationTarget = validTargets[0] || inRangeTargets[0] || null;
        const validation = validateClasslessAbilityUse({ hero: { ...h.model, alive: h.alive, protect: h.protect, retreating: h.retreating },
          abilityId: definition.id, cooldown: abilityCooldown, battleActive: !this.ended,
          target: validationTarget, targetValid: !definition.requiresTarget || !!validationTarget });
        const cooldownSeconds = definition.cooldownSeconds * h.d.cooldownMultiplier;
        const activeRemaining = definition.effect === "attack_speed_aura"
          ? Math.max(0, h.warCryUntil - this.time)
          : definition.effect === "interpose" ? Math.max(0, h.interposeTarget?.interposeUntil - this.time)
            : definition.effect === "crimson_covenant" ? Math.max(0, h.classlessCombatState.covenantUntil - this.time)
              : ["untargetable", "vanish"].includes(definition.effect) ? Math.max(0, h.untargetableUntil - this.time) : 0;
        const damage = Number.isFinite(definition.damageMultiplier)
          ? Math.round(h.d.attack * definition.damageMultiplier) : undefined;
        const canPayHealthCost = this._classlessCanPayActiveCost(h);
        return { id: definition.id, name: definition.name, desc: definition.description,
          cooldown: abilityCooldown, cooldownSeconds, resourceCost: definition.resourceCost,
          damage, color: h.d.color, active: activeRemaining > 0, activeRemaining,
          available: validation.ok && canPayHealthCost, targetMode: definition.targetMode,
          range: definition.rangeMode === "hero_attack_range" ? h.d.range : definition.range,
          radius: definition.adjacentRadius, reason: !canPayHealthCost ? "health_cost" : validation.reason };
      })];
    }
    return unlockedAbilities(h.ref).map((a) => {
      const cooldown = Math.max(0, h.abilityCooldowns[a.id] || 0);
      const hasTarget = h.alive && this._hasAbilityTarget(h, a);
      return {
        id: a.id,
        name: a.name,
        desc: a.desc,
        color: a.color,
        cooldown,
        available: h.alive && cooldown <= 0 && hasTarget,
        targetMode: ["shield_bash", "backstab", "life_steal", "piercing_shot", "focus_volley"].includes(a.effect)
          ? "enemy" : a.effect === "firestorm" ? "area" : null,
        range: a.effect === "shield_bash" ? 190
          : ["backstab", "life_steal"].includes(a.effect) ? 300 : Math.round(h.d.range),
        radius: a.effect === "firestorm" ? 70 : null,
        reason: !h.alive ? "unavailable" : cooldown > 0 ? "cooldown" : hasTarget ? null : "no_target",
      };
    });
  }

  _classlessCanPayActiveCost(hero) {
    if (!hero?.classless || !(hero.d.bloodPriceCost > 0)) return true;
    return hero.ref.hp - hero.ref.hp * hero.d.bloodPriceCost >= 1;
  }

  _chargeClasslessActiveCost(hero, hpBefore) {
    const cost = hero.d.bloodPriceCost > 0 ? hpBefore * hero.d.bloodPriceCost : 0;
    if (cost > 0) {
      hero.ref.hp = Math.max(1, hero.ref.hp - cost);
      this._float(hero.x, hero.y - 20, `-${Math.round(cost)} HP`, "#DC2626");
      this.effects.push({ kind: "blood_price", x: hero.x, y: hero.y, r: 20, life: 0.42, color: "#DC2626" });
    }
  }

  getHeroAbilityTargets(index, abilityId) {
    const status = this.getHeroAbilityStatus(index).find((item) => item.id === abilityId);
    const h = this.heroes[index];
    if (!status || !h || status.targetMode !== "enemy") return [];
    if (h.classless) {
      const ability = abilityId === HERO_BASELINE.sharedStrike.id ? null :
        getUnlockedClasslessAbilities(h.model).find((item) => item.id === abilityId);
      return this.active.filter((enemy) => this._isValidClasslessTarget(h, enemy) &&
        (!ability || !Number.isFinite(ability.conditionalTargetHpBelow) ||
          enemy.hp / Math.max(1, enemy.maxHp) < ability.conditionalTargetHpBelow)).map((enemy) => ({
        type: enemy.type, name: enemy.name || enemy.type, hp: Math.max(0, Math.round(enemy.hp)),
        maxHp: Math.max(1, Math.round(enemy.maxHp)), distance: Math.round(Math.hypot(enemy.x - h.x, enemy.y - h.y)), enemy,
      }));
    }
    const damageType = h.ref.cls === "knight" ? C.DAMAGE_TYPES.KNIGHT_MELEE
      : h.ref.cls === "rouge" ? C.DAMAGE_TYPES.ROUGE_MELEE
      : h.ref.cls === "archer" ? C.DAMAGE_TYPES.ARCHER_RANGED
      : C.DAMAGE_TYPES.ARCANE;
    return this.active.filter((enemy) =>
      enemy?.hp > 0 &&
      Math.hypot(enemy.x - h.x, enemy.y - h.y) <= status.range &&
      C.affinityMultiplier(enemy, damageType) > 0 &&
      !(h.d.magic && enemy.magicImmune)
    ).map((enemy) => ({
      type: enemy.type,
      name: enemy.name || enemy.type,
      hp: Math.max(0, Math.round(enemy.hp)),
      maxHp: Math.max(1, Math.round(enemy.maxHp)),
      distance: Math.round(Math.hypot(enemy.x - h.x, enemy.y - h.y)),
      enemy,
    }));
  }

  getHeroAbilityTargetAt(index, abilityId, x, y) {
    return this.getHeroAbilityTargets(index, abilityId)
      .filter((target) => Math.hypot(target.enemy.x - x, target.enemy.y - y) <= 80)
      .sort((a, b) => Math.hypot(a.enemy.x - x, a.enemy.y - y) - Math.hypot(b.enemy.x - x, b.enemy.y - y))[0] || null;
  }

  getHeroAbilityAreaPreview(index, abilityId, x, y) {
    const status = this.getHeroAbilityStatus(index).find((item) => item.id === abilityId);
    const h = this.heroes[index];
    if (!status || status.targetMode !== "area" || !h || Math.hypot(x - h.x, y - h.y) > status.range) {
      return { valid: false, targets: [] };
    }
    const damageType = h.ref.cls === "mage" ? C.DAMAGE_TYPES.ARCANE : C.DAMAGE_TYPES.KNIGHT_MELEE;
    const targets = this.active.filter((enemy) => enemy.hp > 0 &&
      Math.hypot(enemy.x - x, enemy.y - y) <= status.radius &&
      C.affinityMultiplier(enemy, damageType) > 0 &&
      !(h.d.magic && enemy.magicImmune));
    return { valid: targets.length > 0, targets };
  }

  _hasAbilityTarget(h, ability) {
    const damageType = h.ref.cls === "knight" ? C.DAMAGE_TYPES.KNIGHT_MELEE
      : h.ref.cls === "rouge" ? C.DAMAGE_TYPES.ROUGE_MELEE
      : h.ref.cls === "archer" ? C.DAMAGE_TYPES.ARCHER_RANGED
      : C.DAMAGE_TYPES.ARCANE;
    const canDamage = (enemy) => enemy?.hp > 0 && C.affinityMultiplier(enemy, damageType) > 0;
    switch (ability.effect) {
      case "shield_bash":
        return canDamage(this._nearestEnemy(h.x, h.y, 190));
      case "backstab":
        return canDamage(this._selectTarget(h) || this._nearestEnemy(h.x, h.y, 300));
      case "life_steal":
        return canDamage(this._nearestEnemy(h.x, h.y, 300));
      case "firestorm": {
        const target = this._nearestEnemy(h.x, h.y, h.d.range);
        return !!target && this.active.some((enemy) => canDamage(enemy) && Math.hypot(enemy.x - target.x, enemy.y - target.y) <= 70);
      }
      case "mend":
        return this.heroes.some((ally) => ally.alive && ally !== h && ally.ref.hp < ally.d.maxHp);
      case "piercing_shot": {
        const target = this._selectTarget(h);
        return !!target && [target, ...this.active.filter((enemy) => enemy !== target && Math.hypot(enemy.x - target.x, enemy.y - target.y) <= 48).slice(0, 2)].some(canDamage);
      }
      case "focus_volley":
        return canDamage(this._selectTarget(h));
      default:
        return true;
    }
  }

  getHeroSpellStatus(index) {
    const h = this.heroes[index];
    if (!h || h.ref.cls !== "mage") return [];
    const level = Math.max(1, Number(h.ref.level) || 1);
    const intelligence = Math.max(0, Number(h.d.intelligence) || 0);
    const equippedIds = Array.isArray(h.ref.equippedSpells) ? h.ref.equippedSpells : [];
    const learned = (h.ref.spellbook || []).filter((spell) => equippedIds.includes(spell.id)).map((spell) => ({
      ...spell, researched: true, short: String(spell.name || "SPELL").toUpperCase(),
      color: ({ fire: "#FF6600", ice: "#00F3FF", poison: "#39FF14", electric: "#FFE600", mind: "#A855F7" })[spell.element] || "#E879F9",
      mana: Number(spell.manaCost || spell.baseMana) || 15,
      cooldown: 7, range: 340, power: Number(spell.strength || spell.basePower) || 0.8,
    }));
    const spells = learned.length ? learned : MAGE_SPELLS;
    return spells.map((spell) => {
      const cost = Math.max(8, Math.round((spell.mana || spell.manaCost || spell.baseMana || 15) * (1 - Math.min(0.25, Math.max(0, level - 1) * 0.01))));
      const cooldown = Math.max(0, h.spellCooldowns[spell.id] || 0);
      return { ...spell, cost, cooldown, mana: Math.round(h.mana), maxMana: h.maxMana,
        level, damage: Math.round((h.d.attack || 0) * (spell.power || spell.strength || spell.basePower || 1) * (1 + Math.max(0, level - 1) * 0.06 + intelligence * 0.012)),
        targetMode: spell.effect === "area" ? "area"
          : spell.researched || ["fireball", "chain_lightning"].includes(spell.id) ? "enemy" : null,
        available: h.alive && cooldown <= 0 && h.mana >= cost };
    });
  }

  getMageSpellTargets(index, spellId) {
    const h = this.heroes[index];
    const spell = this.getHeroSpellStatus(index).find((item) => item.id === spellId);
    if (!h || !spell || spell.targetMode !== "enemy") return [];
    const damageType = ({ fire: C.DAMAGE_TYPES.FIRE, ice: C.DAMAGE_TYPES.FROST, electric: C.DAMAGE_TYPES.LIGHTNING, poison: C.DAMAGE_TYPES.POISON })[spell.element]
      || C.DAMAGE_TYPES.ARCANE;
    return this.active.filter((enemy) => enemy?.hp > 0 &&
      Math.hypot(enemy.x - h.x, enemy.y - h.y) <= spell.range &&
      C.affinityMultiplier(enemy, damageType) > 0 &&
      !(h.d.magic && enemy.magicImmune)
    ).map((enemy) => ({
      type: enemy.type,
      name: enemy.name || enemy.type,
      hp: Math.max(0, Math.round(enemy.hp)),
      maxHp: Math.max(1, Math.round(enemy.maxHp)),
      distance: Math.round(Math.hypot(enemy.x - h.x, enemy.y - h.y)),
      enemy,
    }));
  }

  getMageSpellTargetAt(index, spellId, x, y) {
    return this.getMageSpellTargets(index, spellId)
      .filter((target) => Math.hypot(target.enemy.x - x, target.enemy.y - y) <= 80)
      .sort((a, b) => Math.hypot(a.enemy.x - x, a.enemy.y - y) - Math.hypot(b.enemy.x - x, b.enemy.y - y))[0] || null;
  }

  getMageSpellAreaPreview(index, spellId, x, y) {
    const h = this.heroes[index];
    const spell = this.getHeroSpellStatus(index).find((item) => item.id === spellId);
    if (!h || !spell || spell.targetMode !== "area" || Math.hypot(x - h.x, y - h.y) > spell.range) {
      return { valid: false, targets: [] };
    }
    const radius = spell.researched ? 95 : spell.radius;
    const damageType = ({ fire: C.DAMAGE_TYPES.FIRE, ice: C.DAMAGE_TYPES.FROST, electric: C.DAMAGE_TYPES.LIGHTNING, poison: C.DAMAGE_TYPES.POISON })[spell.element];
    const targets = this.active.filter((enemy) => enemy.hp > 0 &&
      Math.hypot(enemy.x - x, enemy.y - y) <= radius &&
      (!damageType || C.affinityMultiplier(enemy, damageType) > 0) &&
      !(h.d.magic && enemy.magicImmune));
    return { valid: targets.length > 0, targets, radius };
  }

  castMageSpell(index, spellId, targetOrPoint = null) {
    const h = this.heroes[index];
    const customSpell = (h?.ref?.equippedSpells || []).includes(spellId) ? (h.ref.spellbook || []).find((item) => item.id === spellId) : null;
    const spell = customSpell ? { ...customSpell, researched: true, short: String(customSpell.name || "SPELL").toUpperCase(), color: ({ fire: "#FF6600", ice: "#00F3FF", poison: "#39FF14", electric: "#FFE600", mind: "#A855F7" })[customSpell.element] || "#E879F9", mana: Number(customSpell.manaCost || customSpell.baseMana) || 15, cooldown: 7, range: 340, power: Number(customSpell.strength || customSpell.basePower) || 0.8 } : MAGE_SPELLS.find((item) => item.id === spellId);
    if (!h || !h.alive || h.ref.cls !== "mage" || !spell) return false;
    const status = this.getHeroSpellStatus(index).find((item) => item.id === spellId);
    if (!status || !status.available) return false;
    if (targetOrPoint?.enemy && !this.getMageSpellTargets(index, spellId).some((item) => item.enemy === targetOrPoint.enemy)) return false;
    if (spell.effect === "area" && targetOrPoint && Number.isFinite(targetOrPoint.x) &&
      !this.getMageSpellAreaPreview(index, spellId, targetOrPoint.x, targetOrPoint.y).valid) return false;
    const target = targetOrPoint?.enemy || this._nearestEnemy(h.x, h.y, spell.range);
    if (spell.id !== "arcane_ward" && !target && !(spell.effect === "area" && targetOrPoint && Number.isFinite(targetOrPoint.x))) return false;
    const effectStart = this.effects.length;
    let used = false;
    if (spell.researched) {
      const elementType = ({ fire: C.DAMAGE_TYPES.FIRE, ice: C.DAMAGE_TYPES.FROST, electric: C.DAMAGE_TYPES.LIGHTNING, poison: C.DAMAGE_TYPES.POISON })[spell.element];
      const victims = spell.effect === "area"
        ? this.active.filter((enemy) => enemy.hp > 0 && target &&
          Math.hypot(enemy.x - (targetOrPoint && Number.isFinite(targetOrPoint.x) ? targetOrPoint.x : target.x),
            enemy.y - (targetOrPoint && Number.isFinite(targetOrPoint.y) ? targetOrPoint.y : target.y)) <= 95)
        : [target];
      for (const enemy of victims) {
        const scale = spell.effect === "area" ? 0.72 : spell.effect === "time" ? 0.82 : 1;
        const affinity = elementType ? C.affinityMultiplier(enemy, elementType) : 1;
        const damage = Math.max(0, status.damage * scale * h.d.abilityDamageMultiplier * affinity);
        if (damage > 0) {
          enemy.hp = Math.max(0, enemy.hp - damage);
          enemy.dmgBy["H" + h.i] = (enemy.dmgBy["H" + h.i] || 0) + damage;
          if (spell.effect === "time") {
            enemy.slowUntil = Math.max(enemy.slowUntil || 0, this.time + 2.5);
            enemy.slowMultiplier = spell.element === "ice" ? 0.45 : 0.75;
          }
          this._float(enemy.x, enemy.y - 5, spell.name.toUpperCase() + " " + Math.round(damage), spell.color);
          this.effects.push({ kind: "hit", x: enemy.x, y: enemy.y, r: spell.effect === "area" ? 20 : 14, life: 0.45, color: spell.color, crit: false });
          if (enemy.hp <= 0) this._killEnemy(enemy, "H" + h.i);
          used = true;
        }
      }
    } else if (spell.id === "fireball") {
      const damage = status.damage * h.d.abilityDamageMultiplier * C.affinityMultiplier(target, C.DAMAGE_TYPES.FIRE);
      if (damage > 0) {
        target.hp = Math.max(0, target.hp - damage);
        target.dmgBy["H" + h.i] = (target.dmgBy["H" + h.i] || 0) + damage;
        this._float(target.x, target.y - 5, "FIREBALL " + Math.round(damage), spell.color);
        this.effects.push({ kind: "hit", x: target.x, y: target.y, r: 25, life: 0.45, color: spell.color, crit: false });
        if (target.hp <= 0) this._killEnemy(target, "H" + h.i);
        used = true;
      } else this._float(target.x, target.y - 5, "IMMUNE", "#39FF14");
    } else if (spell.id === "frost_nova") {
      const victims = this.active.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - h.x, enemy.y - h.y) <= spell.radius);
      for (const enemy of victims) {
        const damage = status.damage * h.d.abilityDamageMultiplier * C.affinityMultiplier(enemy, C.DAMAGE_TYPES.FROST);
        if (damage > 0) {
          enemy.hp = Math.max(0, enemy.hp - damage);
          enemy.dmgBy["H" + h.i] = (enemy.dmgBy["H" + h.i] || 0) + damage;
          enemy.slowUntil = Math.max(enemy.slowUntil || 0, this.time + spell.slow);
          enemy.slowMultiplier = 0.45;
          this._float(enemy.x, enemy.y - 4, "FROST " + Math.round(damage), spell.color);
          this.effects.push({ kind: "hit", x: enemy.x, y: enemy.y, r: 15, life: 0.38, color: spell.color, crit: false });
          if (enemy.hp <= 0) this._killEnemy(enemy, "H" + h.i);
          used = true;
        }
      }
      if (used) this.effects.push({ kind: "spell_area", x: h.x, y: h.y, r: spell.radius, life: 0.65, color: spell.color, vfxSize: 52 });
    } else if (spell.id === "chain_lightning") {
      let current = target;
      const hit = new Set();
      for (let jump = 0; jump < spell.jumps && current; jump++) {
        hit.add(current);
        const damage = status.damage * Math.pow(0.72, jump) * h.d.abilityDamageMultiplier * C.affinityMultiplier(current, C.DAMAGE_TYPES.LIGHTNING);
        if (damage > 0) {
          current.hp = Math.max(0, current.hp - damage);
          current.dmgBy["H" + h.i] = (current.dmgBy["H" + h.i] || 0) + damage;
          this._float(current.x, current.y - 4, "ARC " + Math.round(damage), spell.color);
          if (current.hp <= 0) this._killEnemy(current, "H" + h.i);
          used = true;
        }
        this.effects.push({ kind: "hit", x: current.x, y: current.y, r: 19, life: 0.35, color: spell.color, crit: false });
        const from = current;
        current = this.active.filter((enemy) => enemy.hp > 0 && !hit.has(enemy))
          .sort((a, b) => Math.hypot(a.x-from.x,a.y-from.y)-Math.hypot(b.x-from.x,b.y-from.y))
          .find((enemy) => Math.hypot(enemy.x-from.x, enemy.y-from.y) <= 105) || null;
      }
    } else if (spell.id === "arcane_ward") {
      const allies = this.heroes.filter((ally) => ally.alive && Math.hypot(ally.x-h.x, ally.y-h.y) <= spell.range)
        .sort((a,b) => (a.ref.hp/a.d.maxHp)-(b.ref.hp/b.d.maxHp)).slice(0,2);
      if (!allies.some((ally) => ally === h)) allies.unshift(h);
      for (const ally of allies.slice(0,2)) {
        const amount = Math.round(ally.d.maxHp * Math.min(0.38, spell.power + Math.max(0, status.level - 1) * 0.008));
        ally.ref.shield = Math.min(ally.d.maxHp * 0.45, (ally.ref.shield || 0) + amount);
        this._float(ally.x, ally.y - 20, "+" + amount + " WARD", spell.color);
        this.effects.push({ kind: "shield", x: ally.x, y: ally.y, r: 24, life: 0.5, color: spell.color });
      }
      used = true;
    }
    if (!used) return false;
    this.effects.push({ kind: "spell_cast", x: h.x, y: h.y, life: 0.36, color: spell.color, vfxSize: 48 });
    h.mana = Math.max(0, h.mana - status.cost);
    h.spellCooldowns[spell.id] = Math.max(2, spell.cooldown * (1 - Math.min(0.2, Math.max(0, status.level - 1) * 0.008)));
    this._float(h.x, h.y - 28, spell.short, spell.color);
    this.actionCompletions.push({
      index,
      result: "completed",
      effects: this.effects.slice(effectStart),
    });
    return true;
  }

  useHeroAbility(index, abilityId, targetOrPoint = null) {
    const h = this.heroes[index];
    if (h?.classless) return abilityId === HERO_BASELINE.sharedStrike.id
      ? this.useSharedStrike(index, targetOrPoint?.enemy || targetOrPoint)
      : this.executeClasslessAbility(index, abilityId, targetOrPoint);
    const ability = getAbility(h?.ref, abilityId);
    if (!h || !h.alive || !ability) return false;
    const remaining = h.abilityCooldowns[ability.id] || 0;
    if (remaining > 0 || !this._hasAbilityTarget(h, ability)) return false;
    const target = targetOrPoint?.enemy || null;
    if (target && !this.getHeroAbilityTargets(index, abilityId).some((item) => item.enemy === target)) return false;
    if (ability.effect === "firestorm" && targetOrPoint && Number.isFinite(targetOrPoint.x) &&
      !this.getHeroAbilityAreaPreview(index, abilityId, targetOrPoint.x, targetOrPoint.y).valid) return false;

    let used = false;
    switch (ability.effect) {
      case "shield_bash": {
        const victim = target || this._nearestEnemy(h.x, h.y, 190);
        if (victim) {
          used = this._applyAbilityDamage(h, victim, 2.0 * h.d.shieldAbilityDamageMultiplier, "SHIELD BASH", 2);
        }
        break;
      }
      case "fortress_pulse": {
        for (const ally of this.heroes) {
          if (!ally.alive) continue;
          const dist = Math.hypot(ally.x - h.x, ally.y - h.y);
          if (dist <= 150) {
            const cap = ally.d.maxHp * 0.30 * ally.d.barrierMultiplier;
            ally.ref.shield = Math.min(cap, (ally.ref.shield || 0) + ally.d.maxHp * 0.20);
            this._float(ally.x, ally.y - 22, "+FORTIFY", "#00F3FF");
            this.effects.push({ x: ally.x, y: ally.y, r: 24, life: 0.45, color: "#00F3FF" });
          }
        }
        used = true;
        break;
      }
      case "speed_rush": {
        h.speedRushUntil = this.time + 5;
        const target = this._nearestEnemy(h.x, h.y, 340);
        if (target) {
          h.manualTarget = target;
          h.manual = true;
          h.ref.manual = true;
        }
        this._float(h.x, h.y - 24, "SPEED RUSH", "#FF007F");
        this.effects.push({ x: h.x, y: h.y, r: 28, life: 0.6, color: "#FF007F" });
        used = true;
        break;
      }
      case "backstab": {
        const victim = target || this._selectTarget(h) || this._nearestEnemy(h.x, h.y, 300);
        if (victim) {
          used = this._applyAbilityDamage(h, victim, 2.4, "BACKSTAB", 0);
        }
        break;
      }
      case "life_steal": {
        const victim = target || this._nearestEnemy(h.x, h.y, 300);
        if (victim) {
          const before = victim.hp;
          used = this._applyAbilityDamage(h, victim, 1.8, "LIFE STEAL", 0);
          if (!used) break;
          const dealt = Math.max(0, before - victim.hp);
          h.ref.hp = Math.min(h.d.maxHp, h.ref.hp + dealt * 0.45);
          this._float(h.x, h.y - 24, "+" + Math.round(dealt * 0.45), "#39FF14");
        }
        break;
      }
      case "firestorm": {
        const center = targetOrPoint && Number.isFinite(targetOrPoint.x)
          ? targetOrPoint
          : this._nearestEnemy(h.x, h.y, h.d.range);
        if (center) {
          const victims = this.active.filter((e) => e.hp > 0 && Math.hypot(e.x - center.x, e.y - center.y) <= 70);
          for (const e of victims) used = this._applyAbilityDamage(h, e, 1.35, "FIRESTORM", 0) || used;
          if (used) this.effects.push({ kind: "napalm", x: center.x, y: center.y, r: 18, life: 0.8, color: "#A855F7" });
        }
        break;
      }
      case "mend": {
        const ally = this.heroes.filter((x) => x.alive && x !== h).sort((a, b) => (a.ref.hp / a.d.maxHp) - (b.ref.hp / b.d.maxHp))[0];
        if (ally && ally.ref.hp < ally.d.maxHp) {
          const heal = ally.d.maxHp * 0.30 * h.d.healPower;
          ally.ref.hp = Math.min(ally.d.maxHp, ally.ref.hp + heal);
          this._float(ally.x, ally.y - 22, "+" + Math.round(heal), "#39FF14");
          this.effects.push({ x: ally.x, y: ally.y, r: 24, life: 0.45, color: "#39FF14" });
          used = true;
        }
        break;
      }
      case "barrier": {
        for (const ally of this.heroes) {
          if (!ally.alive) continue;
          const cap = ally.d.maxHp * 0.25 * h.d.barrierMultiplier;
          ally.ref.shield = Math.min(cap, (ally.ref.shield || 0) + ally.d.maxHp * 0.18 * h.d.barrierMultiplier);
          this._float(ally.x, ally.y - 22, "+BARRIER", "#00F3FF");
        }
        used = true;
        break;
      }
      case "piercing_shot": {
        const victim = target || this._selectTarget(h);
        if (victim) {
          const targets = [victim, ...this.active.filter((e) => e !== victim && e.hp > 0 && Math.hypot(e.x - victim.x, e.y - victim.y) <= 48).slice(0, 2)];
          targets.forEach((e, i) => { used = this._applyAbilityDamage(h, e, i === 0 ? 2.0 : 0.75, "PIERCE", 0) || used; });
        }
        break;
      }
      case "focus_volley": {
        const victim = target || this._selectTarget(h);
        if (victim) {
          for (let i = 0; i < 3 && victim.hp > 0; i++) used = this._applyAbilityDamage(h, victim, 0.75, "FOCUS", 0) || used;
        }
        break;
      }
      default:
        break;
    }

    if (used) {
      h.abilityCooldowns[ability.id] = ability.cooldown * h.d.cooldownMultiplier;
      this.actionCompletions.push({ index, result: "completed" });
      return true;
    }
    return false;
  }

  executeClasslessAbility(index, abilityId, targetOrPoint = null) {
    const h = this.heroes[index];
    const definition = getUnlockedClasslessAbilities(h?.model).find((item) => item.id === abilityId);
    if (!definition) return { ok: false, reason: "locked", abilityId };
    const target = definition.requiresTarget
      ? targetOrPoint?.enemy || targetOrPoint || this.active
        .filter((enemy) => this._isValidClasslessTarget(h, enemy) &&
          (!Number.isFinite(definition.conditionalTargetHpBelow) ||
            enemy.hp / Math.max(1, enemy.maxHp) < definition.conditionalTargetHpBelow))
        .reduce((nearest, enemy) => !nearest || Math.hypot(enemy.x - h.x, enemy.y - h.y) < Math.hypot(nearest.x - h.x, nearest.y - h.y) ? enemy : nearest, null)
      : null;
    const validation = validateClasslessAbilityUse({
      hero: h ? { ...h.model, alive: h.alive, protect: h.protect, retreating: h.retreating } : null,
      abilityId,
      cooldown: Math.max(0, h?.abilityCooldowns?.[abilityId] || 0),
      battleActive: !!h && !this.ended,
      target,
      targetValid: !definition.requiresTarget || (!!h && this._isValidClasslessTarget(h, target)),
    });
    if (!validation.ok) return validation;
    if (!this._classlessCanPayActiveCost(h)) return { ok: false, reason: "health_cost", abilityId };
    const hpBeforeAbility = h.ref.hp;

    let affectedTargets = [];
    let killedTarget = false;
    if (definition.effect === "weapon_strike" || definition.effect === "weapon_cleave") {
      const secondaryTarget = definition.effect === "weapon_cleave"
        ? this._multiTargetTargets(target, 2, definition.adjacentRadius)[0] || null : null;
      const targetWasAlive = target.hp > 0;
      const hit = this._applyHit({ sourceId: `H${h.i}`, target, dmg: h.d.attack * definition.damageMultiplier,
        magic: false, damageType: null, critChance: h.d.critChance, critMult: h.d.critMult,
        classless: true, heroIndex: h.i, ability: true, damageCategory: "weapon",
        situationalBonus: Number.isFinite(definition.conditionalTargetHpBelow) &&
          target.hp / Math.max(1, target.maxHp) < definition.conditionalTargetHpBelow
          ? definition.conditionalDamageBonus : 0 });
      if (!hit) return { ok: false, reason: "no_target", abilityId };
      killedTarget = targetWasAlive && target.hp <= 0;
      affectedTargets.push(target);
      if (secondaryTarget) {
        if (this._applyHit({ sourceId: `H${h.i}`, target: secondaryTarget,
          dmg: h.d.attack * definition.adjacentDamageMultiplier, magic: false, damageType: null,
          critChance: h.d.critChance, critMult: h.d.critMult, classless: true, heroIndex: h.i,
          ability: true, damageCategory: "weapon" })) affectedTargets.push(secondaryTarget);
      }
    } else if (definition.effect === "attack_speed_aura") {
      const allies = this.heroes.filter((ally) => ally.alive &&
        Math.hypot(ally.x - h.x, ally.y - h.y) <= definition.range);
      if (!allies.includes(h)) return { ok: false, reason: "unavailable", abilityId };
      const expiresAt = this.time + definition.durationSeconds;
      for (const ally of allies) {
        ally.warCryUntil = Math.max(ally.warCryUntil || 0, expiresAt);
        ally.warCryAttackSpeedBonus = Math.max(ally.warCryAttackSpeedBonus || 0, definition.attackSpeedBonus);
        this._float(ally.x, ally.y - 20, "WAR CRY", "#F59E0B");
      }
      affectedTargets = allies;
    } else if (definition.effect === "rally") {
      const allies = this.heroes.filter((ally) => ally.alive &&
        Math.hypot(ally.x - h.x, ally.y - h.y) <= definition.range);
      if (!allies.includes(h)) return { ok: false, reason: "unavailable", abilityId };
      for (const ally of allies) {
        const maxHp = Math.max(1, ally.d.maxHp || ally.ref.maxHp || ally.ref.hp);
        const before = ally.ref.hp;
        ally.ref.hp = Math.min(maxHp, ally.ref.hp + maxHp * definition.healMaxHpFraction);
        const restored = ally.ref.hp - before;
        if (restored > 0) {
          this._float(ally.x, ally.y - 20, `+${Math.round(restored)} HP`, "#22C55E");
          this.effects.push({ kind: "heal", x: ally.x, y: ally.y, r: 18, life: 0.4, color: "#22C55E" });
        }
      }
      affectedTargets = allies;
    } else if (definition.effect === "interpose") {
      // The design names an in-range ally but leaves the radius unspecified.
      // Use the Engine's established 150-unit allied-support radius.
      const allies = this.heroes.filter((ally) => ally !== h && ally.alive &&
        Math.hypot(ally.x - h.x, ally.y - h.y) <= definition.range);
      const protectedHero = allies.sort((a, b) => a.ref.hp - b.ref.hp || a.i - b.i)[0] || h;
      protectedHero.interposeUntil = this.time + definition.durationSeconds;
      protectedHero.interposeReduction = definition.damageReduction;
      h.interposeTarget = protectedHero;
      this._float(protectedHero.x, protectedHero.y - 22, "INTERPOSE", "#22D3EE");
      this.effects.push({ kind: "shield", x: protectedHero.x, y: protectedHero.y, r: 22, life: 0.5, color: "#22D3EE" });
      affectedTargets = [protectedHero];
    } else if (definition.effect === "crimson_covenant") {
      const state = h.classlessCombatState;
      state.covenantUntil = this.time + definition.durationSeconds;
      if (state.survivalReadyAt <= this.time) state.survivalUntil = this.time + definition.durationSeconds;
      this._float(h.x, h.y - 22, "CRIMSON COVENANT", "#DC2626");
      this.effects.push({ kind: "covenant", x: h.x, y: h.y, r: 24, life: 0.55, color: "#DC2626" });
      affectedTargets = [h];
    } else if (definition.effect === "untargetable" || definition.effect === "vanish") {
      h.untargetableUntil = Math.max(h.untargetableUntil, this.time + definition.durationSeconds);
      if (definition.effect === "vanish") {
        h.classlessCombatState.vanishDamagePending = definition.nextHitDamageBonus;
      }
      this._float(h.x, h.y - 22, definition.name.toUpperCase(), "#A78BFA");
      this.effects.push({ kind: "smoke", x: h.x, y: h.y, r: 16, life: 0.6, color: "#A78BFA" });
      affectedTargets = [h];
    } else if (definition.effect === "phantom_strike") {
      const targetWasTargetingHero = this._enemyTargetsHero(target, h);
      const previousPosition = { x: h.x, y: h.y };
      // Enemies advance toward increasing y, so their rear is the smaller-y
      // side. The placement distance reuses the established 30-unit body radius.
      h.x = target.x;
      h.y = target.y - PHANTOM_STRIKE_BEHIND_OFFSET;
      const hit = this._applyHit({ sourceId: `H${h.i}`, target,
        dmg: h.d.attack * definition.damageMultiplier, magic: false, damageType: null,
        critChance: h.d.critChance, critMult: h.d.critMult, classless: true,
        heroIndex: h.i, ability: true, damageCategory: "weapon",
        situationalBonus: targetWasTargetingHero ? 0 : definition.conditionalDamageBonus });
      if (!hit) {
        h.x = previousPosition.x;
        h.y = previousPosition.y;
        return { ok: false, reason: "no_target", abilityId };
      }
      this.effects.push({ kind: "trail", x: previousPosition.x, y: previousPosition.y, toX: h.x, toY: h.y, r: 10, life: 0.38, color: "#22D3EE" });
      killedTarget = target.hp <= 0;
      affectedTargets = [target];
      this._float(h.x, h.y - 22, "PHANTOM STRIKE", "#A78BFA");
    } else {
      return { ok: false, reason: "unavailable", abilityId };
    }

    this._chargeClasslessActiveCost(h, hpBeforeAbility);
    const cooldown = definition.refundCooldownOnKill && killedTarget ? 0 : definition.cooldownSeconds * h.d.cooldownMultiplier;
    h.abilityCooldowns[definition.id] = cooldown;
    h.visualActionKind = definition.effect === "weapon_strike" || definition.effect === "weapon_cleave" || definition.effect === "phantom_strike" ? "attack" : null;
    h.visualActionStartedAt = this.time;
    h.visualActionUntil = this.time + 0.42;
    this.actionCompletions.push({ index, result: "completed", abilityId: definition.id });
    return { ok: true, reason: null, abilityId: definition.id, target, affectedTargets,
      cooldownRemaining: cooldown, killedTarget };
  }

  useSharedStrike(index, targetOrNull = null) {
    const h = this.heroes[index];
    if (!h?.classless || !h.alive) return false;
    if ((h.abilityCooldowns[HERO_BASELINE.sharedStrike.id] || 0) > 0) return false;
    const target = targetOrNull || this._selectTarget(h);
    if (!this._isValidClasslessTarget(h, target)) return false;
    if (!this._classlessCanPayActiveCost(h)) return false;
    const hpBeforeAbility = h.ref.hp;

    this._applyHit({
      sourceId: `H${h.i}`,
      target,
      dmg: h.d.attack * HERO_BASELINE.sharedStrike.damageMultiplier,
      magic: false,
      damageType: null,
      critChance: h.d.critChance,
      critMult: h.d.critMult,
      perkData: null,
      sharedStrike: true,
      classless: true,
      heroIndex: h.i,
      ability: true,
      damageCategory: "weapon",
    });
    this._chargeClasslessActiveCost(h, hpBeforeAbility);
    h.abilityCooldowns[HERO_BASELINE.sharedStrike.id] = HERO_BASELINE.sharedStrike.cooldownSeconds * h.d.cooldownMultiplier;
    this.actionCompletions.push({ index, result: "completed" });
    return true;
  }

  _applyAbilityDamage(h, target, multiplier, label, stunSeconds = 0) {
    if (!target || target.hp <= 0) return false;
    const damageType = h.ref.cls === "knight" ? C.DAMAGE_TYPES.KNIGHT_MELEE : h.ref.cls === "rouge" ? C.DAMAGE_TYPES.ROUGE_MELEE : h.ref.cls === "archer" ? C.DAMAGE_TYPES.ARCHER_RANGED : C.DAMAGE_TYPES.ARCANE;
    const affinity = C.affinityMultiplier(target, damageType);
    if (affinity <= 0) {
      this._float(target.x, target.y - 4, "IMMUNE", "#39FF14");
      return false;
    }
    const echoMarks = this._takeClasslessEchoMarks(target, `H${h.i}`);
    let dmg = (h.d.attack || 0) * multiplier * h.d.abilityDamageMultiplier * affinity;
    const targetHpFraction = target.hp / Math.max(1, target.maxHp);
    const lowHpBonus = targetHpFraction < 0.35 ? h.d.lowHpDamage : 0;
    const executionBonus = targetHpFraction < 0.25 ? h.d.executionDamage : 0;
    dmg *= 1 + lowHpBonus + executionBonus;
    if (targetHpFraction > 0.70) dmg *= 1 + h.d.highHpDamage;
    dmg *= 1 + this._classlessOpeningBonus(target);
    target.hp = Math.max(0, target.hp - dmg);
    target.dmgBy["H" + h.i] = (target.dmgBy["H" + h.i] || 0) + dmg;
    let killSourceId = `H${h.i}`;
    for (const echo of echoMarks) {
      if (target.hp > 0 && echo.damage >= target.hp) killSourceId = echo.sourceId;
      target.hp = Math.max(0, target.hp - echo.damage);
      target.dmgBy[echo.sourceId] = (target.dmgBy[echo.sourceId] || 0) + echo.damage;
      this._float(target.x, target.y - 18, `ECHO ${Math.round(echo.damage)}`, "#A78BFA");
    }
    if (stunSeconds > 0) target.stunUntil = Math.max(target.stunUntil || 0, this.time + stunSeconds);
    this._float(target.x, target.y - 4, label + " " + Math.round(dmg), h.d.color);
    this.effects.push({ kind: "hit", x: target.x, y: target.y, r: 16, life: 0.3, color: h.d.color, crit: false });
    if (target.hp <= 0) this._killEnemy(target, killSourceId);
    return true;
  }

  setHeroManual(index, manual) {
    const h = this.heroes[index];
    if (!h) return false;
    this._completeTacticalAction(index, "cancelled");
    h.manual = !!manual;
    h.ref.manual = !!manual;
    if (!h.manual) {
      h.manualTarget = null;
      h.manualPoint = null;
    }
    h.rallyPoint = null;
    h.rallyHold = false;
    h.retreating = false;
    this.selectedHero = index;
    return true;
  }

  commandHeroAttack(index, target) {
    const h = this.heroes[index];
    if (!h || !h.alive || !target || target.hp <= 0) return false;
    if (h.classless && !this._isValidClasslessTarget(h, target)) return false;
    if (!h.classless && h.d.range >= 130 && (!this.active.includes(target) ||
      !this._isValidRangedTarget(h, target, h.ref.cls === "mage" ? C.DAMAGE_TYPES.ARCANE : C.DAMAGE_TYPES.ARCHER_RANGED))) return false;
    h.manual = true;
    h.ref.manual = true;
    h.manualTarget = target;
    h.pendingTacticalAction = "attack";
    h.manualPoint = null;
    h.rallyPoint = null;
    h.rallyHold = false;
    this.selectedHero = index;
    return true;
  }

  retreatHero(index) {
    const h = this.heroes[index];
    if (!h || !h.alive) return false;
    h.manual = true;
    h.ref.manual = true;
    h.manualTarget = null;
    h.manualPoint = null;
    h.rallyPoint = null;
    h.rallyHold = false;
    h.retreating = true;
    h.pendingTacticalAction = "retreat";
    this.selectedHero = index;
    return true;
  }

  rallyHeroes(index) {
    const leader = this.heroes[index];
    if (!leader || !leader.alive) return false;

    // The hero issuing RALLY is the rally anchor. Everyone else moves to
    // that hero's current position; the caller itself must NOT fall back
    // to its original home position after issuing the command.
    const point = { x: leader.x, y: leader.y };

    for (const h of this.heroes) {
      if (!h.alive) continue;
      h.retreating = false;
      h.manualTarget = null;
      h.manualPoint = null;
      h.rallyHold = h === leader;
      h.rallyPoint = h === leader ? null : { ...point };
    }
    leader.pendingTacticalAction = "rally";

    return true;
  }

  reviveHero(index) {
    const h = this.heroes[index];
    if (!h || h.alive || h.ref.hp > 0) return false;
    const cost = C.paidRevivalCost(h.ref.level);
    if (this.sim.gold < cost) return false;

    this.sim.gold -= cost;
    h.ref.hp = Math.max(1, Math.round(h.d.maxHp * (C.RECOVERY.reviveHpPercent / 100)));
    h.alive = true;
    h.protect = C.REVIVE_PROTECT_S;
    h.manual = false;
    h.ref.manual = false;
    h.manualTarget = null;
    h.manualPoint = null;
    h.rallyPoint = null;
    h.retreating = false;
    h.x = h.home.x;
    h.y = h.home.y;
    return true;
  }

  getFallenHeroRevivalOffer() {
    if (this.ended || this.heroes.filter((hero) => hero.alive).length !== 1) return null;
    const fallen = this.heroes.filter((hero) => !hero.alive && hero.ref.hp <= 0);
    if (!fallen.length) return null;
    return {
      cost: fallen.reduce((total, hero) => total + C.paidRevivalCost(hero.ref.level), 0),
      heroIds: fallen.map((hero) => hero.ref.id),
    };
  }

  reviveFallenHeroes() {
    const offer = this.getFallenHeroRevivalOffer();
    if (!offer || this.sim.gold < offer.cost) return false;
    const fallenIds = new Set(offer.heroIds);
    this.sim.gold -= offer.cost;
    for (const hero of this.heroes) {
      if (!fallenIds.has(hero.ref.id)) continue;
      hero.ref.hp = Math.max(1, Math.round(hero.d.maxHp * (C.RECOVERY.reviveHpPercent / 100)));
      hero.alive = true;
      hero.protect = C.REVIVE_PROTECT_S;
      hero.manual = false;
      hero.ref.manual = false;
      hero.manualTarget = null;
      hero.manualPoint = null;
      hero.rallyPoint = null;
      hero.retreating = false;
      hero.x = hero.home.x;
      hero.y = hero.home.y;
    }
    return { ...offer };
  }

  commandHeroMoveTo(index, x, y) {
    const h = this.heroes[index];
    if (!h || !h.alive) return false;

    h.manual = true;
    h.ref.manual = true;
    h.manualTarget = null;
    h.manualPoint = {
      x: Math.max(12, Math.min(W - 12, x)),
      y: Math.max(12, Math.min(FLOOR_Y - 12, y)),
    };
    h.pendingTacticalAction = "move";
    h.rallyPoint = null;
    h.rallyHold = false;
    h.retreating = false;
    this.selectedHero = index;
    return true;
  }

  cancelTacticalAction(index) {
    const h = this.heroes[index];
    if (!h) return false;
    if (h.pendingTacticalAction === "rally") {
      for (const ally of this.heroes) {
        ally.rallyPoint = null;
        ally.rallyHold = false;
      }
    }
    h.manualPoint = null;
    h.manualTarget = null;
    h.rallyPoint = null;
    h.rallyHold = false;
    h.retreating = false;
    return this._completeTacticalAction(index, "cancelled");
  }

  _completeTacticalAction(index, result) {
    const h = this.heroes[index];
    if (!h?.pendingTacticalAction) return false;
    h.pendingTacticalAction = null;
    this.actionCompletions.push({ index, result });
    return true;
  }

  _flushActionCompletions() {
    const pending = [];
    for (const completion of this.actionCompletions) {
      if (completion.effects?.some((effect) => this.effects.includes(effect))) {
        pending.push(completion);
      } else {
        this.cb.onActionResolved?.({ index: completion.index, result: completion.result });
      }
    }
    this.actionCompletions = pending;
  }

  commandHeroAttackAt(index, x, y) {
    const hero = this.heroes[index];
    if (!hero?.alive) return false;
    if (hero.d.range >= 130) {
      const target = this.getRangedTargetAt(index, x, y);
      return target ? this.commandHeroAttack(index, target.enemy) : false;
    }

    const target = this.active.reduce((best, e) => {
      if (e.hp <= 0) return best;
      const d = Math.hypot(e.x - x, e.y - y);
      // Give phone taps a generous target radius without making distant
      // enemies accidentally selectable.
      if (d > 80) return best;
      if (!best) return e;
      return d < Math.hypot(best.x - x, best.y - y) ? e : best;
    }, null);

    // TARGET mode is intentionally target-only. Tapping empty ground does not
    // silently turn into a MOVE command.
    return target ? this.commandHeroAttack(index, target) : false;
  }

  // ---------------- Gauntlet quick slots ----------------
  // Consumable stacks live on the hero model (h.model.quickSlots), which is the
  // disposable sim copy, so spent items flow back with the post-battle party.
  getHeroQuickSlots(index) {
    const h = this.heroes[index];
    if (!h?.classless) return [];
    const slots = Array.isArray(h.model.quickSlots) ? h.model.quickSlots : [];
    return slots.map((slot, i) => {
      const item = slot && CONSUMABLES[slot.key];
      if (!item || !(slot.qty > 0)) return { slot: i, empty: true };
      return {
        slot: i, key: item.key, name: item.name, short: item.short, color: item.color, desc: item.desc,
        qty: slot.qty, cooldown: h.quickCd,
        available: h.alive && h.quickCd <= 0 && !this.ended && this._quickItemUseful(h, item),
      };
    });
  }

  useQuickItem(index, slotIndex) {
    const h = this.heroes[index];
    const slot = h?.classless ? h.model.quickSlots?.[slotIndex] : null;
    const item = slot && CONSUMABLES[slot.key];
    if (!item || !(slot.qty > 0) || !h.alive || h.quickCd > 0 || this.ended || !this._quickItemUseful(h, item)) return false;
    slot.qty -= 1;
    h.quickCd = QUICK_ITEM_COOLDOWN;
    if (item.heal) this._tally(h, "heals", 1);
    if (item.heal) {
      const amount = Math.min(h.d.maxHp - h.ref.hp, h.d.maxHp * item.heal * (1 + (h.d.traits?.healBonus || 0)) * (1 - (h.d.env?.healCut || 0)));
      h.ref.hp += amount;
      this._float(h.x, h.y - 18, `+${Math.round(amount)}`, "#39FF14");
    }
    if (item.shots) {
      h.ammoShots = item.shots;
      h.ammoBonus = item.damageBonus;
      this._float(h.x, h.y - 18, "AMMO", item.color);
    }
    this.effects.push({ x: h.x, y: h.y, r: 16, life: 0.3, color: item.color, ring: true });
    return true;
  }

  _quickItemUseful(h, item) {
    if (item.arrow) return false; // arrows are drawn by the bow itself
    if (item.heal) return h.ref.hp < h.d.maxHp;
    if (item.shots) return !(h.ammoShots > 0);
    return false;
  }

  // Heroes use their own quick slots: heals below the item's HP threshold
  // (scaled by the hero's supply style), whetstones while an elite or boss is
  // on the field. A hero told to save potions for bosses keeps them until one shows up.
  _tickQuickItems(h, dt) {
    h.quickCd = Math.max(0, h.quickCd - dt);
    if (!h.classless || h.quickCd > 0) return;
    const slots = Array.isArray(h.model.quickSlots) ? h.model.quickSlots : [];
    const hpFraction = h.ref.hp / Math.max(1, h.d.maxHp);
    const eliteOnField = this.active.some((e) => e.hp > 0 && (e.boss || e.tier === "elite"));
    for (let i = 0; i < slots.length; i++) {
      const item = slots[i] && CONSUMABLES[slots[i].key];
      if (!item || !(slots[i].qty > 0)) continue;
      const saving = item.key === "potion" && h.model.savePotions && !eliteOnField;
      const wants = item.heal ? !saving && hpFraction < healThreshold(h.model, item) : !!item.autoVsElite && eliteOnField;
      if (wants && this.useQuickItem(h.i, i)) return;
    }
  }

  // The quick slot a bow hero draws arrows from: the first one holding any.
  _arrowSlot(h) {
    const slots = Array.isArray(h.model?.quickSlots) ? h.model.quickSlots : [];
    return slots.find((slot) => slot && CONSUMABLES[slot.key]?.arrow && slot.qty > 0) || null;
  }

  // Take one arrow for a shot (a quiver or Whisperwind may save it). Returns
  // the arrow's on-hit effect, or false when the quiver is empty.
  _drawArrow(h) {
    const slot = this._arrowSlot(h);
    if (!slot) return false;
    const item = CONSUMABLES[slot.key];
    if (!(Math.random() < Math.min(0.75, h.d.gear?.arrowSaver || 0))) {
      slot.qty -= 1;
      h.model.arrowsSpent ||= {};
      h.model.arrowsSpent[slot.key] = (h.model.arrowsSpent[slot.key] || 0) + 1;
    }
    return item.effect || null;
  }

  _consumeAmmoShot(src, isHero) {
    if (!isHero || !(src.ammoShots > 0)) return 1;
    src.ammoShots -= 1;
    return 1 + (src.ammoBonus || 0);
  }

  // Gauntlet scales summoned minions to the encounter through sim.makeMinion.
  _summon(type) {
    this.injectEnemy(this.sim.makeMinion ? this.sim.makeMinion(type) : makeSingleEnemy(this.sim, type));
  }

  injectEnemy(e) {
    e.x = laneX(pickLane(this, e)); e.y = 12;
    e.lane = Math.round(e.x / (W / LANES) - 0.5);
    e.dmgBy = {}; e.atkCd = 0; e.state = "advance";
    this.active.push(e);
    this.wave.total += 1;
  }
  forceDefeat() { this.forcedDefeat = true; }

  // Gauntlet endless mode: the player ends the fight and keeps what was earned.
  returnHome() {
    if (this.ended) return false;
    this.ended = true;
    this.stop();
    this.cb.onEnd && this.cb.onEnd({
      victory: true,
      reason: "returned",
      xpGains: this.xpGains,
      killed: this.killed,
      wavesCleared: this.wavesCleared,
    });
    return true;
  }
  forceWin() { this.spawnQueue = []; this.active = []; }

  _loop(now) {
    if (!this.running) return;
    try {
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.05) dt = 0.05;
      // Fast-forward in normal-sized steps so 4x/8x play matches 1x physics.
      const steps = Math.max(1, Math.ceil(this.speed));
      for (let i = 0; i < steps && !this.ended; i += 1) this.update((dt * this.speed) / steps);
      this.render();
      if (!this.ended) requestAnimationFrame(this._loop);
    } catch (err) {
      // Never let one malformed runtime object silently kill the RAF chain.
      // Keep the UI alive and expose the real failure through logcat/console.
      this.running = false;
      console.error("DemonanicEngine LOOP CRASH:", err?.message || err, err?.stack || "");
      if (this.cb.onError) this.cb.onError(err);
    }
  }

  update(dt) {
    this.time += dt;

    // spawn: release enemies gradually (group release proxy)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.spawnQueue.length) {
      // Keep the battlefield readable: limit concurrent enemies to roughly half a wave.
      const capInZone = Math.max(4, this.wave.total * 0.5);
      if (this.active.length < capInZone) {
        const e = this.spawnQueue.shift();
        e.x = laneX(pickLane(this, e)); e.y = 10 + Math.random() * 20;
        e.lane = Math.round(e.x / (W / LANES) - 0.5);
        e.dmgBy = {}; e.atkCd = 0; e.state = "advance";
        this.active.push(e);
      }
      // Wider spacing prevents large clumps while preserving steady wave pressure.
      this.spawnTimer = this.wave.hasBoss && this.spawnQueue.length === 0 ? 0 : 0.75;
    }

    // enemies
    // Lieutenant command auras are recalculated every frame so the battlefield
    // visibly behaves like a living formation rather than a stack of stat bags.
    for (const e of this.active) e._commanderBoost = 1;
    for (const e of this.active) {
      if (e.type !== "lieutenant" || e.hp <= 0) continue;
      for (const other of this.active) {
        if (other === e || other.hp <= 0) continue;
        if (Math.hypot(other.x - e.x, other.y - e.y) <= 105) {
          other._commanderBoost = Math.max(other._commanderBoost || 1, 1.15);
        }
      }
    }
    for (const e of this.active) {
      this._tickDots(e, dt);
      if (e.hp > 0) this._updateEnemy(e, dt);
    }
    this.active = this.active.filter((e) => e.hp > 0);

    // heroes: in an encounter the party is engaged as soon as any enemy is on
    // the field. Melee heroes advance to attack; ranged fire in place.
    const breached = this.active.length > 0;
    for (const h of this.heroes) {
      if (!h.alive) {
        this._completeTacticalAction(h.i, "cancelled");
        h.rallyPoint = null;
        continue;
      }
      if (h.protect > 0) { h.protect -= dt; continue; }
      for (const id of Object.keys(h.abilityCooldowns)) h.abilityCooldowns[id] = Math.max(0, h.abilityCooldowns[id] - dt);
      this._tickClasslessSustain(h, dt);
      this._tickGearAndEnvironment(h, dt);
      if (!h.alive) continue;
      this._tickQuickItems(h, dt);
      for (const id of Object.keys(h.spellCooldowns)) h.spellCooldowns[id] = Math.max(0, h.spellCooldowns[id] - dt);
      h.mana = Math.min(h.maxMana, h.mana + (2 + Math.max(0, h.d.intelligence || 0) * 0.04) * dt);
      const cfg = h.ref.attackConfig || "";
      const melee = h.classless ? h.d.rangeMode !== "midline" : h.d.range < 130;
      const support = h.d.magic && /Support|Heal|Barrier/i.test(cfg);
      const baseAttackSpeed = h.classless ? h.d.classlessEffects.attackSpeed : 0;
      const activeAttackSpeedBonus = h.warCryUntil > this.time ? h.warCryAttackSpeedBonus : 0;
      const cappedAttackSpeed = Math.min(0.20, baseAttackSpeed + activeAttackSpeedBonus);
      const attackSpeedMultiplier = (1 + cappedAttackSpeed) / (1 + baseAttackSpeed);
      h.cd -= dt * (!support && activeAttackSpeedBonus > 0 ? attackSpeedMultiplier : 1);

      if (h.retreating) {
        this._returnHome(h, dt);
        if (Math.hypot(h.x - h.home.x, h.y - h.home.y) < 8) {
          h.retreating = false;
          this._completeTacticalAction(h.i, "completed");
        }
        continue;
      }

      if (h.rallyPoint) {
        const rd = Math.hypot(h.rallyPoint.x - h.x, h.rallyPoint.y - h.y);
        if (rd > 24) {
          const spd = heroMovementSpeed(h, 185, this.time) * dt;
          h.x += ((h.rallyPoint.x - h.x) / rd) * Math.min(spd, rd);
          h.y += ((h.rallyPoint.y - h.y) / rd) * Math.min(spd, rd);
          continue;
        }
        h.rallyPoint = null;
      }

      // Manual ground command: move to the exact tapped position and then
      // hold there. This persists until another manual command or RETREAT.
      if (h.manualPoint) {
        const md = Math.hypot(h.manualPoint.x - h.x, h.manualPoint.y - h.y);
        if (md > 8) {
          const spd = heroMovementSpeed(h, 155, this.time) * dt;
          h.x += ((h.manualPoint.x - h.x) / md) * Math.min(spd, md);
          h.y += ((h.manualPoint.y - h.y) / md) * Math.min(spd, md);
          continue;
        }
        h.x = h.manualPoint.x;
        h.y = h.manualPoint.y;
        h.manualPoint = null;
        this._completeTacticalAction(h.i, "completed");
        continue;
      }

      // A rally caller is the anchor of the regroup. Keep that hero at the
      // rally location instead of sending it back to its starting position.
      if (h.rallyHold && !h.manualTarget) {
        const nearbyRallyTarget = this._nearestEnemy(h.x, h.y, 220);
        if (nearbyRallyTarget) {
          h.manualTarget = nearbyRallyTarget;
        } else {
          continue;
        }
      }
      // Reactive combat keeps the Castle Squad alive without taking away
      // deliberate player control. A selected hero remains fully manual;
      // unselected heroes can temporarily answer a nearby ally under attack
      // or a castle breach, then return to their configured behavior.
      const reactiveActive = h.reactiveUntil > this.time && this.selectedHero !== h.i;
      if (h.reactiveUntil && !reactiveActive) {
        h.reactiveUntil = 0;
        h.reactiveAlly = null;
        h.reactiveReason = null;
      }

      // Mage support/barrier config: support the endangered ally when a
      // reactive alert exists; otherwise use the normal weakest-ally logic.
      if (support) {
        if (h.cd <= 0 && this._support(h, cfg, reactiveActive ? h.reactiveAlly : null)) h.cd = h.d.rate;
        if (reactiveActive && h.reactiveAlly?.alive) {
          const ally = h.reactiveAlly;
          const dist = Math.hypot(ally.x - h.x, ally.y - h.y);
          if (dist > 190) {
            const spd = heroMovementSpeed(h, 155, this.time, true) * dt;
            h.x += ((ally.x - h.x) / Math.max(1, dist)) * Math.min(spd, dist);
            h.y += ((ally.y - h.y) / Math.max(1, dist)) * Math.min(spd, dist);
          }
        } else if (!h.manual) {
          // AUTO support mages regroup at home between support actions.
          // A player-controlled mage must hold its commanded position instead
          // of being pulled home by its support configuration.
          this._returnHome(h, dt);
        }
        continue;
      }

      // Gauntlet: a bow with an empty quiver can't shoot; the hero falls back.
      if (h.classless && h.d.usesArrows && !this._arrowSlot(h)) {
        if (!h.outOfArrows) {
          h.outOfArrows = true;
          this._float(h.x, h.y - 24, "NO ARROWS", "#E2E8F0");
        }
        this._returnHome(h, dt);
        continue;
      }

      const alertEnemy = this._nearestEnemy(h.x, h.y, 300);
      const nearbyAutoTarget = this._nearestEnemy(h.x, h.y, 220);
      const shouldReactToCastle = reactiveActive && h.reactiveReason === "castle";
      if (!h.manual && alertEnemy && !nearbyAutoTarget && !reactiveActive) {
        // An approaching/offensive enemy is enough to wake an AUTO hero.
        // The hero will close distance until its normal attack range applies.
        h.reactiveUntil = this.time + 1;
        h.reactiveReason = "enemy";
      }
      if (!breached && !h.manual && !nearbyAutoTarget && !reactiveActive && !alertEnemy && !shouldReactToCastle) {
        this._returnHome(h, dt); continue;
      }
      let target = h.classless ? this._selectTarget(h) : h.manual && !reactiveActive ? h.manualTarget : this._selectTarget(h);

      if (target && target.hp <= 0) {
        h.manualTarget = null;
        this._completeTacticalAction(h.i, "cancelled");
        target = h.manual ? null : this._selectTarget(h);
      }
      if (target && h.pendingTacticalAction === "attack" && (h.classless ? h.d.rangeMode === "midline" : h.d.range >= 130) &&
        !(h.classless ? this._isValidClasslessTarget(h, target) : this._isValidRangedTarget(h, target, h.ref.cls === "mage" ? C.DAMAGE_TYPES.ARCANE : C.DAMAGE_TYPES.ARCHER_RANGED))) {
        h.manualTarget = null;
        this._completeTacticalAction(h.i, "cancelled");
        target = null;
      }

      // Manual heroes hold their current position when they have no target.
      // They return home only through the explicit RETREAT command.
      if (h.manual && !target && !reactiveActive) {
        continue;
      }

      // Gauntlet encounters: an AUTO classless hero with nothing in range closes
      // on the nearest enemy, so ranged enemies that out-range heroes (warlocks,
      // the demon) cannot stall a fight indefinitely.
      if (h.classless && !target && !h.manual) {
        const nearest = this.active.reduce((best, enemy) => enemy.hp > 0 &&
          (!best || Math.hypot(enemy.x - h.x, enemy.y - h.y) < Math.hypot(best.x - h.x, best.y - h.y)) ? enemy : best, null);
        if (nearest) {
          const dist = Math.hypot(nearest.x - h.x, nearest.y - h.y) || 1;
          const step = Math.min(heroMovementSpeed(h, 155, this.time) * dt, Math.max(0, dist - (h.d.range - 10)));
          h.x += ((nearest.x - h.x) / dist) * step;
          h.y += ((nearest.y - h.y) / dist) * step;
          continue;
        }
      }

      if (melee) {
        if (target) {
          const dist = Math.hypot(target.x - h.x, target.y - h.y) || 1;
          if (dist > this._meleeReach(h, target)) {
            const spd = heroMovementSpeed(h, 155, this.time, true) * dt;
            h.x += ((target.x - h.x) / dist) * Math.min(spd, dist);
            h.y += ((target.y - h.y) / dist) * Math.min(spd, dist);
          } else if (h.cd <= 0) {
            this._fire("H" + h.i, h, target, h.d, true);
            h.cd = h.d.rate;
          }
        } else if (!h.manual) this._returnHome(h, dt);
      } else if (h.cd <= 0 && target && Math.hypot(target.x - h.x, target.y - h.y) <= h.d.range) {
        this._fire("H" + h.i, h, target, h.d, true);
        h.cd = h.d.rate;
      }
    }
    for (const h of this.heroes) {
      if (h.pendingTacticalAction === "rally" && !this.heroes.some((ally) => ally.rallyPoint)) {
        this._completeTacticalAction(h.i, "completed");
      }
    }

    this._updatePets(dt);

    // Resolve body collisions after movement so living units cannot occupy the same space.
    this._resolveUnitCollisions();

    // projectiles
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.kind === "enemyBolt" && p.targetKind === "hero" && this._isHeroUntargetable(p.target?.obj)) {
        const replacement = this._nearestDefender(p.launchX, p.launchY, p.targetSearchRange);
        if (!replacement) {
          p.dead = true;
          continue;
        }
        p.target = replacement;
        p.targetKind = replacement.kind;
        p.tx = replacement.obj.x;
        p.ty = replacement.obj.y;
      }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.spd * dt;
      if (p.kind === "enemyBolt") {
        const obj = p.target?.obj;
        const alive = p.targetKind === "hero"
          ? !!obj?.alive && obj.ref?.hp > 0
          : !!obj && obj.ref?.hp > 0;
        if (dist <= step || !alive) {
          if (alive) this._resolveEnemyBolt(p);
          p.dead = true;
        } else { p.x += (dx / dist) * step; p.y += (dy / dist) * step; }
        continue;
      }
      if (dist <= step || !p.target || p.target.hp <= 0) {
        if (p.kind === "napalm") {
          this._explodeNapalm(p.x, p.y, p);
        } else if (p.target && p.target.hp > 0) {
          this._applyHit(p);
        }
        if (Number.isInteger(p.heroActionIndex)) this._completeTacticalAction(p.heroActionIndex, "completed");
        p.dead = true;
      } else { p.x += (dx / dist) * step; p.y += (dy / dist) * step; }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    // floaters
    for (const f of this.floaters) { f.y -= 20 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const fx of this.effects) fx.life -= dt;
    this.effects = this.effects.filter((f) => f.life > 0);
    if (this.floaters.length > MAX_COMBAT_FLOATERS) this.floaters.splice(0, this.floaters.length - MAX_COMBAT_FLOATERS);
    if (this.effects.length > MAX_COMBAT_EFFECTS) this.effects.splice(0, this.effects.length - MAX_COMBAT_EFFECTS);

    this._hud();
    this._checkEnd();
    this._flushActionCompletions();
  }

  _updateEnemy(e, dt) {
    e.atkCd -= dt * (e.attackSlowUntil > this.time ? (e.attackSlowMultiplier || 1) : 1);
    if (e.stunUntil && e.stunUntil > this.time) return;
    // Boss special: a targeted, proximity-based napalm bottle.
    // It no longer damages every hero simultaneously. The target is the nearest
    // living hero or tower inside the boss's configured attack range.
    if (e.boss) {
      e.abilityCd = (e.abilityCd == null ? 5 : e.abilityCd) - dt;
      // Gauntlet boss identities: the Abomination enrages once, below 35% HP.
      if (e.type === "nuclearBehemoth" && !e.enraged && e.hp < e.maxHp * 0.35) {
        e.enraged = true;
        e.speed *= 1.5;
        e.damage *= 1.3;
        this._float(e.x, e.y - 34, "ENRAGED", "#84CC16");
        this.effects.push({ x: e.x, y: e.y, r: 46, life: 0.6, color: "#84CC16", ring: true });
      }
      if (e.abilityCd <= 0) {
        const range = e.attackRange || 420;
        const target = this._nearestDefender(e.x, e.y, range);
        // Gauntlet: bombs and bile are lobbed at heroes keeping their distance;
        // heroes in melee face the boss's own attacks instead.
        const lobTarget = this._lobTarget(e, range);
        if (e.type === "nuclearBehemoth") {
          // Toxic slam: no minions, heavy damage to every hero close by.
          if (this._nearestDefender(e.x, e.y, 110)) {
            e.abilityCd = e.enraged ? 3.5 : 5;
            this.effects.push({ x: e.x, y: e.y, r: 100, life: 0.45, color: "#84CC16", ring: true });
            this._explodeNapalm(e.x, e.y, { dmg: e.damage * 1.1, splash: 100 });
          } else {
            e.abilityCd = 0.5;
          }
        } else if (e.type === "banditWarlord") {
          // Calls his gang in, then charges the weakest hero himself.
          e.abilityCd = 10;
          for (let k = 0; k < 2; k++) this._summon("bandit");
          this._float(e.x, e.y - 34, "TO ME, LADS!", e.color);
          e.blitzUntil = this.time + 0.6;
          e.blitzStrike = true;
        } else if (target && e.type === "bogLich") {
          // Mends its court, drags the dead back up, and spits bile.
          e.abilityCd = 7;
          this._healAllies(e, 250, 0.12);
          this._raiseFallen(e, 250, 2);
          if (lobTarget) this._throwNapalm(e, lobTarget);
        } else if (target) {
          if (e.type === "imperialNecromancer") {
            // Raise dead: a larger, slower pack of minions, plus a soul bomb.
            e.abilityCd = 8;
            for (const type of ["skeleton", "skeleton", "ghost"]) this._summon(type);
            this._float(e.x, e.y - 34, "RAISE DEAD", e.color);
          } else {
            e.abilityCd = 6;
            for (let k = 0; k < 2; k++) this._summon("skeleton");
          }
          if (lobTarget) this._throwNapalm(e, lobTarget);
        } else {
          e.abilityCd = 1;
        }
      }
    }
    if (this._updateSpecialEnemy(e, dt)) return;
    // Enemy archetypes get a small tactical identity on top of their
    // existing stats/objectives. These are intentionally readable rules:
    // fast raiders rush, brutes hunt structures, reapers hunt wounded heroes,
    // and lieutenants reinforce nearby attackers.
    const tactical = this._selectEnemyTacticalTarget(e);
    const commanderBoost = e._commanderBoost || 1;
    if (e.type === "warlock") {
      e.abilityCd = (e.abilityCd == null ? 3 : e.abilityCd) - dt;
      if (e.abilityCd <= 0) {
        // Warlocks are Mage Hunters: Mage first, then any living hero, then
        // tower fallback. This gives the archetype a clear battlefield role
        // and prevents the old tower-wrapper dereference crash.
        const target =
          this._nearestMageEntity(e.x, e.y, 300) ||
          this._nearestHeroEntity(e.x, e.y, 300) ||
          this._nearestTower(e.x, e.y, 300);

        if (target?.kind === "hero") {
          this._enemyAttack(e, target);
          if (target.obj?.ref?.type === "mage") {
            this._float(target.obj.x, target.obj.y - 22, "MAGE HUNT", e.color);
          }
          e.abilityCd = 4.5;
        } else if (target?.kind === "tower") {
          // _nearestTower() returns { kind, obj }; obj.ref is the persisted
          // tower. The previous implementation incorrectly read target.ref.
          const tower = target.obj;
          const r = C.TOWER_RESOURCE[tower.ref.type];
          const current = r.kind === "ammo" ? (tower.ref.ammo || 0) : (tower.ref.mana || 0);
          const max = r.kind === "ammo" ? tower.d.maxAmmo : tower.d.maxMana;
          const drain = Math.min(current, Math.max(5, Math.ceil(max * 0.18)));
          if (r.kind === "ammo") tower.ref.ammo = Math.max(0, current - drain);
          else tower.ref.mana = Math.max(0, current - drain);
          tower.ref.warlockDebuff = 3;
          this._float(tower.x, tower.y - 22, "DRAIN -" + drain, e.color);
          this.effects.push({ kind: "immune", x: tower.x, y: tower.y, r: 15, life: 0.45, color: e.color });
          e.abilityCd = 4.5;
        } else {
          e.abilityCd = 1;
        }
      }
    }
    const baseMoveSpeed =
      e.type === "goblin" ? e.speed * 1.18 * commanderBoost :
      e.type === "darkElf" ? e.speed * 1.08 * commanderBoost :
      e.type === "slime" ? e.speed * 0.92 * commanderBoost :
      e.type === "reaper" ? e.speed * 1.05 * commanderBoost :
      e.speed * commanderBoost;
    if (e.rootUntil > this.time) return;
    const moveSpeed = baseMoveSpeed * (e.slowUntil > this.time ? (e.slowMultiplier || 1) : 1);

    // Floating enemies bypass barricades, preserving their distinct identity.
    // Reapers and lieutenants can peel toward heroes; orcs pressure towers.
    if (tactical && (e.type === "reaper" || e.type === "orc" || e.type === "lieutenant" || e.type === "ghost" || e.type === "darkElf" || e.type === "warlock")) {
      const target = tactical.obj;
      const dist = Math.hypot(target.x - e.x, target.y - e.y) || 1;
      // Dark Elves are ranged tower hunters; Warlocks cast ranged bolts while
      // retaining their separate Mage-Hunter drain ability above.
      const ranged = e.type === "darkElf" || e.type === "warlock";
      const attackRange = e.type === "darkElf" ? 245 : e.type === "warlock" ? 225 : e.type === "reaper" ? 34 : 30;
      if (ranged && dist <= attackRange) {
        if (e.atkCd <= 0) {
          this._throwEnemyBolt(e, tactical, e.type === "darkElf" ? e.damage * 1.15 : e.damage, e.type === "darkElf" ? "#F43F5E" : "#C026D3", e.type === "warlock");
          e.atkCd = e.type === "darkElf" ? 1.35 : 1.65;
        }
        return;
      }
      if (!ranged && dist <= attackRange) {
        if (e.atkCd <= 0) {
          this._enemyAttack(e, tactical);
          e.atkCd = e.type === "reaper" ? 0.72 : e.type === "orc" ? 1.15 : 0.9;
        }
        return;
      }
      // Ranged enemies hold a firing lane; melee specialists peel toward
      // nearby targets but resume advancing if the target escapes.
      const peelRange = e.type === "reaper" ? 260 : ranged ? 300 : 150;
      if (dist <= peelRange) {
        if (ranged && dist < attackRange * 0.55) {
          e.x -= ((target.x - e.x) / dist) * moveSpeed * dt;
          e.y -= ((target.y - e.y) / dist) * moveSpeed * dt;
        } else {
          e.x += ((target.x - e.x) / dist) * moveSpeed * dt;
          e.y += ((target.y - e.y) / dist) * moveSpeed * dt;
        }
        return;
      }
    }

    // Existing wave objectives still matter when an enemy reaches a defender.
    let blocker = null;
    if (e.objective === "towers") blocker = this._nearestTower(e.x, e.y, 46);
    if (!blocker) blocker = this._nearestHeroEntity(e.x, e.y, 30);
    if (blocker) {
      if (e.atkCd <= 0) {
        this._enemyAttack(e, blocker);
        e.atkCd = e.type === "reaper" ? 0.72 : e.type === "goblin" ? 0.65 : e.type === "orc" ? 1.15 : 1.0;
      }
      return;
    }
    // No castle to reach: every enemy closes on the nearest living hero.
    let prey = null, preyDistance = Infinity;
    for (const h of this.heroes) {
      if (!h.alive || this._isHeroUntargetable(h)) continue;
      const d = Math.hypot(h.x - e.x, h.y - e.y);
      if (d < preyDistance) { preyDistance = d; prey = h; }
    }
    if (!prey || preyDistance < 1) return;
    e.x += ((prey.x - e.x) / preyDistance) * moveSpeed * dt;
    e.y += ((prey.y - e.y) / preyDistance) * moveSpeed * dt;
  }

  // Gauntlet enemy roles. Returns true when the enemy's turn is handled.
  _updateSpecialEnemy(e, dt) {
    const speedScale = (e._commanderBoost || 1) * (e.slowUntil > this.time ? (e.slowMultiplier || 1) : 1);
    const rooted = e.rootUntil > this.time;
    const move = (target, speed, away = false) => {
      if (rooted) return;
      const dist = Math.hypot(target.x - e.x, target.y - e.y) || 1;
      const step = Math.min(speed * speedScale * dt, away ? Infinity : dist);
      e.x += ((target.x - e.x) / dist) * step * (away ? -1 : 1);
      e.y += ((target.y - e.y) / dist) * step * (away ? -1 : 1);
      e.x = Math.max(10, Math.min(W - 10, e.x));
      e.y = Math.max(10, Math.min(FLOOR_Y - 10, e.y));
    };
    const living = this.heroes.filter((h) => h.alive && !this._isHeroUntargetable(h));
    if (!living.length) return false;
    const nearest = living.reduce((best, h) => (Math.hypot(h.x - e.x, h.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y) ? h : best));
    const distTo = (h) => Math.hypot(h.x - e.x, h.y - e.y);

    if (e.bomber) {
      // Gnome Sapper: sprints at the nearest hero, lights the fuse, and blows up.
      if (e.fuseAt != null) {
        if (this.time >= e.fuseAt) this._detonate(e, 1);
        return true;
      }
      if (distTo(nearest) <= 30) {
        e.fuseAt = this.time + 0.7;
        this._float(e.x, e.y - 20, "FUSE LIT!", "#FB923C");
        return true;
      }
      // With a Bulwark in the squad it keeps to the shield's shadow until it
      // is close enough to sprint the rest of the way.
      const shield = distTo(nearest) > SAPPER_SPRINT_RANGE &&
        this.active.find((ally) => ally.type === "bulwark" && ally.hp > 0);
      if (shield) {
        const away = Math.hypot(shield.x - nearest.x, shield.y - nearest.y) || 1;
        const behind = { x: shield.x + ((shield.x - nearest.x) / away) * 22, y: shield.y + ((shield.y - nearest.y) / away) * 22 };
        if (Math.hypot(behind.x - e.x, behind.y - e.y) > 4) move(behind, e.speed * 1.25);
        return true;
      }
      move(nearest, e.speed * 1.25);
      return true;
    }

    if (e.type === "bulwark") {
      // Anchor: fights whoever reaches it; otherwise plants itself between its
      // most threatened ward (a support or control ally) and the hero closest
      // to that ward. With no wards left it advances like any frontliner.
      if (distTo(nearest) <= 32) {
        if (e.atkCd <= 0) {
          this._enemyAttack(e, { kind: "hero", obj: nearest });
          e.atkCd = 1.25;
        }
        return true;
      }
      const ward = this._bulwarkWard(e, living);
      e.guarding = ward?.ally || null;
      if (!ward) {
        move(nearest, e.speed);
        return true;
      }
      const { ally, threat, dist } = ward;
      const out = Math.min(44, dist * 0.5);
      const post = { x: ally.x + ((threat.x - ally.x) / (dist || 1)) * out, y: ally.y + ((threat.y - ally.y) / (dist || 1)) * out };
      // Hurries when a hero is closing in on its ward.
      if (Math.hypot(post.x - e.x, post.y - e.y) > 3) move(post, e.speed * (dist < 200 ? 1.5 : 1.1));
      return true;
    }

    if (e.families?.includes("hunter") && !e.boss && e.type !== "bandit" && e.type !== "darkElf") {
      // Hunters (Harriers, Stalkers, legends) go for the most wounded hero. A
      // Stalker's first strike lands extra hard. A Harrier only hunts when
      // someone is hurt (below 70%); otherwise it skirmishes: strike the
      // nearest hero, then fall back for a moment.
      const weakest = living.reduce((best, h) => (h.ref.hp / h.d.maxHp < best.ref.hp / best.d.maxHp ? h : best));
      const hunting = e.type !== "harrier" || weakest.ref.hp / weakest.d.maxHp < 0.7;
      const prey = hunting ? weakest : nearest;
      if (!hunting && e.fallBackUntil > this.time) {
        move(prey, e.speed, true);
        return true;
      }
      if (distTo(prey) <= 30) {
        if (e.atkCd <= 0) {
          const base = e.damage;
          if (e.type === "stalker" && !e.struck) e.damage *= 1.5;
          this._enemyAttack(e, { kind: "hero", obj: prey });
          e.damage = base;
          e.struck = true;
          e.atkCd = e.type === "harrier" ? 0.7 : 0.9;
          if (!hunting) e.fallBackUntil = this.time + 0.6;
        }
        return true;
      }
      move(prey, e.speed * 1.1);
      return true;
    }

    if (e.type === "carrionPriest") {
      // Protector: feeds on the weak. Sacrifices a dying ally (or eats a
      // corpse) to heal and empower the rest of the squad.
      e.feedCd = (e.feedCd ?? 3) - dt;
      if (e.feedCd <= 0) {
        const victim = this.active.find((ally) => ally !== e && ally.hp > 0 && !ally.boss && ally.type !== "carrionPriest" &&
          ally.hp < ally.maxHp * 0.25 && Math.hypot(ally.x - e.x, ally.y - e.y) <= 220);
        const corpse = victim ? null : this._fallenNear(e, 220);
        if (victim || corpse) {
          e.feedCd = 5;
          if (victim) {
            victim.hp = 0;
            victim._dead = true;
            this.killed += 1;
            this.effects.push({ kind: "death", x: victim.x, y: victim.y, r: 14, life: 0.5, color: e.color });
            this._float(victim.x, victim.y - 16, "SACRIFICED", e.color);
          } else {
            this.fallen.splice(this.fallen.indexOf(corpse), 1);
            this._float(corpse.x, corpse.y - 16, "DEVOURED", e.color);
          }
          this._healAllies(e, 220, victim ? 0.2 : 0.1);
          if (victim) for (const ally of this.active) if (ally.hp > 0 && Math.hypot(ally.x - e.x, ally.y - e.y) <= 220) ally.empoweredUntil = this.time + 6;
          return true;
        }
        e.feedCd = 0.5;
      }
      const dist = distTo(nearest);
      if (dist < 170) move(nearest, e.speed * 1.2, true);
      else if (dist > 240) move(nearest, e.speed);
      else if (e.atkCd <= 0) {
        this._throwEnemyBolt(e, { kind: "hero", obj: nearest }, e.damage, e.color, true);
        e.atkCd = 2.2;
      }
      return true;
    }

    if (e.type === "watcher") {
      // Watchers make sneaking past them hard; in a fight they mark a hero,
      // leaving them exposed (+15% damage taken) for a few seconds.
      const dist = distTo(nearest);
      if (dist < 160) move(nearest, e.speed * 1.1, true);
      else if (dist > 260) move(nearest, e.speed);
      else if (e.atkCd <= 0) {
        // It picks the hero its squad is best placed to punish: the most
        // enemies close by, then the most wounded.
        const unmarked = living.filter((h) => !(h.exposedUntil > this.time));
        const pressure = (h) => this.active.filter((ally) => ally !== e && ally.hp > 0 && Math.hypot(ally.x - h.x, ally.y - h.y) <= 90).length;
        const marked = unmarked.length
          ? unmarked.reduce((best, h) => {
            const diff = pressure(h) - pressure(best);
            return diff > 0 || (diff === 0 && h.ref.hp / h.d.maxHp < best.ref.hp / best.d.maxHp) ? h : best;
          })
          : nearest;
        marked.exposedUntil = this.time + 4;
        this._float(marked.x, marked.y - 26, "MARKED", e.color);
        this._throwEnemyBolt(e, { kind: "hero", obj: marked }, e.damage, e.color, true);
        e.atkCd = 2.4;
      }
      return true;
    }

    if (e.type === "bandit" || (e.type === "banditWarlord" && e.blitzUntil > this.time)) {
      // Bandits blitz the weakest hero: a burst of speed and a heavy first strike.
      const prey = living.reduce((best, h) => (h.ref.hp / h.d.maxHp < best.ref.hp / best.d.maxHp ? h : best));
      const dist = distTo(prey);
      e.blitzCd = (e.blitzCd ?? 1.5) - dt;
      if (dist <= (e.boss ? 40 : 30)) {
        if (e.atkCd <= 0) {
          const base = e.damage;
          if (e.blitzStrike) e.damage *= 1.6;
          this._enemyAttack(e, { kind: "hero", obj: prey });
          e.damage = base;
          e.blitzStrike = false;
          e.atkCd = e.boss ? 1 : 0.75;
        }
        return true;
      }
      if (e.blitzCd <= 0 && dist > 60 && dist < 220 && !(e.blitzUntil > this.time)) {
        e.blitzUntil = this.time + 0.45;
        e.blitzCd = 6;
        e.blitzStrike = true;
        this._float(e.x, e.y - 18, "BLITZ", e.color);
      }
      move(prey, e.speed * (e.blitzUntil > this.time ? 3.2 : 1.15));
      return true;
    }

    if (e.type === "darkElf") {
      // Dark Elf sniper: hangs back, takes aim at a ranged hero (or the most
      // wounded), and fires one heavy shot. The aim line warns the target.
      const ranged = living.filter((h) => h.d.rangeMode === "midline");
      const pool = ranged.length ? ranged : living;
      const target = e.aimTarget?.alive && pool.includes(e.aimTarget) ? e.aimTarget
        : pool.reduce((best, h) => (h.ref.hp < best.ref.hp ? h : best));
      const dist = distTo(target);
      if (e.aimUntil != null) {
        if (!e.aimTarget?.alive) { e.aimUntil = null; e.aimTarget = null; return true; }
        if (this.time >= e.aimUntil) {
          this._throwEnemyBolt(e, { kind: "hero", obj: e.aimTarget }, e.damage * 2, "#F43F5E");
          e.aimUntil = null;
          e.aimTarget = null;
          e.atkCd = 2.6;
        }
        return true;
      }
      if (distTo(nearest) < 150) {
        move(nearest, e.speed * 1.1, true);
        return true;
      }
      if (dist > 330) {
        move(target, e.speed);
        return true;
      }
      if (e.atkCd <= 0) {
        e.aimUntil = this.time + 0.9;
        e.aimTarget = target;
      }
      return true;
    }

    if (e.type === "lesserNecromancer") {
      // Keeps its distance, mends the wounded, and raises one fallen ally.
      e.healCd = (e.healCd ?? 2) - dt;
      e.raiseCd = (e.raiseCd ?? 5) - dt;
      if (e.raisingUntil != null) {
        if (this.time >= e.raisingUntil) {
          e.raisingUntil = null;
          if (this._raiseFallen(e, 240, 1)) e.raised_ = true;
        }
        return true;
      }
      if (e.healCd <= 0) {
        e.healCd = 4.5;
        this._healAllies(e, 200, 0.18, 1);
      }
      if (e.raiseCd <= 0 && !e.raised_ && this._fallenNear(e, 240)) {
        e.raisingUntil = this.time + 1.5;
        e.raiseCd = 99;
        this._float(e.x, e.y - 20, "RAISE DEAD", e.color);
        this.effects.push({ kind: "charge", x: e.x, y: e.y, r: 24, life: 1.5, color: e.color });
        return true;
      }
      const dist = distTo(nearest);
      if (dist < 170) move(nearest, e.speed * 1.2, true);
      else if (dist > 230) move(nearest, e.speed);
      else if (e.atkCd <= 0) {
        this._throwEnemyBolt(e, { kind: "hero", obj: nearest }, e.damage, e.color, true);
        e.atkCd = 2;
      }
      return true;
    }
    return false;
  }

  // Familiars: attackers go for whatever is closest to their partner (melee
  // pets run in, ranged pets keep to their partner's side); support pets stay
  // close and heal or shield on a timer.
  _updatePets(dt) {
    for (const pet of this.pets) {
      const owner = pet.owner;
      if (!owner.alive) continue;
      const follow = (speed) => {
        const tx = owner.x + 18, ty = owner.y + 14;
        const dist = Math.hypot(tx - pet.x, ty - pet.y);
        if (dist > 2) {
          const step = Math.min(dist, speed * dt);
          pet.x += ((tx - pet.x) / dist) * step;
          pet.y += ((ty - pet.y) / dist) * step;
        }
      };
      const { attack, support } = pet.stats;
      if (support) {
        follow(220);
        pet.supportCd -= dt;
        if (pet.supportCd <= 0) {
          pet.supportCd = support.interval;
          if (support.heal && owner.ref.hp < owner.d.maxHp * 0.95) {
            const healed = this._classlessHeal(owner, owner.d.maxHp * support.heal);
            if (healed > 0) this._float(owner.x, owner.y - 26, `+${Math.round(healed)}`, pet.stats.color);
          }
          if (support.shield) {
            owner.ref.shield = Math.min(owner.d.maxHp * 0.3, owner.ref.shield + owner.d.maxHp * support.shield);
            this.effects.push({ kind: "shield", x: owner.x, y: owner.y, r: 18, life: 0.4, color: pet.stats.color });
          }
        }
        continue;
      }
      if (!attack) continue;
      pet.cd -= dt;
      if (!pet.target || pet.target.hp <= 0 || Math.hypot(pet.target.x - owner.x, pet.target.y - owner.y) > 320) {
        pet.target = this.active.filter((enemy) => enemy.hp > 0)
          .sort((a, b) => Math.hypot(a.x - owner.x, a.y - owner.y) - Math.hypot(b.x - owner.x, b.y - owner.y))
          .find((enemy) => Math.hypot(enemy.x - owner.x, enemy.y - owner.y) <= 320) || null;
      }
      const target = pet.target;
      if (!target) {
        follow(220);
        continue;
      }
      const dist = Math.hypot(target.x - pet.x, target.y - pet.y) || 1;
      if (attack.moveSpeed && dist > attack.range) {
        const step = Math.min(dist - attack.range * 0.8, attack.moveSpeed * dt);
        pet.x += ((target.x - pet.x) / dist) * step;
        pet.y += ((target.y - pet.y) / dist) * step;
        continue;
      }
      if (!attack.moveSpeed) follow(220);
      if (dist > attack.range || pet.cd > 0) continue;
      pet.cd = attack.interval;
      this._petStrike(pet, target);
    }
  }

  _petStrike(pet, target) {
    const { attack, color } = pet.stats;
    const owner = pet.owner;
    const sourceId = "H" + owner.i;
    const damage = attack.damage;
    this.effects.push({ kind: "impact", x: target.x, y: target.y, r: 8, life: 0.2, color });
    if (attack.mark > 0) {
      target.petMarkUntil = this.time + 3;
      target.petMarkOwner = owner.i;
      target.petMarkBonus = attack.mark;
    }
    if (attack.slow > 0) this._slowEnemy(target, attack.slow, 2);
    if (attack.burn > 0) this._applyDot(target, damage * attack.burn, 3, "#FF6600", sourceId);
    if (attack.bleed > 0) this._applyDot(target, damage * attack.bleed, 3, "#DC2626", sourceId);
    if (attack.lifelink > 0) this._classlessHeal(owner, damage * attack.lifelink);
    this._bonusDamage(target, damage, sourceId, color);
  }

  // Gauntlet hero history: what each hero did in this fight, carried back on
  // the hero model and folded into hero.history (game/qualities.js).
  _tally(h, stat, amount) {
    if (!h?.classless || !(amount > 0)) return;
    const stats = (h.model.battleStats ||= {});
    stats[stat] = (stats[stat] || 0) + amount;
  }

  // A Bulwark's ward: the support or control ally (not another Bulwark)
  // whose nearest hero is closest. Returns { ally, threat, dist } or null.
  _bulwarkWard(e, living) {
    let best = null;
    for (const ally of this.active) {
      if (ally === e || ally.hp <= 0 || ally.boss || !(C.ENEMY_ROLES[ally.type] || []).some((role) => C.WARDED_ROLES.includes(role))) continue;
      for (const h of living) {
        const dist = Math.hypot(h.x - ally.x, h.y - ally.y);
        if (!best || dist < best.dist) best = { ally, threat: h, dist };
      }
    }
    return best;
  }

  // A living Bulwark standing in the line of a hero's attack on someone
  // else. Heroes right next to their target (within 70) have got past it.
  _bulwarkCover(hero, target) {
    if (target.type === "bulwark") return null;
    const dx = target.x - hero.x, dy = target.y - hero.y;
    const length = Math.hypot(dx, dy);
    if (length <= 70) return null;
    for (const shield of this.active) {
      if (shield.type !== "bulwark" || shield.hp <= 0 || shield === target) continue;
      const t = ((shield.x - hero.x) * dx + (shield.y - hero.y) * dy) / (length * length);
      if (t <= 0.05 || t >= 0.95) continue;
      const off = Math.hypot(hero.x + dx * t - shield.x, hero.y + dy * t - shield.y);
      if (off <= 24) return shield;
    }
    return null;
  }

  // Heal living allies within `range` by `fraction` of max HP. `limit` heals
  // only the most wounded. Returns how many were healed.
  _healAllies(e, range, fraction, limit = Infinity) {
    const wounded = this.active
      .filter((ally) => ally.hp > 0 && !ally.boss && ally.hp < ally.maxHp * 0.9 && Math.hypot(ally.x - e.x, ally.y - e.y) <= range)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
      .slice(0, limit);
    for (const ally of wounded) {
      const amount = Math.min(ally.maxHp - ally.hp, ally.maxHp * fraction);
      ally.hp += amount;
      this._float(ally.x, ally.y - 14, `+${Math.round(amount)}`, "#39FF14");
      this.effects.push({ x: ally.x, y: ally.y, r: 14, life: 0.4, color: "#39FF14", ring: true });
    }
    return wounded.length;
  }

  _fallenNear(e, range) {
    return this.fallen.find((corpse) => Math.hypot(corpse.x - e.x, corpse.y - e.y) <= range) || null;
  }

  // Bring up to `count` fallen enemies near `e` back at half HP.
  _raiseFallen(e, range, count) {
    let raised = 0;
    while (raised < count) {
      const corpse = this._fallenNear(e, range);
      if (!corpse) break;
      this.fallen.splice(this.fallen.indexOf(corpse), 1);
      const dead = corpse.enemy;
      const risen = {
        ...dead, id: `raised-${this.time}-${raised}`, hp: Math.round(dead.maxHp * 0.5), raised: true,
        _dead: false, dots: [], dmgBy: {}, fuseAt: null, detonated: false, hitUntil: 0, stunUntil: 0, rootUntil: 0,
      };
      this.injectEnemy(risen);
      risen.x = corpse.x;
      risen.y = corpse.y;
      this._float(corpse.x, corpse.y - 16, "RISEN", e.color);
      this.effects.push({ kind: "death", x: corpse.x, y: corpse.y, r: 16, life: 0.6, color: e.color });
      raised += 1;
    }
    return raised;
  }

  // A sapper's bomb: area damage around it; the sapper is gone either way.
  _detonate(e, strength) {
    e.detonated = true;
    this._explodeNapalm(e.x, e.y, { dmg: e.damage * 6 * strength, splash: 72, color: "#FB923C" });
    this._float(e.x, e.y - 22, "BOOM", "#FB923C");
    this.effects.push({ kind: "impact", x: e.x, y: e.y, r: 36, life: 0.5, color: "#FB923C" });
    if (!e._dead) {
      // Blowing itself up earns the party nothing.
      e._dead = true;
      e.hp = 0;
      this.killed += 1;
    }
  }

  // The nearest hero outside a boss's melee reach, within `range`.
  _lobTarget(e, range) {
    let best = null;
    let bestDistance = range;
    for (const h of this.heroes) {
      if (!h.alive || this._isHeroUntargetable(h)) continue;
      const d = Math.hypot(h.x - e.x, h.y - e.y);
      if (d >= BOSS_MELEE_REACH && d <= bestDistance) {
        bestDistance = d;
        best = { kind: "hero", obj: h };
      }
    }
    return best;
  }

  _nearestDefender(x, y, range) {
    let best = null;
    let bd = range;
    for (const h of this.heroes) {
      if (!h.alive || this._isHeroUntargetable(h)) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= bd) {
        bd = d;
        best = { kind: "hero", obj: h };
      }
    }
    for (const t of this.towers) {
      if (t.ref.hp <= 0) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= bd) {
        bd = d;
        best = { kind: "tower", obj: t };
      }
    }
    return best;
  }

  _throwNapalm(e, target) {
    const obj = target.obj;
    const d = obj.kind === "tower" ? obj.y : obj.y;
    this.projectiles.push({
      kind: "napalm",
      sourceId: "E" + e.type,
      x: e.x,
      y: e.y,
      tx: obj.x,
      ty: d,
      target: obj,
      targetKind: target.kind,
      spd: 250,
      dmg: e.damage * 1.3,
      splash: e.splashRadius || 68,
      color: "#FF6600",
      t: 0,
    });
    // Short launch/charge flash at the boss.
    this.effects.push({ kind: "charge", x: e.x, y: e.y, r: 28, life: 0.45, color: "#FF6600" });
  }

  _explodeNapalm(x, y, p) {
    const splash = p.splash || 68;
    const victims = [];

    for (const h of this.heroes) {
      if (!h.alive) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= splash) victims.push({ kind: "hero", obj: h, dist: d });
    }
    for (const t of this.towers) {
      if (t.ref.hp <= 0) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= splash) victims.push({ kind: "tower", obj: t, dist: d });
    }

    // A bottle is a local area attack: only defenders standing in the
    // impact radius are hit. Spacing the squad therefore matters.
    for (const v of victims) {
      const falloff = 1 - 0.45 * (v.dist / splash);
      let dmg = p.dmg * falloff;
      if (v.kind === "hero") {
        const h = v.obj;
        if (Math.random() < this._heroDodgeChance(h, true)) {
          this._float(h.x, h.y - 20, "DODGE", "#00F3FF");
          continue;
        }
        dmg = h.classless ? this._classlessReducedDamage(h, dmg) : this._legacyInterposedDamage(h, dmg);
        dmg *= 1 - Math.min(0.9, h.d.gear?.blastWard || 0);
        if (h.ref.shield > 0) {
          const ab = Math.min(h.ref.shield, dmg);
          h.ref.shield -= ab;
          dmg -= ab;
        }
        if (h.classless) this._resolveClasslessHeroDamage(h, dmg);
        else h.ref.hp = Math.max(0, h.ref.hp - dmg);
        this._float(h.x, h.y - 20, "-" + Math.round(dmg), p.color || "#FF6600");
        if (!h.classless && h.ref.hp <= 0 && h.alive) {
          h.alive = false;
          this.sim.morale = clamp(this.sim.morale + C.MORALE.heroDefeat);
        }
      } else {
        const t = v.obj;
        dmg *= 0.8; // soften enemy area damage against defensive structures
        t.ref.hp = Math.max(0, t.ref.hp - dmg);
        if (t.ref.hp <= 0) {
          this.sim.morale = clamp(this.sim.morale + C.MORALE.towerDestroyed);
          this.effects.push({ x: t.x, y: t.y, r: 30, life: 0.4, color: t.d.color });
        }
        this._float(t.x, t.y - 20, "-" + Math.round(dmg), "#FF6600");
      }

      // Persistent short fire-over-time visual on the actual victim.
      this.effects.push({
        kind: "fire",
        x: v.obj.x,
        y: v.obj.y,
        life: 1.0,
        color: "#FF6600",
        target: v.obj,
        targetKind: v.kind,
      });
    }

    // Bottle shatters where it lands: flash + expanding fire ring.
    this.effects.push({ kind: "napalm", x, y, r: 16, life: 0.9, color: "#FF6600" });
    this.effects.push({ kind: "impact", x, y, r: 10, life: 0.35, color: "#FFE600" });
  }

  _triggerHeroReaction(victim, reason) {
    if (!victim) return;
    for (const h of this.heroes) {
      if (!h.alive || h === victim || h.i === this.selectedHero) continue;
      // Do not interrupt an active move/rally/retreat/explicit target.
      if (h.manualPoint || h.rallyPoint || h.rallyHold || h.retreating || h.manualTarget) continue;
      h.reactiveUntil = Math.max(h.reactiveUntil || 0, this.time + (reason === "castle" ? 5 : 3));
      h.reactiveAlly = reason === "ally" ? victim : null;
      h.reactiveReason = reason;
    }
  }

  _heroDodgeChance(hero, area = false) {
    const derived = hero?.d;
    if (!derived || !Number.isFinite(derived.maxHp) || derived.maxHp <= 0) return 0;
    const hpRatio = hero.ref.hp / derived.maxHp;
    const lowHpBonus = hpRatio < 0.35 && Number.isFinite(derived.lowHpDodge)
      ? derived.lowHpDodge
      : 0;
    const baseDodge = Number.isFinite(derived.dodge) ? derived.dodge : 0;
    const classlessBonus = hero.classless && !area
      ? derived.evasion + (hpRatio >= 1 && derived.fullHpEvasion ? derived.fullHpEvasion : 0)
      : 0;
    return Math.min(0.5, Math.max(0, baseDodge + lowHpBonus + classlessBonus));
  }

  _classlessReducedDamage(hero, rawDamage) {
    const state = hero.classlessCombatState;
    const lastStand = state?.lastStandUntil > this.time ? hero.d.lastStand : 0;
    const interpose = hero.interposeUntil > this.time ? hero.interposeReduction : 0;
    const formation = this._classlessFormationReduction(hero);
    const reduction = Math.min(0.30, Math.max(0, hero.d.damageReduction + lastStand + interpose + formation));
    // Gauntlet: Survivor quality below 30% HP; a Watcher's mark leaves a hero exposed.
    const guard = hero.ref.hp < hero.d.maxHp * 0.3 ? hero.d.traits?.lowHpGuard || 0 : 0;
    const exposed = hero.exposedUntil > this.time ? 1.15 : 1;
    return C.damageAfterDefense(rawDamage, hero.d.defense) * (1 - reduction) * (1 - (hero.d.traits?.damageTaken || 0)) * (1 - guard) * exposed
      * (1 - (hero.petGuard || 0));
  }

  _classlessFormationReduction(hero) {
    return this.heroes.reduce((highest, owner) => {
      const bonus = owner.classless && owner.alive ? owner.d.classlessEffects.formationMitigation : 0;
      return bonus > 0 && Math.hypot(owner.x - hero.x, owner.y - hero.y) <= 5
        ? Math.max(highest, bonus) : highest;
    }, 0);
  }

  _classlessOpeningBonus(target) {
    const controlledUntilBy = target?.classlessControlledUntilBy || {};
    const total = this.heroes.reduce((sum, owner) => {
      const controlUntil = controlledUntilBy[owner.i] || 0;
      return owner.classless && owner.alive && owner.d.classlessEffects.openingDamage > 0 &&
        controlUntil + 4 > this.time
        ? sum + owner.d.classlessEffects.openingDamage : sum;
    }, 0);
    return Math.min(0.5, total);
  }

  _recordClasslessControl(target, hero, expiresAt) {
    target.classlessControlledUntilBy ||= {};
    target.classlessControlledUntilBy[hero.i] = Math.max(
      target.classlessControlledUntilBy[hero.i] || 0,
      expiresAt,
    );
  }

  _takeClasslessEchoMarks(target, sourceId) {
    const heroMatch = /^H(\d+)$/.exec(String(sourceId || ""));
    if (!heroMatch || !target?.classlessEchoMarks) return [];
    const entries = [];
    for (const [ownerId, mark] of Object.entries(target.classlessEchoMarks)) {
      const owner = this.heroes[Number(ownerId)];
      const fraction = owner?.d?.classlessEffects?.echoDamageFraction || 0;
      if (mark.expiresAt <= this.time || !owner?.alive || fraction <= 0) {
        delete target.classlessEchoMarks[ownerId];
        continue;
      }
      entries.push({ sourceId: `H${owner.i}`, ownerIndex: owner.i,
        damage: owner.d.attack * fraction });
      delete target.classlessEchoMarks[ownerId];
    }
    if (Object.keys(target.classlessEchoMarks).length === 0) delete target.classlessEchoMarks;
    return entries;
  }

  _legacyInterposedDamage(hero, rawDamage) {
    const reduction = hero?.interposeUntil > this.time ? hero.interposeReduction : 0;
    const formation = this._classlessFormationReduction(hero);
    return C.damageAfterDefense(rawDamage, hero.d.defense) *
      (1 - Math.min(0.30, Math.max(0, reduction + formation)));
  }

  _resolveClasslessHeroDamage(hero, damage) {
    const state = hero.classlessCombatState;
    if (state?.decoy) {
      state.decoy = false;
      this._float(hero.x, hero.y - 20, "DECOY", "#A78BFA");
      return 0;
    }
    const remaining = Math.max(0, damage);
    if (remaining > 0) hero.hitUntil = this.time + 0.24;
    if (remaining > 0 && hero.d.decoyChance > 0 && state.mirrorReadyAt <= this.time && Math.random() < hero.d.decoyChance) {
      state.decoy = true;
      state.mirrorReadyAt = this.time + 15;
      this.effects.push({ kind: "shield", x: hero.x, y: hero.y, r: 18, life: 0.45, color: "#A78BFA" });
    }
    hero.ref.hp = Math.max(0, hero.ref.hp - remaining);
    this._tally(hero, "taken", remaining);
    if (remaining > 0) {
      state.lastDamageAt = this.time;
      state.nextRegenAt = this.time + 5;
    }
    if (hero.ref.hp / Math.max(1, hero.d.maxHp) < 0.25 && state.lastStandReadyAt <= this.time && hero.d.lastStand > 0) {
      state.lastStandUntil = this.time + 5;
      state.lastStandReadyAt = this.time + 60;
      this.effects.push({ kind: "guard", x: hero.x, y: hero.y, r: 22, life: 0.45, color: "#F59E0B" });
    }
    if (hero.ref.hp <= 0 && state.survivalUntil > this.time && state.survivalReadyAt <= this.time) {
      hero.ref.hp = 1;
      state.survivalReadyAt = this.time + 60;
      this._float(hero.x, hero.y - 22, "SURVIVE", "#DC2626");
      this.effects.push({ kind: "guard", x: hero.x, y: hero.y, r: 26, life: 0.65, color: "#DC2626" });
    }
    // Gravebinder Ring: rise once per fight.
    if (hero.ref.hp <= 0 && hero.d.gear?.revive > 0 && !hero.revived) {
      hero.revived = true;
      hero.ref.hp = Math.round(hero.d.maxHp * hero.d.gear.revive);
      this._float(hero.x, hero.y - 22, "RISE AGAIN", "#FF9F1C");
      this.effects.push({ kind: "guard", x: hero.x, y: hero.y, r: 28, life: 0.7, color: "#FF9F1C" });
    }
    if (hero.ref.hp <= 0 && hero.alive) {
      hero.alive = false;
      this.effects.push({ kind: "death", x: hero.x, y: hero.y, r: 12, life: 0.55, color: "#F02DCA" });
      this.sim.morale = clamp(this.sim.morale + C.MORALE.heroDefeat);
    }
    return remaining;
  }

  _classlessHeal(hero, requested) {
    const state = hero.classlessCombatState;
    const second = Math.floor(this.time);
    if (state.sustainSecond !== second) {
      state.sustainSecond = second;
      state.sustainRestored = 0;
    }
    const cap = hero.d.maxHp * 0.04;
    const amount = Math.max(0, Math.min(requested, cap - state.sustainRestored, hero.d.maxHp - hero.ref.hp));
    if (amount <= 0) return 0;
    state.sustainRestored += amount;
    hero.ref.hp += amount;
    return amount;
  }

  _tickClasslessSustain(hero, dt) {
    if (!hero.classless || !hero.alive) return;
    const state = hero.classlessCombatState;
    if (hero.d.regenerationBelowHalf && hero.ref.hp / hero.d.maxHp < 0.5) {
      this._classlessHeal(hero, hero.d.maxHp * hero.d.regenerationBelowHalf * dt);
    }
    if (hero.d.regeneration && this.time - state.lastDamageAt >= 5 && this.time >= state.nextRegenAt) {
      this._classlessHeal(hero, hero.d.maxHp * hero.d.regeneration);
      state.nextRegenAt = this.time + 3;
    }
  }

  // Gauntlet gear regen and environmental damage over time. Environment damage
  // never knocks a hero out on its own.
  _tickGearAndEnvironment(hero, dt) {
    if (!hero.classless || !hero.alive) return;
    const regen = hero.d.gear?.regen || 0;
    if (regen > 0) this._classlessHeal(hero, regen * dt * (1 - (hero.d.env?.healCut || 0)));
    const dot = hero.d.env?.dot || 0;
    if (dot > 0 && hero.ref.hp > 1) {
      const amount = Math.min(hero.ref.hp - 1, hero.d.maxHp * dot * dt);
      hero.ref.hp -= amount;
      hero.envDamage = (hero.envDamage || 0) + amount;
      if (hero.envDamage >= 1 && Math.floor(this.time) !== hero.envFloatSecond) {
        hero.envFloatSecond = Math.floor(this.time);
        this._float(hero.x + 10, hero.y - 14, `-${Math.round(hero.envDamage)}`, hero.d.env.color || "#FB923C");
        hero.envDamage = 0;
      }
    }
  }

  // Poison and burns on enemies: { dps, until, sourceId, color }.
  _applyDot(target, total, seconds, color, sourceId) {
    if (!(total > 0) || !(seconds > 0) || target.hp <= 0) return;
    target.dots ||= [];
    target.dots.push({ dps: total / seconds, until: this.time + seconds, sourceId, color });
    if (target.dots.length > 6) target.dots.shift();
  }

  _tickDots(e, dt) {
    if (!e.dots?.length || e.hp <= 0) return;
    let dealt = 0;
    let source = null;
    let color = null;
    for (const dot of e.dots) {
      const amount = dot.dps * Math.min(dt, Math.max(0, dot.until - (this.time - dt)));
      if (amount <= 0) continue;
      e.hp = Math.max(0, e.hp - amount);
      e.dmgBy[dot.sourceId] = (e.dmgBy[dot.sourceId] || 0) + amount;
      dealt += amount;
      source = dot.sourceId;
      color = dot.color;
    }
    e.dots = e.dots.filter((dot) => dot.until > this.time);
    e.dotDamage = (e.dotDamage || 0) + dealt;
    if (e.dotDamage >= 1 && Math.floor(this.time) !== e.dotFloatSecond) {
      e.dotFloatSecond = Math.floor(this.time);
      this._float(e.x + 8, e.y - 10, `${Math.round(e.dotDamage)}`, color || "#39FF14");
      e.dotDamage = 0;
    }
    if (e.hp <= 0 && source) this._killEnemy(e, source);
  }

  // Extra damage from splash, cleave and thorns: no crits or on-hit effects.
  _bonusDamage(target, amount, sourceId, color) {
    if (!target || target.hp <= 0 || !(amount > 0)) return;
    target.hp = Math.max(0, target.hp - amount);
    target.dmgBy[sourceId] = (target.dmgBy[sourceId] || 0) + amount;
    target.hitUntil = this.time + 0.18;
    this._float(target.x, target.y - 4, `${Math.round(amount)}`, color);
    if (target.hp <= 0) this._killEnemy(target, sourceId);
  }

  _slowEnemy(target, slow, seconds) {
    const amount = target.boss ? slow / 3 : slow;
    if (!(target.slowUntil > this.time)) target.slowMultiplier = 1;
    if (!(target.attackSlowUntil > this.time)) target.attackSlowMultiplier = 1;
    target.slowUntil = Math.max(target.slowUntil || 0, this.time + seconds);
    target.slowMultiplier = Math.min(target.slowMultiplier || 1, 1 - amount);
    target.attackSlowUntil = Math.max(target.attackSlowUntil || 0, this.time + seconds);
    target.attackSlowMultiplier = Math.min(target.attackSlowMultiplier || 1, 1 - amount);
  }

  _throwEnemyBolt(e, target, damage, color, magic = false) {
    const obj = target?.obj;
    if (!obj) return;
    this.projectiles.push({
      kind: "enemyBolt",
      sourceId: "E" + e.type,
      x: e.x,
      y: e.y,
      launchX: e.x,
      launchY: e.y,
      targetSearchRange: e.type === "darkElf" ? 340 : e.type === "warlock" ? 225
        : Math.hypot(obj.x - e.x, obj.y - e.y),
      tx: obj.x,
      ty: obj.y,
      target,
      targetKind: target.kind,
      spd: magic ? 300 : 390,
      dmg: damage,
      magic,
      color,
      visualType: magic ? "magic" : "arrow",
      vfxAssetId: projectileVfxAssetId({ visualType: magic ? "magic" : "arrow", sourceId: `E${e.type}` }),
      t: 0,
    });
    this.effects.push({ kind: "charge", x: e.x, y: e.y, r: 12, life: 0.2, color });
  }

  _resolveEnemyBolt(p) {
    if (p.targetKind === "hero" && this._isHeroUntargetable(p.target?.obj)) {
      // A projectile already in flight retargets on impact rather than
      // damaging a hero who became untargetable after it was launched.
      const replacement = this._nearestDefender(p.launchX, p.launchY, p.targetSearchRange);
      if (!replacement) return;
      p.target = replacement;
      p.targetKind = replacement.kind;
    }
    const obj = p.target?.obj;
    if (!obj) return;
    if (p.targetKind === "hero") {
      const h = obj;
      if (!h.alive || h.ref?.hp <= 0) return;
      if (Math.random() < this._heroDodgeChance(h)) {
        this._float(h.x, h.y - 20, "DODGE", "#00F3FF");
        return;
      }
      let damage = h.classless ? this._classlessReducedDamage(h, p.dmg) : this._legacyInterposedDamage(h, p.dmg);
      if (h.ref.shield > 0) {
        const absorbed = Math.min(h.ref.shield, damage);
        h.ref.shield -= absorbed;
        damage -= absorbed;
      }
      if (h.classless) this._resolveClasslessHeroDamage(h, damage);
      else h.ref.hp = Math.max(0, h.ref.hp - damage);
      this._float(h.x, h.y - 20, "-" + Math.round(damage), p.color);
      if (damage > 0) this._triggerHeroReaction(h, "ally");
      if (!h.classless && h.ref.hp <= 0 && h.alive) {
        h.alive = false;
        this.sim.morale = clamp(this.sim.morale + C.MORALE.heroDefeat);
      }
    } else if (p.targetKind === "tower") {
      const tower = obj;
      if (tower.ref.hp <= 0) return;
      const damage = p.dmg * 0.8;
      tower.ref.hp = Math.max(0, tower.ref.hp - damage);
      this._float(tower.x, tower.y - 20, "-" + Math.round(damage), p.color);
      if (tower.ref.hp <= 0) {
        this.sim.morale = clamp(this.sim.morale + C.MORALE.towerDestroyed);
        this.effects.push({ x: tower.x, y: tower.y, r: 30, life: 0.4, color: tower.d.color });
      }
    }
    this.effects.push({ kind: "impact", x: obj.x, y: obj.y, r: 9, life: 0.22, color: p.color });
  }

  _enemyAttack(e, blocker) {
    if (blocker?.kind === "hero" && this._isHeroUntargetable(blocker.obj)) {
      // Re-evaluate in the same update so a direct attack never stalls on a
      // target that became untargetable after AI selection.
      const attackRange = Math.hypot(blocker.obj.x - e.x, blocker.obj.y - e.y);
      blocker = this._nearestDefender(e.x, e.y, attackRange);
      if (!blocker) return;
    }
    if (blocker.kind === "tower") {
      const t = blocker.obj;
      const rawDamage = e.type === "darkElf" ? e.damage * 1.15 : e.damage;
      const damage = rawDamage * 0.8; // towers take 20% less direct enemy damage
      t.ref.hp = Math.max(0, t.ref.hp - damage);
      if (t.ref.hp <= 0) {
        this.sim.morale = clamp(this.sim.morale + C.MORALE.towerDestroyed);
        this.effects.push({ x: t.x, y: t.y, r: 30, life: 0.4, color: t.d.color });
      }
    } else {
      const h = blocker.obj;
      if (e.type === "warlock") {
        h.ref.shield = 0;
      }
      if (Math.random() < this._heroDodgeChance(h)) { this._float(h.x, h.y - 20, "DODGE", "#00F3FF"); return; }
      // Gauntlet behavior families: predators maul the wounded; a Carrion
      // Priest's sacrifice empowers its allies for a while.
      const predator = e.families?.includes("predator") && h.ref.hp < h.d.maxHp * 0.5 ? 1.4 : 1;
      const empowered = e.empoweredUntil > this.time ? 1.15 : 1;
      const raw = e.damage * predator * empowered;
      let dmg = h.classless ? this._classlessReducedDamage(h, raw) : this._legacyInterposedDamage(h, raw);
      if (h.ref.shield > 0) { const ab = Math.min(h.ref.shield, dmg); h.ref.shield -= ab; dmg -= ab; }
      if (h.classless) this._resolveClasslessHeroDamage(h, dmg);
      else h.ref.hp = Math.max(0, h.ref.hp - dmg);
      if (dmg > 0) this._triggerHeroReaction(h, "ally");
      if (dmg > 0 && h.d.gear?.thorns > 0 && e.hp > 0) this._bonusDamage(e, dmg * h.d.gear.thorns, "H" + h.i, "#F8FAFC");
      if (e.boss) e.hp = Math.min(e.maxHp, e.hp + dmg * 0.5); // Demon Lord lifesteal
      this._float(h.x, h.y - 20, "-" + Math.round(dmg), "#FF3366");
      if (!h.classless && h.ref.hp <= 0 && h.alive) {
        h.alive = false;
        this.sim.morale = clamp(this.sim.morale + C.MORALE.heroDefeat);
      }
    }
  }

  _fire(sourceId, src, target, d, isHero, { extra = false } = {}) {
    // Gauntlet: bows spend an arrow per shot (volley shots are free).
    let arrowEffect = null;
    if (isHero && src.classless && src.d.usesArrows && !extra) {
      arrowEffect = this._drawArrow(src);
      if (arrowEffect === false) return false;
    }
    if (isHero && src.classless) {
      src.visualActionKind = "attack";
      src.visualActionStartedAt = this.time;
      src.visualActionUntil = this.time + 0.36;
      src.facingTarget = target;
    }
    const weaponType = isHero && src.classless ? getEquippedHeroWeaponType(src.model) : null;
    const visualType = isHero
      ? (src.classless ? weaponType === "bow" ? "arrow" : weaponType === "staff" ? "magic" : null
        : src.ref?.cls === "mage" ? "magic" : src.ref?.cls === "archer" ? "arrow" : null)
      : null;
    const shot = {
      sourceId, x: src.x, y: src.y, tx: target.x, ty: target.y, target,
      heroActionIndex: isHero && src.pendingTacticalAction === "attack" && src.manualTarget === target ? src.i : null,
      spd: d.magic ? 340 : 460, dmg: (d.damage || d.attack) * this._consumeAmmoShot(src, isHero), magic: !!d.magic,
      critChance: isHero ? (d.critChance ?? C.BASE_CRIT) : C.BASE_CRIT,
      critMult: isHero ? (d.critMult ?? C.CRIT_MULT) : C.CRIT_MULT,
      perkData: isHero && !src.classless ? d : null,
      classless: isHero && !!src.classless,
      heroIndex: isHero && src.classless ? src.i : null,
      damageCategory: isHero && src.classless ? "weapon" : null,
      damageType: Object.prototype.hasOwnProperty.call(d, "damageType") ? d.damageType : (src.ref?.cls === "knight" ? C.DAMAGE_TYPES.KNIGHT_MELEE
        : src.ref?.cls === "rouge" ? C.DAMAGE_TYPES.ROUGE_MELEE
        : src.ref?.cls === "archer" ? C.DAMAGE_TYPES.ARCHER_RANGED
        : d.magic ? C.DAMAGE_TYPES.ARCANE : C.DAMAGE_TYPES.ARCHER_RANGED),
      color: isHero ? d.color : d.color, t: 0,
      visualType,
      vfxAssetId: projectileVfxAssetId({ visualType, sourceId }),
      arrowEffect,
    };
    // Gauntlet: melee weapons (swords) strike in place, with no projectile.
    if (isHero && src.classless && src.d.rangeMode === "melee") {
      this._applyHit(shot);
      if (Number.isInteger(shot.heroActionIndex)) this._completeTacticalAction(shot.heroActionIndex, "completed");
    } else {
      this.projectiles.push(shot);
    }
    if (isHero && src.classless && weaponType === "sword") {
      this.effects.push({ kind: "weapon_swing", x: src.x, y: src.y - 7, r: 15, life: 0.22,
        color: src.d.color, vfxSize: 48, rotation: Math.atan2(target.y - src.y, target.x - src.x) });
      this.effects.push({ kind: "weapon_swing", x: target.x, y: target.y, r: 18, life: 0.2,
        color: src.d.color, vfxSize: 56, rotation: Math.atan2(target.y - src.y, target.x - src.x) });
    }
    this.effects.push({ x: src.x, y: src.y, r: 8, life: 0.18, color: d.color, ring: true });
    // Whisperwind: every third shot looses extra arrows at other enemies in range.
    if (isHero && src.classless && !extra && src.d.gear?.volley > 0) {
      src.shotCount = (src.shotCount || 0) + 1;
      if (src.shotCount % 3 === 0) {
        const others = this.active
          .filter((enemy) => enemy !== target && enemy.hp > 0 && Math.hypot(enemy.x - src.x, enemy.y - src.y) <= src.d.range)
          .slice(0, src.d.gear.volley);
        for (const other of others) this._fire(sourceId, src, other, d, isHero, { extra: true });
      }
    }
    return true;
  }

  _applyHit(p) {
    if (p.classless) return this._applyClasslessHit(p);
    const e = p.target;
    const affinity = C.affinityMultiplier(e, p.damageType);
    if (affinity <= 0 || (p.magic && e.magicImmune)) {
      this._float(e.x, e.y - 4, "IMMUNE", "#39FF14");
      this.effects.push({ kind: "immune", x: e.x, y: e.y, r: 12, life: 0.32, color: "#39FF14" });
      return;
    }
    e.hitUntil = this.time + 0.18;

    const echoMarks = this._takeClasslessEchoMarks(e, p.sourceId);
    let dmg = p.dmg * affinity;
    const openingBonus = /^H\d+$/.test(String(p.sourceId || "")) ? this._classlessOpeningBonus(e) : 0;
    if (openingBonus > 0) {
      dmg *= 1 + openingBonus;
      this.effects.push({ kind: "opening", x: e.x, y: e.y, r: 18, life: 0.32, color: "#F59E0B" });
    }
    if (String(p.sourceId || "").startsWith("T")) {
      const slot = Number(String(p.sourceId).slice(1));
      const tower = this.towers.find((item) => item.slot === slot);
      if (tower?.ref?.type === "ballista" && e.boss) dmg *= 1 + (tower.d.bossDamagePct || 0);
    }
    const crit = Math.random() < (p.critChance ?? C.BASE_CRIT);
    if (crit) dmg *= (p.critMult ?? C.CRIT_MULT);

    e.hp = Math.max(0, e.hp - dmg);
    e.dmgBy[p.sourceId] = (e.dmgBy[p.sourceId] || 0) + dmg;
    let killSourceId = p.sourceId;
    for (const echo of echoMarks) {
      if (e.hp > 0 && echo.damage >= e.hp) killSourceId = echo.sourceId;
      e.hp = Math.max(0, e.hp - echo.damage);
      e.dmgBy[echo.sourceId] = (e.dmgBy[echo.sourceId] || 0) + echo.damage;
      this._float(e.x, e.y - 18, `ECHO ${Math.round(echo.damage)}`, "#A78BFA");
    }

    const affinityColor =
      affinity >= 1.25 ? "#FF66CC" :
      affinity <= 0.3 ? "#FF8A00" :
      affinity <= 0.6 ? "#00F3FF" :
      "#FFFFFF";

    const label = crit ? "CRIT " + Math.round(dmg) : Math.round(dmg);
    this._float(e.x, e.y - 4, label, crit ? "#FFE600" : affinityColor);
    this.effects.push({
      kind: "hit",
      x: e.x,
      y: e.y,
      r: crit ? 15 : 10,
      life: crit ? 0.32 : 0.22,
      color: crit ? "#FFE600" : affinityColor,
      crit,
    });

    if (p.perkData?.critHealPct && crit) {
      const hero = this.heroes.find((h) => "H" + h.i === p.sourceId);
      if (hero?.alive) hero.ref.hp = Math.min(hero.d.maxHp, hero.ref.hp + dmg * p.perkData.critHealPct);
    }
    if (
      p.perkData?.perkEffects?.cleave > 1
      && p.damageType === C.DAMAGE_TYPES.KNIGHT_MELEE
      && !p.cleaveApplied
    ) {
      const [secondary] = this._multiTargetTargets(e, p.perkData.perkEffects.cleave);
      if (secondary) this._applyHit({ ...p, target: secondary, cleaveApplied: true });
    }
    if (p.perkData?.multiTarget > 1 && !p.cleaveApplied) {
      const extra = this._multiTargetTargets(e, p.perkData.multiTarget);
      for (const other of extra) {
        this._applyHit({ ...p, target: other, dmg: p.dmg * 0.55, cleaveApplied: true });
      }
    }
    if (e.hp <= 0) this._killEnemy(e, killSourceId);
  }

  _applyClasslessHit(p) {
    const target = p.target;
    const hero = this.heroes[p.heroIndex];
    if (!target || target.hp <= 0 || !hero?.classless || !this._isValidClasslessTarget(hero, target)) return false;
    const effects = hero.d.classlessEffects;
    const affinity = p.damageType ? C.affinityMultiplier(target, p.damageType) : 1;
    if (affinity <= 0 || (p.magic && target.magicImmune)) {
      this._float(target.x, target.y - 4, "IMMUNE", "#39FF14");
      return false;
    }
    // Gauntlet darkness: some weapon attacks miss outright.
    if (p.damageCategory === "weapon" && hero.d.env?.miss > 0 && Math.random() < hero.d.env.miss) {
      this._float(target.x, target.y - 4, "MISS", "#64748B");
      return false;
    }
    target.hitUntil = this.time + 0.18;
    const echoMarks = this._takeClasslessEchoMarks(target, p.sourceId);
    let damage = p.dmg * affinity;
    if (p.damageCategory === "weapon") damage *= 1 + effects.weaponDamage;
    // Gauntlet traits and Hall of Legends bonuses (Berserker below half HP).
    const traits = hero.d.traits;
    if (traits) damage *= 1 + traits.damage + (hero.ref.hp < hero.d.maxHp * 0.5 ? traits.berserk : 0);
    damage *= 1 + (hero.d.gear?.damageBonus || 0);
    // Evolved qualities: Bladesworn (melee) and Giantslayer (elites and bosses).
    if (p.damageCategory === "weapon" && hero.d.rangeMode === "melee") damage *= 1 + (traits?.meleeDamage || 0);
    if (target.boss || target.tier === "elite") damage *= 1 + (traits?.eliteDamage || 0);
    // A hawk's mark: its partner hits the marked foe harder.
    if (target.petMarkUntil > this.time && target.petMarkOwner === hero.i) damage *= 1 + target.petMarkBonus;
    if (p.damageType === C.DAMAGE_TYPES.ARCANE) damage *= 1 + (effects.arcaneDamage || 0);
    let situationalBonus = p.situationalBonus || 0;
    if (p.ability) situationalBonus += hero.d.bloodPriceBonus || 0;
    const state = hero.classlessCombatState;
    if (effects.followThroughDamage > 0 && target.classlessLastHitBy?.[hero.i] > this.time) {
      situationalBonus += effects.followThroughDamage;
    }
    if (p.damageCategory === "weapon" && effects.markDamage > 0) {
      target.classlessMarks ||= {};
      const mark = target.classlessMarks[hero.i];
      if (mark?.expiresAt > this.time) situationalBonus += effects.markDamage;
      else target.classlessMarks[hero.i] = { expiresAt: this.time + 5, source: hero.i };
    }
    if (effects.activeTargetDamage > 0 && target.classlessActiveHitUntil > this.time &&
      target.classlessActiveHitBy === hero.i) situationalBonus += effects.activeTargetDamage;
    const openingBonus = this._classlessOpeningBonus(target);
    situationalBonus += openingBonus;
    if (p.damageCategory === "weapon" && effects.momentumDamagePerStack > 0) {
      if (state.momentumTarget !== target || this.time - state.lastDealtAt > 4) {
        state.momentumTarget = target;
        state.momentumStacks = 0;
      }
      situationalBonus += state.momentumStacks * effects.momentumDamagePerStack;
    }
    if (p.damageCategory === "weapon" && effects.ambushDamage > 0 && this.time - state.lastDealtAt >= 3 &&
      !state.ambushTargets.has(target)) situationalBonus += effects.ambushDamage;
    const consumesVanish = p.area !== true && p.damageOverTime !== true && state.vanishDamagePending > 0;
    if (consumesVanish) situationalBonus += state.vanishDamagePending;
    damage *= 1 + Math.min(0.5, situationalBonus);
    if (p.elementalBonus) damage *= 1 + Math.min(0.5, p.elementalBonus);
    // Vanish's next-hit bonus belongs to the shared situational category and
    // therefore obeys its canonical +50% cap in the damage pipeline.
    const crit = p.guaranteedCrit || Math.random() < hero.d.critChance;
    if (crit) damage *= hero.d.critMult;
    // Master Marksman: a ranged crit finishes off a badly wounded common foe.
    if (crit && p.damageCategory === "weapon" && hero.d.rangeMode === "midline" && traits?.execute > 0 &&
      !target.boss && !target.legendary && target.tier !== "elite" && target.hp - damage <= target.maxHp * traits.execute) {
      damage = Math.max(damage, target.hp);
      this._float(target.x, target.y - 16, "EXECUTE", "#FFE600");
    }
    // Bulwarks: the shield turns arrows and lets spells through; a Bulwark in
    // the line of fire takes most of a hit meant for the ally behind it, and
    // allies at its side are a little harder to hurt.
    if (target.shield && p.damageCategory === "weapon") {
      damage *= target.shield[getEquippedHeroWeaponType(hero.model)] ?? 1;
    }
    if (!p.area && !p.damageOverTime && this.active.some((enemy) => enemy.type === "bulwark" && enemy.hp > 0 && enemy !== target)) {
      const cover = this._bulwarkCover(hero, target);
      if (cover) {
        const blocked = damage * BULWARK_COVER;
        damage -= blocked;
        cover.hp = Math.max(0, cover.hp - blocked);
        cover.dmgBy[p.sourceId] = (cover.dmgBy[p.sourceId] || 0) + blocked;
        cover.hitUntil = this.time + 0.18;
        this._float(cover.x, cover.y - 18, "BLOCKED", cover.color);
        if (cover.hp <= 0) this._killEnemy(cover, p.sourceId);
      } else if (this.active.some((enemy) => enemy.type === "bulwark" && enemy.hp > 0 && enemy !== target &&
        Math.hypot(enemy.x - target.x, enemy.y - target.y) <= BULWARK_GUARD_RADIUS)) {
        damage *= 1 - BULWARK_GUARD;
      }
    }
    target.hp = Math.max(0, target.hp - damage);
    if (p.damageCategory === "weapon") {
      this._tally(hero, hero.d.rangeMode === "melee" ? "meleeHits" : "rangedHits", 1);
      if (crit) this._tally(hero, "crits", 1);
    }
    this._tally(hero, "damage", damage);
    if (consumesVanish) state.vanishDamagePending = 0;
    target.dmgBy[p.sourceId] = (target.dmgBy[p.sourceId] || 0) + damage;
    let killSourceId = p.sourceId;
    for (const echo of echoMarks) {
      if (target.hp > 0 && echo.damage >= target.hp) killSourceId = echo.sourceId;
      target.hp = Math.max(0, target.hp - echo.damage);
      target.dmgBy[echo.sourceId] = (target.dmgBy[echo.sourceId] || 0) + echo.damage;
      this._float(target.x, target.y - 18, `ECHO ${Math.round(echo.damage)}`, "#A78BFA");
    }
    target.classlessLastHitBy ||= {};
    target.classlessLastHitBy[hero.i] = this.time + 4;
    state.lastDealtAt = this.time;
    if (p.damageCategory === "weapon" && effects.momentumDamagePerStack > 0) {
      state.momentumStacks = Math.min(5, state.momentumStacks + 1);
      state.momentumTarget = target;
    }
    if (p.damageCategory === "weapon" && effects.ambushDamage > 0) state.ambushTargets.add(target);
    const label = crit ? `CRIT ${Math.round(damage)}` : `${Math.round(damage)}`;
    this._float(target.x, target.y - 4, label, crit ? "#FFE600" : hero.d.color);
    this.effects.push({ kind: "hit", x: target.x, y: target.y, r: crit ? 15 : 10, life: 0.25, color: crit ? "#FFE600" : hero.d.color, crit });
    if (p.sharedStrike) {
      hero.visualActionKind = "sharedStrike";
      hero.visualActionStartedAt = this.time;
      hero.visualActionUntil = this.time + 0.52;
      this.effects.push({ kind: "shared_strike", x: target.x, y: target.y, r: 22, life: 0.48, color: "#22D3EE" });
    }
    if (openingBonus > 0) this.effects.push({ kind: "opening", x: target.x, y: target.y, r: 18, life: 0.32, color: "#F59E0B" });
    if (echoMarks.length) this.effects.push({ kind: "echo_hit", x: target.x, y: target.y, r: 16, life: 0.4, color: "#A78BFA" });
    if (!p.ability && !p.area && hero.d.lifesteal > 0 && damage > 0) {
      const lifestealMultiplier = state.covenantUntil > this.time ? 2 : 1;
      const heal = this._classlessHeal(hero, damage * hero.d.lifesteal * lifestealMultiplier);
      if (heal > 0) this._float(hero.x, hero.y - 20, `+${Math.round(heal)}`, "#39FF14");
    }
    if (p.ability) {
      target.classlessActiveHitUntil = Math.max(target.classlessActiveHitUntil || 0, this.time + 4);
      target.classlessActiveHitBy = hero.i;
      if (effects.echoDamageFraction > 0 && state.echoReadyAt <= this.time) {
        state.echoReadyAt = this.time + effects.echoCooldownSeconds;
        if (target.hp > 0) {
          target.classlessEchoMarks ||= {};
          target.classlessEchoMarks[hero.i] = { expiresAt: this.time + effects.echoDurationSeconds };
          this.effects.push({ kind: "echo_mark", x: target.x, y: target.y, r: 18, life: Math.min(0.7, effects.echoDurationSeconds), color: "#A78BFA" });
        }
      }
    }
    if (p.damageCategory === "weapon" && effects.disruptSlow > 0 && state.nextDisruptAt <= this.time) {
      const slow = target.boss ? effects.disruptSlow / 3 : effects.disruptSlow;
      target.slowUntil = Math.max(target.slowUntil || 0, this.time + 3);
      target.slowMultiplier = Math.min(target.slowMultiplier || 1, 1 - slow);
      target.attackSlowUntil = Math.max(target.attackSlowUntil || 0, this.time + 3);
      target.attackSlowMultiplier = Math.min(target.attackSlowMultiplier || 1, 1 - slow);
      if (target.hp > 0) this._recordClasslessControl(target, hero, this.time + 3);
      state.nextDisruptAt = this.time + 8;
    }
    if (p.damageCategory === "weapon" && effects.rootEverySeconds > 0 && state.nextRootAt <= this.time) {
      const rootUntil = this.time + (target.boss ? 0.5 : 1.5);
      target.rootUntil = Math.max(target.rootUntil || 0, rootUntil);
      target.rootedBy = hero.i;
      if (target.hp > 0) this._recordClasslessControl(target, hero, rootUntil);
      state.nextRootAt = this.time + effects.rootEverySeconds;
    }
    if (p.damageCategory === "weapon" && !p.area) this._applyWeaponSpecials(hero, target, damage, p);
    if (target.hp <= 0) this._killEnemy(target, killSourceId);
    return true;
  }

  // Gauntlet on-hit effects: special arrows, then gear burn, chill and cleave.
  _applyWeaponSpecials(hero, target, damage, p) {
    const gear = hero.d.gear || {};
    const arrow = p.arrowEffect;
    if (arrow?.dot) this._applyDot(target, damage * arrow.dot, arrow.dotSeconds, arrow.dotColor, p.sourceId);
    if (arrow?.slow && target.hp > 0) this._slowEnemy(target, arrow.slow, arrow.slowSeconds);
    if (arrow?.splash) {
      this.effects.push({ kind: "napalm", x: target.x, y: target.y, r: 12, life: 0.5, color: "#FF6600" });
      for (const other of this.active) {
        if (other !== target && other.hp > 0 && Math.hypot(other.x - target.x, other.y - target.y) <= arrow.splashRadius) {
          this._bonusDamage(other, damage * arrow.splash, p.sourceId, "#FF6600");
        }
      }
    }
    if (gear.burn > 0) this._applyDot(target, damage * gear.burn, 3, "#FF6600", p.sourceId);
    if (gear.venom > 0) this._applyDot(target, damage * gear.venom, 4, "#39FF14", p.sourceId);
    // Storm crystals: a chance to arc lightning to the nearest other foe.
    if (gear.shock > 0 && Math.random() < gear.shock) {
      const arc = this.active
        .filter((other) => other !== target && other.hp > 0 && Math.hypot(other.x - target.x, other.y - target.y) <= 110)
        .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
      if (arc) {
        this.effects.push({ kind: "impact", x: arc.x, y: arc.y, r: 14, life: 0.3, color: "#FDE047" });
        this._bonusDamage(arc, damage * 0.6, p.sourceId, "#FDE047");
      }
    }
    if (gear.chill > 0 && target.hp > 0) this._slowEnemy(target, gear.chill, 2);
    if (gear.cleave > 0 && hero.d.rangeMode === "melee") {
      const next = this.active
        .filter((other) => other !== target && other.hp > 0 && Math.hypot(other.x - target.x, other.y - target.y) <= 60)
        .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
      if (next) this._bonusDamage(next, damage * gear.cleave, p.sourceId, hero.d.color);
    }
  }

  _multiTargetTargets(target, multiTarget, radius = 55) {
    return this.active
      .filter((other) => other !== target && other.hp > 0 && Math.hypot(other.x - target.x, other.y - target.y) <= radius)
      .sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
      .slice(0, multiTarget - 1);
  }

  _killEnemy(e, sourceId, silent) {
    if (e._dead) return;
    e._dead = true; e.hp = 0;
    // Gauntlet: a sapper's bomb goes off when it falls (at half strength), and
    // necromancers can raise anyone else who falls.
    if (e.bomber && !e.detonated) this._detonate(e, 0.5);
    else if (!e.boss && !e.raised) this.fallen.push({ enemy: e, x: e.x, y: e.y });
    if (e.raised) {
      // Raised dead come back once and carry nothing worth taking.
      this.killed += 1;
      this.effects.push({ kind: "death", x: e.x, y: e.y, r: 13, life: 0.48, color: e.color || "#8B5CF6" });
      if (this.cb.onKill) this.cb.onKill();
      return;
    }
    if (!silent) this.effects.push({ kind: "death", x: e.x, y: e.y, r: e.boss ? 22 : 13, life: 0.48, color: e.color || "#FF3366" });
    this.killed += 1;
    this.sim.kills.total += 1;
    this.sim.kills.byType[e.type] = (this.sim.kills.byType[e.type] || 0) + 1;

    // reward gold continuously
    const tier = C.ENEMY_TIERS[e.tier] || C.ENEMY_TIERS.basic;
    const killer = typeof sourceId === "string" && sourceId.startsWith("H") ? this.heroes[Number(sourceId.slice(1))] : null;
    if (killer) {
      this._tally(killer, "kills", 1);
      if (e.boss || e.tier === "elite") this._tally(killer, e.boss ? "bossKills" : "eliteKills", 1);
    }
    this.sim.gold += Math.round(tier.gold * (1 + (killer?.d?.traits?.goldFind || 0)));

    // Equipment drops are deposited directly into the community Vault.
    // The drop/rarity economy is tuned separately from the verified gear stats.
    // Gauntlet supplies its own loot table through sim.rollDrop (gear or consumables).
    const drop = this.sim.rollDrop ? this.sim.rollDrop(e) : rollEquipmentDrop(e, this.sim.wave || 1);
    if (drop) this.sim.vault.push(drop);

    // XP attribution
    if (e.boss) {
      const totalDmg = Object.values(e.dmgBy).reduce((a, b) => a + b, 0) || 1;
      for (const sid in e.dmgBy) {
        const share = (e.dmgBy[sid] / totalDmg) * tier.xp;
        this._awardXp(sid, share);
      }
      this.sim.morale = clamp(this.sim.morale + C.MORALE.bossKill);
    } else {
      let best = null, bestDmg = -1;
      for (const sid in e.dmgBy) if (e.dmgBy[sid] > bestDmg) { bestDmg = e.dmgBy[sid]; best = sid; }
      for (let i = 0; i < this.heroes.length; i++) {
        if (this.heroes[i].alive) this._awardXp("H" + i, Math.round(tier.xp * 0.35));
      }
      if (best) this._awardXp(best, tier.xp);
      const m = e.tier === "elite" ? C.MORALE.eliteKill : e.tier === "specialized" ? C.MORALE.specialistKill : C.MORALE.heroKill;
      if (best && best[0] === "H") this.sim.morale = clamp(this.sim.morale + m);
    }
    if (!silent) this.effects.push({ x: e.x, y: e.y, r: e.boss ? 60 : 20, life: 0.4, color: e.color });
    if (this.cb.onKill) this.cb.onKill();
  }

  _awardXp(sid, xp) {
    if (sid[0] === "H") {
      const i = +sid.slice(1);
      this.xpGains.heroes[i] = (this.xpGains.heroes[i] || 0) + xp;
    } else if (sid[0] === "T") {
      const slot = +sid.slice(1);
      this.xpGains.towers[slot] = (this.xpGains.towers[slot] || 0) + xp;
    }
  }

  _nearestEnemy(x, y, range) {
    let best = null, bd = range;
    for (const e of this.active) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }
  _selectTowerTarget(tower) {
    const cfg = tower.d;
    const pool = this.active.filter((e) => Math.hypot(e.x - tower.x, e.y - tower.y) <= cfg.range);
    if (!pool.length) return null;
    if (cfg.targetPriority === "elite_boss") {
      return pool.reduce((best, e) => {
        if (!best) return e;
        const rank = e.boss ? 3 : e.tier === "elite" ? 2 : 1;
        const bestRank = best.boss ? 3 : best.tier === "elite" ? 2 : 1;
        return rank > bestRank || (rank === bestRank && e.maxHp > best.maxHp) ? e : best;
      }, null);
    }
    if (cfg.targetPriority === "vulnerable") {
      const viable = pool.filter((e) => C.affinityMultiplier(e, cfg.damageType) > 0);
      if (!viable.length) return null;
      return viable.reduce((best, e) => {
        if (!best) return e;
        const score = C.affinityMultiplier(e, cfg.damageType);
        const bestScore = C.affinityMultiplier(best, cfg.damageType);
        if (score !== bestScore) return score > bestScore ? e : best;
        return e.hp < best.hp ? e : best;
      }, null);
    }
    if (cfg.targetPriority === "cluster") {
      return pool.reduce((best, e) => {
        const radius = cfg.splash || 55;
        const score = this.active.filter((other) => other !== e && Math.hypot(other.x - e.x, other.y - e.y) <= radius).length;
        const bestScore = best ? this.active.filter((other) => other !== best && Math.hypot(other.x - best.x, other.y - best.y) <= radius).length : -1;
        return score > bestScore ? e : best;
      }, null);
    }
    return pool.reduce((best, e) => !best || Math.hypot(e.x - tower.x, e.y - tower.y) < Math.hypot(best.x - tower.x, best.y - tower.y) ? e : best, null);
  }

  // targeting tactics driven by the hero's attack configuration
  _selectTarget(h) {
    if (h.classless) {
      if (this._isValidClasslessTarget(h, h.currentTarget)) return h.currentTarget;
      h.currentTarget = null;
      let nearest = null;
      let nearestDistance = Infinity;
      // Active order is the stable spawn order, so equal-distance ties are repeatable.
      for (const enemy of this.active) {
        if (!this._isValidClasslessTarget(h, enemy)) continue;
        const distance = Math.hypot(enemy.x - h.x, enemy.y - h.y);
        if (distance < nearestDistance) {
          nearest = enemy;
          nearestDistance = distance;
        }
      }
      h.currentTarget = nearest;
      return nearest;
    }
    const cfg = h.ref.attackConfig || "";
    const melee = h.d.range < 130;
    const pool = melee
      ? this.active.filter((e) => Math.hypot(e.x - h.x, e.y - h.y) <= 300)
      : this.active.filter((e) => Math.hypot(e.x - h.x, e.y - h.y) <= h.d.range);
    if (!pool.length) return null;
    const pick = (fn, dir) => pool.reduce((a, b) => (fn(b) * dir > fn(a) * dir ? b : a));
    if (/Weakest|Assassinate/i.test(cfg)) return pick((e) => e.hp, -1);       // lowest HP
    if (/Sniper|strongest/i.test(cfg)) return pick((e) => e.maxHp, 1);        // toughest
    if (/Guard|Defensive/i.test(cfg)) return pick((e) => e.y, 1);            // closest to keep
    if (h.ref.cls === "mage") {
      const viable = pool.filter((e) => C.affinityMultiplier(e, C.DAMAGE_TYPES.ARCANE) > 0);
      if (viable.length) {
        return viable.reduce((best, e) => {
          if (!best) return e;
          const score = C.affinityMultiplier(e, C.DAMAGE_TYPES.ARCANE);
          const bestScore = C.affinityMultiplier(best, C.DAMAGE_TYPES.ARCANE);
          return score > bestScore || (score === bestScore && e.hp < best.hp) ? e : best;
        }, null);
      }
      return null;
    }
    return pick((e) => Math.hypot(e.x - h.x, e.y - h.y), -1);                // nearest (default)
  }
  _support(h, cfg, preferredAlly = null) {
    const barrier = /Barrier/i.test(cfg);
    let preferredIsValid = false;
    if (preferredAlly?.alive && preferredAlly !== h) {
      const dist = Math.hypot(preferredAlly.x - h.x, preferredAlly.y - h.y);
      preferredIsValid = dist <= 220;
    }
    let ally = preferredIsValid ? preferredAlly : null, worst = Infinity;
    for (const a of this.heroes) {
      if (!a.alive || a === h) continue;
      const dist = Math.hypot(a.x - h.x, a.y - h.y);
      if (dist > 220) continue;
      const frac = a.ref.hp / a.d.maxHp;
      if (!preferredIsValid && frac < worst) { worst = frac; ally = a; }
    }
    if (!ally) return false;
    if (barrier) {
      const cap = ally.d.maxHp * 0.25;
      ally.ref.shield = Math.min(cap, (ally.ref.shield || 0) + 28 * h.d.healPower);
      this._float(ally.x, ally.y - 22, "+SHIELD", "#00F3FF");
      this.effects.push({ x: ally.x, y: ally.y, r: 24, life: 0.4, color: "#00F3FF" });
    } else {
      if (ally.ref.hp >= ally.d.maxHp) return false;
      const heal = 34 * h.d.healPower;
      ally.ref.hp = Math.min(ally.d.maxHp, ally.ref.hp + heal);
      this._float(ally.x, ally.y - 22, "+" + Math.round(heal), "#39FF14");
      this.effects.push({ x: ally.x, y: ally.y, r: 22, life: 0.4, color: "#39FF14" });
    }
    return true;
  }
  _nearestTower(x, y, r) {
    let best = null, bd = r;
    for (const t of this.towers) {
      if (t.ref.hp <= 0) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d <= bd) { bd = d; best = t; }
    }
    return best ? { kind: "tower", obj: best } : null;
  }
  _nearestHeroEntity(x, y, r) {
    let best = null, bd = r;
    for (const h of this.heroes) if (h.alive && !this._isHeroUntargetable(h)) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= bd) { bd = d; best = h; }
    }
    return best ? { kind: "hero", obj: best } : null;
  }

  _nearestMageEntity(x, y, r) {
    let best = null, bd = r;
    for (const h of this.heroes) {
      if (!h.alive || this._isHeroUntargetable(h) || h.ref?.type !== "mage") continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d <= bd) { bd = d; best = h; }
    }
    return best ? { kind: "hero", obj: best } : null;
  }

  _selectEnemyTacticalTarget(e) {
    if (e.type === "reaper") {
      let best = null, worst = Infinity;
      for (const h of this.heroes) {
        if (!h.alive || this._isHeroUntargetable(h)) continue;
        const d = Math.hypot(h.x - e.x, h.y - e.y);
        if (d > 260) continue;
        const frac = h.ref.hp / Math.max(1, h.d.maxHp);
        if (frac < worst) { worst = frac; best = h; }
      }
      return best ? { kind: "hero", obj: best } : null;
    }

    if (e.type === "orc") {
      return this._nearestTower(e.x, e.y, 150) || this._nearestHeroEntity(e.x, e.y, 110);
    }

    if (e.type === "lieutenant") {
      return this._nearestHeroEntity(e.x, e.y, 150) || this._nearestTower(e.x, e.y, 120);
    }

    if (e.type === "ghost") {
      return this._nearestHeroEntity(e.x, e.y, 120) || this._nearestTower(e.x, e.y, 120);
    }

    if (e.type === "darkElf") {
      return this._nearestTower(e.x, e.y, 300) || this._nearestHeroEntity(e.x, e.y, 140);
    }

    if (e.type === "warlock") {
      return this._nearestMageEntity(e.x, e.y, 300)
        || this._nearestHeroEntity(e.x, e.y, 300)
        || this._nearestTower(e.x, e.y, 300);
    }

    return null;
  }

  _enemyTargetsHero(enemy, hero) {
    if (!enemy || !hero || this._isHeroUntargetable(hero)) return false;
    const tactical = this._selectEnemyTacticalTarget(enemy);
    if (tactical) return tactical.kind === "hero" && tactical.obj === hero;
    if (enemy.boss) return this._nearestDefender(enemy.x, enemy.y, enemy.attackRange || 420)?.obj === hero;
    return this._nearestHeroEntity(enemy.x, enemy.y, 30) === hero;
  }

  // How close a melee hero must be to strike: weapon range, measured from the
  // edge of the target's body (collisions keep heroes outside it), so big
  // bosses and elites can be hit too.
  _meleeReach(h, target) {
    return h.d.range - 6 + Math.max(0, ENEMY_BODY_RADIUS(target) - ENEMY_BODY_RADIUS({}));
  }

  _resolveUnitCollisions() {
    // These are gameplay body radii, not the full glow/weapon-art bounds.
    // Bosses and elites need more room than basic units.
    const heroRadius = 15;
    const enemyRadius = ENEMY_BODY_RADIUS;
    const livingHeroes = this.heroes.filter((h) => h.alive);
    const livingEnemies = this.active.filter((e) => e.hp > 0);

    // A few short passes handle crowded groups without making collision
    // resolution expensive or changing the existing attack/target rules.
    for (let pass = 0; pass < 3; pass++) {
      const separate = (a, b, minDist, aWeight = 0.5, bWeight = 0.5) => {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) return;
        // Deterministic fallback for units that spawn at exactly the same point.
        if (dist < 0.001) {
          const seed = ((a.i ?? 0) + 1) * 17 + ((b.i ?? 0) + 1) * 31 + pass * 13;
          const angle = (seed % 360) * Math.PI / 180;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        }
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap * aWeight;
        a.y -= ny * overlap * aWeight;
        b.x += nx * overlap * bWeight;
        b.y += ny * overlap * bWeight;
      };

      // Keep heroes from stacking while allowing them to regroup and move.
      for (let i = 0; i < livingHeroes.length; i++) {
        for (let j = i + 1; j < livingHeroes.length; j++) {
          separate(livingHeroes[i], livingHeroes[j], heroRadius * 2, 0.5, 0.5);
        }
      }

      // Enemy formations spread naturally instead of becoming a single pile.
      for (let i = 0; i < livingEnemies.length; i++) {
        for (let j = i + 1; j < livingEnemies.length; j++) {
          const a = livingEnemies[i], b = livingEnemies[j];
          separate(a, b, enemyRadius(a) + enemyRadius(b), 0.5, 0.5);
        }
      }

      // Heroes and enemies can still engage and attack at close range, but
      // their bodies stop at a readable contact distance rather than merging.
      for (const h of livingHeroes) {
        for (const e of livingEnemies) {
          separate(h, e, heroRadius + enemyRadius(e), 0.5, 0.5);
        }
      }

      for (const h of livingHeroes) {
        h.x = Math.max(heroRadius, Math.min(W - heroRadius, h.x));
        h.y = Math.max(18, Math.min(FLOOR_Y - 8, h.y));
      }
      // Enemies stay on the field: heroes crowding a boss can't shove it out of reach.
      for (const e of livingEnemies) {
        const r = enemyRadius(e);
        e.x = Math.max(r, Math.min(W - r, e.x));
        e.y = Math.max(r * 0.5, Math.min(FLOOR_Y - r, e.y));
      }
    }
  }


  _returnHome(h, dt) {
    const dx = h.home.x - h.x, dy = h.home.y - h.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return;
    const spd = heroMovementSpeed(h, 150, this.time) * dt;
    h.x += (dx / d) * Math.min(spd, d);
    h.y += (dy / d) * Math.min(spd, d);
  }

  _float(x, y, text, color) { this.floaters.push({ x, y, text, color, life: 0.7 }); }

  _hud() {
    if (!this.cb.onHud) return;
    this.cb.onHud({
      total: this.wave.total, killed: this.killed,
      remaining: this.active.length + this.spawnQueue.length,
      gold: this.sim.gold,
      wave: this.wavesCleared + 1,
      heroes: this.heroes.map((h) => ({ name: h.ref.name, hp: h.ref.hp, maxHp: h.d.maxHp, alive: h.alive, shield: h.ref.shield || 0 })),
      heroAbilities: this.heroes.map((h) => this.getHeroAbilityStatus(h.i)),
      heroSpells: this.heroes.map((h) => this.getHeroSpellStatus(h.i)),
      heroQuickSlots: this.heroes.map((h) => this.getHeroQuickSlots(h.i)),
      boss: (() => { const b = this.active.find((e) => e.boss); return b ? { name: b.name, hp: b.hp, maxHp: b.maxHp } : null; })(),
    });
  }

  _checkEnd() {
    if (this.ended) return;

    // Absolute defeat conditions. Towers are supporting defenses, but they are
    // not themselves a victory condition: once the entire hero squad is dead,
    // the wave is lost even if some towers remain.
    const anyHero = this.heroes.some((h) => h.alive);
    if (!anyHero || this.forcedDefeat) {
      this.ended = true;
      this.stop();
      this.cb.onEnd && this.cb.onEnd({
        victory: false,
        reason: "heroes",
        xpGains: this.xpGains,
        killed: this.killed,
        wavesCleared: this.wavesCleared,
      });
      return;
    }

    // Victory requires the entire squad to be resolved while at least one hero is alive.
    if (this.spawnQueue.length === 0 && this.active.length === 0) {
      // Gauntlet endless mode: a cleared wave rolls straight into the next one
      // after a short breather. The fight only ends on a wipe or returnHome().
      if (this.cb.nextWave) {
        this.wavesCleared += 1;
        const next = this.cb.nextWave(this.wavesCleared);
        if (next?.enemies?.length) {
          this.wave = { ...next, total: next.enemies.length };
          this.spawnQueue = [...next.enemies];
          this.spawnTimer = ENDLESS_WAVE_BREAK_SECONDS;
          this._float(W / 2, H * 0.4, `WAVE ${this.wavesCleared + 1}`, "#00F3FF");
          return;
        }
      }
      this.ended = true;
      this.stop();
      this.cb.onEnd && this.cb.onEnd({
        victory: true,
        reason: "cleared",
        xpGains: this.xpGains,
        killed: this.killed,
        wavesCleared: this.wavesCleared,
      });
    }
  }

  // ---------------- rendering ----------------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    // field
    ctx.fillStyle = "#12131A"; ctx.fillRect(0, 0, W, H);
    // subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1;
    for (let gx = 0; gx <= W; gx += 42) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy <= H; gy += 42) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    // arena boundary
    this._neonLine(0, 6, W, 6, "#A855F7", 2);
    this._neonLine(0, FLOOR_Y, W, FLOOR_Y, "#A855F7", 2);

    const targetHighlights = new Set(
      this.targetingHero == null
        ? []
        : (this.getRangedTargetStatus(this.targetingHero)?.targets || []).map((target) => target.enemy)
    );

    // enemies — top-down sprites face DOWN toward the party.
    for (const e of this.active) {
      const r = e.boss ? 25 : e.tier === "elite" ? 16 : 11;
      this._drawEnemySprite(e);
      this._bar(e.x - r, e.y - r - 7, r * 2, 3, e.hp / e.maxHp, e.color);
      if (targetHighlights.has(e)) {
        ctx.save();
        ctx.strokeStyle = "#39FF14";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#39FF14";
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (e.type === "reaper" && e.hp > 0) {
        ctx.save();
        ctx.strokeStyle = "#A855F7";
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#A855F7";
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 4 + 2 * Math.sin(this.time * 6), 0, 7);
        ctx.stroke();
        ctx.restore();
      } else if (e.type === "darkElf" && e.hp > 0) {
        ctx.save(); ctx.strokeStyle = "#F43F5E"; ctx.lineWidth = 1.4; ctx.shadowBlur = 10; ctx.shadowColor = "#F43F5E";
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 5 + 2 * Math.sin(this.time * 8), 0, 7); ctx.stroke();
        // Sniper aim: a thin line to the target that brightens before the shot.
        if (e.aimUntil != null && e.aimTarget) {
          ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, 1 - (e.aimUntil - this.time) / 0.9);
          ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.aimTarget.x, e.aimTarget.y); ctx.stroke();
        }
        ctx.restore();
      } else if (e.bomber && e.fuseAt != null && e.hp > 0) {
        // Lit fuse: a fast-blinking blast radius.
        ctx.save(); ctx.strokeStyle = "#FB923C"; ctx.lineWidth = 2; ctx.shadowBlur = 14; ctx.shadowColor = "#FB923C";
        ctx.globalAlpha = Math.sin(this.time * 40) > 0 ? 0.9 : 0.3;
        ctx.beginPath(); ctx.arc(e.x, e.y, 72, 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.blitzUntil > this.time && e.hp > 0) {
        ctx.save(); ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.shadowBlur = 12; ctx.shadowColor = e.color; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 6, 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.raisingUntil != null && e.hp > 0) {
        ctx.save(); ctx.strokeStyle = e.color; ctx.lineWidth = 1.5; ctx.shadowBlur = 12; ctx.shadowColor = e.color; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 8 + 3 * Math.sin(this.time * 10), 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.type === "warlock" && e.hp > 0) {
        ctx.save(); ctx.strokeStyle = "#C026D3"; ctx.lineWidth = 1.4; ctx.shadowBlur = 10; ctx.shadowColor = "#C026D3"; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.arc(e.x, e.y, r + 6, 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.type === "lieutenant" && e.hp > 0) {
        ctx.save();
        ctx.strokeStyle = "#00F3FF";
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.55;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(e.x, e.y, 105, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
      if (this.heroes.some((h) => h.manual && h.manualTarget === e)) {
        ctx.save();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 7, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
    }

    // heroes — top-down sprites face UP toward incoming enemies.
    for (const h of this.heroes) {
      if (h.i === this.selectedHero && h.alive) {
        ctx.save();
        ctx.strokeStyle = h.manual ? "#F0ABFC" : h.d.color;
        ctx.lineWidth = h.manual ? 2 : 1.5;
        ctx.shadowBlur = 12;
        ctx.shadowColor = h.manual ? "#D946EF" : h.d.color;
        ctx.beginPath();
        ctx.arc(h.x, h.y + 2, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      this._drawHeroSprite(h);
      this._bar(h.x - 18, h.y + 20, 36, 4, Math.max(0, h.ref.hp) / h.d.maxHp, h.d.color);
    }
    for (const pet of this.pets) this._drawPet(pet);

    // Manual command markers make every battlefield command visually verifiable.
    for (const h of this.heroes) {
      if (!h.manual || !h.alive) continue;
      if (h.manualPoint) {
        ctx.save();
        ctx.strokeStyle = "#00F3FF";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#00F3FF";
        ctx.beginPath();
        ctx.arc(h.manualPoint.x, h.manualPoint.y, 9 + 2 * Math.sin(this.time * 8), 0, Math.PI * 2);
        ctx.moveTo(h.manualPoint.x - 14, h.manualPoint.y); ctx.lineTo(h.manualPoint.x + 14, h.manualPoint.y);
        ctx.moveTo(h.manualPoint.x, h.manualPoint.y - 14); ctx.lineTo(h.manualPoint.x, h.manualPoint.y + 14);
        ctx.stroke();
        ctx.restore();
      }
      if (h.manualTarget && h.manualTarget.hp > 0) {
        ctx.save();
        ctx.strokeStyle = "#FFE600";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#FFE600";
        ctx.beginPath();
        ctx.arc(h.manualTarget.x, h.manualTarget.y, 18 + 2 * Math.sin(this.time * 9), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // projectiles
    for (const p of this.projectiles) {
      ctx.save();
      if (p.vfxAssetId) {
        const image = getCombatEffectImage(p.vfxAssetId);
        if (drawCombatVfx(ctx, image, { kind: "projectile", x: p.x, y: p.y,
          rotation: Math.atan2(p.ty - p.y, p.tx - p.x), life: 1, vfxSize: 50 }, 0.96)) {
          ctx.restore();
          continue;
        }
      }
      if (p.kind === "napalm") {
        ctx.shadowBlur = 18; ctx.shadowColor = "#FF6600";
        ctx.fillStyle = "#FF6600";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, 7);
        ctx.fill();
        ctx.fillStyle = "#FFE600";
        ctx.beginPath();
        ctx.arc(p.x - 2, p.y - 2, 2.5, 0, 7);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,102,0,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 12, p.y + 5);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (p.magic) {
        // Arcane shots are diamonds so they remain visually distinct from arrows.
        ctx.shadowBlur = 14; ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 5, p.y);
        ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 5, p.y); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 0.8; ctx.stroke();
      } else {
        // Physical shots get a short directional streak.
        ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        const dx = p.tx - p.x, dy = p.ty - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        ctx.beginPath();
        ctx.moveTo(p.x - ux * 7, p.y - uy * 7);
        ctx.lineTo(p.x + ux * 3, p.y + uy * 3);
        ctx.stroke();
      }
      ctx.restore();
    }
    // effects
    for (const fx of this.effects) {
      const alpha = Math.max(0, Math.min(1, fx.life * 2.2));
      ctx.save();
      const vfxAsset = combatVfxAssetId(fx);
      if (vfxAsset && drawCombatVfx(ctx, getCombatEffectImage(vfxAsset), fx, alpha)) {
        ctx.restore();
        continue;
      }

      if (fx.kind === "shared_strike") {
        const radius = fx.r + (1 - fx.life) * 26;
        ctx.globalAlpha = alpha;
        ctx.lineCap = "round";
        ctx.shadowBlur = 18;
        ctx.shadowColor = "#22D3EE";
        ctx.strokeStyle = "#22D3EE";
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, radius, -2.2, 0.55); ctx.stroke();
        ctx.shadowColor = "#F02DCA";
        ctx.strokeStyle = "#F02DCA";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, radius - 5, -2.05, 0.35); ctx.stroke();
      } else if (fx.kind === "weapon_swing") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color; ctx.lineWidth = 2.2;
        ctx.shadowBlur = 13; ctx.shadowColor = fx.color;
        const radius = fx.r + (1 - fx.life) * 9;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, radius, -2.4, -0.2); ctx.stroke();
      } else if (fx.kind === "trail") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color; ctx.lineWidth = 4;
        ctx.shadowBlur = 12; ctx.shadowColor = fx.color;
        ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.quadraticCurveTo((fx.x + fx.toX) / 2 - 8, (fx.y + fx.toY) / 2, fx.toX, fx.toY); ctx.stroke();
      } else if (fx.kind === "smoke") {
        ctx.globalAlpha = alpha * 0.75;
        ctx.shadowBlur = 12; ctx.shadowColor = fx.color;
        for (let i = 0; i < 3; i += 1) {
          ctx.strokeStyle = i % 2 ? "#F02DCA" : fx.color;
          ctx.lineWidth = 3 - i * 0.5;
          ctx.beginPath(); ctx.arc(fx.x + (i - 1) * 4, fx.y - i * 3, fx.r * (0.45 + i * 0.16) + (1 - fx.life) * 9, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (fx.kind === "echo_mark" || fx.kind === "echo_hit" || fx.kind === "opening") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color; ctx.lineWidth = fx.kind === "opening" ? 2.8 : 2;
        ctx.shadowBlur = 12; ctx.shadowColor = fx.color;
        const radius = fx.r + (1 - fx.life) * 15;
        ctx.beginPath();
        if (fx.kind === "opening") {
          for (let i = 0; i < 6; i += 1) {
            const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
            const x = fx.x + Math.cos(a) * radius, y = fx.y + Math.sin(a) * radius;
            if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
        } else ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.kind === "guard" || fx.kind === "covenant" || fx.kind === "blood_price") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color; ctx.lineWidth = fx.kind === "blood_price" ? 3 : 2.5;
        ctx.shadowBlur = 16; ctx.shadowColor = fx.color;
        const radius = fx.r + (1 - fx.life) * 12;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, radius, fx.kind === "blood_price" ? -2.4 : 0, fx.kind === "blood_price" ? 0.5 : Math.PI * 2); ctx.stroke();
        if (fx.kind === "covenant") {
          ctx.strokeStyle = "#F9A8D4"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(fx.x, fx.y, radius - 5, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (fx.kind === "death") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color; ctx.lineWidth = 2;
        ctx.shadowBlur = 14; ctx.shadowColor = fx.color;
        for (let i = 0; i < 5; i += 1) {
          const a = i * (Math.PI * 2 / 5);
          const r1 = 4 + (1 - fx.life) * 7, r2 = 13 + (1 - fx.life) * 23;
          ctx.beginPath(); ctx.moveTo(fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1);
          ctx.lineTo(fx.x + Math.cos(a) * r2, fx.y + Math.sin(a) * r2); ctx.stroke();
        }
      } else if (fx.kind === "fire") {
        const pulse = 1 + 0.12 * Math.sin(this.time * 24 + fx.x);
        const base = 13 * pulse;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 22; ctx.shadowColor = "#FF6600";
        ctx.fillStyle = "#FF6600";
        ctx.beginPath(); ctx.arc(fx.x, fx.y, base, 0, 7); ctx.fill();
        ctx.fillStyle = "#FFE600";
        ctx.beginPath(); ctx.arc(fx.x - 2, fx.y - 4, base * 0.55, 0, 7); ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath(); ctx.arc(fx.x - 3, fx.y - 6, base * 0.2, 0, 7); ctx.fill();
        // small rising flame tongues
        for (let i = 0; i < 3; i++) {
          const ox = (i - 1) * 7;
          const rise = 7 + ((this.time * 22 + i * 9) % 12);
          ctx.globalAlpha = alpha * 0.8;
          ctx.fillStyle = i === 1 ? "#FFE600" : "#FF6600";
          ctx.beginPath();
          ctx.arc(fx.x + ox, fx.y - rise, 4 - i * 0.5, 0, 7);
          ctx.fill();
        }
      } else if (fx.kind === "napalm") {
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 28; ctx.shadowColor = "#FF6600";
        ctx.strokeStyle = "#FF6600"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r + (1 - fx.life) * 54, 0, 7); ctx.stroke();
        ctx.fillStyle = "#FF6600";
        ctx.beginPath(); ctx.arc(fx.x, fx.y, 10 + (1 - fx.life) * 18, 0, 7); ctx.fill();
        ctx.fillStyle = "#FFE600";
        ctx.beginPath(); ctx.arc(fx.x, fx.y, 4 + (1 - fx.life) * 9, 0, 7); ctx.fill();
      } else if (fx.kind === "charge") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#FF6600"; ctx.lineWidth = 3;
        ctx.shadowBlur = 20; ctx.shadowColor = "#FF6600";
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r + (1 - fx.life) * 18, 0, 7); ctx.stroke();
        ctx.strokeStyle = "#FFE600";
        ctx.beginPath(); ctx.arc(fx.x, fx.y, 8 + (1 - fx.life) * 10, 0, 7); ctx.stroke();
      } else if (fx.kind === "hit") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = fx.crit ? 2.5 : 1.8;
        ctx.shadowBlur = 14; ctx.shadowColor = fx.color;
        const radius = fx.r + (1 - fx.life) * (fx.crit ? 12 : 8);
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, radius, 0, 7);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fx.x - radius * 0.8, fx.y);
        ctx.lineTo(fx.x + radius * 0.8, fx.y);
        ctx.moveTo(fx.x, fx.y - radius * 0.8);
        ctx.lineTo(fx.x, fx.y + radius * 0.8);
        ctx.stroke();
      } else if (fx.kind === "immune") {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 14; ctx.shadowColor = fx.color;
        const radius = fx.r + (1 - fx.life) * 10;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, radius, 0, 7);
        ctx.moveTo(fx.x - radius, fx.y);
        ctx.lineTo(fx.x + radius, fx.y);
        ctx.moveTo(fx.x, fx.y - radius);
        ctx.lineTo(fx.x, fx.y + radius);
        ctx.stroke();
      } else {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.color; ctx.lineWidth = 2; ctx.shadowBlur = 12; ctx.shadowColor = fx.color;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (1 - fx.life), 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
    // floaters
    ctx.textAlign = "center"; ctx.font = "bold 11px JetBrains Mono, monospace";
    for (const f of this.floaters) {
      ctx.save(); ctx.globalAlpha = Math.max(0, f.life * 1.4);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); ctx.restore();
    }
  }

  // A small neon familiar, shaped by species, outlined in its partner's color.
  _drawPet(pet) {
    const ctx = this.ctx;
    const { species, color } = pet.stats;
    ctx.save();
    ctx.translate(pet.x, pet.y + Math.sin(this.time * 4 + pet.owner.i) * (species === "hawk" || species === "sprite" ? 3 : 0.5));
    ctx.scale(1.4, 1.4);
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.fillStyle = "#0B1018";
    ctx.lineWidth = 1.4;
    ctx.shadowBlur = 8;
    ctx.shadowColor = pet.owner.d.color;
    ctx.beginPath();
    if (species === "wolf") {
      ctx.moveTo(-7, 3); ctx.lineTo(-3, -2); ctx.lineTo(4, -2); ctx.lineTo(7, -6); ctx.lineTo(8, -1); ctx.lineTo(5, 3); ctx.lineTo(5, 6); ctx.lineTo(-6, 6); ctx.closePath();
    } else if (species === "hawk") {
      ctx.moveTo(-9, -1); ctx.lineTo(0, -4); ctx.lineTo(9, -1); ctx.lineTo(2, 1); ctx.lineTo(0, 5); ctx.lineTo(-2, 1); ctx.closePath();
    } else if (species === "imp") {
      ctx.moveTo(-5, 5); ctx.lineTo(-5, -3); ctx.lineTo(-7, -7); ctx.lineTo(-2, -4); ctx.lineTo(2, -4); ctx.lineTo(7, -7); ctx.lineTo(5, -3); ctx.lineTo(5, 5); ctx.closePath();
    } else if (species === "sprite") {
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.moveTo(-4, -1); ctx.quadraticCurveTo(-10, -7, -6, 2); ctx.moveTo(4, -1); ctx.quadraticCurveTo(10, -7, 6, 2);
    } else {
      ctx.ellipse(0, 1, 8, 5, 0, 0, Math.PI * 2);
      ctx.moveTo(8, 0); ctx.arc(10, -1, 2.5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawHeroSprite(h) {
    const ctx = this.ctx;
    const previous = h.lastDrawPosition || { x: h.x, y: h.y };
    const dx = h.x - previous.x, dy = h.y - previous.y;
    const moving = dx * dx + dy * dy > 0.12;
    const target = [h.facingTarget, h.manualTarget, h.currentTarget]
      .find((candidate) => candidate && candidate.hp > 0);
    const facingX = target ? target.x - h.x : moving ? dx : 0;
    const facingY = target ? target.y - h.y : moving ? dy : -1;
    const facing = h.classless ? Math.atan2(facingX, -facingY) : 0;
    const action = h.visualActionUntil > this.time ? h.visualActionKind : null;
    const frame = selectHeroSpriteFrame({
      alive: h.alive,
      hit: h.hitUntil > this.time,
      moving,
      running: h.retreating || !!h.manualPoint,
      action,
    }, action ? this.time - h.visualActionStartedAt : this.time);
    const alpha = h.alive ? (h.protect > 0 ? 0.58 : 1) : 0.52;
    const identityColor = isNeonIdentityColor(h.model?.appearance?.identityColor)
      ? h.model.appearance.identityColor : h.d.color || "#22D3EE";
    const accentColor = h.model?.appearance?.accentColor || identityColor;
    const legacyWeapon = ({ knight: "sword", rouge: "sword", archer: "bow", mage: "staff" })[h.ref?.cls];
    const weaponType = getEquippedHeroWeaponType(h.model || h.ref) || legacyWeapon;

    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.globalAlpha = alpha;
    // All heroes now share the supplied body art. Class remains gameplay data;
    // legacy weapons are preserved as compatible visual overlays.
    ctx.rotate(facing);
    const image = getHeroSpriteImage();
    if (image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      // Gauntlet: each hero's own neon shade, plus a soft glow in that color.
      ctx.filter = heroSpriteFilter(h.model?.appearance);
      ctx.shadowBlur = 7;
      ctx.shadowColor = identityColor;
      ctx.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, -24, -44, 48, 48);
      ctx.filter = "none";
      // Equipped armor shows as simple shapes in each piece's rarity colour.
      if (h.alive && h.model?.equipment) {
        ctx.save();
        ctx.translate(-24, -44);
        ctx.scale(0.75, 0.75);
        drawGearMarks(ctx, heroGearMarks(h.model.equipment));
        ctx.restore();
      }
    } else {
      // Missing-image fallback is a neutral silhouette, never the old
      // class-specific procedural character artwork.
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowBlur = 12;
      ctx.shadowColor = h.hitUntil > this.time ? "#F02DCA" : identityColor;
      ctx.fillStyle = "#050912";
      ctx.strokeStyle = h.hitUntil > this.time ? "#F02DCA" : identityColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, 10); ctx.lineTo(-7, -8); ctx.lineTo(0, -17);
      ctx.lineTo(7, -8); ctx.lineTo(9, 10); ctx.lineTo(0, 15); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#F02DCA";
      ctx.beginPath(); ctx.moveTo(7, 5); ctx.lineTo(11, -14); ctx.stroke();
    }

    const weaponImage = getClasslessWeaponImage(weaponType);
    if (weaponImage?.complete && weaponImage.naturalWidth > 0) {
      ctx.shadowBlur = 5;
      ctx.shadowColor = identityColor;
      // Drawn a little larger than the body frame so the weapon reads clearly.
      ctx.drawImage(weaponImage, 0, 0, 48, 48, -30, -50, 60, 60);
    }
    ctx.shadowBlur = 6;
    ctx.shadowColor = accentColor;
    ctx.fillStyle = accentColor;
    ctx.fillRect(-1.75, -34, 3.5, 3.5);
    ctx.restore();

    const formation = h.d.classlessEffects?.formationMitigation || 0;
    const allyNearby = this.heroes.some((ally) => ally !== h && ally.alive && Math.hypot(ally.x - h.x, ally.y - h.y) <= 5);
    if (formation > 0 && allyNearby) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "#22D3EE";
      ctx.lineWidth = 1.5;
      ctx.setLineDash?.([3, 3]);
      ctx.beginPath(); ctx.arc(h.x, h.y - 3, 22, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    h.lastDrawPosition.x = h.x;
    h.lastDrawPosition.y = h.y;
  }
  _drawEnemySprite(e) {
    const ctx = this.ctx;
    const color = e.color;
    const boss = !!e.boss;
    const elite = e.tier === "elite";
    const s = boss ? 1.85 : elite ? 1.35 : 1;

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(s, s);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowBlur = boss ? 18 : elite ? 13 : 9;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;

    const outline = () => { ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke(); };
    const neon = (width = 2) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowBlur = 8; ctx.shadowColor = color; };
    const eye = (x, y, r = 2) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };

    if (e.type === "ghost") {
      // Floating sheet silhouette with a clear face and trailing tail.
      ctx.fillStyle = "#10131D";
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.bezierCurveTo(-10, -12, -12, -3, -10, 6);
      ctx.lineTo(-7, 12); ctx.lineTo(-3, 7); ctx.lineTo(0, 13);
      ctx.lineTo(4, 7); ctx.lineTo(8, 12); ctx.lineTo(10, 5);
      ctx.bezierCurveTo(12, -5, 9, -12, 0, -14);
      ctx.closePath(); ctx.fill(); outline();
      eye(-3, 0, 2.2); eye(3, 0, 2.2);
      neon(1.4); ctx.beginPath(); ctx.moveTo(-3, 7); ctx.lineTo(0, 9); ctx.lineTo(3, 7); ctx.stroke();
    } else if (e.type === "slime") {
      // Low, translucent-looking toxic blob with crown-like drips.
      ctx.fillStyle = "#102016";
      ctx.beginPath();
      ctx.moveTo(-13, 8); ctx.quadraticCurveTo(-12, -5, -7, -9);
      ctx.quadraticCurveTo(0, -14, 7, -9); ctx.quadraticCurveTo(12, -5, 13, 8);
      ctx.lineTo(8, 11); ctx.lineTo(4, 8); ctx.lineTo(0, 13);
      ctx.lineTo(-4, 8); ctx.lineTo(-9, 11); ctx.closePath();
      ctx.fill(); outline();
      eye(-4, 0, 2); eye(4, 0, 2);
      neon(1.4); ctx.beginPath(); ctx.moveTo(-6, 5); ctx.quadraticCurveTo(0, 8, 6, 5); ctx.stroke();
    } else if (e.type === "goblin") {
      // Small angular raider: ears, brow, torso and a short blade.
      ctx.fillStyle = "#152016";
      ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(-8, -7); ctx.lineTo(0, -11);
      ctx.lineTo(8, -7); ctx.lineTo(7, 1); ctx.lineTo(5, 8); ctx.lineTo(-5, 8); ctx.closePath();
      ctx.fill(); outline();
      ctx.fillStyle = "#17261A";
      ctx.beginPath(); ctx.moveTo(-7, -5); ctx.lineTo(-16, -11); ctx.lineTo(-10, 1); ctx.closePath();
      ctx.moveTo(7, -5); ctx.lineTo(16, -11); ctx.lineTo(10, 1); ctx.closePath(); ctx.fill(); outline();
      eye(-3, 0, 1.8); eye(3, 0, 1.8);
      neon(2.3); ctx.beginPath(); ctx.moveTo(8, 7); ctx.lineTo(16, -5); ctx.stroke();
    } else if (e.type === "bulwark") {
      // Broad armored figure behind a tall tower shield; a faint tether shows
      // which ally it is guarding.
      if (e.guarding?.hp > 0) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.setLineDash?.([3, 4]);
        neon(1);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.guarding.x - e.x, e.guarding.y - e.y); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = "#0E1622";
      ctx.beginPath(); ctx.arc(0, -7, 10, 0, Math.PI * 2); ctx.fill(); outline();
      eye(-3, -10, 1.6); eye(3, -10, 1.6);
      ctx.fillStyle = "#132033";
      ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(14, -2); ctx.lineTo(14, 9); ctx.lineTo(0, 18); ctx.lineTo(-14, 9); ctx.closePath(); ctx.fill();
      neon(2.4); ctx.stroke();
      neon(1.2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 15); ctx.moveTo(-11, 5); ctx.lineTo(11, 5); ctx.stroke();
    } else if (e.type === "gnome") {
      // Same family as goblin, but with the distinctive tall neon cap.
      ctx.fillStyle = "#172019";
      ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill(); outline();
      ctx.fillStyle = "#10171D";
      ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(0, -20); ctx.lineTo(9, -5); ctx.closePath(); ctx.fill(); outline();
      neon(1.2); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -6); ctx.stroke();
      eye(-3, 3, 1.8); eye(3, 3, 1.8);
      neon(2); ctx.beginPath(); ctx.moveTo(7, 7); ctx.lineTo(14, -3); ctx.stroke();
    } else if (e.type === "bandit") {
      // Hooded raider with a face mask and twin knives.
      ctx.fillStyle = "#1A1508";
      ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(-8, -4); ctx.lineTo(0, -13); ctx.lineTo(8, -4); ctx.lineTo(8, 10); ctx.closePath(); ctx.fill(); outline();
      ctx.fillStyle = "#0A0904"; ctx.fillRect(-6, -4, 12, 5);
      eye(-3, -6, 1.6); eye(3, -6, 1.6);
      neon(2.2); ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(-15, -2); ctx.moveTo(8, 6); ctx.lineTo(15, -2); ctx.stroke();
    } else if (e.type === "lesserNecromancer") {
      // Robed caster with a skull-topped staff.
      ctx.fillStyle = "#120B1F";
      ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-8, -4); ctx.lineTo(0, -14); ctx.lineTo(8, -4); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill(); outline();
      ctx.fillStyle = "#05030A"; ctx.beginPath(); ctx.arc(0, -4, 5.5, 0, Math.PI * 2); ctx.fill();
      eye(-2.5, -4, 1.6); eye(2.5, -4, 1.6);
      neon(1.8); ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-13, -14); ctx.stroke();
      ctx.beginPath(); ctx.arc(-13, -17, 3.5, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === "harrier" || e.type === "stalker") {
      // Low four-legged hunters: a lean body, pointed ears and a long tail.
      const big = e.type === "stalker" ? 1.25 : 1;
      ctx.scale(big, big);
      ctx.fillStyle = "#14100A";
      ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(-6, -4); ctx.lineTo(6, -5); ctx.lineTo(12, -11); ctx.lineTo(14, -3);
      ctx.lineTo(9, 3); ctx.lineTo(8, 10); ctx.lineTo(4, 4); ctx.lineTo(-6, 5); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); outline();
      neon(1.4); ctx.beginPath(); ctx.moveTo(-12, 4); ctx.quadraticCurveTo(-18, -2, -16, -9); ctx.stroke();
      eye(11, -6, 1.6);
    } else if (e.type === "carrionPriest") {
      // Hunched, beaked figure with a hooked staff.
      ctx.fillStyle = "#170C10";
      ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-9, -2); ctx.lineTo(-2, -12); ctx.lineTo(6, -9); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill(); outline();
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(1, -7); ctx.lineTo(11, -4); ctx.lineTo(2, -3); ctx.fill();
      eye(-1, -7, 1.5);
      neon(1.8); ctx.beginPath(); ctx.moveTo(-11, 12); ctx.lineTo(-13, -12); ctx.quadraticCurveTo(-8, -18, -6, -12); ctx.stroke();
    } else if (e.type === "watcher") {
      // A floating eye in a ring of spines.
      ctx.fillStyle = "#0C1418";
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); outline();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#05080A"; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
      neon(1.2);
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11); ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.stroke();
      }
    } else if (e.type === "skeleton") {
      // Minimal skull/ribcage silhouette — intentionally readable at small size.
      ctx.fillStyle = "#111922";
      ctx.beginPath(); ctx.arc(0, -5, 8.5, 0, Math.PI * 2); ctx.fill(); outline();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-3, -5, 2, 0, Math.PI * 2); ctx.arc(3, -5, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111922";
      ctx.beginPath(); ctx.moveTo(-7, 3); ctx.lineTo(7, 3); ctx.lineTo(6, 12); ctx.lineTo(0, 15); ctx.lineTo(-6, 12); ctx.closePath(); ctx.fill();
      neon(1.4);
      for (let y = 5; y <= 11; y += 3) { ctx.beginPath(); ctx.moveTo(-5, y); ctx.lineTo(5, y); ctx.stroke(); }
      neon(2); ctx.beginPath(); ctx.moveTo(8, 9); ctx.lineTo(15, -8); ctx.stroke();
    } else if (e.type === "zombie") {
      // Slumped humanoid silhouette with a torn shoulder and reaching arm.
      ctx.fillStyle = "#171429";
      ctx.beginPath(); ctx.arc(0, -6, 8.5, 0, Math.PI * 2); ctx.fill(); outline();
      ctx.fillStyle = "#0E1420";
      ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(7, 1); ctx.lineTo(9, 12); ctx.lineTo(-9, 12); ctx.closePath(); ctx.fill(); outline();
      eye(-3, -5, 2); eye(3, -3, 1.2);
      neon(2.3); ctx.beginPath(); ctx.moveTo(8, 5); ctx.lineTo(16, 1); ctx.lineTo(19, 6); ctx.stroke();
      neon(1.2); ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(-10, 10); ctx.stroke();
    } else if (e.type === "orc") {
      // Broad armored brute with tusks and a heavy axe.
      ctx.fillStyle = "#101A16";
      ctx.beginPath(); ctx.moveTo(-11, -3); ctx.lineTo(-8, -11); ctx.lineTo(0, -14);
      ctx.lineTo(8, -11); ctx.lineTo(11, -3); ctx.lineTo(9, 10); ctx.lineTo(-9, 10); ctx.closePath();
      ctx.fill(); outline();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(-5, 5); ctx.lineTo(-9, 11); ctx.lineTo(-2, 9);
      ctx.moveTo(5, 5); ctx.lineTo(9, 11); ctx.lineTo(2, 9); ctx.fill();
      eye(-3, -1, 2); eye(3, -1, 2);
      neon(2.8); ctx.beginPath(); ctx.moveTo(9, 7); ctx.lineTo(16, -10); ctx.stroke();
      neon(2); ctx.beginPath(); ctx.moveTo(13, -14); ctx.lineTo(20, -10); ctx.stroke();
    } else if (e.type === "darkElf") {
      ctx.fillStyle = "#160A16";
      ctx.beginPath(); ctx.moveTo(-9, 11); ctx.lineTo(-8, -6); ctx.lineTo(0, -14); ctx.lineTo(8, -6); ctx.lineTo(9, 11); ctx.closePath(); ctx.fill(); outline();
      ctx.fillStyle = "#05050A"; ctx.beginPath(); ctx.arc(0, -3, 6, 0, Math.PI * 2); ctx.fill();
      eye(-3, -3, 2); eye(3, -3, 2);
      neon(2.3); ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(-16, -7); ctx.moveTo(7, 7); ctx.lineTo(16, -7); ctx.stroke();
      neon(1.4); ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-15, -13); ctx.moveTo(8, -7); ctx.lineTo(15, -13); ctx.stroke();
    } else if (e.type === "warlock") {
      ctx.fillStyle = "#16091A";
      ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-9, -4); ctx.lineTo(0, -15); ctx.lineTo(9, -4); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill(); outline();
      ctx.fillStyle = "#05030A"; ctx.beginPath(); ctx.arc(0, -5, 6, 0, Math.PI * 2); ctx.fill();
      eye(-3, -5, 1.8); eye(3, -5, 1.8);
      neon(2); ctx.beginPath(); ctx.moveTo(8, 12); ctx.lineTo(13, -15); ctx.stroke();
      ctx.fillStyle = color; ctx.shadowBlur = 14; ctx.shadowColor = color;
      ctx.beginPath(); ctx.arc(14, -18, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-9, 7, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "reaper") {
      // Hooded elite with scythe — deliberately different from the lieutenant.
      ctx.fillStyle = "#12081B";
      ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(-9, -6); ctx.lineTo(0, -16);
      ctx.lineTo(9, -6); ctx.lineTo(10, 10); ctx.closePath(); ctx.fill(); outline();
      ctx.fillStyle = "#05050A";
      ctx.beginPath(); ctx.arc(0, -3, 6, 0, Math.PI * 2); ctx.fill();
      eye(-3, -2, 1.8); eye(3, -2, 1.8);
      neon(2.4); ctx.beginPath(); ctx.moveTo(7, 9); ctx.lineTo(17, -14); ctx.stroke();
      ctx.beginPath(); ctx.arc(19, -14, 7, Math.PI * 0.9, Math.PI * 1.8); ctx.stroke();
    } else if (e.type === "lieutenant") {
      // Armored elite commander with a ringed shoulder and spear.
      ctx.fillStyle = "#101923";
      ctx.beginPath(); ctx.moveTo(-11, 10); ctx.lineTo(-9, -7); ctx.lineTo(0, -15);
      ctx.lineTo(9, -7); ctx.lineTo(11, 10); ctx.closePath(); ctx.fill(); outline();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-3, -2, 1.8, 0, Math.PI * 2); ctx.arc(3, -2, 1.8, 0, Math.PI * 2); ctx.fill();
      neon(2.2); ctx.beginPath(); ctx.moveTo(8, 9); ctx.lineTo(14, -17); ctx.stroke();
      neon(1.6); ctx.beginPath(); ctx.arc(-12, 7, 6, 0, Math.PI * 2); ctx.stroke();
    } else {
      // Boss silhouettes keep a common Demonanic frame but have unique crowns.
      ctx.fillStyle = "#170A14";
      ctx.beginPath();
      ctx.moveTo(-21, 12); ctx.lineTo(-19, -5); ctx.lineTo(-30, -14);
      ctx.lineTo(-13, -12); ctx.lineTo(0, -20); ctx.lineTo(13, -12);
      ctx.lineTo(30, -14); ctx.lineTo(19, -5); ctx.lineTo(21, 12);
      ctx.lineTo(0, 20); ctx.closePath(); ctx.fill(); outline();
      eye(-9, 2, 2.8); eye(9, 2, 2.8);

      if (e.type === "demon") {
        neon(2.7);
        ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-23, -25);
        ctx.moveTo(12, -10); ctx.lineTo(23, -25); ctx.stroke();
        ctx.fillStyle = "#080309"; ctx.beginPath(); ctx.arc(0, 2, 5, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === "imperialNecromancer") {
        neon(1.7);
        ctx.beginPath(); ctx.arc(0, -7, 6, 0, Math.PI * 2);
        ctx.moveTo(-20, 3); ctx.lineTo(-13, -4); ctx.moveTo(20, 3); ctx.lineTo(13, -4); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -7, 3, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === "banditWarlord") {
        neon(2.2);
        ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-8, -22); ctx.lineTo(0, -14); ctx.lineTo(8, -22); ctx.lineTo(14, -12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-24, 8); ctx.lineTo(-34, -6); ctx.moveTo(24, 8); ctx.lineTo(34, -6); ctx.stroke();
      } else if (e.type === "bogLich") {
        ctx.fillStyle = "#0B1A08";
        ctx.beginPath(); ctx.arc(0, -6, 8, 0, Math.PI * 2); ctx.fill();
        neon(1.8);
        ctx.beginPath(); ctx.arc(0, -6, 8, 0, Math.PI * 2);
        ctx.moveTo(-18, 14); ctx.quadraticCurveTo(-26, 22, -20, 28); ctx.moveTo(18, 14); ctx.quadraticCurveTo(26, 22, 20, 28); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-3, -6, 1.8, 0, Math.PI * 2); ctx.arc(3, -6, 1.8, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === "nuclearBehemoth") {
        ctx.fillStyle = "#0A1710";
        ctx.beginPath(); ctx.arc(-11, 5, 6, 0, Math.PI * 2); ctx.arc(11, 5, 6, 0, Math.PI * 2); ctx.fill();
        neon(2.4);
        ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-22, -20); ctx.moveTo(14, -10); ctx.lineTo(22, -20); ctx.stroke();
      }
    }

    if (e.hitUntil > this.time) {
      ctx.globalAlpha = Math.min(0.45, (e.hitUntil - this.time) * 2.2);
      ctx.fillStyle = "#F8F7FF";
      ctx.strokeStyle = "#22D3EE";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#F02DCA";
      ctx.beginPath(); ctx.arc(0, 0, boss ? 24 : elite ? 17 : 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    ctx.restore();
  }
  _neonLine(x1, y1, x2, y2, color, w) {
    const ctx = this.ctx;
    ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = color;
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  _glowShape(x, y, r, color, alpha = 1, diamond) {
    const ctx = this.ctx;
    ctx.save(); ctx.globalAlpha = alpha; ctx.shadowBlur = 14; ctx.shadowColor = color;
    ctx.fillStyle = color; ctx.beginPath();
    if (diamond) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
    else ctx.arc(x, y, r, 0, 7);
    ctx.fill(); ctx.restore();
  }
  _bar(x, y, w, h, frac, color) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }
  _bracketSquare(cx, cy, s, color) {
    const ctx = this.ctx; const h = s / 2, len = 9;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.shadowBlur = 6; ctx.shadowColor = color;
    const corners = [[-h, -h, 1, 1], [h, -h, -1, 1], [-h, h, 1, -1], [h, h, -1, -1]];
    for (const [dx, dy, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy + dy); ctx.lineTo(cx + dx + sx * len, cy + dy);
      ctx.moveTo(cx + dx, cy + dy); ctx.lineTo(cx + dx, cy + dy + sy * len);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function pickLane() {
  // Encounter squads fan out across the top edge; there are no lanes to defend.
  return Math.floor(Math.random() * LANES);
}
function clamp(v) { return Math.max(0, Math.min(100, v)); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
