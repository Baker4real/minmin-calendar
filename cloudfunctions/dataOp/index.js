const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ALLOWED_COLLECTIONS = ['periods', 'memories']

async function getRoomForUser(roomCode, openid) {
  if (!roomCode || !openid) return null

  const created = await db.collection('rooms')
    .where({ roomCode, createdBy: openid })
    .limit(1)
    .get()
  if (created.data.length > 0) return created.data[0]

  const joined = await db.collection('rooms')
    .where({ roomCode, partnerOpenid: openid })
    .limit(1)
    .get()
  return joined.data[0] || null
}

function cleanData(data) {
  const payload = Object.assign({}, data || {})
  delete payload._id
  delete payload.roomCode
  delete payload.createdBy
  delete payload.createdAt
  return payload
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, collection, data, id } = event
  // action: list | add | update | remove

  if (!ALLOWED_COLLECTIONS.includes(collection)) {
    return { code: -1, msg: '不支持的数据集合' }
  }
  if (!event.roomCode) {
    return { code: -1, msg: '缺少房间码' }
  }

  try {
    const roomCode = String(event.roomCode).toUpperCase()
    const room = await getRoomForUser(roomCode, OPENID)
    if (!room) return { code: -1, msg: '无权访问该房间' }

    if (action === 'list') {
      const order = collection === 'periods'
        ? ['startDate', 'desc']
        : ['date', 'desc']
      const res = await db.collection(collection)
        .where({ roomCode })
        .orderBy(order[0], order[1])
        .get()
      return { code: 0, data: res.data }
    }

    if (action === 'add') {
      const payload = cleanData(data)
      payload.roomCode = roomCode
      payload.createdBy = OPENID
      payload.createdAt = db.serverDate()
      const res = await db.collection(collection).add({ data: payload })
      return { code: 0, id: res._id }
    }

    if (action === 'update') {
      const existing = await db.collection(collection)
        .where({ _id: id, roomCode })
        .limit(1)
        .get()
      if (existing.data.length === 0) return { code: -1, msg: '记录不存在或无权修改' }

      await db.collection(collection).doc(id).update({ data: cleanData(data) })
      return { code: 0 }
    }

    if (action === 'remove') {
      const existing = await db.collection(collection)
        .where({ _id: id, roomCode })
        .limit(1)
        .get()
      if (existing.data.length === 0) return { code: -1, msg: '记录不存在或无权删除' }

      await db.collection(collection).doc(id).remove()
      return { code: 0 }
    }

    return { code: -1, msg: '未知操作' }
  } catch (e) {
    return { code: -1, msg: e.message }
  }
}
