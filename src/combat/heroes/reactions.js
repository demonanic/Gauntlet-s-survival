// Reactions (combos): a hit of one school on a foe carrying another school's
// effect. Rules and numbers: REACTIONS in spells.js. Engine methods, mixed in
// by engine.js like the other heroes/ files.
import { ENEMY_BODY_RADIUS } from "../arena";
import { ELEMENTS, REACTIONS, proficiency } from "../spells";

// Burns and poisons are kept as damage over time; tell them apart by colour
// (spells, crystals, familiars and elementals all use these).
const BURN_COLORS = new Set([ELEMENTS.fire.color, "#FF6600"]);
const POISON_COLORS = new Set([ELEMENTS.poison.color, "#39FF14"]);
const hasDot = (e, colors, now) => (e.dots || []).some((dot) => colors.has(dot.color) && dot.until > now);

export const reactionMethods = {
  // Which reaction a hit of `element` on `e` could set off, if any.
  _reactionFor(e, element) {
    const now = this.time;
    if (element === "electric" && e.slowUntil > now) return "shatter";
    if (element === "fire" && hasDot(e, POISON_COLORS, now)) return "ignite";
    if (element === "fire" && e.rootUntil > now) return "wildfire";
    if (element === "ice" && hasDot(e, BURN_COLORS, now)) return "steam";
    if (element === "shadow" && (e.stunUntil > now || e.confusedUntil > now)) return "nightmare";
    return null;
  },

  // Called as a hit lands, before the hitting school's own effect. `damage`:
  // the hit (0 for a hex); `rank`: the hitting school's rank (defaults to the
  // hero's proficiency in it). Returns the reaction set off, or null.
  _react(h, e, element, damage, sourceId, rank = null) {
    if (!e || e.hp <= 0 || e.magicImmune || !(this.time >= (e.reactionReadyAt || 0))) return null;
    const kind = this._reactionFor(e, element);
    if (!kind) return null;
    const r = Math.max(1, Math.min(5, rank ?? proficiency(h.model, element)));
    const chance = REACTIONS.chance.base + REACTIONS.chance.perRank * (r - 1);
    if (this.rng() >= chance) return null;
    e.reactionReadyAt = this.time + REACTIONS.cooldown;
    const scale = e.boss ? REACTIONS.boss : 1;
    const rule = REACTIONS[kind];
    const color = ELEMENTS[element].color;
    const near = (radius) => this.active.filter((o) => o !== e && o.hp > 0 && !o.magicImmune
      && Math.hypot(o.x - e.x, o.y - e.y) <= radius + ENEMY_BODY_RADIUS(o));
    if (kind === "shatter") {
      e.slowUntil = this.time; e.attackSlowUntil = this.time;
      this._bonusDamage(e, damage * rule.bonus * scale, sourceId, color);
    } else if (kind === "ignite") {
      let left = 0;
      e.dots = (e.dots || []).filter((dot) => {
        if (!POISON_COLORS.has(dot.color)) return true;
        left += dot.dps * Math.max(0, dot.until - this.time);
        return false;
      });
      const burst = left * rule.burst * scale;
      this._bonusDamage(e, burst, sourceId, color);
      for (const o of near(rule.radius)) this._bonusDamage(o, burst * rule.splash * (o.boss ? REACTIONS.boss : 1), sourceId, color);
    } else if (kind === "steam") {
      e.dots = (e.dots || []).filter((dot) => !BURN_COLORS.has(dot.color));
      for (const o of [e, ...near(rule.radius)]) {
        const miss = rule.blind * (o.boss ? REACTIONS.boss : 1);
        o.blindChance = o.blindUntil > this.time ? Math.max(o.blindChance || 0, miss) : miss;
        o.blindUntil = Math.max(o.blindUntil || 0, this.time + rule.seconds);
      }
    } else if (kind === "wildfire") {
      const others = near(rule.radius).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y)).slice(0, rule.max);
      for (const o of others) this._applyDot(o, damage * rule.burn * (o.boss ? REACTIONS.boss : 1), 3, ELEMENTS.fire.color, sourceId);
      this.vfx?.reaction("wildfire", e, others);
    } else if (kind === "nightmare") {
      this._bonusDamage(e, (h.d.attack || 0) * rule.burst * scale, sourceId, color);
      if (!e.boss && e.hp > 0) { e.fearUntil = Math.max(e.fearUntil || 0, this.time + rule.seconds); e.stunUntil = Math.min(e.stunUntil || 0, this.time); }
    }
    if (kind !== "wildfire") this.vfx?.reaction(kind, e, near(kind === "steam" ? rule.radius : kind === "ignite" ? rule.radius : 0));
    this._float(e.x, e.y - 34, `${rule.name.toUpperCase()}!`, color);
    this._log("spell", `${this._name(h)}: ${rule.name.toUpperCase()} on ${e.name || "a foe"}`);
    this.reactionCount = (this.reactionCount || 0) + 1;
    (this.reactionsBy ||= {})[kind] = ((this.reactionsBy || {})[kind] || 0) + 1;
    return kind;
  },
};
