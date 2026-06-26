# Phase 07: Architecture Quality and Reliability Hardening - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 15
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `utils/cloud.js` | service | request-response | `utils/room.js` | role-match |
| `utils/room.js` | service | request-response | `utils/room.js` | exact |
| `pages/period/edit/edit.js` | component | CRUD | `pages/memory/edit/edit.js` | exact |
| `pages/memory/edit/edit.js` | component | CRUD | `pages/period/edit/edit.js` | exact |
| `pages/period/period.js` | component | CRUD | `pages/memory/memory.js` | exact |
| `pages/memory/memory.js` | component | CRUD | `pages/period/period.js` | exact |
| `pages/settings/settings.js` | component | file-I/O | `pages/settings/settings.js` | exact |
| `pages/index/index.js` | component | transform | `utils/calendarInsights.js` | flow-match |
| `pages/bind/bind.js` | component | request-response | `pages/bind/bind.js` | exact |
| `utils/homeCalendarState.js` | utility | transform | `utils/calendarInsights.js` | role-match |
| `tests/record-flow.test.js` | test | CRUD | `tests/room-session.test.js` | role-match |
| `tests/settings-flow.test.js` | test | file-I/O | `tests/room-session.test.js` | role-match |
| `tests/home-calendar-state.test.js` | test | transform | `tests/calendar-insights.test.js` | exact |
| `cloudfunctions/dataOp/index.js` | route | request-response | `cloudfunctions/dataOp/index.js` | exact |
| `tests/room-records.test.js` | test | request-response | `tests/room-records.test.js` | exact |

## Pattern Assignments

### `utils/cloud.js` (service, request-response)

**Analog:** `utils/room.js`

**Imports + factory seam** (`utils/room.js` lines 1-7):
```javascript
const ROOM_CODE_KEY = 'roomCode'

function createRoomSession(options = {}) {
  const storage = options.storage || createWxStorage()
  const cloud = options.cloud || createWxCloud()
```

**Return a small interface object** (`utils/room.js` lines 7-16):
```javascript
  return {
    getRoomCode() {
      return normalizeRoomCode(storage.get(ROOM_CODE_KEY))
    },

    async getActiveRoom() {
      const cachedRoomCode = normalizeRoomCode(storage.get(ROOM_CODE_KEY))
      if (cachedRoomCode) {
        return { bound: true, roomCode: cachedRoomCode }
      }
```

**Normalize success vs failure into plain objects** (`utils/room.js` lines 18-33, 83-94):
```javascript
      try {
        const res = await cloud.callFunction({ name: 'getMyRoom' })
        const roomCode = normalizeRoomCode(res.result?.room?.roomCode)
        if (res.result?.code === 0 && roomCode) {
          storage.set(ROOM_CODE_KEY, roomCode)
          return { bound: true, roomCode }
        }
      } catch (error) {
        return {
          bound: false,
          roomCode: '',
          errorMsg: '同步房间状态失败：' + getErrorMessage(error)
        }
      }
```

```javascript
    async leaveRoom() {
      try {
        const res = await cloud.callFunction({ name: 'leaveRoom' })
        if (res.result?.code !== 0) {
          return { code: -1, msg: res.result?.msg || '解除绑定失败' }
        }

        storage.remove(ROOM_CODE_KEY)
        return { code: 0 }
      } catch (error) {
        return { code: -1, msg: '解除绑定失败：' + getErrorMessage(error) }
      }
    }
```

**What to copy:** keep `utils/cloud.js` as a tiny CommonJS module that can grow a `createRoomDataClient(options)` factory, classify outcomes once, and export thin default wrappers like `getPeriods()` / `addPeriod()` on top.

---

### `utils/room.js` (service, request-response)

**Analog:** `utils/room.js`

