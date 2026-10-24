import { useEffect, useState } from "react";
import ClasslessPerkTree from "./components/ClasslessPerkTree";
import DebugPanel from "./components/DebugPanel";
import CloudSync from "./components/CloudSync";
import RecruitDialog from "./components/RecruitDialog";
import ExpeditionPanel from "./components/ExpeditionPanel";
import HeroGear from "./components/HeroGear";
import { NeonButton, Panel } from "./components/ui";
import { allocateClasslessStat, purchaseClasslessNode } from "./combat/classlessProgression";
import {
  currentEncounterParty, currentEncounterWave, dismissReport, findHero, recallExpedition, recruitHero,
  renameHero, rerollCandidate, resolveEncounter, startExpedition, tick, treatInjury, updateHero,
} from "./game/guild";
import { buyLegacyUpgrade, renownForRetiring, retireHero } from "./game/legacy";
import {
  buyConsumable, equipGear, loadQuickSlot, sellGear, unequipGear, unloadQuickSlot, upgradeGear,
} from "./game/items";
import { buyShopItem, rerollShop } from "./game/shop";
import { isDebugMode } from "./game/debug";
import { getRegion } from "./game/regions";
import { clearGuild, loadGuild, saveGuild } from "./game/storage";
import Battle from "./screens/Battle";
import ExpeditionBoard from "./screens/ExpeditionBoard";
import GuildHall from "./screens/GuildHall";
import Market from "./screens/Market";

const TICK_MS = 500;
// Test mode: open the game with ?debug in the address.
const DEBUG = isDebugMode();
const OUTCOME_TITLE = {
  victory: "Expedition conquered", retreat: "Party routed", recalled: "Party recalled", returned: "Back from the Rift",
};
const TABS = [["hall", "Guild Hall"], ["market", "Market"], ["board", "Expeditions"]];

