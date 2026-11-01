# Handoff for a new Claude session

Read this first. Then read `docs/ROADMAP.md` (the living checklist) and `docs/LEGACY_MANIFEST.md`. Those two files are the source of truth. This file only tells you how to start.

Last updated: 2026-11-01. At that point batch 1 of Phase 6 was merged (#34) and batch 2 was in review as a draft PR.

## The project

- **What it is:** Gauntlet's Survival, a React 19 + Vite idle game (`demonanic/Gauntlet-s-survival`). The owner is Sam.
- **Where the work stands:** Sam is running an architecture roadmap phase by phase. It came from an audit with findings F1–F9.
  - Phases 0–5 and 6A are merged.
  - Batch 1 (6B, 6C, 6D-1) is merged (#34, `ef819c4`).
  - Batch 2 (6D-2, 6D-3, 6D-4) is in review as a draft PR. Its tests, build, probe, seeded runs and browser check still need to run (the session that made it could not install dependencies).
- **Where the code lives:**
  - Game rules: `src/game`.
  - Combat: `src/combat`. `engine.js` is the one engine for both watched fights (`screens/Battle.jsx`) and unattended fights (`game/simulate.js`).
  - Balance tools: `scripts/`.
- **Legacy code:** a lot of it came from an older project, Demonanic: `combat/logic.js`, `libraryResearch.js`, `equipment.js`, `perks.js` and parts of `config.js`. Phase 6 is deleting it step by step.

## Sam's rules (follow them exactly)

1. **Pace:** start a phase or batch only when Sam explicitly says go. Stop after each one for review.
2. **Batches:** about three steps each. One draft PR per batch, one commit per step, and each commit checked on its own (see Checks).
3. **Merging:** Sam merges by saying "Merge". Use squash merge and a commit title that names the batch.
4. **Branch:** develop only on `claude/repo-setup-readme-vcyui5`. After a merge, restart that branch from `main`.
5. **PRs:** draft PRs that follow `.github/pull_request_template.md` (Summary / Testing checklist).
6. **No model names:** never put a model identifier in commits, PRs or code.
7. **Design:** check designs with Sam before building them in. Special moves are manual only.
8. **Copilot:** it only tracks the checklist in `docs/ROADMAP.md`; it doesn't set the pace. Update the roadmap (checklist, evidence, pass log) and the manifest progress table at every pass.
9. **Scope:** no gameplay changes in cleanup phases. If the code contradicts the plan, stop and report.
10. **Reporting:** report measured facts separately from assumptions. Keep messages plain and short.

## What's next

- **Now:** batch 2 is in review. Run its missing checks per commit (tests, build, byte-identity probe, seeded `ranks` and `bosses` runs, browser), answer review comments and fix CI.
- **Still owed:** a watched-fight browser check after 6D-1 (now on `main`) and after batch 2. Make a fresh save: start a trip in `npm run dev` and wait for an encounter prompt.
- **Batch 2** (in review): 6D-2 revive API and `sim.morale`; 6D-3 `zombie` sprite; 6D-4 delete `logic.js`, `libraryResearch.js`, `equipment.js` and `perks.js`.
- **Batch 3:** 6D-5 (prune the unused `config.js` exports, manifest items 17–20) and Phase 7 (move fight results out of `expedition.js`).
- **After that:** Phases 8 (A–D, split `engine.js`), 9, 10 and 11. The recommendation was to resume features (Endgame B/C/D) after Phase 7 and interleave phases 8–11.
- **Sam's earlier decisions:**
  - The error boundary goes in its own reliability PR, not in Phase 6.
  - A save carrying a `cls` field loses it on load. Done in 6B.

## Checks for every commit

- **Tests:** `npx vitest run` (449 tests at batch 1).
- **Build:** `npx vite build --outDir /tmp/b --emptyOutDir`.
- **Byte-identity probe:** unseeded play must not change. Run the same script on the base ref (in a `git worktree`) and on the working tree, then `cmp` the outputs. The script must sit in `scripts/` to run with `npx vite-node`; delete it afterwards. It:
  - sets `Math.random` to mulberry32(12345);
  - pins `Date.now`;
  - plays trips to gutter (level 1), boneyard (3), frostfang (6) and rift (6) with `startExpedition` + `tick`;
  - runs `simulateEncounter` on a wild, a boss and an endless wave;
  - generates one `shopStock`;
  - removes `gear-`/`hero-` ids and prints JSON.
- **Seeded active runs** (when combat changes): run on the base and the branch and compare, for example `npx vite-node scripts/ranks.js -- --ranks 0,10,20 --fights 2 --active --seed 11` and `scripts/scenarios.js -- --group bosses --trips 3 --active --seed 12`.
- **Browser:** start the dev server with `GAUNTLET_BASE=/Gauntlet-s-survival/ npx vite --port 5179 --strictPort` and open `http://localhost:5179/Gauntlet-s-survival/?debug` (8× speed).
  - Drive it with Playwright; Chromium is preinstalled.
  - The save key is `gauntlet.save.v1`.
  - Useful test ids: `gold`, `prompt-attack`, `battle`, `battle-continue`.

## Skills in this repo

`.claude/skills/`: `architecture-auditor`, `balance-analyst`, `interaction-hunter`, `performance-auditor`, `regression-guardian`, `systems-integrator`. Sam often asks for these by name (for example `/regression-guardian`).

## Open findings (see the ROADMAP "Known unknowns")

- An engine error in an unattended fight escapes `tick()`. This goes in the error-boundary PR.
- Only unattended fights record fight time.
- The HUD count goes stale at 8× speed.
- Boneyard parties at level 10 in starter gear lose. Balance question for `/balance-analyst`.
- Watched fights are not seeded.
