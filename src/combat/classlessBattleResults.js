import { serializeGameState } from "./heroModel";
import { awardClasslessXp } from "./classlessProgression";
import { classlessMaxHp } from "./classlessCombatEffects";

const classlessId = (hero) => !hero?.cls && hero?.combat && typeof hero.identity?.id === "string"
  ? hero.identity.id
  : null;

// Stage classless results on a disposable snapshot and resolve level/AP/SP
// through the shared threshold curve. Legacy class progression stays separate.
export function mergeClasslessBattleResults(state, { heroIds, runtimeHeroes, xpGains }) {
  if (!state || !Array.isArray(heroIds) || !Array.isArray(runtimeHeroes) ||
      !xpGains || typeof xpGains !== "object") throw new TypeError("Invalid battle result");

  const staged = serializeGameState(state);
  const roster = [...(staged.heroes || []), ...(staged.bench || [])];
  for (let index = 0; index < heroIds.length; index += 1) {
    const id = heroIds[index];
    const hero = roster.find((entry) => classlessId(entry) === id);
    if (!hero) continue;
    const runtime = runtimeHeroes[index];
    if (!runtime || !runtime.combat || !Number.isFinite(runtime.combat.hp) ||
        !Number.isFinite(hero.combat.maxHp) || classlessMaxHp(hero) <= 0 ||
        runtime.combat.hp < 0 || runtime.combat.hp > classlessMaxHp(hero) ||
        !hero.progression || !Number.isFinite(hero.progression.xp) || hero.progression.xp < 0) {
      throw new TypeError("Invalid classless runtime HP");
    }
    const xp = Number(xpGains[index] || 0);
    if (!Number.isFinite(xp) || xp < 0) throw new TypeError("Invalid classless XP award");
    hero.combat.hp = runtime.combat.hp;
    const awarded = awardClasslessXp(hero.progression, xp);
    if (!awarded.ok) throw new TypeError("Invalid classless progression XP state");
    hero.progression = awarded.progression;
    const rosterIndex = roster.indexOf(hero);
    roster[rosterIndex] = hero;
  }
  const activeCount = (staged.heroes || []).length;
  staged.heroes = roster.slice(0, activeCount);
  staged.bench = roster.slice(activeCount);
  return staged;
}
