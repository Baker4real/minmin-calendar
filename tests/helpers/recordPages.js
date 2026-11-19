// 驱动记录页面的测试共用工具：云端 list 回复、list 与 Room 查询的调用、日历上带某个数据标记的日期，
// 以及在真实编辑页里确认一次保存或删除。list 路由按各文件要匹配的房间码自己写，不放在这里。
const assert = require('node:assert/strict')

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

// 在真实编辑页里点共享面板的危险确认键；返回删除 Promise，调用方决定何时等待它。
async function confirmDelete(app, page = app.currentPage) {
  const pending = app.dispatch(page, 'delete')
  await app.settle()
  await app.dispatch(page, 'onConfirmationAction', { currentTarget: { dataset: { action: 'confirm' } } })
  await app.advance(200)
  await app.settle()
  return pending
}

// 在真实编辑页里确认一次保存或删除（#195：记录变化只从编辑页来），云端按 write 回复这条记录。
// 删除与开始日归属走共享面板；云端合并到已有进行中（reopened）的说明仍保留原生知悉弹窗。
async function confirmInEditor(app, change, { query = editorQuery(change), write = change.mode, reopened = false } = {}) {
  const { collection, mode, record } = change
  app.cloud.when({ name: 'dataOp', data: { action: write, collection } })
    .reply(mode === 'remove' ? { code: 0 } : { code: 0, id: record._id, record, ...(reopened ? { reopened } : {}) })
  app.wx.navigateTo({ url: `/pages/${EDITOR_PAGES[collection]}/edit/edit?${query}` })
  await app.settle()
  if (mode === 'remove') await confirmDelete(app)
  else {
    if (reopened) app.respondNext('showModal', { confirm: true })
    await app.dispatch(app.currentPage, 'save')
  }
  await app.settle()
}

const DATE_OPEN_HANDLERS = {
  onStartChange: 'openStartDatePicker',
  onEndChange: 'openEndDatePicker',
  onDateChange: 'openMemoryDatePicker'
}

// 通过真实三列滚轮选一个有效日期；非法或越界输入仍由各自的校验用例直接注入。
async function changeEditorDate(app, page, changeHandler, date) {
  await app.dispatch(page, DATE_OPEN_HANDLERS[changeHandler])
  await app.settle()
  const parts = date.split('-').map(Number)
  const columns = ['datePickerYears', 'datePickerMonths', 'datePickerDays']
  for (let column = 0; column < columns.length; column += 1) {
    const index = page.data[columns[column]].findIndex(item => item.value === parts[column])
    assert.ok(index >= 0, `${date} is selectable through ${columns[column]}`)
    const value = [...page.data.datePickerValue]
    value[column] = index
    await app.dispatch(page, 'onDatePickerChange', { detail: { value } })
  }
  assert.equal(page.data.datePickerDraft, date)
  await app.dispatch(page, 'onDatePickerConfirm')
  await app.advance(200)
}

module.exports = { changeEditorDate, confirmDelete, confirmInEditor, listCalls, listed, markedDates, roomLookups }