export default function App() {
  const [guild, setGuild] = useState(() => tick(loadGuild(), Date.now()));
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState("hall");
  const [inBattle, setInBattle] = useState(false);
  const [perkHeroId, setPerkHeroId] = useState(null);
  const [gearHeroId, setGearHeroId] = useState(null);
  const [recruiting, setRecruiting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setGuild((current) => tick(current, t));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { saveGuild(guild); }, [guild]);

  // Mutators that may be rejected return { ok, state }; keep the current state on failure.
  const apply = (mutate) => setGuild((current) => {
    const result = mutate(current);
    return result.ok ? result.state : current;
  });

  const perkHero = perkHeroId ? findHero(guild, perkHeroId) : null;
  const gearHero = gearHeroId ? findHero(guild, gearHeroId) : null;
  const editHero = (result, base) => {
    if (!result.ok) return;
    setGuild((current) => updateHero(current, result.hero || { ...base, progression: result.progression }));
  };

  const report = guild.lastReport;

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-10 pt-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-2xl font-black tracking-wider text-cyan-200 text-glow-cyan">GAUNTLET</h1>
        <div className="flex items-center gap-2">
          <CloudSync guild={guild} onLoadSave={(state) => setGuild(tick(state, Date.now()))} />
          <span className="font-mono-g text-sm font-bold text-yellow-300" data-testid="gold">{guild.gold}g</span>
        </div>
      </header>

      {guild.expedition && (
        <div className="mb-3">
          <ExpeditionPanel
            expedition={guild.expedition}
            now={now}
            onFight={() => setInBattle(true)}
            onRecall={() => apply((current) => recallExpedition(current, Date.now()))}
          />
        </div>
      )}

      <nav className="mb-3 grid grid-cols-3 gap-2">
        {TABS.map(([id, label]) => (
          <NeonButton key={id} color={tab === id ? "#00F3FF" : "#475569"} onClick={() => setTab(id)} data-testid={`tab-${id}`}>
            {label}
          </NeonButton>
        ))}
      </nav>

      {tab === "hall" && (
        <GuildHall
          guild={guild}
          now={now}
          onRecruit={() => setRecruiting(true)}
          onOpenPerks={setPerkHeroId}
          onOpenGear={setGearHeroId}
          onSell={(itemId) => apply((current) => sellGear(current, itemId))}
          onUpgrade={(itemId) => apply((current) => upgradeGear(current, itemId))}
          onTreat={(heroId) => apply((current) => treatInjury(current, heroId, Date.now()))}
          onRetire={(heroId) => {
            const hero = findHero(guild, heroId);
            if (!window.confirm(`Retire ${hero?.identity.name} to the Hall of Legends for ${renownForRetiring(guild)} renown? This cannot be undone.`)) return;
            apply((current) => retireHero(current, heroId, Date.now()));
          }}
          onBuyLegacy={(key) => apply((current) => buyLegacyUpgrade(current, key))}
        />
      )}
      {tab === "market" && (
        <Market
          guild={guild}
          now={now}
          onBuyItem={(itemId) => apply((current) => buyShopItem(current, itemId, Date.now()))}
          onReroll={() => apply((current) => rerollShop(current, Date.now()))}
          onBuySupply={(key, qty) => apply((current) => buyConsumable(current, key, qty))}
        />
      )}
      {tab === "board" && (
        <ExpeditionBoard
          guild={guild}
          now={now}
          onLaunch={(regionId, heroIds) => apply((current) => startExpedition(current, regionId, heroIds, Date.now()))}
        />
      )}

      <footer className="mt-6 text-center">
        <button
          type="button"
          className="font-mono-g text-[10px] text-slate-600 underline"
          onClick={() => {
            if (!window.confirm("Erase this guild and start over?")) return;
            clearGuild();
            setGuild(tick(loadGuild(), Date.now()));
          }}
        >
          Reset save
        </button>
      </footer>

      {perkHero && (
        <ClasslessPerkTree
          hero={perkHero}
          onPurchase={(nodeId) => editHero(purchaseClasslessNode(perkHero, nodeId), perkHero)}
          onAllocate={(stat) => editHero(allocateClasslessStat(perkHero, stat), perkHero)}
          onClose={() => setPerkHeroId(null)}
        />
      )}

      {gearHero && (
        <HeroGear
          hero={gearHero}
          vault={guild.vault}
          stash={guild.stash}
          locked={!!guild.expedition?.heroIds.includes(gearHeroId)}
          onEquip={(itemId) => apply((current) => equipGear(current, gearHeroId, itemId))}
          onUnequip={(slot) => apply((current) => unequipGear(current, gearHeroId, slot))}
          onLoadQuick={(index, key) => apply((current) => loadQuickSlot(current, gearHeroId, index, key))}
          onUnloadQuick={(index) => apply((current) => unloadQuickSlot(current, gearHeroId, index))}
          onUpgrade={(itemId) => apply((current) => upgradeGear(current, itemId))}
          onRename={(name) => apply((current) => renameHero(current, gearHeroId, name))}
          gold={guild.gold}
          onClose={() => setGearHeroId(null)}
        />
      )}

      {recruiting && (
        <RecruitDialog
          guild={guild}
          onHire={(choice) => { apply((current) => recruitHero(current, choice)); setRecruiting(false); }}
          onReroll={() => apply(rerollCandidate)}
          onClose={() => setRecruiting(false)}
        />
      )}

      {report && !inBattle && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <Panel className="w-full max-w-sm">
            <h2 className="font-display text-lg font-bold text-cyan-200">{OUTCOME_TITLE[report.outcome]}</h2>
            <p className="font-mono-g text-[11px] text-slate-400">{getRegion(report.regionId)?.name}</p>
            <p className="my-2 font-mono-g text-sm text-yellow-300">+{report.loot.gold}g · {report.loot.items.length} items</p>
            <ul className="mb-3 space-y-0.5 font-mono-g text-[10px] text-slate-300">
              {report.log.map((line, index) => <li key={index}>{line}</li>)}
            </ul>
            <NeonButton className="w-full" onClick={() => setGuild((current) => dismissReport(current))}>Collect</NeonButton>
          </Panel>
        </div>
      )}

      {inBattle && guild.expedition?.phase === "ready" && (
        <Battle
          expedition={guild.expedition}
          party={currentEncounterParty(guild)}
          createWave={() => currentEncounterWave(guild)}
          speeds={DEBUG ? [1, 2, 4, 8] : [1, 2]}
          onComplete={(outcome) => {
            apply((current) => resolveEncounter(current, outcome, Date.now()));
            setInBattle(false);
          }}
        />
      )}
      {DEBUG && <DebugPanel guild={guild} apply={apply} />}
    </div>
  );
}
