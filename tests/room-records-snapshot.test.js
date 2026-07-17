const assert = require('node:assert/strict')
const test = require('node:test')

const {
  loadExportRecordsSnapshot,
  loadHomeRecordsSnapshot
} = require('../utils/roomRecordsSnapshot')

test('loadHomeRecordsSnapshot returns both room-scoped record collections on success', async () => {
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1', startDate: '2026-07-01' }],
    memories: [{ _id: 'm1', date: '2026-07-02' }]
  })

  const snapshot = await loadHomeRecordsSnapshot({ client })

  assert.equal(snapshot.kind, 'success')
  assert.deepEqual(snapshot.periods, [{ _id: 'p1', startDate: '2026-07-01' }])
  assert.deepEqual(snapshot.memories, [{ _id: 'm1', date: '2026-07-02' }])
  assert.deepEqual(client.calls, [
    { action: 'list', collection: 'periods' },
    { action: 'list', collection: 'memories' }
  ])
})

test('loadHomeRecordsSnapshot requires RoomDataClient instead of legacy cloud getters', async () => {
  await assert.rejects(
    () => loadHomeRecordsSnapshot({
      cloud: {
        async getPeriods() {
          return [{ _id: 'p1' }]
        },
        async getMemories() {
          return [{ _id: 'm1' }]
        }
      }
    }),
    /RoomDataClient is required/
  )
})

test('loadHomeRecordsSnapshot keeps partial-success semantics for retryable collection failures', async () => {
  const snapshot = await loadHomeRecordsSnapshot({
    client: createFakeRoomDataClient({
      periods: { kind: 'retryable-failure', message: 'network down' },
      memories: [{ _id: 'm1', date: '2026-07-02' }]
    })
  })

  assert.equal(snapshot.kind, 'partial-success')
  assert.deepEqual(snapshot.periods, [])
  assert.deepEqual(snapshot.memories, [{ _id: 'm1', date: '2026-07-02' }])
  assert.equal(snapshot.periodsOutcome.kind, 'retryable-failure')
  assert.equal(snapshot.memoriesOutcome.kind, 'success')
})

test('loadHomeRecordsSnapshot returns blocking room outcomes without hiding the cause', async () => {
  const noRoom = { kind: 'no-room' }
  const snapshot = await loadHomeRecordsSnapshot({
    client: createFakeRoomDataClient({
      periods: noRoom,
      memories: { kind: 'retryable-failure', message: 'network down' }
    })
  })

  assert.equal(snapshot.kind, 'blocked')
  assert.equal(snapshot.outcome, noRoom)
})

test('loadExportRecordsSnapshot requires both collections and stops after the first failure', async () => {
  const client = createFakeRoomDataClient({
    periods: { kind: 'retryable-failure', message: 'network down' },
    memories: [{ _id: 'm1' }]
  })

  const snapshot = await loadExportRecordsSnapshot({ client })

  assert.equal(snapshot.kind, 'failure')
  assert.deepEqual(snapshot.outcome, { kind: 'retryable-failure', message: 'network down' })
  assert.deepEqual(client.calls, [
    { action: 'list', collection: 'periods' }
  ])
})

test('loadExportRecordsSnapshot returns an all-or-nothing backup payload source', async () => {
  const client = createFakeRoomDataClient({
    periods: [{ _id: 'p1' }],
    memories: [{ _id: 'm1' }]
  })

  const snapshot = await loadExportRecordsSnapshot({ client })

  assert.equal(snapshot.kind, 'success')
  assert.deepEqual(snapshot.periods, [{ _id: 'p1' }])
  assert.deepEqual(snapshot.memories, [{ _id: 'm1' }])
  assert.deepEqual(client.calls, [
    { action: 'list', collection: 'periods' },
    { action: 'list', collection: 'memories' }
  ])
})

function createFakeRoomDataClient(results = {}) {
  return {
    calls: [],
    async list(collection) {
      this.calls.push({ action: 'list', collection })
      const result = typeof results[collection] === 'function'
        ? results[collection]()
        : results[collection]
      if (result && result.kind) return result
      return { kind: 'success', data: result || [] }
    }
  }
}
