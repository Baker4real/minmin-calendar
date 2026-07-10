const { randomBytes } = require('node:crypto')

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_ROOM_CODE_ATTEMPTS = 5
const TRANSACTION_ATTEMPTS = 3

function createRoomMembershipLifecycle({
  db,
  serverDate,
  generateRoomCode = createRandomRoomCode,
  generateRoomId = createRandomRoomId,
  runTransaction = (callback, times) => db.runTransaction(callback, times)
}) {
  const rooms = db.collection('rooms')

  return {
    async create({ openid, nickName }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }

      const existing = await findRoomByMember(openid)
      if (existing) return { code: 0, room: existing }

      const archived = await findArchivedRoomByCreator(openid)
      if (archived) {
        const restoredAt = serverDate()
        const outcome = await runTransaction(transaction => createRoomInTransaction(transaction, {
          openid,
          nickName,
          archivedRoomId: archived._id,
          restoredAt
        }), TRANSACTION_ATTEMPTS)
        return buildCreateTransactionOutcome(outcome)
      }

      for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt++) {
        const roomCode = normalizeRoomCode(generateRoomCode())
        if (!roomCode) continue
        if (await findRoomByCode(roomCode)) continue

        const roomId = String(generateRoomId() || '')
        if (!roomId) continue
        const createdAt = serverDate()

        try {
          const outcome = await runTransaction(transaction => createRoomInTransaction(transaction, {
            openid,
            nickName,
            roomId,
            roomCode,
            createdAt
          }), TRANSACTION_ATTEMPTS)
          return buildCreateTransactionOutcome(outcome)
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

      const existing = await findRoomByMember(openid)
      if (existing) return buildJoinOutcomeForExistingMember(existing, {
        openid,
        roomCode: normalizedRoomCode
      })

      const candidate = await findRoomByCode(normalizedRoomCode)
      if (!candidate || candidate.status === 'archived') {
        return { code: -2, msg: '房间不存在，请检查房间码' }
      }

      const pairedAt = serverDate()
      const outcome = await runTransaction(transaction => joinRoomInTransaction(transaction, {
        openid,
        nickName,
        roomId: candidate._id,
        roomCode: normalizedRoomCode,
        pairedAt
      }), TRANSACTION_ATTEMPTS)

      if (outcome.type === 'existing') {
        return buildJoinOutcomeForExistingMember(outcome.room, {
          openid,
          roomCode: normalizedRoomCode
        })
      }
      if (outcome.type === 'missing') return { code: -2, msg: '房间不存在，请检查房间码' }
      if (outcome.type === 'own') return { code: -3, msg: '这是你自己的房间' }
      if (outcome.type === 'full') return { code: -4, msg: '房间已满' }
      if (outcome.type === 'member-conflict') {
        return buildJoinOutcomeForMemberLock({ roomCode: normalizedRoomCode, lock: outcome.member })
      }
      return { code: 0, msg: '加入成功', roomCode: outcome.room.roomCode || normalizedRoomCode }
    },

    async getActive({ openid }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }
      const room = await findRoomByMember(openid)
      if (!room) return { code: 1, msg: '未加入任何房间', errorCode: 'NO_ACTIVE_ROOM' }
      return { code: 0, room }
    },

    async leave({ openid }) {
      if (!openid) return { code: -1, msg: '获取用户信息失败' }

      const candidate = await findRoomByMember(openid)
      const changedAt = serverDate()
      return runTransaction(transaction => leaveRoomInTransaction(transaction, {
        openid,
        candidateRoomId: candidate && candidate._id || '',
        changedAt
      }), TRANSACTION_ATTEMPTS)
    }
  }

  async function createRoomInTransaction(transaction, options) {
    const roomMembers = transaction.collection('roomMembers')
    const txRooms = transaction.collection('rooms')
    const member = await readDocument(roomMembers, options.openid)

    if (member) {
      const memberRoom = member.roomId
        ? await readDocument(txRooms, member.roomId)
        : null
      if (isActiveRoom(memberRoom) && isRoomMember(memberRoom, options.openid)) {
        return { type: 'existing', room: memberRoom }
      }
      if (isActiveRoom(memberRoom)) return { type: 'member-conflict', member: sanitizeMemberConflict(member) }
      if (!isRecoverableArchivedMemberLock(member, memberRoom)) {
        return { type: 'member-conflict', member }
      }
      if (memberRoom && memberRoom.status === 'archived' && memberRoom.createdBy === options.openid) {
        return restoreRoomDocuments({
          roomMembers,
          txRooms,
          memberRoom,
          openid: options.openid,
          nickName: options.nickName,
          restoredAt: options.restoredAt || options.createdAt
        })
      }
    }

    if (options.archivedRoomId) {
      const archivedRoom = await readDocument(txRooms, options.archivedRoomId)
      if (!archivedRoom || archivedRoom.status !== 'archived' || archivedRoom.createdBy !== options.openid) {
        return { type: 'restore-failed' }
      }
      return restoreRoomDocuments({
        roomMembers,
        txRooms,
        memberRoom: archivedRoom,
        openid: options.openid,
        nickName: options.nickName,
        restoredAt: options.restoredAt
      })
    }

    const occupiedRoom = await readDocument(txRooms, options.roomId)
    if (occupiedRoom) throw new Error('房间标识冲突，请重试')

    const room = {
      _id: options.roomId,
      roomCode: options.roomCode,
      createdBy: options.openid,
      createdByName: options.nickName || 'TA',
      partnerOpenid: '',
      partnerName: '',
      createdAt: options.createdAt,
      status: 'waiting'
    }
    await txRooms.doc(options.roomId).set({ data: withoutId(room) })
    await roomMembers.doc(options.openid).set({
      data: withoutId(buildMember({
        openid: options.openid,
        room,
        role: 'creator',
        updatedAt: options.createdAt
      }))
    })
    return { type: 'created', room }
  }

  async function restoreRoomDocuments({ roomMembers, txRooms, memberRoom, openid, nickName, restoredAt }) {
    const room = {
      ...memberRoom,
      createdByName: nickName || memberRoom.createdByName || 'TA',
      partnerOpenid: '',
      partnerName: '',
      status: 'waiting',
      pairedAt: null,
      archivedAt: null,
      restoredAt,
      updatedAt: restoredAt
    }
    await txRooms.doc(room._id).update({ data: withoutId(room) })
    await roomMembers.doc(openid).set({
      data: withoutId(buildMember({ openid, room, role: 'creator', updatedAt: restoredAt }))
    })
    return { type: 'created', room }
  }

  async function joinRoomInTransaction(transaction, options) {
    const roomMembers = transaction.collection('roomMembers')
    const txRooms = transaction.collection('rooms')
    const member = await readDocument(roomMembers, options.openid)

    if (member) {
      const memberRoom = member.roomId
        ? await readDocument(txRooms, member.roomId)
        : null
      if (isActiveRoom(memberRoom) && isRoomMember(memberRoom, options.openid)) {
        return { type: 'existing', room: memberRoom }
      }
      if (isActiveRoom(memberRoom)) return { type: 'member-conflict', member: sanitizeMemberConflict(member) }
      return { type: 'member-conflict', member }
    }

    const room = await readDocument(txRooms, options.roomId)
    if (!room || room.status === 'archived' || normalizeRoomCode(room.roomCode) !== options.roomCode) {
      return { type: 'missing' }
    }
    if (room.createdBy === options.openid) return { type: 'own' }
    if (room.partnerOpenid === options.openid) return { type: 'existing', room }
    if (room.status === 'paired' && room.partnerOpenid) return { type: 'full' }
    if (room.status !== 'waiting' || room.partnerOpenid) return { type: 'full' }

    const pairedRoom = {
      ...room,
      partnerOpenid: options.openid,
      partnerName: options.nickName || 'TA',
      status: 'paired',
      pairedAt: options.pairedAt
    }
    await txRooms.doc(room._id).update({ data: withoutId(pairedRoom) })
    await roomMembers.doc(options.openid).set({
      data: withoutId(buildMember({
        openid: options.openid,
        room: pairedRoom,
        role: 'partner',
        updatedAt: options.pairedAt
      }))
    })
    return { type: 'joined', room: pairedRoom }
  }

  async function leaveRoomInTransaction(transaction, { openid, candidateRoomId, changedAt }) {
    const roomMembers = transaction.collection('roomMembers')
    const txRooms = transaction.collection('rooms')
    const member = await readDocument(roomMembers, openid)
    let room = member && member.roomId
      ? await readDocument(txRooms, member.roomId)
      : null
    if (!isActiveRoom(room) || !isRoomMember(room, openid)) room = null

    if (!room && candidateRoomId && candidateRoomId !== (member && member.roomId)) {
      const candidateRoom = await readDocument(txRooms, candidateRoomId)
      if (isActiveRoom(candidateRoom) && isRoomMember(candidateRoom, openid)) {
        room = candidateRoom
      }
    }

    if (!room) {
      if (member) await roomMembers.doc(openid).remove()
      return { code: 0, removedCount: 0, deletedCount: 0 }
    }

    if (room.createdBy === openid) {
      const partnerOpenid = room.partnerOpenid && room.partnerOpenid !== openid
        ? room.partnerOpenid
        : ''
      if (partnerOpenid) {
        const partnerMember = await readDocument(roomMembers, partnerOpenid)
        if (partnerMember && partnerMember.roomId && partnerMember.roomId !== room._id) {
          throw new Error('房间成员资格冲突，请重试')
        }
        const transferredRoom = {
          ...room,
          createdBy: partnerOpenid,
          createdByName: room.partnerName || 'TA',
          partnerOpenid: '',
          partnerName: '',
          status: 'waiting',
          pairedAt: null,
          updatedAt: changedAt
        }
        await txRooms.doc(room._id).update({ data: withoutId(transferredRoom) })
        await roomMembers.doc(openid).remove()
        await roomMembers.doc(partnerOpenid).set({
          data: withoutId(buildMember({
            openid: partnerOpenid,
            room: transferredRoom,
            role: 'creator',
            updatedAt: changedAt,
            previous: partnerMember
          }))
        })
        return { code: 0, removedCount: 1, deletedCount: 0 }
      }

      const archivedRoom = buildArchivedRoomData(room, {
        createdBy: openid,
        createdByName: room.createdByName || 'TA'
      }, changedAt)
      await txRooms.doc(room._id).update({ data: withoutId(archivedRoom) })
      await roomMembers.doc(openid).remove()
      return { code: 0, removedCount: 1, deletedCount: 0, archivedCount: 1 }
    }

    if (room.partnerOpenid === openid) {
      if (!room.createdBy) {
        const archivedRoom = buildArchivedRoomData(room, {
          createdBy: openid,
          createdByName: room.partnerName || 'TA'
        }, changedAt)
        await txRooms.doc(room._id).update({ data: withoutId(archivedRoom) })
        await roomMembers.doc(openid).remove()
        return { code: 0, removedCount: 1, deletedCount: 0, archivedCount: 1 }
      }

      const waitingRoom = {
        ...room,
        partnerOpenid: '',
        partnerName: '',
        status: 'waiting',
        pairedAt: null,
        updatedAt: changedAt
      }
      await txRooms.doc(room._id).update({ data: withoutId(waitingRoom) })
      await roomMembers.doc(openid).remove()
      return { code: 0, removedCount: 1, deletedCount: 0 }
    }

    if (member) await roomMembers.doc(openid).remove()
    return { code: 0, removedCount: 0, deletedCount: 0 }
  }

  async function findRoomByMember(openid) {
    const activeStatus = db.command.neq('archived')
    const created = await rooms.where({ createdBy: openid, status: activeStatus }).limit(1).get()
    if (created.data[0]) return created.data[0]
    const joined = await rooms.where({ partnerOpenid: openid, status: activeStatus }).limit(1).get()
    return joined.data[0] || null
  }

  async function findArchivedRoomByCreator(openid) {
    const archived = await rooms.where({ createdBy: openid, status: 'archived' }).limit(1).get()
    return archived.data[0] || null
  }

  async function findRoomByCode(roomCode) {
    const result = await rooms.where({ roomCode }).limit(1).get()
    return result.data[0] || null
  }
}

