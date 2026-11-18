const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')
const { readSource } = require('./sourceFiles')
const { evaluateWxmlExpression, wxmlOpeningTags } = require('./wxmlTemplate')

function settingsApp(t, options = {}) {
  const app = createMiniProgram(options)
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
  return app
}

async function chooseConfirmation(app, page, action = 'confirm') {
  await app.dispatch(page, 'onConfirmationAction', { currentTarget: { dataset: { action } } })
  await app.advance(200)
  await app.settle()
}

test('settings exports both cloud collections only after the shared-sheet explanation is confirmed', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
  const periods = [{ _id: 'p1', startDate: '2026-06-20', endDate: '2026-06-24', periodStatus: 'ended' }]
  const memories = [{ _id: 'm1', date: '2026-06-25', note: '测试记录' }]
  app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'periods', roomCode: 'ROOM01' } }).reply({ code: 0, data: periods })
  const pendingMemories = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'memories', roomCode: 'ROOM01' } }).defer()
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  assert.equal(page.data.confirmationTitle, '导出数据')
  assert.equal(page.data.confirmationContent, '会导出全部经期和欢乐时光。建议发到「文件传输助手」保存。目前还不能导入恢复。')
  assert.deepEqual(page.data.confirmationActions, [
    { id: 'confirm', text: '开始导出', kind: 'primary' },
    { id: 'cancel', text: '取消', kind: 'secondary' }
  ])
  assert.deepEqual(app.wx.modals, [])
  assert.equal(app.cloud.calls.some(call => call.name === 'dataOp'), false)
  assert.equal(app.platformCalls.showLoading, undefined)
  await chooseConfirmation(app, page)
  assert.equal(app.platformCalls.shareFileMessage, undefined, 'both collections must arrive before sharing')
  pendingMemories.resolve({ code: 0, data: memories })
  await app.settle()
  await exporting
  assert.equal(app.wx.toasts.at(-1).title, '导出成功')
  assert.deepEqual(app.files, [{
    path: '/wx-user-data/minmin-calendar-backup.json',
    data: JSON.stringify({ exportTime: '2026-06-26T04:00:00.200Z', periods, memories }, null, 2),
    encoding: 'utf8'
  }])
  assert.equal(app.platformCalls.shareFileMessage[0].filePath, app.files[0].path)
  assert.deepEqual(app.clipboard, [])
  assert.equal(app.platformCalls.hideLoading.length, 1)
})

test('cancelling export never reads records, writes files or shares data', async (t) => {
  const app = settingsApp(t)
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  await chooseConfirmation(app, page, 'cancel')
  await exporting
  assert.equal(app.cloud.calls.some(call => call.name === 'dataOp'), false)
  assert.deepEqual(app.files, [])
  assert.equal(app.platformCalls.shareFileMessage, undefined)
  assert.equal(app.platformCalls.showLoading, undefined)
  assert.deepEqual(app.clipboard, [])
})

test('a failed collection prevents a partial export and offers retry', async (t) => {
  const app = settingsApp(t)
  app.cloud.when({ name: 'dataOp', data: { collection: 'periods' } }).reply({ code: 0, data: [{ _id: 'p1', startDate: '2026-06-20' }] })
  const memories = app.cloud.when({ name: 'dataOp', data: { collection: 'memories' } }).reject(new Error('网络不太稳定，请重试'))
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  await chooseConfirmation(app, page)
  assert.equal(app.wx.modals.at(-1).title, '导出失败')
  assert.equal(app.wx.modals.at(-1).confirmText, '重试')
  assert.deepEqual(app.files, [])
  assert.equal(app.platformCalls.shareFileMessage, undefined)
  memories.reply({ code: 0, data: [] })
  app.respond('showModal', 0, { confirm: true })
  await app.settle()
  await chooseConfirmation(app, page)
  await exporting
  assert.equal(app.files.length, 1)
  assert.equal(app.wx.toasts.at(-1).title, '导出成功')
})

