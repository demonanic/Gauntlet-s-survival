// Gauntlet encounter engine, vendored from Demonanic (demonanic/Demonanic,
// review/mobile-working-copy @ b0d430f) and trimmed to encounter mode: no castle,
// walls, gate, towers, barricades or kingdom buildings. A small enemy squad
// enters from the TOP and hunts the hero party at the BOTTOM.
// Simulation is separate from React; mutates a cloned `sim` fragment and
// accumulates XP gains, returned to the UI at wave end.
import { luckEffects } from "./luck";
import { CASTING, maxMana as spellMaxMana } from "./spells";
import { BattleLog } from "./battleLog";
import { enemyAttackMethods } from "./enemies/attacks";
import { clutchMethods } from "./heroes/clutch";
import { conjuredMethods } from "./heroes/conjured";
import { reactionMethods } from "./heroes/reactions";
import { familiarMethods } from "./heroes/familiars";
import { heroMoveMethods } from "./heroes/moves";
import { quickSlotMethods } from "./heroes/quickSlots";
import { partyOrderMethods } from "./heroes/orders";
import { heroSpellMethods } from "./heroes/spells";
import { enemyTurn, tacticalTarget } from "./enemies/turn";
import { BODY_PAD, BULWARK_COVER, BULWARK_GUARD, BULWARK_GUARD_RADIUS } from "./enemies/tuning";
import { SpellVfx } from "./spellVfx";
import { BONDS, memorialDamage } from "../game/bonds";
import * as C from "./config";
import { HERO_BASELINE, statDefense } from "./heroModel";
import { classlessCombatEffects, classlessMaxHp } from "./classlessCombatEffects";
import { getEquippedHeroWeaponType } from "./heroWeapon";
import { heroGearStats, heroUsesArrows, heroWeaponProfile } from "./gear";
import { PET_BODIES, petMaxHp, petStats } from "./pets";
import { HIT_STOP_SECONDS } from "./abilityLook";
import { heroTraitEffects } from "./traits";
import { masteryEffects } from "./mastery";
import { projectileVfxAssetId } from "./combatVfx";
import { renderBattle } from "./render/battleRenderer";
import { ENEMY_BODY_RADIUS, FLOOR_Y, H, HERO_BODY_RADIUS, HERO_Y, W } from "./arena";
import { defaultRandom } from "../game/random";

const MAX_COMBAT_EFFECTS = 180;
const MAX_COMBAT_FLOATERS = 120;

export { H, W };


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
      / ((1 + effects.attackSpeed) * (1 + traits.attackSpeed) * (1 + gear.attackSpeed) * (1 + gear.fury)),
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

// Haste (Enchanting) speeds a hero up for a while.
function heroMovementSpeed(hero, time) {
  return hero.d.movementSpeed * (hero.hasteUntil > time ? 1 + hero.hasteAmount : 1);
}

const LANES = 5;
const ENDLESS_WAVE_BREAK_SECONDS = 3;
// Breather between the waves of an ordinary encounter.
const WAVE_BREAK_SECONDS = 3;
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
function laneX(i) { return (W / LANES) * (i + 0.5); }

