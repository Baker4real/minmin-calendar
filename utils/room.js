const ROOM_CODE_KEY = 'roomCode'

function createRoomSession(options = {}) {
  const storage = options.storage || createWxStorage()
  const cloud = options.cloud || createWxCloud()

  return {
    getRoomCode() {
      return normalizeRoomCode(storage.get(ROOM_CODE_KEY))
    },

    async getActiveRoom() {
      const cachedRoomCode = normalizeRoomCode(storage.get(ROOM_CODE_KEY))
      if (cachedRoomCode) {
        return { bound: true, roomCode: cachedRoomCode }
      }

      try {
        const res = await cloud.callFunction({ name: 'getMyRoom' })
        const roomCode = normalizeRoomCode(res.result?.room?.roomCode)
        if (res.result?.code === 0 && roomCode) {
          storage.set(ROOM_CODE_KEY, roomCode)
          return { bound: true, roomCode }
        }
      } catch (error) {
        return {
          bound: false,
          roomCode: '',
          errorMsg: '同步房间状态失败：' + getErrorMessage(error)
        }
      }

      return { bound: false, roomCode: '' }
    },

    async repairCachedRoom(expectedRoomCode) {
      const targetRoomCode = normalizeRoomCode(expectedRoomCode)

      try {
        const res = await cloud.callFunction({ name: 'getMyRoom' })
        const roomCode = normalizeRoomCode(res.result?.room?.roomCode)
        if (res.result?.code === 0 && roomCode) {
          storage.set(ROOM_CODE_KEY, roomCode)
          return { kind: 'success', bound: true, roomCode }
        }

        if (shouldClearCachedRoom(res.result, targetRoomCode, storage)) {
          storage.remove(ROOM_CODE_KEY)
          return { kind: 'success', bound: false, roomCode: '' }
        }

        return { kind: 'success', bound: false, roomCode: '' }
      } catch (error) {
        return {
          kind: 'retryable-failure',
          message: '同步房间状态失败：' + getErrorMessage(error)
        }
      }
    },

    async createRoom() {
      try {
        const res = await cloud.callFunction({ name: 'createRoom' })
        if (res.result?.code !== 0) {
          return { code: -1, msg: res.result?.msg || '创建失败' }
        }

        const room = res.result.room || {}
        const roomCode = normalizeRoomCode(room.roomCode)
        if (!roomCode) {
          return { code: -1, msg: '创建失败：房间码为空' }
        }

        storage.set(ROOM_CODE_KEY, roomCode)
        return { code: 0, roomCode, room: { ...room, roomCode } }
      } catch (error) {
        return { code: -1, msg: '创建失败：' + getErrorMessage(error) }
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
          return { code: -1, msg: res.result?.msg || '加入失败' }
        }

        const joinedRoomCode = normalizeRoomCode(res.result.roomCode) || roomCode
        storage.set(ROOM_CODE_KEY, joinedRoomCode)
        return { code: 0, roomCode: joinedRoomCode }
      } catch (error) {
        return { code: -1, msg: '加入失败：' + getErrorMessage(error) }
      }
    },

    clearLocalRoom() {
      storage.remove(ROOM_CODE_KEY)
    },

    async leaveRoom() {
      try {
        const res = await cloud.callFunction({ name: 'leaveRoom' })
        if (res.result?.code !== 0) {
          return { code: -1, msg: res.result?.msg || '解除绑定失败' }
        }

        storage.remove(ROOM_CODE_KEY)
        return { code: 0 }
      } catch (error) {
        return { code: -1, msg: '解除绑定失败：' + getErrorMessage(error) }
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

function shouldClearCachedRoom(result, expectedRoomCode, storage) {
  const message = String(result && result.msg ? result.msg : '')
  const cachedRoomCode = normalizeRoomCode(storage.get(ROOM_CODE_KEY))

  if (result && result.code === 1) {
    return true
  }

  if (message.includes('未加入任何房间') || message.includes('无权访问该房间') || message.includes('房间不存在')) {
    return true
  }

  return !!expectedRoomCode && cachedRoomCode === expectedRoomCode
}

module.exports = {
  createRoomSession,
  getRoomCode,
  getActiveRoom,
  repairCachedRoom,
  createRoom,
  joinRoom,
  clearLocalRoom,
  leaveRoom
}
