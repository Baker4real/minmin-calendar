const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createRoomMembershipLifecycle: createCanonicalRoomMembershipLifecycle
} = require('../cloudfunctions/_shared/roomMembershipLifecycle')

function createRoomMembershipLifecycle(options) {
  let membershipSequence = 0
  return createCanonicalRoomMembershipLifecycle({
    ...options,
    generateRoomId: options.generateRoomId || (() => `room-${options.db.data.rooms.length + 1}`),
    generateMembershipId: options.generateMembershipId || (() => `membership-${++membershipSequence}`)
  })
}

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
    ],
    roomMembers: [
      { _id: 'user-a', openid: 'user-a', roomId: 'room-1', roomCode: 'ROOM01', role: 'creator', membershipId: 'member-a' },
      { _id: 'user-b', openid: 'user-b', roomId: 'room-1', roomCode: 'ROOM01', role: 'partner', membershipId: 'member-b' }
    ]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
  assert.deepEqual(db.data.roomMembers, [
    {
      _id: 'user-b',
      openid: 'user-b',
      roomId: 'room-1',
      roomCode: 'ROOM01',
      role: 'creator',
      membershipId: 'member-b',
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
    ],
    roomMembers: [
      { _id: 'user-a', openid: 'user-a', roomId: 'room-1', roomCode: 'ROOM01', role: 'creator' },
      { _id: 'user-b', openid: 'user-b', roomId: 'room-1', roomCode: 'ROOM01', role: 'partner' }
    ]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
  assert.deepEqual(db.data.roomMembers, [
    { _id: 'user-a', openid: 'user-a', roomId: 'room-1', roomCode: 'ROOM01', role: 'creator' }
  ])
})

test('RoomLifecycle archives a room when the last creator leaves', async () => {
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
    ],
    roomMembers: [
      { _id: 'user-a', openid: 'user-a', roomId: 'room-1', roomCode: 'ROOM01', role: 'creator' }
    ]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 1, deletedCount: 0, archivedCount: 1 })
  assert.deepEqual(db.data.rooms, [
    {
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      partnerName: '',
      status: 'archived',
      createdAt: 'old',
      pairedAt: null,
      archivedAt: SERVER_DATE,
      updatedAt: SERVER_DATE
    }
  ])
  assert.deepEqual(db.data.roomMembers, [])
})

test('RoomLifecycle does not archive a room that is paired by a concurrent join', async () => {
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
    ],
    roomMembers: [
      { _id: 'user-a', openid: 'user-a', roomId: 'room-1', roomCode: 'ROOM01', role: 'creator' }
    ],
    transactionConflicts: 1,
    onTransactionConflict({ data }) {
      data.rooms[0].partnerOpenid = 'user-b'
      data.rooms[0].partnerName = 'B'
      data.rooms[0].status = 'paired'
      data.roomMembers.push({
        _id: 'user-b',
        openid: 'user-b',
        roomId: 'room-1',
        roomCode: 'ROOM01',
        role: 'partner'
      })
    }
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
  assert.deepEqual(db.data.roomMembers, [
    { _id: 'user-b', openid: 'user-b', roomId: 'room-1', roomCode: 'ROOM01', role: 'creator', updatedAt: SERVER_DATE }
  ])
})

test('RoomLifecycle archives a last-member room while clearing a blank member lock', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        createdByName: 'A',
        partnerOpenid: '',
        partnerName: '',
        status: 'waiting'
      }
    ],
    roomMembers: [
      { _id: 'user-a', openid: 'user-a', roomId: '', roomCode: '', role: 'creator' }
    ]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 1, deletedCount: 0, archivedCount: 1 })
  assert.deepEqual(db.data.rooms, [
    {
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      partnerName: '',
      status: 'archived',
      pairedAt: null,
      archivedAt: SERVER_DATE,
      updatedAt: SERVER_DATE
    }
  ])
  assert.deepEqual(db.data.roomMembers, [])
})

