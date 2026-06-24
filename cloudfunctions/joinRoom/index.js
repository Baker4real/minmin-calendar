const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { roomCode } = event
  if (!OPENID) return { code: -1, msg: '获取用户信息失败' }
  if (!roomCode) return { code: -1, msg: '请填写房间码' }
  const normalizedRoomCode = String(roomCode).trim().toUpperCase()

  // 查找房间
  const roomRes = await db.collection('rooms').where({
    roomCode: normalizedRoomCode
  }).get()

  if (roomRes.data.length === 0) {
    return { code: -2, msg: '房间不存在，请检查房间码' }
  }

  const room = roomRes.data[0]

  // 不能加入自己的房间
  if (room.createdBy === OPENID) {
    return { code: -3, msg: '这是你自己的房间' }
  }

  // 本人已经在这个房间里时，恢复本地绑定即可。
  if (room.partnerOpenid === OPENID) {
    return { code: 0, msg: '已在房间中', roomCode: room.roomCode || normalizedRoomCode }
  }

  // 如果房间已有其他伙伴
  if (room.status === 'paired' && room.partnerOpenid) {
    return { code: -4, msg: '房间已满' }
  }

  // 加入房间
  await db.collection('rooms').doc(room._id).update({
    data: {
      partnerOpenid: OPENID,
      partnerName: event.nickName || 'TA',
      status: 'paired',
      pairedAt: db.serverDate()
    }
  })

  return { code: 0, msg: '加入成功', roomCode: room.roomCode || normalizedRoomCode }
}
