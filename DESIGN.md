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
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.2
  body-lg:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 14px
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
    fontSize: 16px
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
    backgroundColor: "rgba(255,255,255,0.08)"
    fallbackFill: "rgba(18,22,61,0.92)"
    rounded: 24rpx
    border: "1px solid rgba(255,255,255,0.12)"
    shadow: "0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)"
  button-primary:
    backgroundColor: "#E8909E"
    textColor: "#0A0E27"
    rounded: 20rpx
    padding: 26rpx 0
    pressScale: 0.96
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#E8909E"
    border: "1.5px solid #E8909E"
    canvas: "#0A0E27"
    rounded: 999rpx
    padding: 12px 28px
    pressScale: 0.95
  button-danger:
    backgroundColor: "rgba(255,255,255,0.08) + rgba(18,22,61,0.92)"
    textColor: "#F97373"
    border: "1px solid rgba(249,115,115,0.28)"
    pressedBackground: "rgba(249,115,115,0.12) + rgba(18,22,61,0.92)"
    rounded: 20rpx
    padding: 26rpx
    pressScale: 0.95
  calendar-cell:
    rounded: 20rpx
    textColor: "rgba(255,255,255,0.8)"
    todayCapsuleBg: "rgba(232,144,158,0.14)"
    todayCapsuleStroke: "2rpx solid rgba(196,160,210,0.55)"
    todayCapsuleSize: "60×41rpx full / 64×43rpx compact"
    todayText: "#E8909E"
    periodBand: "rgba(232,144,158,0.22)"
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
    backgroundColor: "rgba(255,255,255,0.06) + rgba(18,22,61,0.92)"
    rounded: 12rpx
    padding: 22rpx
    minHeight: 88rpx
    border: "1px solid rgba(255,255,255,0.12)"
    textColor: "rgba(255,255,255,0.85)"
    focusBorder: "1px solid #E8909E"
    pickerPressedBorder: "1px solid rgba(232,144,158,0.4)"
  modal-overlay:
    backgroundColor: "rgba(10,14,39,0.88)"
    backdropFilter: "blur(8px)"
  reminder-card:
    backgroundColor: "rgba(255,255,255,0.075)"
    fallbackFill: "rgba(18,22,61,0.92)"
    railColor: "#D4A574"
    dueRailColor: "#E8909E"
    overdueRailColor: "#FFFFFF"
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

本文件是 Aurora Bloom 的唯一现行视觉说明。色板、材质与辉光、圆角、字号角色、按压、动效注册表、tab 顶线和日历格状态以本文为准。不要并列第二套「目标稿」或「实现基线」；已审查数值不要按旧稿回改。

已在屏幕上成立、改 UI 时沿用：

