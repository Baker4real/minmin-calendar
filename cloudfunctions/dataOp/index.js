const cloud = require('wx-server-sdk')
const { ALLOWED_COLLECTIONS, createRoomRecords } = require('./roomRecords')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const records = createRoomRecords({ db, serverDate: () => db.serverDate() })

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
      return records.list({ collection, roomCode })
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
  } catch (e) {
    return { code: -1, msg: e.message }
  }
}
