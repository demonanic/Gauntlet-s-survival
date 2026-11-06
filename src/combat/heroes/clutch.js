// Clutch (Fortune perk F2a; Phase 8D, moved out of engine.js unchanged): once
// per hero per fight, when the next hit would kill them, the fight slows down
// while the player picks Drink or Ultra Crit; the hero's nature decides if the
// player doesn't. Engine methods (engine.js mixes them in).
import { CONSUMABLES } from "../gear";
import { heroLuck, luckEffects } from "../luck";

export const CLUTCH = Object.freeze({
  seconds: 5, // real seconds to choose
  slowMotion: 0.2, // game speed while choosing
  secondWind: 0.3, // heal when Drinking with no healing item
  critChance: 0.15, // Ultra Crit base chance (+ Luck)
  bossDamage: 0.25, // share of a boss's max HP an Ultra Crit takes
  // Heroes whose nature picks the gamble when the player doesn't.
  gamblers: Object.freeze(["reckless", "berserker"]),
});

export const clutchMethods = {
  // What the hero picks if the player doesn't: gamblers go for the crit.
  clutchDefault(h) {
    return (h.model?.traits || []).some((trait) => CLUTCH.gamblers.includes(trait)) ? "crit" : "drink";
  },

  clutchCritChance(h) {
    return Math.min(1, CLUTCH.critChance + luckEffects(heroLuck(h.model)).clutchChance);
  },

  _startClutch(h) {
    h.clutchUsed = true;
    this._float(h.x, h.y - 28, "CLUTCH!", "#FFE600");
    this.effects.push({ kind: "guard", x: h.x, y: h.y, r: 30, life: 0.8, color: "#FFE600" });
    // Without a player watching (headless fights), the hero decides at once.
    if (!this.cb.onClutch) {
      this.resolveClutch(this.clutchDefault(h), h);
      return;
    }
    this.clutch = { hero: h, remaining: CLUTCH.seconds };
    this.cb.onClutch(this._clutchInfo());
  },

  _clutchInfo() {
    const h = this.clutch?.hero;
    if (!h) return null;
    const slot = this._clutchHealSlot(h);
    return {
      heroIndex: h.i, name: h.model?.identity?.name || "Hero", remaining: this.clutch.remaining,
      critChance: this.clutchCritChance(h), drink: slot ? CONSUMABLES[slot.key].name : "Second wind",
      auto: this.clutchDefault(h),
    };
  },

  // Slow motion while the player chooses; the hero's nature decides on timeout.
  _tickClutch(dt) {
    const h = this.clutch.hero;
    if (!h.alive || this.ended) {
      this.clutch = null;
      this.cb.onClutch?.(null);
      return dt;
    }
    this.clutch.remaining -= dt / Math.max(0.01, this.speed);
    if (this.clutch.remaining <= 0) {
      this.resolveClutch(this.clutchDefault(h));
      return dt;
    }
    return dt * CLUTCH.slowMotion;
  },

  _clutchHealSlot(h) {
    const slots = Array.isArray(h.model?.quickSlots) ? h.model.quickSlots : [];
    const heals = slots.filter((slot) => slot && CONSUMABLES[slot.key]?.heal && slot.qty > 0);
    return heals.sort((a, b) => CONSUMABLES[b.key].heal - CONSUMABLES[a.key].heal)[0] || null;
  },

  // "drink": the best healing item in the quick slots, or a second wind.
  // "crit": an Ultra Crit on the hero's target that kills it outright (a boss
  // loses a share of its HP), if it lands.
  resolveClutch(choice, hero = this.clutch?.hero) {
    const h = hero;
    if (!h) return false;
    this.clutch = null;
    this.cb.onClutch?.(null);
    if (!h.alive) return false;
    const record = { hero: h.i, choice: choice === "crit" ? "crit" : "drink", landed: false };
    if (record.choice === "drink") {
      const slot = this._clutchHealSlot(h);
      const item = slot && CONSUMABLES[slot.key];
      const fraction = item ? item.heal * (1 + (h.d.traits?.healBonus || 0)) * (1 - (h.d.env?.healCut || 0)) : CLUTCH.secondWind;
      if (slot) {
        slot.qty -= 1;
        this._tally(h, "heals", 1);
      }
      const amount = Math.min(h.d.maxHp - h.ref.hp, h.d.maxHp * fraction);
      h.ref.hp += amount;
      record.landed = true;
      this._float(h.x, h.y - 18, `${item ? "" : "SECOND WIND "}+${Math.round(amount)}`, "#39FF14");
      this.effects.push({ x: h.x, y: h.y, r: 20, life: 0.4, color: "#39FF14", ring: true });
    } else {
      const target = [h.currentTarget, ...this.active].find((e) => e && e.hp > 0 && !e._dead);
      if (target && this.rng() < this.clutchCritChance(h)) {
        const sourceId = "H" + h.i;
        const damage = target.boss ? target.maxHp * CLUTCH.bossDamage : target.hp;
        target.hp = Math.max(0, target.hp - damage);
        target.dmgBy[sourceId] = (target.dmgBy[sourceId] || 0) + damage;
        this._tally(h, "damage", damage);
        record.landed = true;
        this._float(target.x, target.y - 26, `ULTRA CRIT ${Math.round(damage)}`, "#FFE600");
        this.effects.push({ kind: "impact", x: target.x, y: target.y, r: 40, life: 0.6, color: "#FFE600" });
        if (target.hp <= 0) this._killEnemy(target, sourceId);
      } else {
        this._float(h.x, h.y - 18, "MISSED", "#94A3B8");
      }
    }
    this.clutches.push(record);
    this._log("death", `Clutch: ${this._name(h)} ${record.choice === "drink" ? "drinks" : record.landed ? "lands an Ultra Crit" : "goes for the Ultra Crit and misses"}`);
    return true;
  },
};
