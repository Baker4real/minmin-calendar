# ADR: 用成员锁保护单用户单房间

**Status:** Accepted
**Date:** 2026-07-01

## Context

房间成员关系保存在 `rooms.createdBy` 和 `rooms.partnerOpenid` 上。`joinRoom` 可以用条件更新保护同一个房间最多只有一个 partner，但这不能阻止同一个 `OPENID` 并发加入两个不同 waiting 房间。

项目的核心不变量是：一个用户最多属于一个 active room。这个不变量不能只靠加入前查询，因为两个并发请求可能同时读到“尚未加入房间”。

## Decision

新增 `roomMembers` 集合作为成员锁：

- `_id`: `OPENID`
- `openid`: `OPENID`
- `roomId`: 当前 room 文档 `_id`
- `roomCode`: 当前房间码
- `role`: `creator` 或 `partner`
- `updatedAt`: 服务端时间

`createRoom` 和 `joinRoom` 在写入 room 前必须先获得 `roomMembers._id = OPENID` 的成员锁。拿不到锁时，直接返回“已加入其他房间”，不能继续写入目标 room。

`joinRoom` 仍然要对目标 room 做条件更新：`_id`、`status: waiting`、`partnerOpenid: ''` 同时匹配才写入 partner。写入后还要读回目标 room，确认最终 `partnerOpenid` 仍然是当前 `OPENID`。

`leaveRoom` 成功解除成员关系后必须释放当前用户成员锁；创建者离开 paired room 时，partner 转为 creator，并同步更新 partner 的成员锁角色。

`dataOp` 授权仍以 `rooms` 文档为准。`roomMembers` 是生命周期并发锁，不是记录读写授权来源。

## Migration

上线前需要为现有 active room 回填 `roomMembers`：

1. 创建 `roomMembers` 集合，确认 `_id` 使用数据库默认唯一约束，且集合只通过云函数维护。
2. 部署顺序必须是：先完成 `roomMembers` 创建和回填，再同时发布 `createRoom` / `joinRoom` / `getMyRoom` 的同版 `roomBinding.js`，最后发布 `leaveRoom`。不能只发布其中一个房间生命周期云函数。
3. 回填脚本要幂等：遍历 `rooms` 集合，对每个 room 用 `_id = createdBy` 写入或覆盖 creator 锁，字段为 `roomId = room._id`、`roomCode = room.roomCode`、`role = creator`。
4. 如果 `partnerOpenid` 非空，用 `_id = partnerOpenid` 写入或覆盖 partner 锁，字段为同一个 `roomId` / `roomCode`、`role = partner`。
5. 如果同一个 `OPENID` 对应多个 active room，暂停上线并人工判定保留哪个房间。本 ADR 不自动清理用户房间。
6. 回填后校验：`rooms.createdBy` 和非空 `rooms.partnerOpenid` 都必须能在 `roomMembers._id` 找到对应锁，且锁的 `roomId` / `roomCode` 与 room 文档一致。
7. 扫描 stale lock：`roomMembers.roomId` 为空、指向不存在 room、或 `roomMembers` 成员不在对应 room 的 `createdBy` / `partnerOpenid` 中时，先人工确认，再清理或重建锁。
8. smoke 验证：同一个测试用户同时加入两个不同 waiting room，最多一个成功；失败请求不能改写另一个房间。

## Consequences

- 没有 `roomMembers` 回填时，历史成员仍能通过 `rooms` 授权访问数据，但并发锁不能完整表达历史状态。
- 如果 `createRoom` 或 `joinRoom` 在拿锁后异常退出，可能留下 stale lock；`leaveRoom` 在找不到 room 时会清理当前用户 stale lock，成功解绑 active room 后也会按当前 `OPENID` 兜底清理成员锁。
- 后续任何修改房间成员生命周期的云函数，都必须同步维护 `roomMembers`。
