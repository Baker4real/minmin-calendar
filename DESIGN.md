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
  h1:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  h2:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.35
  body-lg:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", sans-serif
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.03em"
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
    padding: 24px
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
    textColor: "rgba(255,255,255,0.85)"
    todayBg: "rgba(232,144,158,0.16)"
    todayRing: "inset 0 0 0 3rpx rgba(196,160,210,0.55)"
    todayText: "#E8909E"
    periodBand: "rgba(232,144,158,0.22)"
    memoryMark: "#F0C4C0"
    predictMark: "#D4A574"
    holidayTagBg: "transparent"
    holidayTagText: "#D4A574"
    workdayTagBg: "rgba(255,255,255,0.12)"
  diary-card:
    backgroundColor: "rgba(232,144,158,0.06)"
    rounded: 24px
    borderLeft: "3px solid #E8909E"
    padding: 16px
  tab-bar:
    backgroundColor: "#0A0E27"
    borderStyle: "white"
    color: "#7A7C8C"
    selectedColor: "#E8909E"
  input-field:
    backgroundColor: "rgba(255,255,255,0.06)"
    rounded: 16px
    padding: 14px 16px
    textColor: "rgba(255,255,255,0.85)"
    focusBorder: "1px solid #E8909E"
  modal-overlay:
    backgroundColor: "rgba(0,0,0,0.5)"
    backdropFilter: "blur(8px)"
  badge:
    backgroundColor: "#F0C4C0"
    textColor: "#0A0E27"
    rounded: 999rpx
  reminder-card:
    backgroundColor: "rgba(255,255,255,0.075)"
    railColor: "#D4A574"
    dueRailColor: "#E8909E"
    overdueRailColor: "#F97373"
  choice-chip:
    minTouchHeight: 44px
    inactiveBg: "rgba(255,255,255,0.065)"
    activeBg: "#E8909E"
    activeText: "#0A0E27"
---

## 单一权威

本文件是 Aurora Bloom 的唯一现行视觉说明。色板、圆角、按压、tab 顶线和日历格状态以本文为准。不要并列第二套「目标稿」或「实现基线」；已审查数值不要按旧稿回改。

已在屏幕上成立、改 UI 时沿用：

