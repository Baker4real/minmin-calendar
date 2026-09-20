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
  assert.equal(env.wx.modals[0].content, '同步房间状态失败：network down')
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
  assert.equal(result.message, 'disk full')
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
    message: 'disk full'
  })
  assert.deepEqual(wxApi.loadingCalls, [{ title: '导出中...' }])
  assert.equal(wxApi.hideLoadingCalls, 1)
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

test('settings page delegates copy/export/clear flows to settingsFlow and keeps local clear local-only', () => {
  const source = readPageFile('pages/settings/settings.js')

  assert.match(source, /require\('\.\.\/\.\.\/utils\/settingsFlow'\)/)
  assert.match(source, /settingsFlow\.copyRoomCode\(/)
  assert.match(source, /settingsFlow\.exportRecordsAsJson\(/)
  assert.match(source, /settingsFlow\.clearLocalCache\(/)
  assert.match(source, /roomCodeDisplay:\s*result\.roomCode\s*\|\|\s*'未绑定'/)
  assert.match(source, /syncActiveRoom\(this,\s*room\)/)
  assert.doesNotMatch(source, /leaveRoom\(/)
  assert.doesNotMatch(source, /deletePeriod\(/)
  assert.doesNotMatch(source, /deleteMemory\(/)
})

test('settings page clear-local-data confirm explains scope and cloud safety, not a bare title', () => {
  const source = readPageFile('pages/settings/settings.js')

  assert.match(source, /wx\.showModal\(\{[\s\S]*?title:\s*'⚠️ 确认清除'/)
  assert.match(source, /wx\.showModal\(\{[\s\S]*?content:\s*'将清除所有本地缓存，不会影响云端数据/)
})

test('confirmExport explains what will be exported, the JSON format, and how to use it before exporting', async () => {
  assert.equal(typeof settingsFlow.confirmExport, 'function')

  const env = createFakeSettingsEnv()

  const promise = settingsFlow.confirmExport({ wx: env.wx })

  await waitForAsyncTurn()
  assert.equal(env.wx.modals.length, 1)
  const modal = env.wx.modals[0]
  assert.match(modal.content, /经期记录/)
  assert.match(modal.content, /欢乐时光/)
  assert.match(modal.content, /JSON/)
  assert.match(modal.content, /备份/)

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

test('confirmExport proceeds when the modal api is unavailable', async () => {
  assert.equal(typeof settingsFlow.confirmExport, 'function')

  assert.deepEqual(await settingsFlow.confirmExport({ wx: null }), { kind: 'confirmed' })
  assert.deepEqual(await settingsFlow.confirmExport({ wx: {} }), { kind: 'confirmed' })
})

test('settings page shows the version exactly once, owned by the about modal', () => {
  const pageSource = readPageFile('pages/settings/settings.js')
  const wxmlSource = readPageFile('pages/settings/settings.wxml')

  const versionMentions = pageSource.match(/1\.0\.0/g) || []
  assert.equal(versionMentions.length, 1)
  assert.match(pageSource, /title: '关于'/)
  assert.doesNotMatch(wxmlSource, /1\.0\.0/)
  assert.doesNotMatch(wxmlSource, /class="version"/)
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
  assert.match(modal.content, /经期记录/)
  assert.match(modal.content, /欢乐时光/)
  assert.match(modal.content, /JSON/)
  assert.match(modal.content, /备份/)
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

test('settings page asks for the export explanation before exporting', () => {
  const source = readPageFile('pages/settings/settings.js')

  assert.match(source, /exportRecordsAsJson\(\{[\s\S]*?confirmBeforeExport:\s*true/)
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
    modals: [],
    navigateToCalls: [],
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
      if (options.shareError) {
        fail(options.shareError)
        return
      }
      if (success) success()
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
