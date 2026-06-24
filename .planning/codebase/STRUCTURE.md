# Codebase Structure

**Analysis Date:** 2026-06-24

## Directory Layout

```text
minmin-calendar/
├── README.md
├── app.js
├── app.json
├── app.wxss
├── cloudfunctions/
├── images/
├── pages/
├── scripts/
├── tests/
├── utils/
└── DESIGN.md
```

## Directory Purposes

**Root files:**
- Purpose: App bootstrap, global routing, and project metadata.
- Contains: `README.md`, `app.js`, `app.json`, `app.wxss`, `project.config.json`, `sitemap.json`.
- Key files: `README.md`, `app.js`, `app.json`, `project.config.json`.

**`pages/`:**
- Purpose: User-facing mini program screens and page-specific logic.
- Contains: One folder per page, each with `*.js`, `*.json`, `*.wxml`, `*.wxss`.
- Key files: `pages/index/index.js`, `pages/bind/bind.js`, `pages/period/period.js`, `pages/period/edit/edit.js`, `pages/memory/memory.js`, `pages/memory/edit/edit.js`, `pages/settings/settings.js`.

**`utils/`:**
- Purpose: Shared client helpers.
- Contains: Date/calendar utilities, cycle prediction helpers, period metadata helpers, and cloud-function wrappers.
- Key files: `utils/util.js`, `utils/cycle.js`, `utils/cloud.js`.

**`cloudfunctions/`:**
- Purpose: Server-side logic for room management and shared record persistence.
- Contains: One folder per cloud function, each with `index.js` and package files.
- Key files: `cloudfunctions/createRoom/index.js`, `cloudfunctions/joinRoom/index.js`, `cloudfunctions/getMyRoom/index.js`, `cloudfunctions/login/index.js`, `cloudfunctions/dataOp/index.js`.

**`images/`:**
- Purpose: Tab icons and UI assets.
- Contains: Image files referenced from `app.json` tabBar and page styles.
- Key files: `images/calendar.png`, `images/calendar_active.png`, `images/add.png`, `images/add_active.png`, `images/settings.png`, `images/settings_active.png`.

**`tests/`:**
- Purpose: Automated checks for shared calendar behavior.
- Contains: Test files such as `tests/calendar-display.test.js` and `tests/cycle-prediction.test.js`.
- Key files: `tests/calendar-display.test.js`, `tests/cycle-prediction.test.js`.

**`scripts/`:**
- Purpose: Maintenance and environment automation scripts.
- Contains: PowerShell scripts with `hermes-` prefixes.
- Key files: `scripts/hermes-*.ps1`.

## Key File Locations

**Entry Points:**
- `README.md`: Human-facing setup, verification, and repository hygiene entry point.
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
- `utils/util.js`: Calendar/date calculations.
- `utils/cycle.js`: Cycle prediction, reminders, flow labels, and symptom labels.
- `pages/index/index.js`: Derived calendar view model.
- `cloudfunctions/dataOp/index.js`: CRUD gateway for shared records.

**Testing:**
- `tests/calendar-display.test.js`: Calendar display and template contract coverage.
- `tests/cycle-prediction.test.js`: Cycle prediction, reminder, and period metadata coverage.

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

---

*Structure analysis: 2026-06-24*
