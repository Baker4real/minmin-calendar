---
type: adr
status: accepted
title: "ADR-0008: 首页记录同步与记录编辑的 module 归属"
tags: [project-docs, adr, architecture, records, synchronization]
intent: "明确首页同步与记录编辑的目标归属、推翻旧决定的证据，以及迁移完成的区分标准"
---

# ADR-0008: 首页记录同步与记录编辑的 module 归属

**Status:** Accepted（目标已接受，迁移未完成）
**Date:** 2026-11-10
**Decision source:** [epic #169](https://github.com/Baker4real/minmin-calendar/issues/169)（2026-11-08 规格）；本记录由 [#176](https://github.com/Baker4real/minmin-calendar/issues/176) 落地。

## Context

本决定取代 2026-08-12 的两份 spec：[recordCommands 保持 shallow adapter](../specs/2026-08-12-accept-recordcommands-adapter.md) 与 [首页记录同步状态机内联进 Page](../specs/2026-08-12-inline-home-records-sync.md)。两份旧 spec 保留为历史记录。

旧决定分别认为校验和反馈只是薄接线，以及只返回决定的同步状态机把请求协调留给唯一调用方，拆分反而增加误用机会。现在要解决的是已有的重复接线和分散协调：更改同一保存规则要同时改两个编辑页；同步顺序、revision 门与同步标记都由首页 Page 维护。

### 记录编辑：同一规则需要多处修改

以下提交的补丁均同时修改了 `pages/period/edit/edit.js` 和 `pages/memory/edit/edit.js`：

| 提交 | 日期 | 可核实的修改 | 同时修改 recordCommands |
|---|---|---|---|
| [723deb5](https://github.com/Baker4real/minmin-calendar/commit/723deb56e09936024a8d4d19c253bef9643b45aa) | 2026-07-10 | 两页都改为通知服务端确认的保存记录，避免各自拼接记录 | 否；修改了 recordPageSync |
| [b1d8c5f](https://github.com/Baker4real/minmin-calendar/commit/b1d8c5ff344235fbe3efc007a185f0872329f531) | 2026-10-09 | 保存或删除成功后，按钮保持禁用直到返回 | 是 |
| [16450a4](https://github.com/Baker4real/minmin-calendar/commit/16450a4abd750ab84794531dd0827977442b6418) | 2026-10-10 | 保存结果未确认时重新读取集合，按身份与提交字段核对 | 是 |
| [55693f7](https://github.com/Baker4real/minmin-calendar/commit/55693f7d11d1253897815a02b0d12104b2ab16eb) | 2026-11-04 | 日期错误按字段返回、显示与重查 | 是 |

`723deb5` 早于旧决定，证明重复接线此前已经存在；其余三次发生在旧决定之后，证明维护成本仍持续存在。

在本票起始基线 `3883d1cb8c93086824f7000fc0f1c436e86669b3`，两页仍各自读取、合并、持久化和丢弃草稿，并构造保存闭包、未确认核对参数、结果分支、删除和返回通知。字段级校验、合并到进行中记录以及未确认保存核对，已超出旧 spec 的“一行校验、没有可抽逻辑”前提。此次深化把页面的协调收进记录编辑会话，不是从旧 adapter 再拆一层纯决定函数。

### 首页同步：可观察测试目标没有守住，顺序修复仍落在页面

旧同步 spec 在 [159ed78](https://github.com/Baker4real/minmin-calendar/commit/159ed78fb4acc94aa436b266ed4997973ec08f0a)（2026-08-12）合并了内联实现，但“只测可观察行为”的目标没有持续守住。起始基线的 [`tests/index-page.test.js`](https://github.com/Baker4real/minmin-calendar/blob/3883d1cb8c93086824f7000fc0f1c436e86669b3/tests/index-page.test.js#L113-L132) 直接调用 `_startLoad`、`_resolveLoad` 并断言 `_homeRecords` 和 `_syncState.pendingRevisions`；[`tests/calendar-display.test.js`](https://github.com/Baker4real/minmin-calendar/blob/3883d1cb8c93086824f7000fc0f1c436e86669b3/tests/calendar-display.test.js#L638-L654) 用 JS 源码正则锁定这些私有名字。测试因而会随内部迁移破裂，不能作为不变的行为保护。

2026-11-04 的 [d8b3d6f](https://github.com/Baker4real/minmin-calendar/commit/d8b3d6fa299a3daa75d3fb29787dec58d7e30e86) 引入集合同步标记；同日 [2056b42](https://github.com/Baker4real/minmin-calendar/commit/2056b42606c8623e8496d01d403e0c0239b61b37) 修复顺序：先通过 revision 门、确认会采用快照，才能把集合标成已同步。否则请求途中发生本地保存、旧快照被丢弃后，只有本地记录的集合仍会误报已同步。修复位于首页 `_resolveLoad`，回归测试也直接调用页面私有方法。

## Decision

- **记录编辑由 recordCommands 会话拥有。** 沿用 module 名，每次打开编辑创建一个会话，接收记录种类、路由参数和渲染回调。会话持有完整表单状态、字段错误、忙碌与草稿恢复状态，并协调字段变更、草稿身份与生命周期、校验、经 RoomDataClient 保存、未确认结果核对、合并到进行中记录、删除确认及成功后通知。两种记录各用一份领域配置；页面只转发表单及生命周期事件并渲染会话状态，忙碌状态通过回调输出。列表加载入口保留。
- **首页记录同步由 Room 记录同步 module 拥有。** 建议名 `roomRecordsSync`；创建时接收获取 RoomDataClient 的方式与状态回调，提供前台/后台加载、本地记录增改删和当前状态。它自己持有记录、在途加载去重与请求顺序、revision 门、各集合同步状态、部分失败、胶囊状态与文案，并直接经 RoomDataClient 读取。记录不再作为渲染副作用保存。首页只触发加载、转交记录变更、把状态交给 Calendar projection，并管理胶囊自动隐藏计时。
- **保留相邻边界。** [ADR-0005](0005-room-data-client-single-records-interface.md) 的 RoomDataClient 唯一 records 前端 interface 不变；Room 失败呈现归 roomAccessOutcome，保存后的通知和一次性分段意图归 recordPageSync。首页允许部分集合成功，设置导出仍要求两个集合全部成功；[ADR-0007](0007-open-ended-period-records.md) 的经期三态和云端约束不变。具体 interface 与迁移验收以 #169 的 Implementation Decisions 3–5、Testing Decisions 为准。

### 区分标准

只有 module 自己持有状态并执行完整协调，调用方无需维护对应的请求编号、revision、在途 promise 或保存结果分支时，才算深化。同步 module 即使只有首页一个调用者，也能通过隐藏这组协调规则形成有效边界；是否复用、文件是否变短，都不是本决定的判据。

如果新文件只返回“下一步做什么”，页面仍须执行决定、拼接请求编号、推进状态或补写保存分支，就是旧式拆分，未完成本决定。纯 Calendar projection 的输入输出职责不受此判据否定：它负责投影，不承担同步或保存的副作用协调。

## Consequences and migration

**截至本记录落地，目标已接受，代码迁移尚未完成。** 本票只改文档；起始基线的记录编辑协调仍在现有 recordCommands adapter 与两个编辑页之间，首页同步协调仍在 `pages/index/index.js`。接受此 ADR 不表示新会话或同步 module 已存在，也不表示共享测试 harness 已迁完。CONTEXT 的两处职责句在过渡期同时标明目标与现状；后续各实现票完成对应迁移并验证后再更新现状。

实现需要把现有协调真正移交给 module，代价是迁移状态所有权和页面接线；收益是同一保存或同步规则只改其 owner，页面的 UI 改动不再同时承担这些规则。不能同时保留页面与 module 两套协调，也不增加通用状态管理框架或运行时依赖；云函数、schema 与远程协议不变。

先由 #170 把页面测试迁到共享微信平台 seam，再进行后续运行代码迁移。通过真实页面的生命周期和用户事件、可控的 `wx.cloud.callFunction` 应答顺序，观察渲染数据、提示、导航、存储与云调用；保留 Calendar projection seam。新 module 不另增内部测试 seam，页面测试不再依赖私有状态、替换应用 module 或匹配 JS 源码；WXML/WXSS 静态设计守卫保留。纯文档票不为此新增无行为价值的测试。

迁移完成须同时满足：协调已从页面移交给对应 owner；保存与草稿、未确认核对、删除、同步顺序与部分失败的行为由既定 seam 验证；#169 要求的完整检查通过。仅建文件、返回决定或更新文档，均不构成代码迁移完成。