// #194: the app's shared records are not an export source; export reads both lists itself, in order.
test('export reads its own lists in order even after Home has read the records, and stops at a failed first list', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
  const list = collection => app.cloud.when({ name: 'dataOp', data: { action: 'list', collection } })
  list('periods').reply({ code: 0, data: [{ _id: 'p1', startDate: '2026-06-20', endDate: '2026-06-24' }] })
  list('memories').reply({ code: 0, data: [] })
  app.launch('/pages/index/index')
  await app.flush()
  app.wx.switchTab({ url: '/pages/settings/settings' })
  await app.settle()
  const before = app.cloud.calls.length
  list('periods').reject(new Error('network down'))
  const exporting = app.dispatch(app.currentPage, 'exportData')
  await app.settle()
  await chooseConfirmation(app, app.currentPage)
  assert.deepEqual(app.cloud.calls.slice(before).filter(call => call.name === 'dataOp').map(call => call.data.collection), ['periods'])
  assert.equal(app.wx.modals.at(-1).title, '导出失败')
  assert.deepEqual(app.files, [])
  app.respond('showModal', app.wx.modals.length - 1, { confirm: false, cancel: true })
  await exporting
  assert.deepEqual(app.files, [])
  assert.equal(app.platformCalls.shareFileMessage, undefined)
})

test('export mask, close, drag and system back all cancel before any record read', async (t) => {
  const closes = [
    { name: 'mask', handler: 'onConfirmationMask' },
    { name: 'close button', handler: 'onConfirmationClose' },
    { name: 'drag' },
    { name: 'system back', handler: 'onSheetSystemBack' }
  ]
  for (const close of closes) {
    await t.test(close.name, async (t) => {
      const app = settingsApp(t)
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      const exporting = app.dispatch(page, 'exportData')
      await app.settle()
      assert.equal(page.data.confirmationPhase, 'open')
      if (close.name === 'drag') {
        const currentTarget = { dataset: { sheet: 'confirmation' } }
        const touch = { identifier: 1, pageX: 100, pageY: 100 }
        app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
        app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 200 }] })
        await app.advance(100)
        app.dispatch(page, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 200 }] })
      } else {
        await app.dispatch(page, close.handler)
      }
      assert.equal(page.data.confirmationPhase, 'leaving')
      await app.advance(200)
      await exporting
      assert.equal(page.data.confirmationMounted, false)
      assert.equal(page.data.pageObscured, false)
      assert.equal(app.cloud.calls.some(call => call.name === 'dataOp'), false)
      assert.deepEqual(app.files, [])
      assert.equal(app.platformCalls.shareFileMessage, undefined)
      assert.deepEqual(app.clipboard, [])
      assert.equal(app.currentPage, page)
    })
  }
})

test('share cancellation keeps the clipboard intact and share failure copies only by explicit choice', async (t) => {
  for (const [failure, copyJson] of [['shareFileMessage:fail cancel', false], ['shareFileMessage:fail unavailable', true]]) {
    await t.test(failure, async (t) => {
      const app = settingsApp(t)
      app.cloud.when('dataOp').reply({ code: 0, data: [] })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      app.respondNext('shareFileMessage', new Error(failure))
      const exporting = app.dispatch(page, 'exportData')
      await app.settle()
      await chooseConfirmation(app, page)
      assert.deepEqual(app.clipboard, [])
      if (copyJson) {
        assert.equal(page.data.confirmationTitle, '分享没有完成')
        assert.equal(page.data.confirmationContent, '选「复制成文字」会把全部经期和欢乐时光放进剪贴板')
        assert.deepEqual(page.data.confirmationActions, [
          { id: 'retry', text: '重试分享', kind: 'primary' },
          { id: 'copy', text: '复制成文字', kind: 'secondary' },
          { id: 'cancel', text: '取消', kind: 'secondary' }
        ])
        await chooseConfirmation(app, page, 'copy')
      } else {
        assert.equal(page.data.confirmationMounted, false)
      }
      assert.deepEqual(app.wx.actionSheets, [])
      await exporting
      assert.deepEqual(app.clipboard, copyJson ? [app.files[0].data] : [])
      assert.equal(app.wx.toasts.some(toast => toast.title === '导出成功'), false)
    })
  }
})

