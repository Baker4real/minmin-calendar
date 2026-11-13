const { createMiniProgram } = require('./miniProgram')
const { confirmInEditor } = require('./recordPages')

// Geometry guards measure actual rendered copy from the same platform seam as
// the page tests. No source scans or duplicated list of production sentences.
// Records change only through confirmed saves in real editors opened from Home (#195).
async function homeFeedbackCopy() {
  const retryCopies = new Set()
  const statuses = new Set()
  for (const failed of ['periods', 'memories']) {
    const app = createMiniProgram({ storage: { roomCode: 'ROOM01' } })
    try {
      app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
      const routes = Object.fromEntries(['periods', 'memories'].map(collection => [collection,
        app.cloud.when({ name: 'dataOp', data: { action: 'list', collection } }).reply({ code: 0, data: [] })]))
      routes[failed].reject(new Error('network unavailable'))
      const home = app.launch('/pages/index/index')
      const capture = async () => {
        await app.settle()
        const data = app.rendered(home)
        if (data.refreshRetryVisible) retryCopies.add(data.refreshRetryText)
        if (data.syncStatusMounted && data.syncStatusText) statuses.add(data.syncStatusText)
      }
      // Save in a real editor opened from Home: Home stays hidden, then shows and refreshes when it returns.
      const saveInEditor = async (record, query) => {
        await confirmInEditor(app, { collection: failed, mode: query.has('id') ? 'update' : 'add', record }, { query })
        await capture()
      }
      const returnHome = async () => {
        await app.advance(1000)
        await capture()
      }
      await capture()
      routes[failed].reply({ code: 0, data: [] })
      await home.onPullDownRefresh()
      await capture()
      const saved = failed === 'periods'
        ? { _id: 'p1', startDate: '2026-06-20', endDate: '2026-06-22', status: 'known-end' }
        : { _id: 'm1', date: '2026-06-20', note: '' }
      const fields = failed === 'periods' ? { startDate: saved.startDate, endDate: saved.endDate } : { date: saved.date }
      await saveInEditor(saved, new URLSearchParams(fields))
      routes[failed].reply({ code: 0, data: [saved] })
      await returnHome()
      await saveInEditor({ ...saved, note: '补一句' }, new URLSearchParams({ id: saved._id, ...fields, note: '补一句' }))
      routes[failed].reject(new Error('network unavailable'))
      await returnHome()
      routes[failed === 'periods' ? 'memories' : 'periods'].reject(new Error('network unavailable'))
      await home.onPullDownRefresh()
      await capture()
    } finally {
      app.teardown()
    }
  }
  return { retryCopies: [...retryCopies], statuses }
}

module.exports = { homeFeedbackCopy }
