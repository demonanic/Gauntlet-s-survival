# Gauntlet production checklist and architecture roadmap

This is a living document. It records what the architecture roadmap has done, what is next, and the rules every change must follow.

- **Claude** updates it at the end of every pass (every phase or PR on this roadmap): it ticks the boxes, records the evidence and adds a row to the pass log.
- **Copilot** (and any human reviewer) reviews each roadmap PR against it. Flag a PR that breaks a rule below, skips a gate, ticks a box without evidence, or does work from a later phase.
- **Sam** (the owner) approves every phase before it starts. No phase begins on its own.

Source: the first architecture audit (October 2026) and Sam's roadmap built from it. The repository is the source of truth. Where this document and the code disagree, the code wins, and the document is corrected in the next pass.

## Rules for every roadmap PR

1. Start from current `main` and re-check the code before relying on the audit.
2. One coherent architectural change per PR.
3. Do not mix in new gameplay or balance changes.
4. Add characterization or regression tests before changing established behavior.
5. Do not delete code just because it looks unused. Prove it is unreachable (static, dynamic, test, tooling, fallback and old-save paths) first.
6. Run the full test suite (`npm test`) and the production build (`npm run build`) for every implementation PR.
7. When a change touches the path shared by watched and unattended fights, verify both.
8. Keep commits small and reversible.
9. If the code contradicts the audit, stop and report instead of forcing the plan.
10. Never start the next phase without Sam's explicit go-ahead.
11. Do not rewrite working architecture only for consistency or style.
12. Report measured facts separately from assumptions.

## Architecture to preserve

These were judged to work well. A PR that weakens one needs an explicit reason that Sam has accepted.

- [x] Game logic is pure functions over plain JSON state; mutators return `{ ok, state }`.
- [x] One `Engine` runs both watched (`screens/Battle.jsx`) and unattended (`game/simulate.js`) fights.
- [x] The party is cloned before a fight (`createEncounterSim`), so combat never mutates guild state.
- [x] Time away replays the same events as live play (`advanceExpedition`).
- [x] Balance scripts (`scripts/*`) import the real game modules.
- [x] UI components stay thin; game rules live in `src/game` and `src/combat`.
- [x] Small single-purpose content modules (`threat.js`, `regions.js`, `bonds.js`, `nemesis.js`, `ecology.js`).
- [x] Loading tolerates damaged or partial saves (field-by-field normalizing in `storage.js`).

## Phase status

| Phase | Goal | Audit finding | Status |
| --- | --- | --- | --- |
| 0 | Record a baseline | (all) | Done |
| 1 | Versioned save upgrades; an unreadable save is never silently overwritten | F4 | Done, in review |
| 2 | Enemy-definition coverage tests | F3 (first step) | Not started |
| 3 | One fight-outcome builder for watched and unattended fights | F5 | Not started |
| 4 | Injectable, seedable randomness | F7 | Not started |
| 5 | Legacy reachability investigation (no edits) | F2, F9 | Not started |
| 6 | Remove only verified legacy code, in small PRs | F2, F9 | Not started |
| 7 | Move fight results and rewards out of `expedition.js` | F6 | Not started |
| 8 | Split `combat/engine.js`: A renderer, B enemy behavior, C hero abilities and spells, D the rest if justified | F1, F3 | Not started |
| 9 | One definition per enemy; regional spawn data stays in regions | F3 | Not started |
| 10 | Measure performance before any optimization | F8 | Not started |
| 11 | Final architecture, regression and balance review | (all) | Not started |

## Phase checklists

### Phase 0: Baseline (done)

- [x] Branch and commit recorded, working tree clean (`471f8fd`, same as `origin/main`).
- [x] `npx vitest run`: 27 files, 341 tests passed.
- [x] Production build succeeded (built to a temp folder; existing chunk-size warning only).
- [x] Scenario baselines recorded (see Baseline measurements).
- [x] Test coverage mapped for saves, expeditions, watched and unattended outcomes, classless combat, enemies, fight results and catch-up.
- [x] Missing Phase 1 safety tests identified.

