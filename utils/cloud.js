// 云数据库工具层 — 统一通过云函数操作，避免小程序端数据库权限影响共享读写。
const roomSession = require('./room')

// ===== 查询超时包装 =====
const QUERY_TIMEOUT = 15000 // 15 秒超时

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

async function callDataOp(action, collection, data, id) {
  const roomCode = getRoomCode()
  return wx.cloud.callFunction({
    name: 'dataOp',
    data: { action, collection, data, id, roomCode }
  })
}

// ======== 经期 ========
async function getPeriods() {
  if (!getRoomCode()) return []
  const res = await withTimeout(callDataOp('list', 'periods', {}, ''))
  return res.result?.data || []
}

async function addPeriod(data) {
  return callDataOp('add', 'periods', data)
}

async function updatePeriod(id, data) {
  return callDataOp('update', 'periods', data, id)
}

async function deletePeriod(id) {
  return callDataOp('remove', 'periods', {}, id)
}

// ======== 纪念日 ========
async function getMemories() {
  if (!getRoomCode()) return []
  const res = await withTimeout(callDataOp('list', 'memories', {}, ''))
  return res.result?.data || []
}

async function addMemory(data) {
  return callDataOp('add', 'memories', data)
}

async function updateMemory(id, data) {
  return callDataOp('update', 'memories', data, id)
}

async function deleteMemory(id) {
  return callDataOp('remove', 'memories', {}, id)
}

module.exports = {
  getPeriods, addPeriod, updatePeriod, deletePeriod,
  getMemories, addMemory, updateMemory, deleteMemory,
  getRoomCode
}
