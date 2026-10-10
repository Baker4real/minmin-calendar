const assert = require('node:assert/strict')
const test = require('node:test')

const roomAccess = require('../utils/roomAccessOutcome')

test('buildRoomRepairAction maps repaired membership to retry and rebind actions', () => {
  assert.deepEqual(roomAccess.buildRoomRepairAction({
    kind: 'room-repair',
    repair: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  }, { rebindMessage: '房间状态已变化，请重新绑定' }), {
    kind: 'room-repair',
    action: 'retry',
    message: '房间状态已同步，请重试',
    roomCode: 'ROOM01'
  })

  assert.deepEqual(roomAccess.buildRoomRepairAction({
    kind: 'room-repair',
    roomCode: 'STALE1',
    repair: { kind: 'success', bound: false, roomCode: '' }
  }, { rebindMessage: '房间状态已变化，请重新绑定' }), {
    kind: 'room-repair',
    action: 'rebind',
    message: '房间状态已变化，请重新绑定',
    roomCode: 'STALE1'
  })

  const errors = []
  const originalError = console.error
  console.error = (...args) => {
    errors.push(args.map(item => String(item)).join(' '))
  }
  try {
    assert.deepEqual(roomAccess.buildRoomRepairAction({
      kind: 'room-repair',
      repair: { kind: 'retryable-failure', message: '云函数超时' }
    }, { rebindMessage: '房间状态已变化，请重新绑定' }), {
      kind: 'room-repair',
      action: 'repair-retry',
      message: '网络不稳定，请检查网络后重试',
      roomCode: ''
    })
    assert.match(errors.join('\n'), /云函数超时/)
  } finally {
    console.error = originalError
  }
})

test('presentUserFailure maps technical failures to a next step and leaves product copy alone', () => {
  assert.equal(typeof roomAccess.presentUserFailure, 'function')
  const errors = []
  const originalError = console.error
  console.error = (...args) => {
    errors.push(args.map(item => String(item)).join(' '))
  }
  try {
    assert.equal(
      roomAccess.presentUserFailure('云数据库查询超时 (15000ms)'),
      '网络不稳定，请检查网络后重试'
    )
    assert.equal(
      roomAccess.presentUserFailure('同步房间状态失败：network down'),
      '网络不稳定，请检查网络后重试'
    )
    assert.equal(
      roomAccess.presentUserFailure('无权访问该房间'),
      '房间状态已变化，请重新绑定'
    )
    assert.equal(
      roomAccess.presentUserFailure('记录不存在或无权修改'),
      '这条记录已经不在了，请返回列表查看'
    )
    assert.equal(
      roomAccess.presentUserFailure('加入失败：disk full'),
      '这次没有完成，请重试'
    )
    assert.equal(
      roomAccess.presentUserFailure('你已加入其他房间，请先解除绑定后再创建新房间'),
      '你已加入其他房间，请先解除绑定后再创建新房间'
    )
    assert.equal(roomAccess.presentUserFailure('参数错误'), '参数错误')
    assert.equal(roomAccess.presentUserFailure('服务器忙'), '服务器忙')
    assert.match(errors.join('\n'), /云数据库查询超时 \(15000ms\)/)
    assert.match(errors.join('\n'), /network down/)
    assert.doesNotMatch(errors.join('\n'), /参数错误/)
    assert.doesNotMatch(errors.join('\n'), /请先解除绑定/)
  } finally {
    console.error = originalError
  }
})

test('buildInlineRoomStatus maps room outcomes for the homepage adapter', () => {
  assert.deepEqual(roomAccess.buildInlineRoomStatus({ kind: 'no-room' }, {
    noRoomTitle: '还没绑定房间',
    noRoomDesc: '需要先创建或加入一个共享房间\n才能和对方一起使用'
  }), {
    title: '还没绑定房间',
    desc: '需要先创建或加入一个共享房间\n才能和对方一起使用',
    actionText: '去绑定',
    action: 'bind'
  })

  assert.deepEqual(roomAccess.buildInlineRoomStatus({
    kind: 'room-repair',
    repair: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  }, { context: 'calendar' }), {
    title: '房间状态已更新',
    desc: '房间状态已同步，请重新加载日历',
    actionText: '重新加载',
    action: 'retry'
  })

  assert.deepEqual(roomAccess.buildInlineRoomStatus({
    kind: 'business-failure',
    message: '服务器忙'
  }, { failureTitle: '日历加载失败', fallbackDesc: '请检查网络后重试' }), {
    title: '日历加载失败',
    desc: '服务器忙',
    actionText: '重试',
    action: 'retry'
  })
})