- 圆角 token（`app.wxss`）：`--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` 为 `12rpx` / `20rpx` / `28rpx` / `36rpx`，另有 `--radius-card: 24rpx`（卡片与日历块；`.premium-card`、导航返回底、`.month-nav` 等均走此 token）、`--radius-full: 999rpx`（胶囊）、`--radius-circle: 50%`（正圆点/圆钮）。全部 WXSS 文件（含 `app.wxss` 自身）的 `border-radius` 只允许 token 与 `0` 复位，由 `tests/design-token-guardrail.test.js` 护栏。
- 玻璃叠层：`--glass-bg` 为 `rgba(255,255,255,0.08)`；卡片边框常用 `rgba(255,255,255,0.12)`（含 `--glass-border`）。共享玻璃卡（`.premium-card` 等）的着色是平涂图像层，叠在回退实色上：`linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback)`。CSS 只允许颜色作为 `background` 的最后一层，`<color>, var(--glass-fallback)` 整条无效、什么都不画。回退实色 `rgba(18,22,61,0.92)` 的唯一来源是 `--glass-fallback` token（近乎不透明的海军；既有规则已经用玫瑰实底的，保留玫瑰），一律写 `var(--glass-fallback)`，不重复字面量，由 `tests/design-token-guardrail.test.js` 护栏。合成不透明度接近 1 的面（顶栏、返回键底、月份导航、周头、日历网格、通用卡片、危险按钮、同步胶囊，以及用同一回退实色的表单与空态；淡白叠 0.92 海军后约 0.92–0.93）不再写 `backdrop-filter`。仍使用模糊的只有不够接近不透明的遮罩；那里 `backdrop-filter` 与 `-webkit-backdrop-filter` 成对写。忽略模糊时仍是实色面，不要只留半透明空框。
- 间距阶梯：名义刻度 4/8/16/24/32/48px（frontmatter spacing）在 `app.wxss` 登记为 rpx token（数值 ×2）：`--space-xs` / `--space-sm` / `--space-md` / `--space-lg` / `--space-xl` / `--space-xxl` = `8rpx` / `16rpx` / `32rpx` / `48rpx` / `64rpx` / `96rpx`。issue #53 只收敛单一来源并登记；页面既有间距字面量的逐页迁移留给后续 UI ticket，新增布局优先使用 token。
- 字号角色：见「Typography」节的共享字号角色表，`app.wxss` 的 `--font-size-*` token 是全页面唯一来源，`tests/typography-roles.test.js` 护栏。
- 首页信息架构（issue #55，issue #105 修订）：首页 `.content` 自上而下为 月份导航 → 周头/日历 → 记录入口（`.quick-actions` 记经期/记欢乐时光）→ 合并状态卡（`.status-card`，无任何记录时整卡收起，由空态引导补位）。图例/预测说明/本月小结收进月份标题旁的「…」菜单（issue #105 登记：触发器字形用「…」——「⌄」已用于选月 caret，不重复占用；菜单是与日操作 sheet 同族的底部 sheet，三个菜单项复用 `openLegendSheet` / `openPredictionSheet` / `openMonthlyRecap` 与既有 sheet 本体），日历上方与下方不再有常驻工具条。合并状态卡 = 经期记录条数（纯现状文本，不再是列表跳转；issue #68 的左半入口随本修订退役）+ 下次预测（整块可点，打开预测说明）+ 卡内提醒区（超期进行中补填提示与周期提醒，点击仍走原有补填/记录动作），无预测且无提醒时卡只剩预测区，不新增空区块。经期与欢乐时光列表由「记录」tab 的经期/欢乐时光分段承接（issue #103），首页不再放列表入口。空态引导仅在无任何记录时出现，文字在其合成面（画布海军 + 引导卡 6% 白底）上 ≥4.5:1，不低于 `--text-secondary` 档。日历密度偏好（`calendarDensity` 存储键）的切换入口在设置页「日历显示」分组里，分段控件直接放在分组卡中，不再套一层内卡；首页 `onShow` 重读即刻生效；密度选中态保持玫瑰描边弱态，不用实色填充。结构序与首屏预算由 `tests/index-page.test.js`、`tests/calendar-micro-labels.test.js` 钉住。日历日动作 sheet 对晚于今天的日期隐藏「记经期 / 补记经期」入口（issue #100 登记：隐藏而非置灰，模板按 `selectedDateIsFuture` 门控），编辑页日期上限与保存校验仍是最后防线。
- 窄屏几何与安全区（issue #56）：所有带显式 `width` 与水平内边距的卡片/表单容器一律 `box-sizing: border-box`，宽度与内边距不得叠加出横向溢出（全 WXSS 护栏，含 `app.wxss`）。安全区运行时策略只有一套（`utils/safeArea.js`）：顶部 `--safe-top` 走状态栏高度、底部 `--safe-bottom` 走 `screenHeight − safeArea.bottom`，均由页面根节点内联注入；底部插入在无手势区设备上为 0，不制造无意义底部空白。共享顶栏：七个页面共用一个固定顶栏，高度等于状态栏高度加上由微信胶囊矩形推出的导航高度，右侧用 `--capsule-right` 预留胶囊宽度，顶栏固定定位，页面内容用同一个 `--nav-bar-height` 下移，起点不高于顶栏底边。胶囊矩形和顶、底安全区共用 `utils/safeArea.js` 这一个运行时出口，拿不到胶囊矩形时有兜底。编辑页的返回键在顶栏里，首页顶栏左侧留空。底部落点：非 tab 页 `.content` 的 padding-bottom 与底部 sheet 的 padding-bottom = 基础值 + `var(--safe-bottom, env(safe-area-inset-bottom, 0px))`；tab 页内容由原生 tabBar 吸收底部插入，不重复加。底部 sheet 滚动边界 = `max-height` 82–86vh + `overflow-y: auto`，遮罩不做 `overflow` 裁切。日历触控目标按「高度 ≥44px」执行（compact 104rpx ≈ 44.4px@320px、full 160rpx ≈ 68.3px@320px）；320px 下七列宽 ≈42.5px 是物理上限（7×44px 放不进 320px），列整宽平铺、无水平 margin、互不重叠，不以缩小日期/农历/标记吸收。周头与日历网格左右各留 10rpx，最左列和最右列的内容不贴网格边框；色带仍铺满各自的格子，不因这道内边距改形状。回归由 `tests/narrow-screen-geometry.test.js` 钉住。
- 阴影登记（下文「Shadow / overlay 登记」段）实行区间登记制：同族同色阴影的透明度落在登记区间内即合规，区间内免逐值登记；区间外透明度或登记表外颜色由 `tests/design-token-guardrail.test.js` 的阴影注册表护栏拒绝。
- 交互语义（issue #57）：每个可点控件（bindtap/catchtap，sheet 的 `catchtap="noop"` 泄泡盾除外）都带 `aria-role` 与可读 `aria-label`；弹层遮罩本身是「关闭」操作，按用途命名（关闭月份选择/当日操作/面板）。选中态用 `aria-checked` 表达并与 `active` 类同条件绑定（单选组如经期状态、密度、月份格、绑定 tab 用 `radio`，可多选或可再点取消的经量/症状 chip 用 `checkbox`）；禁用与加载态用 `aria-disabled` 表达并与 `disabled`/`loading` 类同条件。picker 与输入框带 `aria-label`。首屏加载指示（`.loading-spinner`）带可读 `aria-label`；同步状态胶囊（`.sync-pill`）为 `status` 角色、朗读名与 `syncStatusText` 同源，同步状态变化即可朗读（issue #106）。日历格保持 `aria-label="{{item.ariaLabel}}"` 领域朗读（日期+经期/欢乐时光/预测/节日/调休）与 `aria-hidden="{{item.isEmpty}}"` 空白格隐藏，角色为 button；语义文案唯一来源仍是 `utils/homeCalendarState.js`。护栏：`tests/interaction-semantics.test.js`。
- 次级可点入口对比度（issue #57）：可点击箭头（`.menu-arrow`、`.form-picker-arrow`、列表/入口/弹层箭头）与次要操作（重试空态、绑定页房间码、危险按钮）的文字色不弱于 `--text-secondary`，在各自实际表面（卡片/表单/sheet 合成底）上 ≥4.5:1——基准即未选中 tab `#7A7C8C` 在画布 `#0A0E27` 上的 4.5:1；输入占位符用 `--text-placeholder`（`rgba(255,255,255,0.6)`，与 `--text-secondary` 同档，不弱于它；issue #144），`.input-placeholder` 的字号走 `--font-size-input`。`--text-tertiary`（0.35 白）不再用于占位符，也不再用于任何可点入口。护栏：`tests/secondary-affordance-contrast.test.js`、`tests/typography-hierarchy.test.js`。
- 展开/收起文字入口（issue #109，「记录」tab 欢乐时光月份卡头）：切换入口用文字「展开」/「收起」，不用字形——「›」已用于列表行「点开编辑」（`.item-arrow`/`.memory-arrow`），「⌄」已用于首页选月 caret（`.month-title-caret`），不重复占用；文字自述点按后果。卡头按 button 朗读，`aria-expanded` 与展开状态同条件，读屏名「YYYY年M月，N 条欢乐时光，已展开/已收起」；收起且该月有备注时，在状态前加上该月第一条备注的单行摘要（从新到旧，跳过空白备注；整月没有备注则不追加）。摘要显示在卡头标题下方，单行，超出截断，展开时不重复渲染，可见文字 `aria-hidden`，读屏只走卡头名。点按即时切换、无过渡动画（不进动效注册表，开启减弱动效时无差别）。文字走 caption 角色（26rpx）+ `var(--text-secondary)`，在月份卡（`.premium-card`）表面 ≥4.5:1，护栏 `tests/secondary-affordance-contrast.test.js`（CASES 登记）；320px 单行账本由 `tests/narrow-screen-geometry.test.js` 钉住。这是应用里第一个展开/收起交互，本条即先例。
- 动效与性能边界（issue #58）：缓动只有 `--ease-out`（`cubic-bezier(0.16,1,0.3,1)`）与标准关键字（ease/ease-in-out/linear 等）；bounce/elastic 式 overshoot 曲线（cubic-bezier 的 y 参数超出 0–1）与 `--ease-spring` / `--transition-spring` token 已退役，bind 页 `bounceIn` 回弹入场同步改为无回弹的 `heroIn`，禁止同类曲线以任何命名回归。一次性时长只有五档 app 级 token（issue #111）：`--duration-press` 160ms（可点控件按压缩放，以及按压时一起变化的底色、描边；按压阴影不进过渡）、`--duration-state` 200ms（选中、颜色、描边、焦点边框，以及后台刷新时日历变暗）、`--duration-enter` 240ms（整页淡入 `pageEnter`、弹层遮罩淡入、同步胶囊入场）、`--duration-exit` 200ms（弹层与同步胶囊离场）、`--duration-sheet` 280ms（弹层面板升起）。按压只属于可点控件，容器和不可点的行不缩放、不变底色（issue #113，取代 issue #81 的逐页豁免）。微信里每个可点控件（`bindtap`/`catchtap`，`catchtap="noop"` 除外）都带 `hover-class`，并且和对应的 `:active` 写在同一条规则里，开发者工具才会画出按压（issue #122，issue #145）。类名重复控件自己的类，例如月份箭头 `nav-btn-hover`，危险行 `danger-hover`，危险按钮 `btn-danger-hover`，返回键 `nav-back-hover`。按压着色落在可以过渡的 `background-color` 上（海军实底之上的平涂层），时长仍是 `--duration-press`，不写进 `background-image`。方向仍是 issue #122 的海军实底上平涂着色。`:active` 规则保留。位移、缩放、入场、离场用 `var(--ease-out)`；只变颜色或底色用 `ease`；导航头光斑 `float` 的来回漂移用 `ease-in-out`（周期仍是 8s 与 6s）。除 `--ease-out` 定义外不写 cubic-bezier。组合变量 `--transition` 已退役。常驻动画周期、减弱动效替代和 `heroIn` 0.6s 仍用字面时长。持续动画（`infinite`）实行注册表：装饰性（慢 6–12s）= `auroraPulse` 8s（唯一全屏背景动效）、`orbFloat` 6s/8s（首页两个 orb，动画声明挂在基类 `.glow-orb` 上，每个 orb 只有一层持续动画；第二层轨道旋转 `orbRotate` 已退役）、`float` 8s/6s（导航头光斑）、`pulse` 6s（空态图标）；功能性状态指示（可快于 6s，只在对应状态期间存在）= `spin` 0.8s（加载）、`syncDotPulse` 1s（同步中）、`skeletonPulse` 2.4s（骨架屏）；reduced-motion 替代 = `loadingPulse` 1.6s（仅透明度）。新增或删除持续动画必须同步本表与测试注册表。玻璃 blur：合成不透明度接近 1 的面不写 backdrop-filter；仍模糊的单面 ≤20px，全屏遮罩 ≤8px（`.day-sheet-mask` 对齐 frontmatter `modal-overlay` 登记的 8px——88% 不透明海军底上更大的 blur 不可见，纯 GPU 开销），每个 WXSS 文件的玻璃面（backdrop-filter 规则）数量上限由测试棘轮钉住，只允许收紧。阴影：颜色与透明度仍由上文阴影注册表管，每文件 `box-shadow` 声明数上限同法钉住。`@media (prefers-reduced-motion: reduce)` 政策：移除位移/缩放/旋转与装饰动画，状态反馈走无位移通道——加载=透明度脉冲（不静默）、同步中=玫瑰点静态色、骨架=静态哑光占位块、按压=即时 scale + 既有底色变化、弹层=进出立即到位、88% 海军遮罩保留层级（issue #116）、日历切换=即时替换（月份标题文案变化承载状态）；翻月没有计时器，即时替换。滑动翻月（issue #137）：日历区域用 WXS 判定，与弹层拖动同一种模式；水平位移超过 48px 且大于竖直位移才翻月，否则留给轻点和竖向滚动；不跟手、不加翻页动画，松手后一次页面更新完成；减弱动效下同样即时。日期格不做颜色过渡。两个编辑页的边框/背景过渡由页面级 reduced-motion 块即时切换，无渐进（issue #106）。护栏：`tests/motion-performance.test.js`。
- 首页底部弹层进出（issue #116）：选择月份、当日操作、工具菜单、图例/预测说明/本月小结共用同一生命周期，页面数据状态为 closed、open、leaving，再回到 closed。进场先以关闭姿态挂载，下一次渲染加上打开姿态，由 CSS transition 完成，不用入场关键帧，因此中途可以反向。离场计时 `--duration-exit`（200ms）到点卸载，不依赖 transitionend。离场途中再次打开会取消卸载并回到 open，过渡从当前位置返回。面板用 `translateY(100%)` 落到屏幕外（含自身高度与底部留白，不写死像素）：进场 `var(--duration-sheet)` 与 `var(--ease-out)`，离场 `var(--duration-exit)` 与 `var(--ease-out)`。遮罩透明度进场 `var(--duration-enter)`，离场 `var(--duration-exit)`。遮罩和面板是兄弟节点（issue #134）：遮罩单独作为关闭控件朗读，面板内控件各自可达。离场时遮罩和面板都是 `pointer-events: none`，不拦截点按。减弱动效下这些过渡为 none，画面立即到位，元素仍等到计时结束再卸载。原生 tabBar 在弹层处于 open 或 leaving 时隐藏，离场卸载后恢复；减弱动效下这次隐藏和恢复不播放动画。系统返回由页面容器拦截，先走这条离场，不离开页面。把手和标题行可以拖动（issue #119）：竖直移动超过 10px 才开始，拖动开始后再落下的手指忽略；跟手在 WXS 里直接设置面板 transform，不逐帧 setData。向下 1:1，向上越过停放位置时位移 = 越界量 × 面板高度 × 0.55 /（面板高度 + 0.55 × |越界量|）。松手把位移、耗时和面板高度交给页面：向下位移超过面板高度的 25%，或向下速度（位移 / 耗时）超过 0.11 px/ms，走同一条离场，从当前拖动位置过渡到屏幕底边外；否则清掉内联位移，面板用 `var(--duration-exit)` 与 `var(--ease-out)` 回到原位。向上拖不关闭。可滚动的内容不是拖动区。减弱动效下跟手仍在，松手后的关闭或复位立即完成。遮罩 88% 海军与 z-index 层级保持不变。
- 首页弹层遮挡时暂停常驻装饰（issue #118）：任一首页弹层处于 `open` 或 `leaving` 时，页面根节点带 `page-obscured`。极光背景（`.page::before`）、两个光球（`.glow-orb`）和导航头两个光斑（`.header-gradient::before`、`.header-gradient::after`）在该标记下为 `animation-play-state: paused`。全部弹层卸载后去掉标记，动画从暂停的那一帧继续。这五层的动画名称和周期不变。减弱动效仍把它们设为 `animation: none`，暂停规则不取代这条。月份导航、周头、日历网格与月份箭头都不再使用 backdrop-filter：这些面的合成不透明度接近 1，模糊看不见。首页 `pages/index/index.wxss` 的玻璃面数量上限收紧为 1，只保留 88% 遮罩的 `blur(8px)`。
- 弹层之间的交接（issue #117）：从工具菜单打开图例、预测说明或本月小结时，同一次页面更新直接卸下菜单（不进入 leaving，不播离场），信息弹层带着交接标记 `sheet-handoff` 挂载。这个标记让遮罩在挂载时就是完全不透明（`opacity: 1`，`transition: none`），不走遮罩淡入；面板仍从底边 `translateY(100%)` 升到 0，时长与曲线沿用 `--duration-sheet` 与 `--ease-out`。交接这一拍遮罩已经盖住页面，`page-obscured` 保持，装饰不在这一帧恢复播放。之后关闭信息弹层先去掉交接标记，再走普通离场。直接打开预测说明（状态卡）没有交接标记，遮罩仍按进场淡入。当日操作弹层里点「查看详情」时，新内容带 `day-detail-fade`，只动透明度：`dayDetailFade` 从 0 到 1，时长 `var(--duration-state)`，曲线 `var(--ease-out)`。面板高度不参与过渡。减弱动效下这段动画为 none，内容直接显示。直接打开详情（不是从操作列表切过去）不带这个标记。
- 首页同步胶囊进出（issue #120）：什么时候显示、隐藏、切换文案，以及 1600ms 自动隐藏，都不变。胶囊复用弹层出场生命周期，页面数据状态为 closed、open、leaving，再回到 closed；`syncStatusMounted` 为 false 即卸载。进场先以隐藏姿态挂载（透明度 0、`translateY(-8rpx)`），下一次渲染进入显示（透明度 1、`translateY(0)`），由 CSS transition 完成，不用入场关键帧，因此中途可以反向。离场是反向，时长 `var(--duration-exit)`，计时到点卸载，不依赖 transitionend。离场途中又有新的同步状态会取消卸载并回到 open，过渡从当前位置返回。进场时长 `var(--duration-enter)`，进出曲线都是 `var(--ease-out)`。`status` 角色和朗读名仍与 `syncStatusText` 同源。减弱动效下这些过渡为 none，画面立即到位，元素仍等到计时结束再卸载。同步中圆点 `syncDotPulse` 保持不变。
- `tabBar.borderStyle` 为 `white`（浅色发丝）。不要改成 `black`。未选中 `tabBar.color` 为 `#7A7C8C`：弱于选中玫瑰 `#E8909E`，在画布 `#0A0E27` 上达到 4.5:1。
- `page` 没有 `auroraFlow`；全屏动感只保留 `.page::before` 的 `auroraPulse`（8s）。极光层是视口的 105%×105%，`top` / `left` 为 -2.5%，刚好盖住 `scale(1.05)`，不再用 200%×200%。动画名、8s 周期，以及弹层遮挡时暂停，都不因此改变。画布底为 `#0A0E27`。
- 各页 0.62–0.94 信息文本透明度是逐元素调校，不要机械归并。
- 可点控件只描述 Default 与 Pressed。Pressed 用 `:active` `scale(0.94–0.98)`；主按钮 `.btn-premium` 为 `0.96`。
- `calendar-cell` 与下文日历状态表对齐 `pages/index`。经期是 22% 玫瑰连续色带，不是实色整格选中底。
- 日历微字 `.day-tag` / `.predict-mark` 字号为 `26rpx`（caption 量级）。节日是无底金字，调休「班」仍是低调小标签；`.day-tag` 与 `.day-tag-line` 盒高 `38rpx`（大于字号，覆盖 caption 行高），避免 CJK 被裁切。compact 密度下仍放进日期与标记，不把微字再缩小。

