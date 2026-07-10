# 架构深化实施计划

> **For agentic workers:** 按任务顺序逐项实施。独立任务优先使用 subagent-driven-development；每个任务都必须完成自己的红灯、绿灯、复核与提交，不能把失败留给后续任务。

**Goal:** 在不改变现有远程协议、数据库 schema 与产品语义的前提下，让服务端 canonical Record、首页同步状态机和 Room membership lifecycle 分别形成可验证的 deep module。

**Architecture:** RoomRecords mutation 直接返回服务端规范化后的 Record projection，客户端只用该事实做乐观更新。新增纯 homeRecordsSync 状态机处理 collection revision、partial snapshot 与 stale request。Room create/join/getActive/leave 合并进一个 canonical module，再通过确定性 assembly 生成四个自包含云函数 artifact。

**Tech Stack:** WeChat Mini Program JavaScript、WeChat Cloud Functions、CommonJS、Node.js node:test、PowerShell。

## Global Constraints

- 服务端是 Record normalization 与持久化事实的唯一权威；客户端校验只提供即时反馈。
- 不使用 mutation 后二次读取，不把旧后端缺少 record 误判为保存失败，也不回退到客户端 payload 猜测 canonical Record。
- 首页 partial loading 与 Settings 全量导出语义保持不变。
- 云函数名、event shape、既有错误码、数据库 schema、collection 名与客户端调用入口不变。
- rooms 继续作为 records 授权来源；roomMembers 只作为并发锁。
- ADR-0001 至 ADR-0004 的所有权、唯一 roomCode、单用户单 active Room、archive/recovery 与发布顺序全部保留。
- 云函数目录必须自包含；禁止父目录 runtime require、symlink、junction 和云函数间网络调用。
- 不引入第三方依赖、数据库 migration 或自动数据清理。
- 所有 node --test 与 node --check 命令使用 D:\Codex\projects\minmin-calendar 下的绝对路径。
- Task 5、Task 6 属于 lifecycle-critical 高风险任务，完成后必须进入多子代理对抗性 review。

---

## 文件责任图

### 新建

- utils/homeRecordsSync.js：纯首页 records 同步状态机。
- tests/home-records-sync.test.js：通过状态机 public interface 测事件序列。
- cloudfunctions/_shared/roomMembershipLifecycle.js：Room lifecycle canonical source。
- cloudfunctions/_shared/syncRoomMembershipLifecycle.js：部署 artifact 的 write/check assembly。
- cloudfunctions/createRoom/roomMembershipLifecycle.js：生成的自包含 artifact。
- cloudfunctions/joinRoom/roomMembershipLifecycle.js：生成的自包含 artifact。
- cloudfunctions/getMyRoom/roomMembershipLifecycle.js：生成的自包含 artifact。
- cloudfunctions/leaveRoom/roomMembershipLifecycle.js：生成的自包含 artifact。

### 修改

- cloudfunctions/dataOp/roomRecords.js：mutation 返回 canonical Record projection。
- utils/recordPageSync.js：严格提取服务端 saved Record。
- pages/period/edit/edit.js：只通知 canonical Period record。
- pages/memory/edit/edit.js：只通知 canonical Memory record，并补真实日期校验。
- pages/index/index.js：成为 homeRecordsSync 的 WeChat Page adapter。
- 四个 Room 云函数 index.js：调用本目录 roomMembershipLifecycle artifact。
- tests/room-records.test.js、tests/room-data-client.test.js、tests/record-flow.test.js、tests/page-registration.test.js：canonical Record 和 Page wiring 回归。
- tests/room-binding.test.js、tests/room-lifecycle.test.js：改为统一 lifecycle seam，并增加跨操作序列与锁安全用例。
- tests/cloudfunction-dependencies.test.js：增加 assembly/artifact 与 adapter contract。
- CONTEXT.md、README.md：同步 Technical Shape、验证命令与部署规则。

### 删除

- cloudfunctions/createRoom/roomBinding.js
- cloudfunctions/joinRoom/roomBinding.js
- cloudfunctions/getMyRoom/roomBinding.js
- cloudfunctions/leaveRoom/roomLifecycle.js

这些文件仅在 Task 6 adapter 全部切换且 artifact check 通过后删除。

---

### Task 1: 服务端返回 canonical Record projection

**Files:**
- Modify: cloudfunctions/dataOp/roomRecords.js
- Test: tests/room-records.test.js
- Test: tests/room-data-client.test.js

**Interfaces:**
- Consumes: createRoomRecords({ db, serverDate }) 的 add/update public interface。
- Produces: 成功 add/update 的 result shape 为 { code: 0, id, record }；record 只含 _id 和 normalized domain fields。
- Compatibility: add 保留既有 id；update 新增 id 与 record；RoomDataClient 继续原样透传 result。

- [ ] **Step 1: 写 add canonical Record 红灯测试**

在 tests/room-records.test.js 增加一个 worked example，输入包含超长 note、重复/非法 symptoms 和错误 duration，期望来自服务端规则的固定 literal：

    test('RoomRecords add returns the canonical Period record that was persisted', async () => {
      const db = createFakeDb()
      const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })
      const longNote = 'x'.repeat(505)

      const result = await records.add({
        collection: 'periods',
        roomCode: 'ROOM01',
        openid: 'user-a',
        data: {
          startDate: '2026-06-10',
          endDate: '2026-06-12',
          note: longNote,
          duration: 99,
          flow: 'heavy',
          symptoms: ['cramps', 'cramps', 'unknown']
        }
      })

      assert.equal(result.code, 0)
      assert.equal(result.id, 'periods-1')
      assert.deepEqual(result.record, {
        _id: 'periods-1',
        startDate: '2026-06-10',
        endDate: '2026-06-12',
        note: 'x'.repeat(500),
        duration: 3,
        flow: 'heavy',
        symptoms: ['cramps']
      })
      assert.deepEqual(pickClientRecord(db.data.periods[0]), result.record)
    })

