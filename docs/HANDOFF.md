# Handoff for a new Claude session

Read this first, then `docs/ROADMAP.md` (the living checklist and pass log) and `docs/DESIGN.md` (every approved design, with its measurements). `docs/LEGACY_MANIFEST.md` tracks the old Demonanic code.

Last updated: 2026-11-06, with spells part 3 open as draft PR #58.

## The project

- **What it is:** Gauntlet's Survival, a React 19 + Vite idle game (`demonanic/Gauntlet-s-survival`), live at https://demonanic.github.io/Gauntlet-s-survival/. The owner is Sam. He plays and reviews on an Android phone.
- **Where the code lives:**
  - Game rules: `src/game` (guild, expeditions, regions, items, armory, mastery, saves).
  - Combat: `src/combat`. `engine.js` (about 1,750 lines) is the one engine for watched fights (`screens/Battle.jsx`) and unattended ones (`game/simulate.js`). It keeps the frame loop, the heroes' own attacks and damage, targeting, collisions, the HUD and the end-of-fight check.
  - Split out in Phase 8:
    - `combat/render/` (drawing);
    - `combat/enemies/` (turn.js, roles.js, abilities.js, attacks.js, tuning.js);
    - `combat/heroes/` (spells.js, moves.js, familiars.js, quickSlots.js, clutch.js, orders.js).
    - `attacks.js` and every `heroes/` file are engine methods mixed into `Engine.prototype` (`Object.assign` at the end of engine.js). Body radii and arena size are in `arena.js`.
  - Spells: data in `combat/spells.js` (`SPELLS`, `CASTING`, `HEX`, `ELEMENTS`, `SCHOOLS`); icons in `combat/abilityLook.js`; effects in `combat/spellVfx.js`.
  - Battle log: `combat/battleLog.js` (records only).
  - Balance tools: `scripts/` (`balance.js`, `scenarios.js`, `ranks.js`, `simKit.js`).
- **Cloud saves:** Supabase project "gauntlet" (`xtgpznknlaihmfohdmqs`, organization "demonanic"), reachable through the connected Supabase tools. Sam allowed using them. Migrations are in `supabase/migrations`. The free tier pauses the project when idle; restore it if needed.
- **Android:** `.github/workflows/android.yml` builds a debug APK artifact (Capacitor, appId `com.buzzfuzz.gauntlet`).

## Sam's rules (follow them exactly)

1. **Pace:** start a phase or batch only when Sam says "Go". Stop after each one for review.
2. **Batches:** about three steps each. One draft PR per batch, one commit per step, and CI checked on every commit.
3. **Merging:** when Sam says "Merge":
   - mark the PR ready (`POST repos/demonanic/Gauntlet-s-survival/pulls/N/ccr/ready_for_review`);
   - squash-merge (`PUT .../pulls/N/merge` with `merge_method=squash` and the head `sha`);
   - run `git checkout -B claude/repo-setup-readme-vcyui5 origin/main`, then force-push.
4. **Branch:** develop only on `claude/repo-setup-readme-vcyui5`.
5. **PRs:** drafts that follow `.github/pull_request_template.md` (Summary / Testing checklist). GraphQL is blocked, so `gh pr create` fails; create PRs with `gh api repos/.../pulls -F draft=true`.
6. **Attribution:**
   - Never put a model identifier anywhere: commits, PRs or code. No `Co-Authored-By` model line.
   - Commits end with `Claude-Session: <the session URL>`.
   - PR bodies end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)" and the session URL.
7. **Design first:** check designs and numbers with Sam before building.
   - For gameplay, build in a draft PR, measure in seeded fights and show the numbers before merging.
   - If something measures neutral or weak, give Sam options instead of shipping it. (Hexes and Enchanting were each reshaped this way.)
   - Special moves are manual only.
