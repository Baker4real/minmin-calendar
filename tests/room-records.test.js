const assert = require('node:assert/strict')
const test = require('node:test')

const { createRoomRecords } = require('../cloudfunctions/dataOp/roomRecords')

const SERVER_DATE = { serverDate: true }

test('RoomRecords add stores a normalized Period record for the active Room', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      _id: 'client-id',
      roomCode: 'OTHER',
      createdBy: 'attacker',
      createdAt: 'old',
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      duration: 99,
      note: 'need rest',
      flow: 'heavy',
      symptoms: ['cramps', 'unknown', 'cramps', 'headache']
    }
  })

  assert.deepEqual(result, {
    code: 0,
    id: 'periods-1',
    record: {
      _id: 'periods-1',
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      note: 'need rest',
      duration: 3,
      flow: 'heavy',
      symptoms: ['cramps', 'headache']
    }
  })
  assert.deepEqual(db.data.periods, [
    {
      _id: 'periods-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdAt: SERVER_DATE,
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      note: 'need rest',
      duration: 3,
      flow: 'heavy',
      symptoms: ['cramps', 'headache']
    }
  ])
})

test('RoomRecords add returns the canonical Period record that was persisted', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })
  const longNote = 'x'.repeat(505)

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      note: longNote,
      duration: 99,
      flow: 'heavy',
      symptoms: ['cramps', 'cramps', 'unknown']
    }
  })

  assert.equal(result.code, 0)
  assert.equal(result.id, 'periods-1')
  assert.deepEqual(result.record, {
    _id: 'periods-1',
    startDate: '2026-06-10',
    endDate: '2026-06-12',
    note: 'x'.repeat(500),
    duration: 3,
    flow: 'heavy',
    symptoms: ['cramps']
  })
  assert.deepEqual(pickClientRecord(db.data.periods[0]), result.record)
})

test('RoomRecords rejects unknown Period record fields before writing', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      startDate: '2026-06-10',
      endDate: '2026-06-12',
      unexpected: true
    }
  })

  assert.equal(result.code, -1)
  assert.match(result.msg, /不支持的字段: unexpected/)
  assert.deepEqual(db.data.periods, [])
})

