import { useState } from "react";
import { MAX_GEAR_TIER, RARITY_ORDER, RARITIES } from "../game/items";
import {
  MAX_HERO_LEVEL, debugAddGold, debugAddRenown, debugClearRegions, debugGiveGearSet, debugGiveSupplies,
  debugSetBossRank, debugSetLevels, debugSkipTimers,
} from "../game/debug";
import { NeonButton } from "./ui";

const selectClass = "rounded border border-white/15 bg-black/60 px-1 py-1 font-mono-g text-[11px] text-slate-100";

// Test mode tools, shown only when the page is opened with ?debug.
// `apply(mutator)` is App's guarded state update.
export default function DebugPanel({ guild, apply }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(10);
  const [rank, setRank] = useState(guild.bossRank || 0);
  const [rarity, setRarity] = useState("rare");
  const [tier, setTier] = useState(3);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-[95] rounded-full border border-orange-400 bg-black/80 px-3 py-2 font-mono-g text-[11px] font-bold text-orange-300 shadow-lg"
        data-testid="debug-open"
      >
        TEST
      </button>
    );
  }

  const row = "flex flex-wrap items-center gap-1.5";
  return (
    <div className="fixed inset-x-2 bottom-2 z-[95] mx-auto max-h-[70vh] max-w-md overflow-y-auto rounded-lg border border-orange-400/70 bg-[#0b0906]/95 p-3 font-mono-g text-[11px] text-slate-200 shadow-2xl" data-testid="debug-panel">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-sm font-bold text-orange-300">TEST MODE</span>
        <button type="button" className="text-slate-400 underline" onClick={() => setOpen(false)}>close</button>
      </div>
      <div className="space-y-2">
        <div className={row}>
          <NeonButton color="#FFE600" onClick={() => apply((state) => debugAddGold(state, 1000))} data-testid="debug-gold">+1k gold</NeonButton>
          <NeonButton color="#FFE600" onClick={() => apply((state) => debugAddGold(state, 10000))}>+10k gold</NeonButton>
          <NeonButton color="#E879F9" onClick={() => apply((state) => debugAddRenown(state, 10))}>+10 renown</NeonButton>
        </div>
        <div className={row}>
          <NeonButton color="#39FF14" onClick={() => apply((state) => debugSkipTimers(state, Date.now()))} data-testid="debug-skip">
            Skip timers + heal
          </NeonButton>
          <NeonButton color="#00F3FF" onClick={() => apply((state) => debugGiveSupplies(state))}>+10 each supply</NeonButton>
        </div>
        <div className={row}>
          <span>All heroes to LV</span>
          <select className={selectClass} value={level} onChange={(event) => setLevel(Number(event.target.value))}>
            {[3, 6, 10, 15, MAX_HERO_LEVEL].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <NeonButton color="#A855F7" onClick={() => apply((state) => debugSetLevels(state, level))} data-testid="debug-level">Set</NeonButton>
        </div>
        <div className={row}>
          <span>Boss rank</span>
          <input
            type="number" min={1} value={rank + 1}
            onChange={(event) => setRank(Math.max(0, Number(event.target.value) - 1))}
            className={`${selectClass} w-16`}
          />
          <NeonButton color="#FF0055" onClick={() => apply((state) => debugSetBossRank(state, rank))}>Set</NeonButton>
          <NeonButton color="#FF3366" onClick={() => apply(debugClearRegions)}>Clear all regions</NeonButton>
        </div>
        <div className={row}>
          <span>Gear set</span>
          <select className={selectClass} value={rarity} onChange={(event) => setRarity(event.target.value)}>
            {RARITY_ORDER.map((key) => <option key={key} value={key}>{RARITIES[key].name}</option>)}
          </select>
          <span>tier</span>
          <select className={selectClass} value={tier} onChange={(event) => setTier(Number(event.target.value))}>
            {Array.from({ length: MAX_GEAR_TIER }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <NeonButton color="#FF6600" onClick={() => apply((state) => debugGiveGearSet(state, rarity, tier))} data-testid="debug-gear">To vault</NeonButton>
        </div>
        <p className="text-[10px] text-slate-500">
          Battles get 4× and 8× speed in test mode. Gold, levels and gear made here are real save data; use Reset save to start clean.
        </p>
      </div>
    </div>
  );
}
