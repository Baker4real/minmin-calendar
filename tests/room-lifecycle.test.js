const assert = require('node:assert/strict')
const test = require('node:test')

const { createRoomLifecycle } = require('../cloudfunctions/leaveRoom/roomLifecycle')

const SERVER_DATE = { serverDate: true }

test('RoomLifecycle transfers creator ownership to the partner when the creator leaves', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdByName: 'A',
        partnerOpenid: 'user-b',
        partnerName: 'B',
        status: 'paired',
        createdAt: 'old',
        pairedAt: 'old'
      }
    ]
  })
  const lifecycle = createRoomLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 1, deletedCount: 0 })
  assert.deepEqual(db.data.rooms, [
    {
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-b',
      createdByName: 'B',
      partnerOpenid: '',
      partnerName: '',
      status: 'waiting',
      createdAt: 'old',
      pairedAt: null,
      updatedAt: SERVER_DATE
    }
  ])
})

test('RoomLifecycle removes the partner from a paired room and leaves the creator waiting', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdByName: 'A',
        partnerOpenid: 'user-b',
        partnerName: 'B',
        status: 'paired',
        createdAt: 'old',
        pairedAt: 'old'
      }
    ]
  })
  const lifecycle = createRoomLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-b' })

  assert.deepEqual(result, { code: 0, removedCount: 1, deletedCount: 0 })
  assert.deepEqual(db.data.rooms, [
    {
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      partnerName: '',
      status: 'waiting',
      createdAt: 'old',
      pairedAt: null,
      updatedAt: SERVER_DATE
    }
  ])
})

test('RoomLifecycle deletes a room when the last member leaves', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdByName: 'A',
        partnerOpenid: '',
        partnerName: '',
        status: 'waiting',
        createdAt: 'old'
      }
    ]
  })
  const lifecycle = createRoomLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 1, deletedCount: 1 })
  assert.deepEqual(db.data.rooms, [])
})

test('RoomLifecycle leave is idempotent when the user is not in any room', async () => {
  const db = createFakeDb()
  const lifecycle = createRoomLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 0, deletedCount: 0 })
  assert.deepEqual(db.data.rooms, [])
})

function createFakeDb(initial = {}) {
  const data = {
    rooms: clone(initial.rooms || [])
  }

  return {
    data,
    collection(name) {
      return createCollection(data, name)
    }
  }
}

function createCollection(allData, name) {
  return {
    where(query) {
      return createQuery(allData[name], query)
    },
    doc(id) {
      return {
        async update({ data }) {
          const record = allData[name].find(item => item._id === id)
          if (record) Object.assign(record, clone(data))
          return {}
        },
        async remove() {
          const index = allData[name].findIndex(item => item._id === id)
          if (index >= 0) allData[name].splice(index, 1)
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
