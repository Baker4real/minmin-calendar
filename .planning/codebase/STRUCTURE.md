---
last_mapped_commit: d4bd56de253c41a597431a5f96b93598413dfa83
last_mapped_at: "2026-06-26T12:30:43.422Z"
---

# Codebase Structure

**Analysis Date:** 2026-06-26

## Directory Layout

```text
minmin-calendar/
├── .gitignore
├── .scratch/
├── README.md
├── AGENTS.md
├── CONTEXT.md
├── DESIGN.md
├── app.js
├── app.json
├── app.wxss
├── cloudfunctions/
├── docs/
├── images/
├── pages/
├── .planning/
├── scripts/
├── tests/
└── utils/
```

## Directory Purposes

**Root files:**
- Purpose: App bootstrap, global routing, repository instructions, and project/domain metadata.
- Contains: `.gitignore`, `README.md`, `AGENTS.md`, `CONTEXT.md`, `DESIGN.md`, `app.js`, `app.json`, `app.wxss`, `project.config.json`, `sitemap.json`.
- Key files: `AGENTS.md`, `CONTEXT.md`, `DESIGN.md`, `README.md`, `app.js`, `app.json`, `project.config.json`.

**`docs/`:**
- Purpose: Durable domain/process documentation outside GSD phase state.
- Contains: ADRs under `docs/adr/` and agent workflow references under `docs/agents/`.
- Key files: `docs/adr/0001-room-leave-ownership-transfer.md`, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md`.

**`.scratch/`:**
- Purpose: Local markdown issue-tracker workspace until a remote repository is configured.
- Contains: `.scratch/README.md` and local issue artifacts when needed.
- Key files: `.scratch/README.md`.

**`.planning/`:**
- Purpose: Durable GSD project workflow, history, requirements, roadmap, state, phase artifacts, and codebase maps.
- Contains: `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `HISTORY.md`, `codebase/`, `phases/`, `research/`.
- Key files: `.planning/HISTORY.md`, `.planning/STATE.md`, `.planning/phases/02.1-calendar-insight-monthly-recap/02.1-01-PLAN.md`.

**`pages/`:**
- Purpose: User-facing mini program screens and page-specific logic.
- Contains: One folder per page, each with `*.js`, `*.json`, `*.wxml`, `*.wxss`.
- Key files: `pages/index/index.js`, `pages/bind/bind.js`, `pages/period/period.js`, `pages/period/edit/edit.js`, `pages/memory/memory.js`, `pages/memory/edit/edit.js`, `pages/settings/settings.js`.

**`utils/`:**
- Purpose: Shared client helpers.
- Contains: Room session/cache logic, date/calendar utilities, published holiday data, cycle prediction helpers, calendar insight display helpers, period metadata helpers, and cloud-function wrappers.
- Key files: `utils/room.js`, `utils/util.js`, `utils/chinaHolidays.js`, `utils/cycle.js`, `utils/calendarInsights.js`, `utils/cloud.js`.

**`cloudfunctions/`:**
- Purpose: Server-side logic for room management, membership revoke, and shared record persistence.
- Contains: One folder per cloud function, each with `index.js` and package files.
- Key files: `cloudfunctions/createRoom/index.js`, `cloudfunctions/joinRoom/index.js`, `cloudfunctions/getMyRoom/index.js`, `cloudfunctions/leaveRoom/index.js`, `cloudfunctions/login/index.js`, `cloudfunctions/dataOp/index.js`.

**`images/`:**
- Purpose: Tab icons and UI assets.
- Contains: Image files referenced from `app.json` tabBar and page styles.
- Key files: `images/calendar.png`, `images/calendar_active.png`, `images/add.png`, `images/add_active.png`, `images/settings.png`, `images/settings_active.png`.

**`tests/`:**
- Purpose: Automated checks for shared calendar behavior, Room session behavior, Room lifecycle behavior, and Room-scoped record rules.
- Contains: Test files such as `tests/calendar-display.test.js`, `tests/calendar-insights.test.js`, `tests/cycle-prediction.test.js`, `tests/room-lifecycle.test.js`, `tests/room-records.test.js`, and `tests/room-session.test.js`.
- Key files: `tests/calendar-display.test.js`, `tests/calendar-insights.test.js`, `tests/cycle-prediction.test.js`, `tests/room-lifecycle.test.js`, `tests/room-records.test.js`, `tests/room-session.test.js`.