test('RoomRecords rejects invalid Period record date ranges before updating', async () => {
  const db = createFakeDb({
    periods: [
      { _id: 'p1', roomCode: 'ROOM01', startDate: '2026-06-10', endDate: '2026-06-12', duration: 3 }
    ]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.update({
    collection: 'periods',
    roomCode: 'ROOM01',
    id: 'p1',
    data: {
      startDate: '2026-06-13',
      endDate: '2026-06-12'
    }
  })

  assert.equal(result.code, -1)
  assert.equal(result.msg, '结束日期不能早于开始日期')
  assert.equal(db.data.periods[0].startDate, '2026-06-10')
})

test('RoomRecords update returns the canonical Memory record that was persisted', async () => {
  const db = createFakeDb({
    memories: [{ _id: 'm1', roomCode: 'ROOM01', date: '2026-06-20', note: 'old' }]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.update({
    collection: 'memories',
    roomCode: 'ROOM01',
    id: 'm1',
    data: { date: '2026-06-24', note: 'n'.repeat(503) }
  })

  assert.deepEqual(result, {
    code: 0,
    id: 'm1',
    record: {
      _id: 'm1',
      date: '2026-06-24',
      note: 'n'.repeat(500)
    }
  })
  assert.equal(db.data.memories[0].note.length, 500)
})

test('RoomRecords update returns canonical success when the SDK update result shape is unknown', async () => {
  const db = createFakeDb({
    memories: [{ _id: 'm1', roomCode: 'ROOM01', date: '2026-06-20', note: 'old' }]
  })
  db.setNextUpdateResult({})
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.update({
    collection: 'memories',
    roomCode: 'ROOM01',
    id: 'm1',
    data: { date: '2026-06-24', note: 'new' }
  })

  assert.deepEqual(result, {
    code: 0,
    id: 'm1',
    record: {
      _id: 'm1',
      date: '2026-06-24',
      note: 'new'
    }
  })
  assert.deepEqual(db.data.memories, [
    { _id: 'm1', roomCode: 'ROOM01', date: '2026-06-24', note: 'new' }
  ])
})

test('RoomRecords update treats unchanged canonical data as a successful no-op', async () => {
  const db = createFakeDb({
    memories: [{ _id: 'm1', roomCode: 'ROOM01', date: '2026-06-24', note: 'same' }]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.update({
    collection: 'memories',
    roomCode: 'ROOM01',
    id: 'm1',
    data: { date: '2026-06-24', note: 'same' }
  })

  assert.deepEqual(result, {
    code: 0,
    id: 'm1',
    record: {
      _id: 'm1',
      date: '2026-06-24',
      note: 'same'
    }
  })
  assert.deepEqual(db.data.memories, [
    { _id: 'm1', roomCode: 'ROOM01', date: '2026-06-24', note: 'same' }
  ])
})

test('RoomRecords update rejects a record deleted after the authorization lookup', async () => {
  const db = createFakeDb({
    memories: [{ _id: 'm1', roomCode: 'ROOM01', date: '2026-06-20', note: 'old' }],
    beforeUpdate({ records, id }) {
      const index = records.findIndex(record => record._id === id)
      if (index >= 0) records.splice(index, 1)
    }
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.update({
    collection: 'memories',
    roomCode: 'ROOM01',
    id: 'm1',
    data: { date: '2026-06-24', note: 'new' }
  })

  assert.deepEqual(result, { code: -1, msg: '记录不存在或无权修改' })
  assert.equal(Object.hasOwn(result, 'record'), false)
  assert.deepEqual(db.data.memories, [])
})

test('RoomRecords rejects impossible Period dates before writing', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      startDate: '2026-02-31',
      endDate: '2026-03-03'
    }
  })

  assert.equal(result.code, -1)
  assert.equal(result.msg, '经期开始日期格式不正确')
  assert.deepEqual(db.data.periods, [])
})

test('RoomRecords add stores a normalized Memory record for the active Room', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const result = await records.add({
    collection: 'memories',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      roomCode: 'OTHER',
      createdBy: 'attacker',
      date: '2026-06-24',
      note: 'anniversary'
    }
  })

  assert.deepEqual(result, {
    code: 0,
    id: 'memories-1',
    record: {
      _id: 'memories-1',
      date: '2026-06-24',
      note: 'anniversary'
    }
  })
  assert.deepEqual(db.data.memories, [
    {
      _id: 'memories-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdAt: SERVER_DATE,
      date: '2026-06-24',
      note: 'anniversary'
    }
  ])
})

test('RoomRecords blocks cross-Room updates and removes', async () => {
  const db = createFakeDb({
    memories: [
      { _id: 'm1', roomCode: 'OTHER', date: '2026-06-24', note: 'private' }
    ]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE })

  const update = await records.update({
    collection: 'memories',
    roomCode: 'ROOM01',
    id: 'm1',
    data: { date: '2026-06-25', note: 'changed' }
  })
  const remove = await records.remove({
    collection: 'memories',
    roomCode: 'ROOM01',
    id: 'm1'
  })

  assert.deepEqual(update, { code: -1, msg: '记录不存在或无权修改' })
  assert.deepEqual(remove, { code: -1, msg: '记录不存在或无权删除' })
  assert.deepEqual(db.data.memories, [
    { _id: 'm1', roomCode: 'OTHER', date: '2026-06-24', note: 'private' }
  ])
})

function createFakeDb(initial = {}) {
  const data = {
    periods: clone(initial.periods || []),
    memories: clone(initial.memories || [])
  }
  let hasNextUpdateResult = false
  let nextUpdateResult

  return {
    data,
    setNextUpdateResult(result) {
      hasNextUpdateResult = true
      nextUpdateResult = result
    },
    collection(name) {
      return createCollection(data, name, {
        beforeUpdate: initial.beforeUpdate,
        consumeUpdateResult(defaultResult) {
          if (!hasNextUpdateResult) return defaultResult
          hasNextUpdateResult = false
          return nextUpdateResult
        }
      })
    }
  }
}

function createCollection(allData, name, { beforeUpdate, consumeUpdateResult } = {}) {
  return {
    where(query) {
      return createQuery(allData[name], query)
    },
    async add({ data }) {
      const id = `${name}-${allData[name].length + 1}`
      allData[name].push({ _id: id, ...clone(data) })
      return { _id: id }
    },
    doc(id) {
      return {
        async update({ data }) {
          if (beforeUpdate) beforeUpdate({ records: allData[name], id })
          const record = allData[name].find(item => item._id === id)
          const changed = record && Object.keys(data).some(key =>
            JSON.stringify(record[key]) !== JSON.stringify(data[key])
          )
          if (record) Object.assign(record, clone(data))
          return consumeUpdateResult({ stats: { updated: changed ? 1 : 0 } })
        },
        async remove() {
          const index = allData[name].findIndex(item => item._id === id)
          if (index >= 0) allData[name].splice(index, 1)
          return {}
        }
      }
    }
  }
}

function createQuery(records, query) {
  let limitCount = null
  let order = null

  const chain = {
    limit(count) {
      limitCount = count
      return chain
    },
    orderBy(field, direction) {
      order = { field, direction }
      return chain
    },
    async get() {
      let result = records.filter(record =>
        Object.keys(query).every(key => record[key] === query[key])
      )
      if (order) {
        result = [...result].sort((a, b) => {
          const comparison = String(a[order.field] || '').localeCompare(String(b[order.field] || ''))
          return order.direction === 'desc' ? -comparison : comparison
        })
      }
      if (limitCount !== null) result = result.slice(0, limitCount)
      return { data: clone(result) }
    }
  }

  return chain
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function pickClientRecord(record) {
  const { _id, startDate, endDate, note, duration, flow, symptoms } = record
  return { _id, startDate, endDate, note, duration, flow, symptoms }
}
