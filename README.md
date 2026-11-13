---
type: readme
title: "Minmin Calendar"
tags: [project-docs, readme]
intent: "Minmin Calendar"
---

# Minmin Calendar

Minmin Calendar is a WeChat Mini Program for a private two-person shared calendar. It records period ranges and "happy time" memories in a shared cloud room, then renders them with period markers, memory hearts, prediction ranges, lunar dates, and China public-holiday context.

## Project Shape

- `pages/index/` - renders Calendar projection and forwards calendar/sheet/record events to their owners; keeps local reminder-seen storage, geometry and animation wiring, and the sync-pill display lifecycle and auto-hide timer. Records, revisions and in-flight loads belong to `roomRecordsSync`, not the Page; each projection shares one Today sample, and showing the page on a new date refreshes that projection.
- `pages/index/homepageSheets.js` - Home's sole registry for the four sheets; derives lifecycle keys and drag targets from each name, initializes their render state, and owns close actions, system-back priority and handoff wiring.
- `utils/sheetLifecycle.js` - shared enter/leave, handoff, page-obscuring, tabBar and system-back mechanisms plus the reduced-motion probe; Home supplies its own registrations, while Settings keeps its help-sheet adapter.
- `pages/period/` - 记录 tab hosting the segmented 经期/欢乐时光 lists; the Period editor renders its record-edit session and forwards form/lifecycle events.
- `pages/memory/` - compatibility entry to the record tab, plus a Memory editor that renders its record-edit session and forwards form/lifecycle events.
- `pages/bind/` - shared-room create, join, and recover flow.
- `pages/settings/` - room code, room unbind, export, and local cache controls.
- `utils/room.js` - room-code cache, recovery, create/join, leave, and local clear wrapper.
- `utils/roomPresence.js` - one-time local flags for the partner welcome and the seen room status.
- `utils/cloud.js` - frontend cloud-function access wrapper and room-scoped `RoomDataClient`.
- `utils/roomResolver.js` - active-room resolution seam used by `RoomDataClient`, with an in-memory test adapter.
- `utils/recordCommands.js` - Period/Memory edit sessions own form state, identity-scoped drafts, validation and save/delete coordination. Period configuration adds status transitions, history-backed duration hints, overlap choices and reopened-record identity migration. Record-tab list feedback remains here; Room failures use `roomAccessOutcome` and `wxPrompts`.
- `utils/recordPageSync.js` - saved/deleted record changes, previous-page notification, and the record-tab one-time segment intent.
- `utils/recordDraft.js` - edit-form draft stash with an injected storage adapter; `createWxDraftStorage` is the only wx local-storage seam.
- `utils/recordEditRoute.js` - Period/Memory edit URL construction and edit-page route option hydration, including the Memory date ceiling at today.
- `utils/recordFieldErrors.js` - shared session field-error retention and scrolling to the first invalid field below the fixed nav bar; sessions render each error under its field.
- `utils/roomRecordsSnapshot.js` - loads room-scoped Period/Memory outcomes keyed by collection; Home allows partial success, while Settings export requires both lists to succeed.
- `utils/roomRecordsSync.js` - owns homepage records, per-collection revision/confirmation state, one in-flight load shared by all callers, local-change snapshot invalidation, partial-failure retry copy and sync-pill state. It reads through RoomDataClient and publishes each accepted snapshot as one calendar update; blocked Room outcomes go to the Home failure presentation.
- `utils/settingsFlow.js` - shared room-code copy, export, retry/rebind and local-cache helpers, plus the Bind/Settings Room-leave confirmation, server outcome and one-time unbound notice.
- `utils/roomAccessOutcome.js` - client-side classification of room access failures plus the sole operation-aware failure presentation mapping.
- `utils/wxPrompts.js` - executes prompt specifications through wx modal/toast/navigation APIs, with the existing toast fallback when a native modal is unavailable.
- `utils/homeCalendarState.js` - the pure, complete homepage Calendar projection: markers and ARIA, status, quick-entry labels and destinations, reminder candidates, dated details/actions, prediction explanation, recap versus first-record guide, back-to-today visibility and record feedback; the sole owner of unsynced-collection display rules.
- `utils/calendarRowHeight.js` - homepage calendar geometry ledger: row height between the 44px floor and the density cap, per-density cell content minimums, the compact merged info row, and whether the record entry fits the first screen; rows never shrink below their content, so a short screen scrolls instead of clipping.
- `utils/safeArea.js` - runtime safe-area top/bottom computation; every page root injects `--safe-top`, `--safe-bottom`, `--nav-bar-height`, and `--capsule-right`.
- `utils/util.js` - date, lunar, holiday, base calendar-grid helpers, and the month-swipe decision.
- `utils/chinaHolidays.js` - official China holiday and adjusted-workday data table (2001-2026).
- `utils/periodCoverage.js` - period status, projection range, owning record for a date, monthly coverage union, and the destination for a new period entry.
- `utils/cycle.js` - cycle prediction, reminders, duration, and period metadata labels; period attribution comes from `periodCoverage`.
- `utils/calendarInsights.js` - prediction explanation and monthly recap copy.
- `cloudfunctions/` - WeChat Cloud Functions for room lifecycle and record persistence.
- `cloudfunctions/_shared/roomMembershipLifecycle.js` - canonical Room membership lifecycle source; four Room cloud functions deploy byte-identical local artifacts generated by `syncRoomMembershipLifecycle.js`.

