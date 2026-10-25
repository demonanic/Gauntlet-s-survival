import ClasslessHeroAvatar from "./ClasslessHeroAvatar";
import { Bar, formatSeconds } from "./ui";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { PET_SPECIES } from "../combat/pets";
import { heroQualities } from "../combat/traits";

const STATUS_STYLE = {
  ready: { label: "READY", color: "#39FF14" },
  away: { label: "ON EXPEDITION", color: "#00F3FF" },
  injured: { label: "INJURED", color: "#FF2A5F" },
};

export default function HeroRow({ hero, status, injuredUntil, now, selected, onSelect, actions, leader }) {
  const maxHp = classlessMaxHp(hero);
  const style = STATUS_STYLE[status];
  const { level, ap, sp } = hero.progression;
  return (
    <div
      className={`flex items-center gap-3 rounded border p-2 ${selected ? "border-cyan-300 bg-cyan-400/10" : "border-white/10 bg-white/[0.025]"}
        ${onSelect ? "cursor-pointer" : ""}`}
      onClick={onSelect}
      data-testid={`hero-row-${hero.identity.id}`}
    >
      <ClasslessHeroAvatar
        className="h-12 w-12 rounded border"
        identityColor={hero.appearance?.identityColor}
        appearance={hero.appearance}
        equipment={hero.equipment}
        label={hero.identity.name}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="max-w-full truncate font-display text-sm font-bold" style={{ color: hero.appearance?.identityColor }}>{hero.identity.name}</span>
          <span className="font-mono-g text-[10px] text-slate-400">LV {level}</span>
          {leader && (
            <span className="rounded border border-yellow-300/60 px-1 font-mono-g text-[9px] uppercase text-yellow-200" title="Leads the party. A familiar found on this trip bonds with the leader." data-testid="party-leader">
              Leader
            </span>
          )}
          {heroQualities(hero).map((quality) => (
            <span
              key={quality.key}
              className={`truncate font-mono-g text-[10px] ${quality.kind === "evolved" ? "text-amber-300" : "text-slate-500"}`}
              title={quality.desc}
              data-testid="hero-quality"
            >
              {quality.name}
            </span>
          ))}
          {hero.pet && PET_SPECIES[hero.pet.species] && (
            <span className="font-mono-g text-[10px]" style={{ color: PET_SPECIES[hero.pet.species].color }} data-testid="hero-pet">
              + {hero.pet.name}
            </span>
          )}
          {(ap > 0 || sp > 0) && (
            <span className="font-mono-g text-[10px] text-yellow-300">{ap} AP · {sp} SP</span>
          )}
        </div>
        <Bar value={hero.combat.hp} max={maxHp} className="my-1" />
        <div className="flex justify-between font-mono-g text-[10px]">
          <span className="text-slate-400">{Math.round(hero.combat.hp)} / {maxHp} HP</span>
          <span style={{ color: style.color }}>
            {style.label}{status === "injured" ? ` · ${formatSeconds(injuredUntil - now)}` : ""}
          </span>
        </div>
      </div>
      {actions}
    </div>
  );
}
