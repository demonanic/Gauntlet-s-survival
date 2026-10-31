import { BONDS, bondOffers } from "../game/bonds";
import { NeonButton, Panel } from "./ui";

const pct = (value) => `${Math.round(Math.abs(value) * 100)}%`;

// Bonds waiting on the player's say: become Comrades, or swear the Sworn pact.
export default function BondOffers({ guild, onAnswer }) {
  const offers = bondOffers(guild);
  if (!offers.length) return null;
  const name = (id) => guild.heroes.find((hero) => hero.identity.id === id)?.identity.name;
  return (
    <Panel className="border-sky-400/40" data-testid="bond-offers">
      <h2 className="font-display text-base font-bold text-sky-300">BONDS</h2>
      <ul className="mt-1 space-y-3 font-mono-g text-[11px]">
        {offers.map(({ a, b, step, wins }) => (
          <li key={`${a}|${b}`} className="border-b border-white/5 pb-3" data-testid={`bond-offer-${step}`}>
            <p className="font-bold text-sky-200">
              {step === "sworn"
                ? `${name(a)} and ${name(b)} would trust each other with their lives. Swear them to fight as one?`
                : `${name(a)} and ${name(b)} have grown close. Become Comrades?`}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              {step === "sworn"
                ? `Sworn partners guard each other: when one drops below ${pct(BONDS.guardBelow)} HP, the other leaps in with a shield, once a fight. A hero can only ever have one Sworn partner. Leaving one at home costs the party ${BONDS.separationMorale.sworn} morale.`
                : `Comrades hit ${pct(BONDS.comradesDamage)} harder while both are standing. If one falls, the other flies into Vengeance (+${pct(BONDS.vengeanceDamage)} damage), or is Shaken (-${pct(BONDS.shakenDamage)}) if calm by nature. Leaving one at home costs the party ${BONDS.separationMorale.comrades} morale.`}
              {" "}{wins} wins side by side.
            </p>
            <div className="mt-2 flex gap-2">
              <NeonButton color="#38BDF8" onClick={() => onAnswer(a, b, true)} data-testid="bond-accept">
                {step === "sworn" ? "Swear the pact" : "Bond them"}
              </NeonButton>
              <NeonButton color="#94A3B8" onClick={() => onAnswer(a, b, false)} data-testid="bond-decline">
                Not now
              </NeonButton>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
