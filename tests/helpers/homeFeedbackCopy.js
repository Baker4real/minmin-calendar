const { createMiniProgram } = require('./miniProgram')

// Geometry guards measure actual rendered copy from the same platform seam as
// the page tests. No source scans or duplicated list of production sentences.
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
      await capture()
      routes[failed].reply({ code: 0, data: [] })
      await home.onPullDownRefresh()
      await capture()
      const saved = failed === 'periods'
        ? { _id: 'p1', startDate: '2026-06-20', endDate: '2026-06-22', status: 'known-end' }
        : { _id: 'm1', date: '2026-06-20', note: '' }
      home.applyRecordChange({ collection: failed, mode: 'add', record: saved })
      await capture()
      routes[failed].reply({ code: 0, data: [saved] })
      await home.onPullDownRefresh()
      await capture()
      home.applyRecordChange({ collection: failed, mode: 'update', record: { ...saved, note: '补一句' } })
      routes[failed].reject(new Error('network unavailable'))
      await home.onPullDownRefresh()
      await capture()
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
