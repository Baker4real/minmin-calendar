const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createRoomBinding } = require('../cloudfunctions/createRoom/roomBinding')

const SERVER_DATE = { serverDate: true }

test('RoomBinding create returns an existing room for an already bound member', async () => {
  const existingRoom = {
    _id: 'room-1',
    roomCode: 'ROOM01',
    createdBy: 'user-a',
    createdByName: 'A',
    partnerOpenid: '',
    partnerName: '',
    status: 'waiting'
  }
  const db = createFakeDb({ rooms: [existingRoom] })
  const binding = createRoomBinding({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => 'NEW001'
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'A' })

  assert.deepEqual(result, { code: 0, room: existingRoom })
  assert.deepEqual(db.data.rooms, [existingRoom])
})

test('RoomBinding create restores the creator archived room instead of creating a new room code', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'Old Name',
      partnerOpenid: '',
      partnerName: '',
      status: 'archived',
      archivedAt: 'old-archive',
      createdAt: 'old'
    }]
  })
  const binding = createRoomBinding({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => 'NEW001'
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'New Name' })

  assert.equal(result.code, 0)
  assert.deepEqual(result.room, {
    _id: 'room-1',
    roomCode: 'ROOM01',
    createdBy: 'user-a',
    status: 'waiting'
  })
  assert.deepEqual(db.data.rooms, [{
    _id: 'room-1',
    roomCode: 'ROOM01',
    createdBy: 'user-a',
    createdByName: 'New Name',
    partnerOpenid: '',
    partnerName: '',
    status: 'waiting',
    archivedAt: null,
    createdAt: 'old',
    pairedAt: null,
    restoredAt: SERVER_DATE,
    updatedAt: SERVER_DATE
  }])
  assert.deepEqual(db.data.roomMembers, [{
    _id: 'user-a',
    openid: 'user-a',
    roomId: 'room-1',
    roomCode: 'ROOM01',
    role: 'creator',
    updatedAt: SERVER_DATE
  }])
})

test('RoomBinding create restores an archived room when a same-room member lock is stale', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'Old Name',
      partnerOpenid: '',
      partnerName: '',
      status: 'archived',
      archivedAt: 'old-archive',
      createdAt: 'old'
    }],
    roomMembers: [{
      _id: 'user-a',
      openid: 'user-a',
      roomId: 'room-1',
      roomCode: 'ROOM01',
      role: 'creator',
      updatedAt: 'old-lock'
    }]
  })
  const binding = createRoomBinding({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => 'NEW001'
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'New Name' })

  assert.equal(result.code, 0)
  assert.equal(result.room.roomCode, 'ROOM01')
  assert.equal(result.room.status, 'waiting')
  assert.deepEqual(db.data.roomMembers, [{
    _id: 'user-a',
    openid: 'user-a',
    roomId: 'room-1',
    roomCode: 'ROOM01',
    role: 'creator',
    updatedAt: SERVER_DATE
  }])
})

test('RoomBinding create stores a new waiting room with a unique code', async () => {
  const db = createFakeDb({
    rooms: [{ _id: 'room-existing', roomCode: 'TAKEN1', createdBy: 'other' }]
  })
  const codes = ['TAKEN1', 'FRESH1']
  const binding = createRoomBinding({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => codes.shift()
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'Min' })

  assert.deepEqual(result, {
    code: 0,
    room: {
      _id: 'room-2',
      roomCode: 'FRESH1',
      createdBy: 'user-a',
      status: 'waiting'
    }
  })
  assert.deepEqual(db.data.rooms[1], {
    _id: 'room-2',
    roomCode: 'FRESH1',
    createdBy: 'user-a',
    createdByName: 'Min',
    partnerOpenid: '',
    partnerName: '',
    createdAt: SERVER_DATE,
    status: 'waiting'
  })
  assert.deepEqual(db.data.roomMembers, [{
    _id: 'user-a',
    openid: 'user-a',
    roomId: 'room-2',
    roomCode: 'FRESH1',
    role: 'creator',
    updatedAt: SERVER_DATE
  }])
})

test('RoomBinding create retries when a unique room code index rejects a raced insert', async () => {
  const db = createFakeDb({
    addErrorsByRoomCode: {
      RACE01: duplicateRoomCodeError()
    }
  })
  const codes = ['RACE01', 'FRESH1']
  const binding = createRoomBinding({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => codes.shift()
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'Min' })

  assert.deepEqual(result, {
    code: 0,
    room: {
      _id: 'room-1',
      roomCode: 'FRESH1',
      createdBy: 'user-a',
      status: 'waiting'
    }
  })
  assert.deepEqual(db.data.rooms.map(room => room.roomCode), ['FRESH1'])
  assert.deepEqual(db.data.roomMembers.map(member => [member._id, member.roomCode]), [['user-a', 'FRESH1']])
})