**Cached-room-first lookup** (`utils/room.js` lines 12-24):
```javascript
    async getActiveRoom() {
      const cachedRoomCode = normalizeRoomCode(storage.get(ROOM_CODE_KEY))
      if (cachedRoomCode) {
        return { bound: true, roomCode: cachedRoomCode }
      }

      try {
        const res = await cloud.callFunction({ name: 'getMyRoom' })
        const roomCode = normalizeRoomCode(res.result?.room?.roomCode)
        if (res.result?.code === 0 && roomCode) {
          storage.set(ROOM_CODE_KEY, roomCode)
          return { bound: true, roomCode }
        }
      } catch (error) {
```

**Input normalization helpers** (`utils/room.js` lines 149-155):
```javascript
function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase()
}

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}
```

**What to copy:** if Phase 7 adds verify/repair semantics, keep them inside `RoomSession` and return plain result objects like existing `getActiveRoom()` / `joinRoom()` / `leaveRoom()` instead of throwing raw transport errors into pages.

---

### `pages/period/edit/edit.js` (component, CRUD)

**Analog:** `pages/memory/edit/edit.js`

**Page import and minimal `data` shape** (`pages/memory/edit/edit.js` lines 1-5):
```javascript
const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')

Page({
  data: { id: '', date: '', note: '', isEdit: false, saving: false },
```

**Save flow pattern** (`pages/memory/edit/edit.js` lines 22-42):
```javascript
  async save() {
    const { id, date, note, isEdit } = this.data
    if (!date) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }
    this.setData({ saving: true })
    try {
      let res
      if (isEdit) {
        res = await cloud.updateMemory(id, { date, note })
      } else {
        res = await cloud.addMemory({ date, note })
      }
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '保存成功' })
        setTimeout(() => wx.navigateBack(), 1000)
      } else {
        wx.showToast({ title: res.result?.msg || '保存失败', icon: 'error' })
      }
    } catch(e) {
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
    this.setData({ saving: false })
  },
```

**Delete confirm pattern** (`pages/memory/edit/edit.js` lines 45-60):
```javascript
  delete() {
    wx.showModal({
      title: '确认删除',
      success: async (res) => {
        if (res.confirm) {
          try {
            const r = await cloud.deleteMemory(this.data.id)
            if (r.result && r.result.code === 0) {
              wx.showToast({ title: '已删除' })
              setTimeout(() => wx.navigateBack(), 1000)
            }
          } catch(e) { wx.showToast({ title: '删除失败', icon: 'error' }) }
        }
      }
    })
  }
```

**What to copy:** extract shared save/delete command helpers around this exact loading-toast-navigate pattern, then let `period/edit` keep only validation and payload building.

---

### `pages/memory/edit/edit.js` (component, CRUD)

**Analog:** `pages/period/edit/edit.js`

**Validation before save** (`pages/period/edit/edit.js` lines 58-63):
```javascript
  async save() {
    const { id, startDate, endDate, note, flow, symptoms, isEdit } = this.data
    if (!startDate || !endDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }
    if (startDate > endDate) { wx.showToast({ title: '结束日期不能早于开始', icon: 'none' }); return }
    this.setData({ saving: true })
    const payload = cycle.buildPeriodPayload({ startDate, endDate, note, flow, symptoms })
```

**Page-local edit-mode hydration** (`pages/period/edit/edit.js` lines 19-29):
```javascript
  onLoad(options) {
    const symptoms = options.symptoms ? decodeURIComponent(options.symptoms).split(',').filter(Boolean) : []
    this.setData({
      startDate: options.startDate || util.formatDate(new Date()),
      endDate: options.endDate || util.formatDate(new Date()),
      note: options.note ? decodeURIComponent(options.note) : '',
      flow: options.flow || '',
      symptoms,
      symptomOptions: cycle.buildSymptomOptions(symptoms),
      isEdit: !!options.id, id: options.id || ''
    })
  },
```

**What to copy:** if memory edit gains helper-based retry/repair handling, preserve the same front-door page shape: `onLoad` owns query hydration, helper owns save/delete orchestration.

---

