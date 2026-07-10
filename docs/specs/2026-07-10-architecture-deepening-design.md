# 强烈推荐架构深化设计

**状态：** 已批准
**日期：** 2026-07-10
**范围：** 持久化 Record canonical source、首页 Room records 同步状态机、Room membership lifecycle

## 1. 第一性原理

### 目标

在不改变用户可见产品语义的前提下，集中三类必须存在的复杂度：

1. 已确认保存的 Period record / Memory record，首页立即使用服务端实际持久化的同一份事实。
2. 首页首次加载、后台刷新、partial success 与乐观更新遵守一个可测试的状态机，不被较旧 snapshot 回滚。
3. Room 的 create、join、getActive、leave、archive 与 recovery 由一个 deep module 维护相同的不变量。

### 不可变约束

- 服务端是 Record 校验、normalization 与持久化事实的唯一权威；客户端校验只提供即时反馈。
- mutation 不能通过“写后再读”取得 canonical Record，避免写成功但读取失败形成未知结果并诱发重复提交。
- 首页 partial loading 与 Settings 全量导出语义保持不变。
- Calendar marker、Prediction、Today、Lunar date 与 Public holiday 语义不变。
- 云函数名、event shape、既有错误码和客户端调用入口不变；Room / Record schema 不变。唯一允许的内部 schema 演进是 `roomMembers.membershipId`：可选、非授权字段，并兼容没有该字段的 legacy lock。
- rooms 仍是 records 授权来源；roomMembers 仍只是并发锁。
- ADR-0001 至 ADR-0004 的所有权转移、唯一 roomCode、单用户单 active Room、archive/recovery 与发布顺序保持有效。
- 每个微信云函数目录继续自包含；不得依赖父目录 runtime require、symlink、junction 或云函数间网络调用。
- 不自动清理历史重复 Room、records 或无法判定的 stale member lock。

### 已知事实

- RoomRecords 会剥离保留字段、拒绝未知字段、严格验证日期、重算 duration、过滤 flow/symptoms，并把 note 截断到 500 字。
- 当前 add 只返回 id，update 只返回成功码；编辑页却用客户端 payload 更新首页。
- 当前首页用全局 _hasPendingRecordChangeSync 表示两个 collection 的 pending 状态。
- 后台请求开始后发生本地 Record change 时，较旧 snapshot 可以覆盖该本地变更并清除 pending。
- 三份 roomBinding.js 各 426 行且逐字相同；leave 逻辑在另一份 roomLifecycle.js 中，两边重复维护 Room 与 member lock 不变量。
- 微信云函数以各自目录独立安装依赖和部署，因此物理 artifact 仍需出现在四个函数目录中。

### 必须防止的失败模式

- 首页展示值与服务端持久值不一致。
- 已成功保存的 Record 被在途旧 snapshot 回滚。
- 一个 collection 的成功错误地确认另一个 collection 的 pending 变更。
- 仅重排的远端结果触发无意义 records 替换和 Calendar 全量重算。
- RoomBinding 与 RoomLifecycle 对 active/archive、member lock 或更新确认采用不同规则。
- 失败补偿误删用户在并发请求中新获得的合法 member lock。
- 四个部署 artifact 漂移或 adapter 调用了错误的 lifecycle 操作。
- 重构同时扩大远程协议、数据库或发布迁移风险。

## 2. 方案比较

### 方案 A：渐进式 deepening（采用）

分别深化三个 in-process module，保留所有远程 seam 与 Room / Record 数据库形状；成员锁只增加内部可选版本字段。每项可独立完成红绿测试、提交和回滚。

- Record mutation 直接携带 canonical Record projection。
- 首页使用纯状态机处理 snapshot 与本地变更。
- 一个 canonical Room membership lifecycle source 生成四份自包含部署 artifact。

此方案以最小兼容改动获得最高 locality 和 leverage。

### 方案 B：最小补丁（拒绝）

只增加 mutation 返回字段、snapshot reconcile helper 与共享 member lock helper。

改动较少，但首页调用者仍需理解完整状态机，Room lifecycle 仍有两个权威 implementation，无法完成三个强烈推荐候选。

