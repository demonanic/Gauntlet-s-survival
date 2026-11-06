// Enemy roles (Phase 8B, moved out of engine.js unchanged): what special
// enemies do on their turn. The engine asks each role in this order and the
// first whose `is` matches takes the enemy's turn (its `act` returns true);
// enemies with no role (or no hero to go for) fall through to the engine's
// common advance-and-attack behavior.
//
// `act` gets the engine, the enemy, the frame time and the turn's shared
// view: `move(target, speed, away)` (respects roots, slows and the arena
// edges), the targetable `living` heroes, the `nearest` of them and `distTo`.
import { BODY_PAD, SAPPER_SPRINT_RANGE } from "./tuning";

export const ENEMY_ROLES = Object.freeze([
  {
    id: "sapper",
    is: (engine, e) => e.bomber,
    act(engine, e, dt, { move, living, nearest, distTo }) {
      // Gnome Sapper: sprints at the nearest hero, lights the fuse, and blows up.
      if (e.fuseAt != null) {
        if (engine.time >= e.fuseAt) engine._detonate(e, 1);
        return true;
      }
      if (distTo(nearest) <= 30 + BODY_PAD) {
        e.fuseAt = engine.time + 0.7;
        engine._float(e.x, e.y - 20, "FUSE LIT!", "#FB923C");
        return true;
      }
      // With a Bulwark in the squad it keeps to the shield's shadow until it
      // is close enough to sprint the rest of the way.
      const shield = distTo(nearest) > SAPPER_SPRINT_RANGE &&
        engine.active.find((ally) => ally.type === "bulwark" && ally.hp > 0);
      if (shield) {
        const away = Math.hypot(shield.x - nearest.x, shield.y - nearest.y) || 1;
        const behind = { x: shield.x + ((shield.x - nearest.x) / away) * 22, y: shield.y + ((shield.y - nearest.y) / away) * 22 };
        if (Math.hypot(behind.x - e.x, behind.y - e.y) > 4) move(behind, e.speed * 1.25);
        return true;
      }
      move(nearest, e.speed * 1.25);
      return true;
    },
  },
  {
    id: "bulwark",
    is: (engine, e) => e.type === "bulwark",
    act(engine, e, dt, { move, living, nearest, distTo }) {
      // Anchor: fights whoever reaches it; otherwise plants itself between its
      // most threatened ward (a support or control ally) and the hero closest
      // to that ward. With no wards left it advances like any frontliner.
      if (distTo(nearest) <= 32 + BODY_PAD) {
        if (e.atkCd <= 0) {
          engine._enemyAttack(e, { kind: "hero", obj: nearest });
          e.atkCd = 1.25;
        }
        return true;
      }
      const ward = engine._bulwarkWard(e, living);
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
    },
  },
  {
    id: "hunter",
    is: (engine, e) => e.families?.includes("hunter") && !e.boss && e.type !== "bandit" && e.type !== "darkElf",
    act(engine, e, dt, { move, living, nearest, distTo }) {
      // Hunters (Harriers, Stalkers, legends) go for the most wounded hero. A
      // Stalker's first strike lands extra hard. A Harrier only hunts when
      // someone is hurt (below 70%); otherwise it skirmishes: strike the
      // nearest hero, then fall back for a moment.
      const weakest = living.reduce((best, h) => (h.ref.hp / h.d.maxHp < best.ref.hp / best.d.maxHp ? h : best));
      const hunting = e.type !== "harrier" || weakest.ref.hp / weakest.d.maxHp < 0.7;
      const prey = hunting ? weakest : nearest;
      if (!hunting && e.fallBackUntil > engine.time) {
        move(prey, e.speed, true);
        return true;
      }
      if (distTo(prey) <= 30 + BODY_PAD) {
        if (e.atkCd <= 0) {
          const base = e.damage;
          if (e.type === "stalker" && !e.struck) e.damage *= 1.5;
          engine._enemyAttack(e, { kind: "hero", obj: prey });
          e.damage = base;
          e.struck = true;
          e.atkCd = e.type === "harrier" ? 0.7 : 0.9;
          if (!hunting) e.fallBackUntil = engine.time + 0.6;
        }
        return true;
      }
      move(prey, e.speed * 1.1);
      return true;
    },
  },
  {
    id: "carrionPriest",
    is: (engine, e) => e.type === "carrionPriest",
    act(engine, e, dt, { move, living, nearest, distTo }) {
      // Protector: feeds on the weak. Sacrifices a dying ally (or eats a
      // corpse) to heal and empower the rest of the squad.
      e.feedCd = (e.feedCd ?? 3) - dt;
      if (e.feedCd <= 0 && !(e.silenceUntil > engine.time)) {
        const victim = engine.active.find((ally) => ally !== e && ally.hp > 0 && !ally.boss && ally.type !== "carrionPriest" &&
          ally.hp < ally.maxHp * 0.25 && Math.hypot(ally.x - e.x, ally.y - e.y) <= 220);
        const corpse = victim ? null : engine._fallenNear(e, 220);
        if (victim || corpse) {
          e.feedCd = 5;
          if (victim) {
            victim.hp = 0;
            victim._dead = true;
            engine.killed += 1;
            engine.effects.push({ kind: "death", x: victim.x, y: victim.y, r: 14, life: 0.5, color: e.color });
            engine._float(victim.x, victim.y - 16, "SACRIFICED", e.color);
          } else {
            engine.fallen.splice(engine.fallen.indexOf(corpse), 1);
            engine._float(corpse.x, corpse.y - 16, "DEVOURED", e.color);
          }
          engine._healAllies(e, 220, victim ? 0.2 : 0.1);
          if (victim) for (const ally of engine.active) if (ally.hp > 0 && Math.hypot(ally.x - e.x, ally.y - e.y) <= 220) ally.empoweredUntil = engine.time + 6;
          return true;
        }
        e.feedCd = 0.5;
      }
      const dist = distTo(nearest);
      if (dist < 170) move(nearest, e.speed * 1.2, true);
      else if (dist > 240) move(nearest, e.speed);
      else if (e.atkCd <= 0) {
        engine._throwEnemyBolt(e, { kind: "hero", obj: nearest }, e.damage, e.color, true);
        e.atkCd = 2.2;
      }
      return true;
    },
  },
  {
    id: "watcher",
    is: (engine, e) => e.type === "watcher",
    act(engine, e, dt, { move, living, nearest, distTo }) {
      // Watchers make sneaking past them hard; in a fight they mark a hero,
      // leaving them exposed (+15% damage taken) for a few seconds.
      const dist = distTo(nearest);
      if (dist < 160) move(nearest, e.speed * 1.1, true);
      else if (dist > 260) move(nearest, e.speed);
      else if (e.atkCd <= 0) {
        // It picks the hero its squad is best placed to punish: the most
        // enemies close by, then the most wounded.
        const unmarked = living.filter((h) => !(h.exposedUntil > engine.time));
        const pressure = (h) => engine.active.filter((ally) => ally !== e && ally.hp > 0 && Math.hypot(ally.x - h.x, ally.y - h.y) <= 90).length;
        const marked = unmarked.length
          ? unmarked.reduce((best, h) => {
            const diff = pressure(h) - pressure(best);
            return diff > 0 || (diff === 0 && h.ref.hp / h.d.maxHp < best.ref.hp / best.d.maxHp) ? h : best;
          })
          : nearest;
        marked.exposedUntil = engine.time + 4;
        engine._float(marked.x, marked.y - 26, "MARKED", e.color);
        engine._throwEnemyBolt(e, { kind: "hero", obj: marked }, e.damage, e.color, true);
        e.atkCd = 2.4;
      }
      return true;
    },
  },
  {
    id: "bandit",
    is: (engine, e) => e.type === "bandit" || (e.type === "banditWarlord" && e.blitzUntil > engine.time),
    act(engine, e, dt, { move, living, nearest, distTo }) {
      // Bandits blitz the weakest hero: a burst of speed and a heavy first strike.
      const prey = living.reduce((best, h) => (h.ref.hp / h.d.maxHp < best.ref.hp / best.d.maxHp ? h : best));
      const dist = distTo(prey);
      e.blitzCd = (e.blitzCd ?? 1.5) - dt;
      if (dist <= (e.boss ? 40 : 30) + BODY_PAD) {
        if (e.atkCd <= 0) {
          const base = e.damage;
          if (e.blitzStrike) e.damage *= 1.6;
          engine._enemyAttack(e, { kind: "hero", obj: prey });
          e.damage = base;
          e.blitzStrike = false;
          e.atkCd = e.boss ? 1 : 0.75;
        }
        return true;
      }
      if (e.blitzCd <= 0 && dist > 60 && dist < 220 && !(e.blitzUntil > engine.time) && !(e.silenceUntil > engine.time)) {
        e.blitzUntil = engine.time + 0.45;
        e.blitzCd = 6;
        e.blitzStrike = true;
        engine._float(e.x, e.y - 18, "BLITZ", e.color);
      }
      move(prey, e.speed * (e.blitzUntil > engine.time ? 3.2 : 1.15));
      return true;
    },
  },
  {
    id: "darkElf",
    is: (engine, e) => e.type === "darkElf",
    act(engine, e, dt, { move, living, nearest, distTo }) {
      // Dark Elf sniper: hangs back, takes aim at a ranged hero (or the most
      // wounded), and fires one heavy shot. The aim line warns the target.
      const ranged = living.filter((h) => h.d.rangeMode === "midline");
      const pool = ranged.length ? ranged : living;
      const target = e.aimTarget?.alive && pool.includes(e.aimTarget) ? e.aimTarget
        : pool.reduce((best, h) => (h.ref.hp < best.ref.hp ? h : best));
      const dist = distTo(target);
      if (e.aimUntil != null) {
        if (!e.aimTarget?.alive) { e.aimUntil = null; e.aimTarget = null; return true; }
        if (engine.time >= e.aimUntil) {
          engine._throwEnemyBolt(e, { kind: "hero", obj: e.aimTarget }, e.damage * 2, "#F43F5E");
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
        e.aimUntil = engine.time + 0.9;
        e.aimTarget = target;
      }
      return true;
    },
  },
  {
    id: "lesserNecromancer",
    is: (engine, e) => e.type === "lesserNecromancer",
    act(engine, e, dt, { move, living, nearest, distTo }) {
      // Keeps its distance, mends the wounded, and raises one fallen ally.
      e.healCd = (e.healCd ?? 2) - dt;
      e.raiseCd = (e.raiseCd ?? 5) - dt;
      if (e.raisingUntil != null) {
        if (engine.time >= e.raisingUntil) {
          e.raisingUntil = null;
          if (engine._raiseFallen(e, 240, 1)) e.raised_ = true;
        }
        return true;
      }
      const silenced = e.silenceUntil > engine.time;
      if (e.healCd <= 0 && !silenced) {
        e.healCd = 4.5;
        engine._healAllies(e, 200, 0.18, 1);
      }
      if (e.raiseCd <= 0 && !e.raised_ && !silenced && engine._fallenNear(e, 240)) {
        e.raisingUntil = engine.time + 1.5;
        e.raiseCd = 99;
        engine._float(e.x, e.y - 20, "RAISE DEAD", e.color);
        engine.effects.push({ kind: "charge", x: e.x, y: e.y, r: 24, life: 1.5, color: e.color });
        return true;
      }
      const dist = distTo(nearest);
      if (dist < 170) move(nearest, e.speed * 1.2, true);
      else if (dist > 230) move(nearest, e.speed);
      else if (e.atkCd <= 0) {
        engine._throwEnemyBolt(e, { kind: "hero", obj: nearest }, e.damage, e.color, true);
        e.atkCd = 2;
      }
      return true;
    },
  },
]);

// The role that takes this enemy's turn, or null.
export function enemyRole(engine, e) {
  return ENEMY_ROLES.find((role) => role.is(engine, e)) || null;
}
