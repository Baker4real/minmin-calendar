const cloud = require('wx-server-sdk')
const { createRoomRecords } = require('./roomRecords')
const { createDataOpHandler } = require('./dataOpHandler')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const records = createRoomRecords({
  db,
  serverDate: () => db.serverDate(),
  getOpenid: () => cloud.getWXContext().OPENID
})

exports.main = createDataOpHandler({
  getWXContext: () => cloud.getWXContext(),
  db,
  records
})
