import ItemDetails from "../components/ItemDetails";
import { NeonButton, Panel, formatSeconds } from "../components/ui";
import { CONSUMABLES, FLETCHING, PROVISIONS, PROVISION_KEYS } from "../combat/gear";
import { ENVIRONMENTS } from "../game/environment";
import { REGIONS } from "../game/regions";
import { shopStock } from "../game/shop";

// Bought directly; special arrows are made from plain ones at the Fletcher.
const SUPPLY_KEYS = ["bandage", "potion", "ammo", "arrows"];
const BULK = { arrows: [10, 50] };

function ShopItem({ item, gold, onBuy }) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded border p-2 ${item.featured ? "border-yellow-300/60 bg-yellow-300/5" : "border-white/10"}`}
      data-testid={item.featured ? "shop-featured" : "shop-item"}
    >
      <div className="min-w-0">
        {item.featured && <div className="text-[10px] font-bold uppercase tracking-wide text-yellow-300">Featured</div>}
        <ItemDetails item={item} showSlot />
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

function SupplyRow({ item, owned, gold, onBuy, amounts = [1, 5], testId }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
      <div className="min-w-0">
        <span className="font-bold" style={{ color: item.color }}>{item.name}</span>
        <span className="ml-2 text-slate-300">×{owned}</span>
        <div className="text-[10px] text-slate-500">{item.desc}</div>
      </div>
      <div className="flex shrink-0 gap-1">
        {amounts.map((amount, index) => (
          <NeonButton
            key={amount}
            color="#FFE600"
            disabled={gold < item.price * amount}
            onClick={() => onBuy(item.key, amount)}
            data-testid={index === 0 ? testId : undefined}
          >
            {index === 0 ? `${item.price * amount}g${amount > 1 ? ` ×${amount}` : ""}` : `×${amount}`}
          </NeonButton>
        ))}
      </div>
    </li>
  );
}

export default function Market({ guild, now, onBuyItem, onReroll, onBuySupply, onFletch }) {
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
          Load supplies into a hero&apos;s quick slots from the Gear screen. Heroes use them on their own in battle, and
          loaded slots refill from the stash every time a party sets out. Bows can&apos;t shoot without arrows.
        </p>
        <ul className="space-y-1.5 font-mono-g text-[11px]">
          {SUPPLY_KEYS.map((key) => (
            <SupplyRow
              key={key}
              item={CONSUMABLES[key]}
              owned={guild.stash[key] || 0}
              gold={guild.gold}
              onBuy={onBuySupply}
              amounts={BULK[key]}
              testId={`buy-${key}`}
            />
          ))}
        </ul>
      </Panel>

      <Panel data-testid="fletcher">
        <h2 className="mb-1 font-display text-base font-bold text-cyan-200">FLETCHER</h2>
        <p className="mb-2 font-mono-g text-[10px] text-slate-500">
          Turn {FLETCHING.batch} plain arrows into special ones. You have {guild.stash.arrows || 0} plain arrows.
        </p>
        <ul className="space-y-1.5 font-mono-g text-[11px]">
          {Object.entries(FLETCHING.recipes).map(([key, cost]) => {
            const item = CONSUMABLES[key];
            return (
              <li key={key} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                <div className="min-w-0">
                  <span className="font-bold" style={{ color: item.color }}>{item.name}</span>
                  <span className="ml-2 text-slate-300">×{guild.stash[key] || 0}</span>
                  <div className="text-[10px] text-slate-500">{item.desc}</div>
                </div>
                <NeonButton
                  color={item.color}
                  disabled={guild.gold < cost || (guild.stash.arrows || 0) < FLETCHING.batch}
                  onClick={() => onFletch(key)}
                  data-testid={`fletch-${key}`}
                >
                  ×{FLETCHING.batch} · {cost}g
                </NeonButton>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel data-testid="provisions">
        <h2 className="mb-1 font-display text-base font-bold text-cyan-200">PROVISIONS</h2>
        <p className="mb-2 font-mono-g text-[10px] text-slate-500">
          Harsh regions wear heroes down. When a party sets out, each hero packs one matching provision from the stash
          (unless their gear already makes them immune).
        </p>
        <ul className="space-y-1.5 font-mono-g text-[11px]">
          {PROVISION_KEYS.map((key) => {
            const provision = PROVISIONS[key];
            const environment = Object.values(ENVIRONMENTS).find((entry) => entry.provision === key);
            const regions = REGIONS.filter((region) => region.environment === environment?.key).map((region) => region.name);
            return (
              <SupplyRow
                key={key}
                item={{ ...provision, desc: `${provision.desc} For ${environment?.name} (${regions.join(", ")}).` }}
                owned={guild.stash[key] || 0}
                gold={guild.gold}
                onBuy={onBuySupply}
                amounts={[1, 4]}
                testId={`buy-${key}`}
              />
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
