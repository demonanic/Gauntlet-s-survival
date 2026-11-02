import { useState } from "react";
import { GEAR_SLOT_LABELS, GEAR_SLOTS } from "../combat/gear";
import { AUTO_CLEAR_RARITIES, VAULT_SORTS, autoClearSettings, junkItems, upgradeFor, vaultView } from "../game/armory";
import { MAX_UPGRADE, RARITIES, RARITY_ORDER, reforgeCost, salvageValue, upgradeCost } from "../game/items";
import ItemDetails from "./ItemDetails";
import { NeonButton, Panel } from "./ui";

function Chip({ active, color = "#00F3FF", onClick, children, ...props }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-1.5 py-0.5 ${active ? "" : "border-white/15 text-slate-400"}`}
      style={active ? { borderColor: color, color } : undefined}
      {...props}
    >
      {children}
    </button>
  );
}

// Who a vault piece would be an upgrade for, or "Spare".
function Verdict({ guild, item }) {
  const helped = upgradeFor(guild, item);
  if (!helped.length) return <div className="text-[10px] text-slate-500" data-testid={`verdict-${item.id}`}>Spare: no hero needs it</div>;
  return (
    <div className="text-[10px] font-bold text-emerald-300" data-testid={`verdict-${item.id}`}>
      Upgrade for {helped.slice(0, 3).map(({ hero, change }) => `${hero.identity.name} +${Math.max(1, Math.round(change.share * 100))}%`).join(", ")}
      {helped.length > 3 ? ` +${helped.length - 3} more` : ""}
    </div>
  );
}

// Clear junk: the armory ticks every unprotected piece no hero needs (keeping
// one spare per slot); untick any, then sell or salvage the rest in one go.
function ClearJunk({ guild, onClear, onClose }) {
  const junk = junkItems(guild);
  const [unticked, setUnticked] = useState(() => new Set());
  const chosen = junk.filter((item) => !unticked.has(item.id));
  const gold = chosen.reduce((sum, item) => sum + Math.max(0, Math.round(item.value || 0)), 0);
  const essence = chosen.reduce((sum, item) => sum + salvageValue(item), 0);
  const toggle = (id) => setUnticked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const clear = (mode) => {
    const what = mode === "sell" ? `${gold}g` : `${essence}✦ essence`;
    if (!window.confirm(`${mode === "sell" ? "Sell" : "Salvage"} ${chosen.length} piece${chosen.length === 1 ? "" : "s"} for ${what}?`)) return;
    onClear(chosen.map((item) => item.id), mode);
    onClose();
  };
  return (
    <div className="mb-2 rounded border border-amber-400/40 p-2 font-mono-g text-[11px]" data-testid="clear-junk">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold text-amber-200">Clear junk · {chosen.length} of {junk.length} ticked</span>
        <NeonButton color="#94A3B8" onClick={onClose}>Cancel</NeonButton>
      </div>
      {junk.length === 0 ? (
        <p className="text-slate-400">No junk: every unlocked piece is an upgrade for someone, protected, or the last spare for its slot.</p>
      ) : (
        <>
          <p className="mb-1 text-[10px] text-slate-500">
            Not an upgrade for any hero. Kept back: locked, forged or crystal-set pieces, set pieces, Legendaries, and one spare per slot.
          </p>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {junk.map((item) => (
              <li key={item.id}>
                <label className="flex items-start gap-1.5">
                  <input type="checkbox" checked={!unticked.has(item.id)} onChange={() => toggle(item.id)} data-testid={`junk-${item.id}`} />
                  <ItemDetails item={item} showSlot />
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1">
            <NeonButton color="#FFE600" disabled={!chosen.length} onClick={() => clear("sell")} data-testid="clear-sell">Sell {chosen.length} · {gold}g</NeonButton>
            <NeonButton color="#A78BFA" disabled={!chosen.length} onClick={() => clear("salvage")} data-testid="clear-salvage">Salvage {chosen.length} · {essence}✦</NeonButton>
          </div>
        </>
      )}
    </div>
  );
}

// Auto-clear: an opt-in rule run on new loot when an expedition comes home.
function AutoClear({ guild, onChange }) {
  const settings = autoClearSettings(guild);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1 font-mono-g text-[10px]" data-testid="auto-clear">
      <label className="flex items-center gap-1 text-slate-300">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} data-testid="auto-clear-on" />
        Auto-clear new loot up to
      </label>
      {AUTO_CLEAR_RARITIES.map((key) => (
        <Chip key={key} active={settings.maxRarity === key} color={RARITIES[key].color} onClick={() => onChange({ maxRarity: key })} data-testid={`auto-clear-${key}`}>
          {RARITIES[key].name}
        </Chip>
      ))}
      <span className="text-slate-500">by</span>
      <Chip active={settings.mode === "sell"} color="#FFE600" onClick={() => onChange({ mode: "sell" })} data-testid="auto-clear-sell">selling</Chip>
      <Chip active={settings.mode === "salvage"} color="#A78BFA" onClick={() => onChange({ mode: "salvage" })} data-testid="auto-clear-salvage">salvaging</Chip>
      <span className="w-full text-slate-500">Only gear no hero needs; set pieces, Legendaries and locked gear are never touched.</span>
    </div>
  );
}

// The vault: filter by slot and rarity, sort (best for a chosen hero, newest,
// rarity, value), see who each piece helps, lock keepers, and forge, reforge,
// sell or salvage the rest.
export default function VaultPanel({
  guild, onSell, onSalvage, onUpgrade, onReforge, onToggleLock, onEquipBestParty, onClearGear, onAutoClear,
}) {
  const [clearing, setClearing] = useState(false);
  const [slot, setSlot] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [sort, setSort] = useState("rarity");
  const [heroId, setHeroId] = useState(guild.heroes[0]?.identity.id || null);
  const hero = guild.heroes.find((entry) => entry.identity.id === heroId) || guild.heroes[0] || null;
  const items = vaultView(guild.vault, { slot, rarity, sort, hero });

  return (
    <Panel data-testid="vault">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold text-cyan-200">VAULT · {guild.vault.length}</h2>
        <span className="font-mono-g text-[11px] text-fuchsia-300" data-testid="essence">{guild.essence || 0}✦ essence</span>
      </div>
      <p className="mb-2 font-mono-g text-[10px] text-slate-500">
        The Forge upgrades gear up to +{MAX_UPGRADE}; each level adds 15% of its base stats. Salvage spare gear for
        essence, and spend essence at the Reforge to reroll an item&apos;s affixes. ☆ locks a piece so it can&apos;t be
        sold or salvaged.
      </p>
      {guild.vault.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <NeonButton color="#39FF14" onClick={onEquipBestParty} data-testid="equip-best-party">Equip best for party</NeonButton>
          <NeonButton color="#FFB547" onClick={() => setClearing(true)} data-testid="clear-junk-open">Clear junk</NeonButton>
          <span className="w-full font-mono-g text-[10px] text-slate-500">Equip best gives each hero at home the vault gear that suits their weapon best.</span>
        </div>
      )}
      {clearing && <ClearJunk guild={guild} onClear={onClearGear} onClose={() => setClearing(false)} />}
      <AutoClear guild={guild} onChange={onAutoClear} />

      {guild.vault.length > 0 && (
        <div className="mb-2 space-y-1 font-mono-g text-[10px]" data-testid="vault-filters">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-slate-500">Slot:</span>
            <Chip active={slot === "all"} onClick={() => setSlot("all")} data-testid="vault-slot-all">All</Chip>
            {GEAR_SLOTS.map((key) => (
              <Chip key={key} active={slot === key} onClick={() => setSlot(key)} data-testid={`vault-slot-${key}`}>{GEAR_SLOT_LABELS[key]}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-slate-500">Rarity:</span>
            <Chip active={rarity === "all"} onClick={() => setRarity("all")} data-testid="vault-rarity-all">All</Chip>
            {RARITY_ORDER.map((key) => (
              <Chip key={key} active={rarity === key} color={RARITIES[key].color} onClick={() => setRarity(key)} data-testid={`vault-rarity-${key}`}>
                {RARITIES[key].name}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-slate-500">Sort:</span>
            {Object.entries(VAULT_SORTS).map(([key, label]) => (
              <Chip key={key} active={sort === key} onClick={() => setSort(key)} data-testid={`vault-sort-${key}`}>{label}</Chip>
            ))}
            {sort === "fit" && (
              <select
                value={hero?.identity.id || ""}
                onChange={(event) => setHeroId(event.target.value)}
                className="rounded border border-white/15 bg-black/40 px-1 py-0.5 text-slate-200"
                data-testid="vault-sort-hero"
              >
                {guild.heroes.map((entry) => <option key={entry.identity.id} value={entry.identity.id}>{entry.identity.name}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {guild.vault.length === 0 ? (
        <p className="font-mono-g text-[11px] text-slate-400">No spare gear yet. Enemies drop gear on expeditions; elites and bosses drop the best.</p>
      ) : items.length === 0 ? (
        <p className="font-mono-g text-[11px] text-slate-400">Nothing matches these filters.</p>
      ) : (
        <ul className="space-y-1 font-mono-g text-[11px]">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1">
              <div className="flex min-w-0 items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleLock(item.id)}
                  className={`text-base leading-none ${item.locked ? "text-yellow-300" : "text-slate-600"}`}
                  aria-label={item.locked ? "Unlock" : "Lock"}
                  data-testid={`lock-${item.id}`}
                >
                  {item.locked ? "★" : "☆"}
                </button>
                <div className="min-w-0">
                  <ItemDetails item={item} showSlot />
                  <Verdict guild={guild} item={item} />
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {(item.upgrade || 0) < MAX_UPGRADE && (
                  <NeonButton color="#FF6600" disabled={guild.gold < upgradeCost(item)} onClick={() => onUpgrade(item.id)} data-testid={`upgrade-${item.id}`}>
                    Forge {upgradeCost(item)}g
                  </NeonButton>
                )}
                {reforgeCost(item) && (
                  <NeonButton
                    color="#E879F9"
                    disabled={(guild.essence || 0) < reforgeCost(item).essence || guild.gold < reforgeCost(item).gold}
                    onClick={() => onReforge(item.id)}
                    data-testid={`reforge-${item.id}`}
                  >
                    Reforge {reforgeCost(item).essence}✦
                  </NeonButton>
                )}
                {!item.locked && (
                  <>
                    <NeonButton color="#94A3B8" onClick={() => onSell(item.id)} data-testid={`sell-${item.id}`}>Sell {item.value}g</NeonButton>
                    <NeonButton color="#A78BFA" onClick={() => onSalvage(item.id)} data-testid={`salvage-${item.id}`}>Salvage +{salvageValue(item)}✦</NeonButton>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
