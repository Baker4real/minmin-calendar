const assert = require('node:assert/strict')
const test = require('node:test')

const { createRoomRecords, FLOW_VALUES, SYMPTOM_VALUES, PERIOD_STATUS_VALUES } = require('../cloudfunctions/dataOp/roomRecords')
const { FLOW_OPTIONS, SYMPTOM_OPTIONS, PERIOD_STATUS_OPTIONS } = require('../utils/cycle')

const SERVER_DATE = { serverDate: true }
const TODAY = '2026-09-29'

test('cycle module and cloud period copy allow the same flow and symptom values', () => {
  const flow = ['heavy', 'light', 'normal']
  const symptoms = ['acne', 'cramps', 'cravings', 'headache', 'mood', 'sleep', 'tired']

  assert.deepEqual(sortedAllowedValues(FLOW_OPTIONS), flow)
  assert.deepEqual(sortedAllowedValues(FLOW_VALUES), flow)
  assert.deepEqual(sortedAllowedValues(SYMPTOM_OPTIONS), symptoms)
  assert.deepEqual(sortedAllowedValues(SYMPTOM_VALUES), symptoms)
})

test('cycle module and cloud period copy allow the same three record statuses', () => {
  assert.deepEqual(sortedAllowedValues(PERIOD_STATUS_OPTIONS), ['known-end', 'ongoing', 'unknown-end'])
  assert.deepEqual(sortedAllowedValues(PERIOD_STATUS_VALUES), ['known-end', 'ongoing', 'unknown-end'])
})

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
      status: 'known-end',
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
      status: 'known-end',
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
    status: 'known-end',
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

test('RoomRecords add stores an ongoing Period with an empty end date and no invented duration', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      startDate: '2026-09-20',
      endDate: '',
      status: 'ongoing',
      duration: 99,
      note: '刚开始',
      flow: 'normal',
      symptoms: []
    }
  })

  assert.deepEqual(result, {
    code: 0,
    id: 'periods-1',
    record: {
      _id: 'periods-1',
      startDate: '2026-09-20',
      endDate: '',
      status: 'ongoing',
      note: '刚开始',
      duration: 0,
      flow: 'normal',
      symptoms: []
    }
  })
  assert.equal(db.data.periods.length, 1)
})

test('RoomRecords add stores an unknown-end Period without inventing an end date', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      startDate: '2026-09-20',
      status: 'unknown-end'
    }
  })

  assert.equal(result.code, 0)
  assert.deepEqual(pickClientRecord(db.data.periods[0]), result.record)
  assert.equal(result.record.status, 'unknown-end')
  assert.equal(result.record.endDate, '')
  assert.equal(result.record.duration, 0)
})

test('RoomRecords accepts a legacy write without status when an end date is present', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: {
      startDate: '2026-06-10',
      endDate: '2026-06-10',
      duration: 1
    }
  })

  // 旧客户端写入兼容：视为已知结束；起止同一天是合法单日已完成记录
  assert.equal(result.code, 0)
  assert.equal(result.record.status, 'known-end')
  assert.equal(result.record.duration, 1)
  assert.equal(result.record.endDate, '2026-06-10')
})

test('RoomRecords stores a legacy write without status or end date as unknown-end', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-06-10', duration: 9 }
  })

  // 旧写入缺 status 也缺结束日期：保守落为结束日期不详，不隐含进行中，也不发明结束日期
  assert.equal(result.code, 0)
  assert.equal(result.record.status, 'unknown-end')
  assert.equal(result.record.endDate, '')
  assert.equal(result.record.duration, 0)
  assert.deepEqual(pickClientRecord(db.data.periods[0]), result.record)
})

test('RoomRecords lists legacy records without a status unchanged and without backfill', async () => {
  const legacyPeriods = [
    { _id: 'legacy-1', roomCode: 'ROOM01', startDate: '2026-06-01', endDate: '2026-06-05', duration: 5 },
    { _id: 'legacy-2', roomCode: 'ROOM01', startDate: '2026-07-02', duration: 9 }
  ]
  const db = createFakeDb({ periods: legacyPeriods })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.list({ collection: 'periods', roomCode: 'ROOM01' })

  // 旧数据保守解释只发生在读取方：云端不删除、不补写 status 或结束日期、不擅自改成进行中
  // （periods 按开始日期倒序返回，记录内容保持原样）
  assert.equal(result.code, 0)
  assert.deepEqual(result.data, [legacyPeriods[1], legacyPeriods[0]])
  assert.deepEqual(db.data.periods, legacyPeriods)
})

