---
type: adr
status: accepted
title: "ADR: 应用内确认与界面复用方式"
tags: [project-docs, adr, ui, confirmation, templates]
intent: "确定确认交互的承载方式、跨页界面复用方式与本轮渲染技术边界"
---

# ADR: 应用内确认与界面复用方式

**Status:** Accepted
**Date:** 2026-11-16
**Decision source:** [epic #200](https://github.com/Baker4real/minmin-calendar/issues/200)，由 [#202](https://github.com/Baker4real/minmin-calendar/issues/202) 建立护栏前置。

## Context

删除、解除绑定、重新同步、导出和开始日归属等确认需要完整按钮文案、明确的取消行为和可辨的危险操作样式；原生确认弹窗的四字上限、确认色对比度和关闭路径不能同时满足这些要求。各页还重复维护顶栏、弹层、表单和反馈样式，直接读页面 WXML / WXSS 的设计护栏必须继续看到搬进共享文件的规则和节点。

## Decision

- **确认类交互使用应用自有的底部弹层家族，不使用原生确认弹窗。** 面板复用 `sheetLifecycle` 的进出、系统返回、遮罩与下拉关闭机制；系统返回、点遮罩、下拉和关闭键都等于取消。危险操作使用项目自己的警示样式，普通确认与取消分别使用主按钮和次级按钮。
- **失败呈现的原生弹窗保留。** 知悉、重试、去绑定三类弹窗只在确认键上执行动作，不使用自定义颜色，不涉及上述确认弹窗的三个缺陷；若也迁移，则每个页面都要挂确认面板，收益不成比例。
- **跨页共享使用 `@import` 共享样式，以及 `template` / `include` 共享标记。** 共享文件放在页面目录下现有的 `pages/shared/`，随包上传。静态设计护栏和其他直接读取 WXML / WXSS 的检查先统一经过展开入口：WXSS 展开 `@import`；WXML 展开 `include`，并把经 `import` 引入的 `template` 定义代入使用处。先完成这道覆盖，再搬共享规则。
- **不引入 UI 组件库，不迁 Skyline，本轮不建自定义组件。** 页面平台 harness 不支持自定义组件，现有护栏直接读取页面文件，组件样式隔离也需要重新验证；组件库和 Skyline 还会改变已登记的视觉、动效与无障碍边界。

## Consequences

后续共享模板和确认面板可以在不削弱护栏的前提下收拢重复实现。新增共享样式或模板时，调用页与共享文件都必须继续通过原有设计护栏；展开暴露出的违规按各护栏规则修正，不增加豁免。改变确认承载方式、引入 UI 库、自定义组件或更换渲染引擎前，须先复审本决定。

## 2026-11-26 补充：共享双层 disclosure/fold 样式

#263 评审修复按本决定的 `@import` 路线新增 `pages/shared/disclosure.wxss`，承载绑定子表单、经期结束日期和记录页年月分组共同的双层网格、透明度与禁点结构。三处保留各自的展开条件、ARIA/disabled 业务语义和外观修饰；没有新建自定义组件。F1 运行态对照另确认 `sheetDrag` 必须由使用它的共享模板自己声明：`pages/shared/confirmation-sheet.wxml` 在模板作用域内引入 `utils/sheetDrag.wxs`，宿主页面不再各自声明同名模块；只把声明放在宿主页面时，导入模板里的 `bindtouch*` 不会进入该 WXS。测试展开入口同步保留模板 WXS，避免页面 harness 与真实渲染作用域脱节。F1 内层滚动对照进一步确认：普通 view 的公开 property/scrollTo 不能提供可用验证入口，而原生 scroll-view 是平台组件，不违反“不建自定义组件”的决定；直接放在 flex grow/shrink 轨道里仍不滚动，因此最终保留内容高与固定 chrome，使用 `flex: 0 0 auto` 加各面板自己的 max-height 轨道，不设置受控 scroll-top，也不改拖拽或生命周期。
