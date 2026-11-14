---
type: reference
title: "微信开发者工具验证"
tags: [verification, devtools]
intent: "连接与资源诊断、官方 CLI/MCP 入口及 GUI 验收边界"
---

# 微信开发者工具验证

在项目根运行以下命令。开发者工具需已打开本项目并登录，安全设置中的服务端口需开启。预检与资源探针只读；CLI 的 `open`、`close`、`auto` 及 MCP/GUI 操作按当前任务授权执行。本文入口不修改官方安装文件或部署云函数。

## 连接路径

先运行 `npm run devtools:preflight`。它分别检查官方 CLI 的服务/登录响应，以及本机 automator 端口；TCP 监听只表示可开始握手，不代表页面可用。它还比对开发者工具已加载的 `packOptions`、`watchOptions` 与磁盘上的 `project.config.json`，并打印最近一次代码质量结果（见下文「代码质量扫描口径」）。在 Windows 上它还回读本项目窗口（标题为 `project.config.json` 的 `projectname`）是否最小化。它还读模拟器的基础库生命周期日志，看最近一次逻辑层启动有没有加载页面、页面代码有没有跑；这项失败时列出最近 5 次启动各进了哪些页面。可传 `-- --ide <安装目录> --ws ws://127.0.0.1:<端口>`。默认探 9420；并行 worktree 的项目窗口开在别的端口时必须传同一个端口，否则只会报 `connect ECONNREFUSED 127.0.0.1:9420`。

| 结果 | 下一步 |
|---|---|
| `DevTools loaded project.config.json` 为 FAIL | 开发者工具还在用旧配置：关闭并重新打开项目后重跑。SKIP 表示没找到本项目的状态文件，先在开发者工具里打开项目。 |
| CLI 未确认登录或超时 | 检查 IDE 登录与服务端口；脚本 10 秒后退出，保留诊断摘要。 |
| CLI 正常，9420 未监听 | 运行下面的 `auto` 命令一次；若仍停在 preparing，使用 MCP 备用路径。 |
| 9420 已监听 | 运行 `devtoolsCapture.mjs --ws`；握手超过 15 秒即失败，转 MCP。 |
| `DevTools project window` 为 FAIL，或 CLI 与 9420 都正常、截图却报 `fail to capture screenshot` 或等 `.page` 渲染超时 | 项目窗口最小化时截图会失败（2026-11-04 实测）：请维护者还原窗口，重跑预检后再截。窗口正常仍失败时，看是否有别的程序窗口挡住模拟器区域，同样请维护者处理；还失败就停下，报失败行和截图目录。SKIP 表示没找到这个窗口，先在开发者工具里打开项目。本机排查记录见知识库「微信开发者工具 CLI 自动化验收环境坑」。 |
| `Latest app launch loaded a page` 报 `without loading a page`，或 console 报 `routeDone with a webviewId N is not found` | 最近一次逻辑层启动只跑了 `App onLaunch`，没加载任何页面；CLI 和 9420 照常应答，页面逻辑却要到下一次编译才恢复。常见于开发者工具刚启动的一分钟内（2026-11-07 实测）。等调试面板加载完，在开发者工具里点一次「编译」后重跑预检。SKIP 表示日志里还没有启动记录，或启动不到 5 秒还没写页面记录（日志每 3 秒落盘），稍后重跑。排查记录见知识库「微信开发者工具重载竞态与基础库本地补丁」。 |
| `Latest app launch loaded a page` 报 `page code never ran`，或 console 报 `module '<路径>.js' is not defined, require args is '<相对路径>'`（常跟着 `Component is not found in path "wx://not-found"`），而这个文件在磁盘上、已入 git | 开发者工具的增量编译漏掉了这个模块，常见于开着项目时 git 一次写进新模块和引用它的页面（2026-11-08 那次是 rebase，开发者工具 2.02.2609250）；`npm run devtools:timeline` 能看到编译前的那批 `onFileChange add`。请维护者关闭并重新打开项目后重跑预检；只改修改时间或改名再改回都会触发重编译，但恢复不了。判据：页面没注册时框架照样记 onLoad，但每个页面的 data 都用 safeArea 调 `wx.getWindowInfo`，所以正常启动在第一个页面的 onLoad 之前有这条调用，漏掉时一条 API 调用都没有。 |
| 只需外观确认，automator / MCP 均不可用 | 在任务已授权只读截图与窗口激活时，Kimi Code 可用 `kimi-cu-win` 直接按「微信开发者工具」定位窗口，最小化时先激活再截图；只证明当时可见画面，不证明实际视口、交互或小屏验收。 |
| MCP 预检先 `PASS MCP bridge`，再报 `FAIL MCP runtime: simulator automator did not answer` | bridge、token、客户端授权和项目路径都通，是模拟器里的 automator 没应答（`timeout waiting for automator response`），不取决于 9420 开没开：2026-11-08 出现时 9420 没在监听，2026-11-09 9420 同样没监听、项目窗口还最小化着，这一步却 PASS；2026-10-10 自动化端口开在 15080 时，`miniprogram-automator` 也报同一句（见 `docs/verification-log.md`）；2026-11-07 有两次单张截图首次报这句，重试后截到。隔几秒重跑一次；仍失败就在汇报里把 `automation_*` 工具记为不可用。console 照常用 `get_simulator_console` 读，它不经过 automator（2026-11-08 实测）。 |
| 其他 MCP 预检失败 | 先看 FAIL 行附带的错误摘要；不够再定向查看本次脱敏日志，核对 IDE 中现有 MCP token、项目路径和已打开的项目窗口。 |
| MCP 返回 `Client authorization pending` | 在 IDE 中批准 `minmin-devtools` 客户端后重跑；token 有效不等于新客户端已获准。 |
| IDE 里的表现和磁盘对不上（报错指向磁盘上好好的文件，或改动迟迟不生效），上面又没有对应行 | 先请维护者关闭并重新打开项目，再重跑预检；重开后还能复现，再按下文「代码质量扫描口径」的回查规则，用 `asar_extract.py grep` 查开发者工具源码。2026-11-08 先读源码、改修改时间、改名再改回，都没修好，重开项目就好了。 |

