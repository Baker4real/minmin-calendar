// 驱动记录页面的测试共用工具：云端 list 回复、list 与 Room 查询的调用、日历上带某个数据标记的日期，
// 以及在真实编辑页里确认一次保存或删除。list 路由按各文件要匹配的房间码自己写，不放在这里。

// dataOp list 的回复。每次 list 都带回 Room 的配对状态（#191）；不给状态（null 或 undefined）代表不带它的旧版 dataOp
function listed(data, roomStatus) {
  return roomStatus === null || roomStatus === undefined ? { code: 0, data } : { code: 0, data, roomStatus }
}

function listCalls(app) {
  return app.cloud.calls.filter(call => call.name === 'dataOp' && call.data.action === 'list')
}

function roomLookups(app) {
  return app.cloud.calls.filter(call => call.name === 'getMyRoom').length
}

// 首页日历上带某个数据标记（isPeriod、isMemory 等）的日期
function markedDates(app, page, marker) {
  return app.rendered(page).days.filter(day => day[marker]).map(day => day.date)
}

const EDITOR_PAGES = { periods: 'period', memories: 'memory' }

// 编辑页的打开参数：新增不带 id，结束日期已知的经期不带 status
function editorQuery({ collection, mode, record }) {
  const fields = collection === 'memories'
    ? { date: record.date, note: record.note }
    : { startDate: record.startDate, endDate: record.endDate, status: record.status === 'known-end' ? '' : record.status }
  return new URLSearchParams(Object.entries({ id: mode === 'add' ? '' : record._id, ...fields }).filter(([, value]) => value)).toString()
}

// 在真实编辑页里确认一次保存或删除（#195：记录变化只从编辑页来），云端按 write 回复这条记录。
// 删除和云端合并到已有进行中（reopened）会先弹确认，这里替用户点确定。
async function confirmInEditor(app, change, { query = editorQuery(change), write = change.mode, reopened = false } = {}) {
  const { collection, mode, record } = change
  app.cloud.when({ name: 'dataOp', data: { action: write, collection } })
    .reply(mode === 'remove' ? { code: 0 } : { code: 0, id: record._id, record, ...(reopened ? { reopened } : {}) })
  app.wx.navigateTo({ url: `/pages/${EDITOR_PAGES[collection]}/edit/edit?${query}` })
  await app.settle()
  if (mode === 'remove' || reopened) app.respondNext('showModal', { confirm: true })
  await app.dispatch(app.currentPage, mode === 'remove' ? 'delete' : 'save')
  await app.settle()
}

module.exports = { confirmInEditor, listCalls, listed, markedDates, roomLookups }
