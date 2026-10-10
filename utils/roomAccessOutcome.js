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

const USER_FAILURE_COPY = {
  network: '网络不太稳定，请重试',
  room: '房间状态已变化，请重新绑定',
  missing: '这条记录已经不在了，请返回列表查看',
  unknown: '这次没有完成，请重试'
}

function presentUserFailure(raw, logger) {
  const text = raw == null ? '' : String(raw).trim()
  const sink = logger && typeof logger.error === 'function' ? logger : console
  if (!text) {
    sink.error(raw || 'room action failed')
    return USER_FAILURE_COPY.unknown
  }
  const category = classifyUserFailure(text)
  if (!category) return text
  sink.error(text)
  return USER_FAILURE_COPY[category]
}

function classifyUserFailure(text) {
  if (isSafeProductCopy(text)) return null
  const body = text.replace(/^(加入失败|创建失败|解除绑定失败|同步房间状态失败)：/, '')
  const prefixed = body !== text
  if (isNetworkFailure(text) || isNetworkFailure(body)) return 'network'
  if (text.indexOf('记录不存在') !== -1 || body.indexOf('记录不存在') !== -1) return 'missing'
  if (isRoomChangeFailure(text) || isRoomChangeFailure(body)) return 'room'
  if (prefixed || hasTechnicalMarker(text)) return 'unknown'
  return null
}

function isSafeProductCopy(text) {
  if (Object.values(USER_FAILURE_COPY).indexOf(text) !== -1) return true
  if (hasTechnicalMarker(text)) return false
  return /请(重试|检查|重新绑定|先|返回|稍后|输入|选择|编辑|确认)/.test(text)
}

function isNetworkFailure(text) {
  return /超时|timeout|timed out|network|econn|enotfound|etimedout|eai_again|socket|fetch failed|request:fail/i.test(text)
}

function isRoomChangeFailure(text) {
  if (/ROOM_ACCESS_DENIED|ROOM_NOT_FOUND|NO_ACTIVE_ROOM/.test(text)) return true
  return STALE_ROOM_MESSAGES.some(item => text === item || text.startsWith(`${item}：`))
}

function hasTechnicalMarker(text) {
  return /\(\d+\s*ms\)|Error:|[A-Za-z]{3,}/.test(text)
}

function buildRoomRepairAction(outcome, options = {}) {
  const repair = outcome && outcome.repair ? outcome.repair : {}
  const roomCode = outcome && outcome.roomCode ? outcome.roomCode : (repair.roomCode || '')

  if (repair.kind === 'success' && repair.bound) {
    return {
      kind: 'room-repair',
      action: 'retry',
      message: options.retryMessage || '房间状态已同步，请重试',
      roomCode
    }
  }

  if (repair.kind === 'success' && !repair.bound) {
    return {
      kind: 'room-repair',
      action: 'rebind',
      message: options.rebindMessage || '房间状态已变化，请重新绑定',
      roomCode
    }
  }

  return {
    kind: 'room-repair',
    action: 'repair-retry',
    message: presentUserFailure(repair.message || '同步房间状态失败，请稍后重试'),
    roomCode
  }
}

function buildInlineRoomStatus(outcome, options = {}) {
  if (outcome && outcome.kind === 'no-room') {
    return {
      title: options.noRoomTitle || '请先绑定房间',
      desc: options.noRoomDesc || '当前操作需要先绑定房间',
      actionText: options.bindActionText || '去绑定',
      action: 'bind'
    }
  }

  if (outcome && outcome.kind === 'room-repair') {
    const repairAction = buildRoomRepairAction(outcome, {
      retryMessage: options.repairRetryDesc || '房间状态已同步，请重新加载日历',
      rebindMessage: options.repairRebindDesc || '当前共享房间已不可用，请重新绑定后再查看日历'
    })
    if (repairAction.action === 'retry') {
      return {
        title: options.repairRetryTitle || '房间状态已更新',
        desc: repairAction.message,
        actionText: options.retryActionText || '重新加载',
        action: 'retry'
      }
    }
    if (repairAction.action === 'rebind') {
      return {
        title: options.repairRebindTitle || '房间状态已变化',
        desc: repairAction.message,
        actionText: options.bindActionText || '去绑定',
        action: 'bind'
      }
    }
    return {
      title: options.repairFailureTitle || '房间同步失败',
      desc: repairAction.message,
      actionText: options.retryActionText || '重试',
      action: 'retry'
    }
  }

  return {
    title: options.failureTitle || '加载失败',
    desc: presentUserFailure(outcome && outcome.message ? outcome.message : (options.fallbackDesc || '请检查网络后重试')),
    actionText: options.retryActionText || '重试',
    action: 'retry'
  }
}

function buildModalRoomAccessPrompt(outcome, options = {}) {
  if (outcome && outcome.kind === 'retryable-failure') {
    return {
      mode: 'retry',
      title: options.retryTitle || '操作失败',
      content: options.retryContent || '操作失败，请检查网络'
    }
  }

  if (outcome && outcome.kind === 'room-repair') {
    const repairAction = buildRoomRepairAction(outcome)
    if (repairAction.action === 'retry') {
      return {
        mode: 'retry',
        title: options.repairRetryTitle || '房间状态已更新',
        content: options.repairRetryContent || '房间状态已更新，请重试'
      }
    }
    if (repairAction.action === 'rebind') {
      return {
        mode: 'navigate-to-bind',
        title: options.repairRebindTitle || '房间状态已变化',
        content: repairAction.message
      }
    }
    return {
      mode: 'retry',
      title: options.repairFailureTitle || '房间同步失败',
      content: repairAction.message
    }
  }

  if (outcome && outcome.kind === 'no-room') {
    return {
      mode: 'navigate-to-bind',
      title: options.noRoomTitle || '请先绑定房间',
      content: options.noRoomContent || '当前操作需要先绑定房间'
    }
  }

  return {
    mode: 'toast',
    title: options.failureTitle || '操作失败',
    content: presentUserFailure(outcome && outcome.message ? outcome.message : (options.failureContent || '操作失败'))
  }
}

function buildRoomDisplayState(room) {
  if (room && room.bound && room.roomCode) {
    return { roomCode: room.roomCode, roomCodeDisplay: room.roomCode }
  }
  if (room && (room.kind === 'retryable-failure' || room.errorMsg)) {
    return { roomCode: '', roomCodeDisplay: '同步失败，请重试' }
  }
  return { roomCode: '', roomCodeDisplay: '未绑定' }
}

function buildRoomDisplayStateFromAccessOutcome(outcome) {
  if (outcome && outcome.kind === 'room-repair') {
    const repair = outcome.repair || {}
    if (repair.kind === 'success') {
      return buildRoomDisplayState(repair)
    }
    return null
  }

  if (outcome && outcome.kind === 'no-room') {
    return buildRoomDisplayState(null)
  }

  return null
}

module.exports = {
  buildInlineRoomStatus,
  buildRoomDisplayStateFromAccessOutcome,
  buildModalRoomAccessPrompt,
  buildRoomDisplayState,
  buildRoomRepairAction,
  isStaleRoomFailure,
  presentUserFailure,
  shouldClearCachedRoom
}
