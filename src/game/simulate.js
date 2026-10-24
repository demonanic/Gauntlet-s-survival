import { Engine } from "../combat/engine";
import { createEncounterSim, endlessWaveSource } from "./encounters";

const STEP_SECONDS = 1 / 30;
const MAX_SECONDS = 600;
const MAX_ENDLESS_SECONDS = 3600;

// Run one encounter without a canvas, the same way Demonanic's audit tests do.
// Used by tests and balance checks; live play goes through the Battle screen.
// `onStep(engine)` runs before every tick, e.g. to fire abilities like an active player.
// `endless` runs an Endless Rift fight; `shouldReturn(engine)` decides when to go home.
export function simulateEncounter(party, wave, { regionTier = 1, onStep = null, endless = false, shouldReturn = null } = {}) {
  const sim = createEncounterSim(party, regionTier, wave);
  let result = null;
  const engine = new Engine({ getContext: () => null }, sim, structuredClone(wave), {
    onEnd: (outcome) => { result = outcome; },
    ...(endless ? { nextWave: endlessWaveSource(sim) } : {}),
  });
  let elapsed = 0;
  const limit = endless ? MAX_ENDLESS_SECONDS : MAX_SECONDS;
  while (!result && elapsed < limit) {
    onStep?.(engine);
    if (endless && shouldReturn?.(engine)) engine.returnHome();
    if (result) break;
    engine.update(STEP_SECONDS);
    elapsed += STEP_SECONDS;
  }
  return { result, sim, engine, elapsed };
}
