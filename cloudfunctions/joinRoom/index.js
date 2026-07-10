const cloud = require('wx-server-sdk')
const { createRoomMembershipLifecycle } = require('./roomMembershipLifecycle')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => db.serverDate() })

exports.main = async (event = {}, context) => {
  const { OPENID } = cloud.getWXContext()
  try {
    return await lifecycle.join({
      openid: OPENID,
      roomCode: event.roomCode,
      nickName: event.nickName
    })
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}
