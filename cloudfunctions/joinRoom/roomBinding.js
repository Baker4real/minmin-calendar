const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_ROOM_CODE_ATTEMPTS = 5

function createRoomBinding({ db, serverDate, generateRoomCode = createRandomRoomCode }) {
  const rooms = db.collection('rooms')
  const roomMembers = db.collection('roomMembers')

  return {
    async create({ openid, nickName }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }

      const existing = await findRoomByMember(openid)
      if (existing) return { code: 0, room: existing }

      const memberLock = await acquireMemberLock({ openid, role: 'creator' })
      if (!memberLock.acquired) return buildCreateOutcomeForMemberLock({ lock: memberLock.lock })

      for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt++) {
        const roomCode = normalizeRoomCode(generateRoomCode())
        if (!roomCode) continue

        const duplicate = await findRoomByCode(roomCode)
        if (duplicate) continue

        try {
          const result = await rooms.add({
            data: {
              roomCode,
              createdBy: openid,
              createdByName: nickName || 'TA',
              partnerOpenid: '',
              partnerName: '',
              createdAt: serverDate(),
              status: 'waiting'
            }
          })
          const createdRoomId = getCreatedRoomId(result)
          const createdRoom = createdRoomId ? await findRoomById(createdRoomId) : null
          const recoverableRoom = isExpectedCreatedRoom(createdRoom, { openid, roomCode })
            ? createdRoom
            : await findCreatedRoomFallback({ openid, roomCode, createdRoomId })

          if (!isExpectedCreatedRoom(recoverableRoom, { openid, roomCode })) {
            await releaseMemberLock({ openid })
            return { code: -1, msg: '房间创建确认失败，请重试' }
          }
          await updateMemberLock({ openid, room: recoverableRoom, role: 'creator' })

          return {
            code: 0,
            room: {
              _id: recoverableRoom._id,
              roomCode: recoverableRoom.roomCode,
              createdBy: recoverableRoom.createdBy,
              status: recoverableRoom.status
            }
          }
        } catch (error) {
          if (isDuplicateRoomCodeError(error)) continue
          await releaseMemberLock({ openid })
          throw error
        }
      }

      await releaseMemberLock({ openid })
      return { code: -1, msg: '房间码生成失败，请重试' }
    },

    async join({ openid, roomCode, nickName }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }
      const normalizedRoomCode = normalizeRoomCode(roomCode)
      if (!normalizedRoomCode) return { code: -1, msg: '请填写房间码' }

      const existing = await findRoomByMember(openid)
      if (existing) return buildJoinOutcomeForExistingMember(existing, { openid, roomCode: normalizedRoomCode })

      let room = await findRoomByCode(normalizedRoomCode)
      if (!room) return { code: -2, msg: '房间不存在，请检查房间码' }

      if (room.createdBy === openid) return { code: -3, msg: '这是你自己的房间' }

      if (room.partnerOpenid === openid) {
        return { code: 0, msg: '已在房间中', roomCode: room.roomCode || normalizedRoomCode }
      }

      if (room.status === 'waiting' && typeof room.partnerOpenid === 'undefined') {
        room = await normalizeWaitingPartnerSlot(room)
        if (!room) return { code: -1, msg: '房间状态同步失败，请重试' }
      }

      if (room.status === 'paired' && room.partnerOpenid) {
        return { code: -4, msg: '房间已满' }
      }

      const memberLock = await acquireMemberLock({
        openid,
        room,
        role: 'partner'
      })
      if (!memberLock.acquired) {
        return buildJoinOutcomeForMemberLock({ roomCode: normalizedRoomCode, lock: memberLock.lock })
      }

      const pairedAt = serverDate()
      const updateResult = await rooms.where({
        _id: room._id,
        status: 'waiting',
        partnerOpenid: ''
      }).update({
        data: {
          partnerOpenid: openid,
          partnerName: nickName || 'TA',
          status: 'paired',
          pairedAt
        }
      })
      const joinedRoom = await findRoomById(room._id)
      const expectedRoom = isExpectedJoinedRoom(joinedRoom, {
        openid,
        roomCode: room.roomCode || normalizedRoomCode,
        roomId: room._id
      })
        ? joinedRoom
        : await findJoinedRoomFallback({
          openid,
          roomCode: room.roomCode || normalizedRoomCode,
          roomId: room._id
        })

      if (!isExpectedJoinedRoom(expectedRoom, {
        openid,
        roomCode: room.roomCode || normalizedRoomCode,
        roomId: room._id
      })) {
        if (getUpdatedCount(updateResult) === 0) {
          await releaseMemberLock({ openid, roomId: room._id })
          return { code: -4, msg: '房间已满' }
        }
        return { code: -1, msg: '加入确认失败，请重试' }
      }
      await updateMemberLock({ openid, room: expectedRoom, role: 'partner' })

      return { code: 0, msg: '加入成功', roomCode: expectedRoom.roomCode || normalizedRoomCode }
    },

    async getActive({ openid }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }

      const room = await findRoomByMember(openid)
      if (!room) return { code: 1, msg: '未加入任何房间', errorCode: 'NO_ACTIVE_ROOM' }

      return { code: 0, room }
    }
  }

  async function findRoomByMember(openid) {
    const created = await rooms.where({ createdBy: openid }).limit(1).get()
    if (created.data.length > 0) return created.data[0]

    const joined = await rooms.where({ partnerOpenid: openid }).limit(1).get()
    return joined.data[0] || null
  }

  async function findRoomByCode(roomCode) {
    const roomRes = await rooms.where({ roomCode }).limit(1).get()
    return roomRes.data[0] || null
  }

  async function findRoomById(id) {
    const roomRes = await rooms.where({ _id: id }).limit(1).get()
    return roomRes.data[0] || null
  }

  async function findCreatedRoomFallback({ openid, roomCode, createdRoomId }) {
    const room = await findRoomByMember(openid)
    if (!isExpectedCreatedRoom(room, { openid, roomCode })) return null
    if (createdRoomId && room._id !== createdRoomId) return null
    return room
  }

  async function findJoinedRoomFallback({ openid, roomCode, roomId }) {
    const room = await findRoomByMember(openid)
    if (!isExpectedJoinedRoom(room, { openid, roomCode, roomId })) return null
    return room
  }

  async function normalizeWaitingPartnerSlot(room) {
    await rooms.where({
      _id: room._id,
      status: 'waiting'
    }).update({
      data: {
        partnerOpenid: '',
        partnerName: room.partnerName || ''
      }
    })
    return findRoomById(room._id)
  }

  async function acquireMemberLock({ openid, room = {}, role }) {
    try {
      await roomMembers.add({
        data: {
          _id: openid,
          openid,
          roomId: room._id || '',
          roomCode: room.roomCode || '',
          role,
          updatedAt: serverDate()
        }
      })
      return { acquired: true }
    } catch (error) {
      if (isDuplicateMemberLockError(error)) {
        return { acquired: false, lock: await findMemberLock(openid) }
      }
      throw error
    }
  }

  async function findMemberLock(openid) {
    const lockRes = await roomMembers.where({ _id: openid }).limit(1).get()
    return lockRes.data[0] || null
  }

  async function updateMemberLock({ openid, room, role }) {
    await roomMembers.doc(openid).update({
      data: {
        roomId: room._id,
        roomCode: room.roomCode,
        role,
        updatedAt: serverDate()
      }
    })
  }

  async function releaseMemberLock({ openid, roomId = '' }) {
    const query = roomId ? { _id: openid, roomId } : { _id: openid }
    await roomMembers.where(query).remove()
  }
}

