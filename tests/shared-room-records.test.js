const assert = require('node:assert/strict')
const test = require('node:test')
const { createMiniProgram } = require('./helpers/miniProgram')

// #193: one Room record copy shared by every page, observed only through real pages,
// lifecycles, platform responses and rendered data. A and B are two Rooms this device
// holds one after the other; once B is the Room, nothing of A may show.
const A = 'ROOM01'
const B = 'ROOM02'
const listed = (data, roomStatus) => roomStatus ? { code: 0, data, roomStatus } : { code: 0, data }
const period = (id, date, extra = {}) => ({ _id: id, startDate: date, endDate: date, status: 'known-end', ...extra })
const memory = (id, date, extra = {}) => ({ _id: id, date, note: '', ...extra })

function homeApp(t, options = {}) {
  const app = createMiniProgram({ storage: { roomCode: A }, ...options })
  t.after(() => app.teardown())
  return app
}

function listRoute(app, collection, roomCode) {
  return app.cloud.when({ name: 'dataOp', data: { action: 'list', collection, roomCode } })
}

function listCalls(app) {
  return app.cloud.calls.filter(call => call.name === 'dataOp' && call.data.action === 'list')
}

function marked(app, page, marker) {
  return app.rendered(page).days.filter(day => day[marker]).map(day => day.date)
}

// Room A as Home first reads it: paired, one period and one memory, both with an author.
async function launchRoomA(app) {
  listRoute(app, 'periods', A).reply(listed([period('a-p', '2026-06-01', { createdByMe: true })], 'paired'))
  listRoute(app, 'memories', A).reply(listed([memory('a-m', '2026-06-02', { createdByMe: false })], 'paired'))
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-01'])
  assert.deepEqual(marked(app, home, 'isMemory'), ['2026-06-02'])
  return home
}

async function dayAuthors(app, page, date) {
  await app.dispatch(page, 'onDayTap', { currentTarget: { dataset: { date } } })
  await app.settle()
  const detail = app.rendered(page).selectedDayDetail
  return [...detail.periods, ...detail.memories].map(item => item.authorLabel || '')
}

test('a new Home instance shows the shared records at once and refreshes them silently', async t => {
  const app = homeApp(t)
  listRoute(app, 'periods', A).reply(listed([period('a-p', '2026-06-01')]))
  listRoute(app, 'memories', A).reply(listed([memory('a-m', '2026-06-02')]))
  app.launch('/pages/index/index')
  await app.settle()
  const periods = listRoute(app, 'periods', A).defer()
  const memories = listRoute(app, 'memories', A).defer()
  const home = app.launch('/pages/index/index')
  await app.settle()
  assert.equal(listCalls(app).length, 4)
  assert.equal(app.rendered(home).hasLoadedHomeData, true)
  assert.equal(app.rendered(home).loading, false)
  assert.equal(app.rendered(home).refreshing, true)
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-01'])
  assert.deepEqual(marked(app, home, 'isMemory'), ['2026-06-02'])

  periods.resolve(listed([period('a-p2', '2026-06-20')]))
  memories.resolve(listed([]))
  await app.settle()
  assert.equal(app.rendered(home).refreshing, false)
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])
  assert.deepEqual(marked(app, home, 'isMemory'), [])
})

for (const rebound of [null, B]) {
  test(`after Settings clears the local room code and the device holds ${rebound ? 'another Room' : 'no Room'}, Home shows none of the previous Room`, async t => {
    const app = homeApp(t)
    const home = await launchRoomA(app)
    app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: A, status: 'paired' } })
    app.wx.switchTab({ url: '/pages/settings/settings' })
    await app.settle()
    app.cloud.when('getMyRoom').reply({ code: 0, room: rebound && { roomCode: rebound, status: 'waiting' } })
    if (rebound) {
      // The other Room's memories fail to read: its unsynced collection must not fall back to Room A's.
      listRoute(app, 'periods', rebound).reply(listed([period('b-p', '2026-06-20', { createdByMe: true })]))
      listRoute(app, 'memories', rebound).reject(new Error('network down'))
    }
    app.respondNext('showModal', { confirm: true })
    await app.dispatch(app.currentPage, 'clearData')
    await app.settle()
    assert.equal(app.storage.roomCode, rebound || undefined)

    app.wx.switchTab({ url: '/pages/index/index' })
    await app.settle()
    assert.equal(app.currentPage, home)
    assert.deepEqual(marked(app, home, 'isMemory'), [])
    if (rebound) {
      assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])
      assert.equal(app.rendered(home).monthSummaryLine, '本月 经期 1 天 · 欢乐时光未同步')
      // The other Room brought back no pairing, so Room A's pairing does not name the author.
      assert.deepEqual(await dayAuthors(app, home, '2026-06-20'), [''])
    } else {
      assert.deepEqual(marked(app, home, 'isPeriod'), [])
      assert.equal(app.rendered(home).noRoom, true)
      assert.equal(app.rendered(home).roomStatusTitle, '还没绑定房间')
    }
  })
}

