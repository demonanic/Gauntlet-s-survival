import { Bar, NeonButton, Panel, formatSeconds } from "./ui";
import { getRegion } from "../game/regions";

const PHASE_LABEL = {
  traveling: "Traveling to the next encounter",
  ready: "Enemies sighted!",
  riftReady: "The Rift is open!",
  returning: "Heading home",
};

export default function ExpeditionPanel({ expedition, now, onFight, onRecall }) {
  const region = getRegion(expedition.regionId);
  const total = region.encounters.length;
  const cleared = Math.min(expedition.encounterIndex, total);
  const progress = region.endless
    ? `Endless${expedition.wavesCleared != null ? ` · ${expedition.wavesCleared} waves cleared` : ""}`
    : `${cleared}/${total} encounters cleared`;
  return (
    <Panel className="border-cyan-400/40" data-testid="expedition-panel">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold" style={{ color: region.color }}>{region.name}</h2>
        <span className="font-mono-g text-[10px] text-slate-400">{progress}</span>
      </div>
      {!region.endless && <Bar value={cleared} max={total} color={region.color} className="my-2" />}
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono-g text-[11px]">
          {PHASE_LABEL[region.endless && expedition.phase === "ready" ? "riftReady" : expedition.phase]}
          {expedition.phaseEndsAt != null && ` · ${formatSeconds(expedition.phaseEndsAt - now)}`}
          <span className="ml-2 text-yellow-300">{expedition.loot.gold}g · {expedition.loot.items.length} items</span>
        </p>
        <div className="flex gap-2">
          {expedition.phase === "ready" && (
            <NeonButton color="#FF2A5F" onClick={onFight} data-testid="fight">Fight!</NeonButton>
          )}
          {["traveling", "ready"].includes(expedition.phase) && (
            <NeonButton color="#94A3B8" onClick={onRecall}>Recall</NeonButton>
          )}
        </div>
      </div>
      <p className="mt-1 font-mono-g text-[10px] text-slate-500">{expedition.log[expedition.log.length - 1]}</p>
    </Panel>
  );
}
