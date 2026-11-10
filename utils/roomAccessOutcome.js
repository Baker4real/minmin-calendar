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

const OPERATION_COPY = {
  list: { title: '加载失败', retry: '加载失败，请检查网络', repairedTitle: '房间状态已同步', repaired: '房间状态已同步，请重试' },
  save: {
    title: '保存失败',
    check: '保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交',
    repairedTitle: '房间状态已同步'
  },
  delete: {
    title: '删除失败',
    check: '删除结果暂未确认，请返回列表刷新后确认记录是否已删除，避免重复操作',
    repairedTitle: '房间状态已同步'
  },
  export: { title: '导出失败', retry: '导出失败，请检查网络', repairedTitle: '房间状态已更新', repaired: '房间状态已更新，请重试导出' },
  home: { title: '日历加载失败', repairedTitle: '房间状态已更新', repaired: '房间状态已同步，请重新加载日历' }
}

// The operation, not the caller, decides whether another attempt needs a record check.
function presentRoomAccessFailure(outcome, operation) {
  const copy = OPERATION_COPY[operation]
  const home = operation === 'home'
  const repair = outcome && outcome.kind === 'room-repair' ? buildRoomRepairAction(outcome) : null
  const result = repair ? { ...outcome, ...repair } : outcome

  if (outcome && outcome.kind === 'no-room') {
    return {
      mode: home ? 'inline' : 'navigate-to-bind',
      title: home ? '还没绑定房间' : '请先绑定房间',
      content: home ? '需要先创建或加入一个共享房间\n才能和对方一起使用'
        : operation === 'export' ? '导出前需要先绑定房间' : '当前操作需要先绑定房间',
      action: 'bind',
      actionText: '去绑定',
      result: { kind: 'no-room', message: '请先绑定房间' }
    }
  }

  if (repair && repair.action === 'rebind') {
    return {
      mode: home ? 'inline' : 'navigate-to-bind',
      title: '房间状态已变化',
      content: home ? '当前共享房间已不可用，请重新绑定后再查看日历' : repair.message,
      action: 'bind',
      actionText: '去绑定',
      result
    }
  }

  if (outcome && outcome.kind === 'save-not-applied') {
    const message = '没有保存成功，请重试'
    return {
      mode: 'acknowledge', title: copy.title, content: message, action: 'refresh-check',
      result: { kind: 'retryable-failure', action: 'refresh-check', message }
    }
  }

  if (repair || (outcome && outcome.kind === 'retryable-failure')) {
    const repaired = repair && repair.action === 'retry'
    const title = repaired ? copy.repairedTitle
      : repair && (home || operation === 'export') ? '房间同步失败' : copy.title
    const message = repaired ? copy.repaired : repair ? repair.message
      : home ? presentUserFailure(outcome.message || '请检查网络后重试') : copy.retry
    if (copy.check) {
      // Remove a direct-retry suffix before asking the user to check a mutation.
      const explanation = repaired ? '房间状态已同步' : repair ? message.replace(/，请重试$/, '') : ''
      const content = explanation ? `${explanation}\n\n${copy.check}` : copy.check
      return {
        mode: 'acknowledge', title, content, action: 'refresh-check',
        result: { ...result, action: 'refresh-check', message: content }
      }
    }
    return {
      mode: home ? 'inline' : 'retry', title, content: message,
      action: 'retry', actionText: home && repaired ? '重新加载' : '重试', result
    }
  }

  const content = presentUserFailure(outcome && outcome.message ? outcome.message : copy.title)
  return {
    mode: home ? 'inline' : 'toast', title: copy.title, content,
    action: home ? 'retry' : 'none', actionText: home ? '重试' : '',
    result: { ...outcome, message: content }
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
  presentRoomAccessFailure,
  buildRoomDisplayStateFromAccessOutcome,
  buildRoomDisplayState,
  buildRoomRepairAction,
  isStaleRoomFailure,
  presentUserFailure,
  shouldClearCachedRoom
}
