// An enemy's turn (Phase 8B, moved out of engine.js unchanged): fear and
// confusion first, then boss abilities, champion powers and the Warlock's
// mage hunt (abilities.js), then its role (roles.js), else the common turn:
// peel toward a picked hero, chase a taunting familiar, strike whatever it
// reached, or close on the nearest hero. The nemesis tick and tactical
// targeting live here too.
import { bossAbility, championTick, warlockMageHunt } from "./abilities";
import { enemyRole } from "./roles";
import { BODY_PAD } from "./tuning";
import { FLOOR_Y, W } from "../arena";

export function enemyTurn(engine, e, dt) {
  if (e.nemesisId && nemesisTick(engine, e, dt)) return;
  if (e.champion && !(e.silenceUntil > engine.time)) championTick(engine, e, dt);
  e.atkCd -= dt * (e.attackSlowUntil > engine.time ? (e.attackSlowMultiplier || 1) : 1) * (e.attackSpeed || 1);
  if (e.stunUntil && e.stunUntil > engine.time) return;
  // Shadow and Mind control: a frightened foe flees; a confused or
  // dominated one fights its own side.
  if (e.fearUntil > engine.time) { fleeTurn(engine, e, dt); return; }
  if (e.dominatedUntil > engine.time || e.confusedUntil > engine.time) { turncoatTurn(engine, e, dt); return; }
  // Fooled by a Mirror Self (heroes/conjured.js): go for the copy.
  if (e.mirrorUntil > engine.time) { if (mirrorTurn(engine, e, dt)) return; }
  // Boss special: a targeted, proximity-based napalm bottle.
  // It no longer damages every hero simultaneously. The target is the nearest
  // living hero inside the boss's configured attack range.
  const silenced = e.silenceUntil > engine.time;
  if (e.boss && !silenced) bossAbility(engine, e, dt);
  if (roleTurn(engine, e, dt)) return;
  // Enemy archetypes get a small tactical identity on top of their
  // existing stats/objectives. These are intentionally readable rules:
  // fast raiders rush, brutes hunt structures, reapers hunt wounded heroes,
  // and lieutenants reinforce nearby attackers.
  const tactical = tacticalTarget(engine, e);
  const commanderBoost = e._commanderBoost || 1;
  if (e.type === "warlock" && !silenced) warlockMageHunt(engine, e, dt);
  const baseMoveSpeed =
    e.type === "goblin" ? e.speed * 1.18 * commanderBoost :
    e.type === "darkElf" ? e.speed * 1.08 * commanderBoost :
    e.type === "slime" ? e.speed * 0.92 * commanderBoost :
    e.type === "reaper" ? e.speed * 1.05 * commanderBoost :
    e.speed * commanderBoost;
  if (e.rootUntil > engine.time) return;
  const moveSpeed = baseMoveSpeed * (e.slowUntil > engine.time ? (e.slowMultiplier || 1) : 1);

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
        engine._throwEnemyBolt(e, tactical, e.damage, "#C026D3", true);
        e.atkCd = 1.65;
      }
      return;
    }
    if (!ranged && dist <= attackRange) {
      if (e.atkCd <= 0) {
        engine._enemyAttack(e, tactical);
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
  if (engine.pets.length && e.tauntUntil > engine.time && e.tauntedBy && !e.tauntedBy.down && !e.boss) {
    const pet = e.tauntedBy;
    const dist = Math.hypot(pet.x - e.x, pet.y - e.y) || 1;
    if (dist <= 30 + BODY_PAD) {
      if (e.atkCd <= 0) { engine._enemyHitPet(e, pet); e.atkCd = meleeCooldown; }
    } else {
      e.x += ((pet.x - e.x) / dist) * moveSpeed * dt;
      e.y += ((pet.y - e.y) / dist) * moveSpeed * dt;
    }
    return;
  }
  // An enemy that reaches a hero, or a familiar, attacks it.
  const blocker = engine._nearestHeroEntity(e.x, e.y, 30 + BODY_PAD);
  const petInReach = engine.pets.length ? engine._nearestPetInReach(e.x, e.y, 30 + BODY_PAD) : null;
  if (petInReach && (!blocker || petInReach.weighted < Math.hypot(blocker.obj.x - e.x, blocker.obj.y - e.y))) {
    if (e.atkCd <= 0) {
      engine._enemyHitPet(e, petInReach.pet);
      e.atkCd = meleeCooldown;
    }
    return;
  }
  if (blocker) {
    if (e.atkCd <= 0) {
      engine._enemyAttack(e, blocker);
      e.atkCd = meleeCooldown;
    }
    return;
  }
  // No castle to reach: every enemy closes on the nearest living hero.
  let prey = null, preyDistance = Infinity;
  for (const h of engine.heroes) {
    if (!h.alive || engine._isHeroUntargetable(h)) continue;
    const d = Math.hypot(h.x - e.x, h.y - e.y);
    if (d < preyDistance) { preyDistance = d; prey = h; }
  }
  if (!prey || preyDistance < 1) return;
  e.x += ((prey.x - e.x) / preyDistance) * moveSpeed * dt;
  e.y += ((prey.y - e.y) / preyDistance) * moveSpeed * dt;
}


// Gauntlet enemy roles. Returns true when the enemy's turn is handled.
export function roleTurn(engine, e, dt) {
  const speedScale = (e._commanderBoost || 1) * (e.slowUntil > engine.time ? (e.slowMultiplier || 1) : 1);
  const rooted = e.rootUntil > engine.time;
  const move = (target, speed, away = false) => {
    if (rooted) return;
    const dist = Math.hypot(target.x - e.x, target.y - e.y) || 1;
    const step = Math.min(speed * speedScale * dt, away ? Infinity : dist);
    e.x += ((target.x - e.x) / dist) * step * (away ? -1 : 1);
    e.y += ((target.y - e.y) / dist) * step * (away ? -1 : 1);
    e.x = Math.max(10, Math.min(W - 10, e.x));
    e.y = Math.max(10, Math.min(FLOOR_Y - 10, e.y));
  };
  const living = engine.heroes.filter((h) => h.alive && !engine._isHeroUntargetable(h));
  if (!living.length) return false;
  const nearest = living.reduce((best, h) => (Math.hypot(h.x - e.x, h.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y) ? h : best));
  const distTo = (h) => Math.hypot(h.x - e.x, h.y - e.y);

  // Gauntlet enemy roles (enemies/roles.js): the first that matches takes the turn.
  const role = enemyRole(engine, e);
  return role ? role.act(engine, e, dt, { move, living, nearest, distTo }) : false;
}


// A frightened foe runs from the nearest hero and doesn't attack.
// A foe fooled by a Mirror Self closes on the copy and strikes it, whatever
// its usual way of fighting. Returns false once the copy is down or gone.
export function mirrorTurn(engine, e, dt) {
  const pet = e.mirrorPet;
  if (!pet || pet.down || !engine.pets.includes(pet)) { e.mirrorUntil = 0; return false; }
  const dist = Math.hypot(pet.x - e.x, pet.y - e.y) || 1;
  if (dist <= 30 + BODY_PAD) {
    if (e.atkCd <= 0) { engine._enemyHitPet(e, pet); e.atkCd = e.type === "orc" ? 1.15 : 1.0; }
    return true;
  }
  if (e.rootUntil > engine.time) return true;
  const speed = e.speed * (e._commanderBoost || 1) * (e.slowUntil > engine.time ? (e.slowMultiplier || 1) : 1);
  e.x += ((pet.x - e.x) / dist) * speed * dt;
  e.y += ((pet.y - e.y) / dist) * speed * dt;
  return true;
}

export function fleeTurn(engine, e, dt) {
  if (e.rootUntil > engine.time) return;
  const hero = engine.heroes.filter((h) => h.alive).reduce((best, h) =>
    (!best || Math.hypot(h.x - e.x, h.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y) ? h : best), null);
  if (!hero) return;
  const d = Math.hypot(e.x - hero.x, e.y - hero.y) || 1;
  const speed = e.speed * (e.slowUntil > engine.time ? (e.slowMultiplier || 1) : 1);
  e.x = Math.max(10, Math.min(W - 10, e.x + ((e.x - hero.x) / d) * speed * dt));
  e.y = Math.max(10, Math.min(FLOOR_Y - 10, e.y + ((e.y - hero.y) / d) * speed * dt));
}


// A confused or dominated foe turns on its own side: it closes on the
// nearest other foe and hits it (credited to the caster).
export function turncoatTurn(engine, e, dt) {
  const prey = engine.active.filter((other) => other !== e && other.hp > 0 && !(other.dominatedUntil > engine.time))
    .reduce((best, other) => (!best || Math.hypot(other.x - e.x, other.y - e.y) < Math.hypot(best.x - e.x, best.y - e.y) ? other : best), null);
  if (!prey) return;
  const d = Math.hypot(prey.x - e.x, prey.y - e.y) || 1;
  if (d > 30 + BODY_PAD) {
    if (e.rootUntil > engine.time) return;
    const speed = e.speed * (e.slowUntil > engine.time ? (e.slowMultiplier || 1) : 1);
    e.x += ((prey.x - e.x) / d) * speed * dt;
    e.y += ((prey.y - e.y) / d) * speed * dt;
    return;
  }
  if (e.atkCd > 0) return;
  e.atkCd = 1;
  engine._bonusDamage(prey, e.damage, e.controlSource || "H0", "#C4B5FD");
}


// A nemesis regenerates, and once per fight, nearly dead, may flee the
// field (it leaves the wave; the party still wins if it clears the rest).
export function nemesisTick(engine, e, dt) {
  if (e.regen > 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
  if (e.fleeRolled || e.hp > e.maxHp * (e.fleeBelow || 0)) return false;
  e.fleeRolled = true;
  if (!(engine.rng() < (e.fleeChance || 0))) return false;
  engine.nemesisFled = e.nemesisId;
  engine._float(e.x, e.y - 30, `${e.name.toUpperCase()} FLEES!`, "#F59E0B");
  engine.effects.push({ kind: "impact", x: e.x, y: e.y, r: 30, life: 0.5, color: "#F59E0B" });
  e._dead = true;
  e.hp = 0;
  return true;
}


export function tacticalTarget(engine, e) {
  if (e.type === "reaper") {
    let best = null, worst = Infinity;
    for (const h of engine.heroes) {
      if (!h.alive || engine._isHeroUntargetable(h)) continue;
      const d = Math.hypot(h.x - e.x, h.y - e.y);
      if (d > 260) continue;
      const frac = h.ref.hp / Math.max(1, h.d.maxHp);
      if (frac < worst) { worst = frac; best = h; }
    }
    return best ? { kind: "hero", obj: best } : null;
  }

  if (e.type === "orc") {
    return engine._nearestHeroEntity(e.x, e.y, 110);
  }

  if (e.type === "lieutenant") {
    return engine._nearestHeroEntity(e.x, e.y, 150);
  }

  if (e.type === "ghost") {
    return engine._nearestHeroEntity(e.x, e.y, 120);
  }

  if (e.type === "darkElf") {
    return engine._nearestHeroEntity(e.x, e.y, 140);
  }

  if (e.type === "warlock") {
    return engine._nearestMageEntity(e.x, e.y, 300)
      || engine._nearestHeroEntity(e.x, e.y, 300);
  }

  return null;
}