- 圆角 token（`app.wxss`）：`--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` 为 `12rpx` / `20rpx` / `28rpx` / `36rpx`，另有 `--radius-card: 24rpx`（卡片与日历块；`.premium-card`、导航返回底、`.month-nav` 等均走此 token）、`--radius-full: 999rpx`（胶囊）、`--radius-circle: 50%`（正圆点/圆钮）。全部 WXSS 文件（含 `app.wxss` 自身）的 `border-radius` 只允许 token 与 `0` 复位；`::before` 平涂层与柔光层写 `inherit`，跟宿主同一个圆角（宿主那条照样只用 token），由 `tests/design-token-guardrail.test.js` 护栏。
- 玻璃叠层：`--glass-bg` 为 `rgba(255,255,255,0.08)`；卡片边框常用 `rgba(255,255,255,0.12)`（含 `--glass-border`）。共享玻璃卡（`.premium-card` 等）的着色是平涂图像层，叠在回退实色上：`linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback)`。CSS 只允许颜色作为 `background` 的最后一层，`<color>, var(--glass-fallback)` 整条无效、什么都不画。回退实色 `rgba(18,22,61,0.92)` 的唯一来源是 `--glass-fallback` token（近乎不透明的海军；既有规则已经用玫瑰实底的，保留玫瑰），一律写 `var(--glass-fallback)`，不重复字面量，由 `tests/design-token-guardrail.test.js` 护栏。模糊是材质选择，由实际画面决定，不再按「不透明度高就删模糊」默认处理（issue #163，取代 issue #146 的这条默认规则和 issue #58 的按文件玻璃面棘轮）。模糊的面逐个登记，新增或拿掉时同步本条和 `tests/motion-performance.test.js` 的 `BLURRED_SURFACES`：现在是首页弹层遮罩 `.day-sheet-mask` 和设置「使用说明」遮罩 `.help-mask`，同为 frontmatter `modal-overlay` 的 88% 海军加 `blur(8px)`。遮罩后面是有内容和极光的页面，模糊把弹层和背景分开。顶栏、返回键底、月份导航、周头、日历网格、通用卡片、危险按钮、同步胶囊，以及用同一回退实色的表单与空态，淡白叠 0.92 海军后约 0.92–0.93，模糊在这些面上看不出来，所以不写。任何模糊面都要有 ≥0.85 的海军或玫瑰实色，`backdrop-filter` 与 `-webkit-backdrop-filter` 成对写；忽略模糊时仍是实色面，不要只留半透明空框（`tests/glass-fallback.test.js`）。
- 间距阶梯：名义刻度 4/8/16/24/32/48px（frontmatter spacing）在 `app.wxss` 登记为 rpx token（数值 ×2）：`--space-xs` / `--space-sm` / `--space-md` / `--space-lg` / `--space-xl` / `--space-xxl` = `8rpx` / `16rpx` / `32rpx` / `48rpx` / `64rpx` / `96rpx`。issue #53 只收敛单一来源并登记；页面既有间距字面量的逐页迁移留给后续 UI ticket，新增布局优先使用 token。页面节奏角色（issue #164）：记录、欢乐时光、设置和两个编辑页共用一套留白，数值写在各页，按角色逐处比对，不许各页各写近似值。页边距 24rpx（首页 `.content` 与吸顶区同值）；首块离顶栏 24rpx；同页块间距 20rpx（分段控件与第一块之间、卡片与按钮之间、月份卡之间，记录页两段的第一块因此一样高，编辑页的保存按钮紧跟表单卡）；列表行与菜单行左右内边距 30rpx（记录 tab 两段共用的刷新失败重试行 `.list-retry` 站在列表行的位置上，同样 30rpx）。设置页带组标题的分组间距 28rpx；页底危险区离常规分组 `--space-lg`（相邻外边距合并取大值，小于分组间距的上外边距不起作用）；编辑页删除区仍是 `--space-xxl` 加分隔线。首页吸顶区与日历槽位归几何账本，绑定页是居中 hero 布局，不在此列。护栏 `tests/design-token-guardrail.test.js`。
- 字号角色：见「Typography」节的共享字号角色表，`app.wxss` 的 `--font-size-*` token 是全页面唯一来源，`tests/typography-roles.test.js` 护栏。
- 首页信息架构（issue #55、#105 的登记，issue #135 修订）：首页自上而下为 共享顶栏 → 吸顶区（月份导航「‹ 年月 ⌄ ›」，可见月不是当月时在其下加「回到今天」，再下面是状态行）→ 周头/日历 → 记录入口（`.quick-actions`）→ 本月小结行与提醒行 → 空态引导。吸顶区固定在顶栏下（`.home-sticky`，`top: var(--nav-bar-height)`），内容用同高占位，状态行因此始终可见。工具入口（图例、预测说明、本月小结）在顶栏左侧，触发器是矩形文字钮「工具」（`.nav-tool`，圆角 `--radius-md`），不跟翻月圆钮（`.nav-btn`）同形；菜单仍是与日操作 sheet 同族的底部 sheet，三个菜单项复用 `openLegendSheet` / `openPredictionSheet` / `openMonthlyRecap`。状态行由 `cycle.buildHomeStatusLine` 给出：经期中「经期第 N 天」、窗口前「预计 X月X日 开始 · 还有 N 天」（日期走 `formatDisplayDate`）、窗口内「这几天可能开始」、推迟「比预计晚 N 天」（`.home-status.neutral`，`var(--text-secondary)`，不用警示红）、数据不足「多记几次后就能预测」；经期集合进房后一次都没同步上（首次加载只有经期失败，既没加载到也没有旧数据）时说「经期未同步，暂不预测」（`.home-status.neutral`），不说经期第几天、不说记录不够，日历不画预测，预测说明同样只说未同步。点状态行打开现有预测说明。首页不再显示累计条数「经期记录 N」。本月小结行文案是「本月 经期 N 天 · 欢乐时光 N 条 ›」，N 天是该月与经期投影相交的天数，N 条是该月欢乐时光条数，点按打开本月小结；没同步上的集合那一部分写「经期未同步」或「欢乐时光未同步」，另一部分照常计数，本月小结 sheet 里对应的句子也只说未同步（`calendarInsights.buildMonthlyRecap` 的 `summaryLine`）。提醒是通栏行，不再套在卡片里；点按仍走原来的补填/记录动作。行右侧的玫瑰操作钮（「去补填」「记录」）按标签宽度排，不收缩、不折行，标签两侧留 `--space-xs`；长说明句由说明列折行吸收，320px 下说明列仍能单行放下最长的提醒标题（`tests/narrow-screen-geometry.test.js`）。经期与欢乐时光列表仍由「记录」tab 分段承接，首页不放列表入口。空态引导仅在两个集合都同步上且无任何记录时出现（有集合未同步时不知道有没有记录，仍显示小结行），文案「点今天或过去的一天开始记录」只引向今天或过去的日子（issue #152），文字在其合成面（背景 + 引导卡 6% 白底，背景按画布和极光最亮处各算一次，issue #163）上 ≥4.5:1，不低于 `--text-secondary` 档。日历几何只有一个出口 `computeCalendarRowHeight`（issue #153）：按视口、顶栏、密度、当月日期格、「回到今天」、配对欢迎条和行内重试行，一次给出行高和是否合并信息行。行高不超过原上限（完整密度 160rpx，清爽密度 140rpx），也不低于格内内容最小高度（完整 159rpx、清爽 138rpx、合并 100rpx，且至少 44px），不缩字、不裁切。最小高度里含 3rpx 格底留白：垂出的「预」离格子下沿至少 3rpx，碰不到下一行从格顶画起的今天胶囊和经期色带。这 3rpx 原是今天整格内描边的厚度，今天改成日期胶囊后数值不变，行高和合并判定都不变（issue #162）。清爽密度放不下常规三行时，节日/调休并进标记行，成为日期下方的一行（`.calendar-info-merged`，日期位置与读屏名不变）；当月有一天的节日/调休加标记在一列宽里排不下时不合并。内容最小高度与首屏记录入口不能兼得时，行高停在最小高度，页面自然滚动：吸顶的月份导航与状态行留在顶栏下，记录入口滚动可达。完整密度不合并、不省农历，放不下就滚动。于是 390×844 与 375×667 上清爽密度的 6 行月份（可合并时）记录入口仍在首屏，完整密度的 6 行月份改为滚动。账本里的尺寸都是 `pages/index/index.wxss` 的实际槽位，`tests/narrow-screen-geometry.test.js` 与 `tests/calendar-micro-labels.test.js` 逐项核对。首次加载用日历骨架（`skeletonPulse`，减弱动效下静止），不用转圈。日历密度偏好（`calendarDensity` 存储键）的切换入口在设置页「日历显示」分组里，分段控件直接放在分组卡中，不再套一层内卡；首页 `onShow` 重读即刻生效；密度选中态保持玫瑰描边弱态，不用实色填充。记录入口按钮最小高 104rpx。进行中经期的「经期第 N 天 · 记结束」一行放不下，只在空格处折成两行（`word-break: keep-all`，不拆开「记结束」）；两行用 `--line-height-title`，按钮上下内边距 14rpx，两行仍在最小高里，按钮不变高（issue #159）。结构序、状态文案与行高账本由 `tests/index-page.test.js`、`tests/cycle-prediction.test.js`、`tests/narrow-screen-geometry.test.js` 钉住。日历日弹层对晚于今天的日期不提供记录动作（动作集合为空，记经期、补记经期、记欢乐时光、补记欢乐时光都没有），处理器遇到未来日期也不导航。弹层不因此只剩标题和关闭键：日历投影给每个未来日期一条持久说明 `futureNotice`（「未来日期不能新增记录」「到了这一天，再来记经期或欢乐时光」），排在预测、节日和调休句之后，沿用「当天无记录」的虚线空态块（issue #152）。编辑页日期上限与保存校验仍是最后防线。
- 窄屏几何与安全区（issue #56）：所有带显式 `width` 与水平内边距的卡片/表单容器一律 `box-sizing: border-box`，宽度与内边距不得叠加出横向溢出（全 WXSS 护栏，含 `app.wxss`）。安全区运行时策略只有一套（`utils/safeArea.js`）：顶部 `--safe-top` 走状态栏高度、底部 `--safe-bottom` 走 `screenHeight − safeArea.bottom`，均由页面根节点内联注入；底部插入在无手势区设备上为 0，不制造无意义底部空白。共享顶栏：七个页面共用一个固定顶栏，高度等于状态栏高度加上由微信胶囊矩形推出的导航高度，右侧用 `--capsule-right` 预留胶囊宽度，顶栏固定定位，页面内容用同一个 `--nav-bar-height` 下移，起点不高于顶栏底边。胶囊矩形和顶、底安全区共用 `utils/safeArea.js` 这一个运行时出口，拿不到胶囊矩形时有兜底。编辑页的返回键在顶栏里。首页顶栏左侧是工具入口，其他页左侧留空。底部落点：非 tab 页 `.content` 的 padding-bottom 与底部 sheet 的 padding-bottom = 基础值 + `var(--safe-bottom, env(safe-area-inset-bottom, 0px))`；tab 页内容由原生 tabBar 吸收底部插入，不重复加。底部 sheet 滚动边界 = `max-height` 82–86vh + `overflow-y: auto`，遮罩不做 `overflow` 裁切。日历触控目标按「高度 ≥44px」执行（compact 104rpx ≈ 44.4px@320px、full 160rpx ≈ 68.3px@320px）；320px 下七列宽 ≈42.5px 是物理上限（7×44px 放不进 320px），列整宽平铺、无水平 margin、互不重叠，不以缩小日期/农历/标记吸收。周头与日历网格左右各留 10rpx，最左列和最右列的内容不贴网格边框；色带横向铺满各自的格子，日期上下留出留白，不因这道内边距改形状。回归由 `tests/narrow-screen-geometry.test.js` 钉住。
- 阴影登记（下文「Shadow / overlay 登记」段）实行区间登记制：同族同色阴影的透明度落在登记区间内即合规，区间内免逐值登记；区间外透明度或登记表外颜色由 `tests/design-token-guardrail.test.js` 的阴影注册表护栏拒绝。
- 交互语义（issue #57）：每个可点控件（bindtap/catchtap，sheet 的 `catchtap="noop"` 泄泡盾除外）都带 `aria-role` 与可读 `aria-label`；弹层遮罩本身是「关闭」操作，按用途命名（关闭月份选择/当日操作/工具菜单/日历图例/预测说明/本月小结/使用说明）。选中态用 `aria-checked` 表达并与 `active` 类同条件绑定（单选组如经期状态、密度、月份格、绑定 tab 用 `radio`，可多选或可再点取消的经量/症状 chip 用 `checkbox`）；禁用与加载态用 `aria-disabled` 表达并与 `disabled`/`loading` 类同条件。可看的月份是 2001 年 1 月到 2035 年 12 月，与选月的年份范围是同一对常量（issue #159）：到了一端，那一侧的月份箭头禁用，透明度 0.35，按下不缩放、不着色，`aria-disabled` 与 `disabled` 同条件；点按和滑动都不翻月，也不提示。picker 与输入框带 `aria-label`。首屏加载指示（`.loading-spinner`）带可读 `aria-label`；同步状态胶囊（`.sync-pill`）为 `status` 角色、朗读名与 `syncStatusText` 同源，同步状态变化即可朗读（issue #106）。日历格保持 `aria-label="{{item.ariaLabel}}"` 领域朗读（日期+经期/欢乐时光/预测/节日/调休）与 `aria-hidden="{{item.isEmpty}}"` 空白格隐藏，角色为 button；语义文案唯一来源仍是 `utils/homeCalendarState.js`。弹层读屏模态（issue #155）：首页六个底部弹层与设置「使用说明」用同一套表达。面板本体不写 `aria-role`，只有读屏名，是弹层用途（月份选择、当日操作、工具菜单、日历图例/预测说明/本月小结、使用说明；信息弹层随当前内容取 `infoSheetName`），遮罩读「关闭」加同一名称。模态上下文由遮罩名、面板名和被隐藏的背景三者给出，不靠角色。宿主里只有遮罩和面板，读屏顺序固定为遮罩 → 面板名 → 标题行（标题、副标题、「关闭」）→ 面板内控件。任一弹层处于 open 或 leaving（含交接）时，页面根下的背景块（顶栏、未绑定/加载失败、骨架、内容）`aria-hidden` 与 `page-obscured` 同一状态，最后一个弹层卸载的同一次更新里恢复；弹层宿主直接挂在页面根下，不在被隐藏的块里。平台边界以微信 aria-component 文档为准（https://developers.weixin.qq.com/miniprogram/dev/component/aria-component.html）：基础库 2.7.1 起只支持部分 ARIA 标签；可设的 `aria-role` 参照 MDN「Widget Roles」，部分 role 在移动端可能无效，dialog 不在其中，所以面板不写这个角色；文档列出 `aria-modal` 却没说行为，不写，背景隔离只靠 `aria-hidden`。微信没有把读屏焦点移到某个 view 的接口（`wx.checkIsOpenAccessibility` 只回答读屏是否开启），关闭后焦点落点由系统决定，不保证回到触发器；能保证的是背景按原文档顺序恢复，触发器名称和位置不变，从工具菜单交接出的图例/预测说明/本月小结，原触发器是顶栏最前的「工具」。属性写对不等于读屏可用，VoiceOver/TalkBack 实听结果以验证记录为准。护栏：`tests/interaction-semantics.test.js`、`tests/index-page.test.js`、`tests/settings-flow.test.js`。
- 次级可点入口对比度（issue #57）：可点击箭头（`.menu-arrow`、`.form-picker-arrow`、列表/入口/弹层箭头）与次要操作（重试空态、绑定页房间码、危险按钮）的文字色不弱于 `--text-secondary`，在各自实际表面（卡片/表单/sheet 合成底）上 ≥4.5:1——基准即未选中 tab `#7A7C8C` 在画布 `#0A0E27` 上的 4.5:1；输入占位符用 `--text-placeholder`（`rgba(255,255,255,0.6)`，与 `--text-secondary` 同档，不弱于它；issue #144），`.input-placeholder` 的字号走 `--font-size-input`。`--text-tertiary`（0.35 白）不再用于占位符，也不再用于任何可点入口。护栏：`tests/secondary-affordance-contrast.test.js`、`tests/typography-hierarchy.test.js`。
- 展开/收起文字入口（issue #109，「记录」tab 欢乐时光月份卡头）：切换入口用文字「展开」/「收起」，不用字形——「›」已用于列表行「点开编辑」（`.item-arrow`/`.memory-arrow`），「⌄」已用于首页选月 caret（`.month-title-caret`），不重复占用；文字自述点按后果。卡头按 button 朗读，`aria-expanded` 与展开状态同条件，读屏名「YYYY年M月，N 条欢乐时光，已展开/已收起」；收起且该月有备注时，在状态前加上该月第一条备注的单行摘要（从新到旧，跳过空白备注；整月没有备注则不追加）。摘要显示在卡头标题下方，单行，超出截断，展开时不重复渲染，可见文字 `aria-hidden`，读屏只走卡头名。点按即时切换、无过渡动画（不进动效注册表，开启减弱动效时无差别）。文字走 caption 角色（26rpx）+ `var(--text-secondary)`，在月份卡（`.premium-card`）表面 ≥4.5:1，护栏 `tests/secondary-affordance-contrast.test.js`（CASES 登记）；320px 单行账本由 `tests/narrow-screen-geometry.test.js` 钉住。这是应用里第一个展开/收起交互，本条即先例。
- 动效与性能边界（issue #58）：缓动只有 `--ease-out`（`cubic-bezier(0.16,1,0.3,1)`）与标准关键字（ease/ease-in-out/linear 等）；bounce/elastic 式 overshoot 曲线（cubic-bezier 的 y 参数超出 0–1）与 `--ease-spring` / `--transition-spring` token 已退役，bind 页 `bounceIn` 回弹入场同步改为无回弹的 `heroIn`，禁止同类曲线以任何命名回归。一次性时长只有六档 app 级 token（issue #111；第六档由 issue #165 加入）：`--duration-press` 160ms（可点控件按压的四路：缩放、底色、描边与柔光层透明度，见「按压的四路」；阴影本身不进过渡）、`--duration-state` 200ms（选中、颜色、描边、焦点边框，后台刷新时日历变暗，以及当日详情的淡入 `dayDetailFade`）、`--duration-enter` 240ms（整页淡入 `pageEnter`、弹层遮罩淡入、弹层内容块进场、同步胶囊入场、翻月滑入、绑定页显现 `bindReveal`）、`--duration-exit` 200ms（弹层面板、内容块与同步胶囊离场，遮罩淡出）、`--duration-sheet` 280ms（弹层面板升起）、`--duration-emphasis` 600ms（今天与「预」的一次性光晕，亮起再落回；记录成功的 ♥ 与色带、建好房间时绑定页 ♥ 的漾开，issue #167）。延迟只有一档 `--delay-stagger` 40ms，只给弹层内容块进场错相用（issue #166，见下文「弹层标题与内容错相」），别的 transition 不写延迟；时长、曲线和延迟都只写在 `transition` 简写里，不写长写。一次性关键帧动画的延迟也只有一档 `--delay-return` 300ms，只给记录成功反馈等返回转场走完（issue #167，见下文「记录成功反馈」），别的一次性动画不写延迟，延迟同样只写在 `animation` 简写里。按压只属于可点控件，容器和不可点的行不缩放、不变底色（issue #113，取代 issue #81 的逐页豁免）。微信里每个可点控件（`bindtap`/`catchtap`，`catchtap="noop"` 除外）都带 `hover-class`，并且和对应的 `:active` 写在同一条规则里，开发者工具才会画出按压（issue #122，issue #145）。类名重复控件自己的类，例如月份箭头 `nav-btn-hover`，危险行 `danger-hover`，危险按钮 `btn-danger-hover`，返回键 `nav-back-hover`。按压着色落在可以过渡的 `background-color` 上（海军实底之上的平涂层），时长仍是 `--duration-press`，不写进 `background-image`。方向仍是 issue #122 的海军实底上平涂着色。`:active` 规则保留。位移、缩放、入场、离场用 `var(--ease-out)`；只变颜色或底色用 `ease`；导航头光斑 `float` 的来回漂移用 `ease-in-out`（周期仍是 8s 与 6s）。除 `--ease-out` 定义外不写 cubic-bezier。组合变量 `--transition` 已退役。常驻动画周期、减弱动效替代和 `heroIn` 0.6s 仍用字面时长。持续动画（`infinite`）只在下文「常驻动画注册表」登记，逐项写挂在哪、用途、节奏、弹层遮挡与页面不可见时的行为和减弱动效替代；新增或删除持续动画时同步那张表与测试注册表。播一次的关键帧动画登记在「一次性动效注册表」，逐项写挂在哪、用途与触发、时长与曲线、中断与取消、弹层遮挡与页面不可见时的行为和减弱动效替代，同样与测试注册表同步（issue #165）。周期只写在 `animation` 简写里，不写 `animation-duration` 长写；错开起点用负延迟。玻璃 blur：哪些面模糊见上文「玻璃叠层」的登记；单面 ≤20px，全屏遮罩 ≤8px（两个弹层遮罩都是 frontmatter `modal-overlay` 登记的 8px，88% 海军底上更大的 blur 看不出差别）。按文件的玻璃面数量棘轮已退役（issue #163）。阴影：颜色与透明度由上文阴影注册表管；按文件的 `box-shadow` 声明数棘轮同样退役（issue #163）。`@media (prefers-reduced-motion: reduce)` 政策：去掉位移、缩放、旋转的过渡与动画以及装饰动画（位置和大小直接落到终态），状态反馈走无位移通道——加载=透明度脉冲（不静默）、同步中=玫瑰点静态色、骨架=静态哑光占位块、按压=即时 scale + 既有底色变化、弹层=进出立即到位、88% 海军遮罩保留层级（issue #116）、日历切换=即时替换（翻月滑入为 none，月份标题文案变化承载状态）、今天与「预」的光晕照常（只动透明度，是温和的反馈）、记录成功的 ♥ 只淡入不缩放、色带照常淡入（issue #167）、建好房间时绑定页 ♥ 不漾开、已绑定卡直接出现（issue #167）。滑动翻月（issue #137）：日历区域用 WXS 判定，与弹层拖动同一种模式；水平位移超过 48px 且大于竖直位移才翻月，否则留给轻点和竖向滚动；不跟手，松手后一次页面更新完成，和箭头翻月同一段滑入（见下条「翻月滑入与日历状态强调」）；减弱动效下即时替换。日期格不做颜色过渡。两个编辑页的边框/背景过渡由页面级 reduced-motion 块即时切换，无渐进（issue #106）。护栏：`tests/motion-performance.test.js`。
- 翻月滑入与日历状态强调（issue #165）：这一条取代 issue #137 的翻月无动画规则。箭头、滑动、选月和回到今天都在同一次页面更新里换上月份标题和那个月的格子，不在渲染回调里补排格子（原来选月和回到今天先画出新标题，下一帧才换格子）。翻月时格子从翻月方向滑入：下一月从右、上一月从左，位移 10rpx（等于网格左右内边距，内容不出卡片、不用裁切），透明度 0.5 → 1，时长 `--duration-enter`，曲线 `--ease-out`。动的是格子外一层没有盒子的 `.calendar-days`（无内外边距、无描边、不定宽高），卡片、周头和月份标题不动，日期格仍只有自己的按压缩放；整日点按范围和几何账本不变，到了可看月份的两端照旧什么都不发。方向记号 `calendarFlip`（`next-a`、`next-b`、`prev-a`、`prev-b`）跟着那次日历提交走，不用计时器，数据和操作都不等动画：滑入进行中（240ms 内）同方向再翻，只换数据，进行中的滑入接着播，不续期；反向就换成另一方向从头播；播完后再翻，a、b 交替从头播（类名变了 CSS 才会重播）；选月、回到今天和未绑定或加载失败画面取消滑入，新月份即时替换。状态强调只有两处，各有明确的触发：回到今天（首页按钮或选月面板）时，今天的日期胶囊位置亮起一圈更亮、更粗的薰衣草描边（4rpx，`rgba(196,160,210,0.95)`）再落回；关掉开着的预测说明时，当月的「预」在描边处亮一圈金再落回（当月没有「预」就不亮，图例、本月小结和离场途中的重复关闭不触发）。光晕是伪元素上的描边（「预」另有一层淡金底），不是阴影，只动透明度：0 → 1 → 0，`--duration-emphasis` 600ms，播一次，不循环。记号 `calendarEmphasis`（`today-a`、`today-b`、`predict-a`、`predict-b`）只跟着触发它的那次提交，之后任何一次日历更新（翻月、选月、记录变化、刷新）或未绑定和加载失败画面都去掉它，换月和节点重建不会重播。光晕只在记号作用域下存在，静止的日历一点不变；经期今天没有胶囊，光晕同样围住日期、叠在色带上；重叠日（经期里不画「预」）和各个标记的含义不变。光晕峰值时被围住的标记照样读得清：今天的光晕不铺底（日期就在框里，原来再叠 30% 玫瑰底，峰值时玫瑰日期只剩约 3:1），描边向内画在框边、不压数字，日期在胶囊、调休格和色带上的峰值都 ≥4.5:1；「预」的淡金底叠满时仍 ≥4.5:1（`tests/contrast-guardrail.test.js`，描边内沿离字形由 `tests/calendar-micro-labels.test.js` 钉住）。减弱动效下翻月即时替换，光晕照常。两种动画逐项登记在「一次性动效注册表」。护栏：`tests/index-page.test.js`、`tests/motion-performance.test.js`。
- 记录成功反馈（issue #167）：只回应真正存下的新增或完成。触发点是首页的记录回流：编辑页只在云端确认写入后通知前一页（含写入超时后回读确认已存），带的是保存后的那条记录，所以反馈的日期和色带就是同步后日历上的样子。新增欢乐时光：那一天的 ♥ 从 0.6 倍淡入长到原大（`recordBloom`）。新增经期，或给没有结束日的经期（进行中、结束日期不详）填上结束日（ADR 0007：填写结束日期完成同一条记录）：这段经期在当月投影出的每一格色带一起淡入（`recordAppear`），跨行的各段同时到位，连续段不断开；别的经期不动。不亮的：改写已有记录（含改日期）、合并到已有进行中、进行中改成结束日期不详（色带缩回开始日，不是出现）、删除、校验失败、写入失败、回读确认没存上、取消、草稿恢复（都不通知）、后台刷新和下拉刷新、从「记录」tab 进编辑页（首页收不到通知，之后刷新出来的记录不亮），以及日历还没显示时收到的通知；记录落在别的月份时当月没有可亮的。时序：通知到达时首页正被编辑页盖着，反馈类在 `page-hidden` 下按住不开始（♥ 和色带透明）；编辑页按原来的 1000ms 返回，`onShow` 去掉 `page-hidden` 后先等 `--delay-return` 300ms 让返回转场走完，再用 `--duration-emphasis` 600ms、`--ease-out` 播一次，反馈不拖慢返回、不拦点按、不改读屏名。记号是页面数据 `recordFeedback`（日期 → memory / period），挂在 `.calendar-days` 的日期格上（`record-feedback-memory`、`record-feedback-period`），图例和记录入口的样本不受影响；它只跟着那次记录变化的日历提交：再保存一次换成新的那条，不叠加；之后任何一次日历更新（翻月、选月、回到今天、带来记录变化的刷新、别的记录变化）或未绑定、加载失败画面都去掉它，翻回来不重播；确认这次保存、没有变化的刷新不打断它。首页隐藏时先收掉反馈再挂 `page-hidden`，离场途中 ♥ 和色带不消失，下次回来不重播。不用计时器。减弱动效下 ♥ 只淡入不缩放，色带照常淡入（都只动透明度）。两段动画登记在「一次性动效注册表」。护栏：`tests/index-page.test.js`、`tests/record-flow.test.js`、`tests/interaction-semantics.test.js`、`tests/motion-performance.test.js`。
- 首页底部弹层进出（issue #116）：选择月份、当日操作、工具菜单、图例/预测说明/本月小结共用同一生命周期，页面数据状态为 closed、open、leaving，再回到 closed。进场先以关闭姿态挂载，下一次渲染加上打开姿态，由 CSS transition 完成，不用入场关键帧，因此中途可以反向。离场计时 `--duration-exit`（200ms）到点卸载，不依赖 transitionend。离场途中再次打开会取消卸载并回到 open，过渡从当前位置返回。面板用 `translateY(100%)` 落到屏幕外（含自身高度与底部留白，不写死像素）：进场 `var(--duration-sheet)` 与 `var(--ease-out)`，离场 `var(--duration-exit)` 与 `var(--ease-out)`。遮罩透明度进场 `var(--duration-enter)`，离场 `var(--duration-exit)`。遮罩和面板是兄弟节点（issue #134）：遮罩单独作为关闭控件朗读，面板内控件各自可达。离场时遮罩和面板都是 `pointer-events: none`，不拦截点按。减弱动效下这些过渡为 none，画面立即到位，元素仍等到计时结束再卸载。原生 tabBar 在弹层处于 open 或 leaving 时隐藏，离场卸载后恢复；减弱动效下这次隐藏和恢复不播放动画。tabBar 的显隐是整个小程序共用的状态，弹层开着时页面被卸载（reLaunch、redirectTo、热启动换路径）不经过离场，所以首页、记录、设置三个 tab 页每次显示时，本页没有弹层盖着就立即交还 tabBar，不播动画（`restoreTabBarOnShow`）。系统返回由页面容器拦截，先走这条离场，不离开页面。把手和标题行可以拖动（issue #119）：竖直移动超过 10px 才开始，拖动开始后再落下的手指忽略；跟手在 WXS 里直接设置面板 transform，不逐帧 setData。向下 1:1，向上越过停放位置时位移 = 越界量 × 面板高度 × 0.55 /（面板高度 + 0.55 × |越界量|）。松手把位移、耗时和面板高度交给页面：向下位移超过面板高度的 25%，或向下速度（位移 / 耗时）超过 0.11 px/ms，走同一条离场，从当前拖动位置过渡到屏幕底边外；否则清掉内联位移，面板用 `var(--duration-exit)` 与 `var(--ease-out)` 回到原位。向上拖不关闭。可滚动的内容不是拖动区。减弱动效下跟手仍在，松手后的关闭或复位立即完成。遮罩 88% 海军与 z-index 层级保持不变。
- 设置「使用说明」弹层（issue #154）：与首页底部弹层共用同一生命周期出口（`utils/sheetLifecycle.js`）和同一组进出参数：closed、open、leaving 再回到 closed，先以关闭姿态挂载、下一次渲染打开，中途可以反向，离场 `--duration-exit` 到点卸载，离场途中再次打开取消卸载。面板 `translateY(100%)` 升降、遮罩只动透明度，时长与曲线同上条；离场时遮罩和面板都不拦截点按。标题行右侧是可见关闭键 `.sheet-close`（88rpx 圆钮「×」，读屏名「关闭」，按压 `scale(0.96)`，与首页弹层同款）；遮罩仍是面板的兄弟节点，单独朗读为「关闭使用说明」，按压着色同首页落在 `::after` 平涂层。原生 tabBar 在帮助处于 open 或 leaving 时隐藏，卸载后恢复；系统返回由页面容器拦截，先关帮助，不离开设置页。减弱动效下这些过渡为 none，tabBar 的隐藏与恢复不播动画，设置页有自己的 `.reduced-motion-probe`。面板滚动边界 `max-height: 86vh` + `overflow-y: auto`，内容变长时关闭键仍在屏内。帮助没有把手、不能拖动关闭；遮罩和首页弹层遮罩同一种材质：88% 海军加 `blur(8px)`（issue #163）。
- 弹层标题与内容错相（issue #166）：首页四个底部弹层和设置「使用说明」的面板分两层。上层是标题行（首页是把手加标题行，也就是拖动区 `.sheet-drag-zone`；设置是 `.help-head`），标题、副标题和关闭键 `.sheet-close` 都在这里，随面板一起升降，自己不另动。下层是唯一的内容块 `.sheet-body`，面板其余内容都在里面：收起姿态透明、低 `16rpx`；打开时先等 `--delay-stagger`（40ms），再用 `var(--duration-enter)` 与 `var(--ease-out)` 到位，40 + 240 正好是面板的 280ms，内容和面板同时落定；离场不等，用 `var(--duration-exit)` 和面板一起走。全是 transition，不用子项关键帧，中途再打开、关闭、反向都从当前帧接着走；拖动时内联位移只写在面板容器上，拖动后关闭或复位都不碰内容块。错相只动透明度和位移，不拦点按、不改显隐和高度：标题、关闭和内容里的主要操作从第一帧起就能点，读屏顺序仍是标题、关闭、内容。交接时遮罩已经不透明，内容照样从面板升起时算起晚一拍。减弱动效下内容块和面板一样立即到位。内容块的规则只写在 `app.wxss`「弹层内容块」一处，两处弹层共用，页面不再各写一份。护栏：`tests/motion-performance.test.js`、`tests/interaction-semantics.test.js`。
- 弹层遮挡和页面不可见时暂停常驻装饰（issue #118；issue #163 扩到设置页和页面不可见）：首页任一弹层或设置「使用说明」处于 `open` 或 `leaving` 时，页面根节点带 `page-obscured`；页面不可见时（`onHide` 到下一次 `onShow`：切走 tab、被编辑页盖住、小程序进后台）带 `page-hidden`：页面用 `utils/pageVisibility.js` 的 `withPageVisibility` 注册（显示时先去掉标记，隐藏时页面自己的收尾做完才挂上），只在状态变化时写一次，各页只剩根节点上的 class 绑定。两种标记下，「常驻动画注册表」里的装饰性动画（三个极光色团、顶栏两个光斑、未绑定的心）为 `animation-play-state: paused`（色团写三团共有的 `.aurora-bloom`，减弱动效名单同样）；标记去掉后从暂停的那一帧继续，动画名称和周期不变。暂停规则全仓只有 `app.wxss` 一条。减弱动效仍把它们设为 `animation: none`，暂停规则不取代这条。兼容路由 `pages/memory/memory` 在 `onShow` 里立即 switchTab 关掉，没有被隐藏这一态，不挂 `page-hidden`。月份导航、周头、日历网格与月份箭头叠在 0.92 回退实色上，不写 backdrop-filter（理由见「玻璃叠层」）。
- 弹层之间的交接（issue #117）：从工具菜单打开图例、预测说明或本月小结时，同一次页面更新直接卸下菜单（不进入 leaving，不播离场），信息弹层带着交接标记 `sheet-handoff` 挂载。这个标记让遮罩在挂载时就是完全不透明（`opacity: 1`，`transition: none`），不走遮罩淡入；面板仍从底边 `translateY(100%)` 升到 0，时长与曲线沿用 `--duration-sheet` 与 `--ease-out`。交接这一拍遮罩已经盖住页面，`page-obscured` 保持，装饰不在这一帧恢复播放。之后关闭信息弹层先去掉交接标记，再走普通离场。直接打开预测说明（状态行）没有交接标记，遮罩仍按进场淡入。有记录的日子直接打开详情，不带 `day-detail-fade`。从动作列表切进详情时，新内容带 `day-detail-fade`，只动透明度：`dayDetailFade` 从 0 到 1，时长 `var(--duration-state)`，曲线 `var(--ease-out)`。面板高度不参与过渡。减弱动效下这段动画为 none，内容直接显示。
- 一次性配对欢迎条（issue #149）：加入房间后首页给一次「已和 TA 连上……」说明（`.partner-welcome`），放在吸顶占位之后、周头之前的正常文档流里，固定的月份导航和状态行盖不住它。它两行 caption 的盒高 103.2rpx（上下外边距 8 + 12，正文行高 1.6）作为 `computeCalendarRowHeight` 的 `showPartnerWelcome` 输入计入行高，行高仍守 44px 下限。只有日历可显示、且欢迎条经 `setData` 渲染回调确认已提交后才记为看过；骨架屏、加载失败或未绑定画面时保持待显示。欢迎条只陪第一次显示它的那次停留：同一次停留里翻月、刷新都留着；首页隐藏（切 tab、进编辑页）时，已记为看过的欢迎条收起，再回到首页不再出现，行高同时去掉它的 103.2rpx。收起发生在画面不可见时，回来时没有跳动。护栏：`tests/narrow-screen-geometry.test.js`、`tests/index-page.test.js`。
- 首页同步胶囊进出（issue #120）：什么时候显示、隐藏、切换文案，以及 1600ms 自动隐藏，都不变。胶囊住在首页顶栏的标题槽里（工具钮与微信胶囊占位之间，按文案收缩、居中），挂载期间（含进场和离场）替换应用标题，卸载后标题回来；顶栏在吸顶区之上，所以胶囊盖不住月份标题和状态行。每条胶囊文案在 320px 宽的标题槽里单行完整显示，由 `tests/narrow-screen-geometry.test.js` 逐条核对。胶囊复用弹层出场生命周期，页面数据状态为 closed、open、leaving，再回到 closed；`syncStatusMounted` 为 false 即卸载。进场先以隐藏姿态挂载（透明度 0、`translateY(-8rpx)`），下一次渲染进入显示（透明度 1、`translateY(0)`），由 CSS transition 完成，不用入场关键帧，因此中途可以反向。离场是反向，时长 `var(--duration-exit)`，计时到点卸载，不依赖 transitionend。离场途中又有新的同步状态会取消卸载并回到 open，过渡从当前位置返回。进场时长 `var(--duration-enter)`，进出曲线都是 `var(--ease-out)`。`status` 角色和朗读名仍与 `syncStatusText` 同源。减弱动效下这些过渡为 none，画面立即到位，元素仍等到计时结束再卸载。同步中圆点 `syncDotPulse` 保持不变。
- 首页同步失败恢复（issue #79、#151）：同步胶囊只表达状态（`status` 角色、`pointer-events: none`），不加点按。已加载后整页刷新失败，或只有经期／欢乐时光一个集合同步失败时，月份导航与周头之间留驻同一条行内重试（`.refresh-retry`，button 角色，点按走后台刷新）。可见文案与朗读名指出失败范围：「刷新失败，点按重试」（朗读「日历刷新失败，点按重试」）、「经期同步失败，点按重试」、「欢乐时光同步失败，点按重试」。重试进行中和再次失败都不撤下这一行，也不自动隐藏；两个集合都同步成功才消失。只有一个集合失败时，胶囊不重复失败范围，只说日历现在显示什么：首次加载「已显示欢乐时光」或「已显示经期数据」，后台刷新「已保留旧经期数据」或「已保留上次的欢乐时光」。失败范围只在一处判定，重试行和胶囊从同一张文案表取字。护栏：`tests/index-page.test.js`。
- `tabBar.borderStyle` 为 `white`（浅色发丝）。不要改成 `black`。未选中 `tabBar.color` 为 `#7A7C8C`：弱于选中玫瑰 `#E8909E`，在画布 `#0A0E27` 上达到 4.5:1。「记录」tab 的两态图标是列表形（`images/list.png` / `images/list_active.png`，issue #159）：三行圆点加横线，81×81，线宽与日历图标描边同档，实色像素分别正好是 `#7A7C8C` 与 `#E8909E`。不用铅笔，也不用医疗十字。护栏 `tests/tab-icons.test.js`。
- 极光（issue #163，取代 issue #146 的整页 `auroraPulse` 缩放）：画布底为 `#0A0E27`，`page` 没有 `auroraFlow`。`.page::before` 是一层静止基底，四边为 0、正好铺满视口，只画海军 → 深蓝 → 深梅的纵向过渡，不动也不缩放。动感来自每个页面根下第一层的 `.aurora`（`aria-hidden="true"`，固定在视口，`overflow: hidden`；标记只写在 `pages/shared/aurora.wxml` 一处，各页面在顶栏之前 `include` 它）里三个有边界的色团：蓝紫 `.aurora-bloom-violet` 压在下半屏（中心 `rgba(45,27,105,0.75)`），玫瑰 `.aurora-bloom-rose` 在左上（0.14），薰衣草 `.aurora-bloom-lavender` 在右侧中段（0.11）。色团用 `closest-side` 径向渐变在自己的盒内淡到 0，没有硬边。每个色团只有一层动画，只动位移、0.94–1.08 的轻微缩放和透明度，周期 12s、10s、8s 往返，负延迟错开起点，三团的相位一直错开，整页不再同步缩放。基底、色团容器和色团都是 `pointer-events: none`；固定层不随滚动走，滚动时不出现色带分层。色团只取蓝紫、玫瑰和薰衣草，柔金不进背景。首页原来的两个光球（`.glow-orb`、`orbFloat`）并入这三个色团后退役：它们挂在文档流里，一个被顶栏盖住，一个只在页底露出，边缘还是硬的。
- 各页 0.62–0.94 信息文本透明度是逐元素调校，不要机械归并。承载操作后果、记录内容或关键说明的辅助文字不弱于 `--text-secondary` 档，并在实际合成表面上 ≥4.5:1（issue #158）：记录 tab 周期概览的标签（`.card-label`、`.cycle-label`；卡面是玫瑰 → 薰衣草渐变叠在玻璃回退上，画布、玻璃回退和渐变两端都要过线）、列表行的作者与备注（`.item-note`、`.memory-note`）、收起月份卡的备注摘要（`.month-excerpt`）、空态引导与加载失败标题（`.empty-state`），经期编辑页的状态后果、天数与时长确认（`.form-hint`），两个编辑页的字段名（`.form-label`，与字段说明同样直接引用 `--text-secondary`，issue #164），首页提醒说明（`.reminder-text`）与未绑定/加载失败说明（`.no-room-desc`）。只给芯片分组的症状分组标题（`.symptom-group-label`）不在此列，保留更安静的一档，仍 ≥4.5:1。护栏 `tests/contrast-guardrail.test.js`。实际合成表面从内容下面的背景算起（issue #163）：背景有两处，画布 `#0A0E27` 和极光最亮处（基底最亮的色标叠满三个色团，保守上界，`tests/contrast.js` 的 `auroraPeakHex`），两处都要过线。直接压在背景上的文字（配对欢迎条、本月小结行、未绑定标题与说明、设置分组标题、绑定页大标题与说明）在极光最亮处仍 ≥4.5:1。原来只铺 5%–10% 淡白或淡红的行会透出极光，玫瑰字、警示红字和次要说明在那里掉到 4.5:1 以下，所以首页提醒行（`.reminder-card`）、刷新重试行（`.refresh-retry`）、记录 tab 分段控件（`.segment-control`）与两段共用的刷新失败重试行（`.list-retry`，原来按下才铺 5% 淡白，说明文字在极光最亮处只剩约 4.25:1，issue #166 收口）、绑定页错误条（`.error-msg`）与重试（`.error-retry`）都叠在 `var(--glass-fallback)` 上，淡白或淡红只是上面的平涂层：可按压的行把平涂层放在 `::before` 的 `background-color` 上，按压加深这一层，按下时文字同样 ≥4.5:1；平涂层的结构（铺满、跟宿主同一个圆角、垫在内容下面、不拦点按、底色随按压同一拍、减弱动效即时）只写在 `app.wxss`「平涂层」一处，各页只写平涂色和按下的颜色（`tests/motion-performance.test.js`）；不可按的面写成 `linear-gradient(<淡色>, <淡色>), var(--glass-fallback)`。月份选择 caret（`.month-title-caret`）和月份标题同为玫瑰 `#E8909E`：按吸顶区 → 月份导航 → 触发钮的实际合成面算，原来的 85% 玫瑰只有约 4.2:1。护栏 `tests/contrast-guardrail.test.js`、`tests/secondary-affordance-contrast.test.js`。
- 可点控件的交互态只描述 Default 与 Pressed，没有 hover 和 focus 态；禁用与加载中是惰性变体，按下什么都不变（见下条「按压的四路」）。Pressed 用 `:active` `scale(0.94–0.98)`；主按钮 `.btn-premium` 为 `0.96`。
- 按压的四路（issue #166）：按下时缩放、底色、描边、柔光一起变，都走 `--duration-press`（缩放用 `var(--ease-out)`，其余用 `ease`），松手按同一拍回来，没有哪一路先跳到位。描边：底色铺在控件自己的 `background` 上时，描边带画在这层底色之上，跟着一起亮；底色落在 `::before` 平涂层上的控件，平涂层只铺内边距盒，盖不到描边带，所以按下时描边同色提亮、和平涂层一起亮——月份箭头 0.2 → 0.3，首页刷新重试与记录 tab 重试行 0.1 → 0.14，提醒行 0.12 → 0.17，危险按钮与危险菜单行红 0.28 → 0.4，绑定页重试红 0.24 → 0.32（返回键原本就是玫瑰 0.28 → 0.42）。按压柔光只属于玫瑰主按钮与复制键（`.btn-premium`、`.quick-btn`、`.copy-recap`、设置与绑定页的 `.copy-btn`），画在 `::before` 柔光层上：柔光层铺满按钮、用按钮同一个圆角（`border-radius: inherit`）、`pointer-events: none`，按下时透明度沉到 0.5，和缩放同一拍；主按钮、首页记录入口和本月小结复制键的柔光层结构只写在 `app.wxss`「柔光层」一处，各按钮只写光的大小，设置与绑定页的 `.copy-btn` 是另一份同款契约；按钮本身不带阴影，按压也不换 `box-shadow`（阴影不能过渡，透明度可以）。返回键按下只换描边和底色，投影不换、随按钮一起缩；表单 picker 按下只换玫瑰描边，不加光晕。这两处原来按下时换 `box-shadow`：返回键收紧成 `0 4rpx 12rpx` 的海军投影并提亮内高光，经期与欢乐时光编辑页的日期 picker 加一圈 20px 的 10% 玫瑰光晕。#166 为了让按压各路同一拍走完去掉了它们：阴影不能过渡，按下时会先跳到位；返回键的缩放已经带着投影一起缩，picker 按下和输入框焦点同为玫瑰描边（issue #81）。epic 只说可以协调柔光，没有要求删，这两处的去留待维护者在 #166 认可；要恢复，就各加一层柔光层、按下时调透明度，不再换 `box-shadow`。原生分享按钮（`button.share-invite`）放开组件自带的 `overflow: hidden`，柔光层才不被裁掉；它的按压类是 `share-invite-hover`，柔光一样沉。选中态的静态玫瑰光（选月面板的当前月 `.jump-option.active`、经期编辑页选中的状态、经量和症状芯片）表示已选，不是按压柔光，按下不变（登记见「Shadow / overlay 登记」）。禁用与加载中的控件按下时四路都不动：不缩放、不换底色、不提亮描边、没有柔光；做法二选一，整块 `pointer-events: none`，或每一路都被 `:active.disabled` / `:active.loading` 钉回静止值。惰性变体一律用 `disabled` / `loading` 类表达，不写内联透明度：主按钮 0.55，危险按钮（删除中、不可删）0.5，月份箭头与选月年份步进 0.35，经期状态芯片与保存中的日期字段 0.5 且不接点按；日期 picker 被停用时，里面的字段同条件带 `disabled`，`aria-disabled` 写在 picker 本身。唯一例外：「记录」tab 欢乐时光卡头（issue #109）不写过渡，按压只有一层即时底色，没有第二路要对齐。减弱动效下四路都即时切换。护栏：`tests/motion-performance.test.js`；惰性变体由 `tests/interaction-semantics.test.js` 钉住。
- `calendar-cell` 与下文日历状态表对齐 `pages/index`。经期是只包住日期数字的 22% 玫瑰连续色带，不是实色整格选中底。今天只在日期数字外加一枚胶囊（`todayCapsule*`），不铺整格底、不描整格边；经期中的今天不另加胶囊，只在色带外缘描边（issue #162）。
- 日历微字 `.day-tag` / `.predict-mark` 字号为 `26rpx`（caption 量级）。节日是无底金字，调休「班」仍是低调小标签；`.day-tag` 与 `.day-tag-line` 盒高 `38rpx`（大于字号，覆盖 caption 行高），避免 CJK 被裁切。清爽密度的节日/调休标签走 `--font-size-calendar-micro`（24rpx，格内下限），盒高 34rpx，日期与标记仍都放得下，不再更小（几何账本 `CALENDAR_LEDGER.infoRowRpx.tagFont` 钉住）。