test('RoomLifecycle archives a partner-only room even when the creator field is missing', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        partnerOpenid: 'user-b',
        partnerName: 'B',
        status: 'paired',
        createdAt: 'old'
      }
    ],
    roomMembers: [
      { _id: 'user-b', openid: 'user-b', roomId: 'room-1', roomCode: 'ROOM01', role: 'partner' }
    ]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-b' })

  assert.deepEqual(result, { code: 0, removedCount: 1, deletedCount: 0, archivedCount: 1 })
  assert.deepEqual(db.data.rooms, [
    {
      _id: 'room-1',
      roomCode: 'ROOM01',
      partnerOpenid: '',
      partnerName: '',
      status: 'archived',
      createdAt: 'old',
      createdBy: 'user-b',
      createdByName: 'B',
      pairedAt: null,
      archivedAt: SERVER_DATE,
      updatedAt: SERVER_DATE
    }
  ])
  assert.deepEqual(db.data.roomMembers, [])
})

test('RoomLifecycle leave is idempotent when the user is not in any room', async () => {
  const db = createFakeDb({
    roomMembers: [
      { _id: 'user-a', openid: 'user-a', roomId: 'stale-room', roomCode: 'STALE1', role: 'partner' }
    ]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 0, deletedCount: 0 })
  assert.deepEqual(db.data.rooms, [])
  assert.deepEqual(db.data.roomMembers, [])
})

test('Room membership transaction retries ownership transfer conflicts without partial commit', async () => {
  const db = createFakeDb({
    transactionConflicts: 1,
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: 'user-b',
      partnerName: 'B',
      status: 'paired'
    }],
    roomMembers: [
      { _id: 'user-a', openid: 'user-a', roomId: 'room-1', roomCode: 'ROOM01', role: 'creator' },
      { _id: 'user-b', openid: 'user-b', roomId: 'room-1', roomCode: 'ROOM01', role: 'partner' }
    ]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 1, deletedCount: 0 })
  assert.equal(db.transactionAttempts, 2)
  assert.equal(db.data.rooms[0].createdBy, 'user-b')
  assert.deepEqual(db.data.roomMembers.map(member => [member._id, member.role]), [['user-b', 'creator']])
})

test('Room membership transaction does not overwrite a partner membership in another active room', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-1',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        partnerOpenid: 'user-b',
        partnerName: 'B',
        status: 'paired'
      },
      {
        _id: 'room-2',
        roomCode: 'ROOM02',
        createdBy: 'user-c',
        partnerOpenid: 'user-b',
        status: 'paired'
      }
    ],
    roomMembers: [
      { _id: 'user-a', openid: 'user-a', roomId: 'room-1', roomCode: 'ROOM01', role: 'creator' },
      { _id: 'user-b', openid: 'user-b', roomId: 'room-2', roomCode: 'ROOM02', role: 'partner' }
    ]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  await assert.rejects(
    lifecycle.leave({ openid: 'user-a' }),
    /成员资格冲突/
  )

  assert.equal(db.data.rooms[0].createdBy, 'user-a')
  assert.equal(db.data.rooms[0].partnerOpenid, 'user-b')
  assert.equal(db.data.roomMembers[1].roomId, 'room-2')
})

test('Room membership transaction falls back from a stale member pointer to the active room', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-active',
      roomCode: 'ACTIVE',
      createdBy: 'user-a',
      partnerOpenid: '',
      status: 'waiting'
    }],
    roomMembers: [{
      _id: 'user-a',
      openid: 'user-a',
      roomId: 'room-missing',
      roomCode: 'STALE1',
      role: 'creator'
    }]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.equal(result.archivedCount, 1)
  assert.equal(db.data.rooms[0].status, 'archived')
  assert.deepEqual(db.data.roomMembers, [])
})

test('Room membership leave does not follow a membership created after an empty snapshot', async () => {
  const db = createFakeDb({
    beforeTransactionAttempt({ data, attempts }) {
      if (attempts !== 1) return
      data.rooms.push({
        _id: 'room-b',
        roomCode: 'ROOMB1',
        createdBy: 'user-a',
        createdByName: 'A',
        partnerOpenid: '',
        status: 'waiting'
      })
      data.roomMembers.push({
        _id: 'user-a',
        openid: 'user-a',
        roomId: 'room-b',
        roomCode: 'ROOMB1',
        role: 'creator',
        updatedAt: 'new-membership'
      })
    }
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 0, deletedCount: 0 })
  assert.equal(db.data.rooms[0].status, 'waiting')
  assert.equal(db.data.rooms[0].createdBy, 'user-a')
  assert.equal(db.data.roomMembers[0].roomId, 'room-b')
})

