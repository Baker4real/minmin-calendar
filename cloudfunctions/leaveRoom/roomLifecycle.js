function createRoomLifecycle({ db, serverDate }) {
  const rooms = db.collection('rooms')
  const roomMembers = db.collection('roomMembers')

  return {
    async leave({ openid }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }

      const room = await findRoomByMember(openid)
      if (!room) {
        await releaseMemberLock({ openid })
        return { code: 0, removedCount: 0, deletedCount: 0 }
      }

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
    const created = await rooms.where({ createdBy: openid }).limit(100).get()
    const activeCreated = created.data.find(isActiveRoom)
    if (activeCreated) return activeCreated

    const joined = await rooms.where({ partnerOpenid: openid }).limit(100).get()
    return joined.data.find(isActiveRoom) || null
  }

  async function leaveCreator(room, openid) {
    const partnerOpenid = room.partnerOpenid && room.partnerOpenid !== openid
      ? room.partnerOpenid
      : ''

    if (!partnerOpenid) {
      const archiveResult = await archiveRoomIfStillEmpty(room, {
        createdBy: openid,
        createdByName: room.createdByName || 'TA'
      })
      if (getUpdatedCount(archiveResult) === 0) {
        const latestRoom = await findRoomById(room._id)
        if (latestRoom && latestRoom.createdBy === openid && latestRoom.partnerOpenid && latestRoom.partnerOpenid !== openid && isActiveRoom(latestRoom)) {
          return leaveCreator(latestRoom, openid)
        }
        await releaseMemberLock({ openid })
        return { code: 0, removedCount: 1, deletedCount: 0 }
      }
      await releaseMemberLock({ openid })
      return { code: 0, removedCount: 1, deletedCount: 0, archivedCount: 1 }
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
    await releaseMemberLock({ openid })
    await updateMemberLock({
      openid: partnerOpenid,
      room,
      role: 'creator'
    })
    return { code: 0, removedCount: 1, deletedCount: 0 }
  }

  async function leavePartner(room) {
    if (!room.createdBy) {
      const archiveResult = await archivePartnerOnlyRoom(room)
      await releaseMemberLock({ openid: room.partnerOpenid })
      return {
        code: 0,
        removedCount: 1,
        deletedCount: 0,
        archivedCount: getUpdatedCount(archiveResult) > 0 ? 1 : 0
      }
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
    await releaseMemberLock({ openid: room.partnerOpenid })
    return { code: 0, removedCount: 1, deletedCount: 0 }
  }

  async function archivePartnerOnlyRoom(room) {
    const data = buildArchivedRoomData({
      createdBy: room.partnerOpenid,
      createdByName: room.partnerName || 'TA'
    })
    const result = await rooms.where({
      _id: room._id,
      createdBy: '',
      partnerOpenid: room.partnerOpenid
    }).update({
      data
    })
    if (getUpdatedCount(result) > 0 || typeof room.createdBy !== 'undefined') {
      return result
    }
    return rooms.where({
      _id: room._id,
      partnerOpenid: room.partnerOpenid
    }).update({
      data
    })
  }

  async function findRoomById(id) {
    const roomRes = await rooms.where({ _id: id }).limit(1).get()
    return roomRes.data[0] || null
  }

  async function archiveRoomIfStillEmpty(room, owner) {
    const data = buildArchivedRoomData(owner)

    const result = await rooms.where({
      _id: room._id,
      createdBy: owner.createdBy || '',
      status: 'waiting',
      partnerOpenid: ''
    }).update({
      data
    })
    if (getUpdatedCount(result) > 0 || typeof room.partnerOpenid !== 'undefined') {
      return result
    }

    return rooms.where({
      _id: room._id,
      createdBy: owner.createdBy || '',
      status: 'waiting'
    }).update({
      data: {
        ...data,
        partnerOpenid: ''
      }
    })
  }

  function buildArchivedRoomData(owner) {
    return {
      createdBy: owner.createdBy || '',
      createdByName: owner.createdByName || 'TA',
      partnerOpenid: '',
      partnerName: '',
      status: 'archived',
      pairedAt: null,
      archivedAt: serverDate(),
      updatedAt: serverDate()
    }
  }

  async function releaseMemberLock({ openid }) {
    if (!openid) return
    await roomMembers.where({ _id: openid }).remove()
  }

  async function updateMemberLock({ openid, room, role }) {
    if (!openid) return
    await roomMembers.doc(openid).update({
      data: {
        roomId: room._id,
        roomCode: room.roomCode,
        role,
        updatedAt: serverDate()
      }
    })
  }

  function isActiveRoom(room) {
    return room && room.status !== 'archived'
  }

  function getUpdatedCount(result) {
    if (!result) return 0
    if (typeof result.updated === 'number') return result.updated
    if (typeof result.modified === 'number') return result.modified
    if (result.stats && typeof result.stats.updated === 'number') return result.stats.updated
    return 0
  }
}

module.exports = {
  createRoomLifecycle
}