### Phase 1: Safe save upgrades (done, in review)

Decision (Sam): when a save can't be read, back it up and start fresh rather than refuse to play.

- [x] Ordered upgrade list `SAVE_MIGRATIONS` and runner `migrateSave` (`src/game/storage.js`). The save version stays 1; the list is empty.
- [x] `readGuild` reports why a load failed: `ok`, `upgraded`, `future` or `malformed`. `parseGuild` keeps its old contract (a guild or `null`).
- [x] Existing field-by-field normalizing is unchanged and still runs after any upgrade.
- [x] `loadSave` backs up an unreadable, damaged or newer-version save (`gauntlet.save.v1.backups`, newest 5, no duplicates) before starting a fresh guild.
- [x] If the backup can't be written, local autosave stays off for that session (`App.jsx`), so the original is untouched.
- [x] Players see a notice that says what happened and that a backup was kept.
- [x] Cloud: after a replaced local save, signing in always asks before anything is uploaded (`needsSaveChoice(..., localReplaced)`).
- [x] Local and cloud loads go through the same `readGuild` path.
- [x] Tests (`src/game/storage.test.js`, 17): current and early version-1 fixtures, the runner with fake steps (order, input unchanged, deterministic), missing or wrong steps, future version, damaged shapes, invalid JSON, backup, duplicate, cap of 5, failed backup, unreadable storage, cloud guard.
- [x] Full suite: 28 files, 358 tests passed. Production build succeeded.
- [x] Checked in a real browser: a good save loads untouched; newer-version and corrupted saves are backed up, show the notice and the game runs; no page errors.
- [ ] Sam merges the PR.

How to change the save format later: bump `STATE_VERSION` in `src/game/guild.js`, append one step to `SAVE_MIGRATIONS`, and add a fixture test that loads a save of the previous version. Never remove a step.

### Phase 2: Enemy coverage tests

- [ ] Identify the real set of active enemies.
- [ ] Read the existing ecology and qualities tests first.
- [ ] Every active enemy has stats, and families, roles and sprite or behavior paths where required, or a documented default.
- [ ] Pools and templates only name real enemies; orphaned references (such as the `zombie` sprite branch) are reported.
- [ ] Report separates missing data, intentional defaults, legacy, unreachable and uncertain entries.
- [ ] No registry redesign in this phase.

### Phase 3: One fight-outcome builder

- [ ] Document the outcome fields from `Battle.jsx` `finish()` and `expedition.js` `autoFight`.
- [ ] Test that they match today.
- [ ] One builder used by both paths; `applyFightResult` behavior unchanged.
- [ ] Rename `_nemesisOutcome` only if the new name fits its contents.
- [ ] Parity tests: victory, defeat, downed, clutches, spell casts, loot, nemesis fields, and any others found.

### Phase 4: Seedable randomness

- [ ] Inventory direct `Math.random` calls in expedition, encounters, engine, drops and their helpers.
- [ ] One random-source interface, defaulting to `Math.random`.
- [ ] Thread it from encounter setup into the engine; replace direct calls step by step.
- [ ] Balance scripts accept a seed.
- [ ] Same seed and state give the same result; probabilities unchanged.

### Phase 5: Legacy reachability (no edits)

- [ ] Trace `combat/logic.js`, `libraryResearch.js`, `equipment.js`, `perks.js`, class-hero branches, `classlessHeroRef`, the old drop and enemy fallbacks, and tower, castle and worker constants.
- [ ] Resolve whether any live path reaches the non-classless body of `_applyHit`.
- [ ] Check static, computed, dynamic, string-based, test-only and tooling references.
- [ ] Confirm whether any stored save can still hold a class hero.
- [ ] Removal manifest, each item marked LIVE, TEST-ONLY, TOOLING-ONLY, UNREACHABLE, FALLBACK or FUTURE-INTENT UNKNOWN.

### Phase 6: Remove verified legacy code

