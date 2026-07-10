# ADR: 空房间归档以支持恢复

**Status:** Accepted
**Date:** 2026-07-01

## Context

`periods` 和 `memories` 按 `roomCode` 存储，而正常记录访问必须先通过 active `rooms` 文档授权。最后一人离开时如果删除 room 文档，原始 records 还可能留在数据库里，但会变成正常授权路径无法访问的孤儿数据。

产品文案承诺解绑不会丢失数据。这个承诺需要服务端有持久生命周期状态，不能只依赖本地缓存行为。

## Decision

最后一个 active member 离开时，`leaveRoom` 归档 room，而不是删除 room：

- `status` 变为 `archived`。
- `roomCode` 保持不变。
- active partner 字段被清空。
- 当前离开用户的 member lock 被释放。

Archived room 不是 active room。`getMyRoom` 不把它作为当前绑定返回，`joinRoom` 把它视为不可加入，`dataOp` 对 archived room 拒绝 records 访问。

原创建者可以通过再次创建房间显式恢复 archived room。`createRoom` 会把 archived room 恢复为 `waiting`，重写 creator member lock，并保留原 `roomCode`，因此已有 records 不需要迁移就能重新访问。

恢复属于一段新的成员资格，因此新 creator lock 会获得新的可选内部 `membershipId`。该字段不进入 Room / Record schema、远程协议或 records 授权判断；旧 lock 没有该字段时仍向后兼容，无需强制 backfill。

恢复时只允许复用指向同一个 archived room 或空白的 stale member lock。指向其他 room 的 lock 仍然必须阻止创建。

## Concurrency

归档空房间必须基于最新 waiting/empty 状态做条件更新。如果另一个用户在初次读取和归档尝试之间成功加入，`leaveRoom` 不能把刚配对的 room 覆盖为 archived；它必须重新读取 room，并按正常 creator leave 流程把所有权转交给 partner。

## Consequences

- 按 `roomCode` 保留的 records 仍然有用且可恢复。
- Archived room 默认保护隐私，因为显式恢复前普通 CRUD 关闭。
- `rooms.roomCode` 唯一性仍然重要：archived room 依然占用自己的 room code。
- Settings 导出仍然是全量成功语义；首页 partial loading 不改变备份语义。
- lifecycle 发布须在维护窗口内先同版发布 createRoom、joinRoom、getMyRoom，再发布 leaveRoom；回滚反向执行。可选 `membershipId` 不需要数据回滚。