主填充按钮是玫瑰底 `#E8909E` + 画布海军字 `#0A0E27`，玫瑰填充一律写 `var(--aurora-pink)`（`.btn-premium`、`.copy-btn` 与首页的 `.quick-btn`、`.reminder-action`、`.jump-option.active`、`.copy-recap` 由 `tests/design-token-guardrail.test.js` 钉住单一来源，`tests/filled-cta-contrast.test.js` 钉住玫瑰底海军字 4.5:1 对比度）。全页面（含绑定页）同一套玫瑰主操作，无页面级例外。护栏为 deny-by-default：任何选择器的渐变填充（linear/radial/conic）与实色玫瑰字面量填充（`#E8909E` / `rgb(232,144,158)` / `rgba(232,144,158,1)`）都必须落在测试登记的装饰例外白名单内，新增主操作按钮写字面量玫瑰或渐变填充会被直接拒绝。同结构的复制键和选中块走同一对色。不要把白字叠玫瑰写成规范。记录 tab 进行中经期的时长胶囊（`.item-duration.ongoing`）也用这一对：画布海军字叠 92% 玫瑰底，合成在列表卡上后文字对比度 ≥4.5:1，由 `tests/contrast-guardrail.test.js` 钉住。主按钮（`.btn-premium`、`.quick-btn`、`.reminder-action`、`.copy-recap`）只有一种形状：`var(--radius-md)`。复制键和重试小按钮不是主按钮。分段控件（记录分类 `.segment-option`、设置密度 `.density-option`、绑定页创建/加入 `.tab`）只有一种选中态：玫瑰字 `#E8909E`、`rgba(232,144,158,0.08)` 底、`rgba(232,144,158,0.45)` 描边，不用实色玫瑰填充。

