const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

let settingsFlow = {}
try {
  settingsFlow = require('../utils/settingsFlow')
} catch (error) {
  settingsFlow = {}
}

test('copyRoomCode copies a bound room code and reports success feedback', async () => {
  assert.equal(typeof settingsFlow.copyRoomCode, 'function')

  const env = createFakeSettingsEnv()

  const result = await settingsFlow.copyRoomCode({
    roomCode: 'ROOM01',
    wx: env.wx
  })

  assert.deepEqual(result, { kind: 'success', roomCode: 'ROOM01' })
  assert.deepEqual(env.wx.clipboardCalls, ['ROOM01'])
  assert.deepEqual(env.wx.toasts, [{ title: '房间码已复制' }])
})

test('copyRoomCode leaves unbound states untouched and returns an explicit outcome', async () => {
  assert.equal(typeof settingsFlow.copyRoomCode, 'function')

  const env = createFakeSettingsEnv()

  const emptyResult = await settingsFlow.copyRoomCode({
    roomCode: '',
    wx: env.wx
  })
  const unboundResult = await settingsFlow.copyRoomCode({
    roomCode: '未绑定',
    wx: env.wx
  })

  assert.deepEqual(emptyResult, { kind: 'unbound' })
  assert.deepEqual(unboundResult, { kind: 'unbound' })
  assert.deepEqual(env.wx.clipboardCalls, [])
  assert.deepEqual(env.wx.toasts, [
    { title: '请先绑定房间', icon: 'none' },
    { title: '请先绑定房间', icon: 'none' }
  ])
})

test('copyRoomCode returns copy-failed when clipboard api is unavailable', async () => {
  assert.equal(typeof settingsFlow.copyRoomCode, 'function')

  assert.deepEqual(
    await settingsFlow.copyRoomCode({ roomCode: 'ROOM01', wx: {} }),
    { kind: 'copy-failed', message: '剪贴板不可用' }
  )
  assert.deepEqual(
    await settingsFlow.copyRoomCode({ roomCode: 'ROOM01', wx: null }),
    { kind: 'copy-failed', message: '剪贴板不可用' }
  )
})

test('exportRecordsAsJson keeps the JSON shape, writes the backup file, and shares it first', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv()
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
  })

  const result = await settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  assert.equal(result.kind, 'shared')
  assert.equal(result.filePath, '/tmp/user-data/minmin-calendar-backup.json')
  assert.deepEqual(env.wx.loadingCalls, [{ title: '导出中...' }])
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.shareCalls, ['/tmp/user-data/minmin-calendar-backup.json'])
  assert.deepEqual(env.wx.clipboardCalls, [])
  assert.deepEqual(env.wx.actionSheets, [])
  assert.deepEqual(env.wx.toasts, [{ title: '导出成功' }])
  assert.deepEqual(client.calls, [
    { action: 'list', collection: 'periods' },
    { action: 'list', collection: 'memories' }
  ])

  assert.equal(env.fs.writes.length, 1)
  assert.equal(env.fs.writes[0].path, '/tmp/user-data/minmin-calendar-backup.json')
  assert.equal(env.fs.writes[0].encoding, 'utf8')
  assert.deepEqual(JSON.parse(env.fs.writes[0].data), {
    exportTime: '2026-06-26T08:00:00.000Z',
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
  })
})

// issue #150：分享失败只返回可识别结果，由用户在「重试分享／复制 JSON／取消」里明确选择；
// 只有显式选「复制 JSON」才调用剪贴板 API。「取消」是系统操作菜单自带的取消键。
const SHARE_FAILURE = { errMsg: 'shareFileMessage:fail system error' }
const BACKUP_PATH = '/tmp/user-data/minmin-calendar-backup.json'

