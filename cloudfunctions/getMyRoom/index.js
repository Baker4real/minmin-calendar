const cloud = require('wx-server-sdk')
const { createRoomBinding } = require('./roomBinding')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const binding = createRoomBinding({ db, serverDate: () => db.serverDate() })

exports.main = async (event = {}, context) => {
  const { OPENID } = cloud.getWXContext()
  try {
    return await binding.getActive({ openid: OPENID })
  } catch (error) {
    return { code: -1, msg: error.message }
  }
}
