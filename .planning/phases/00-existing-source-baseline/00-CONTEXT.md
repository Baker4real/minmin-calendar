# Phase 00: Existing Source Baseline - Context

**Gathered:** 2026-06-26  
**Status:** Historical backfill

<domain>
## Phase Boundary

Capture the mini program state that existed when source tracking began. This is a historical baseline, not a new implementation phase.
</domain>

<decisions>
## Implementation Decisions

### Baseline capture
- **D-01:** Treat commit `d278809` as the source baseline for all later GSD work.
- **D-02:** Preserve WeChat Mini Program runtime conventions: `.js`, `.wxml`, `.wxss`, `.json` pages plus cloud functions.
- **D-03:** Keep package-lock files for cloud functions as historical source state.

### the agent's Discretion
- Future phases may refactor around this baseline, but historical verification should not rewrite it.
</decisions>

<specifics>
## Specific Ideas

The initial baseline included the calendar homepage, period/memory edit/list pages, bind/settings pages, WeChat cloud functions, icons, date utilities, app config, and initial calendar-display tests.
</specifics>

<canonical_refs>
## Canonical References

- `README.md` - project overview after later documentation sync.
- `CONTEXT.md` - current domain context.
- `DESIGN.md` - visual direction present from source tracking.
- `.planning/codebase/STRUCTURE.md` - current map of baseline and later modules.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `utils/util.js` provided date and calendar-grid primitives.
- `utils/cloud.js` provided frontend cloud-function access wrappers.
- `cloudfunctions/createRoom`, `joinRoom`, `getMyRoom`, `dataOp`, and `login` provided initial cloud behavior.

### Integration Points
- Later GSD phases build on the baseline homepage, record pages, room flow, and cloud functions.
</code_context>

<deferred>
## Deferred Ideas

All improvement work belongs to later phases.
</deferred>

---
*Phase: 00-existing-source-baseline*
*Context backfilled: 2026-06-26*
