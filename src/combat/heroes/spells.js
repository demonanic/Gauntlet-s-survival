// Hero spells (Phase 8C, moved out of engine.js unchanged): what a spell can
// do now (status), casting by hand and on auto, the queue and focus strain,
// damage, support, control and hex spells, element effects, meteors, spirit
// beasts and spell targets. They stay engine methods (engine.js mixes them
// in), since the battle screen, enemy code and tests call them by name.
import { BEASTS, CASTING, CONTROL, ELEMENTS, HEX, MAGIC, SHIELD_CAP, SPELLS, castSuccessChance, heroBeast, knownSpells, proficiency, spellPower, spellRadius, supportPower } from "../spells";
import { BIG_SPELLS } from "../abilityLook";
import { getEquippedHeroWeaponType } from "../heroWeapon";

// The order an unattended caster weighs its support spells in.
// Iron Skin and Spellguard come after Barrier (owner's call after measuring):
// on auto they're cast only when Barrier isn't ready.
const SUPPORT_PRIORITY = Object.freeze(["lifeline", "heal", "veil", "renew", "barrier", "iron_skin", "spellguard", "aegis", "empower",
  "haste", "true_aim", "kindred", "quiver", "insight", "summon"]);
// Foes whose shots are magic (Spellguard's concern on auto).
const MAGIC_SHOOTERS = Object.freeze(new Set(["warlock", "carrionPriest", "lesserNecromancer", "watcher"]));
// Spells that hold foes (Shadow, Wild Magic, Dominate), cast at a foe.
const CONTROL_SHAPES = Object.freeze(new Set(["terror", "confusion", "ensnare", "thornfield", "dominate"]));
// Auto bolts and curses go at the weakest foe in range (see _autoCast).
const AUTO_WEAKEST = true;
const HEX_SHAPES = Object.freeze(new Set(["blind", "enfeeble", "silence", "disarm", "expose"]));
// Foes with something for Silence to stop (boss abilities, spells, heals, summons, Blitz).
const SILENCEABLE = Object.freeze(new Set(["warlock", "carrionPriest", "lesserNecromancer", "bandit"]));

