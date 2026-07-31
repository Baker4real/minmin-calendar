---
type: adr
status: accepted
title: "ADR: RoomDataClient 作为唯一 records 前端 interface"
tags: [project-docs, adr]
intent: "ADR: RoomDataClient 作为唯一 records 前端 interface"
---

# ADR: RoomDataClient 作为唯一 records 前端 interface

**Status:** Accepted
**Date:** 2026-07-17

## Context

所有现有前端 records 调用者都已构造 RoomDataClient，roomRecordsSnapshot 也已有真实的 client seam。utils/cloud.js 仍暴露八个无生产调用的 legacy wrappers，形成第二个浅 module，并迫使 snapshot module 容忍两套 outcome 形状。

## Decision

RoomDataClient 是 Period record 与 Memory record 读取、写入的唯一前端 interface。删除 legacy wrappers，roomRecordsSnapshot 必须接收该 client；首页 partial-success 与 Settings 全量导出语义不变。

## Consequences

新的 records 调用者必须通过 RoomDataClient；只有出现真实的外部调用者时，才可以在实际 seam 新增有测试的定向 adapter，而不能恢复通用 legacy wrappers。