辅助函数使用独立 literal projection，不能调用 production normalizer：

    function pickClientRecord(record) {
      const { _id, startDate, endDate, note, duration, flow, symptoms } = record
      return { _id, startDate, endDate, note, duration, flow, symptoms }
    }

- [ ] **Step 2: 运行红灯**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\room-records.test.js

Expected: FAIL，result.record 为 undefined。

- [ ] **Step 3: 实现 add projection**

在 roomRecords.js 增加：

    function buildClientRecord(id, data) {
      return {
        _id: id,
        ...data
      }
    }

add 成功分支改为：

    const res = await db.collection(collection).add({ data: payload })
    return {
      code: 0,
      id: res._id,
      record: buildClientRecord(res._id, normalized.data)
    }

不要把 roomCode、createdBy、createdAt 或 SERVER_DATE 放入 record。

- [ ] **Step 4: 运行绿灯**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\room-records.test.js

Expected: PASS。

- [ ] **Step 5: 写 update canonical Record 红灯测试**

在 tests/room-records.test.js 增加：

    test('RoomRecords update returns the canonical Memory record that was persisted', async () => {
      const db = createFakeDb({
        memories: [{ _id: 'm1', roomCode: 'ROOM01', date: '2026-06-20', note: 'old' }]
      })
      const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

      const result = await records.update({
        collection: 'memories',
        roomCode: 'ROOM01',
        id: 'm1',
        data: { date: '2026-06-24', note: 'n'.repeat(503) }
      })

      assert.deepEqual(result, {
        code: 0,
        id: 'm1',
        record: {
          _id: 'm1',
          date: '2026-06-24',
          note: 'n'.repeat(500)
        }
      })
      assert.equal(db.data.memories[0].note.length, 500)
    })

- [ ] **Step 6: 运行红灯并实现 update projection**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\room-records.test.js

Expected: FAIL，update result 只有 code。

实现：

    await db.collection(collection).doc(id).update({ data: normalized.data })
    return {
      code: 0,
      id,
      record: buildClientRecord(id, normalized.data)
    }

- [ ] **Step 7: 验证 RoomDataClient 不丢字段**

在 tests/room-data-client.test.js 的 mutation success 用例中让 fake cloud 返回：

    {
      result: {
        code: 0,
        id: 'p1',
        record: {
          _id: 'p1',
          startDate: '2026-06-10',
          endDate: '2026-06-12',
          note: '',
          duration: 3,
          flow: '',
          symptoms: []
        }
      }
    }

断言：

    assert.deepEqual(addOutcome.result.record, {
      _id: 'p1',
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      note: '',
      duration: 3,
      flow: '',
      symptoms: []
    })

无需修改 utils/cloud.js；如果测试失败，修复 buildSuccessOutcome 以完整保留 result，不能重新构造丢字段对象。

- [ ] **Step 8: 运行 Task 1 测试并提交**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\room-records.test.js D:\Codex\projects\minmin-calendar\tests\room-data-client.test.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\dataOp\roomRecords.js

Expected: 全部 PASS，syntax check exit 0。

Commit:

    git add cloudfunctions/dataOp/roomRecords.js tests/room-records.test.js tests/room-data-client.test.js
    git commit -m "feat: return canonical saved records"

---

### Task 2: 客户端只消费 canonical saved Record

**Files:**
- Modify: utils/recordPageSync.js
- Modify: pages/period/edit/edit.js
- Modify: pages/memory/edit/edit.js
- Test: tests/record-flow.test.js
- Test: tests/page-registration.test.js

**Interfaces:**
- Consumes: success outcome.result.record。
- Produces: getSavedRecord(outcome) -> canonicalRecord | null。
- Removes: getSavedRecordId；生产调用者全部迁移后不保留 shallow compatibility helper。
- Page behavior: 旧后端无 record 时保存仍成功，但不发 add/update 乐观通知。

- [ ] **Step 1: 写 getSavedRecord 红灯测试**

在 tests/record-flow.test.js 替换 getSavedRecordId 断言：

    assert.deepEqual(
      recordPageSync.getSavedRecord({
        kind: 'success',
        result: { record: { _id: 'm2', date: '2026-06-24', note: 'canonical' } }
      }),
      { _id: 'm2', date: '2026-06-24', note: 'canonical' }
    )
    assert.equal(
      recordPageSync.getSavedRecord({ kind: 'success', result: { id: 'm2' } }),
      null
    )
    assert.equal(
      recordPageSync.getSavedRecord({ kind: 'business-failure' }),
      null
    )

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\record-flow.test.js

Expected: FAIL，getSavedRecord 不存在。

- [ ] **Step 2: 实现严格提取 helper**

在 utils/recordPageSync.js 实现：

    function getSavedRecord(outcome) {
      if (!outcome || outcome.kind !== 'success') return null
      const result = outcome.result || {}
      const record = result.record
      if (!record || typeof record !== 'object' || !record._id) return null
      return { ...record }
    }

module.exports 只导出：

    module.exports = {
      notifyPreviousPageRecordChange,
      getSavedRecord
    }

- [ ] **Step 3: 写页面 canonical wiring 红灯测试**

在 tests/page-registration.test.js 为 Period 与 Memory save harness 使用刻意不同的 client payload 与 server record。