### 方案 C：统一远程 gateway（拒绝）

把 Room 操作合并为单一云函数，并把首页改为注入 cloud、Page 与 timer 的 stateful controller。

它同时改变远程 seam、发布顺序、故障域和回滚路径，并产生只有一个 production adapter 的假 seam；当前范围不接受。

## 3. Canonical Record 设计

### 3.1 服务端 interface

cloudfunctions/dataOp/roomRecords.js 继续作为 Record normalization 的权威 module。

成功 add：

    {
      code: 0,
      id: 'record-id',
      record: {
        _id: 'record-id'
        // normalized Period record 或 Memory record 字段
      }
    }

成功 update 使用相同 shape，并保留 id。

Period record projection 只包含：

- _id
- startDate
- endDate
- note
- duration
- flow
- symptoms

Memory record projection 只包含：

- _id
- date
- note

projection 不包含 roomCode、createdBy、createdAt 或未解析的 db.serverDate() 占位值。既有 id 保留，保证旧客户端继续工作。

### 3.2 客户端消费

RoomDataClient 继续透传成功 result，不增加第二次读取或新的远程调用。

utils/recordPageSync.js 提供：

    getSavedRecord(outcome) -> canonicalRecord | null

仅当 outcome.kind === 'success' 且 outcome.result.record 是含 _id 的对象时返回 Record。旧后端未返回 record 时返回 null。

Period / Memory 编辑页：

- 成功且存在 canonical Record 时，才发送 add/update 乐观变更。
- 成功但无 canonical Record 时，不使用客户端 payload 猜测；返回首页后由既有后台刷新加载权威 Record。
- delete 继续以服务端已确认的 _id 发送 remove tombstone。
- Memory record 保存前补充真实日历日期校验。
- Memory save 与 Period save 都返回最终 outcome，消除页面行为漂移。

### 3.3 发布兼容

优先部署 dataOp，再发布小程序客户端。

- 新后端 + 旧客户端：旧客户端继续读取 id，忽略新增 record。
- 旧后端 + 新客户端：保存仍成功，但跳过乐观更新，由首页刷新兜底。
- 任一方向都不把已成功 mutation 重判为失败。

## 4. 首页 Room records 同步状态机

### 4.1 module 与 interface

新增 utils/homeRecordsSync.js，它不依赖 wx、Page、timer、cloud 或 homeCalendarState。

公开 interface：

    createHomeRecordsSyncState(initialState = {}) -> state
    transitionHomeRecordsSync(state, event) -> {
      state,
      decision
    }

事件：

    { type: 'load-start', mode: 'initial' | 'background' }
    { type: 'record-change', change }
    { type: 'load-resolved', requestId, snapshot }
    { type: 'load-failed', requestId, outcome }

load-start 生成递增 request id，并记录两个 collection 各自的起始 revision。Page 把 request id 随异步结果传回状态机；非当前 request 的结果被忽略。

### 4.2 状态

状态至少表达：

    {
      records: {
        periods: [],
        memories: []
      },
      revisions: {
        periods: 0,
        memories: 0
      },
      pendingRevisions: {
        periods: null,
        memories: null
      },
      hasLoaded: false,
      nextRequestId: 1,
      activeRequest: null
    }

record-change 只修改目标 collection，递增其 revision，并在首页已加载时记录该 collection 的 pending revision。

### 4.3 snapshot reconcile

对每个 collection 独立处理：

- retryable failure：保留旧 records 与 pending。
- success 且当前 revision 大于 request 的起始 revision：snapshot 早于本地变更，保留本地 records 与 pending。
- success 且没有更新的本地变更：snapshot 成为权威结果，并只确认该 collection 的 pending。
- snapshot 与当前 records 语义相同但顺序不同：保留原数组引用和顺序。
- snapshot 有真实字段或成员变化：替换该 collection records。

blocking Room outcome 优先于 partial 结果，输出给 Page 的 Room 状态处理；状态机不操作导航或本地缓存。

### 4.4 decision

decision 只描述 Page 必须执行的最小动作：

