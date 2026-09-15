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
  full: 9999px
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
    rounded: 9999px
    padding: 12px 28px
    pressScale: 0.95
  calendar-cell:
    rounded: 16px
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
    rounded: 9999px
  prediction-meta:
    textColor: "rgba(255,255,255,0.58)"
    confidenceBg: "#D4A574"
    confidenceText: "#0A0E27"
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

- 圆角 token（`app.wxss`）：`--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-xl` 为 `12rpx` / `20rpx` / `28rpx` / `36rpx`。`.premium-card` 圆角为字面值 `24rpx`。
- 玻璃叠层：`--glass-bg` 为 `rgba(255,255,255,0.08)`；卡片边框常用 `rgba(255,255,255,0.12)`（含 `--glass-border`）。共享玻璃卡（`.premium-card` 等）在同一 `background` 里叠不透明海军或玫瑰底（`.premium-card` 现为 `var(--glass-bg), rgba(18,22,61,0.92)`）。`backdrop-filter` 与 `-webkit-backdrop-filter` 成对写；忽略模糊时仍是实色面，不要只留半透明空框。
- `tabBar.borderStyle` 为 `white`（浅色发丝）。不要改成 `black`。未选中 `tabBar.color` 为 `#7A7C8C`：弱于选中玫瑰 `#E8909E`，在画布 `#0A0E27` 上达到 4.5:1。
- `page` 没有 `auroraFlow`；全屏动感只保留 `.page::before` 的 `auroraPulse`（8s）。画布底为 `#0A0E27`。
- 各页 0.62–0.94 信息文本透明度是逐元素调校，不要机械归并。
- 可点控件只描述 Default 与 Pressed。Pressed 用 `:active` `scale(0.94–0.98)`；主按钮 `.btn-premium` 为 `0.96`。
- `calendar-cell` 与下文日历状态表对齐 `pages/index` 与 `CALENDAR_LEGEND_ITEMS`。没有「整格选中底 = 经期」。
- 日历微字 `.day-tag` / `.predict-mark` / `.predict-confidence` 为 `26rpx`（caption 量级）；compact 密度下仍放进格子，不继续缩小。

主填充按钮是玫瑰底 `#E8909E` + 画布海军字 `#0A0E27`。同结构的复制键（`.copy-btn`）和绑定选中块走同一对色。不要把白字叠玫瑰写成规范。

不安装、不覆盖成外部品牌设计系统。系统名仍是 Aurora Bloom。

## Overview

Aurora Bloom is a premium wellness dark theme for minmin-calendar — a period tracking and diary app. Rose tones on deep navy with soft glassmorphism surfaces and subtle aurora animations.

## Colors

Primary: warm rose #E8909E. Secondary: soft lavender #C4A0D2. Accent: warm gold #D4A574.
BG: deep navy #0A0E27 canvas with #1A0A2E and #12163D for surfaces. Canvas navy is also the primary-fill label color.

Removed from original: neon green, hot pink, cyan, bright gold. Too aggressive for a wellness app.

## Typography

System font stack for zero-bloat + excellent CJK rendering. H1 2rem/700 for month titles. Body-lg 1.0625rem/400/1.6 for diary reading. Caption 0.8125rem/500 with letter-spacing for week headers. Calendar holiday tags and 「预」 stay at caption scale: `.day-tag` / `.predict-mark` / `.predict-confidence` are `26rpx`.

## Components

Cards use glassmorphism: `rgba(255,255,255,0.08)` overlay + `blur(20px)` + paired `-webkit-backdrop-filter` + top-edge highlight. Blur is an enhancement: the same rule also keeps an opaque enough navy or rose fill (`.premium-card` uses `var(--glass-bg), rgba(18,22,61,0.92)`) so the card remains a solid surface if `backdrop-filter` is ignored. No extra decorative shadows.

Primary fill (`.btn-premium`, `.copy-btn`, bind selected block): rose `#E8909E` fill, label `#0A0E27`. Ghost / outline, if used: transparent on canvas navy `#0A0E27`, rose border and rose label — readable on navy, not white type on rose.

Prediction metadata, reminder cards, and period tag chips stay compact and low-noise. Interactive chips need at least a 44px touch target; active chips use navy type on rose. Calendar cell states are listed under 借入规则; a visual mark still means only one thing.

## Do's and Don'ts

- Do use warm rose as the sole bright tappable color
- Do use canvas navy `#0A0E27` on rose for primary-fill labels
- Do use warm gold for secondary certainty/range metadata
- Do keep the reviewed tab top hairline (`tabBar.borderStyle: white`)
- Do keep animations slow (6-12s cycles)
- Do document Default and Pressed only; press uses `scale(0.94–0.98)`
- Don't treat white-on-rose as the button spec
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
