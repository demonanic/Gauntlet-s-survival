# Copilot instructions for Gauntlet's Survival

Gauntlet is a React 19 + Vite idle game. Game rules live in `src/game` and `src/combat`; tests use Vitest (`npm test`).

## Your role: keep track of the checklist

`docs/ROADMAP.md` is the production checklist and architecture roadmap. Your job is to keep it accurate, not to set the pace: Sam (the owner) decides when each phase starts and merges every PR. Don't approve, block or request changes over pacing; report what you find as review comments.

On each pull request, check:

- `docs/ROADMAP.md` was updated: the phase status, that phase's checklist, and a new row in the pass log.
- Every box ticked in `docs/ROADMAP.md` is backed by evidence in the PR (tests, command output, or a clear description).
- The PR follows the "Rules for every roadmap PR" section, and doesn't weaken anything under "Architecture to preserve" without a stated reason.
- No gameplay or balance change is mixed into an architectural PR, and code isn't deleted only because it looks unused.
- Anything in the PR that the checklist doesn't mention yet, so it can be added.