function tabShowsRoomA(patch) {
  const rows = [...(patch.periods || []), ...(patch.memoryGroups || []).flatMap(group => group.records)]
  return rows.some(row => row._id === 'a-p' || row._id === 'a-m')
}

// #194: the record tab lives on as a tab page while Settings moves the device to another Room.
test('a live record tab shows none of the previous Room once the device holds another Room, with that Room\'s memories failing', async t => {
  const app = homeApp(t)
  await launchRoomA(app)
  app.wx.switchTab({ url: '/pages/period/period' })
  await app.settle()
  const tab = app.currentPage
  assert.deepEqual(app.rendered(tab).periods.map(row => [row._id, row.authorLabel]), [['a-p', '我记的']])
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: A, status: 'paired' } })
  app.wx.switchTab({ url: '/pages/settings/settings' })
  await app.settle()
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: B, status: 'waiting' } })
  listRoute(app, 'periods', B).reply(listed([period('b-p', '2026-06-20', { createdByMe: true })]))
  listRoute(app, 'memories', B).reject(new Error('network down'))
  app.respondNext('showModal', { confirm: true })
  await app.dispatch(app.currentPage, 'clearData')
  await app.settle()
  assert.equal(app.storage.roomCode, B)

  const before = tab.setDataCalls.length
  const modals = app.wx.modals.length
  app.wx.switchTab({ url: '/pages/period/period' })
  await app.settle()
  assert.equal(app.currentPage, tab)
  const view = app.rendered(tab)
  // Room B brought back no pairing, so Room A's pairing does not name the author either.
  assert.deepEqual(view.periods.map(row => [row._id, row.authorLabel]), [['b-p', undefined]])
  assert.deepEqual(view.memoryGroups, [])
  assert.equal(view.memoryLoadFailed, true)
  assert.equal(view.memoryHasLoaded, false)
  assert.deepEqual(app.wx.modals.slice(modals), [], 'the failed memories prompt nothing')
  assert.deepEqual(tab.setDataCalls.slice(before).filter(tabShowsRoomA), [], 'no frame of the tab carries Room A')
})

// Settings unbind: the server leave succeeds and the app relaunches on the bind page, unbound.
// Settings looks Room A up on show; `status` is the pairing that lookup sees.
async function leaveFromSettings(app, status = 'paired') {
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: A, status } })
  app.wx.switchTab({ url: '/pages/settings/settings' })
  await app.settle()
  app.cloud.when('leaveRoom').reply({ code: 0 })
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  app.respondNext('showModal', { confirm: true })
  await app.dispatch(app.currentPage, 'unbind')
  await app.settle()
  assert.equal(app.currentPage.route, 'pages/bind/bind')
  assert.equal(app.storage.roomCode, undefined)
  return app.currentPage
}

// Create or join Room B on the bind page and enter Home the way a member does.
async function enterRoomB(app, bind, entry) {
  if (entry === 'createRoom') {
    app.cloud.when('createRoom').reply({ code: 0, room: { roomCode: B } })
    await app.dispatch(bind, 'createRoom')
    await app.settle()
    await app.dispatch(bind, 'goHome')
  } else {
    app.cloud.when('joinRoom').reply({ code: 0, roomCode: B })
    await app.dispatch(bind, 'switchTab', { currentTarget: { dataset: { tab: 'join' } } })
    await app.dispatch(bind, 'onCodeInput', { detail: { value: B } })
    await app.dispatch(bind, 'joinRoom')
  }
  await app.settle()
  assert.equal(app.currentPage.route, 'pages/index/index')
  assert.equal(app.storage.roomCode, B)
  return app.currentPage
}

