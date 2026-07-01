// 云数据库工具层 — 统一通过云函数操作，避免小程序端数据库权限影响共享读写。
const roomSession = require('./room')

// ===== 查询超时包装 =====
const QUERY_TIMEOUT = 15000 // 15 秒超时
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

function withTimeout(promise, ms = QUERY_TIMEOUT) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`云数据库查询超时 (${ms}ms)`)), ms)
    )
  ])
}

function getRoomCode() {
  return roomSession.getRoomCode()
}

function createRoomDataClient(options = {}) {
  const cloud = options.cloud || createWxCloud()
  const session = options.roomSession || roomSession
  const timeoutMs = options.timeoutMs || QUERY_TIMEOUT

  async function runAction(action, collection, data, id) {
    const activeRoom = await resolveActiveRoom(session)
    if (activeRoom.kind === 'retryable-failure') {
      return buildRetryableFailure({
        action,
        message: activeRoom.message,
        retry: () => runAction(action, collection, data, id)
      })
    }
    if (activeRoom.kind !== 'success') {
      return { kind: 'no-room' }
    }
    const roomCode = activeRoom.roomCode

    try {
      const res = await withTimeout(
        cloud.callFunction({
          name: 'dataOp',
          data: { action, collection, data, id, roomCode }
        }),
        timeoutMs
      )
      const result = res.result || {}
      if (result.code === 0) {
        return buildSuccessOutcome(action, result)
      }
      if (isStaleRoomFailure(result)) {
        const repair = await session.repairCachedRoom(roomCode)
        return { kind: 'room-repair', roomCode, repair }
      }
      return {
        kind: 'business-failure',
        message: result.msg || '操作失败'
      }
    } catch (error) {
      return buildRetryableFailure({
        action,
        message: getErrorMessage(error),
        retry: () => runAction(action, collection, data, id)
      })
    }
  }

  return {
    list(collection) {
      return runAction('list', collection, {}, '')
    },
    add(collection, data) {
      return runAction('add', collection, data, '')
    },
    update(collection, id, data) {
      return runAction('update', collection, data, id)
    },
    remove(collection, id) {
      return runAction('remove', collection, {}, id)
    }
  }
}

// ======== 经期 ========
async function getPeriods() {
  return runLegacyList('periods')
}

async function addPeriod(data) {
  return runLegacyMutation('add', 'periods', data)
}

async function updatePeriod(id, data) {
  return runLegacyMutation('update', 'periods', data, id)
}

async function deletePeriod(id) {
  return runLegacyMutation('remove', 'periods', {}, id)
}

// ======== 纪念日 ========
async function getMemories() {
  return runLegacyList('memories')
}

async function addMemory(data) {
  return runLegacyMutation('add', 'memories', data)
}

async function updateMemory(id, data) {
  return runLegacyMutation('update', 'memories', data, id)
}

async function deleteMemory(id) {
  return runLegacyMutation('remove', 'memories', {}, id)
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

function getNormalizedRoomCode(session) {
  if (!session || typeof session.getRoomCode !== 'function') return ''
  return String(session.getRoomCode() || '').trim().toUpperCase()
}

async function resolveActiveRoom(session) {
  const cachedRoomCode = getNormalizedRoomCode(session)
  if (cachedRoomCode) {
    return {
      kind: 'success',
      roomCode: cachedRoomCode
    }
  }

  if (!session || typeof session.getActiveRoom !== 'function') {
    return { kind: 'no-room' }
  }

  try {
    const room = await session.getActiveRoom()
    if (room && room.bound && room.roomCode) {
      return {
        kind: 'success',
        roomCode: String(room.roomCode).trim().toUpperCase()
      }
    }
    if (room && (room.kind === 'retryable-failure' || room.errorMsg)) {
      return {
        kind: 'retryable-failure',
        message: room.errorMsg || '同步房间状态失败，请稍后重试'
      }
    }
  } catch (error) {
    return {
      kind: 'retryable-failure',
      message: getErrorMessage(error)
    }
  }

  return { kind: 'no-room' }
}

function buildSuccessOutcome(action, result) {
  if (action === 'list') {
    return {
      kind: 'success',
      data: result.data || []
    }
  }

  return {
    kind: 'success',
    result
  }
}

function isStaleRoomFailure(result) {
  const errorCode = String(result && result.errorCode ? result.errorCode : '')
  if (errorCode) return STALE_ROOM_ERROR_CODES.includes(errorCode)

  const message = String(result && result.msg ? result.msg : '')
  return STALE_ROOM_MESSAGES.some(text => message.includes(text))
}

async function runLegacyList(collection) {
  const outcome = await createRoomDataClient().list(collection)
  return unwrapListOutcome(outcome)
}

async function runLegacyMutation(action, collection, data, id = '') {
  const client = createRoomDataClient()
  if (action === 'add') {
    return unwrapMutationOutcome(await client.add(collection, data))
  }
  if (action === 'update') {
    return unwrapMutationOutcome(await client.update(collection, id, data))
  }
  return unwrapMutationOutcome(await client.remove(collection, id))
}

function unwrapListOutcome(outcome) {
  if (outcome.kind === 'success') {
    return outcome.data
  }
  if (outcome.kind === 'retryable-failure') {
    throw new Error(outcome.message)
  }
  return []
}

function unwrapMutationOutcome(outcome) {
  if (outcome.kind === 'success') {
    return { result: outcome.result }
  }
  if (outcome.kind === 'retryable-failure') {
    throw new Error(outcome.message)
  }
  if (outcome.kind === 'no-room') {
    return { result: { code: -1, msg: '缺少房间码' } }
  }
  if (outcome.kind === 'room-repair') {
    return { result: buildLegacyFailure('房间状态已变化，请重新绑定') }
  }
  return {
    result: buildLegacyFailure(outcome.message || '操作失败')
  }
}

function buildLegacyFailure(message) {
  return {
    code: -1,
    msg: message
  }
}

function buildRetryableFailure({ action, message, retry }) {
  const outcome = {
    kind: 'retryable-failure',
    message,
    retryDescriptor: buildRetryDescriptor(action)
  }
  if (isRetryableAction(action) && typeof retry === 'function') {
    outcome.retry = retry
  }
  return outcome
}

function isRetryableAction(action) {
  return action === 'list'
}

function buildRetryDescriptor(action) {
  if (isRetryableAction(action)) {
    return {
      action,
      mode: 'auto-retry',
      message: '读取失败，可以直接重试'
    }
  }

  return {
    action,
    mode: 'confirm-before-retry',
    message: '保存结果未知，请先确认记录状态后再重试'
  }
}

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  createRoomDataClient,
  getPeriods, addPeriod, updatePeriod, deletePeriod,
  getMemories, addMemory, updateMemory, deleteMemory,
  getRoomCode
}