元数据金 `#D4A574` 只表示下次可能开始的日子（「预」）和节日文字，以及已登记的预测与确定性元数据（同步状态点、预测日期、详情里的预测与节日标题）。调休「班」不用金。实色金一律 `var(--aurora-gold)`。节日是无底金字：不铺整格金底，也不铺金底胶囊。玫瑰 → 金的 135deg 渐变曾是 CTA 误用形态，已随 issue #55 退役：`--gradient-gold` token 已从 `app.wxss` 删除，任何页面不得再引用（design-token 护栏强制）。玫瑰 → 薰衣草的 `--gradient-pink` 同样无屏上引用，已随 issue #59 一并退役；渐变填充不再以 token 形式提供。首页金色只允许落在白名单规则上（`.predict-mark`、`.predict-date`、`.prediction-summary`、`.reminder-rail`、`.holiday-tag`、`.sync-dot`、`.detail-title`、`.detail-meaning.predict`/`.holiday`），由 `tests/design-token-guardrail.test.js` 的金语义白名单钉住。页面 WXSS 不得再出现 `#D4A574` 字面量。金的 rgba 只留给描边或辉光（「预」的描边、同步点光晕），不铺节日标签底。

不安装、不覆盖成外部品牌设计系统。系统名仍是 Aurora Bloom。

