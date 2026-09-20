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
    backdropFilter: "blur(20px)"
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
    periodMark: "#E8909E"
    memoryMark: "#F0C4C0"
    predictMark: "#D4A574"
    holidayTagBg: "rgba(212,165,116,0.9)"
    holidayTagText: "#0A0E27"
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

- 圆角 token（`app.wxss`）：`--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` 为 `12rpx` / `20rpx` / `28rpx` / `36rpx`，另有 `--radius-card: 24rpx`（卡片与日历块；`.premium-card`、导航返回底、`.month-nav` 等均走此 token）、`--radius-full: 999rpx`（胶囊）、`--radius-circle: 50%`（正圆点/圆钮）。`pages/index/index.wxss` 的 `border-radius` 只允许 token 与 `0` 复位，由 `tests/design-token-guardrail.test.js` 护栏。
- 玻璃叠层：`--glass-bg` 为 `rgba(255,255,255,0.08)`；卡片边框常用 `rgba(255,255,255,0.12)`（含 `--glass-border`）。共享玻璃卡（`.premium-card` 等）在同一 `background` 里叠不透明海军或玫瑰底（`.premium-card` 现为 `var(--glass-bg), rgba(18,22,61,0.92)`）。`backdrop-filter` 与 `-webkit-backdrop-filter` 成对写；忽略模糊时仍是实色面，不要只留半透明空框。
- `tabBar.borderStyle` 为 `white`（浅色发丝）。不要改成 `black`。未选中 `tabBar.color` 为 `#7A7C8C`：弱于选中玫瑰 `#E8909E`，在画布 `#0A0E27` 上达到 4.5:1。
- `page` 没有 `auroraFlow`；全屏动感只保留 `.page::before` 的 `auroraPulse`（8s）。画布底为 `#0A0E27`。
- 各页 0.62–0.94 信息文本透明度是逐元素调校，不要机械归并。
- 可点控件只描述 Default 与 Pressed。Pressed 用 `:active` `scale(0.94–0.98)`；主按钮 `.btn-premium` 为 `0.96`。
- `calendar-cell` 与下文日历状态表对齐 `pages/index` 与 `CALENDAR_LEGEND_ITEMS`。没有「整格选中底 = 经期」。
- 日历微字 `.day-tag` / `.predict-mark` 字号为 `26rpx`（caption 量级）。节日/调休 `.day-tag` 与 `.day-tag-line` 盒高 `38rpx`（大于字号，覆盖 caption 行高），避免 CJK 被裁切。compact 密度下仍放进日期与标记，不把微字再缩小。

主填充按钮是玫瑰底 `#E8909E` + 画布海军字 `#0A0E27`。同结构的复制键（`.copy-btn`）和绑定选中块走同一对色。不要把白字叠玫瑰写成规范。

不安装、不覆盖成外部品牌设计系统。系统名仍是 Aurora Bloom。

## Overview

Aurora Bloom is a premium wellness dark theme for minmin-calendar — a period tracking and diary app. Rose tones on deep navy with soft glassmorphism surfaces and subtle aurora animations.

## Colors

Primary: warm rose #E8909E. Secondary: soft lavender #C4A0D2. Accent: warm gold #D4A574.
BG: deep navy #0A0E27 canvas with #1A0A2E and #12163D for surfaces. Canvas navy is also the primary-fill label color.
Warning red: #F97373 — 唯一警示色，语义与形态见下文「警示红语义」。
成功/完成态（如绑定成功 `.bound-status`）用主色玫瑰 #E8909E 表达；色板不引入绿色。全部 WXSS 的 hex 颜色必须落在本文件登记的色板内，由 `tests/design-token-guardrail.test.js` 护栏。
Aurora base gradient (`.page::before` 末层): #0A0E27 → #1A0A2E → #2D1B69 → #0A0E27，中间色 #2D1B69 登记为 `--aurora-bg3`。
Shadow / overlay 登记：卡片与日历网格投影 `rgba(0,0,0,0.2)`；浮层小投影 `rgba(0,0,0,0.12–0.15)`；底部 sheet 上缘投影 `rgba(0,0,0,0.34)`；海军近景投影与字阴影 `rgba(10,14,39,0.16–0.35)`（自定义导航返回键与标题）；sheet 遮罩 `rgba(10,14,39,0.88)`（画布海军 88% 透明度）；玻璃回退实色 `rgba(18,22,61,0.92)`；底部 sheet 面板为 `linear-gradient(160deg, rgba(232,144,158,0.12–0.14), rgba(196,160,210,0.08) 42–45%, rgba(18,22,61,0.94–0.96))` 叠同透明度海军实底；inset 顶线高光 `rgba(255,255,255,0.09–0.22)`；辉光阴影随主色走——玫瑰 `rgba(232,144,158,0.1–0.45)`、浅粉 `rgba(240,196,192,0.28–0.32)`、金 `rgba(212,165,116,0.3–0.5)`（含 sheet-action 金 inset 0.3）、警示红 `rgba(249,115,115,0.38)`。

Removed from original: neon green, hot pink, cyan, bright gold. Too aggressive for a wellness app.

## Typography

System font stack for zero-bloat + excellent CJK rendering. H1 2rem/700 for month titles. Body-lg 1.0625rem/400/1.6 for diary reading. Caption 0.8125rem/500 with letter-spacing for week headers. Calendar holiday tags and 「预」 stay at caption scale: `.day-tag` / `.predict-mark` are `26rpx`. The holiday/workday `.day-tag` box is `38rpx` tall so CJK glyphs are not clipped.

