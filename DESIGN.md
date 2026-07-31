---
type: reference
title: "DESIGN"
tags: [project-docs, reference]
intent: "DESIGN"
version: alpha
name: Aurora Bloom
description: "Premium wellness dark theme for minmin-calendar — warm rose, soft lavender, gold on deep navy."
colors:
  primary: "#E8909E"
  secondary: "#C4A0D2"
  tertiary: "#F0C4C0"
  accent: "#D4A574"
  neutral: "#FFFFFF"
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
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
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
    backgroundColor: "rgba(255,255,255,0.06)"
    backdropFilter: "blur(20px)"
    rounded: 24px
    border: "1px solid rgba(255,255,255,0.1)"
    padding: 24px
  button-primary:
    backgroundColor: "#E8909E"
    textColor: "#FFFFFF"
    rounded: 9999px
    padding: 12px 28px
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#E8909E"
    border: "1.5px solid #E8909E"
    rounded: 9999px
    padding: 12px 28px
  calendar-cell:
    rounded: 16px
    textColor: "rgba(255,255,255,0.85)"
    selectedBg: "#E8909E"
    selectedText: "#FFFFFF"
    todayBorder: "1.5px solid #C4A0D2"
    periodBg: "rgba(232,144,158,0.25)"
  diary-card:
    backgroundColor: "rgba(232,144,158,0.06)"
    rounded: 24px
    borderLeft: "3px solid #E8909E"
    padding: 16px
  tab-bar:
    backgroundColor: "#0A0E27"
    borderTop: "1px solid rgba(255,255,255,0.06)"
    textColor: "rgba(255,255,255,0.4)"
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
---

## 实现状态

本文件是 Aurora Bloom 的目标视觉稿，不是当前 UI 的逐项实现清单。现有页面只完成了部分色彩与组件方向，运行时事实应以 `app.json`、`app.wxss` 和各页面 WXSS 为准；下文“已移除”的霓虹色、玻璃参数和动画周期均表示目标方向，不代表当前基线已经全部达成。

## Overview

Aurora Bloom is a premium wellness dark theme for minmin-calendar — a period tracking and diary app. Rose tones on deep navy with soft glassmorphism surfaces and subtle aurora animations.

## Colors

Primary: warm rose #E8909E. Secondary: soft lavender #C4A0D2. Accent: warm gold #D4A574.
BG: deep navy #0A0E27 canvas with #1A0A2E and #12163D for surfaces.

Removed from original: neon green, hot pink, cyan, bright gold. Too aggressive for a wellness app.

## Typography

System font stack for zero-bloat + excellent CJK rendering. H1 2rem/700 for month titles. Body-lg 1.0625rem/400/1.6 for diary reading. Caption 0.8125rem/500 with letter-spacing for week headers.

## Components

All cards use glassmorphism: rgba(255,255,255,0.06) bg + blur(20px) + subtle top edge highlight. No heavy shadows.

Prediction metadata, reminder cards, and period tag chips should stay compact and low-noise. Do not reuse the memory heart for today or prediction. Interactive chips need at least a 44px touch target.

## Do's and Don'ts

- Do use warm rose as sole bright accent
- Do use warm gold for secondary certainty/range metadata
- Do keep animations slow (6-12s cycles)
- Don't use neon/bright colors
- Don't use gradient text fills for body content
