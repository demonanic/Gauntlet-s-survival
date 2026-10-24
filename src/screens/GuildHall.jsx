import HallOfLegends from "../components/HallOfLegends";
import HeroRow from "../components/HeroRow";
import { NeonButton, Panel } from "../components/ui";
import { GEAR_SLOT_LABELS } from "../combat/gear";
import { heroStatus, recruitCost, treatmentCost } from "../game/guild";
import { canRetire } from "../game/legacy";
import { MAX_UPGRADE, RARITIES, RARITY_ORDER, formatGearStats, itemLabel, upgradeCost } from "../game/items";

const byRarityThenSlot = (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity)
  || (b.tier || 1) - (a.tier || 1) || a.slot.localeCompare(b.slot);

export default function GuildHall({
  guild, now, onRecruit, onOpenPerks, onOpenGear, onSell, onUpgrade, onTreat, onRetire, onBuyLegacy,
}) {
  const cost = recruitCost(guild);
  const vault = [...guild.vault].sort(byRarityThenSlot);
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
          {guild.heroes.map((hero) => {
            const status = heroStatus(guild, hero, now);
            const treatCost = status === "injured" ? treatmentCost(guild, hero.identity.id, now) : 0;
            return (
              <HeroRow
                key={hero.identity.id}
                hero={hero}
                now={now}
                status={status}
                injuredUntil={guild.injuries[hero.identity.id]}
                actions={(
                  <div className="flex flex-col gap-1">
                    {treatCost > 0 && (
                      <NeonButton color="#FF2A5F" disabled={guild.gold < treatCost} onClick={() => onTreat(hero.identity.id)} data-testid={`treat-${hero.identity.id}`}>
                        Treat {treatCost}g
                      </NeonButton>
                    )}
                    <NeonButton color="#39FF14" onClick={() => onOpenGear(hero.identity.id)} data-testid={`gear-${hero.identity.id}`}>
                      Gear
                    </NeonButton>
                    <NeonButton color="#A855F7" onClick={() => onOpenPerks(hero.identity.id)}>
                      Perks
                    </NeonButton>
                    {!canRetire(guild, hero) && (
                      <NeonButton color="#E879F9" onClick={() => onRetire(hero.identity.id)} data-testid={`retire-${hero.identity.id}`}>
                        Retire
                      </NeonButton>
                    )}
                  </div>
                )}
              />
            );
          })}
        </div>
        <p className="mt-2 font-mono-g text-[10px] text-slate-500">
          Heroes resting at the guild recover HP over time. Injured heroes cannot travel until they heal, or
          the Infirmary treats them for gold.
        </p>
      </Panel>

      <Panel data-testid="vault">
        <h2 className="mb-1 font-display text-base font-bold text-cyan-200">VAULT · {vault.length}</h2>
        <p className="mb-2 font-mono-g text-[10px] text-slate-500">
          The Forge upgrades gear up to +{MAX_UPGRADE}; each level adds 15% of its base stats. Equipped gear can be
          upgraded from the hero&apos;s Gear screen.
        </p>
        {vault.length === 0 ? (
          <p className="font-mono-g text-[11px] text-slate-400">No spare gear yet. Enemies drop gear on expeditions; elites and bosses drop the best.</p>
        ) : (
          <ul className="space-y-1 font-mono-g text-[11px]">
            {vault.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                <div className="min-w-0">
                  <span className="font-bold" style={{ color: (RARITIES[item.rarity] || RARITIES.common).color }}>{itemLabel(item)}</span>
                  <span className="ml-2 text-slate-500">{GEAR_SLOT_LABELS[item.slot]} · T{item.tier}</span>
                  <div className="text-slate-400">{formatGearStats(item.stats)}</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {(item.upgrade || 0) < MAX_UPGRADE && (
                    <NeonButton color="#FF6600" disabled={guild.gold < upgradeCost(item)} onClick={() => onUpgrade(item.id)} data-testid={`upgrade-${item.id}`}>
                      Forge {upgradeCost(item)}g
                    </NeonButton>
                  )}
                  <NeonButton color="#94A3B8" onClick={() => onSell(item.id)} data-testid={`sell-${item.id}`}>Sell {item.value}g</NeonButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <HallOfLegends guild={guild} onBuy={onBuyLegacy} />
    </div>
  );
}