test('exportRecordsAsJson returns a recognizable share failure and leaves the clipboard alone when the user cancels the choice', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv({ shareError: SHARE_FAILURE })
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
  })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.actionSheets.length, 1, 'a failed share asks the user what to do next')
  const choice = env.wx.actionSheets[0]
  assert.deepEqual(choice.itemList, ['重试分享', '复制 JSON'])
  assert.match(choice.alertText, /分享没有完成/)
  assert.match(choice.alertText, /复制 JSON/)
  assert.match(choice.alertText, /全部经期和欢乐时光/)
  assert.match(choice.alertText, /剪贴板/)
  assert.deepEqual(env.wx.clipboardCalls, [], 'a failed share must not copy anything on its own')
  assert.deepEqual(env.wx.toasts, [])

  env.wx.tapActionSheet('取消')
  const result = await promise

  assert.deepEqual(result, { kind: 'share-failed', filePath: BACKUP_PATH })
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.shareCalls, [BACKUP_PATH])
  assert.deepEqual(env.wx.clipboardCalls, [], 'cancelling the choice must not copy')
  assert.deepEqual(env.wx.toasts, [], 'cancelling the choice must not claim anything was copied')
  assert.deepEqual(env.wx.modals, [])
})

test('exportRecordsAsJson copies the full export JSON only after the user explicitly chooses 复制 JSON', async () => {
  const env = createFakeSettingsEnv({ shareError: SHARE_FAILURE })
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
  })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.actionSheets.length, 1)
  assert.deepEqual(env.wx.clipboardCalls, [], 'nothing is copied before the explicit choice')

  env.wx.tapActionSheet('复制 JSON')
  const result = await promise

  assert.deepEqual(result, { kind: 'copied', filePath: BACKUP_PATH })
  assert.equal(env.wx.clipboardCalls.length, 1)
  assert.deepEqual(JSON.parse(env.wx.clipboardCalls[0]), {
    exportTime: '2026-06-26T08:00:00.000Z',
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
  })
  assert.deepEqual(env.wx.toasts, [{ title: '已复制到剪贴板' }])
  assert.deepEqual(env.wx.modals, [], 'the explicit copy asks no second confirmation')
  assert.deepEqual(env.wx.shareCalls, [BACKUP_PATH])
})

test('exportRecordsAsJson shares the same backup again on 重试分享 and offers the choice again while sharing keeps failing', async () => {
  const env = createFakeSettingsEnv({
    shareError: call => (call < 3 ? SHARE_FAILURE : null)
  })
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: []
  })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  env.wx.tapActionSheet('重试分享')
  await waitForAsyncTurn()
  assert.equal(env.wx.actionSheets.length, 2, 'a failed retry offers the same choice again')
  assert.deepEqual(env.wx.actionSheets[1].itemList, ['重试分享', '复制 JSON'])

  env.wx.tapActionSheet('重试分享')
  const result = await promise

  assert.deepEqual(result, { kind: 'shared', filePath: BACKUP_PATH })
  assert.deepEqual(env.wx.shareCalls, [BACKUP_PATH, BACKUP_PATH, BACKUP_PATH])
  assert.equal(env.fs.writes.length, 1, 'retrying shares the file already written')
  assert.deepEqual(client.calls, [
    { action: 'list', collection: 'periods' },
    { action: 'list', collection: 'memories' }
  ], 'retrying the share does not reload the records')
  assert.deepEqual(env.wx.clipboardCalls, [])
  assert.deepEqual(env.wx.toasts, [{ title: '导出成功' }])
})

test('exportRecordsAsJson treats a missing share api as a share failure and never copies on its own', async () => {
  const env = createFakeSettingsEnv()
  delete env.wx.shareFileMessage
  const client = createFakeRoomDataClient({ periods: [], memories: [] })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.actionSheets.length, 1)
  assert.deepEqual(env.wx.clipboardCalls, [])

  env.wx.tapActionSheet('取消')

  assert.deepEqual(await promise, { kind: 'share-failed', filePath: BACKUP_PATH })
  assert.deepEqual(env.wx.clipboardCalls, [])
  assert.deepEqual(env.wx.toasts, [])
})

test('exportRecordsAsJson reports a failed explicit copy as a copy failure without claiming the JSON was copied', async () => {
  const env = createFakeSettingsEnv({
    shareError: SHARE_FAILURE,
    clipboardError: { errMsg: 'setClipboardData:fail system error' }
  })
  const client = createFakeRoomDataClient({ periods: [], memories: [] })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  env.wx.tapActionSheet('复制 JSON')

  assert.deepEqual(await promise, { kind: 'copy-failed', filePath: BACKUP_PATH })
  assert.equal(env.wx.clipboardCalls.length, 1)
  assert.deepEqual(env.wx.toasts, [{ title: '复制失败', icon: 'error' }])
})

