const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: -1, msg: '获取用户信息失败' }

  const created = await db.collection('rooms').where({ createdBy: OPENID }).limit(1).get()
  const joined = await db.collection('rooms').where({ partnerOpenid: OPENID }).limit(1).get()
  const room = created.data[0] || joined.data[0]

  if (!room) {
    return { code: 1, msg: '未加入任何房间' }
  }

  return { code: 0, room }
}