test('RoomBinding create fails without storing a room when all generated codes conflict', async () => {
  const db = createFakeDb({
    addErrorsByRoomCode: {
      RACE01: duplicateRoomCodeError(),
      RACE02: duplicateRoomCodeError(),
      RACE03: duplicateRoomCodeError(),
      RACE04: duplicateRoomCodeError(),
      RACE05: duplicateRoomCodeError()
    }
  })
  const codes = ['RACE01', 'RACE02', 'RACE03', 'RACE04', 'RACE05']
  const binding = createRoomBinding({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => codes.shift()
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'Min' })

  assert.deepEqual(result, { code: -1, msg: '房间码生成失败，请重试' })
  assert.deepEqual(db.data.rooms, [])
  assert.deepEqual(db.data.roomMembers, [])
})

test('RoomBinding create recovers the inserted room when the add result omits an id', async () => {
  const db = createFakeDb({
    addResultsByRoomCode: {
      GHOST1: {}
    }
  })
  const binding = createRoomBinding({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => 'GHOST1'
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'Min' })

  assert.deepEqual(result, {
    code: 0,
    room: {
      _id: 'room-1',
      roomCode: 'GHOST1',
      createdBy: 'user-a',
      status: 'waiting'
    }
  })
  assert.equal(db.data.rooms.length, 1)
  assert.deepEqual(db.data.roomMembers.map(member => [member._id, member.roomCode]), [['user-a', 'GHOST1']])
})

test('RoomBinding create does not retry duplicate errors for other unique indexes', async () => {
  const db = createFakeDb({
    addErrorsByRoomCode: {
      RACE01: duplicateOtherIndexError()
    }
  })
  const codes = ['RACE01', 'FRESH1']
  const binding = createRoomBinding({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => codes.shift()
  })

  await assert.rejects(
    () => binding.create({ openid: 'user-a', nickName: 'Min' }),
    /createdBy/
  )
  assert.deepEqual(db.data.rooms, [])
  assert.deepEqual(db.data.roomMembers, [])
  assert.deepEqual(codes, ['FRESH1'])
})

test('RoomBinding join normalizes room code and pairs an available room', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      partnerName: '',
      status: 'waiting'
    }]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({
    openid: 'user-b',
    roomCode: ' room01 ',
    nickName: 'B'
  })

  assert.deepEqual(result, { code: 0, msg: '加入成功', roomCode: 'ROOM01' })
  assert.deepEqual(db.data.rooms[0], {
    _id: 'room-1',
    roomCode: 'ROOM01',
    createdBy: 'user-a',
    createdByName: 'A',
    partnerOpenid: 'user-b',
    partnerName: 'B',
    status: 'paired',
    pairedAt: SERVER_DATE
  })
  assert.deepEqual(db.data.roomMembers, [{
    _id: 'user-b',
    openid: 'user-b',
    roomId: 'room-1',
    roomCode: 'ROOM01',
    role: 'partner',
    updatedAt: SERVER_DATE
  }])
})

test('RoomBinding join normalizes a waiting room with a missing partner field', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerName: '',
      status: 'waiting'
    }]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({
    openid: 'user-b',
    roomCode: 'ROOM01',
    nickName: 'B'
  })

  assert.deepEqual(result, { code: 0, msg: '加入成功', roomCode: 'ROOM01' })
  assert.equal(db.data.rooms[0].partnerOpenid, 'user-b')
  assert.deepEqual(db.data.roomMembers.map(member => [member._id, member.roomCode]), [['user-b', 'ROOM01']])
})

test('RoomBinding join does not overwrite when another user claims the room before update', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      partnerName: '',
      status: 'waiting'
    }],
    beforeWhereUpdate({ allData }) {
      Object.assign(allData.rooms[0], {
        partnerOpenid: 'user-c',
        partnerName: 'C',
        status: 'paired'
      })
    }
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({
    openid: 'user-b',
    roomCode: 'ROOM01',
    nickName: 'B'
  })

  assert.deepEqual(result, { code: -4, msg: '房间已满' })
  assert.equal(db.data.rooms[0].partnerOpenid, 'user-c')
  assert.equal(db.data.rooms[0].partnerName, 'C')
  assert.deepEqual(db.data.roomMembers, [])
})

