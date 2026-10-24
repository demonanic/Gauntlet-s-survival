import { NeonButton, Panel, formatSeconds } from "../components/ui";
import { CONSUMABLE_KEYS, CONSUMABLES, GEAR_SLOT_LABELS } from "../combat/gear";
import { RARITIES, formatGearStats } from "../game/items";
import { shopStock } from "../game/shop";

function ShopItem({ item, gold, onBuy }) {
  const rarity = RARITIES[item.rarity] || RARITIES.common;
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded border p-2 ${item.featured ? "border-yellow-300/60 bg-yellow-300/5" : "border-white/10"}`}
      data-testid={item.featured ? "shop-featured" : "shop-item"}
    >
      <div className="min-w-0">
        {item.featured && <div className="text-[10px] font-bold uppercase tracking-wide text-yellow-300">Featured</div>}
        <span className="font-bold" style={{ color: rarity.color }}>{item.name}</span>
        <span className="ml-2 text-slate-500">{GEAR_SLOT_LABELS[item.slot]} · T{item.tier}</span>
        <div className="text-slate-400">{formatGearStats(item.stats)}</div>
      </div>
      {item.sold ? (
        <span className="shrink-0 text-[10px] uppercase text-slate-500">Sold</span>
      ) : (
        <NeonButton color="#FFE600" disabled={gold < item.price} onClick={() => onBuy(item.id)} data-testid={`shop-buy-${item.id}`}>
          {item.price}g
        </NeonButton>
      )}
    </li>
  );
}

export default function Market({ guild, now, onBuyItem, onReroll, onBuySupply }) {
  const stock = shopStock(guild, now);
  return (
    <div className="space-y-3">
      <Panel data-testid="shop">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-cyan-200">ARMORY</h2>
          <NeonButton color="#A855F7" disabled={guild.gold < stock.rerollCost} onClick={onReroll} data-testid="shop-reroll">
            New stock · {stock.rerollCost}g
          </NeonButton>
        </div>
        <p className="mb-2 font-mono-g text-[10px] text-slate-500">
          Stock rotates in {formatSeconds(stock.endsAt - now)}. Gear is tier {stock.tier}, matching your progress; the featured
          Masterwork is one tier higher. Bought gear goes to the vault.
        </p>
        <ul className="space-y-1.5 font-mono-g text-[11px]">
          {[...stock.items].reverse().map((item) => (
            <ShopItem key={item.id} item={item} gold={guild.gold} onBuy={onBuyItem} />
          ))}
        </ul>
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
                  <NeonButton color="#FFE600" disabled={guild.gold < item.price} onClick={() => onBuySupply(key, 1)} data-testid={`buy-${key}`}>
                    {item.price}g
                  </NeonButton>
                  <NeonButton color="#FFE600" disabled={guild.gold < item.price * 5} onClick={() => onBuySupply(key, 5)}>
                    ×5
                  </NeonButton>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
