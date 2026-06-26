# Domain Docs

## Layout

This repository uses a single-context documentation layout.

| Purpose | Path |
|---------|------|
| Domain context | `CONTEXT.md` |
| Architecture decisions | `docs/adr/` |
| Agent workflow config | `docs/agents/` |

## Consumer Rules

- Read `CONTEXT.md` before making domain or UX decisions.
- Read relevant source, tests, and ADRs before touching architecture, cloud functions, date logic, or UI conventions.
- Add ADRs under `docs/adr/` for decisions that affect future implementation choices.

## Current Domain Boundaries

- The app is a private two-person calendar, not a public social product.
- "Happy time" is represented by memory records and should not share marker semantics with "today."
- Period prediction is a lightweight calendar estimate, not medical advice.
