import { useState } from "react";
import { CONSUMABLE_KEYS, CONSUMABLES, GEAR_SLOT_LABELS, GEAR_SLOTS, GEAR_STAT_LABELS, QUICK_SLOT_COUNT } from "../combat/gear";
import {
  MAX_UPGRADE, RARITIES, formatGearStats, gearStatDelta, heroCombatSummary, itemLabel, upgradeCost,
} from "../game/items";
import { TRAITS } from "../combat/traits";
import { MAX_NAME_LENGTH, cleanHeroName } from "../game/guild";
import { NeonButton } from "./ui";

function DeltaText({ delta }) {
  const keys = Object.keys(delta);
  if (keys.length === 0) return <span className="text-slate-500">no change</span>;
  return keys.map((key) => {
    const value = delta[key];
    const shown = key === "critChance" ? `${Math.round(value * 100)}%` : value;
    return (
      <span key={key} className={`mr-1.5 ${value > 0 ? "text-emerald-300" : "text-red-300"}`}>
        {GEAR_STAT_LABELS[key]} {value > 0 ? "+" : ""}{shown}
      </span>
    );
  });
}

function ItemName({ item }) {
  const rarity = RARITIES[item.rarity] || RARITIES.common;
  return (
    <span className="font-bold" style={{ color: rarity.color }}>
      {itemLabel(item)} <span className="font-normal text-slate-500">T{item.tier}</span>
    </span>
  );
}

