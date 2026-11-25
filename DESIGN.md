---
type: reference
title: "DESIGN"
tags: [project-docs, reference]
intent: "Aurora Bloom 现行视觉规则：色板、按压、日历格状态"
version: alpha
name: Aurora Bloom
description: "Premium wellness dark theme for minmin-calendar — warm rose, soft lavender, gold on deep navy. Primary fill is rose on canvas navy text."
colors:
  primary: "#E8909E"
  secondary: "#C4A0D2"
  tertiary: "#F0C4C0"
  accent: "#D4A574"
  neutral: "#FFFFFF"
  canvas-navy: "#0A0E27"
  bg-primary: "#0A0E27"
  bg-secondary: "#1A0A2E"
  bg-tertiary: "#12163D"
  bg-aurora-mid: "#2D1B69"
  warning-red: "#F97373"
typography:
  # 与「共享字号角色」表同值：px 是 750rpx 设计宽（375px）下的名义值，×2 即 app.wxss 的 rpx token（同 spacing）
  month-title:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 19px
    fontWeight: 700
    lineHeight: 1.2
  body-lg:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  button:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 15px
    fontWeight: 600
  input:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  calendar-date:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 14px
    fontWeight: 600
  calendar-date-compact:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 15px
    fontWeight: 600
  calendar-micro:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 12px
    fontWeight: 500
rounded:
  sm: 12rpx
  md: 20rpx
  lg: 28rpx
  xl: 36rpx
  card: 24rpx
  full: 999rpx
  circle: 50%
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
components:
  glass-card:
    backgroundColor: "linear-gradient(rgba(255,255,255,0.095), rgba(255,255,255,0.035))"
    fallbackFill: "rgba(15,19,52,0.88)"
    rounded: 24rpx
    border: "top: 1px solid rgba(255,255,255,0.16); left/right: 1px solid rgba(255,255,255,0.08); bottom: 1px solid rgba(255,255,255,0.04)"
    shadow: "0 16rpx 64rpx rgba(0,0,0,0.2)"
  button-primary:
    backgroundColor: "#E8909E"
    textColor: "#0A0E27"
    rounded: 20rpx
    padding: 26rpx 0
    pressScale: 0.96
    highlight: "inset 0 1px 0 rgba(255,255,255,0.30)"
    glowOpacity: "0.35 default / 0.15 pressed"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#E8909E"
    border: "1.5px solid #E8909E"
    canvas: "#0A0E27"
    rounded: 999rpx
    padding: 12px 28px
    pressScale: 0.95
  button-danger:
    backgroundColor: "rgba(255,255,255,0.08) + rgba(15,19,52,0.88)"
    textColor: "#F97373"
    border: "1px solid rgba(249,115,115,0.28)"
    pressedBackground: "rgba(249,115,115,0.12) + rgba(15,19,52,0.88)"
    rounded: 20rpx
    padding: 26rpx
    pressScale: 0.95
  calendar-cell:
    rounded: 20rpx
    textColor: "rgba(255,255,255,0.85)"
    todayCapsuleBg: "rgba(232,144,158,0.14)"
    todayCapsuleStroke: "2rpx solid rgba(196,160,210,0.55)"
    todayCapsuleSize: "60×41rpx full / 64×43rpx compact"
    todayText: "#E8909E"
    periodBand: "full: rgba(232,144,158,0.22) + 1px top/bottom rgba(232,144,158,0.6); compact: rgba(232,144,158,0.6)"
    memoryMark: "#F0C4C0"
    predictMark: "#D4A574"
    holidayTagBg: "transparent"
    holidayTagText: "#D4A574"
    workdayTagBg: "rgba(255,255,255,0.12)"
  tab-bar:
    backgroundColor: "#0A0E27"
    borderStyle: "white"
    color: "#7A7C8C"
    selectedColor: "#E8909E"
  input-field:
    backgroundColor: "rgba(10,14,39,0.88)"
    rounded: 20rpx
    padding: 22rpx
    minHeight: 88rpx
    border: "1px solid rgba(255,255,255,0.08)"
    insetShadow: "inset 0 2rpx 6rpx rgba(0,0,0,0.28)"
    textColor: "rgba(255,255,255,0.85)"
    focusBorder: "1px solid #E8909E"
    focusGlow: "0 0 0 4rpx rgba(232,144,158,0.14)"
    pickerPressedBorder: "1px solid #E8909E"
  modal-overlay:
    backgroundColor: "rgba(10,14,39,0.88)"
    backdropFilter: "blur(8px)"
  choice-chip:
    minTouchHeight: 44px
    rounded: 999rpx
    inactiveBg: "rgba(255,255,255,0.065)"
    activeBg: "rgba(232,144,158,0.92)"
    activeText: "#0A0E27"
    activeGlow: "0 0 18rpx rgba(232,144,158,0.22)"
    pressScale: 0.96
---

## 单一权威

本文件和 `docs/motion-and-interaction.md` 一起是 Aurora Bloom 的唯一现行视觉说明。色板、材质与辉光、圆角、间距、字号角色、布局、tab 顶线和日历格状态以本文为准；改动效、弹层、按压、交互态或读屏语义时读 `docs/motion-and-interaction.md`，缓动与时长、两张动效注册表和这些行为规则都在那里。不要并列第二套「目标稿」或「实现基线」；已审查数值不要按旧稿回改。

已在屏幕上成立、改 UI 时沿用：