Period server record：

    const canonicalPeriod = {
      _id: 'p9',
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      note: 'x'.repeat(500),
      duration: 3,
      flow: 'heavy',
      symptoms: ['cramps']
    }

Memory server record：

    const canonicalMemory = {
      _id: 'm9',
      date: '2026-06-24',
      note: 'n'.repeat(500)
    }

fake runRecordSave 返回 { kind: 'success', result: { id, record: canonical }。断言 notifyPreviousPageRecordChange 收到的 record 与 canonical object 深相等，且不含客户端的 duration: 99、unknown symptom 或 503 字 note。

再增加旧后端用例：

    const outcome = { kind: 'success', result: { id: 'm9' } }

断言保存 outcome 仍为 success，notifyPreviousPageRecordChange 调用次数为 0。

- [ ] **Step 4: 运行页面红灯**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\page-registration.test.js

Expected: FAIL，页面仍使用 savedPayload / 表单字段拼乐观 Record。

- [ ] **Step 5: 修改 Period save**

保留 payload 作为 mutation 输入，但成功后只读取 canonical：

    const outcome = await recordCommands.runRecordSave({
      page: this,
      action: () => {
        const payload = cycle.buildPeriodPayload({
          startDate,
          endDate,
          note,
          flow,
          symptoms
        })
        return isEdit
          ? client.update('periods', id, payload)
          : client.add('periods', payload)
      },
      validate,
      successTitle: '保存成功',
      failureTitle: '保存失败'
    })

    const savedRecord = recordPageSync.getSavedRecord(outcome)
    if (savedRecord) {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'periods',
        mode: isEdit ? 'update' : 'add',
        record: savedRecord
      })
    }
    return outcome

删除 savedPayload 与 getSavedRecordId 使用。

- [ ] **Step 6: 修改 Memory save 与日期校验**

Memory validate 使用：

    validate: () => {
      if (!date) return '请选择日期'
      if (!util.isValidDateString(date)) return '请选择有效日期'
      return ''
    }

成功处理使用：

    const savedRecord = recordPageSync.getSavedRecord(outcome)
    if (savedRecord) {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'memories',
        mode: isEdit ? 'update' : 'add',
        record: savedRecord
      })
    }
    return outcome

增加 page harness 用例：date 为 2026-02-31 时 outcome.kind === 'validation'，client.add/update 未调用。

- [ ] **Step 7: 运行 Task 2 测试并提交**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\record-flow.test.js D:\Codex\projects\minmin-calendar\tests\page-registration.test.js
    node --check D:\Codex\projects\minmin-calendar\utils\recordPageSync.js
    node --check D:\Codex\projects\minmin-calendar\pages\period\edit\edit.js
    node --check D:\Codex\projects\minmin-calendar\pages\memory\edit\edit.js

Expected: 全部 PASS，三个 syntax check exit 0。

Commit:

    git add utils/recordPageSync.js pages/period/edit/edit.js pages/memory/edit/edit.js tests/record-flow.test.js tests/page-registration.test.js
    git commit -m "fix: sync canonical saved records"

---

### Task 3: 建立纯 homeRecordsSync 状态机

**Files:**
- Create: utils/homeRecordsSync.js
- Create: tests/home-records-sync.test.js

**Interfaces:**
- Produces: createHomeRecordsSyncState(initialState = {})。
- Produces: transitionHomeRecordsSync(state, event) -> { state, decision }。
- Event types: load-start、record-change、load-resolved、load-failed。
- State owns: records、revisions、pendingRevisions、hasLoaded、nextRequestId、activeRequest。
- Does not depend on: wx、Page、timer、cloud、homeCalendarState。

- [ ] **Step 1: 写 stale snapshot tracer bullet**

创建 tests/home-records-sync.test.js：

    const assert = require('node:assert/strict')
    const test = require('node:test')
    const {
      createHomeRecordsSyncState,
      transitionHomeRecordsSync
    } = require('../utils/homeRecordsSync')

    test('a snapshot started before a canonical record change cannot roll it back', () => {
      const initialPeriod = period('p1', '2026-06-01')
      let state = createHomeRecordsSyncState({
        periods: [initialPeriod],
        memories: [],
        hasLoaded: true
      })

      const started = transitionHomeRecordsSync(state, {
        type: 'load-start',
        mode: 'background'
      })
      state = started.state
      const requestId = started.decision.requestId

      state = transitionHomeRecordsSync(state, {
        type: 'record-change',
        change: {
          collection: 'periods',
          mode: 'add',
          record: period('p2', '2026-06-29')
        }
      }).state

      const resolved = transitionHomeRecordsSync(state, {
        type: 'load-resolved',
        requestId,
        snapshot: successSnapshot([initialPeriod], [])
      })

      assert.deepEqual(resolved.state.records.periods.map(item => item._id), ['p2', 'p1'])
      assert.equal(resolved.state.pendingRevisions.periods, 1)
      assert.deepEqual(resolved.decision.syncStatus, {
        text: '已更新，正在同步',
        autoHide: false
      })
    })

    function period(id, startDate) {
      return {
        _id: id,
        startDate,
        endDate: startDate,
        note: '',
        duration: 1,
        flow: '',
        symptoms: []
      }
    }

    function successSnapshot(periods, memories) {
      return {
        kind: 'success',
        periodsOutcome: { kind: 'success', data: periods },
        memoriesOutcome: { kind: 'success', data: memories },
        periods,
        memories
      }
    }

- [ ] **Step 2: 运行红灯**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\home-records-sync.test.js

Expected: FAIL，utils/homeRecordsSync.js 不存在。

- [ ] **Step 3: 实现最小 state 与 load ticket**