test('RoomRecords rejects a known-end Period without a usable end date', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-20', endDate: '', status: 'known-end' }
  })

  assert.equal(result.code, -1)
  assert.equal(result.msg, '经期结束日期格式不正确')
  assert.deepEqual(db.data.periods, [])
})

test('RoomRecords rejects an unsupported Period status before writing', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-20', status: 'finished' }
  })

  assert.equal(result.code, -1)
  assert.equal(result.msg, '经期状态不正确')
  assert.deepEqual(db.data.periods, [])
})

test('RoomRecords rejects future start and end dates before writing', async () => {
  const db = createFakeDb()
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const futureStart = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-30', endDate: '2026-10-02', status: 'known-end' }
  })
  assert.equal(futureStart.code, -1)
  assert.equal(futureStart.msg, '开始日期不能晚于今天')

  const futureEnd = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-20', endDate: '2026-09-30', status: 'known-end' }
  })
  assert.equal(futureEnd.code, -1)
  assert.equal(futureEnd.msg, '结束日期不能晚于今天')

  const futureOngoingStart = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-30', status: 'ongoing' }
  })
  assert.equal(futureOngoingStart.code, -1)
  assert.equal(futureOngoingStart.msg, '开始日期不能晚于今天')

  assert.deepEqual(db.data.periods, [])
})

test('RoomRecords add reopens the existing ongoing record without overwriting its recorded data', async () => {
  const db = createFakeDb({
    periods: [
      {
        _id: 'p-ongoing',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdAt: '2026-09-20T00:00:00.000Z',
        startDate: '2026-09-18',
        endDate: '',
        status: 'ongoing',
        duration: 0,
        note: '第一天',
        flow: 'normal',
        symptoms: ['cramps']
      }
    ]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  // 携带过期列表数据的另一成员保存一张全默认的新增表单：
  // 不得把开始日期、备注、经量、症状写进原记录
  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-b',
    data: { startDate: '2026-09-25', endDate: '', status: 'ongoing', note: '', flow: '', symptoms: [] }
  })

  // 重复新增重开原记录：同一条 _id，不产生第二条进行中记录，已记录内容原样保留
  assert.equal(result.code, 0)
  assert.equal(result.id, 'p-ongoing')
  assert.equal(result.reopened, true)
  assert.deepEqual(result.record, {
    _id: 'p-ongoing',
    startDate: '2026-09-18',
    endDate: '',
    status: 'ongoing',
    note: '第一天',
    duration: 0,
    flow: 'normal',
    symptoms: ['cramps']
  })
  assert.deepEqual(pickClientRecord(db.data.periods[0]), result.record)
  assert.equal(db.data.periods.length, 1)
  assert.equal(db.data.periods.filter(record => record.status === 'ongoing').length, 1)
})

test('RoomRecords add converges to one ongoing record when a concurrent add races in', async () => {
  // 模拟并发：另一路写入在本次查询之后、插入之前先落了一条进行中记录
  const db = createFakeDb({
    beforeAdd({ records }) {
      records.push({
        _id: 'periods-1',
        roomCode: 'ROOM01',
        createdBy: 'user-b',
        createdAt: '2026-09-28T00:00:00.000Z',
        startDate: '2026-09-28',
        endDate: '',
        status: 'ongoing',
        duration: 0,
        note: '',
        flow: '',
        symptoms: []
      })
    }
  })
  const records = createRoomRecords({
    db,
    // 用可比较的服务端时间戳：本次写入比并发那条更晚，赢家应是更早的并发记录
    serverDate: () => '2026-09-29T08:00:00.000Z',
    today: TODAY
  })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-25', endDate: '', status: 'ongoing' }
  })
  assert.equal(result.code, 0)
  assert.equal(result.id, 'periods-1')
  assert.equal(result.reopened, true)
  // 收敛回并发赢家那条：它已记录的开始日期保持原样，不被本次表单覆盖
  assert.equal(result.record.startDate, '2026-09-28')
  assert.deepEqual(db.data.periods.map(record => record._id), ['periods-1'])
  assert.equal(db.data.periods.filter(record => record.status === 'ongoing').length, 1)
})