- 圆角 token（`app.wxss`）：`--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` 为 `12rpx` / `20rpx` / `28rpx` / `36rpx`，另有 `--radius-card: 24rpx`（卡片与日历块；`.premium-card`、`.month-nav` 等均走此 token）、`--radius-full: 999rpx`（胶囊）、`--radius-circle: 50%`（正圆点/圆钮）。全部 WXSS 文件（含 `app.wxss` 自身）的 `border-radius` 只允许 token 与 `0` 复位；`::before` 平涂层与柔光层写 `inherit`，跟宿主同一个圆角（宿主那条照样只用 token），由 `tests/design-token-guardrail.test.js` 护栏。
- 玻璃叠层：`--glass-bg` 为 `rgba(255,255,255,0.08)`，普通玻璃面仍可平涂；高级卡 `.premium-card` 自 #269 起改为顶部 `rgba(255,255,255,0.095)` 至底部 `rgba(255,255,255,0.035)` 的纵向丝绒微渐变，四边分别为上 `0.16`、左右 `0.08`、下 `0.04` 白色 1px 描边，顶缘棱镜右段为 `rgba(196,160,210,0.32)`，基类只保留下投影、不再与棱镜叠画平白 inset 顶线。CSS 只允许颜色作为 `background` 的最后一层，`<color>, var(--glass-fallback)` 整条无效、什么都不画。回退实色 `rgba(15,19,52,0.88)` 的唯一来源是 `--glass-fallback` token（既有规则已经用玫瑰实底的，保留玫瑰），一律写 `var(--glass-fallback)`，不重复字面量，由 `tests/design-token-guardrail.test.js` 护栏。D2（#269）以候选 `rgba(15,19,52,0.88)` 在画布 `#0A0E27` 与 `auroraPeakHex` 实测峰值 `#503773` 上运行全仓文字、次级入口和非文字对比度护栏，全部达到 4.5:1 / 3:1，故采用候选值，不启用 `rgba(18,22,61,0.90)` 回退。模糊是材质选择，由实际画面决定，不再按「不透明度高就删模糊」默认处理（issue #163，取代 issue #146 的这条默认规则和 issue #58 的按文件玻璃面棘轮）。模糊的面逐个登记，新增或拿掉时同步本条和 `tests/motion-performance.test.js` 的 `BLURRED_SURFACES`：一是 `pages/shared/confirmation-sheet.wxss` 的共享底部弹层遮罩 `.day-sheet-mask`，由首页、设置、绑定与两个编辑页导入，同为 frontmatter `modal-overlay` 的 88% 海军加 `blur(8px)`，设置「使用说明」与确认面板不再各自保留遮罩实现（issue #235）；遮罩后面是有内容和极光的页面，模糊把弹层和背景分开。二是首页 `.home-sticky` 的 `blur(6px)`（issue #255），叠在顶部 86% 至底部 94% 的海军渐变上，六行滚动时柔化穿过的日历内容；不支持模糊时仍由高不透明海军保证文字对比度，D1 的实测选择见 `docs/verification-log.md`。三是共享固定顶栏 `.header-gradient` 的 `blur(14px)`（issue #267），顶部 `rgba(10,14,39,0.92)` 至底部 `rgba(18,22,61,0.88)` 的高不透明海军渐变在忽略模糊时仍保证文字对比度，底线为 `1px solid rgba(255,255,255,0.06)`；绑定页 `.nav-bar-immersive` 保留同一安全区几何但取消背景、模糊、底线与两个光斑。月份导航、周头、日历网格、通用卡片、危险按钮、同步胶囊，以及用同一回退实色的表单与空态，淡白叠 0.88 海军后约 0.88–0.90，模糊在这些面上看不出来，所以不写。编辑页返回键是与首页图例同族的 `var(--glass-bg)` 轻玻璃，不写模糊。任何模糊面都要有 ≥0.85 的海军或玫瑰实色，`backdrop-filter` 与 `-webkit-backdrop-filter` 成对写；忽略模糊时仍是实色面，不要只留半透明空框（`tests/glass-fallback.test.js`）。
- 间距阶梯：名义刻度 4/8/16/24/32/48px（frontmatter spacing）在 `app.wxss` 登记为 rpx token（数值 ×2）：`--space-xs` / `--space-sm` / `--space-md` / `--space-lg` / `--space-xl` / `--space-xxl` = `8rpx` / `16rpx` / `32rpx` / `48rpx` / `64rpx` / `96rpx`。issue #53 只收敛单一来源并登记；页面既有间距字面量的逐页迁移留给后续 UI ticket，新增布局优先使用 token。页面节奏角色（issue #164；issue #245 收敛为 `app.wxss` 的语义 token 单一来源）：记录、欢乐时光、设置和两个编辑页共用一套留白，按角色逐处比对，不许各页各写近似值或绕回字面量。页边距 24rpx（首页 `.content` 与吸顶区同值）；首块离顶栏 24rpx；同页块间距 20rpx（分段控件与第一块之间、卡片与按钮之间、月份卡之间，记录页两段的第一块因此一样高，欢乐时光编辑页的保存按钮紧跟表单卡；经期编辑页固定操作区的上内边距同值，见 R7 条目）；列表行与菜单行左右内边距 30rpx。设置页带组标题的分组间距 28rpx；页底危险区离常规分组 `--space-lg`（相邻外边距合并取大值，小于分组间距的上外边距不起作用）；编辑页删除区仍是 `--space-xxl` 加分隔线。首页吸顶区与日历槽位归几何账本，绑定页是居中 hero 布局，不在此列。护栏 `tests/design-token-guardrail.test.js`。
- 字号角色：见「Typography」节的共享字号角色表，`app.wxss` 的 `--font-size-*` token 是全页面唯一来源，`tests/typography-roles.test.js` 护栏。
- 首页信息架构（issue #55、#105 的登记，issue #135、#215 修订）：首页自上而下为 共享顶栏 → 吸顶区（月份导航「‹ 年月 ⌄ ›」，可见月不是当月时在其下加「回到今天」，再下面是状态行）→ 周头/日历 → 记录入口（`.quick-actions`：「记经期」与「经期第 N 天 · 记结束」是玫瑰实色主操作，「记欢乐时光」是画布海军实底、玫瑰描边与玫瑰字的 button-ghost 次操作，按钮自身使用 `--radius-card`（24rpx）并带着海军底一起按压）→ 本月小结行 → 空态引导。吸顶区固定在顶栏下（`.home-sticky`，`top: var(--nav-bar-height)`），内容用同高占位，状态行因此始终可见。R5 判定（issue #228，集成 `9293bdb`、390×844、替身 Room 的 current 截图）：吸顶下沿两侧 7 组像素的 RGB 逐通道差均为 0–1，满足各通道不超过 8 的加线条件，因此 `.home-sticky` 底部画 `1px solid rgba(255,255,255,0.08)`；这条底边与月份导航上下描边一起计入 `.home-sticky-spacer` 的 3px，首屏 `FIRST_SCREEN_BORDER_PX` 相应为 6px，骨架沿用同一吸顶与占位类，不另画一套。图例入口在顶栏左侧，触发器以 `calc(96rpx + 2px)` 固定外槽（不小于 88rpx）包 64rpx `--radius-full` 胶囊文字钮「图例」（`.nav-tool` + `.nav-tool-surface`），外槽与标题补偿使用同一账本，不随平台字体字宽增长；不跟翻月圆钮（`.nav-btn`）同形；点按直接复用 `openLegendSheet` 打开图例，不再经过工具菜单。预测说明仍从状态行进入，本月小结仍从小结行进入。状态行由 `cycle.buildHomeStatusLine` 给出，是首页唯一状态句：经期中「经期第 N 天」，超过预期时长加「· 比预期多 M 天」（已完成记录中位数，无则五天）；窗口前主句「预计 X月X日 开始」，右侧倒数「还有 N 天」；窗口内「这几天可能开始」；窗口结束次日至第 7 天「比预计晚 N 天」，第 8 天起「上次记录 X月X日 开始 · 可以补记」；记录不足时，少于两次开始日说「记两次经期后就能估下次」，没有可用间隔说「最近几次间隔差得多，再记几次就能估」，同一门槛来源供状态行、预测说明与记录 tab 空态。日期走 `formatDisplayDate`，今年省略年份、跨年带年份。主句原则上归 body-lg；issue #247 的最长推迟句账本不通过，故 `.home-status-text` 保持 32rpx 例外并加 600 控件字重，右侧倒数用 caption 次要色，行尾是与记录 tab 同款的「›」；88rpx 行高不变，读屏名为「状态句，点按查看预测说明」，窗口前连同倒数朗读。按 750rpx 设计宽度静态核算各状态最长形式（含跨年日期和右侧倒数）都在一行内，不缩字号。推迟状态沿用 `.home-status.neutral` 的 `var(--text-secondary)`，不用警示红。经期集合进房后一次都没同步上（首次加载只有经期失败，既没加载到也没有旧数据）时说「经期未同步，暂不预测」（`.home-status.neutral`），不说经期第几天、不说记录不够，日历不画预测，预测说明同样只说未同步。点状态行打开现有预测说明。首页不再显示累计条数「经期记录 N」。本月小结行文案是「本月 经期 N 天 · 欢乐时光 N 条 ›」，N 天是该月与经期投影相交的天数，N 条是该月欢乐时光条数，点按打开本月小结；没同步上的集合那一部分写「经期未同步」或「欢乐时光未同步」，另一部分照常计数，本月小结 sheet 里对应的句子也只说未同步（`calendarInsights.buildMonthlyRecap` 的 `summaryLine`）。经期临近、这几天可能开始、可能开始的日子已过、经期还未结束四类通栏提醒行及其已见存储自 #207 全部退役，首页不再渲染第二套状态表达。经期与欢乐时光列表仍由「记录」tab 分段承接，首页不放列表入口。空态引导仅在两个集合都同步上且无任何记录时出现（有集合未同步时不知道有没有记录，仍显示小结行），文案「点今天或过去的一天开始记录」只引向今天或过去的日子（issue #152），文字在其合成面（背景 + 引导卡 6% 白底，背景按画布和极光最亮处各算一次，issue #163）上 ≥4.5:1，不低于 `--text-secondary` 档。日历几何只有一个出口 `computeCalendarRowHeight`（issue #153）：按视口、顶栏、密度、当月日期格、「回到今天」、配对欢迎条与等待邀请条共用的槽位和行内重试行，一次给出行高和是否合并信息行。行高不超过上限（完整密度160rpx，清爽密度因色带加厚调整为148rpx），也不低于格内内容最小高度（完整159rpx、清爽146rpx、合并108rpx，且至少44px），不缩字、不裁切。最小高度里含 3rpx 格底留白：垂出的「预」离格子下沿至少 3rpx，碰不到下一行从格顶画起的今天胶囊和经期色带。这3rpx原是今天整格内描边的厚度，今天改成日期胶囊后继续保留；色带槽位加厚时同步更新几何账本。清爽密度放不下常规纵排时，节日/调休并进标记行，成为日期下方的一行（`.calendar-info-merged`，日期位置与读屏名不变）；当月有一天的节日/调休加标记在一列宽里排不下时不合并。内容最小高度与首屏记录入口不能兼得时，行高停在最小高度，页面自然滚动：吸顶的月份导航与状态行留在顶栏下，记录入口滚动可达。完整密度不合并、不省农历，放不下就滚动。390×844上清爽密度的6行月份在空间足够时仍可首屏触达记录入口；375×667上6行再显示「回到今天」、欢迎或重试行时，允许自然滚动以保留色带厚度与文字。完整密度的6行月份仍按账本决定是否滚动。账本里的尺寸都是 `pages/index/index.wxss` 的实际槽位，`tests/narrow-screen-geometry.test.js` 与 `tests/calendar-micro-labels.test.js` 逐项核对。首次加载用日历骨架（`skeletonPulse`，减弱动效下静止），不用转圈。日历密度偏好（`calendarDensity` 存储键）的切换入口在设置页「日历显示」分组里，分段控件直接放在分组卡中，不再套一层内卡；首页 `onShow` 重读即刻生效；密度选中态保持玫瑰描边弱态，不用实色填充。记录入口按钮最小高 104rpx。进行中经期的「经期第 N 天 · 记结束」一行放不下，只在空格处折成两行（`word-break: keep-all`，不拆开「记结束」）；两行用 `--line-height-title`，按钮上下内边距 14rpx，两行仍在最小高里，按钮不变高（issue #159）。结构序、状态文案与行高账本由 `tests/index-page.test.js`、`tests/cycle-prediction.test.js`、`tests/narrow-screen-geometry.test.js` 钉住。日历日弹层对晚于今天的日期不提供记录动作（动作集合为空，记经期、补记经期、记欢乐时光、补记欢乐时光都没有），处理器遇到未来日期也不导航。弹层不因此只剩标题和关闭键：日历投影给每个未来日期一条持久说明 `futureNotice`（「未来日期不能新增记录」「到了这一天，再来记经期或欢乐时光」），排在预测、节日和调休句之后，沿用「当天无记录」的虚线空态块（issue #152）。编辑页日期上限与保存校验仍是最后防线。
- 共享顶栏几何（issue #250）：`utils/safeArea.js` 同时输出普通标题的左右对称补偿，七个页面标题落在屏幕中轴；同步胶囊挂载时不施加补偿，保留完整标题槽。首页图例是 88rpx 透明外层热区包 64rpx `--radius-full` 内层胶囊，内层水平 padding 22rpx、完整玻璃描边与圆角，不被顶栏裁切；两个编辑页返回键同样为 88rpx 透明热区包 64rpx `--radius-full` 轻玻璃圆钮，内嵌 #266 的 `ui-icon-left ui-icon-36 ui-icon-circle` 左折角，不再使用 0.92 海军厚方框；翻月和共享关闭圆钮统一 border-box 与双向 flex 居中。
- 首页完整密度单位裁决（issue #254 评审修复）：票面「日历格最小高度 82rpx」与现行槽位账本不一致，不能按 82rpx 缩格。现行内容最小值仍是 159rpx：`4 + 32 + (2 + 34) + (2 + 38) + (2 + 30) + max(4, 42 - 30 + 3) = 159`，在 390px 视口为 82.68px；full 行高 cap 160rpx、compact cap 148rpx 均不变。现有测试 `a calendar row never drops below the cell content minimum; full density scrolls instead of squeezing` 直接断言 159rpx / 82.68px / 160rpx，`period band uses the breathable full-density slot and caps the open end without animating` 核对 40/30 色带槽，不能用无法容纳现有槽位的 82rpx 取代它们。
- 首页吸顶、快捷与横幅（issue #255）：`.home-sticky` 使用 `rgba(10,14,39,0.86)` 到 `rgba(10,14,39,0.94)` 的海军渐变、`blur(6px)` 与既有 1px 底线；D1 要求六行月份实际滚动后判断月份和状态行是否受穿过色带干扰，代码最终取值与证据边界登记在验证日志。静默刷新时日历、快捷、小结和空态引导使用同一透明度节拍。状态行按压有 `--radius-md` 圆角；本月小结为同日历卡宽、88rpx 的左文右箭头轻玻璃横幅。等待邀请与一次性欢迎条取消额外 24rpx 外缩进，继续共用 103.2rpx 几何槽，邀请按钮为 88rpx 触控的 10% 玫瑰淡底、32% 玫瑰描边、玫瑰字 `--radius-full` 胶囊。两枚快捷按钮统一 `--radius-card`，次操作的海军底随按钮一起缩放。
- 窄屏几何与安全区（issue #56）：所有带显式 `width` 与水平内边距的卡片/表单容器一律 `box-sizing: border-box`，宽度与内边距不得叠加出横向溢出（全 WXSS 护栏，含 `app.wxss`）。安全区运行时策略只有一套（`utils/safeArea.js`）：顶部 `--safe-top` 走状态栏高度、底部 `--safe-bottom` 走 `screenHeight − safeArea.bottom`，均由页面根节点内联注入；底部插入在无手势区设备上为 0，不制造无意义底部空白。共享顶栏：七个页面共用 `pages/shared/nav-bar.wxml` 的同一个 template 与 `pages/shared/nav-bar.wxss` 的同一份固定顶栏样式，高度等于状态栏高度加上由微信胶囊矩形推出的导航高度，右侧用 `--capsule-right` 预留胶囊宽度，顶栏固定定位，页面内容用同一个 `--nav-bar-height` 下移，起点不高于顶栏底边。胶囊矩形和顶、底安全区共用 `utils/safeArea.js` 这一个运行时出口，拿不到胶囊矩形时有兜底。左侧内容只有三类：首页「图例」文字按钮、两个编辑页的返回键、其余页面的占位；绑定页使用无标题的 `immersive` 沉浸占位变体，保留同一安全区与胶囊几何，但不画背景、模糊、底线或光斑。标题基类是中性白 `rgba(255,255,255,0.92)`，不再有逐页颜色覆盖。底部落点：非 tab 页 `.content` 的 padding-bottom 与底部 sheet 的 padding-bottom = 基础值 + `var(--safe-bottom, env(safe-area-inset-bottom, 0px))`；tab 页内容由原生 tabBar 吸收底部插入，不重复加。底部 sheet 滚动边界 = max-height 82–86vh；外框为纵向 flex + overflow: hidden，共享 .sheet-body 以 flex: 1、min-height: 0、overflow-y: auto 独立滚动并隐藏原生滚动条，遮罩不做 overflow 裁切。issue #235 起，首页信息／选月／当日、设置「使用说明」与共享确认面板都使用 `pages/shared/confirmation-sheet.wxml` 的 `sharedBottomSheet` 和同名 WXSS：宿主左右留边 20rpx、面板底部浮起 20rpx、基础层级 60，圆角为 `var(--radius-xl)` 上缘与 `var(--radius-lg)` 下缘，带把手、可下拉关闭；面板水平内边距为 28rpx，把手、标题、副标题与关闭键固定在滚动区外，88rpx 透明关闭热区包 64rpx 轻玻璃圆环与 #266 几何矢量叉；选月与信息面板只用修饰类调整层级，选月与当日／确认的最大高度和渐变透明度差异也只保留在修饰类。设置帮助不再贴屏、不再使用独立 `.help-*` 几何；每页另以 `sharedSheetPage` 各挂一份减弱动效探针与原生返回守卫。日历触控目标按「高度 ≥44px」执行（compact 104rpx ≈ 44.4px@320px、full 160rpx ≈ 68.3px@320px）；320px 下七列宽 ≈42.5px 是物理上限（7×44px 放不进 320px），列整宽平铺、无水平 margin、互不重叠，不以缩小日期/农历/标记吸收。周头与日历网格左右各留 10rpx，最左列和最右列的内容不贴网格边框；色带横向铺满各自的格子，日期上下留出留白，不因这道内边距改形状。回归由 `tests/narrow-screen-geometry.test.js` 钉住。
- 自有日期面板（issue #243，R2 运行判定：三个原生日期滚轮在系统浅色下均为浅紫白底，因此改用自有面板）：经期开始、经期结束与欢乐时光日期共用 `sharedBottomSheet` 的 `datePickerSheetBody`，不再弹原生浅色滚轮。深色渐变面板沿用共享底部弹层色板；三列 `picker-view` 放在 440rpx 高（五行，每行 88rpx）、6% 淡白平涂叠 `var(--glass-fallback)` 的 `--radius-md` 滚轮槽里，文字使用 body-lg 角色与 `--text-primary`。下方「确定」沿用玫瑰主按钮及 `button-primary` 共享结构。字段本身的读屏名、错误行、占位和保存中禁用形态不变。
- 两编辑页固定保存区与微提示条（issue #229、#253）：共享保存区使用 `.record-actions-fixed`，新建与编辑态均只放「保存」，已有记录的删除按钮回到表单滚动流末尾。固定栏贴左右与底边，`z-index: 20` 低于共享 sheet 的 60，顶部 20rpx、左右 24rpx、底部 `24rpx + var(--safe-bottom, env(...))`；背景是 `rgba(10,14,39,0.96)` 到 `#0A0E27` 实底的不透字渐变，顶缘 `1px` 内高光，向上柔影 `0 -12rpx 32rpx rgba(5,8,22,0.55)`。两页 `.content` 只预留单按钮固定栏和安全区，删除不再计入固定高度。经期备注聚焦时隐藏固定栏但保留内容预留，失焦恢复；欢乐时光固定栏不随焦点隐藏。草稿恢复和开始日归属提示统一为 `rgba(232,144,158,0.08)` 底、`1px rgba(232,144,158,0.24)` 边、`--radius-md`、`16rpx 24rpx` 内边距的玫瑰微提示条，右侧操作通过上下内边距与负外边距补偿到 88rpx 触控高度而不撑高提示行。欢乐时光备注框最小高 200rpx；两页备注低于 350 字不显示计数，350–500 字显示次要色 `N / 500`。
- 输入控件深海内凹槽与双向焦点（issue #243、#252、#269）：绑定页房间码、两个编辑页的日期框与多行备注统一为 `rgba(10,14,39,0.88)` 深暗海军底、`1px solid rgba(255,255,255,0.08)` 弱外缘、`--radius-md` 与 `inset 0 2rpx 6rpx rgba(0,0,0,0.28)` 顶部微内影。共享 `pages/shared/form-control.wxss` 的 `.form-control.form-control-focused` 画 1px 实线玫瑰描边，并在保留内影的同时增加 `0 0 0 4rpx rgba(232,144,158,0.14)` 外柔光环；文字与 60% 占位符在画布和极光峰值合成表面上均 ≥4.5:1，焦点边框 ≥3:1。房间码与备注由各自 `bindfocus` / `bindblur` 切类；日期框在对应 `datePickerMounted && datePickerName === label` 时挂载同一焦点类，面板关闭后收回。默认控件声明 border-color 与 box-shadow 的 `--duration-state` 过渡，日期框的按下描边仍走 `--duration-press`，减弱动效下全部即时。绑定页空值中文占位使用 2rpx 自然字距，非空大写房间码使用 12rpx 槽位字距。
- 经期编辑症状选中态（issue #273）：文字使用暖玫瑰 `var(--aurora-pink)`，选中底为 `linear-gradient(rgba(232,144,158,0.16), rgba(232,144,158,0.16)), var(--glass-fallback)` 的 16% 玫瑰平涂叠玻璃回退，描边为 `1px solid rgba(232,144,158,0.62)`；玻璃回退保证玫瑰字在卡片与极光峰值合成表面上均 ≥4.5:1，症状 chips 不借用欢乐时光专用的 `--color-memory` 浅粉语义。
- 阴影登记（下文「Shadow / overlay 登记」段）实行区间登记制：同族同色阴影的透明度落在登记区间内即合规，区间内免逐值登记；区间外透明度或登记表外颜色由 `tests/design-token-guardrail.test.js` 的阴影注册表护栏拒绝。阴影偏移统一用 rpx，1px 发丝线保留 px。
- 次级可点入口对比度（issue #57）：可点击箭头（`.menu-arrow`、`.form-picker-arrow`、列表/入口/弹层箭头）与次要操作（重试空态、绑定页房间码、危险按钮）的文字色不弱于 `--text-secondary`，在各自实际表面（卡片/表单/sheet 合成底）上 ≥4.5:1——基准即未选中 tab `#7A7C8C` 在画布 `#0A0E27` 上的 4.5:1；输入占位符用 `--text-placeholder`（`rgba(255,255,255,0.6)`，与 `--text-secondary` 同档，不弱于它；issue #144），`.input-placeholder` 的字号随 input 并入 `--font-size-body-lg`。`--text-tertiary`（0.35 白）不再用于占位符，也不再用于任何可点入口。护栏：`tests/secondary-affordance-contrast.test.js`、`tests/typography-hierarchy.test.js`。
- 一次性配对欢迎条（issue #149、#215）：加入房间后首页给一次「已和 TA 连上……」说明（`.partner-welcome`），放在吸顶占位之后、周头之前的正常文档流里，固定的月份导航和状态行盖不住它。整条欢迎条可点，点按复用 `openLegendSheet` 打开图例；文案说明以后可从左上角「图例」再看，图例底部指向「设置 → 使用说明」。它两行 caption 的盒高 103.2rpx（上下 padding 8 + 12，正文行高 1.6；padding 属于整条点按区域）作为 `computeCalendarRowHeight` 的 `showPartnerWelcome` 输入计入行高，行高仍守 44px 下限。只有日历可显示、且欢迎条经 `setData` 渲染回调确认已提交后才记为看过；骨架屏、加载失败或未绑定画面时保持待显示。欢迎条只陪第一次显示它的那次停留：同一次停留里翻月、刷新都留着；首页隐藏（切 tab、进编辑页）时，已记为看过的欢迎条收起，再回到首页不再出现，行高同时去掉它的 103.2rpx。收起发生在画面不可见时，回来时没有跳动。护栏：`tests/narrow-screen-geometry.test.js`、`tests/index-page.test.js`。
- 首页等待邀请条（issue #219）：只在 `roomRecordsSync` 的 `roomStatus === 'waiting'` 时占用与一次性欢迎条相同的文档流槽位，未知和 paired 都不显示，两者绝不同时出现。左侧两行 caption 分别是「TA 还没加入」与「发个邀请，TA 加入后你们看的是同一本日历」，右侧是原生分享按钮「发邀请」；按钮使用 10% 玫瑰淡底、32% 玫瑰描边、玫瑰字与 `--radius-full`，保留 `share-invite` 按压契约，读屏名与可见文案一致。邀请条沿用 `.partner-welcome` 的 103.2rpx 盒高和同一个 `CALENDAR_LEDGER.firstScreenRpx.partnerWelcome` 账本项，首页把 `partnerWelcome || partnerInvite` 作为 `showPartnerWelcome` 输入，不另加槽位或高度。分享卡与设置页同由 `roomShare` 生成；非等待状态隐藏胶囊转发，意外触发也只给普通卡片。创建者 waiting → paired 时撤掉邀请条，用同一一次性标记展示欢迎条，首页不再弹「TA 已加入」toast，设置页保留。
- `tabBar.borderStyle` 为 `white`（浅色发丝）。不要改成 `black`。未选中 `tabBar.color` 为 `#7A7C8C`：弱于选中玫瑰 `#E8909E`，在画布 `#0A0E27` 上达到 4.5:1。「记录」tab 的两态图标是列表形（`images/list.png` / `images/list_active.png`，issue #159）：三行圆点加横线，81×81，线宽与日历图标描边同档，实色像素分别正好是 `#7A7C8C` 与 `#E8909E`。不用铅笔，也不用医疗十字。护栏 `tests/tab-icons.test.js`。
- 极光（issue #163，取代 issue #146 的整页 `auroraPulse` 缩放）：画布底为 `#0A0E27`，`page` 没有 `auroraFlow`。`.page::before` 是一层静止基底，四边为 0、正好铺满视口，只画海军 → 深蓝 → 深梅的纵向过渡，不动也不缩放。动感来自每个页面根下第一层的 `.aurora`（`aria-hidden="true"`，固定在视口，`overflow: hidden`；标记只写在 `pages/shared/aurora.wxml` 一处，各页面在顶栏之前 `include` 它）里三个有边界的色团：蓝紫 `.aurora-bloom-violet` 压在下半屏（中心 `rgba(45,27,105,0.75)`），玫瑰 `.aurora-bloom-rose` 在左上（0.14），薰衣草 `.aurora-bloom-lavender` 在右侧中段（0.11）。色团用 `closest-side` 径向渐变在自己的盒内淡到 0，没有硬边。每个色团只有一层动画，只动位移、0.94–1.08 的轻微缩放和透明度，周期 12s、10s、8s 往返，负延迟错开起点，三团的相位一直错开，整页不再同步缩放。基底、色团容器和色团都是 `pointer-events: none`；固定层不随滚动走，滚动时不出现色带分层。色团只取蓝紫、玫瑰和薰衣草，柔金不进背景。首页原来的两个光球（`.glow-orb`、`orbFloat`）并入这三个色团后退役：它们挂在文档流里，一个被顶栏盖住，一个只在页底露出，边缘还是硬的。
- 中性信息文字只用五档透明度：0.92 强调 / 0.85 正文 / 0.72 辅助 / 0.6 次要 / 0.35 仅装饰。既有 16 档按最近档归并，距离相等时取高档；需要 4.5:1 的文字归并后若低于护栏，改用上面一档。日历格内角色、语义色 token 与已单独登记的玫瑰透明值不随普通文字档位改写。承载操作后果、记录内容或关键说明的辅助文字不弱于 `--text-secondary` 档，并在实际合成表面上 ≥4.5:1（issue #158）：记录 tab 周期概览的标签（`.card-label`、`.cycle-label`；卡面是玫瑰 → 薰衣草渐变叠在玻璃回退上，画布、玻璃回退和渐变两端都要过线）、列表行的作者与备注（`.item-note`、`.memory-note`）、收起月份卡的备注摘要（`.month-excerpt`）、空态引导与加载失败标题（`.empty-state`），经期编辑页的状态后果、天数与时长确认（`.form-hint`），两个编辑页的字段名（`.form-label`，与字段说明同样直接引用 `--text-secondary`，issue #164），未绑定/加载失败说明（`.no-room-desc`）。只给芯片分组的症状分组标题（`.symptom-group-label`）不在此列，按最近档归入 `--text-secondary` 的 0.6 次要档，仍 ≥4.5:1。护栏 `tests/contrast-guardrail.test.js`。实际合成表面从内容下面的背景算起（issue #163）：背景有两处，画布 `#0A0E27` 和极光最亮处（基底最亮的色标叠满三个色团，保守上界，`tests/contrast.js` 的 `auroraPeakHex`），两处都要过线。直接压在背景上的文字（配对欢迎条、等待邀请条、本月小结行、未绑定标题与说明、设置分组标题、绑定页大标题与说明）在极光最亮处仍 ≥4.5:1。原来只铺 5%–10% 淡白或淡红的行会透出极光，玫瑰字、警示红字和次要说明在那里掉到 4.5:1 以下，所以首页刷新重试行（`.refresh-retry`）、记录 tab 分段控件（`.segment-control`）与两段共用的刷新失败重试行（`.list-retry`，原来按下才铺 5% 淡白，说明文字在极光最亮处只剩约 4.25:1，issue #166 收口）、绑定页错误条（`.error-msg`）与重试（`.error-retry`）都叠在 `var(--glass-fallback)` 上，淡白或淡红只是上面的平涂层：可按压的行把平涂层放在 `::before` 的 `background-color` 上，按压加深这一层，按下时文字同样 ≥4.5:1；平涂层的结构（铺满、跟宿主同一个圆角、垫在内容下面、不拦点按、底色随按压同一拍、减弱动效即时）只写在 `app.wxss`「平涂层」一处，各页只写平涂色和按下的颜色（这条结构自 #196 起没有护栏，spec 决定 29/30 不保留这类断言；`tests/motion-performance.test.js` 只查平涂层底色随按压同一拍、减弱动效下有覆盖）；不可按的面写成 `linear-gradient(<淡色>, <淡色>), var(--glass-fallback)`。月份选择 caret（`.month-title-caret`）和月份标题同为玫瑰 `#E8909E`：按吸顶区 → 月份导航 → 触发钮的实际合成面算，原来的 85% 玫瑰只有约 4.2:1。护栏 `tests/contrast-guardrail.test.js`、`tests/secondary-affordance-contrast.test.js`。
- `calendar-cell` 与下文日历状态表对齐 `pages/index`。经期是位于农历行（完整模式）或日期下方独立细条槽（清爽模式）的玫瑰连续色带，不是实色整格选中底：完整密度保留 22% 填充，上下各加 1px、60% 玫瑰边线，边线对日历网格 ≥3:1、农历字仍 ≥4.5:1；清爽密度填充为 60% 玫瑰，在网格合成面上约 3.32:1。两档都由 `tests/contrast-guardrail.test.js` 断言。今天在日期数字外加一枚胶囊（`todayCapsule*`），不铺整格底、不描整格边；经期中的今天同样保留这枚胶囊，色带只表达经期（issue #188）。
- 日历微字 `.day-tag` / `.predict-mark` 字号为 `26rpx`（caption 量级）。节日是无底金字，调休「班」仍是低调小标签；`.day-tag` 与 `.day-tag-line` 盒高 `38rpx`（大于字号，覆盖 caption 行高），避免 CJK 被裁切。清爽密度的节日/调休标签走 `--font-size-calendar-micro`（24rpx，格内下限），盒高 34rpx，日期与标记仍都放得下，不再更小（几何账本 `CALENDAR_LEDGER.infoRowRpx.tagFont` 钉住）。

