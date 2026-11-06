// Gauntlet encounter engine, vendored from Demonanic (demonanic/Demonanic,
// review/mobile-working-copy @ b0d430f) and trimmed to encounter mode: no castle,
// walls, gate, towers, barricades or kingdom buildings. A small enemy squad
// enters from the TOP and hunts the hero party at the BOTTOM.
// Simulation is separate from React; mutates a cloned `sim` fragment and
// accumulates XP gains, returned to the UI at wave end.
import { heroLuck, luckEffects } from "./luck";
import { BEASTS, CASTING, CONTROL, ELEMENTS, HEX, MAGIC, SHIELD_CAP, SPELLS, castSuccessChance, heroBeast, knownSpells, maxMana as spellMaxMana, proficiency, spellPower, spellRadius, supportPower } from "./spells";
import { BattleLog } from "./battleLog";
import { bossAbility, championTick, warlockMageHunt } from "./enemies/abilities";
import { enemyRole } from "./enemies/roles";
import { BODY_PAD, CHAMPION_VAMPIRIC, CHAMPION_VAMPIRIC_MINION, SAPPER_SPRINT_RANGE } from "./enemies/tuning";
import { SpellVfx } from "./spellVfx";
import { BONDS, memorialDamage } from "../game/bonds";
import * as C from "./config";
import { HERO_BASELINE, statDefense } from "./heroModel";
import { classlessCombatEffects, classlessMaxHp } from "./classlessCombatEffects";
import { getUnlockedClasslessAbilities, validateClasslessAbilityUse } from "./classlessAbilities";
import { getEquippedHeroWeaponType } from "./heroWeapon";
import { CONSUMABLES, QUICK_ITEM_COOLDOWN, healThreshold, heroGearStats, heroUsesArrows, heroWeaponProfile } from "./gear";
import { PET_BODIES, petMaxHp, petStats } from "./pets";
import { BIG_MOVES, BIG_SPELLS, HIT_STOP_SECONDS, branchColor } from "./abilityLook";
import { heroTraitEffects } from "./traits";
import { masteredMove, masteryEffects, moveRank } from "./mastery";
import { projectileVfxAssetId } from "./combatVfx";
import { renderBattle } from "./render/battleRenderer";
import { FLOOR_Y, H, HERO_Y, W } from "./arena";
import { defaultRandom } from "../game/random";

const MAX_COMBAT_EFFECTS = 180;
const MAX_COMBAT_FLOATERS = 120;

export { H, W };

// The bible does not specify a Phantom Strike placement offset. Reuse the
// existing 30-unit hero/defender interaction radius as the reversible offset.
const PHANTOM_STRIKE_BEHIND_OFFSET = 30;

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
  const luck = luckEffects(stats.luck);
  const effects = classlessCombatEffects(hero.progression?.ownedNodeIds);
  const gear = heroGearStats(hero);
  const traits = heroTraitEffects(hero);
  // Gauntlet: the equipped weapon decides range, melee vs ranged, and pace.
  const weapon = heroWeaponProfile(hero);
  // Mastery (mastery.js): weapon, dodge and backstab ranks. Rank I adds nothing.
  const mastery = masteryEffects(hero, hero.equipment?.weapon?.weaponType);
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
    defense: statDefense(stats) + gear.defense + traits.defense,
    agility: stats.agility + gear.agility + traits.agility,
    intelligence: stats.intelligence,
    critChance: Math.min(0.5, attack.criticalChance + effects.critChance + gear.critChance + traits.critChance
      + ((weapon?.rangeMode ?? attack.rangeMode) === "midline" ? traits.rangedCrit : 0) + luck.critChance + mastery.critChance),
    critMult: Math.min(3, attack.criticalDamageMultiplier + effects.critDamage + gear.critDamage + traits.critDamage),
    // Luck's dodge shares agility's dodge cap.
    // So do evasion mastery and the Untouchable quality.
    dodge: Math.min(C.dodgeChance(Infinity), C.dodgeChance(stats.agility + gear.agility + traits.agility) + luck.dodge
      + mastery.dodge + (traits.dodge || 0)),
    masteryWeaponDamage: mastery.weaponDamage,
    backstabDamage: mastery.backstabDamage + (traits.backstabDamage || 0),
    lowHpDodge: 0,
    moveSpeedMultiplier: 1,
    abilityDamageMultiplier: 1,
    perkEffects: {},
    cooldownMultiplier: 1 - effects.cooldownReduction,
    // Special moves only: the Duelist quality shortens their cooldowns too.
    moveCooldownMultiplier: (1 - effects.cooldownReduction) * (1 - (traits.moveCooldown || 0)),
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
  };
}

function heroMovementSpeed(hero) {
  return hero.d.movementSpeed;
}

const LANES = 5;
const ENDLESS_WAVE_BREAK_SECONDS = 3;
// Breather between the waves of an ordinary encounter.
const WAVE_BREAK_SECONDS = 3;
// Shots a bow gets out of one arrow (they are gathered and loosed again).
const ARROW_SHOTS = 4;
// Enemy body radii for collisions (bosses and elites need more room).
// Clutch (Fortune perk F2a): once per hero per fight, when the next hit would
// kill them, the fight slows down while the player picks Drink or Ultra Crit.
export const CLUTCH = Object.freeze({
  seconds: 5, // real seconds to choose
  slowMotion: 0.2, // game speed while choosing
  secondWind: 0.3, // heal when Drinking with no healing item
  critChance: 0.15, // Ultra Crit base chance (+ Luck)
  bossDamage: 0.25, // share of a boss's max HP an Ultra Crit takes
  // Heroes whose nature picks the gamble when the player doesn't.
  gamblers: Object.freeze(["reckless", "berserker"]),
});
// Bulwarks: the share of a hit a Bulwark in the line of fire takes, and the
// damage reduction for allies standing beside one.
const BULWARK_COVER = 0.5;
const BULWARK_GUARD = 0.1;
const BULWARK_GUARD_RADIUS = 60;
// Ranged heroes on auto back away from an enemy whose body is within
// KITE_RANGE, for the first KITE_WINDOW of each reload, at KITE_SPEED of their
// normal pace (a backpedal, not a sprint: fast enemies still catch them),
// staying KITE_MARGIN from the field's edges.
const KITE_RANGE = 45;
const KITE_WINDOW = 0.4;
const KITE_SPEED = 0.5;
const KITE_MARGIN = 18;
// Heroes on auto notice a lobbed bomb this many seconds before it lands and
// try to get this far outside its blast.
const DODGE_WARNING = 0.8;
const DODGE_CLEARANCE = 8;
// Body radii for collisions, sized to the drawn art so units don't pile on top
// of each other. They grew by 4-5 px (Oct 2026); every melee reach grew by
// BODY_PAD, the extra distance between two touching bodies, so who can hit
// whom from contact is unchanged (BODY_PAD lives in enemies/tuning.js).
const HERO_BODY_RADIUS = 20;
const ENEMY_BODY_RADIUS = (e) => (e.boss ? 33 : e.tier === "elite" ? 24 : 18);
// Seconds a foe counts as busy with whoever it last attacked (backstabs).
const BACKSTAB_WINDOW = 3;
// Heroes this close to a boss are in melee with it: it won't lob bombs at them.
const BOSS_MELEE_REACH = 90;
function laneX(i) { return (W / LANES) * (i + 0.5); }

export const LAYOUT = { W, H, HERO_Y, FLOOR_Y };
// The order an unattended caster weighs its support spells in.
const SUPPORT_PRIORITY = Object.freeze(["lifeline", "heal", "veil", "renew", "barrier", "aegis", "empower", "summon"]);
// Spells that hold foes (Shadow, Wild Magic, Dominate), cast at a foe.
const CONTROL_SHAPES = Object.freeze(new Set(["terror", "confusion", "ensnare", "thornfield", "dominate"]));
// Auto bolts and curses go at the weakest foe in range (see _autoCast).
const AUTO_WEAKEST = true;
const HEX_SHAPES = Object.freeze(new Set(["blind", "enfeeble", "silence", "disarm", "expose"]));
// Foes with something for Silence to stop (boss abilities, spells, heals, summons, Blitz).
const SILENCEABLE = Object.freeze(new Set(["warlock", "carrionPriest", "lesserNecromancer", "bandit"]));

export class Engine {
  constructor(canvas, sim, wave, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sim = sim;              // cloned fragment (mutated)
    // The encounter sim supplies loot and summons (createEncounterSim). There
    // is no fallback: a sim without them is a bug, so say so at once.
    for (const hook of ["rollDrop", "makeMinion"]) {
      if (typeof sim?.[hook] !== "function") throw new TypeError(`Engine needs sim.${hook}; build the sim with createEncounterSim`);
    }
    // Every random roll in the fight (game/random.js). A sim made with a seeded
    // rng gives the same fight for the same inputs; otherwise Math.random.
    this.rng = typeof sim.rng === "function" ? sim.rng : defaultRandom;
    this.wave = wave;           // {enemies,total,...}
    this.cb = callbacks;
    this.speed = 1;
    this.running = false;
    this.last = 0;
    // Gauntlet encounters come in waves ({ enemies } each), sent in one at a
    // time: any `vanguard` waves first (a boss's guards), then the encounter's
    // own `enemies`, then its `reinforcements`.
    const waves = [...(wave.vanguard || []), { enemies: wave.enemies }, ...(wave.reinforcements || [])];
    this.spawnQueue = [...waves[0].enemies];
    this.reinforcements = waves.slice(1);
    this.waveCount = waves.length;
    this.spawnTimer = 0;
    this.active = [];           // live enemies
    this.projectiles = [];
    this.actionCompletions = [];
    this.fallen = [];           // Gauntlet: corpses a necromancer can raise
    this.floaters = [];
    // Presentation only (live battles): move-name callouts over heroes and a
    // brief hit-stop on big hits. Neither touches the fight itself.
    this.callouts = [];
    this.hitStop = 0;
    // Spell effects per element (spellVfx.js): only when drawing to a real
    // canvas, so headless fights never make or update them.
    this.vfx = this.ctx ? new SpellVfx() : null;
    this.effects = [];
    this.killed = 0;
    // Gauntlet nemeses: which creature downed each hero (by hero index), and
    // whether a nemesis in this fight fell or fled.
    this.downed = {};
    // Clutch: the moment being decided (if any) and how each one went.
    this.clutch = null;
    this.clutches = [];
    // Spells (spells.js): successful casts per hero index, and meteors in the air.
    this.spellSuccesses = {};
    this.meteors = [];
    this.nemesisSlain = null;
    this.nemesisFled = null;
    this.wavesCleared = 0;
    this.xpGains = { heroes: {} };
    this.sim.vault = Array.isArray(this.sim.vault) ? this.sim.vault : [];
    this.time = 0;
    this.ended = false;
    this.selectedHero = null;
    this.targetingHero = null;
    this.forcedDefeat = false;

    // hero runtime
    const n = sim.heroes.length || 1;
    // Every hero uses the hero model (combat/heroModel.js); save loading drops
    // any Demonanic class field, so there is no class-hero path.
    for (const h of sim.heroes) {
      if (!h?.combat?.basicAttack) throw new TypeError("Engine heroes must use the hero model (createHeroModel)");
    }
    this.heroes = sim.heroes.map((h, i) => {
      const ref = classlessHeroRef(h);
      const d = classlessHeroDerived(h);
      const x = W * ((i + 0.5) / n);
      return {
        i,
        ref,
        model: h,
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
        warCryUntil: 0,
        warCryAttackSpeedBonus: 0,
        interposeUntil: 0,
        interposeReduction: 0,
        interposeTarget: null,
        untargetableUntil: 0,
        quickCd: 0,
        ammoShots: 0,
        ammoBonus: 0,
        maxMana: spellMaxMana(h),
        mana: spellMaxMana(h),
        castCd: 0,
        lastCastAt: -Infinity,
        strain: 0,
        spellQueue: [],
        currentTarget: null,
        speedRushUntil: 0,
        classlessCombatState: { lastDamageAt: 0, sustainSecond: -1, sustainRestored: 0,
          nextRegenAt: 5, lastStandUntil: 0, lastStandReadyAt: 0, survivalUntil: 0,
          survivalReadyAt: 0, covenantUntil: 0, decoy: false, mirrorReadyAt: 0,
          nextDisruptAt: 0, nextRootAt: 0, lastDealtAt: 0, momentumTarget: null,
          momentumStacks: 0, ambushTargets: new Set(), vanishDamagePending: 0,
          echoReadyAt: 0 },
      };
    });

    // Gauntlet familiars: one per hero that has a pet, each a unit of its own
    // (pets.js PET_BODIES): HP, enemies can hit it, downed for the rest of the fight.
    this.pets = this.heroes.filter((h) => h.model.pet).map((h) => {
      const stats = petStats(h.model.pet, h.model.progression?.level || 1);
      h.petGuard = stats?.guard || 0;
      const maxHp = petMaxHp(h.model.pet, h.d.maxHp);
      return stats && { owner: h, name: h.model.pet.name, stats, body: PET_BODIES[stats.species] || { hp: 0.2, weight: 0.5 },
        level: h.model.pet.level || 1, hp: maxHp, maxHp, down: false, hurtAt: -99, strikeAt: -99, face: 1, moving: false,
        x: h.x + 18, y: h.y + 14, cd: 1, supportCd: stats.support?.interval || 0, tauntCd: 2, target: null };
    }).filter(Boolean);
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
    this.targetingHero = h?.alive && h.d.rangeMode === "midline" ? index : null;
    return this.targetingHero !== null;
  }

