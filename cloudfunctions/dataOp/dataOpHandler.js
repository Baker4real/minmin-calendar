const { ALLOWED_COLLECTIONS } = require('./roomRecords')

const ROOM_ERROR_CODES = {
  ROOM_CODE_REQUIRED: 'ROOM_CODE_REQUIRED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_CODE_CONFLICT: 'ROOM_CODE_CONFLICT',
  ROOM_ACCESS_DENIED: 'ROOM_ACCESS_DENIED'
}
// list 成功应答带回的 Room 配对状态只取这两个值；其他取值或没有状态时不带这一项
const ROOM_PAIRING_STATUSES = ['waiting', 'paired']

function createDataOpHandler({ getWXContext, db, records }) {
  return async function dataOpHandler(event = {}) {
    const { OPENID } = getWXContext()
    const { action, collection, data, id } = event

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      return { code: -1, msg: '不支持的数据集合' }
    }
    if (!event.roomCode) {
      return buildFailure('缺少房间码', ROOM_ERROR_CODES.ROOM_CODE_REQUIRED)
    }

    try {
      const roomCode = String(event.roomCode).trim().toUpperCase()
      const roomAccess = await getRoomAccess(roomCode, OPENID)
      if (!roomAccess.allowed) return roomAccess.failure

      if (action === 'list') {
        // 不在 try 里 await：读取失败要让这次调用整体失败（客户端按可重试处理），不能被下面的 catch 变成业务失败
        return records.list({ collection, roomCode })
          .then(result => withRoomStatus(result, roomAccess.room))
      }

      if (action === 'add') {
        return records.add({ collection, roomCode, openid: OPENID, data })
      }

      if (action === 'update') {
        return records.update({ collection, roomCode, id, data })
      }

      if (action === 'remove') {
        return records.remove({ collection, roomCode, id })
      }

      return { code: -1, msg: '未知操作' }
    } catch (error) {
      return { code: -1, msg: error.message }
    }
  }

  async function getRoomAccess(roomCode, openid) {
    if (!roomCode) {
      return {
        allowed: false,
        failure: buildFailure('缺少房间码', ROOM_ERROR_CODES.ROOM_CODE_REQUIRED)
      }
    }
    if (!openid) {
      return {
        allowed: false,
        failure: buildFailure('无权访问该房间', ROOM_ERROR_CODES.ROOM_ACCESS_DENIED)
      }
    }

    const roomResult = await db.collection('rooms')
      .where({ roomCode })
      .limit(100)
      .get()
    if (!roomResult.data.length) {
      return {
        allowed: false,
        failure: buildFailure('房间不存在', ROOM_ERROR_CODES.ROOM_NOT_FOUND)
      }
    }
    if (roomResult.data.length > 1) {
      return {
        allowed: false,
        failure: buildFailure('房间码状态异常，请联系维护者', ROOM_ERROR_CODES.ROOM_CODE_CONFLICT)
      }
    }
    if (roomResult.data[0].status === 'archived') {
      return {
        allowed: false,
        failure: buildFailure('房间已解除绑定，请先恢复房间', ROOM_ERROR_CODES.ROOM_ACCESS_DENIED)
      }
    }
    const room = roomResult.data.find(item =>
      item.createdBy === openid || item.partnerOpenid === openid
    )
    if (room) {
      return { allowed: true, room }
    }
    return {
      allowed: false,
      failure: buildFailure('无权访问该房间', ROOM_ERROR_CODES.ROOM_ACCESS_DENIED)
    }
  }
}

function buildFailure(msg, errorCode) {
  return { code: -1, msg, errorCode }
}

// 配对状态取自鉴权时已读到的 Room 文档，不为它再读一次库；只加状态，不带成员标识、昵称或房间码
function withRoomStatus(result, room) {
  const roomStatus = room && room.status
  if (!result || result.code !== 0 || !ROOM_PAIRING_STATUSES.includes(roomStatus)) return result
  return { ...result, roomStatus }
}

module.exports = {
  ROOM_ERROR_CODES,
  createDataOpHandler
}