test('share-failure mask, close, drag and system back all cancel without copying', async (t) => {
  const closes = [
    { name: 'mask', handler: 'onConfirmationMask' },
    { name: 'close button', handler: 'onConfirmationClose' },
    { name: 'drag' },
    { name: 'system back', handler: 'onSheetSystemBack' }
  ]
  for (const close of closes) {
    await t.test(close.name, async (t) => {
      const app = settingsApp(t)
      app.cloud.when('dataOp').reply({ code: 0, data: [] })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      app.respondNext('shareFileMessage', new Error('shareFileMessage:fail unavailable'))
      const exporting = app.dispatch(page, 'exportData')
      await app.settle()
      await chooseConfirmation(app, page)
      assert.equal(page.data.confirmationTitle, '分享没有完成')
      assert.equal(page.data.confirmationPhase, 'open')
      if (close.name === 'drag') {
        const currentTarget = { dataset: { sheet: 'confirmation' } }
        const touch = { identifier: 1, pageX: 100, pageY: 100 }
        app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
        app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 200 }] })
        await app.advance(100)
        app.dispatch(page, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 200 }] })
      } else {
        await app.dispatch(page, close.handler)
      }
      assert.equal(page.data.confirmationPhase, 'leaving')
      await app.advance(200)
      await exporting
      assert.equal(page.data.confirmationMounted, false)
      assert.equal(page.data.pageObscured, false)
      assert.deepEqual(app.clipboard, [])
      assert.deepEqual(app.wx.actionSheets, [])
      assert.equal(app.wx.toasts.some(toast => toast.title === '已复制到剪贴板'), false)
      assert.equal(app.currentPage, page)
    })
  }
})

test('settings shows cached room code immediately, then exposes retry and binding after verification fails', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
  const verification = app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/settings/settings')
  assert.equal(page.data.roomCode, 'ROOM01')
  assert.equal(page.data.roomCodeDisplay, 'ROOM01')
  assert.equal(page.data.roomCodeLoaded, false)
  await app.dispatch(page, 'copyRoomCode')
  assert.deepEqual(app.clipboard, ['ROOM01'])
  assert.equal(app.wx.toasts.at(-1).title, '房间码已复制')
  verification.reject(new Error('网络不太稳定，请重试'))
  await app.settle()
  assert.equal(page.data.roomCode, '')
  assert.equal(page.data.roomCodeDisplay, '同步失败，请重试')
  assert.equal(page.data.roomCodeLoaded, true)
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  await app.dispatch(page, 'retryRoomResolve')
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 2)
  assert.equal(page.data.roomCodeDisplay, '未绑定')
  await app.dispatch(page, 'goBind')
  await app.settle()
  assert.equal(app.navigation.at(-1).method, 'navigateTo')
  assert.equal(app.currentPage.route, 'pages/bind/bind')
})

test('settings without a cache starts neutral and replaces it with the verified room', async (t) => {
  const app = settingsApp(t)
  const verification = app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/settings/settings')
  assert.equal(page.data.roomCode, '')
  assert.equal(page.data.roomCodeDisplay, '读取中…')
  assert.equal(page.data.roomCodeLoaded, false)
  verification.resolve({ code: 0, room: { roomCode: 'ROOM02', status: 'waiting' } })
  await app.settle()
  assert.equal(page.data.roomCode, 'ROOM02')
  assert.equal(page.data.roomCodeDisplay, 'ROOM02')
  assert.equal(page.data.roomCodeLoaded, true)
  await app.dispatch(page, 'copyRoomCode')
  assert.deepEqual(app.clipboard, ['ROOM02'])
})

test('reentering settings reads the current cache before verification and unbound results stay actionable', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
  const first = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(first.data.roomCode, 'ROOM01')
  app.wx.removeStorageSync('roomCode')
  const verification = app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/settings/settings')
  assert.equal(first.data.roomCode, 'ROOM01', 'creating a new instance does not rewrite the previous view')
  assert.equal(page.data.roomCode, '')
  assert.equal(page.data.roomCodeDisplay, '读取中…')
  assert.equal(page.data.roomCodeLoaded, false)
  verification.resolve({ code: 0, room: null })
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, '未绑定')
  assert.equal(page.data.roomCodeLoaded, true)
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM03' } })
  await app.dispatch(page, 'retryRoomResolve')
  assert.equal(page.data.roomCodeDisplay, 'ROOM03')
})