test('RoomBinding join keeps the member lock when update confirmation is inconclusive', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      partnerName: '',
      status: 'waiting'
    }],
    afterWhereUpdate({ allData, query }) {
      if (query._id !== 'room-1' || query.partnerOpenid !== '') return
      Object.assign(allData.rooms[0], {
        partnerOpenid: '',
        partnerName: '',
        status: 'waiting'
      })
    }
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({
    openid: 'user-b',
    roomCode: 'ROOM01',
    nickName: 'B'
  })

  assert.deepEqual(result, { code: -1, msg: '加入确认失败，请重试' })
  assert.deepEqual(db.data.roomMembers, [{
    _id: 'user-b',
    openid: 'user-b',
    roomId: 'room-1',
    roomCode: 'ROOM01',
    role: 'partner',
    updatedAt: SERVER_DATE
  }])
})

test('RoomBinding join restores binding when the user is already the partner', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      partnerOpenid: 'user-b',
      status: 'paired'
    }]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({ openid: 'user-b', roomCode: 'room01' })

  assert.deepEqual(result, { code: 0, msg: '已在房间中', roomCode: 'ROOM01' })
  assert.equal(db.data.rooms[0].pairedAt, undefined)
})

test('RoomBinding join hides archived room codes until the creator restores the room', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      partnerOpenid: '',
      status: 'archived'
    }]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({
    openid: 'user-b',
    roomCode: 'ROOM01',
    nickName: 'B'
  })

  assert.deepEqual(result, { code: -2, msg: '房间不存在，请检查房间码' })
  assert.deepEqual(db.data.roomMembers, [])
  assert.equal(db.data.rooms[0].status, 'archived')
})

test('RoomBinding join rejects users who already belong to a different room', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        partnerOpenid: '',
        status: 'waiting'
      },
      {
        _id: 'room-2',
        roomCode: 'ROOM02',
        createdBy: 'user-c',
        partnerOpenid: 'user-b',
        status: 'paired'
      }
    ]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({ openid: 'user-b', roomCode: 'ROOM01' })

  assert.deepEqual(result, {
    code: -5,
    msg: '你已加入其他房间，请先解除绑定后再加入新房间',
    roomCode: 'ROOM02'
  })
  assert.equal(db.data.rooms[0].partnerOpenid, '')
})

test('RoomBinding join rejects concurrent joins for a user with an active member lock', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        partnerOpenid: '',
        status: 'waiting'
      },
      {
        _id: 'room-2',
        roomCode: 'ROOM02',
        createdBy: 'user-c',
        partnerOpenid: '',
        status: 'waiting'
      }
    ],
    roomMembers: [{
      _id: 'user-b',
      openid: 'user-b',
      roomId: 'room-2',
      roomCode: 'ROOM02',
      role: 'partner'
    }]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({ openid: 'user-b', roomCode: 'ROOM01' })

  assert.deepEqual(result, {
    code: -5,
    msg: '你已加入其他房间，请先解除绑定后再加入新房间',
    roomCode: 'ROOM02'
  })
  assert.equal(db.data.rooms[0].partnerOpenid, '')
})

test('RoomBinding join allows only one concurrent room claim for the same user', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        partnerOpenid: '',
        status: 'waiting'
      },
      {
        _id: 'room-2',
        roomCode: 'ROOM02',
        createdBy: 'user-c',
        partnerOpenid: '',
        status: 'waiting'
      }
    ]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  const results = await Promise.all([
    binding.join({ openid: 'user-b', roomCode: 'ROOM01', nickName: 'B' }),
    binding.join({ openid: 'user-b', roomCode: 'ROOM02', nickName: 'B' })
  ])
  const successResults = results.filter(result => result.code === 0)
  const rejectedResults = results.filter(result => result.code === -5)
  const claimedRooms = db.data.rooms.filter(room => room.partnerOpenid === 'user-b')

  assert.equal(successResults.length, 1)
  assert.equal(rejectedResults.length, 1)
  assert.equal(claimedRooms.length, 1)
  assert.deepEqual(db.data.roomMembers, [{
    _id: 'user-b',
    openid: 'user-b',
    roomId: claimedRooms[0]._id,
    roomCode: claimedRooms[0].roomCode,
    role: 'partner',
    updatedAt: SERVER_DATE
  }])
})

test('RoomBinding getActive returns the current member room or a no-room result', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      partnerOpenid: 'user-b',
      status: 'paired'
    }]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  assert.deepEqual(await binding.getActive({ openid: 'user-b' }), {
    code: 0,
    room: db.data.rooms[0]
  })
  assert.deepEqual(await binding.getActive({ openid: 'user-c' }), {
    code: 1,
    msg: '未加入任何房间',
    errorCode: 'NO_ACTIVE_ROOM'
  })
})