export const heroSpellMethods = {
  getHeroSpellStatus(index) {
    const h = this.heroes[index];
    return h ? this._classlessSpellStatus(h) : [];
  },

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
  },

  // Mark `enemy` (or clear the mark with null). Marking the marked foe again clears it.
  markHeroTarget(index, enemy) {
    const h = this.heroes[index];
    if (!h || !h.alive) return false;
    h.spellTarget = enemy && enemy.hp > 0 && enemy !== h.spellTarget ? enemy : null;
    return true;
  },

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
  },

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
  },

  _spellImmune(enemy) {
    if (!enemy.magicImmune) return false;
    this._float(enemy.x, enemy.y - 4, "IMMUNE", "#39FF14");
    return true;
  },

  _spellHit(h, enemy, damage, element, sourceId, showName) {
    if (this._spellImmune(enemy)) return;
    if (enemy.exposeUntil > this.time && enemy.exposeKind === "magic") damage *= 1 + enemy.exposeBonus;
    this._bonusDamage(enemy, damage, sourceId, ELEMENTS[element].color);
    this._tally(h, "damage", damage);
    if (enemy.hp > 0) this._spellElement(h, enemy, damage, element, sourceId, false);
    if (showName) this.effects.push({ kind: "hit", x: enemy.x, y: enemy.y, r: 16, life: 0.4, color: ELEMENTS[element].color, crit: false });
  },

  _partyHpFraction() {
    const alive = this.heroes.filter((hero) => hero.alive);
    const max = alive.reduce((sum, hero) => sum + hero.d.maxHp, 0);
    return max ? alive.reduce((sum, hero) => sum + Math.max(0, hero.ref.hp), 0) / max : 1;
  },

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
      // Enchanting and the two wards. Auto picks the ally they help most now.
      case "haste":
      case "true_aim": {
        const until = spell.shape === "haste" ? "hasteUntil" : "trueAimUntil";
        const fighting = (ally) => this.active.some((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - ally.x, enemy.y - ally.y) <= 260);
        return near.filter((ally) => !(ally[until] > this.time) && (!auto || fighting(ally)))
          .sort((a, b) => (b.d.attack || 0) - (a.d.attack || 0))[0] || null;
      }
      case "quiver": {
        const archers = near.filter((ally) => getEquippedHeroWeaponType(ally.model) === "bow" && !(ally.quiverUntil > this.time));
        if (!auto) return archers[0] || null;
        const fighting = (ally) => this.active.some((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - ally.x, enemy.y - ally.y) <= 320);
        return archers.find((ally) => fighting(ally) && (this._arrowSlot(ally)?.qty ?? 0) < 30) || null;
      }
      case "kindred": {
        const bonded = near.filter((ally) => !(ally.kindredUntil > this.time) && this.pets.some((pet) => pet.owner === ally && !pet.down));
        if (!auto) return bonded[0] || null;
        return bonded.find((ally) => this.pets.some((pet) => pet.owner === ally && !pet.down
          && this.active.some((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - pet.x, enemy.y - pet.y) <= 120))) || null;
      }
      case "insight": {
        if (this.insightBonus > 0 || !this.active.some((enemy) => enemy.hp > 0)) return null;
        return !auto || h.mana - spell.cost >= CONTROL.manaReserve ? h : null;
      }
      case "iron_skin":
      case "spellguard": {
        const until = spell.shape === "iron_skin" ? "ironSkinUntil" : "spellguardUntil";
        const open = near.filter((ally) => !(ally[until] > this.time));
        if (!auto) return lowest(open);
        const threatened = spell.shape === "iron_skin"
          ? (ally) => this.active.some((enemy) => enemy.hp > 0 && !MAGIC_SHOOTERS.has(enemy.type) && Math.hypot(enemy.x - ally.x, enemy.y - ally.y) <= 70)
          : (ally) => this.active.some((enemy) => enemy.hp > 0 && (MAGIC_SHOOTERS.has(enemy.type) || enemy.boss) && Math.hypot(enemy.x - ally.x, enemy.y - ally.y) <= 320);
        return lowest(open.filter((ally) => frac(ally) < 0.7 && underAttack(ally) && threatened(ally)));
      }
      case "summon": {
        const mine = this.pets.some((pet) => pet.summoned && pet.owner === h && !pet.down);
        if (mine || !this.active.some((enemy) => enemy.hp > 0)) return null;
        return !auto || h.mana - spell.cost >= CONTROL.manaReserve ? h : null;
      }
      default: return null;
    }
  },

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
    } else if (spell.shape === "haste") {
      target.hasteUntil = this.time + spell.seconds;
      target.hasteAmount = spell.amount;
      this._float(target.x, target.y - 26, "HASTE", spell.color);
      this.vfx?.aura("empower", target, spell.seconds, rank);
    } else if (spell.shape === "true_aim") {
      target.trueAimUntil = this.time + spell.seconds;
      target.trueAimCrit = spell.amount;
      this._float(target.x, target.y - 26, "TRUE AIM", spell.color);
      this.vfx?.aura("empower", target, spell.seconds, rank);
    } else if (spell.shape === "quiver") {
      target.quiverUntil = this.time + spell.seconds;
      this._float(target.x, target.y - 26, "ENDLESS QUIVER", spell.color);
      this.vfx?.aura("empower", target, spell.seconds, rank);
    } else if (spell.shape === "kindred") {
      target.kindredUntil = this.time + spell.seconds;
      target.kindredDamage = spell.amount;
      target.kindredGuard = spell.guard;
      this._float(target.x, target.y - 26, "KINDRED BOND", spell.color);
      for (const pet of this.pets) if (pet.owner === target && !pet.down) this.vfx?.aura("empower", pet, spell.seconds, rank);
    } else if (spell.shape === "insight") {
      this.insightBonus = spell.amount;
      this._float(h.x, h.y - 26, `INSIGHT +${Math.round(spell.amount * 100)}% XP`, spell.color);
      this.vfx?.supportBurst("warding", h, rank);
    } else if (spell.shape === "iron_skin" || spell.shape === "spellguard") {
      const key = spell.shape === "iron_skin" ? "ironSkin" : "spellguard";
      target[`${key}Until`] = this.time + spell.seconds;
      target[`${key}Cut`] = spell.amount;
      this._float(target.x, target.y - 26, spell.name.toUpperCase(), spell.color);
      this.vfx?.aura("aegis", target, spell.seconds, rank);
    }
    return true;
  },

  // Iron Skin and Spellguard (Warding): what's left of a hit of this kind
  // ("weapon": melee and arrows; "magic": magic bolts and bombs).
  _wardCut(h, kind) {
    if (kind === "magic") return h.spellguardUntil > this.time ? 1 - h.spellguardCut : 1;
    return h.ironSkinUntil > this.time ? 1 - h.ironSkinCut : 1;
  },

  // How much of a hex this foe takes: elites half, bosses a quarter.
  _hexScale(e) {
    return e.boss ? HEX.boss : e.tier === "elite" ? HEX.elite : 1;
  },

  // Enfeeble: what's left of this foe's damage.
  _hexDamage(e) {
    return e.enfeebleUntil > this.time ? 1 - (e.enfeebleCut || 0) : 1;
  },

  // Blind: does this attack miss? Rolls only while the foe is blinded.
  _hexMiss(e, victim) {
    if (!(e.blindUntil > this.time) || !(this.rng() < e.blindChance)) return false;
    this._float(victim.x, victim.y - 20, "MISS", "#94A3B8");
    return true;
  },

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
  },

  _exposeMatches(kind, hero, magic, weapon) {
    if (kind === "magic") return !!magic;
    if (!weapon || magic) return false;
    return kind === "melee" ? hero.d.rangeMode === "melee" : hero.d.rangeMode !== "melee";
  },

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
  },

  _hexArea(foe, radius) {
    return this.active.filter((enemy) => enemy.hp > 0 && Math.hypot(enemy.x - foe.x, enemy.y - foe.y) <= radius);
  },

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
  },

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
  },

  // Is this foe already held by a control spell? (No wasted casts on it.)
  _controlled(e) {
    return e.rootUntil > this.time || e.fearUntil > this.time || e.confusedUntil > this.time || e.dominatedUntil > this.time;
  },

  // How long `spell` holds `e`: elites half, bosses `spell.boss` (0: immune);
  // Dominate never takes bosses, elites, nemeses or legends.
  _controlSeconds(e, spell) {
    if (spell.shape === "dominate" && (e.boss || e.tier === "elite" || e.legendary || e.nemesisId)) return 0;
    if (e.boss) return spell.boss ?? 0;
    return e.tier === "elite" ? spell.seconds * CONTROL.elite : spell.seconds;
  },

  _castControl(h, spell, foe, damage, sourceId, rank) {
    const held = this._castControlEffect(h, spell, foe, damage, sourceId, rank);
    if (held === false) this._log("control", `${this._name(h)} · ${spell.name} → ${this._foeName(foe)}: resisted`);
    else if (held > 0) this._log("control", `${this._name(h)} · ${spell.name} → ${this._foeName(foe)}${held > 1 ? ` + ${held - 1}` : ""}`);
  },

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
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  // How many quick casts in a row a cast right now would make (0: none).
  _strainIfCastNow(h) {
    return this.time - h.lastCastAt < CASTING.strainWindow ? h.strain + 1 : 0;
  },

  // Busy: still in the swing of a cast, or inside the strain window.
  _castBusy(h) {
    return h.castCd > 0 || this.time - h.lastCastAt < CASTING.strainWindow;
  },

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
  },

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
  },

  unqueueHeroSpell(index, spellId) {
    const h = this.heroes[index];
    const at = h ? h.spellQueue.indexOf(spellId) : -1;
    if (at < 0) return false;
    h.spellQueue.splice(at, 1);
    return true;
  },

  // Fire the next queued spell once the caster is free. A spell it can't cast
  // by then (no mana, no target) is dropped and the next one waits its turn.
  _playSpellQueue(h) {
    if (!h.alive) { h.spellQueue.length = 0; return; }
    if (this._castBusy(h)) return;
    while (h.spellQueue.length) {
      const spellId = h.spellQueue.shift();
      if (this.castHeroSpell(h.i, spellId, null, { announce: true })) return;
    }
  },

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
  },
};