  getRangedTargetStatus(index) {
    const h = this.heroes[index];
    if (!h?.alive || h.d.rangeMode !== "midline") return null;
    const targets = this.active
      .filter((enemy) => this._isValidClasslessTarget(h, enemy))
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

  // In range to be hit: melee reach (from the edge of the target's body) for
  // swords, weapon range for everything else.
  _isValidClasslessTarget(h, enemy) {
    if (!h || !enemy || enemy.hp <= 0 || !this.active.includes(enemy)) return false;
    if (enemy.dominatedUntil > this.time) return false; // fighting for the party

    const reach = h.d.rangeMode === "melee" ? this._meleeReach(h, enemy) : h.d.range;
    return Math.hypot(enemy.x - h.x, enemy.y - h.y) <= reach;
  }

  // A move's target: Lunge reaches its own range (it dashes in); every other
  // move uses the hero's weapon reach.
  _moveTargetValid(h, definition, enemy) {
    if (definition?.rangeMode !== "lunge") return this._isValidClasslessTarget(h, enemy);
    if (!h || !enemy || enemy.hp <= 0 || !this.active.includes(enemy) || enemy.dominatedUntil > this.time) return false;
    return Math.hypot(enemy.x - h.x, enemy.y - h.y) <= definition.range;
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
    {
      const capability = HERO_BASELINE.sharedStrike;
      const cooldown = Math.max(0, h.abilityCooldowns[capability.id] || 0);
      const target = this._selectTarget(h);
      const baselineDamage = Math.round(h.d.attack * capability.damageMultiplier * (1 + h.d.classlessEffects.weaponDamage));
      const sharedStrike = { id: capability.id, name: "Shared Strike",
        desc: `${baselineDamage} raw direct-hit weapon damage at baseline (150%); 12s cooldown; no resource cost.`,
        damage: baselineDamage, cooldownSeconds: masteredMove(capability, moveRank(h.model, capability.id)).cooldownSeconds * h.d.moveCooldownMultiplier,
        resourceCost: capability.resourceCost, color: h.d.color, branch: "Basic",
        cooldown, available: h.alive && cooldown <= 0 && !!target && this._classlessCanPayActiveCost(h), targetMode: "enemy", range: h.d.range,
        reason: !h.alive ? "unavailable" : cooldown > 0 ? "cooldown" : !this._classlessCanPayActiveCost(h) ? "health_cost" : target ? null : "no_target" };
      return [sharedStrike, ...getUnlockedClasslessAbilities(h.model).map((definition) => {
        const abilityCooldown = Math.max(0, h.abilityCooldowns[definition.id] || 0);
        const inRangeTargets = definition.requiresTarget
          ? this.active.filter((enemy) => this._moveTargetValid(h, definition, enemy)) : [];
        const validTargets = inRangeTargets.filter((enemy) => !Number.isFinite(definition.conditionalTargetHpBelow) ||
          enemy.hp / Math.max(1, enemy.maxHp) < definition.conditionalTargetHpBelow);
        const validationTarget = validTargets[0] || inRangeTargets[0] || null;
        const validation = validateClasslessAbilityUse({ hero: { ...h.model, alive: h.alive, protect: h.protect, retreating: h.retreating },
          abilityId: definition.id, cooldown: abilityCooldown, battleActive: !this.ended,
          target: validationTarget, targetValid: !definition.requiresTarget || !!validationTarget });
        const cooldownSeconds = masteredMove(definition, moveRank(h.model, definition.id)).cooldownSeconds * h.d.moveCooldownMultiplier;
        const activeRemaining = definition.effect === "attack_speed_aura"
          ? Math.max(0, h.warCryUntil - this.time)
          : definition.effect === "interpose" ? Math.max(0, h.interposeTarget?.interposeUntil - this.time)
            : definition.effect === "crimson_covenant" ? Math.max(0, h.classlessCombatState.covenantUntil - this.time)
              : ["untargetable", "vanish"].includes(definition.effect) ? Math.max(0, h.untargetableUntil - this.time) : 0;
        const damage = Number.isFinite(definition.damageMultiplier)
          ? Math.round(h.d.attack * definition.damageMultiplier) : undefined;
        const canPayHealthCost = this._classlessCanPayActiveCost(h);
        // Mana Surge needs a mana pool (spells from the Arcane Spark perk).
        const noMana = definition.requiresMana && !(h.maxMana > 0);
        return { id: definition.id, name: definition.name, desc: definition.description, branch: definition.branch,
          cooldown: abilityCooldown, cooldownSeconds, resourceCost: definition.resourceCost,
          damage, color: h.d.color, active: activeRemaining > 0, activeRemaining,
          available: validation.ok && canPayHealthCost && !noMana, targetMode: definition.targetMode,
          range: definition.rangeMode === "hero_attack_range" ? h.d.range : definition.range,
          radius: definition.adjacentRadius, reason: noMana ? "no_mana" : !canPayHealthCost ? "health_cost" : validation.reason };
      })];
    }
  }

  _classlessCanPayActiveCost(hero) {
    if (!hero || !(hero.d.bloodPriceCost > 0)) return true;
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
    {
      const ability = abilityId === HERO_BASELINE.sharedStrike.id ? null :
        getUnlockedClasslessAbilities(h.model).find((item) => item.id === abilityId);
      return this.active.filter((enemy) => this._isValidClasslessTarget(h, enemy) &&
        (!ability || !Number.isFinite(ability.conditionalTargetHpBelow) ||
          enemy.hp / Math.max(1, enemy.maxHp) < ability.conditionalTargetHpBelow)).map((enemy) => ({
        type: enemy.type, name: enemy.name || enemy.type, hp: Math.max(0, Math.round(enemy.hp)),
        maxHp: Math.max(1, Math.round(enemy.maxHp)), distance: Math.round(Math.hypot(enemy.x - h.x, enemy.y - h.y)), enemy,
      }));
    }
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
    const damageType = C.DAMAGE_TYPES.KNIGHT_MELEE;
    const targets = this.active.filter((enemy) => enemy.hp > 0 &&
      Math.hypot(enemy.x - x, enemy.y - y) <= status.radius &&
      C.affinityMultiplier(enemy, damageType) > 0 &&
      !(h.d.magic && enemy.magicImmune));
    return { valid: targets.length > 0, targets };
  }

  getHeroSpellStatus(index) {
    const h = this.heroes[index];
    return h ? this._classlessSpellStatus(h) : [];
  }

  useHeroAbility(index, abilityId, targetOrPoint = null) {
    if (!this.heroes[index]) return false;
    const result = abilityId === HERO_BASELINE.sharedStrike.id
      ? this.useSharedStrike(index, targetOrPoint?.enemy || targetOrPoint)
      : this.executeClasslessAbility(index, abilityId, targetOrPoint);
    if (result === true || result?.ok) {
      const branch = abilityId === HERO_BASELINE.sharedStrike.id ? "Basic" : getUnlockedClasslessAbilities(this.heroes[index].model).find((item) => item.id === abilityId)?.branch;
      const name = abilityId === HERO_BASELINE.sharedStrike.id ? "Shared Strike" : getUnlockedClasslessAbilities(this.heroes[index].model).find((item) => item.id === abilityId)?.name;
      this._callout(this.heroes[index], `${(name || "").toUpperCase()}!`, branchColor(branch), BIG_MOVES.has(abilityId));
      // Every landed move counts toward its mastery (and the Duelist quality).
      const uses = (this.heroes[index].model.battleStats ||= {}).moveUses ||= {};
      uses[abilityId] = (uses[abilityId] || 0) + 1;
      const aim = targetOrPoint?.enemy || (targetOrPoint?.hp > 0 ? targetOrPoint : null);
      this._log("move", `${this._name(this.heroes[index])} · ${name || abilityId}${aim ? ` → ${this._foeName(aim)}` : ""}`);
      this._tally(this.heroes[index], "moves", 1);
    }
    return result;
  }

  executeClasslessAbility(index, abilityId, targetOrPoint = null) {
    const h = this.heroes[index];
    // A mastered move hits harder, lasts longer and comes back sooner.
    const definition = masteredMove(getUnlockedClasslessAbilities(h?.model).find((item) => item.id === abilityId),
      h ? moveRank(h.model, abilityId) : 1);
    if (!definition) return { ok: false, reason: "locked", abilityId };
    if (definition.requiresMana && !(h.maxMana > 0)) return { ok: false, reason: "no_mana", abilityId };
    const target = definition.requiresTarget
      ? targetOrPoint?.enemy || targetOrPoint || this.active
        .filter((enemy) => this._moveTargetValid(h, definition, enemy) &&
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
      targetValid: !definition.requiresTarget || (!!h && this._moveTargetValid(h, definition, target)),
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
        heroIndex: h.i, ability: true, damageCategory: "weapon",
        situationalBonus: Number.isFinite(definition.conditionalTargetHpBelow) &&
          target.hp / Math.max(1, target.maxHp) < definition.conditionalTargetHpBelow
          ? definition.conditionalDamageBonus : 0 });
      if (!hit) return { ok: false, reason: "no_target", abilityId };
      killedTarget = targetWasAlive && target.hp <= 0;
      affectedTargets.push(target);
      if (secondaryTarget) {
        if (this._applyHit({ sourceId: `H${h.i}`, target: secondaryTarget,
          dmg: h.d.attack * definition.adjacentDamageMultiplier, magic: false, damageType: null,
          critChance: h.d.critChance, critMult: h.d.critMult, heroIndex: h.i,
          ability: true, damageCategory: "weapon" })) affectedTargets.push(secondaryTarget);
      }
    } else if (definition.effect === "lunge" || definition.effect === "pinning_shot") {
      // Starter moves. Lunge dashes to stand in front of the foe, then strikes
      // and stuns; Pinning Shot hits from range and roots.
      const from = { x: h.x, y: h.y };
      if (definition.effect === "lunge") {
        const dx = target.x - h.x, dy = target.y - h.y;
        const distance = Math.hypot(dx, dy) || 1;
        const stop = Math.max(0, distance - (this._meleeReach(h, target) - 4));
        h.x += (dx / distance) * stop;
        h.y += (dy / distance) * stop;
      }
      const targetWasAlive = target.hp > 0;
      const hit = this._applyHit({ sourceId: `H${h.i}`, target, dmg: h.d.attack * definition.damageMultiplier,
        magic: false, damageType: null, critChance: h.d.critChance, critMult: h.d.critMult,
        heroIndex: h.i, ability: true, damageCategory: "weapon" });
      if (!hit) {
        h.x = from.x;
        h.y = from.y;
        return { ok: false, reason: "no_target", abilityId };
      }
      killedTarget = targetWasAlive && target.hp <= 0;
      if (target.hp > 0) {
        if (definition.effect === "lunge") {
          target.stunUntil = Math.max(target.stunUntil || 0, this.time + (target.boss ? definition.bossStunSeconds : definition.stunSeconds));
          this._float(target.x, target.y - 24, "STUNNED", "#FDE68A");
        } else {
          const rootUntil = this.time + (target.boss ? definition.bossRootSeconds : definition.rootSeconds);
          target.rootUntil = Math.max(target.rootUntil || 0, rootUntil);
          this._float(target.x, target.y - 24, "PINNED", "#9BE15D");
        }
      }
      if (definition.effect === "lunge") {
        this.effects.push({ kind: "trail", x: from.x, y: from.y, toX: h.x, toY: h.y, r: 10, life: 0.3, color: h.d.color });
      }
      affectedTargets = [target];
    } else if (definition.effect === "mana_surge") {
      h.mana = Math.min(h.maxMana, h.mana + definition.manaRestore);
      h.freeSpell = true;
      this._float(h.x, h.y - 22, `+${definition.manaRestore} MANA`, "#E879F9");
      this.effects.push({ kind: "guard", x: h.x, y: h.y, r: 22, life: 0.5, color: "#E879F9" });
      affectedTargets = [h];
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
    } else if (definition.effect === "ward") {
      const allies = this.heroes.filter((ally) => ally !== h && ally.alive &&
        Math.hypot(ally.x - h.x, ally.y - h.y) <= definition.range);
      const warded = allies.sort((a, b) => a.ref.hp - b.ref.hp || a.i - b.i)[0] || h;
      warded.ref.shield = (warded.ref.shield || 0) + definition.absorb;
      this._float(warded.x, warded.y - 22, "WARD", "#A78BFA");
      this.effects.push({ kind: "shield", x: warded.x, y: warded.y, r: 22, life: 0.5, color: "#A78BFA" });
      affectedTargets = [warded];
    } else if (definition.effect === "jackpot") {
      h.jackpotHits = definition.guaranteedHits;
      this._float(h.x, h.y - 22, "JACKPOT", "#FFE600");
      this.effects.push({ kind: "guard", x: h.x, y: h.y, r: 22, life: 0.5, color: "#FFE600" });
      affectedTargets = [h];
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
        critChance: h.d.critChance, critMult: h.d.critMult,
        heroIndex: h.i, ability: true, damageCategory: "weapon", backstab: true,
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
    const cooldown = definition.refundCooldownOnKill && killedTarget ? 0 : definition.cooldownSeconds * h.d.moveCooldownMultiplier;
    h.abilityCooldowns[definition.id] = cooldown;
    h.visualActionKind = ["weapon_strike", "weapon_cleave", "phantom_strike", "lunge", "pinning_shot"].includes(definition.effect) ? "attack" : null;
    h.visualActionStartedAt = this.time;
    h.visualActionUntil = this.time + 0.42;
    this.actionCompletions.push({ index, result: "completed", abilityId: definition.id });
    return { ok: true, reason: null, abilityId: definition.id, target, affectedTargets,
      cooldownRemaining: cooldown, killedTarget };
  }

