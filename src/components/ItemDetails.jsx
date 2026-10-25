import { GEAR_SETS, GEAR_SLOT_LABELS, WEAPON_PROFILES } from "../combat/gear";
import { LEGENDARIES, RARITIES, formatGearStats, itemLabel } from "../game/items";

// One gear item: name in its rarity color, slot and tier, stats, and what
// makes it special (its set, or its legendary power).
export default function ItemDetails({ item, showSlot = false }) {
  const rarity = RARITIES[item.rarity] || RARITIES.common;
  const weapon = WEAPON_PROFILES[item.weaponType];
  const set = GEAR_SETS[item.set];
  const legendary = LEGENDARIES[item.legendary];
  return (
    <div className="min-w-0">
      <span className="font-bold" style={{ color: rarity.color }}>{itemLabel(item)}</span>
      <span className="ml-1.5 text-slate-500">
        {showSlot ? `${GEAR_SLOT_LABELS[item.slot]} · ` : ""}{weapon ? `${weapon.label} (${weapon.style}) · ` : ""}T{item.tier}
      </span>
      <div className="text-slate-400">{formatGearStats(item.stats)}</div>
      {legendary && <div className="text-[10px] text-orange-300">{legendary.power}</div>}
      {set && (
        <div className="text-[10px]" style={{ color: set.color }}>
          {set.name} set · 2: {formatGearStats(set.bonuses[2])} · 4: {formatGearStats(set.bonuses[4])}
        </div>
      )}
    </div>
  );
}
