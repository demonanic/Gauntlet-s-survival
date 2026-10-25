import { useState } from "react";
import { PET_QUALITIES, PET_SPECIES } from "../combat/pets";
import { NeonButton, Panel } from "./ui";

// The boss's strange crate: several identical crates, one of each familiar,
// and the player picks one blind. Then the reveal, and the bond.
export default function CrateDialog({ crate, guild, onOpen }) {
  const [reveal, setReveal] = useState(null);
  const leader = guild.heroes.find((hero) => hero.identity.id === crate?.heroId);
  if (!crate && !reveal) return null;

  if (reveal) {
    const species = PET_SPECIES[reveal.pet.species];
    const quality = PET_QUALITIES[reveal.pet.quality];
    return (
      <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4" data-testid="crate-reveal">
        <Panel className="w-full max-w-sm text-center">
          <p className="font-mono-g text-[11px] text-slate-400">The lid creaks open...</p>
          <h2 className="mt-1 font-display text-xl font-bold" style={{ color: species.color }}>{reveal.pet.name} the {species.name}</h2>
          <p className="font-mono-g text-[11px] uppercase text-slate-400">{species.role}</p>
          <p className="mt-2 font-mono-g text-[11px] text-slate-200">{species.desc}</p>
          <p className="mt-1 font-mono-g text-[11px] text-yellow-300">{quality.name}: <span className="text-slate-300">{quality.desc}</span></p>
          <p className="mt-2 font-mono-g text-[11px] text-cyan-200">
            {reveal.heroName
              ? `${reveal.pet.name} sniffs ${reveal.heroName} and decides they belong together.`
              : `${reveal.pet.name} waits in the kennel for a partner.`}
          </p>
          <NeonButton className="mt-3 w-full" color={species.color} onClick={() => setReveal(null)} data-testid="crate-done">Welcome aboard</NeonButton>
        </Panel>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4" data-testid="crate-dialog">
      <Panel className="w-full max-w-sm text-center">
        <h2 className="font-display text-lg font-bold text-yellow-200">A weird crate with breathing holes</h2>
        <p className="mt-1 font-mono-g text-[11px] text-slate-300">
          Behind the fallen boss sit {crate.options.length} crates, all alike. Something is scratching inside each one. Pick one:
          whatever is inside will bond with {leader ? leader.identity.name : "your guild"}.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {crate.options.map((_, index) => (
            <button
              key={index}
              type="button"
              className="rounded border-2 border-amber-700/70 bg-amber-950/40 p-3 font-display text-lg text-amber-300 hover:border-yellow-300"
              onClick={() => setReveal(onOpen(index))}
              data-testid={`crate-${index}`}
            >
              <span aria-hidden="true">▦</span>
              <span className="block font-mono-g text-[9px] text-amber-500">· · ·</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