主填充按钮是玫瑰底 `#E8909E` + 画布海军字 `#0A0E27`，玫瑰填充一律写 `var(--aurora-pink)`（`.btn-premium` 与首页的 `.quick-btn`、`.jump-option.active`、`.copy-recap` 由 `tests/design-token-guardrail.test.js` 钉住单一来源，`tests/filled-cta-contrast.test.js` 钉住玫瑰底海军字 4.5:1 对比度）。全页面（含绑定页）同一套玫瑰主操作，无页面级例外。护栏为 deny-by-default：任何选择器的渐变填充（linear/radial/conic）与实色玫瑰字面量填充（`#E8909E` / `rgb(232,144,158)` / `rgba(232,144,158,1)`）都必须落在测试登记的装饰例外白名单内，新增主操作按钮写字面量玫瑰或渐变填充会被直接拒绝。两页凭证复制胶囊不属实色主按钮，88/60 契约见上文 #271 条目。不要把白字叠玫瑰写成规范。记录 tab 进行中经期的时长胶囊（`.item-duration.ongoing`）也用这一对：画布海军字叠 92% 玫瑰底，合成在列表卡上后文字对比度 ≥4.5:1，由 `tests/contrast-guardrail.test.js` 钉住。实色主按钮（`.btn-premium`、首页经期 `.quick-btn`、`.copy-recap`）统一带 `inset 0 1px 0 rgba(255,255,255,0.30)` 顶缘微高光，柔光层静止 `0.35`、按压 `0.15`；通用主按钮与小结复制按钮只有一种形状：`var(--radius-md)`；首页两个快捷入口的外框统一为 `var(--radius-card)`（24rpx）；欢乐时光 `.quick-btn.btn-ghost` 是 button-ghost 次操作，海军实底、1.5px 玫瑰描边与玫瑰字都在按钮自身并随 0.95 按压缩放，宿主不再留下静止黑边，无柔光，不属于实色主按钮。复制键和重试小按钮不是主按钮。分段控件（记录分类 `.segment-option`、设置密度 `.density-option`、绑定页创建/加入 `.tab`）自 #233 起共用 `pages/shared/segmented-control.wxss`：选项统一为 caption 26rpx、未选中 `rgba(255,255,255,0.72)`、`--radius-md`、88rpx 触控高度，容器选项间距统一为 10rpx；绑定页旧的 28rpx、0.6 与无圆角形态退役。容器只有两种变体：记录 tab 在画布上使用海军回退、5.5% 淡白平涂、4rpx 内边距与 `--radius-card`；绑定和设置的卡内轨道为 6rpx 内边距、`--radius-card`、`rgba(10,14,39,0.45)` 底与 `1px rgba(255,255,255,0.07)` 边。三页普通选中态统一为玫瑰字 `#E8909E`，选中底与描边由轨道底层的 `.segment-thumb` 唯一承载：`rgba(232,144,158,0.14)` 底、`1px solid rgba(232,144,158,0.48)` 与 `--radius-md` 内圆角，不用实色玫瑰填充，也不叠加第二层选中框；滑块支持两等分与三等分，激活选项按压仍加深至 14% 玫瑰底与 58% 玫瑰边。绑定首次未选入口是独立的等权态：两枚 5% 白底、28% 玫瑰边与 92% 强调白字，未展开子表单时轨道下外边距为 0，选择后恢复普通态和 30rpx。

