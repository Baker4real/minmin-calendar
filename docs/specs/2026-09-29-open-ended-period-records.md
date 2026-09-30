---
type: spec
title: "进行中经期记录与未知结束日期"
tags: [project-docs, spec, period, calendar]
status: accepted
intent: "允许经期开始时先记录，之后补填结束日期"
---

# 进行中经期记录与未知结束日期

**Date:** 2026-09-29
**Status:** Accepted

## Problem Statement

新增经期记录时，用户在经期刚开始当天只知道开始日期，不知道结束日期。当前表单和云端契约都要求结束日期，导致用户只能猜一个日期、把进行中的经期伪装成单日记录，或放弃记录。前端底层在缺少结束日期时又会按单日处理，进一步把“进行中”“结束日期不详”和“确实只有一天”混为一谈。

## Solution

允许用户先保存没有结束日期的经期记录，并让用户明确选择记录状态：进行中、已结束但结束日期不详、已结束且有结束日期。新增默认进行中；进行中记录在日历上显示从开始日到今天，历史上结束但日期不详的记录只显示已知开始日。用户结束经期后编辑同一条记录补填结束日期，系统据此计算精确时长，不自动猜测或补写日期。

## User Stories

1. As a user whose period has just started, I want to save the start date without knowing the end date, so that I can record the event immediately.
2. As a user adding an older period from memory, I want to save a start date when the end date is unknown, so that incomplete historical information does not block the record.
3. As a user who knows both dates, I want to enter a completed date range, so that the record has an exact duration.
4. As a user with a one-day period, I want the same start and end date to remain valid, so that a real one-day period is not confused with an incomplete record.
5. As a user creating a new record, I want the form to default to “进行中”, so that the common start-of-period action requires no invented date.
6. As a user adding a historical record, I want to choose “已结束但结束日期不详”, so that the calendar does not pretend that the period is still active.
7. As a user editing an ongoing record, I want entering an end date to complete that same record, so that I do not create a second record for the same period.
8. As a user correcting a record, I want to switch between ongoing and ended-with-unknown-end-date when appropriate, so that the status reflects what I actually know.
9. As a user, I want the date controls to reject future dates, so that recorded facts are not confused with predicted dates.
10. As a user viewing the calendar, I want an ongoing period to cover its known start through today, so that the current state remains visible without projecting unrecorded future days.
11. As a user viewing a historical record with an unknown end, I want only its known start day marked, so that the calendar does not invent its duration.
12. As a partner sharing the Room, I want to see whether a period is ongoing or has an unknown end, so that I understand the meaning of the shared marker and record.
13. As a user, I want a second add action to reopen the existing ongoing record, so that repeated taps or shared-room actions do not create duplicate active periods.
14. As a user reviewing period history, I want incomplete records excluded from exact duration averages, so that statistics do not treat an unknown duration as one day.
15. As a user relying on cycle prediction, I want the start date of an ongoing record to count as a known cycle start, so that the next-start estimate can use the latest real event.
16. As a user viewing a prediction before the current period is completed, I want any predicted end date to come from known history, my configured typical length, or the default, so that prediction never becomes a stored fact.
17. As a user with a long-running ongoing record, I want one gentle reminder to complete it after the expected duration, so that I can finish the record without being interrupted or forced.
18. As a user with no personal duration history, I want the reminder logic to use the documented default, so that the behavior is deterministic from the first record.
19. As a user with old data that lacks an end date, I want that record preserved as “结束日期不详”, so that compatibility does not silently claim that it is ongoing.
20. As a user, I want overlapping completed records left intact during this change, so that this feature does not unexpectedly merge or delete historical information.
21. As a user, I want incomplete status and date meaning announced clearly by accessible labels, so that screen-reader output matches the visual state.
22. As a user returning to an interrupted edit, I want the draft to preserve the selected status and known dates, so that I can finish the same record without losing the distinction between unknown and ongoing.
23. As a maintainer, I want cloud normalization and client projection to agree on the three states, so that a saved record cannot change meaning when it crosses the network boundary.
24. As an implementation agent, I want focused acceptance checks for domain rules, calendar projection, page interaction, and cloud normalization, so that the feature can be delivered without broad unrelated refactoring.

## Implementation Decisions

### Record state and dates

- Every new period record has a required start date no later than today.
- The record has one explicit status: ongoing, ended with an unknown end date, or ended with a known end date.
- An end date is required only for the known-end state. When present, it must be no earlier than the start date and no later than today.
- A start date equal to the end date is a valid completed one-day period.
- The status is authoritative. An empty end date is not interpreted implicitly as a one-day period or as an ongoing period.

### Form and edit transitions

- The new-record form defaults to ongoing and reveals the end-date picker only for a completed known-end selection.
- Filling an end date completes the current record; it does not create another record.
- Clearing an end date requires an explicit choice between ongoing and ended-with-unknown-end-date.
- The system never fills an end date from a typical duration or closes an ongoing record automatically.
- If a Room already has an ongoing period record, a new-record action reopens that record instead of creating a second ongoing record.

