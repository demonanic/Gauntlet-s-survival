# Gauntlet production checklist and architecture roadmap

This is a living document. It records what the architecture roadmap has done, what is next, and the rules every change must follow.

- **Claude** updates it at the end of every pass (every phase or PR on this roadmap): it ticks the boxes, records the evidence and adds a row to the pass log.
- **Copilot** keeps track of the checklist: on each roadmap PR it checks that this document was updated, that ticked boxes have evidence, and that the rules below were followed, and it points out anything that drifts. Copilot does not set the pace, approve phases or block work.
- **Sam** (the owner) decides the pace: Sam approves every phase before it starts and merges every PR. No phase begins on its own.

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
| 1 | Versioned save upgrades; an unreadable save is never silently overwritten | F4 | Done (#28, merged `30731da`) |
| 2 | Enemy-definition coverage tests | F3 (first step) | Done (#29, merged `57f9143`) |
| 3 | One fight-outcome builder for watched and unattended fights | F5 | Done (#30, merged `c6a07c7`) |
| 4 | Injectable, seedable randomness | F7 | Done, in review (#31) |
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

### Phase 1: Safe save upgrades (done)

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
- [x] Sam merged PR #28 (`30731da`); live site checked: the deployed bundle contains the backup key.

How to change the save format later: bump `STATE_VERSION` in `src/game/guild.js`, append one step to `SAVE_MIGRATIONS`, and add a fixture test that loads a save of the previous version. Never remove a step.

### Phase 2: Enemy coverage tests (done)

- [x] Identified the real set of active enemies: the 22 keys of `C.ENEMIES` (17 regular, 5 bosses). Spawn sources: region wildlife pools, region boss squads, elite rolls (lieutenant), the boss rotation, the Endless Rift pools and elites, ecology templates, the plain fodder and frontline lists, the stalker, and boss summons (`sim.makeMinion`).
- [x] Read the existing ecology and qualities tests first. They already check that ecology template slots name real enemies, and the squad limits; nothing checked the tables as a whole.
- [x] Every active enemy has a valid stat block (tier, boss flag, stats, color, affinities, ranges, shield), declared families and roles (or the documented boss default), and, in a short real fight, spawns through the real encounter builder, takes part in engine updates without errors, renders without errors, and only produces real enemies as summons during the 20 seconds observed. Tests: `src/game/enemies.test.js` (53). This does not prove that each enemy's own attack, ability or special behavior runs; that is out of scope for Phase 2 (see Phase 8B).
- [x] Pools and templates only name real enemies, and every enemy can appear in a fight. Orphaned references are reported below.
- [x] Report below separates missing data, intentional defaults, legacy, unreachable and uncertain entries.
- [x] No registry redesign. The only production change exports three existing lists so the tests can read them: `ENDLESS_POOLS` (`encounters.js`), `FODDER` and `FRONTLINE` (`ecology.js`). They are now frozen; nothing modifies them.
- [x] The tests catch mistakes: a misspelt enemy in a region pool, a missing role entry, and a new enemy with no tables or spawn source each made them fail (checked, then reverted).
- [x] Full suite: 29 files, 411 tests passed. Production build succeeded.
- [x] Sam merged PR #29 (`57f9143`); 411 tests pass on `main` after the merge.

Phase 2 report:

| Category | Entries |
| --- | --- |
| Missing data | None. Every enemy has a complete stat block and table entries. |
| Intentional defaults | Bosses have no behavior families or squad roles; `rolesOf` reads them as frontline. Enemies without a special handler use the engine's generic enemy update (9 types have special handlers in `_updateSpecialEnemy`; the others get type rules in `_updateEnemy` or the generic path). The generic body shape is the sprite fallback, but every one of the 22 enemies has its own sprite branch (checked by reading `_drawEnemySprite`). |
| Legacy | A `zombie` sprite branch in `_drawEnemySprite` (`engine.js`), with no `zombie` enemy anywhere. Unused legacy pools in `config.js`: `BASIC_POOL`, `SPEC_POOL`, `EARLY_WAVE_POOLS` (they name real enemies). For Phase 5. |
| Unreachable | None. Every enemy in `C.ENEMIES` can appear in a fight. |
| Uncertain | Boss summon types are written into the engine (`"bandit"`, `"skeleton"`, `"ghost"`), and `sim.makeMinion` silently turns an unknown type into a skeleton. The fight test records every summon and fails on an unknown type, but only for summons that happen within its 20 seconds. Candidate for Phase 6A (fail loudly). The engine's per-type behavior checks are string comparisons; a misspelt type there would not be caught by these tests. Phase 8B (behavior handlers) addresses that. |

### Phase 3: One fight-outcome builder (done)

- [x] Documented the outcome fields from both paths. Before Phase 3 both built the same 11 fields by hand: `victory`, `party`, `xpGains`, `gold`, `items`, `wavesCleared`, `downed`, `nemesisSlain`, `nemesisFled`, `clutches`, `spellCasts`. The engine's `onEnd` also gave `reason` and `killed` (dropped by both) and `xpGains.towers` (legacy, dropped). The two paths differed only in their edge cases: the Battle screen's engine-error result paid no gold or items; an unattended fight that hit the headless time limit (no engine result) kept its gold and items.
- [x] Tested that they matched before the refactor (`src/game/fightOutcome.test.js`, characterization block, written and passing on the old code): both mappings gave equal results for a real win, a real defeat and a real Endless Rift return, and for a synthetic result with every field set; and the same engine result fed through the old watched mapping and the unattended path gave the same expedition state.
- [x] One builder, `buildFightOutcome(result, sim)` in `src/game/fightOutcome.js`, used by `Battle.jsx` (`onEnd`, and `onError` with reason `"error"`) and by `autoFight` in `expedition.js`. `applyFightResult` is unchanged.
- [x] Renamed `_nemesisOutcome` to `_fightSummary` (`engine.js`): it returns downed, nemesis results, Clutch moments and spell casts, not only nemesis data. Rename only; no logic change.
- [x] Parity tests for every field: victory, reason, party, XP, gold, items, waves, kills, downed, nemesis slain and fled, clutches and spell casts; the time-limit and engine-error edge cases; the exact field list; the item list is a copy.
- [x] Watched and unattended paths given the same real engine result reach the same expedition state (win, defeat, Rift return), and the new path reaches the same state as the old watched mapping. Only `stats.autoFightSeconds` differs, by design.
- [x] The tests are not vacuous: the state comparison notices a one-gold difference, each case checks its ending and that the fight was counted, and three deliberate breaks of the builder (clutches dropped, downed dropped, error keeps loot) each failed tests (checked, then reverted).
- [x] A first run showed one rare failure (about 1 in 49 runs): the recorded fights used unseeded randomness. Fixed by seeding the case setup and recording; then 0 failures in 30 runs.
- [x] Full suite: 30 files, 434 tests passed. Focused suites (expedition, nemesis, clutch, spells, endgame, fight outcome, classless engine): 7 files, 132 tests passed. Production build succeeded.
- [x] Played in the browser (`npm run dev`, `?debug`): a watched ambush in the Gutter at 8× showed VICTORY, 3 slain, +14g, and after Continue the save had 1 fight, 14 gold of loot, 0 auto-fight seconds. An unattended fight left past the prompt timer resolved on its own: 1 fight, 12 gold, 5 auto-fight seconds. No page or console errors.
- [x] Sam merged PR #30 (`c6a07c7`); 434 tests pass on `main` after the merge, and the live site redeployed with it.

Canonical fight result (`buildFightOutcome`): `victory`, `reason` (`"cleared"`, `"returned"`, `"heroes"`, `"error"` or `null` for the time limit), `party`, `xpGains`, `gold`, `items`, `wavesCleared`, `killed`, `downed`, `nemesisSlain`, `nemesisFled`, `clutches`, `spellCasts`. `reason` and `killed` are new to the result; nothing in `applyFightResult` reads them, so behavior is unchanged.

Findings for later phases (no change made):

- An engine error in a watched fight is caught (`onError`) and the fight pays nothing; in an unattended fight, `simulateEncounter` calls `engine.update` directly, so the same error would be thrown out of `tick()` and the expedition would not advance. Candidate for Phase 7 (fight results) or Phase 8; needs Sam's call on the intended behavior.
- Only unattended fights record fight time (`stats.autoFightSeconds`); watched fights record none. Not part of the fight result.
- A headless fight that reaches the time limit (600 s, or 3600 s in the Rift) counts as a loss but keeps its gold and items; the result now says so explicitly (`reason: null`).
- The end-to-end parity fights have no Clutch moments, spell casts or nemesis results; those fields are covered by the unit tests with a full synthetic result.
- On the Battle screen at 8×, the throttled HUD can still read "1 enemies left" behind the VICTORY panel. Existing display behavior, not touched here.

### Phase 4: Seedable randomness (done, in review)

- [x] Inventoried every direct `Math.random` call and every call that skipped an available `rng` (live code, before the change):
  - `combat/engine.js`: 15 direct calls, and no way to pass a random source in.
  - `game/expedition.js`: 13 direct uses of `Math.random` in 7 places that ignored the trip's `rng` (leg cache, ambush spotting, nemesis trophy, quality development, legendary hoard, Scavenger, Field Surgeon), plus 4 helper calls that fell back to their `Math.random` default (end boss wave, two boss crystals, pet crate). Unattended fights never received the trip's `rng`.
  - `game/encounters.js`: loot drops (`sim.rollDrop`) and Endless Rift waves (`endlessWaveSource`) used `Math.random`.
  - Elsewhere, by design or out of scope, unchanged: gear and hero ids (clock + counter + an entropy suffix; identity, not gameplay); guild creation (starter hue, guild seed, starting traits and looks); player actions in the UI (recruit candidate, reforge, opening a crate, picking a hue); debug tools; loading old saves (traits for heroes without one); legacy modules (`logic.js`, `equipment.js`, `libraryResearch.js`, `perks.js`; Phase 5); watched fights on the Battle screen (still `Math.random`).
- [x] One random-source interface: an `rng` function returning [0, 1), as the game code already used. `src/game/random.js` provides `seededRandom(seed)` (the shop's existing mulberry32, moved there unchanged) and `defaultRandom` (reads `Math.random` on every call, so tests that replace `Math.random` still control it).
- [x] Threaded from encounter setup into the engine: `createEncounterSim(party, tier, wave, { rng })` stores it, the engine reads `sim.rng` (default `defaultRandom`), and loot drops and Rift waves use it. `simulateEncounter(..., { rng })` passes it on. Unattended fights get the trip's `rng`; `resolveEncounter(..., { rng })` takes one too (default `Math.random`). All of them (the 7 places and the 4 helper calls) now use the trip's `rng`; the only `Math.random` left in `expedition.js` is the default of the four entry points (`startExpedition`, `tick`, `choosePending`, `resolveEncounter`).
- [x] Balance scripts accept `--seed N` (`balance`, `scenarios`, `ranks`, via `applySeedFlag` in `scripts/simKit.js`). Checked: `scenarios --group party --trips 6 --regions frostfang --seed 7` twice gave identical output, seed 8 differed, and two unseeded runs differed; `ranks --ranks 0,5 --fights 2 --seed 7` and `balance --runs 1 --hours 1 --seed 7` were each identical across two runs.
- [x] Same seed and state give the same result (`src/game/random.test.js`, 13 tests): seeded wild, boss (with summons) and Rift fights repeat exactly and ignore `Math.random` entirely; different seeds give different fights; unseeded fights still follow `Math.random`; a whole seeded Gutter trip (12 unattended fights), a seeded Boneyard trip (retreat, nemesis created) and a seeded boss win (region clear, boss crystal, pet crate, Scavenger pickings, quality development) each come out identical with `Math.random` at 0.01 or 0.99 (gear ids, which carry the clock, excluded).
- [x] The tests catch a missed roll: putting `Math.random` back into the engine's classless crit, spawn lane or hero dodge, or into the expedition's leg cache, pet crate, boss crystal, Scavenger roll or quality development each made them fail (checked, then reverted).
- [x] Probabilities unchanged: with `Math.random` seeded identically, the previous `main` (`c6a07c7`, in a separate checkout) and this branch produced byte-identical results for four unattended trips (Gutter win, Boneyard and Frostfang retreats with nemeses, a Rift return), three direct fights (a defeat, one that hit the 600 s limit, a Rift return) and a shop rotation. In play every roll still calls `Math.random` at the same moment and in the same order.
- [x] The Phase 3 parity tests now give both paths the same `rng`, as the game does.
- [x] Full suite: 31 files, 447 tests passed (13 new). Production build succeeded.
- [ ] Sam merges the PR.

Findings (no change made):

- The seeded tests can only prove there's no bypass on paths they reach. Two rolls were not reached by any seeded fight: the Loaded Dice perk roll (no hero had the perk), and the crit roll in the non-classless body of `_applyHit`. The latter is supporting evidence for Phase 5: no ordinary fight reached it.
- Watched fights still use `Math.random`. Seeding them (for replays or bug reports) would need the Battle screen to pick a seed; not needed now.
- Gear and hero ids include the clock, so two seeded runs give the same results but different ids.
- Observed while choosing test cases: three level-10 heroes in starter gear lost or retreated in 12 of 12 seeded Boneyard trips, because the threat system (PR #25) scales enemies up for an over-levelled party. This is existing balance, not changed here; noted for Sam in case it isn't intended.

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

- Whether any live path reaches the non-classless body of `_applyHit` (Phase 5). Phase 4 found that no seeded wild, boss or Rift fight reached its crit roll.
- What an engine error in an unattended fight should do (today it would escape `tick()`); see the Phase 3 findings.
- Whether a misspelt type string in the engine's behavior or sprite branches would be noticed (only by reading the code until Phase 8B).
- The count of unused `config.js` exports is approximate; dynamic lookups would not show up (Phase 5).
- No performance measurements exist yet (Phase 10).
- The Supabase table and row-level security were not inspected.

## Pass log

| Date | Pass | PR | Result |
| --- | --- | --- | --- |
| 2026-10-31 | Architecture audit (analysis only) | (none) | 9 findings, F1–F9 |
| 2026-10-31 | Phase 0 baseline (no edits) | (none) | 341 tests pass, build passes, scenario baselines recorded |
| 2026-10-31 | Phase 1 safe save upgrades | #28 | 358 tests pass, build passes, browser-checked; merged `30731da`, live |
| 2026-10-31 | Phase 2 enemy coverage tests | #29 | 411 tests pass, build passes, tests shown to catch three kinds of mistakes |
| 2026-10-31 | Phase 2 review | #29 | Review passed (Sam). Test and roadmap wording corrected: the fight test shows engine participation, rendering and observed summons, not enemy-specific behavior. No gameplay change; 411 tests pass, build passes |
| 2026-10-31 | Phase 2 merged | #29 | Merged `57f9143`; 411 tests pass on `main` |
| 2026-10-31 | Phase 3 one fight-outcome builder | #30 | 434 tests pass, build passes, watched and unattended fights checked in the browser |
| 2026-10-31 | Phase 3 merged | #30 | Merged `c6a07c7`; 434 tests pass on `main`; live site redeployed |
| 2026-10-31 | Phase 4 seedable randomness | #31 | 447 tests pass, build passes; unseeded play byte-identical to `c6a07c7`; seeded scripts repeat exactly |
| 2026-11-01 | Phase 4 review | #31 | Review passed (Sam). README wording for unseeded runs made general (no variance figure). No code change |