async function readDocument(collection, id) {
  if (!id) return null
  try {
    const result = await collection.doc(id).get()
    return result && result.data || null
  } catch (error) {
    if (isDocumentNotFoundError(error)) return null
    throw error
  }
}

function isDocumentNotFoundError(error) {
  const text = [error && error.errCode, error && error.code, error && error.errMsg, error && error.message]
    .filter(Boolean)
    .join(' ')
  return /not.?found|does not exist|不存在/i.test(text)
}

function buildCreateTransactionOutcome(outcome) {
  if (outcome.type === 'existing') return { code: 0, room: outcome.room }
  if (outcome.type === 'member-conflict') return buildCreateOutcomeForMemberLock({ lock: outcome.member })
  if (outcome.type === 'restore-failed') return { code: -1, msg: '房间恢复失败，请重试' }
  const room = outcome.room
  return {
    code: 0,
    room: {
      _id: room._id,
      roomCode: room.roomCode,
      createdBy: room.createdBy,
      status: room.status
    }
  }
}

function buildMember({ openid, room, role, updatedAt, previous = {} }) {
  return {
    ...previous,
    _id: openid,
    openid,
    roomId: room._id,
    roomCode: room.roomCode,
    role,
    updatedAt
  }
}

function sanitizeMemberConflict(member) {
  return { ...member, roomCode: '' }
}

