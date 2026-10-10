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

test('RoomSession repairCachedRoom keeps cache when code 1 carries a non-room errorCode', async () => {
  const storage = createMemoryStorage({ roomCode: 'ROOM01' })
  const cloud = createFakeCloud({
    getMyRoom: { code: 1, errorCode: 'VALIDATION_ERROR', msg: '临时业务失败' }
  })
  const session = createRoomSession({ storage, cloud })

  const result = await session.repairCachedRoom('ROOM01')

  assert.deepEqual(result, {
    kind: 'retryable-failure',
    message: '同步房间状态失败：临时业务失败'
  })
  assert.equal(storage.get('roomCode'), 'ROOM01')
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

test('RoomSession createRoom tells the user to retry and keeps a raw cloud timeout out of the message', async () => {
  const logs = []
  const storage = createMemoryStorage()
  const cloud = createFakeCloud({
    createRoom: new Error('云数据库查询超时 (15000ms)')
  })
  const session = createRoomSession({
    storage,
    cloud,
    logger: {
      error(...args) {
        logs.push(args.map(String).join(' '))
      }
    }
  })

  const result = await session.createRoom()

  assert.deepEqual(result, { code: -1, msg: '网络不太稳定，请重试' })
  assert.equal(JSON.stringify(result).includes('15000'), false)
  assert.match(logs.join('\n'), /15000ms/)
})

test('RoomSession createRoom rewrites a raw timeout returned by the cloud function', async () => {
  const logs = []
  const storage = createMemoryStorage()
  const cloud = createFakeCloud({
    createRoom: { code: -1, msg: '云数据库查询超时 (15000ms)' }
  })
  const session = createRoomSession({
    storage,
    cloud,
    logger: {
      error(...args) {
        logs.push(args.map(String).join(' '))
      }
    }
  })

  const result = await session.createRoom()

  assert.deepEqual(result, { code: -1, msg: '网络不太稳定，请重试' })
  assert.equal(JSON.stringify(result).includes('15000'), false)
  assert.match(logs.join('\n'), /15000ms/)
})

test('RoomSession createRoom hides an empty room code and asks the user to retry', async () => {
  const logs = []
  const session = createRoomSession({
    storage: createMemoryStorage(),
    cloud: createFakeCloud({
      createRoom: { code: 0, room: {} }
    }),
    logger: {
      error(...args) {
        logs.push(args.map(String).join(' '))
      }
    }
  })

  const result = await session.createRoom()

  assert.deepEqual(result, { code: -1, msg: '这次没有完成，请重试' })
  assert.equal(JSON.stringify(result).includes('房间码为空'), false)
  assert.match(logs.join('\n'), /房间码为空/)
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

test('RoomSession joinRoom tells the user to retry and keeps a raw cloud timeout out of the message', async () => {
  const logs = []
  const storage = createMemoryStorage()
  const cloud = createFakeCloud({
    joinRoom: new Error('云数据库查询超时 (15000ms)')
  })
  const session = createRoomSession({
    storage,
    cloud,
    logger: {
      error(...args) {
        logs.push(args.map(String).join(' '))
      }
    }
  })

  const result = await session.joinRoom('ROOM04')

  assert.deepEqual(result, { code: -1, msg: '网络不太稳定，请重试' })
  assert.equal(JSON.stringify(result).includes('15000'), false)
  assert.match(logs.join('\n'), /15000ms/)
})

test('RoomSession joinRoom rewrites a raw error returned by the cloud function', async () => {
  const logs = []
  const storage = createMemoryStorage()
  const cloud = createFakeCloud({
    joinRoom: { code: -1, msg: "TypeError: Cannot read property 'room' of undefined" }
  })
  const session = createRoomSession({
    storage,
    cloud,
    logger: {
      error(...args) {
        logs.push(args.map(String).join(' '))
      }
    }
  })

  const result = await session.joinRoom('ROOM04')

  assert.deepEqual(result, { code: -1, msg: '这次没有完成，请重试' })
  assert.equal(JSON.stringify(result).includes('TypeError'), false)
  assert.match(logs.join('\n'), /TypeError/)
})

test('RoomSession joinRoom keeps a room-code refusal the user can act on', async () => {
  const logs = []
  const session = createRoomSession({
    storage: createMemoryStorage(),
    cloud: createFakeCloud({
      joinRoom: { code: -2, msg: '房间不存在，请检查房间码' }
    }),
    logger: {
      error() {
        logs.push('logged')
      }
    }
  })

  const result = await session.joinRoom('ROOM04')

  assert.deepEqual(result, { code: -1, msg: '房间不存在，请检查房间码' })
  assert.deepEqual(logs, [])
})

test('RoomSession createRoom keeps the still-in-a-room refusal the bind page uses to offer unbind', async () => {
  const logs = []
  const session = createRoomSession({
    storage: createMemoryStorage(),
    cloud: createFakeCloud({
      createRoom: { code: -5, msg: '你已加入其他房间，请先解除绑定后再创建新房间' }
    }),
    logger: {
      error() {
        logs.push('logged')
      }
    }
  })

  const result = await session.createRoom()

  assert.deepEqual(result, { code: -1, msg: '你已加入其他房间，请先解除绑定后再创建新房间' })
  assert.deepEqual(logs, [])
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
