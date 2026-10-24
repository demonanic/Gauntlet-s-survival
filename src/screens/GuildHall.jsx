import HeroRow from "../components/HeroRow";
import { NeonButton, Panel } from "../components/ui";
import { heroStatus, recruitCost } from "../game/guild";

export default function GuildHall({ guild, now, onRecruit, onOpenPerks }) {
  const cost = recruitCost(guild);
  return (
    <div className="space-y-3">
      <Panel>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-cyan-200">ROSTER</h2>
          <NeonButton color="#FFE600" disabled={guild.gold < cost} onClick={onRecruit} data-testid="recruit">
            Recruit · {cost}g
          </NeonButton>
        </div>
        <div className="space-y-2">
          {guild.heroes.map((hero) => (
            <HeroRow
              key={hero.identity.id}
              hero={hero}
              now={now}
              status={heroStatus(guild, hero, now)}
              injuredUntil={guild.injuries[hero.identity.id]}
              actions={(
                <NeonButton color="#A855F7" onClick={() => onOpenPerks(hero.identity.id)}>
                  Perks
                </NeonButton>
              )}
            />
          ))}
        </div>
        <p className="mt-2 font-mono-g text-[10px] text-slate-500">
          Heroes resting at the guild recover HP over time. Injured heroes cannot travel until they heal.
        </p>
      </Panel>
      <Panel>
        <h2 className="mb-1 font-display text-base font-bold text-cyan-200">VAULT</h2>
        {guild.vault.length === 0 ? (
          <p className="font-mono-g text-[11px] text-slate-400">No equipment yet. Enemies sometimes drop gear on expeditions.</p>
        ) : (
          <ul className="space-y-1 font-mono-g text-[11px]">
            {guild.vault.map((item, index) => (
              <li key={item.id || index} className="flex justify-between border-b border-white/5 pb-1">
                <span>{item.name || item.type || "Item"}</span>
                <span className="text-slate-400">{item.rarity || ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