- 是否更新 records。
- load / refreshing 状态。
- 是否标记首页已加载。
- syncStatus 文案及是否自动隐藏。
- 需要交给 roomAccessOutcome 的 blocking outcome。
- 当前异步结果是否因 request id 过期而被忽略。

timer 只负责提示寿命，不参与同步正确性。

### 4.5 现有 module 责任

- roomRecordsSnapshot：继续负责并行加载与 snapshot outcome 分类，以及 Settings export 的全量成功语义。
- homeRecordsSync：负责 snapshot、本地变更和 pending revision 的状态迁移。
- homeCalendarState：继续负责 Calendar projection。
- recordPageSync：继续作为微信 Page stack adapter。
- pages/index/index.js：只负责 cloud I/O、调用状态机、setData、Calendar projection、Room 状态展示与 timer。

## 5. Room membership lifecycle 设计

### 5.1 canonical module

新增 canonical source：

    cloudfunctions/_shared/roomMembershipLifecycle.js

公开 interface：

    createRoomMembershipLifecycle({
      db,
      serverDate,
      generateRoomCode
    }) -> {
      create,
      join,
      getActive,
      leave
    }

module 吸收现有 RoomBinding 与 RoomLifecycle implementation，集中：

- active / archived Room 查询
- member lock 获取、条件更新与释放
- roomCode 冲突重试和创建确认
- join 条件更新与确认读
- ownership transfer
- last-member archive
- creator recovery
- 并发 join / leave 防护
- SDK 更新计数兼容

不得把 roomMembers 改为 records 授权来源。

### 5.2 member lock 安全

统一后的 lifecycle 用事务维护 Room 与 member lock，并用 `roomMembers.membershipId` 区分同一用户、同一房间字段被复用后的不同成员资格：

- `membershipId` 只属于 `roomMembers` 内部 lock identity，不进入 Room、Record、远程响应或 records 授权判断。
- 新 create、join、recover 生成新的 `membershipId`，且在事务 callback 外生成，使自动重试复用同一个值。
- ownership transfer 保留 partner lock 已有的 `membershipId`；partner lock 存在但没有该字段时继续保持 legacy；只有 partner lock 缺失、需要补建时才使用本次 `leave()` 在事务外生成的 fallback ID。
- `leave()` 以事务外捕获的 member snapshot 固定目标；事务内 ID 不同、字段出现或消失均视为另一段成员资格并安全 no-op。双方都是 legacy 时使用既有 identity 字段兼容比较。
- legacy lock 不要求强制 backfill；`rooms` 始终是 records 授权来源。

真实 SDK 的 transaction retry 与部署产物仍需云端 smoke 证明，本地 fake DB 测试不能替代。

### 5.3 自包含部署 adapter

canonical source 通过确定性 assembly 复制到：

    cloudfunctions/createRoom/roomMembershipLifecycle.js
    cloudfunctions/joinRoom/roomMembershipLifecycle.js
    cloudfunctions/getMyRoom/roomMembershipLifecycle.js
    cloudfunctions/leaveRoom/roomMembershipLifecycle.js

四个 index.js 只 require 本目录 artifact，并分别调用 create、join、getActive、leave。

新增 assembly/check script：

    cloudfunctions/_shared/syncRoomMembershipLifecycle.js

支持：

    node cloudfunctions\_shared\syncRoomMembershipLifecycle.js --write
    node cloudfunctions\_shared\syncRoomMembershipLifecycle.js --check

- --write 确定性覆盖四份 artifact。
- --check 在任一 artifact 缺失或不一致时以非零状态退出。
- _shared 不含 package.json，不作为云函数部署。
- runtime 不从 adapter 目录访问 _shared。

旧 roomBinding.js 与独立 leaveRoom/roomLifecycle.js 在 adapter 切换后删除，避免第五份 source of truth 或 shallow re-export wrapper。

### 5.4 发布与回滚

无需数据迁移或强制 backfill；既有 legacy `roomMembers` 可继续无 `membershipId` 运行。Room / Record schema 与远程协议不变。

发布前：

