// Story battle goals (owner's design, Nov 2026). Every story battle's first
// goal is to survive and move on; a battle may add a second, specialty goal
// (`wave.goal`). The engine only tracks it here and reports how it went; what
// that means for the campaign is game/story.js. DESIGN.md "Story goals".
//
//   assassinate  one marked foe (`e.quarry`) flees after `escapeAfter` s on the
//                field; kill it first.
//   destroy      `count` objects (portal-like: they never move or attack, and
//                call foes until broken) appear at the start; break them all
//                within `within` s, or they finish their work and vanish.
//   hold         a wagon behind the party; every marked raider (`e.thief`)
//                that gets away with loot costs it one of its `lives`.
import { H, W } from "./arena";

export const GOAL_KINDS = Object.freeze(["assassinate", "destroy", "hold"]);

// A goal as the engine tracks it, from the wave's plan (null: no goal).
export function createGoal(plan) {
  if (!plan || !GOAL_KINDS.includes(plan.kind)) return null;
  const goal = { kind: plan.kind, text: plan.text || "", critical: !!plan.critical, state: "active" };
  if (plan.kind === "destroy") Object.assign(goal, { total: plan.count || 1, left: plan.count || 1, within: plan.within || 45, spawned: false, objects: [] });
  if (plan.kind === "hold") Object.assign(goal, { lives: plan.lives || 3, livesLeft: plan.lives || 3 });
  return goal;
}

// Once a frame: place the objects to destroy, run their clock, settle the goal.
export function goalTick(engine) {
  const goal = engine.goal;
  if (!goal || goal.state !== "active") return;
  if (goal.kind === "destroy") {
    if (!goal.spawned) spawnObjects(engine, goal);
    goal.left = goal.objects.filter((o) => o.hp > 0 && !o.escaped).length;
    if (goal.left === 0) return settle(engine, goal, "done");
    if (engine.time >= goal.within) {
      for (const o of goal.objects) {
        if (o.hp <= 0 || o.escaped) continue;
        o.escaped = true;
        engine._float(o.x, o.y - 20, "TOO LATE", o.color);
      }
      settle(engine, goal, "failed");
    }
  } else if (goal.kind === "assassinate") {
    if (goal.target && goal.target.hp <= 0 && !goal.target.escaped) settle(engine, goal, "done");
  }
}

// The marked foe has been on the field long enough: it gets away.
export function quarryEscapes(engine, e) {
  e.escaped = true;
  engine._float(e.x, e.y - 20, "ESCAPED", "#FBBF24");
  engine._log("death", `${engine._foeName(e)} escapes`);
  engine.effects.push({ x: e.x, y: e.y, r: 20, life: 0.4, color: e.color, ring: true });
  if (engine.goal?.kind === "assassinate" && engine.goal.state === "active") settle(engine, engine.goal, "failed");
}

// A spawned foe the goal cares about.
export function goalSpawned(engine, e) {
  if (e.quarry) {
    e.quarry.at = engine.time + e.quarry.after;
    if (engine.goal?.kind === "assassinate") engine.goal.target = e;
  }
}

// A raider got away with loot: the wagon takes the loss.
export function wagonRaided(engine) {
  const goal = engine.goal;
  if (goal?.kind !== "hold" || goal.state !== "active") return;
  goal.livesLeft = Math.max(0, goal.livesLeft - 1);
  engine._float(W / 2, H - 40, goal.livesLeft ? `WAGON RAIDED ${goal.livesLeft}/${goal.lives}` : "WAGON LOST", "#FBBF24");
  if (goal.livesLeft === 0) settle(engine, goal, "failed");
}

// At the end of the fight: a goal still active is done if it was to hold,
// and failed otherwise (its target or objects are still out there).
export function goalResult(goal, victory) {
  if (!goal) return null;
  let state = goal.state;
  if (state === "active") state = goal.kind === "hold" && victory ? "done" : "failed";
  return { kind: goal.kind, done: state === "done", critical: goal.critical };
}

// What the battle screen shows: the goal's text, how it stands, and its clock.
export function goalStatus(engine) {
  const goal = engine.goal;
  if (!goal) return null;
  const status = { kind: goal.kind, text: goal.text, state: goal.state, critical: goal.critical };
  if (goal.kind === "destroy") Object.assign(status, { left: goal.left, total: goal.total, secondsLeft: Math.max(0, Math.ceil(goal.within - engine.time)) });
  if (goal.kind === "hold") Object.assign(status, { livesLeft: goal.livesLeft, lives: goal.lives });
  if (goal.kind === "assassinate" && goal.target?.quarry?.at != null && goal.target.hp > 0) {
    status.secondsLeft = Math.max(0, Math.ceil(goal.target.quarry.at - engine.time));
  }
  return status;
}

function settle(engine, goal, state) {
  goal.state = state;
  engine._float(W / 2, H * 0.3, state === "done" ? "GOAL COMPLETE" : "GOAL FAILED", state === "done" ? "#39FF14" : "#FF2A5F");
  engine._log("boss", state === "done" ? `Goal complete: ${goal.text}` : `Goal failed: ${goal.text}`);
}

// The objects appear spread across the far side of the field.
function spawnObjects(engine, goal) {
  goal.spawned = true;
  const plan = engine.wave.goal;
  for (let i = 0; i < goal.total; i += 1) {
    const o = engine.sim.makeMinion("portal");
    o.hp = o.maxHp = Math.round(o.maxHp * (plan.hpMult || 1));
    o.name = plan.object || "Ritual stone";
    o.goalObject = true;
    o.spawnEvery = plan.spawnEvery || 8;
    o.spawnCd = o.spawnEvery;
    if (plan.spawns) o.spawns = plan.spawns;
    engine.injectEnemy(o);
    o.x = W * (i + 1) / (goal.total + 1);
    o.y = 60 + engine.rng() * (H * 0.2);
    goal.objects.push(o);
    engine.effects.push({ x: o.x, y: o.y, r: 30, life: 0.6, color: o.color, ring: true });
  }
}
