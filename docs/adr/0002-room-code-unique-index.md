---
type: adr
status: accepted
title: "ADR: 房间码必须使用唯一索引保护"
tags: [project-docs, adr]
intent: "ADR: 房间码必须使用唯一索引保护"
---

# ADR: 房间码必须使用唯一索引保护

**Status:** Accepted
**Date:** 2026-07-01
**Updated:** 2026-07-10

## Context

`periods` 和 `memories` 记录用 `roomCode` 作为房间数据域。服务端授权会先确认当前 `OPENID` 属于对应房间，再按 `roomCode` 读写记录。

如果 `rooms` 集合里出现两个相同 `roomCode` 的房间文档，授权边界就不再可靠：一个房间成员可能读写另一个同码房间的数据。

旧的 `createRoom` 流程先查询候选房间码是否存在，再执行写入。这能降低普通重复概率，但不能处理两个创建请求同时拿到同一个候选码的竞态。

## Decision

`rooms.roomCode` 必须在云数据库中配置唯一索引。应用代码不再把创建前查重当成唯一保障；创建房间时，Room 文档与对应 member 文档在同一个 transaction 内原子写入。若 transaction 因 `roomCode` 唯一索引冲突失败，应用会换一个候选码重试，最多尝试 5 个候选码。

唯一索引负责阻止两个 transaction 提交相同的 `roomCode`；transaction 负责保证 Room/member 要么同时提交，要么都不提交。这两个保证缺一不可。

部署前需要先检查线上 `rooms` 集合是否已有重复 `roomCode`。如果存在重复数据，必须先人工判定和清理；本 ADR 不引入自动删除房间或记录的迁移。

本地测试和 lifecycle artifact 一致性检查只验证仓库内的代码与部署输入，不能替代真实云端验证。部署后仍需要做云端 smoke：确认唯一索引的真实错误形态能被识别为可重试冲突，确认云函数使用预期的 `wx-server-sdk` 和 lifecycle artifact，并验证并发创建不会产生重复房间码或半写入的 Room/member 状态。

## Migration

1. 在云开发控制台或一次性只读脚本里扫描 `rooms` 集合，按 `roomCode` 分组检查重复值。最低验收标准是：每个非空 `roomCode` 只对应一个 room 文档。
2. 如果发现重复 `roomCode`，先暂停部署本修复；由人工根据 `createdBy`、`partnerOpenid`、`createdAt` 和对应 records 使用情况决定保留、合并、归档或删除哪一个 room。本 ADR 不允许自动清理这些数据。
3. 在 `rooms` 集合创建唯一索引：
   - 索引名：`roomCode_1_unique`
   - 字段：`roomCode`
   - 排序：升序
   - 唯一：开启
4. 部署前运行 `node cloudfunctions/_shared/syncRoomMembershipLifecycle.js --check`，确认各云函数携带的 lifecycle artifact 与 canonical source 一致。
5. 在同一个维护窗口内，先部署同版的 `createRoom`、`joinRoom`、`getMyRoom`，确认三者使用同一版 lifecycle artifact；再部署 `leaveRoom`。如果需要回滚，按相反顺序操作：先回滚 `leaveRoom`，再回滚 `getMyRoom`、`joinRoom`、`createRoom`。
6. 部署后执行真实云端 smoke：
   - 确认云端部署产物解析到预期的 `wx-server-sdk` 版本，并携带预期版本的 lifecycle artifact。
   - 用测试环境或受控数据制造相同候选 `roomCode` 的并发创建，核对云端唯一索引返回的真实错误形态能被识别为可重试冲突，且候选码最多尝试 5 次。
   - 确认成功路径原子写入 Room/member，失败或冲突路径不会留下单边文档。
   - 确认并发创建最终不会产生重复 `roomCode`，也不会把一个用户绑定到多个活动房间。

2026-07-10 迁移记录：目标环境 `cloud1-d8gyqvcez4e66b3da` 的 5 个 active room 不存在重复 `roomCode`；已创建 `roomCode_1_unique`（`roomCode: 1`、`unique: true`）并复读确认。`createRoom`、`joinRoom`、`getMyRoom`、`leaveRoom` 已按函数维护窗口顺序部署，云端下载产物与仓库顶层部署输入 hash 一致，实际依赖为 `wx-server-sdk@3.0.4`、`@cloudbase/node-sdk@2.10.0`、`@cloudbase/database@1.4.1`。本次实际在函数更新后才发现并补建唯一索引，偏离本 ADR 的“先建索引、后发代码”顺序；后验扫描和索引创建没有发现持久重复，但未来部署不得复用该顺序。CLI invoke 不提供微信 `OPENID`，因此重复键错误形态、并发创建和成功/冲突事务原子性仍保留为真实小程序上下文 smoke。

## Consequences

- 没有唯一索引时，代码层不能单独证明 `roomCode` 全局唯一。
- `createRoom` 并发安全测试必须覆盖 transaction 提交时的唯一索引冲突、候选码重试上限以及 Room/member 原子性，而不是只测试创建前查重。
- lifecycle artifact 的本地 `--check` 是部署前门禁，不是云端唯一索引、SDK 行为、实际部署产物或并发语义的替代验证。
- 房间码唯一性修复与记录生命周期修复是不同问题：唯一索引阻止新重复 roomCode，但不会自动处理历史孤儿 records 或历史重复房间。