test('exportRecordsAsJson leaves the clipboard untouched and silent when the user cancels the share panel', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv({
    shareError: { errMsg: 'shareFileMessage:fail cancel' }
  })
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
  })

  const result = await settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  assert.equal(result.kind, 'cancelled')
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.shareCalls, ['/tmp/user-data/minmin-calendar-backup.json'])
  assert.deepEqual(env.wx.clipboardCalls, [], 'cancelling the share must not rewrite the clipboard')
  assert.deepEqual(env.wx.toasts, [], 'cancelling the share must not claim the export was copied')
  assert.deepEqual(env.wx.actionSheets, [], 'cancelling the share panel ends the export without a follow-up choice')
})

test('exportRecordsAsJson surfaces a retry action and retries the export when the user confirms', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv()
  let periodsCalls = 0
  let memoriesCalls = 0
  const client = createFakeRoomDataClient({
    periods: () => {
      periodsCalls += 1
      if (periodsCalls === 1) {
        return {
          kind: 'retryable-failure',
          message: '云数据库查询超时 (15000ms)',
          retry: async () => ({ kind: 'success', data: [] })
        }
      }
      return {
        kind: 'success',
        data: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }]
      }
    },
    memories: () => {
      memoriesCalls += 1
      return {
        kind: 'success',
        data: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
      }
    }
  })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)

  const result = await env.wx.resolveModal(true, promise)

  assert.equal(result.kind, 'shared')
  assert.equal(env.wx.hideLoadingCalls, 2)
  assert.deepEqual(env.wx.toasts, [{ title: '导出成功' }])
  assert.equal(env.fs.writes.length, 1)
  assert.equal(periodsCalls, 2)
  assert.equal(memoriesCalls, 1)
})

test('exportRecordsAsJson returns retry fallback when wx is null', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const fallback = {
    kind: 'retryable-failure',
    message: 'network down'
  }
  const client = createFakeRoomDataClient({
    periods: fallback,
    memories: []
  })

  const result = await settingsFlow.exportRecordsAsJson({
    wx: null,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  assert.deepEqual(result, fallback)
  assert.deepEqual(client.calls, [{ action: 'list', collection: 'periods' }])
})

test('exportRecordsAsJson returns retry fallback when modal and toast are unavailable', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const fallback = {
    kind: 'retryable-failure',
    message: 'network down'
  }
  const client = createFakeRoomDataClient({
    periods: fallback,
    memories: []
  })

  const result = await settingsFlow.exportRecordsAsJson({
    wx: {},
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  assert.deepEqual(result, fallback)
  assert.deepEqual(client.calls, [{ action: 'list', collection: 'periods' }])
})

test('exportRecordsAsJson stops before writing when memories fail after periods load', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv()
  let periodsCalls = 0
  let memoriesCalls = 0
  const client = createFakeRoomDataClient({
    periods: () => {
      periodsCalls += 1
      return [{ _id: 'p1', startDate: '2026-06-01' }]
    },
    memories: () => {
      memoriesCalls += 1
      if (memoriesCalls === 1) {
        return {
          kind: 'retryable-failure',
          message: 'network down'
        }
      }
      return [{ _id: 'm1', date: '2026-06-03' }]
    }
  })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)
  assert.equal(env.wx.modals[0].title, '导出失败')
  assert.equal(env.wx.modals[0].content, '导出失败，请检查网络')
  assert.deepEqual(env.fs.writes, [])
  assert.deepEqual(env.wx.shareCalls, [])
  assert.deepEqual(env.wx.clipboardCalls, [])

  const result = await env.wx.resolveModal(true, promise)

  assert.equal(result.kind, 'shared')
  assert.equal(periodsCalls, 2)
  assert.equal(memoriesCalls, 2)
  assert.deepEqual(env.wx.toasts, [{ title: '导出成功' }])
  assert.equal(env.fs.writes.length, 1)
})

test('exportRecordsAsJson treats malformed collection outcomes as export failures', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv()
  const client = {
    async list() {
      return null
    }
  }

  const result = await settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  assert.deepEqual(result, {
    kind: 'export-failed',
    message: '导出失败'
  })
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.fs.writes, [])
  assert.deepEqual(env.wx.toasts, [{ title: '导出失败', icon: 'none' }])
})