function showsRoomA(patch) {
  return (patch.days || []).some(day => (day.isPeriod && day.date === '2026-06-01') || (day.isMemory && day.date === '2026-06-02'))
}

for (const [entry, failed] of [['createRoom', 'memories'], ['joinRoom', 'periods']]) {
  test(`after Room leave and ${entry === 'createRoom' ? 'creating' : 'joining'} another Room, Home never shows the previous Room, with the new Room's ${failed} failing`, async t => {
    const app = homeApp(t)
    const previous = await launchRoomA(app)
    const bind = await leaveFromSettings(app)
    const previousRenders = previous.setDataCalls.length
    listRoute(app, 'periods', B).reply(listed([period('b-p', '2026-06-20', { createdByMe: true })]))
    listRoute(app, 'memories', B).reply(listed([memory('b-m', '2026-06-12', { createdByMe: true })]))
    listRoute(app, failed, B).reject(new Error('network down'))
    const home = await enterRoomB(app, bind, entry)
    assert.notEqual(home, previous)
    assert.deepEqual(marked(app, home, 'isPeriod'), failed === 'periods' ? [] : ['2026-06-20'])
    assert.deepEqual(marked(app, home, 'isMemory'), failed === 'memories' ? [] : ['2026-06-12'])
    assert.equal(app.rendered(home).monthSummaryLine, failed === 'periods'
      ? '本月 经期未同步 · 欢乐时光 1 条' : '本月 经期 1 天 · 欢乐时光未同步')
    assert.deepEqual(home.setDataCalls.filter(showsRoomA), [], 'no frame of the new Home carries Room A')
    // Room A's pairing went with its records: Room B brought back none, so no author is named.
    assert.deepEqual(await dayAuthors(app, home, failed === 'periods' ? '2026-06-12' : '2026-06-20'), [''])
    assert.equal(previous.setDataCalls.length, previousRenders, 'the unloaded Home no longer renders')
  })
}

test('a load still in flight for the previous Room is not shared with the next Room and never lands in it', async t => {
  const app = homeApp(t)
  listRoute(app, 'periods', A).reply(listed([period('a-p', '2026-06-01', { createdByMe: true })], 'waiting'))
  listRoute(app, 'memories', A).reply(listed([memory('a-m', '2026-06-02', { createdByMe: false })], 'waiting'))
  app.launch('/pages/index/index')
  await app.settle()
  // A silent refresh of Room A still waits for both lists when the member leaves.
  const latePeriods = listRoute(app, 'periods', A).defer()
  const lateMemories = listRoute(app, 'memories', A).defer()
  app.hide()
  app.show()
  await app.settle()
  const bind = await leaveFromSettings(app, 'waiting')
  listRoute(app, 'periods', B).reply(listed([period('b-p', '2026-06-20', { createdByMe: true })], 'waiting'))
  listRoute(app, 'memories', B).reply(listed([], 'waiting'))
  const home = await enterRoomB(app, bind, 'joinRoom')
  assert.deepEqual(listCalls(app).slice(-2).map(call => call.data.roomCode), [B, B])
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])

  // Room A answers late, now paired and with one more record: none of it lands, nobody announces TA.
  latePeriods.resolve(listed([period('a-p', '2026-06-01'), period('a-late', '2026-06-15')], 'paired'))
  lateMemories.resolve(listed([memory('a-m', '2026-06-02')], 'paired'))
  await app.settle()
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])
  assert.deepEqual(marked(app, home, 'isMemory'), [])
  assert.deepEqual(home.setDataCalls.filter(showsRoomA), [])
  assert.deepEqual(await dayAuthors(app, home, '2026-06-20'), [''])
  assert.equal(app.wx.toasts.some(toast => toast.title === 'TA 已加入'), false)
})

