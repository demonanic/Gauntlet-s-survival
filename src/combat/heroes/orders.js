// Party orders (Phase 8D, moved out of engine.js unchanged): what the player
// tells heroes from the battle screen: pick a hero, take or give back manual
// control, move, attack a foe (or a point), retreat, rally, cancel an order,
// and the targeting helpers behind them. They stay engine methods (engine.js
// mixes them in), since the battle screen and tests call them by name.
import { ENEMY_BODY_RADIUS, FLOOR_Y, W } from "../arena";

export const partyOrderMethods = {
  setSelectedHero(index) {
    this.selectedHero = Number.isInteger(index) ? index : null;
    return true;
  },

  setTargetSelection(index) {
    const h = this.heroes[index];
    this.targetingHero = h?.alive && h.d.rangeMode === "midline" ? index : null;
    return this.targetingHero !== null;
  },

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
  },

  getRangedTargetAt(index, x, y) {
    const status = this.getRangedTargetStatus(index);
    if (!status) return null;
    return status.targets
      .filter((target) => Math.hypot(target.enemy.x - x, target.enemy.y - y) <= 80)
      .sort((a, b) => Math.hypot(a.enemy.x - x, a.enemy.y - y) - Math.hypot(b.enemy.x - x, b.enemy.y - y))[0] || null;
  },

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
  },

  // The living foe under a tap at (x, y), if any (a little slack for fingers).
  enemyAt(x, y, slack = 14) {
    let best = null, bd = Infinity;
    for (const e of this.active) {
      if (e.hp <= 0 || e._dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= ENEMY_BODY_RADIUS(e) + slack && d < bd) { bd = d; best = e; }
    }
    return best;
  },

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
  },

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
  },

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
  },

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
  },

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
  },

  _completeTacticalAction(index, result) {
    const h = this.heroes[index];
    if (!h?.pendingTacticalAction) return false;
    h.pendingTacticalAction = null;
    this.actionCompletions.push({ index, result });
    return true;
  },

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
  },

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
  },
};