test('Room membership leave retry stays pinned when the membership changes after a conflict', async () => {
  const db = createFakeDb({
    transactionConflicts: 1,
    rooms: [{
      _id: 'room-a',
      roomCode: 'ROOMA1',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      status: 'waiting'
    }],
    roomMembers: [{
      _id: 'user-a',
      openid: 'user-a',
      roomId: 'room-a',
      roomCode: 'ROOMA1',
      role: 'creator',
      updatedAt: 'old-membership'
    }],
    onTransactionConflict({ data }) {
      data.rooms = [{
        _id: 'room-a',
        roomCode: 'ROOMA1',
        createdBy: 'former-owner',
        partnerOpenid: '',
        status: 'waiting'
      }, {
        _id: 'room-b',
        roomCode: 'ROOMB1',
        createdBy: 'user-a',
        createdByName: 'A',
        partnerOpenid: '',
        status: 'waiting'
      }]
      data.roomMembers = [{
        _id: 'user-a',
        openid: 'user-a',
        roomId: 'room-b',
        roomCode: 'ROOMB1',
        role: 'creator',
        updatedAt: 'new-membership'
      }]
    }
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 0, deletedCount: 0 })
  assert.equal(db.transactionAttempts, 2)
  assert.equal(db.data.rooms.find(room => room._id === 'room-b').status, 'waiting')
  assert.equal(db.data.roomMembers[0].roomId, 'room-b')
})

test('Room membership leave does not remove a recovered same-room membership with reused fields', async () => {
  await assertSameRoomMembershipAbaIsIgnored({ membershipId: 'old-membership' })
})

test('Room membership leave does not remove a recovered same-room membership after a legacy snapshot', async () => {
  await assertSameRoomMembershipAbaIsIgnored({})
})

async function assertSameRoomMembershipAbaIsIgnored(previousMembership) {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-a',
      roomCode: 'ROOMA1',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      status: 'waiting'
    }],
    roomMembers: [{
      _id: 'user-a',
      openid: 'user-a',
      roomId: 'room-a',
      roomCode: 'ROOMA1',
      role: 'creator',
      ...previousMembership,
      updatedAt: SERVER_DATE
    }],
    beforeTransactionAttempt({ data, attempts }) {
      if (attempts !== 1) return
      data.rooms = [{
        _id: 'room-a',
        roomCode: 'ROOMA1',
        createdBy: 'user-a',
        createdByName: 'A',
        partnerOpenid: '',
        status: 'waiting',
        restoredAt: SERVER_DATE,
        updatedAt: SERVER_DATE
      }]
      data.roomMembers = [{
        _id: 'user-a',
        openid: 'user-a',
        roomId: 'room-a',
        roomCode: 'ROOMA1',
        role: 'creator',
        membershipId: 'new-membership',
        updatedAt: SERVER_DATE
      }]
    }
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 0, deletedCount: 0 })
  assert.equal(db.data.rooms[0].status, 'waiting')
  assert.equal(db.data.rooms[0].createdBy, 'user-a')
  assert.equal(db.data.roomMembers[0].membershipId, 'new-membership')
}

test('Room membership leave only clears the candidate room when the member points elsewhere', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-a',
      roomCode: 'ROOMA1',
      createdBy: 'user-a',
      createdByName: 'A',
      partnerOpenid: '',
      status: 'waiting'
    }, {
      _id: 'room-b',
      roomCode: 'ROOMB1',
      createdBy: 'user-c',
      partnerOpenid: 'user-a',
      partnerName: 'A',
      status: 'paired'
    }],
    roomMembers: [{
      _id: 'user-a',
      openid: 'user-a',
      roomId: 'room-b',
      roomCode: 'ROOMB1',
      role: 'partner',
      updatedAt: 'new-membership'
    }]
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await lifecycle.leave({ openid: 'user-a' })

  assert.deepEqual(result, { code: 0, removedCount: 1, deletedCount: 0, archivedCount: 1 })
  assert.equal(db.data.rooms.find(room => room._id === 'room-a').status, 'archived')
  assert.equal(db.data.rooms.find(room => room._id === 'room-b').status, 'paired')
  assert.equal(db.data.roomMembers[0].roomId, 'room-b')
})

