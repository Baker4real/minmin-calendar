function createRoomLifecycle({ db, serverDate }) {
  const rooms = db.collection('rooms')

  return {
    async leave({ openid }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }

      const room = await findRoomByMember(openid)
      if (!room) return { code: 0, removedCount: 0, deletedCount: 0 }

      if (room.createdBy === openid) {
        return leaveCreator(room, openid)
      }

      if (room.partnerOpenid === openid) {
        return leavePartner(room)
      }

      return { code: 0, removedCount: 0, deletedCount: 0 }
    }
  }

  async function findRoomByMember(openid) {
    const created = await rooms.where({ createdBy: openid }).limit(1).get()
    if (created.data.length > 0) return created.data[0]

    const joined = await rooms.where({ partnerOpenid: openid }).limit(1).get()
    return joined.data[0] || null
  }

  async function leaveCreator(room, openid) {
    const partnerOpenid = room.partnerOpenid && room.partnerOpenid !== openid
      ? room.partnerOpenid
      : ''

    if (!partnerOpenid) {
      await rooms.doc(room._id).remove()
      return { code: 0, removedCount: 1, deletedCount: 1 }
    }

    await rooms.doc(room._id).update({
      data: {
        createdBy: partnerOpenid,
        createdByName: room.partnerName || 'TA',
        partnerOpenid: '',
        partnerName: '',
        status: 'waiting',
        pairedAt: null,
        updatedAt: serverDate()
      }
    })
    return { code: 0, removedCount: 1, deletedCount: 0 }
  }

  async function leavePartner(room) {
    if (!room.createdBy) {
      await rooms.doc(room._id).remove()
      return { code: 0, removedCount: 1, deletedCount: 1 }
    }

    await rooms.doc(room._id).update({
      data: {
        partnerOpenid: '',
        partnerName: '',
        status: 'waiting',
        pairedAt: null,
        updatedAt: serverDate()
      }
    })
    return { code: 0, removedCount: 1, deletedCount: 0 }
  }
}

module.exports = {
  createRoomLifecycle
}
