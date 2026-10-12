---
type: reference
title: "微信开发者工具验证"
tags: [verification, devtools]
intent: "连接预检、MCP 调用及截图证据边界"
---

# 微信开发者工具验证

在项目根运行以下命令。开发者工具需已打开本项目并登录，安全设置中的服务端口需开启。自动操作沿用当前任务授权；脚本不会重启 IDE、修改全局配置或部署云函数。

## 连接路径

先运行 `npm run devtools:preflight`。它分别检查官方 CLI 的服务/登录响应，以及本机 automator 端口；TCP 监听只表示可开始握手，不代表页面可用。它还比对开发者工具已加载的 `packOptions`、`watchOptions` 与磁盘上的 `project.config.json`，并打印最近一次代码质量结果（见下文「代码质量扫描口径」）。可传 `-- --ide <安装目录> --ws ws://127.0.0.1:9420`。

| 结果 | 下一步 |
|---|---|
| `DevTools loaded project.config.json` 为 FAIL | 开发者工具还在用旧配置：关闭并重新打开项目后重跑。SKIP 表示没找到本项目的状态文件，先在开发者工具里打开项目。 |
| CLI 未确认登录或超时 | 检查 IDE 登录与服务端口；脚本 10 秒后退出，保留诊断摘要。 |
| CLI 正常，9420 未监听 | 运行下面的 `auto` 命令一次；若仍停在 preparing，使用 MCP 备用路径。 |
| 9420 已监听 | 运行 `devtoolsCapture.mjs --ws`；握手超过 15 秒即失败，转 MCP。 |
| MCP 预检失败 | 先看 FAIL 行附带的错误摘要；不够再定向查看本次脱敏日志，核对 IDE 中现有 MCP token、项目路径和已打开的项目窗口。 |
| MCP 返回 `Client authorization pending` | 在 IDE 中批准 `minmin-devtools` 客户端后重跑；token 有效不等于新客户端已获准。 |

```powershell
& 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat' auto --project 'D:/agents/projects/敏敏子日历' --auto-port 9420 --trust-project
node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --states 'home,home:tools,home:legend'
```

`--trust-project` 是自动化首次连接所需参数。CLI 的服务端口和 automator 的 9420 是不同通路；开启服务端口不保证 9420 会监听。不要因 `auto` 卡住而把业务代码改成兜底逻辑。

## MCP 备用路径

```powershell
npm run devtools:mcp -- --preflight
npm run devtools:mcp -- --list
npm run devtools:mcp -- --schema automation_evaluate
npm run devtools:mcp -- --requests .scratch/devtools/requests.json
```

命令会隐藏输入 token；也可从既有受控环境注入 `WECHAT_MCP_TOKEN`。调用入口不接受 token 参数，凭据不写入请求文件或日志；启动官方 bridge 时仍按其接口通过子进程参数传递 token。调用器使用安装目录中的官方 MCP 入口，`--ide` 可覆盖安装位置；不会修改 IDE 文件。默认仅列工具名称，只有 `--schema <精确工具名>` 输出该工具 schema。

请求文件是 `{ "name": "工具名", "arguments": { ... } }` 或其数组，按顺序执行。未填写 `arguments.project` 时使用当前仓库；所有 project 路径解析为 Windows 绝对路径并去掉多余的末尾分隔符，避免 `cant find runtimeid by projectpath` 或截图工具的 `project window not found`。先读取相关 schema，再构造最小请求。只读预检示例：

```json
[
  { "name": "automation_runtime_info", "arguments": { "action": "systemInfo" } }
]
```

JSON-RPC error、`isError`、结构化或文本 JSON 中的 `success:false`、超时、bridge 异常退出都会产生非零退出码并停止后续请求。默认每个请求 25 秒，可用 `--timeout` 调整。常规输出仅显示工具结果摘要和日志位置。工具返回失败时，FAIL 行附带脱敏后的错误摘要，最长 300 字符：只取 `code`、`errCode`、`errno`、`error`、`errMsg`、`message`、`msg`、`reason` 字段，嵌套的 `error` 对象只取一层；没有这些字段时只列字段名，`isError` 的纯文本截取原文。其余字段可能是页面数据，只写进完整脱敏通信日志 `.scratch/devtools/mcp.jsonl`，每次运行覆盖上一次；摘要不够判断时再从该日志定向读取。日志可能包含当前页面数据，仅供本地检查，不上传或入库。

## 代码质量扫描口径

官方文档没写这两项怎么统计；以下读自开发者工具 2.02.2609231 安装包里的扫描器（as of 2026-10-10）。允许进包的根目录和两项预算由 `tests/package-contents.test.js` 钉住。

- 「主包大小」：主包所有文件的字节和，不含 `.js.map`，上限 1.5 MiB。
- 「图片和音频资源」：整个包里所有图片和音频文件的字节**总和**要小于 200 KB，不是单个文件的上限。
- 计入的文件：项目文件扣除 `packOptions.ignore` 和云函数目录后，再按上传白名单过滤（含 `.png`、`.json`、`.js`、`.wxml`，不含 `.md`、`.mjs`、`.yml`）。「无依赖文件过滤」只处理代码文件，截图照样进包。
- 扫描时机：只有点面板的「重新扫描」或上传时才扫，CLI 和内置工具都触发不了。面板不显示各包字节数和文件明细，`npm run devtools:preflight` 会打印最近一次结果。
- 配置生效：`project.config.json` 改动后，开发者工具不一定重新读取 `packOptions`。2026-10-10 单独改这个文件时它当场读入；与其他文件一批改动时，直到重开项目都没读入。`watchOptions` 只在打开项目时读取。改完先跑预检，报配置过期就关闭并重新打开项目，再重新扫描。
- 回查规则：在安装目录的 `resources/app.asar` 里用 `rg -a` 搜规则名 `PACKAGE_SIZE_LIMIT`、`IMAGE_AND_AUDIO_LIMIT`。

## 点击与截图验收

`npm run test:hit` 从当前 WXML 提取导航栏，从 WXSS 提取相应规则，在 Chromium 的 320、375、430 宽度按坐标点击按钮中心。每种宽度随后恢复装饰层拦截，必须观察到点击失效，证明检查能捕获原故障。截图和实际 viewport 保存到 `.scratch/coordinate-hit/`，每次运行覆盖上一次。这验证 CSS 命中，不模拟微信布局引擎或完整页面流程。

`devtoolsCapture.mjs` 在已渲染的 `.page` 出现后截图，将微信 `systemInfo` 的实际 `windowWidth/windowHeight`、页面路径和时间追加到截图目录的 `captures.jsonl`。MCP `--preflight` 同样报告实际视口。要验收小屏，先在 IDE 选择小屏机型，再回读视口；不能根据图片尺寸或机型名称推断已验证 320px。

选择器 `tap()` 可能绕过命中遮挡。验证“按钮点不到”时，CSS 坐标回归之外还需在微信中实际坐标点击或人工点击；菜单打开、图例交接、关闭等状态流可用选择器自动化验证。截图若出现空白或未完成状态，先确认目标页面已就绪再重截，不能将文件写入成功当作界面验收。