8. **Docs:** every feature updates `docs/DESIGN.md` (design and measurements), this file, and the ROADMAP pass log. Roadmap passes also update the manifest.
9. **Cleanup phases:** no gameplay changes. If code contradicts the plan, stop and report. If you find a gameplay problem, report it; Sam decides.
10. **Reporting:**
    - Keep measured facts separate from assumptions.
    - Keep messages plain and short (he's on a phone).
    - Say what wasn't checked.

## Where things stand

- **Merged recently** (details in DESIGN.md and the ROADMAP pass log):
  - #38–#42: the spells and familiars plan;
  - #43: armory;
  - #44–#45: mastery and qualities;
  - #46: regions open in order;
  - #47: small fixes (update banner, password reset, account deletion, APK);
  - #49: spells part 1, starter moves;
  - #50: one spell at a time (2.5 s auto gap, focus strain, spell queue, hold to cast now);
  - #51: part 2, area hexes;
  - #52: spell targets (tap a foe; auto bolts on the weakest foe);
  - #53: battle log, plus the battle field keeping half the screen;
  - #48 and #54–#57: Phase 8, splitting engine.js, plus Vampiric minions feeding their master and a dead Reaper/Dark Elf branch removed.
- **Open:** draft PR #58, spells part 3. It adds Enchanting (Haste and True Aim party-wide, Endless Quiver, Kindred Bond, Insight) and the Iron Skin and Spellguard wards. CI is green and the numbers are in the PR and in DESIGN.md. It's waiting for Sam's "Merge".
- **Next (Sam's choice):**
  - **Spells part 4:** Conjuration (Spectral Blades: swords for 10 s, one per rank up to 5; Summon Elemental: the caster's best other school for 12 s) and Mirror Self (Shadow V: a 40% copy for 8 s). Mana and cooldowns aren't set; propose them, build, measure, then show Sam.
  - **Phases 9–11:** one definition per enemy, performance measurements, final review (ROADMAP).
- **Later, if Sam asks:** tuning after play (Restoration, familiars, control, armory percentages, mastery pace), a sound effects overhaul, a Play Store release.

## How to work in this environment

- **CI is the test runner.** npm is blocked here. The `test-and-build` workflow runs only on `pull_request`, so open the draft PR before relying on CI. To check a commit, poll `gh api repos/demonanic/Gauntlet-s-survival/commits/<sha>/check-runs` until it completes, then read the job log (`gh api .../actions/jobs/<id>/logs`) for the "Tests" and "built" lines and any failures.
- **Local tests:** `~/.bun/bin/bun test <files>` runs the vitest files (`vi` and `jest` globals work).
  - `@supabase/supabase-js` is missing locally, so cloud-save tests fail here.
  - A few characterization hashes differ under bun (listed below).
  - To check a change locally, compare the failing-test list (and fingerprint values) before and after it with `git stash`, rather than expecting zero failures.
- **Fingerprints** (the safety net for any move or refactor). After a legitimate behavior change, re-record from the CI log.
  - `src/game/fightResults.characterization.test.js` and `partyDecisions.characterization.test.js`: 26 hashes.
  - `src/combat/render.characterization.test.js`: 5 drawing hashes.
  - `src/combat/enemyBehavior.characterization.test.js`: 39 cases (every enemy type, region squads, bosses, champions).
    - Under bun, `bogLich` and "ashen squad, tortoise" differ from CI.
  - `src/combat/heroActions.characterization.test.js`: 19 cases (every move and spell).
    - Under bun, "Vanguard moves" differs from CI.
  - `PRINT_GOLDEN=1` prints the values.
  - To record new ones: push, read the `GOLDEN name hash` lines (or the failing `expected`/`to be` values) from the CI log, fill them in, then amend.
  - To prove a change is only what you meant: set its new numbers back to the old behavior temporarily and show every fingerprint matches main.
- **Measuring gameplay:** write a temporary `src/zz/zz_*.test.js` (never commit it).
  - Build a party with `debugSetLevels`, seeded `mulberry32` fights through `buildWildEncounter`/`buildBossEncounter` and `createEncounterSim`, and `new Engine({ getContext: () => null }, sim, wave, { onEnd })`.
  - Play `engine.update(1/30)` until the fight ends; 120 seeds per case.
  - Compare against main with `git worktree add /tmp/wt origin/main`, symlinking node_modules. Report wins, damage taken, casts per fight.
  - Bow heroes need arrows (`hero.quickSlots = [{ key: "arrows", qty }]`) or they never shoot.
- **Seeing real screens:**
  - Push a temporary commit that edits `.github/workflows/ci.yml`: remove `npm test`, and append `tar czf - dist/assets dist/version.json dist/index.html | base64 -w 0 | fold -w 3000 | sed 's/^/DIST:/'` after the build.
  - Decode the `DIST:` lines from the log into `/tmp/app`, copy `public/sprites` into `dist/`, and serve with `python3 -m http.server 8777`.
  - Drive it with Playwright (`NODE_PATH=$(npm root -g)`; Chromium is installed). Use a phone viewport (412×760) and the save key `gauntlet.save.v1`.
  - Then reset the temp commit away and force-push. Never merge it.
  - Useful test ids: `battle-hero-tab-N`, `battle-spell-N-<id>`, `battle-log-tab`, `battle-canvas`.
- **Moving engine methods out:** a small script that cuts named methods (with their leading comments) from engine.js into an `export const xMethods = { ... }` file, then `Object.assign(Engine.prototype, xMethods)`. Write the new file before rewriting engine.js. Fix imports and constants, then compare all fingerprints before and after.
- **Watching PRs:** after opening a PR, keep one safety check-in scheduled for about 50 minutes, and cancel it on merge. GitHub notifications arrive as system notices; a "failed" run on a superseded commit (for example a recording commit) needs no action once the head is green.

## Skills in this repo

`.claude/skills/`: `architecture-auditor`, `balance-analyst`, `interaction-hunter`, `performance-auditor`, `regression-guardian`, `systems-integrator`. Sam sometimes asks for them by name (for example `/balance-analyst`).

## Open findings (see also the ROADMAP "Known unknowns")

- An engine error in an unattended fight escapes `tick()`. Sam wants this in its own error-boundary PR.
- Only unattended fights record fight time; watched fights are not seeded.
- The HUD count goes stale at 8× speed.
- Several earlier batches (6D) never had a watched-fight browser check, byte-identity probe or seeded runs (those sessions couldn't install dependencies). Phase 8's fingerprints now cover combat behavior.
- Balance:
  - Blightmire is the hardest wild region for mixed parties.
  - Restoration is the strongest support school in hard fights.
  - Iron Skin and Spellguard measure neutral on auto (they're tools to fire by hand).