  useSharedStrike(index, targetOrNull = null) {
    const h = this.heroes[index];
    if (!h || !h.alive) return false;
    if ((h.abilityCooldowns[HERO_BASELINE.sharedStrike.id] || 0) > 0) return false;
    const target = targetOrNull || this._selectTarget(h);
    if (!this._isValidClasslessTarget(h, target)) return false;
    if (!this._classlessCanPayActiveCost(h)) return false;
    const hpBeforeAbility = h.ref.hp;

    this._applyHit({
      sourceId: `H${h.i}`,
      target,
      dmg: h.d.attack * HERO_BASELINE.sharedStrike.damageMultiplier * (masteredMove(HERO_BASELINE.sharedStrike, moveRank(h.model, HERO_BASELINE.sharedStrike.id)).damageMultiplier
        / HERO_BASELINE.sharedStrike.damageMultiplier),
      magic: false,
      damageType: null,
      critChance: h.d.critChance,
      critMult: h.d.critMult,
      sharedStrike: true,
      heroIndex: h.i,
      ability: true,
      damageCategory: "weapon",
    });
    this._chargeClasslessActiveCost(h, hpBeforeAbility);
    h.abilityCooldowns[HERO_BASELINE.sharedStrike.id] = masteredMove(HERO_BASELINE.sharedStrike, moveRank(h.model, HERO_BASELINE.sharedStrike.id)).cooldownSeconds
      * h.d.moveCooldownMultiplier;
    this.actionCompletions.push({ index, result: "completed" });
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

  // The foe the player marked for this hero's spells (tap a foe on the field).
  // Spells the player taps or queues go at it, and so do auto bolts and curses
  // when it's in range; out of range they fall back as before. A dead or
  // turned foe clears the mark.
  heroSpellTarget(index) {
    const h = this.heroes[index];
    const foe = h?.spellTarget;
    if (!foe) return null;
    if (foe.hp <= 0 || foe._dead || foe.dominatedUntil > this.time || !this.active.includes(foe)) { h.spellTarget = null; return null; }
    return foe;
  }

  // Mark `enemy` (or clear the mark with null). Marking the marked foe again clears it.
  markHeroTarget(index, enemy) {
    const h = this.heroes[index];
    if (!h || !h.alive) return false;
    h.spellTarget = enemy && enemy.hp > 0 && enemy !== h.spellTarget ? enemy : null;
    return true;
  }

  // The living foe under a tap at (x, y), if any (a little slack for fingers).
  enemyAt(x, y, slack = 14) {
    let best = null, bd = Infinity;
    for (const e of this.active) {
      if (e.hp <= 0 || e._dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= ENEMY_BODY_RADIUS(e) + slack && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  commandHeroAttack(index, target) {
    const h = this.heroes[index];
    if (!h || !h.alive || !target || target.hp <= 0) return false;
    if (!this._isValidClasslessTarget(h, target)) return false;
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
    if (!h) return [];
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
    const slot = h ? h.model.quickSlots?.[slotIndex] : null;
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
    if (h.quickCd > 0) return;
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

  // Draw an arrow for a shot. Arrows are gathered and loosed again during a
  // fight, so only every ARROW_SHOTS-th shot spends one (and a quiver or
  // Whisperwind may save even that). Returns the arrow's on-hit effect, or
  // false when the quiver is empty.
  _drawArrow(h) {
    const slot = this._arrowSlot(h);
    if (!slot) return false;
    const item = CONSUMABLES[slot.key];
    h.arrowShots = (h.arrowShots || 0) + 1;
    if (h.arrowShots % ARROW_SHOTS === 0 && !(this.rng() < Math.min(0.75, h.d.gear?.arrowSaver || 0))) {
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
  // `master`: the boss that called it (a Vampiric master heals from its hits).
  _summon(type, master = null) {
    const minion = this.sim.makeMinion(type);
    minion.summoned = true;
    if (master) minion.master = master;
    this.injectEnemy(minion);
  }

  // Summon from `types` in order until `cap` summoned minions are alive.
  // Returns how many were called.
  _summonUpTo(types, cap, master = null) {
    const alive = this.active.filter((enemy) => enemy.summoned && enemy.hp > 0).length;
    const called = types.slice(0, Math.max(0, cap - alive));
    for (const type of called) this._summon(type, master);
    return called.length;
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
    this._logbook().finish(this.time, "Returned home");
    this.stop();
    this.cb.onEnd && this.cb.onEnd({
      victory: true,
      reason: "returned",
      xpGains: this.xpGains,
      killed: this.killed,
      wavesCleared: this.wavesCleared,
      ...this._fightSummary(),
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
      this._tickCallouts(dt);
      this.vfx?.noteFrame(dt);
      if (this.hitStop > 0) {
        // A big hit freezes the frame for a moment; the fight just waits.
        this.hitStop = Math.max(0, this.hitStop - dt);
      } else {
        this.vfx?.update(dt * this.speed);
        // Fast-forward in normal-sized steps so 4x/8x play matches 1x physics.
        const steps = Math.max(1, Math.ceil(this.speed));
        for (let i = 0; i < steps && !this.ended; i += 1) this.update((dt * this.speed) / steps);
      }
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
    if (this.clutch) dt = this._tickClutch(dt);
    this.time += dt;
    this._logbook().tick(this.time);

    // spawn: release enemies gradually (group release proxy)
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.spawnQueue.length) {
      // Keep the battlefield readable: limit concurrent enemies to roughly half a wave.
      const capInZone = Math.max(4, this.wave.total * 0.5);
      if (this.active.length < capInZone) {
        const e = this.spawnQueue.shift();
        e.x = laneX(pickLane(this, e)); e.y = 10 + this.rng() * 20;
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
      this._landMeteors(e);
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
      this._tickSupport(h, dt);
      this._tickQuickItems(h, dt);
      h.castCd = Math.max(0, (h.castCd || 0) - dt);
      if (h.spellQueue.length) this._playSpellQueue(h);
      if (!h.manual && h.maxMana > 0) this._autoCast(h);
      for (const id of Object.keys(h.spellCooldowns)) h.spellCooldowns[id] = Math.max(0, h.spellCooldowns[id] - dt);
      h.mana = Math.min(h.maxMana, h.mana + (2 + Math.max(0, h.d.intelligence || 0) * 0.04) * dt);
      const melee = h.d.rangeMode !== "midline";
      const baseAttackSpeed = h.d.classlessEffects.attackSpeed;
      const activeAttackSpeedBonus = (h.warCryUntil > this.time ? h.warCryAttackSpeedBonus : 0)
        + (h.empowerUntil > this.time ? h.empowerSpeed || 0 : 0);
      const cappedAttackSpeed = Math.min(0.20, baseAttackSpeed + activeAttackSpeedBonus);
      const attackSpeedMultiplier = (1 + cappedAttackSpeed) / (1 + baseAttackSpeed);
      h.cd -= dt * (activeAttackSpeedBonus > 0 ? attackSpeedMultiplier : 1);

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
          const spd = heroMovementSpeed(h) * dt;
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
          const spd = heroMovementSpeed(h) * dt;
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

      // Gauntlet: a bow with an empty quiver can't shoot; the hero falls back.
      if (h.d.usesArrows && !this._arrowSlot(h)) {
        if (!h.outOfArrows) {
          h.outOfArrows = true;
          this._float(h.x, h.y - 24, "NO ARROWS", "#E2E8F0");
        }
        this._returnHome(h, dt);
        continue;
      }

      // Heroes on auto step out from under a lobbed bomb or bile about to land.
      if (!h.manual && this._dodgeBlast(h, dt)) continue;

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
      let target = this._selectTarget(h);

      if (target && target.hp <= 0) {
        h.manualTarget = null;
        this._completeTacticalAction(h.i, "cancelled");
        target = h.manual ? null : this._selectTarget(h);
      }
      if (target && h.pendingTacticalAction === "attack" && h.d.rangeMode === "midline" &&
        !this._isValidClasslessTarget(h, target)) {
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
      if (!target && !h.manual) {
        const nearest = this.active.reduce((best, enemy) => enemy.hp > 0 &&
          (!best || Math.hypot(enemy.x - h.x, enemy.y - h.y) < Math.hypot(best.x - h.x, best.y - h.y)) ? enemy : best, null);
        if (nearest) {
          const dist = Math.hypot(nearest.x - h.x, nearest.y - h.y) || 1;
          const step = Math.min(heroMovementSpeed(h) * dt, Math.max(0, dist - (h.d.range - 10)));
          h.x += ((nearest.x - h.x) / dist) * step;
          h.y += ((nearest.y - h.y) / dist) * step;
          continue;
        }
      }

      if (melee) {
        if (target) {
          const dist = Math.hypot(target.x - h.x, target.y - h.y) || 1;
          if (dist > this._meleeReach(h, target)) {
            const spd = heroMovementSpeed(h) * dt;
            h.x += ((target.x - h.x) / dist) * Math.min(spd, dist);
            h.y += ((target.y - h.y) / dist) * Math.min(spd, dist);
          } else if (h.cd <= 0) {
            this._fire("H" + h.i, h, target, h.d, true);
            h.cd = h.d.rate;
          }
        } else if (!h.manual) this._returnHome(h, dt);
      } else {
        // Ranged heroes on auto keep their distance: while reloading, they
        // step away from an enemy closing in, then turn and shoot.
        if (!h.manual && h.cd > h.d.rate * (1 - KITE_WINDOW) && this._kite(h, dt)) continue;
        if (h.cd <= 0 && target && Math.hypot(target.x - h.x, target.y - h.y) <= h.d.range) {
          this._fire("H" + h.i, h, target, h.d, true);
          h.cd = h.d.rate;
        }
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
    if (e.nemesisId && this._nemesisTick(e, dt)) return;
    if (e.champion && !(e.silenceUntil > this.time)) championTick(this, e, dt);
    e.atkCd -= dt * (e.attackSlowUntil > this.time ? (e.attackSlowMultiplier || 1) : 1) * (e.attackSpeed || 1);
    if (e.stunUntil && e.stunUntil > this.time) return;
    // Shadow and Mind control: a frightened foe flees; a confused or
    // dominated one fights its own side.
    if (e.fearUntil > this.time) { this._flee(e, dt); return; }
    if (e.dominatedUntil > this.time || e.confusedUntil > this.time) { this._turncoat(e, dt); return; }
    // Boss special: a targeted, proximity-based napalm bottle.
    // It no longer damages every hero simultaneously. The target is the nearest
    // living hero inside the boss's configured attack range.
    const silenced = e.silenceUntil > this.time;
    if (e.boss && !silenced) bossAbility(this, e, dt);
    if (this._updateSpecialEnemy(e, dt)) return;
    // Enemy archetypes get a small tactical identity on top of their
    // existing stats/objectives. These are intentionally readable rules:
    // fast raiders rush, brutes hunt structures, reapers hunt wounded heroes,
    // and lieutenants reinforce nearby attackers.
    const tactical = this._selectEnemyTacticalTarget(e);
    const commanderBoost = e._commanderBoost || 1;
    if (e.type === "warlock" && !silenced) warlockMageHunt(this, e, dt);
    const baseMoveSpeed =
      e.type === "goblin" ? e.speed * 1.18 * commanderBoost :
      e.type === "darkElf" ? e.speed * 1.08 * commanderBoost :
      e.type === "slime" ? e.speed * 0.92 * commanderBoost :
      e.type === "reaper" ? e.speed * 1.05 * commanderBoost :
      e.speed * commanderBoost;
    if (e.rootUntil > this.time) return;
    const moveSpeed = baseMoveSpeed * (e.slowUntil > this.time ? (e.slowMultiplier || 1) : 1);

    // Orcs, lieutenants, ghosts and Warlocks peel toward the heroes they pick
    // (_selectEnemyTacticalTarget). (Reapers and Dark Elves take their turns
    // in enemies/roles.js; they only get here when no hero can be targeted,
    // so they never peel.)
    if (tactical && (e.type === "orc" || e.type === "lieutenant" || e.type === "ghost" || e.type === "warlock")) {
      const target = tactical.obj;
      const dist = Math.hypot(target.x - e.x, target.y - e.y) || 1;
      // Warlocks cast ranged bolts while retaining their separate
      // Mage-Hunter drain ability above.
      const ranged = e.type === "warlock";
      const attackRange = ranged ? 225 : 30 + BODY_PAD;
      if (ranged && dist <= attackRange) {
        if (e.atkCd <= 0) {
          this._throwEnemyBolt(e, tactical, e.damage, "#C026D3", true);
          e.atkCd = 1.65;
        }
        return;
      }
      if (!ranged && dist <= attackRange) {
        if (e.atkCd <= 0) {
          this._enemyAttack(e, tactical);
          e.atkCd = e.type === "orc" ? 1.15 : 0.9;
        }
        return;
      }
      // Ranged enemies hold a firing lane; melee specialists peel toward
      // nearby targets but resume advancing if the target escapes.
      const peelRange = ranged ? 300 : 150;
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

    const meleeCooldown = e.type === "reaper" ? 0.72 : e.type === "goblin" ? 0.65 : e.type === "orc" ? 1.15 : 1.0;
    // Taunted by a Stonebark Tortoise: go for it until the taunt ends.
    if (this.pets.length && e.tauntUntil > this.time && e.tauntedBy && !e.tauntedBy.down && !e.boss) {
      const pet = e.tauntedBy;
      const dist = Math.hypot(pet.x - e.x, pet.y - e.y) || 1;
      if (dist <= 30 + BODY_PAD) {
        if (e.atkCd <= 0) { this._enemyHitPet(e, pet); e.atkCd = meleeCooldown; }
      } else {
        e.x += ((pet.x - e.x) / dist) * moveSpeed * dt;
        e.y += ((pet.y - e.y) / dist) * moveSpeed * dt;
      }
      return;
    }
    // An enemy that reaches a hero, or a familiar, attacks it.
    const blocker = this._nearestHeroEntity(e.x, e.y, 30 + BODY_PAD);
    const petInReach = this.pets.length ? this._nearestPetInReach(e.x, e.y, 30 + BODY_PAD) : null;
    if (petInReach && (!blocker || petInReach.weighted < Math.hypot(blocker.obj.x - e.x, blocker.obj.y - e.y))) {
      if (e.atkCd <= 0) {
        this._enemyHitPet(e, petInReach.pet);
        e.atkCd = meleeCooldown;
      }
      return;
    }
    if (blocker) {
      if (e.atkCd <= 0) {
        this._enemyAttack(e, blocker);
        e.atkCd = meleeCooldown;
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

    // Gauntlet enemy roles (enemies/roles.js): the first that matches takes the turn.
    const role = enemyRole(this, e);
    return role ? role.act(this, e, dt, { move, living, nearest, distTo }) : false;
  }

  // Familiars: attackers go for whatever is closest to their partner (melee
  // pets run in, ranged pets keep to their partner's side); support pets stay
  // close and heal or shield on a timer.
  // Each familiar picks its own fights by species (no leash to its partner):
  // the wolf hunts the most wounded foe, the hawk dives at its partner's
  // target, the imp sets unburnt foes alight, the sprite heals at its
  // partner's side, the tortoise plants itself between its partner and the
  // nearest foe and taunts. A downed familiar does nothing more this fight.
  _updatePets(dt) {
    // Summoned beasts leave when their time is up or they fall.
    const leaving = this.pets.filter((pet) => pet.summoned && (pet.down || this.time >= pet.until || !pet.owner.alive));
    if (leaving.length) {
      for (const pet of leaving) this.vfx?.beastFade(pet);
      this.pets = this.pets.filter((pet) => !leaving.includes(pet));
    }
    for (const pet of this.pets) {
      const owner = pet.owner;
      const startX = pet.x;
      pet.moving = false;
      if (pet.down || !owner.alive) continue;
      const moveTo = (tx, ty, speed, stopAt = 2) => {
        const dist = Math.hypot(tx - pet.x, ty - pet.y);
        if (dist > stopAt) {
          const step = Math.min(dist - stopAt, speed * dt);
          pet.x += ((tx - pet.x) / dist) * step;
          pet.y += ((ty - pet.y) / dist) * step;
          pet.moving = step > 0.05;
        }
      };
      const foes = this.active.filter((enemy) => enemy.hp > 0);
      const nearestTo = (x, y, list = foes) => list.reduce((best, enemy) =>
        (!best || Math.hypot(enemy.x - x, enemy.y - y) < Math.hypot(best.x - x, best.y - y) ? enemy : best), null);
      const { attack, support } = pet.stats;
      const species = pet.stats.species;
      if (support) {
        if (species === "tortoise") {
          // Between its partner and the nearest foe.
          const threat = nearestTo(owner.x, owner.y);
          if (threat && Math.hypot(threat.x - owner.x, threat.y - owner.y) < 320) {
            const d = Math.hypot(threat.x - owner.x, threat.y - owner.y) || 1;
            moveTo(owner.x + ((threat.x - owner.x) / d) * 34, owner.y + ((threat.y - owner.y) / d) * 34, 120);
          } else {
            moveTo(owner.x + 18, owner.y + 14, 160);
          }
          const taunt = pet.body.taunt;
          pet.tauntCd -= dt;
          if (taunt && pet.tauntCd <= 0) {
            const drawn = foes.filter((enemy) => !enemy.boss && Math.hypot(enemy.x - pet.x, enemy.y - pet.y) <= taunt.radius);
            if (drawn.length) {
              for (const enemy of drawn) { enemy.tauntedBy = pet; enemy.tauntUntil = this.time + taunt.seconds; }
              pet.tauntCd = taunt.every;
              this._float(pet.x, pet.y - 18, "TAUNT", pet.stats.color);
              this.effects.push({ kind: "guard", x: pet.x, y: pet.y, r: taunt.radius * 0.5, life: 0.5, color: pet.stats.color });
            } else {
              pet.tauntCd = 0.5;
            }
          }
        } else {
          // The sprite keeps to its partner's side and darts away from foes that come close.
          const threat = nearestTo(pet.x, pet.y);
          const td = threat ? Math.hypot(threat.x - pet.x, threat.y - pet.y) : Infinity;
          if (td < 60) moveTo(pet.x + ((pet.x - threat.x) / (td || 1)) * 40, pet.y + ((pet.y - threat.y) / (td || 1)) * 40, 200);
          else moveTo(owner.x - 16, owner.y + 10, 220);
        }
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
        if (pet.x !== startX) pet.face = pet.x > startX ? 1 : -1;
        continue;
      }
      if (!attack) continue;
      pet.cd -= dt;
      // A spirit wolf draws attacks too.
      if (pet.body.taunt) {
        pet.tauntCd -= dt;
        if (pet.tauntCd <= 0) {
          const drawn = foes.filter((enemy) => !enemy.boss && Math.hypot(enemy.x - pet.x, enemy.y - pet.y) <= pet.body.taunt.radius);
          for (const enemy of drawn) { enemy.tauntedBy = pet; enemy.tauntUntil = this.time + pet.body.taunt.seconds; }
          pet.tauntCd = drawn.length ? pet.body.taunt.every : 0.5;
        }
      }
      const valid = pet.target && pet.target.hp > 0 && this.active.includes(pet.target);
      if (!valid || species === "hawk" || (species === "imp" && pet.cd <= 0)) {
        if (species === "wolf") {
          // The most wounded foe on the field.
          pet.target = valid ? pet.target : foes.reduce((best, enemy) =>
            (!best || enemy.hp / Math.max(1, enemy.maxHp) < best.hp / Math.max(1, best.maxHp) ? enemy : best), null);
        } else if (species === "hawk") {
          const partnerTarget = [owner.manualTarget, owner.currentTarget].find((enemy) => enemy?.hp > 0 && this.active.includes(enemy));
          pet.target = partnerTarget || (valid ? pet.target : nearestTo(pet.x, pet.y));
        } else if (species === "imp") {
          const burning = (enemy) => (enemy.dots || []).some((dot) => dot.color === "#FF6600" && dot.until > this.time);
          pet.target = nearestTo(pet.x, pet.y, foes.filter((enemy) => !burning(enemy))) || (valid ? pet.target : nearestTo(pet.x, pet.y));
        } else {
          pet.target = valid ? pet.target : nearestTo(pet.x, pet.y);
        }
      }
      const target = pet.target;
      if (!target) {
        moveTo(owner.x + 18, owner.y + 14, 220);
        if (pet.x !== startX) pet.face = pet.x > startX ? 1 : -1;
        continue;
      }
      const dist = Math.hypot(target.x - pet.x, target.y - pet.y) || 1;
      pet.face = target.x >= pet.x ? 1 : -1;
      if (dist > attack.range) {
        // Close in: the wolf at a run, fliers and the imp to just inside their range.
        moveTo(target.x, target.y, attack.moveSpeed || 150, attack.range * 0.8);
        continue;
      }
      if (pet.cd > 0) continue;
      pet.cd = attack.interval;
      pet.strikeAt = this.time;
      this._petStrike(pet, target);
    }
  }

  // An enemy's blow lands on a familiar.
  // Who a foe is fighting, for backstabs: whoever it last attacked.
  _engage(e, obj) {
    e.engagedWith = obj;
    e.engagedUntil = this.time + BACKSTAB_WINDOW;
  }

  _enemyHitPet(e, pet) {
    if (e.disarmUntil > this.time) return;
    this._engage(e, pet);
    if (this._hexMiss(e, pet)) return;
    if (pet.body.airborne && e.attackFx !== "napalm" && this.rng() < 0.5) {
      this._float(pet.x, pet.y - 14, "MISS", "#94A3B8");
      return;
    }
    const empowered = e.empoweredUntil > this.time ? 1.15 : 1;
    const damage = e.damage * empowered * (1 - (pet.body.armor || 0)) * this._hexDamage(e);
    pet.hp = Math.max(0, pet.hp - damage);
    pet.hurtAt = this.time;
    this._float(pet.x, pet.y - 14, "-" + Math.round(damage), "#FF3366");
    if (pet.hp <= 0 && !pet.down) {
      pet.down = true;
      pet.target = null;
      // Its help stops with it: guard, heals and shields, marks.
      if (!pet.summoned) pet.owner.petGuard = 0;
      for (const enemy of this.active) if (enemy.tauntedBy === pet) enemy.tauntUntil = 0;
      this._float(pet.x, pet.y - 20, `${pet.name} is down`, "#94A3B8");
      this.effects.push({ kind: "death", x: pet.x, y: pet.y, r: 10, life: 0.5, color: pet.stats.color });
    }
  }

  // The familiar an enemy at (x, y) would go for within reach `r`, and its
  // weighted distance: a pet with weight 0.5 counts as twice as far away.
  _nearestPetInReach(x, y, r) {
    let best = null, bd = Infinity;
    for (const pet of this.pets) {
      if (pet.down || !pet.owner.alive) continue;
      const d = Math.hypot(pet.x - x, pet.y - y);
      if (d > r) continue;
      const weighted = d / Math.max(0.1, pet.body.weight || 1);
      if (weighted < bd) { bd = weighted; best = pet; }
    }
    return best ? { pet: best, weighted: bd } : null;
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
    // Spirit beasts: a tiger's opening pounce, a wasp's poison, a spider's
    // web, a dragon's breath over everything in front of it.
    if (attack.pounce > 0 && !pet.pounced) { pet.pounced = true; this._bonusDamage(target, damage * (attack.pounce - 1), sourceId, color); }
    if (attack.poison > 0) this._applyDot(target, damage * attack.poison, 4, "#39FF14", sourceId);
    if (attack.web && this.time >= (pet.webCd || 0)) {
      pet.webCd = this.time + attack.web.every;
      target.rootUntil = Math.max(target.rootUntil || 0, this.time + (target.boss ? attack.web.seconds * 0.3 : attack.web.seconds));
      this.vfx?.aura("root", target, attack.web.seconds, 1);
    }
    if (attack.cone > 0) {
      const facing = Math.atan2(target.y - pet.y, target.x - pet.x);
      for (const other of this.active) {
        if (other === target || other.hp <= 0) continue;
        const d = Math.hypot(other.x - pet.x, other.y - pet.y);
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(other.y - pet.y, other.x - pet.x) - facing), Math.cos(Math.atan2(other.y - pet.y, other.x - pet.x) - facing)));
        if (d <= attack.cone && off <= 0.6) {
          this._bonusDamage(other, damage, sourceId, color);
          if (attack.burn > 0) this._applyDot(other, damage * attack.burn, 3, "#FF6600", sourceId);
        }
      }
      this.vfx?.breath(pet, target, attack.cone);
    }
    if (attack.burn > 0) this._applyDot(target, damage * attack.burn, 3, "#FF6600", sourceId);
    if (attack.bleed > 0) this._applyDot(target, damage * attack.bleed, 3, "#DC2626", sourceId);
    if (attack.lifelink > 0) this._classlessHeal(owner, damage * attack.lifelink);
    this._bonusDamage(target, damage, sourceId, color);
  }

  // Gauntlet hero history: what each hero did in this fight, carried back on
  // the hero model and folded into hero.history (game/qualities.js).
  _tally(h, stat, amount) {
    if (!h || !(amount > 0)) return;
    const logStat = { damage: "dealt", dodges: "dodges", meleeHits: "hits", rangedHits: "hits", crits: "crits" }[stat];
    if (logStat) this._logbook().count(h.i, logStat, amount);
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
    this._explodeNapalm(e.x, e.y, { dmg: e.damage * 6 * strength * this._hexDamage(e), splash: 72, color: "#FB923C" });
    this._float(e.x, e.y - 22, "BOOM", "#FB923C");
    this.effects.push({ kind: "impact", x: e.x, y: e.y, r: 36, life: 0.5, color: "#FB923C" });
    if (!e._dead) {
      // Blowing itself up earns the party nothing.
      e._dead = true;
      e.hp = 0;
      this.killed += 1;
    }
  }

  // A lobbed bomb about to land on `h` (its landing point is fixed when it is
  // thrown): step directly away from that point. Returns true if it moved.
  _dodgeBlast(h, dt) {
    const blast = this.projectiles.find((p) => p.kind === "napalm" && !p.dead &&
      Math.hypot(p.tx - p.x, p.ty - p.y) / p.spd <= DODGE_WARNING &&
      Math.hypot(h.x - p.tx, h.y - p.ty) < (p.splash || 68) + DODGE_CLEARANCE);
    if (!blast) return false;
    const dist = Math.hypot(h.x - blast.tx, h.y - blast.ty);
    // Dead centre: pick a side.
    const ux = dist > 1 ? (h.x - blast.tx) / dist : (h.x < W / 2 ? 1 : -1);
    const uy = dist > 1 ? (h.y - blast.ty) / dist : 0;
    const step = heroMovementSpeed(h) * dt;
    h.x = Math.max(KITE_MARGIN, Math.min(W - KITE_MARGIN, h.x + ux * step));
    h.y = Math.max(KITE_MARGIN, Math.min(FLOOR_Y - KITE_MARGIN, h.y + uy * step));
    return true;
  }

  // Step a ranged hero away from the nearest enemy inside KITE_RANGE (its
  // body edge), sliding along the field's edges. Returns true if it moved.
  _kite(h, dt) {
    let threat = null;
    let closest = Infinity;
    for (const enemy of this.active) {
      if (enemy.hp <= 0) continue;
      const gap = Math.hypot(enemy.x - h.x, enemy.y - h.y) - ENEMY_BODY_RADIUS(enemy);
      if (gap < closest) { closest = gap; threat = enemy; }
    }
    if (!threat || closest > KITE_RANGE) return false;
    const dist = Math.hypot(h.x - threat.x, h.y - threat.y) || 1;
    const step = heroMovementSpeed(h) * KITE_SPEED * dt;
    const clampX = (x) => Math.max(KITE_MARGIN, Math.min(W - KITE_MARGIN, x));
    const clampY = (y) => Math.max(KITE_MARGIN, Math.min(FLOOR_Y - KITE_MARGIN, y));
    let nx = clampX(h.x + ((h.x - threat.x) / dist) * step);
    let ny = clampY(h.y + ((h.y - threat.y) / dist) * step);
    // Backed against a wall: slide sideways toward the open middle instead.
    if (Math.hypot(nx - h.x, ny - h.y) < step * 0.5) {
      const side = h.x < W / 2 ? 1 : -1;
      nx = clampX(h.x + side * step);
      ny = h.y;
    }
    if (Math.hypot(nx - h.x, ny - h.y) < step * 0.25) return false;
    h.x = nx;
    h.y = ny;
    return true;
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
    return best;
  }

  _throwNapalm(e, target) {
    const obj = target.obj;
    this._engage(e, obj);
    this.projectiles.push({
      kind: "napalm",
      sourceId: "E" + e.type,
      source: e,
      x: e.x,
      y: e.y,
      tx: obj.x,
      ty: obj.y,
      target: obj,
      targetKind: target.kind,
      spd: 250,
      dmg: e.damage * 1.3 * this._hexDamage(e),
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

    // A bottle is a local area attack: only defenders standing in the
    // impact radius are hit. Spacing the squad therefore matters.
    for (const v of victims) {
      const falloff = 1 - 0.45 * (v.dist / splash);
      let dmg = p.dmg * falloff;
      if (v.kind === "hero") {
        const h = v.obj;
        if (this.rng() < this._heroDodgeChance(h, true)) {
          this._float(h.x, h.y - 20, "DODGE", "#00F3FF"); this._tally(h, "dodges", 1);
          continue;
        }
        dmg = this._classlessReducedDamage(h, dmg);
        dmg *= 1 - Math.min(0.9, h.d.gear?.blastWard || 0);
        if (p.source) { h.lastHitBy = p.source; this._vampiric(p.source); }
        if (h.ref.shield > 0) {
          const ab = Math.min(h.ref.shield, dmg);
          h.ref.shield -= ab;
          dmg -= ab;
        }
        this._resolveClasslessHeroDamage(h, dmg);
        this._float(h.x, h.y - 20, "-" + Math.round(dmg), p.color || "#FF6600");
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
    const classlessBonus = !area
      ? derived.evasion + (hpRatio >= 1 && derived.fullHpEvasion ? derived.fullHpEvasion : 0)
      : 0;
    return Math.min(0.5, Math.max(0, baseDodge + lowHpBonus + classlessBonus));
  }

  _classlessReducedDamage(hero, rawDamage) {
    const state = hero.classlessCombatState;
    const lastStand = state?.lastStandUntil > this.time ? hero.d.lastStand : 0;
    const interpose = hero.interposeUntil > this.time ? hero.interposeReduction : 0;
    const formation = this._classlessFormationReduction(hero);
    const aegis = hero.aegisUntil > this.time ? hero.aegisReduction || 0 : 0;
    const reduction = Math.min(0.30, Math.max(0, hero.d.damageReduction + lastStand + interpose + formation + aegis));
    // Gauntlet: Survivor quality below 30% HP; a Watcher's mark leaves a hero exposed.
    const guard = hero.ref.hp < hero.d.maxHp * 0.3 ? hero.d.traits?.lowHpGuard || 0 : 0;
    const exposed = hero.exposedUntil > this.time ? 1.15 : 1;
    return C.damageAfterDefense(rawDamage, hero.d.defense) * (1 - reduction) * (1 - (hero.d.traits?.damageTaken || 0)) * (1 - guard) * exposed
      * (1 - (hero.petGuard || 0));
  }

  _classlessFormationReduction(hero) {
    return this.heroes.reduce((highest, owner) => {
      const bonus = owner.alive ? owner.d.classlessEffects.formationMitigation : 0;
      return bonus > 0 && Math.hypot(owner.x - hero.x, owner.y - hero.y) <= 5
        ? Math.max(highest, bonus) : highest;
    }, 0);
  }

  _classlessOpeningBonus(target) {
    const controlledUntilBy = target?.classlessControlledUntilBy || {};
    const total = this.heroes.reduce((sum, owner) => {
      const controlUntil = controlledUntilBy[owner.i] || 0;
      return owner.alive && owner.d.classlessEffects.openingDamage > 0 &&
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

  _resolveClasslessHeroDamage(hero, damage) {
    const state = hero.classlessCombatState;
    if (damage > 0) hero.lastHurtAt = this.time;
    if (state?.decoy) {
      state.decoy = false;
      this._float(hero.x, hero.y - 20, "DECOY", "#A78BFA");
      return 0;
    }
    const remaining = Math.max(0, damage);
    if (remaining > 0) hero.hitUntil = this.time + 0.24;
    this._logbook().count(hero.i, "taken", remaining);
    if (remaining > 0 && hero.d.decoyChance > 0 && state.mirrorReadyAt <= this.time && this.rng() < hero.d.decoyChance) {
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
    if (remaining > 0) this._swornGuard(hero);
    if (remaining > 0 && hero.ref.hp > 0 && hero.ref.hp <= remaining && hero.d.classlessEffects?.clutch && !hero.clutchUsed && !this.clutch && !this.ended) {
      this._startClutch(hero);
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
    // Lifeline (Restoration): the blow that would drop them leaves them at 1 HP, then heals.
    if (hero.ref.hp <= 0 && hero.lifelineUntil > this.time) {
      hero.lifelineUntil = 0;
      hero.ref.hp = Math.min(hero.d.maxHp, 1 + hero.d.maxHp * (hero.lifelineHeal || 0));
      this._float(hero.x, hero.y - 22, "LIFELINE", "#FFD36B");
      this.vfx?.lifelineSave(hero);
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
      this._heroDowned(hero);
      this.effects.push({ kind: "death", x: hero.x, y: hero.y, r: 12, life: 0.55, color: "#F02DCA" });
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
    if (!hero.alive) return;
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
    if (!hero.alive) return;
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
    if (!obj || e.disarmUntil > this.time) return;
    this._engage(e, obj);
    // Blind decides now whether this shot will miss (no roll when not blinded).
    const missed = e.blindUntil > this.time && this.rng() < e.blindChance;
    damage *= this._hexDamage(e);
    this.projectiles.push({
      kind: "enemyBolt",
      sourceId: "E" + e.type,
      source: e,
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
      missed,
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
    if (p.missed) { this._float(obj.x, obj.y - 20, "MISS", "#94A3B8"); return; }
    if (p.targetKind === "hero") {
      const h = obj;
      if (!h.alive || h.ref?.hp <= 0) return;
      if (this.rng() < this._heroDodgeChance(h)) {
        this._float(h.x, h.y - 20, "DODGE", "#00F3FF"); this._tally(h, "dodges", 1);
        return;
      }
      let damage = this._classlessReducedDamage(h, p.dmg);
      if (p.source) { h.lastHitBy = p.source; this._vampiric(p.source); }
      if (h.ref.shield > 0) {
        const absorbed = Math.min(h.ref.shield, damage);
        h.ref.shield -= absorbed;
        damage -= absorbed;
      }
      this._resolveClasslessHeroDamage(h, damage);
      this._float(h.x, h.y - 20, "-" + Math.round(damage), p.color);
      if (damage > 0) this._triggerHeroReaction(h, "ally");
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
    if (e.disarmUntil > this.time) return;
    const h = blocker.obj;
    this._engage(e, h);
    if (this._hexMiss(e, h)) return;
    if (e.type === "warlock" && !(e.silenceUntil > this.time)) {
      h.ref.shield = 0;
    }
    if (this.rng() < this._heroDodgeChance(h)) { this._float(h.x, h.y - 20, "DODGE", "#00F3FF"); this._tally(h, "dodges", 1); return; }
    // Gauntlet behavior families: predators maul the wounded; a Carrion
    // Priest's sacrifice empowers its allies for a while.
    const predator = e.families?.includes("predator") && h.ref.hp < h.d.maxHp * 0.5 ? 1.4 : 1;
    const empowered = e.empoweredUntil > this.time ? 1.15 : 1;
    const raw = e.damage * predator * empowered * this._hexDamage(e);
    let dmg = this._classlessReducedDamage(h, raw);
    h.lastHitBy = e;
    if (h.ref.shield > 0) { const ab = Math.min(h.ref.shield, dmg); h.ref.shield -= ab; dmg -= ab; }
    this._resolveClasslessHeroDamage(h, dmg);
    if (dmg > 0) this._triggerHeroReaction(h, "ally");
    if (dmg > 0 && h.d.gear?.thorns > 0 && e.hp > 0) this._bonusDamage(e, dmg * h.d.gear.thorns, "H" + h.i, "#F8FAFC");
    if (e.boss) e.hp = Math.min(e.maxHp, e.hp + dmg * 0.5); // Demon Lord lifesteal
    if (dmg > 0) this._vampiric(e);
    this._float(h.x, h.y - 20, "-" + Math.round(dmg), "#FF3366");
  }

  _fire(sourceId, src, target, d, isHero, { extra = false } = {}) {
    // Gauntlet: bows spend an arrow per shot (volley shots are free).
    let arrowEffect = null;
    if (isHero && src.d.usesArrows && !extra) {
      arrowEffect = this._drawArrow(src);
      if (arrowEffect === false) return false;
    }
    if (isHero) {
      src.visualActionKind = "attack";
      src.visualActionStartedAt = this.time;
      src.visualActionUntil = this.time + 0.36;
      src.facingTarget = target;
    }
    const weaponType = isHero ? getEquippedHeroWeaponType(src.model) : null;
    const visualType = isHero
      ? (weaponType === "bow" ? "arrow" : weaponType === "staff" ? "magic" : null)
      : null;
    const shot = {
      sourceId, x: src.x, y: src.y, tx: target.x, ty: target.y, target,
      heroActionIndex: isHero && src.pendingTacticalAction === "attack" && src.manualTarget === target ? src.i : null,
      spd: d.magic ? 340 : 460, dmg: (d.damage || d.attack) * this._consumeAmmoShot(src, isHero), magic: !!d.magic,
      critChance: isHero ? (d.critChance ?? C.BASE_CRIT) : C.BASE_CRIT,
      critMult: isHero ? (d.critMult ?? C.CRIT_MULT) : C.CRIT_MULT,
      heroIndex: isHero ? src.i : null,
      damageCategory: isHero ? "weapon" : null,
      damageType: Object.prototype.hasOwnProperty.call(d, "damageType") ? d.damageType
        : d.magic ? C.DAMAGE_TYPES.ARCANE : C.DAMAGE_TYPES.ARCHER_RANGED,
      color: isHero ? d.color : d.color, t: 0,
      visualType,
      vfxAssetId: projectileVfxAssetId({ visualType, sourceId }),
      arrowEffect,
    };
    // Gauntlet: melee weapons (swords) strike in place, with no projectile.
    if (isHero && src.d.rangeMode === "melee") {
      this._applyHit(shot);
      if (Number.isInteger(shot.heroActionIndex)) this._completeTacticalAction(shot.heroActionIndex, "completed");
    } else {
      this.projectiles.push(shot);
    }
    if (isHero && weaponType === "sword") {
      this.effects.push({ kind: "weapon_swing", x: src.x, y: src.y - 7, r: 15, life: 0.22,
        color: src.d.color, vfxSize: 48, rotation: Math.atan2(target.y - src.y, target.x - src.x) });
      this.effects.push({ kind: "weapon_swing", x: target.x, y: target.y, r: 18, life: 0.2,
        color: src.d.color, vfxSize: 56, rotation: Math.atan2(target.y - src.y, target.x - src.x) });
    }
    this.effects.push({ x: src.x, y: src.y, r: 8, life: 0.18, color: d.color, ring: true });
    // Whisperwind: every third shot looses extra arrows at other enemies in range.
    if (isHero && !extra && src.d.gear?.volley > 0) {
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

  // Every hit comes from a hero (enemies damage heroes elsewhere).
  _applyHit(p) {
    return this._applyClasslessHit(p);
  }

  _applyClasslessHit(p) {
    const target = p.target;
    const hero = this.heroes[p.heroIndex];
    if (!target || target.hp <= 0 || !hero || !this._isValidClasslessTarget(hero, target)) return false;
    const effects = hero.d.classlessEffects;
    const affinity = p.damageType ? C.affinityMultiplier(target, p.damageType) : 1;
    if (affinity <= 0 || (p.magic && target.magicImmune)) {
      this._float(target.x, target.y - 4, "IMMUNE", "#39FF14");
      return false;
    }
    // Gauntlet darkness: some weapon attacks miss outright.
    if (p.damageCategory === "weapon" && hero.d.env?.miss > 0 && this.rng() < hero.d.env.miss) {
      this._logbook().count(hero.i, "misses");
      this._float(target.x, target.y - 4, "MISS", "#64748B");
      return false;
    }
    target.hitUntil = this.time + 0.18;
    const echoMarks = this._takeClasslessEchoMarks(target, p.sourceId);
    let damage = p.dmg * affinity;
    if (p.damageCategory === "weapon") damage *= (1 + effects.weaponDamage) * (1 + (hero.d.masteryWeaponDamage || 0));
    // Backstab: a melee hit on a foe busy fighting someone else (it attacked
    // another hero or a familiar in the last few seconds), or a Phantom
    // Strike. Backstab mastery and Shadowblade add damage.
    const backstab = p.damageCategory === "weapon" && !p.damageOverTime && !p.area
      && (p.backstab || (hero.d.rangeMode === "melee" && target.engagedUntil > this.time && target.engagedWith !== hero));
    if (backstab) damage *= 1 + (hero.d.backstabDamage || 0);
    // Gauntlet traits and Hall of Legends bonuses (Berserker below half HP).
    const traits = hero.d.traits;
    if (traits) damage *= 1 + traits.damage + (hero.ref.hp < hero.d.maxHp * 0.5 ? traits.berserk : 0);
    damage *= 1 + (hero.d.gear?.damageBonus || 0);
    damage *= 1 + this._bondDamage(hero);
    // Empower (Warding): the party hits harder for a while.
    if (hero.empowerUntil > this.time) damage *= 1 + (hero.empowerDamage || 0);
    // Evolved qualities: Bladesworn (melee) and Giantslayer (elites and bosses).
    if (p.damageCategory === "weapon" && hero.d.rangeMode === "melee") damage *= 1 + (traits?.meleeDamage || 0);
    if (target.boss || target.tier === "elite") damage *= 1 + (traits?.eliteDamage || 0);
    // A hawk's mark: its partner hits the marked foe harder.
    if (target.petMarkUntil > this.time && target.petMarkOwner === hero.i) damage *= 1 + target.petMarkBonus;
    // Expose (Mind): the party's main kind of damage hits harder.
    if (target.exposeUntil > this.time && this._exposeMatches(target.exposeKind, hero, p.magic, p.damageCategory === "weapon")) damage *= 1 + target.exposeBonus;
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
    // Jackpot: the next few direct weapon hits are sure crits.
    const jackpot = p.damageCategory === "weapon" && !p.ability && hero.jackpotHits > 0;
    if (jackpot) hero.jackpotHits -= 1;
    const crit = p.guaranteedCrit || jackpot || this.rng() < hero.d.critChance;
    if (crit) damage *= hero.d.critMult;
    // Loaded Dice: 10% of weapon hits deal 150%, 20% deal 75%.
    if (p.damageCategory === "weapon" && effects.loadedDice) {
      const roll = this.rng();
      if (roll < 0.1) damage *= 1.5;
      else if (roll < 0.3) damage *= 0.75;
    }
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
      if (backstab) this._tally(hero, "backstabs", 1);
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
    if (gear.shock > 0 && this.rng() < gear.shock) {
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

  // ---- Bonds (game/bonds.js) ----
  _bondPartner(h, partnerId) {
    return this.heroes.find((other) => other !== h && other.model?.identity?.id === partnerId) || null;
  }

  // Comrades fighting together, Vengeance or Shaken, and memories of the retired.
  _bondDamage(h) {
    let bonus = memorialDamage(h.model);
    if ((h.model?.bonds || []).some((bond) => this._bondPartner(h, bond.partnerId)?.alive)) bonus += BONDS.comradesDamage;
    if (h.vengeanceUntil > this.time) bonus += BONDS.vengeanceDamage;
    if (h.shaken) bonus += BONDS.shakenDamage;
    return bonus;
  }

  // A bonded partner fell: fury, or for calm natures, shaken resolve.
  _bondsReactToFall(fallen) {
    const id = fallen.model?.identity?.id;
    for (const h of this.heroes) {
      if (h === fallen || !h.alive || !(h.model?.bonds || []).some((bond) => bond.partnerId === id)) continue;
      if ((h.model?.traits || []).some((trait) => BONDS.calm.includes(trait))) {
        h.shaken = true;
        this._float(h.x, h.y - 24, "SHAKEN", "#94A3B8");
      } else {
        h.vengeanceUntil = this.time + BONDS.vengeanceSeconds;
        this._float(h.x, h.y - 24, "VENGEANCE", "#F43F5E");
        this.effects.push({ kind: "guard", x: h.x, y: h.y, r: 24, life: 0.6, color: "#F43F5E" });
      }
    }
  }

  // Sworn: a partner dropping low gets shielded by the other, once a fight.
  _swornGuard(hero) {
    if (!hero.alive || hero.ref.hp >= hero.d.maxHp * BONDS.guardBelow) return;
    const bond = (hero.model?.bonds || []).find((entry) => entry.level === "sworn");
    const guard = bond && this._bondPartner(hero, bond.partnerId);
    if (!guard?.alive || guard.swornGuardUsed) return;
    guard.swornGuardUsed = true;
    hero.ref.shield = (hero.ref.shield || 0) + hero.d.maxHp * BONDS.guardShield;
    guard.x = hero.x + (guard.x < hero.x ? -18 : 18);
    guard.y = hero.y;
    this._float(hero.x, hero.y - 30, `${(guard.model?.identity?.name || "SWORN").toUpperCase()} GUARDS!`, "#38BDF8");
    this.effects.push({ kind: "shield", x: hero.x, y: hero.y, r: 26, life: 0.7, color: "#38BDF8" });
  }

  _heroDowned(h) {
    this._bondsReactToFall(h);
    const foe = h.lastHitBy;
    this._log("death", `${this._name(h)} is down${foe ? ` (${this._foeName(foe)})` : ""}`);
    this.downed[h.i] = foe ? { type: foe.type, name: foe.name, nemesisId: foe.nemesisId || null, boss: !!foe.boss, summoned: !!(foe.summoned || foe.raised) } : null;
  }

  // The per-fight record every onEnd carries, beside victory and reason:
  // who downed each hero, nemesis results, Clutch moments and successful
  // casts. game/fightOutcome.js turns it into the canonical fight result.
  _fightSummary() {
    return { downed: this.downed, nemesisSlain: this.nemesisSlain, nemesisFled: this.nemesisFled, clutches: this.clutches,
      spellCasts: this.spellSuccesses };
  }

  // ---- Spells (spells.js) ----
  _classlessSpellStatus(h) {
    if (!h.maxMana) return [];
    const strainNow = this._strainIfCastNow(h) * CASTING.strainPerCast;
    const busy = this._castBusy(h);
    return knownSpells(h.model).map((spell) => {
      const cooldown = Math.max(0, h.spellCooldowns[spell.id] || 0);
      // After Mana Surge the next spell is free.
      const cost = h.freeSpell ? 0 : spell.mana;
      return { ...spell, color: ELEMENTS[spell.element].color, cost, free: !!h.freeSpell, cooldownSeconds: spell.cooldown, cooldown,
        cooldownTotal: spell.cooldown * h.d.cooldownMultiplier,
        mana: Math.round(h.mana), maxMana: h.maxMana, success: castSuccessChance(h.model, spell.element),
        // Casting by hand right now: the strain it would add, and what's left to land.
        strain: strainNow, nowSuccess: Math.max(0.05, castSuccessChance(h.model, spell.element) - strainNow),
        busy, queued: h.spellQueue.includes(spell.id), queue: h.spellQueue.slice(),
        // A support spell with nobody to help can't be cast (no heal at full HP).
        noTarget: !!spell.support && !this._supportTarget(h, spell, false),
        available: h.alive && cooldown <= 0 && h.mana >= cost && !this.ended
          && (!spell.support || !!this._supportTarget(h, spell, false)) };
    });
  }

  // Cast a spell now (the player's tap, or the hero on auto). Mana and the
  // cooldown are spent whether it works or fizzles. Returns true if cast.
  // `announce`: the player tapped it, so its name flashes over the caster.
  castHeroSpell(index, spellId, target = null, { announce = false } = {}) {
    const h = this.heroes[index];
    const spell = h && this._classlessSpellStatus(h).find((entry) => entry.id === spellId);
    if (!spell?.available) return false;
    if (spell.support) return this._castSupport(h, spell, spellId, target, announce);
    const foe = (target && target.hp > 0 ? target : null)
      || [this.heroSpellTarget(h.i), h.manualTarget, h.currentTarget].find((enemy) => enemy?.hp > 0 && Math.hypot(enemy.x - h.x, enemy.y - h.y) <= spell.range)
      || this._nearestEnemy(h.x, h.y, spell.range);
    if (!foe) return false;
    const success = this._spendCast(h, spell, spellId);
    if (!(this.rng() < success)) {
      if (this.vfx) this.vfx.fizzle(spell.element, h.x, h.y);
      else this._float(h.x, h.y - 26, "FIZZLE", "#94A3B8");
      this._logFizzle(h, spell);
      return true;
    }
    this._logbook().count(h.i, "spells");
    if (!HEX_SHAPES.has(spell.shape) && !CONTROL_SHAPES.has(spell.shape)) {
      this._log("spell", `${this._name(h)} · ${spell.name} → ${this._foeName(foe)}`);
    }
    if (announce) this._callout(h, spell.name.toUpperCase(), spell.color, BIG_SPELLS.has(spellId));
    (this.spellSuccesses[h.i] ||= {})[spellId] = ((this.spellSuccesses[h.i] || {})[spellId] || 0) + 1;
    this._tally(h, SPELLS[spellId]?.support ? "supportCasts" : "casts", 1);
    const staff = getEquippedHeroWeaponType(h.model) === "staff";
    const damage = (h.d.attack || 0) * spellPower(h.model, spellId, { staff });
    const sourceId = "H" + h.i;
    const rank = proficiency(h.model, spell.element);
    if (this.vfx) this.vfx.cast(spell.element, h.x, h.y, rank);
    else this.effects.push({ kind: "spell_area", x: foe.x, y: foe.y, r: 18, life: 0.4, color: spell.color, vfxSize: 40 });
    if (spell.shape === "meteor") {
      this.meteors.push({ x: foe.x, y: foe.y, at: this.time + spell.delay, damage, radius: spellRadius(h.model, spellId),
        max: spell.maxTargets, color: spell.color, sourceId });
      if (this.vfx) {
        const radius = spellRadius(h.model, spellId);
        this.vfx.meteorWarning(foe.x, foe.y, radius, spell.delay);
        // The rock starts falling just before the meteor lands.
        this.vfx._add({ kind: "delay", life: Math.max(0, spell.delay - 0.22), fire: () => this.vfx.meteorImpact(foe.x, foe.y, radius, rank) });
      } else {
        this.effects.push({ kind: "spell_area", x: foe.x, y: foe.y, r: spellRadius(h.model, spellId), life: spell.delay, color: spell.color, vfxSize: 52 });
      }
      this._float(foe.x, foe.y - 30, "METEOR!", spell.color);
      return true;
    }
    if (spell.shape === "area") {
      const radius = spellRadius(h.model, spellId);
      const victims = this.active.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - foe.x, enemy.y - foe.y) <= radius);
      for (const victim of victims) this._spellHit(h, victim, damage, spell.element, sourceId, false);
      if (this.vfx) this.vfx.area(spell.element, foe.x, foe.y, radius, rank);
      else this.effects.push({ kind: "spell_area", x: foe.x, y: foe.y, r: radius, life: 0.6, color: spell.color, vfxSize: 52 });
    } else if (HEX_SHAPES.has(spell.shape)) {
      this._castHex(h, spell, foe, rank);
    } else if (CONTROL_SHAPES.has(spell.shape)) {
      this._castControl(h, spell, foe, damage, sourceId, rank);
    } else if (spell.shape === "linger") {
      this.vfx?.bolt(spell.element, h, foe, rank);
      if (this._spellImmune(foe)) return true;
      this._applyDot(foe, damage * 2, spell.seconds, spell.color, sourceId);
      this._spellElement(h, foe, damage, spell.element, sourceId, true);
      this.vfx?.aura(spell.element, foe, spell.seconds, rank);
      this._float(foe.x, foe.y - 18, spell.name.toUpperCase(), spell.color);
    } else {
      this.vfx?.bolt(spell.element, h, foe, rank);
      this._spellHit(h, foe, damage, spell.element, sourceId, true);
      // Chain Spark: elemental bolts jump to more foes.
      if (spell.element !== "arcane" && h.d.classlessEffects?.chainSpark) {
        let from = foe;
        const hit = new Set([foe]);
        for (let jump = 0; jump < MAGIC.chainJumps; jump += 1) {
          const next = this.active.filter((enemy) => enemy.hp > 0 && !hit.has(enemy))
            .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
          if (!next || Math.hypot(next.x - from.x, next.y - from.y) > 140) break;
          hit.add(next);
          this.vfx?.arc(spell.element, from, next, rank);
          this._spellHit(h, next, damage * MAGIC.chainShare, spell.element, sourceId, false);
          from = next;
        }
      }
    }
    return true;
  }

  _spellImmune(enemy) {
    if (!enemy.magicImmune) return false;
    this._float(enemy.x, enemy.y - 4, "IMMUNE", "#39FF14");
    return true;
  }

  _spellHit(h, enemy, damage, element, sourceId, showName) {
    if (this._spellImmune(enemy)) return;
    if (enemy.exposeUntil > this.time && enemy.exposeKind === "magic") damage *= 1 + enemy.exposeBonus;
    this._bonusDamage(enemy, damage, sourceId, ELEMENTS[element].color);
    this._tally(h, "damage", damage);
    if (enemy.hp > 0) this._spellElement(h, enemy, damage, element, sourceId, false);
    if (showName) this.effects.push({ kind: "hit", x: enemy.x, y: enemy.y, r: 16, life: 0.4, color: ELEMENTS[element].color, crit: false });
  }

  // What each element does besides damage; lingering spells hit harder.
  // ---- support spells (Restoration, Warding) ----------------------------------

  _partyHpFraction() {
    const alive = this.heroes.filter((hero) => hero.alive);
    const max = alive.reduce((sum, hero) => sum + hero.d.maxHp, 0);
    return max ? alive.reduce((sum, hero) => sum + Math.max(0, hero.ref.hp), 0) / max : 1;
  }

  // Who a support spell would help now, or null. `auto`: the party deciding by
  // itself, which waits until the help is needed; a tap only needs someone it
  // can help (no heal at full HP, no second Barrier).
  _supportTarget(h, spell, auto) {
    if (!h?.alive) return null;
    const frac = (ally) => ally.ref.hp / Math.max(1, ally.d.maxHp);
    const reach = spell.range || spell.radius || 300;
    const near = this.heroes.filter((ally) => ally.alive && Math.hypot(ally.x - h.x, ally.y - h.y) <= reach);
    const lowest = (list) => list.sort((a, b) => frac(a) - frac(b))[0] || null;
    const underAttack = (ally) => this.time - (ally.lastHurtAt ?? -99) < 1.5;
    switch (spell.shape) {
      case "heal": return lowest(near.filter((ally) => frac(ally) < (auto ? 0.55 : 0.999)));
      case "renew": {
        const hurt = near.filter((ally) => frac(ally) < (auto ? 0.7 : 0.999) && !(ally.renewUntil > this.time));
        return hurt.length >= (auto ? 2 : 1) ? h : null;
      }
      case "lifeline": return lowest(near.filter((ally) => !(ally.lifelineUntil > this.time) && (!auto || (frac(ally) < 0.35 && underAttack(ally)))));
      case "barrier": return lowest(near.filter((ally) => !(ally.barrierUntil > this.time) && (ally.ref.shield || 0) < ally.d.maxHp * SHIELD_CAP && (!auto || underAttack(ally))));
      case "empower": {
        const fresh = near.filter((ally) => !(ally.empowerUntil > this.time));
        if (!fresh.length) return null;
        if (!auto) return h;
        const foes = this.active.filter((enemy) => enemy.hp > 0);
        return foes.some((enemy) => enemy.boss || enemy.tier === "elite") || foes.length >= 3 ? h : null;
      }
      case "aegis": {
        const fresh = near.filter((ally) => !(ally.aegisUntil > this.time));
        if (!fresh.length) return null;
        if (!auto) return h;
        return this.active.some((enemy) => enemy.hp > 0 && enemy.boss) || this._partyHpFraction() < 0.6 ? h : null;
      }
      case "veil": return lowest(near.filter((ally) => !this._isHeroUntargetable(ally) && (!auto || (frac(ally) < 0.4 && underAttack(ally)))));
      case "summon": {
        const mine = this.pets.some((pet) => pet.summoned && pet.owner === h && !pet.down);
        if (mine || !this.active.some((enemy) => enemy.hp > 0)) return null;
        return !auto || h.mana - spell.cost >= CONTROL.manaReserve ? h : null;
      }
      default: return null;
    }
  }

  _castSupport(h, spell, spellId, given, announce) {
    const target = given && this.heroes.includes(given) && given.alive ? given : this._supportTarget(h, spell, false);
    if (!target) return false;
    const success = this._spendCast(h, spell, spellId);
    if (!(this.rng() < success)) {
      if (this.vfx) this.vfx.fizzle(spell.element, h.x, h.y);
      else this._float(h.x, h.y - 26, "FIZZLE", "#94A3B8");
      this._logFizzle(h, spell);
      return true;
    }
    if (announce) this._callout(h, spell.name.toUpperCase(), spell.color, false);
    (this.spellSuccesses[h.i] ||= {})[spellId] = ((this.spellSuccesses[h.i] || {})[spellId] || 0) + 1;
    this._tally(h, SPELLS[spellId]?.support ? "supportCasts" : "casts", 1);
    this._logbook().count(h.i, "spells");
    this._log("spell", `${this._name(h)} · ${spell.name} → ${spell.radius ? "the party" : this._name(target)}`);
    const staff = getEquippedHeroWeaponType(h.model) === "staff";
    const power = supportPower(h.model, spellId, { staff });
    const rank = this.vfx ? proficiency(h.model, spell.element) : 1;
    const radius = spell.radius || 0;
    const party = radius ? this.heroes.filter((ally) => ally.alive && Math.hypot(ally.x - h.x, ally.y - h.y) <= radius) : [target];
    this.vfx?.cast(spell.element, h.x, h.y, rank);
    if (spell.shape === "heal") {
      const healed = Math.min(target.d.maxHp * power, Math.max(0, target.d.maxHp - target.ref.hp));
      target.ref.hp += healed;
      if (healed > 0) this._float(target.x, target.y - 26, `+${Math.round(healed)}`, spell.color);
      this.vfx?.supportBurst("restoration", target, rank);
    } else if (spell.shape === "renew") {
      for (const ally of party) {
        const perSecond = (ally.d.maxHp * power) / spell.seconds;
        ally.renewPerSecond = ally.renewUntil > this.time ? Math.max(ally.renewPerSecond || 0, perSecond) : perSecond;
        ally.renewUntil = this.time + spell.seconds;
        this.vfx?.aura("renewal", ally, spell.seconds, rank);
      }
    } else if (spell.shape === "lifeline") {
      target.lifelineUntil = this.time + spell.seconds;
      target.lifelineHeal = power;
      this.vfx?.aura("lifeline", target, spell.seconds, rank);
    } else if (spell.shape === "barrier") {
      const before = target.ref.shield || 0;
      target.ref.shield = Math.min(target.d.maxHp * SHIELD_CAP, before + target.d.maxHp * power);
      target.barrierLeft = (target.barrierLeft || 0) + (target.ref.shield - before);
      target.barrierUntil = this.time + spell.seconds;
      this._float(target.x, target.y - 26, `+${Math.round(target.ref.shield - before)} shield`, spell.color);
      this.vfx?.supportBurst("warding", target, rank);
      this.vfx?.aura("barrier", target, spell.seconds, rank, () => (target.ref.shield || 0) > 0 && target.barrierLeft > 0);
    } else if (spell.shape === "empower") {
      for (const ally of party) {
        ally.empowerUntil = this.time + spell.seconds;
        ally.empowerDamage = power;
        ally.empowerSpeed = spell.speed * (power / spell.power);
        this.vfx?.aura("empower", ally, spell.seconds, rank);
      }
    } else if (spell.shape === "veil") {
      target.untargetableUntil = Math.max(target.untargetableUntil || 0, this.time + spell.seconds);
      const state = target.classlessCombatState;
      if (state) state.vanishDamagePending = Math.max(state.vanishDamagePending || 0, power);
      this.vfx?.aura("veil", target, spell.seconds, rank, () => this._isHeroUntargetable(target));
    } else if (spell.shape === "summon") {
      this._summonBeast(h, spell, power, rank);
    } else if (spell.shape === "aegis") {
      for (const ally of party) {
        ally.aegisUntil = this.time + spell.seconds;
        ally.aegisReduction = power;
        this.vfx?.aura("aegis", ally, spell.seconds, rank);
      }
    }
    return true;
  }

  // ---- battle log (battleLog.js): records only, never changes the fight ----------

  _logbook() {
    return this.battleLog ||= new BattleLog(this.heroes.map((h) => this._name(h)));
  }

  _log(kind, text) {
    this._logbook().add(this.time, kind, text);
  }

  _name(h) {
    return h?.model?.identity?.name || "Hero";
  }

  _foeName(e) {
    return e?.name || C.ENEMIES[e?.type]?.name || e?.type || "foe";
  }

  _logFizzle(h, spell) {
    this._logbook().count(h.i, "fizzles");
    const penalty = h.strain * CASTING.strainPerCast;
    this._log("fizzle", `${this._name(h)} · ${spell.name} fizzled${penalty > 0 ? ` (strained −${Math.round(penalty * 100)}%)` : ""}`);
  }

  // ---- hexes (Shadow: Blind, Disarm; Mind: Enfeeble, Silence, Expose) ------------

  // How much of a hex this foe takes: elites half, bosses a quarter.
  _hexScale(e) {
    return e.boss ? HEX.boss : e.tier === "elite" ? HEX.elite : 1;
  }

  // Enfeeble: what's left of this foe's damage.
  _hexDamage(e) {
    return e.enfeebleUntil > this.time ? 1 - (e.enfeebleCut || 0) : 1;
  }

  // Blind: does this attack miss? Rolls only while the foe is blinded.
  _hexMiss(e, victim) {
    if (!(e.blindUntil > this.time) || !(this.rng() < e.blindChance)) return false;
    this._float(victim.x, victim.y - 20, "MISS", "#94A3B8");
    return true;
  }

  // Expose's kind: what most of the living party deals (ties: the caster's own).
  _exposeKind(h) {
    const kindOf = (hero) => {
      const weapon = getEquippedHeroWeaponType(hero.model);
      return weapon === "staff" ? "magic" : weapon === "bow" ? "ranged" : "melee";
    };
    const counts = {};
    for (const hero of this.heroes) if (hero.alive) counts[kindOf(hero)] = (counts[kindOf(hero)] || 0) + 1;
    const own = kindOf(h);
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || (b === own) - (a === own))[0] || own;
  }

  _exposeMatches(kind, hero, magic, weapon) {
    if (kind === "magic") return !!magic;
    if (!weapon || magic) return false;
    return kind === "melee" ? hero.d.rangeMode === "melee" : hero.d.rangeMode !== "melee";
  }

  _castHex(h, spell, foe, rank) {
    this.vfx?.bolt(spell.element, h, foe, rank);
    let took = 0;
    if (!spell.radius) took = this._hexOne(h, spell, foe, rank) ? 1 : 0;
    else {
      this.vfx?.area(spell.element, foe.x, foe.y, spell.radius, rank);
      for (const victim of this._hexArea(foe, spell.radius)) if (this._hexOne(h, spell, victim, rank)) took += 1;
    }
    this._log("control", took
      ? `${this._name(h)} · ${spell.name} → ${this._foeName(foe)}${took > 1 ? ` + ${took - 1}` : ""}${spell.shape === "expose" ? ` (${foe.exposeKind})` : ""}`
      : `${this._name(h)} · ${spell.name} → ${this._foeName(foe)}: no effect`);
  }

  _hexArea(foe, radius) {
    return this.active.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - foe.x, enemy.y - foe.y) <= radius);
  }

  _hexOne(h, spell, foe, rank) {
    if (foe.hp <= 0 || this._spellImmune(foe)) return false;
    const scale = this._hexScale(foe);
    const until = this.time + spell.seconds;
    let label = spell.name.toUpperCase();
    let seconds = spell.seconds;
    if (spell.shape === "blind") {
      foe.blindChance = foe.blindUntil > this.time ? Math.max(foe.blindChance, spell.strength * scale) : spell.strength * scale;
      foe.blindUntil = Math.max(foe.blindUntil || 0, until);
      label = "BLINDED";
    } else if (spell.shape === "enfeeble") {
      foe.enfeebleCut = foe.enfeebleUntil > this.time ? Math.max(foe.enfeebleCut, spell.strength * scale) : spell.strength * scale;
      foe.enfeebleUntil = Math.max(foe.enfeebleUntil || 0, until);
      label = "ENFEEBLED";
    } else if (spell.shape === "silence") {
      seconds = spell.seconds * scale;
      foe.silenceUntil = Math.max(foe.silenceUntil || 0, this.time + seconds);
      foe.raisingUntil = null; // a raise in progress is broken off
      label = "SILENCED";
    } else if (spell.shape === "disarm") {
      seconds = spell.seconds * scale;
      foe.disarmUntil = Math.max(foe.disarmUntil || 0, this.time + seconds);
      label = "DISARMED";
    } else if (spell.shape === "expose") {
      foe.exposeUntil = until;
      foe.exposeKind = this._exposeKind(h);
      foe.exposeBonus = spell.bonus;
      label = `EXPOSED: ${foe.exposeKind.toUpperCase()}`;
    }
    this._float(foe.x, foe.y - 18, label, spell.color);
    this.vfx?.aura(spell.shape, foe, seconds, rank);
    return true;
  }

  // The hex an unattended caster would cast now, and at whom: Silence on a
  // foe with abilities, then Enfeeble, Disarm and Blind where they take the
  // most foes in the fight (a big one, 2+ foes, or one on a hurt hero), then
  // Expose on a big foe.
  _autoHex(h, ready) {
    const hexes = ready.filter((spell) => HEX_SHAPES.has(spell.shape));
    if (!hexes.length) return null;
    const by = (shape) => hexes.find((spell) => spell.shape === shape);
    const threat = (e) => e.damage * (e.boss ? 3 : e.tier === "elite" ? 2 : 1);
    const big = (e) => e.boss || e.tier === "elite";
    const alive = this.heroes.filter((ally) => ally.alive);
    const pressing = (e) => alive.some((ally) => Math.hypot(e.x - ally.x, e.y - ally.y) <= 140);
    const onHurt = (e) => alive.some((ally) => ally.ref.hp < ally.d.maxHp * 0.5 && Math.hypot(e.x - ally.x, e.y - ally.y) <= 140);
    const foes = (spell, until) => this.active
      .filter((e) => e.hp > 0 && !e.magicImmune && !(e[until] > this.time) && !(e.dominatedUntil > this.time) && !(e.confusedUntil > this.time)
        && Math.hypot(e.x - h.x, e.y - h.y) <= (spell.range || 300))
      .sort((a, b) => threat(b) - threat(a));
    const silence = by("silence");
    if (silence) {
      const foe = foes(silence, "silenceUntil").find((e) => e.boss || e.champion || SILENCEABLE.has(e.type));
      if (foe) return { spell: silence, foe };
    }
    for (const [shape, until] of [["enfeeble", "enfeebleUntil"], ["disarm", "disarmUntil"], ["blind", "blindUntil"]]) {
      const spell = by(shape);
      if (!spell) continue;
      // Fresh foes in the fight it would take, centred on each candidate.
      const caught = (e) => this._hexArea(e, spell.radius).filter((other) => !other.magicImmune && !(other[until] > this.time) && pressing(other));
      const best = foes(spell, until).map((e) => ({ e, n: caught(e).length, worth: caught(e).some(big) || caught(e).some(onHurt) }))
        .filter((entry) => entry.n >= 2 || entry.worth)
        .sort((a, b) => b.n - a.n)[0];
      if (best) return { spell, foe: best.e };
    }
    const expose = by("expose");
    if (expose) {
      const foe = foes(expose, "exposeUntil").find((e) => big(e) && e.hp > e.maxHp * 0.4);
      if (foe) return { spell: expose, foe };
    }
    return null;
  }

  // ---- control (Shadow, Wild Magic, Dominate) --------------------------------

  // Is this foe already held by a control spell? (No wasted casts on it.)
  _controlled(e) {
    return e.rootUntil > this.time || e.fearUntil > this.time || e.confusedUntil > this.time || e.dominatedUntil > this.time;
  }

  // How long `spell` holds `e`: elites half, bosses `spell.boss` (0: immune);
  // Dominate never takes bosses, elites, nemeses or legends.
  _controlSeconds(e, spell) {
    if (spell.shape === "dominate" && (e.boss || e.tier === "elite" || e.legendary || e.nemesisId)) return 0;
    if (e.boss) return spell.boss ?? 0;
    return e.tier === "elite" ? spell.seconds * CONTROL.elite : spell.seconds;
  }

  _castControl(h, spell, foe, damage, sourceId, rank) {
    const held = this._castControlEffect(h, spell, foe, damage, sourceId, rank);
    if (held === false) this._log("control", `${this._name(h)} · ${spell.name} → ${this._foeName(foe)}: resisted`);
    else if (held > 0) this._log("control", `${this._name(h)} · ${spell.name} → ${this._foeName(foe)}${held > 1 ? ` + ${held - 1}` : ""}`);
  }

  // Applies a control spell; returns how many foes it took hold of, or false if resisted.
  _castControlEffect(h, spell, foe, damage, sourceId, rank) {
    const source = "H" + h.i;
    let held = 0;
    if (spell.shape === "terror") {
      const victims = this.active.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - foe.x, enemy.y - foe.y) <= spell.radius);
      this.vfx?.area("shadow", foe.x, foe.y, spell.radius, rank);
      for (const victim of victims) {
        this._spellHit(h, victim, damage, spell.element, sourceId, false);
        if (victim.hp <= 0 || this._spellImmune(victim)) continue;
        const seconds = this._controlSeconds(victim, spell);
        if (victim.boss) victim.stunUntil = Math.max(victim.stunUntil || 0, this.time + seconds);
        else victim.fearUntil = Math.max(victim.fearUntil || 0, this.time + seconds);
        this.vfx?.aura("fear", victim, seconds, rank);
        held += 1;
      }
      return held;
    }
    if (spell.shape === "thornfield") {
      const radius = spellRadius(h.model, spell.id || "thornfield");
      const victims = this.active.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - foe.x, enemy.y - foe.y) <= radius);
      this.vfx?.area("wild", foe.x, foe.y, radius, rank);
      for (const victim of victims) {
        this._spellHit(h, victim, damage, spell.element, sourceId, false);
        if (victim.hp <= 0 || this._spellImmune(victim)) continue;
        this._applyDot(victim, damage * spell.bleed, 3, "#DC2626", sourceId);
        const seconds = this._controlSeconds(victim, spell);
        victim.rootUntil = Math.max(victim.rootUntil || 0, this.time + seconds);
        this.vfx?.aura("root", victim, seconds, rank);
        held += 1;
      }
      return held;
    }
    this.vfx?.bolt(spell.element, h, foe, rank);
    if (spell.shape === "ensnare") this._spellHit(h, foe, damage, spell.element, sourceId, true);
    if (foe.hp <= 0 || this._spellImmune(foe)) return 0;
    const seconds = this._controlSeconds(foe, spell);
    if (!(seconds > 0)) { this._float(foe.x, foe.y - 18, "RESISTS", spell.color); return false; }
    if (spell.shape === "ensnare") {
      foe.rootUntil = Math.max(foe.rootUntil || 0, this.time + seconds);
      this.vfx?.aura("root", foe, seconds, rank);
    } else if (spell.shape === "confusion") {
      foe.confusedUntil = this.time + seconds;
      foe.controlSource = source;
      this._float(foe.x, foe.y - 18, "CONFUSED", spell.color);
      this.vfx?.aura("confuse", foe, seconds, rank);
    } else if (spell.shape === "dominate") {
      foe.dominatedUntil = this.time + seconds;
      foe.controlSource = source;
      if (h.manualTarget === foe) h.manualTarget = null;
      for (const ally of this.heroes) if (ally.currentTarget === foe) ally.currentTarget = null;
      this._float(foe.x, foe.y - 18, "DOMINATED", spell.color);
      this.vfx?.aura("dominate", foe, seconds, rank);
    }
    return 1;
  }

  // A frightened foe runs from the nearest hero and doesn't attack.
  _flee(e, dt) {
    if (e.rootUntil > this.time) return;
    const hero = this.heroes.filter((h) => h.alive).reduce((best, h) =>
      (!best || Math.hypot(h.x - e.x, h.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y) ? h : best), null);
    if (!hero) return;
    const d = Math.hypot(e.x - hero.x, e.y - hero.y) || 1;
    const speed = e.speed * (e.slowUntil > this.time ? (e.slowMultiplier || 1) : 1);
    e.x = Math.max(10, Math.min(W - 10, e.x + ((e.x - hero.x) / d) * speed * dt));
    e.y = Math.max(10, Math.min(FLOOR_Y - 10, e.y + ((e.y - hero.y) / d) * speed * dt));
  }

  // A confused or dominated foe turns on its own side: it closes on the
  // nearest other foe and hits it (credited to the caster).
  _turncoat(e, dt) {
    const prey = this.active.filter((other) => other !== e && other.hp > 0 && !(other.dominatedUntil > this.time))
      .reduce((best, other) => (!best || Math.hypot(other.x - e.x, other.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y) ? other : best), null);
    if (!prey) return;
    const d = Math.hypot(prey.x - e.x, prey.y - e.y) || 1;
    if (d > 30 + BODY_PAD) {
      if (e.rootUntil > this.time) return;
      const speed = e.speed * (e.slowUntil > this.time ? (e.slowMultiplier || 1) : 1);
      e.x += ((prey.x - e.x) / d) * speed * dt;
      e.y += ((prey.y - e.y) / d) * speed * dt;
      return;
    }
    if (e.atkCd > 0) return;
    e.atkCd = 1;
    this._bonusDamage(prey, e.damage, e.controlSource || "H0", "#C4B5FD");
  }

  // Summon Spirit Beast: a temporary unit fighting beside the caster (a pet
  // that leaves after `spell.seconds` or when downed). Its kind comes from the
  // caster's trait (heroBeast); it hits off the caster's attack.
  _summonBeast(h, spell, power, rank) {
    const kind = heroBeast(h.model);
    const beast = BEASTS[kind];
    const count = beast.count || 1;
    const maxHp = Math.max(1, Math.round((h.d.maxHp * spell.hp) / count));
    for (let i = 0; i < count; i += 1) {
      const pet = {
        owner: h, name: beast.name, summoned: true, until: this.time + spell.seconds, level: rank * 2,
        stats: { species: kind, color: beast.color, guard: 0, attack: {
          range: beast.range, moveSpeed: beast.moveSpeed || 0, interval: beast.interval,
          damage: (h.d.attack || 0) * beast.damage * power, mark: 0, burn: beast.burn || 0, bleed: 0, slow: 0,
          lifelink: beast.lifelink || 0, poison: beast.poison || 0, pounce: beast.pounce || 0, web: beast.web || null, cone: beast.cone || 0,
        } },
        body: { hp: spell.hp / count, weight: 1, airborne: !!beast.airborne, taunt: beast.taunt || null },
        hp: maxHp, maxHp, down: false, hurtAt: -99, strikeAt: -99, face: 1, moving: false,
        x: h.x + 22 + i * 10, y: h.y + 10 + i * 6, cd: 0.2, supportCd: 0, tauntCd: 0.5, webCd: 0, pounced: false, target: null,
      };
      this.pets.push(pet);
      this.vfx?.beastSpawn(pet, rank);
    }
    this._float(h.x, h.y - 30, beast.name.toUpperCase(), beast.color);
  }

  // Healing over time (Renewal) and Barrier running out, each frame.
  _tickSupport(h, dt) {
    if (h.renewUntil > this.time) {
      h.ref.hp = Math.min(h.d.maxHp, h.ref.hp + h.renewPerSecond * dt);
    }
    if (h.barrierLeft > 0) {
      h.barrierLeft = Math.min(h.barrierLeft, h.ref.shield || 0);
      if (!(h.barrierUntil > this.time)) {
        h.ref.shield = Math.max(0, (h.ref.shield || 0) - h.barrierLeft);
        h.barrierLeft = 0;
      }
    }
  }

  _spellElement(h, enemy, damage, element, sourceId, strong) {
    const scale = strong ? 1.5 : 1;
    const rank = this.vfx ? proficiency(h.model, element) : 1;
    if (element === "fire") { this._applyDot(enemy, damage * 0.3 * scale, 3, ELEMENTS.fire.color, sourceId); this.vfx?.aura("fire", enemy, 3, rank); }
    else if (element === "poison") { this._applyDot(enemy, damage * 0.4 * scale, 5, ELEMENTS.poison.color, sourceId); this.vfx?.aura("poison", enemy, 5, rank); }
    else if (element === "ice") { this._slowEnemy(enemy, 0.3 * scale, 2.5); this.vfx?.aura("ice", enemy, 2.5, rank); }
    else if (element === "mind") {
      const seconds = (enemy.boss ? 0.2 : 0.6) * scale;
      enemy.stunUntil = Math.max(enemy.stunUntil || 0, this.time + seconds);
      this.vfx?.aura("mind", enemy, seconds, rank);
    } else if (element === "electric") {
      const arc = this.active.find((other) => other !== enemy && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 120);
      if (arc && !arc.magicImmune) {
        this.vfx?.arc("electric", enemy, arc, rank);
        this._bonusDamage(arc, damage * 0.5 * scale, sourceId, ELEMENTS.electric.color);
      }
    }
  }

  // Meteors land after their delay, on up to `max` foes in the circle.
  _landMeteors(e) {
    if (!this.meteors.length || e !== this.active[0]) return;
    const landing = this.meteors.filter((meteor) => this.time >= meteor.at);
    if (!landing.length) return;
    this.meteors = this.meteors.filter((meteor) => this.time < meteor.at);
    for (const meteor of landing) {
      const victims = this.active.filter((enemy) => enemy.hp > 0 && !enemy.magicImmune && Math.hypot(enemy.x - meteor.x, enemy.y - meteor.y) <= meteor.radius)
        .slice(0, meteor.max);
      for (const victim of victims) {
        const exposed = victim.exposeUntil > this.time && victim.exposeKind === "magic" ? 1 + victim.exposeBonus : 1;
        this._bonusDamage(victim, meteor.damage * exposed, meteor.sourceId, meteor.color);
      }
      this.effects.push({ kind: "impact", x: meteor.x, y: meteor.y, r: meteor.radius, life: 0.6, color: meteor.color });
    }
  }

  // On auto, a caster uses its best ready spell: the big ones first, an area
  // spell on a crowd, a curse on a fresh target, else a bolt.
  // The control spell an unattended caster would cast now, and at whom.
  _autoControl(h, ready) {
    const spells = ready.filter((spell) => CONTROL_SHAPES.has(spell.shape));
    if (!spells.length) return null;
    const near = (spell) => this.active.filter((enemy) => enemy.hp > 0 && !this._controlled(enemy) && !this._spellImmune(enemy)
      && Math.hypot(enemy.x - h.x, enemy.y - h.y) <= (spell.range || 300));
    const by = (spell) => spells.find((entry) => entry.shape === spell);
    const dominate = by("dominate");
    if (dominate && h.mana - dominate.cost >= CONTROL.manaReserve) {
      const foe = near(dominate).filter((enemy) => this._controlSeconds(enemy, dominate) > 0).sort((a, b) => b.damage - a.damage)[0];
      if (foe) return { spell: dominate, foe };
    }
    const confusion = by("confusion");
    if (confusion) {
      const foe = near(confusion).filter((enemy) => !enemy.boss).sort((a, b) => (b.tier === "elite") - (a.tier === "elite") || b.maxHp - a.maxHp)[0];
      if (foe) return { spell: confusion, foe };
    }
    const terror = by("terror");
    if (terror) {
      const pressing = this.active.filter((enemy) => enemy.hp > 0 && !this._controlled(enemy)
        && this.heroes.some((ally) => ally.alive && Math.hypot(enemy.x - ally.x, enemy.y - ally.y) <= 120));
      if (pressing.length >= 3) {
        const foe = pressing.sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
        if (Math.hypot(foe.x - h.x, foe.y - h.y) <= terror.range) return { spell: terror, foe };
      }
    }
    const thornfield = by("thornfield");
    if (thornfield) {
      const radius = spellRadius(h.model, thornfield.id);
      const foe = near(thornfield).find((enemy) => near(thornfield).filter((other) => Math.hypot(other.x - enemy.x, other.y - enemy.y) <= radius).length >= 2);
      if (foe) return { spell: thornfield, foe };
    }
    const ensnare = by("ensnare");
    if (ensnare) {
      const hurt = this.heroes.filter((ally) => ally.alive).sort((a, b) => a.ref.hp / a.d.maxHp - b.ref.hp / b.d.maxHp)[0];
      const foe = hurt && near(ensnare).sort((a, b) => Math.hypot(a.x - hurt.x, a.y - hurt.y) - Math.hypot(b.x - hurt.x, b.y - hurt.y))[0];
      if (foe && Math.hypot(foe.x - hurt.x, foe.y - hurt.y) < 160) return { spell: ensnare, foe };
    }
    return null;
  }

  // How many quick casts in a row a cast right now would make (0: none).
  _strainIfCastNow(h) {
    return this.time - h.lastCastAt < CASTING.strainWindow ? h.strain + 1 : 0;
  }

  // Busy: still in the swing of a cast, or inside the strain window.
  _castBusy(h) {
    return h.castCd > 0 || this.time - h.lastCastAt < CASTING.strainWindow;
  }

  // What every cast spends (mana, cooldown, the swing), whether it lands or
  // fizzles. Returns the chance it lands, after any strain.
  _spendCast(h, spell, spellId) {
    h.strain = this._strainIfCastNow(h);
    h.lastCastAt = this.time;
    h.mana -= spell.cost;
    h.freeSpell = false;
    h.spellCooldowns[spellId] = spell.cooldownSeconds * h.d.cooldownMultiplier;
    h.castCd = CASTING.lock;
    h.visualActionKind = "attack";
    h.visualActionStartedAt = this.time;
    h.visualActionUntil = this.time + 0.3;
    const penalty = h.strain * CASTING.strainPerCast;
    if (penalty > 0) this._float(h.x, h.y - 40, `STRAINED -${Math.round(penalty * 100)}%`, "#F59E0B");
    return Math.max(0.05, spell.success - penalty);
  }

  // The player's tap: cast now if the caster is free, else queue it (strain-free).
  // Tapping a queued spell takes it back out. Returns "cast", "queued",
  // "unqueued" or false.
  queueHeroSpell(index, spellId) {
    const h = this.heroes[index];
    if (!h || !h.alive || this.ended) return false;
    const queued = h.spellQueue.indexOf(spellId);
    if (queued >= 0) { h.spellQueue.splice(queued, 1); return "unqueued"; }
    const spell = this._classlessSpellStatus(h).find((entry) => entry.id === spellId);
    if (!spell?.available) return false;
    if (!this._castBusy(h) && !h.spellQueue.length) {
      return this.castHeroSpell(index, spellId, null, { announce: true }) ? "cast" : false;
    }
    if (h.spellQueue.length >= CASTING.queueCap) return false;
    h.spellQueue.push(spellId);
    return "queued";
  }

  unqueueHeroSpell(index, spellId) {
    const h = this.heroes[index];
    const at = h ? h.spellQueue.indexOf(spellId) : -1;
    if (at < 0) return false;
    h.spellQueue.splice(at, 1);
    return true;
  }

  // Fire the next queued spell once the caster is free. A spell it can't cast
  // by then (no mana, no target) is dropped and the next one waits its turn.
  _playSpellQueue(h) {
    if (!h.alive) { h.spellQueue.length = 0; return; }
    if (this._castBusy(h)) return;
    while (h.spellQueue.length) {
      const spellId = h.spellQueue.shift();
      if (this.castHeroSpell(h.i, spellId, null, { announce: true })) return;
    }
  }

  _autoCast(h) {
    if (h.castCd > 0 || h.spellQueue.length || this.time - h.lastCastAt < CASTING.autoGap
      || !this.active.some((enemy) => enemy.hp > 0)) return;
    const ready = this._classlessSpellStatus(h).filter((spell) => spell.available);
    if (!ready.length) return;
    // Support first, and only when the party needs it right now.
    for (const shape of SUPPORT_PRIORITY) {
      const spell = ready.find((entry) => entry.shape === shape);
      const ally = spell && this._supportTarget(h, spell, true);
      if (ally) { this.castHeroSpell(h.i, spell.id, ally); return; }
    }
    // Control: only on foes nothing holds yet, and only when it pays off.
    const control = this._autoControl(h, ready);
    if (control) { this.castHeroSpell(h.i, control.spell.id, control.foe); return; }
    const hex = this._autoHex(h, ready);
    if (hex) { this.castHeroSpell(h.i, hex.spell.id, hex.foe); return; }
    // The player's mark if it's in reach; else the weakest foe in range (it
    // finishes kills sooner; owner-approved after measuring, Nov 2026); else
    // the weapon target or the nearest.
    const marked = this.heroSpellTarget(h.i);
    const weakest = AUTO_WEAKEST ? this.active.filter((enemy) => enemy.hp > 0 && !enemy._dead && !(enemy.dominatedUntil > this.time)
      && Math.hypot(enemy.x - h.x, enemy.y - h.y) <= 300).sort((a, b) => a.hp - b.hp)[0] : null;
    const target = [marked && Math.hypot(marked.x - h.x, marked.y - h.y) <= 340 ? marked : null, weakest, h.currentTarget]
      .find((enemy) => enemy?.hp > 0 && !(enemy.dominatedUntil > this.time)) || this._nearestEnemy(h.x, h.y, 340);
    if (!target) return;
    const inRange = ready.filter((spell) => Math.hypot(target.x - h.x, target.y - h.y) <= spell.range);
    const crowd = (radius) => this.active.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - target.x, enemy.y - target.y) <= radius).length;
    const pick = inRange.find((spell) => spell.id === "meteor" && crowd(spell.radius || 90) >= 2)
      || inRange.find((spell) => spell.id === "arcane_channel")
      || inRange.find((spell) => spell.shape === "area" && crowd(spellRadius(h.model, spell.id)) >= 2)
      || inRange.find((spell) => spell.shape === "linger" && !(target.dots || []).some((dot) => dot.sourceId === "H" + h.i))
      || inRange.find((spell) => spell.shape === "bolt" && spell.id !== "arcane_channel");
    if (pick) this.castHeroSpell(h.i, pick.id, target);
  }

  // ---- Clutch ----
  // What the hero picks if the player doesn't: gamblers go for the crit.
  clutchDefault(h) {
    return (h.model?.traits || []).some((trait) => CLUTCH.gamblers.includes(trait)) ? "crit" : "drink";
  }

  clutchCritChance(h) {
    return Math.min(1, CLUTCH.critChance + luckEffects(heroLuck(h.model)).clutchChance);
  }

  _startClutch(h) {
    h.clutchUsed = true;
    this._float(h.x, h.y - 28, "CLUTCH!", "#FFE600");
    this.effects.push({ kind: "guard", x: h.x, y: h.y, r: 30, life: 0.8, color: "#FFE600" });
    // Without a player watching (headless fights), the hero decides at once.
    if (!this.cb.onClutch) {
      this.resolveClutch(this.clutchDefault(h), h);
      return;
    }
    this.clutch = { hero: h, remaining: CLUTCH.seconds };
    this.cb.onClutch(this._clutchInfo());
  }

  _clutchInfo() {
    const h = this.clutch?.hero;
    if (!h) return null;
    const slot = this._clutchHealSlot(h);
    return {
      heroIndex: h.i, name: h.model?.identity?.name || "Hero", remaining: this.clutch.remaining,
      critChance: this.clutchCritChance(h), drink: slot ? CONSUMABLES[slot.key].name : "Second wind",
      auto: this.clutchDefault(h),
    };
  }

  // Slow motion while the player chooses; the hero's nature decides on timeout.
  _tickClutch(dt) {
    const h = this.clutch.hero;
    if (!h.alive || this.ended) {
      this.clutch = null;
      this.cb.onClutch?.(null);
      return dt;
    }
    this.clutch.remaining -= dt / Math.max(0.01, this.speed);
    if (this.clutch.remaining <= 0) {
      this.resolveClutch(this.clutchDefault(h));
      return dt;
    }
    return dt * CLUTCH.slowMotion;
  }

  _clutchHealSlot(h) {
    const slots = Array.isArray(h.model?.quickSlots) ? h.model.quickSlots : [];
    const heals = slots.filter((slot) => slot && CONSUMABLES[slot.key]?.heal && slot.qty > 0);
    return heals.sort((a, b) => CONSUMABLES[b.key].heal - CONSUMABLES[a.key].heal)[0] || null;
  }

  // "drink": the best healing item in the quick slots, or a second wind.
  // "crit": an Ultra Crit on the hero's target that kills it outright (a boss
  // loses a share of its HP), if it lands.
  resolveClutch(choice, hero = this.clutch?.hero) {
    const h = hero;
    if (!h) return false;
    this.clutch = null;
    this.cb.onClutch?.(null);
    if (!h.alive) return false;
    const record = { hero: h.i, choice: choice === "crit" ? "crit" : "drink", landed: false };
    if (record.choice === "drink") {
      const slot = this._clutchHealSlot(h);
      const item = slot && CONSUMABLES[slot.key];
      const fraction = item ? item.heal * (1 + (h.d.traits?.healBonus || 0)) * (1 - (h.d.env?.healCut || 0)) : CLUTCH.secondWind;
      if (slot) {
        slot.qty -= 1;
        this._tally(h, "heals", 1);
      }
      const amount = Math.min(h.d.maxHp - h.ref.hp, h.d.maxHp * fraction);
      h.ref.hp += amount;
      record.landed = true;
      this._float(h.x, h.y - 18, `${item ? "" : "SECOND WIND "}+${Math.round(amount)}`, "#39FF14");
      this.effects.push({ x: h.x, y: h.y, r: 20, life: 0.4, color: "#39FF14", ring: true });
    } else {
      const target = [h.currentTarget, ...this.active].find((e) => e && e.hp > 0 && !e._dead);
      if (target && this.rng() < this.clutchCritChance(h)) {
        const sourceId = "H" + h.i;
        const damage = target.boss ? target.maxHp * CLUTCH.bossDamage : target.hp;
        target.hp = Math.max(0, target.hp - damage);
        target.dmgBy[sourceId] = (target.dmgBy[sourceId] || 0) + damage;
        this._tally(h, "damage", damage);
        record.landed = true;
        this._float(target.x, target.y - 26, `ULTRA CRIT ${Math.round(damage)}`, "#FFE600");
        this.effects.push({ kind: "impact", x: target.x, y: target.y, r: 40, life: 0.6, color: "#FFE600" });
        if (target.hp <= 0) this._killEnemy(target, sourceId);
      } else {
        this._float(h.x, h.y - 18, "MISSED", "#94A3B8");
      }
    }
    this.clutches.push(record);
    this._log("death", `Clutch: ${this._name(h)} ${record.choice === "drink" ? "drinks" : record.landed ? "lands an Ultra Crit" : "goes for the Ultra Crit and misses"}`);
    return true;
  }

  // ---- Champion bosses (game/regions.js CHAMPIONS; Warded, Swarming and Frenzied in enemies/abilities.js) ----
  // A Vampiric Champion heals with every hit it lands, and a little with every
  // hit one of its summoned minions lands (owner's call, Nov 2026: the
  // Imperial Necromancer lands almost none itself).
  _vampiric(e) {
    if (!e) return;
    if (e.champion === "vampiric") {
      if (e.hp > 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * CHAMPION_VAMPIRIC);
      return;
    }
    const master = e.master;
    if (master?.champion !== "vampiric" || !(master.hp > 0) || master._dead) return;
    master.hp = Math.min(master.maxHp, master.hp + master.maxHp * CHAMPION_VAMPIRIC_MINION);
  }

  // A nemesis regenerates, and once per fight, nearly dead, may flee the
  // field (it leaves the wave; the party still wins if it clears the rest).
  _nemesisTick(e, dt) {
    if (e.regen > 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
    if (e.fleeRolled || e.hp > e.maxHp * (e.fleeBelow || 0)) return false;
    e.fleeRolled = true;
    if (!(this.rng() < (e.fleeChance || 0))) return false;
    this.nemesisFled = e.nemesisId;
    this._float(e.x, e.y - 30, `${e.name.toUpperCase()} FLEES!`, "#F59E0B");
    this.effects.push({ kind: "impact", x: e.x, y: e.y, r: 30, life: 0.5, color: "#F59E0B" });
    e._dead = true;
    e.hp = 0;
    return true;
  }

  _killEnemy(e, sourceId, silent) {
    if (e._dead) return;
    e._dead = true; e.hp = 0;
    if ((e.boss || e.tier === "elite") && !e.raised) {
      const killer = typeof sourceId === "string" && sourceId[0] === "H" ? this.heroes[Number(sourceId.slice(1))] : null;
      this._log("death", `${e.boss ? "Boss" : "Elite"} ${this._foeName(e)} slain${killer ? ` by ${this._name(killer)}` : ""}`);
    }
    if (e.nemesisId) this.nemesisSlain = e.nemesisId;
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

    // Gauntlet's loot table (gear or consumables) comes from sim.rollDrop.
    const drop = this.sim.rollDrop(e);
    if (drop) this.sim.vault.push(drop);

    // XP attribution
    if (e.boss) {
      const totalDmg = Object.values(e.dmgBy).reduce((a, b) => a + b, 0) || 1;
      for (const sid in e.dmgBy) {
        const share = (e.dmgBy[sid] / totalDmg) * tier.xp;
        this._awardXp(sid, share);
      }
    } else {
      let best = null, bestDmg = -1;
      for (const sid in e.dmgBy) if (e.dmgBy[sid] > bestDmg) { bestDmg = e.dmgBy[sid]; best = sid; }
      for (let i = 0; i < this.heroes.length; i++) {
        if (this.heroes[i].alive) this._awardXp("H" + i, Math.round(tier.xp * 0.35));
      }
      if (best) this._awardXp(best, tier.xp);
    }
    if (!silent) this.effects.push({ x: e.x, y: e.y, r: e.boss ? 60 : 20, life: 0.4, color: e.color });
    if (this.cb.onKill) this.cb.onKill();
  }

  _awardXp(sid, xp) {
    if (sid[0] === "H") {
      const i = +sid.slice(1);
      this.xpGains.heroes[i] = (this.xpGains.heroes[i] || 0) + xp;
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
  // targeting tactics driven by the hero's attack configuration
  _selectTarget(h) {
    {
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
      return this._nearestHeroEntity(e.x, e.y, 110);
    }

    if (e.type === "lieutenant") {
      return this._nearestHeroEntity(e.x, e.y, 150);
    }

    if (e.type === "ghost") {
      return this._nearestHeroEntity(e.x, e.y, 120);
    }

    if (e.type === "darkElf") {
      return this._nearestHeroEntity(e.x, e.y, 140);
    }

    if (e.type === "warlock") {
      return this._nearestMageEntity(e.x, e.y, 300)
        || this._nearestHeroEntity(e.x, e.y, 300);
    }

    return null;
  }

  _enemyTargetsHero(enemy, hero) {
    if (!enemy || !hero || this._isHeroUntargetable(hero)) return false;
    const tactical = this._selectEnemyTacticalTarget(enemy);
    if (tactical) return tactical.kind === "hero" && tactical.obj === hero;
    if (enemy.boss) return this._nearestDefender(enemy.x, enemy.y, enemy.attackRange || 420)?.obj === hero;
    // An ordinary foe is fighting whoever it attacked in the last few seconds
    // (as for backstabs), else the hero right next to it.
    if (enemy.engagedUntil > this.time) return enemy.engagedWith === hero;
    return this._nearestHeroEntity(enemy.x, enemy.y, 30 + BODY_PAD)?.obj === hero;
  }

  // How close a melee hero must be to strike: weapon range, measured from the
  // edge of the target's body (collisions keep heroes outside it), so big
  // bosses and elites can be hit too.
  _meleeReach(h, target) {
    return h.d.range - 6 + BODY_PAD + Math.max(0, ENEMY_BODY_RADIUS(target) - ENEMY_BODY_RADIUS({}));
  }

  _resolveUnitCollisions() {
    // These are gameplay body radii, not the full glow/weapon-art bounds.
    // Bosses and elites need more room than basic units.
    const heroRadius = HERO_BODY_RADIUS;
    const enemyRadius = ENEMY_BODY_RADIUS;
    const livingHeroes = this.heroes.filter((h) => h.alive);
    const livingEnemies = this.active.filter((e) => e.hp > 0);

    // A few short passes handle crowded groups without making collision
    // resolution expensive or changing the existing attack/target rules.
    for (let pass = 0; pass < 4; pass++) {
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
    const spd = heroMovementSpeed(h) * dt;
    h.x += (dx / d) * Math.min(spd, d);
    h.y += (dy / d) * Math.min(spd, d);
  }

  _float(x, y, text, color) { this.floaters.push({ x, y, text, color, life: 0.7 }); }

  // A move or spell name that pops up over its hero (live battles only: it
  // ages in the frame loop, which headless fights never run). `big` adds a
  // short hit-stop.
  _callout(hero, text, color, big = false) {
    if (!hero || !text) return;
    this.callouts = this.callouts.filter((callout) => callout.hero !== hero).slice(-3);
    this.callouts.push({ hero, text, color, age: 0, life: 1.1 });
    if (big) this.hitStop = Math.max(this.hitStop, HIT_STOP_SECONDS);
  }

  _tickCallouts(dt) {
    for (const callout of this.callouts) callout.age += dt;
    this.callouts = this.callouts.filter((callout) => callout.age < callout.life);
  }


  _hud() {
    if (!this.cb.onHud) return;
    this.cb.onHud({
      total: this.wave.total, killed: this.killed,
      remaining: this.active.length + this.spawnQueue.length,
      gold: this.sim.gold,
      wave: this.wavesCleared + 1,
      waveCount: this.cb.nextWave ? null : this.waveCount,
      heroes: this.heroes.map((h) => ({ name: h.ref.name, hp: h.ref.hp, maxHp: h.d.maxHp, alive: h.alive, shield: h.ref.shield || 0 })),
      heroAbilities: this.heroes.map((h) => this.getHeroAbilityStatus(h.i)),
      heroSpells: this.heroes.map((h) => this.getHeroSpellStatus(h.i)),
      heroQuickSlots: this.heroes.map((h) => this.getHeroQuickSlots(h.i)),
      boss: (() => { const b = this.active.find((e) => e.boss); return b ? { name: b.name, hp: b.hp, maxHp: b.maxHp } : null; })(),
    });
  }

  _checkEnd() {
    if (this.ended) return;

    // Absolute defeat: the entire hero squad is dead.
    const anyHero = this.heroes.some((h) => h.alive);
    if (!anyHero || this.forcedDefeat) {
      this.ended = true;
      this._logbook().finish(this.time, "Defeat");
      this.stop();
      this.cb.onEnd && this.cb.onEnd({
        victory: false,
        reason: "heroes",
        xpGains: this.xpGains,
        killed: this.killed,
        wavesCleared: this.wavesCleared,
        ...this._fightSummary(),
      });
      return;
    }

    // Victory requires the entire squad to be resolved while at least one hero is alive.
    if (this.spawnQueue.length === 0 && this.active.length === 0) {
      // Gauntlet endless mode: a cleared wave rolls straight into the next one
      // after a short breather. The fight only ends on a wipe or returnHome().
      // Gauntlet encounters come in waves: the next one arrives after a breather.
      if (this.reinforcements.length) {
        this.wavesCleared += 1;
        const next = this.reinforcements.shift();
        this.wave = { ...this.wave, ...next, total: next.enemies.length };
        this.spawnQueue = [...next.enemies];
        this.spawnTimer = WAVE_BREAK_SECONDS;
        this._float(W / 2, H * 0.4, `WAVE ${this.wavesCleared + 1}/${this.waveCount}`, "#00F3FF");
        return;
      }
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
      this._logbook().finish(this.time, "Victory");
      this.stop();
      this.cb.onEnd && this.cb.onEnd({
        victory: true,
        reason: "cleared",
        xpGains: this.xpGains,
        killed: this.killed,
        wavesCleared: this.wavesCleared,
        ...this._fightSummary(),
      });
    }
  }

  // ---------------- rendering ----------------
  render() {
    renderBattle(this);
  }



}

function pickLane(engine) {
  // Encounter squads fan out across the top edge; there are no lanes to defend.
  return Math.floor(engine.rng() * LANES);
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
