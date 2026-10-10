---
type: reference
title: "Domain Docs"
tags: [project-docs, reference]
intent: "Domain Docs"
---

# Domain Docs

## Layout

This repository uses a single-context documentation layout.

| Purpose | Path |
|---------|------|
| Domain context | `CONTEXT.md` |
| 视觉规则（现行 Aurora Bloom） | `DESIGN.md` |
| Architecture decisions | `docs/adr/` |
| 已批准的设计记录 | `docs/specs/` |
| 历史实施分解 | `docs/plans/` |
| Agent workflow config | `docs/agents/` |

## Consumer Rules

- Read `CONTEXT.md` before making domain or UX decisions.
- Visual work follows current `DESIGN.md` rules. Do not keep a second target-vs-baseline track.
- Read relevant source, tests, and ADRs before touching architecture, cloud functions, date logic, or UI conventions.
- Add ADRs under `docs/adr/` for decisions that affect future implementation choices.

## Current Domain Boundaries

- The app is a private two-person calendar, not a public social product.
- "Happy time" is represented by memory records and should not share marker semantics with "today."
- Period prediction is a lightweight calendar estimate, not medical advice.
- On an overlap day (period + prediction), calendar projection suppresses prediction for that cell only. The homepage no longer has a 预测下次 block; the status line carries that estimate. Legend and prediction explanation remain.
- Period duration with both dates present is always the inclusive date span from `utils/cycle.js`; stored `duration` is not a second display source.
- Flow/symptom allowed-value sets must stay equal between `utils/cycle.js` labels and the self-contained cloud copy in `roomRecords.js`.
