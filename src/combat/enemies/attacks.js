// Enemy attacks (Phase 8B, moved out of engine.js unchanged): melee hits on
// heroes and familiars, enemy bolts and their landing, bombs, a Sapper's
// blast, and the support helpers enemy roles use (healing, raising the
// dead, a Bulwark's ward and cover, Vampiric healing). They stay engine
// methods (engine.js mixes them in), since heroes, spells and tests call
// them by name.
import * as C from "../config";
import { projectileVfxAssetId } from "../combatVfx";
import { H } from "../arena";
import { BACKSTAB_WINDOW, BOSS_MELEE_REACH, CHAMPION_VAMPIRIC, CHAMPION_VAMPIRIC_MINION } from "./tuning";

export const enemyAttackMethods = {
  // An enemy's blow lands on a familiar.
  // Who a foe is fighting, for backstabs: whoever it last attacked.
  _engage(e, obj) {
    e.engagedWith = obj;
    e.engagedUntil = this.time + BACKSTAB_WINDOW;
  },

  _enemyHitPet(e, pet) {
    if (e.disarmUntil > this.time) return;
    this._engage(e, pet);
    if (this._hexMiss(e, pet)) return;
    if (pet.body.airborne && e.attackFx !== "napalm" && this.rng() < 0.5) {
      this._float(pet.x, pet.y - 14, "MISS", "#94A3B8");
      return;
    }
    const empowered = e.empoweredUntil > this.time ? 1.15 : 1;
    const damage = e.damage * empowered * (1 - (pet.body.armor || 0)) * this._hexDamage(e)
      * (pet.owner?.kindredUntil > this.time ? 1 - pet.owner.kindredGuard : 1);
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
  },

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
  },

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
  },

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
  },

  _fallenNear(e, range) {
    return this.fallen.find((corpse) => Math.hypot(corpse.x - e.x, corpse.y - e.y) <= range) || null;
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
        dmg = this._classlessReducedDamage(h, dmg) * this._wardCut(h, "magic");
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
  },

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
  },

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
      let damage = this._classlessReducedDamage(h, p.dmg) * this._wardCut(h, p.magic ? "magic" : "weapon");
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
  },

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
    let dmg = this._classlessReducedDamage(h, raw) * this._wardCut(h, e.type === "warlock" ? "magic" : "weapon");
    h.lastHitBy = e;
    if (h.ref.shield > 0) { const ab = Math.min(h.ref.shield, dmg); h.ref.shield -= ab; dmg -= ab; }
    this._resolveClasslessHeroDamage(h, dmg);
    if (dmg > 0) this._triggerHeroReaction(h, "ally");
    if (dmg > 0 && h.d.gear?.thorns > 0 && e.hp > 0) this._bonusDamage(e, dmg * h.d.gear.thorns, "H" + h.i, "#F8FAFC");
    if (e.boss) e.hp = Math.min(e.maxHp, e.hp + dmg * 0.5); // Demon Lord lifesteal
    if (dmg > 0) this._vampiric(e);
    this._float(h.x, h.y - 20, "-" + Math.round(dmg), "#FF3366");
  },

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
  },
};