记录 tab 下拉刷新指示（issue #244，R4）位于分段控件下方，是居中的 caption「正在刷新」：`--text-secondary`、64rpx 盒高，与下一块保 20rpx 间距；只在本页下拉刷新期间挂载，不可点，不加按压或动效。

- 记录仪表盘与两页骨架（issue #258）：周期概览严格三等分，中列左右各 1px 7% 白分隔，44rpx 数字与 24rpx 次要「天」基线对齐；loading 数字占位为 88×44rpx。收起经期月份显示 `· N 条`，展开不重复，作者并入日期行，行左右 16rpx，状态与箭头不收缩不换行。首页骨架有格间缝、非本月透明、同亮度翻月圆钮和双快捷占位；记录列表骨架只在父层 pulse。首次失败仅重试按钮自身缩放并复用主按钮柔光，两类零记录空态为 1px dashed 14% 白边。
- 设置名片与使用说明（issue #259、#271）：房间码与标签左对齐，配对徽标以 `12rpx` 间距紧随「我的房间码」右侧；房间卡只保留凭证与等待期「再发邀请」，重新同步移入「数据」分组并与「导出数据」组成带标准分隔线的双行卡，确认弹层与房间重拉流程不变。日历说明避免孤行，版本号用 `--text-secondary`。使用说明固定为「房间与配对」「记录经期与欢乐时光」「预测与日历标记」「数据同步与隐私」四块，每块 20rpx 24rpx、`--radius-md`、3.5% 白底、1px 6% 白边和 26rpx 强调小标题，末块不留额外底距。帮助与确认面板的遮挡协同见 `docs/motion-and-interaction.md`。
- 本月小结、预测说明与邀请图像（issue #257、#261、#268）：小结弹层标题固定为「本月小结」，仅由副标题展示浏览年月；复制文本首行仍由 `shareTitle` 输出「YYYY年M月小结」。顶部三句汇总收进 20rpx 24rpx 轻玻璃概览，明细以 `highlightItems` 的语义 `kind`、紧凑 `dateBadge` 与清爽 `summary` 分段渲染，完整 `text` 继续服务读屏与复制，所有跨月并集天数、当月相交天数和本条持续天数规则不变。预测说明首句 `.prediction-hero` 使用 20rpx 24rpx 轻玻璃主卡、`1px solid rgba(212,165,116,0.28)` 暖金细边与左侧 `4rpx solid var(--aurora-gold)` 微导轨，正文仍为 0.92 强调中性白。明细与复制按钮间距 24rpx，复制按压 0.96。静态邀请卡为 1000×800 PNG，深海玫瑰/薰衣草微抖动极光、双层玻璃心与「美少女的日历 / 把这一份温柔，留给我们」，不含经期字样或房间码；24 位候选超预算后最终保留 256 色有序微抖动量化版 73,940B，当前打包媒体总计 80,164B，D2 判定与原生分享预览边界见验证日志。应用源图标继续忽略入包，底栏设置两态为 81×81 六圆钝齿，alpha≥250 实色精确匹配 `#7A7C8C` / `#E8909E`。