主填充按钮是玫瑰底 `#E8909E` + 画布海军字 `#0A0E27`，玫瑰填充一律写 `var(--aurora-pink)`（`.btn-premium`、`.copy-btn` 与首页的 `.quick-btn`、`.reminder-action`、`.jump-option.active`、`.copy-recap` 由 `tests/design-token-guardrail.test.js` 钉住单一来源，`tests/filled-cta-contrast.test.js` 钉住玫瑰底海军字 4.5:1 对比度）。全页面（含绑定页）同一套玫瑰主操作，无页面级例外。护栏为 deny-by-default：任何选择器的渐变填充（linear/radial/conic）与实色玫瑰字面量填充（`#E8909E` / `rgb(232,144,158)` / `rgba(232,144,158,1)`）都必须落在测试登记的装饰例外白名单内，新增主操作按钮写字面量玫瑰或渐变填充会被直接拒绝。同结构的复制键和选中块走同一对色。不要把白字叠玫瑰写成规范。记录 tab 进行中经期的时长胶囊（`.item-duration.ongoing`）也用这一对：画布海军字叠 92% 玫瑰底，合成在列表卡上后文字对比度 ≥4.5:1，由 `tests/contrast-guardrail.test.js` 钉住。主按钮（`.btn-premium`、`.quick-btn`、`.reminder-action`、`.copy-recap`）只有一种形状：`var(--radius-md)`。复制键和重试小按钮不是主按钮。分段控件（记录分类 `.segment-option`、设置密度 `.density-option`、绑定页创建/加入 `.tab`）只有一种选中态：玫瑰字 `#E8909E`、`rgba(232,144,158,0.08)` 底、`rgba(232,144,158,0.45)` 描边，不用实色玫瑰填充。

