const assert = require('node:assert/strict')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')

const records = [
  { kind: 'period', collection: 'periods', fields: { id: 'edited', startDate: '2026-06-20', status: 'ongoing' } },
  { kind: 'memory', collection: 'memories', fields: { id: 'edited', date: '2026-06-20' } }
]
const saveAdvice = '保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交'
const deleteAdvice = '删除结果暂未确认，请返回列表刷新后确认记录是否已删除，避免重复操作'
const modal = (title, content, next) => ({ form: 'modal', title, content, next })
const inline = (title, content, actionText, next) => ({ form: 'inline', title, content, actionText, next })

// One table owns the expected presentation at the platform seam. A lost read reply
// is simply retryable: there is no mutation to reconcile. Saves distinguish a
// successful read-back with no match from a read-back whose reply is also lost.
const scenarios = [
  {
    failure: 'retryable',
    list: modal('加载失败', '加载失败，请检查网络', 'retry'),
    save: modal('保存失败', '没有保存成功，请重试', 'check'),
    delete: modal('删除失败', deleteAdvice, 'check'),
    export: modal('导出失败', '导出失败，请检查网络', 'retry'),
    home: inline('日历加载失败', '网络不太稳定，请重试', '重试', 'retry')
  },
  {
    failure: 'unconfirmed',
    list: modal('加载失败', '加载失败，请检查网络', 'retry'),
    save: modal('保存失败', saveAdvice, 'check'),
    delete: modal('删除失败', deleteAdvice, 'check'),
    export: modal('导出失败', '导出失败，请检查网络', 'retry'),
    home: inline('日历加载失败', '网络不太稳定，请重试', '重试', 'retry')
  },
  {
    failure: 'rebind',
    list: modal('房间状态已变化', '房间状态已变化，请重新绑定', 'bind'),
    save: modal('房间状态已变化', '房间状态已变化，请重新绑定', 'bind'),
    delete: modal('房间状态已变化', '房间状态已变化，请重新绑定', 'bind'),
    export: modal('房间状态已变化', '房间状态已变化，请重新绑定', 'bind'),
    home: inline('房间状态已变化', '当前共享房间已不可用，请重新绑定后再查看日历', '去绑定', 'bind')
  },
  {
    failure: 'no-room',
    list: modal('请先绑定房间', '当前操作需要先绑定房间', 'bind'),
    save: modal('请先绑定房间', '当前操作需要先绑定房间', 'bind'),
    delete: modal('请先绑定房间', '当前操作需要先绑定房间', 'bind'),
    export: modal('请先绑定房间', '导出前需要先绑定房间', 'bind'),
    home: inline('还没绑定房间', '需要先创建或加入一个共享房间\n才能和对方一起使用', '去绑定', 'bind')
  },
  {
    failure: 'repaired',
    list: modal('房间状态已同步', '房间状态已同步，请重试', 'retry'),
    save: modal('房间状态已同步', `房间状态已同步\n\n${saveAdvice}`, 'check'),
    delete: modal('房间状态已同步', `房间状态已同步\n\n${deleteAdvice}`, 'check'),
    export: modal('房间状态已更新', '房间状态已更新，请重试导出', 'retry'),
    home: inline('房间状态已更新', '房间状态已同步，请重新加载日历', '重新加载', 'retry')
  },
  {
    failure: 'repair-failed',
    list: modal('加载失败', '网络不太稳定，请重试', 'retry'),
    save: modal('保存失败', `网络不太稳定\n\n${saveAdvice}`, 'check'),
    delete: modal('删除失败', `网络不太稳定\n\n${deleteAdvice}`, 'check'),
    export: modal('房间同步失败', '网络不太稳定，请重试', 'retry'),
    home: inline('房间同步失败', '网络不太稳定，请重试', '重试', 'retry')
  }
]

const operations = [
  ...records.flatMap(record => ['list', 'save', 'delete'].map(operation => ({ operation, record }))),
  { operation: 'export' },
  { operation: 'home' }
]
const dataCalls = app => app.cloud.calls.filter(call => call.name === 'dataOp')
const writes = app => dataCalls(app).filter(call => call.data.action !== 'list')

function recover(app) {
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
  app.cloud.when('dataOp').reply({ code: 0, data: [] })
}

