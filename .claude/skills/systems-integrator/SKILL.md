---
name: systems-integrator
description: Integrate new or changed Gauntlet mechanics across the real systems they affect, including gameplay, UI, progression, persistence, economy, enemies, and configuration.
---
# Systems Integrator

Do not treat a mechanic as isolated. Inspect the repository and trace actual connections.

For each relevant system, classify the interaction as REQUIRED, OPTIONAL, UNAFFECTED, or RISK. Consider only systems that actually exist, such as combat, player stats, enemies, progression, items, abilities, status effects, economy, rewards, difficulty, UI, feedback, persistence, game state, and configuration.

## Workflow
1. Locate the mechanic and its source of truth.
2. Trace producers, consumers, state transitions, and persisted data.
3. Build an impact map before substantial changes.
4. Implement all REQUIRED integrations without inventing new subsystems.
5. Validate the complete gameplay path, not only the new component.
6. Report affected systems, decisions, tests, and unresolved risks.
