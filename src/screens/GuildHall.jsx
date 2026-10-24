import HeroRow from "../components/HeroRow";
import { NeonButton, Panel } from "../components/ui";
import { CONSUMABLE_KEYS, CONSUMABLES, GEAR_SLOT_LABELS } from "../combat/gear";
import { heroStatus, recruitCost } from "../game/guild";
import { RARITIES, RARITY_ORDER, formatGearStats } from "../game/items";

const byRarityThenSlot = (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity)
  || (b.tier || 1) - (a.tier || 1) || a.slot.localeCompare(b.slot);

export default function GuildHall({ guild, now, onRecruit, onOpenPerks, onOpenGear, onSell, onBuy }) {
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
          {guild.heroes.map((hero) => (
            <HeroRow
              key={hero.identity.id}
              hero={hero}
              now={now}
              status={heroStatus(guild, hero, now)}
              injuredUntil={guild.injuries[hero.identity.id]}
              actions={(
                <div className="flex flex-col gap-1">
                  <NeonButton color="#39FF14" onClick={() => onOpenGear(hero.identity.id)} data-testid={`gear-${hero.identity.id}`}>
                    Gear
                  </NeonButton>
                  <NeonButton color="#A855F7" onClick={() => onOpenPerks(hero.identity.id)}>
                    Perks
                  </NeonButton>
                </div>
              )}
            />
          ))}
        </div>
        <p className="mt-2 font-mono-g text-[10px] text-slate-500">
          Heroes resting at the guild recover HP over time. Injured heroes cannot travel until they heal.
        </p>
      </Panel>

      <Panel data-testid="supplies">
        <h2 className="mb-1 font-display text-base font-bold text-cyan-200">SUPPLIES</h2>
        <p className="mb-2 font-mono-g text-[10px] text-slate-500">
          Load supplies into a hero&apos;s quick slots from the Gear screen. Heroes use them on their own in battle.
        </p>
        <ul className="space-y-1.5 font-mono-g text-[11px]">
          {CONSUMABLE_KEYS.map((key) => {
            const item = CONSUMABLES[key];
            return (
              <li key={key} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                <div className="min-w-0">
                  <span className="font-bold" style={{ color: item.color }}>{item.name}</span>
                  <span className="ml-2 text-slate-300">×{guild.stash[key] || 0}</span>
                  <div className="text-[10px] text-slate-500">{item.desc}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <NeonButton color="#FFE600" disabled={guild.gold < item.price} onClick={() => onBuy(key, 1)} data-testid={`buy-${key}`}>
                    {item.price}g
                  </NeonButton>
                  <NeonButton color="#FFE600" disabled={guild.gold < item.price * 5} onClick={() => onBuy(key, 5)}>
                    ×5
                  </NeonButton>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel data-testid="vault">
        <h2 className="mb-1 font-display text-base font-bold text-cyan-200">VAULT · {vault.length}</h2>
        {vault.length === 0 ? (
          <p className="font-mono-g text-[11px] text-slate-400">No spare gear yet. Enemies drop gear on expeditions; elites and bosses drop the best.</p>
        ) : (
          <ul className="space-y-1 font-mono-g text-[11px]">
            {vault.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
                <div className="min-w-0">
                  <span className="font-bold" style={{ color: (RARITIES[item.rarity] || RARITIES.common).color }}>{item.name}</span>
                  <span className="ml-2 text-slate-500">{GEAR_SLOT_LABELS[item.slot]} · T{item.tier}</span>
                  <div className="text-slate-400">{formatGearStats(item.stats)}</div>
                </div>
                <NeonButton color="#94A3B8" onClick={() => onSell(item.id)} data-testid={`sell-${item.id}`}>Sell {item.value}g</NeonButton>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