```powershell
npm run devtools:cli -- auto --project 'D:\agents\projects\敏敏子日历' --port 9420 --timeout 15000
node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --states 'home,home:tools,home:legend'
```

`--trust-project` 是自动化首次连接所需参数。CLI 的服务端口和 automator 的 9420 是不同通路；开启服务端口不保证 9420 会监听。不要因 `auto` 卡住而把业务代码改成兜底逻辑。

`devtools:cli` 使用安装包中的官方 CLI 入口，自动把项目路径规范为 Windows 原生绝对路径，并为 `auto` 添加 `--trust-project`。支持 `islogin`、`open`、`close`、`auto` 和下文两个云函数只读查询，默认 10 秒、最多 60 秒；除云函数查询外，输出只含命令、状态和退出码，不输出登录原文。超时返回 124，并终止本次启动的 CLI 进程树；不会终止已运行的 IDE。`ok` 只代表 CLI 退出成功，页面是否就绪仍需运行态检查。预检的登录检查共用此入口。

同一入口还有两个只读的云函数查询，云环境 ID 取 `app.js` 里 `wx.cloud.init` 的 `env`：

```powershell
npm --silent run devtools:cli -- cloud-list --env <云环境 ID> --timeout 30000
npm --silent run devtools:cli -- cloud-info --env <云环境 ID> --names dataOp,joinRoom --timeout 30000
```

`cloud-list` 列出云端已有的云函数；`cloud-info` 返回每个函数的状态、超时秒数和运行时（2026-11-11 实测只有这三项）。它们不返回部署时间、代码摘要或依赖版本，回答不了「线上跑的是哪一版」：那要在云开发控制台或真实小程序上下文里核对，结果记进 `docs/verification-log.md` 的「云函数部署现状」表。官方 CLI 查询失败时也退出 0，本入口按输出里有没有成功行判定，成功行的符号是 `√` 或 `✔`（随终端环境变化）；`cloud-info` 部分函数失败时，CLI 打的是警告符号而不是成功行，本入口同样判为 `failed`。失败时 `status` 为 `failed`、退出码 1，`output` 是错误原文。`deploy`、`inc-deploy`、`download` 不放行。

