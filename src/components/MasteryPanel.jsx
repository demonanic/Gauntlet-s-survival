import { getUnlockedClasslessAbilities } from "../combat/classlessAbilities";
import { WEAPON_PROFILES } from "../combat/gear";
import { HERO_BASELINE } from "../combat/heroModel";
import { MASTERY, MASTERY_ROMAN, heroMastery, masteryRank, nextMasteryCount } from "../combat/mastery";

const pct = (value) => `${Math.round(value * 1000) / 10}%`;

// One mastery: name, rank, a bar to the next rank, and what the rank gives.
function Row({ label, count, table, bonus, testId }) {
  const rank = masteryRank(count, table);
  const next = nextMasteryCount(count, table);
  const floor = table[rank - 1];
  const progress = next == null ? 1 : (count - floor) / (next - floor);
  return (
    <div data-testid={testId}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-slate-200">{label} <span className="font-bold text-amber-300">{MASTERY_ROMAN[rank - 1]}</span></span>
        <span className="text-[10px] text-slate-500">{next == null ? `${count} · mastered` : `${count}/${next}`}</span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-amber-300" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="text-[10px] text-slate-500">{rank > 1 ? bonus(rank - 1) : "No bonus yet"}</div>
    </div>
  );
}

// What a hero has got better at through use: their special moves, each kind
// of weapon they've fought with, evasion and backstabs (mastery.js).
export default function MasteryPanel({ hero }) {
  const mastery = heroMastery(hero);
  const moves = [
    { id: HERO_BASELINE.sharedStrike.id, name: "Shared Strike" },
    ...getUnlockedClasslessAbilities(hero).map((ability) => ({ id: ability.id, name: ability.name })),
  ];
  const current = hero.equipment?.weapon?.weaponType;
  const weapons = Object.keys(WEAPON_PROFILES).filter((type) => type === current || mastery.weapons[type]);
  return (
    <div className="mt-1 space-y-1.5 font-mono-g text-[11px]" data-testid="mastery">
      <p className="text-[10px] text-slate-500">Heroes improve at what they do: moves you use, weapon hits, dodges and backstabs (hits on a foe busy with someone else).</p>
      {weapons.map((type) => (
        <Row
          key={type}
          label={`${WEAPON_PROFILES[type].label}${type === current ? "" : " (not held)"}`}
          count={mastery.weapons[type] || 0}
          table={MASTERY.weaponCounts}
          bonus={(ranks) => `+${pct(MASTERY.weaponDamage * ranks)} weapon damage${type === "bow" ? `, +${pct(MASTERY.bowCrit * ranks)} crit` : ""}`}
          testId={`mastery-weapon-${type}`}
        />
      ))}
      {moves.map((move) => (
        <Row
          key={move.id}
          label={move.name}
          count={mastery.moves[move.id] || 0}
          table={MASTERY.moveCounts}
          bonus={(ranks) => `+${pct(MASTERY.movePower * ranks)} power, -${pct(MASTERY.moveCooldown * ranks)} cooldown`}
          testId={`mastery-move-${move.id}`}
        />
      ))}
      <Row label="Evasion" count={mastery.dodges} table={MASTERY.dodgeCounts} bonus={(ranks) => `+${pct(MASTERY.dodge * ranks)} dodge`} testId="mastery-evasion" />
      <Row label="Backstab" count={mastery.backstabs} table={MASTERY.backstabCounts} bonus={(ranks) => `+${pct(MASTERY.backstabDamage * ranks)} backstab damage`} testId="mastery-backstab" />
    </div>
  );
}
