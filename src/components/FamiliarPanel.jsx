import { PET_MAX_LEVEL, PET_QUALITIES, PET_SPECIES, PET_XP } from "../combat/pets";
import { pendingPetMods } from "../game/pets";
import { Bar, NeonButton } from "./ui";

// A hero's familiar on their Gear screen: who it is, how far it has grown,
// any upgrade waiting to be chosen, and pairing with pets from the kennel.
export default function FamiliarPanel({ hero, kennel, locked, onAssign, onUnassign, onChooseMod }) {
  const pet = hero.pet;
  const species = pet && PET_SPECIES[pet.species];
  return (
    <div className="mt-1 rounded border border-white/10 p-2 font-mono-g text-[11px]" data-testid="familiar">
      {pet ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span>
              <span className="font-bold" style={{ color: species.color }}>{pet.name}</span>
              <span className="ml-1.5 text-slate-400">{species.name} · {species.role} · LV {pet.level}</span>
            </span>
            {!locked && <button type="button" className="text-[10px] text-slate-500 underline" onClick={onUnassign} data-testid="pet-unassign">to kennel</button>}
          </div>
          <p className="text-[10px] text-slate-400">{species.desc}</p>
          <p className="text-[10px] text-yellow-300">{PET_QUALITIES[pet.quality].name}: <span className="text-slate-300">{PET_QUALITIES[pet.quality].desc}</span></p>
          {pet.level < PET_MAX_LEVEL && (
            <Bar value={pet.xp - PET_XP[pet.level - 1]} max={PET_XP[pet.level] - PET_XP[pet.level - 1]} color={species.color} className="my-1" />
          )}
          {Object.entries(pet.mods || {}).map(([level, id]) => {
            const mod = species.mods[level].find((entry) => entry.id === id);
            return mod && <p key={level} className="text-[10px] text-cyan-200">LV {level}: {mod.name}: <span className="text-slate-300">{mod.desc}</span></p>;
          })}
          {pendingPetMods(pet).map((level) => (
            <div key={level} className="mt-1 rounded border border-yellow-300/50 p-1.5" data-testid={`pet-mod-${level}`}>
              <p className="text-[10px] font-bold text-yellow-200">{pet.name} reached level {level}: choose a new trick</p>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {species.mods[level].map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    className="rounded border border-white/15 p-1 text-left hover:border-cyan-300"
                    onClick={() => onChooseMod(level, mod.id)}
                    data-testid={`pet-mod-${mod.id}`}
                  >
                    <span className="font-bold text-cyan-200">{mod.name}</span>
                    <span className="block text-[10px] text-slate-400">{mod.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : (
        <p className="text-slate-500">No familiar. Adopt one in the Market, or take in a stray on the road.</p>
      )}
      {!locked && kennel.length > 0 && (
        <div className="mt-1 border-t border-white/10 pt-1">
          <p className="text-[10px] uppercase text-slate-500">Kennel</p>
          <ul className="space-y-1">
            {kennel.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2">
                <span>
                  <span style={{ color: PET_SPECIES[entry.species].color }}>{entry.name}</span>
                  <span className="ml-1.5 text-[10px] text-slate-400">{PET_SPECIES[entry.species].name} · LV {entry.level} · {PET_QUALITIES[entry.quality].name}</span>
                </span>
                <NeonButton color="#39FF14" onClick={() => onAssign(entry.id)} data-testid={`pet-assign-${entry.id}`}>
                  {pet ? "Swap" : "Take along"}
                </NeonButton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
