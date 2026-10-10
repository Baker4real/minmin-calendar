const roomSession = require('./room')
const roomAccessOutcome = require('./roomAccessOutcome')

const DEFAULT_RETRYABLE_MESSAGE = '同步房间状态失败，请稍后重试'

function createRoomResolver(options = {}) {
  const session = Object.prototype.hasOwnProperty.call(options, 'session')
    ? options.session
    : roomSession

  return {
    async resolveActiveRoom() {
      const cachedRoomCode = getCachedRoomCode(session)
      if (cachedRoomCode) {
        return {
          kind: 'resolved',
          roomCode: cachedRoomCode
        }
      }

      if (!session || typeof session.getActiveRoom !== 'function') {
        return { kind: 'no-room' }
      }

      try {
        const room = await session.getActiveRoom()
        const roomCode = normalizeRoomCode(room && room.roomCode)
        if (room && room.bound && roomCode) {
          return {
            kind: 'resolved',
            roomCode
          }
        }

        if (room && (room.kind === 'retryable-failure' || room.errorMsg)) {
          return {
            kind: 'retryable-failure',
            message: room.errorMsg || room.message || DEFAULT_RETRYABLE_MESSAGE
          }
        }
      } catch (error) {
        return {
          kind: 'retryable-failure',
          message: roomAccessOutcome.presentUserFailure(getErrorMessage(error))
        }
      }

      return { kind: 'no-room' }
    }
  }
}

function createInMemoryRoomResolver(config = {}) {
  const resolution = config || {}

  return {
    async resolveActiveRoom() {
      if (resolution.kind === 'resolved') {
        return {
          kind: 'resolved',
          roomCode: normalizeRoomCode(resolution.roomCode)
        }
      }
      if (resolution.kind === 'no-room') {
        return { kind: 'no-room' }
      }
      if (resolution.kind === 'retryable-failure') {
        return {
          kind: 'retryable-failure',
          message: resolution.message
        }
      }
      throw new Error('Invalid in-memory resolver config')
    }
  }
}

function getCachedRoomCode(session) {
  if (!session || typeof session.getRoomCode !== 'function') return ''
  return normalizeRoomCode(session.getRoomCode())
}

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase()
}

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  createRoomResolver,
  createInMemoryRoomResolver
}