test('resync uses the shared sheet and announces only after room resolution completes', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01', calendarDensity: 'full' } })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  const resyncing = app.dispatch(page, 'clearData')
  await app.settle()
  assert.equal(page.data.confirmationTitle, '重新同步房间？')
  assert.equal(page.data.confirmationContent, '重新从云端读一次你所在的房间，不会删除任何记录')
  assert.deepEqual(page.data.confirmationActions, [
    { id: 'confirm', text: '重新同步', kind: 'primary' },
    { id: 'cancel', text: '取消', kind: 'secondary' }
  ])
  assert.deepEqual(app.wx.modals, [])
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 1)
  const verification = app.cloud.when('getMyRoom').defer()
  await app.dispatch(page, 'onConfirmationAction', { currentTarget: { dataset: { action: 'confirm' } } })
  await app.advance(200)
  assert.equal(app.storage.roomCode, undefined)
  assert.equal(app.storage.calendarDensity, 'full')
  assert.deepEqual(app.wx.toasts, [], 'resolution has not completed yet')
  verification.resolve({ code: 0, room: { roomCode: 'ROOM02', status: 'waiting' } })
  await resyncing
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, 'ROOM02')
  assert.equal(app.storage.roomCode, 'ROOM02')
  assert.deepEqual(app.cloud.calls.map(call => call.name), ['getMyRoom', 'getMyRoom'])
  assert.deepEqual(app.wx.toasts, [{ title: '已重新同步' }])
})

test('resync mask, close, drag and system back all cancel without clearing the room', async (t) => {
  const closes = [
    { name: 'mask', handler: 'onConfirmationMask' },
    { name: 'close button', handler: 'onConfirmationClose' },
    { name: 'drag' },
    { name: 'system back', handler: 'onSheetSystemBack' }
  ]
  for (const close of closes) {
    await t.test(close.name, async (t) => {
      const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      const resyncing = app.dispatch(page, 'clearData')
      await app.settle()
      assert.equal(page.data.confirmationPhase, 'open')
      if (close.name === 'drag') {
        const currentTarget = { dataset: { sheet: 'confirmation' } }
        const touch = { identifier: 1, pageX: 100, pageY: 100 }
        app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
        app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 200 }] })
        await app.advance(100)
        app.dispatch(page, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 200 }] })
      } else {
        await app.dispatch(page, close.handler)
      }
      assert.equal(page.data.confirmationPhase, 'leaving')
      assert.equal(app.storage.roomCode, 'ROOM01')
      await app.advance(200)
      await resyncing
      assert.equal(page.data.confirmationMounted, false)
      assert.equal(page.data.pageObscured, false)
      assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 1)
      assert.deepEqual(app.wx.toasts, [])
      assert.equal(app.currentPage, page)
    })
  }
})

test('resync failure keeps the existing retry presentation without a success toast', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  app.cloud.when('getMyRoom').reject(new Error('network down'))
  const resyncing = app.dispatch(page, 'clearData')
  await app.settle()
  await app.dispatch(page, 'onConfirmationAction', { currentTarget: { dataset: { action: 'confirm' } } })
  await app.advance(200)
  await resyncing
  assert.equal(page.data.roomCodeDisplay, '同步失败，请重试')
  assert.equal(page.data.roomCodeLoaded, true)
  assert.deepEqual(app.wx.toasts, [])
})

test('settings unbind panel uses the exact paired, waiting and unknown consequences without a native modal', async (t) => {
  const cases = [
    ['paired', '解除后你这边看不到这本日历；记录留在房间里，TA 照常能看。想回来，用房间码 ROOM01 重新加入'],
    ['waiting', '房间里只有你。解除后房间会存起来，记录不删；之后在绑定页点「我来建房间」就能恢复原来的房间和记录'],
    ['', '解除后你这边看不到这本日历，记录不会删除。TA 还在房间里时，用房间码 ROOM01 加入；房间里只剩你时，在绑定页点「我来建房间」恢复']
  ]
  for (const [roomStatus, content] of cases) {
    await t.test(roomStatus || 'unknown', async (t) => {
      const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
      const room = { roomCode: 'ROOM01' }
      if (roomStatus) room.status = roomStatus
      app.cloud.when('getMyRoom').reply({ code: 0, room })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      const unbinding = app.dispatch(page, 'unbind')
      await app.settle()
      assert.equal(page.data.confirmationTitle, '解除绑定？')
      assert.equal(page.data.confirmationContent, content)
      assert.deepEqual(page.data.confirmationActions, [
        { id: 'confirm', text: '解除绑定', kind: 'danger' },
        { id: 'cancel', text: '取消', kind: 'secondary' }
      ])
      assert.deepEqual(app.wx.modals, [])
      assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false)
      await chooseConfirmation(app, page, 'cancel')
      await unbinding
      assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false)
      assert.equal(app.storage.roomCode, 'ROOM01')
    })
  }
})

