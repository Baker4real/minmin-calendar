---
type: reference
title: Minmin Calendar 领域上下文
tags: [Minmin Calendar, 微信小程序, Room, 共享日历, 领域模型]
intent: 查找双人共享日历的领域语言、房间生命周期、技术边界与验证基线。
---

# Minmin Calendar Context

## Domain Language

- **Room**: A private two-person sharing space identified by a six-character `roomCode`.
- **Room leave**: A server-side membership revoke flow that removes the current user from a Room while preserving the remaining member when present.
- **Archived room**: A room with no active members. Its `roomCode` and records are retained for explicit creator recovery, but normal record CRUD is closed until recovery.
- **Period record**: A date range with optional note, Period duration, flow level, and symptom tags. A range that overlaps more than one calendar month is still one Period record, not one record per month.
- **Period duration**: Inclusive day count of one Period record from `startDate` through `endDate`. This is a property of the record, not of a month view.
- **Monthly recap / 小结**: Homepage summary for one viewed calendar month. It lists Period records and Memory records that overlap that month. It is not a second Period record.
- **Days in viewed month**: Inclusive day count of the intersection between a Period record's date range and the Monthly recap's calendar month. This is not Period duration.
- **Memory record / happy time**: A dated note shown as a heart marker on the calendar.
- **Edit draft / 草稿**: Edit-form input stashed in local storage when the Period/Memory edit page is hidden or unloaded, restored with a 「已恢复上次未完成的输入」 notice on return, and cleared after a successful save. Drafts are keyed per record identity (new vs. each existing record) and never leak across records.
- **Calendar cell**: A homepage day tile that may show date number, lunar text, holiday/workday tag, and markers.
- **Prediction**: Estimated next period range derived from previous period gaps, with confidence and reminder states.
- **Today**: Current date highlight; it should not reuse the memory heart marker.
- **Lunar date**: Chinese lunar calendar text such as `正月初一` or `冬月十六`.
- **Public holiday**: China official holiday range or adjusted workday label displayed in calendar cells.

## Product Principles

- Calendar markers must be semantically clear. A visual symbol should not mean two different things.
- Monthly recap copy must not use unlabeled 「天」 for both Period duration and Days in viewed month. Any viewed month that does not fully contain a Period record states both quantities and that the same record continues across months, including the start month and year boundaries. Recap occurrence counts distinguish records that started this month from records continued from the previous month. Period duration is stated per Period record; the month total is Days in viewed month, never the sum of Period durations.
- Shared data must stay room-scoped and private.
- The app should feel soft and personal, but not at the expense of readability. Color, type size, and calendar-cell treatment live in `DESIGN.md`; this file owns marker meaning.
- Date behavior should be tested before UI code relies on it.

## Technical Shape

- `app.js` initializes WeChat Cloud with the active environment.
- `utils/cloud.js` wraps frontend calls to `cloudfunctions/dataOp/index.js`; `RoomDataClient` is the sole frontend records access interface for room-scoped reads/writes.
- `utils/roomResolver.js` owns cached-or-fresh active-room resolution for `RoomDataClient`; it does not execute stale-room repair or access records directly.
- `utils/roomRecordsSnapshot.js` consumes only `RoomDataClient` and owns room-scoped `periods` + `memories` snapshot loading for homepage partial sync and Settings all-or-nothing export.
- `utils/roomAccessOutcome.js` owns client-side classification of structured and legacy room access failures plus outcome presentation mapping for inline status, modal prompts, repair actions, and settings room-code display state.
- `utils/recordCommands.js` is an intentionally shallow WeChat page adapter for shared period/memory list, save, delete, retry, and rebind feedback flows; outcome classification remains in `roomAccessOutcome`.
- `utils/recordPageSync.js` owns optional edit-page-to-homepage record change notifications for optimistic homepage refresh after saves and deletes.
- `pages/index/index.js` owns homepage record collection synchronization, request ordering, partial-success handling, and optimistic change reconciliation.
- `utils/settingsFlow.js` owns room-code copy, data export, retry/rebind, and local-cache helper flows.
- `utils/homeCalendarState.js` owns the pure Calendar projection for cell markers, marker meanings, prediction, reminders, day details, monthly recap, day-cell screen-reader aria copy, and legend item definitions.
- `utils/recordEditRoute.js` owns Period record and Memory record edit URL construction plus edit-page route option hydration, including the Memory date ceiling at today.
- `utils/recordDraft.js` owns edit-form draft save/restore/clear as pure functions keyed per record identity; `createWxDraftStorage` is the only wx local-storage seam.
- `utils/room.js` owns room-code cache, recovery, create/join, local clear, and server-side leave calls.
- `utils/util.js` owns date formatting, lunar conversion, official holiday metadata, and base calendar-grid construction.
- `utils/cycle.js` owns cycle prediction, reminder derivation, flow labels, symptom labels, and the body/emotion symptom grouping metadata.
- `utils/calendarInsights.js` owns prediction explanation copy and monthly recap text.
- `cloudfunctions/dataOp/index.js` is the cloud runtime adapter for room-authorized CRUD on `periods` and `memories`.
- `cloudfunctions/dataOp/dataOpHandler.js` owns active-room membership lookup and rejects archived rooms before record dispatch.
- `cloudfunctions/dataOp/roomRecords.js` returns canonical saved Record projections from add/update operations for optimistic homepage synchronization.
- `cloudfunctions/_shared/roomMembershipLifecycle.js` is the canonical source for Room membership creation, lookup, join, leave, ownership transfer, archive, and recovery transactions.
- `cloudfunctions/createRoom|joinRoom|getMyRoom|leaveRoom/index.js` are self-contained deployment adapters; each loads a byte-identical local `roomMembershipLifecycle.js` artifact generated by the deterministic `_shared/syncRoomMembershipLifecycle.js` assembly script.

## Room Lifecycle Boundary

- Active room access is authorized through `rooms.createdBy` / `rooms.partnerOpenid`; `roomMembers` is a concurrency lock, not the record authorization source.
- `rooms` must retain `roomCode_1_unique` plus the non-unique `createdBy_1_status_1` and `partnerOpenid_1_status_1` indexes. The composite indexes support Room identity lookup performance only; they do not change authorization semantics or make `roomMembers` an authorization source.
- Last-member leave archives the room instead of deleting it. Archived rooms reserve their original `roomCode`, are not returned by `getMyRoom`, cannot be joined directly, and cannot access records through `dataOp`.
- The original creator can recover an archived room by creating again. Recovery keeps the same `roomCode`, so existing `periods` and `memories` become accessible without migration.
- Homepage loading may show partial `periods` / `memories` data when one collection has a retryable failure, but Settings export still requires both collections to load successfully.

## Holiday Data Boundary

- `utils/chinaHolidays.js` currently contains official China holiday and adjusted-workday ranges for 2001-2026.
- Years inside that published range may show official off-day and adjusted-workday facts from the data table.
- Years beyond 2026 may still show static festival names such as Spring Festival, Qingming, Labor Day, Dragon Boat Festival, Mid-Autumn Festival, National Day, and New Year's Day, but must not infer adjusted workdays.
- Before the app enters a year beyond `PUBLISHED_HOLIDAY_END_YEAR`, update the published ranges from State Council holiday notices and keep the maintenance test green.

## Verification Baseline

After date, room, calendar, or page behavior changes, run the command set in `README.md` Verification. Expand test and source paths to absolute paths when the shell cannot resolve relatives.

Manual WeChat DevTools verification is still needed for layout and end-to-end room flow behavior.
