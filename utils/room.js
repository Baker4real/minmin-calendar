const ROOM_CODE_KEY = 'roomCode'
const roomAccessOutcome = require('./roomAccessOutcome')

function createRoomSession(options = {}) {
  const storage = options.storage || createWxStorage()
  const cloud = options.cloud || createWxCloud()
  const logger = options.logger || console

  return {
    getRoomCode() {
      return normalizeRoomCode(storage.get(ROOM_CODE_KEY))
    },

    async getActiveRoom() {
      const cachedRoomCode = normalizeRoomCode(storage.get(ROOM_CODE_KEY))
      if (cachedRoomCode) {
        return { kind: 'success', bound: true, roomCode: cachedRoomCode }
      }

      try {
        const res = await cloud.callFunction({ name: 'getMyRoom' })
        const roomCode = normalizeRoomCode(res.result?.room?.roomCode)
        if (res.result?.code === 0 && roomCode) {
          storage.set(ROOM_CODE_KEY, roomCode)
          return { kind: 'success', bound: true, roomCode }
        }
      } catch (error) {
        return {
          kind: 'retryable-failure',
          bound: false,
          roomCode: '',
          errorMsg: roomAccessOutcome.presentUserFailure(getErrorMessage(error), logger)
        }
      }

      return { kind: 'no-room', bound: false, roomCode: '' }
    },

    async getVerifiedActiveRoom() {
      const cachedRoomCode = normalizeRoomCode(storage.get(ROOM_CODE_KEY))
      if (!cachedRoomCode) {
        return this.getActiveRoom()
      }

      const repair = await this.repairCachedRoom(cachedRoomCode)
      if (repair && repair.kind === 'success' && repair.bound && repair.roomCode) {
        return repair
      }
      if (repair && repair.kind === 'success' && !repair.bound) {
        return { kind: 'no-room', bound: false, roomCode: '' }
      }

      return {
        kind: 'retryable-failure',
        bound: false,
        roomCode: '',
        errorMsg: repair && repair.message
          ? roomAccessOutcome.presentUserFailure(repair.message, logger)
          : '同步房间状态失败，请稍后重试'
      }
    },

    async repairCachedRoom(expectedRoomCode) {
      const expectedRoom = normalizeRoomCode(expectedRoomCode)

      try {
        const res = await cloud.callFunction({ name: 'getMyRoom' })
        const roomCode = normalizeRoomCode(res.result?.room?.roomCode)
        if (res.result?.code === 0 && roomCode) {
          storage.set(ROOM_CODE_KEY, roomCode)
          return { kind: 'success', bound: true, roomCode }
        }

        if (roomAccessOutcome.shouldClearCachedRoom(res.result, roomCode)) {
          const currentRoomCode = normalizeRoomCode(storage.get(ROOM_CODE_KEY))
          if (!expectedRoom || currentRoomCode === expectedRoom) {
            storage.remove(ROOM_CODE_KEY)
            return { kind: 'success', bound: false, roomCode: '' }
          }

          return {
            kind: 'success',
            bound: !!currentRoomCode,
            roomCode: currentRoomCode
          }
        }

        return {
          kind: 'retryable-failure',
          message: roomAccessOutcome.presentUserFailure(
            '同步房间状态失败：' + getFailureMessage(res.result),
            logger
          )
        }
      } catch (error) {
        return {
          kind: 'retryable-failure',
          message: roomAccessOutcome.presentUserFailure(getErrorMessage(error), logger)
        }
      }
    },

    async createRoom() {
      try {
        const res = await cloud.callFunction({ name: 'createRoom' })
        if (res.result?.code !== 0) {
          return { code: -1, msg: roomAccessOutcome.presentUserFailure(res.result?.msg, logger) }
        }

        const room = res.result.room || {}
        const roomCode = normalizeRoomCode(room.roomCode)
        if (!roomCode) {
          return { code: -1, msg: roomAccessOutcome.presentUserFailure('创建失败：房间码为空', logger) }
        }

        storage.set(ROOM_CODE_KEY, roomCode)
        return { code: 0, roomCode, room: { ...room, roomCode } }
      } catch (error) {
        return { code: -1, msg: roomAccessOutcome.presentUserFailure(getErrorMessage(error), logger) }
      }
    },

    async joinRoom(rawRoomCode) {
      const roomCode = normalizeRoomCode(rawRoomCode)
      if (roomCode.length !== 6) {
        return { code: -1, msg: '请输入6位房间码' }
      }

      try {
        const res = await cloud.callFunction({
          name: 'joinRoom',
          data: { roomCode }
        })
        if (res.result?.code !== 0) {
          return { code: -1, msg: roomAccessOutcome.presentUserFailure(res.result?.msg, logger) }
        }

        const joinedRoomCode = normalizeRoomCode(res.result.roomCode) || roomCode
        storage.set(ROOM_CODE_KEY, joinedRoomCode)
        return { code: 0, roomCode: joinedRoomCode }
      } catch (error) {
        return { code: -1, msg: roomAccessOutcome.presentUserFailure(getErrorMessage(error), logger) }
      }
    },

    clearLocalRoom() {
      storage.remove(ROOM_CODE_KEY)
    },

    async leaveRoom() {
      try {
        const res = await cloud.callFunction({ name: 'leaveRoom' })
        if (res.result?.code !== 0) {
          return { code: -1, msg: roomAccessOutcome.presentUserFailure(res.result?.msg, logger) }
        }

        storage.remove(ROOM_CODE_KEY)
        return { code: 0 }
      } catch (error) {
        return { code: -1, msg: roomAccessOutcome.presentUserFailure(getErrorMessage(error), logger) }
      }
    }
  }
}

