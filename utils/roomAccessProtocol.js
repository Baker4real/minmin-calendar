const STALE_ROOM_MESSAGES = [
  '无权访问该房间',
  '未加入任何房间',
  '未加入该房间',
  '房间不存在'
]

const STALE_ROOM_ERROR_CODES = [
  'ROOM_ACCESS_DENIED',
  'ROOM_NOT_FOUND',
  'NO_ACTIVE_ROOM'
]

function isStaleRoomFailure(result) {
  const errorCode = getErrorCode(result)
  if (errorCode) return STALE_ROOM_ERROR_CODES.includes(errorCode)

  const message = String(result && result.msg ? result.msg : '')
  return STALE_ROOM_MESSAGES.some(text => message === text || message.startsWith(`${text}：`))
}

function shouldClearCachedRoom(result, roomCode) {
  if (isStaleRoomFailure(result)) return true

  if (getErrorCode(result)) {
    return false
  }

  if (result && result.code === 1) {
    return true
  }

  return result && result.code === 0 && !roomCode
}

function getErrorCode(result) {
  return String(result && result.errorCode ? result.errorCode : '')
}

module.exports = {
  STALE_ROOM_ERROR_CODES,
  isStaleRoomFailure,
  shouldClearCachedRoom
}