1. 完整本地测试与 syntax check。
2. --check 通过。
3. 只读核对 roomCode 唯一索引、active Room/member lock 对应关系和单用户单 active Room。
4. 无法判定的历史异常只报告，不自动修改。

测试环境与生产环境均按以下顺序：

1. 在维护窗口内同版发布 createRoom、joinRoom、getMyRoom，避免新旧 lifecycle 混跑。
2. 随后发布 leaveRoom。
3. 验证 create、join、creator leave、partner leave、archive、recover 与 dataOp 授权。
4. 验证真实唯一索引错误、并发 join/leave 和云端实际 SDK 版本。

回滚采用反向顺序：先恢复 leaveRoom，再把 createRoom、joinRoom、getMyRoom 作为同版一组恢复；同样在维护窗口内避免混跑。`membershipId` 是可选且向后兼容的内部字段，无需数据回滚。

## 6. Public test seams

### 6.1 Canonical Record

通过 RoomRecords public interface 验证：

- add 返回的 record 与实际 normalized domain fields 一致。
- update 返回的 record 与更新后的数据一致。
- duration、note、flow、symptoms 使用服务端规则。
- reserved fields 不进入 projection。
- RoomDataClient 原样保留 result.record。
- 编辑页只通知 canonical Record；旧后端无 record 时不通知。
- Memory impossible date 不调用 mutation。

### 6.2 首页同步

直接通过 homeRecordsSync interface 验证事件序列：

- 首次 full success、partial success、双 retryable failure。
- 后台 unchanged 静默。
- 仅重排时数组引用和顺序保持。
- partial 只更新和确认成功 collection。
- periods pending 不被 memories success 确认。
- 请求开始后发生 add/update/remove，旧 snapshot 不得覆盖。
- 后续较新请求只确认对应 collection。
- blocking outcome、throw、连续本地变更和过期 request。

Page harness 只保留微信生命周期与 wiring 断言，不复制状态机测试。

### 6.3 Room membership lifecycle

通过一个 factory 和同一 fake DB 验证：

- create → join → creator leave → new partner join → partner leave → remaining creator leave → archive → creator recover。
- 两个用户并发 join 同一 Room，最多一个成功。
- 同一用户并发 join 两个 Room，最多进入一个 active Room。
- creator leave 与并发 join 交错时不得 archive 已配对 Room。
- roomCode 唯一冲突重试与按 _id 创建确认。
- archived Room 不被 getActive 返回、不能直接 join、不能访问 records、仅原 creator 可恢复。
- 拿锁后 add 失败、条件更新返回 0、确认读失败、释放 lock 失败。
- 失败补偿不删除并发获得的新 lock。
- 四个 adapter 调用正确 operation。
- 四份 artifact 与 canonical source 完全一致。

fake DB 测试不能替代云端唯一索引、并发与 SDK smoke；无法执行云端 smoke 时必须明确报告残余风险。

## 7. 实施顺序

1. Canonical Record：服务端 projection、客户端严格消费、页面 wiring。
2. 首页状态机：先覆盖 stale snapshot tracer bullet，再迁移其余状态。
3. Room membership lifecycle：先补 characterization 和跨操作测试，再合并 canonical implementation 与部署 assembly。
4. 更新 CONTEXT.md 的 Technical Shape、README.md 验证命令与必要的部署说明。
5. 完整测试、syntax check、artifact check。
6. 多子代理对抗性 review：数据一致性、首页竞态、Room 并发/回滚、文档状态一致性。
7. 修复 review 发现后重新运行完整验证并提交。

## 8. 非目标

- 不实现报告中“值得探索”的 Record command 全面深化或 Room access outcome 收敛。
- 不删除 RoomDataClient legacy wrappers。
- 不改变 WXML/WXSS、Calendar 视觉或用户文案，除 Memory 无效日期提示外。
- 不修改 Room schema、Record schema、collection 名或云函数名；只允许新增可选、内部、非授权的 `roomMembers.membershipId`。
- 不引入第三方依赖、数据库 migration 或自动数据清理。
- 不以本地 fake DB 测试声称云端并发和唯一索引已经通过。