## Overview

Aurora Bloom is a premium wellness dark theme for minmin-calendar — a period tracking and diary app. Rose tones on deep navy with soft glassmorphism surfaces and subtle aurora animations.

## Colors

Primary: warm rose #E8909E. Secondary: soft lavender #C4A0D2. Accent: warm gold #D4A574.
BG: deep navy #0A0E27 canvas with #1A0A2E and #12163D for surfaces. Canvas navy is also the primary-fill label color.
Warning red: #F97373 — 唯一警示色，语义与形态见下文「警示红语义」。
成功/完成态（如绑定成功 `.bound-status`）用主色玫瑰 #E8909E 表达；色板不引入绿色。全部 WXSS 的 hex 颜色必须落在本文件登记的色板内，由 `tests/design-token-guardrail.test.js` 护栏。
Aurora base gradient (`.page::before` 末层): #0A0E27 → #1A0A2E → #2D1B69 → #0A0E27，中间色 #2D1B69 登记为 `--aurora-bg3`。
Shadow / overlay 登记：卡片与日历网格投影 `rgba(0,0,0,0.2)`；浮层小投影 `rgba(0,0,0,0.12–0.15)`；底部 sheet 上缘投影 `rgba(0,0,0,0.34)`；海军近景投影与字阴影 `rgba(10,14,39,0.16–0.35)`（自定义导航返回键与标题）；sheet 遮罩 `rgba(10,14,39,0.88)`（画布海军 88% 透明度）；玻璃回退实色 `rgba(18,22,61,0.92)`；底部 sheet 面板为 `linear-gradient(160deg, rgba(232,144,158,0.12–0.14), rgba(196,160,210,0.08) 42–45%, rgba(18,22,61,0.94–0.96))` 叠同透明度海军实底；inset 顶线高光 `rgba(255,255,255,0.09–0.22)`；辉光阴影随主色走——玫瑰 `rgba(232,144,158,0.1–0.45)`、浅粉 `rgba(240,196,192,0.28–0.32)`、金 `rgba(212,165,116,0.3–0.5)`（含 sheet-action 金 inset 0.3）、警示红 `rgba(249,115,115,0.38)`。不可点元素不再发光：月份导航没有玫瑰投影，加载圈和同步点没有光晕，绑定页爱心只留一层 `0 0 18rpx rgba(240,196,192,0.32)`。主按钮和复制键的玫瑰光保留。提醒与详情的彩色 rail 保留，因为它们承载状态色。

Removed from original: neon green, hot pink, cyan, bright gold. Too aggressive for a wellness app.

## 绑定页紫域试点：结论「不推广」（issue #86-#89 → #104）

