const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createDataOpHandler } = require('../cloudfunctions/dataOp/dataOpHandler')

test('dataOp handler rejects missing roomCode before record operations run', async () => {
  const harness = createHandlerHarness()

  const result = await harness.handler({
    action: 'list',
    collection: 'periods'
  })

  assert.deepEqual(result, { code: -1, msg: '缺少房间码' })
  assert.deepEqual(harness.records.calls, [])
  assert.deepEqual(harness.db.roomQueries, [])
})

test('dataOp handler rejects unsupported collections before room lookup', async () => {
  const harness = createHandlerHarness()

  const result = await harness.handler({
    action: 'list',
    collection: 'rooms',
    roomCode: 'room01'
  })

  assert.deepEqual(result, { code: -1, msg: '不支持的数据集合' })
  assert.deepEqual(harness.records.calls, [])
  assert.deepEqual(harness.db.roomQueries, [])
})

test('dataOp handler allows creator and partner membership to dispatch record operations', async () => {
  const rooms = [
    {
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'creator-openid',
      partnerOpenid: 'partner-openid'
    }
  ]

  const creatorHarness = createHandlerHarness({
    openid: 'creator-openid',
    rooms
  })
  const partnerHarness = createHandlerHarness({
    openid: 'partner-openid',
    rooms
  })

  assert.deepEqual(
    await creatorHarness.handler({
      action: 'list',
      collection: 'periods',
      roomCode: 'room01'
    }),
    { code: 0, action: 'list' }
  )
  assert.deepEqual(
    await creatorHarness.handler({
      action: 'add',
      collection: 'memories',
      roomCode: 'room01',
      data: { note: 'hi' }
    }),
    { code: 0, action: 'add' }
  )
  assert.deepEqual(
    await partnerHarness.handler({
      action: 'update',
      collection: 'periods',
      roomCode: 'room01',
      id: 'p1',
      data: { note: 'updated' }
    }),
    { code: 0, action: 'update' }
  )
  assert.deepEqual(
    await partnerHarness.handler({
      action: 'remove',
      collection: 'memories',
      roomCode: 'room01',
      id: 'm1'
    }),
    { code: 0, action: 'remove' }
  )

  assert.deepEqual(creatorHarness.records.calls, [
    {
      method: 'list',
      args: { collection: 'periods', roomCode: 'ROOM01' }
    },
    {
      method: 'add',
      args: {
        collection: 'memories',
        roomCode: 'ROOM01',
        openid: 'creator-openid',
        data: { note: 'hi' }
      }
    }
  ])
  assert.deepEqual(partnerHarness.records.calls, [
    {
      method: 'update',
      args: {
        collection: 'periods',
        roomCode: 'ROOM01',
        id: 'p1',
        data: { note: 'updated' }
      }
    },
    {
      method: 'remove',
      args: {
        collection: 'memories',
        roomCode: 'ROOM01',
        id: 'm1'
      }
    }
  ])
  assert.equal(creatorHarness.db.roomQueries[0].roomCode, 'ROOM01')
  assert.equal(partnerHarness.db.roomQueries[0].roomCode, 'ROOM01')
})

test('dataOp handler rejects non-members without calling record operations', async () => {
  const harness = createHandlerHarness({
    openid: 'outsider-openid',
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'creator-openid',
        partnerOpenid: 'partner-openid'
      }
    ]
  })

  const result = await harness.handler({
    action: 'add',
    collection: 'periods',
    roomCode: 'room01',
    data: { startDate: '2026-06-10', endDate: '2026-06-12' }
  })

  assert.deepEqual(result, { code: -1, msg: '无权访问该房间' })
  assert.deepEqual(harness.records.calls, [])
})

test('dataOp handler rejects unknown action after successful room authorization', async () => {
  const harness = createHandlerHarness({
    openid: 'creator-openid',
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'creator-openid',
        partnerOpenid: 'partner-openid'
      }
    ]
  })

  const result = await harness.handler({
    action: 'archive',
    collection: 'periods',
    roomCode: 'room01'
  })

  assert.deepEqual(result, { code: -1, msg: '未知操作' })
  assert.deepEqual(harness.records.calls, [])
  assert.equal(harness.db.roomQueries.length, 1)
  assert.deepEqual(harness.db.roomQueries[0], {
    roomCode: 'ROOM01',
    createdBy: 'creator-openid'
  })
})

test('dataOp adapter keeps cloud runtime wiring in index and wx-server-sdk out of handler', () => {
  const handlerSource = fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'dataOp', 'dataOpHandler.js'),
    'utf8'
  )
  const indexSource = fs.readFileSync(
    path.join(__dirname, '..', 'cloudfunctions', 'dataOp', 'index.js'),
    'utf8'
  )

  assert.doesNotMatch(handlerSource, /wx-server-sdk/)
  assert.match(indexSource, /cloud\.init/)
  assert.match(indexSource, /exports\.main\s*=\s*createDataOpHandler/)
})

function createHandlerHarness(options = {}) {
  const db = createFakeDb({ rooms: options.rooms || [] })
  const records = createRecordsDouble()
  const handler = createDataOpHandler({
    getWXContext: () => ({ OPENID: options.openid || 'creator-openid' }),
    db,
    records
  })

  return { handler, db, records }
}

function createRecordsDouble() {
  const calls = []

  return {
    calls,
    async list(args) {
      calls.push({ method: 'list', args: clone(args) })
      return { code: 0, action: 'list' }
    },
    async add(args) {
      calls.push({ method: 'add', args: clone(args) })
      return { code: 0, action: 'add' }
    },
    async update(args) {
      calls.push({ method: 'update', args: clone(args) })
      return { code: 0, action: 'update' }
    },
    async remove(args) {
      calls.push({ method: 'remove', args: clone(args) })
      return { code: 0, action: 'remove' }
    }
  }
}

function createFakeDb(initial = {}) {
  const rooms = clone(initial.rooms || [])
  const roomQueries = []

  return {
    roomQueries,
    collection(name) {
      assert.equal(name, 'rooms')
      return {
        where(query) {
          roomQueries.push(clone(query))
          return createQuery(rooms, query)
        }
      }
    }
  }
}

function createQuery(records, query) {
  let limitCount = null

  const chain = {
    limit(count) {
      limitCount = count
      return chain
    },
    async get() {
      let result = records.filter(record =>
        Object.keys(query).every(key => record[key] === query[key])
      )
      if (limitCount !== null) result = result.slice(0, limitCount)
      return { data: clone(result) }
    }
  }

  return chain
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}
