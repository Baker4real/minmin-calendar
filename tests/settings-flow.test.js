const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
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

test('settings page delegates copy/export/clear flows to settingsFlow and keeps local clear local-only', () => {
  const source = readPageFile('pages/settings/settings.js')

  assert.match(source, /require\('\.\.\/\.\.\/utils\/settingsFlow'\)/)
  assert.match(source, /settingsFlow\.copyRoomCode\(/)
  assert.match(source, /settingsFlow\.exportRecordsAsJson\(/)
  assert.match(source, /settingsFlow\.clearLocalCache\(/)
  assert.match(source, /syncActiveRoom\(this,\s*result\.room\)/)
  assert.match(source, /syncActiveRoom\(this,\s*room\)/)
  // issue #102：解除绑定迁入设置页——leaveRoom 合法出现，但只在 unbind 流程里；
  // 清除本地数据保持 local-only（leaveCalls === 0 由 clearLocalCache 行为用例钉住）
  assert.match(source, /unbind\(\)\s*\{[\s\S]*?roomSession\.leaveRoom\(/)
  assert.doesNotMatch(source, /deletePeriod\(/)
  assert.doesNotMatch(source, /deleteMemory\(/)
})

test('settings page clear-local-data confirm explains the narrow local-only scope, cloud retention, and no room exit', () => {
  const source = readPageFile('pages/settings/settings.js')

  // issue #106：清除只动本机房间码，语气和实际风险相称——确认标题不带警示表情
  assert.match(source, /wx\.showModal\(\{[\s\S]*?title:\s*'确认清除'/)
  assert.doesNotMatch(source, /⚠/)
  // 锚定清除确认弹窗本身（页面上已有多个 modal，不能再取全文第一个 content）
  const content = /title:\s*'确认清除'[\s\S]*?content:\s*'([^']+)'/.exec(source)
  assert.ok(content, 'expected the clear-confirm modal content')
  const copy = content[1]
  assert.match(copy, /只清除保存在本机的房间码/)
  assert.match(copy, /云端记录会保留/)
  assert.match(copy, /不会退出当前房间/)
  assert.doesNotMatch(copy, /所有本地缓存/)
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

// ===== issue #79：设置页拿不到房间码时的下一步（重试 / 去绑定）=====

test('settings page offers retry and go-bind when the room code cannot be fetched', async () => {
  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'retryable-failure', bound: false, roomCode: '', errorMsg: '同步房间状态失败：network down' }
  })

  try {
    // 首次解析完成前不闪出可点操作
    assert.equal(harness.page.data.roomCodeLoaded, false)

    await harness.page.onShow()
    assert.equal(harness.page.data.roomCodeLoaded, true)
    assert.equal(harness.page.data.roomCode, '')
    assert.equal(harness.page.data.roomCodeDisplay, '同步失败，请重试')

    // 重试真的重新解析活动房间
    await harness.page.retryRoomResolve()
    assert.equal(harness.resolveCalls(), 2)

    // 去绑定进入现有绑定页
    harness.page.goBind()
    assert.deepEqual(harness.navigation, [{ type: 'navigateTo', url: '/pages/bind/bind' }])
  } finally {
    harness.teardown()
  }
})

test('settings page shows the retry and go-bind actions for the unbound state too', async () => {
  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'no-room', bound: false, roomCode: '' }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.roomCodeLoaded, true)
    assert.equal(harness.page.data.roomCode, '')
    assert.equal(harness.page.data.roomCodeDisplay, '未绑定')
  } finally {
    harness.teardown()
  }
})

test('settings page drops the actions once a room code loads and keeps the copy control', async () => {
  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.roomCodeLoaded, true)
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM01')
  } finally {
    harness.teardown()
  }
})

// issue #114：首帧用本机缓存房间码，不等云端校验；校验结果仍覆盖首帧
test('settings page shows the cached room code before verification, with copy and unbind available', async () => {
  const harness = loadSettingsPageHarness({
    cachedRoomCode: 'ROOM01',
    roomOutcome: { kind: 'retryable-failure', bound: false, roomCode: '', errorMsg: '同步房间状态失败：network down' }
  })

  try {
    assert.equal(harness.resolveCalls(), 0)
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM01')
    assert.equal(harness.page.data.roomCodeLoaded, false)

    const wxml = readPageFile('pages/settings/settings.wxml')
    const cardStart = wxml.indexOf('class="menu-item room-code-item')
    const cardEnd = wxml.indexOf('日历显示')
    const card = wxml.slice(cardStart, cardEnd)
    assert.match(card, /wx:if="\{\{roomCode\}\}" class="copy-btn"/)
    assert.match(card, /wx:if="\{\{roomCode\}\}" class="menu-item danger" bindtap="unbind"/)

    await harness.page.onShow()
    assert.equal(harness.resolveCalls(), 1)
    assert.equal(harness.page.data.roomCode, '')
    assert.equal(harness.page.data.roomCodeDisplay, '同步失败，请重试')
    assert.equal(harness.page.data.roomCodeLoaded, true)
  } finally {
    harness.teardown()
  }
})

// issue #114：没有缓存时首帧是中性「读取中…」，校验完成前不出复制/解绑，也不先写「未绑定」
test('settings page shows a neutral reading state before verification when no room code is cached', async () => {
  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'no-room', bound: false, roomCode: '' }
  })

  try {
    assert.equal(harness.resolveCalls(), 0)
    assert.equal(harness.page.data.roomCode, '')
    assert.equal(harness.page.data.roomCodeDisplay, '读取中…')
    assert.equal(harness.page.data.roomCodeLoaded, false)

    const wxml = readPageFile('pages/settings/settings.wxml')
    const cardStart = wxml.indexOf('class="menu-item room-code-item')
    const cardEnd = wxml.indexOf('日历显示')
    const card = wxml.slice(cardStart, cardEnd)
    assert.match(card, /class="room-code-value \{\{roomCode \? '' : 'muted'\}\}"/)
    assert.match(card, /wx:if="\{\{roomCode\}\}" class="copy-btn"/)
    assert.match(card, /wx:if="\{\{roomCodeLoaded && !roomCode\}\}" class="room-code-actions"/)

    const wxss = readPageFile('pages/settings/settings.wxss')
    assert.match(wxssRuleBody(wxss, '.room-code-value.muted'), /color:\s*var\(--text-secondary\)/)

    await harness.page.onShow()
    assert.equal(harness.resolveCalls(), 1)
    assert.equal(harness.page.data.roomCode, '')
    assert.equal(harness.page.data.roomCodeDisplay, '未绑定')
    assert.equal(harness.page.data.roomCodeLoaded, true)
  } finally {
    harness.teardown()
  }
})

