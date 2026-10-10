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

test('settings page resync confirm explains it will not delete records or leave the room', () => {
  const source = readPageFile('pages/settings/settings.js')
  const wxml = readPageFile('pages/settings/settings.wxml')

  assert.match(wxml, /aria-label="重新同步房间"/)
  assert.match(wxml, />重新同步房间<\//)
  assert.doesNotMatch(wxml, /清除本地数据/)
  assert.doesNotMatch(wxml, /bindtap="clearData"[^>]*danger/)

  // 确认标题不带警示表情；行为仍是清本机房间码再重新获取
  assert.match(source, /wx\.showModal\(\{[\s\S]*?title:\s*'重新同步房间'/)
  assert.match(source, /settingsFlow\.clearLocalCache\(/)
  assert.doesNotMatch(source, /⚠/)
  const content = /title:\s*'重新同步房间'[\s\S]*?content:\s*'([^']+)'/.exec(source)
  assert.ok(content, 'expected the resync confirm modal content')
  const copy = content[1]
  assert.match(copy, /不会删除记录/)
  assert.match(copy, /不会退出房间/)
  assert.doesNotMatch(copy, /所有本地缓存/)
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

test('confirmExport proceeds when the modal api is unavailable', async () => {
  assert.equal(typeof settingsFlow.confirmExport, 'function')

  assert.deepEqual(await settingsFlow.confirmExport({ wx: null }), { kind: 'confirmed' })
  assert.deepEqual(await settingsFlow.confirmExport({ wx: {} }), { kind: 'confirmed' })
})

test('settings about group shows the version once and opens a short help sheet', async () => {
  const pageSource = readPageFile('pages/settings/settings.js')
  const wxml = readPageFile('pages/settings/settings.wxml')
  const about = wxml.slice(wxml.indexOf('>关于<'), wxml.indexOf('settings-danger-zone'))

  assert.equal((pageSource.match(/1\.0\.0/g) || []).length, 0)
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

  const harness = loadSettingsPageHarness({
    roomOutcome: { kind: 'no-room', bound: false, roomCode: '' }
  })
  try {
    assert.equal(harness.page.data.helpOpen, false)
    harness.page.openHelp()
    assert.equal(harness.page.data.helpOpen, true)
    harness.page.closeHelp()
    assert.equal(harness.page.data.helpOpen, false)
  } finally {
    harness.teardown()
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
    assert.doesNotMatch(card, /bindtap="unbind"/)

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

// issue #114：同一轮模块加载里，后一次进入要读到当时的缓存，不能沿用第一次求值的快照
test('two settings instances created after one module load see the cache from their own creation, before verification', () => {
  let cachedRoomCode = 'ROOM01'
  const harness = loadSettingsPageHarness({
    cachedRoomCode: () => cachedRoomCode,
    roomOutcome: { kind: 'no-room', bound: false, roomCode: '' }
  })

  try {
    assert.equal(harness.resolveCalls(), 0)
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM01')
    assert.equal(harness.page.data.roomCodeLoaded, false)

    cachedRoomCode = ''
    const later = harness.createInstance()
    assert.equal(harness.resolveCalls(), 0)
    assert.equal(later.data.roomCode, '')
    assert.equal(later.data.roomCodeDisplay, '读取中…')
    assert.equal(later.data.roomCodeLoaded, false)
    assert.notEqual(later.data.roomCodeDisplay, '未绑定')

    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM01')
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

test('settings room group keeps copy and retry, and does not host unbind', () => {
  const wxml = readPageFile('pages/settings/settings.wxml')
  const cardStart = wxml.indexOf('class="menu-item room-code-item')
  const cardEnd = wxml.indexOf('日历显示')
  assert.ok(cardStart !== -1 && cardEnd > cardStart, 'expected the room-code card')
  const card = wxml.slice(cardStart, cardEnd)

  assert.match(card, /wx:if="\{\{roomCode\}\}" class="copy-btn"/)
  assert.doesNotMatch(card, /bindtap="unbind"|解除绑定/)
})

test('settings unbind confirm explains leaving, the partner, archive, and recovery on the bind page', () => {
  const settingsSource = readPageFile('pages/settings/settings.js')
  const bindSource = readPageFile('pages/bind/bind.js')

  const settingsUnbind = /unbind\(\)\s*\{[\s\S]*?wx\.showModal\(\{\s*title:\s*'([^']+)',\s*content:\s*'([^']+)',\s*confirmText:\s*'([^']+)',\s*confirmColor:\s*'([^']+)'/.exec(settingsSource)
  assert.ok(settingsUnbind, 'settings.js must hold the unbind confirm')
  const bindUnbind = /unbind\(\)\s*\{[\s\S]*?wx\.showModal\(\{\s*title:\s*'([^']+)',\s*content:\s*'([^']+)'/.exec(bindSource)
  assert.ok(bindUnbind, 'bind.js keeps the same-screen unbind flow for the needUnbind state')

  assert.equal(settingsUnbind[1], '解除绑定')
  assert.match(settingsUnbind[2], /你会退出/)
  assert.match(settingsUnbind[2], /留在房间里/)
  assert.match(settingsUnbind[2], /房间会归档/)
  assert.match(settingsUnbind[2], /绑定页/)
  assert.match(settingsUnbind[2], /创建/)
  assert.doesNotMatch(settingsUnbind[2], /本页/)
  assert.equal(settingsUnbind[3], '解除绑定')
  assert.equal(settingsUnbind[4], '#F97373')
  // 绑定页 needUnbind 仍在本页恢复；设置页不能再沿用那句
  assert.match(bindUnbind[2], /本页/)
  assert.notEqual(settingsUnbind[2], bindUnbind[2])
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
    assert.deepEqual(harness.storageWrites, [{ key: 'bindUnbindNotice', value: '1' }])
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
  const source = readPageFile('pages/settings/settings.js')
  const wxml = readPageFile('pages/settings/settings.wxml')

  assert.doesNotMatch(source, /goMemory\s*\(/)
  assert.doesNotMatch(source, /recordTabSegment/)
  assert.doesNotMatch(wxml, /goMemory|查看欢乐时光/)
  assert.doesNotMatch(wxml, /class="menu-text">欢乐时光</)
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
        const value = typeof cachedRoomCode === 'function' ? cachedRoomCode() : cachedRoomCode
        return value || ''
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
    [path.join(__dirname, '..', 'utils/safeArea.js'), { getSafeTop: () => 44, getSafeBottom: () => 0, getNavBarHeight: () => 84, getCapsuleRightInset: () => 94 }]
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

  function createInstance() {
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
    return page
  }

  return {
    page: createInstance(),
    createInstance,
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
