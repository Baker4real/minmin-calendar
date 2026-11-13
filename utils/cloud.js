// 云数据库工具层 — 统一通过云函数操作，避免小程序端数据库权限影响共享读写。
const roomSession = require('./room')
const roomAccessOutcome = require('./roomAccessOutcome')
const { createRoomResolver } = require('./roomResolver')

// ===== 查询超时包装 =====
const QUERY_TIMEOUT = 15000 // 15 秒超时

function withTimeout(promise, ms = QUERY_TIMEOUT) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`云数据库查询超时 (${ms}ms)`)), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

function createRoomDataClient(options = {}) {
  const cloud = options.cloud || createWxCloud()
  const session = options.roomSession || roomSession
  const resolver = options.resolver || createRoomResolver({ session })
  const timeoutMs = options.timeoutMs || QUERY_TIMEOUT

  async function runAction(action, collection, data, id) {
    const resolution = await resolver.resolveActiveRoom()
    if (resolution.kind === 'retryable-failure') {
      return {
        kind: 'retryable-failure',
        message: roomAccessOutcome.presentUserFailure(resolution.message)
      }
    }
    if (resolution.kind !== 'resolved') {
      return { kind: 'no-room' }
    }
    const roomCode = resolution.roomCode

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
        return buildSuccessOutcome(action, result, roomCode)
      }
      if (roomAccessOutcome.isStaleRoomFailure(result)) {
        const repair = await session.repairCachedRoom(roomCode)
        return { kind: 'room-repair', roomCode, repair }
      }
      return {
        kind: 'business-failure',
        message: roomAccessOutcome.presentUserFailure(result.msg || '操作失败')
      }
    } catch (error) {
      return {
        kind: 'retryable-failure',
        message: roomAccessOutcome.presentUserFailure(getErrorMessage(error))
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

function createWxCloud() {
  return getWx().cloud
}

function getWx() {
  if (typeof wx === 'undefined') {
    throw new Error('wx is unavailable outside the WeChat runtime')
  }
  return wx
}

// list 成功结果：记录、本次读取所用的房间码，以及云端带回的 Room 配对状态 roomStatus（waiting / paired）。
// 云端没给状态或取值不认识时不带 roomStatus，调用方按未知处理（旧版 dataOp 不返回它）。
function buildSuccessOutcome(action, result, roomCode) {
  if (action === 'list') {
    const outcome = {
      kind: 'success',
      data: result.data || [],
      roomCode
    }
    if (result.roomStatus === 'waiting' || result.roomStatus === 'paired') outcome.roomStatus = result.roomStatus
    return outcome
  }

  return {
    kind: 'success',
    result
  }
}

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  createRoomDataClient
}
