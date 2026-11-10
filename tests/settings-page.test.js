const assert = require('node:assert/strict')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')

function settingsApp(t, options = {}) {
  const app = createMiniProgram(options)
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
  return app
}

test('settings exports both cloud collections only after the explanation is confirmed', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
  const periods = [{ _id: 'p1', startDate: '2026-06-20', endDate: '2026-06-24', periodStatus: 'ended' }]
  const memories = [{ _id: 'm1', date: '2026-06-25', note: '测试记录' }]
  app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'periods', roomCode: 'ROOM01' } }).reply({ code: 0, data: periods })
  const pendingMemories = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'memories', roomCode: 'ROOM01' } }).defer()
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  const confirmation = app.wx.modals[0]
  assert.equal(confirmation.title, '导出数据')
  assert.equal(confirmation.confirmText, '开始导出')
  assert.match(confirmation.content, /全部经期和欢乐时光/)
  assert.match(confirmation.content, /文件传输助手/)
  assert.match(confirmation.content, /不能导入恢复/)
  assert.equal(app.cloud.calls.some(call => call.name === 'dataOp'), false)
  assert.equal(app.platformCalls.showLoading, undefined)
  app.respond('showModal', 0, { confirm: true })
  await app.settle()
  assert.equal(app.platformCalls.shareFileMessage, undefined, 'both collections must arrive before sharing')
  pendingMemories.resolve({ code: 0, data: memories })
  await app.settle()
  await exporting
  assert.equal(app.wx.toasts.at(-1).title, '导出成功')
  assert.deepEqual(app.files, [{
    path: '/wx-user-data/minmin-calendar-backup.json',
    data: JSON.stringify({ exportTime: '2026-06-26T04:00:00.000Z', periods, memories }, null, 2),
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
  app.respondNext('showModal', { confirm: false, cancel: true })
  await app.dispatch(page, 'exportData')
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
  app.respondNext('showModal', { confirm: true })
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  assert.equal(app.wx.modals.at(-1).title, '导出失败')
  assert.equal(app.wx.modals.at(-1).confirmText, '重试')
  assert.deepEqual(app.files, [])
  assert.equal(app.platformCalls.shareFileMessage, undefined)
  memories.reply({ code: 0, data: [] })
  app.respondNext('showModal', { confirm: true })
  app.respond('showModal', 1, { confirm: true })
  await app.settle()
  await exporting
  assert.equal(app.files.length, 1)
  assert.equal(app.wx.toasts.at(-1).title, '导出成功')
})

test('share cancellation keeps the clipboard intact and share failure copies only by explicit choice', async (t) => {
  for (const [failure, copyJson] of [['shareFileMessage:fail cancel', false], ['shareFileMessage:fail unavailable', true]]) {
    await t.test(failure, async (t) => {
      const app = settingsApp(t)
      app.cloud.when('dataOp').reply({ code: 0, data: [] })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      app.respondNext('showModal', { confirm: true })
      app.respondNext('shareFileMessage', new Error(failure))
      const exporting = app.dispatch(page, 'exportData')
      await app.settle()
      assert.deepEqual(app.clipboard, [])
      if (copyJson) {
        const menu = app.wx.actionSheets[0]
        assert.match(menu.alertText, /全部经期和欢乐时光/)
        const tapIndex = menu.itemList.indexOf('复制 JSON')
        assert.ok(tapIndex >= 0)
        app.respond('showActionSheet', 0, { tapIndex })
      } else {
        assert.deepEqual(app.wx.actionSheets, [])
      }
      await app.settle()
      await exporting
      assert.deepEqual(app.clipboard, copyJson ? [app.files[0].data] : [])
      assert.equal(app.wx.toasts.some(toast => toast.title === '导出成功'), false)
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

test('resync explains local-only clearing and never deletes records or leaves the room', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01', calendarDensity: 'full' } })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  await app.dispatch(page, 'clearData')
  const modal = app.wx.modals[0]
  assert.equal(modal.title, '重新同步房间')
  assert.equal(modal.content, '只会清掉本机缓存的房间码，再重新获取。不会删除记录，也不会退出房间。')
  const verification = app.cloud.when('getMyRoom').defer()
  app.respond('showModal', 0, { confirm: true })
  await app.settle()
  assert.equal(app.storage.roomCode, undefined)
  assert.equal(app.storage.calendarDensity, 'full')
  verification.resolve({ code: 0, room: { roomCode: 'ROOM02' } })
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, 'ROOM02')
  assert.equal(app.storage.roomCode, 'ROOM02')
  assert.deepEqual(app.cloud.calls.map(call => call.name), ['getMyRoom', 'getMyRoom'])
})

test('settings and the refused-bind entry show the same unbind confirmation', async (t) => {
  const confirmations = []
  for (const route of ['settings', 'bind']) {
    await t.test(route, async (t) => {
      const app = settingsApp(t, { storage: route === 'settings' ? { roomCode: 'ROOM01' } : {} })
      if (route === 'bind') {
        app.cloud.when('getMyRoom').reply({ code: 0, room: null })
        app.cloud.when('createRoom').reply({ code: -5, msg: '你已加入其他房间，请先解除绑定后再创建新房间' })
      }
      const page = app.launch(`/pages/${route}/${route}`)
      await app.settle()
      if (route === 'bind') {
        await app.dispatch(page, 'createRoom')
        assert.equal(page.data.needUnbind, true)
      }
      await app.dispatch(page, 'unbind')
      const { title, content, confirmText, confirmColor, cancelText, showCancel } = app.wx.modals[0]
      confirmations.push({ title, content, confirmText, confirmColor, cancelText, showCancel })
    })
  }
  assert.deepEqual(confirmations[0], {
    title: '解除绑定',
    content: '解除绑定后你会退出这个房间。TA 还在的话会留在房间里；房间里只剩你时，房间会归档。之后在绑定页点「创建」即可恢复。',
    confirmText: '解除绑定', confirmColor: '#F97373', cancelText: undefined, showCancel: undefined
  })
  assert.deepEqual(confirmations[1], confirmations[0])
})

test('both unbind entries report a failed confirmation without leaving the room', async (t) => {
  for (const route of ['settings', 'bind']) {
    await t.test(route, async (t) => {
      const app = settingsApp(t, { storage: route === 'settings' ? { roomCode: 'ROOM01' } : {} })
      if (route === 'bind') {
        app.cloud.when('getMyRoom').reply({ code: 0, room: null })
        app.cloud.when('createRoom').reply({ code: -5, msg: '你目前属于另一个房间' })
      }
      const page = app.launch(`/pages/${route}/${route}`)
      await app.settle()
      if (route === 'bind') await app.dispatch(page, 'createRoom')
      app.respondNext('showModal', new Error('showModal:fail'))
      await app.dispatch(page, 'unbind')
      await app.settle()
      assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false)
      assert.equal(app.currentPage, page)
      const message = route === 'bind' ? page.data.errorMsg : app.wx.toasts.at(-1)?.title
      assert.equal(message, '这次没有完成，请重试')
      assert.equal(app.storage.bindUnbindNotice, undefined)
    })
  }
})

test('both unbind entries preserve confirmation, cancellation, failures and successful leave behavior', async (t) => {
  const scenarios = [
    { name: 'cancel', confirm: false },
    { name: 'business refusal', result: { code: -1, msg: '解除绑定失败，请稍后重试' }, message: '解除绑定失败，请稍后重试' },
    { name: 'filtered server failure', result: { code: -1, msg: 'TypeError: unavailable' }, message: '这次没有完成，请重试' },
    { name: 'network rejection', error: new Error('network down'), message: '网络不太稳定，请重试' },
    { name: 'success', result: { code: 0 } }
  ]
  for (const route of ['settings', 'bind']) {
    for (const scenario of scenarios) {
      await t.test(`${route}: ${scenario.name}`, async (t) => {
        const app = settingsApp(t, { storage: route === 'settings' ? { roomCode: 'ROOM01' } : {} })
        if (route === 'bind') {
          app.cloud.when('getMyRoom').reply({ code: 0, room: null })
          app.cloud.when('joinRoom').reply({ code: -5, msg: '你目前属于另一个房间' })
        }
        const page = app.launch(`/pages/${route}/${route}${route === 'bind' ? '?roomCode=ROOM02' : ''}`)
        await app.settle()
        if (route === 'bind') {
          await app.dispatch(page, 'joinRoom')
          assert.equal(page.data.needUnbind, true)
        }
        const originalRoomCode = page.data.roomCode
        const cachedRoomCode = app.storage.roomCode
        const leaving = app.cloud.when('leaveRoom').defer()
        await app.dispatch(page, 'unbind')
        await app.settle()
        assert.equal(app.wx.modals.length, 1)
        assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false, 'confirmation must precede the server call')
        const confirm = scenario.confirm !== false
        app.respond('showModal', 0, { confirm, cancel: !confirm })
        await app.settle()
        assert.equal(app.cloud.calls.filter(call => call.name === 'leaveRoom').length, confirm ? 1 : 0)
        assert.equal(app.currentPage, page)
        assert.equal(page.data.roomCode, originalRoomCode)
        assert.equal(app.storage.roomCode, cachedRoomCode, 'do not clear the Room while leave is pending')
        assert.equal(app.storage.bindUnbindNotice, undefined)
        assert.deepEqual(app.wx.toasts, [])
        if (!confirm) {
          assert.equal(app.navigation.length, 1)
          if (route === 'bind') assert.equal(page.data.needUnbind, true)
          return
        }
        if (scenario.name === 'success') app.cloud.when('getMyRoom').reply({ code: 0, room: null })
        if (scenario.error) leaving.reject(scenario.error)
        else leaving.resolve(scenario.result)
        await app.settle()
        if (scenario.message) {
          assert.equal(app.currentPage, page)
          assert.equal(app.navigation.length, 1)
          assert.equal(page.data.roomCode, originalRoomCode)
          assert.equal(app.storage.roomCode, cachedRoomCode)
          assert.equal(app.storage.bindUnbindNotice, undefined)
          if (route === 'bind') {
            assert.equal(page.data.errorMsg, scenario.message)
            assert.equal(page.data.needUnbind, true)
            assert.equal(page.data.joinCode, 'ROOM02')
          } else {
            assert.deepEqual(app.wx.toasts, [{ title: scenario.message, icon: 'none' }])
          }
          return
        }
        assert.equal(app.storage.roomCode, undefined)
        assert.equal(app.currentPage.route, 'pages/bind/bind')
        assert.equal(app.currentPage.data.bound, false)
        assert.equal(app.currentPage.data.roomCode, '')
        assert.equal(app.currentPage.data.joinCode, '')
        assert.equal(app.currentPage.data.needUnbind, false)
        assert.equal(app.currentPage.data.errorMsg, '')
        assert.equal(app.navigation.length, route === 'settings' ? 2 : 1)
        if (route === 'settings') assert.equal(app.navigation.at(-1).method, 'reLaunch')
        else assert.equal(app.currentPage, page)
        const notices = route === 'settings' ? [{ title: '已解除绑定', icon: 'none' }] : []
        assert.deepEqual(app.wx.toasts, notices)
        assert.equal(app.storage.bindUnbindNotice, undefined)
        for (let visit = 0; visit < 2; visit += 1) {
          app.hide()
          app.show()
          await app.settle()
          assert.deepEqual(app.wx.toasts, notices, 'the leave notice must never repeat')
        }
      })
    }
  }
})

test('settings leave still returns to verified bind when writing its optional notice fails', async (t) => {
  const app = settingsApp(t, { storage: { roomCode: 'ROOM01' } })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  const setStorageSync = app.wx.setStorageSync
  let noticeWrites = 0
  app.wx.setStorageSync = (key, value) => {
    if (key === 'bindUnbindNotice') {
      noticeWrites += 1
      throw new Error('notice storage write failed')
    }
    return setStorageSync(key, value)
  }
  app.cloud.when('leaveRoom').reply({ code: 0 })
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  app.respondNext('showModal', { confirm: true })
  await app.dispatch(page, 'unbind')
  await app.settle()
  assert.equal(noticeWrites, 1)
  assert.deepEqual(app.cloud.calls.map(call => call.name), ['getMyRoom', 'leaveRoom', 'getMyRoom'])
  assert.equal(app.storage.roomCode, undefined)
  assert.equal(app.storage.bindUnbindNotice, undefined)
  assert.equal(app.navigation.at(-1).method, 'reLaunch')
  assert.equal(app.currentPage.route, 'pages/bind/bind')
  assert.equal(app.currentPage.data.verifying, false)
  assert.equal(app.currentPage.data.bound, false)
  assert.equal(app.currentPage.data.errorMsg, '')
  assert.deepEqual(app.wx.toasts, [])
})

test('bind still verifies its Room when reading or removing the optional leave notice fails', async (t) => {
  for (const method of ['getStorageSync', 'removeStorageSync']) {
    await t.test(method, async (t) => {
      const app = settingsApp(t, { storage: { bindUnbindNotice: '1' } })
      app.cloud.when('getMyRoom').reply({ code: 0, room: null })
      const storageOperation = app.wx[method]
      let noticeAttempts = 0
      app.wx[method] = key => {
        if (key === 'bindUnbindNotice') {
          noticeAttempts += 1
          throw new Error(`notice ${method} failed`)
        }
        return storageOperation(key)
      }
      const page = app.launch('/pages/bind/bind')
      await app.settle()
      assert.equal(noticeAttempts, 1)
      assert.deepEqual(app.cloud.calls.map(call => call.name), ['getMyRoom'])
      assert.equal(app.currentPage, page)
      assert.equal(page.data.verifying, false)
      assert.equal(page.data.bound, false)
      assert.equal(page.data.errorMsg, '')
      assert.equal(page.data.checkFailed, false)
      assert.equal(app.storage.bindUnbindNotice, '1')
      assert.deepEqual(app.wx.toasts, method === 'getStorageSync' ? [] : [{ title: '已解除绑定', icon: 'none' }])
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
      assert.equal(page.data.roomMemberLabel, initialStatus === 'waiting' ? '等待 TA 加入' : 'TA 已加入')
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