test('exportRecordsAsJson keeps repaired room export failures on the export retry copy', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv()
  let periodsCalls = 0
  const client = createFakeRoomDataClient({
    periods: () => {
      periodsCalls += 1
      if (periodsCalls === 1) {
        return {
          kind: 'room-repair',
          roomCode: 'ROOM01',
          repair: {
            kind: 'success',
            bound: true,
            roomCode: 'ROOM02'
          }
        }
      }
      return [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }]
    },
    memories: []
  })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)
  assert.equal(env.wx.modals[0].title, '房间状态已更新')
  assert.equal(env.wx.modals[0].content, '房间状态已更新，请重试导出')
  assert.equal(env.wx.modals[0].confirmText, '重试')

  const result = await env.wx.resolveModal(true, promise)

  assert.equal(result.kind, 'shared')
  assert.equal(periodsCalls, 2)
  assert.equal(env.wx.hideLoadingCalls, 2)
  assert.deepEqual(env.wx.toasts, [{ title: '导出成功' }])
})

test('exportRecordsAsJson offers to rebind when the room cache is stale and cannot be repaired', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv()
  const client = createFakeRoomDataClient({
    periods: {
      kind: 'room-repair',
      roomCode: 'ROOM01',
      repair: {
        kind: 'success',
        bound: false,
        roomCode: ''
      }
    },
    memories: []
  })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, {
    kind: 'room-repair',
    roomCode: 'ROOM01',
    repair: {
      kind: 'success',
      bound: false,
      roomCode: ''
    }
  })
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.navigateToCalls, [{ url: '/pages/bind/bind' }])
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(env.fs.writes.length, 0)
})

test('exportRecordsAsJson keeps room repair retryable failures on the retry path', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv()
  const client = createFakeRoomDataClient({
    periods: {
      kind: 'room-repair',
      roomCode: 'ROOM01',
      repair: {
        kind: 'retryable-failure',
        message: '同步房间状态失败：network down'
      }
    },
    memories: []
  })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)
  assert.equal(env.wx.modals[0].title, '房间同步失败')
  assert.equal(env.wx.modals[0].content, '网络不太稳定，请重试')
  assert.doesNotMatch(env.wx.modals[0].content, /network down/)
  assert.equal(env.wx.modals[0].confirmText, '重试')

  const result = await env.wx.resolveModal(false, promise)

  assert.deepEqual(result, {
    kind: 'room-repair',
    roomCode: 'ROOM01',
    repair: {
      kind: 'retryable-failure',
      message: '同步房间状态失败：network down'
    }
  })
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.navigateToCalls, [])
  assert.deepEqual(env.wx.toasts, [])
  assert.equal(env.fs.writes.length, 0)
})

test('exportRecordsAsJson hides loading and reports export failure when file writing throws', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv({ writeError: new Error('disk full') })
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
  })

  const result = await settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  assert.equal(result.kind, 'export-failed')
  assert.equal(result.message, '这次没有完成，请重试')
  assert.doesNotMatch(result.message, /disk full/)
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.toasts, [{ title: '导出失败', icon: 'error' }])
  assert.deepEqual(env.wx.shareCalls, [])
  assert.deepEqual(env.wx.clipboardCalls, [])
})

test('exportRecordsAsJson reports export failure when toast is unavailable', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const fs = {
    writeFileSync() {
      throw new Error('disk full')
    }
  }
  const wxApi = {
    loadingCalls: [],
    hideLoadingCalls: 0,
    showLoading(options) {
      this.loadingCalls.push(options)
    },
    hideLoading() {
      this.hideLoadingCalls += 1
    },
    getFileSystemManager() {
      return fs
    }
  }
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1' }],
    memories: []
  })

  const result = await settingsFlow.exportRecordsAsJson({
    wx: wxApi,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  assert.deepEqual(result, {
    kind: 'export-failed',
    message: '这次没有完成，请重试'
  })
  assert.deepEqual(wxApi.loadingCalls, [{ title: '导出中...' }])
  assert.equal(wxApi.hideLoadingCalls, 1)
})