issue #86–#89 的绑定页紫粉试点（深紫画布、紫玻璃 tint、粉胶囊/粉幽灵按钮、升档玫瑰成功标题）结论是**不推广**：启动首屏已于 issue #104 收敛回 Aurora Bloom，与进入后的页面同一套视觉。试点的 `--bind-*` 页面级 token、深紫画布覆盖、粉胶囊主按钮/复制键/选中 tab、粉幽灵「解除绑定」、紫玻璃 tint 与深紫回退全部移除，本文件 frontmatter 的例外色板登记（bind-canvas-top/bottom、bind-cta-pink、bind-ghost-pink、bind-status-rose）同步删除，色板护栏回到 deny-by-default 单一 Aurora 色板——紫粉字面量不再有任何登记来源，重新引入会被 `tests/design-token-guardrail.test.js` 直接拒绝。

试点后绑定页保留的唯一情绪点是 ♥ 一层静态辉光 hero（`0 0 18rpx rgba(240,196,192,0.32)`，落在「Shadow / overlay 登记」的浅粉 0.28–0.32）与 `heroIn` 无回弹入场；减弱动效按 app.wxss 全局名单静止。不可点元素不再发光。成功标题 `.bound-status` 回到主色玫瑰 `#E8909E`，在海军卡合成面上 ≥4.5:1，由 `tests/secondary-affordance-contrast.test.js` 钉住。

启动首屏校验中（issue #115）：第一次房间校验出结果前只渲染品牌心，`heroIn` 0.6s 入场保持不变；不渲染创建/加入卡、已绑定卡和错误条。已绑定则继续只留心并进入首页，只有跳转失败才露出已绑定卡和「进入应用」。未绑定或校验失败时，卡片（失败时连同错误条和「重试」）用 `bindReveal` 显现：透明度 0→1，自 `translateY(16rpx)` 回到 0，时长 `var(--duration-enter)`，曲线 `var(--ease-out)`。减弱动效下这次显现立即出现，无位移、无淡入。再次 `onShow` 或点「重试」不回到只留心的校验中。

#78 同款契约重建（issue #104）：绑定页与设置页复制键回归同一色域与同一形态（玫瑰底 `var(--aurora-pink)`、海军字 `#0A0E27`、`--radius-sm`、`padding: 0 28rpx`、玫瑰辉光投影 `0 4px 15px rgba(232,144,158,0.28)`），像素同款契约按原「重建条件」恢复——`tests/bind-room-flow.test.js` 恢复两页 fill/label/radius/padding/shadow 全等断言，锚定设置页 `.copy-btn`（设置页侧零改动），在此重新登记。

## Typography

System font stack for zero-bloat + excellent CJK rendering;全页面只继承 `app.wxss` 的 `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', sans-serif`，不声明 `@font-face`、不引入外部字体（`tests/typography-hierarchy.test.js` 护栏）。H1 2rem/700 for month titles. Body-lg 1.0625rem/400/1.6 for diary reading. Caption 0.8125rem/500; week headers keep natural letter-spacing and do not add tracking. Calendar holiday tags and 「预」 stay at caption scale: `.day-tag` / `.predict-mark` are `26rpx`. The holiday/workday `.day-tag` box is `38rpx` tall so CJK glyphs are not clipped.

首页月份标题层级：`.month-title` 走 `--font-size-month-title`（40rpx）与 `--font-weight-title`（700），字距保持自然，不另加 letter-spacing；明显高于各页共享导航标题 `.nav-title`（`--font-size-title` 34rpx / 同一标题字重 700）。层级差来自字号（≥6rpx），不来自更重的 800。`line-height: var(--line-height-title)`（1.2）+ `white-space: nowrap` 保证单行完整显示，最坏文案「2026年12月」在 750rpx 视口的月份导航行内不溢出。层级差、单行与宽度账本由 `tests/typography-hierarchy.test.js` 钉住。

caption 家族行高策略：流式说明文字（`.form-hint`、`.symptom-group-label`、`.settings-group-title`、`.room-code-label`）统一 `line-height: var(--line-height-assist)`（1.4）与 `font-weight: var(--font-weight-assist)`（500）；单行控件（`.copy-btn`）以盒高居中——盒高 88rpx flex 居中，不另设文字行高。图例符号复用日历格标记类，不另设 `.legend-symbol`。六族统一走 `--font-size-caption`（26rpx），由 `tests/typography-hierarchy.test.js` 钉住。

信息性文字下限：日历格内微字（农历、经期/欢乐时光标记、预测徽标）不小于 `24rpx`；日历格外 caption（统计标签、同步状态、说明文字）不小于 `26rpx`。低于下限的诉求靠缩短文案或调整布局吸收，不缩小字号。

### 共享字号角色（issue #53，`app.wxss` token 为唯一来源）

frontmatter 的 rem 值是设计参照；实现层全部走下表 rpx 角色 token。页面 WXSS 的 `font-size` 只允许 `var(--font-size-*)`；例外必须登记在 `tests/typography-roles.test.js` 的 `TYPOGRAPHY_EXCEPTIONS`（glyph = 箭头/emoji/标记字形，尺寸随容器几何；display = 展示型大数字/大字，单点登记）。

| token | 值 | 角色 | 典型使用 |
|---|---|---|---|
| `--font-size-month-title` | `40rpx` | 首页月份大标题（高于全局导航一级） | `.month-title` |
| `--font-size-title` | `34rpx` | 标题 | `.nav-title`、`.sheet-title`、`.no-room-title` |
| `--font-size-body-lg` | `32rpx` | 正文大号 | `.predict-date`、`.prediction-summary`、`.jump-year-value`、`.bound-status` |
| `--font-size-body` | `28rpx` | 正文 | 列表主行、`.month-header-text`（欢乐时光月份卡头，issue #108）、`.tab`、`.menu-text`、`.quick-text`、`.empty-state` |
| `--font-size-caption` | `26rpx` | caption（页面外下限） | 说明/标签/统计文字、`.day-tag`、`.predict-mark`、`.form-label`、流量/症状 chips、`.copy-btn`、`.month-toggle`（月份卡「展开/收起」，issue #109）等次级小操作 |
| `--font-size-calendar-date` | `28rpx` | 日历日期（full 密度） | `.day-num` |
| `--font-size-calendar-date-compact` | `30rpx` | 日历日期（compact 密度） | `.calendar-density-compact .day-num` |
| `--font-size-calendar-micro` | `24rpx` | 日历格内微字（下限） | `.day-lunar`、`.memory-mark` |
| `--font-size-button` | `30rpx` | 主按钮 | `.btn-premium`、`.btn-danger` |
| `--font-size-input` | `32rpx` | 输入文字 | `.form-input`、`.form-picker` |

