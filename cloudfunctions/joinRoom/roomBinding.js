const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_ROOM_CODE_ATTEMPTS = 5

function createRoomBinding({ db, serverDate, generateRoomCode = createRandomRoomCode }) {
  const rooms = db.collection('rooms')

  return {
    async create({ openid, nickName }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }

      const existing = await findRoomByMember(openid)
      if (existing) return { code: 0, room: existing }

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
            return { code: -1, msg: '房间创建确认失败，请重试' }
          }

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
          throw error
        }
      }

      return { code: -1, msg: '房间码生成失败，请重试' }
    },

    async join({ openid, roomCode, nickName }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }
      const normalizedRoomCode = normalizeRoomCode(roomCode)
      if (!normalizedRoomCode) return { code: -1, msg: '请填写房间码' }

      const room = await findRoomByCode(normalizedRoomCode)
      if (!room) return { code: -2, msg: '房间不存在，请检查房间码' }

      if (room.createdBy === openid) return { code: -3, msg: '这是你自己的房间' }

      if (room.partnerOpenid === openid) {
        return { code: 0, msg: '已在房间中', roomCode: room.roomCode || normalizedRoomCode }
      }

      if (room.status === 'paired' && room.partnerOpenid) {
        return { code: -4, msg: '房间已满' }
      }

      await rooms.doc(room._id).update({
        data: {
          partnerOpenid: openid,
          partnerName: nickName || 'TA',
          status: 'paired',
          pairedAt: serverDate()
        }
      })

      return { code: 0, msg: '加入成功', roomCode: room.roomCode || normalizedRoomCode }
    },

    async getActive({ openid }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }

      const room = await findRoomByMember(openid)
      if (!room) return { code: 1, msg: '未加入任何房间' }

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

function getCreatedRoomId(result) {
  return result && (result._id || result.id)
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

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase()
}

module.exports = {
  createRoomBinding,
  createRandomRoomCode,
  getCreatedRoomId,
  isDuplicateRoomCodeError,
  normalizeRoomCode
}