元数据金 `#D4A574` 只表示下次可能开始的日子（「预」）和节日文字，以及已登记的预测与确定性元数据（同步状态点、预测日期、详情里的预测与节日标题）。调休「班」不用金。当日详情里经期标签用玫瑰 `#E8909E`，欢乐时光标签用浅粉 `#F0C4C0`。实色金一律 `var(--aurora-gold)`。节日是无底金字：不铺整格金底，也不铺金底胶囊。预测说明正文不用金。玫瑰 → 金的 135deg 渐变曾是 CTA 误用形态，已随 issue #55 退役：`--gradient-gold` token 已从 `app.wxss` 删除，任何页面不得再引用（design-token 护栏强制）。玫瑰 → 薰衣草的 `--gradient-pink` 同样无屏上引用，已随 issue #59 一并退役；渐变填充不再以 token 形式提供。首页金色只允许落在白名单规则上（`.predict-mark`、「预」的强调光晕 `.calendar-days.calendar-emphasis-predict-a .predict-mark::after` 与 `-predict-b` 那一条（issue #165）、`.predict-date`、`.reminder-rail`、`.holiday-tag`、`.sync-dot`、`.detail-meaning.predict`、`.detail-meaning.holiday`、`.detail-meaning.predict .detail-meaning-title`、`.detail-meaning.holiday .detail-meaning-title`），由 `tests/design-token-guardrail.test.js` 的金语义白名单钉住。页面 WXSS 不得再出现 `#D4A574` 字面量。金的 rgba 只留给描边或辉光（「预」的描边与强调光晕、预测与节日详情描边、提醒 rail），不铺节日标签底。同步点没有光晕。

