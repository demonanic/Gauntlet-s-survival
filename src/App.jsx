import { useEffect, useState } from "react";
import ClasslessPerkTree from "./components/ClasslessPerkTree";
import ExpeditionPanel from "./components/ExpeditionPanel";
import { NeonButton, Panel } from "./components/ui";
import { allocateClasslessStat, purchaseClasslessNode } from "./combat/classlessProgression";
import {
  currentEncounterParty, dismissReport, findHero, recallExpedition, recruitHero, resolveEncounter,
  startExpedition, tick, updateHero,
} from "./game/guild";
import { getRegion } from "./game/regions";
import { clearGuild, loadGuild, saveGuild } from "./game/storage";
import Battle from "./screens/Battle";
import ExpeditionBoard from "./screens/ExpeditionBoard";
import GuildHall from "./screens/GuildHall";

const TICK_MS = 500;
const OUTCOME_TITLE = { victory: "Expedition conquered", retreat: "Party routed", recalled: "Party recalled" };

export default function App() {
  const [guild, setGuild] = useState(() => tick(loadGuild(), Date.now()));
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState("hall");
  const [inBattle, setInBattle] = useState(false);
  const [perkHeroId, setPerkHeroId] = useState(null);

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
  const editHero = (result, base) => {
    if (!result.ok) return;
    setGuild((current) => updateHero(current, result.hero || { ...base, progression: result.progression }));
  };

  const report = guild.lastReport;

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-10 pt-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-2xl font-black tracking-wider text-cyan-200 text-glow-cyan">GAUNTLET</h1>
        <span className="font-mono-g text-sm font-bold text-yellow-300" data-testid="gold">{guild.gold}g</span>
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

      <nav className="mb-3 grid grid-cols-2 gap-2">
        <NeonButton color={tab === "hall" ? "#00F3FF" : "#475569"} onClick={() => setTab("hall")}>Guild Hall</NeonButton>
        <NeonButton color={tab === "board" ? "#00F3FF" : "#475569"} onClick={() => setTab("board")}>Expeditions</NeonButton>
      </nav>

      {tab === "hall" ? (
        <GuildHall guild={guild} now={now} onRecruit={() => apply(recruitHero)} onOpenPerks={setPerkHeroId} />
      ) : (
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
          onComplete={(outcome) => {
            apply((current) => resolveEncounter(current, outcome, Date.now()));
            setInBattle(false);
          }}
        />
      )}
    </div>
  );
}
