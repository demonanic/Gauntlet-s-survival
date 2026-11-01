// What a party does when nobody answers for it: the thresholds and the
// choices. Pure: these functions only decide; expedition.js carries the
// choice out (decideAlone, decideDeeper, autoFight). `partyHp` is passed as a
// function so it is only worked out when a rule needs it.
import { STORIES } from "./adventure";
import { DEEPER } from "./expeditionRun";

// When the party decides alone, it sneaks if the odds are at least this good,
// and only challenges an end boss with at least this share of its HP left.
export const AUTO_SNEAK_AT = 0.6;
export const AUTO_BOSS_HP = 0.5;
// An unattended Rift party heads home at 40% of its total HP.
export const RIFT_AUTO_RETURN_HP = 0.4;
// An unattended party this badly hurt tries to sneak past everything, and
// heads home with its loot after a fight that leaves it below the second line.
export const AUTO_CAUTIOUS_HP = 0.35;
export const AUTO_RETREAT_HP = 0.25;

// The party's answer to a waiting prompt (not "deeper"; see wantsToPushDeeper).
// Returns "decline" (merchant), "sneak", "leave", "fight", or a story option id.
export function autoChoice(pending, { partyHp, greedy }) {
  if (pending.kind === "story") return STORIES[pending.story].auto({ partyHp: partyHp(), greedy: greedy() });
  // Spending the guild's gold is the player's call, never the party's.
  if (pending.kind === "merchant") return "decline";
  if (pending.kind === "sighting" && (pending.sneakChance >= AUTO_SNEAK_AT || partyHp() < AUTO_CAUTIOUS_HP)) return "sneak";
  if (pending.kind === "boss" && partyHp() < AUTO_BOSS_HP) return "leave";
  return "fight";
}

// Left alone at the end of a trip: press on only while healthy and whole.
export function wantsToPushDeeper(party, depth, partyHp) {
  const gambler = party.some((hero) => hero.combat.hp > 0 && (hero.traits || []).some((trait) => DEEPER.gamblers.includes(trait)));
  const whole = party.every((hero) => hero.combat.hp > 0);
  return (depth || 0) < DEEPER.autoMaxDepth && whole
    && partyHp() >= (gambler ? DEEPER.gamblerPushHp : DEEPER.autoPushHp);
}

// An unattended Rift run heads home once the party's HP falls this low.
export function riftShouldReturn(engine) {
  const hp = engine.heroes.reduce((sum, hero) => sum + Math.max(0, hero.ref.hp), 0);
  return hp / engine.heroes.reduce((sum, hero) => sum + hero.d.maxHp, 0) < RIFT_AUTO_RETURN_HP;
}

// After an unattended fight: too battered to go on.
export function tooBatteredToGoOn(partyHp) {
  return partyHp < AUTO_RETREAT_HP;
}