不安装、不覆盖成外部品牌设计系统。系统名仍是 Aurora Bloom。

## Overview

Aurora Bloom is a premium wellness dark theme for minmin-calendar — a period tracking and diary app. Rose tones on deep navy with soft glassmorphism surfaces and subtle aurora animations.

## Colors

Primary: warm rose #E8909E. Secondary: soft lavender #C4A0D2. Accent: warm gold #D4A574.
BG: deep navy #0A0E27 canvas. #12163D is the surface hue: glass surfaces sit on it at 92% (`--glass-fallback`), the home sheet panels at 94–96%. #1A0A2E (deep plum) only closes the still aurora base below. Canvas navy is also the primary-fill label color.
Warning red: #F97373 — 唯一警示色，语义与形态见下文「警示红语义」。
成功/完成态（如绑定成功 `.bound-status`）用主色玫瑰 #E8909E 表达；色板不引入绿色。全部 WXSS 的 hex 颜色必须落在本文件登记的色板内，由 `tests/design-token-guardrail.test.js` 护栏。
Aurora base (`.page::before`, still): `linear-gradient(168deg, #0A0E27 0%, #0A0E27 28%, #12163D 62%, #1A0A2E 100%)`. The violet bloom's centre colour #2D1B69 is registered as `--aurora-bg3`; the rose and lavender blooms reuse the primary and secondary hues. 月份导航卡里另有一层静止的玫瑰径向淡光（`.month-nav::before`，中心 10%，被卡片的 `overflow: hidden` 裁在卡内），是玻璃面的微渐变，不动，也不是辉光。
Shadow / overlay 登记：卡片与日历网格投影 `rgba(0,0,0,0.2)`；浮层小投影 `rgba(0,0,0,0.12–0.15)`；首页底部 sheet 上缘投影 `rgba(0,0,0,0.34)`；海军近景投影与字阴影 `rgba(10,14,39,0.16–0.35)`（自定义导航返回键的底和字形）；sheet 遮罩 `rgba(10,14,39,0.88)`（画布海军 88% 透明度）；玻璃回退实色 `rgba(18,22,61,0.92)`；首页底部 sheet 面板为 `linear-gradient(160deg, rgba(232,144,158,0.12–0.14), rgba(196,160,210,0.08) 42–45%, rgba(18,22,61,0.94–0.96))` 叠同透明度海军实底（设置「使用说明」面板是通用玻璃卡 `.premium-card`）；inset 顶线高光 `rgba(255,255,255,0.09–0.22)`；辉光阴影随主色走——玫瑰 `rgba(232,144,158,0.1–0.45)`、浅粉 `rgba(240,196,192,0.28–0.32)`、金 `rgba(212,165,116,0.3–0.5)`、警示红 `rgba(249,115,115,0.38)`（区间保留，现在没有控件用）。辉光只在这几处：可点主操作的按压柔光（主按钮和复制键，画在 `::before` 柔光层上，按下沉到 0.5，issue #166）；选中态的静态玫瑰光（选月面板当前月 `.jump-option.active` 0.18，经期编辑页选中的状态、经量和症状芯片 0.22）；承载状态色的 rail（提醒行的金或玫瑰 rail，当日详情的玫瑰或浅粉 rail）；三处柔和的情感装饰——绑定页 ♥ 一层字阴影 `0 0 18rpx rgba(240,196,192,0.32)`、欢乐时光列表 ♥ 的 `drop-shadow(0 0 10px rgba(240,196,192,0.3))`、「记录」tab 周期概览卡的玫瑰投影 `0 8px 32px rgba(232,144,158,0.15)`。除此之外不可点元素不再发光：月份导航没有玫瑰投影，加载圈和同步点没有光晕。

Removed from original: neon green, hot pink, cyan, bright gold. Too aggressive for a wellness app.

## 绑定页紫域试点：结论「不推广」（issue #86-#89 → #104）

