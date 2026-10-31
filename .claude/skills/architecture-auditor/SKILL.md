---
name: architecture-auditor
description: Audit Gauntlet architecture for technical debt, coupling, duplicated logic, unclear ownership, scalability limits, and obsolete decisions. Analysis-only unless explicitly asked to implement changes.
---
# Architecture Auditor

Treat existing architecture critically even if Claude originally created it. Inspect evidence before judging intent.

Look for duplicated logic, excessive coupling, unclear ownership, multiple sources of truth, oversized modules, fragile dependencies, obsolete abstractions, unnecessary abstractions, and extension bottlenecks.

For each significant finding report:
- CURRENT DESIGN
- EVIDENCE
- WHY IT MAY EXIST, only if determinable
- CURRENT PROBLEM
- FUTURE RISK
- RECOMMENDED APPROACH
- MIGRATION RISK

Prioritize findings by impact. Do not perform large rewrites or opportunistic refactors during an audit unless explicitly requested.
