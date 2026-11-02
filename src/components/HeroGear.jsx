import { useState } from "react";
import {
  CONSUMABLE_KEYS, CONSUMABLES, GEAR_SETS, GEAR_SLOT_LABELS, GEAR_SLOTS, GEAR_STAT_LABELS, QUICK_SLOT_COUNT, SPECIAL_STAT_KEYS,
  SUPPLY_STYLES,
  activeSetBonuses, crystalFits, crystalInfo, heroGearStats, heroUsesArrows, itemSockets,
} from "../combat/gear";
import {
  EXTRACT_COST, MAX_UPGRADE, formatGearStats, formatStatValue, gearStatDelta, heroCombatSummary, reforgeCost, upgradeCost,
} from "../game/items";
import { heroQualities } from "../combat/traits";
import { fitTag, rankForSlot } from "../game/armory";
import { MAX_NAME_LENGTH, cleanHeroName } from "../game/guild";
import FamiliarPanel from "./FamiliarPanel";
import ItemDetails from "./ItemDetails";
import { NeonButton } from "./ui";

function DeltaText({ delta }) {
  const keys = Object.keys(delta);
  if (keys.length === 0) return <span className="text-slate-500">no change</span>;
  return keys.map((key) => {
    const value = delta[key];
    return (
      <span key={key} className={`mr-1.5 ${value > 0 ? "text-emerald-300" : "text-red-300"}`}>
        {GEAR_STAT_LABELS[key]} {value > 0 ? "+" : "-"}{formatStatValue(key, Math.abs(value))}
      </span>
    );
  });
}

const FIT_COLORS = { upgrade: "#39FF14", same: "#94A3B8", worse: "#F87171" };

// How well a vault piece suits this hero, from their weapon's needs.
function FitTag({ hero, item }) {
  const tag = fitTag(hero, item);
  if (!tag) return <div className="text-[10px] text-slate-500">Not their weapon type</div>;
  return <div className="text-[10px] font-bold" style={{ color: FIT_COLORS[tag.kind] }} data-testid={`fit-${item.id}`}>{tag.text}</div>;
}

// Who the hero is: the quality they were born with and the ones their
// career has given them, with the story behind each. Never the counters.
function Qualities({ hero }) {
  const stories = Object.fromEntries((hero.qualityLog || []).map((entry) => [entry.key, entry]));
  return (
    <div className="font-mono-g text-[11px]" data-testid="qualities">
      {heroQualities(hero).map((quality, index) => (
        <div key={quality.key}>
          <p className={quality.kind === "evolved" ? "text-amber-300" : "text-yellow-300"}>
            {quality.name}: <span className="text-slate-300">{quality.desc}</span>
          </p>
          <p className="text-[10px] italic text-slate-500">
            {stories[quality.key]
              ? `${storyLine(stories[quality.key], hero)} (level ${stories[quality.key].level})`
              : index === 0 ? "Born with it." : ""}
          </p>
        </div>
      ))}
      {hero.progression.level < 16 && (
        <p className="text-[10px] text-slate-500">Veterans develop new qualities from how they fight and travel.</p>
      )}
    </div>
  );
}

const storyLine = (entry, hero) => entry.text.replace(/^NEW QUALITY: [^.]+\. /, "").replace(`${hero.identity.name} has grown into a `, "Grew into a ");

