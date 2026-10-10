const assert = require('node:assert/strict')
const test = require('node:test')

const { createRoomResolver } = require('../utils/roomResolver')

test('cached roomCode resolves without calling getActiveRoom', async () => {
  const session = createFakeSession({ roomCode: ' room01 ' })
  const resolver = createRoomResolver({ session })

  const outcome = await resolver.resolveActiveRoom()

  assert.deepEqual(outcome, { kind: 'resolved', roomCode: 'ROOM01' })
  assert.equal(session.activeRoomCalls, 0)
})

test('empty cache falls back to getActiveRoom', async () => {
  const session = createFakeSession({
    activeRoom: { kind: 'success', bound: true, roomCode: 'ROOM02' }
  })
  const resolver = createRoomResolver({ session })

  const outcome = await resolver.resolveActiveRoom()

  assert.deepEqual(outcome, { kind: 'resolved', roomCode: 'ROOM02' })
  assert.equal(session.activeRoomCalls, 1)
})

test('getActiveRoom normalizes a bound room code', async () => {
  const session = createFakeSession({
    activeRoom: { bound: true, roomCode: '  rOoM-03  ' }
  })
  const resolver = createRoomResolver({ session })

  const outcome = await resolver.resolveActiveRoom()

  assert.deepEqual(outcome, { kind: 'resolved', roomCode: 'ROOM-03' })
})

test('getActiveRoom errors become retryable failures', async () => {
  const session = createFakeSession({ activeRoomError: new Error('network down') })
  const resolver = createRoomResolver({ session })

  const outcome = await resolver.resolveActiveRoom()

  assert.deepEqual(outcome, {
    kind: 'retryable-failure',
    message: '网络不太稳定，请重试'
  })
})

test('getActiveRoom retryable-failure outcomes are propagated', async () => {
  const session = createFakeSession({
    activeRoom: {
      kind: 'retryable-failure',
      errorMsg: '同步房间状态失败，请稍后重试'
    }
  })
  const resolver = createRoomResolver({ session })

  const outcome = await resolver.resolveActiveRoom()

  assert.deepEqual(outcome, {
    kind: 'retryable-failure',
    message: '同步房间状态失败，请稍后重试'
  })
})

test('unbound active room resolves to no-room', async () => {
  const session = createFakeSession({
    activeRoom: { kind: 'success', bound: false, roomCode: 'ROOM04' }
  })
  const resolver = createRoomResolver({ session })

  const outcome = await resolver.resolveActiveRoom()

  assert.deepEqual(outcome, { kind: 'no-room' })
})

test('missing session resolves to no-room', async () => {
  const resolver = createRoomResolver({ session: null })

  const outcome = await resolver.resolveActiveRoom()

  assert.deepEqual(outcome, { kind: 'no-room' })
})

function createFakeSession({ roomCode = '', activeRoom, activeRoomError } = {}) {
  const session = {
    activeRoomCalls: 0,
    getRoomCode() {
      return roomCode
    },
    async getActiveRoom() {
      session.activeRoomCalls += 1
      if (activeRoomError) throw activeRoomError
      return activeRoom
    }
  }

  return session
}
