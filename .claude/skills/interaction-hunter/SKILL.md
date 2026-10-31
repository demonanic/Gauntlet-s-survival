---
name: interaction-hunter
description: Analyze Gauntlet mechanics for exploits, unintended feedback loops, broken scaling, unexpected combinations, and valuable emergent gameplay. Analysis-first; do not automatically remove interesting interactions.
---
# Interaction Hunter

Investigate combinations of mechanics that actually exist in the repository. Do not assume systems exist.

For each meaningful combination:
1. Identify participating mechanics.
2. Trace their implementations and order of operations.
3. Determine stacking, caps, resets, recursion, feedback loops, and resource flows where applicable.
4. Quantify consequences when repository data makes that possible.
5. Classify as BUG, EXPLOIT, BALANCE RISK, INTENDED SYNERGY, EMERGENT MECHANIC, or UNKNOWN.

Do not automatically fix an emergent interaction. Preserve potentially fun behavior for review unless it causes an obvious technical failure or the user explicitly requests a fix.

Report evidence, reproduction conditions, impact, and recommended next action.
