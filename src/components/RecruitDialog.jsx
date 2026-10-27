import { useState } from "react";
import { distinctHueShift, paletteForShift } from "../combat/heroPalette";
import { TRAITS } from "../combat/traits";
import { CANDIDATE_REROLL_COST, MAX_NAME_LENGTH, cleanHeroName, recruitCost } from "../game/guild";
import ClasslessHeroAvatar from "./ClasslessHeroAvatar";
import { NeonButton, Panel } from "./ui";

// Meet the candidate at the guild door: name them, pick a neon look (free),
// or pay to see a different recruit with another trait.
export default function RecruitDialog({ guild, onHire, onReroll, onClose }) {
  const candidate = guild.candidate;
  const [name, setName] = useState(candidate?.suggestedName || "");
  const [hueShift, setHueShift] = useState(candidate?.hueShift ?? 0);
  const [seenCandidate, setSeenCandidate] = useState(candidate);
  if (candidate !== seenCandidate) {
    // A rerolled candidate brings a new suggestion and look.
    setSeenCandidate(candidate);
    setName(candidate?.suggestedName || "");
    setHueShift(candidate?.hueShift ?? 0);
  }
  if (!candidate) return null;
  const palette = paletteForShift(hueShift);
  const trait = TRAITS[candidate.trait];
  const cost = recruitCost(guild);
  const validName = !!cleanHeroName(name);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" data-testid="recruit-dialog">
      <Panel className="w-full max-w-sm">
        <h2 className="font-display text-lg font-bold text-cyan-200">NEW RECRUIT</h2>
        <div className="mt-3 flex items-center gap-3">
          <ClasslessHeroAvatar className="h-20 w-20 rounded border-2" identityColor={palette.identityColor} appearance={palette} label="Recruit preview" />
          <div className="min-w-0 flex-1 font-mono-g text-[11px]">
            <div className="text-[9px] uppercase text-slate-500">Born with</div>
            <div className="font-bold uppercase text-yellow-300">{trait?.name}</div>
            <div className="text-slate-300">{trait?.desc}</div>
            <button
              type="button"
              className="mt-2 rounded border px-2 py-1 text-[10px] uppercase"
              style={{ borderColor: palette.identityColor, color: palette.identityColor }}
              onClick={() => setHueShift(distinctHueShift(guild.heroes.map((hero) => hero.appearance?.hueShift)))}
              data-testid="recruit-new-look"
            >
              New look
            </button>
          </div>
        </div>
        <label className="mt-3 block font-mono-g text-[10px] uppercase text-slate-400" htmlFor="recruit-name">Name</label>
        <input
          id="recruit-name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded border border-white/15 bg-black/40 px-2 py-2 font-display text-sm text-slate-100 outline-none focus:border-cyan-300"
          data-testid="recruit-name"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NeonButton color="#A855F7" disabled={guild.gold < CANDIDATE_REROLL_COST} onClick={onReroll} data-testid="recruit-reroll">
            Another · {CANDIDATE_REROLL_COST}g
          </NeonButton>
          <NeonButton
            color="#FFE600"
            disabled={!validName || guild.gold < cost}
            onClick={() => onHire({ name, hueShift })}
            data-testid="recruit-hire"
          >
            Hire · {cost ? `${cost}g` : "FREE"}
          </NeonButton>
        </div>
        <NeonButton className="mt-2 w-full" color="#94A3B8" onClick={onClose}>Cancel</NeonButton>
      </Panel>
    </div>
  );
}
