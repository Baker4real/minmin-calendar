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
| 视觉规则（现行 Aurora Bloom） | `DESIGN.md`；动效、弹层、按压与交互语义在 `docs/motion-and-interaction.md` |
| Architecture decisions | `docs/adr/` |
| 已批准的设计记录 | `docs/specs/` |
| 历史实施分解 | `docs/plans/` |
| Agent workflow config | `docs/agents/` |

## Consumer Rules

- Read `CONTEXT.md` before making domain or UX decisions.
- Visual work follows current `DESIGN.md` rules, plus `docs/motion-and-interaction.md` for motion, sheets, press and interaction semantics. Do not keep a second target-vs-baseline track.
- Read relevant source, tests, and ADRs before touching architecture, cloud functions, date logic, or UI conventions.
- Add ADRs under `docs/adr/` for decisions that affect future implementation choices.

## Retrieval

- For `CONTEXT.md`, `DESIGN.md`, `docs/motion-and-interaction.md` and specs, locate headings or decision keywords first, then read the required line range; do not reread whole documents to answer a local question. Use the existing `docs/agents/domain.md` route before searching the repository.
- Use bounded projections for batch issue/ticket or multi-file reads instead of printing complete responses into the conversation. Follow `D:\Codex\.codex\docs\agent-guidance\context-amplification.md` when reading more than ten source files or comparing a visual matrix. Component visual audits start with `node tests/impeccableAudit.mjs --component <id>` as documented in `docs/devtools-verification.md`.
- Parallel ticket worktrees are for isolated implementation and offline gates. DevTools runtime work has one owner at a time; follow `docs/devtools-verification.md` for handoff, current-source proof and the shared sheet runtime check.

## Current Domain Boundaries

- The app is a private two-person calendar, not a public social product.
- "Happy time" is represented by memory records and should not share marker semantics with "today."
- Period prediction is a lightweight calendar estimate, not medical advice.
- On an overlap day (period + prediction), calendar projection suppresses prediction for that cell only. The homepage no longer has a 预测下次 block; the status line carries that estimate. Legend and prediction explanation remain.
- Period duration with both dates present is always the inclusive date span from `utils/cycle.js`; stored `duration` is not a second display source.
- Flow/symptom allowed-value sets must stay equal between `utils/cycle.js` labels and the self-contained cloud copy in `roomRecords.js`.
