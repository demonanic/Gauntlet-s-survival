# Gauntlet Claude Code skills

This directory holds the project skills Claude Code uses when working on Gauntlet's Survival. Each skill is a set of working rules for one kind of task. Claude Code loads them automatically in sessions on this repository. Invoke one directly with `/skill-name`, optionally followed by the task, or let Claude pick the relevant skills itself.

## Skills

| Skill | Use it for |
| --- | --- |
| `regression-guardian` | Changing, refactoring, replacing or removing existing behavior without regressions |
| `systems-integrator` | Wiring a new or changed mechanic into every system it actually touches |
| `interaction-hunter` | Finding exploits, feedback loops, broken scaling and emergent combinations (analysis first) |
| `balance-analyst` | Analyzing and simulating balance from the project's real values |
| `architecture-auditor` | Auditing coupling, duplication, ownership and technical debt (analysis only unless asked) |
| `performance-auditor` | Measuring performance before recommending or making optimizations |

## Where skills live

Each skill is one file at `.claude/skills/<skill-name>/SKILL.md`. The file starts with YAML frontmatter that gives its `name` (the same as its directory) and a `description`, followed by the instructions.

## Source of truth

The repository and its current implementation are the source of truth, not these skills, earlier designs or memory. Every skill must check the real code, data, tests and configuration before it reasons about or changes a system. A skill must never invent systems, mechanics, values or behavior. If something cannot be found in the repository, report it as missing or unverified rather than assuming it exists.
