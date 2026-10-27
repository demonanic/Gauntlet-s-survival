import { NEMESIS, activeNemeses, nemesisLevel, nemesisTraits } from "../game/nemesis";
import { getRegion } from "../game/regions";
import { Panel } from "./ui";

// The guild's nemeses: who is still out there, how strong it has grown, and
// whom it beat. Slain ones are kept below as trophies.
export default function NemesisBoard({ guild, now = Date.now() }) {
  const nemeses = guild.nemeses || [];
  if (!nemeses.length) return null;
  const active = activeNemeses(guild);
  const slain = nemeses.filter((nemesis) => nemesis.slainAt).sort((a, b) => b.slainAt - a.slainAt);
  return (
    <Panel data-testid="nemesis-board">
      <h2 className="font-display text-base font-bold text-amber-300">NEMESES</h2>
      <p className="mb-2 font-mono-g text-[10px] text-slate-500">
        Creatures that beat your heroes. They grow a level every {NEMESIS.growthHours} hours and with every hero they
        down, and wait for you in their region.
      </p>
      {active.length === 0 && <p className="font-mono-g text-[11px] text-slate-400">None hunting the guild right now.</p>}
      <ul className="space-y-1.5 font-mono-g text-[11px]">
        {active.map((nemesis) => {
          const level = nemesisLevel(nemesis, now);
          const traits = nemesisTraits(level);
          return (
            <li key={nemesis.id} className="border-b border-white/5 pb-1.5" data-testid={`nemesis-${nemesis.id}`}>
              <span className="font-bold text-amber-300">{nemesis.name}</span>
              <span className="ml-2 text-slate-400">LV {level} {nemesis.typeName} · {getRegion(nemesis.regionId)?.name}</span>
              <div className="text-[10px] text-slate-500">
                Beat {nemesis.victims.map((victim) => victim.name).join(", ")}
                {nemesis.fled > 0 && ` · fled ${nemesis.fled}×`}
              </div>
              {traits.length > 0 && (
                <div className="text-[10px] text-orange-300">{traits.map((trait) => `${trait.name} (${trait.text})`).join(" · ")}</div>
              )}
            </li>
          );
        })}
      </ul>
      {slain.length > 0 && (
        <>
          <h3 className="mt-3 font-display text-sm font-bold text-amber-200">SLAIN</h3>
          <ul className="mt-1 space-y-0.5 font-mono-g text-[10px] text-slate-400">
            {slain.map((nemesis) => (
              <li key={nemesis.id}>{nemesis.name} · LV {nemesis.level} {nemesis.typeName}</li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