test('clearLocalCache only clears the local room cache, never leaves the shared room, and re-resolves the active room', async () => {
  assert.equal(typeof settingsFlow.clearLocalCache, 'function')

  const env = createFakeSettingsEnv()
  let clearCalls = 0
  let leaveCalls = 0
  let deleteCalls = 0
  let resolveCalls = 0
  const roomSession = {
    clearLocalRoom() {
      clearCalls += 1
    },
    async getActiveRoom() {
      resolveCalls += 1
      return { kind: 'success', bound: true, roomCode: 'ROOM01' }
    },
    leaveRoom() {
      leaveCalls += 1
    }
  }
  const cloud = {
    async deleteMemory() {
      deleteCalls += 1
    }
  }

  const result = await settingsFlow.clearLocalCache({
    wx: env.wx,
    roomSession,
    cloud
  })

  assert.deepEqual(result, {
    kind: 'success',
    room: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })
  assert.equal(clearCalls, 1)
  assert.equal(resolveCalls, 1)
  assert.equal(leaveCalls, 0)
  assert.equal(deleteCalls, 0)
  assert.deepEqual(env.wx.toasts, [{ title: '已清除本机房间码' }])
})

test('clearLocalCache keeps the unbound state when re-resolution finds no room', async () => {
  assert.equal(typeof settingsFlow.clearLocalCache, 'function')

  const env = createFakeSettingsEnv()
  const roomSession = {
    clearLocalRoom() {},
    async getActiveRoom() {
      return { kind: 'no-room', bound: false, roomCode: '' }
    }
  }

  const result = await settingsFlow.clearLocalCache({
    wx: env.wx,
    roomSession
  })

  assert.deepEqual(result, {
    kind: 'success',
    room: { kind: 'no-room', bound: false, roomCode: '' }
  })
  assert.deepEqual(env.wx.toasts, [{ title: '已清除本机房间码' }])
})

// Settings page behavior is covered through the shared platform in settings-page.test.js.

test('settings labels local resync as an ordinary action', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  assert.match(wxml, /aria-label="重新同步房间"/)
  assert.match(wxml, />重新同步房间<\//)
  assert.doesNotMatch(wxml, /清除本地数据/)
  assert.doesNotMatch(wxml, /bindtap="clearData"[^>]*danger/)
})

test('confirmExport explains the export is complete, should be saved to 文件传输助手, and cannot be imported', async () => {
  assert.equal(typeof settingsFlow.confirmExport, 'function')

  const env = createFakeSettingsEnv()

  const promise = settingsFlow.confirmExport({ wx: env.wx })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)
  const modal = env.wx.modals[0]
  assert.match(modal.content, /全部经期和欢乐时光/)
  assert.match(modal.content, /文件传输助手/)
  assert.match(modal.content, /不能导入恢复/)
  assert.doesNotMatch(modal.content, /JSON/)

  const result = await env.wx.resolveModal(true, promise)

  assert.deepEqual(result, { kind: 'confirmed' })
})

test('confirmExport returns cancelled when the user dismisses the export explanation', async () => {
  assert.equal(typeof settingsFlow.confirmExport, 'function')

  const env = createFakeSettingsEnv()

  const promise = settingsFlow.confirmExport({ wx: env.wx })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)

  const result = await env.wx.resolveModal(false, promise)

  assert.deepEqual(result, { kind: 'cancelled' })
})

test('confirmExport cancels when the modal api cannot ask for consent', async () => {
  assert.equal(typeof settingsFlow.confirmExport, 'function')

  assert.deepEqual(await settingsFlow.confirmExport({ wx: null }), { kind: 'cancelled' })
  assert.deepEqual(await settingsFlow.confirmExport({ wx: {} }), { kind: 'cancelled' })
})

test('settings about group shows the version once and opens a short help sheet', async () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  const about = wxml.slice(wxml.indexOf('>关于<'), wxml.indexOf('settings-danger-zone'))

  assert.equal((wxml.match(/1\.0\.0/g) || []).length, 1)
  assert.match(about, /v1\.0\.0/)
  assert.match(about, /bindtap="openHelp"/)
  assert.match(about, /aria-label="使用说明"/)

  const helpStart = wxml.indexOf('class="help-sheet')
  assert.ok(helpStart !== -1, 'expected the help sheet')
  const help = wxml.slice(helpStart)
  assert.match(help, /房间是你们两个人共用的日历/)
  assert.match(help, /房间会归档/)
  assert.match(help, /不是医疗建议/)
  assert.match(wxml, /aria-label="关闭使用说明"/)
})