信息性文字下限：日历格内微字（农历、经期/记忆标记、预测徽标）不小于 `24rpx`；日历格外 caption（统计标签、同步状态、说明文字）不小于 `26rpx`。低于下限的诉求靠缩短文案或调整布局吸收，不缩小字号。

## Components

Cards use glassmorphism: `rgba(255,255,255,0.08)` overlay + `blur(20px)` + paired `-webkit-backdrop-filter` + top-edge highlight. Blur is an enhancement: the same rule also keeps an opaque enough navy or rose fill (`.premium-card` uses `var(--glass-bg), rgba(18,22,61,0.92)`) so the card remains a solid surface if `backdrop-filter` is ignored. No extra decorative shadows.

Primary fill (`.btn-premium`, `.copy-btn`, bind selected block): rose `#E8909E` fill, label `#0A0E27`. Ghost / outline, if used: transparent on canvas navy `#0A0E27`, rose border and rose label — readable on navy, not white type on rose.

Prediction metadata, reminder cards, and period tag chips stay compact and low-noise. Interactive chips need at least a 44px touch target; active chips use navy type on rose. Calendar cell states are listed under 借入规则; a visual mark still means only one thing.

## 警示红语义

警示红 `#F97373` 是全色板唯一的警示色，一族只表示「需要注意的负面状态」，目前在屏上有三种形态：

| 形态 | 位置 | 表现 |
|---|---|---|
| 危险操作按钮 | `.btn-danger`（解除绑定、删除记录） | 红字 + `rgba(249,115,115,0.28)` 描边，不透明海军实底（`var(--glass-bg)` 叠 `rgba(18,22,61,0.92)`）；Pressed 叠 `rgba(249,115,115,0.12)`、`scale(0.95)` |
| 逾期提醒 | `.reminder-card.overdue .reminder-rail` | 6rpx 细 rail 实色填充 + `rgba(249,115,115,0.38)` 辉光 |
| 表单错误 | `.error-msg`（绑定页） | 红字 + `rgba(249,115,115,0.1)` 浅底 + `rgba(249,115,115,0.24)` 描边 |

同一含义共享同一红色，组件角色靠形态（按钮 / 细 rail / 文案条）区分，不靠颜色分叉；不引入第二种红。

与「一个符号只表一意」家规的关系：家规约束同一符号不得表二意；警示红一族是反向合规——同一含义（负面状态）复用同一符号（这个红），形态承载角色、颜色不承载区分。若给逾期、危险、错误各配一种红，同一含义裂成多个符号，反而违反家规。

## Do's and Don'ts

- Do use warm rose as the sole bright tappable color
- Do use canvas navy `#0A0E27` on rose for primary-fill labels
- Do use warm gold for secondary certainty/range metadata
- Do keep the reviewed tab top hairline (`tabBar.borderStyle: white`)
- Do keep animations slow (6-12s cycles)
- Do document Default and Pressed only; press uses `scale(0.94–0.98)`
- Don't treat white-on-rose as the button spec
- Don't fork the warning red into multiple reds; one red, distinguished by form
- Don't use neon/bright colors
- Don't use gradient text fills for body content
- Don't install an external brand design system

## 借入规则

从 awesome-design-md 的 `apple`、`cal` 只借入可在微信小程序落地的约束。系统名仍是 Aurora Bloom；未 `install` 品牌文件。改 UI 时对照本节与 `utils/homeCalendarState.js` 的 `CALENDAR_LEGEND_ITEMS`，颜色仍走本文件色板。

### 交互（apple，映射到本仓）

- 可点色只有玫瑰 `#E8909E`。金 `#D4A574` 只表示预测、区间或确定性，不当成第二颗 CTA。
- 控件状态只写 Default 与 Pressed。Pressed 用 `transform: scale(0.94–0.98)`，主按钮 `.btn-premium` 为 `0.96`。
- 触控高度至少 44px。日历格在 compact 密度下仍须能读日期与标记。
- 卡片、按钮、正文不加新的装饰阴影。现有玻璃 inset 与主按钮玫瑰光保持，不叠第二套 elevation。

### 日历格状态（cal 的状态表写法，语义用本产品）

| 状态 | 标记 | 格子 |
|---|---|---|
| 今天 | 玫瑰色光圈，不用爱心 | `todayBg` + 薰衣草内描边；日期字 `#E8909E` |
| 经期 | 玫瑰圆点 ● | 只用点，不铺整格底 |
| 欢乐时光 | ♥ `#F0C4C0` | 仅记忆日 |
| 预测区间 | 金色「预」 | 已是经期日时不叠「预」字 |
| 节日 | 金底海军字标签 | 浅金底，今天仍用今天光圈 |
| 调休上班 | 「班」 | 低对比底，今天仍用今天光圈 |

同一天可叠多种标记，但每个符号只表示上表一行。空格（非本月）隐藏，不参与状态。

### 明确不借

| 来源 | 不采用 |
|---|---|
| `apple` | Action Blue、博物馆白底、禁止玻璃/渐变、具名 SF Pro、金不能做元数据 |
| `cal` | 白底、黑 CTA、Cal Sans、卡片圆角上限 16px、36–40px 触控、深色只给页脚 |

`clay`、`renault` 目录文案与模板正文不符，不作为参考。`airbnb`、`claude`、`linear.app` 本次未借入。