要看编译、重载、页面 webview 和文件增删的先后（比如上表的启动后没加载页面、编译漏掉新模块），运行 `npm run devtools:timeline -- --from 20:26 --to 20:28`。它从本项目所在 profile 的 IDE 日志里挑出编译、appservice 重载与启动、`WEBVIEW_PAGEFRAME` 创建与销毁、调试面板加载、代码文件（js、ts、wxml、wxss、wxs、json）的新增与删除，以及除已知噪音外的 WARN/ERROR，按时间排好。只写时分秒时按今天算，默认看最近 10 分钟；输出里的 openid 和 token 已替换。

## 基础库资源诊断

遇到 `WAServiceMainContext.js`、`WAAutoService.js` 或 `WAWebview.js` 的加载错误，运行 `npm run devtools:resources`。入口使用当前仓库路径，从开发者工具项目状态定位 profile，再从最近 12 份日志关联本项目窗口和模拟器地址；版本取本项目 private/config 的 `libVersion`。请求自动带上 `winId` 和 `sid`，不钉死端口、窗口 ID 或基础库版本。日志只是上下文线索，三份资源的现场响应才是本次结果；未发现上下文时失败退出，不猜地址。新日志中本项目尚未创建模拟器时，不回退旧日志中的可用端口。

| 状态 | 含义 |
|---|---|
| `resource-ok` | 当前请求返回非空 JavaScript；不代表 automator 握手或页面交互通过。 |
| `invalid-request` | 返回 `no winId` 等上下文错误；不能当成基础库损坏。 |
| `library-missing` | 响应明确包含 vendor 内容缺失或版本配置缺失。 |
| `unclassified-response` | 仅有 HTTP 500、空体或非 JavaScript 响应，证据不足，需按当前错误定向读日志。 |
| `context-unavailable` / `unreachable` / `timeout` | 未定位项目上下文、端口不可达或单资源超过 5 秒。 |

输出仅保留资源名、分类、HTTP 状态、字节数、上下文与版本，不打印资源正文、账号数据或整行压缩源码。失败退出 1；只有三份资源均正常才退出 0。当前日志格式已在 2.02.2609240 验证，IDE 升级后的格式变化可能需要更新解析器。

## Console 提示过滤与 GUI 操作

本机 GUI 会话与 preload 过滤验收入口见 [GUI 会话适配层](D:/agents/projects/统一环境/docs/env-governance/gui-session.md)。经当前任务授权后，在官方 `node_repl` 中使用同一个 `@oai/sky` 会话；绑定失败只重观察一次，输入失败不自动重放，用户 Esc 立即停止。

只针对 `WAServiceMainContext.js` 和 `WAAutoService.js` 的未使用 preload 提示过滤：先用实际消息校验规则，写入后检查两条提示隐藏、普通 warning 和真实 error 保留，再重新编译检查。普通失败恢复原过滤值并读回确认；Esc 停止后不继续回滚。过滤仅改变 Console 显示，不修复开发者工具的 preload 行为；规则测试通过也不等于当前窗口已生效。

## MCP 备用路径

```powershell
npm run devtools:mcp -- --preflight
npm run devtools:mcp -- --list
npm run devtools:mcp -- --schema automation_evaluate
npm run devtools:mcp -- --requests .scratch/devtools/requests.json
```

`--preflight` 分两步：先用 `get_simulator_console` 读一行 console 缓存，它不经过模拟器里的 automator，PASS 说明 bridge、token、客户端授权和项目路径都通；再用 `automation_runtime_info` 取 systemInfo，PASS 行带实际视口。

token 依次取 `WECHAT_MCP_TOKEN`、本机密钥库里的 `wechat-devtools-mcp-token`、终端隐藏输入。密钥库只需你在自己的终端录入一次：`pwsh -NoProfile -File 'D:/Codex/.codex/scripts/Set-LocalSecret.ps1' -Name wechat-devtools-mcp-token`（输入不回显，只有本机同一用户能解密；IDE 里换了 token 时加 `-Replace` 重录）。录入后 Agent 跑 `devtools:mcp` 不用再把命令交给你；只有元数据可查：`python -B -I 'D:/Codex/.codex/scripts/local_secret.py' --info wechat-devtools-mcp-token`。调用入口不接受 token 参数，凭据不写入请求文件或日志；启动官方 bridge 时仍按其接口通过子进程参数传递 token。调用器使用安装目录中的官方 MCP 入口，`--ide` 可覆盖安装位置；不会修改 IDE 文件。默认仅列工具名称，只有 `--schema <精确工具名>` 输出该工具 schema。