test('settings unbind mask, close, drag and system back all cancel without leaving', async (t) => {
  const closes = [
    { name: 'mask', handler: 'onConfirmationMask' },
    { name: 'close button', handler: 'onConfirmationClose' },
    { name: 'drag' },
    { name: 'system back', handler: 'onSheetSystemBack' }
  ]
  for (const close of closes) {
    await t.test(close.name, async (t) => {
      const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      const unbinding = app.dispatch(page, 'unbind')
      await app.settle()
      assert.equal(page.data.confirmationPhase, 'open')
      if (close.name === 'drag') {
        const currentTarget = { dataset: { sheet: 'confirmation' } }
        const touch = { identifier: 1, pageX: 100, pageY: 100 }
        app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
        app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 200 }] })
        await app.advance(100)
        app.dispatch(page, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 200 }] })
      } else {
        await app.dispatch(page, close.handler)
      }
      assert.equal(page.data.confirmationPhase, 'leaving')
      await app.advance(200)
      await unbinding
      assert.equal(page.data.confirmationMounted, false)
      assert.equal(page.data.pageObscured, false)
      assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false)
      assert.equal(app.storage.roomCode, 'ROOM01')
      assert.deepEqual(app.wx.modals, [])
      assert.equal(app.currentPage, page)
    })
  }
})

test('settings unbind only leaves after the danger action and hands the archived outcome to Bind in memory', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  const leaving = app.cloud.when('leaveRoom').defer()
  const writes = []
  const setStorageSync = app.wx.setStorageSync
  app.wx.setStorageSync = (key, value) => {
    writes.push(key)
    return setStorageSync(key, value)
  }
  const unbinding = app.dispatch(page, 'unbind')
  await app.settle()
  assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false)
  await chooseConfirmation(app, page)
  assert.equal(app.cloud.calls.filter(call => call.name === 'leaveRoom').length, 1)
  assert.equal(app.storage.roomCode, 'ROOM01', 'the cached Room stays until the server succeeds')
  assert.equal(app.currentPage, page)
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  leaving.resolve({ code: 0, archivedCount: 1 })
  await unbinding
  await app.settle()
  assert.equal(app.storage.roomCode, undefined)
  assert.equal(app.currentPage.route, 'pages/bind/bind')
  assert.equal(app.currentPage.data.leaveRecoveryNotice, '原来的房间已经存起来，点「我来建房间」就能恢复')
  assert.equal(app.navigation.at(-1).method, 'reLaunch')
  assert.equal(app.navigation.at(-1).url, '/pages/bind/bind')
  assert.deepEqual(writes, [], 'the outcome handoff must not write local storage')
  assert.deepEqual(app.wx.toasts, [{ title: '已解除绑定', icon: 'none' }])
  app.hide()
  app.show()
  await app.settle()
  assert.equal(app.currentPage.data.leaveRecoveryNotice, '原来的房间已经存起来，点「我来建房间」就能恢复')
  assert.equal(app.wx.toasts.length, 1, 'the toast is consumed once while the unbound explanation remains')
})

test('settings unbind failures keep the Room and show the existing error toast', async (t) => {
  for (const [name, response, message] of [
    ['business refusal', { code: -1, msg: '解除绑定失败，请稍后重试' }, '解除绑定失败，请稍后重试'],
    ['filtered server failure', { code: -1, msg: 'TypeError: unavailable' }, '这次没有完成，请重试'],
    ['network rejection', new Error('network down'), '网络不太稳定，请重试']
  ]) {
    await t.test(name, async (t) => {
      const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      const leaving = app.cloud.when('leaveRoom')
      if (response instanceof Error) leaving.reject(response)
      else leaving.reply(response)
      const unbinding = app.dispatch(page, 'unbind')
      await app.settle()
      await chooseConfirmation(app, page)
      await unbinding
      assert.equal(app.currentPage, page)
      assert.equal(app.storage.roomCode, 'ROOM01')
      assert.equal(page.data.roomCode, 'ROOM01')
      assert.deepEqual(app.wx.toasts, [{ title: message, icon: 'none' }])
      assert.deepEqual(app.wx.modals, [])
      assert.equal(app.navigation.length, 1)
    })
  }
})

