---
type: reference
title: "Issue Tracker"
tags: [project-docs, reference]
intent: "Issue Tracker"
---

# Issue Tracker

## Tracker

This project now uses GitHub Issues in the private repository:

```text
https://github.com/Baker4real/minmin-calendar
```

Use GitHub Issues for new tracked work, bugs, feature requests, and agent-ready implementation briefs. Keep issue titles short, label them with the triage vocabulary in `docs/agents/triage-labels.md`, and link related ADRs, source files, or tests when useful.

## Recommended Issue Shape

```markdown
# <Short Title>

## Problem

What user-visible problem or opportunity does this address?

## Expected Behavior

What should be true when this is done?

## Acceptance Checks

- [ ] Check 1
- [ ] Check 2

## Notes

Links to screenshots, ADRs, code paths, or prior commits.
```

## Spec 发现约定

implement-spec 等技能无参数调用时，spec 默认取当前开放的 epic 父票：有子票以 `## Parent` 指向它、整组标记 `ready-for-agent`。只开放一个 epic 时直接采用；多个 epic 同时开放时先与用户确认目标再开工。

## Local Scratch Notes

`.scratch/` is retained only for temporary local notes or drafts that are not ready for the private GitHub tracker. Do not treat `.scratch/` as the durable issue source once work is ready to track.
