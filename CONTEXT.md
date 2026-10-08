---
type: reference
title: Minmin Calendar 领域上下文
tags: [Minmin Calendar, 微信小程序, Room, 共享日历, 领域模型]
intent: 查找双人共享日历的领域语言、房间生命周期、技术边界与验证基线。
---

# Minmin Calendar Context

## Domain Language

- **Room**: A private two-person sharing space identified by a six-character `roomCode`.
- **Launch screen / 启动首屏**: The screen the app opens on — the bind page. A successfully validated bound user is redirected straight to the 首页 tab, so the bind page rests only in unbound, needUnbind, or validation-failure states, with a minimal 进入应用 fallback when the home jump fails or right after room creation. The tab named 首页 is a different thing: that tab is the calendar page.
- **Room leave**: A server-side membership revoke flow that removes the current user from a Room while preserving the remaining member when present.
- **Archived room**: A room with no active members. Its `roomCode` and records are retained for explicit creator recovery, but normal record CRUD is closed until recovery.
- **Period record**: One shared menstrual-period record with a start date, a Period status, optional note, flow level, and symptom tags. A known date range that overlaps more than one calendar month is still one Period record, not one record per month.
- **Period status / 经期状态**: The record state is one of ongoing, ended with a known end date, or ended with an unknown end date. A missing end date is never treated as proof that the period lasted one day.
- **Ongoing period / 进行中经期**: A Period record whose start is known and whose end has not yet been recorded. Calendar projection covers the start date through Today, without inventing future dates, until the user completes the record.
- **Unknown-end period / 结束日期不详经期**: A Period record known to have ended when the exact end date is unavailable. Calendar projection shows only the known start date and does not infer duration.
- **Period record count**: How many Period records the Room currently holds. The homepage figure labeled 经期记录 is this count. It is not Period duration and not Days in viewed month.
- **Period duration**: The inclusive day count of a Period record from a known `startDate` through a known `endDate`. A same-day start and end is a valid one-day duration; an Ongoing period or Unknown-end period has no exact duration and is excluded from duration averages until completed. This is a property of the record, not of a month view.
- **Monthly recap / 小结**: Homepage summary for one viewed calendar month. It lists Period records and Memory records that overlap that month. It is not a second Period record.
- **Days in viewed month**: Inclusive day count of the intersection between a Period record's date range and the Monthly recap's calendar month. This is not Period duration.
- **Memory record / happy time**: A dated note shown as a heart marker on the calendar. Several Memory records may share one date; each still counts as its own record.
- **Memory month group / 欢乐时光月份分组**: The Memory records whose dates fall in one calendar month, presented together in the 记录 tab's 欢乐时光 segment. It is a view, not a record: each Memory record keeps its own date and calendar heart, and nothing is stored per month. Its count is the number of Memory records in that month, the same number the Monthly recap / 小结 reports for that month, but it is not the Monthly recap. Avoid 统合记录 or 月度记录, which suggest a stored per-month record.
- **Edit draft / 草稿**: Edit-form input stashed in local storage when the Period/Memory edit page is hidden or unloaded, restored with a 「已恢复上次未完成的输入」 notice on return, and cleared after a successful save. Drafts are keyed per record identity (new vs. each existing record) and never leak across records.
- **Calendar cell**: A homepage day tile that may show date number, lunar text, holiday/workday tag, and markers.
- **Overlap day / 重叠日**: A calendar day covered by both a Period record and the Prediction window. Projection sets `isPredict` false for that day, so the cell, day detail, and screen reader express period (and memory if present) only. The prediction window itself, homepage 预测下次, legend, and prediction explanation stay unchanged.
- **Prediction**: Estimated next period range derived from previous period gaps, with confidence and reminder states. The homepage figure labeled 预测下次 is this prediction's next start date, not a Period record.
- **Today**: Current date highlight; it should not reuse the memory heart marker.
- **Lunar date**: Chinese lunar calendar text such as `正月初一` or `冬月十六`.
- **Public holiday**: China official holiday range or adjusted workday label displayed in calendar cells.

## Product Principles

- Calendar markers must be semantically clear. A visual symbol should not mean two different things. On an Overlap day, only the period meaning is expressed; prediction is suppressed for that cell only.
- A Period record may be saved before its end is known. The form distinguishes Ongoing, Unknown-end, and completed records instead of using an empty end date to carry multiple meanings.
- Recorded dates cannot be in the future. The system never guesses an end date or automatically closes an Ongoing period; the user completes the same record later.
- Ongoing periods use the known start date for cycle prediction but do not contribute an exact duration. Unknown-end periods contribute neither an exact duration nor an inferred range.
- A Room has at most one Ongoing period record for the period stream; a second add action reopens the existing record. Overlapping completed records remain a separate, later data-quality concern and are not merged or hard-blocked by this rule.
- Flow and symptom allowed values stay light/normal/heavy and cramps/headache/tired/acne/mood/sleep/cravings. `utils/cycle.js` owns labels; `cloudfunctions/dataOp/roomRecords.js` keeps a self-contained copy for standalone deploy. Tests lock both allowed-value sets equal; do not invent a shared runtime module for this small list.
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
- `utils/cycle.js` owns cycle prediction, reminder derivation, Period duration from dates (`getPeriodDuration`), flow labels, symptom labels, and the body/emotion symptom grouping metadata.
- `utils/calendarInsights.js` owns prediction explanation copy and monthly recap text.
- `utils/safeArea.js` owns runtime safe-area computation for status-bar top and gesture-area bottom; page roots inject `--safe-top` and `--safe-bottom`.
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
