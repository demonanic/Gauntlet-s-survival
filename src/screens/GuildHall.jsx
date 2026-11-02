import HallOfLegends from "../components/HallOfLegends";
import NemesisBoard from "../components/NemesisBoard";
import BondOffers from "../components/BondOffers";
import HeroRow from "../components/HeroRow";
import VaultPanel from "../components/VaultPanel";
import { NeonButton, Panel } from "../components/ui";
import { heroStatus, recruitCost, treatmentCost } from "../game/guild";
import { canRetire } from "../game/legacy";

export default function GuildHall({
  guild, now, onRecruit, onOpenPerks, onOpenGear, onSell, onSalvage, onUpgrade, onReforge, onTreat, onRetire, onBuyLegacy, onAnswerBond, onEquipBestParty, onToggleLock, onClearGear, onAutoClear,
}) {
  const cost = recruitCost(guild);
  return (
    <div className="space-y-3">
      <Panel data-testid="roster">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-cyan-200">ROSTER</h2>
          <NeonButton color="#FFE600" disabled={guild.gold < cost} onClick={onRecruit} data-testid="recruit">
            Recruit · {cost ? `${cost}g` : "FREE"}
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
                guild={guild}
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

      <VaultPanel
        guild={guild}
        onSell={onSell}
        onSalvage={onSalvage}
        onUpgrade={onUpgrade}
        onReforge={onReforge}
        onToggleLock={onToggleLock}
        onEquipBestParty={onEquipBestParty}
        onClearGear={onClearGear}
        onAutoClear={onAutoClear}
      />
      <BondOffers guild={guild} onAnswer={onAnswerBond} />
      <NemesisBoard guild={guild} />
      <HallOfLegends guild={guild} onBuy={onBuyLegacy} />
    </div>
  );
}