test('RoomBinding getActive does not treat archived rooms as active bindings', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      partnerOpenid: '',
      status: 'archived'
    }]
  })
  const binding = createRoomBinding({ db, serverDate: () => SERVER_DATE })

  assert.deepEqual(await binding.getActive({ openid: 'user-a' }), {
    code: 1,
    msg: '未加入任何房间',
    errorCode: 'NO_ACTIVE_ROOM'
  })
})

test('RoomBinding module stays deployable in each room cloud function directory', () => {
  const root = path.join(__dirname, '..')
  const canonical = fs.readFileSync(path.join(root, 'cloudfunctions/createRoom/roomBinding.js'), 'utf8')

  assert.equal(
    fs.readFileSync(path.join(root, 'cloudfunctions/joinRoom/roomBinding.js'), 'utf8'),
    canonical
  )
  assert.equal(
    fs.readFileSync(path.join(root, 'cloudfunctions/getMyRoom/roomBinding.js'), 'utf8'),
    canonical
  )
})

function createFakeDb(initial = {}) {
  const data = {
    rooms: clone(initial.rooms || []),
    roomMembers: clone(initial.roomMembers || [])
  }
  let nextId = data.rooms.length + 1
  const addErrorsByRoomCode = new Map(Object.entries(initial.addErrorsByRoomCode || {}))
  const addResultsByRoomCode = new Map(Object.entries(initial.addResultsByRoomCode || {}))
  const beforeWhereUpdate = createOneShotCallback(initial.beforeWhereUpdate)
  const afterWhereUpdate = createOneShotCallback(initial.afterWhereUpdate)

  return {
    data,
    collection(name) {
      return createCollection(data, name, () => `room-${nextId++}`, {
        addErrorsByRoomCode,
        addResultsByRoomCode,
        beforeWhereUpdate,
        afterWhereUpdate
      })
    }
  }
}

function createCollection(allData, name, nextId, options = {}) {
  return {
    where(query) {
      return createQuery(allData, name, query, options)
    },
    async add({ data }) {
      const addError = options.addErrorsByRoomCode && options.addErrorsByRoomCode.get(data.roomCode)
      if (addError) {
        options.addErrorsByRoomCode.delete(data.roomCode)
        throw addError
      }

      if (name === 'roomMembers' && allData[name].some(item => item._id === data._id)) {
        throw duplicateMemberLockError()
      }

      const payload = clone(data)
      const record = { _id: payload._id || nextId(), ...payload }
      allData[name].push(record)
      if (options.addResultsByRoomCode && options.addResultsByRoomCode.has(record.roomCode)) {
        return clone(options.addResultsByRoomCode.get(record.roomCode))
      }
      return { _id: record._id }
    },
    doc(id) {
      return {
        async update({ data }) {
          const record = allData[name].find(item => item._id === id)
          if (record) Object.assign(record, clone(data))
          return {}
        }
      }
    }
  }
}

function createQuery(allData, name, query, options = {}) {
  let limitCount = null

  const chain = {
    limit(count) {
      limitCount = count
      return chain
    },
    async get() {
      let result = allData[name].filter(record => matchesQuery(record, query))
      if (limitCount !== null) result = result.slice(0, limitCount)
      return { data: clone(result) }
    },
    async update({ data }) {
      if (options.beforeWhereUpdate) options.beforeWhereUpdate({ allData, query, data })
      const records = allData[name].filter(record => matchesQuery(record, query))
      records.forEach(record => Object.assign(record, clone(data)))
      if (options.afterWhereUpdate) options.afterWhereUpdate({ allData, query, data })
      return { stats: { updated: records.length } }
    },
    async remove() {
      const before = allData[name].length
      allData[name] = allData[name].filter(record => !matchesQuery(record, query))
      return { stats: { removed: before - allData[name].length } }
    }
  }

  return chain
}

function matchesQuery(record, query) {
  return Object.keys(query).every(key => record[key] === query[key])
}

function createOneShotCallback(callback) {
  if (typeof callback !== 'function') return null
  let called = false
  return args => {
    if (called) return
    called = true
    callback(args)
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function duplicateRoomCodeError() {
  const error = new Error('duplicate key error collection: rooms index: roomCode dup key')
  error.code = 'E11000'
  return error
}

function duplicateOtherIndexError() {
  const error = new Error('duplicate key error collection: rooms index: createdBy dup key')
  error.code = 'E11000'
  return error
}

function duplicateMemberLockError() {
  const error = new Error('duplicate key error collection: roomMembers index: _id_ dup key')
  error.code = 'E11000'
  return error
}
