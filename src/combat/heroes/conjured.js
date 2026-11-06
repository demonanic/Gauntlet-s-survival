// Conjuration summons (spells part 4, Nov 2026): Spectral Blades and the
// summoned elemental. Engine
// methods, mixed in by engine.js like the other heroes/ files. The blades are
// kept in the engine's pets list so they leave like a spirit beast does, but
// they're `untouchable`: foes never target them (see _nearestPetInReach).
import { ENEMY_BODY_RADIUS } from "../arena";
import { ELEMENTALS, ELEMENTAL_PULSE_RADIUS, ELEMENTS, SHIELD_CAP, heroElementalSchool } from "../spells";

const TAU = Math.PI * 2;
// How far from the caster a blade will go hunting, how often it picks a foe
// again, and how fast it flies.
export const BLADE = Object.freeze({ leash: 320, retarget: 1.5, speed: 280 });

export const conjuredMethods = {
  // One sword per spell rank (I-V). Each hits off the caster's attack.
  _summonBlades(h, spell, power, spellRank, rank) {
    const count = Math.max(1, Math.min(5, spellRank));
    const color = ELEMENTS.conjuration.color;
    for (let i = 0; i < count; i += 1) {
      const pet = {
        owner: h, name: "Spectral Blade", summoned: true, summonKind: "blades", untouchable: true, school: "conjuration", glow: color,
        until: this.time + spell.seconds, level: rank * 2,
        stats: { species: "blade", color, guard: 0 }, body: { hp: 0, weight: 0 },
        hp: 1, maxHp: 0, down: false, hurtAt: -99, strikeAt: -99, face: 1, moving: false,
        x: h.x + Math.cos((i / count) * TAU) * 26, y: h.y + Math.sin((i / count) * TAU) * 18,
        // Staggered so five blades don't all cut on the same frame.
        cd: 0.2 + i * 0.15, bladeIndex: i, bladeCount: count, retargetAt: 0, target: null,
        damage: (h.d.attack || 0) * spell.damage * power, reach: spell.reach, interval: spell.interval,
      };
      this.pets.push(pet);
      this.vfx?.beastSpawn(pet, rank);
    }
    this._float(h.x, h.y - 30, count > 1 ? `${count} SPECTRAL BLADES` : "SPECTRAL BLADE", color);
  },

  // Summon Elemental: a pet of the caster's best other school. It fights like
  // a spirit beast (familiars.js), with its school's touch on each hit
  // (_petStrike); support schools' elementals also help allies nearby
  // (_elementalPulse).
  _summonElemental(h, spell, power, rank) {
    const school = heroElementalSchool(h.model);
    const kind = ELEMENTALS[school];
    const color = ELEMENTS[school].color;
    const maxHp = Math.max(1, Math.round(h.d.maxHp * spell.hp));
    const pet = {
      owner: h, name: `${ELEMENTS[school].name} Elemental`, summoned: true, summonKind: "elemental", school, glow: color,
      until: this.time + spell.seconds, level: rank * 2,
      stats: { species: "elemental", element: school, color, guard: 0, attack: {
        range: kind.range, moveSpeed: kind.moveSpeed, interval: 1,
        damage: (h.d.attack || 0) * spell.damage * power * (kind.support ? 0.5 : 1), mark: 0, burn: kind.burn || 0, bleed: 0, slow: kind.slow || 0,
        lifelink: 0, poison: kind.poison || 0, pounce: 0, web: kind.web || null, cone: 0, arc: kind.arc || 0, stun: kind.stun || 0, blind: kind.blind || 0,
      } },
      body: { hp: spell.hp, weight: 1, airborne: false, taunt: null },
      pulse: kind.pulse || null, pulseCd: 1,
      hp: maxHp, maxHp, down: false, hurtAt: -99, strikeAt: -99, face: 1, moving: false,
      x: h.x - 22, y: h.y + 8, cd: 0.3, supportCd: 0, tauntCd: 0, webCd: 0, pounced: false, target: null,
    };
    this.pets.push(pet);
    this.vfx?.beastSpawn(pet, rank);
    this._float(h.x, h.y - 30, pet.name.toUpperCase(), color);
  },

  // A support elemental's help, once a second, for every ally within reach.
  _elementalPulse(pet, dt) {
    pet.pulseCd -= dt;
    if (pet.pulseCd > 0) return;
    pet.pulseCd = 1;
    const { heal = 0, shield = 0, haste = 0 } = pet.pulse;
    for (const ally of this.heroes) {
      if (!ally.alive || Math.hypot(ally.x - pet.x, ally.y - pet.y) > ELEMENTAL_PULSE_RADIUS) continue;
      if (heal > 0) {
        const healed = this._classlessHeal(ally, ally.d.maxHp * heal);
        if (healed > 0) this._float(ally.x, ally.y - 26, `+${Math.round(healed)}`, pet.stats.color);
      }
      if (shield > 0) ally.ref.shield = Math.min(ally.d.maxHp * SHIELD_CAP, (ally.ref.shield || 0) + ally.d.maxHp * shield);
      if (haste > 0) {
        ally.hasteAmount = ally.hasteUntil > this.time ? Math.max(ally.hasteAmount || 0, haste) : haste;
        ally.hasteUntil = Math.max(ally.hasteUntil || 0, this.time + 1.1);
      }
    }
  },

  // A blade's turn: pick a foe near the party (blades spread over the closest
  // ones), spin around it, and cut every foe within reach on its timer. With
  // no foe it circles the caster.
  _bladeTurn(pet, dt) {
    const owner = pet.owner;
    const startX = pet.x;
    const valid = pet.target && pet.target.hp > 0 && this.active.includes(pet.target) && !(pet.target.dominatedUntil > this.time);
    if (!valid || this.time >= pet.retargetAt) {
      pet.retargetAt = this.time + BLADE.retarget;
      const allies = this.heroes.filter((ally) => ally.alive);
      const threat = (e) => allies.reduce((best, ally) => Math.min(best, Math.hypot(e.x - ally.x, e.y - ally.y)), Infinity);
      const foes = this.active
        .filter((e) => e.hp > 0 && !(e.dominatedUntil > this.time) && Math.hypot(e.x - owner.x, e.y - owner.y) <= BLADE.leash)
        .map((e) => ({ e, d: threat(e) }))
        .sort((a, b) => a.d - b.d)
        .map((entry) => entry.e);
      pet.target = foes.length ? foes[pet.bladeIndex % foes.length] : null;
    }
    const anchor = pet.target || owner;
    const radius = pet.target ? 8 : 26;
    const angle = this.time * 2.4 + (pet.bladeIndex / pet.bladeCount) * TAU;
    const tx = anchor.x + Math.cos(angle) * radius;
    const ty = anchor.y + Math.sin(angle) * radius * 0.7;
    const dist = Math.hypot(tx - pet.x, ty - pet.y);
    pet.moving = false;
    if (dist > 0.5) {
      const step = Math.min(dist, BLADE.speed * dt);
      pet.x += ((tx - pet.x) / dist) * step;
      pet.y += ((ty - pet.y) / dist) * step;
      pet.moving = step > 0.05;
    }
    if (pet.x !== startX) pet.face = pet.x > startX ? 1 : -1;
    pet.cd -= dt;
    if (pet.cd > 0) return;
    const victims = this.active.filter((e) => e.hp > 0 && !(e.dominatedUntil > this.time)
      && Math.hypot(e.x - pet.x, e.y - pet.y) <= pet.reach + ENEMY_BODY_RADIUS(e));
    if (!victims.length) return;
    pet.cd = pet.interval;
    pet.strikeAt = this.time;
    for (const e of victims) this._bonusDamage(e, pet.damage, "H" + owner.i, pet.stats.color);
  },
};
