---
type: reference
title: Minmin Calendar 评审规范
tags: [Minmin Calendar, 代码评审, 文档一致性]
intent: 评审 diff 时查找需要判断、无法由测试机械钉住的规则。
---

# 评审规范

评审 diff 时读。这里只放需要判断的条目；能机械判断的规则已由 `npm run verify` 里的测试钉住。

## 文档跟着代码走

diff 改了某个模块的创建方式、读它的页面或模块，或云函数应答的字段时，逐句核对描述它的文档是否仍然成立：

- `CONTEXT.md` 里点名这个模块的句子；
- `docs/adr/README.md` 范围表指向的 ADR，连同它们的补充段落。

不成立的句子报出 `file:line`，并附上代码里的依据（`file:line`）。范围限于 diff 触到的模块。模块清单是否齐全、ADR 索引标题是否一致由 `tests/docs-index.test.js` 检查，这里不重复。

背景：2026-11-14，epic #189 改了共享记录的创建方式和读它的模块，ADR-0008 和 CONTEXT.md 因此有五处描述过时。三路评审都没有报出，直到一次全文档审计才发现。