issue #86–#89 的绑定页紫粉试点（深紫画布、紫玻璃 tint、粉胶囊/粉幽灵按钮、升档玫瑰成功标题）结论是**不推广**：启动首屏已于 issue #104 收敛回 Aurora Bloom，与进入后的页面同一套视觉。试点的 `--bind-*` 页面级 token、深紫画布覆盖、粉胶囊主按钮/复制键/选中 tab、粉幽灵「解除绑定」、紫玻璃 tint 与深紫回退全部移除，本文件 frontmatter 的例外色板登记（bind-canvas-top/bottom、bind-cta-pink、bind-ghost-pink、bind-status-rose）同步删除，色板护栏回到 deny-by-default 单一 Aurora 色板——紫粉字面量不再有任何登记来源，重新引入会被 `tests/design-token-guardrail.test.js` 直接拒绝。

试点后绑定页的情绪点是 ♥ 一层静态辉光 hero（`0 0 18rpx rgba(240,196,192,0.32)`，落在「Shadow / overlay 登记」的浅粉 0.28–0.32）与 `heroIn` 无回弹入场，加上建好房间那一刻 ♥ 向外漾开一次（`heroBloom`，issue #167，见下文「建好房间」）：漾开的是同一个字形的半透明回声，播完即透明，不带字阴影，不是第二层辉光；减弱动效按 app.wxss 全局名单静止，也不漾开。不可点元素不再发光。成功标题 `.bound-status` 回到主色玫瑰 `#E8909E`，在海军卡合成面上 ≥4.5:1，由 `tests/secondary-affordance-contrast.test.js` 钉住。

启动首屏校验中（issue #115）：第一次房间校验出结果前只渲染品牌心，`heroIn` 0.6s 入场保持不变；不渲染创建/加入卡、已绑定卡和错误条。已绑定则继续只留心并进入首页，只有跳转失败才露出已绑定卡和「进入应用」。未绑定或校验失败时，心下面的大标题和说明与卡片（失败时连同错误条和「重试」）同一刻用 `bindReveal` 显现：透明度 0→1，自 `translateY(16rpx)` 回到 0，时长 `var(--duration-enter)`，曲线 `var(--ease-out)`；大标题和说明自 issue #167 起加入这次显现，不再在卡片淡入时先硬切出来。减弱动效下这次显现立即出现，无位移、无淡入。再次 `onShow` 或点「重试」不回到只留心的校验中。

建好房间（issue #167）：创建成功是真正存下的绑定，这一刻给一次回应。♥ 向外漾开一次（`heroBloom`：同一个字形的半透明回声从心上放大到 1.6 倍，透明度 0.6→0，`var(--duration-emphasis)`、`var(--ease-out)`）；已绑定卡换下创建表单时用同一个 `bindReveal` 显现（`.premium-card.bound-reveal`），外层 `.bind-reveal` 早已播完，两段不叠加。卡里的主次和分享不变：「发给 TA」仍是唯一主按钮，「进入应用」是幽灵次按钮（issue #149）。记号是 `justCreated`：创建失败不漾开；之后再次 `onShow` 校验清掉它，漾开和卡片显现都不重播，心本身的 `heroIn` 也不重播（漾开挂在伪元素上，不换心的动画）。加入房间成功仍是 toast 后直接进首页，由首页一次性配对欢迎条接着说明（issue #149），绑定页不再加动效。减弱动效下 ♥ 不漾开（回声静止透明），已绑定卡直接出现。护栏：`tests/bind-room-flow.test.js`、`tests/motion-performance.test.js`。

已绑定卡的主次（issue #149）：刚创建房间时「发给 TA」（原生分享按钮，整宽玫瑰实底）是唯一主操作；「进入应用」是幽灵次按钮 `.btn-ghost`——透明底、1.5px 玫瑰描边、玫瑰字、内容宽居中胶囊，按下缩到 0.95，无投影，减弱动效下无过渡；玫瑰字在卡片合成面上 ≥4.5:1，上下 12px 内边距让 320px 宽下触控高度 ≥44px。刚创建后点它而跳转失败，主次不变。只有已有房间的首页跳转失败时，「进入应用」才以 `.btn-premium` 主按钮出现作为恢复。护栏：`tests/bind-room-flow.test.js`、`tests/secondary-affordance-contrast.test.js`、`tests/narrow-screen-geometry.test.js`。

#78 同款契约重建（issue #104）：绑定页与设置页复制键回归同一色域与同一形态（玫瑰底 `var(--aurora-pink)`、海军字 `#0A0E27`、`--radius-sm`、`padding: 0 28rpx`、玫瑰辉光投影 `0 4px 15px rgba(232,144,158,0.28)`，issue #166 起画在 `::before` 柔光层上，按下同样沉到 0.5），像素同款契约按原「重建条件」恢复——`tests/bind-room-flow.test.js` 恢复两页 fill/label/radius/padding/shadow 全等断言，锚定设置页 `.copy-btn`（设置页侧零改动），在此重新登记。

## Typography

System font stack for zero-bloat + excellent CJK rendering;全页面只继承 `app.wxss` 的 `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', sans-serif`，不声明 `@font-face`、不引入外部字体（`tests/typography-hierarchy.test.js` 护栏）。Sizes, weights and line heights come only from the shared roles below; frontmatter `typography` carries the same values as nominal px at the 375px design width (×2 = the rpx token). Week headers keep natural letter-spacing and do not add tracking. Calendar holiday tags and 「预」 stay at caption scale: `.day-tag` / `.predict-mark` are `26rpx`, and the holiday/workday `.day-tag` box is `38rpx` tall so CJK glyphs are not clipped; in the compact density the `.day-tag` drops to the `24rpx` micro role in a `34rpx` box (see 日历微字 above).

首页月份标题层级：`.month-title` 走 `--font-size-month-title`（40rpx）与 `--font-weight-title`（700），字距保持自然，不另加 letter-spacing；明显高于各页共享导航标题 `.nav-title`（`--font-size-title` 34rpx / 同一标题字重 700）。层级差来自字号（≥6rpx），不来自更重的 800。`line-height: var(--line-height-title)`（1.2）+ `white-space: nowrap` 保证单行完整显示，最坏文案「2026年12月」在 750rpx 视口的月份导航行内不溢出。年月数字走 `tabular-nums`；月份胶囊 `.month-title-trigger` 最小宽 320rpx，兜住最坏文案，1 位数和 2 位数月份同宽，翻月、换年时胶囊不变宽、不挪位，文字在胶囊内居中（issue #164）。层级差、单行、宽度账本与稳宽由 `tests/typography-hierarchy.test.js` 钉住。

caption 家族行高策略：流式说明文字（`.form-hint`、`.symptom-group-label`、`.settings-group-title`、`.room-code-label`）统一 `line-height: var(--line-height-assist)`（1.4）与 `font-weight: var(--font-weight-assist)`（500）；单行控件（`.copy-btn`）以盒高居中——盒高 88rpx flex 居中，不另设文字行高。图例符号复用日历格标记类，不另设 `.legend-symbol`。六族统一走 `--font-size-caption`（26rpx），由 `tests/typography-hierarchy.test.js` 钉住。

信息性文字下限：日历格内微字（农历、经期/欢乐时光标记、预测徽标）不小于 `24rpx`；日历格外 caption（统计标签、同步状态、说明文字）不小于 `26rpx`。低于下限的诉求靠缩短文案或调整布局吸收，不缩小字号。

### 共享字号角色（issue #53，`app.wxss` token 为唯一来源）

frontmatter 的 `typography` 与下表同值，写成 375px 设计宽下的名义 px（×2 即 rpx，和 spacing 一样），不是另一套目标值；实现层全部走下表 rpx 角色 token。页面 WXSS 的 `font-size` 只允许 `var(--font-size-*)`；例外必须登记在 `tests/typography-roles.test.js` 的 `TYPOGRAPHY_EXCEPTIONS`（glyph = 箭头/emoji/标记字形，尺寸随容器几何；display = 展示型大数字/大字，单点登记）。

| token | 值 | 角色 | 典型使用 |
|---|---|---|---|
| `--font-size-month-title` | `40rpx` | 首页月份大标题（高于全局导航一级） | `.month-title` |
| `--font-size-title` | `34rpx` | 标题 | `.nav-title`、`.sheet-title`、`.no-room-title` |
| `--font-size-body-lg` | `32rpx` | 正文大号 | `.prediction-summary`、`.jump-year-value`、`.bound-status` |
| `--font-size-body` | `28rpx` | 正文 | 列表主行、`.month-header-text`（欢乐时光月份卡头，issue #108）、`.tab`、`.menu-text`、`.quick-text`、`.empty-state` |
| `--font-size-caption` | `26rpx` | caption（页面外下限） | 说明/标签/统计文字、`.day-tag`、`.predict-mark`、`.form-label`、流量/症状 chips、`.copy-btn`、`.month-toggle`（月份卡「展开/收起」，issue #109）等次级小操作 |
| `--font-size-calendar-date` | `28rpx` | 日历日期（full 密度） | `.day-num` |
| `--font-size-calendar-date-compact` | `30rpx` | 日历日期（compact 密度） | `.calendar-density-compact .day-num` |
| `--font-size-calendar-micro` | `24rpx` | 日历格内微字（下限） | `.day-lunar`、`.memory-mark`、清爽密度的 `.day-tag` |
| `--font-size-button` | `30rpx` | 主按钮 | `.btn-premium`、`.btn-danger` |
| `--font-size-input` | `32rpx` | 输入文字 | `.form-input`、`.form-picker` |

主按钮角色（30rpx）只属于主按钮族；sheet 确认、复制等小操作文字按正文/caption 角色，不另立按钮字号。glyph/display 例外清单（`.nav-back` 46rpx、`.sheet-close` 46rpx、箭头 42/32rpx、emoji 图标、`.cycle-num` 44rpx、`.hero-title` 48rpx、`.code-input` 40rpx、`.room-code-value` 36rpx 等）是收敛过程中登记的单点，issue #164 逐项复核后保留：字形随容器几何，展示型大字不是阅读文字。新增例外必须先登记。

### 共享文字字重、行高与字距（issue #62）

字号仍只来自上一节的 `--font-size-*`。字重、阅读行高和字距的数值只写在 `app.wxss` 下列 token；页面引用 `var(--…)`，不另写 400/500/600/700 或同义字距。文字角色不保留 800。无单位行高只能是下表三档，不写 1.25 这类近似值；rpx 盒高行高（按钮、输入框、日历格槽位）和图形符号的 `1` 不算阅读行高（issue #164）。

| token | 值 | 角色 |
|---|---|---|
| `--font-weight-body` | `400` | 正文、正文大号、输入文字 |
| `--font-weight-assist` | `500` | 辅助说明、农历、节日/调休/预测文字 |
| `--font-weight-control` | `600` | 普通日历日期、主按钮与其他关键控件 |
| `--font-weight-title` | `700` | 月份标题、导航/页面标题 |
| `--line-height-body` | `1.6` | 流式正文 |
| `--line-height-assist` | `1.4` | 流式辅助说明 |
| `--line-height-title` | `1.2` | 标题与单行标签：月份、弹层、使用说明和绑定页标题，同步胶囊文字，弹层动作与图例的标题行；记录入口折成两行的标签（issue #159） |
| `--letter-spacing-assist` | `1rpx` | 有水平余量的流式辅助说明 |
| `--letter-spacing-room-code` | `6rpx` | 房间码展示串，逐字核对，不是辅助说明字距 |
| `--letter-spacing-code-input` | `12rpx` | 6 位房间码输入，逐字槽位，不是辅助说明字距 |

今天（`.day-cell.today .day-num`）复用 `--font-weight-title`（700），作为相对普通日期 600 的语义强调；等宽数字仍由 `.day-num` 的 `tabular-nums` 继承。不另设第五档字重。