test('settings room-code card swaps the dead sentence for tappable retry and go-bind rows when no code is available', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  const cardStart = wxml.indexOf('class="menu-item room-code-item')
  const cardEnd = wxml.indexOf('日历显示')
  assert.ok(cardStart !== -1 && cardEnd > cardStart, 'expected the room-code card')
  const card = wxml.slice(cardStart, cardEnd)

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

test('settings room card exposes the moved unbind entry as a danger menu row while bound', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  const cardStart = wxml.indexOf('class="menu-item room-code-item')
  const cardEnd = wxml.indexOf('日历显示')
  assert.ok(cardStart !== -1 && cardEnd > cardStart, 'expected the room-code card')
  const card = wxml.slice(cardStart, cardEnd)

  // 警示红菜单行族（与「清除本地数据」同款 .menu-item.danger），有码时才可解
  assert.match(
    card,
    /wx:if="\{\{roomCode\}\}" class="menu-item danger" bindtap="unbind" aria-role="button" aria-label="解除绑定"/
  )
  assert.match(card, />解除绑定<\//)
})

test('settings unbind reuses the bind page secondary-confirm copy verbatim', () => {
  const settingsSource = readPageFile('pages/settings/settings.js')
  const bindSource = readPageFile('pages/bind/bind.js')

  const settingsUnbind = /unbind\(\)\s*\{[\s\S]*?wx\.showModal\(\{\s*title:\s*'([^']+)',\s*content:\s*'([^']+)'/.exec(settingsSource)
  assert.ok(settingsUnbind, 'settings.js must hold the moved unbind flow with its modal')
  const bindUnbind = /unbind\(\)\s*\{[\s\S]*?wx\.showModal\(\{\s*title:\s*'([^']+)',\s*content:\s*'([^']+)'/.exec(bindSource)
  assert.ok(bindUnbind, 'bind.js keeps the same-screen unbind flow for the needUnbind state')

  // 二次确认文案逐字相等：标题「解除绑定」+ 退出/归档/恢复说明
  assert.equal(settingsUnbind[1], bindUnbind[1])
  assert.equal(settingsUnbind[2], bindUnbind[2])
  assert.equal(settingsUnbind[1], '解除绑定')
  assert.match(settingsUnbind[2], /解除后将退出当前房间/)
  assert.match(settingsUnbind[2], /若你是最后一人，数据会归档/)
  assert.match(settingsUnbind[2], /可在本页重新创建恢复/)
  assert.match(settingsUnbind[2], /确定解除？/)
})

test('confirming settings unbind leaves the room and reLaunches to the bind page', async () => {
  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'success', bound: true, roomCode: 'ROOM01' },
    leaveRoom: { code: 0 }
  })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.roomCode, 'ROOM01')

    harness.page.unbind()
    assert.equal(harness.wx.modals.length, 1)
    const modal = harness.wx.modals[0]
    assert.equal(modal.title, '解除绑定')

    await modal.success({ confirm: true, cancel: false })

    assert.equal(harness.leaveRoomCalls(), 1)
    // bind 非 tab 页，解绑后回绑定页只能 reLaunch，不能 switchTab
    assert.deepEqual(harness.navigation, [{ type: 'reLaunch', url: '/pages/bind/bind' }])
  } finally {
    harness.teardown()
  }
})

test('dismissing the settings unbind confirmation leaves the room and the page untouched', async () => {
  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'success', bound: true, roomCode: 'ROOM01' },
    leaveRoom: { code: 0 }
  })

  try {
    await harness.page.onShow()

    harness.page.unbind()
    assert.equal(harness.wx.modals.length, 1)
    await harness.wx.modals[0].success({ confirm: false, cancel: true })

    assert.equal(harness.leaveRoomCalls(), 0)
    assert.deepEqual(harness.navigation, [])
    assert.equal(harness.page.data.roomCode, 'ROOM01')
  } finally {
    harness.teardown()
  }
})

