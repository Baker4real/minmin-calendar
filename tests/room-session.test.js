const assert = require('node:assert/strict')
const test = require('node:test')

const { createRoomSession } = require('../utils/room')

test('RoomSession uses cached room code without calling recovery cloud function', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud()
  const session = createRoomSession({ storage, cloud })

  const result = await session.getActiveRoom()

  assert.deepEqual(result, { kind: 'success', bound: true, roomCode: 'ROOM01' })
  assert.deepEqual(cloud.calls, [])
})

test('RoomSession recovers the current room from cloud and caches it locally', async () => {
  const storage = createMemoryStorage()
  const cloud = createFakeCloud({
    getMyRoom: { code: 0, room: { roomCode: 'ROOM02' } }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.getActiveRoom()

  assert.deepEqual(result, { kind: 'success', bound: true, roomCode: 'ROOM02' })
  assert.equal(storage.get('roomCode'), 'ROOM02')
  assert.deepEqual(cloud.calls, [{ name: 'getMyRoom' }])
})

test('RoomSession returns a recoverable error when cloud room sync fails', async () => {
  const storage = createMemoryStorage()
  const cloud = createFakeCloud({
    getMyRoom: new Error('network down')
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.getActiveRoom()

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    bound: false,
    roomCode: '',
    errorMsg: '同步房间状态失败：network down'
  })
  assert.equal(storage.get('roomCode'), '')
})

test('RoomSession verified active room clears stale cache when cloud reports no active room', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    getMyRoom: { code: 1, msg: '未加入任何房间' }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.getVerifiedActiveRoom()

  assert.deepEqual(result, {
    kind: 'no-room',
    bound: false,
    roomCode: ''
  })
  assert.equal(storage.get('roomCode'), '')
  assert.deepEqual(cloud.calls, [{ name: 'getMyRoom' }])
})

test('RoomSession verified active room keeps cached room when verification fails retryably', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    getMyRoom: new Error('network down')
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.getVerifiedActiveRoom()

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    bound: false,
    roomCode: '',
    errorMsg: '同步房间状态失败：network down'
  })
  assert.equal(storage.get('roomCode'), 'ROOM01')
  assert.deepEqual(cloud.calls, [{ name: 'getMyRoom' }])
})

test('RoomSession repairCachedRoom recovers and caches the current room from cloud', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    getMyRoom: { code: 0, room: { roomCode: ' room02 ' } }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.repairCachedRoom('ROOM01')

  assert.deepEqual(result, {
    kind: 'success',
    bound: true,
    roomCode: 'ROOM02'
  })
  assert.equal(storage.get('roomCode'), 'ROOM02')
  assert.deepEqual(cloud.calls, [{ name: 'getMyRoom' }])
})

test('RoomSession repairCachedRoom clears stale local room state when cloud reports no active room', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    getMyRoom: { code: 1, msg: '未加入任何房间' }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.repairCachedRoom(' room01 ')

  assert.deepEqual(result, {
    kind: 'success',
    bound: false,
    roomCode: ''
  })
  assert.equal(storage.get('roomCode'), '')
  assert.deepEqual(cloud.calls, [{ name: 'getMyRoom' }])
})

test('RoomSession repairCachedRoom clears stale local room state from a structured no-room code', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    getMyRoom: { code: 1, errorCode: 'NO_ACTIVE_ROOM', msg: '当前没有绑定房间' }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.repairCachedRoom('ROOM01')

  assert.deepEqual(result, {
    kind: 'success',
    bound: false,
    roomCode: ''
  })
  assert.equal(storage.get('roomCode'), '')
  assert.deepEqual(cloud.calls, [{ name: 'getMyRoom' }])
})

test('RoomSession repairCachedRoom returns a retryable failure when cloud room sync fails', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    getMyRoom: new Error('network down')
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.repairCachedRoom('ROOM01')

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    message: '同步房间状态失败：network down'
  })
  assert.equal(storage.get('roomCode'), 'ROOM01')
})

test('RoomSession repairCachedRoom keeps a newer cached room when a stale repair resolves after rebinding', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = {
    calls: [],
    async callFunction(options) {
      cloud.calls.push(options)
      storage.set('roomCode', 'ROOM02')
      return { result: { code: 1, msg: '未加入任何房间' } }
    }
  }
  const session = createRoomSession({ storage, cloud })

  const result = await session.repairCachedRoom('ROOM01')

  assert.deepEqual(result, {
    kind: 'success',
    bound: true,
    roomCode: 'ROOM02'
  })
  assert.equal(storage.get('roomCode'), 'ROOM02')
  assert.deepEqual(cloud.calls, [{ name: 'getMyRoom' }])
})

test('RoomSession createRoom caches the created room code', async () => {
  const storage = createMemoryStorage()
  const cloud = createFakeCloud({
    createRoom: { code: 0, room: { roomCode: 'ROOM03' } }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.createRoom()

  assert.deepEqual(result, { code: 0, roomCode: 'ROOM03', room: { roomCode: 'ROOM03' } })
  assert.equal(storage.get('roomCode'), 'ROOM03')
  assert.deepEqual(cloud.calls, [{ name: 'createRoom' }])
})

test('RoomSession joinRoom normalizes the code and caches the joined room', async () => {
  const storage = createMemoryStorage()
  const cloud = createFakeCloud({
    joinRoom: { code: 0 }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.joinRoom(' room04 ')

  assert.deepEqual(result, { code: 0, roomCode: 'ROOM04' })
  assert.equal(storage.get('roomCode'), 'ROOM04')
  assert.deepEqual(cloud.calls, [{ name: 'joinRoom', data: { roomCode: 'ROOM04' } }])
})

test('RoomSession joinRoom rejects invalid room codes before cloud calls', async () => {
  const storage = createMemoryStorage()
  const cloud = createFakeCloud()
  const session = createRoomSession({ storage, cloud })

  const result = await session.joinRoom('ABC')

  assert.deepEqual(result, { code: -1, msg: '请输入6位房间码' })
  assert.deepEqual(cloud.calls, [])
})

test('RoomSession clearLocalRoom removes the cached room code', () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const session = createRoomSession({ storage, cloud: createFakeCloud() })

  session.clearLocalRoom()

  assert.equal(storage.get('roomCode'), '')
})

test('RoomSession leaveRoom revokes the server room and clears the cached room code', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    leaveRoom: { code: 0 }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.leaveRoom()

  assert.deepEqual(result, { code: 0 })
  assert.equal(storage.get('roomCode'), '')
  assert.deepEqual(cloud.calls, [{ name: 'leaveRoom' }])
})

test('RoomSession leaveRoom keeps the cached room code when cloud revoke fails', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    leaveRoom: new Error('network down')
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.leaveRoom()

  assert.deepEqual(result, {
    code: -1,
    msg: '解除绑定失败：network down'
  })
  assert.equal(storage.get('roomCode'), 'ROOM01')
})

function createMemoryStorage(initial = {}) {
  const values = { ...initial }

  return {
    get(key) {
      return values[key] || ''
    },
    set(key, value) {
      values[key] = value
    },
    remove(key) {
      delete values[key]
    }
  }
}

function createFakeCloud(results = {}) {
  const cloud = {
    calls: [],
    async callFunction(options) {
      cloud.calls.push(options)
      const result = results[options.name]
      if (result instanceof Error) throw result
      return { result: result || {} }
    }
  }

  return cloud
}
