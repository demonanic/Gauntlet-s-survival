import { useState } from "react";
import HeroRow from "../components/HeroRow";
import { NeonButton, Panel } from "../components/ui";
import { heroStatus, MAX_PARTY_SIZE } from "../game/guild";
import { REGIONS } from "../game/regions";

export default function ExpeditionBoard({ guild, now, onLaunch }) {
  const [regionId, setRegionId] = useState(REGIONS[0].id);
  const [party, setParty] = useState([]);
  const busy = !!guild.expedition;
  const ready = guild.heroes.filter((hero) => heroStatus(guild, hero, now) === "ready" && hero.combat.hp > 0);
  const selected = party.filter((id) => ready.some((hero) => hero.identity.id === id));
  const partyLevel = Math.max(0, ...selected.map((id) => guild.heroes.find((hero) => hero.identity.id === id).progression.level));
  const region = REGIONS.find((entry) => entry.id === regionId);

  const toggle = (id) => setParty((current) => current.includes(id)
    ? current.filter((entry) => entry !== id)
    : current.length < MAX_PARTY_SIZE ? [...current, id] : current);

  return (
    <div className="space-y-3">
      <Panel>
        <h2 className="mb-2 font-display text-base font-bold text-cyan-200">DESTINATIONS</h2>
        <div className="space-y-2">
          {REGIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setRegionId(entry.id)}
              className={`w-full rounded border p-2 text-left ${entry.id === regionId ? "bg-white/5" : "border-white/10"}`}
              style={entry.id === regionId ? { borderColor: entry.color } : undefined}
              data-testid={`region-${entry.id}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display text-sm font-bold" style={{ color: entry.color }}>{entry.name}</span>
                <span className="font-mono-g text-[10px] text-slate-400">
                  {entry.encounters.length} encounters · LV {entry.minLevel}+ · {entry.completionGold}g bounty
                </span>
              </div>
              <p className="font-mono-g text-[11px] text-slate-400">{entry.blurb}</p>
              {guild.clears[entry.id] > 0 && (
                <p className="font-mono-g text-[10px] text-emerald-300">Cleared ×{guild.clears[entry.id]}</p>
              )}
            </button>
          ))}
        </div>
      </Panel>
      <Panel>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-cyan-200">PARTY · {selected.length}/{MAX_PARTY_SIZE}</h2>
          <NeonButton
            color={region.color}
            disabled={busy || selected.length === 0 || partyLevel < region.minLevel}
            onClick={() => { onLaunch(region.id, selected); setParty([]); }}
            data-testid="launch-expedition"
          >
            Send party
          </NeonButton>
        </div>
        {busy && <p className="mb-2 font-mono-g text-[11px] text-yellow-300">A party is already out. Only one expedition at a time.</p>}
        {!busy && selected.length > 0 && partyLevel < region.minLevel && (
          <p className="mb-2 font-mono-g text-[11px] text-red-300">{region.name} needs a hero of level {region.minLevel}+.</p>
        )}
        <div className="space-y-2">
          {ready.length === 0 && <p className="font-mono-g text-[11px] text-slate-400">No heroes ready to travel.</p>}
          {ready.map((hero) => (
            <HeroRow
              key={hero.identity.id}
              hero={hero}
              now={now}
              status="ready"
              selected={selected.includes(hero.identity.id)}
              onSelect={() => toggle(hero.identity.id)}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
