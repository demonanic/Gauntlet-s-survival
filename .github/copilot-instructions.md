# Copilot instructions for Gauntlet's Survival

Gauntlet is a React 19 + Vite idle game. Game rules live in `src/game` and `src/combat`; tests use Vitest (`npm test`).

## Reviewing pull requests

`docs/ROADMAP.md` is the production checklist and architecture roadmap. For every PR, check it against that document:

- The PR follows the "Rules for every roadmap PR" section.
- It does not weaken anything listed under "Architecture to preserve" without a stated, accepted reason.
- It only does work from a phase that the roadmap marks as started; flag work that belongs to a later phase.
- Every box the PR ticks in `docs/ROADMAP.md` is backed by evidence in the PR (tests, command output, or a clear description).
- `docs/ROADMAP.md` itself was updated: the phase status, its checklist and a new row in the pass log.
- No gameplay or balance change is mixed into an architectural PR.
- Code is not deleted only because it looks unused; the PR shows how its reachability was proven.

Report anything that drifts from the roadmap as a review comment.