export const LAYOUT = { W, H, HERO_Y, FLOOR_Y };
export { CLUTCH } from "./heroes/clutch";
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




  // In range to be hit: melee reach (from the edge of the target's body) for
  // swords, weapon range for everything else.
  _isValidClasslessTarget(h, enemy) {
    if (!h || !enemy || enemy.hp <= 0 || !this.active.includes(enemy)) return false;
    if (enemy.dominatedUntil > this.time) return false; // fighting for the party

    const reach = h.d.rangeMode === "melee" ? this._meleeReach(h, enemy) : h.d.range;
    return Math.hypot(enemy.x - h.x, enemy.y - h.y) <= reach;
  }


  _isHeroUntargetable(hero) {
    return !!hero && hero.untargetableUntil > this.time;
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
  // A horde comes from every side: half at the top, a quarter down each edge
  // (in the upper half of the field, away from the heroes).
  _hordeEntry(e) {
    const roll = this.rng();
    if (roll < 0.5) { e.x = 20 + this.rng() * (W - 40); e.y = 10 + this.rng() * 20; return; }
    e.x = roll < 0.75 ? 12 : W - 12;
    e.y = 40 + this.rng() * (H * 0.45 - 40);
  }

  // Test mode only (the battle screen shows these with ?debug): "mana" fills
  // every caster's mana, "cooldowns" readies every move and spell (and clears
  // focus strain), "god" toggles heroes taking no damage (and heals them to
  // full when it turns on), "kill" kills every foe on the field. Returns
  // whether god mode is on.
  debugCheat(kind) {
    const living = this.heroes.filter((h) => h.alive);
    if (kind === "mana") for (const h of living) h.mana = h.maxMana || 0;
    if (kind === "cooldowns") {
      for (const h of living) {
        h.spellCooldowns = {}; h.abilityCooldowns = {};
        h.castCd = 0; h.lastCastAt = -Infinity; h.strain = 0;
      }
    }
    if (kind === "god") {
      this.godMode = !this.godMode;
      if (this.godMode) for (const h of living) h.ref.hp = h.d.maxHp;
    }
    if (kind === "kill") {
      for (const e of [...this.active]) if (e.hp > 0 && !e._dead) { e.hp = 0; this._killEnemy(e, "H0"); }
    }
    return !!this.godMode;
  }

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
      // Keep the battlefield readable: limit concurrent enemies to roughly half
      // a wave (a horde sets its own cap).
      const capInZone = this.wave.fieldCap || Math.max(4, this.wave.total * 0.5);
      if (this.active.length < capInZone) {
        const e = this.spawnQueue.shift();
        if (this.wave.horde) this._hordeEntry(e);
        else { e.x = laneX(pickLane(this, e)); e.y = 10 + this.rng() * 20; }
        e.lane = Math.max(0, Math.min(LANES - 1, Math.round(e.x / (W / LANES) - 0.5)));
        e.dmgBy = {}; e.atkCd = 0; e.state = "advance";
        this.active.push(e);
      }
      // Wider spacing prevents large clumps while preserving steady wave pressure.
      this.spawnTimer = this.wave.hasBoss && this.spawnQueue.length === 0 ? 0 : (this.wave.spawnEvery || 0.75);
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
      if (e.hp > 0) enemyTurn(this, e, dt);
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
      // Haste stacks on top of the attack speed cap.
      if (h.hasteUntil > this.time) h.cd -= dt * h.hasteAmount * (activeAttackSpeedBonus > 0 ? attackSpeedMultiplier : 1);

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
          const spd = heroMovementSpeed(h, this.time) * dt;
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
          const spd = heroMovementSpeed(h, this.time) * dt;
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
          const step = Math.min(heroMovementSpeed(h, this.time) * dt, Math.max(0, dist - (h.d.range - 10)));
          h.x += ((nearest.x - h.x) / dist) * step;
          h.y += ((nearest.y - h.y) / dist) * step;
          continue;
        }
      }

      if (melee) {
        if (target) {
          const dist = Math.hypot(target.x - h.x, target.y - h.y) || 1;
          if (dist > this._meleeReach(h, target)) {
            const spd = heroMovementSpeed(h, this.time) * dt;
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








  // Gauntlet hero history: what each hero did in this fight, carried back on
  // the hero model and folded into hero.history (game/qualities.js).
  _tally(h, stat, amount) {
    if (!h || !(amount > 0)) return;
    const logStat = { damage: "dealt", dodges: "dodges", meleeHits: "hits", rangedHits: "hits", crits: "crits" }[stat];
    if (logStat) this._logbook().count(h.i, logStat, amount);
    const stats = (h.model.battleStats ||= {});
    stats[stat] = (stats[stat] || 0) + amount;
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
    const step = heroMovementSpeed(h, this.time) * dt;
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
    const step = heroMovementSpeed(h, this.time) * KITE_SPEED * dt;
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
    // Test mode's god mode (debugCheat): heroes take nothing.
    if (this.godMode) return 0;
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
    if (dot > 0 && hero.ref.hp > 1 && !this.godMode) {
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
    // A Fury shard on the source hero's staff: the same damage, sooner.
    const fury = typeof sourceId === "string" && sourceId[0] === "H" ? this.heroes[Number(sourceId.slice(1))]?.d?.gear?.fury || 0 : 0;
    if (fury > 0) seconds /= 1 + fury;
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
    if (p.damageCategory === "weapon" && hero.d.env?.miss > 0 && !(hero.trueAimUntil > this.time) && this.rng() < hero.d.env.miss) {
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
    const crit = p.guaranteedCrit || jackpot || this.rng() < hero.d.critChance + (hero.trueAimUntil > this.time ? hero.trueAimCrit : 0);
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





  // What each element does besides damage; lingering spells hit harder.
  // ---- support spells (Restoration, Warding) ----------------------------------




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










  // ---- control (Shadow, Wild Magic, Dominate) --------------------------------




























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
    // Insight (Enchanting): more XP for the rest of the fight.
    if (this.insightBonus > 0) xp *= 1 + this.insightBonus;
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


  _enemyTargetsHero(enemy, hero) {
    if (!enemy || !hero || this._isHeroUntargetable(hero)) return false;
    const tactical = tacticalTarget(this, enemy);
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
    const spd = heroMovementSpeed(h, this.time) * dt;
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

// Engine methods defined in their own files: enemy attacks, shots, bombs and
// support helpers (enemies/attacks.js), familiars (heroes/familiars.js), hero
// special moves (heroes/moves.js), hero spells (heroes/spells.js), quick
// slots and arrows (heroes/quickSlots.js), Clutch (heroes/clutch.js) and
// party orders (heroes/orders.js).
Object.assign(Engine.prototype, enemyAttackMethods, familiarMethods, heroMoveMethods, heroSpellMethods, quickSlotMethods, clutchMethods, partyOrderMethods, conjuredMethods, reactionMethods);

function pickLane(engine) {
  // Encounter squads fan out across the top edge; there are no lanes to defend.
  return Math.floor(engine.rng() * LANES);
}
