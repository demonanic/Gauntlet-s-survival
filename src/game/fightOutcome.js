// The one place an engine fight becomes the fight result the expedition
// applies (applyFightResult in expedition.js). Watched fights (the Battle
// screen) and unattended fights (expedition autoFight) both build it here, so
// a new result field only has to be added once.
//
// `result` is what the engine passed to onEnd, or null if the fight hit the
// headless time limit without ending. `sim` is the encounter sim the engine
// fought with (createEncounterSim): its heroes, and the gold and items earned.
//
// Canonical fight result:
//   victory       boolean   the party won (or went home from the Rift)
//   reason        string|null  why the fight ended: "cleared", "returned",
//                            "heroes" (party down), "error" (engine failed
//                            on the Battle screen), or null (time limit)
//   party         hero[]    the runtime heroes, in engine order
//   xpGains       {index: xp}  XP the engine awarded each hero
//   gold          number    gold picked up in the fight
//   items         item[]    items dropped in the fight
//   wavesCleared  number    waves beaten before the end
//   killed        number    enemies slain
//   downed        {index: foe|null}  who brought each hero down
//   nemesisSlain  id|null   nemesis killed in this fight
//   nemesisFled   id|null   nemesis that escaped this fight
//   clutches      [{ hero, choice, landed }]  Clutch moments
//   spellCasts    {index: {spellId: count}}  successful casts per hero
//
// A fight the engine failed to finish pays nothing: its gold and items are
// dropped, as the Battle screen always did.
export function buildFightOutcome(result, sim) {
  const failed = result?.reason === "error";
  return {
    victory: !!result?.victory,
    reason: result?.reason ?? null,
    party: sim.heroes,
    xpGains: result?.xpGains?.heroes || {},
    gold: failed ? 0 : sim.gold,
    items: failed ? [] : [...sim.vault],
    wavesCleared: result?.wavesCleared || 0,
    killed: result?.killed || 0,
    downed: result?.downed || {},
    nemesisSlain: result?.nemesisSlain || null,
    nemesisFled: result?.nemesisFled || null,
    clutches: result?.clutches || [],
    spellCasts: result?.spellCasts || {},
  };
}