主按钮角色（30rpx）只属于主按钮族；sheet 确认、复制等小操作文字按正文/caption 角色，不另立按钮字号。glyph/display 例外清单（`.nav-back` 46rpx、`.sheet-close` 46rpx、箭头 42/32rpx、emoji 图标、`.stat-num` 36rpx、`.cycle-num` 44rpx、`.hero-title` 48rpx、`.code-input` 40rpx、`.room-code-value` 36rpx 等）是收敛过程中登记的历史单点，后续字号层级 ticket 可逐项消化，但新增例外必须先登记。

### 共享文字字重、行高与字距（issue #62）

字号仍只来自上一节的 `--font-size-*`。字重、阅读行高和字距的数值只写在 `app.wxss` 下列 token；页面引用 `var(--…)`，不另写 400/500/600/700 或同义字距。文字角色不保留 800。

| token | 值 | 角色 |
|---|---|---|
| `--font-weight-body` | `400` | 正文、正文大号、输入文字 |
| `--font-weight-assist` | `500` | 辅助说明、农历、节日/调休/预测文字 |
| `--font-weight-control` | `600` | 普通日历日期、主按钮与其他关键控件 |
| `--font-weight-title` | `700` | 月份标题、导航/页面标题 |
| `--line-height-body` | `1.6` | 流式正文 |
| `--line-height-assist` | `1.4` | 流式辅助说明 |
| `--line-height-title` | `1.2` | 月份标题单行 |
| `--letter-spacing-assist` | `1rpx` | 有水平余量的流式辅助说明 |
| `--letter-spacing-room-code` | `6rpx` | 房间码展示串，逐字核对，不是辅助说明字距 |
| `--letter-spacing-code-input` | `12rpx` | 6 位房间码输入，逐字槽位，不是辅助说明字距 |

今天（`.day-cell.today .day-num`）复用 `--font-weight-title`（700），作为相对普通日期 600 的语义强调；等宽数字仍由 `.day-num` 的 `tabular-nums` 继承。不另设第五档字重。

统计数字（`.stat-num`、`.cycle-num`）按可扫读的数字信息处理，字重走 `--font-weight-control`（600）并保留 `tabular-nums` 与既有展示字号。不因历史展示例外保留 800，也不把它们升成标题。

房间码（`.room-code-value`、`.bound-code`）同样走控件字重 600 与 `tabular-nums`，字距只用 `--letter-spacing-room-code`。无码占位 `.room-code-value.muted` 回到正文 400，字距复位为 0。`.code-input` 是输入文字，字重 400，字距只用 `--letter-spacing-code-input`。它的盒高和行高都是 88rpx，纵向 padding 为 0，六位码在框内完整可见并水平居中；输入框通栏，与上方说明和下方主按钮对齐。占位符走同一行高。

流式辅助说明在有水平余量时使用 `--letter-spacing-assist`。格内农历、节日/调休/预测文字、单字周标题、按钮标签和标题保持自然字距，不靠加字距或缩小字号制造轻盈。胶囊盒高和日历格留白不在本角色表里改。完整密度的格内农历只显示日名，农历初一显示月名（含闰月，如「闰四月」）；完整农历字符串留在日历格无障碍名称和日详情副标题。格内仍单行、不用省略号。清爽密度不显示农历。

字形例外：`.sheet-action-icon`、`.jump-year-step` 是圆点、心形或步进箭头，不是阅读文字。它们保留字重 800 与既有字号，避免图标观感被文字角色改写。图例样本复用格内的 `.day-tag`、`.predict-mark`、`.memory-mark`、`.day-num` 与 `.period-band`，这些状态字走各自已有的辅助字重，不另设图例符号盒。

## Components

Cards keep the glass tint without backdrop-filter: `rgba(255,255,255,0.08)` overlay as a flat `linear-gradient` over `var(--glass-fallback)` (`.premium-card` uses `linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback)`), plus a top-edge highlight. The fill is already near opaque, so blur is not painted on cards, the navbar, the calendar, or danger buttons. A color is legal only as the last `background` layer; a two-color shorthand paints nothing. No extra decorative shadows.

Primary fill (`.btn-premium`, `.copy-btn`): rose `#E8909E` fill, label `#0A0E27`. Ghost / outline, if used: transparent on canvas navy `#0A0E27`, rose border and rose label — readable on navy, not white type on rose.

Prediction metadata, reminder cards, and period tag chips stay compact and low-noise. Interactive chips need at least a 44px touch target; active chips use navy type on rose. Calendar cell states are listed under 借入规则; a visual mark still means only one thing.

## 警示红语义

警示红 `#F97373` 是全色板唯一的警示色，一族只表示「需要注意的负面状态」，目前在屏上有四种形态：