- [ ] 6A Remove unused fallbacks (fail loudly where a dependency is required).
- [ ] 6B Remove class-hero combat branches, only after proving every hero is classless.
- [ ] 6C Move the few live helpers to focused modules.
- [ ] 6D+ Delete orphaned files and constants, one group per PR.
- [ ] Each PR: imports resolve, tests and build pass, scenarios run, watched combat and save loading still work.

### Phase 7: Fight results out of `expedition.js`

- [ ] Dependency map of `applyFightResult`, `afterVictory`, `returnArrows`, `secondChance` and related helpers.
- [ ] Characterization tests before moving.
- [ ] Move without behavior change and without circular imports.
- [ ] Optional second step: the party's own decisions (`decideAlone`, `autoFight`, `AUTO_*`), only if the first move was clean.

### Phase 8: Split `combat/engine.js`

- [ ] 8A Renderer: drawing reads engine state only and decides nothing; unattended results unchanged.
- [ ] 8B Enemy behavior: per-enemy handlers, migrated in small groups with seeded behavior tests.
- [ ] 8C Hero abilities and spells: one family at a time, after characterizing cooldowns, costs, damage, effects and targeting.
- [ ] 8D Other responsibilities, each with its own design and PR.

### Phase 9: One definition per enemy

- [ ] Decide which fields belong to the enemy and which belong to the region.
- [ ] Add the registry alongside the old tables, migrate consumers, then remove the old tables.
- [ ] Enemy keys unchanged; Phase 2 coverage tests kept.

### Phase 10: Performance measurements

- [ ] Measure tick cost, state clone and save cost, state size, ordinary and worst catch-up, unattended fight and Rift duration, frame time with many enemies, memory growth.
- [ ] Propose changes only where measurements show a problem.

### Phase 11: Final review

- [ ] Re-run the architecture audit and compare with the first one.
- [ ] Preserved architecture still holds.
- [ ] Full suite, build, seeded balance scenarios, old and current save fixtures, watched versus unattended parity, performance numbers.
- [ ] Update the architecture docs and record anything deliberately deferred.

## Baseline measurements

Recorded in Phase 0 at `471f8fd`. Scenario results vary by about ±15% at 24 trips until Phase 4 makes runs seedable, so compare within that margin.

`npm run scenarios -- --group party --trips 24 --regions frostfang,blightmire` (unattended):

| Party | Frostfang wins / HP left | Blightmire wins / HP left |
| --- | --- | --- |
| Mixed (sword/bow/staff/sword) | 63% / 32% | 58% / 30% |
| All swords | 83% / 46% | 88% / 47% |
| All bows | 63% / 36% | 63% / 10% |
| All staves | 71% / 38% | 63% / 25% |
| Bows, two arrow stacks | 0% / 3% | 21% / 10% |
| Trio, duo, solo | 0% | 0% |

`npm run scenarios -- --group bosses --trips 16` (fresh party): every party beat the Boneyard, Frostfang, Ashen and Blightmire bosses 100% of the time except bows with two arrow stacks (94% at Frostfang, Ashen and Blightmire). The mixed party ended with 71–85% HP; fights took 46–356 seconds.

## Open decisions

None right now. New questions for Sam are listed here until answered.

## Known unknowns

- Whether any live path reaches the non-classless body of `_applyHit` (Phase 5).
- Whether any test checks that every enemy has a family, role and sprite (Phase 2).
- The count of unused `config.js` exports is approximate; dynamic lookups would not show up (Phase 5).
- No performance measurements exist yet (Phase 10).
- The Supabase table and row-level security were not inspected.

## Pass log

| Date | Pass | PR | Result |
| --- | --- | --- | --- |
| 2026-10-31 | Architecture audit (analysis only) | (none) | 9 findings, F1–F9 |
| 2026-10-31 | Phase 0 baseline (no edits) | (none) | 341 tests pass, build passes, scenario baselines recorded |
| 2026-10-31 | Phase 1 safe save upgrades | Pending | 358 tests pass, build passes, browser-checked |
