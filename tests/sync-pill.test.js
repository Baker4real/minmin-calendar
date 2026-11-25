const assert = require('node:assert/strict')
const test = require('node:test')

const { syncPill } = require('../utils/syncPill')

function page() {
  return {
    data: {
      syncStatusVisible: false,
      syncStatusText: '',
      syncStatusMounted: false,
      syncStatusPhase: 'closed'
    },
    setData(patch) { Object.assign(this.data, patch) }
  }
}

test('shared sync pill owns the 1600ms result hold and the existing timed exit', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const view = page()
  const pill = syncPill(view)
  assert.equal(syncPill(view), pill, 'one page reuses one controller')

  pill.show('已同步')
  t.mock.timers.tick(0)
  assert.equal(view.data.syncStatusPhase, 'open')
  assert.equal(view.data.syncStatusText, '已同步')
  t.mock.timers.tick(1599)
  assert.equal(view.data.syncStatusPhase, 'open')
  t.mock.timers.tick(1)
  assert.equal(view.data.syncStatusPhase, 'leaving')
  assert.equal(view.data.syncStatusText, '已同步')
  t.mock.timers.tick(200)
  assert.equal(view.data.syncStatusMounted, false)
  assert.equal(view.data.syncStatusText, '')
})

test('shared sync pill clear cancels pending timers and dismisses its lifecycle', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const view = page()
  const pill = syncPill(view)
  pill.show('正在刷新', { autoHide: false })
  t.mock.timers.tick(0)
  pill.hide()
  pill.show('已同步')
  pill.clear()
  t.mock.timers.tick(5000)
  assert.equal(view.data.syncStatusMounted, false)
  assert.equal(view.data.syncStatusPhase, 'closed')
  assert.equal(view.data.syncStatusVisible, false)
  assert.equal(view.data.syncStatusText, '')
})