test('buildModalRoomAccessPrompt maps room outcomes for modal adapters', () => {
  assert.deepEqual(roomAccess.buildModalRoomAccessPrompt({ kind: 'retryable-failure' }, {
    retryTitle: '导出失败',
    retryContent: '导出失败，请检查网络',
    noRoomContent: '导出前需要先绑定房间'
  }), {
    mode: 'retry',
    title: '导出失败',
    content: '导出失败，请检查网络'
  })

  assert.deepEqual(roomAccess.buildModalRoomAccessPrompt({
    kind: 'room-repair',
    repair: { kind: 'success', bound: false, roomCode: '' }
  }, {
    retryTitle: '导出失败',
    retryContent: '导出失败，请检查网络',
    noRoomContent: '导出前需要先绑定房间'
  }), {
    mode: 'navigate-to-bind',
    title: '房间状态已变化',
    content: '房间状态已变化，请重新绑定'
  })

  assert.deepEqual(roomAccess.buildModalRoomAccessPrompt({ kind: 'no-room' }, {
    retryTitle: '导出失败',
    retryContent: '导出失败，请检查网络',
    noRoomContent: '导出前需要先绑定房间'
  }), {
    mode: 'navigate-to-bind',
    title: '请先绑定房间',
    content: '导出前需要先绑定房间'
  })
})

test('buildRoomDisplayState maps active room and repair results for settings', () => {
  assert.deepEqual(roomAccess.buildRoomDisplayState({
    kind: 'success',
    bound: true,
    roomCode: 'ROOM01'
  }), {
    roomCode: 'ROOM01',
    roomCodeDisplay: 'ROOM01'
  })

  assert.deepEqual(roomAccess.buildRoomDisplayState({
    kind: 'retryable-failure',
    errorMsg: '同步失败'
  }), {
    roomCode: '',
    roomCodeDisplay: '同步失败，请重试'
  })

  assert.deepEqual(roomAccess.buildRoomDisplayState({
    kind: 'success',
    bound: false,
    roomCode: ''
  }), {
    roomCode: '',
    roomCodeDisplay: '未绑定'
  })
})

test('buildRoomDisplayStateFromAccessOutcome maps export outcomes that should resync settings display', () => {
  assert.deepEqual(roomAccess.buildRoomDisplayStateFromAccessOutcome({
    kind: 'room-repair',
    roomCode: 'STALE1',
    repair: {
      kind: 'success',
      bound: true,
      roomCode: 'ROOM02'
    }
  }), {
    roomCode: 'ROOM02',
    roomCodeDisplay: 'ROOM02'
  })

  assert.deepEqual(roomAccess.buildRoomDisplayStateFromAccessOutcome({
    kind: 'room-repair',
    roomCode: 'STALE1',
    repair: {
      kind: 'success',
      bound: false,
      roomCode: ''
    }
  }), {
    roomCode: '',
    roomCodeDisplay: '未绑定'
  })

  assert.deepEqual(roomAccess.buildRoomDisplayStateFromAccessOutcome({ kind: 'no-room' }), {
    roomCode: '',
    roomCodeDisplay: '未绑定'
  })

  assert.equal(roomAccess.buildRoomDisplayStateFromAccessOutcome({
    kind: 'room-repair',
    roomCode: 'STALE1',
    repair: {
      kind: 'retryable-failure',
      message: '同步失败'
    }
  }), null)
})

// Stale room classification
test('isStaleRoomFailure recognizes structured room access failures', () => {
  assert.equal(roomAccess.isStaleRoomFailure({
    code: -1,
    errorCode: 'ROOM_ACCESS_DENIED',
    msg: '无权访问该房间'
  }), true)
  assert.equal(roomAccess.isStaleRoomFailure({
    code: -1,
    errorCode: 'ROOM_NOT_FOUND',
    msg: '房间不存在'
  }), true)
  assert.equal(roomAccess.isStaleRoomFailure({
    code: -1,
    errorCode: 'NO_ACTIVE_ROOM',
    msg: '当前没有绑定房间'
  }), true)
})

test('isStaleRoomFailure lets structured non-room errors override legacy message matching', () => {
  assert.equal(roomAccess.isStaleRoomFailure({
    code: -1,
    errorCode: 'VALIDATION_ERROR',
    msg: '备注里不能填写“无权访问该房间”'
  }), false)
})

test('isStaleRoomFailure still supports legacy room access messages without an errorCode', () => {
  assert.equal(roomAccess.isStaleRoomFailure({ code: -1, msg: '无权访问该房间' }), true)
  assert.equal(roomAccess.isStaleRoomFailure({ code: -1, msg: '房间不存在' }), true)
  assert.equal(roomAccess.isStaleRoomFailure({ code: -1, msg: '不支持的字段: 无权访问该房间' }), false)
  assert.equal(roomAccess.isStaleRoomFailure({ code: -1, msg: '普通业务失败' }), false)
})

test('shouldClearCachedRoom centralizes getMyRoom stale-cache decisions', () => {
  assert.equal(roomAccess.shouldClearCachedRoom({ code: 1, msg: '未加入任何房间' }, ''), true)
  assert.equal(roomAccess.shouldClearCachedRoom({ code: 0, room: null }, ''), true)
  assert.equal(roomAccess.shouldClearCachedRoom({
    code: -1,
    errorCode: 'ROOM_ACCESS_DENIED',
    msg: '无权访问该房间'
  }, ''), true)
  assert.equal(roomAccess.shouldClearCachedRoom({
    code: -1,
    errorCode: 'VALIDATION_ERROR',
    msg: '备注里不能填写“无权访问该房间”'
  }, ''), false)
  assert.equal(roomAccess.shouldClearCachedRoom({
    code: 1,
    errorCode: 'VALIDATION_ERROR',
    msg: '临时业务失败'
  }, ''), false)
})
