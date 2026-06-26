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
    message: repair.message || '同步房间状态失败，请稍后重试',
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
    desc: outcome && outcome.message ? outcome.message : (options.fallbackDesc || '请检查网络后重试'),
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
    content: outcome && outcome.message ? outcome.message : (options.failureContent || '操作失败')
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
  buildRoomRepairAction
}