// The sockets of an equipped item: infuse a crystal you own into an empty
// one, or pull one back out for a little gold.
function Sockets({ item, crystals, gold, onInfuse, onExtract }) {
  const sockets = itemSockets(item);
  if (!sockets) return <p className="mt-1 text-[10px] text-slate-500">No sockets. Uncommon and better gear has them.</p>;
  const owned = Object.entries(crystals).filter(([id, count]) => count > 0 && crystalFits(item, crystalInfo(id)))
    .map(([id, count]) => ({ ...crystalInfo(id), count }));
  return (
    <div className="mt-1 space-y-1 border-t border-white/10 pt-1" data-testid="sockets">
      {Array.from({ length: sockets }, (_, index) => {
        const crystal = crystalInfo(item.runes?.[index]);
        if (crystal) {
          return (
            <div key={index} className="flex items-center justify-between gap-2">
              <span style={{ color: crystal.color }}>◆ {crystal.fullName}: {crystal.desc}</span>
              <NeonButton color="#94A3B8" disabled={gold < EXTRACT_COST * crystal.tier} onClick={() => onExtract(item.id, index)} data-testid={`extract-${index}`}>
                Extract {EXTRACT_COST * crystal.tier}g
              </NeonButton>
            </div>
          );
        }
        return (
          <div key={index} className="flex flex-wrap items-center gap-1">
            <span className="text-slate-500">◇ Empty socket</span>
            {owned.length === 0 && <span className="text-slate-600">· no {item.slot === "weapon" ? "weapon" : "armor"} crystals (Market)</span>}
            {owned.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="rounded border px-1.5 py-0.5"
                style={{ borderColor: entry.color, color: entry.color }}
                onClick={() => onInfuse(item.id, entry.id)}
                data-testid={`infuse-${entry.id}`}
              >
                {entry.fullName.replace(" Crystal", "")} ×{entry.count}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// The hero's gear specials (resistances, lifesteal, ...) and active set bonuses.
function GearSpecials({ hero }) {
  const gear = heroGearStats(hero);
  const specials = Object.fromEntries(SPECIAL_STAT_KEYS.filter((key) => gear[key]).map((key) => [key, Math.round(gear[key] * 100) / 100]));
  const sets = activeSetBonuses(hero);
  if (!Object.keys(specials).length && !sets.length) return null;
  return (
    <div className="font-mono-g text-[10px]" data-testid="gear-specials">
      {Object.keys(specials).length > 0 && <p className="text-cyan-200">{formatGearStats(specials)}</p>}
      {sets.map((bonus) => (
        <p key={`${bonus.set}-${bonus.pieces}`} style={{ color: GEAR_SETS[bonus.set].color }}>
          {GEAR_SETS[bonus.set].name} ({bonus.pieces}): {formatGearStats(bonus.stats)}
        </p>
      ))}
    </div>
  );
}

// Per-hero gear sheet: seven gear slots plus two consumable quick slots.
export default function HeroGear({
  hero, vault, stash, gold, essence = 0, locked, onEquip, onUnequip, onLoadQuick, onUnloadQuick, onUpgrade, onReforge, onRename,
  onSupplyStyle, crystals = {}, onInfuse, onExtract, kennel = [], onAssignPet, onUnassignPet, onChoosePetMod, onEquipBest, onClose,
}) {
  const [picking, setPicking] = useState(null); // { type: "gear", slot } | { type: "quick", index }
  const [renaming, setRenaming] = useState(null); // draft name while editing
  const summary = heroCombatSummary(hero);
  const equipment = hero.equipment || {};
  const quickSlots = hero.quickSlots || [];
  // Best fit for this hero first, each tagged Upgrade, About the same or Worse.
  const candidates = picking?.type === "gear" ? rankForSlot(hero, vault, picking.slot).map(({ item }) => item) : [];
  // Slots the vault could improve (not how many pieces would).
  const upgrades = locked ? 0 : new Set(vault.filter((item) => fitTag(hero, item)?.kind === "upgrade").map((item) => item.slot)).size;

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
            <Qualities hero={hero} />
            <p className="font-mono-g text-[11px] text-slate-300">
              ATK {summary.attack} · DEF {summary.defense} · HP {summary.maxHp} · DODGE {Math.round(summary.dodge * 100)}% · CRIT {Math.round(summary.critChance * 100)}%
            </p>
            <GearSpecials hero={hero} />
          </div>
          <NeonButton onClick={onClose} data-testid="gear-close">Close</NeonButton>
        </header>

        {locked && (
          <p className="mt-2 font-mono-g text-[11px] text-yellow-300">This hero is on an expedition. Gear can be changed once they are home.</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-cyan-200">GEAR</h3>
          {onEquipBest && (
            <NeonButton color="#39FF14" disabled={!upgrades} onClick={() => { onEquipBest(); setPicking(null); }} data-testid="equip-best">
              {upgrades ? `Equip best (${upgrades} slot${upgrades === 1 ? "" : "s"})` : "Wearing the best"}
            </NeonButton>
          )}
        </div>
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
                {item ? <ItemDetails item={item} /> : <div className="text-slate-600">Empty</div>}
              </button>
            );
          })}
        </div>

        <h3 className="mt-3 font-display text-sm font-bold text-cyan-200">FAMILIAR</h3>
        <FamiliarPanel
          hero={hero}
          kennel={kennel}
          locked={locked}
          onAssign={onAssignPet}
          onUnassign={onUnassignPet}
          onChooseMod={onChoosePetMod}
        />

        <h3 className="mt-3 font-display text-sm font-bold text-cyan-200">QUICK SLOTS</h3>
        {heroUsesArrows(hero) && (
          <p className="font-mono-g text-[10px] text-slate-400">
            Bows fire arrows from the quick slots. With no arrows loaded, plain arrows are packed into a free slot at departure.
          </p>
        )}
        <div className="mt-1 font-mono-g text-[10px]" data-testid="supply-style">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-slate-400">Heals:</span>
            {Object.values(SUPPLY_STYLES).map((style) => (
              <button
                key={style.key}
                type="button"
                onClick={() => onSupplyStyle({ style: style.key })}
                className={`rounded border px-1.5 py-0.5 ${(hero.supplyStyle || "balanced") === style.key ? "border-cyan-300 text-cyan-200" : "border-white/15 text-slate-400"}`}
                data-testid={`supply-${style.key}`}
              >
                {style.name}
              </button>
            ))}
            <label className="ml-1 flex items-center gap-1 text-slate-300">
              <input type="checkbox" checked={!!hero.savePotions} onChange={(event) => onSupplyStyle({ savePotions: event.target.checked })} data-testid="save-potions" />
              Save potions for bosses
            </label>
          </div>
          <p className="text-slate-500">{(SUPPLY_STYLES[hero.supplyStyle] || SUPPLY_STYLES.balanced).desc}</p>
        </div>
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
                  <>
                    <span className="font-bold" style={{ color: item.color }}>{item.name} ×{entry.qty}</span>
                    {entry.qty === 0 && <div className="text-[10px] text-slate-500">Refills from the stash at departure</div>}
                  </>
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
                <div className="flex flex-wrap justify-end gap-1">
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
                  {reforgeCost(equipment[picking.slot]) && (
                    <NeonButton
                      color="#E879F9"
                      disabled={essence < reforgeCost(equipment[picking.slot]).essence || gold < reforgeCost(equipment[picking.slot]).gold}
                      onClick={() => onReforge(equipment[picking.slot].id)}
                      data-testid="gear-reforge"
                    >
                      Reforge {reforgeCost(equipment[picking.slot]).essence}✦ {reforgeCost(equipment[picking.slot]).gold}g
                    </NeonButton>
                  )}
                  <NeonButton color="#94A3B8" onClick={() => { onUnequip(picking.slot); setPicking(null); }}>Unequip</NeonButton>
                </div>
              )}
            </div>
            {equipment[picking.slot] && (
              <Sockets item={equipment[picking.slot]} crystals={crystals} gold={gold} onInfuse={onInfuse} onExtract={onExtract} />
            )}
            {candidates.length === 0 && <p className="text-slate-500">No {GEAR_SLOT_LABELS[picking.slot].toLowerCase()} gear in the vault.</p>}
            <ul className="space-y-1">
              {candidates.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                  <div className="min-w-0">
                    <ItemDetails item={item} />
                    <FitTag hero={hero} item={item} />
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