创建 utils/homeRecordsSync.js，先实现 state construction、load-start、record-change 和 stale resolve。public switch 必须对未知 event 抛出明确错误：

    const COLLECTIONS = ['periods', 'memories']

    function createHomeRecordsSyncState(initialState = {}) {
      return {
        records: {
          periods: normalizeRecords(initialState.periods),
          memories: normalizeRecords(initialState.memories)
        },
        revisions: { periods: 0, memories: 0 },
        pendingRevisions: { periods: null, memories: null },
        hasLoaded: Boolean(initialState.hasLoaded),
        nextRequestId: 1,
        activeRequest: null
      }
    }

    function transitionHomeRecordsSync(state, event = {}) {
      if (event.type === 'load-start') return startLoad(state, event)
      if (event.type === 'record-change') return applyRecordChange(state, event.change)
      if (event.type === 'load-resolved') return resolveLoad(state, event)
      if (event.type === 'load-failed') return failLoad(state, event)
      throw new Error('Unsupported home records sync event: ' + String(event.type || ''))
    }

load-start 保存：

    activeRequest: {
      id: requestId,
      mode,
      startRevisions: { ...state.revisions }
    }

record-change 只递增目标 collection revision，并用 mergeRecordChange 处理 add/update/remove。首页已加载时设置对应 pending revision。

resolve 时若 requestId 不匹配，返回原 state 与 { ignored: true }；若当前 collection revision 大于 start revision，保留该 collection 和 pending。

- [ ] **Step 4: 运行 tracer bullet 绿灯**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\home-records-sync.test.js

Expected: PASS。

- [ ] **Step 5: 增加 collection 独立确认红灯测试**

增加事件序列：

1. 初始 hasLoaded true。
2. periods 与 memories 各发生一个 record-change。
3. 新 background request 开始。
4. resolve 为 periods success、memories retryable failure。

断言：

    assert.equal(result.state.pendingRevisions.periods, null)
    assert.equal(result.state.pendingRevisions.memories, 1)
    assert.deepEqual(result.decision.syncStatus, {
      text: '记忆同步失败，已保留旧记忆数据',
      autoHide: false
    })

实现 resolveLoad 的逐 collection reconcile，不能用单一 bool 清除全部 pending。

- [ ] **Step 6: 增加 reorder/no-op 红灯测试**

    test('a reordered semantic match preserves the existing array reference', () => {
      const p1 = period('p1', '2026-06-01')
      const p2 = period('p2', '2026-06-29')
      let state = createHomeRecordsSyncState({
        periods: [p2, p1],
        memories: [],
        hasLoaded: true
      })
      const originalPeriods = state.records.periods
      const started = transitionHomeRecordsSync(state, {
        type: 'load-start',
        mode: 'background'
      })

      const resolved = transitionHomeRecordsSync(started.state, {
        type: 'load-resolved',
        requestId: started.decision.requestId,
        snapshot: successSnapshot([p1, p2], [])
      })

      assert.equal(resolved.state.records.periods, originalPeriods)
      assert.equal(resolved.decision.recordsChanged, false)
      assert.equal(resolved.decision.syncStatus, null)
    })

实现 stableRecordListKey，递归稳定 object key 并按 identity 排序，只用于语义比较；语义相同就保留原数组。

- [ ] **Step 7: 补齐首次加载、partial、blocking、过期请求和 throw 用例**

固定 decision 语义：

- initial full success：hasLoaded true，syncStatus null。
- initial partial periods failure：memories 可见，syncStatus 为 经期同步失败，已显示记忆数据，autoHide false。
- initial 双 retryable：hasLoaded false，decision.outcome 为 retryable-failure。
- background retryable failure：保留 records，syncStatus 仅在相关 pending 存在时显示 同步失败，稍后重试。
- blocking snapshot：decision.blockingOutcome 为 snapshot.outcome。
- requestId 过期：ignored true，state 引用保持。
- load-failed：activeRequest 清除，返回对应 retry decision。

不要在 module 中调用 setTimeout 或生成 Calendar projection。

- [ ] **Step 8: 运行完整状态机测试和 syntax check**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\home-records-sync.test.js
    node --check D:\Codex\projects\minmin-calendar\utils\homeRecordsSync.js

Expected: 全部 PASS，syntax check exit 0。

- [ ] **Step 9: 提交 Task 3**

Commit:

    git add utils/homeRecordsSync.js tests/home-records-sync.test.js
    git commit -m "feat: add home records sync state machine"

---

### Task 4: 把首页 Page 收缩为状态机 adapter

**Files:**
- Modify: pages/index/index.js
- Modify: tests/page-registration.test.js
- Modify: tests/calendar-display.test.js
- Test: tests/home-records-sync.test.js

**Interfaces:**
- Consumes: homeRecordsSync 的两个 public functions。
- Page keeps: cloud I/O、setData、homeCalendarState projection、Room status presentation、sync pill timer。
- Removes from Page: _hasPendingRecordChangeSync、mergeRecordChange、consumePendingRecordChangeSync 和手工 snapshot reconcile。
- Compatibility: applyRecordChange(change) 仍存在，供 recordPageSync adapter 调用。

- [ ] **Step 1: 写 Page stale snapshot 红灯测试**

在 page-registration harness：

1. 第一次 onShow 完成，首页已有 p1。
2. 第二次 onShow 启动 background snapshot，但延迟 resolve。
3. 调用 harness.page.applyRecordChange 添加 canonical p2。
4. resolve background snapshot，只含 p1。

断言：

    assert.deepEqual(
      harness.page.data.periods.map(item => item._id),
      ['p2', 'p1']
    )
    assert.equal(harness.page.data.syncStatusText, '已更新，正在同步')
    assert.equal(harness.page.data.syncStatusVisible, true)

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\page-registration.test.js