请求文件是 `{ "name": "工具名", "arguments": { ... } }` 或其数组，按顺序执行。未填写 `arguments.project` 时使用当前仓库；所有 project 路径解析为 Windows 绝对路径并去掉多余的末尾分隔符，避免 `cant find runtimeid by projectpath` 或截图工具的 `project window not found`。先读取相关 schema，再构造最小请求。只读预检示例：

```json
[
  { "name": "automation_runtime_info", "arguments": { "action": "systemInfo" } }
]
```

JSON-RPC error、`isError`、结构化或文本 JSON 中的 `success:false`、超时、bridge 异常退出都会产生非零退出码并停止后续请求。默认每个请求 25 秒，可用 `--timeout` 调整。常规输出仅显示工具结果摘要和日志位置。工具返回失败时，FAIL 行附带脱敏后的错误摘要，最长 300 字符：只取 `code`、`errCode`、`errno`、`error`、`errMsg`、`message`、`msg`、`reason` 字段，嵌套的 `error` 对象只取一层；没有这些字段时只列字段名，`isError` 的纯文本截取原文。其余字段可能是页面数据，只写进完整脱敏通信日志 `.scratch/devtools/mcp.jsonl`，每次运行覆盖上一次；摘要不够判断时再从该日志定向读取。日志可能包含当前页面数据，仅供本地检查，不上传或入库。

读 console 用 `get_simulator_console`（network 用 `get_simulator_network`）。`command` 是 grep 字符串，只认 `-n`、`-i`、`-E`、`-C N`、`-m N` 和一个模式，不带 `-E` 时按字面匹配。它读的是项目窗口最近 200 条 console 缓存，不是实时流。2026-11-07 点编译后实测（开发者工具 2.02.2609250、基础库 3.18.0），请求 `grep -n -E "WeChatLib|Subpackages|LazyCodeLoading"` 和 `grep -n .` 都只返回 1 行，即主上下文（`WAServiceMainContext.js`）打印的 `[system] WeChatLib: 3.18.0`。所以主上下文的输出能进缓存，但缓存不全：按基础库源码，同一次启动主上下文还会打印 `Subpackages`，子上下文会打印 `LazyCodeLoading`，这两行都没进来，原因没查实。用它查 `getPageTypeById`、`routeDone` 这类报错时，命中可以当证据，没命中不能说明 console 干净，仍以 IDE 界面为准。模拟器生命周期日志只有 `[log]` 级，也没有这些报错。

## 独立 Electron 启动与诊断

日常项目打开仍用 `devtools:cli`；该 CLI 子进程只局部设置 `ELECTRON_RUN_AS_NODE=1`。需要直接启动 GUI／主进程 inspector 时使用 `npm run devtools:session -- gui|inspect --executable <当前官方exe绝对路径>`，不在 shell 手工继承或修改机器级环境变量。GUI 还需 `--title <预期精确窗口名>`；额外启动参数放进 JSON 字符串数组，用 `--args-file <文件>` 传入。inspect 默认仅绑定 `127.0.0.1:9229`，可用 `--port` 改端口。两种模式都会在自己的子进程中移除所有大小写形式的 Node 模式变量。

这是有界诊断入口：默认就绪上限 15 秒，`--timeout` 最多 60 秒；就绪后默认立即关闭，也可用 `--hold-ms 1..55000` 留出诊断时间。GUI 的 ready 只表示本轮 PID 出现了指定标题的窗口，不证明页面健康；inspect 会通过协议读取 process.pid，比对本轮启动 PID。已运行实例的单实例转交或已有 inspector 不会被认领，启动失败就停止，不杀共享实例。API `withElectronSession(options, work)` 供同进程诊断使用，回调带 AbortSignal；正常、异常和超时都在 finally 中仅清理所属子进程树，并等待退出。不要把本入口用于常驻开发服务。

