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
10. Never start the next phase without Sam's explicit go-ahead. Sam may approve a batch of about three steps: one PR for the batch, one commit per step, each commit checked on its own (tests, build, byte-identity probe), and a stop after the batch for review.
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
| 4 | Injectable, seedable randomness | F7 | Done (#31, merged `af594dd`) |
| 5 | Legacy reachability investigation (no edits) | F2, F9 | Done (#32, merged `50bdf0f`) |
| 6 | Remove only verified legacy code, in small PRs | F2, F9 | In progress: 6A merged (#33); batch 1 (6B, 6C, 6D-1) merged (#34); batch 2 (6D-2, 6D-3, 6D-4) merged (#35); batch 3 (6D-5, Phase 7) merged (#36) |
| 7 | Move fight results and rewards out of `expedition.js` | F6 | Done (#36 `3aa2c7d`, #37 `3c8df41`) |
| 8 | Split `combat/engine.js`: A renderer, B enemy behavior, C hero abilities and spells, D the rest if justified | F1, F3 | Done (#48, #54–#57) |
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

### Phase 4: Seedable randomness (done)

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
- [x] Sam merged PR #31 (`af594dd`), with the README wording change from review; 447 tests pass on `main` after the merge, and the live site redeployed with it.

Findings (no change made):

- The seeded tests can only prove there's no bypass on paths they reach. Two rolls were not reached by any seeded fight: the Loaded Dice perk roll (no hero had the perk), and the crit roll in the non-classless body of `_applyHit`. The latter is supporting evidence for Phase 5: no ordinary fight reached it.
- Watched fights still use `Math.random`. Seeding them (for replays or bug reports) would need the Battle screen to pick a seed; not needed now.
- Gear and hero ids include the clock, so two seeded runs give the same results but different ids.
- Observed while choosing test cases: three level-10 heroes in starter gear lost or retreated in 12 of 12 seeded Boneyard trips, because the threat system (PR #25) scales enemies up for an over-levelled party. This is existing balance, not changed here; noted for Sam in case it isn't intended.

### Phase 5: Legacy reachability (no edits) (done)

The full manifest, with evidence for every item, is in `docs/LEGACY_MANIFEST.md`. No code was changed in Phase 5; runtime counters were added only in a throwaway copy of the repository and never committed.

- [x] Traced all of them:
  - **Legacy modules:** `logic.js`, `libraryResearch.js`, `equipment.js` and `perks.js` reach the app only through 6 names that `engine.js` imports (`heroDerived`, `makeSingleEnemy`, `rollEquipmentDrop`, `unlockedAbilities`, `getAbility`, `MAGE_SPELLS`), plus `createNewState` and `createHero` in three test files.
  - **Engine:** every class-hero branch, the adapters (`classlessHeroRef`, `classlessHeroDerived`, which are live), both sim fallbacks, towers, the revive API, `sim.morale` and the `zombie` sprite.
  - **`config.js`:** all 71 exports: 17 live, 36 used only by the legacy modules, 5 used only from unreachable engine code, 1 used only by another legacy export, 12 unused.
- [x] `_applyHit`'s non-classless body: it only damages enemies, and every hero hit is marked classless unless the hero itself is not classless. It ran 0 times in all tests, balance, ranks, scenarios and a watched fight. It is reachable only through a hero with a `cls` field.
- [x] References checked: static imports, named and `C.NAME` references, tests and tools. There are no dynamic `import()` calls and no computed `C[...]` lookups. Name collisions (for example `recruitHero`, `spend`) were checked against the actual imports.
- [x] Saves: no save Gauntlet wrote can hold a class hero. Since the first commit, heroes are created only with `createHeroModel`, and no commit writes `cls` from the game, UI or screens. A hand-edited save with `cls` on a hero does load (the loader keeps unknown fields), but the first fight then crashes in the legacy `heroDerived`. A watched fight blanks the page (there is no error boundary); an unattended fight throws out of `tick()`. So the class path doesn't work today, and removing it can't break anything that works.
- [x] Runtime evidence (instrumented copy):
  - full test suite (31 files, 447 tests);
  - `balance --runs 2 --hours 4` (two idle and two active playthroughs: full campaign plus 4 h endgame, boss rank 9, nemeses);
  - `ranks --fights 2 --active` (boss ranks 1–31);
  - `scenarios --trips 4`, idle with common gear and active with rare gear, all 7 groups each;
  - a watched fight in the browser.

  Only one legacy path ran: the `rollEquipmentDrop` fallback, twice, in `engine.classless.test.js`, whose hand-built sims have no `rollDrop`.
- [x] Removal manifest: 21 items, each classified (LIVE, TEST-ONLY, FALLBACK or UNREACHABLE; none TOOLING-ONLY). None is FUTURE-INTENT UNKNOWN, because `docs/DESIGN.md` ("Second trim pass") already records the intent to remove the tower, castle and economy code. The manifest also suggests a Phase 6 order: 6A fallbacks, 6B class heroes, 6C test fixtures, 6D dead code in five groups.
- [x] No code changed; full suite still 31 files, 447 tests; production build succeeded.
- [x] Sam reviewed and merged PR #32 (`50bdf0f`) and decided both open questions (see Decisions). Phase 6 proceeds one step at a time, starting with 6A only.

### Phase 6: Remove verified legacy code

The steps follow `docs/LEGACY_MANIFEST.md`. 6A was its own PR. From 6B on, Sam approves batches (rule 10): batch 1 = 6B, 6C, 6D-1; batch 2 = 6D-2, 6D-3, 6D-4; batch 3 = 6D-5 and Phase 7.

- [x] **6A: remove the sim fallbacks** (manifest items 4 and 5), merged.
  - The engine no longer falls back to the legacy `makeSingleEnemy` (`logic.js`) or `rollEquipmentDrop` (`equipment.js`). Its constructor now requires `sim.makeMinion` and `sim.rollDrop` and throws a clear `TypeError` naming the missing one. Both imports are gone, so `equipment.js` is now imported only by `logic.js`.
  - Both production paths (`simulate.js`, `Battle.jsx`) already build sims with `createEncounterSim`, which supplies both.
  - `src/combat/engine.classless.test.js`, the only file with hand-built sims (25, from `createNewState`), now builds them with a `testSim()` helper. Its `rollDrop` drops nothing, which changes no assertion because no test there checks drops. Its `makeMinion` throws, so an unexpected summon fails loudly.
  - New test: the engine refuses a sim missing either function, naming it, and accepts one with both.
  - Evidence:
    - Full suite: 31 files, 448 tests passed (1 new). That includes the Phase 2 enemy coverage, Phase 3 fight-outcome parity and Phase 4 seed tests.
    - Production build succeeded.
    - The Phase 4 probe (`Math.random` seeded identically, four unattended trips, three fights, a shop rotation) gave byte-identical output on `main` (`50bdf0f`) and this branch.
    - A watched fight in the browser (`npm run dev`) won, 3 slain, +12g, saved, no page errors.
  - [x] Sam merged PR #33 (`018271f`).
- [x] **6B: remove the class-hero paths** (items 1 and 3), batch 1, merged (#34, `ef819c4`).
  - Commit 1: `normalizeClasslessHero` drops a stray `cls` (Sam's decision). New save-fixture test: a save with `cls` on a hero loads as `ok`, every hero is classless, and the hero fights. With the fix removed the test fails.
  - Commit 2: the engine's class-hero branches are gone: legacy derived stats and mana, `perks.js` abilities and `MAGE_SPELLS`, legacy targeting, legacy hit and death handling, the legacy weapon sprite, and the `classless` flags. `useHeroAbility`, `_applyHit`, `getHeroSpellStatus` and `heroMovementSpeed` now take the classless path directly. The constructor throws a clear `TypeError` for a hero not built with the hero model. `engine.js` no longer imports `logic.js` or `perks.js`.
- [x] **6C: replace the legacy test fixtures** (item 6), batch 1, merged (#34). The engine, battle-result and progression tests build plain objects and hero-model heroes. No test imports `logic.js`. The two class-hero guard tests stay, with a small class-shaped hero.
- [x] **6D: delete dead code:**
  1. [x] towers, the unused sim fields and `xpGains.towers` (items 11, 14, 16), batch 1, merged (#34). Removed the tower and barricade arrays, every tower branch (Warlock drain, napalm splash, bolts, direct attacks), `_nearestTower`, `_selectTowerTarget`, tower XP, and the sim's `towers`, `barricades` and `buildings`. This also removed the 3 tower-loss morale writes (item 13).
  2. [x] the revive API and sim morale (items 12, 13), batch 2, merged (#35, `05eb19e`). Removed `reviveHero`, `reviveFallenHeroes` and `getFallenHeroRevivalOffer` (used only by `reviveFallenHeroes`; not named in the manifest), the 3 remaining `sim.morale` writes (hero defeat, boss kill, other kills), the `clamp` helper only they used, and the sim's `morale` field. The Gravebinder Ring rise (`hero.revived`) is live gear and stays. The `config.js` exports these used (`paidRevivalCost`, `RECOVERY`, `REVIVE_PROTECT_S`, `MORALE`) stay until 6D-5 (item 19).
  3. [x] the `zombie` sprite (item 15), batch 2, merged (#35, `05eb19e`). No other `zombie` reference remained.
  4. [x] the legacy modules (items 7–10), batch 2, merged (#35, `05eb19e`). Deleted `logic.js`, `libraryResearch.js`, `equipment.js` and `perks.js` (1,975 lines). Before deleting, nothing in `src/` or `scripts/` imported them except each other.
  5. [x] unused `config.js` exports (items 17–20), batch 3, merged (#36, `3aa2c7d`). Removed the 54 exports with no reference left after 6D-4; the 17 live exports (item 21) and the private `NORMAL_AFFINITIES` they use are unchanged. `config.js`: 424 → 150 lines.
- [ ] Each PR: imports resolve, tests and build pass, scenarios run, watched combat and save loading still work.
- Batch 1 evidence, per commit:
  - Full suite 449 tests pass after each commit (448 plus the save-fixture test). Production build passes.
  - Byte-identity probe (unseeded play with `Math.random` seeded identically): each commit identical to the one before; 6B identical to `018271f`. From 6D-1 on, the probe ignores the always-empty `xpGains.towers` key, which no longer exists.
  - Seeded active runs identical before and after: 6B (`scenarios --group party --trips 6 --active --gear rare --seed 11 --regions frostfang,blightmire`, `ranks --ranks 0,10,20 --fights 2 --active --seed 11`, `scenarios --group bosses --trips 3 --active --seed 12`) and 6D-1 (the `ranks` and `bosses` runs).
  - Browser, 6B: a save where every hero had `cls` loaded classless; a watched fight with manual taps won (3 slain, +21g), saved, no page errors.
  - Not done: the watched fight in the browser after 6D-1. Sam merged #34 without it; it is still owed (see batch 2).
- Batch 2 evidence, per commit (measured):
  - Every relative import in `src/` and `scripts/` resolves, and every file passes `node --check`, after each of the three commits.
  - `getFallenHeroRevivalOffer`, `reviveHero`, `reviveFallenHeroes`, `sim.morale` and `zombie`: no reference left in `src/` or `scripts/`.
- Batch 2, not yet run: the npm registry could not be reached from this session, so dependencies could not be installed. Tests, build, the byte-identity probe, seeded active runs and the browser check have not run here. CI runs tests and build on the PR head only. Expected for the probe: 6D-2 changes the `sim` objects in the probe output (no `morale` key, previously 50 plus kill and death deltas); everything else identical. 6D-3 and 6D-4 identical.

### Phase 7: Fight results out of `expedition.js`

- [x] Dependency map of `applyFightResult`, `afterVictory`, `returnArrows`, `secondChance` and related helpers (batch 3, measured from the code at `05eb19e`):
  - The fight-result cluster is `applyFightResult` (lines 1133–1286), `afterVictory`, `secondChance`, `halveLoot`, `returnArrows`, `settleNemeses` and `downedBy`. Outside callers: `applyFightResult` ← `autoFight`, `resolveEncounter`; `returnArrows` ← `reachEnd`, `tendCamp`. The rest are called only from inside the cluster.
  - The cluster calls these from the rest of `expedition.js`: `addFeed`, `livingParty`, `road`, `changeMorale`, `heal`, `closePending`, `findHero`, `heroId`, `pick`, `randomBetween`, `firstName`, `riftBounty`, `completeExpedition` and `offerDeeper` (which needs `openPending`, `deeperDanger` and `DEEPER`). All of these are also used by the road, camp, stalker and story code that stays.
  - So a plain move of the cluster into a new module makes a circular import (each module would import the other). Avoiding it means also moving the shared run helpers, or passing `completeExpedition` and `offerDeeper` in. Sam chose a shared helpers module.
- [x] Characterization tests before moving: `src/game/fightResults.characterization.test.js`, 15 cases. Eleven drive `resolveEncounter` with fixed outcomes through every `applyFightResult` branch (win, win with a hero down, defeat, a second chance on a road fight and on a boss, boss win, rotating boss win, legendary win, nemesis slain by its victim, Rift return, Rift overrun); four play whole unattended trips (gutter, boneyard, frostfang, rift) with one seeded rng. Each case first checks it reached its branch, then compares a hash of the whole guild state (hero and gear ids removed) with one recorded in CI on the unmoved code. Passed in CI on that code (464 tests), twice with the same hashes.
- [x] Move without behavior change and without circular imports (batch 3, merged `3aa2c7d`):
  - `src/game/fightResults.js`: `applyFightResult`, `afterVictory`, `secondChance`, `settleNemeses`, `downedBy`, `riftBounty`, `AFTER_FIGHT_HEAL`.
  - `src/game/expeditionRun.js`: the helpers both need: `addFeed`, `livingParty`, `road`, `changeMorale`, `heal`, `openPending`, `closePending`, `offerDeeper`, `returnArrows`, `halveLoot`, `completeExpedition`, `heroId`, `findHero`, `pick`, `randomBetween`, `firstName`, `DEEPER`, `deeperDanger`, `deeperRegion`.
  - `expedition.js` (1,393 → 986 lines) imports both and re-exports `DEEPER`, `deeperDanger`, `deeperRegion` and `riftBounty`, so no caller changed.
  - Evidence: every original non-import line of `expedition.js` appears exactly once across the three files (compared as line multisets); the only new lines are imports, `export` keywords and two header comments. Every name used in each file is declared or imported there, and every imported name exists in its module. No import cycle through any of the three files. CI: 464 tests pass with all 15 characterization hashes unchanged; build passes.
  - Not run (npm registry unreachable from this session): the byte-identity probe, seeded active runs and the browser check.
- [x] Optional second step: the party's own decisions (`decideAlone`, `autoFight`, `AUTO_*`), only if the first move was clean. Merged (#37, `3c8df41`).
  - Found: `decideAlone` sends each prompt to the same answer functions `choosePending` uses (`attemptSneak`, `leaveFight`, `resolveStory`, `tradeWithMerchant`, `pushDeeper`/`headHome`), which reach about 15 more helpers. Moving `decideAlone` and `autoFight` out by themselves would make a circular import. Sam chose to move only the policy.
  - Characterization first: `src/game/partyDecisions.characterization.test.js`, 11 cases. Each leaves one prompt unanswered with nobody watching and lets `tick` decide: a sighting with good odds, badly hurt, or healthy with poor odds; an end boss worn down or healthy; a merchant; a story healthy and badly hurt; pushing deeper healthy, with a hero down, and worn down. Each checks its branch, then compares a state hash recorded in CI on the old code (two runs, same hashes).
  - Moved to `src/game/partyDecisions.js`: `AUTO_SNEAK_AT`, `AUTO_BOSS_HP`, `AUTO_CAUTIOUS_HP`, `AUTO_RETREAT_HP`, `RIFT_AUTO_RETURN_HP`, and pure functions `autoChoice`, `wantsToPushDeeper`, `riftShouldReturn`, `tooBatteredToGoOn`. `decideAlone`, `decideDeeper` and `autoFight` stay in `expedition.js`, ask these, and carry out the answer. Party HP is passed as a function so it is worked out only where the old code did. `partyDecisions.js` imports only `adventure.js` and `expeditionRun.js`.
  - Evidence: CI 475 tests pass; all 26 characterization hashes (15 fight results, 11 decisions) unchanged; build passes. Names and imports resolve in both files. Not run here: the byte-identity probe, seeded runs, browser.

### Phase 8: Split `combat/engine.js`

- [x] 8A Renderer: drawing reads engine state only and decides nothing; unattended results unchanged.
  - Drawing fingerprint (`src/combat/render.characterization.test.js`): five seeded fights (Gutter, Boneyard boss, Frostfang, Ashen boss, Blightmire) played 900 frames each on a fake canvas that records every drawing call (about 100,000 to 290,000 calls per fight, with spells, spell effects, familiars, callouts and hit-stop); the hash of each record was taken in CI on the code before the move, twice, with the same result.
  - The hero's last drawn position (walk cycle) moved off the hero into the drawing code; a test checks that drawing five frames leaves the fight's state unchanged.
  - The battle scene, callout and familiar drawing (`render/battleRenderer.js`), hero sprites (`render/heroSprites.js`) and enemy sprites (`render/enemySprites.js`) left `engine.js`; `render()` hands over to `renderBattle(engine)`. Arena size in `arena.js`. Two drawing helpers nothing called were removed (`_glowShape`, `_bracketSquare`).
  - `_hud()` stays in the engine: it reports numbers to the Battle screen during updates, not drawing. `_drawArrow` stays too: despite its name it spends arrows.
  - After each step: all five drawing fingerprints and all 26 fight-result hashes unchanged; `engine.js` 4,569 → about 3,790 lines.
- [x] 8B Enemy behavior: per-enemy handlers, migrated in small groups with seeded behavior tests. First batch (#54), second batch (#55):
  - Enemy behavior fingerprint (`src/combat/enemyBehavior.characterization.test.js`): 39 seeded fights (every enemy type alone, a real squad from each region, one with a Stonebark Tortoise, every boss, all four champion powers on bosses that use them), hashing what enemies, heroes, shots and familiars do every 6 frames. Recorded in CI before anything moved. Checked by changing behaviors on purpose: changes to the Priest, Bulwark, hunters, Watcher, Sapper, Blitz, Warlock, each boss ability, enrage, all four champion powers and the familiar taunt were each caught.
  - The eight special roles moved to `combat/enemies/roles.js` (an ordered list; the first match takes the turn, as before); boss abilities, champion powers and the Warlock's mage hunt to `combat/enemies/abilities.js`; their numbers to `combat/enemies/tuning.js`. A test pins which role each enemy type gets. After each step: all 39 behavior fingerprints, the drawing fingerprints and the fight-result hashes unchanged; `engine.js` 3,932 → 3,820 lines (4,161 before 8B, which also counts the battle log hooks added since 8A).
  - Second batch (#55): the enemy turn (`enemyTurn`: the common advance-and-attack turn; `roleTurn`, the role dispatch; `fleeTurn`, `turncoatTurn`, `nemesisTick`, `tacticalTarget`) moved to `combat/enemies/turn.js`, called as functions. Sixteen enemy-side methods (`_engage`, `_enemyAttack`, `_enemyHitPet`, enemy bolts and their landing, bombs, a Sapper's blast, `_lobTarget`, `_nearestDefender`, healing, raising, a Bulwark's ward and cover, `_vampiric`) moved to `combat/enemies/attacks.js`; they stay engine methods (mixed into `Engine.prototype`) because heroes, spells and tests call them by name. Bulwark, backstab-window and boss-melee numbers moved to `enemies/tuning.js`. After each step: all 39 behavior fingerprints and every other hash unchanged; `engine.js` 3,820 → 3,294 lines.
  - For 8D: `roundRect` at the end of `engine.js` is no longer used (drawing moved out in 8A).
  - Found while moving, then changed on Sam's call: the common turn's Reaper and Dark Elf peel-and-attack branch never ran (their roles take the turn whenever a hero can be targeted, and the branch needs one), so it was removed; their move speed and familiar-attack timing there stay, as they still apply when no hero can be targeted. Fingerprints unchanged. A Vampiric Imperial Necromancer never healed (it summons and lobs bombs and lands almost no hits itself); now any Vampiric boss also heals 0.5% per hit its summoned minions land (summons remember their `master`). Only the two Vampiric fingerprints changed, re-recorded.
- [x] 8C Hero abilities and spells: one family at a time, after characterizing cooldowns, costs, damage, effects and targeting (#56).
  - Hero moves and spells fingerprint (`src/combat/heroActions.characterization.test.js`): 19 seeded fights in which every special move (16) gets fired and every spell (36) gets cast: each perk branch's moves fired as they come ready, the starter moves, every school pair on auto, and spells by hand (queue, holds, marked targets, one on a boss). Heroes (cooldowns, mana, cast state, statuses), enemies, shots, familiars, meteors and pop-ups hashed every 6 frames; recorded in CI before anything moved. Checked by changing things on purpose: the cast swing, strain, the queue cap, hexes on bosses, Expose, Dominate, the shield cap, weakest-foe auto bolts, Smoke Bomb and Cleaving Strike's splash were each caught. (Test heroes carry arrows; the staff hero in move fights has Arcane Spark for Mana Surge.)
  - Spells (37 methods) moved to `combat/heroes/spells.js`, special moves (10 methods) to `combat/heroes/moves.js`, with the constants only they use; both stay engine methods (mixed into `Engine.prototype`) because the battle screen, enemy code, scripts and tests call them by name. After each step: all 19 hero fingerprints, all 39 enemy fingerprints and every other hash unchanged; `engine.js` 3,294 → 2,304 lines.
- [x] 8D Other responsibilities (#57, plan approved by Sam): familiars → `combat/heroes/familiars.js`; quick slots and arrows → `heroes/quickSlots.js`; Clutch → `heroes/clutch.js` (`engine.js` still exports `CLUTCH`); party orders and their targeting helpers → `heroes/orders.js`; hero and enemy body radii → `arena.js`; the unused `roundRect` removed. All engine methods, mixed into `Engine.prototype`. After each step: all 58 behavior fingerprints, the drawing fingerprints and the fight-result hashes unchanged.
  - Phase 8 result: `engine.js` 4,569 → 1,748 lines. What stays: the constructor, the frame-by-frame update, the heroes' own attacks and damage pipeline, targeting, collisions, the HUD numbers, the end-of-fight check and the battle-log hooks. Drawing is in `combat/render/`, enemy behavior in `combat/enemies/`, hero spells, moves, familiars, quick slots, Clutch and orders in `combat/heroes/`.

### Phase 9: One definition per enemy

- [ ] Decide which fields belong to the enemy and which belong to the region.
- [ ] Add the registry alongside the old tables, migrate consumers, then remove the old tables.
- [ ] Enemy keys unchanged; Phase 2 coverage tests kept.

### Phase 10: Performance measurements

- [x] Measure tick cost, state clone and save cost, state size, ordinary and worst catch-up, unattended fight and Rift duration, frame time with many enemies, memory growth. Measured 2026-11-06 at `67714bf` (headless under bun on the session's Linux machine, and the CI build in headless Chromium at 412×760; a phone will be slower, by an unknown factor). A mid-game guild: 8 heroes at LV18, 42 vault items, pets, careers, three casters.
  - **Save:** state 42.5 KB (54.5 KB after 30 more trips); clone 0.22 ms, `JSON.stringify` 0.09 ms, `JSON.parse` 0.10 ms.
  - **Tick** (every 500 ms): 0.16 ms at the guild; during a trip median 0.26–0.32 ms, but a tick that settles an unattended fight takes as long as the fight's simulation: 107–281 ms seen (p99 3 ms in Ashen, where most ticks had none).
  - **Unattended fights:** Blightmire wild (deep) median 159 ms (a 141 s fight), max 540 ms; Ashen boss median 86 ms (95 s); a Rift run to wave 9 (194 s) 237 ms.
  - **Catch-up** (app closed for a whole 20–30 min trip, then opened): one tick of 178 ms (Ashen) to 309 ms (Blightmire).
  - **Memory:** heap 7 → 8 MB over 30 back-to-back trips (no growth to speak of); 10.6–11.9 MB in the browser during a battle.
  - **Frame rate** in a Blightmire battle (headless Chromium, no GPU): 44 fps; 9 fps with the CPU slowed 4×, every frame a long task. JavaScript (engine and drawing code) was under 3% of the time; the rest was the browser painting the canvas. With canvas glow (`shadowBlur`) turned off: 60 fps, and 31 fps at 4× slower.
- [ ] Propose changes only where measurements show a problem. Two candidates, for Sam (not built): (1) the canvas glow is most of the drawing cost without a GPU; test mode now shows frames per second in battle so it can be checked on a real phone, and if it's low there, glow could thin out with frame rate the way particles already do (`VFX_QUALITY`); (2) an unattended fight runs inside one tick, a pause of a few hundred ms here (likely 1 s or more on a phone) when the party fights alone while the app is open, and at catch-up; fights could be spread over several ticks.

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

New questions for Sam are listed here until answered. None open right now.

Decisions (Sam, 2026-11-01, reviewing Phase 5):

1. **Saves with a `cls` hero:** save loading will drop an unexpected `cls` field, so such a hero loads as an ordinary classless hero. Done in Phase 6B, with a save-fixture test, just before the class branches are removed.
2. **Error boundary:** not part of Phase 6. It will be a separate reliability PR with its own design: what the player sees, whether the fight can be retried, keeping the save safe, copying an error report, and what an unattended fight should do on an engine error (the Phase 3 finding).

## Known unknowns

- What an engine error in an unattended fight should do (today it would escape `tick()`); see the Phase 3 findings.
- Whether a misspelt type string in the engine's behavior or sprite branches would be noticed (only by reading the code until Phase 8B).
- Performance on a real phone (Phase 10 measured a headless browser and a Linux machine only; test mode shows FPS in battle).
- The Supabase table and row-level security: inspected 2026-11-06 (PR #61). Each player reaches only their own save; leftover default grants revoked. Leaked-password protection (an Auth dashboard setting) is off.

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
| 2026-11-01 | Phase 4 merged | #31 | Merged `af594dd`; 447 tests pass on `main`; live site redeployed |
| 2026-11-01 | Phase 5 legacy reachability (no edits) | #32 | Manifest in `docs/LEGACY_MANIFEST.md`; legacy class, tower, revive and fallback paths never ran in tests, tools or a watched fight; a crafted `cls` save crashes |
| 2026-11-01 | Phase 5 scenario evidence | #32 | Both instrumented scenario runs (idle common, active rare; all 7 groups) recorded 0 legacy hits |
| 2026-11-01 | Phase 5 merged | #32 | Merged `50bdf0f`; both open decisions settled |
| 2026-11-01 | Phase 6A sim fallbacks removed | #33 | 448 tests pass, build passes, unseeded play byte-identical to `50bdf0f`, watched fight checked |
| 2026-11-01 | Phase 6A merged; batching approved | #33 | Merged `018271f`. Sam approved batches of about three steps (rule 10) |
| 2026-11-01 | Batch 1: 6B, 6C, 6D-1 | #34 | 449 tests pass and build passes after each commit; unseeded play byte-identical; seeded active runs identical; a `cls` save now loads and fights |
| 2026-11-01 | Batch 1 merged | #34 | Merged `ef819c4` (squash). The watched fight after 6D-1 was not run before merge |
| 2026-11-01 | Batch 2: 6D-2, 6D-3, 6D-4 | #35 | Imports resolve and syntax passes after each commit. Tests, build, probe, seeded runs and browser not run (npm registry unreachable from this session); CI covers tests and build on the head |
| 2026-11-01 | Batch 2 merged | #35 | Merged `05eb19e` (squash) on CI alone (449 tests, build) |
| 2026-11-01 | Batch 3: 6D-5 and Phase 7 | #36 | 6D-5: all `config.js` references resolve, CI 449 tests. Phase 7: 15 characterization cases recorded on the old code, then the move; CI 464 tests, hashes unchanged. Probe, seeded runs and browser not run |
| 2026-11-01 | Batch 3 merged | #36 | Merged `3aa2c7d` (squash) on CI |
| 2026-11-01 | Phase 7 second step: party decisions | #37 | 11 characterization cases recorded on the old code, then the policy moved to `partyDecisions.js`; CI 475 tests, all 26 hashes unchanged. Probe, seeded runs, browser not run |
| 2026-11-01 | Phase 7 second step merged | #37 | Merged `3c8df41` (squash) on CI. Sam paused the roadmap here for feature work (special moves and spells; plan in DESIGN.md) |
| 2026-11-05 | Phase 8A renderer out of the engine | #48 | Drawing fingerprints (five seeded fights) recorded in CI before the move; unchanged after each of three steps, as are the 26 fight-result hashes |
| 2026-11-05 | One spell at a time (feature, not a phase) | #50 | Engine step: CI 566 tests; only the five drawing fingerprints changed, and they match main with the old numbers; re-recorded. Battle screen step: CI 566 tests, build |
| 2026-11-05 | One spell at a time merged | #50 | Merged `668d570` (squash) on CI |
| 2026-11-05 | Spells part 2: hexes (feature) | #51 | CI per commit (576–577 tests, build); fight-result and drawing hashes unchanged. Single-target hexes measured neutral; Sam chose area hexes (elites full, bosses half), measured a small gain |
| 2026-11-05 | Spells part 2 merged | #51 | Merged `59239b8` (squash) on CI |
| 2026-11-05 | Spell targets (feature) | #52 | CI 582 tests, build; hashes unchanged. Next per Sam: the battle log, then Phase 8B-8D |
| 2026-11-05 | Spell targets merged | #52 | Merged `d7471d5` (squash) on CI; adds weakest-foe auto bolts (Sam: yes), drawing hashes re-recorded for it |
| 2026-11-05 | Battle log (feature) | #53 | CI 589 tests, build; every characterization hash unchanged. Next per Sam: Phase 8B-8D |
| 2026-11-05 | Battle log merged | #53 | Merged `3917494` (squash) on CI; includes the battle field fix (field keeps half the screen) |
| 2026-11-05 | Phase 8B first batch | #54 | Behavior fingerprint (39 cases) recorded in CI; roles and abilities moved; after each step every fingerprint and hash unchanged. Plus (Sam): dead Reaper/Dark Elf branch removed (fingerprints unchanged), Vampiric minions feed their master (two Vampiric fingerprints re-recorded); CI 632 tests |
| 2026-11-06 | Phase 8B first batch merged | #54 | Merged `95e8c3b` (squash) on CI |
| 2026-11-06 | Phase 8B second batch | #55 | Enemy turn and enemy attacks moved; after each step every fingerprint and hash unchanged; CI 632 tests. 8B done |
| 2026-11-06 | Phase 8B second batch merged | #55 | Merged `dac4769` (squash) on CI |
| 2026-11-06 | Phase 8C | #56 | Hero fingerprint (19 cases) recorded in CI; spells and moves moved; after each step every fingerprint and hash unchanged; CI 651 tests |
| 2026-11-06 | Phase 8C merged | #56 | Merged `f05d80f` (squash) on CI |
| 2026-11-06 | Phase 8D | #57 | Familiars, quick slots, Clutch and party orders moved; every fingerprint and hash unchanged after each step; CI 651 tests. Phase 8 done |
| 2026-11-06 | Phase 8D merged | #57 | Merged `d7e02c7` (squash) on CI. Phase 8 done |
| 2026-11-06 | Spells part 3 (feature) | #58 | Enchanting and two wards; measured three times, reshaped on Sam's calls (longer buffs, wards after Barrier, party-wide Haste and True Aim); one hero fingerprint re-recorded (its Warding caster gained two spells) |
| 2026-11-06 | Spells part 4 (feature) | #59 | Conjuration (Spectral Blades, Summon Elemental) and Mirror Self; measured, retuned on Sam's picks (blades 15%, stronger cheaper elemental, Mirror Self 60% fooling every non-boss foe); one new hero fingerprint, three re-recorded (their Shadow V casters gained Mirror Self) |
| 2026-11-06 | Test tools (feature) | #60 | `?debug` gets its own save (no cloud sync), magic tools, test fights and battle cheats; checked on a phone-sized screen; two fixes from that check |
| 2026-11-06 | Reliability batch + Phase 10 measurements | #61 | Cloud save security checked (row-level security correct; leftover default grants revoked by a migration); HUD stale at 8× fixed; Phase 10 measured (canvas glow is most of the frame cost without a GPU; unattended fights pause a tick); test-mode FPS readout |
| 2026-11-07 | Combos (feature) | #62 | Five reactions with their own animations; retuned stronger but rarer on Sam's call; "fire and ice" and "mind and shadow" fingerprints re-recorded |
| 2026-11-07 | Zombies and hordes (feature) | #63 | Zombie enemy (hordes only), random unavoidable hordes from Frostfang on with a chest, a Horde now test button; measured hard, two easier versions measured for Sam; new "zombie" enemy fingerprint, "unattended trip, frostfang" re-recorded |
| 2026-11-07 | The Dead March (feature) | #64 | An endless run of hordes beside the Rift; record, chests, test button; measured against the Rift; fingerprints unchanged |
| 2026-11-07 | Staff shards (feature) | #65 | Four staff-only crystals; in drops, Market and chests; measured (Focus, Fury like Ember; Reach, Wellspring near neutral); two fingerprints re-recorded (random crystals pick from 16 kinds) |
| 2026-11-08 | Expeditions tab fix | #66 | The board crashed while the Dead March was locked (no previous region for it); a render test of the board |
| 2026-11-08 | Free Roam (feature) | #67 | Every wave a faction squad with a horde layer and an event card; record, chests, test button; measured against the Rift and the March; fingerprints unchanged |