统计数字（`.cycle-num`）按可扫读的数字信息处理，字重走 `--font-weight-control`（600）并保留 `tabular-nums` 与既有展示字号。不因历史展示例外保留 800，也不把它升成标题。

等宽数字（`font-variant-numeric: tabular-nums`）用在三类文字上：日历日期、统计数字和房间码；翻月就换数字的行（月份标题、状态行、本月小结、弹层副标题、选月年份）；成列扫读的数字（记录列表的日期、时长胶囊、欢乐时光月份卡头）。数字变了不改字宽，也不推动后面的字（issue #164）。登记表是 `tests/typography-roles.test.js` 的 `TABULAR_NUMERIC`；房间码输入框是原生输入控件，不在表里。

房间码（`.room-code-value`、`.bound-code`）同样走控件字重 600 与 `tabular-nums`，字距只用 `--letter-spacing-room-code`。无码占位 `.room-code-value.muted` 回到正文 400，字距复位为 0。`.code-input` 是输入文字，字重 400，字距只用 `--letter-spacing-code-input`。它的盒高和行高都是 88rpx，纵向 padding 为 0，六位码在框内完整可见并水平居中；输入框通栏，与上方说明和下方主按钮对齐。占位符走同一行高。

流式辅助说明在有水平余量时使用 `--letter-spacing-assist`。格内农历、节日/调休/预测文字、单字周标题、按钮标签和标题保持自然字距，不靠加字距或缩小字号制造轻盈。胶囊盒高和日历格留白不在本角色表里改。完整密度的格内农历只显示日名，农历初一显示月名（含闰月，如「闰四月」）；完整农历字符串留在日历格无障碍名称和日详情副标题。格内仍单行、不用省略号。清爽密度不显示农历。

字形例外：`.sheet-action-icon`、`.jump-year-step` 是心形、工具菜单字形或步进箭头，不是阅读文字；经期记录动作的图标不是字形，是图例的单日色带样本（见「借入规则」的图例段）。它们保留字重 800 与既有字号，避免图标观感被文字角色改写。图例样本复用格内的 `.day-tag`、`.predict-mark`、`.memory-mark`、`.day-num` 与 `.period-band`，这些状态字走各自已有的辅助字重，不另设图例符号盒。

## Components

Cards keep the glass tint as a flat `linear-gradient` over `var(--glass-fallback)`: a `rgba(255,255,255,0.08)` overlay (`.premium-card` uses `linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback)`), plus a top-edge highlight. Over the 0.92 fallback a blur would not show, so cards, the navbar, the calendar and danger buttons do not blur; the blurred surfaces are the two registered sheet masks (see 玻璃叠层). Rows that sit straight on the aurora put the same fallback under their wash. A color is legal only as the last `background` layer; a two-color shorthand paints nothing. Cards and text add no decorative shadows beyond the card elevation and the few glows registered under Shadow / overlay. The press glow belongs to the rose primary fills and copy keys: it is painted on a `::before` glow layer whose opacity sinks to 0.5 on the same `--duration-press` beat as the scale; the shadow itself never transitions or swaps (see 按压的四路).

