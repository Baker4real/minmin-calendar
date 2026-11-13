---
type: adr
status: accepted
title: "ADR-0008: 首页记录同步与记录编辑的 module 归属"
tags: [project-docs, adr, architecture, records, synchronization]
intent: "明确首页同步与记录编辑的目标归属、推翻旧决定的证据，以及迁移完成的区分标准"
---

# ADR-0008: 首页记录同步与记录编辑的 module 归属

**Status:** Accepted（代码迁移已完成）
**Date:** 2026-11-10
**Implementation:** 2026-11-11；整体验收记录见 [Verification Log](../verification-log.md)。
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

**2026-11-11：代码迁移已完成。** `recordCommands` 的 Period/Memory 会话已持有表单、草稿和保存/删除协调；`roomRecordsSync` 已持有首页记录、revision、在途加载和同步状态，两种编辑页与首页仅转发事件并渲染 owner 的输出。当前职责见 [CONTEXT Technical Shape](../../CONTEXT.md#technical-shape)。#176 落地时仅接受目标、尚未迁移的状态是历史基线，不再是当前实现。

迁移将现有协调移交给对应 module，代价是迁移状态所有权和页面接线；收益是同一保存或同步规则只改其 owner，页面的 UI 改动不再同时承担这些规则。页面与 module 不保留两套协调，也未增加通用状态管理框架或运行时依赖；云函数、schema 与远程协议不变。

#170 建立共享微信平台测试 harness 并先迁移绑定页，#171–#175 已完成其他页面的测试迁移。测试通过真实页面的生命周期和用户事件、可控的 `wx.cloud.callFunction` 应答顺序，观察渲染数据、提示、导航、存储与云调用；Calendar projection seam 保留。新 module 未另增内部测试 seam，页面测试不再依赖私有状态、替换应用 module 或匹配 JS 源码；WXML/WXSS 静态设计守卫保留。

迁移完成须同时满足：协调已从页面移交给对应 owner；保存与草稿、未确认核对、删除、同步顺序与部分失败的行为由既定 seam 验证；#169 要求的完整检查通过。仅建文件、返回决定或更新文档，均不构成代码迁移完成。

## 2026-11-13 补充：Room 记录全应用共用一份

[epic #189](https://github.com/Baker4real/minmin-calendar/issues/189) 的决定（Implementation Decisions 19–28）：[#193](https://github.com/Baker4real/minmin-calendar/issues/193) 落地共享与 Room 归属，[#194](https://github.com/Baker4real/minmin-calendar/issues/194) 接入记录 tab，[#195](https://github.com/Baker4real/minmin-calendar/issues/195) 接入编辑会话。上文 Decision 第一条的「列表加载入口保留」，以及第二条里「首页」专属和由调用方选择「前台/后台加载」的部分，按本补充改写；区分标准不变。

**共享范围。** `roomRecordsSync` 从首页专属改为整个小程序共用一份：持有当前 Room 的两类记录、各集合的同步与待确认状态、在途加载和配对状态。首页、记录 tab 和编辑会话都从它读，页面在加载时订阅、卸载时退订。记录 tab 的列表加载入口并入共享记录：记录 tab 显示时请共享记录加载，切换分段不再读取，`recordCommands` 只剩编辑会话。设置页导出不读共享记录，仍顺序读取两类、任何一类失败即停止（ADR-0005）。

**一个加载入口。** 调用方不再指定前台还是后台：已持有当前 Room 读到过的数据时，任何页面触发的加载都是静默刷新，否则按首次加载。同一 Room 的在途加载由所有调用方共用；请求不超车、按集合的 revision 门（本地改动使在途快照失效）、部分失败和重试文案保持不变。

**Room 归属。** 共享记录持有的每条记录、同步标记、待确认状态和配对状态都属于同一个房间码。加载开始、接收本地改动和页面订阅时，以本机当前的房间码为准；采用列表结果时，以结果带回的房间码为准；Room 修复的结果以修复后本机持有的房间码为准。任一处发现与持有内容所属的房间码不同（包括本机已没有房间码），先清空再继续。清空的同时，为上一个房间码发起的在途加载作废：它的结果不再采用，等它的调用方拿到「已作废」，不据此提示。Room leave、清除本机房间码、创建、加入和 Room 修复都落在这条规则里，不需要各自通知共享记录。

**订阅与提示分开。** 订阅回调只更新渲染数据，首页的行内 Room 状态画面属于渲染数据。弹窗、toast 和跳转只由调用加载的页面依据加载返回的结果执行，所以隐藏的页面不会因为别处发起的加载弹出提示，多个页面同时订阅也不会一次失败弹出多个提示。加载结果分五种：`success`、`partial-success`（只带这次列表带回的配对状态）、`retryable-failure`、`blocked`（后两种带可交给 `roomAccessOutcome` 的 outcome）和 `superseded`（已作废）。呈现映射仍只在 `roomAccessOutcome`：记录 tab 的可重试读取失败只用分段内的失败画面或行内重试表达，未绑定和需要重新绑定仍由发起加载的页面给出一次「去绑定」。

**编辑会话。** 时长提示和保存前的归属查询读共享记录里的经期，包括尚待确认的本地改动。经期已同步时，打开和保存前都不再读列表；未同步时请共享记录加载一次（与在途加载合并），结束后按当时持有的数据继续，读不到就用默认时长、不出提示。保存前不再读最新列表，理由是：「这一天已有经期」只是提醒，覆盖同一天的多条经期本来就允许；同一 Room 只有一条进行中经期由云端写入路径保证（ADR-0007），漏看另一位成员刚记的进行中经期时，新增的进行中经期仍会被云端合并进那一条。保存结果未确认时的核对仍直接经 RoomDataClient 读一次最新列表。保存和删除成功后把记录变化交给共享记录一次，不再查找「上一个页面」转交；`recordPageSync` 保留记录变化的构造和记录 tab 的一次性分段意图。记录 tab 落到被改动的分段、展开保存结果所在月份，改由共享记录发布的记录变化驱动。

**区分标准不变。** 页面不持有记录副本、revision 或在途 promise，只订阅、触发加载、转交本地改动并渲染共享记录的状态。