test('a save that lands after the device moved to another Room drops the previous Room and keeps the saved record', async t => {
  const app = homeApp(t)
  const home = await launchRoomA(app)
  await app.dispatch(home, 'quickMemory')
  const edit = app.currentPage
  // While the editor is open, another flow leaves this device holding Room B.
  app.wx.setStorageSync('roomCode', B)
  const saved = memory('b-saved', '2026-06-26', { note: '测试新记录', createdByMe: true })
  app.cloud.when({ name: 'dataOp', data: { action: 'add', collection: 'memories', roomCode: B } }).reply({ code: 0, id: saved._id, record: saved })
  const periods = listRoute(app, 'periods', B).defer()
  listRoute(app, 'memories', B).reply(listed([saved]))
  await app.dispatch(edit, 'onNoteInput', { detail: { value: saved.note } })
  await app.dispatch(edit, 'save')
  await app.advance(1000)
  assert.equal(app.currentPage, home)
  assert.deepEqual(marked(app, home, 'isPeriod'), [])
  assert.deepEqual(marked(app, home, 'isMemory'), ['2026-06-26'])

  periods.resolve(listed([period('b-p', '2026-06-20')]))
  await app.settle()
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])
  assert.deepEqual(marked(app, home, 'isMemory'), ['2026-06-26'])
  assert.deepEqual(listCalls(app).slice(-2).map(call => call.data.roomCode), [B, B])
})

test('records Home read after its own Room lookup belong to the Room the lookup found, so the next show refreshes them silently', async t => {
  const app = homeApp(t)
  const home = await launchRoomA(app)
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: A, status: 'paired' } })
  app.wx.switchTab({ url: '/pages/settings/settings' })
  await app.settle()
  // Settings clears the local room code while the server has no Room for this member.
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  app.respondNext('showModal', { confirm: true })
  await app.dispatch(app.currentPage, 'clearData')
  await app.settle()
  assert.equal(app.storage.roomCode, undefined)

  // By the time Home shows, the member is in Room B, which Home's load finds with no local room code.
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: B, status: 'waiting' } })
  listRoute(app, 'periods', B).reply(listed([period('b-p', '2026-06-20')]))
  listRoute(app, 'memories', B).reply(listed([memory('b-m', '2026-06-12')]))
  app.wx.switchTab({ url: '/pages/index/index' })
  await app.settle()
  assert.equal(app.storage.roomCode, B)
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])
  assert.deepEqual(marked(app, home, 'isMemory'), ['2026-06-12'])

  const periods = listRoute(app, 'periods', B).defer()
  const memories = listRoute(app, 'memories', B).defer()
  app.hide()
  app.show()
  await app.settle()
  assert.equal(app.rendered(home).loading, false)
  assert.equal(app.rendered(home).refreshing, true)
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])
  assert.deepEqual(marked(app, home, 'isMemory'), ['2026-06-12'])
  periods.resolve(listed([period('b-p', '2026-06-20')]))
  memories.resolve(listed([memory('b-m', '2026-06-12')]))
  await app.settle()
  assert.equal(app.rendered(home).refreshing, false)
  assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])
})

for (const [repair, rebound, title] of [
  [{ code: 0, room: { roomCode: B, status: 'waiting' } }, B, '房间状态已更新'],
  [{ code: 0, room: null }, undefined, '房间状态已变化']
]) {
  test(`a Room repair that leaves the device ${rebound ? 'in another Room' : 'without a Room'} keeps nothing of the previous Room behind the Room status`, async t => {
    const app = homeApp(t)
    const home = await launchRoomA(app)
    // Room A refuses its lists as stale; the repair finds where this member is now.
    listRoute(app, 'periods', A).reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
    listRoute(app, 'memories', A).reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED' })
    app.cloud.when('getMyRoom').reply(repair)
    app.hide()
    app.show()
    await app.settle()
    assert.equal(app.storage.roomCode, rebound)
    assert.equal(app.rendered(home).noRoom, true)
    assert.equal(app.rendered(home).roomStatusTitle, title)
    assert.deepEqual(marked(app, home, 'isPeriod'), [])
    assert.deepEqual(marked(app, home, 'isMemory'), [])
    if (!rebound) return

    listRoute(app, 'periods', B).reply(listed([period('b-p', '2026-06-20')]))
    listRoute(app, 'memories', B).reply(listed([]))
    await app.dispatch(home, 'handleRoomStatusAction')
    await app.settle()
    assert.equal(app.rendered(home).noRoom, false)
    assert.deepEqual(marked(app, home, 'isPeriod'), ['2026-06-20'])
    assert.deepEqual(marked(app, home, 'isMemory'), [])
  })
}