## Local Development

Open this folder in WeChat Developer Tools using `project.config.json`.

`project.config.json` carries two independent exclusion lists. `packOptions.ignore` only affects what gets uploaded; `watchOptions.ignore` is what keeps the IDE file watcher off `.git/`, `cloudfunctions/**/node_modules/` and local agent/tool directories. Both are needed: without `watchOptions.ignore` the IDE watches ~11k files, which slows cold start and produces spurious hot-reload activity.

Two details make `watchOptions.ignore` easy to get wrong:

- The IDE reads it only when it initializes the project watcher, so edits require reopening the project — a recompile is not enough. `npm run devtools:preflight` reads the watcher's list from the IDE log's `new FileUtils instance dirpath = <project root>` block and compares it with the file.
- The watcher emits events for bare directory paths (`.git`) as well as paths inside them. A `dir/**/*` pattern does not match the bare `dir` event, so each ignored directory needs both its bare name and its subpath glob. This matters for `.git` specifically because a plain `git status` bumps the `.git` directory mtime without modifying any file inside it, so routine git usage alone is enough to trigger the event.

`packOptions.ignore` is not reliably reloaded either: after a `project.config.json` edit DevTools sometimes rebuilds its compiler with the new list and sometimes keeps the old one until the project is reopened. Run `npm run devtools:preflight` after editing either list; it compares what DevTools loaded with the file and prints the last code-quality result. `tests/package-contents.test.js` pins which roots may ship, and [代码质量扫描口径](docs/devtools-verification.md#代码质量扫描口径) records how the scan counts.

开发者工具内部脚本的加载错误、连接超时和 Console 提示先按 [开发者工具验证](docs/devtools-verification.md) 分层检查；不能仅凭 `WAServiceMainContext.js` 文件名或堆栈不含本仓库路径，就判定为可忽略噪音或业务故障。

多个 git worktree 并行开发时，每个 worktree 用 `npm run deps:install` 装自己的 `node_modules`，依赖装成真实文件，不从主检出硬链接：硬链接的目录树会被本机的受管删除拒收，worktree 用完就没法整棵回收。Playwright 浏览器只在主检出的 `.scratch/browsers/` 装一份，链接 worktree 里的 `npm run browser:install` 和 `npm run test:hit` 都直接用主检出这份。

根开发依赖中的 `miniprogram-automator` 固定为 `0.12.1`。它只通过旧式 `Jimp.read(buffer).bitmap` 解码二维码；[图像读取适配](tests/tools/automator-image/index.cjs) 将这次调用转发到 `jimp@1.6.1`，保留 PNG、JPEG、BMP、TIFF 和 GIF 读取，避免旧 Jimp 带入 `core-js@2`、`phin` 和 `mkdirp@0.5`。根依赖覆盖同时将 Zod 固定为安全版本 `4.6.7`。升级 automator 时须复核它的图像调用接口；完整验证中的真实 SDK 二维码回归会读取上述五种格式并核对内容，不以“包可以加载”代替解码通过。安装与审计入口见下方 Verification。

The mini program initializes WeChat Cloud in `app.js` with:

```js
env: 'cloud1-d8gyqvcez4e66b3da'
```

Cloud functions live under `cloudfunctions/`; each function has its own `package.json` and committed `package-lock.json`.
云函数依赖必须固定到精确版本，尤其是 `wx-server-sdk`，避免部署时解析到浮动的 `latest` 版本。
所有云函数应共享同一个已固定的 `wx-server-sdk` 版本；升级时要一起更新各函数的 `package.json`、`package-lock.json` 和依赖护栏测试。
当前锁定的 `wx-server-sdk@3.0.4` 解析到 `@cloudbase/node-sdk@2.10.0` 和 `@cloudbase/database@1.4.1`；随包接口包含 `db.startTransaction()`、`db.runTransaction()` 和 `collection.where(...).update(...)`。当前房间成员生命周期通过 `db.runTransaction()` 原子更新 Room 与成员锁；唯一索引重复键的真实错误形态仍需用带真实微信用户上下文的云端 smoke 验证。
提交 lockfile 只保证仓库输入可复现；云函数上传后仍要验证部署产物实际解析的 SDK 版本。

房间成员锁允许一个向后兼容的内部版本字段 `roomMembers.membershipId`，用于识别同一房间字段被复用后的不同成员资格。它是可选、非授权字段，不进入 Room / Record schema 或云函数远程响应；records 授权仍只看 `rooms`。新 create、join、recover 生成新 ID；ownership transfer 保留已有 partner ID，legacy partner lock 无 ID 时保持 legacy，只有 partner lock 缺失时才补建 fallback ID。既有 lock 无需强制 backfill。

部署 Room lifecycle 前运行 `node cloudfunctions\_shared\syncRoomMembershipLifecycle.js --write` 生成四份本地 artifact，并用 `--check` 阻止 canonical 与部署内容漂移。发布时应进入维护窗口，先把 `createRoom`、`joinRoom`、`getMyRoom` 作为同版一组发布，再发布 `leaveRoom`，避免新旧版本混跑。回滚按反向顺序：先恢复 `leaveRoom`，再同版恢复前三个云函数。`membershipId` 可选且旧版本可忽略，无需强制 backfill 或数据回滚；但旧版本运行期间不会维护成员锁，再次前滚前必须重跑锁一致性检查并补齐缺失锁。2026-07-10 已按该函数顺序部署到 `cloud1-d8gyqvcez4e66b3da`，完成 `roomMembers` 基础锁回填、`rooms.roomCode` 唯一索引、部署产物 hash 和实际 SDK 版本核验；带真实微信 `OPENID` 的 transaction retry、并发冲突和完整业务 E2E 仍需在小程序上下文中验证，本地测试或无用户上下文的 CLI invoke 不能替代这些信号。

2026-08-12 的架构深化已合并到当前 `main`（`159ed78` 及后续收尾提交）；本地测试和静态检查已验证，但当前仓库没有这批提交对应的新云函数部署或线上 live verification 凭证。需要发布时，仍按上面的维护窗口顺序部署并单独记录远端产物、依赖版本和真实小程序上下文 smoke 结果。

各云函数最后一次有记录的部署见 `docs/verification-log.md` 的「云函数部署现状」表；每次部署后更新它。

### 云数据库索引基线

`rooms` 集合必须保留以下索引：

- `roomCode_1_unique`：`{ roomCode: 1 }`，唯一索引，保护房间码全局唯一性。
- `createdBy_1_status_1`：`{ createdBy: 1, status: 1 }`，非唯一复合索引，支持创建者的 active Room 和 archived recovery 查询。
- `partnerOpenid_1_status_1`：`{ partnerOpenid: 1, status: 1 }`，非唯一复合索引，支持已加入成员的 active Room 查询。

后两条索引只优化 Room 身份查询，不改变 `rooms` 作为 records 授权来源或 `roomMembers` 作为并发锁的职责。创建或补齐这些索引是云数据库操作，在线生效后不需要重新部署云函数或上传小程序。

## Verification

使用 Node.js 24，在项目根运行：

```powershell
npm run release:prepare
npm run verify
```

`npm run release:prepare` 在目标检出执行带告警检查的 `npm ci`、安装对应 Playwright 浏览器，再实际启动并关闭 headless Chromium；独立副本使用自己的缓存，linked worktree 沿用主检出缓存。可传 `-- --root <目标检出绝对路径>`；`-- --check-only` 只检查现成环境。准备失败立即返回非零，完整日志和结果保存在目标的 `.scratch/release-prepare/`，不会提交、推送或运行完整验收。

`npm run deps:install` 可单独安装根开发依赖：弃用/安装脚本等 npm 告警、非零退出或锁文件漂移都会失败。`npm run deps:check` 在线审计根依赖（包含 dev）并检查锁中的弃用包；它区分策略不通过（退出 1）与网络、超时或无效报告（退出 2），缺少审计结果不会算零漏洞。云函数各自的依赖锁不在此根审计范围。

`npm --silent run deps:report -- <包名...>` 输出不超过 6000 UTF-8 字节的 JSON：包版本、告警来源、最短依赖链和去重后的直接依赖影响集合；省略包名时只列问题节点。完整审计原文留在 `.scratch/dependencies/`，输出包含原文路径及被省略条数，避免展开整个 peer 依赖树。

`npm run verify` 是本地、提交钩子与 CI 的共同入口：先执行根依赖审计，检查 app、pages、utils、cloudfunctions、tests 中的 JavaScript 语法，自动发现全部 `tests/*.test.js`（含真实自动化 SDK 图像兼容回归），再将既有跨日/午夜用例分别放在 UTC 和 Asia/Taipei 子进程中验证，核对 Room artifact，并运行 320/375/430 宽度的坐标命中回归。日期边界回归也可单独用 `npm run test:clock` 定位；两轴都必须执行完全部指定用例，缺失、跳过或进程失败不能算通过。依赖和临时目录不进入语法清单；新增源文件无需维护 README 清单。提交钩子传 `--tracked`：语法和测试清单改从 git 索引取（已跟踪加已暂存的文件），共享工作树里别的会话还没跟踪的文件不进本次提交的检查。

#169 的页面行为测试经 `tests/helpers/miniProgram.js` 这一份微信平台 harness，或 `buildHomeCalendarState` 的纯 projection 表格验证。`tests/test-seam-guardrail.test.js` 随完整测试运行：迁移预算 `BUDGET` 已清空，仅保留 Room lifecycle 云函数部署打包的 JS 源码读取例外；WXML/WXSS 设计守卫与既有公开 interface 测试继续保留。harness 同样约束原生确认按钮文案最多四个汉字。

首次检出及 Playwright 版本升级后运行 `npm run release:prepare`；仅补装浏览器时可用 `npm run browser:install`，缓存位置按上面的检出类型解析。日常输出只显示结果、测试条数和日志路径；完整门禁日志在 `.scratch/verify/`，依赖原文在 `.scratch/dependencies/`，发布准备日志和结果在 `.scratch/release-prepare/`，坐标与截图证据在 `.scratch/coordinate-hit/`。这些入口覆盖各自最近一次结果；CI 失败时归档上述诊断目录。任何检查失败均退出非零。`npm test`、`npm run check`、`npm run test:hit` 可用于单独定位，不能代替完整验收。定向用例优先用 `npm run verify:target -- --tests tests/capture-evidence.test.js,tests/devtools-cli.test.js [--name '用例正则']`：复用完整日志写盘，只返回计数和有界失败片段，日志在 `.scratch/verify-target/tests.log`；文件重复、非法路径或零匹配均失败，不能把 Node 的文件包装行当作有效用例。预期测试红灯保留真实非零退出；retro 审计用 `--expected-exit <原始结果行号>:<退出码>` 标记，不能把其他失败一起豁免。

WXML/WXSS 的 Impeccable 静态检查走 `npm run impeccable:detect -- --target pages --launcher <impeccable(.cmd) 路径>`。入口先把 `app.json` 注册的页面转换成 HTML shim，`<include>` 的片段原地展开进引用它的页面，展开出的元素 `data-src` 指回片段文件；输出源 WXML 数、生成 HTML 数、展开过的片段、扫描类型和 findings 摘要；没有 WXML 时失败闭锁，不把直接检测 `pages/` 的空数组当成已覆盖。本机存在受管 `D:\agents\tmp` 时默认把每次运行写入其独立子目录，其他环境回退到 `.scratch/impeccable-shims/`；可用 `--out` 或 `MINMIN_IMPECCABLE_TEMP` 覆盖。完整 findings 保留在输出目录，退出码 0 表示无命中、2 表示有候选、1 表示覆盖或调用失败。候选仍须回源复核，本检查不进入 CI，也不替代微信验收。

组件级视觉审计先用 `node tests/impeccableAudit.mjs --component calendar`；`--list-components` 列出 calendar、atmosphere、typography、sheets、feedback、motion 六个视角。只读 JSON 摘要给出带行号的设计段落、静态选择器引用、动效、相关测试，以及 `.scratch/screenshots/captures.jsonl` 的 current / runtime-unconfirmed / stale / historical-unbound 分类；`--captures <路径>` 可指定其他账本。缺失源码、未知组件和损坏账本会直接失败。摘要是定位入口，不替代 DESIGN.md、真实界面审美判断或微信验收；检测器命中也只是待回源候选。需要直接管道解析 stdout 时使用上述 `node` 入口；`npm run impeccable:audit` 是等价的交互命令，但 npm notice 会混进 stdout。

UI 改动仍需微信开发者工具验证。连接预检、MCP 备用路径、截图与视口记录见 [开发者工具验证](docs/devtools-verification.md)。选择器 `tap()` 可以绕过遮挡，不能证明实际点击可达；Chromium 坐标回归只验证提取的导航栏 CSS，微信验收另行记录实际视口。

每个 epic 的验证记录（要点、测试数、未验证项）在 [docs/verification-log.md](docs/verification-log.md)。

## Repository Hygiene

Generated dependencies, local tool state, imported reference material, and historical `hermes-*` maintenance reports are ignored by `.gitignore`.

Do not commit:

- `cloudfunctions/**/node_modules/`
- 根 `node_modules/`（`npm ci`/`npm install` 的本地产物；根 `package.json` 与 `package-lock.json` 提交，已在 `packOptions.ignore` 排除出上传）
- `project.private.config.json`
- IDE-only churn in `project.config.json`. That file stays tracked because DevTools opens the project with it; commit it only when `appid`, `packOptions`, `watchOptions`, or compile settings actually change.
- `.codegraph/`
- `.codex/`
- `.serena/`
- `.tdd/`
- `.impeccable/`（impeccable critique 快照等本地工具状态）
- `.scratch/*`（保留已跟踪的 `.scratch/README.md`）
- `_external/`
- `scripts/`
- `hermes-*.csv` / `hermes-*.md`

`.githooks/pre-commit` 与 `.githooks/pre-push` 跑与 CI 相同的检查，默认不启用。要在某个克隆里启用，由那台机器自己执行 `git config core.hooksPath .githooks`。rebase、merge、amend 产生的提交不经过 pre-commit，所以推送到 `main` 时 pre-push 再把一次关：推送的必须是当前 HEAD，已跟踪文件不能有未提交改动，然后跑 `npm run verify -- --tracked` 和推送范围的 `git diff --check`，任何一项不过就拒绝推送。

## Project Notes

This is a regular non-GSD repository. For non-trivial work, start with `CONTEXT.md`, the relevant files under `docs/`, and the source/test files for the area being changed.

## Git Branch Policy

- This repository is a standalone public project, not a third-party upstream local patch stack.
- Publish authorized changes as focused commits to the user-owned `origin/main`. Creating a temporary branch requires explicit approval.
- Do not create or update `patch-stack/*` branches in this project.