元数据金 `#D4A574` 只表示下次可能开始的日子（「预」）和节日文字，以及已登记的预测与确定性元数据（同步状态点、预测日期、详情里的预测与节日标题）。调休「班」不用金。当日详情里经期标签用玫瑰 `#E8909E`，欢乐时光标签用浅粉 `#F0C4C0`。实色金一律 `var(--aurora-gold)`。节日是无底金字：不铺整格金底，也不铺金底胶囊。预测说明正文不用金。玫瑰 → 金的 135deg 渐变曾是 CTA 误用形态，已随 issue #55 退役：`--gradient-gold` token 已从 `app.wxss` 删除，任何页面不得再引用（design-token 护栏强制）。玫瑰 → 薰衣草的 `--gradient-pink` 同样无屏上引用，已随 issue #59 一并退役；渐变填充不再以 token 形式提供。首页金色只允许落在白名单规则上（`.predict-mark`、「预」的强调光晕 `.calendar-days.calendar-emphasis-predict-a .predict-mark::after` 与 `-predict-b` 那一条（issue #165）、`.predict-date`、`.prediction-hero`、`.holiday-tag`、`.sync-dot`、`.detail-meaning.predict`、`.detail-meaning.holiday`、`.detail-meaning.predict .detail-meaning-title`、`.detail-meaning.holiday .detail-meaning-title`），由 `tests/design-token-guardrail.test.js` 的金语义白名单钉住。页面 WXSS 不得再出现 `#D4A574` 字面量。金的 rgba 只留给描边或辉光（「预」的描边与强调光晕），不铺节日标签底。当日详情里，可点记录行右端带与记录 tab 同款的「›」并保留按压；含义说明块无描边、不带「›」，与记录行区分（issue #216）。同步点没有光晕。

不安装、不覆盖成外部品牌设计系统。系统名仍是 Aurora Bloom。

## Overview

Aurora Bloom is a premium wellness dark theme for minmin-calendar — a period tracking and diary app. Rose tones on deep navy with soft glassmorphism surfaces and subtle aurora animations.

## Colors

Primary: warm rose #E8909E. Secondary: soft lavender #C4A0D2. Accent: warm gold #D4A574.
BG: deep navy #0A0E27 canvas. #12163D remains the still aurora base's deep-blue stop; the global glass fallback is `rgba(15,19,52,0.88)` (`--glass-fallback`), and the home sheet panels remain at 94–96%. #1A0A2E (deep plum) only closes the still aurora base below. Canvas navy is also the primary-fill label color.
Warning red: #F97373 — 唯一警示色，语义与形态见下文「警示红语义」。
成功/完成态（如绑定成功 `.bound-status`）用主色玫瑰 #E8909E 表达；色板不引入绿色。全部 WXSS 的 hex 颜色必须落在本文件登记的色板内，由 `tests/design-token-guardrail.test.js` 护栏。
Aurora base (`.page::before`, still): `linear-gradient(168deg, #0A0E27 0%, #0A0E27 28%, #12163D 62%, #1A0A2E 100%)`. The violet bloom's centre colour #2D1B69 is registered as `--aurora-bg3`; the rose and lavender blooms reuse the primary and secondary hues. 月份导航卡里另有一层静止的玫瑰径向淡光（`.month-nav::before`，中心 10%，被卡片的 `overflow: hidden` 裁在卡内），是玻璃面的微渐变，不动，也不是辉光。
Shadow / overlay 登记：卡片与日历网格投影 `rgba(0,0,0,0.2)`；深海输入槽微内影 `inset 0 2rpx 6rpx rgba(0,0,0,0.28)`；浮层小投影 `rgba(0,0,0,0.12–0.15)`；首页底部 sheet 上缘投影 `rgba(0,0,0,0.34)`；海军近景投影与字阴影 `rgba(10,14,39,0.16–0.35)`（编辑返回键自 #267 起不再使用厚底投影或字阴影）；sheet 遮罩 `rgba(10,14,39,0.88)`（画布海军 88% 透明度）；玻璃回退实色 `rgba(15,19,52,0.88)`；全部底部 sheet 共用 `.day-action-sheet` 基础面板与 `.calendar-jump-sheet` 选月修饰，均为 `linear-gradient(160deg, rgba(232,144,158,0.12–0.14), rgba(196,160,210,0.08) 42–45%, rgba(18,22,61,0.94–0.96))` 叠同透明度海军实底；设置「使用说明」与确认面板也使用这套渐变，不再是通用玻璃卡 `.premium-card`（issue #235）；inset 顶线高光 `rgba(255,255,255,0.08–0.32)`（实色玫瑰主按钮固定为 `inset 0 1px 0 rgba(255,255,255,0.30)`）；辉光阴影随主色走——玫瑰 `rgba(232,144,158,0.1–0.45)`、浅粉 `rgba(240,196,192,0.28–0.32)`、金 `rgba(212,165,116,0.3–0.5)`、警示红 `rgba(249,115,115,0.38)`（区间保留，现在没有控件用）。辉光只在这几处：可点主操作的按压柔光（画在 `::before` 柔光层上：通用主按钮、首页主快捷按钮与本月小结复制按钮静止 `0.35`、按压 `0.15`，两页凭证复制胶囊不挂柔光，issue #166 / #269）；输入槽焦点玫瑰光环 `0 0 0 4rpx rgba(232,144,158,0.14)`；选中态的静态玫瑰光（选月面板当前月 `.jump-option::after` 0.18（只过渡伪元素透明度），经期编辑页选中的状态、经量和症状芯片 0.22）；当日详情的玫瑰或浅粉 rail 是内嵌圆角语义细柱，不再发光；三处柔和的情感装饰——#271 双琉璃心外圈与涟漪 `0 0 24rpx rgba(232,144,158,0.14)`、欢乐时光列表 ♥ 的 `text-shadow: 0 0 10px rgba(240,196,192,0.3)`（issue #225 起用文字阴影，不用 `filter: drop-shadow`）、「记录」tab 周期概览卡的玫瑰投影 `0 16rpx 64rpx rgba(232,144,158,0.15)`。除此之外不可点元素不再发光：月份导航没有玫瑰投影，同步点没有光晕。

### 语义 token（issue #245）

本表登记的颜色与页面节奏角色在使用处只引用 `app.wxss` 的对应 token；改一个语义层级只改对应定义。三种实色的 hex 字面量只能出现在 `app.wxss` 的 `page` token 定义块，其他 WXSS 一律写 `var(...)`。`DESIGN.md` 的色板登记与 `app.json` 的原生配置不是 WXSS 使用处；红族与浅粉族的 rgba 描边、平涂和辉光仍按「Shadow / overlay 登记」保留。

| 类别 | token | 值 | 角色 |
|---|---|---|---|
| 颜色 | `--color-danger` | `#F97373` | 危险操作、确认危险键、绑定页错误条与字段错误的文字 |
| 颜色 | `--color-memory` | `#F0C4C0` | 欢乐时光心形、详情标题与状态 rail 的实色 |
| 颜色 | `--text-on-accent` | `#0A0E27` | 玫瑰实色主按钮、选中芯片与强调胶囊上的文字 |
| 留白 | `--space-page-gutter` | `24rpx` | 首页内容、吸顶区与骨架，以及记录、设置、编辑页的左右页边距 |
| 留白 | `--space-page-first-block` | `24rpx` | 记录分段控件、设置与编辑页首块离顶栏的距离 |
| 留白 | `--space-page-block-gap` | `20rpx` | 同页块间距：分段控件与第一块、卡片与按钮、月份卡、编辑表单与保存按钮 |
| 留白 | `--space-page-row-inset` | `30rpx` | 列表行、菜单行、月份卡头、密度控件与房间码操作的左右内边距或等量缩进 |
| 留白 | `--space-settings-group-gap` | `28rpx` | 设置页带组标题的分组间距 |

issue #260 的色值收口同时约束文字和描边：页面与共享 WXSS 的裸 `#E8909E` 一律写 `var(--aurora-pink)`，仅根 token 定义保留 hex；普通文字不再使用裸 `#fff`，绑定页、首页与记录页真实存在的三处均归到 0.92 强调档。`tests/design-token-guardrail.test.js` 对玫瑰文字/描边和纯白文字执行 deny-by-default，已核实无引用的死选择器与未消费属性不保留。

Removed from original: neon green, hot pink, cyan, bright gold. Too aggressive for a wellness app.

## 绑定页紫域试点：结论「不推广」（issue #86-#89 → #104）

issue #86–#89 的绑定页紫粉试点（深紫画布、紫玻璃 tint、粉胶囊/粉幽灵按钮、升档玫瑰成功标题）结论是**不推广**：启动首屏已于 issue #104 收敛回 Aurora Bloom，与进入后的页面同一套视觉。试点的 `--bind-*` 页面级 token、深紫画布覆盖、粉胶囊主按钮/复制键/选中 tab、粉幽灵「解除绑定」、紫玻璃 tint 与深紫回退全部移除，本文件 frontmatter 的例外色板登记（bind-canvas-top/bottom、bind-cta-pink、bind-ghost-pink、bind-status-rose）同步删除，色板护栏回到 deny-by-default 单一 Aurora 色板——紫粉字面量不再有任何登记来源，重新引入会被 `tests/design-token-guardrail.test.js` 直接拒绝。

试点后绑定页的情绪点自 #271 起是与高清邀请卡同源的交叠双琉璃心：`pages/shared/brand-hearts.wxml` 以零请求内联 SVG 绘制一暖玫瑰、一柔薰衣草微错位交叠的半透明徽章，路径、玻璃填充、边缘与高光语义来自 #265；绑定页 `.hero-icon` 与首页未绑定 `.no-room-icon` 共用同一模板并 `aria-hidden="true"`，不再使用文本心形。绑定页保留 `heroIn` 无回弹入场，首页只在徽章容器保留既有 `pulse`；外圈及涟漪柔光登记为 `0 0 24rpx rgba(232,144,158,0.14)`，不叠第二层常驻动画。成功标题 `.bound-status` 仍是主色玫瑰 `#E8909E`，在海军卡合成面上 ≥4.5:1，由 `tests/secondary-affordance-contrast.test.js` 钉住。

启动首屏校验中（issue #115）：第一次房间校验出结果前默认只渲染品牌心，`heroIn` 0.6s 入场保持不变；issue #220 起，校验持续约 800ms 后才在心形下方加一行「正在打开日历…」，校验完成即撤掉，更快完成时不出现；不渲染创建/加入卡、已绑定卡和错误条。已绑定则继续只留心并进入首页，只有跳转失败才露出已绑定卡和「进入应用」。未绑定或校验失败时，心下面的大标题和说明与卡片（失败时连同错误条和「重试」）同一刻用 `bindReveal` 显现：透明度 0→1，自 `translateY(16rpx)` 回到 0，时长 `var(--duration-enter)`，曲线 `var(--ease-out)`；大标题和说明自 issue #167 起加入这次显现，不再在卡片淡入时先硬切出来。减弱动效下这次显现立即出现，无位移、无淡入。再次 `onShow` 或点「重试」不回到只留心的校验中。