test('RoomRecords update converges when a concurrent update races into a second ongoing record', async () => {
  // 模拟竞态：预检查通过后、本次提交前，另一条记录被并发改成进行中
  let raceInjected = false
  const db = createFakeDb({
    periods: [
      {
        _id: 'p-old',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdAt: '2026-08-01T00:00:00.000Z',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        status: 'known-end',
        duration: 5,
        note: '',
        flow: '',
        symptoms: []
      },
      {
        _id: 'p-newer',
        roomCode: 'ROOM01',
        createdBy: 'user-b',
        createdAt: '2026-09-10T00:00:00.000Z',
        startDate: '2026-09-10',
        endDate: '2026-09-12',
        status: 'known-end',
        duration: 3,
        note: '',
        flow: '',
        symptoms: []
      }
    ],
    beforeUpdate({ records, id }) {
      if (raceInjected || id !== 'p-old') return
      raceInjected = true
      const concurrent = records.find(record => record._id === 'p-newer')
      concurrent.status = 'ongoing'
      concurrent.endDate = ''
      concurrent.duration = 0
    }
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  // 把更早创建的 p-old 改回进行中；并发方同时把 p-newer 改回进行中
  const result = await records.update({
    collection: 'periods',
    roomCode: 'ROOM01',
    id: 'p-old',
    data: { startDate: '2026-08-01', endDate: '', status: 'ongoing' }
  })

  // 确定性赢家是 createdAt 更早的 p-old：它保持进行中，p-newer 降为结束日期不详
  assert.equal(result.code, 0)
  assert.equal(result.id, 'p-old')
  const ongoing = db.data.periods.filter(record => record.status === 'ongoing')
  assert.deepEqual(ongoing.map(record => record._id), ['p-old'])
  const demoted = db.data.periods.find(record => record._id === 'p-newer')
  assert.equal(demoted.status, 'unknown-end')
  assert.equal(demoted.endDate, '')
  assert.equal(demoted.duration, 0)
})

test('RoomRecords update rejects and demotes its own write when it loses the ongoing race', async () => {
  // 同一竞态，但本次编辑的是较晚创建的那条：确定性赢家是并发方更早的记录
  let raceInjected = false
  const db = createFakeDb({
    periods: [
      {
        _id: 'p-old',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdAt: '2026-08-01T00:00:00.000Z',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        status: 'known-end',
        duration: 5,
        note: '',
        flow: '',
        symptoms: []
      },
      {
        _id: 'p-newer',
        roomCode: 'ROOM01',
        createdBy: 'user-b',
        createdAt: '2026-09-10T00:00:00.000Z',
        startDate: '2026-09-10',
        endDate: '2026-09-12',
        status: 'known-end',
        duration: 3,
        note: '',
        flow: '',
        symptoms: []
      }
    ],
    beforeUpdate({ records, id }) {
      if (raceInjected || id !== 'p-newer') return
      raceInjected = true
      const concurrent = records.find(record => record._id === 'p-old')
      concurrent.status = 'ongoing'
      concurrent.endDate = ''
      concurrent.duration = 0
    }
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.update({
    collection: 'periods',
    roomCode: 'ROOM01',
    id: 'p-newer',
    data: { startDate: '2026-09-10', endDate: '', status: 'ongoing' }
  })

  // 本次写入被降为结束日期不详，并按原冲突语义拒绝，指向仍进行中的记录
  assert.deepEqual(result, { code: -1, msg: '已有进行中的经期记录，请编辑原记录' })
  assert.equal(Object.hasOwn(result, 'record'), false)
  const ongoing = db.data.periods.filter(record => record.status === 'ongoing')
  assert.deepEqual(ongoing.map(record => record._id), ['p-old'])
  const demoted = db.data.periods.find(record => record._id === 'p-newer')
  assert.equal(demoted.status, 'unknown-end')
  assert.equal(demoted.endDate, '')
})

test('RoomRecords add heals a Room left with two ongoing records by an earlier race', async () => {
  const db = createFakeDb({
    periods: [
      {
        _id: 'p-first',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdAt: '2026-09-01T00:00:00.000Z',
        startDate: '2026-09-01',
        endDate: '',
        status: 'ongoing',
        duration: 0,
        note: '最早那条',
        flow: 'heavy',
        symptoms: ['headache']
      },
      {
        _id: 'p-second',
        roomCode: 'ROOM01',
        createdBy: 'user-b',
        createdAt: '2026-09-15T00:00:00.000Z',
        startDate: '2026-09-15',
        endDate: '',
        status: 'ongoing',
        duration: 0,
        note: '',
        flow: '',
        symptoms: []
      }
    ]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-29', endDate: '', status: 'ongoing' }
  })

  // 重开最早一条并清掉竞态残留的另一条：不插入新记录，不变量自愈回一条
  assert.equal(result.code, 0)
  assert.equal(result.id, 'p-first')
  assert.equal(result.reopened, true)
  assert.equal(result.record.startDate, '2026-09-01')
  assert.equal(result.record.note, '最早那条')
  assert.equal(db.data.periods.length, 2)
  const ongoing = db.data.periods.filter(record => record.status === 'ongoing')
  assert.deepEqual(ongoing.map(record => record._id), ['p-first'])
  const demoted = db.data.periods.find(record => record._id === 'p-second')
  assert.equal(demoted.status, 'unknown-end')
  assert.equal(demoted.endDate, '')
})

test('RoomRecords add keeps a concurrently completed record out of the ongoing demotion', async () => {
  // 快照读出两条进行中后、降级落库前，另一成员并发补填完成了输家那条：
  // 降级是条件更新（只打仍为进行中的记录），不得抹掉已提交的结束日期和时长
  const db = createFakeDb({
    periods: [
      {
        _id: 'p-first',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdAt: '2026-09-01T00:00:00.000Z',
        startDate: '2026-09-01',
        endDate: '',
        status: 'ongoing',
        duration: 0,
        note: '',
        flow: '',
        symptoms: []
      },
      {
        _id: 'p-second',
        roomCode: 'ROOM01',
        createdBy: 'user-b',
        createdAt: '2026-09-15T00:00:00.000Z',
        startDate: '2026-09-15',
        endDate: '',
        status: 'ongoing',
        duration: 0,
        note: '',
        flow: '',
        symptoms: []
      }
    ],
    beforeWhereUpdate({ records, query }) {
      if (query._id !== 'p-second') return
      const completed = records.find(record => record._id === 'p-second')
      completed.status = 'known-end'
      completed.endDate = '2026-09-20'
      completed.duration = 6
    }
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-29', endDate: '', status: 'ongoing' }
  })

  // 重开最早一条；并发补填完成的 p-second 保持 known-end 及其结束日期、时长
  assert.equal(result.code, 0)
  assert.equal(result.id, 'p-first')
  assert.equal(result.reopened, true)
  const completed = db.data.periods.find(record => record._id === 'p-second')
  assert.equal(completed.status, 'known-end')
  assert.equal(completed.endDate, '2026-09-20')
  assert.equal(completed.duration, 6)
  assert.deepEqual(
    db.data.periods.filter(record => record.status === 'ongoing').map(record => record._id),
    ['p-first']
  )
})

test('RoomRecords update keeps one ongoing record and still allows completing the same record', async () => {
  const db = createFakeDb({
    periods: [
      {
        _id: 'p1',
        roomCode: 'ROOM01',
        startDate: '2026-09-20',
        endDate: '',
        status: 'ongoing',
        duration: 0
      },
      {
        _id: 'p2',
        roomCode: 'ROOM01',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        status: 'known-end',
        duration: 5
      }
    ]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  // 把另一条已结束记录改回进行中：拒绝，指向原进行中记录
  const conflict = await records.update({
    collection: 'periods',
    roomCode: 'ROOM01',
    id: 'p2',
    data: { startDate: '2026-08-01', endDate: '', status: 'ongoing' }
  })
  assert.deepEqual(conflict, { code: -1, msg: '已有进行中的经期记录，请编辑原记录' })
  assert.equal(db.data.periods[1].status, 'known-end')

  // 在同一条进行中记录上补填结束日期：更新同一条并清除进行中状态，不建第二条
  const completed = await records.update({
    collection: 'periods',
    roomCode: 'ROOM01',
    id: 'p1',
    data: { startDate: '2026-09-20', endDate: '2026-09-24', status: 'known-end', flow: 'heavy' }
  })
  assert.equal(completed.code, 0)
  assert.equal(completed.id, 'p1')
  assert.deepEqual(pickClientRecord(db.data.periods[0]), {
    _id: 'p1',
    startDate: '2026-09-20',
    endDate: '2026-09-24',
    status: 'known-end',
    note: '',
    duration: 5,
    flow: 'heavy',
    symptoms: []
  })
  assert.equal(db.data.periods.length, 2)

  // 原进行中已完成后，新的进行中写入不再冲突
  const nextOngoing = await records.add({
    collection: 'periods',
    roomCode: 'ROOM01',
    openid: 'user-a',
    data: { startDate: '2026-09-27', endDate: '', status: 'ongoing' }
  })
  assert.equal(nextOngoing.code, 0)
  assert.equal(nextOngoing.reopened, undefined)
  assert.equal(db.data.periods.filter(record => record.status === 'ongoing').length, 1)
})

test('RoomRecords completes an unknown-end record with an exact duration on the same record', async () => {
  const db = createFakeDb({
    periods: [
      {
        _id: 'p-unknown',
        roomCode: 'ROOM01',
        startDate: '2026-08-01',
        endDate: '',
        status: 'unknown-end',
        duration: 0
      }
    ]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.update({
    collection: 'periods',
    roomCode: 'ROOM01',
    id: 'p-unknown',
    data: { startDate: '2026-08-01', endDate: '2026-08-04', status: 'known-end', flow: 'normal' }
  })

  // 补填结束日期：同一条记录转为已结束且有结束日期，获得精确时长，不建新记录
  assert.equal(result.code, 0)
  assert.equal(result.id, 'p-unknown')
  assert.deepEqual(pickClientRecord(db.data.periods[0]), {
    _id: 'p-unknown',
    startDate: '2026-08-01',
    endDate: '2026-08-04',
    status: 'known-end',
    note: '',
    duration: 4,
    flow: 'normal',
    symptoms: []
  })
  assert.equal(db.data.periods.length, 1)
})

test('RoomRecords accepts switching a known-end record to unknown-end and clears its end date', async () => {
  const db = createFakeDb({
    periods: [
      {
        _id: 'p-done',
        roomCode: 'ROOM01',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        status: 'known-end',
        duration: 5
      }
    ]
  })
  const records = createRoomRecords({ db, serverDate: () => SERVER_DATE, today: TODAY })

  const result = await records.update({
    collection: 'periods',
    roomCode: 'ROOM01',
    id: 'p-done',
    data: { startDate: '2026-06-01', endDate: '', status: 'unknown-end' }
  })

  // 清空结束日期必须带显式状态：旧结束日期不保留，时长归零，且不算进行中记录
  assert.equal(result.code, 0)
  assert.equal(result.record.status, 'unknown-end')
  assert.equal(result.record.endDate, '')
  assert.equal(result.record.duration, 0)
  assert.equal(db.data.periods.filter(record => record.status === 'ongoing').length, 0)
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
        beforeAdd: initial.beforeAdd,
        beforeWhereUpdate: initial.beforeWhereUpdate,
        consumeUpdateResult(defaultResult) {
          if (!hasNextUpdateResult) return defaultResult
          hasNextUpdateResult = false
          return nextUpdateResult
        }
      })
    }
  }
}

function createCollection(allData, name, { beforeUpdate, beforeAdd, beforeWhereUpdate, consumeUpdateResult } = {}) {
  return {
    where(query) {
      return createQuery(allData[name], query, { beforeWhereUpdate })
    },
    async add({ data }) {
      if (beforeAdd) beforeAdd({ records: allData[name], data })
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

function createQuery(records, query, { beforeWhereUpdate } = {}) {
  let limitCount = null
  let order = null

  const matches = record =>
    Object.keys(query).every(key => record[key] === query[key])

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
      let result = records.filter(matches)
      if (order) {
        result = [...result].sort((a, b) => {
          const comparison = String(a[order.field] || '').localeCompare(String(b[order.field] || ''))
          return order.direction === 'desc' ? -comparison : comparison
        })
      }
      if (limitCount !== null) result = result.slice(0, limitCount)
      return { data: clone(result) }
    },
    // 条件更新：服务端按当前数据匹配 where 后整批写入
    async update({ data }) {
      if (beforeWhereUpdate) beforeWhereUpdate({ records, query })
      const matched = records.filter(matches)
      matched.forEach(record => Object.assign(record, clone(data)))
      return { stats: { updated: matched.length } }
    }
  }

  return chain
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function sortedAllowedValues(values) {
  return [...values].map(item => item.value || item).sort()
}

function pickClientRecord(record) {
  const { _id, startDate, endDate, status, note, duration, flow, symptoms } = record
  return { _id, startDate, endDate, status, note, duration, flow, symptoms }
}
