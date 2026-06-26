const assert = require('node:assert/strict')
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

test('exportRecordsAsJson falls back to the clipboard when file sharing fails', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv({ shareError: new Error('share failed') })
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

  assert.equal(result.kind, 'clipboard')
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.shareCalls, ['/tmp/user-data/minmin-calendar-backup.json'])
  assert.equal(env.wx.clipboardCalls.length, 1)
  assert.deepEqual(JSON.parse(env.wx.clipboardCalls[0]), {
    exportTime: '2026-06-26T08:00:00.000Z',
    periods: [{ _id: 'p1', startDate: '2026-06-01', endDate: '2026-06-05' }],
    memories: [{ _id: 'm1', date: '2026-06-03', note: 'movie' }]
  })
  assert.deepEqual(env.wx.toasts, [{ title: '已复制到剪贴板' }])
})

test('exportRecordsAsJson hides loading and returns a retryable outcome when export data loading fails', async () => {
  assert.equal(typeof settingsFlow.exportRecordsAsJson, 'function')

  const env = createFakeSettingsEnv()
  const retryCalls = []
  const retryToken = async () => {
    retryCalls.push('retry')
    return { kind: 'success', data: [] }
  }
  const client = createFakeRoomDataClient({
    periods: {
      kind: 'retryable-failure',
      message: '云数据库查询超时 (15000ms)',
      retry: retryToken
    },
    memories: []
  })

  const result = await settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

  assert.equal(result.kind, 'retryable-failure')
  assert.equal(result.message, '云数据库查询超时 (15000ms)')
  assert.equal(typeof result.retry, 'function')
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.toasts, [{ title: '导出失败，请检查网络', icon: 'none' }])
  assert.equal(env.fs.writes.length, 0)

  await result.retry()
  assert.deepEqual(retryCalls, ['retry'])
})

test('exportRecordsAsJson hides loading and returns a room-repair outcome when the room cache is stale', async () => {
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

  const result = await settingsFlow.exportRecordsAsJson({
    wx: env.wx,
    cloud: { createRoomDataClient: () => client },
    now: () => '2026-06-26T08:00:00.000Z',
    userDataPath: '/tmp/user-data'
  })

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
  assert.deepEqual(env.wx.toasts, [{ title: '房间状态已变化，请重新绑定', icon: 'none' }])
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
  assert.equal(result.message, 'disk full')
  assert.equal(env.wx.hideLoadingCalls, 1)
  assert.deepEqual(env.wx.toasts, [{ title: '导出失败', icon: 'error' }])
  assert.deepEqual(env.wx.shareCalls, [])
  assert.deepEqual(env.wx.clipboardCalls, [])
})

test('clearLocalCache only clears the local room cache and never leaves the shared room', async () => {
  assert.equal(typeof settingsFlow.clearLocalCache, 'function')

  const env = createFakeSettingsEnv()
  let clearCalls = 0
  let leaveCalls = 0
  let deleteCalls = 0
  const roomSession = {
    clearLocalRoom() {
      clearCalls += 1
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

  assert.deepEqual(result, { kind: 'success', roomCode: '未绑定' })
  assert.equal(clearCalls, 1)
  assert.equal(leaveCalls, 0)
  assert.equal(deleteCalls, 0)
  assert.deepEqual(env.wx.toasts, [{ title: '已清除' }])
})

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
    hideLoadingCalls: 0,
    setClipboardData({ data, success }) {
      wx.clipboardCalls.push(data)
      if (success) success()
    },
    showToast(options) {
      wx.toasts.push(options)
    },
    showLoading(options) {
      wx.loadingCalls.push(options)
    },
    hideLoading() {
      wx.hideLoadingCalls += 1
    },
    getFileSystemManager() {
      return fs
    },
    shareFileMessage({ filePath, success, fail }) {
      wx.shareCalls.push(filePath)
      if (options.shareError) {
        fail(options.shareError)
        return
      }
      if (success) success()
    }
  }

  return { fs, wx }
}

function createFakeRoomDataClient(results = {}) {
  return {
    calls: [],
    async list(collection) {
      this.calls.push({ action: 'list', collection })
      const result = results[collection]
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