Expected: FAIL，旧 snapshot 覆盖 p2 或错误显示已同步。

- [ ] **Step 2: 初始化并调用状态机**

index.js 引入：

    const {
      createHomeRecordsSyncState,
      transitionHomeRecordsSync
    } = require('../../utils/homeRecordsSync')

onLoad 中初始化：

    this._homeRecordsSyncState = createHomeRecordsSyncState({
      periods: this.data.periods,
      memories: this.data.memories,
      hasLoaded: this.data.hasLoadedHomeData
    })

增加内部 Page method：

    transitionRecordsSync(event) {
      const transition = transitionHomeRecordsSync(
        this._homeRecordsSyncState || createHomeRecordsSyncState(),
        event
      )
      this._homeRecordsSyncState = transition.state
      return transition
    }

- [ ] **Step 3: 迁移 loadData**

loadData 开始时：

    const started = this.transitionRecordsSync({
      type: 'load-start',
      mode: background ? 'background' : 'initial'
    })
    const requestId = started.decision.requestId

snapshot 返回后：

    const transition = this.transitionRecordsSync({
      type: 'load-resolved',
      requestId,
      snapshot
    })
    return this.applyRecordsSyncDecision(transition, { background })

catch 分支通过 load-failed event；finally 仍负责 _loadingPromise 清理，但 loading/refreshing setData 由 decision 执行。

- [ ] **Step 4: 实现 Page decision adapter**

applyRecordsSyncDecision 只做以下映射：

- decision.blockingOutcome -> applyRoomStatusOutcome。
- recordsChanged 或首次成功 -> applyHomeCalendarState，records 来自 transition.state.records。
- state.hasLoaded -> hasLoadedHomeData。
- decision.syncStatus -> showSyncStatus(text, { autoHide })。
- decision.syncStatus === null 且 background -> hideSyncStatus。
- decision.loading / refreshing -> setData。
- ignored -> 不改 UI。

Calendar projection 必须继续经 applyHomeCalendarState，不能在状态机重复实现。

- [ ] **Step 5: 迁移 applyRecordChange**

保持 public method 名称：

    applyRecordChange(change = {}) {
      const transition = this.transitionRecordsSync({
        type: 'record-change',
        change
      })
      if (transition.decision.recordsChanged) {
        this.applyHomeCalendarState(transition.state.records)
      }
      if (transition.decision.syncStatus) {
        this.showSyncStatus(
          transition.decision.syncStatus.text,
          { autoHide: transition.decision.syncStatus.autoHide }
        )
      }
    }

删除 Page 内 mergeRecordChange、consumePendingRecordChangeSync 和 _hasPendingRecordChangeSync 分支。

- [ ] **Step 6: 收紧 Page harness 与静态契约测试**

保留 Page harness 的真实 lifecycle/wiring 断言，删除与 homeRecordsSync public tests 重复的内部 helper 断言。

