---
type: reference
title: "Issue Tracker"
tags: [project-docs, reference]
intent: "Issue Tracker"
---

# Issue Tracker

## Tracker

This project uses GitHub Issues in the public repository:

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

This shape is for standalone bugs and requests. A spec (epic parent) follows the to-spec template. Its sub-tickets follow the to-tickets template: `## Parent`, `## What to build`, `## Acceptance criteria`, a two-digit order prefix in the title (`01 …`), and blockers as native `blockedBy` links instead of a body section. Acceptance criteria list only the checks specific to that ticket. Standing rules already apply to every ticket and stay out of it: `AGENTS.md`「完成标准」 (the README verification set, `git diff --check`) and the global default of no commit, push or deploy without authorization.

## Spec 发现约定

implement-spec 等技能无参数调用时，spec 默认取当前开放的 epic 父票：有子票以 `## Parent` 指向它、整组标记 `ready-for-agent`。只开放一个 epic 时直接采用；多个 epic 同时开放时先与用户确认目标再开工。

spec 发布为 epic 父票后，在 `docs/specs/<发布日期>-<slug>.md` 留一份同源副本：frontmatter 照同目录最近一份填写，H1 之后一行 `**Issue:** [#<n>](<issue URL>)`，其余正文与父票一致。父票是事实源，改父票正文时同步改副本。

## Close and evidence fallbacks

| Trigger | First repair | Still failing |
|---|---|---|
| `gh issue close` returns GraphQL `EOF` | Retry once. If it fails again, `gh api --method PATCH repos/<owner>/<repo>/issues/<n> -f state=closed`, then post the same comment with `gh api --method POST repos/<owner>/<repo>/issues/<n>/comments`. | Stop and report the issue number. Do not say it is closed until the tracker says so. |
| Batch `gh issue create` (e.g. publishing sub-tickets) returns GraphQL `EOF` | Before retrying, list open issues and match the exact title: the issue is often already created. Reuse it if found; otherwise retry the create once. After the batch, read back every ticket's `parent` and `blockedBy` (`gh issue view <n> --json 'parent,blockedBy'`) and repair gaps with `gh issue edit <n> --parent <p>` / `--add-blocked-by '<list>'`. Quote comma lists so PowerShell passes each as one argument. | Stop at the first ticket that still fails, report the created numbers so far, and do not create later tickets that would reference it. |
| A screenshot or other file will not upload to `uploads.github.com` | Commit the file on the branch that holds the work, under `docs/evidence/issue-<n>/`, and add an image to `ALLOWED_IMAGES` in `tests/tracked-images.test.js` with a note on what it shows; push that branch, and put the raw URL in the issue comment. | Leave the ticket open and say the file is only on disk. Do not keep retrying the upload API. |

The repository and its issues are public, so anything posted to an issue or committed here is public. Crop each screenshot to the control under test, or swap in stand-in data before capturing: real period dates and counts, prediction ranges, memory hearts, notes, room codes, tokens, and other secrets stay off GitHub.

## Local Scratch Notes

`.scratch/` is retained only for temporary local notes or drafts that are not ready for the GitHub tracker. Do not treat `.scratch/` as the durable issue source once work is ready to track.