function createFakeDb(initial = {}) {
  const data = {
    rooms: clone(initial.rooms || []),
    roomMembers: clone(initial.roomMembers || [])
  }
  const transactionRunner = createTransactionRunner(data, initial)

  return {
    data,
    command: {
      neq(value) {
        return { $neq: value }
      }
    },
    get transactionAttempts() {
      return transactionRunner.attempts
    },
    runTransaction: transactionRunner.run,
    collection(name) {
      return createCollection(data, name)
    }
  }
}

function createCollection(allData, name, options = {}) {
  return {
    where(query) {
      return createQuery(allData, name, query, options)
    },
    doc(id) {
      return {
        async get() {
          return { data: clone(allData[name].find(record => record._id === id) || null) }
        },
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

function createQuery(allData, name, query, options = {}) {
  let limitCount = null
  const records = allData[name]

  const chain = {
    limit(count) {
      limitCount = count
      return chain
    },
    async get() {
      let result = records.filter(record =>
        Object.keys(query).every(key => matchesCondition(record[key], query[key]))
      )
      if (limitCount !== null) result = result.slice(0, limitCount)
      return { data: clone(result) }
    },
    async update({ data }) {
      const matching = records.filter(record =>
        Object.keys(query).every(key => record[key] === query[key])
      )
      matching.forEach(record => Object.assign(record, clone(data)))
      return { stats: { updated: matching.length } }
    },
    async remove() {
      const before = records.length
      for (let index = records.length - 1; index >= 0; index--) {
        if (Object.keys(query).every(key => records[index][key] === query[key])) records.splice(index, 1)
      }
      return { stats: { removed: before - records.length } }
    }
  }

  return chain
}

function matchesCondition(value, condition) {
  if (condition && Object.prototype.hasOwnProperty.call(condition, '$neq')) {
    return value !== condition.$neq
  }
  return value === condition
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createTransactionRunner(data, options = {}) {
  let attempts = 0
  let conflictsRemaining = options.transactionConflicts || 0
  let transactionQueue = Promise.resolve()

  return {
    get attempts() {
      return attempts
    },
    async run(callback, times = 3) {
      const previous = transactionQueue
      let releaseQueue
      let runAttempts = 0
      transactionQueue = new Promise(resolve => { releaseQueue = resolve })
      await previous
      try {
        while (true) {
          attempts += 1
          runAttempts += 1
          if (options.beforeTransactionAttempt) options.beforeTransactionAttempt({ data, attempts })
          const snapshot = clone(data)
          try {
            const result = await callback(createTransaction(snapshot))
            if (conflictsRemaining > 0) {
              conflictsRemaining -= 1
              if (options.onTransactionConflict) options.onTransactionConflict({ data, attempts })
              const error = new Error('transaction conflict')
              error.code = 'TRANSACTION_CONFLICT'
              throw error
            }
            if (options.beforeTransactionCommit) options.beforeTransactionCommit({ snapshot, attempts })
            data.rooms = snapshot.rooms
            data.roomMembers = snapshot.roomMembers
            return result
          } catch (error) {
            if (error.code === 'TRANSACTION_CONFLICT' && runAttempts < times) continue
            throw error
          }
        }
      } finally {
        releaseQueue()
      }
    }
  }
}

function createTransaction(data) {
  return {
    collection(name) {
      return {
        doc(id) {
          return createTransactionDoc(data[name], id)
        }
      }
    }
  }
}

function createTransactionDoc(records, id) {
  return {
    async get() {
      return { data: clone(records.find(record => record._id === id) || null) }
    },
    async set({ data }) {
      const index = records.findIndex(record => record._id === id)
      const record = { _id: id, ...clone(data) }
      if (index >= 0) records[index] = record
      else records.push(record)
      return { stats: { created: index < 0 ? 1 : 0, updated: index >= 0 ? 1 : 0 } }
    },
    async update({ data }) {
      const record = records.find(item => item._id === id)
      if (record) Object.assign(record, clone(data))
      return { stats: { updated: record ? 1 : 0 } }
    },
    async remove() {
      const index = records.findIndex(record => record._id === id)
      if (index >= 0) records.splice(index, 1)
      return { stats: { removed: index >= 0 ? 1 : 0 } }
    }
  }
}
