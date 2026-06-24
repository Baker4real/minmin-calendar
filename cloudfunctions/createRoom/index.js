const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '获取用户信息失败' }

  // 检查是否已有房间
  const created = await db.collection('rooms').where({ createdBy: OPENID }).limit(1).get()
  const joined = await db.collection('rooms').where({ partnerOpenid: OPENID }).limit(1).get()
  const existing = created.data[0] || joined.data[0]

  if (existing) {
    return { code: 0, room: existing }
  }

  // 生成6位随机房间码
  let roomCode = ''
  let roomCodeReady = false
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 5; attempt++) {
    roomCode = ''
    for (let i = 0; i < 6; i++) {
      roomCode += chars[Math.floor(Math.random() * chars.length)]
    }
    const duplicate = await db.collection('rooms').where({ roomCode }).limit(1).get()
    if (duplicate.data.length === 0) {
      roomCodeReady = true
      break
    }
  }
  if (!roomCodeReady) return { code: -1, msg: '房间码生成失败，请重试' }

  const result = await db.collection('rooms').add({
    data: {
      roomCode,
      createdBy: OPENID,
      createdByName: event.nickName || 'TA',
      partnerOpenid: '',
      partnerName: '',
      createdAt: db.serverDate(),
      status: 'waiting' // waiting | paired
    }
  })

  return {
    code: 0,
    room: {
      _id: result._id,
      roomCode,
      createdBy: OPENID,
      status: 'waiting'
    }
  }
}