### Calendar, list, and detail projection

- Ongoing records project from their start date through today only.
- Ended-with-unknown-end-date records project only their known start date.
- Known-end records retain the existing inclusive range behavior.
- List and detail copy must expose the status so that “进行中” and “结束日期不详” are not represented by a blank date alone.
- Existing overlap behavior remains unchanged: this feature does not merge or hard-block overlapping completed records.

### Duration, prediction, and reminder behavior

- Only known-end records have an exact Period duration.
- Ongoing and unknown-end records are excluded from duration averages and monthly duration claims until completed.
- An ongoing start date may participate in cycle-start prediction. Incomplete records do not supply an exact duration.
- Predicted end dates use configured typical duration, known completed history, or the documented five-day default; the result is never persisted as an end date.
- Once an ongoing record exceeds the expected duration, show one non-blocking completion reminder. Use the configured typical duration first, then the recent completed-duration median, then five days. The ongoing record itself is excluded from this calculation.

### Cloud and compatibility contract

- Client and cloud normalization must accept the three-state record model and enforce the same date constraints.
- The cloud write path is authoritative for the one-ongoing-record-per-Room invariant; client preflight is an interaction optimization and must handle a concurrent conflict without creating a duplicate.
- Existing records with a valid end date remain completed records.
- Existing records without an end date are interpreted conservatively as ended-with-unknown-end-date; no automatic backfill or data deletion is performed.
- The implementation keeps record authorization and Room scoping unchanged.

### Test seams

- Use the existing pure cycle-domain seam for state normalization, date validation, duration semantics, and prediction inputs.
- Use the existing pure calendar-projection seam for ongoing and unknown-end markers, details, and accessibility text.
- Use the existing period-edit page harness for form state, transitions, future-date rejection, draft restoration, and duplicate-active feedback.
- Use the existing cloud record-normalization seam for the persisted contract and legacy compatibility.
- Avoid introducing a new cross-layer abstraction solely for this feature.

## Testing Decisions

### What makes a good test

- Assert observable domain outcomes: accepted or rejected dates, explicit state, exact duration, prediction inputs, and reminder timing.
- Assert calendar output and accessible meaning, not internal helper call order.
- Assert the page behavior a user can observe: which controls appear, what is saved, what is reopened, and what feedback is shown.
- Assert cloud normalization independently because the deployable cloud copy must uphold the same contract without importing client code.
- Include boundary cases: start today, start equal to end, end before start, future dates, empty end date, legacy missing end date, long-running ongoing records, and repeated add attempts.

### Modules and prior art

- The cycle-domain tests extend the repository’s existing prediction and duration behavior tests.
- Calendar tests extend the existing pure homepage-state and day-detail projection tests.
- Page tests use the established record-page harness pattern that drives a registered page definition with mocked WeChat APIs and a fake client.
- Cloud tests extend the existing standalone record normalization and allowed-value contract tests.
- UI acceptance remains required in the WeChat Developer Tools at a small-phone width after implementation; local unit tests do not replace that check.

## Acceptance Checks

- [ ] A new record can be saved as ongoing with only a valid start date.
- [ ] A historical record can be saved as ended with an unknown end date.
- [ ] A completed record requires a valid end date no earlier than its start and no later than today.
- [ ] A same-day start and end saves as a one-day completed period.
- [ ] Future start and end dates are rejected in the client and cloud normalization.
- [ ] Ongoing projection covers start through today; unknown-end projection covers only the known start day.
- [ ] Incomplete records do not enter exact duration averages, while ongoing starts remain eligible as cycle starts.
- [ ] Filling an end date updates the existing record and clears its incomplete state.
- [ ] A second add action reopens the existing ongoing record instead of creating a duplicate.
- [ ] A long-running ongoing record receives one non-blocking completion reminder.
- [ ] Legacy records without an end date remain readable as unknown-end records.
- [ ] Existing overlap behavior is unchanged.
- [ ] The focused automated checks and `git diff --check` pass; WeChat Developer Tools small-screen verification is recorded separately.

## Out of Scope

- Medical advice, diagnosis, or clinical interpretation of cycle data.
- Automatically estimating, writing, or silently correcting a user’s end date.
- Automatic closure of an ongoing record.
- Merging, deleting, or hard-blocking overlapping completed records.
- Introducing a period-owner identity model for the two Room members.
- Push notifications or a new background scheduling system; the reminder is in-app and non-blocking.
- A broad historical data-cleanup migration beyond conservative interpretation of missing end dates.
- Visual redesign outside the status controls, date fields, status copy, and related accessibility labels required for this feature.

## Further Notes

This specification records the accepted product decision from the design discussion. The durable domain vocabulary is captured in the project context, and the rationale for the explicit status model is captured in the corresponding ADR. Implementation should preserve the existing room-scoped records interface and the existing prediction/calendar semantics outside the incomplete-period cases.