// Per-hero gear sheet: seven gear slots plus two consumable quick slots.
export default function HeroGear({
  hero, vault, stash, gold, locked, onEquip, onUnequip, onLoadQuick, onUnloadQuick, onUpgrade, onRename, onClose,
}) {
  const [picking, setPicking] = useState(null); // { type: "gear", slot } | { type: "quick", index }
  const [renaming, setRenaming] = useState(null); // draft name while editing
  const trait = TRAITS[hero.traits?.[0]];
  const summary = heroCombatSummary(hero);
  const equipment = hero.equipment || {};
  const quickSlots = hero.quickSlots || [];
  const candidates = picking?.type === "gear" ? vault.filter((item) => item.slot === picking.slot) : [];

  return (
    <div className="fixed inset-0 z-[75] overflow-y-auto bg-black/85 p-3" data-testid="hero-gear">
      <section className="mx-auto max-w-xl rounded-xl border border-cyan-400/40 bg-[#080b12] p-3 text-slate-100">
        <header className="flex items-center gap-3 border-b border-white/10 pb-3">
          <div className="min-w-0 flex-1">
            {renaming == null ? (
              <h2 className="flex items-baseline gap-2 font-display text-lg font-bold" style={{ color: hero.appearance?.identityColor }}>
                <span className="truncate">{hero.identity.name}</span>
                <button type="button" className="font-mono-g text-[10px] font-normal text-slate-400 underline" onClick={() => setRenaming(hero.identity.name)} data-testid="rename">
                  rename
                </button>
              </h2>
            ) : (
              <form
                className="flex gap-1"
                onSubmit={(event) => { event.preventDefault(); if (cleanHeroName(renaming)) { onRename(renaming); setRenaming(null); } }}
              >
                <input
                  autoFocus
                  value={renaming}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) => setRenaming(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 py-1 font-display text-sm outline-none focus:border-cyan-300"
                  data-testid="rename-input"
                />
                <NeonButton type="submit" color="#39FF14" disabled={!cleanHeroName(renaming)}>Save</NeonButton>
              </form>
            )}
            {trait && <p className="font-mono-g text-[11px] text-yellow-300">{trait.name}: <span className="text-slate-300">{trait.desc}</span></p>}
            <p className="font-mono-g text-[11px] text-slate-300">
              ATK {summary.attack} · DEF {summary.defense} · HP {summary.maxHp} · DODGE {Math.round(summary.dodge * 100)}% · CRIT {Math.round(summary.critChance * 100)}%
            </p>
          </div>
          <NeonButton onClick={onClose} data-testid="gear-close">Close</NeonButton>
        </header>

        {locked && (
          <p className="mt-2 font-mono-g text-[11px] text-yellow-300">This hero is on an expedition. Gear can be changed once they are home.</p>
        )}

        <h3 className="mt-3 font-display text-sm font-bold text-cyan-200">GEAR</h3>
        <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {GEAR_SLOTS.map((slot) => {
            const item = equipment[slot];
            const active = picking?.type === "gear" && picking.slot === slot;
            return (
              <button
                key={slot}
                type="button"
                disabled={locked}
                onClick={() => setPicking(active ? null : { type: "gear", slot })}
                className={`rounded border p-2 text-left font-mono-g text-[11px] disabled:opacity-60 ${active ? "border-cyan-300 bg-cyan-400/10" : "border-white/10"}`}
                data-testid={`gear-slot-${slot}`}
              >
                <div className="text-[10px] uppercase text-slate-500">{GEAR_SLOT_LABELS[slot]}</div>
                {item ? (
                  <>
                    <ItemName item={item} />
                    <div className="text-slate-400">{formatGearStats(item.stats)}</div>
                  </>
                ) : <div className="text-slate-600">Empty</div>}
              </button>
            );
          })}
        </div>

        <h3 className="mt-3 font-display text-sm font-bold text-cyan-200">QUICK SLOTS</h3>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {Array.from({ length: QUICK_SLOT_COUNT }, (_, index) => {
            const entry = quickSlots[index];
            const item = entry && CONSUMABLES[entry.key];
            const active = picking?.type === "quick" && picking.index === index;
            return (
              <button
                key={index}
                type="button"
                disabled={locked}
                onClick={() => setPicking(active ? null : { type: "quick", index })}
                className={`rounded border p-2 text-left font-mono-g text-[11px] disabled:opacity-60 ${active ? "border-cyan-300 bg-cyan-400/10" : "border-white/10"}`}
                data-testid={`quick-slot-${index}`}
              >
                <div className="text-[10px] uppercase text-slate-500">Quick {index + 1}</div>
                {item ? (
                  <span className="font-bold" style={{ color: item.color }}>{item.name} ×{entry.qty}</span>
                ) : <div className="text-slate-600">Empty</div>}
              </button>
            );
          })}
        </div>

        {picking?.type === "gear" && (
          <div className="mt-3 rounded border border-cyan-400/30 p-2 font-mono-g text-[11px]" data-testid="gear-picker">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-bold text-cyan-200">{GEAR_SLOT_LABELS[picking.slot]} · vault</span>
              {equipment[picking.slot] && (
                <div className="flex gap-1">
                  {(equipment[picking.slot].upgrade || 0) < MAX_UPGRADE && (
                    <NeonButton
                      color="#FF6600"
                      disabled={gold < upgradeCost(equipment[picking.slot])}
                      onClick={() => onUpgrade(equipment[picking.slot].id)}
                      data-testid="gear-forge"
                    >
                      Forge {upgradeCost(equipment[picking.slot])}g
                    </NeonButton>
                  )}
                  <NeonButton color="#94A3B8" onClick={() => { onUnequip(picking.slot); setPicking(null); }}>Unequip</NeonButton>
                </div>
              )}
            </div>
            {candidates.length === 0 && <p className="text-slate-500">No {GEAR_SLOT_LABELS[picking.slot].toLowerCase()} gear in the vault.</p>}
            <ul className="space-y-1">
              {candidates.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                  <div className="min-w-0">
                    <ItemName item={item} />
                    <div className="text-slate-400">{formatGearStats(item.stats)}</div>
                    <div className="text-[10px]"><DeltaText delta={gearStatDelta(item, equipment[picking.slot])} /></div>
                  </div>
                  <NeonButton color="#39FF14" onClick={() => { onEquip(item.id); setPicking(null); }} data-testid={`equip-${item.id}`}>Equip</NeonButton>
                </li>
              ))}
            </ul>
          </div>
        )}

        {picking?.type === "quick" && (
          <div className="mt-3 rounded border border-cyan-400/30 p-2 font-mono-g text-[11px]" data-testid="quick-picker">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-bold text-cyan-200">Quick {picking.index + 1} · stash</span>
              {quickSlots[picking.index] && (
                <NeonButton color="#94A3B8" onClick={() => { onUnloadQuick(picking.index); setPicking(null); }}>Empty slot</NeonButton>
              )}
            </div>
            <ul className="space-y-1">
              {CONSUMABLE_KEYS.map((key) => {
                const item = CONSUMABLES[key];
                const owned = stash[key] || 0;
                return (
                  <li key={key} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                    <div className="min-w-0">
                      <span className="font-bold" style={{ color: item.color }}>{item.name}</span>
                      <span className="ml-2 text-slate-400">{owned} in stash · stack {item.stackCap}</span>
                      <div className="text-[10px] text-slate-500">{item.desc}</div>
                    </div>
                    <NeonButton color={item.color} disabled={owned === 0} onClick={() => onLoadQuick(picking.index, key)} data-testid={`load-${key}`}>
                      Load
                    </NeonButton>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