test('settings unbind stays on the page with failure feedback when leaving the room fails', async () => {
  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'success', bound: true, roomCode: 'ROOM01' },
    leaveRoom: { code: -1, msg: '解除绑定失败：network down' }
  })

  try {
    await harness.page.onShow()

    harness.page.unbind()
    assert.equal(harness.wx.modals.length, 1)
    await harness.wx.modals[0].success({ confirm: true, cancel: false })

    assert.equal(harness.leaveRoomCalls(), 1)
    assert.deepEqual(harness.navigation, [], 'a failed leave must not reLaunch')
    assert.equal(harness.wx.toasts.length, 1, 'the failure surfaces as feedback on this page')
    assert.match(harness.wx.toasts[0].title, /解除绑定失败/)
  } finally {
    harness.teardown()
  }
})

// ===== issue #103：「查看欢乐时光」→ 记录 tab 的欢乐时光分段 =====

test('settings memory entry writes the one-shot segment intent and switchTabs into the record tab memory segment', async () => {
  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })

  try {
    await harness.page.onShow()

    // switchTab 不能带 query：先写一次性「目标分段」意图，再切到记录 tab（issue #103）
    harness.page.goMemory()
    assert.deepEqual(harness.storageWrites, [{ key: 'recordTabSegment', value: 'memory' }])
    assert.deepEqual(harness.navigation, [{ type: 'switchTab', url: '/pages/period/period' }])
  } finally {
    harness.teardown()
  }
})

function wxssRuleBody(wxss, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = wxss.match(new RegExp(`(?:^|[\\n}])\\s*${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `expected rule for ${selector}`)
  return match[1]
}

function loadSettingsPageHarness({ roomOutcome, leaveRoom, cachedRoomCode } = {}) {
  const absolutePagePath = path.join(__dirname, '..', 'pages/settings/settings.js')
  let resolveCalls = 0
  let leaveRoomCalls = 0
  const absoluteMocks = new Map([
    [path.join(__dirname, '..', 'utils/cloud.js'), {
      createRoomDataClient: () => ({ list: async () => ({ kind: 'success', data: [] }) })
    }],
    [path.join(__dirname, '..', 'utils/room.js'), {
      getRoomCode() {
        return cachedRoomCode || ''
      },
      async getVerifiedActiveRoom() {
        resolveCalls += 1
        if (typeof roomOutcome === 'function') return roomOutcome()
        return roomOutcome
      },
      // issue #102：解除绑定迁入设置页，harness 需要能观察 leaveRoom 调用与结果
      async leaveRoom() {
        leaveRoomCalls += 1
        if (typeof leaveRoom === 'function') return leaveRoom()
        return leaveRoom || { code: 0 }
      }
    }],
    [path.join(__dirname, '..', 'utils/safeArea.js'), { getSafeTop: () => 44, getSafeBottom: () => 0 }]
  ])
  const originalPage = global.Page
  const originalWx = global.wx
  const originalLoad = Module._load
  let registered

  delete require.cache[require.resolve(absolutePagePath)]
  const navigation = []
  const storageWrites = []
  const wx = {
    modals: [],
    toasts: [],
    getStorageSync: () => '',
    setStorageSync(key, value) { storageWrites.push({ key, value }) },
    navigateTo(options) { navigation.push({ type: 'navigateTo', url: options.url }) },
    switchTab(options) { navigation.push({ type: 'switchTab', url: options.url }) },
    // issue #102：解绑成功后 reLaunch 回绑定页（全仓首个 reLaunch，扩展现有 navigation 记录）
    reLaunch(options) { navigation.push({ type: 'reLaunch', url: options.url }) },
    showModal(options) { wx.modals.push(options) },
    showToast(options) { wx.toasts.push(options) }
  }
  global.wx = wx
  global.Page = config => { registered = config }
  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain)
    if (absoluteMocks.has(resolved)) return absoluteMocks.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  require(absolutePagePath)
  Module._load = originalLoad

  const page = {
    data: { ...(registered.data || {}) },
    setData(update, callback) {
      this.data = { ...this.data, ...update }
      if (typeof callback === 'function') callback()
    }
  }
  for (const [key, value] of Object.entries(registered)) {
    if (key !== 'data') page[key] = typeof value === 'function' ? value.bind(page) : value
  }
  return {
    page,
    navigation,
    storageWrites,
    wx,
    resolveCalls: () => resolveCalls,
    leaveRoomCalls: () => leaveRoomCalls,
    teardown() {
      Module._load = originalLoad
      global.Page = originalPage
      global.wx = originalWx
      delete require.cache[require.resolve(absolutePagePath)]
    }
  }
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
