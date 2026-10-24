import { Engine } from "../combat/engine";
import { createEncounterSim } from "./encounters";

const STEP_SECONDS = 1 / 30;
const MAX_SECONDS = 600;

// Run one encounter without a canvas, the same way Demonanic's audit tests do.
// Used by tests and balance checks; live play goes through the Battle screen.
export function simulateEncounter(party, wave, { regionTier = 1 } = {}) {
  const sim = createEncounterSim(party, regionTier);
  let result = null;
  const engine = new Engine({ getContext: () => null }, sim, structuredClone(wave), {
    onEnd: (outcome) => { result = outcome; },
  });
  let elapsed = 0;
  while (!result && elapsed < MAX_SECONDS) {
    engine.update(STEP_SECONDS);
    elapsed += STEP_SECONDS;
  }
  return { result, sim, engine, elapsed };
}