### `pages/period/period.js` (component, CRUD)

**Analog:** `pages/memory/memory.js`

**List-page skeleton** (`pages/memory/memory.js` lines 4-17):
```javascript
Page({
  goBack() { wx.navigateBack() },
  data: { memories: [], loading: true },

  onShow() { this.loadData() },

  async loadData() {
    this.setData({ loading: true })
    try {
      const memories = await cloud.getMemories()
      this.setData({ memories: [...memories].sort((a,b) => b.date.localeCompare(a.date)) })
    } catch(e) { console.error(e) }
    this.setData({ loading: false })
  },
```

**What to copy:** Phase 7 list-loading helper should preserve the list-page rhythm: `onShow -> loadData -> set loading true -> service call -> sort/map locally -> set loading false`.

**Secondary analog for explicit failure toast** (`pages/period/period.js` lines 11-24):
```javascript
  async loadData() {
    this.setData({ loading: true })
    try {
      const periods = await cloud.getPeriods()
      const sorted = [...periods]
        .sort((a,b) => b.startDate.localeCompare(a.startDate))
        .map(cycle.decoratePeriod)
      this.setData({ periods: sorted })
      this.calcStats(periods)
    } catch(e) {
      console.error(e)
      wx.showToast({ title: '加载失败，请检查网络', icon: 'none' })
    }
    this.setData({ loading: false })
  },
```

---

### `pages/memory/memory.js` (component, CRUD)

**Analog:** `pages/period/period.js`

**Navigation to create/edit pages** (`pages/period/period.js` lines 40-50):
```javascript
  addPeriod() {
    const today = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${today}&endDate=${today}` })
  },

  editPeriod(e) {
    const p = this.data.periods[e.currentTarget.dataset.index]
    const symptoms = encodeURIComponent((p.symptoms || []).join(','))
    wx.navigateTo({
      url: `/pages/period/edit/edit?id=${p._id}&startDate=${p.startDate}&endDate=${p.endDate}&note=${encodeURIComponent(p.note||'')}&flow=${p.flow || ''}&symptoms=${symptoms}`
    })
  }
```

**What to copy:** keep list pages as thin adapters; any new record-list helper should stop before navigation URL construction and leave per-page query assembly local.

---

### `pages/settings/settings.js` (component, file-I/O)

**Analog:** `pages/settings/settings.js`

**Export flow branching** (`pages/settings/settings.js` lines 28-52):
```javascript
  async exportData() {
    wx.showLoading({ title: '导出中...' })
    try {
      const periods = await cloud.getPeriods()
      const memories = await cloud.getMemories()
      const data = { exportTime: new Date().toISOString(), periods, memories }
      const json = JSON.stringify(data, null, 2)
      const fs = wx.getFileSystemManager()
      const path = `${wx.env.USER_DATA_PATH}/minmin-calendar-backup.json`
      fs.writeFileSync(path, json, 'utf8')
      wx.hideLoading()
      wx.shareFileMessage({
        filePath: path,
        success: () => wx.showToast({ title: '导出成功' }),
        fail: () => {
          wx.setClipboardData({
            data: json,
            success: () => wx.showToast({ title: '已复制到剪贴板' })
          })
        }
      })
    } catch(e) {
      wx.hideLoading()
      wx.showToast({ title: '导出失败', icon: 'error' })
    }
  },
```

**Local-only clear flow** (`pages/settings/settings.js` lines 55-67):
```javascript
  clearData() {
    wx.showModal({
      title: '⚠️ 确认清除',
      content: '将清除所有本地缓存，不会影响云端数据。确定？',
      success: (res) => {
        if (res.confirm) {
          roomSession.clearLocalRoom()
          this.setData({ roomCode: '未绑定' })
          wx.showToast({ title: '已清除' })
        }
      }
    })
  },