calendar-display 静态契约改为断言：

    assert.match(js, /require\('\.\.\/\.\.\/utils\/homeRecordsSync'\)/)
    assert.match(js, /transitionHomeRecordsSync/)
    assert.doesNotMatch(js, /_hasPendingRecordChangeSync/)
    assert.doesNotMatch(js, /mergeRecordChange\(/)

- [ ] **Step 7: 运行首页相关验证并提交**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\home-records-sync.test.js D:\Codex\projects\minmin-calendar\tests\room-records-snapshot.test.js D:\Codex\projects\minmin-calendar\tests\page-registration.test.js D:\Codex\projects\minmin-calendar\tests\calendar-display.test.js D:\Codex\projects\minmin-calendar\tests\home-calendar-state.test.js
    node --check D:\Codex\projects\minmin-calendar\pages\index\index.js
    node --check D:\Codex\projects\minmin-calendar\utils\homeRecordsSync.js

Expected: 全部 PASS，两个 syntax check exit 0。

Commit:

    git add pages/index/index.js tests/page-registration.test.js tests/calendar-display.test.js
    git commit -m "refactor: deepen home records sync"

---

### Task 5: 统一 Room membership lifecycle canonical module

**风险标记：** lifecycle-critical；实现完成后必须由独立 reviewer 攻击并发、锁删除、所有权转移、archive/recovery 与回滚。

**Files:**
- Create: cloudfunctions/_shared/roomMembershipLifecycle.js
- Modify: tests/room-binding.test.js
- Modify: tests/room-lifecycle.test.js
- Test: tests/data-op-auth.test.js

**Interfaces:**
- Produces: createRoomMembershipLifecycle({ db, serverDate, generateRoomCode })。
- Produces methods: create、join、getActive、leave。
- Preserves: 现有四个操作的 event-independent return shapes。
- Internal lock rule: 已知 Room 时 release/update 必须匹配 openid + roomId；stale cleanup 使用读取到的 lock identity 做条件删除。

- [ ] **Step 1: 把现有测试切到统一 public seam 并保持红灯**

room-binding.test.js 和 room-lifecycle.test.js 都改为：

    const {
      createRoomMembershipLifecycle
    } = require('../cloudfunctions/_shared/roomMembershipLifecycle')

分别将 createRoomBinding / createRoomLifecycle construction 改为 createRoomMembershipLifecycle。

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\room-binding.test.js D:\Codex\projects\minmin-calendar\tests\room-lifecycle.test.js

Expected: FAIL，canonical module 不存在。

- [ ] **Step 2: 建立 canonical factory shell**

创建 roomMembershipLifecycle.js：

    const MAX_ROOM_CODE_ATTEMPTS = 5
    const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

    function createRoomMembershipLifecycle({
      db,
      serverDate,
      generateRoomCode = createRandomRoomCode
    }) {
      const rooms = db.collection('rooms')
      const roomMembers = db.collection('roomMembers')

      return {
        create,
        join,
        getActive,
        leave
      }
    }

这里的四个 body 必须从当前已测试 implementation 逐段迁移；不得在同一步改返回文案、错误码、Room 字段或操作顺序。迁移清单：

- RoomBinding: create、join、getActive、findArchivedRoomByCreator、findRoomByCode、findCreatedRoomFallback、findJoinedRoomFallback、restoreArchivedRoom、normalizeWaitingPartnerSlot。
- RoomLifecycle: leave、leaveCreator、leavePartner、archivePartnerOnlyRoom、archiveRoomIfStillEmpty、buildArchivedRoomData。
- Shared: findRoomByMember、findRoomById、findMemberLock、acquireMemberLock、updateMemberLock、releaseMemberLock、isActiveRoom、getUpdatedCount。

外部 pure helpers isDuplicateRoomCodeError、isDuplicateMemberLockError、normalizeRoomCode、createRandomRoomCode 一并迁移并按原测试需要导出。

- [ ] **Step 3: 先恢复全部 characterization tests**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\room-binding.test.js D:\Codex\projects\minmin-calendar\tests\room-lifecycle.test.js

Expected: 所有既有 RoomBinding 与 RoomLifecycle 用例 PASS。

此时不切换任何 runtime adapter。

- [ ] **Step 4: 写完整生命周期序列测试**

在 room-binding.test.js 使用同一 fake DB 和同一 lifecycle instance：

    test('Room membership lifecycle preserves records through transfer archive and recovery', async () => {
      const db = createFakeDb()
      const lifecycle = createRoomMembershipLifecycle({
        db,
        serverDate: () => SERVER_DATE,
        generateRoomCode: () => 'ROOM01'
      })

      assert.equal((await lifecycle.create({ openid: 'a', nickName: 'A' })).code, 0)
      assert.equal((await lifecycle.join({ openid: 'b', roomCode: 'ROOM01', nickName: 'B' })).code, 0)
      assert.equal((await lifecycle.leave({ openid: 'a' })).code, 0)
      assert.equal((await lifecycle.join({ openid: 'c', roomCode: 'ROOM01', nickName: 'C' })).code, 0)
      assert.equal((await lifecycle.leave({ openid: 'c' })).code, 0)
      assert.equal((await lifecycle.leave({ openid: 'b' })).code, 0)

      assert.equal(db.data.rooms[0].status, 'archived')
      assert.equal((await lifecycle.getActive({ openid: 'b' })).code, 1)

      const recovered = await lifecycle.create({ openid: 'b', nickName: 'B' })
      assert.equal(recovered.code, 0)
      assert.equal(recovered.room.roomCode, 'ROOM01')
      assert.equal(db.data.rooms[0].status, 'waiting')
    })

- [ ] **Step 5: 写条件 lock 删除竞态红灯测试**

扩展 fake DB remove hook：在 remove 执行前把用户 lock 改为另一个 roomId，模拟并发 create/join。

断言 lifecycle 对旧 Room 的 release 条件不匹配，不得删除新 lock：

    assert.deepEqual(db.data.roomMembers, [{
      _id: 'user-a',
      openid: 'user-a',
      roomId: 'room-new',
      roomCode: 'NEW001',
      role: 'creator'
    }])

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\room-lifecycle.test.js

Expected: FAIL，旧 implementation 按 openid 无条件删除。

- [ ] **Step 6: 实现条件 lock helper**

统一 helper：

    async function releaseMemberLock({ openid, roomId = '', roomCode = '' }) {
      if (!openid) return 0
      const query = { _id: openid }
      if (roomId) query.roomId = roomId
      if (roomCode) query.roomCode = roomCode
      const result = await roomMembers.where(query).remove()
      return getRemovedCount(result)
    }

known Room 的 create/join failure compensation 与 leave 都传 room._id；stale cleanup 先 findMemberLock，再以 lock.roomId / lock.roomCode 条件删除。

partner role 更新使用：

    const result = await roomMembers.where({
      _id: openid,
      roomId: room._id
    }).update({
      data: {
        roomCode: room.roomCode,
        role,
        updatedAt: serverDate()
      }
    })

更新计数为 0 时抛出明确错误，不能退化为无条件 doc(openid).update。

- [ ] **Step 7: 运行 Room 与授权测试**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\room-binding.test.js D:\Codex\projects\minmin-calendar\tests\room-lifecycle.test.js D:\Codex\projects\minmin-calendar\tests\data-op-auth.test.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\_shared\roomMembershipLifecycle.js

Expected: 全部 PASS，syntax check exit 0。

- [ ] **Step 8: 提交 canonical lifecycle**

Commit:

    git add cloudfunctions/_shared/roomMembershipLifecycle.js tests/room-binding.test.js tests/room-lifecycle.test.js
    git commit -m "refactor: unify room membership lifecycle"

---

### Task 6: 生成自包含部署 artifact、切换 adapter、更新文档并完成审查

**风险标记：** lifecycle-critical / deployment-critical；禁止部分切换 createRoom、joinRoom、getMyRoom。

**Files:**
- Create: cloudfunctions/_shared/syncRoomMembershipLifecycle.js
- Create: 四份 roomMembershipLifecycle.js artifact
- Modify: cloudfunctions/createRoom/index.js
- Modify: cloudfunctions/joinRoom/index.js
- Modify: cloudfunctions/getMyRoom/index.js
- Modify: cloudfunctions/leaveRoom/index.js
- Modify: tests/cloudfunction-dependencies.test.js
- Modify: CONTEXT.md
- Modify: README.md
- Delete: 三份 roomBinding.js 与 leaveRoom/roomLifecycle.js

**Interfaces:**
- Assembly: node syncRoomMembershipLifecycle.js --write | --check。
- Runtime adapters: 只 require 本目录 ./roomMembershipLifecycle。
- Deployment artifacts: byte-for-byte 等于 canonical source。
- No runtime path from adapter directories to _shared。

- [ ] **Step 1: 写 artifact check 红灯测试**

tests/cloudfunction-dependencies.test.js 增加：

    test('room membership lifecycle deployment artifacts match the canonical source', () => {
      const canonical = fs.readFileSync(
        path.join(cloudfunctionsRoot, '_shared', 'roomMembershipLifecycle.js'),
        'utf8'
      )
      const functionNames = ['createRoom', 'joinRoom', 'getMyRoom', 'leaveRoom']

      functionNames.forEach(functionName => {
        const artifact = fs.readFileSync(
          path.join(cloudfunctionsRoot, functionName, 'roomMembershipLifecycle.js'),
          'utf8'
        )
        assert.equal(artifact, canonical)
      })
    })

再增加 adapter source contract，分别断言四个 index.js require ./roomMembershipLifecycle 且调用正确 operation。

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\cloudfunction-dependencies.test.js

Expected: FAIL，四份 artifact 与新 require 尚不存在。

- [ ] **Step 2: 实现确定性 assembly script**

syncRoomMembershipLifecycle.js 使用 Node 标准库：

    const fs = require('node:fs')
    const path = require('node:path')

    const cloudfunctionsRoot = path.join(__dirname, '..')
    const canonicalPath = path.join(__dirname, 'roomMembershipLifecycle.js')
    const targets = ['createRoom', 'joinRoom', 'getMyRoom', 'leaveRoom']
      .map(name => path.join(cloudfunctionsRoot, name, 'roomMembershipLifecycle.js'))

    const mode = process.argv[2]
    if (mode !== '--write' && mode !== '--check') {
      console.error('Usage: node syncRoomMembershipLifecycle.js --write|--check')
      process.exitCode = 2
    } else {
      const canonical = fs.readFileSync(canonicalPath, 'utf8')
      const mismatches = []

      targets.forEach(target => {
        if (mode === '--write') {
          fs.writeFileSync(target, canonical, 'utf8')
          return
        }
        if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== canonical) {
          mismatches.push(target)
        }
      })

      if (mismatches.length) {
        mismatches.forEach(target => console.error('Out of sync: ' + target))
        process.exitCode = 1
      }
    }