test('settings help binds lifecycle, accessibility and system-back state in WXML', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  assert.match(wxml, /wx:if="\{\{helpMounted\}\}"/)
  assert.match(wxml, /class="help-mask sheet-\{\{helpPhase\}\}"/)
  assert.match(wxml, /class="help-slide sheet-\{\{helpPhase\}\}"/)
  const container = /<page-container\b[^>]*>/.exec(wxml)
  assert.ok(container)
  assert.match(container[0], /wx:if="\{\{sheetExitGuard\}\}"/)
  assert.match(container[0], /show="\{\{true\}\}"/)
  assert.match(container[0], /bindbeforeleave="onSheetSystemBack"/)
  assert.match(container[0], /overlay="\{\{false\}\}"/)
  assert.match(container[0], /\bduration="0"/)
  for (const cls of ['nav-bar', 'content']) {
    const tag = new RegExp(`<view\\b[^>]*\\bclass="${cls}[\\s"][^>]*>`).exec(wxml)
    assert.ok(tag, `expected the ${cls} region`)
    assert.match(tag[0], /aria-hidden="\{\{pageObscured\}\}"/)
  }
})

test('exportRecordsAsJson explains the export and proceeds after confirmation when confirmBeforeExport is set', async () => {
  const env = createFakeSettingsEnv()
  const client = createFakeRoomDataClient({ periods: [], memories: [] })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data',
    confirmBeforeExport: true
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)
  const modal = env.wx.modals[0]
  assert.match(modal.content, /全部经期和欢乐时光/)
  assert.match(modal.content, /文件传输助手/)
  assert.match(modal.content, /不能导入恢复/)
  assert.doesNotMatch(modal.content, /JSON/)
  assert.deepEqual(env.wx.loadingCalls, [])
  assert.deepEqual(client.calls, [])

  const result = await env.wx.resolveModal(true, promise)

  assert.equal(result.kind, 'shared')
  assert.deepEqual(env.wx.loadingCalls, [{ title: '导出中...' }])
  assert.deepEqual(client.calls, [
    { action: 'list', collection: 'periods' },
    { action: 'list', collection: 'memories' }
  ])
  assert.equal(env.fs.writes.length, 1)
})

test('exportRecordsAsJson stops without touching data when the export explanation is cancelled', async () => {
  const env = createFakeSettingsEnv()
  const client = createFakeRoomDataClient({ periods: [], memories: [] })

  const promise = settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data',
    confirmBeforeExport: true
  })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)

  const result = await env.wx.resolveModal(false, promise)

  assert.deepEqual(result, { kind: 'cancelled' })
  assert.deepEqual(env.wx.loadingCalls, [])
  assert.deepEqual(client.calls, [])
  assert.deepEqual(env.fs.writes, [])
  assert.deepEqual(env.wx.shareCalls, [])
  assert.deepEqual(env.wx.clipboardCalls, [])
})

// Room loading, cached first frames and retry/navigation are exercised in settings-page.test.js.