建好房间（issue #167、#271）：创建成功是真正存下的绑定，这一刻给一次回应。副心回声 `.brand-heart-secondary-echo` 与外圈 `.brand-heart-ring-echo` 向外轻漾一次（`heroBloom`：透明度 0.6→0、放大到 1.6 倍，`var(--duration-emphasis)`、`var(--ease-out)`）；两层平时和播完都透明，减弱动效下 `animation: none` 并保持静止透明。已绑定卡换下创建表单时用同一个 `bindReveal` 显现（`.premium-card.bound-reveal`），外层 `.bind-reveal` 早已播完，两段不叠加。卡里的主次和分享不变：「发给 TA」仍是唯一主按钮，「进入应用」是幽灵次按钮（issue #149）。记号是 `justCreated`：创建失败不漾开；之后再次 `onShow` 校验清掉它（R8 分享返回的那一次保留建房卡且不自动跳转，下一次显示才恢复），涟漪和卡片显现都不重播，徽章本身的 `heroIn` 也不重播。加入房间成功不弹 toast，直接进首页，由首页一次性配对欢迎条接着说明（issue #149、#211），绑定页不再加动效。护栏：`tests/bind-room-flow.test.js`、`tests/motion-performance.test.js`。

已绑定卡的主次（issue #149、#271）：刚创建房间时「发给 TA」（原生分享按钮，整宽玫瑰实底）是唯一主操作；「进入应用」是幽灵次按钮 `.btn-ghost`——透明底、1.5px 玫瑰描边、玫瑰字，与主按钮同为整宽和 `--radius-md`，上下 12px 内边距与 88rpx 最小高度并存，320px 宽下触控高度仍 ≥44px；按下缩到 0.95，无投影，减弱动效下无过渡。刚创建后点它而跳转失败，主次不变。只有已有房间的首页跳转失败时，「进入应用」才以 `.btn-premium` 主按钮出现作为恢复。护栏：`tests/bind-room-flow.test.js`、`tests/secondary-affordance-contrast.test.js`、`tests/narrow-screen-geometry.test.js`。

#271 跨页凭证契约：绑定与设置共用 `pages/shared/room-code.wxss` 的 `.room-credential-ticket` 深海内凹票根（52% 海军、20% 玫瑰细边、`inset 0 2rpx 6rpx rgba(0,0,0,0.28)`），房间码左对齐。两处 `.copy-btn` 均为 88rpx 透明触控热区，内部 `.copy-btn-surface` 为 60rpx 高、`padding: 0 28rpx`、14% 玫瑰淡底、45% 玫瑰描边、暖玫瑰字与 `--radius-full` 的修长胶囊；外层、内层和 `::before` 全部 `box-shadow: none`，按压只缩放，不再登记实色填充或柔光层。玫瑰字在票根与淡底实际合成面上 ≥4.5:1，由 `tests/secondary-affordance-contrast.test.js` 钉住。

## Typography

System font stack for zero-bloat + excellent CJK rendering;全页面只继承 `app.wxss` 的 `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', sans-serif`，不声明 `@font-face`、不引入外部字体（`tests/typography-hierarchy.test.js` 护栏）。Sizes, weights and line heights come only from the shared roles below; frontmatter `typography` carries the same values as nominal px at the 375px design width (×2 = the rpx token). Week headers keep natural letter-spacing and do not add tracking. Calendar holiday tags and 「预」 stay at caption scale: `.day-tag` / `.predict-mark` are `26rpx`, and the holiday/workday `.day-tag` box is `38rpx` tall so CJK glyphs are not clipped; in the compact density the `.day-tag` drops to the `24rpx` micro role in a `34rpx` box (see 日历微字 above).

首页月份标题层级：`.month-title` 走 `--font-size-month-title`（44rpx）与 `--font-weight-title`（700），使用 `--letter-spacing-display` 并以等值 `text-indent` 补偿居中尾白；明显高于各页共享导航标题 `.nav-title`（`--font-size-title` 38rpx / 同一标题字重 700）。层级差来自字号（≥6rpx），不来自更重的 800。`line-height: var(--line-height-title)`（1.2）+ `white-space: nowrap` 保证单行完整显示，最坏文案「2026年12月」在 750rpx 视口的月份导航行内不溢出。年月数字走 `tabular-nums`；issue #247 将月份胶囊 `.month-title-trigger` 与骨架同形胶囊的最小宽同步调为 344rpx；issue #266 加入 `--letter-spacing-display` 及等值居中补偿后同步调至 352rpx，兜住含描边约 350.1rpx 的最坏文案，仍小于导航行约 473.3rpx 的可用宽；1 位数和 2 位数月份同宽，翻月、换年时胶囊不变宽、不挪位，文字在胶囊内居中（issue #164）。层级差、单行、宽度账本与稳宽由 `tests/typography-hierarchy.test.js` 钉住。

caption 家族行高策略：流式说明文字（`.form-hint`、`.symptom-group-label`、`.settings-group-title`、`.room-code-label`）统一 `line-height: var(--line-height-assist)`（1.4）与 `font-weight: var(--font-weight-assist)`（500）；单行控件（`.copy-btn`）以盒高居中——盒高 88rpx flex 居中，不另设文字行高。图例符号复用日历格标记类，不另设 `.legend-symbol`。六族统一走 `--font-size-caption`（26rpx），由 `tests/typography-hierarchy.test.js` 钉住。

首页九组「标题 + 说明」（弹层标题、未绑定、等待邀请、当日空态、标记含义、记录详情、图例、预测说明、本月小结）共用 `pages/shared/text-pair.wxss` 的 `.text-pair-title` / `.text-pair-desc` 两个结构角色，只收敛共同的块级显示；各类原来的字号、字重、行高、颜色、间距与换行策略继续由 `.sheet-title`、`.legend-text` 等修饰类承载，不改视觉。

记录 tab 空态、首页空态引导与当日未来说明共用 `pages/shared/empty-state.wxss` 的 `.empty-state` 结构（块级盒与 1px 描边宽度）；`.record-empty`、`.empty-guide`、`.day-detail-empty` 修饰类分别保留原有 padding、颜色、字号、圆角、填充、描边样式和布局值，本轮不改视觉。

信息性文字下限：日历格内微字（农历、经期/欢乐时光标记、预测徽标）不小于 `24rpx`；日历格外 caption（统计标签、同步状态、说明文字）不小于 `26rpx`。低于下限的诉求靠缩短文案或调整布局吸收，不缩小字号。

### 共享文字透明度角色（issue #246）

中性文字颜色与字号、字重、行高一样按角色取值，不再逐元素保留 16 档透明度。既有值按最近档归并，距离相等时取高档；需要 4.5:1 的文字若归并后低于护栏，改用上面一档。下表约束普通中性文字，不改日历格内的语义色、语义色 token、材质/描边/辉光透明值，也不改 issue #228 / #233 单独登记的玫瑰透明值。

| 透明度 | 角色 | 使用边界 |
|---|---|---|
| `0.92` | 强调 | 导航与弹层标题、关键数字和需要最清楚读出的内容 |
| `0.85` | 正文 | 列表主行、正文、输入文字与普通日期数字 |
| `0.72` | 辅助 | 说明文字、辅助操作和次级信息 |
| `0.6` | 次要 | `--text-secondary`、输入占位与格内低优先信息；仍须按实际表面通过所需对比度 |
| `0.35` | 仅装饰 | `--text-tertiary` 装饰用途；不得承载必须阅读的文字、占位符或可点入口 |

日历格内角色保持独立：普通日期数字归并为 0.85，农历与节日农历为 0.6，调休标签为 0.72；今天、经期、欢乐时光、预测和节日语义色不套中性白阶梯。组件的禁用、按压和动效整体 `opacity` 仍由交互规则管理，不属于这张文字颜色表。

### 共享字号角色（issue #53，`app.wxss` token 为唯一来源）

frontmatter 的 `typography` 与下表同值，写成 375px 设计宽下的名义 px（×2 即 rpx，和 spacing 一样），不是另一套目标值；实现层全部走下表 rpx 角色 token。页面 WXSS 的 `font-size` 只允许 `var(--font-size-*)`；例外必须登记在 `tests/typography-roles.test.js` 的 `TYPOGRAPHY_EXCEPTIONS`（glyph = 箭头/emoji/标记字形，尺寸随容器几何；display = 展示型大数字/大字，单点登记）。

| token | 值 | 角色 | 典型使用 |
|---|---|---|---|
| `--font-size-month-title` | `44rpx` | 首页月份大标题（高于全局导航一级） | `.month-title` |
| `--font-size-title` | `38rpx` | 标题 | `.nav-title`、`.sheet-title`、`.no-room-title` |
| `--font-size-body-lg` | `34rpx` | 正文大号、输入文字 | `.prediction-summary`、`.jump-year-value`、`.bound-status`、`.form-input`、`.form-picker`、`.input-placeholder` |
| `--font-size-body` | `30rpx` | 正文、按钮 | 列表主行、`.month-header-text`（欢乐时光月份卡头，issue #108）、`.menu-text`、`.empty-state`、`.btn-premium`、`.btn-danger` |
| `--font-size-caption` | `26rpx` | caption（页面外下限） | 说明/标签/统计文字、`.day-tag`、`.predict-mark`、`.form-label`、流量/症状 chips、`.copy-btn`、`.month-toggle`（月份卡「展开/收起」，issue #109）、三页分段选项（`.tab` / `.segment-option` / `.density-option`，issue #233）等次级小操作 |
| `--font-size-calendar-date` | `28rpx` | 日历日期（full 密度） | `.day-num` |
| `--font-size-calendar-date-compact` | `30rpx` | 日历日期（compact 密度） | `.calendar-density-compact .day-num` |
| `--font-size-calendar-micro` | `24rpx` | 日历格内微字（下限） | `.day-lunar`、`.memory-mark`、清爽密度的 `.day-tag` |

issue #247 起 button 并入 body（30rpx），input 并入 body-lg（34rpx），不再保留 `--font-size-button` / `--font-size-input`；sheet 确认、复制等小操作文字仍按正文/caption 角色。glyph/display 例外清单仅保留心形等装饰字形、`.cycle-num` 44rpx、`.hero-title` 48rpx 与 `.code-input` 40rpx 等单点；issue #266 的折角、叉号与加号全部改走共享矢量尺寸，不再登记裸字符字号例外。展示型大字不是阅读文字，新增例外必须先登记。房间码自 #232 起不再是 display 例外，两页共用 `--font-size-title`。

issue #247 静态几何判定后保留旧值的例外如下；它们不扩成新的角色 token，也不改变日历格内字号：

| 选择器 | 保留值 | 原拟新角色 | 几何原因 |
|---|---|---|---|
| `.home-status-text` | `32rpx` | body-lg 34rpx | 最长推迟句连同行尾在 750rpx 账本中需 731.2rpx，超过 702rpx 可用宽，保持单行与 88rpx 吸顶状态行。 |
| `.quick-text` | `28rpx` | body 30rpx | 「经期第 120 天 ·」需约 249rpx，超过半栏文字列约 236.3rpx；新值会把既定两行折成三行并超出 104rpx 按钮账本。 |

