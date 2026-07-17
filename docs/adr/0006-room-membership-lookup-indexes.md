# ADR: rooms 身份查询使用复合索引

**Status:** Accepted
**Date:** 2026-07-18

## Context

`findRoomByMember` 按 `createdBy` 或 `partnerOpenid` 加 `status != archived` 查询当前 Room；创建者恢复路径按 `createdBy + status = archived` 查询归档 Room。没有身份字段索引时，这些查询会随着 `rooms` 集合增长退化为全表扫描。

`roomCode_1_unique` 继续覆盖按房间码查询并保护房间码唯一性，但不能支持上述成员身份查询。

## Decision

`rooms` 集合必须保留以下非唯一复合索引：

- `createdBy_1_status_1`：`{ createdBy: 1, status: 1 }`
- `partnerOpenid_1_status_1`：`{ partnerOpenid: 1, status: 1 }`

身份字段是等值条件，`status` 是活动查询中的范围条件或恢复查询中的等值条件，因此身份字段置于第一位。两个索引都不是唯一索引：历史 archived Room 以及空的 `partnerOpenid` 可以重复。

这些索引补充但不替代 [ADR 0002](0002-room-code-unique-index.md) 的 `roomCode_1_unique`。它们只优化查询性能，不改变 `rooms` 的 records 授权职责、`roomMembers` 的并发锁职责、Room/Record 数据模型或云函数远程协议。

## Migration And Verification

新建或重建生产环境时，必须在 `rooms` 集合投入流量前补齐这两条索引。创建索引是独立的云数据库操作，不需要重新部署云函数或上传小程序。

2026-07-18，目标环境 `cloud1-d8gyqvcez4e66b3da` 已创建两条索引。`listIndexes` 已确认名称和字段；使用不含真实用户标识的 `explain` 验证，创建者和成员查询的自然计划都命中对应 `IXSCAN`。`status != archived` 仍可能由 `FETCH` 做残余过滤，但身份查询不再需要 `COLLSCAN`。

如果需要回滚，只删除本 ADR 新增的单条索引；不需要回滚代码、云函数或用户数据。