test('settings room-code card swaps the dead sentence for tappable retry and go-bind rows when no code is available', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  const cardStart = wxml.indexOf('class="menu-item room-code-item')
  const cardEnd = wxml.indexOf('日历显示')
  assert.ok(cardStart !== -1 && cardEnd > cardStart, 'expected the room-code card')
  const card = wxml.slice(cardStart, cardEnd)

  // 首帧无缓存时只显示中性状态；云端完成后才出现操作。
  assert.match(card, /class="room-code-value \{\{roomCode \? '' : 'muted'\}\}"/)
  assert.match(wxssRuleBody(readPageFile('pages/settings/settings.wxss'), '.room-code-value.muted'), /color:\s*var\(--text-secondary\)/)

  // 没有房间码（未绑定 / 同步失败）时：重试 + 去绑定两个可点操作
  assert.match(card, /wx:if="\{\{roomCodeLoaded && !roomCode\}\}" class="room-code-actions"/)
  assert.match(card, /bindtap="retryRoomResolve"[\s\S]*?aria-role="button"[\s\S]*?aria-label="重试获取房间码"/)
  assert.match(card, />重试<\//)
  assert.match(card, /bindtap="goBind"[\s\S]*?aria-role="button"[\s\S]*?aria-label="去绑定房间"/)
  assert.match(card, />去绑定<\//)

  // 有房间码时仍只有复制控件；操作行与复制互斥
  assert.match(card, /wx:if="\{\{roomCode\}\}" class="copy-btn"/)
})

test('settings room actions are rose tappable rows with the shared small-action treatment', () => {
  const wxss = readPageFile('pages/settings/settings.wxss')
  const btn = wxssRuleBody(wxss, '.room-action-btn')

  assert.match(btn, /min-height:\s*88rpx/)
  assert.match(btn, /color:\s*#E8909E/i)
  assert.match(btn, /border-radius:\s*var\(--radius-sm\)/)
  assert.match(btn, /background:\s*rgba\(232,144,158,0\.08\)/)
  assert.doesNotMatch(btn, /linear-gradient/i)

  const active = wxssRuleBody(wxss, '.room-action-btn:active')
  assert.match(active, /transform:\s*scale\(0\.9[458]\)/)

  // 减弱动效走既有即时按压缩放名单
  const reduced = wxss.slice(wxss.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reduced, /\.room-action-btn/)
})

// ===== issue #102：「解除绑定」从绑定页已绑定卡移到设置页房间卡 =====

test('settings room group keeps copy and retry, and does not host unbind', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  const cardStart = wxml.indexOf('class="menu-item room-code-item')
  const cardEnd = wxml.indexOf('日历显示')
  assert.ok(cardStart !== -1 && cardEnd > cardStart, 'expected the room-code card')
  const card = wxml.slice(cardStart, cardEnd)

  assert.match(card, /wx:if="\{\{roomCode\}\}" class="copy-btn"/)
  assert.doesNotMatch(card, /bindtap="unbind"|解除绑定/)
})

// issue #139：设置页按房间、日历显示、数据、关于分组，解除绑定单独在页底危险区
test('settings page leads with room info in named groups and keeps unbind in the bottom danger zone', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')

  assert.doesNotMatch(wxml, /profile-card|profile-avatar|goMemory|查看欢乐时光/)

  const titles = [...wxml.matchAll(/class="settings-group-title">([^<]+)</g)].map((match) => match[1])
  assert.deepEqual(titles, ['房间', '日历显示', '数据', '关于'])

  const room = wxml.slice(wxml.indexOf('>房间<'), wxml.indexOf('>日历显示<'))
  assert.match(room, /class="menu-item room-code-item/)
  assert.match(room, /bindtap="copyRoomCode"/)
  assert.doesNotMatch(room, /bindtap="unbind"/)

  const calendar = wxml.slice(wxml.indexOf('>日历显示<'), wxml.indexOf('>数据<'))
  assert.match(calendar, /class="density-control"/)
  assert.match(calendar, /data-density="compact"[\s\S]*清爽/)
  assert.match(calendar, /data-density="full"[\s\S]*完整/)
  assert.doesNotMatch(calendar, /class="menu-item/)

  const data = wxml.slice(wxml.indexOf('>数据<'), wxml.indexOf('>关于<'))
  assert.match(data, /bindtap="exportData"/)
  assert.match(data, /bindtap="clearData"/)
  assert.doesNotMatch(data, /class="[^"]*danger/)

  const aboutAt = wxml.indexOf('>关于<')
  const dangerAt = wxml.indexOf('settings-danger-zone')
  assert.ok(dangerAt > aboutAt, 'the danger zone sits after the about group')
  const danger = wxml.slice(dangerAt)
  assert.match(danger, /wx:if="\{\{roomCode\}\}" class="menu-item danger" hover-class="danger-hover" bindtap="unbind"/)
  assert.match(danger, />解除绑定<\//)
  assert.doesNotMatch(wxml.slice(0, dangerAt), /bindtap="unbind"/)

  const density = wxssRuleBody(readPageFile('pages/settings/settings.wxss'), '.density-control')
  assert.doesNotMatch(density, /background\s*:/)
  assert.doesNotMatch(density, /\bborder\s*:/)
  assert.doesNotMatch(density, /border-radius\s*:/)
  assert.doesNotMatch(density, /box-shadow\s*:/)
})

// issue #141：成员状态留在 #139 的房间组里，解除绑定仍在页底危险区
test('settings room group keeps member status separate from the danger zone', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  const room = wxml.slice(wxml.indexOf('>房间<'), wxml.indexOf('>日历显示<'))
  assert.match(room, /roomMemberLabel/)
  assert.doesNotMatch(room, /bindtap="unbind"/)
  assert.doesNotMatch(wxml.slice(0, wxml.indexOf('settings-danger-zone')), /bindtap="unbind"/)
})

test('settings calendar display says compact keeps holidays and adjusted workdays, and full adds the lunar day', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  const calendar = wxml.slice(wxml.indexOf('>日历显示<'), wxml.indexOf('>数据<'))

  assert.match(calendar, /清爽只看日期与标记（含节日和调休），完整另外显示农历/)
  assert.doesNotMatch(calendar, /完整加显农历与节日|完整显示农历和节假日/)
  assert.match(calendar, /aria-label="清爽显示日期与标记"/)
  assert.match(calendar, /aria-label="完整显示农历"/)
})

