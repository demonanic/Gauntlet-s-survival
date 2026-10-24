import { TRAITS } from "../combat/traits";
import {
  LEGACY_KEYS, LEGACY_UPGRADES, RETIRE_LEVEL, legacyRank, legacyUpgradeCost, renownForRetiring,
} from "../game/legacy";
import ClasslessHeroAvatar from "./ClasslessHeroAvatar";
import { NeonButton, Panel } from "./ui";

// Prestige: Renown from retired heroes buys permanent guild upgrades.
export default function HallOfLegends({ guild, onBuy }) {
  const legacy = guild.legacy || { renown: 0, legends: [] };
  return (
    <Panel data-testid="hall-of-legends">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-display text-base font-bold text-cyan-200">HALL OF LEGENDS</h2>
        <span className="font-mono-g text-sm font-bold text-fuchsia-300" data-testid="renown">{legacy.renown} renown</span>
      </div>
      <p className="mb-2 font-mono-g text-[10px] text-slate-500">
        Retire a level {RETIRE_LEVEL} hero to earn {renownForRetiring(guild)} renown (+1 for every 5 boss ranks). Their gear
        returns to the vault. Upgrades are permanent.
      </p>
      <ul className="space-y-1.5 font-mono-g text-[11px]">
        {LEGACY_KEYS.map((key) => {
          const upgrade = LEGACY_UPGRADES[key];
          const rank = legacyRank(guild, key);
          const cost = legacyUpgradeCost(guild, key);
          return (
            <li key={key} className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
              <div className="min-w-0">
                <span className="font-bold text-fuchsia-200">{upgrade.name}</span>
                <span className="ml-2 text-slate-400">{rank}/{upgrade.max}</span>
                <div className="text-[10px] text-slate-500">{upgrade.desc}</div>
              </div>
              {rank < upgrade.max ? (
                <NeonButton color="#E879F9" disabled={legacy.renown < cost} onClick={() => onBuy(key)} data-testid={`legacy-${key}`}>
                  {cost} renown
                </NeonButton>
              ) : <span className="text-[10px] uppercase text-slate-500">Max</span>}
            </li>
          );
        })}
      </ul>
      {legacy.legends.length > 0 && (
        <>
          <h3 className="mt-3 font-display text-sm font-bold text-fuchsia-200">LEGENDS</h3>
          <ul className="mt-1 space-y-1 font-mono-g text-[11px]">
            {[...legacy.legends].reverse().map((legend, index) => (
              <li key={`${legend.name}-${legend.retiredAt}-${index}`} className="flex items-center gap-2">
                <ClasslessHeroAvatar className="h-7 w-7 rounded border" identityColor={legend.appearance?.identityColor} appearance={legend.appearance} label={legend.name} />
                <span className="font-bold" style={{ color: legend.appearance?.identityColor }}>{legend.name}</span>
                <span className="text-slate-500">
                  LV {legend.level} · {TRAITS[legend.traits?.[0]]?.name || "No trait"} · retired at boss rank {legend.bossRank + 1}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