运行：

    node D:\Codex\projects\minmin-calendar\cloudfunctions\_shared\syncRoomMembershipLifecycle.js --write
    node D:\Codex\projects\minmin-calendar\cloudfunctions\_shared\syncRoomMembershipLifecycle.js --check

Expected: --check exit 0。

- [ ] **Step 3: 原子切换四个 adapter**

四个 index.js 都改为：

    const { createRoomMembershipLifecycle } = require('./roomMembershipLifecycle')

factory 名统一为 lifecycle。各 main 只调用对应 operation：

- createRoom -> lifecycle.create({ openid: OPENID, nickName: event.nickName })
- joinRoom -> lifecycle.join({ openid: OPENID, roomCode: event.roomCode, nickName: event.nickName })
- getMyRoom -> lifecycle.getActive({ openid: OPENID })
- leaveRoom -> lifecycle.leave({ openid: OPENID })

保留原 OPENID 缺失处理、try/catch 和返回 shape。

四个 adapter 同一提交切换后，删除旧 roomBinding.js / roomLifecycle.js，不添加 re-export wrapper。

- [ ] **Step 4: 运行 adapter/artifact 与 Room 全套测试**

Run:

    node --test D:\Codex\projects\minmin-calendar\tests\cloudfunction-dependencies.test.js D:\Codex\projects\minmin-calendar\tests\room-binding.test.js D:\Codex\projects\minmin-calendar\tests\room-lifecycle.test.js D:\Codex\projects\minmin-calendar\tests\room-session.test.js D:\Codex\projects\minmin-calendar\tests\data-op-auth.test.js
    node D:\Codex\projects\minmin-calendar\cloudfunctions\_shared\syncRoomMembershipLifecycle.js --check

Expected: 全部 PASS，artifact check exit 0。

- [ ] **Step 5: 更新 CONTEXT.md 与 README.md**

CONTEXT Technical Shape 改为：

- cloudfunctions/_shared/roomMembershipLifecycle.js 是 Room membership lifecycle canonical source。
- 四个 Room 云函数 index.js 是自包含部署 adapter，本目录 artifact 由确定性 assembly 生成。
- 首页同步由 utils/homeRecordsSync.js 负责；homeCalendarState 只做 Calendar projection。
- RoomRecords add/update 返回 canonical saved Record projection，供乐观首页同步。

README Verification 在既有完整 node --test 命令中加入：

    tests\home-records-sync.test.js

并增加：
    node --check utils\homeRecordsSync.js
    node --check cloudfunctions\_shared\roomMembershipLifecycle.js
    node --check cloudfunctions\_shared\syncRoomMembershipLifecycle.js
    node cloudfunctions\_shared\syncRoomMembershipLifecycle.js --check

部署说明明确 createRoom、joinRoom、getMyRoom 同版发布，再发布 leaveRoom；云端 smoke 仍不能由本地测试替代。

- [ ] **Step 6: 运行完整本地验证**