function buildArchivedRoomData(room, owner, changedAt) {
  return {
    ...room,
    createdBy: owner.createdBy || '',
    createdByName: owner.createdByName || 'TA',
    partnerOpenid: '',
    partnerName: '',
    status: 'archived',
    pairedAt: null,
    archivedAt: changedAt,
    updatedAt: changedAt
  }
}

function withoutId(record) {
  const { _id, ...data } = record
  return data
}

function createRandomRoomId() {
  return randomBytes(16).toString('hex')
}

function isActiveRoom(room) {
  return room && room.status !== 'archived'
}

function isRoomMember(room, openid) {
  return Boolean(room && (room.createdBy === openid || room.partnerOpenid === openid))
}

function isRecoverableArchivedMemberLock(lock, room) {
  if (!lock || !room) return false
  const lockRoomId = lock.roomId || ''
  const lockRoomCode = normalizeRoomCode(lock.roomCode)
  const roomCode = normalizeRoomCode(room.roomCode)
  return (!lockRoomId || lockRoomId === room._id) &&
    (!lockRoomCode || lockRoomCode === roomCode)
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

function getRemovedCount(result) {
  if (!result) return 0
  if (typeof result.removed === 'number') return result.removed
  if (typeof result.deleted === 'number') return result.deleted
  if (result.stats && typeof result.stats.removed === 'number') return result.stats.removed
  return 0
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
  createRoomMembershipLifecycle,
  createRandomRoomCode,
  getCreatedRoomId,
  getUpdatedCount,
  isDuplicateMemberLockError,
  isDuplicateRoomCodeError,
  normalizeRoomCode
}
