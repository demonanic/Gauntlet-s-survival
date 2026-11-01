# Legacy reachability manifest (roadmap Phase 5)

Phase 5 of `docs/ROADMAP.md`: which code vendored from Demonanic is still reachable in Gauntlet, with the evidence. **This is a list, not a change.** Nothing was edited or deleted in Phase 5. Phase 6 removes only what Sam approves from this list, in small PRs.

Investigated at `af594dd` (`main` after Phase 4).

## How reachability was checked

1. **Static imports.** Every `import` of the legacy modules (`combat/logic.js`, `combat/libraryResearch.js`, `combat/equipment.js`, `combat/perks.js`) in `src/` and `scripts/`, separating live code, tests and tools.
2. **Every export, by real reference.** Each export of the legacy modules and of `combat/config.js` was matched against `C.NAME` accesses, named imports and plain name references across the repository. Name collisions (for example `recruitHero` or `spend`, which also exist in Gauntlet's own code) were checked by hand against the actual import statements.
3. **Computed, dynamic and string lookups.** There are no dynamic `import()` calls and no computed lookups into `config.js` (`C[...]`) anywhere.
4. **Saves.** How a stored hero is loaded (`normalizeClasslessHero`), and the git history of every place that creates heroes (all 115 commits).
5. **Runtime instrumentation, in a throwaway copy of the repository (never committed).** Counters were put on every entry into:
   - the engine's class-hero path;
   - the non-classless body of `_applyHit`;
   - `_legacyInterposedDamage`;
   - the class ability and mage spell paths;
   - the two sim fallbacks;
   - tower hits;
   - the `zombie` sprite.

   The instrumented copy then ran:
   - **Tests:** the full suite, 31 files and 447 tests.
   - **`npm run balance -- --runs 2 --hours 4`:** two idle and two active playthroughs, each a full campaign plus 4 hours of endgame, reaching boss rank 9, with nemeses created.
   - **`npm run ranks -- --fights 2 --active`:** boss ranks 1–31.
   - **`npm run scenarios -- --trips 4`**, idle with common gear and active with rare gear, every group. *Still running when this was first committed; its result is added below when it finishes.*
   - **Browser:** a watched fight played in `npm run dev`.
   - **A crafted save:** one hero given a `cls` field, played both watched and unattended.

## Runtime results

| Instrumented path | Tests (447) | Balance and ranks | Watched fight | Crafted `cls` save |
| --- | --- | --- | --- | --- |
| Engine class-hero path (`isClasslessHero` false) | 0 | 0 | 0 | 2, then crash |
| `_applyHit` non-classless body | 0 | 0 | 0 | not reached (crashed first) |
| `_legacyInterposedDamage` | 0 | 0 | 0 | not reached |
| Class ability and mage spell paths | 0 | 0 | 0 | not reached |
| `makeSingleEnemy` fallback (sim without `makeMinion`) | 0 | 0 | 0 | 0 |
| `rollEquipmentDrop` fallback (sim without `rollDrop`) | 2 (`engine.classless.test.js` only) | 0 | 0 | 0 |
| Tower hit (`sourceId` "T") | 0 | 0 | 0 | 0 |
| `zombie` sprite | 0 | 0 | 0 | 0 |

**The crafted save.** A hero with `cls: "knight"` loads normally, because `normalizeClasslessHero` copies every field it doesn't recognize. When that hero enters a fight, the engine sends it down the class path, and the legacy `heroDerived` (`logic.js`) throws `TypeError: Cannot read properties of undefined (reading 'attack')`, because the current hero model has no `stats` field.
- In a watched fight, the Battle screen crashes. The app has no React error boundary, so the whole page goes blank.
- In an unattended fight, the same error escapes `tick()`.

The class path therefore does not work at all today. Removing it can't break anything that currently works.

## Can a stored save hold a class hero?

**Not one that Gauntlet wrote.**
- Since the first commit, the game layer creates heroes only with `createHeroModel`, which ignores `cls`.
- No commit in the history writes `cls` from `src/game`, the UI or the screens.
- The only function that makes a class hero, `createHero(classKey)` in `logic.js`, is called by one test, which checks that class heroes are rejected.

Only a hand-edited or foreign save could contain `cls`, and that save crashes today (above).

## Manifest

Classifications:
- **LIVE:** reached in normal play.
- **TEST-ONLY:** reached only by tests.
- **TOOLING-ONLY:** reached only by scripts.
- **UNREACHABLE:** no path reaches it in Gauntlet.
- **FALLBACK:** runs only if a dependency that production always provides is missing.
- **FUTURE-INTENT UNKNOWN:** no evidence either way about whether it is meant to come back.

`docs/DESIGN.md` ("Known gaps / next steps: Second trim pass") already records the intent to remove the tower and castle branches and the castle-economy code, so none of those is marked FUTURE-INTENT UNKNOWN.

| # | Item | Where | Classification | Evidence | Proposed Phase 6 step (not done) |
| --- | --- | --- | --- | --- | --- |
| 1 | Class-hero branches in the engine: every `isClasslessHero` / `h.classless` / `h.ref.cls` false branch. Covers legacy mana, `cls`-based targeting and damage types, `getHeroAbilityStatus` / `useHeroAbility` class paths, `getHeroSpellStatus` / `castMageSpell`, `_legacyInterposedDamage`, mage target choice, legacy weapon sprite, and the non-classless body of `_applyHit` (crit, cleave, multi-target, tower bonus) | `engine.js` | UNREACHABLE, and broken if forced | Never hit in tests, tools or a watched fight. Only a hero with `cls` reaches it, no Gauntlet save has one, and such a hero crashes in `heroDerived` | 6B. Decide first what a save with `cls` should do (Open decisions) |
| 2 | `classlessHeroRef` and `classlessHeroDerived` (adapters from the hero model to the engine's `h.ref` and `h.d`) | `engine.js` | LIVE | Used for every hero in every fight | Keep. Revisit only in Phase 8 |
| 3 | `heroDerived` | `logic.js` | UNREACHABLE | Engine's class branch only | Goes with item 1 |
| 4 | `makeSingleEnemy`, used when a sim has no `makeMinion` | `logic.js`, `engine.js:1363` | FALLBACK | `createEncounterSim`, the only production sim, always sets `makeMinion`. 0 hits anywhere, tests included | 6A: fail loudly instead |
| 5 | `rollEquipmentDrop`, used when a sim has no `rollDrop` | `equipment.js`, `engine.js:3576` | FALLBACK, and TEST-ONLY | Production sims always set `rollDrop`. Hit only by `engine.classless.test.js`, whose hand-built sims (`createNewState`) lack it | 6A: give those test sims a `rollDrop` (or build them with `createEncounterSim`), then fail loudly |
| 6 | `createNewState`, `createHero` | `logic.js` | TEST-ONLY | `createNewState` builds bare sims in `engine.classless.test.js` and `classlessBattleResults.test.js`; `createHero("knight")` is used in one rejection test in `classlessProgression.test.js` | 6C: replace with small test fixtures before deleting `logic.js` |
| 7 | The rest of `logic.js`: towers, castle, workers, manufacturing, barricades, recruiting, squads, research (about 60 functions) | `logic.js` (1,090 lines) | UNREACHABLE | No importer except tests, which use only item 6 | 6D: delete the file after items 3, 4 and 6 |
| 8 | `libraryResearch.js` | 277 lines | TEST-ONLY (indirect) | Imported only by `logic.js`. Reached only through `createHero` (item 6) | 6D: delete with `logic.js` |
| 9 | `equipment.js` (Demonanic's 11-slot equipment) | 414 lines | FALLBACK (item 5), otherwise UNREACHABLE | Imported by `engine.js` (item 5) and `logic.js` only. Gauntlet's gear is `combat/gear.js` and `game/items.js` | 6D: delete after item 5 |
| 10 | `perks.js` (Demonanic's class perks and `MAGE_SPELLS`) | 194 lines | UNREACHABLE | Engine uses only `unlockedAbilities`, `getAbility` and `MAGE_SPELLS`, all on item 1's branches. Gauntlet's perk tree is `classlessProgression.js`. (`src/game/perks.test.js` tests Gauntlet's perks and does not import this file) | 6D: delete after item 1 |
| 11 | Towers: 4 loops over `this.towers`, the tower-hit bonus in `_applyHit`, `TOWER_RESOURCE` use | `engine.js` | UNREACHABLE | `this.towers` is assigned once, to `[]` (`engine.js:325`). 0 tower hits | 6D (the "second trim pass" in DESIGN) |
| 12 | Engine revive API: `reviveHero`, `reviveFallenHeroes`, with `paidRevivalCost`, `RECOVERY` and `REVIVE_PROTECT_S` | `engine.js:1135–1180` | UNREACHABLE | No caller anywhere in `src/` or `scripts/`. Gauntlet revives through expedition rules (camp, second chance) | 6D |
| 13 | `sim.morale` and the `MORALE` deltas the engine writes to it | `engine.js` (9 writes) | UNREACHABLE effect | Written on kills, deaths and tower loss; never read by the engine, `fightOutcome.js` or the expedition. Gauntlet's morale is `expedition.morale` | 6D. Removing the writes changes nothing observable |
| 14 | `towers`, `barricades`, `buildings` on the encounter sim | `encounters.js` | UNREACHABLE | Never read by the engine or anything else | 6D, with item 11 |
| 15 | `zombie` sprite branch | `engine.js:4599` | UNREACHABLE | No `zombie` enemy exists (Phase 2 coverage tests list every enemy). 0 hits | 6D |
| 16 | `xpGains.towers` | `engine.js` | UNREACHABLE effect | Always empty. `buildFightOutcome` uses only `xpGains.heroes` | 6D, with item 11 |
| 17 | `config.js` exports used only by the legacy modules (36): towers, castle, workers, production, guild economy, barricade, blockade, classes, `BASE_STATS`, `ATTACK_CONFIGS`, recruit costs, tavern, wave scaling, `GROUP_WEIGHTS`, `SPEC_POOL`, `EARLY_WAVE_POOLS`, `surrenderTaxRate`, `FREE_LIFE` | `config.js` | UNREACHABLE once `logic.js` and `libraryResearch.js` go | Referenced only by those files | 6D, after item 7 |
| 18 | `config.js` exports used nowhere (12): `TIME`, `TOWER_ORDER`, `TOWER_UPGRADE_CHOICES`, `REPAIR_STONE_PER_10HP`, `AP_COST`, `HERO_ORDER`, `EQUIP_SLOTS`, `healRateMultiplier`, `BASIC_POOL`, `SCOUT`, `CP_NOTE`, `ACADEMY` | `config.js` | UNREACHABLE | No reference anywhere | 6D |
| 19 | `config.js` exports referenced only from unreachable engine code: `TOWER_RESOURCE`, `RECOVERY`, `REVIVE_PROTECT_S`, `paidRevivalCost`, `MORALE` | `config.js` | UNREACHABLE once items 11–13 go | See items 11–13 | 6D, after those |
| 20 | `SLOT_THRESHOLDS` | `config.js` | UNREACHABLE | Used only by `slotCapacity` (item 17) | 6D |
| 21 | Live `config.js` exports (17): `DAMAGE_TYPES`, `affinityMultiplier`, `AFFINITY_MULTIPLIERS`, `BOSS_AFFINITIES`, `HERO_XP`, `heroLevelForXp`, `damageAfterDefense`, `CRIT_MULT`, `BASE_CRIT`, `dodgeChance`, `ENEMY_TIERS`, `ENEMIES`, `ENEMY_FAMILIES`, `ENEMY_ROLES`, `ROLE_LABELS`, `WARDED_ROLES`, `FAMILY_LABELS` | `config.js` | LIVE | Used by Gauntlet game code, enemy data, or the engine's classless paths (for example classless projectiles, damage reduction, `classlessHeroDerived`, spells). Some are also used on item 1's branches | Keep |

Sizes, for scale: the four legacy modules total 1,975 lines; `config.js` has 71 exports: 17 live (item 21) and 54 unused or reachable only from legacy or unreachable code (items 17–20).

## Order this suggests for Phase 6

Only with Sam's approval of each step:

- **6A, fallbacks:** fix the test sims (item 5), then make a missing `makeMinion` or `rollDrop` an error (items 4 and 5).
- **6B, class heroes:** remove the class branches (items 1 and 3) once Sam decides what a save with `cls` should do.
- **6C, test fixtures:** replace `createNewState` and `createHero` in tests (item 6).
- **6D, dead code, one group per PR:**
  1. towers, the sim fields and `xpGains.towers` (items 11, 14, 16);
  2. the revive API and sim morale (items 12 and 13);
  3. the `zombie` sprite (item 15);
  4. delete `perks.js`, `equipment.js`, `libraryResearch.js` and `logic.js` (items 7–10);
  5. prune `config.js` (items 17–20).

Every Phase 6 PR keeps the Phase 2 enemy-coverage, Phase 3 fight-outcome and Phase 4 seed tests green. Combat changes also re-check the unseeded byte-identity probe from Phase 4.