Run 完整 test command：

    node --test D:\Codex\projects\minmin-calendar\tests\calendar-display.test.js D:\Codex\projects\minmin-calendar\tests\calendar-insights.test.js D:\Codex\projects\minmin-calendar\tests\cloudfunction-dependencies.test.js D:\Codex\projects\minmin-calendar\tests\cycle-prediction.test.js D:\Codex\projects\minmin-calendar\tests\data-op-auth.test.js D:\Codex\projects\minmin-calendar\tests\home-calendar-state.test.js D:\Codex\projects\minmin-calendar\tests\home-records-sync.test.js D:\Codex\projects\minmin-calendar\tests\page-registration.test.js D:\Codex\projects\minmin-calendar\tests\record-edit-route.test.js D:\Codex\projects\minmin-calendar\tests\record-flow.test.js D:\Codex\projects\minmin-calendar\tests\room-access-outcome.test.js D:\Codex\projects\minmin-calendar\tests\room-access-protocol.test.js D:\Codex\projects\minmin-calendar\tests\room-binding.test.js D:\Codex\projects\minmin-calendar\tests\room-data-client.test.js D:\Codex\projects\minmin-calendar\tests\room-lifecycle.test.js D:\Codex\projects\minmin-calendar\tests\room-records-snapshot.test.js D:\Codex\projects\minmin-calendar\tests\room-records.test.js D:\Codex\projects\minmin-calendar\tests\room-session.test.js D:\Codex\projects\minmin-calendar\tests\settings-flow.test.js

Run 完整 syntax checks：

    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\_shared\roomMembershipLifecycle.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\_shared\syncRoomMembershipLifecycle.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\createRoom\roomMembershipLifecycle.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\createRoom\index.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\joinRoom\roomMembershipLifecycle.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\joinRoom\index.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\getMyRoom\roomMembershipLifecycle.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\getMyRoom\index.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\leaveRoom\roomMembershipLifecycle.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\leaveRoom\index.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\dataOp\dataOpHandler.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\dataOp\roomRecords.js
    node --check D:\Codex\projects\minmin-calendar\cloudfunctions\dataOp\index.js
    node --check D:\Codex\projects\minmin-calendar\utils\room.js
    node --check D:\Codex\projects\minmin-calendar\utils\cloud.js
    node --check D:\Codex\projects\minmin-calendar\utils\roomAccessProtocol.js
    node --check D:\Codex\projects\minmin-calendar\utils\roomAccessOutcome.js
    node --check D:\Codex\projects\minmin-calendar\utils\recordCommands.js
    node --check D:\Codex\projects\minmin-calendar\utils\recordPageSync.js
    node --check D:\Codex\projects\minmin-calendar\utils\recordEditRoute.js
    node --check D:\Codex\projects\minmin-calendar\utils\settingsFlow.js
    node --check D:\Codex\projects\minmin-calendar\utils\roomRecordsSnapshot.js
    node --check D:\Codex\projects\minmin-calendar\utils\homeRecordsSync.js
    node --check D:\Codex\projects\minmin-calendar\utils\homeCalendarState.js
    node --check D:\Codex\projects\minmin-calendar\utils\util.js
    node --check D:\Codex\projects\minmin-calendar\utils\cycle.js
    node --check D:\Codex\projects\minmin-calendar\utils\calendarInsights.js
    node --check D:\Codex\projects\minmin-calendar\pages\bind\bind.js
    node --check D:\Codex\projects\minmin-calendar\pages\settings\settings.js
    node --check D:\Codex\projects\minmin-calendar\pages\index\index.js
    node --check D:\Codex\projects\minmin-calendar\pages\memory\memory.js
    node --check D:\Codex\projects\minmin-calendar\pages\memory\edit\edit.js
    node --check D:\Codex\projects\minmin-calendar\pages\period\period.js
    node --check D:\Codex\projects\minmin-calendar\pages\period\edit\edit.js

再运行：

    git diff --check
    node D:\Codex\projects\minmin-calendar\cloudfunctions\_shared\syncRoomMembershipLifecycle.js --check

Expected: 0 tests failed、所有 syntax check exit 0、diff check 无输出、artifact check exit 0。

- [ ] **Step 7: 启用多子代理对抗性 review**

必须分别委托三个只读 reviewer：

1. 数据一致性 reviewer：攻击 canonical Record 缺失、projection 泄漏、旧后端兼容、重复提交与页面 wiring。
2. 首页竞态 reviewer：攻击 stale request、partial success、collection revision、remove/update/add 序列、重排与 timer 解耦。
3. Room lifecycle reviewer：攻击 member lock 删除、并发 join/leave、所有权转移、archive/recovery、artifact drift、发布与回滚。

主 agent 同时运行 review skill，从本次 spec commit 72a60ab 的 merge-base 评审全部实现 diff。

任何 P0/P1/P2 correctness finding 必须修复并重新运行相关红绿测试；文档/状态不一致也必须修复。

- [ ] **Step 8: 记录无法本地证明的残余风险**

如果当前环境不能执行微信云端 smoke，最终交付必须明确列出未验证项：

- 真实 roomCode 唯一索引错误形态。
- 真实云数据库并发 join/leave。
- 云端实际解析的 wx-server-sdk 版本。
- 真实部署 artifact 内容与发布顺序。

不得用 fake DB 或 artifact byte equality 宣称这些云端信号已通过。

- [ ] **Step 9: 最终重新验证并提交**

修复 review finding 后，重新执行 Step 6 的完整命令，读取完整输出并确认 0 failures。

Commit:

    git add cloudfunctions pages utils tests CONTEXT.md README.md
    git commit -m "refactor: deepen calendar architecture"

最终工作树必须为空；如果生成 artifact 与 canonical 不一致，不得提交或交付。
