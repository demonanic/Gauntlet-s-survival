import { useState } from "react";
import HeroRow from "../components/HeroRow";
import { NeonButton, Panel } from "../components/ui";
import { heroStatus, MAX_PARTY_SIZE } from "../game/guild";
import * as C from "../combat/config";
import { GEAR_SETS, PROVISIONS, heroArrowCount, heroUsesArrows } from "../combat/gear";
import { getEnvironment, heroResistance } from "../game/environment";
import { REGIONS, bossForRank } from "../game/regions";

// Before sending a party: who will lack arrows, and how protected each hero is
// against the region's environment (provisions are packed automatically).
function PartyReadiness({ guild, region, heroIds }) {
  const heroes = heroIds.map((id) => guild.heroes.find((hero) => hero.identity.id === id)).filter(Boolean);
  const environment = getEnvironment(region);
  const provision = environment && PROVISIONS[environment.provision];
  let provisions = guild.stash[provision?.key] || 0;
  const archers = heroes.filter((hero) => heroUsesArrows(hero));
  const arrowsLeft = archers.length ? (guild.stash.arrows || 0) + archers.reduce((sum, hero) => sum + heroArrowCount(hero), 0) : 0;
  if (!heroes.length) return null;
  return (
    <div className="mb-2 space-y-0.5 font-mono-g text-[10px]" data-testid="party-readiness">
      {archers.length > 0 && arrowsLeft === 0 && (
        <p className="text-red-300">No arrows for {archers.map((hero) => hero.identity.name).join(", ")}. Bows can&apos;t shoot without them: buy some in the Market.</p>
      )}
      {environment && heroes.map((hero) => {
        const immune = heroResistance(hero, environment) >= 1;
        const packs = !immune && provisions > 0;
        if (packs) provisions -= 1;
        const resist = Math.round(heroResistance(hero, environment, packs) * 100);
        return (
          <p key={hero.identity.id} className={resist >= 50 ? "text-emerald-300" : resist > 0 ? "text-yellow-300" : "text-red-300"}>
            {hero.identity.name}: {resist}% {environment.name.toLowerCase()} resistance{packs ? ` (with a ${provision.name})` : ""}
          </p>
        );
      })}
    </div>
  );
}

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
                  {entry.endless
                    ? `Endless waves · LV ${entry.minLevel}+ · best wave ${guild.records?.riftBest || 0}`
                    : `${entry.durationMinutes} min · LV ${entry.minLevel}+ · ${entry.completionGold}g bounty`}
                </span>
              </div>
              <p className="font-mono-g text-[11px] text-slate-400">{entry.blurb}</p>
              {getEnvironment(entry) && (
                <p className="font-mono-g text-[10px]" style={{ color: getEnvironment(entry).color }} data-testid={`environment-${entry.id}`}>
                  {getEnvironment(entry).name}: {getEnvironment(entry).desc} Counter it with {PROVISIONS[getEnvironment(entry).provision].name}s
                  ({guild.stash[getEnvironment(entry).provision] || 0} in stash) or resistance gear.
                </p>
              )}
              {GEAR_SETS[entry.set] && (
                <p className="font-mono-g text-[10px]" style={{ color: GEAR_SETS[entry.set].color }}>Drops pieces of the {GEAR_SETS[entry.set].name} set.</p>
              )}
              {entry.boss && !entry.bossRotation && (
                <p className="font-mono-g text-[10px] text-red-300">Final boss: {C.ENEMIES[entry.boss[0]].name}</p>
              )}
              {entry.bossRotation && (
                <p className="font-mono-g text-[10px] text-red-300" data-testid="next-boss">
                  Final boss: {C.ENEMIES[bossForRank(guild.bossRank || 0)].name} · rank {(guild.bossRank || 0) + 1}
                </p>
              )}
              {guild.clears[entry.id] > 0 && (
                <p className="font-mono-g text-[10px] text-emerald-300">Cleared ×{guild.clears[entry.id]}</p>
              )}
            </button>
          ))}
        </div>
      </Panel>
      <Panel data-testid="party-panel">
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
        {!busy && selected.length > 0 && (
          <p className="mb-2 font-mono-g text-[10px] text-slate-400" data-testid="leader-note">
            The first hero you pick leads the party. Beat a boss for the first time with a level 10+ leader and a familiar may bond with them.
          </p>
        )}
        {!busy && <PartyReadiness guild={guild} region={region} heroIds={selected} />}
        <div className="space-y-2">
          {ready.length === 0 && <p className="font-mono-g text-[11px] text-slate-400">No heroes ready to travel.</p>}
          {ready.map((hero) => (
            <HeroRow
              key={hero.identity.id}
              hero={hero}
              guild={guild}
              now={now}
              status="ready"
              selected={selected.includes(hero.identity.id)}
              leader={selected[0] === hero.identity.id}
              onSelect={() => toggle(hero.identity.id)}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