test('waiting settings shows a native reinvite button and shares the static room invite', async (t) => {
  const app = settingsApp(t)
  const page = app.launch('/pages/settings/settings')
  await app.settle()

  assert.equal(page.data.roomMemberLabel, 'TA 还没加入')
  assert.equal(settingsInviteVisible(page.data), true)
  assert.deepEqual(app.platformCalls.showShareMenu, [{ menus: ['shareAppMessage'] }])
  assert.ok(app.platformCalls.hideShareMenu.length >= 1, 'capsule sharing starts hidden until the Room resolves')
  assert.deepEqual(app.share(page), {
    title: '邀请你加入我的日历',
    path: '/pages/bind/bind?roomCode=ROOM01',
    imageUrl: '/images/invite-card.png'
  })
})

test('non-waiting settings hides capsule sharing and unexpected shares use the ordinary static card', async (t) => {
  for (const [state, room] of [
    ['paired', { roomCode: 'ROOM01', status: 'paired' }],
    ['unknown', { roomCode: 'ROOM01' }],
    ['unbound', null]
  ]) {
    await t.test(state, async (t) => {
      const app = settingsApp(t)
      app.cloud.when('getMyRoom').reply({ code: 0, room })
      const page = app.launch('/pages/settings/settings')
      await app.settle()

      assert.equal(settingsInviteVisible(page.data), false)
      assert.equal(app.platformCalls.showShareMenu, undefined)
      assert.ok(app.platformCalls.hideShareMenu.length >= 1)
      const card = app.share(page)
      assert.deepEqual(card, {
        title: '美少女的日历',
        path: '/pages/bind/bind',
        imageUrl: '/images/invite-card.png'
      })
      assert.equal(JSON.stringify(card).includes('ROOM01'), false)
    })
  }
})

test('settings shows membership and announces only a waiting-to-paired transition', async (t) => {
  for (const initialStatus of ['waiting', 'paired']) {
    await t.test(initialStatus, async (t) => {
      const app = settingsApp(t)
      app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: initialStatus } })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      assert.equal(page.data.roomMemberLabel, initialStatus === 'waiting' ? 'TA 还没加入' : 'TA 已加入')
      assert.deepEqual(app.wx.toasts, [])
      app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'paired' } })
      for (let repeat = 0; repeat < 2; repeat += 1) {
        app.hide()
        app.show()
        await app.settle()
        assert.equal(page.data.roomMemberLabel, 'TA 已加入')
        assert.equal(page.data.roomCode, 'ROOM01')
      }
      assert.deepEqual(app.wx.toasts.map(toast => toast.title), initialStatus === 'waiting' ? ['TA 已加入'] : [])
    })
  }
})

test('settings writes calendar density only when the selection changes', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01', calendarDensity: 'compact' } })
  const densityWrites = []
  const setStorageSync = app.wx.setStorageSync
  app.wx.setStorageSync = (key, value) => {
    if (key === 'calendarDensity') densityWrites.push(value)
    return setStorageSync(key, value)
  }
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.deepEqual(densityWrites, [], 'showing settings only reads the saved preference')
  await app.dispatch(page, 'setCalendarDensity', { currentTarget: { dataset: { density: 'compact' } } })
  assert.deepEqual(densityWrites, [], 'reselecting the visible density is a no-op')
  await app.dispatch(page, 'setCalendarDensity', { currentTarget: { dataset: { density: 'full' } } })
  assert.deepEqual(densityWrites, ['full'])
  app.hide()
  app.show()
  await app.settle()
  assert.deepEqual(densityWrites, ['full'], 'showing the unchanged density does not rewrite storage')
  await app.dispatch(page, 'setCalendarDensity', { currentTarget: { dataset: { density: 'full' } } })
  assert.deepEqual(densityWrites, ['full'])
  await app.dispatch(page, 'setCalendarDensity', { currentTarget: { dataset: { density: 'compact' } } })
  assert.deepEqual(densityWrites, ['full', 'compact'])
})