## 代码质量扫描口径

官方文档没写这两项怎么统计；以下读自开发者工具 2.02.2609231 安装包里的扫描器（as of 2026-10-10）。允许进包的根目录和两项预算由 `tests/package-contents.test.js` 钉住。

- 「主包大小」：主包所有文件的字节和，不含 `.js.map`，上限 1.5 MiB。
- 「图片和音频资源」：整个包里所有图片和音频文件的字节**总和**要小于 200 KB，不是单个文件的上限。
- 计入的文件：项目文件扣除 `packOptions.ignore` 和云函数目录后，再按上传白名单过滤（含 `.png`、`.json`、`.js`、`.wxml`，不含 `.md`、`.mjs`、`.yml`）。「无依赖文件过滤」只处理代码文件，截图照样进包。
- 扫描时机：只有点面板的「重新扫描」或上传时才扫，CLI 和内置工具都触发不了。面板不显示各包字节数和文件明细，`npm run devtools:preflight` 会打印最近一次结果。
- 配置生效：`project.config.json` 改动后，开发者工具不一定重新读取 `packOptions`。2026-10-10 单独改这个文件时它当场读入；与其他文件一批改动时，直到重开项目都没读入。`watchOptions` 只在打开项目时读取。改完先跑预检，报配置过期就关闭并重新打开项目，再重新扫描。
- 回查规则：`python -B -I 'D:/Codex/tools/asar-extract/asar_extract.py' grep '<安装目录>/resources/app.asar' 'PACKAGE_SIZE_LIMIT|IMAGE_AND_AUDIO_LIMIT'`，每条命中带包内文件名（2026-11-08：13 秒 10 条，配置在 `js/9223b7e8fdc904a1d4c72f9829351a93.json`，检查逻辑在 `js/3b6b93029b234f57c8b150f8796c7aef.js`；文件名随版本变）。

## 点击与截图验收

`npm run test:hit` 从当前 WXML 提取导航栏，从 WXSS 提取相应规则，在 Chromium 的 320、375、430 宽度按坐标点击按钮中心。每种宽度随后恢复装饰层拦截，必须观察到点击失效，证明检查能捕获原故障。截图和实际 viewport 保存到 `.scratch/coordinate-hit/`，每次运行覆盖上一次；截图偶发失败时打印 WARN 并重试一次，第二次仍失败则本次检查失败。这验证 CSS 命中，不模拟微信布局引擎或完整页面流程。

`devtoolsCapture.mjs` 在已渲染的 `.page` 出现后截图，将微信 `systemInfo` 的实际 `windowWidth/windowHeight`、页面路径、具名状态、日历密度、采集时间和 `captureToolVersion` 追加到截图目录的 `captures.jsonl`。`source` 只表示采集时磁盘中 `app.*`、`pages/**`、`utils/**` 的 SHA-256 指纹，不单独证明模拟器加载了同一版。当前 version 2 另带 `runtime`；只有磁盘一致且本轮编译挑战匹配才是 `current`。磁盘不同为 `stale`，没有磁盘指纹为 `historical-unbound`，磁盘一致但缺少运行确认（包括旧版图）为 `runtime-unconfirmed`；后三者都不能作为当前版本验收。MCP `--preflight` 同样报告实际视口；截图尺寸或机型名称不能证明逻辑视口。

需要当前版本证据时，先运行 `npm run devtools:runtime-proof -- prepare`，在当前 IDE 对本仓库完成编译，再运行 `node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --states home --runtime-proof .scratch/runtime-probe.json`。prepare 以独占创建方式写入临时 `utils/__captureProbe.js`，包含新 nonce 与业务源码指纹；采集器从编译环境 require 此模块，截图前后回读并检查源码和页面路径未变，不能通过 evaluate 人工赋值伪造通过。缺失、旧 nonce 或源码变化直接拒绝登记。未传 proof 时仍可采集定位图，但明确记为运行版本未确认。

