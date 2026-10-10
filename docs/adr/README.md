---
type: index
title: "Architecture Decision Records"
tags: [project-docs, index]
intent: "按改动面查找必须遵守的 ADR"
---

# Architecture Decision Records

改动落在下表左列任一范围时，先读对应 ADR；建议或实现与 ADR 冲突时，先在 ADR 追加补充再改代码。

| 改动范围 | ADR |
|---|---|
| 经期状态（进行中 / 结束日期不详 / 已结束）、结束日期默认值、补记、时长统计、预测用到的样本 | [0007 经期记录允许在结束日期未知时保存](0007-open-ended-period-records.md) |
| 退出房间、解除绑定、所有权转移 | [0001 Room Leave Transfers Ownership](0001-room-leave-ownership-transfer.md) |
| 房间码生成、唯一性、`rooms.roomCode` 索引 | [0002 房间码必须使用唯一索引保护](0002-room-code-unique-index.md) |
| 一人一房间、创建 / 加入的并发冲突、`roomMembers` | [0003 用成员锁保护单用户单房间](0003-room-member-locks.md) |
| 最后一人离开、归档、创建者恢复 | [0004 空房间归档以支持恢复](0004-empty-room-archive-recovery.md) |
| 前端读写 records 的入口、页面直接调用云函数 | [0005 RoomDataClient 作为唯一 records 前端 interface](0005-room-data-client-single-records-interface.md) |
| `rooms` 身份查询、复合索引 | [0006 rooms 身份查询使用复合索引](0006-room-membership-lookup-indexes.md) |

新增 ADR 用 `NNNN-short-title.md`，并在上表加一行，写明哪些改动必须先读它。适用场景：会影响后续实现选择的决定，例如数据模型、测试运行器、云函数网关、日历标记体系。