```

**What to copy:** if Phase 7 extracts `ExportFlow` or settings command helpers, keep the local-vs-cloud wording explicit and preserve the current share-first, clipboard-fallback branching.

---

### `pages/index/index.js` (component, transform)

**Analog:** `utils/calendarInsights.js`

**Pure derivation target currently embedded in page** (`pages/index/index.js` lines 96-138):
```javascript
  calcStats(periods) {
    const prediction = cycle.predictNextPeriod(periods)
    if (!prediction.canPredict) {
      this.setData({
        avgCycle: null,
        avgDuration: null,
        nextPredict: null,
        nextPredictDisplay: '--',
        nextPredictWeekday: '',
        predictionRangeDisplay: '',
        predictionWindow: null,
        predictConfidence: null,
        predictionDetail: prediction,
        predictionExplanation: calendarInsights.buildPredictionExplanation(prediction),
        cycleReminders: []
      })
      return
    }
```

```javascript
  renderCalendar() {
    const { year, month, periods, memories, predictionWindow } = this.data
    const today = util.formatDate(new Date())
    const days = util.buildCalendarDays({ year, month, periods, memories, nextPredict: this.data.nextPredict, predictionWindow, today })
    this.setData({ days })
  },
```

**Closest pure-module analog** (`utils/calendarInsights.js` lines 43-72, 121-155):
```javascript
function buildPredictionExplanation(prediction) {
  if (!prediction || !prediction.canPredict) {
    return {
      available: false,
      title: '预测说明',
      summary: '记录足够后会显示下次预测',
      lines: ['至少需要连续的经期记录，预测才会更稳定']
    }
  }
```

```javascript
function buildMonthlyRecap({ year, month, periods = [], memories = [], prediction = null }) {
  const monthStart = `${year}-${pad2(month + 1)}-01`
  const monthEnd = `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`
  const monthPeriods = periods.filter(period => overlapsMonth(period, monthStart, monthEnd))
  const monthMemories = memories.filter(memory => memory.date >= monthStart && memory.date <= monthEnd)
```

**What to copy:** new `utils/homeCalendarState.js` should look like `calendarInsights.js`: pure functions, no `wx`, plain input object, plain returned view model.

---

### `pages/bind/bind.js` (component, request-response)

**Analog:** `pages/bind/bind.js`

**Room state check and error propagation** (`pages/bind/bind.js` lines 18-28):
```javascript
  async checkRoom() {
    const room = await roomSession.getActiveRoom()
    if (room.bound) {
      this.setData({ bound: true, roomCode: room.roomCode })
      return
    }

    const data = { bound: false, roomCode: '' }
    if (room.errorMsg) data.errorMsg = room.errorMsg
    this.setData(data)
  },
```

**Modal-confirmed server-side unbind** (`pages/bind/bind.js` lines 68-83):
```javascript
  unbind() {
    wx.showModal({
      title: '解除绑定',
      content: '解除后需要重新扫码加入房间，数据不会丢失。确定解除？',
      success: async (res) => {
        if (res.confirm) {
          const result = await roomSession.leaveRoom()
          if (result.code === 0) {
            this.setData({ bound: false, roomCode: '', myRoomCode: '', joinCode: '' })
            return
          }

          this.setData({ errorMsg: result.msg || '解除绑定失败，请稍后重试' })
        }
      }
    })
  }
```

**What to copy:** any stale-room repair flow that ultimately redirects users back to bind should preserve this page’s `errorMsg`-driven UX rather than inventing a second status pattern.

---

### `utils/homeCalendarState.js` (utility, transform)

**Analog:** `utils/calendarInsights.js`

**Pure imports only** (`utils/calendarInsights.js` lines 1-2):
```javascript
const cycle = require('./cycle')
const util = require('./util')
```

**Pure function contract** (`utils/calendarInsights.js` lines 121-155):
```javascript
function buildMonthlyRecap({ year, month, periods = [], memories = [], prediction = null }) {
  const monthStart = `${year}-${pad2(month + 1)}-01`
  const monthEnd = `${year}-${pad2(month + 1)}-${pad2(new Date(year, month + 1, 0).getDate())}`
```

```javascript
  return {
    title,
    periodSummary,
    memorySummary,
    predictionSummary,
    highlights,
    shareText: shareLines.filter(Boolean).join('\n')
  }
}
```

**What to copy:** keep this new file as a pure CommonJS utility with one or a few named functions like `buildHomeCalendarState({ year, month, periods, memories, today })`, returning only serializable page data.

---

### `tests/record-flow.test.js` (test, CRUD)

**Analog:** `tests/room-session.test.js`

**Inline fake collaborators + top-level `test(...)` style** (`tests/room-session.test.js` lines 6-15, 126-154):
```javascript
test('RoomSession uses cached room code without calling recovery cloud function', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud()
  const session = createRoomSession({ storage, cloud })

  const result = await session.getActiveRoom()

  assert.deepEqual(result, { bound: true, roomCode: 'ROOM01' })
  assert.deepEqual(cloud.calls, [])
})
```

```javascript
function createFakeCloud(results = {}) {
  const cloud = {
    calls: [],
    async callFunction(options) {
      cloud.calls.push(options)
      const result = results[options.name]
      if (result instanceof Error) throw result
      return { result: result || {} }
    }
  }

  return cloud
}
```

**What to copy:** page/flow helper tests should use in-file fakes for `wx`/client adapters, assert on returned outcome objects and captured calls, and avoid introducing a test framework.

---

### `tests/settings-flow.test.js` (test, file-I/O)

**Analog:** `tests/room-session.test.js`

**Behavior-first assertions** (`tests/room-session.test.js` lines 96-124):
```javascript
test('RoomSession leaveRoom revokes the server room and clears the cached room code', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    leaveRoom: { code: 0 }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.leaveRoom()

  assert.deepEqual(result, { code: 0 })
  assert.equal(storage.get('roomCode'), '')
  assert.deepEqual(cloud.calls, [{ name: 'leaveRoom' }])
})
```

**What to copy:** assert explicit branch outcomes such as “share succeeded”, “share failed but clipboard succeeded”, and “write failed” the same way existing tests assert storage side effects and recorded collaborator calls.

---

### `tests/home-calendar-state.test.js` (test, transform)

**Analog:** `tests/calendar-insights.test.js`

**Pure-module assertion style** (`tests/calendar-insights.test.js` lines 18-40):
```javascript
test('buildPredictionExplanation turns prediction math into plain copy', () => {
  const prediction = cycle.predictNextPeriod([
    period('2026-01-01', '2026-01-05'),
    period('2026-01-29', '2026-02-02'),
    period('2026-02-26', '2026-03-02'),
    period('2026-04-20', '2026-04-24'),
    period('2026-05-18', '2026-05-22'),
    period('2026-06-15', '2026-06-19'),
    period('2026-07-13', '2026-07-17')
  ])

  assert.deepEqual(insights.buildPredictionExplanation(prediction), {
```

**Local inline fixtures** (`tests/calendar-insights.test.js` lines 105-122):
```javascript
function period(startDate, endDate) {
  return {
    startDate,
    endDate,
    duration: daysBetween(startDate, endDate) + 1
  }
}
```

**What to copy:** test the new homepage state builder as a deterministic pure function with inline period/memory fixtures and exact object assertions.

---

### `cloudfunctions/dataOp/index.js` (route, request-response)

**Analog:** `cloudfunctions/dataOp/index.js`

**Module-level adapter creation** (`cloudfunctions/dataOp/index.js` lines 1-7):
```javascript
const cloud = require('wx-server-sdk')
const { ALLOWED_COLLECTIONS, createRoomRecords } = require('./roomRecords')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const records = createRoomRecords({ db, serverDate: () => db.serverDate() })
```

**Auth gate + action dispatch** (`cloudfunctions/dataOp/index.js` lines 29-57):
```javascript
  if (!ALLOWED_COLLECTIONS.includes(collection)) {
    return { code: -1, msg: '不支持的数据集合' }
  }
  if (!event.roomCode) {
    return { code: -1, msg: '缺少房间码' }
  }
```

```javascript
    const roomCode = String(event.roomCode).toUpperCase()
    const room = await getRoomForUser(roomCode, OPENID)
    if (!room) return { code: -1, msg: '无权访问该房间' }

    if (action === 'list') {
      return records.list({ collection, roomCode })
    }
```

**What to copy:** if stale-room signaling needs cloud cooperation, keep it as a small `{ code, msg }` contract change at this adapter layer; do not move record authorization into client helpers.

---

### `tests/room-records.test.js` (test, request-response)

**Analog:** `tests/room-records.test.js`

**Deep-module fake DB harness** (`tests/room-records.test.js` lines 8-45):
```javascript
test('RoomRecords add stores a normalized Period record for the active Room', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      _id: 'client-id',
      roomCode: 'OTHER',
      createdBy: 'attacker',
      createdAt: 'old',
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      duration: 99,
      note: 'need rest',
      flow: 'heavy',
      symptoms: ['cramps', 'unknown', 'cramps', 'headache']
    }
  })
```

**Cross-room rejection assertions** (`tests/room-records.test.js` lines 119-143):
```javascript
test('RoomRecords blocks cross-Room updates and removes', async () => {
  const db = createFakeDb({
    memories: [
      { _id: 'm1', roomCode: 'OTHER', date: '2026-06-24', note: 'private' }
    ]
  })
```

**What to copy:** any added server-side auth or normalization edge-case coverage should extend this fake-db style instead of adding integration-only tests first.

## Shared Patterns

### Service seam pattern
**Source:** `utils/room.js`
**Apply to:** `utils/cloud.js`, any new page-flow helper module
```javascript
function createRoomSession(options = {}) {
  const storage = options.storage || createWxStorage()
  const cloud = options.cloud || createWxCloud()

  return {
    async getActiveRoom() {
      // normalize collaborator behavior into plain result objects
    }
  }
}
```

### Page adapter pattern
**Source:** `pages/period/edit/edit.js`, `pages/settings/settings.js`
**Apply to:** all extracted command/flow helpers
```javascript
this.setData({ saving: true })
try {
  // invoke shared helper or client seam
  wx.showToast({ title: '保存成功' })
  setTimeout(() => wx.navigateBack(), 1000)
} catch (e) {
  wx.showToast({ title: '保存失败', icon: 'error' })
}
this.setData({ saving: false })
```

### Pure derivation pattern
**Source:** `utils/calendarInsights.js`, `utils/cycle.js`
**Apply to:** `utils/homeCalendarState.js`
```javascript
function buildSomething(input) {
  // pure computation only
  return {
    /* serializable view model */
  }
}

module.exports = {
  buildSomething
}
```

### Server-side authorization pattern
**Source:** `cloudfunctions/dataOp/index.js`
**Apply to:** any touched cloud adapter logic
```javascript
const room = await getRoomForUser(roomCode, OPENID)
if (!room) return { code: -1, msg: '无权访问该房间' }
```

### Deep-module test harness pattern
**Source:** `tests/room-session.test.js`, `tests/room-records.test.js`, `tests/calendar-insights.test.js`
**Apply to:** all new Phase 7 tests
```javascript
const assert = require('node:assert/strict')
const test = require('node:test')

// inline fake collaborators, inline fixtures, explicit deepEqual assertions
```

## No Analog Found

None. Every likely Phase 7 file has at least a strong role-match or flow-match analog already in the repository.

## Metadata

**Analog search scope:** `utils/`, `pages/`, `cloudfunctions/dataOp/`, `cloudfunctions/leaveRoom/`, `tests/`, `.planning/phase 07 artifacts`
**Files scanned:** 18
**Pattern extraction date:** 2026-06-26