test('settings help explains marks, period states, completion and both room-return paths', async (t) => {
  const app = settingsApp(t)
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  await app.dispatch(page, 'openHelp')
  await app.settle()
  assert.equal(page.data.helpPhase, 'open')

  const template = readSource(path.join(__dirname, '../pages/settings/settings.wxml'), 'utf8')
  const helpStart = template.indexOf('class="day-action-sheet help-sheet')
  assert.ok(helpStart !== -1, 'expected the settings help template')
  const help = template.slice(helpStart)
  const expectedCopy = [
    '日历标记的意思，请点首页左上角的「图例」查看。',
    '经期有「进行中」「结束日期不详」「已结束」三种状态。',
    '过去漏记的经期可以补记；进行中的经期结束后，用「记结束」填上结束日期。',
    '解除绑定后，TA 还在房间里时，用房间码加入；房间里只剩你时，房间会归档，记录还在；在绑定页点「我来建房间」恢复。'
  ]
  for (const copy of expectedCopy) assert.ok(help.includes(copy), `help should explain: ${copy}`)
  assert.doesNotMatch(help, /点「创建」[^。]*恢复/)
})

test('help opens after render, silences settings, keeps tabs hidden through exit and cancels exit on reopen', async (t) => {
  const app = settingsApp(t)
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(page.data.helpOpen, false)
  assert.equal(page.data.helpMounted, false)
  assert.equal(page.data.helpPhase, 'closed')
  assert.equal(page.data.pageObscured, false)
  await app.dispatch(page, 'openHelp')
  assert.equal(page.data.helpOpen, true)
  assert.equal(page.data.helpMounted, true)
  assert.equal(page.data.helpPhase, 'closed')
  assert.equal(app.tabBar.visible, true)
  await app.settle()
  assert.equal(page.data.helpPhase, 'open')
  assert.equal(page.data.pageObscured, true)
  assert.deepEqual(app.tabBar.calls.at(-1), { visible: false, animation: true })
  await app.dispatch(page, 'closeHelp')
  assert.equal(page.data.helpOpen, false)
  assert.equal(page.data.helpPhase, 'leaving')
  await app.advance(199)
  assert.equal(page.data.helpMounted, true)
  assert.equal(page.data.pageObscured, true)
  assert.equal(app.tabBar.visible, false)
  await app.advance(1)
  assert.equal(page.data.helpMounted, false)
  assert.equal(page.data.helpPhase, 'closed')
  assert.equal(page.data.pageObscured, false)
  assert.deepEqual(app.tabBar.calls.at(-1), { visible: true, animation: true })

  await app.dispatch(page, 'openHelp')
  await app.settle()
  await app.dispatch(page, 'closeHelp')
  await app.advance(100)
  const tabCalls = app.tabBar.calls.length
  await app.dispatch(page, 'openHelp')
  await app.advance(200)
  assert.equal(page.data.helpOpen, true)
  assert.equal(page.data.helpPhase, 'open')
  assert.equal(page.data.helpMounted, true)
  assert.equal(page.data.pageObscured, true)
  assert.equal(app.tabBar.visible, false)
  assert.equal(app.tabBar.calls.length, tabCalls)
})

test('reduced-motion help toggles the native tab bar without animation', async (t) => {
  const app = settingsApp(t, { reducedMotion: true })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.deepEqual(app.tabBar.calls, [{ visible: true, animation: false }])
  await app.dispatch(page, 'openHelp')
  await app.settle()
  await app.dispatch(page, 'closeHelp')
  await app.advance(200)
  assert.equal(page.data.helpMounted, false)
  assert.deepEqual(app.tabBar.calls, [
    { visible: true, animation: false },
    { visible: false, animation: false },
    { visible: true, animation: false }
  ])
})