采集后必须运行 `npm run devtools:runtime-proof -- clean`；它只删除内容与本轮 proof 匹配的临时模块和证明文件，内容变动则拒绝清理。临时模块不参与业务指纹并被 git 忽略，完整验证的包内容检查会拒绝它的残留，防止进入发布。挑战证明本轮编译标记已进入运行环境，不替代页面状态、样式或关键交互验收。

开始组件级视觉审计时先运行 `node tests/impeccableAudit.mjs --component <id>`（ID 用 `--list-components` 查看）。它把相关 DESIGN.md 与 `docs/motion-and-interaction.md` 片段、静态选择器、动效、测试和截图账本压成一份 JSON；截图分类复用上述指纹规则。先读这些定位信息，再按疑点打开源码和 current 证据，避免先读完整规范或遍历所有历史截图。摘要失败或没有 current 证据时按缺口记录，不把静态索引或旧图当作运行态验收。

实际坐标点击复用 [受管 GUI 会话](D:/agents/projects/统一环境/docs/env-governance/gui-session.md)：Harness 无官方后端时使用其中的 Windows 传输。每次动作都绑定新截图、窗口身份和 DPI；失焦、几何变化或遮挡产生的是证据无效，不能登记成产品按钮 FAIL。连续两次失效后停止自动输入并做一次人工对照，不继续用自写点按脚本推进安装包补丁。

选择器 `tap()` 可能绕过命中遮挡。验证“按钮点不到”时，CSS 坐标回归之外还需在微信中实际坐标点击或人工点击；菜单打开、图例交接、关闭等状态流可用选择器自动化验证。截图若出现空白或未完成状态，先确认目标页面已就绪再重截，不能将文件写入成功当作界面验收。

automator 驱动时，由页面内 `wx.navigateTo` 打开的页面常常退不回：小程序内 `wx.navigateBack` 报 ok，页面栈却不变，点导航栏返回也一样。2026-11-14 记录 tab 的 `editPeriod` 打开的编辑页 6/6 退不回，automator `navigateTo` 打开的 5/5 都退回；同一个删除流程在后一种页面上 4/4 退回记录 tab，前一种 1/1 卡住，导航代码当时没有改动，所以这不是删除流程的故障（真机未验证）。脚本要走「打开 → 保存或删除 → 返回」时，先用 `mockWxMethod('navigateTo', …)` 记下入口拼出的 URL 且不跳转，再用 automator 按这个 URL 打开，页面拿到的参数与点入口相同。`restoreWxMethod` 只对本次 mock 过的方法调用：对没 mock 过的方法，它会把方法置成 `undefined`（2026-11-14 `showModal`、`navigateTo` 因此消失，用 `devtools:cli` 关闭并重开项目后恢复）。

### UI 收尾清单

实现者与评审者按改动面核对以下各项；不适用项写明理由。`npm run verify` 和 Chromium 坐标回归不能替代微信运行态验收。

- **实际视口**：从 `systemInfo` 或 MCP 回读 `windowWidth/windowHeight`，记录页面、视口、状态和证据位置，不从截图尺寸或机型名称推断。运行态只在模拟器当前机型上验收，不切换机型，也不做兼容性测试（维护者 2026-11-06 的决定）；小屏由 `npm run test:hit` 与 `tests/narrow-screen-geometry.test.js` 覆盖，交付报告把小屏运行态写成「按维护者决定不做」。
- **页面状态与密度**：日历改动覆盖完整、清爽两种密度，并按改动面覆盖单日、连续段和今天态；其他页面改动覆盖受影响状态。只读 GUI 截图只能证明当时可见画面。
- **关键交互**：按改动面走完相关端到端流程；选择器 `tap()` 的状态变化不证明实际坐标可达。
- **交付报告**：逐项写明已验证与未验证内容。缺少密度或关键交互证据时，明确列出缺口，不写笼统的「全部验证通过」。
- **证据外发**：开发者工具用维护者的微信号运行，绑定的是真实房间，截图里的日历、统计和实读到的日期、条数都是真实记录。证据留在 `.scratch/`；贴进 issue 或提交进仓库前，按 [Issue Tracker](agents/issue-tracker.md) 的证据规则裁到被测控件或换成替身数据。
