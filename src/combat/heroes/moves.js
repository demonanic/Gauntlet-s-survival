// Hero special moves (Phase 8C, moved out of engine.js unchanged): what each
// move can do now (status, targets, area preview), paying for it, firing it
// (Shared Strike, the perk moves and the starter moves) and its effects.
// They stay engine methods (engine.js mixes them in), since the battle
// screen, the balance scripts and tests call them by name.
import * as C from "../config";
import { BIG_MOVES, branchColor } from "../abilityLook";
import { getUnlockedClasslessAbilities, validateClasslessAbilityUse } from "../classlessAbilities";
import { HERO_BASELINE } from "../heroModel";
import { masteredMove, moveRank } from "../mastery";

// The bible does not specify a Phantom Strike placement offset. Reuse the
// existing 30-unit hero/defender interaction radius as the reversible offset.
const PHANTOM_STRIKE_BEHIND_OFFSET = 30;

export const heroMoveMethods = {
  // A move's target: Lunge reaches its own range (it dashes in); every other
  // move uses the hero's weapon reach.
  _moveTargetValid(h, definition, enemy) {
    if (definition?.rangeMode !== "lunge") return this._isValidClasslessTarget(h, enemy);
    if (!h || !enemy || enemy.hp <= 0 || !this.active.includes(enemy) || enemy.dominatedUntil > this.time) return false;
    return Math.hypot(enemy.x - h.x, enemy.y - h.y) <= definition.range;
  },

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
  },

  _classlessCanPayActiveCost(hero) {
    if (!hero || !(hero.d.bloodPriceCost > 0)) return true;
    return hero.ref.hp - hero.ref.hp * hero.d.bloodPriceCost >= 1;
  },

  _chargeClasslessActiveCost(hero, hpBefore) {
    const cost = hero.d.bloodPriceCost > 0 ? hpBefore * hero.d.bloodPriceCost : 0;
    if (cost > 0) {
      hero.ref.hp = Math.max(1, hero.ref.hp - cost);
      this._float(hero.x, hero.y - 20, `-${Math.round(cost)} HP`, "#DC2626");
      this.effects.push({ kind: "blood_price", x: hero.x, y: hero.y, r: 20, life: 0.42, color: "#DC2626" });
    }
  },

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
  },

  getHeroAbilityTargetAt(index, abilityId, x, y) {
    return this.getHeroAbilityTargets(index, abilityId)
      .filter((target) => Math.hypot(target.enemy.x - x, target.enemy.y - y) <= 80)
      .sort((a, b) => Math.hypot(a.enemy.x - x, a.enemy.y - y) - Math.hypot(b.enemy.x - x, b.enemy.y - y))[0] || null;
  },

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
  },

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
  },

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
  },

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
  },
};
