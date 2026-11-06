// "How do I get more moves and spells?" for the battle panel: the perk moves a
// hero doesn't have yet (with what unlocks them), and the next spell in each
// of their elements (with cast progress). Reads the hero only.
import { PERK_MOVES, getUnlockedClasslessAbilities } from "./classlessAbilities";
import { getCanonicalNode } from "./classlessProgression";
import { ELEMENTS, RANK_CASTS, SPELLS, canCast, elementCasts, heroElements, knownSpells } from "./spells";

// Locked perk moves, the ones a hero could buy soonest first.
export function lockedMoves(hero) {
  const have = new Set(getUnlockedClasslessAbilities(hero).map((move) => move.id));
  return PERK_MOVES.filter((move) => !have.has(move.id))
    .map((move) => {
      const node = getCanonicalNode(move.unlockNodeId);
      return {
        id: move.id, name: move.name, branch: move.branch, nodeId: node.id, minLevel: node.minLevel, apCost: node.apCost,
        needs: node.prerequisites.map((id) => getCanonicalNode(id)?.name || id),
        anyPrerequisite: node.tier === 3,
      };
    })
    .sort((a, b) => a.minLevel - b.minLevel || a.apCost - b.apCost || a.name.localeCompare(b.name));
}

// One line per element the hero casts: the next spell and how far off it is.
// A hero with no spells gets null (the panel says how to start).
export function nextSpells(hero) {
  if (!canCast(hero)) return null;
  const known = new Set(knownSpells(hero).map((spell) => spell.id));
  return heroElements(hero).map((element) => {
    const next = Object.entries(SPELLS)
      .filter(([id, spell]) => spell.element === element && !known.has(id))
      .sort(([, a], [, b]) => (a.node ? 1 : 0) - (b.node ? 1 : 0) || a.unlock - b.unlock)[0];
    if (!next) return { element, name: ELEMENTS[element].name, color: ELEMENTS[element].color, done: true };
    const [id, spell] = next;
    const casts = elementCasts(hero, element);
    if (spell.node) {
      const node = getCanonicalNode(spell.node);
      return { element, id, spell: spell.name, name: ELEMENTS[element].name, color: ELEMENTS[element].color, perk: node?.name || spell.node, minLevel: node?.minLevel };
    }
    return {
      element, id, spell: spell.name, name: ELEMENTS[element].name, color: ELEMENTS[element].color,
      casts, needed: RANK_CASTS[spell.unlock - 1],
    };
  });
}
