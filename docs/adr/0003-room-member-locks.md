# ADR: 用成员锁保护单用户单房间

**Status:** Accepted
**Date:** 2026-07-01
**Updated:** 2026-07-10

## Context

房间成员关系保存在 `rooms.createdBy` 和 `rooms.partnerOpenid` 上。只保护单个 room 的 partner 槽位，不能阻止同一个 `OPENID` 并发加入两个不同 waiting 房间。

项目的核心不变量是：一个用户最多属于一个 active room。这个不变量不能只靠加入前查询，因为两个并发请求可能同时读到“尚未加入房间”。

## Decision

新增 `roomMembers` 集合作为成员锁：

- `_id`: `OPENID`
- `openid`: `OPENID`
- `roomId`: 当前 room 文档 `_id`
- `roomCode`: 当前房间码
- `role`: `creator` 或 `partner`
- `membershipId`: 可选的内部成员资格版本 ID；不参与授权，也不进入远程响应
- `updatedAt`: 服务端时间

`membershipId` 是本 ADR 唯一允许新增的 schema 字段。Room / Record schema 和远程协议保持不变。新 create、join、recover 必须生成新的 ID；ownership transfer 保留 partner lock 已有 ID，已有 legacy lock 无 ID 时继续保持 legacy，只有 partner lock 缺失、需要补建时才使用本次 `leave()` 预生成的 fallback ID。候选 ID 都在对应 lifecycle 操作的 transaction callback 外生成，保证冲突重试使用同一值。

`createRoom`、`joinRoom`、recover、`leaveRoom` 和 ownership transfer 都必须在 `db.runTransaction` 内原子读取、校验并写入 `rooms` 与 `roomMembers`。事务内基于最新文档状态判断成员是否已属于其他 active room、目标 room 是否仍可加入或恢复，以及离开时的成员身份；只有全部校验通过，Room 与成员文档才作为一个整体提交。

`roomMembers._id = OPENID` 的数据库唯一约束是“一个用户最多属于一个 active room”的唯一门禁。并发 transaction 读写同一 Room 或成员文档发生冲突时，由 transaction 自动重试；重试后如果状态已不满足业务条件，则返回对应失败结果。transaction 最终失败时整体回滚，不能只提交 Room 或只提交成员文档。

`leaveRoom` 成功解除成员关系时，在同一个 transaction 内删除当前用户成员文档；创建者离开 paired room 时，也在该 transaction 内把 partner 转为 creator，并同步更新 partner 的成员角色。

`dataOp` 授权仍以 `rooms` 文档为准。`roomMembers` 是生命周期并发锁，不是记录读写授权来源。

## Migration

上线前需要为现有 active room 回填 `roomMembers`：

1. 创建 `roomMembers` 集合，确认 `_id` 使用数据库默认唯一约束，且集合只通过云函数维护。
2. 初次引入集合时先完成 `roomMembers` 创建和基础锁回填。引入 `membershipId` 时不要求强制 backfill；在维护窗口内同时发布 `createRoom` / `joinRoom` / `getMyRoom` 的同版 lifecycle artifact，随后发布 `leaveRoom`，避免新旧版本混跑。
3. 回填脚本要幂等：遍历 `rooms` 集合，对每个 room 用 `_id = createdBy` 写入或覆盖 creator 锁，字段为 `roomId = room._id`、`roomCode = room.roomCode`、`role = creator`。
4. 如果 `partnerOpenid` 非空，用 `_id = partnerOpenid` 写入或覆盖 partner 锁，字段为同一个 `roomId` / `roomCode`、`role = partner`。
5. 如果同一个 `OPENID` 对应多个 active room，暂停上线并人工判定保留哪个房间。本 ADR 不自动清理用户房间。
6. 回填后校验：`rooms.createdBy` 和非空 `rooms.partnerOpenid` 都必须能在 `roomMembers._id` 找到对应锁，且锁的 `roomId` / `roomCode` 与 room 文档一致。
7. 扫描 stale lock：`roomMembers.roomId` 为空、指向不存在 room、或 `roomMembers` 成员不在对应 room 的 `createdBy` / `partnerOpenid` 中时，先人工确认，再清理或重建锁。
8. smoke 验证：同一个测试用户同时加入两个不同 waiting room，最多一个成功；失败请求不能改写另一个房间。
9. 回滚按反向顺序：先恢复 `leaveRoom`，再把 `createRoom` / `joinRoom` / `getMyRoom` 作为同版一组恢复。`membershipId` 可选且旧代码可忽略，无需数据回滚。

2026-07-10 迁移记录：目标环境 `cloud1-d8gyqvcez4e66b3da` 已创建 `roomMembers` 集合，并为 5 个 active room 回填 6 个 legacy-compatible 基础锁；复核结果为 expected members 6、actual members 6、锁与 Room 字段不一致 0，6 个 `updatedAt` 均已规范化为数据库服务端 Date。集合保留 `_id` 默认唯一索引。四个 lifecycle 云函数已按函数维护窗口顺序部署，但本次实际在函数更新后才完成集合创建与回填，偏离本 ADR 的上线前迁移顺序；后验双向一致性检查没有发现持久异常，未来部署必须先迁移再发代码。同一用户并发加入两个 waiting room 的 smoke 仍需要真实微信 `OPENID` 上下文。

## Consequences

- 没有 `roomMembers` 回填时，历史成员仍能通过 `rooms` 授权访问数据，但并发锁不能完整表达历史状态。
- 新 lifecycle transaction 要么同时提交 Room 与成员文档，要么整体回滚，不会因 transaction 失败留下单边 member lock。stale lock 只可能来自 legacy 版本、迁移前历史数据或人工写入等异常状态；`leaveRoom` 的 stale lock 清理属于兼容性修复路径。
- 如果 archived room 存在 legacy 或历史异常产生的同房间或空白 stale lock，`createRoom` 可以复用该锁完成显式恢复；指向其他房间的锁仍必须阻止创建。
- 后续任何修改房间成员生命周期的云函数，都必须同步维护 `roomMembers`。
- `membershipId` 只防止 member lock identity 的 ABA，不改变 `rooms` 作为 records 授权来源的事实。
