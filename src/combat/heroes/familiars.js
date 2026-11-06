// Familiars (Phase 8D, moved out of engine.js unchanged): each familiar's turn
// (follow its partner, guard, heal, shield, taunt, strike) and the strike
// itself, plus which familiar an enemy can reach. They stay engine methods
// (engine.js mixes them in), since enemy code and tests call them by name.
export const familiarMethods = {
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
      // Foes fooled by a Mirror Self that's gone stop chasing it.
      for (const pet of leaving) if (pet.summonKind === "mirror") for (const enemy of this.active) if (enemy.tauntedBy === pet) enemy.tauntUntil = 0;
      this.pets = this.pets.filter((pet) => !leaving.includes(pet));
    }
    for (const pet of this.pets) {
      const owner = pet.owner;
      const startX = pet.x;
      pet.moving = false;
      if (pet.down || !owner.alive) continue;
      // Spectral Blades (heroes/conjured.js) take their own turn.
      if (pet.untouchable) { this._bladeTurn(pet, dt); continue; }
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
      // A support school's elemental (heroes/conjured.js) helps allies as it fights.
      if (pet.pulse) this._elementalPulse(pet, dt);
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
  },

  // The familiar an enemy at (x, y) would go for within reach `r`, and its
  // weighted distance: a pet with weight 0.5 counts as twice as far away.
  _nearestPetInReach(x, y, r) {
    let best = null, bd = Infinity;
    for (const pet of this.pets) {
      if (pet.down || !pet.owner.alive || pet.untouchable) continue;
      const d = Math.hypot(pet.x - x, pet.y - y);
      if (d > r) continue;
      const weighted = d / Math.max(0.1, pet.body.weight || 1);
      if (weighted < bd) { bd = weighted; best = pet; }
    }
    return best ? { pet: best, weighted: bd } : null;
  },

  _petStrike(pet, target) {
    const { attack, color } = pet.stats;
    const owner = pet.owner;
    const sourceId = "H" + owner.i;
    // Kindred Bond (Enchanting): the familiar hits harder for a while.
    const damage = attack.damage * (owner.kindredUntil > this.time ? 1 + owner.kindredDamage : 1);
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
    // Summoned elementals: Lightning arcs, Mind stuns, Shadow blinds.
    if (attack.arc > 0) {
      const other = this.active.find((enemy) => enemy !== target && enemy.hp > 0 && Math.hypot(enemy.x - target.x, enemy.y - target.y) <= 120);
      if (other) { this.vfx?.arc("electric", target, other, 1); this._bonusDamage(other, damage * attack.arc, sourceId, color); }
    }
    if (attack.stun > 0) target.stunUntil = Math.max(target.stunUntil || 0, this.time + (target.boss ? attack.stun / 3 : attack.stun));
    if (attack.blind > 0) {
      const chance = attack.blind * (target.boss ? this._hexScale(target) : 1);
      target.blindChance = target.blindUntil > this.time ? Math.max(target.blindChance || 0, chance) : chance;
      target.blindUntil = Math.max(target.blindUntil || 0, this.time + 2);
    }
    if (attack.bleed > 0) this._applyDot(target, damage * attack.bleed, 3, "#DC2626", sourceId);
    if (attack.lifelink > 0) this._classlessHeal(owner, damage * attack.lifelink);
    this._bonusDamage(target, damage, sourceId, color);
  },
};
