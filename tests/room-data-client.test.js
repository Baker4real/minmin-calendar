const assert = require('node:assert/strict')
const test = require('node:test')

const cloudModule = require('../utils/cloud')
const roomModule = require('../utils/room')
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
    data: [{ _id: 'p1', startDate: '2026-06-01' }]
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

test('RoomDataClient add, update, and remove return success outcomes with the server result', async () => {
  const cloud = createFakeCloud([
    { result: { code: 0, id: 'p1' } },
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
    result: { code: 0, id: 'p1' }
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
    message: '同步房间状态失败：network down',
    retryDescriptor: {
      action: 'list',
      mode: 'auto-retry',
      message: '读取失败，可以直接重试'
    },
    retry: outcome.retry
  })
  assert.equal(typeof outcome.retry, 'function')
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
    data: [{ _id: 'p1', startDate: '2026-06-01' }]
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
  assert.equal(outcome.message, 'network down')
  assert.deepEqual(outcome.retryDescriptor, {
    action: 'list',
    mode: 'auto-retry',
    message: '读取失败，可以直接重试'
  })
  assert.equal(typeof outcome.retry, 'function')
  assert.equal(roomSession.roomCode, 'ROOM01')
  assert.deepEqual(roomSession.repairCalls, [])

  const retryOutcome = await outcome.retry()

  assert.deepEqual(retryOutcome, {
    kind: 'success',
    data: [{ _id: 'm1', date: '2026-06-24' }]
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
  assert.match(outcome.message, /云数据库查询超时/)
  assert.deepEqual(outcome.retryDescriptor, {
    action: 'list',
    mode: 'auto-retry',
    message: '读取失败，可以直接重试'
  })
  assert.equal(typeof outcome.retry, 'function')

  const retryOutcome = await outcome.retry()

  assert.deepEqual(retryOutcome, {
    kind: 'success',
    data: [{ _id: 'p1' }]
  })
})

test('RoomDataClient requests room repair for stale-room business failures', async () => {
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

test('RoomDataClient mutation transport failures expose a manual retry descriptor without replaying automatically', async () => {
  const cloud = createFakeCloud([
    new Error('network down')
  ])
  const roomSession = createFakeRoomSession({ roomCode: 'ROOM01' })
  const client = createRoomDataClient({ cloud, roomSession })

  const outcome = await client.add('periods', { startDate: '2026-06-01' })

  assert.deepEqual(outcome, {
    kind: 'retryable-failure',
    message: 'network down',
    retryDescriptor: {
      action: 'add',
      mode: 'confirm-before-retry',
      message: '保存结果未知，请先确认记录状态后再重试'
    }
  })
  assert.equal(outcome.retry, undefined)
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

test('Legacy cloud wrappers keep the existing page-facing return shapes', async () => {
  const originalWx = global.wx
  const originalGetRoomCode = roomModule.getRoomCode
  const originalRepairCachedRoom = roomModule.repairCachedRoom

  roomModule.getRoomCode = () => 'ROOM01'
  roomModule.repairCachedRoom = async () => ({ kind: 'success', bound: true, roomCode: 'ROOM01' })
  global.wx = {
    cloud: {
      callFunction(options) {
        if (options.data.action === 'list') {
          return Promise.resolve({ result: { code: 0, data: [{ _id: 'p1' }] } })
        }
        return Promise.resolve({ result: { code: 0, saved: true } })
      }
    }
  }

  try {
    const periods = await cloudModule.getPeriods()
    const saveResult = await cloudModule.addPeriod({ startDate: '2026-06-01' })

    assert.deepEqual(periods, [{ _id: 'p1' }])
    assert.deepEqual(saveResult, {
      result: { code: 0, saved: true }
    })
  } finally {
    roomModule.getRoomCode = originalGetRoomCode
    roomModule.repairCachedRoom = originalRepairCachedRoom
    global.wx = originalWx
  }
})

test('Legacy cloud list wrappers still throw on retryable transport failures', async () => {
  const originalWx = global.wx
  const originalGetRoomCode = roomModule.getRoomCode
  const originalRepairCachedRoom = roomModule.repairCachedRoom

  roomModule.getRoomCode = () => 'ROOM01'
  roomModule.repairCachedRoom = async () => ({ kind: 'success', bound: true, roomCode: 'ROOM01' })
  global.wx = {
    cloud: {
      callFunction() {
        return Promise.reject(new Error('network down'))
      }
    }
  }

  try {
    await assert.rejects(() => cloudModule.getPeriods(), /network down/)
  } finally {
    roomModule.getRoomCode = originalGetRoomCode
    roomModule.repairCachedRoom = originalRepairCachedRoom
    global.wx = originalWx
  }
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