function getRoomCode() {
  return createRoomSession().getRoomCode()
}

async function getActiveRoom() {
  return createRoomSession().getActiveRoom()
}

async function getVerifiedActiveRoom() {
  return createRoomSession().getVerifiedActiveRoom()
}

async function repairCachedRoom(roomCode) {
  return createRoomSession().repairCachedRoom(roomCode)
}

async function createRoom() {
  return createRoomSession().createRoom()
}

async function joinRoom(roomCode) {
  return createRoomSession().joinRoom(roomCode)
}

function clearLocalRoom() {
  createRoomSession().clearLocalRoom()
}

async function leaveRoom() {
  return createRoomSession().leaveRoom()
}

function createWxStorage() {
  const wxApi = getWx()
  return {
    get(key) {
      return wxApi.getStorageSync(key) || ''
    },
    set(key, value) {
      wxApi.setStorageSync(key, value)
    },
    remove(key) {
      wxApi.removeStorageSync(key)
    }
  }
}

function createWxCloud() {
  return getWx().cloud
}

function getWx() {
  if (typeof wx === 'undefined') {
    throw new Error('wx is unavailable outside the WeChat runtime')
  }
  return wx
}

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase()
}

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

function presentRoomActionMessage(msg, logger) {
  const text = typeof msg === 'string' ? msg.trim() : ''
  if (isProductRoomMessage(text)) return text
  logger.error(msg || 'room action failed')
  return presentRoomActionFailure(text)
}

function isProductRoomMessage(text) {
  if (!text) return false
  if (/[A-Za-z]/.test(text)) return false
  if (/\d+\s*ms/.test(text)) return false
  return true
}

function presentRoomActionFailure(error) {
  const text = getErrorMessage(error)
  if (isRetryableNetworkFailure(text)) return '网络不太稳定，请重试'
  return '这次没有完成，请重试'
}

function isRetryableNetworkFailure(text) {
  return /timeout|timed out|超时|network|云数据库|\d+\s*ms|request:fail/i.test(text)
}

function getFailureMessage(result) {
  return result && result.msg ? result.msg : '未知错误'
}

module.exports = {
  createRoomSession,
  getRoomCode,
  getActiveRoom,
  getVerifiedActiveRoom,
  repairCachedRoom,
  createRoom,
  joinRoom,
  clearLocalRoom,
  leaveRoom
}
