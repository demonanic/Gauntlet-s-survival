---
name: regression-guardian
description: Protect Gauntlet from regressions when modifying, refactoring, replacing, or removing existing behavior. Use before and after changes to established systems.
---
# Regression Guardian

Treat the repository as the source of truth. Never invent project structure or behavior.

## Before changing code
1. Locate and read the implementation.
2. Trace callers, consumers, shared state, configuration, and persistence touched by it.
3. Search for tests and dependent gameplay/UI systems.
4. Establish current behavior before changing it.
5. Identify likely edge cases and regression risks.

## Implement
- Make the smallest coherent change that satisfies the request.
- Do not rewrite unrelated systems.
- Do not silently change established gameplay behavior.

## Validate
1. Test the requested behavior.
2. Test the previous behavior that must remain valid.
3. Run relevant existing checks/tests.
4. Investigate failures rather than dismissing them.

## Report
Return: files changed; behavior changed; dependencies affected; validation performed; remaining risks; anything not verified.
