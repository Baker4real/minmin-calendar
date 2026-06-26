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
    const roomCode = getNormalizedRoomCode(session)
    if (!roomCode) {
      return { kind: 'no-room' }
    }

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
      return {
        kind: 'retryable-failure',
        message: getErrorMessage(error),
        retry: () => runAction(action, collection, data, id)
      }
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
  const outcome = await createRoomDataClient().list('periods')
  return unwrapListOutcome(outcome)
}

async function addPeriod(data) {
  const outcome = await createRoomDataClient().add('periods', data)
  return unwrapMutationOutcome(outcome)
}

async function updatePeriod(id, data) {
  const outcome = await createRoomDataClient().update('periods', id, data)
  return unwrapMutationOutcome(outcome)
}

async function deletePeriod(id) {
  const outcome = await createRoomDataClient().remove('periods', id)
  return unwrapMutationOutcome(outcome)
}

// ======== 纪念日 ========
async function getMemories() {
  const outcome = await createRoomDataClient().list('memories')
  return unwrapListOutcome(outcome)
}

async function addMemory(data) {
  const outcome = await createRoomDataClient().add('memories', data)
  return unwrapMutationOutcome(outcome)
}

async function updateMemory(id, data) {
  const outcome = await createRoomDataClient().update('memories', id, data)
  return unwrapMutationOutcome(outcome)
}

async function deleteMemory(id) {
  const outcome = await createRoomDataClient().remove('memories', id)
  return unwrapMutationOutcome(outcome)
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
  const message = String(result && result.msg ? result.msg : '')
  return STALE_ROOM_MESSAGES.some(text => message.includes(text))
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
    return { result: { code: -1, msg: '房间状态已变化，请重新绑定' } }
  }
  return {
    result: {
      code: -1,
      msg: outcome.message || '操作失败'
    }
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