标签空间不足时缩短文案，不缩字号；除此之外，新阶梯的页面文字不通过省略或裁切吸收宽度。R9 的微信字体放大观察与后续选择属于运行态判定，不以这份静态账本预判。

### 共享文字字重、行高与字距（issue #62）

字号仍只来自上一节的 `--font-size-*`。字重、阅读行高和字距的数值只写在 `app.wxss` 下列 token；页面引用 `var(--…)`，不另写 400/500/600/700 或同义字距。文字角色不保留 800。无单位行高只能是下表四档，不写 1.25 这类近似值；rpx 盒高行高（按钮、输入框、日历格槽位）和图形符号的 `1` 不算阅读行高（issue #164）。

| token | 值 | 角色 |
|---|---|---|
| `--font-weight-body` | `400` | 正文、正文大号、输入文字 |
| `--font-weight-assist` | `500` | 辅助说明、农历、节日/调休/预测文字 |
| `--font-weight-control` | `600` | 普通日历日期、主按钮与其他关键控件 |
| `--font-weight-title` | `700` | 月份标题、导航/页面标题 |
| `--line-height-body` | `1.6` | 流式正文 |
| `--line-height-assist` | `1.4` | 流式辅助说明、单行列表日期与表单选择框 |
| `--line-height-title` | `1.2` | 标题与单行标签：月份、使用说明和绑定页标题，同步胶囊文字，弹层动作与图例的标题行 |
| `--line-height-snug` | `1.32` | 首页双行快捷文案与多行弹层标题（issue #266） |
| `--letter-spacing-assist` | `1rpx` | 有水平余量的流式辅助说明 |
| `--letter-spacing-display` | `1rpx` | 大号粗体标题防粘连字距；居中标题以等值 text-indent 补偿尾白 |
| `--letter-spacing-control-sm` | `0.5rpx` | 小号加粗分段控件微字距；居中控件以等值 text-indent 补偿尾白 |
| `--letter-spacing-room-code` | `6rpx` | 房间码展示串，逐字核对，不是辅助说明字距 |
| `--letter-spacing-code-input` | `12rpx` | 6 位房间码输入，逐字槽位，不是辅助说明字距 |

今天（`.day-cell.today .day-num`）复用 `--font-weight-title`（700），作为相对普通日期 600 的语义强调；等宽数字仍由 `.day-num` 的 `tabular-nums` 继承。不另设第五档字重。

统计数字（`.cycle-num`）按可扫读的数字信息处理，字重走 `--font-weight-control`（600）并保留 `tabular-nums` 与既有展示字号。不因历史展示例外保留 800，也不把它升成标题。

等宽数字（`font-variant-numeric: tabular-nums`）用在三类文字上：日历日期、统计数字和房间码；翻月就换数字的行（月份标题、状态行、本月小结、弹层副标题、选月年份）；成列扫读的数字（记录列表的日期、时长胶囊、欢乐时光月份卡头）。数字变了不改字宽，也不推动后面的字（issue #164）。登记表是 `tests/typography-roles.test.js` 的 `TABULAR_NUMERIC`；房间码输入框是原生输入控件，不在表里。

房间码在设置页与绑定页共用 `pages/shared/room-code.wxss` 的 `.room-code-value`：标题档 `--font-size-title`、主文字色 `var(--text-primary)`、控件字重 600、`tabular-nums` 与 `--letter-spacing-room-code`，不可点所以不用玫瑰色。无码占位 `.room-code-value.muted` 回到正文 400，字距复位为 0。`.code-input` 是输入文字，字重 400，字距只用 `--letter-spacing-code-input`。它的盒高和行高都是 88rpx，纵向 padding 为 0，六位码在框内完整可见并水平居中；输入框通栏，与上方说明和下方主按钮对齐。占位符走同一行高。

流式辅助说明在有水平余量时使用 `--letter-spacing-assist`。格内农历、节日/调休/预测文字、单字周标题、按钮标签和标题保持自然字距，不靠加字距或缩小字号制造轻盈。胶囊盒高和日历格留白不在本角色表里改。完整密度的格内农历只显示日名，农历初一显示月名（含闰月，如「闰四月」）；完整农历字符串留在日历格无障碍名称和日详情副标题。格内仍单行、不用省略号。清爽密度不显示农历。

字形例外：`.sheet-action-icon` 的心形保留既有装饰字重，避免被文字角色改写；步进折角、关闭叉号与加号自 issue #266 起均为共享矢量，不再是字形例外。经期记录动作的图标不是字形，是图例的单日色带样本（见「借入规则」的图例段）。图例样本复用格内的 `.day-tag`、`.predict-mark`、`.memory-mark`、`.day-num` 与 `.period-band`，这些状态字走各自已有的辅助字重，不另设图例符号盒。

## Components

Cards keep a vertical velvet tint over `var(--glass-fallback)`: `.premium-card` uses `linear-gradient(rgba(255,255,255,0.095), rgba(255,255,255,0.035)), var(--glass-fallback)` with top/side/bottom strokes at 0.16/0.08/0.04 white. `.premium-card` 自身为 `position: relative; overflow: hidden`，顶缘 `::after` 是透明 → 42% 玫瑰 → 30% 纯白 → `rgba(196,160,210,0.32)` 薰衣草 → 透明的三段棱镜高光（issue #260 / #269），基类不再叠加平白 inset 顶线，页面不再分别补定位或裁剪。 Over the 0.88 fallback a blur would not show, so cards, the navbar, the calendar and danger buttons do not blur; the blurred sheet surface is the one shared mask registered under 玻璃叠层. Rows that sit straight on the aurora put the same fallback under their wash. A color is legal only as the last `background` layer; a two-color shorthand paints nothing. Cards and text add no decorative shadows beyond the card elevation and the few glows registered under Shadow / overlay. The shared bottom-sheet mask is registered once and imported by every sheet page. The press glow belongs only to the rose primary fills: it is painted on a `::before` glow layer. The shared primary button, home quick action and recap copy rest at 0.35 and sink to 0.15 on the same `--duration-press` beat as the scale; both room-code credential copy capsules have no glow. Primary fills keep a static 1px inset top highlight and never swap that shadow on press (see 按压的四路).

Primary fill (`.btn-premium`): rose `#E8909E` fill, label `#0A0E27`; both credential-ticket copy capsules use the separate glow-free #271 contract above. Ghost / outline includes the bind page's secondary 「进入应用」: transparent, rose border and rose label on navy. 首页的 「记欢乐时光」虽沿用 `.btn-ghost` 类，实际按 #255 登记为按钮自身的 `#0A0E27` 海军实底、玫瑰描边与玫瑰字，外框是 `--radius-card`（24rpx）而非透明胶囊；海军底随 0.95 按压缩放，半栏尺寸、最小触控高度与内边距仍沿用 `.quick-btn` 几何。

Prediction metadata and period tag chips stay compact and low-noise. Interactive chips need at least a 44px touch target; active chips use navy type on rose. 记录 tab 的经量标签（`.item-tag.flow`）自 issue #225 起改用与分段选中态相同的弱态：玫瑰字 `#E8909E`、`rgba(232,144,158,0.08)` 底、`rgba(232,144,158,0.45)` 描边；症状标签保持中性，进行中时长胶囊 `.item-duration.ongoing` 仍用 92% 玫瑰实底与海军字。Calendar cell states are listed under 借入规则; a visual mark still means only one thing.

记录 tab 的经期分段（issue #187）按「年份标题 → 月份玻璃卡 → 经期行」排列；只显示有记录的年月。年份标题使用 body-lg 字号、title 字重与次要文字色，年份之间留 28rpx，标题下留 12rpx；按 2026-11-12 的追加要求，整行提供至少 88rpx 的展开／收起触控区，读屏名包含年份、展开状态与操作。issue #225 起，年份 `.year-toggle` 与月份 `.month-toggle` 的「展开／收起」都用 `var(--text-secondary)`：整行就是点按目标，玫瑰留给主操作。年／月均默认展开，选择仅在页面内存保留；收起年份不改月份选择，保存成功同时展开目标年和月。月份沿用 `.month-header`、`.month-toggle` 的字号、触控高度、对比度和即时折叠，不增加一套卡面；卡头只显示月份，读屏名包含完整年月。经期行保留日期范围、状态、时长、作者、经量、症状及备注；欢乐时光分段沿用既有完整年月卡头；按 2026-11-14 的用户要求，月份卡默认全部收起（卡头仍显示年月、条数与第一条备注摘要），取代 issue #143 的最近三个有记录月份默认展开，手动选择与保存后展开所在月份的规则不变。

## 警示红语义

警示红 `#F97373` 是全色板唯一的警示色，一族只表示「需要注意的负面状态」，目前在屏上有四种形态：

| 形态 | 位置 | 表现 |
|---|---|---|
| 危险操作按钮 | `.btn-danger`（删除记录；绑定页 needUnbind 中间态的解除绑定入口；app 级基类） | 红字 + `rgba(249,115,115,0.28)` 描边，不透明海军实底（`var(--glass-bg)` 叠 `rgba(15,19,52,0.88)`）；Pressed 叠 `rgba(249,115,115,0.12)`、描边提亮到 `rgba(249,115,115,0.4)`、`scale(0.95)` |
| 确认面板危险键 | 共享底部确认面板 `.confirmation-panel` 内的 `.btn-danger`（issue #209） | 沿用同一警示红字、描边、海军实底与 Pressed；在确认面板全部深色渐变合成面上文字对比度 ≥4.5:1，不另造确认专用红色 |
| 危险菜单行 | `.menu-item.danger`（设置页页底危险区：解除绑定） | 红字 + `rgba(249,115,115,0.28)` 描边 + 海军实底；Pressed 叠 `rgba(249,115,115,0.12)`、描边提亮到 `rgba(249,115,115,0.4)`、`scale(0.95)` |
| 表单错误 | `.error-msg`（绑定页） | 红字 + `rgba(249,115,115,0.1)` 浅底（平涂层，叠在 `var(--glass-fallback)` 上，issue #163）+ `rgba(249,115,115,0.24)` 描边 |
| 字段错误 | `.field-error`（`app.wxss` 一条规则，经期 / 欢乐时光编辑页共用，issue #156） | 红字 caption 一句，紧贴所属日期 picker 下方常驻；不铺底、不描边、不做过渡 |

推迟状态不在这一族里。首页状态行只用中性次要色陈述「比预计晚 N 天」，推迟太久改写「上次记录 X月X日 开始 · 可以补记」；不写「很正常」这类安抚判断，估算的边界由预测说明里的「根据记录估算，不是医疗建议」交代。原来的推迟通栏提醒行已退役，不再另设提醒卡、导轨或辉光。