async function prepare(t, { operation, record }, failure, { missingModal = false, failedModal = false } = {}) {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01', recordTabSegment: record?.kind || 'period' } })
  t.after(() => app.teardown())
  recover(app)
  let page
  if (operation === 'save' || operation === 'delete') {
    page = app.launch(`/pages/${record.kind}/edit/edit?${new URLSearchParams(record.fields)}`)
    await app.settle()
  } else if (operation === 'export') {
    page = app.launch('/pages/settings/settings')
    await app.settle()
  }

  if (failure === 'no-room') {
    app.wx.removeStorageSync('roomCode')
    app.cloud.when('getMyRoom').reply({ code: 1, msg: '未加入任何房间' })
  } else if (['rebind', 'repaired', 'repair-failed'].includes(failure)) {
    app.cloud.when('dataOp').reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED', msg: '无权访问该房间' })
    if (failure === 'rebind') app.cloud.when('getMyRoom').reply({ code: 1, msg: '未加入任何房间' })
    if (failure === 'repair-failed') app.cloud.when('getMyRoom').reject(new Error('network down'))
  } else {
    const action = operation === 'save' ? 'update' : operation === 'delete' ? 'remove' : 'list'
    app.cloud.when({ name: 'dataOp', data: { action } })
      .reject(new Error(failure === 'unconfirmed' ? 'request:fail response lost' : 'network down'))
    if (operation === 'save' && failure === 'unconfirmed') {
      app.cloud.when({ name: 'dataOp', data: { action: 'list' } }).reject(new Error('request:fail response lost'))
    }
  }
  if (operation === 'home' || operation === 'list') {
    if (failedModal) app.respondNext('showModal', new Error('showModal:fail unavailable'))
    page = app.launch(operation === 'home' ? '/pages/index/index' : '/pages/period/period')
    if (missingModal) delete app.wx.showModal
    await app.settle()
    return { app, page }
  }
  // These are user confirmations, preceding the Room access failure prompt.
  if (operation === 'delete' || operation === 'export') app.respondNext('showModal', { confirm: true })
  if (failedModal) app.respondNext('showModal', new Error('showModal:fail unavailable'))
  const pending = app.dispatch(page, operation === 'export' ? 'exportData' : operation === 'delete' ? 'delete' : 'save')
  if (missingModal) delete app.wx.showModal
  await app.settle()
  return { app, page, pending }
}

function assertPresentation(app, page, expected) {
  if (expected.form === 'inline') {
    const view = app.rendered(page)
    assert.equal(view.noRoom, true)
    assert.equal(view.roomStatusTitle, expected.title)
    assert.equal(view.roomStatusDesc, expected.content)
    assert.equal(view.roomStatusActionText, expected.actionText)
    assert.equal(view.roomStatusAction, expected.next)
    assert.deepEqual(app.wx.modals, [])
    return
  }
  const prompt = app.wx.modals.at(-1)
  assert.ok(prompt, 'the real page must present the failure')
  assert.equal(prompt.title, expected.title)
  assert.equal(prompt.content, expected.content)
  assert.equal(prompt.confirmText, { retry: '重试', check: '知道了', bind: '去绑定' }[expected.next])
  if (expected.next === 'check') assert.equal(prompt.showCancel, false)
  else {
    assert.notEqual(prompt.showCancel, false)
    assert.equal(prompt.cancelText, '取消')
  }
}

for (const [failure, operation] of [['retryable', 'list'], ['unconfirmed', 'save'], ['no-room', 'export']]) {
  for (const unavailable of ['missingModal', 'failedModal']) {
    test(`${operation}: ${unavailable} falls back to the same advice without navigating or retrying`, async (t) => {
      const spec = operations.find(item => item.operation === operation)
      const { app, page, pending } = await prepare(t, spec, failure, { [unavailable]: true })
      const expected = scenarios.find(item => item.failure === failure)[operation]
      assert.equal(app.wx.toasts.at(-1)?.title, expected.content)
      assert.equal(app.wx.toasts.at(-1).icon, 'none')
      const beforeCalls = dataCalls(app).length
      await pending
      await app.settle()
      assert.equal(dataCalls(app).length, beforeCalls)
      assert.equal(app.currentPage, page)
      assert.equal(app.navigation.length, 1)
    })
  }
}

