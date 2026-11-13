const assert = require('node:assert/strict')
const test = require('node:test')

const { createDataOpHandler } = require('../cloudfunctions/dataOp/dataOpHandler')
const { createRoomRecords } = require('../cloudfunctions/dataOp/roomRecords')
const { createCloudDatabase } = require('./helpers/cloudDatabase')

// 云端 seam（#189 Testing Decisions）：从 dataOp 处理器进入，接上真实的记录逻辑；
// 数据库替身按平台读取行为建模（见 helpers/cloudDatabase.js），超过 100 条的截断在这里测得出来。
const MEMBER = 'member-a'
const PARTNER = 'member-b'
const ROOM = { _id: 'room-1', roomCode: 'ROOM01', createdBy: MEMBER, partnerOpenid: PARTNER, status: 'paired' }
const CREATED_AT = '2026-01-01T00:00:00.000Z'

test('dataOp list returns every one of 250 happy-time records in the Room, each id once', async () => {
  const memories = Array.from({ length: 250 }, (_, index) => memoryRecord(index))
  const otherRoom = [0, 1, 2].map(index => ({ ...memoryRecord(index), _id: `other-${index}`, roomCode: 'OTHER1' }))
  const { handler } = createListHarness({ memories: [...otherRoom, ...memories] })

  const result = await handler({ action: 'list', collection: 'memories', roomCode: 'ROOM01' })

  assert.equal(result.code, 0)
  const ids = result.data.map(record => record._id)
  assert.equal(ids.length, 250)
  assert.equal(new Set(ids).size, 250)
  assert.deepEqual([...ids].sort(), memories.map(record => record._id).sort())
})

test('dataOp list keeps same-date records that straddle a page boundary, each once, newest date first then by id', async () => {
  // 第 990–1009 条同一天，排序后正好跨过一次读取的 1000 条上限；按日期倒序、再按标识，结果就是编号顺序
  const sharedDate = daysBefore(990)
  const memories = Array.from({ length: 1010 }, (_, index) =>
    memoryRecord(index, { date: index >= 990 ? sharedDate : daysBefore(index) })
  )
  const { handler } = createListHarness({ memories: [...memories].reverse() })

  const result = await handler({ action: 'list', collection: 'memories', roomCode: 'ROOM01' })

  assert.equal(result.code, 0)
  const ids = result.data.map(record => record._id)
  assert.equal(new Set(ids).size, ids.length, 'no record appears twice')
  assert.deepEqual(ids, Array.from({ length: 1010 }, (_, index) => memoryId(index)))
})

test('dataOp list fails as a whole when a later page read fails, returning none of the records already read', async () => {
  const memories = Array.from({ length: 1001 }, (_, index) => memoryRecord(index))
  const { handler } = createListHarness({
    memories,
    beforeGet({ collection, offset }) {
      if (collection === 'memories' && offset > 0) throw new Error('collection.get:fail page read failed')
    }
  })

  // 读取错误让这次云函数调用失败（与改动前任何读取出错时一样），客户端按可重试失败处理；第一页的 1000 条不会被当作结果返回
  await assert.rejects(
    handler({ action: 'list', collection: 'memories', roomCode: 'ROOM01' }),
    { message: 'collection.get:fail page read failed' }
  )
})

test('dataOp list answers the request shape published clients send with the unchanged client projection', async () => {
  const periods = [
    periodRecord('p-3', { createdBy: MEMBER, startDate: '2026-07-01', endDate: '2026-07-04', duration: 4 }),
    periodRecord('p-2', { createdBy: PARTNER, startDate: '2026-08-01', endDate: '2026-08-05', duration: 5, flow: 'heavy' }),
    periodRecord('p-1', { createdBy: MEMBER, startDate: '2026-08-01', endDate: '2026-08-03', duration: 3, symptoms: ['tired'] })
  ]
  const { handler } = createListHarness({ periods })

  // RoomDataClient 一直这样发 list：data 为空对象、id 为空串，房间码按本机缓存原样传
  const result = await handler({ action: 'list', collection: 'periods', data: {}, id: '', roomCode: 'room01' })

  assert.deepEqual(result, {
    code: 0,
    data: [
      {
        _id: 'p-1',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        status: 'known-end',
        note: '',
        duration: 3,
        flow: '',
        symptoms: ['tired'],
        createdByMe: true
      },
      {
        _id: 'p-2',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        status: 'known-end',
        note: '',
        duration: 5,
        flow: 'heavy',
        symptoms: [],
        createdByMe: false
      },
      {
        _id: 'p-3',
        startDate: '2026-07-01',
        endDate: '2026-07-04',
        status: 'known-end',
        note: '',
        duration: 4,
        flow: '',
        symptoms: [],
        createdByMe: true
      }
    ]
  })
})

function createListHarness({ openid = MEMBER, rooms = [ROOM], periods = [], memories = [], beforeGet } = {}) {
  const db = createCloudDatabase({ rooms, periods, memories }, { beforeGet })
  const records = createRoomRecords({
    db,
    serverDate: () => ({ serverDate: true }),
    today: '2026-09-29',
    getOpenid: () => openid
  })
  const handler = createDataOpHandler({ getWXContext: () => ({ OPENID: openid }), db, records })
  return { handler, db }
}

// 第 index 条记录的日期比 2026-01-01 早 index 天：编号越大越早
function memoryRecord(index, { date = daysBefore(index) } = {}) {
  return {
    _id: memoryId(index),
    roomCode: 'ROOM01',
    createdBy: index % 2 ? PARTNER : MEMBER,
    createdAt: CREATED_AT,
    date,
    note: ''
  }
}

function periodRecord(id, fields) {
  return {
    _id: id,
    roomCode: 'ROOM01',
    createdAt: CREATED_AT,
    status: 'known-end',
    note: '',
    flow: '',
    symptoms: [],
    ...fields
  }
}

function memoryId(index) {
  return `m-${String(index).padStart(4, '0')}`
}

function daysBefore(days) {
  return new Date(Date.UTC(2026, 0, 1) - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