test('showing settings restores the tab bar unless help still covers the page', async (t) => {
  const app = settingsApp(t)
  app.wx.hideTabBar()
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(app.tabBar.visible, true)
  assert.deepEqual(app.tabBar.calls.at(-1), { visible: true, animation: false })
  await app.dispatch(page, 'openHelp')
  await app.settle()
  const calls = app.tabBar.calls.length
  app.hide()
  app.show()
  await app.settle()
  assert.equal(page.data.helpPhase, 'open')
  assert.equal(app.tabBar.visible, false)
  assert.equal(app.tabBar.calls.length, calls)
})

test('system back closes help and keeps settings in place during repeated back events', async (t) => {
  const app = settingsApp(t)
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(page.data.sheetExitGuard, false)
  await app.dispatch(page, 'openHelp')
  assert.equal(page.data.sheetExitGuard, true)
  await app.settle()
  await app.dispatch(page, 'onSheetSystemBack')
  await app.settle()
  assert.equal(page.data.helpPhase, 'leaving')
  assert.equal(page.data.helpMounted, true)
  assert.equal(page.data.sheetExitGuard, true)
  await app.dispatch(page, 'onSheetSystemBack')
  await app.advance(199)
  assert.equal(page.data.helpPhase, 'leaving')
  assert.equal(page.data.helpMounted, true)
  await app.advance(1)
  assert.equal(page.data.helpPhase, 'closed')
  assert.equal(page.data.helpMounted, false)
  assert.equal(page.data.sheetExitGuard, false)
  assert.equal(app.currentPage, page)
  assert.equal(app.navigation.length, 1)
})

test('settings help closes from a downward drag without leaving settings', async (t) => {
  const app = settingsApp(t)
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  await app.dispatch(page, 'openHelp')
  await app.settle()

  const currentTarget = { dataset: { sheet: 'help' } }
  const touch = { identifier: 1, pageX: 100, pageY: 100 }
  app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
  app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 240 }] })
  await app.advance(100)
  app.dispatch(page, 'sheetDrag.touchEnd', { currentTarget, changedTouches: [{ ...touch, pageY: 240 }] })

  assert.equal(page.data.helpPhase, 'leaving')
  assert.equal(page.data.helpMounted, true)
  assert.equal(page.data.sheetExitGuard, true)
  await app.advance(199)
  assert.equal(page.data.helpMounted, true)
  await app.advance(1)
  assert.equal(page.data.helpPhase, 'closed')
  assert.equal(page.data.helpMounted, false)
  assert.equal(page.data.sheetExitGuard, false)
  assert.equal(app.tabBar.visible, true)
  assert.equal(app.currentPage, page)
  assert.equal(app.navigation.length, 1)
})

test('settings help touchcancel resets the drag without closing', async (t) => {
  const app = settingsApp(t)
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  await app.dispatch(page, 'openHelp')
  await app.settle()

  const currentTarget = { dataset: { sheet: 'help' } }
  const touch = { identifier: 1, pageX: 100, pageY: 100 }
  app.dispatch(page, 'sheetDrag.touchStart', { currentTarget, touches: [touch] })
  app.dispatch(page, 'sheetDrag.touchMove', { currentTarget, touches: [{ ...touch, pageY: 180 }] })
  assert.equal(app.viewStyle(page, '.sheet-slide-help').transform, 'translateY(80px)')
  app.dispatch(page, 'sheetDrag.touchCancel', { currentTarget, changedTouches: [{ ...touch, pageY: 180 }] })

  assert.equal(page.data.helpPhase, 'open')
  assert.equal(page.data.helpMounted, true)
  assert.deepEqual(page.data.helpDragClear, { token: 1, action: 'reset' })
  await app.advance(16)
  assert.equal(app.viewStyle(page, '.sheet-slide-help').transform, '')
  assert.equal(app.tabBar.visible, false)
})

function settingsInviteVisible(data) {
  const template = readSource(path.join(__dirname, '../pages/settings/settings.wxml'), 'utf8')
  const button = wxmlOpeningTags(template).find(tag => tag.attrs['open-type'] === 'share')
  assert.ok(button, 'settings must contain a native share button')
  assert.match(template, /<button\b[^>]*open-type="share"[^>]*>\s*再发邀请\s*<\/button>/)
  assert.equal(button.attrs['aria-label'], '再发邀请')
  const condition = button.attrs['wx:if']
  assert.ok(condition, 'the reinvite button must be conditional on the Room state')
  return Boolean(evaluateWxmlExpression(condition.slice(2, -2), data))
}