for (const scenario of scenarios) {
  for (const spec of operations) {
    test(`${scenario.failure} × ${spec.operation}${spec.record ? ` (${spec.record.kind})` : ''}: form, copy and actual recovery`, async (t) => {
      const { app, page, pending } = await prepare(t, spec, scenario.failure)
      const expected = scenario[spec.operation]
      assertPresentation(app, page, expected)
      const beforeCalls = dataCalls(app).length
      const beforeWrites = writes(app).length
      if (expected.next === 'retry') {
        recover(app)
        if (spec.operation === 'export') app.respondNext('showModal', { confirm: true })
      }
      if (expected.form === 'inline') await app.dispatch(page, 'handleRoomStatusAction')
      else app.respond('showModal', app.wx.modals.length - 1, { confirm: true })
      await app.settle()
      await pending
      await app.settle()
      if (expected.next === 'bind') {
        assert.equal(app.navigation.at(-1).url, '/pages/bind/bind')
        assert.equal(app.currentPage.route, 'pages/bind/bind', 'the binding destination must really load')
        assert.equal(app.rendered(app.currentPage).bound, false)
      } else if (expected.next === 'retry') {
        assert.ok(dataCalls(app).length > beforeCalls, 'retry reaches the raw cloud seam')
        assert.equal(app.currentPage, page)
        if (spec.operation === 'home') assert.equal(app.rendered(page).hasLoadedHomeData, true)
        if (spec.operation === 'list') assert.equal(app.rendered(page)[spec.record.kind === 'period' ? 'loadFailed' : 'memoryLoadFailed'], false)
        if (spec.operation === 'export') assert.equal(app.files.length, 1)
      } else {
        assert.equal(writes(app).length, beforeWrites, 'acknowledgement cannot replay a mutation')
        assert.equal(dataCalls(app).length, beforeCalls, 'checking instructions cannot silently retry')
        assert.equal(app.currentPage, page)
        assert.equal(app.rendered(page).submitted, false)
      }
    })
  }
}

const confirmations = [
  { name: 'export', route: '/pages/settings/settings', event: 'exportData' },
  { name: 'period deletion', route: `/pages/period/edit/edit?${new URLSearchParams(records[0].fields)}`, event: 'delete' },
  { name: 'memory deletion', route: `/pages/memory/edit/edit?${new URLSearchParams(records[1].fields)}`, event: 'delete' },
  { name: 'leave', route: '/pages/settings/settings', event: 'unbind' },
  { name: 'cache resync', route: '/pages/settings/settings', event: 'clearData' },
  { name: 'overlap', route: '/pages/period/edit/edit?startDate=2026-06-20&endDate=2026-06-23', event: 'save' }
]
for (const confirmation of confirmations) {
  for (const unavailable of ['missing', 'failed']) {
    test(`${confirmation.name}: ${unavailable} confirmation cannot authorize a business action or leave a pending result`, async (t) => {
      const app = createMiniProgram({ storage: { roomCode: 'ROOM01' } })
      t.after(() => app.teardown())
      recover(app)
      app.cloud.when('leaveRoom').reply({ code: 0 })
      if (confirmation.name === 'overlap') {
        app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'periods' } })
          .reply({ code: 0, data: [{ _id: 'covered', startDate: '2026-06-19', endDate: '2026-06-24' }] })
      }
      const page = app.launch(confirmation.route)
      await app.settle()
      const roomCalls = app.cloud.calls.filter(call => call.name === 'getMyRoom').length
      if (unavailable === 'missing') delete app.wx.showModal
      else app.respondNext('showModal', new Error('showModal:fail unavailable'))
      const pending = app.dispatch(page, confirmation.event)
      await app.settle()
      assert.ok(app.wx.toasts.length, 'unavailable confirmation must leave visible feedback')
      assert.equal(app.currentPage, page)
      assert.equal(app.cloud.calls.filter(call => call.name === 'leaveRoom').length, 0)
      assert.equal(writes(app).length, 0)
      assert.deepEqual(app.files, [])
      assert.deepEqual(app.clipboard, [])
      if (confirmation.name === 'export') assert.equal(dataCalls(app).length, 0)
      if (confirmation.name === 'cache resync') assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, roomCalls)
      await pending
      await app.settle()
      assert.equal(app.storage.roomCode, 'ROOM01')
    })
  }
}
