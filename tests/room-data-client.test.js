const assert = require('node:assert/strict')
const test = require('node:test')

const cloudModule = require('../utils/cloud')
const { createInMemoryRoomResolver } = require('./helpers/inMemoryRoomResolver')
const { createRoomDataClient } = cloudModule

test('RoomDataClient list returns success data for the active room', async () => {
  const cloud = createFakeCloud([
    { result: { code: 0, data: [{ _id: 'p1', startDate: '2026-06-01' }] } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.list('periods')

  assert.deepEqual(outcome, {
    kind: 'success',
    data: [{ _id: 'p1', startDate: '2026-06-01' }],
    roomCode: 'ROOM01'
  })
  assert.deepEqual(cloud.calls, [{
    name: 'dataOp',
    data: {
      action: 'list',
      collection: 'periods',
      data: {},
      id: '',
      roomCode: 'ROOM01'
    }
  }])
})

for (const roomStatus of ['waiting', 'paired']) {
  test(`RoomDataClient list hands over the ${roomStatus} pairing status with the room code the list was read from`, async () => {
    const cloud = createFakeCloud([
      { result: { code: 0, roomStatus, data: [{ _id: 'm1', date: '2026-06-02', createdByMe: true }] } }
    ])
    const client = createRoomDataClient({ cloud, roomSession: createFakeRoomSession({ roomCode: ' room01 ' }) })

    const outcome = await client.list('memories')

    assert.deepEqual(outcome, {
      kind: 'success',
      data: [{ _id: 'm1', date: '2026-06-02', createdByMe: true }],
      roomCode: 'ROOM01',
      roomStatus
    })
  })
}

test('RoomDataClient list leaves the pairing status out when the cloud gives none or one it does not know', async () => {
  const unknownStatuses = [undefined, '', 'archived', 'PAIRED', 1, { status: 'paired' }]
  const cloud = createFakeCloud(unknownStatuses.map(roomStatus => ({ result: { code: 0, roomStatus, data: [] } })))
  const client = createRoomDataClient({ cloud, roomSession: createFakeRoomSession({ roomCode: 'ROOM01' }) })

  for (const roomStatus of unknownStatuses) {
    assert.deepEqual(await client.list('periods'), { kind: 'success', data: [], roomCode: 'ROOM01' }, `roomStatus ${JSON.stringify(roomStatus)}`)
  }
})

test('RoomDataClient lists records with an injected in-memory resolved room', async () => {
  const cloud = createFakeCloud([
    { result: { code: 0, data: [{ _id: 'p1', startDate: '2026-06-01' }] } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: '' })
  const resolver = createInMemoryRoomResolver({
    kind: 'resolved',
    roomCode: ' test01 '
  })
  const client = createRoomDataClient({ cloud, roomSession, resolver })

  const outcome = await client.list('periods')

  assert.deepEqual(outcome, {
    kind: 'success',
    data: [{ _id: 'p1', startDate: '2026-06-01' }],
    roomCode: 'TEST01'
  })
  assert.deepEqual(roomSession.activeRoomCalls, [])
  assert.deepEqual(cloud.calls, [{
    name: 'dataOp',
    data: {
      action: 'list',
      collection: 'periods',
      data: {},
      id: '',
      roomCode: 'TEST01'
    }
  }])
})

test('RoomDataClient maps an injected in-memory no-room resolution without calling dataOp', async () => {
  const cloud = createFakeCloud()
  const resolver = createInMemoryRoomResolver({ kind: 'no-room' })
  const client = createRoomDataClient({ cloud, resolver })

  const outcome = await client.list('memories')

  assert.deepEqual(outcome, { kind: 'no-room' })
  assert.deepEqual(cloud.calls, [])
})

test('RoomDataClient preserves an injected in-memory retryable resolution failure', async () => {
  const cloud = createFakeCloud()
  const resolver = createInMemoryRoomResolver({
    kind: 'retryable-failure',
    message: '同步房间状态失败：resolver unavailable'
  })
  const client = createRoomDataClient({ cloud, resolver })

  const outcome = await client.list('memories')

  assert.equal(outcome.kind, 'retryable-failure')
  assert.equal(outcome.message, '这次没有完成，请重试')
  assert.doesNotMatch(outcome.message, /resolver unavailable/)
  assert.deepEqual(cloud.calls, [])
})

test('RoomDataClient add, update, and remove return success outcomes with the server result', async () => {
  const cloud = createFakeCloud([
    {
      result: {
        code: 0,
        id: 'p1',
        record: {
          _id: 'p1',
          startDate: '2026-06-10',
          endDate: '2026-06-12',
          note: '',
          duration: 3,
          flow: '',
          symptoms: []
        }
      }
    },
    { result: { code: 0, updated: 1 } },
    { result: { code: 0, removed: 1 } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const addOutcome = await client.add('periods', { startDate: '2026-06-01' })
  const updateOutcome = await client.update('periods', 'p1', { note: 'updated' })
  const removeOutcome = await client.remove('periods', 'p1')

  assert.deepEqual(addOutcome, {
    kind: 'success',
    result: {
      code: 0,
      id: 'p1',
      record: {
        _id: 'p1',
        startDate: '2026-06-10',
        endDate: '2026-06-12',
        note: '',
        duration: 3,
        flow: '',
        symptoms: []
      }
    }
  })
  assert.deepEqual(addOutcome.result.record, {
    _id: 'p1',
    startDate: '2026-06-10',
    endDate: '2026-06-12',
    note: '',
    duration: 3,
    flow: '',
    symptoms: []
  })
  assert.deepEqual(updateOutcome, {
    kind: 'success',
    result: { code: 0, updated: 1 }
  })
  assert.deepEqual(removeOutcome, {
    kind: 'success',
    result: { code: 0, removed: 1 }
  })
  assert.deepEqual(cloud.calls, [
    {
      name: 'dataOp',
      data: {
        action: 'add',
        collection: 'periods',
        data: { startDate: '2026-06-01' },
        id: '',
        roomCode: 'ROOM01'
      }
    },
    {
      name: 'dataOp',
      data: {
        action: 'update',
        collection: 'periods',
        data: { note: 'updated' },
        id: 'p1',
        roomCode: 'ROOM01'
      }
    },
    {
      name: 'dataOp',
      data: {
        action: 'remove',
        collection: 'periods',
        data: {},
        id: 'p1',
        roomCode: 'ROOM01'
      }
    }
  ])
})

test('RoomDataClient returns no-room without calling dataOp when no cached room exists', async () => {
  const cloud = createFakeCloud()
  const roomSession = createFakeRoomSession({ roomCode: '' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.list('memories')

  assert.deepEqual(outcome, { kind: 'no-room' })
  assert.deepEqual(cloud.calls, [])
})

test('RoomDataClient keeps active-room recovery failures retryable instead of flattening them to no-room', async () => {
  const cloud = createFakeCloud()
  const roomSession = createFakeRoomSession({
    roomCode: '',
    activeRoom: {
      kind: 'retryable-failure',
      bound: false,
      roomCode: '',
      errorMsg: '同步房间状态失败：network down'
    }
  })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.list('memories')

  assert.deepEqual(outcome, {
    kind: 'retryable-failure',
    message: '网络不太稳定，请重试'
  })
  assert.deepEqual(cloud.calls, [])
})

test('RoomDataClient recovers the active room from RoomSession before loading records', async () => {
  const cloud = createFakeCloud([
    { result: { code: 0, data: [{ _id: 'p1', startDate: '2026-06-01' }] } }
  ])
  const roomSession = createFakeRoomSession({
    roomCode: '',
    activeRoom: { bound: true, roomCode: 'ROOM02' }
  })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.list('periods')

  assert.deepEqual(outcome, {
    kind: 'success',
    data: [{ _id: 'p1', startDate: '2026-06-01' }],
    roomCode: 'ROOM02'
  })
  assert.deepEqual(roomSession.activeRoomCalls, ['getActiveRoom'])
  assert.deepEqual(cloud.calls, [{
    name: 'dataOp',
    data: {
      action: 'list',
      collection: 'periods',
      data: {},
      id: '',
      roomCode: 'ROOM02'
    }
  }])
})

test('RoomDataClient classifies rejected cloud calls as retryable failures and keeps room state', async () => {
  const cloud = createFakeCloud([
    new Error('network down'),
    { result: { code: 0, data: [{ _id: 'm1', date: '2026-06-24' }] } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.list('memories')

  assert.equal(outcome.kind, 'retryable-failure')
  assert.equal(outcome.message, '网络不太稳定，请重试')
  assert.doesNotMatch(outcome.message, /network down/)
  assert.equal(roomSession.roomCode, 'ROOM01')
  assert.deepEqual(roomSession.repairCalls, [])

  const retryOutcome = await client.list('memories')

  assert.deepEqual(retryOutcome, {
    kind: 'success',
    data: [{ _id: 'm1', date: '2026-06-24' }],
    roomCode: 'ROOM01'
  })
})

test('RoomDataClient classifies cloud timeouts as retryable failures', async () => {
  const cloud = createFakeCloud([
    createPendingPromise(),
    { result: { code: 0, data: [{ _id: 'p1' }] } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession, timeoutMs: 5 })

  const outcome = await client.list('periods')

  assert.equal(outcome.kind, 'retryable-failure')
  assert.equal(outcome.message, '网络不太稳定，请重试')
  assert.doesNotMatch(outcome.message, /云数据库查询超时/)

  const retryOutcome = await client.list('periods')

  assert.deepEqual(retryOutcome, {
    kind: 'success',
    data: [{ _id: 'p1' }],
    roomCode: 'ROOM01'
  })
})

test('RoomDataClient requests room repair for structured stale-room failures', async () => {
  const cloud = createFakeCloud([
    { result: { code: -1, errorCode: 'ROOM_ACCESS_DENIED', msg: '访问状态已变化' } }
  ])
  const roomSession = createFakeRoomSession({
    roomCode: 'ROOM01',
    repairResult: { kind: 'success', bound: false, roomCode: '' }
  })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.list('periods')

  assert.deepEqual(outcome, {
    kind: 'room-repair',
    roomCode: 'ROOM01',
    repair: { kind: 'success', bound: false, roomCode: '' }
  })
  assert.deepEqual(roomSession.repairCalls, ['ROOM01'])
})

test('RoomDataClient still repairs stale-room failures from legacy Chinese messages', async () => {
  const cloud = createFakeCloud([
    { result: { code: -1, msg: '无权访问该房间' } }
  ])
  const roomSession = createFakeRoomSession({
    roomCode: 'ROOM01',
    repairResult: { kind: 'success', bound: false, roomCode: '' }
  })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.list('periods')

  assert.deepEqual(outcome, {
    kind: 'room-repair',
    roomCode: 'ROOM01',
    repair: { kind: 'success', bound: false, roomCode: '' }
  })
  assert.deepEqual(roomSession.repairCalls, ['ROOM01'])
})

test('RoomDataClient does not repair business failures that only contain stale-room words', async () => {
  const cloud = createFakeCloud([
    { result: { code: -1, msg: '不支持的字段: 无权访问该房间' } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.add('memories', { note: 'movie' })

  assert.deepEqual(outcome, {
    kind: 'business-failure',
    message: '不支持的字段: 无权访问该房间'
  })
  assert.deepEqual(roomSession.repairCalls, [])
})

test('RoomDataClient mutation transport failures stay retryable without replaying automatically', async () => {
  const cloud = createFakeCloud([
    new Error('network down')
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.add('periods', { startDate: '2026-06-01' })

  assert.deepEqual(outcome, {
    kind: 'retryable-failure',
    message: '网络不太稳定，请重试'
  })
  assert.equal(cloud.calls.length, 1)
  assert.deepEqual(roomSession.repairCalls, [])
})

test('RoomDataClient keeps non-room business failures distinct from retryable failures', async () => {
  const cloud = createFakeCloud([
    { result: { code: -1, msg: '参数错误' } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.add('periods', { startDate: '' })

  assert.deepEqual(outcome, {
    kind: 'business-failure',
    message: '参数错误'
  })
  assert.deepEqual(roomSession.repairCalls, [])
})

test('RoomDataClient does not repair non-room failures when a structured error code is present', async () => {
  const cloud = createFakeCloud([
    { result: { code: -1, errorCode: 'VALIDATION_ERROR', msg: '备注里不能填写“无权访问该房间”' } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.add('memories', { note: '无权访问该房间' })

  assert.deepEqual(outcome, {
    kind: 'business-failure',
    message: '备注里不能填写“无权访问该房间”'
  })
  assert.deepEqual(roomSession.repairCalls, [])
})

test('RoomDataClient keeps room-code conflicts as business failures', async () => {
  const cloud = createFakeCloud([
    { result: { code: -1, errorCode: 'ROOM_CODE_CONFLICT', msg: '房间码状态异常，请联系维护者' } }
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.list('periods')

  assert.deepEqual(outcome, {
    kind: 'business-failure',
    message: '房间码状态异常，请联系维护者'
  })
  assert.deepEqual(roomSession.repairCalls, [])
})

test('cloud exposes RoomDataClient as the only records access interface', () => {
  const legacyRecordMethods = [
    'getPeriods',
    'addPeriod',
    'updatePeriod',
    'deletePeriod',
    'getMemories',
    'addMemory',
    'updateMemory',
    'deleteMemory'
  ]

  assert.equal(typeof cloudModule.createRoomDataClient, 'function')
  legacyRecordMethods.forEach(name => {
    assert.equal(cloudModule[name], undefined)
  })
})

function createFakeRoomSession(options = {}) {
  const session = {
    roomCode: options.roomCode || '',
    activeRoom: options.activeRoom || null,
    repairCalls: [],
    activeRoomCalls: [],
    repairResult: options.repairResult || { kind: 'success', bound: true, roomCode: options.roomCode || '' },
    getRoomCode() {
      return session.roomCode
    },
    async getActiveRoom() {
      session.activeRoomCalls.push('getActiveRoom')
      return session.activeRoom || { kind: 'no-room', bound: false, roomCode: '' }
    },
    async repairCachedRoom(expectedRoomCode) {
      session.repairCalls.push(expectedRoomCode)
      return session.repairResult
    }
  }

  return session
}

function createFakeCloud(responses = []) {
  const queue = Array.isArray(responses) ? [...responses] : []
  const cloud = {
    calls: [],
    callFunction(options) {
      cloud.calls.push(options)
      const response = queue.length > 0 ? queue.shift() : { result: {} }
      if (response instanceof Error) {
        return Promise.reject(response)
      }
      if (response && typeof response.then === 'function') {
        return response
      }
      return Promise.resolve(response)
    }
  }

  return cloud
}

function createPendingPromise() {
  return new Promise(() => {})
}