function buildCreateOutcomeForMemberLock({ lock }) {
  return { code: -5, msg: '你已加入其他房间，请先解除绑定后再创建新房间', roomCode: lock && lock.roomCode || '' }
}

function buildJoinOutcomeForMemberLock({ roomCode, lock }) {
  return { code: -5, msg: '你已加入其他房间，请先解除绑定后再加入新房间', roomCode: lock && lock.roomCode || roomCode }
}

function buildJoinOutcomeForExistingMember(room, { openid, roomCode }) {
  if (isSameRoomCode(room, roomCode)) {
    if (room.createdBy === openid) return { code: -3, msg: '这是你自己的房间' }
    if (room.partnerOpenid === openid) {
      return { code: 0, msg: '已在房间中', roomCode: room.roomCode || roomCode }
    }
  }

  return { code: -5, msg: '你已加入其他房间，请先解除绑定后再加入新房间', roomCode: room.roomCode || '' }
}

function isExpectedCreatedRoom(room, { openid, roomCode }) {
  return Boolean(
    room &&
    room._id &&
    room.roomCode === roomCode &&
    room.createdBy === openid &&
    room.status === 'waiting'
  )
}

function isExpectedJoinedRoom(room, { openid, roomCode, roomId }) {
  return Boolean(
    room &&
    room._id === roomId &&
    isSameRoomCode(room, roomCode) &&
    room.partnerOpenid === openid &&
    room.status === 'paired'
  )
}

function getCreatedRoomId(result) {
  return result && (result._id || result.id)
}

function getUpdatedCount(result) {
  if (!result) return null
  if (typeof result.updated === 'number') return result.updated
  if (typeof result.modified === 'number') return result.modified
  if (result.stats && typeof result.stats.updated === 'number') return result.stats.updated
  return null
}

function isDuplicateRoomCodeError(error) {
  const text = [
    error && error.errCode,
    error && error.code,
    error && error.errMsg,
    error && error.message,
    error && error.index,
    error && error.indexName,
    error && error.keyPattern,
    error && error.keyValue
  ].map(stringifyErrorValue).join(' ')

  return /duplicate|duplicated|E11000|dup key|唯一|重复/i.test(text) &&
    /roomCode|room_code|room\s*code|房间码/i.test(text)
}

function isDuplicateMemberLockError(error) {
  const text = [
    error && error.errCode,
    error && error.code,
    error && error.errMsg,
    error && error.message,
    error && error.index,
    error && error.indexName,
    error && error.keyPattern,
    error && error.keyValue
  ].map(stringifyErrorValue).join(' ')

  return /duplicate|duplicated|E11000|dup key|唯一|重复/i.test(text) &&
    /roomMembers|room_members|openid|_id/i.test(text)
}

function stringifyErrorValue(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch (error) {
    return String(value)
  }
}

function createRandomRoomCode() {
  let roomCode = ''
  for (let i = 0; i < 6; i++) {
    roomCode += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return roomCode
}

function isSameRoomCode(room, roomCode) {
  return normalizeRoomCode(room && room.roomCode) === roomCode
}

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase()
}

module.exports = {
  createRoomBinding,
  createRandomRoomCode,
  getCreatedRoomId,
  getUpdatedCount,
  isDuplicateMemberLockError,
  isDuplicateRoomCodeError,
  normalizeRoomCode
}
