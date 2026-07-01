# ADR: 房间码必须使用唯一索引保护

**Status:** Accepted
**Date:** 2026-07-01

## Context

`periods` 和 `memories` 记录用 `roomCode` 作为房间数据域。服务端授权会先确认当前 `OPENID` 属于对应房间，再按 `roomCode` 读写记录。

如果 `rooms` 集合里出现两个相同 `roomCode` 的房间文档，授权边界就不再可靠：一个房间成员可能读写另一个同码房间的数据。

旧的 `createRoom` 流程先查询候选房间码是否存在，再执行 `add`。这能降低普通重复概率，但不能处理两个创建请求同时拿到同一个候选码的竞态。

## Decision

`rooms.roomCode` 必须在云数据库中配置唯一索引。应用代码不再把创建前查重当成唯一保障；它会在 `rooms.add` 遇到 `roomCode` 唯一索引冲突时换一个候选码重试。

创建成功后，服务端必须按新建文档 `_id` 再读一次，确认返回给前端的是本次创建的房间文档，且 `roomCode`、`createdBy` 和 `status` 符合预期。

部署前需要先检查线上 `rooms` 集合是否已有重复 `roomCode`。如果存在重复数据，必须先人工判定和清理；本 ADR 不引入自动删除房间或记录的迁移。

部署后需要做一次云端 smoke 验证：确认云函数部署产物使用锁定的 `wx-server-sdk` 版本，并确认唯一索引冲突会被云函数识别为可重试的重复房间码错误。

## Migration

1. 在云开发控制台或一次性只读脚本里扫描 `rooms` 集合，按 `roomCode` 分组检查重复值。最低验收标准是：每个非空 `roomCode` 只对应一个 room 文档。
2. 如果发现重复 `roomCode`，先暂停部署本修复；由人工根据 `createdBy`、`partnerOpenid`、`createdAt` 和对应 records 使用情况决定保留、合并、归档或删除哪一个 room。本 ADR 不允许自动清理这些数据。
3. 在 `rooms` 集合创建唯一索引：
   - 索引名：`roomCode_unique`
   - 字段：`roomCode`
   - 排序：升序
   - 唯一：开启
4. 部署 `createRoom`、`joinRoom`、`getMyRoom` 三个包含相同 `roomBinding.js` 的云函数。
5. 部署后 smoke：
   - 确认云端部署产物解析到锁定的 `wx-server-sdk` 版本。
   - 用测试环境或受控数据制造同一个候选 `roomCode` 的第二次创建，确认云函数收到的错误里能识别 `roomCode` 唯一冲突并重试。
   - 确认创建成功返回的 `_id`、`roomCode`、`createdBy` 来自新建 room 文档。

## Consequences

- 没有唯一索引时，代码层不能单独证明 `roomCode` 全局唯一。
- 后续 `createRoom` 并发安全测试应模拟唯一索引在 `add` 阶段抛出的重复键错误，而不是只测试创建前查重。
- 房间码唯一性修复与记录生命周期修复是不同问题：唯一索引阻止新重复 roomCode，但不会自动处理历史孤儿 records 或历史重复房间。