「解除绑定」属危险操作：设置页页底危险区的 `.menu-item.danger` 菜单行（issue #102 从绑定页已绑定卡迁入，issue #139 再从房间组挪到页底；有房间码才出现，解绑成功回绑定页）与绑定页 needUnbind 中间态（错误恢复路径）的就地解除入口（跟随 app 级 `.btn-danger` 基类）；issue #88 试点的粉幽灵形态已随 issue #104 收敛移除，不再存在红族之外的解除绑定样式。重新同步房间不是危险操作，不用这行样式。绑定页的校验失败重试 `.error-retry` 自 #234 起不再属于警示红族：它与首页 `.refresh-retry`、记录 tab `.list-retry` 共用 `pages/shared/retry-row.wxss`，都是与首页同形的整行玫瑰句——88rpx 触控高度、28rpx 左右内边距、`--radius-md`、玫瑰字与控件字重，海军回退上叠 5% 淡白，按下缩到 0.98、淡白加深到 9%、描边由 10% 提亮到 14%；各页只保留自己的位置外边距。绑定页红色只留给 `.error-msg` 错误条，危险操作与字段错误的既有红色不变。

字段错误（issue #156）：编辑页能定位到字段的校验错误留在该字段下方，不弹 toast；对应 picker 的读屏名称在原名后接同一句错误，红字行标 `aria-role="alert"`。保存失败时页面无动画地滚到第一个出错字段，并让出固定导航栏的高度。已显示的错误只在用户改动后重算这几个字段，改对即消失；保存前不新增错误。无法定位到字段的整体错误仍走瞬时 toast。

同一含义共享同一红色，组件角色靠形态（按钮 / 文案条）区分，不靠颜色分叉；不引入第二种红。

与「一个符号只表一意」家规的关系：家规约束同一符号不得表二意；警示红一族是反向合规——同一含义（负面状态）复用同一符号（这个红），形态承载角色、颜色不承载区分。若给危险操作和表单错误各配一种红，同一含义裂成多个符号，反而违反家规。

## Do's and Don'ts

- Do use warm rose as the sole bright tappable color
- Do use canvas navy `#0A0E27` on rose for primary-fill labels
- Do use warm gold for secondary certainty/range metadata
- Do keep the reviewed tab top hairline (`tabBar.borderStyle: white`)
- Do keep animations slow (6-12s cycles)（装饰性持续动画；加载/同步等功能性指示与 reduced-motion 替代按 `docs/motion-and-interaction.md`「常驻动画注册表」执行）
- Do document Default and Pressed only (plus the inert disabled/loading variants, which show no press); press uses `scale(0.94–0.98)`
- Don't use bounce/elastic overshoot easing, and don't stack a second ambient animation layer on one element
- Don't treat white-on-rose as the button spec
- Don't fork the warning red into multiple reds; one red, distinguished by form
- Don't use neon/bright colors
- Don't use gradient text fills for body content
- Don't install an external brand design system

## 借入规则

从 awesome-design-md 的 `apple`、`cal` 只借入可在微信小程序落地的约束。系统名仍是 Aurora Bloom；未 `install` 品牌文件。改 UI 时对照本节与 `utils/homeCalendarState.js` 的 `CALENDAR_LEGEND_ITEMS`，颜色仍走本文件色板。

### 交互（apple，映射到本仓）

- 可点色只有玫瑰 `#E8909E`。金 `#D4A574` 只表示下次可能开始的日子、节日文字，以及已登记的预测与确定性元数据，不当成第二颗 CTA，也不表示调休。
- 控件的交互态只写 Default 与 Pressed（禁用与加载中是按下不变的惰性变体）。Pressed 用 `transform: scale(0.94–0.98)`，主按钮 `.btn-premium` 为 `0.96`。
- 触控高度至少 44px。日历格在 compact 密度下仍须能读日期与标记。落地面换算（issue #107 评审澄清）：通用控件按 750rpx 设计宽执行为盒高 ≥88rpx（44px@375px），`.copy-btn`、重试入口、分段选项与「记录」tab 欢乐时光月份卡头（issue #109）同档；首页未绑定 / 加载失败画面的主按钮（`.no-room .btn-premium`）在居中列里按内容收缩，宽和高都至少 88rpx，标签左右留 `--space-lg`，与上方说明文字也隔 `--space-lg`；320px 换算口径（compact 104rpx ≈ 44.4px@320px）只登记给日历格（issue #56 窄屏几何），不外推到其他控件。
- 卡片和正文不加装饰阴影，不叠第二套 elevation；高级卡只保留下投影，其他已登记玻璃 inset 保持。按压柔光只属于可点控件，画在柔光层上：通用主按钮、首页主快捷按钮与小结复制按钮静止 0.35、按压 0.15，设置与绑定复制键仍按压 0.5（见 `docs/motion-and-interaction.md`「按压的四路」）；实色主按钮的 1px 顶缘内高光保持静止，输入槽焦点光环与内影按登记的 `--duration-state` 过渡。「不加装饰阴影」管的是不可点的面（issue #163 划清这条线）；仍在发光的几处（输入焦点、选中态、三处情感装饰）逐个登记在「Shadow / overlay 登记」，不另开新的。

### 日历格状态（cal 的状态表写法，语义用本产品）

| 状态 | 标记 | 格子 |
|---|---|---|
| 今天 | 日期外的浅玫瑰小胶囊、薰衣草细边、玫瑰色日期，不用爱心 | 胶囊只围住日期数字，画在数字之下：完整密度 60×41rpx，从格顶画起；清爽密度 64×43rpx，从日期上方 5rpx 起。下沿离下一槽留 2rpx，基础库各段 rpx 独立取整。胶囊是 14% 玫瑰底加 2rpx 薰衣草边（`todayCapsule*`）。格子本身不铺底、不描边，调休格的低对比底照常铺。经期中的今天同样保留胶囊，下方独立色带继续表示经期。按压时胶囊随格子一起 `scale(0.94)`，回到今天时胶囊位置亮一次光晕（issue #165），播完回到静止样子。 |
| 经期 | 完整密度：22% 玫瑰填充 `rgba(232,144,158,0.22)` + 上下各 1px、60% 玫瑰边线；清爽密度：60% 玫瑰填充 `rgba(232,144,158,0.6)` | 完整密度色带位于农历文字行背后，槽位 `top: 40rpx; height: 30rpx`，22% 填充不变，24rpx 农历在 30rpx 槽内居中且上下不贴边；今天胶囊下沿与色带槽上沿静态相接 1rpx，两者不通过缩字或改槽回避，运行观察只确认实际叠接是否干扰。边线收在色带盒内，对网格相邻面 ≥3:1，农历字在填充上仍 ≥4.5:1。清爽密度位于日期数字下方的独立 12rpx 窄色带槽（320px 视口下仍约5px高，圆头可辨，避免退成一条横线），60% 填充在网格上约 3.32:1；两档都避开日期数字和今天胶囊。清爽行高上限148rpx，常规／合并信息行的内容最小高146／108rpx，空间不足时自然滚动，不压缩文字和标记。起点与终点用整圆头，中段在行内直角相连；仅右侧下一格仍属于同一连续段时向右外延 1rpx 消除取整暗缝，单日、段尾与跨周断口不外伸，换行在行首行尾收口；单日是圆角胶囊；进行中投影到今天的一端开口。不铺实色整格底。重叠日只表达经期。色带平时无过渡、立即出现；新增经期或补上结束日、保存成功回到首页时，这段色带的每一格一起淡入一次（issue #167），减弱动效下照常淡入。♥ 画在色带之上 |
| 欢乐时光 | ♥ `#F0C4C0` | 仅欢乐时光。新增保存成功回到首页时，这一天的 ♥ 从 0.6 倍淡入长到原大一次（issue #167），减弱动效下只淡入 |
| 下次可能开始的日子 | 金色「预」 | 已是经期日时不叠「预」。底透明，描边可留金。今天落在这个窗口时，「预」在胶囊外的日历网格上，对比度仍 ≥4.5:1。关掉预测说明时当月的「预」在描边处亮一次金色光晕（issue #165），播完回到透明底 |
| 节日 | 无底金色文字 | 不铺整格金底，也不铺金底胶囊。今天落在节日时，今天胶囊只围住日期，节日字留在胶囊外 |
| 调休上班 | 「班」 | 低调小标签，低对比底，不用金。调休格铺 3.5% 白的低对比底，今天落在调休日时这层底照常铺，胶囊叠在上面，「班」留在胶囊外 |

同一天可叠多种标记，但每个符号只表示上表一行。空格（非本月）隐藏，不参与状态。

图例项由 `utils/homeCalendarState.js` 的 `CALENDAR_LEGEND_ITEMS` 驱动：`cellClass` 与 `parts.className` 就是日历格上的那些类，模板不再另画 `.legend-symbol`。经期图例是单日圆角色带。今天的说明与格子一致：日期外的浅玫瑰色小胶囊、薰衣草细边、玫瑰色日期；经期中的今天也保留胶囊，色带独立表示经期。「预」的说明是「下次可能开始的日子」。样本就是一枚 72rpx 的日历格（issue #162）：铺日历网格同款底（5% 白叠玻璃回退），圆角与日历格相同，今天胶囊和各个标记落在和网格一样的合成面上，对比度也和网格上一样；色带在方格里上下居中。样本不改标记的颜色和形状；图例行的内边距为 20rpx，样本格自身仍保持 72rpx 与 0 内边距。首页「记经期」和当日弹层的经期动作画的也是这段单日色带（issue #159），不再用玫瑰圆点：`periodBandSample` 与图例经期项同源，样本缩进圆盘（记录入口的海军圆盘里 30×18rpx，弹层的玻璃圆盘里 40×24rpx），圆盘保留玫瑰细描边。图例样本与两种记录入口的样本根节点都带 `calendar-density-{{calendarDensity}}`，和格内色带共用 `.calendar-density-full / .calendar-density-compact .period-band` 规则；`calendarDensity` 单独传给模板，切换密度只换类名，不重新下发 `legendItems` 或 `periodBandSample`。完整密度的 22% 填充在记录入口海军圆盘上约 1.45:1、弹层玻璃圆盘上约 1.49:1、日历网格上约 1.49:1；它只帮助辨认，动作含义由按钮文字（记经期、补记经期、编辑这次经期等）承担，图标边界由圆盘和玫瑰细描边保持，海军圆盘在玫瑰按钮上约 8:1。清爽密度的 60% 填充与完整密度的 60% 上下边线在日历网格上约 3.32:1，达到非文字 3:1；两档的实际合成由 `tests/contrast-guardrail.test.js` 护栏。欢乐时光仍是浅色心。

完整密度的格内农历用 `lunarCellText`：平时是日名，农历月初一是月名。`lunarText` 的完整字符串只出现在读屏名和日详情副标题。清爽密度不显示农历；节日和调休两档都显示。设置页「日历显示」写明：清爽只看日期与标记（含节日和调休），完整另外显示农历。

### 明确不借

| 来源 | 不采用 |
|---|---|
| `apple` | Action Blue、博物馆白底、禁止玻璃/渐变、具名 SF Pro、金不能做元数据 |
| `cal` | 白底、黑 CTA、Cal Sans、卡片圆角上限 16px、36–40px 触控、深色只给页脚 |

`clay`、`renault` 目录文案与模板正文不符，不作为参考。`airbnb`、`claude`、`linear.app` 本次未借入。
