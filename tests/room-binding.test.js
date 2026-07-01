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
    msg: '未加入任何房间'
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
    rooms: clone(initial.rooms || [])
  }
  let nextId = data.rooms.length + 1
  const addErrorsByRoomCode = new Map(Object.entries(initial.addErrorsByRoomCode || {}))
  const addResultsByRoomCode = new Map(Object.entries(initial.addResultsByRoomCode || {}))

  return {
    data,
    collection(name) {
      return createCollection(data, name, () => `room-${nextId++}`, {
        addErrorsByRoomCode,
        addResultsByRoomCode
      })
    }
  }
}

function createCollection(allData, name, nextId, options = {}) {
  return {
    where(query) {
      return createQuery(allData[name], query)
    },
    async add({ data }) {
      const addError = options.addErrorsByRoomCode && options.addErrorsByRoomCode.get(data.roomCode)
      if (addError) {
        options.addErrorsByRoomCode.delete(data.roomCode)
        throw addError
      }

      const record = { _id: nextId(), ...clone(data) }
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

function createQuery(records, query) {
  let limitCount = null

  const chain = {
    limit(count) {
      limitCount = count
      return chain
    },
    async get() {
      let result = records.filter(record =>
        Object.keys(query).every(key => record[key] === query[key])
      )
      if (limitCount !== null) result = result.slice(0, limitCount)
      return { data: clone(result) }
    }
  }

  return chain
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
