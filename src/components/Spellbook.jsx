import {
  ELEMENTS, ELEMENT_EFFECTS, MAGIC, ROMAN, SCHOOLS, SPELLS, canCast, castSuccessChance, elementCasts, elementSlot,
  heroMagic, knownSpells, maxMana, nextRankAt, proficiency, rankFor, spellCasts,
} from "../combat/spells";

const SLOT_REASONS = {
  proficiency: (slot) => `reach proficiency ${ROMAN[slot.rank - 1]} in an element`,
  level: (slot) => `reach level ${slot.level}`,
  ap: () => `${MAGIC.extraElementAp} AP`,
};

// A caster's spells: elements and proficiency, each spell's rank, and the
// chance a cast lands. Elementalism picks the first element here.
export default function Spellbook({ hero, onLearnElement }) {
  if (!canCast(hero)) return null;
  const learned = heroMagic(hero).elements;
  const slot = elementSlot(hero);
  const known = new Set(knownSpells(hero).map((spell) => spell.id));
  const elements = ["arcane", ...learned];
  return (
    <section className="mb-4 rounded border border-fuchsia-400/30 p-3" aria-label="Spellbook" data-testid="spellbook">
      <div className="mb-1 font-mono-g text-[10px] text-fuchsia-200">SPELLBOOK · {maxMana(hero)} mana</div>
      <p className="mb-2 font-mono-g text-[9px] text-slate-400">
        Casts can fizzle (mana spent, nothing happens). Only successful casts rank a spell up (I–V at 15/45/100/200)
        and raise its element's proficiency, which teaches that element's second spell (II) and third (IV). Restoration
        and Warding help the party instead of hurting foes. Intelligence,
        a little Luck and proficiency make casts land; a staff adds {Math.round(MAGIC.staffPower * 100)}% spell power.
      </p>
      {elements.map((element) => {
        const casts = elementCasts(hero, element);
        const next = nextRankAt(casts);
        return (
          <div key={element} className="mb-2 border-b border-white/5 pb-2 font-mono-g text-[10px]" data-testid={`spell-element-${element}`}>
            <div style={{ color: ELEMENTS[element].color }} className="font-bold">
              {ELEMENTS[element].name} · proficiency {ROMAN[proficiency(hero, element) - 1]}
              <span className="ml-2 font-normal text-slate-400">
                {next ? `${casts}/${next} casts` : "mastered"} · {Math.round(castSuccessChance(hero, element) * 100)}% to land
              </span>
            </div>
            <div className="text-[9px] text-slate-500">{ELEMENT_EFFECTS[element]}</div>
            <ul className="mt-1 space-y-0.5">
              {Object.entries(SPELLS).filter(([, spell]) => spell.element === element).map(([id, spell]) => {
                const has = known.has(id);
                const count = spellCasts(hero, id);
                const rankNext = nextRankAt(count);
                return (
                  <li key={id} className={has ? "text-slate-200" : "text-slate-600"}>
                    {spell.name} {has ? `· rank ${ROMAN[rankFor(count) - 1]} (${rankNext ? `${count}/${rankNext}` : "max"})` : spell.node ? `· needs ${spell.node}` : `· proficiency ${ROMAN[spell.unlock - 1]}`}
                    <span className="ml-1 text-slate-500">{spell.mana} mana · {spell.cooldown}s</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {slot.ok ? (
        <div className="mt-1" data-testid="learn-element">
          <div className="mb-1 font-mono-g text-[10px] text-fuchsia-200">
            {learned.length ? `Learn another element (${slot.cost} AP):` : "Choose an element (Elementalism):"}
          </div>
          <div className="flex flex-wrap gap-1">
            {SCHOOLS.filter((element) => !learned.includes(element)).map((element) => (
              <button key={element} type="button" onClick={() => onLearnElement?.(element)} data-testid={`learn-${element}`}
                className="min-h-9 rounded border px-2 font-mono-g text-[10px]" style={{ borderColor: `${ELEMENTS[element].color}88`, color: ELEMENTS[element].color }}>
                {ELEMENTS[element].name}
              </button>
            ))}
          </div>
        </div>
      ) : SLOT_REASONS[slot.reason] && (
        <p className="font-mono-g text-[9px] text-slate-500">Next element: {SLOT_REASONS[slot.reason](slot)}.</p>
      )}
      {slot.reason === "needs_elementalism" && (
        <p className="font-mono-g text-[9px] text-slate-500">Elementalism (A2) lets this hero choose an element.</p>
      )}
    </section>
  );
}