Primary fill (`.btn-premium`, `.copy-btn`): rose `#E8909E` fill, label `#0A0E27`. Ghost / outline (`.btn-ghost`, the bind page's secondary 「进入应用」): transparent, rose border and rose label on the navy card — readable on navy, not white type on rose.

Prediction metadata, reminder cards, and period tag chips stay compact and low-noise. Interactive chips need at least a 44px touch target; active chips use navy type on rose. Calendar cell states are listed under 借入规则; a visual mark still means only one thing.

## 常驻动画注册表

持续动画（`infinite`）只有下表这些，一行一个，`tests/motion-performance.test.js` 的 `CONTINUOUS_ANIMATIONS` 是同一张表，新增或删除时两边一起改（issue #163）。装饰性动画周期在 6–12s；弹层处于 open 或 leaving 时页面根带 `page-obscured`，页面不可见（`onHide` 到下一次 `onShow`）时带 `page-hidden`，两种标记下装饰性动画都由 `app.wxss` 里唯一一条规则设为 `animation-play-state: paused`，暂停在当前帧，标记去掉后从这一帧继续，动画名和周期不变。状态指示只在对应状态期间存在，可以快于 6s，遮挡和隐藏时照常播放，免得像卡住。减弱动效下装饰性动画为 `animation: none`，暂停规则不取代这一条。已退役：`auroraPulse`（整页缩放，issue #163）、`orbFloat`（首页光球，issue #163）、`orbRotate`（光球第二层，issue #58）、`bounceIn`（绑定页回弹入场）。

| 动画 | 挂在 | 用途 | 节奏 | 弹层遮挡 | 页面不可见 | 减弱动效 |
|---|---|---|---|---|---|---|
| `auroraViolet` | `.aurora-bloom-violet`（每页） | 下半屏的蓝紫深处，给画面纵深 | 12s `ease-in-out` 往返，起点 -6s | 暂停在当前帧 | 暂停在当前帧 | 静止：不透明度 1，停在原位 |
| `auroraRose` | `.aurora-bloom-rose`（每页） | 左上的玫瑰暖光 | 10s `ease-in-out` 往返，起点 -3s | 暂停在当前帧 | 暂停在当前帧 | 静止：不透明度 1，停在原位 |
| `auroraLavender` | `.aurora-bloom-lavender`（每页） | 右侧中段的薰衣草冷光 | 8s `ease-in-out` 往返，起点 -5s | 暂停在当前帧 | 暂停在当前帧 | 静止：不透明度 1，停在原位 |
| `float` | `.header-gradient::before`、`.header-gradient::after`（顶栏） | 顶栏里的玫瑰与薰衣草光斑 | 8s 与 6s `ease-in-out`，`alternate` 与 `alternate-reverse` | 暂停在当前帧 | 暂停在当前帧 | 静止在起点 |
| `pulse` | `.no-room-icon`（首页未绑定） | 未绑定画面的心跳 | 6s `ease-in-out` | 暂停在当前帧 | 暂停在当前帧 | 静止 |
| `spin` | `.loading-spinner` | 加载中 | 0.8s `linear` | 照常 | 照常 | 换成 `loadingPulse` |
| `syncDotPulse` | `.sync-pill.syncing .sync-dot` | 同步中 | 1s `ease-in-out` | 照常 | 照常 | 静态玫瑰点 |
| `skeletonPulse` | 首页与记录页的骨架 | 首次加载 | 2.4s `ease-in-out` | 照常 | 照常 | 静态哑光占位块 |
| `loadingPulse` | 减弱动效下的 `.loading-spinner` | 加载中，`spin` 的替代 | 1.6s `ease-in-out`，只动透明度 | 照常 | 照常 | 本身就是减弱动效替代 |

## 一次性动效注册表

播一次的关键帧动画只有下表这些，`tests/motion-performance.test.js` 的 `ONE_SHOT_ANIMATIONS` 加上 `heroIn` 是同一张表，新增或删除时两边一起改（issue #165）。内容相同、靠记号交替从头重播的一对（a、b）占一行。一次性动画不受 `page-obscured` 和 `page-hidden` 暂停：遮挡或不可见时照常播完，之后不重播。例外是记录成功反馈的两行（issue #167）：它们在首页不可见时挂上，`page-hidden` 下按住不开始（不是暂停在中途），回到首页才从头播；首页再隐藏就收掉。用 transition 写的进出（弹层、同步胶囊、按压）不在此表，规则见上文「动效与性能边界」和各条弹层说明。

| 动效 | 挂在 | 用途与触发 | 时长与曲线 | 中断与取消 | 弹层遮挡与页面不可见 | 减弱动效 |
|---|---|---|---|---|---|---|
| `pageEnter` | 每页根 `.page` | 页面打开时整页淡入；只动透明度，位移会让固定的背景跟着滚动 | `--duration-enter` 240ms，`--ease-out`，`both` | 不可中断，播完即止；页面不重建不重播 | 照常播完 | none，页面直接出现 |
| `heroIn` | 绑定页 `.hero-icon` | 绑定页打开时品牌心淡入并轻微放大，无回弹 | 字面 0.6s，`--ease-out`，`both` | 不可中断，播完即止 | 绑定页没有弹层；不可见时照常播完 | none，直接显示 |
| `heroBloom` | 绑定页 `.hero.hero-bloom .hero-icon::after`（♥ 的回声） | 创建房间成功那一刻（issue #167），♥ 的半透明回声从心上放大到 1.6 倍并淡出，播完即透明；不带字阴影 | `--duration-emphasis` 600ms，`--ease-out`，`both` | 不可中断，播完即止；创建失败不播；再次 `onShow` 校验清掉 `justCreated` 时随类去掉，不重播 | 绑定页没有弹层；不可见时照常播完 | none：回声静止透明，不漾开 |
| `bindReveal` | 绑定页 `.bind-reveal`（心下面的标题和说明、房间卡）；刚建好房间时的已绑定卡 `.premium-card.bound-reveal` | 房间状态查完后，标题、说明和绑定内容同一刻从下方 16rpx 淡入；创建房间成功时已绑定卡换下创建表单，同样淡入一次（issue #167） | `--duration-enter` 240ms，`--ease-out`，`both` | 不可中断，挂载一次播一次；已绑定卡那次在再次校验清掉 `justCreated` 后不重播 | 绑定页没有弹层；不可见时照常播完 | none，直接显示 |
| `dayDetailFade` | 当日弹层 `.day-detail-fade` | 从动作列表切进详情时新内容淡入；直接打开详情不带 | `--duration-state` 200ms，`--ease-out`，`both` | 不可中断；关弹层或换内容时随节点卸下 | 它就在弹层里，照常播 | none，内容直接显示 |
| `calendarFlipNextA` / `calendarFlipNextB` | `.calendar-days.calendar-flip-next-a`、`-next-b` | 翻到下一月（箭头或左滑）：新月份的格子与标题同一次更新换上，从右滑入 10rpx，透明度 0.5 → 1 | `--duration-enter` 240ms，`--ease-out` | 240ms 内同方向再翻：数据即时换，滑入接着播，不续期；反向：换成上一月方向从头播；播完再翻：a、b 交替从头播；选月、回到今天、未绑定或加载失败画面：取消，即时替换 | 弹层盖着时翻不了月；不可见时照常播完，不重播 | none，即时替换，月份标题文案承载变化 |
| `calendarFlipPrevA` / `calendarFlipPrevB` | `.calendar-days.calendar-flip-prev-a`、`-prev-b` | 翻到上一月（箭头或右滑）：从左滑入，其余同上一行 | `--duration-enter` 240ms，`--ease-out` | 同上一行，方向相反 | 同上一行 | none，即时替换 |
| `calendarHaloA` / `calendarHaloB` | 今天：`.calendar-emphasis-today-a`、`-today-b` 下的 `.day-cell.today .day-num::after`；「预」：`.calendar-emphasis-predict-a`、`-predict-b` 下的 `.predict-mark::after`（都在 `.calendar-days` 上） | 回到今天（首页按钮或选月面板）时今天的胶囊亮一次；关掉开着的预测说明时当月的「预」亮一次 | `--duration-emphasis` 600ms，`--ease-out`，透明度 0 → 1 → 0 | 再次触发：a、b 交替从头播；之后任何一次日历更新或未绑定、加载失败画面：去掉记号，不留痕、不重播 | 选月面板离场时今天的光晕照常播；不可见时照常播完，不重播 | 照常：只动透明度，是温和的反馈 |
| `recordBloom` | 首页 `.calendar-days` 里带 `record-feedback-memory` 的日期格的 `.memory-mark`（♥） | 新增欢乐时光保存成功（云端确认写入，含回读确认已存）后回到首页：那一天的 ♥ 从 0.6 倍淡入长到原大 | `--duration-emphasis` 600ms，`--ease-out`，先等 `--delay-return` 300ms，`both` | 再保存一次：换成新的那条，不叠加；之后任何一次日历更新（翻月、选月、回到今天、带来记录变化的刷新、别的记录变化）、首页隐藏、未绑定或加载失败画面：去掉记号，不重播 | 回到首页时没有弹层；首页不可见时挂上但按住不开始（透明），`onShow` 去掉 `page-hidden` 才播；首页再隐藏时先收掉反馈再挂 `page-hidden` | 换成 `recordAppear`：只淡入，不缩放 |
| `recordAppear` | 首页 `.calendar-days` 里带 `record-feedback-period` 的日期格的 `.period-band`；减弱动效下的 ♥ | 新增经期，或给没有结束日的经期（进行中、结束日期不详）填上结束日，保存成功后回到首页：这段色带在当月的每一格一起从透明淡入，连续段不断开 | `--duration-emphasis` 600ms，`--ease-out`，先等 `--delay-return` 300ms，`both` | 同上一行 | 同上一行 | 照常：只动透明度 |

## 警示红语义

警示红 `#F97373` 是全色板唯一的警示色，一族只表示「需要注意的负面状态」，目前在屏上有四种形态：

| 形态 | 位置 | 表现 |
|---|---|---|
| 危险操作按钮 | `.btn-danger`（删除记录；绑定页 needUnbind 中间态的解除绑定入口；app 级基类） | 红字 + `rgba(249,115,115,0.28)` 描边，不透明海军实底（`var(--glass-bg)` 叠 `rgba(18,22,61,0.92)`）；Pressed 叠 `rgba(249,115,115,0.12)`、描边提亮到 `rgba(249,115,115,0.4)`、`scale(0.95)` |
| 危险菜单行 | `.menu-item.danger`（设置页页底危险区：解除绑定） | 红字 + `rgba(249,115,115,0.28)` 描边 + 海军实底；Pressed 叠 `rgba(249,115,115,0.12)`、描边提亮到 `rgba(249,115,115,0.4)`、`scale(0.95)` |
| 表单错误 | `.error-msg`（绑定页） | 红字 + `rgba(249,115,115,0.1)` 浅底（平涂层，叠在 `var(--glass-fallback)` 上，issue #163）+ `rgba(249,115,115,0.24)` 描边 |
| 字段错误 | `.field-error`（`app.wxss` 一条规则，经期 / 欢乐时光编辑页共用，issue #156） | 红字 caption 一句，紧贴所属日期 picker 下方常驻；不铺底、不描边、不做过渡 |

推迟提醒不在这一族里。`.reminder-card.overdue .reminder-rail` 用中性色 `#FFFFFF`，没有警示红辉光。文案也只陈述事实：标题「可能开始的日子已过」，正文「如果已经开始，可以补记」，点按仍去记经期；不写「很正常」这类安抚判断，估算的边界由预测说明里的「根据记录估算，不是医疗建议」交代。

「解除绑定」属危险操作：设置页页底危险区的 `.menu-item.danger` 菜单行（issue #102 从绑定页已绑定卡迁入，issue #139 再从房间组挪到页底；有房间码才出现，解绑成功回绑定页）与绑定页 needUnbind 中间态（错误恢复路径）的就地解除入口（跟随 app 级 `.btn-danger` 基类）；issue #88 试点的粉幽灵形态已随 issue #104 收敛移除，不再存在红族之外的解除绑定样式。重新同步房间不是危险操作，不用这行样式。绑定页的校验失败重试 `.error-retry`（issue #102）是表单错误同族的轻量按钮——红字 + 同款浅底描边，浅底叠在海军回退上；Pressed 换成更深一档的红 tint `rgba(249,115,115,0.18)`（平涂层在 `::before`，issue #163；海军回退比画布亮，原来的 0.24 按下时红字只剩约 4.4:1），无 transform 过渡。

字段错误（issue #156）：编辑页能定位到字段的校验错误留在该字段下方，不弹 toast；对应 picker 的读屏名称在原名后接同一句错误，红字行标 `aria-role="alert"`。保存失败时页面无动画地滚到第一个出错字段，并让出固定导航栏的高度。已显示的错误只在用户改动后重算这几个字段，改对即消失；保存前不新增错误。无法定位到字段的整体错误仍走瞬时 toast。

同一含义共享同一红色，组件角色靠形态（按钮 / 文案条）区分，不靠颜色分叉；不引入第二种红。

与「一个符号只表一意」家规的关系：家规约束同一符号不得表二意；警示红一族是反向合规——同一含义（负面状态）复用同一符号（这个红），形态承载角色、颜色不承载区分。若给危险操作和表单错误各配一种红，同一含义裂成多个符号，反而违反家规。

## Do's and Don'ts

- Do use warm rose as the sole bright tappable color
- Do use canvas navy `#0A0E27` on rose for primary-fill labels
- Do use warm gold for secondary certainty/range metadata
- Do keep the reviewed tab top hairline (`tabBar.borderStyle: white`)
- Do keep animations slow (6-12s cycles)（装饰性持续动画；加载/同步等功能性指示与 reduced-motion 替代按「常驻动画注册表」执行）
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
- 卡片和正文不加装饰阴影，不叠第二套 elevation；现有玻璃 inset 保持。按压柔光只属于可点控件（主按钮与复制键的玫瑰光），画在柔光层上，按压时随缩放同一拍沉到 0.5（见「按压的四路」），阴影本身不进过渡。「不加装饰阴影」管的是不可点的面（issue #163 划清这条线）；仍在发光的几处（选中态、状态 rail、三处情感装饰）逐个登记在「Shadow / overlay 登记」，不另开新的。

### 日历格状态（cal 的状态表写法，语义用本产品）

| 状态 | 标记 | 格子 |
|---|---|---|
| 今天 | 日期外的浅玫瑰小胶囊、薰衣草细边、玫瑰色日期，不用爱心 | 胶囊只围住日期数字，画在数字之下：完整密度 60×41rpx，从格顶画起；清爽密度 64×43rpx，从日期上方 5rpx 起。下沿离下一槽（农历字框、节日/调休行或合并信息行）留 2rpx：基础库把每段 rpx 各自取整成整数 px（正长度向下取整，负偏移向零取整，开发者工具 3.16.1 实测），贴着槽顶画会在部分屏宽上压到「班」1px。两档都低于 #162 票面的约 44–52rpx，待维护者在 #162 确认：完整密度的日期贴着格顶（上内边距 4rpx），胶囊高出格顶会被裁平，农历字框从 43rpx 起，再留 2rpx 取整余量，最高只有 41rpx，不缩字、不改行高、不裁内容到不了 44rpx；清爽密度的下沿同样停在节日/调休行上方 2rpx，再加高只能往上长，日期会沉到胶囊下半，43rpx 时日期中线已比胶囊中线低约 2.5rpx，两档的比例也相近（60×41、64×43）。高度下限的护栏不写死这两个值：取票面下限和各档几何余量里最小的那个，余量够 44rpx 时下限就回到票面（`tests/calendar-micro-labels.test.js`）。胶囊是 14% 玫瑰底加 2rpx 薰衣草边（`todayCapsule*`）。格子本身不铺底、不描边，调休格的低对比底照常铺。日期字 `#E8909E`，字号和行高不变。经期中的今天不另加胶囊，日期色带朝外的边描 2rpx 同色边：单日描四边，起点不描右边，中段只描上下，终点不描左边，进行中开口的一端不描。色带中间不出现竖线，日期字 `rgba(255,255,255,0.92)`。按压时胶囊随格子一起 `scale(0.94)`，不另加按压底色。回到今天时胶囊位置亮一次光晕（issue #165，见「一次性动效注册表」），播完回到上述静止样子 |
| 经期 | 22% 玫瑰连续色带 `rgba(232,144,158,0.22)` | 色带只包住日期数字，完整密度高 44rpx、清爽密度高 48rpx。起点与终点用整圆头，中段在行内直角相连，换行在行首行尾收口；单日是圆角胶囊；进行中投影到今天的一端开口。不铺实色整格底。重叠日只表达经期。色带平时无过渡、立即出现；新增经期或补上结束日、保存成功回到首页时，这段色带的每一格一起淡入一次（issue #167，见「一次性动效注册表」），减弱动效下照常淡入。♥ 画在色带之上 |
| 欢乐时光 | ♥ `#F0C4C0` | 仅欢乐时光。新增保存成功回到首页时，这一天的 ♥ 从 0.6 倍淡入长到原大一次（issue #167），减弱动效下只淡入 |
| 下次可能开始的日子 | 金色「预」 | 已是经期日时不叠「预」。底透明，描边可留金。今天落在这个窗口时，「预」在胶囊外的日历网格上，对比度仍 ≥4.5:1。关掉预测说明时当月的「预」在描边处亮一次金色光晕（issue #165），播完回到透明底 |
| 节日 | 无底金色文字 | 不铺整格金底，也不铺金底胶囊。今天落在节日时，今天胶囊只围住日期，节日字留在胶囊外 |
| 调休上班 | 「班」 | 低调小标签，低对比底，不用金。调休格铺 3.5% 白的低对比底，今天落在调休日时这层底照常铺，胶囊叠在上面，「班」留在胶囊外 |

同一天可叠多种标记，但每个符号只表示上表一行。空格（非本月）隐藏，不参与状态。

图例项由 `utils/homeCalendarState.js` 的 `CALENDAR_LEGEND_ITEMS` 驱动：`cellClass` 与 `parts.className` 就是日历格上的那些类，模板不再另画 `.legend-symbol`。经期图例是单日圆角色带。今天的说明与格子一致：日期外的浅玫瑰色小胶囊、薰衣草细边、玫瑰色日期；经期中的今天改在色带边缘描边。「预」的说明是「下次可能开始的日子」。样本就是一枚 72rpx 的日历格（issue #162）：铺日历网格同款底（5% 白叠玻璃回退），圆角与日历格相同，今天胶囊和各个标记落在和网格一样的合成面上，对比度也和网格上一样；色带在方格里上下居中。样本不改标记的颜色和形状。首页「记经期」和当日弹层的经期动作画的也是这段单日色带（issue #159），不再用玫瑰圆点：`periodBandSample` 与图例经期项同源，样本缩进圆盘（记录入口的海军圆盘里 30×18rpx，弹层的玻璃圆盘里 40×24rpx），颜色和胶囊形仍由 `.period-band` 给，圆盘保留玫瑰细描边。色带在记录入口的海军圆盘上约 1.45:1，弹层玻璃圆盘上约 1.49:1，和日历网格上的色带（约 1.49:1）同一档，低于非文字 3:1 也接受，理由是：它和日历上一样只帮助辨认，动作的含义由按钮文字（记经期、补记经期、编辑这次经期等）承担；图标的边界由圆盘和玫瑰细描边保持，海军圆盘在玫瑰按钮上约 8:1。欢乐时光仍是浅色心。

完整密度的格内农历用 `lunarCellText`：平时是日名，农历月初一是月名。`lunarText` 的完整字符串只出现在读屏名和日详情副标题。清爽密度不显示农历；节日和调休两档都显示。设置页「日历显示」写明：清爽只看日期与标记（含节日和调休），完整另外显示农历。

### 明确不借

| 来源 | 不采用 |
|---|---|
| `apple` | Action Blue、博物馆白底、禁止玻璃/渐变、具名 SF Pro、金不能做元数据 |
| `cal` | 白底、黑 CTA、Cal Sans、卡片圆角上限 16px、36–40px 触控、深色只给页脚 |

`clay`、`renault` 目录文案与模板正文不符，不作为参考。`airbnb`、`claude`、`linear.app` 本次未借入。