// ===== issue #103：「查看欢乐时光」→ 记录 tab 的欢乐时光分段 =====

test('settings page no longer offers a second happy-time entry', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')

  assert.doesNotMatch(wxml, /goMemory|查看欢乐时光/)
  assert.doesNotMatch(wxml, /class="menu-text">欢乐时光</)
})

function wxssRuleBody(wxss, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = wxss.match(new RegExp(`(?:^|[\\n},])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]+)\\}`))
  assert.ok(match, `expected rule for ${selector}`)
  return match[1]
}

function createFakeSettingsEnv(options = {}) {
  const fs = {
    writes: [],
    writeFileSync(filePath, data, encoding) {
      if (options.writeError) {
        throw options.writeError
      }
      fs.writes.push({ path: filePath, data, encoding })
    }
  }

  const wx = {
    env: { USER_DATA_PATH: '/wx-user-data' },
    clipboardCalls: [],
    shareCalls: [],
    toasts: [],
    loadingCalls: [],
    modals: [],
    actionSheets: [],
    navigateToCalls: [],
    hideLoadingCalls: 0,
    setClipboardData({ data, success, fail }) {
      wx.clipboardCalls.push(data)
      if (options.clipboardError) {
        if (fail) fail(options.clipboardError)
        return
      }
      if (success) success()
    },
    showToast(options) {
      wx.toasts.push(options)
    },
    showLoading(options) {
      wx.loadingCalls.push(options)
    },
    showModal(options) {
      wx.modals.push(options)
    },
    hideLoading() {
      wx.hideLoadingCalls += 1
    },
    getFileSystemManager() {
      return fs
    },
    shareFileMessage({ filePath, success, fail }) {
      wx.shareCalls.push(filePath)
      // shareError 可以是固定错误，也可以按第几次分享返回错误（null 表示这次成功）
      const shareError = typeof options.shareError === 'function'
        ? options.shareError(wx.shareCalls.length)
        : options.shareError
      if (shareError) {
        fail(shareError)
        return
      }
      if (success) success()
    },
    showActionSheet(options) {
      wx.actionSheets.push(options)
    },
    // 按可见文字点最近一次弹出的操作菜单；「取消」走系统取消键的 fail 回调
    tapActionSheet(label) {
      const sheet = wx.actionSheets[wx.actionSheets.length - 1]
      assert.ok(sheet, 'expected a pending action sheet')
      if (label === '取消') {
        sheet.fail({ errMsg: 'showActionSheet:fail cancel' })
        return
      }
      const tapIndex = sheet.itemList.indexOf(label)
      assert.ok(tapIndex !== -1, `expected an action sheet item named ${label}`)
      sheet.success({ tapIndex, errMsg: 'showActionSheet:ok' })
    },
    navigateTo(options) {
      wx.navigateToCalls.push(options)
    },
    async resolveModal(confirm, promise) {
      const modal = wx.modals[0]
      assert.ok(modal, 'expected a pending modal')
      await modal.success({ confirm, cancel: !confirm })
      return promise
    }
  }

  return { fs, wx }
}

function createFakeRoomDataClient(results = {}) {
  return {
    calls: [],
    async list(collection) {
      this.calls.push({ action: 'list', collection })
      const result = typeof results[collection] === 'function'
        ? results[collection]()
        : results[collection]
      if (result && result.kind) {
        return result
      }
      return {
        kind: 'success',
        data: result || []
      }
    }
  }
}

function readPageFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
}

function waitForAsyncTurn() {
  return new Promise(resolve => setImmediate(resolve))
}