| 形态 | 位置 | 表现 |
|---|---|---|
| 危险操作按钮 | `.btn-danger`（删除记录；绑定页 needUnbind 中间态的解除绑定入口；app 级基类） | 红字 + `rgba(249,115,115,0.28)` 描边，不透明海军实底（`var(--glass-bg)` 叠 `rgba(18,22,61,0.92)`）；Pressed 叠 `rgba(249,115,115,0.12)`、`scale(0.95)` |
| 危险菜单行 | `.menu-item.danger`（设置页页底危险区：解除绑定） | 红字 + `rgba(249,115,115,0.28)` 描边 + 海军实底；Pressed 叠 `rgba(249,115,115,0.12)`、`scale(0.95)` |
| 逾期提醒 | `.reminder-card.overdue .reminder-rail` | 6rpx 细 rail 实色填充 + `rgba(249,115,115,0.38)` 辉光 |
| 表单错误 | `.error-msg`（绑定页） | 红字 + `rgba(249,115,115,0.1)` 浅底 + `rgba(249,115,115,0.24)` 描边 |

「解除绑定」属危险操作：设置页页底危险区的 `.menu-item.danger` 菜单行（issue #102 从绑定页已绑定卡迁入，issue #139 再从房间组挪到页底；有房间码才出现，解绑成功回绑定页）与绑定页 needUnbind 中间态（错误恢复路径）的就地解除入口（跟随 app 级 `.btn-danger` 基类）；issue #88 试点的粉幽灵形态已随 issue #104 收敛移除，不再存在红族之外的解除绑定样式。重新同步房间不是危险操作，不用这行样式。绑定页的校验失败重试 `.error-retry`（issue #102）是表单错误同族的轻量按钮——红字 + 同款浅底描边，Pressed 叠更深一档红 tint `rgba(249,115,115,0.24)`，无 transform 过渡。

同一含义共享同一红色，组件角色靠形态（按钮 / 细 rail / 文案条）区分，不靠颜色分叉；不引入第二种红。

与「一个符号只表一意」家规的关系：家规约束同一符号不得表二意；警示红一族是反向合规——同一含义（负面状态）复用同一符号（这个红），形态承载角色、颜色不承载区分。若给逾期、危险、错误各配一种红，同一含义裂成多个符号，反而违反家规。

## Do's and Don'ts

- Do use warm rose as the sole bright tappable color
- Do use canvas navy `#0A0E27` on rose for primary-fill labels
- Do use warm gold for secondary certainty/range metadata
- Do keep the reviewed tab top hairline (`tabBar.borderStyle: white`)
- Do keep animations slow (6-12s cycles)（装饰性持续动画；加载/同步等功能性指示与 reduced-motion 替代按「动效与性能边界」注册表执行）
- Do document Default and Pressed only; press uses `scale(0.94–0.98)`
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
- 控件状态只写 Default 与 Pressed。Pressed 用 `transform: scale(0.94–0.98)`，主按钮 `.btn-premium` 为 `0.96`。
- 触控高度至少 44px。日历格在 compact 密度下仍须能读日期与标记。落地面换算（issue #107 评审澄清）：通用控件按 750rpx 设计宽执行为盒高 ≥88rpx（44px@375px），`.copy-btn`、重试入口、分段选项与「记录」tab 欢乐时光月份卡头（issue #109）同档；320px 换算口径（compact 104rpx ≈ 44.4px@320px）只登记给日历格（issue #56 窄屏几何），不外推到其他控件。
- 卡片、按钮、正文不加新的装饰阴影。现有玻璃 inset 与主按钮玫瑰光保持，不叠第二套 elevation。

### 日历格状态（cal 的状态表写法，语义用本产品）

| 状态 | 标记 | 格子 |
|---|---|---|
| 今天 | 薰衣草描边、玫瑰底、玫瑰色日期，不用爱心 | `todayBg` + 薰衣草内描边，描边画在色带之上；非经期日期字 `#E8909E`；经期色带上的日期字 `rgba(255,255,255,0.92)` |
| 经期 | 22% 玫瑰连续色带 `rgba(232,144,158,0.22)` | 起点与终点用整圆头，中段在行内直角相连，换行在行首行尾收口；单日是圆块；进行中投影到今天的一端开口。不铺实色整格底。重叠日只表达经期。色带无过渡，减弱动效下立即出现。♥ 画在色带之上 |
| 欢乐时光 | ♥ `#F0C4C0` | 仅欢乐时光 |
| 下次可能开始的日子 | 金色「预」 | 已是经期日时不叠「预」。底透明，描边可留金。今天落在这个窗口时，「预」在今天玫瑰底与自身底的合成面上 ≥4.5:1 |
| 节日 | 无底金色文字 | 不铺整格金底，也不铺金底胶囊。今天仍用今天的玫瑰底和薰衣草描边 |
| 调休上班 | 「班」 | 低调小标签，低对比底，不用金。今天仍用今天的玫瑰底和薰衣草描边 |

同一天可叠多种标记，但每个符号只表示上表一行。空格（非本月）隐藏，不参与状态。

图例项由 `utils/homeCalendarState.js` 的 `CALENDAR_LEGEND_ITEMS` 驱动：`cellClass` 与 `parts.className` 就是日历格上的那些类，模板不再另画 `.legend-symbol`。经期图例是单日圆角色带。今天的说明与格子一致：薰衣草描边、玫瑰底、玫瑰色日期。「预」的说明是「下次可能开始的日子」。样本只把格子收成 72rpx 方格，不改标记的颜色和形状。

完整密度的格内农历用 `lunarCellText`：平时是日名，农历月初一是月名。`lunarText` 的完整字符串只出现在读屏名和日详情副标题。清爽密度不显示农历；节日和调休两档都显示。设置页「日历显示」写明：清爽只看日期与标记（含节日和调休），完整另外显示农历。

### 明确不借

| 来源 | 不采用 |
|---|---|
| `apple` | Action Blue、博物馆白底、禁止玻璃/渐变、具名 SF Pro、金不能做元数据 |
| `cal` | 白底、黑 CTA、Cal Sans、卡片圆角上限 16px、36–40px 触控、深色只给页脚 |

`clay`、`renault` 目录文案与模板正文不符，不作为参考。`airbnb`、`claude`、`linear.app` 本次未借入。