**`scripts/`:**
- Purpose: Maintenance and environment automation scripts.
- Contains: PowerShell scripts with `hermes-` prefixes.
- Key files: `scripts/hermes-*.ps1`.

## Key File Locations

**Entry Points:**
- `README.md`: Human-facing setup, verification, and repository hygiene entry point.
- `AGENTS.md`: Agent instructions, GSD policy, domain file map, and verification commands.
- `CONTEXT.md`: Current domain context and shared language.
- `DESIGN.md`: Product/UI design direction for the Mini Program.
- `app.js`: App startup and cloud initialization.
- `app.json`: Page registry and tab bar configuration.
- `pages/index/index.js`: Main calendar home page.
- `pages/bind/bind.js`: Room binding entry page.

**Configuration:**
- `project.config.json`: Mini program project config and packaging rules.
- `app.json`: Navigation, window, and tab bar settings.
- `sitemap.json`: Sitemap metadata.

**Core Logic:**
- `utils/cloud.js`: Shared data-access facade.
- `utils/room.js`: Room-code cache, recovery, create/join, server-side leave, and local clear Interface.
- `utils/util.js`: Calendar/date calculations.
- `utils/chinaHolidays.js`: Published China public holiday and adjusted-workday data for 2001-2026.
- `utils/cycle.js`: Cycle prediction, reminders, flow labels, and symptom labels.
- `utils/calendarInsights.js`: Calendar legend, prediction explanation, day meaning, and monthly recap display helpers.
- `pages/index/index.js`: Derived calendar view model.
- `cloudfunctions/dataOp/index.js`: CRUD gateway for shared records.
- `cloudfunctions/dataOp/roomRecords.js`: Server-side validation and normalization for Room-scoped records.
- `cloudfunctions/leaveRoom/index.js`: Cloud adapter for current-user Room membership revoke.
- `cloudfunctions/leaveRoom/roomLifecycle.js`: Server-side Room leave/unpair and ownership transfer rules.

**Testing:**
- `tests/calendar-display.test.js`: Calendar display and template contract coverage.
- `tests/calendar-insights.test.js`: Calendar insight and monthly recap helper coverage.
- `tests/cycle-prediction.test.js`: Cycle prediction, reminder, and period metadata coverage.
- `tests/room-lifecycle.test.js`: Server-side Room leave/unpair and ownership transfer behavior.
- `tests/room-records.test.js`: Server-side Period record / Memory record validation and Room ownership behavior.
- `tests/room-session.test.js`: Client-side RoomSession cache, recovery, create/join, server-side leave, and local clear behavior.

## Naming Conventions

**Files:**
- Mini program pages use `pageName/pageName.js`, `pageName/pageName.wxml`, `pageName/pageName.wxss`, `pageName/pageName.json`.
- Edit subpages use nested directories such as `pages/period/edit/edit.js`.
- Cloud functions use one folder per function with `index.js` as the handler.

**Directories:**
- Feature-first grouping is used for pages and cloud functions.
- Shared client code stays in `utils/`.
- Static assets stay in `images/`.

## Where to Add New Code

**New Feature:**
- Primary code: add a new page folder under `pages/<feature>/` and register it in `app.json`.
- Tests: add or extend coverage under `tests/`.

**New Page Flow:**
- Implementation: `pages/<feature>/<feature>.js` plus matching `*.wxml`, `*.wxss`, `*.json`.

**New Shared Client Helper:**
- Implementation: `utils/<name>.js`.

**New Cloud Operation:**
- Implementation: add a folder under `cloudfunctions/<name>/` with `index.js` and package files.

**New Static Asset:**
- Implementation: `images/` for icons and other referenced UI assets.

## Special Directories

**`cloudfunctions/`:**
- Purpose: Server-side boundary for protected data access.
- Generated: No.
- Committed: Yes.

**`pages/`:**
- Purpose: Routed UI and page controllers.
- Generated: No.
- Committed: Yes.

**`scripts/`:**
- Purpose: Maintenance automation and diagnostics.
- Generated: No.
- Committed: Yes.

**`tests/`:**
- Purpose: Automated checks.
- Generated: No.
- Committed: Yes.

**`.planning/phases/`:**
- Purpose: GSD phase context, plans, summaries, and verification reports.
- Generated: Partially; backfilled and maintained as durable project workflow artifacts.
- Committed: Yes.

---

*Structure analysis: 2026-06-26*
