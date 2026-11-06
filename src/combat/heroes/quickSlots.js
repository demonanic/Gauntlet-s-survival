// Quick slots (Phase 8D, moved out of engine.js unchanged): what each slot
// can do now, using an item by hand, heroes using supplies on their own, and
// arrows (drawing one for a shot, and the shot's ammo bonus). They stay engine
// methods (engine.js mixes them in), since the battle screen and tests call
// them by name.
import { CONSUMABLES, QUICK_ITEM_COOLDOWN, healThreshold } from "../gear";

// Shots a bow gets out of one arrow (they are gathered and loosed again).
const ARROW_SHOTS = 4;

export const quickSlotMethods = {
  // ---------------- Gauntlet quick slots ----------------
  // Consumable stacks live on the hero model (h.model.quickSlots), which is the
  // disposable sim copy, so spent items flow back with the post-battle party.
  getHeroQuickSlots(index) {
    const h = this.heroes[index];
    if (!h) return [];
    const slots = Array.isArray(h.model.quickSlots) ? h.model.quickSlots : [];
    return slots.map((slot, i) => {
      const item = slot && CONSUMABLES[slot.key];
      if (!item || !(slot.qty > 0)) return { slot: i, empty: true };
      return {
        slot: i, key: item.key, name: item.name, short: item.short, color: item.color, desc: item.desc,
        qty: slot.qty, cooldown: h.quickCd,
        available: h.alive && h.quickCd <= 0 && !this.ended && this._quickItemUseful(h, item),
      };
    });
  },

  useQuickItem(index, slotIndex) {
    const h = this.heroes[index];
    const slot = h ? h.model.quickSlots?.[slotIndex] : null;
    const item = slot && CONSUMABLES[slot.key];
    if (!item || !(slot.qty > 0) || !h.alive || h.quickCd > 0 || this.ended || !this._quickItemUseful(h, item)) return false;
    slot.qty -= 1;
    h.quickCd = QUICK_ITEM_COOLDOWN;
    if (item.heal) this._tally(h, "heals", 1);
    if (item.heal) {
      const amount = Math.min(h.d.maxHp - h.ref.hp, h.d.maxHp * item.heal * (1 + (h.d.traits?.healBonus || 0)) * (1 - (h.d.env?.healCut || 0)));
      h.ref.hp += amount;
      this._float(h.x, h.y - 18, `+${Math.round(amount)}`, "#39FF14");
    }
    if (item.shots) {
      h.ammoShots = item.shots;
      h.ammoBonus = item.damageBonus;
      this._float(h.x, h.y - 18, "AMMO", item.color);
    }
    this.effects.push({ x: h.x, y: h.y, r: 16, life: 0.3, color: item.color, ring: true });
    return true;
  },

  _quickItemUseful(h, item) {
    if (item.arrow) return false; // arrows are drawn by the bow itself
    if (item.heal) return h.ref.hp < h.d.maxHp;
    if (item.shots) return !(h.ammoShots > 0);
    return false;
  },

  // Heroes use their own quick slots: heals below the item's HP threshold
  // (scaled by the hero's supply style), whetstones while an elite or boss is
  // on the field. A hero told to save potions for bosses keeps them until one shows up.
  _tickQuickItems(h, dt) {
    h.quickCd = Math.max(0, h.quickCd - dt);
    if (h.quickCd > 0) return;
    const slots = Array.isArray(h.model.quickSlots) ? h.model.quickSlots : [];
    const hpFraction = h.ref.hp / Math.max(1, h.d.maxHp);
    const eliteOnField = this.active.some((e) => e.hp > 0 && (e.boss || e.tier === "elite"));
    for (let i = 0; i < slots.length; i++) {
      const item = slots[i] && CONSUMABLES[slots[i].key];
      if (!item || !(slots[i].qty > 0)) continue;
      const saving = item.key === "potion" && h.model.savePotions && !eliteOnField;
      const wants = item.heal ? !saving && hpFraction < healThreshold(h.model, item) : !!item.autoVsElite && eliteOnField;
      if (wants && this.useQuickItem(h.i, i)) return;
    }
  },

  // The quick slot a bow hero draws arrows from: the first one holding any.
  _arrowSlot(h) {
    const slots = Array.isArray(h.model?.quickSlots) ? h.model.quickSlots : [];
    return slots.find((slot) => slot && CONSUMABLES[slot.key]?.arrow && slot.qty > 0) || null;
  },

  // Draw an arrow for a shot. Arrows are gathered and loosed again during a
  // fight, so only every ARROW_SHOTS-th shot spends one (and a quiver or
  // Whisperwind may save even that). Returns the arrow's on-hit effect, or
  // false when the quiver is empty.
  _drawArrow(h) {
    const slot = this._arrowSlot(h);
    if (!slot) return false;
    const item = CONSUMABLES[slot.key];
    h.arrowShots = (h.arrowShots || 0) + 1;
    if (h.arrowShots % ARROW_SHOTS === 0 && !(this.rng() < Math.min(0.75, h.d.gear?.arrowSaver || 0))) {
      slot.qty -= 1;
      h.model.arrowsSpent ||= {};
      h.model.arrowsSpent[slot.key] = (h.model.arrowsSpent[slot.key] || 0) + 1;
    }
    return item.effect || null;
  },

  _consumeAmmoShot(src, isHero) {
    if (!isHero || !(src.ammoShots > 0)) return 1;
    src.ammoShots -= 1;
    return 1 + (src.ammoBonus || 0);
  },
};
