const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const {
  createRoomMembershipLifecycle: createCanonicalRoomMembershipLifecycle
} = require('../cloudfunctions/_shared/roomMembershipLifecycle')
const { createDataOpHandler } = require('../cloudfunctions/dataOp/dataOpHandler')
const { createRoomRecords } = require('../cloudfunctions/dataOp/roomRecords')

function createRoomMembershipLifecycle(options) {
  let membershipSequence = 0
  return createCanonicalRoomMembershipLifecycle({
    ...options,
    generateRoomId: options.generateRoomId || (() => `room-${options.db.data.rooms.length + 1}`),
    generateMembershipId: options.generateMembershipId || (() => `membership-${++membershipSequence}`)
  })
}

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
  const binding = createRoomMembershipLifecycle({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => 'NEW001'
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'A' })

  assert.deepEqual(result, { code: 0, room: existingRoom })
  assert.deepEqual(db.data.rooms, [existingRoom])
})

test('RoomBinding create does not trust a stale member pointer as room authorization', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-private',
      roomCode: 'SECRET',
      createdBy: 'other-user',
      partnerOpenid: '',
      status: 'waiting'
    }],
    roomMembers: [{
      _id: 'user-a',
      openid: 'user-a',
      roomId: 'room-private',
      roomCode: 'SECRET',
      role: 'creator',
      membershipId: 'private-membership'
    }]
  })
  const lifecycle = createRoomMembershipLifecycle({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => 'ROOM01'
  })

  const result = await lifecycle.create({ openid: 'user-a', nickName: 'A' })

  assert.equal(result.code, -5)
  assert.equal(result.roomCode, '')
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'room'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'membershipId'), false)
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
  const binding = createRoomMembershipLifecycle({
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
    membershipId: 'membership-1',
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
  const binding = createRoomMembershipLifecycle({
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
    membershipId: 'membership-1',
    updatedAt: SERVER_DATE
  }])
})

test('RoomBinding create restores the creator archived room from a legacy blank member lock', async () => {
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
      roomId: '',
      roomCode: '',
      role: 'creator',
      updatedAt: 'old-lock'
    }]
  })
  const binding = createRoomMembershipLifecycle({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => 'NEW001'
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'New Name' })

  assert.equal(result.code, 0)
  assert.equal(result.room.roomCode, 'ROOM01')
  assert.equal(db.data.rooms[0].status, 'waiting')
  assert.deepEqual(db.data.roomMembers, [{
    _id: 'user-a',
    openid: 'user-a',
    roomId: 'room-1',
    roomCode: 'ROOM01',
    role: 'creator',
    membershipId: 'membership-1',
    updatedAt: SERVER_DATE
  }])
})

test('RoomBinding create does not reuse an unauthorized archived member lock', async () => {
  const initial = {
    rooms: [
      {
        _id: 'room-own',
        roomCode: 'OWN001',
        createdBy: 'user-a',
        createdByName: 'A',
        partnerOpenid: '',
        partnerName: '',
        status: 'archived',
        archivedAt: 'own-archive'
      },
      {
        _id: 'room-private',
        roomCode: 'SECRET',
        createdBy: 'other-user',
        createdByName: 'Other',
        partnerOpenid: '',
        partnerName: '',
        status: 'archived',
        archivedAt: 'private-archive'
      }
    ],
    roomMembers: [{
      _id: 'user-a',
      openid: 'user-a',
      roomId: 'room-private',
      roomCode: 'SECRET',
      role: 'creator',
      updatedAt: 'old-lock'
    }]
  }
  const db = createFakeDb(initial)
  const binding = createRoomMembershipLifecycle({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => 'NEW001'
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'New Name' })

  assert.deepEqual(result, {
    code: -5,
    msg: '你已加入其他房间，请先解除绑定后再创建新房间',
    roomCode: ''
  })
  assert.deepEqual(db.data, initial)
})

test('RoomBinding create stores a new waiting room with a unique code', async () => {
  const db = createFakeDb({
    rooms: [{ _id: 'room-existing', roomCode: 'TAKEN1', createdBy: 'other' }]
  })
  const codes = ['TAKEN1', 'FRESH1']
  const binding = createRoomMembershipLifecycle({
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
    membershipId: 'membership-1',
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
  const binding = createRoomMembershipLifecycle({
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
  const binding = createRoomMembershipLifecycle({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => codes.shift()
  })

  const result = await binding.create({ openid: 'user-a', nickName: 'Min' })

  assert.deepEqual(result, { code: -1, msg: '房间码生成失败，请重试' })
  assert.deepEqual(db.data.rooms, [])
  assert.deepEqual(db.data.roomMembers, [])
})

test('RoomBinding create does not retry duplicate errors for other unique indexes', async () => {
  const db = createFakeDb({
    addErrorsByRoomCode: {
      RACE01: duplicateOtherIndexError()
    }
  })
  const codes = ['RACE01', 'FRESH1']
  const binding = createRoomMembershipLifecycle({
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
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
    membershipId: 'membership-1',
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
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
    transactionConflicts: 1,
    onTransactionConflict({ data }) {
      Object.assign(data.rooms[0], {
        partnerOpenid: 'user-c',
        partnerName: 'C',
        status: 'paired'
      })
      data.roomMembers.push({
        _id: 'user-c',
        openid: 'user-c',
        roomId: 'room-1',
        roomCode: 'ROOM01',
        role: 'partner'
      })
    }
  })
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({
    openid: 'user-b',
    roomCode: 'ROOM01',
    nickName: 'B'
  })

  assert.deepEqual(result, { code: -4, msg: '房间已满' })
  assert.equal(db.data.rooms[0].partnerOpenid, 'user-c')
  assert.equal(db.data.rooms[0].partnerName, 'C')
  assert.deepEqual(db.data.roomMembers.map(member => member._id), ['user-c'])
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
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
      role: 'partner',
      membershipId: 'private-membership'
    }]
  })
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({ openid: 'user-b', roomCode: 'ROOM01' })

  assert.deepEqual(result, {
    code: -5,
    msg: '你已加入其他房间，请先解除绑定后再加入新房间',
    roomCode: 'ROOM01'
  })
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'membershipId'), false)
  assert.equal(db.data.rooms[0].partnerOpenid, '')
})

test('RoomBinding join does not disclose room codes from unauthorized member pointers', async () => {
  const pointerCases = [
    {
      name: 'archived room',
      pointerRoom: {
        _id: 'room-private',
        roomCode: 'SECRET',
        createdBy: 'other-user',
        partnerOpenid: '',
        status: 'archived'
      }
    },
    {
      name: 'missing room',
      pointerRoom: null
    },
    {
      name: 'non-member active room',
      pointerRoom: {
        _id: 'room-private',
        roomCode: 'SECRET',
        createdBy: 'other-user',
        partnerOpenid: '',
        status: 'waiting'
      }
    }
  ]

  for (const pointerCase of pointerCases) {
    const targetRoom = {
      _id: 'room-target',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      partnerOpenid: '',
      status: 'waiting'
    }
    const db = createFakeDb({
      rooms: pointerCase.pointerRoom ? [targetRoom, pointerCase.pointerRoom] : [targetRoom],
      roomMembers: [{
        _id: 'user-b',
        openid: 'user-b',
        roomId: 'room-private',
        roomCode: 'SECRET',
        role: 'partner'
      }]
    })
    const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

    const result = await binding.join({ openid: 'user-b', roomCode: 'ROOM01' })

    assert.deepEqual(result, {
      code: -5,
      msg: '你已加入其他房间，请先解除绑定后再加入新房间',
      roomCode: 'ROOM01'
    }, pointerCase.name)
    assert.notEqual(result.roomCode, 'SECRET', pointerCase.name)
    assert.equal(db.data.rooms[0].partnerOpenid, '', pointerCase.name)
  }
})

test('RoomBinding join preserves the room code for an authorized archived creator lock', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-target',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        partnerOpenid: '',
        status: 'waiting'
      },
      {
        _id: 'room-own',
        roomCode: 'OWN001',
        createdBy: 'user-b',
        partnerOpenid: '',
        status: 'archived'
      }
    ],
    roomMembers: [{
      _id: 'user-b',
      openid: 'user-b',
      roomId: 'room-own',
      roomCode: 'OWN001',
      role: 'creator'
    }]
  })
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({ openid: 'user-b', roomCode: 'ROOM01' })

  assert.deepEqual(result, {
    code: -5,
    msg: '你已加入其他房间，请先解除绑定后再加入新房间',
    roomCode: 'OWN001'
  })
  assert.equal(db.data.rooms[0].partnerOpenid, '')
})

test('RoomBinding join projects authorized archived conflicts from the room record', async () => {
  const db = createFakeDb({
    rooms: [
      {
        _id: 'room-target',
        roomCode: 'ROOM01',
        createdBy: 'user-a',
        partnerOpenid: '',
        status: 'waiting'
      },
      {
        _id: 'room-own',
        roomCode: 'OWN001',
        createdBy: 'user-b',
        partnerOpenid: '',
        status: 'archived'
      }
    ],
    roomMembers: [{
      _id: 'user-b',
      openid: 'user-b',
      roomId: 'room-own',
      roomCode: 'TAMPERED',
      role: 'partner'
    }]
  })
  const before = JSON.parse(JSON.stringify(db.data))
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  const result = await binding.join({ openid: 'user-b', roomCode: 'ROOM01' })

  assert.deepEqual(result, {
    code: -5,
    msg: '你已加入其他房间，请先解除绑定后再加入新房间',
    roomCode: 'OWN001'
  })
  assert.deepEqual(db.data, before)
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
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
    membershipId: 'membership-1',
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
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

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
  const binding = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  assert.deepEqual(await binding.getActive({ openid: 'user-a' }), {
    code: 1,
    msg: '未加入任何房间',
    errorCode: 'NO_ACTIVE_ROOM'
  })
})

test('RoomBinding getActive finds an active room after more than one hundred archived rooms', async () => {
  const archivedRooms = Array.from({ length: 101 }, (_, index) => ({
    _id: `archived-${index}`,
    roomCode: `A${String(index).padStart(5, '0')}`,
    createdBy: 'user-a',
    partnerOpenid: '',
    status: 'archived'
  }))
  const activeRoom = {
    _id: 'room-active',
    roomCode: 'ACTIVE',
    createdBy: 'user-a',
    partnerOpenid: '',
    status: 'waiting'
  }
  const db = createFakeDb({ rooms: [...archivedRooms, activeRoom] })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  assert.deepEqual(await lifecycle.getActive({ openid: 'user-a' }), {
    code: 0,
    room: activeRoom
  })
})

test('Room membership transaction rolls back join when commit fails', async () => {
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'user-a',
      partnerOpenid: '',
      partnerName: '',
      status: 'waiting'
    }],
    beforeTransactionCommit() {
      throw new Error('commit failed')
    }
  })
  const lifecycle = createRoomMembershipLifecycle({ db, serverDate: () => SERVER_DATE })

  await assert.rejects(
    lifecycle.join({ openid: 'user-b', roomCode: 'ROOM01', nickName: 'B' }),
    /commit failed/
  )
  assert.equal(db.data.rooms[0].partnerOpenid, '')
  assert.deepEqual(db.data.roomMembers, [])
})

test('Room membership lifecycle preserves records for creator recovery and isolates new rooms', async () => {
  const generatedRoomCodes = ['ROOM01', 'ROOM02']
  const period = {
    _id: 'period-old',
    roomCode: 'ROOM01',
    createdBy: 'creator',
    createdAt: 'old',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    note: 'old period',
    duration: 3,
    flow: 'normal',
    symptoms: ['cramps']
  }
  const memory = {
    _id: 'memory-old',
    roomCode: 'ROOM01',
    createdBy: 'creator',
    createdAt: 'old',
    date: '2026-06-02',
    note: 'old memory'
  }
  const db = createFakeDb({
    rooms: [{
      _id: 'room-1',
      roomCode: 'ROOM01',
      createdBy: 'creator',
      createdByName: 'Creator',
      partnerOpenid: '',
      partnerName: '',
      status: 'waiting',
      createdAt: 'old'
    }],
    roomMembers: [{
      _id: 'creator',
      openid: 'creator',
      roomId: 'room-1',
      roomCode: 'ROOM01',
      role: 'creator'
    }],
    periods: [period],
    memories: [memory]
  })
  const lifecycle = createRoomMembershipLifecycle({
    db,
    serverDate: () => SERVER_DATE,
    generateRoomCode: () => generatedRoomCodes.shift()
  })
  let activeOpenid = 'creator'
  const dataOp = createDataOpHandler({
    getWXContext: () => ({ OPENID: activeOpenid }),
    db,
    records: createRoomRecords({ db, serverDate: () => SERVER_DATE })
  })

  assert.deepEqual(await dataOp({ action: 'list', collection: 'periods', roomCode: 'ROOM01' }), {
    code: 0,
    data: [period]
  })
  assert.deepEqual(await dataOp({ action: 'list', collection: 'memories', roomCode: 'ROOM01' }), {
    code: 0,
    data: [memory]
  })

  assert.deepEqual(await lifecycle.leave({ openid: 'creator' }), {
    code: 0,
    removedCount: 1,
    deletedCount: 0,
    archivedCount: 1
  })
  assert.equal(db.data.rooms[0].status, 'archived')
  assert.deepEqual(db.data.periods, [period])
  assert.deepEqual(db.data.memories, [memory])

  for (const attempt of [
    { action: 'list', collection: 'periods' },
    { action: 'add', collection: 'memories', data: { date: '2026-06-04', note: 'blocked' } },
    { action: 'update', collection: 'periods', id: 'period-old', data: { ...period, note: 'blocked' } },
    { action: 'remove', collection: 'memories', id: 'memory-old' }
  ]) {
    assert.deepEqual(await dataOp({ ...attempt, roomCode: 'ROOM01' }), {
      code: -1,
      msg: '房间已解除绑定，请先恢复房间',
      errorCode: 'ROOM_ACCESS_DENIED'
    })
  }
  assert.deepEqual(await lifecycle.join({ openid: 'new-creator', roomCode: 'ROOM01', nickName: 'New' }), {
    code: -2,
    msg: '房间不存在，请检查房间码'
  })

  const newRoom = await lifecycle.create({ openid: 'new-creator', nickName: 'New' })
  assert.equal(newRoom.code, 0)
  assert.equal(newRoom.room.roomCode, 'ROOM02')
  activeOpenid = 'new-creator'
  assert.deepEqual(await dataOp({ action: 'list', collection: 'periods', roomCode: 'ROOM02' }), {
    code: 0,
    data: []
  })
  assert.deepEqual(await dataOp({ action: 'list', collection: 'memories', roomCode: 'ROOM02' }), {
    code: 0,
    data: []
  })
  assert.deepEqual(await dataOp({ action: 'list', collection: 'periods', roomCode: 'ROOM01' }), {
    code: -1,
    msg: '房间已解除绑定，请先恢复房间',
    errorCode: 'ROOM_ACCESS_DENIED'
  })

  const recovered = await lifecycle.create({ openid: 'creator', nickName: 'Creator' })
  assert.equal(recovered.code, 0)
  assert.equal(recovered.room.roomCode, 'ROOM01')
  assert.equal(db.data.rooms[0].status, 'waiting')
  activeOpenid = 'creator'
  assert.deepEqual(await dataOp({ action: 'list', collection: 'periods', roomCode: 'ROOM01' }), {
    code: 0,
    data: [period]
  })
  assert.deepEqual(await dataOp({ action: 'list', collection: 'memories', roomCode: 'ROOM01' }), {
    code: 0,
    data: [memory]
  })
})

test('Room membership lifecycle artifact stays deployable in each room cloud function directory', () => {
  const root = path.join(__dirname, '..')
  const functionNames = ['createRoom', 'joinRoom', 'getMyRoom', 'leaveRoom']

  functionNames.forEach(functionName => {
    const artifact = require(path.join(
      root,
      'cloudfunctions',
      functionName,
      'roomMembershipLifecycle.js'
    ))

    assert.equal(typeof artifact.createRoomMembershipLifecycle, 'function')
  })
})

function createFakeDb(initial = {}) {
  const data = {
    rooms: clone(initial.rooms || []),
    roomMembers: clone(initial.roomMembers || [])
  }
  if (Object.prototype.hasOwnProperty.call(initial, 'periods')) data.periods = clone(initial.periods)
  if (Object.prototype.hasOwnProperty.call(initial, 'memories')) data.memories = clone(initial.memories)
  let nextId = data.rooms.length + 1
  const addErrorsByRoomCode = new Map(Object.entries(initial.addErrorsByRoomCode || {}))
  const transactionRunner = createTransactionRunner(data, {
    ...initial,
    addErrorsByRoomCode
  })

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
      return createCollection(data, name, () => `room-${nextId++}`, {
        addErrorsByRoomCode
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
      return { _id: record._id }
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
        }
      }
    }
  }
}

function createQuery(allData, name, query, options = {}) {
  let limitCount = null
  let order = null

  const chain = {
    limit(count) {
      limitCount = count
      return chain
    },
    orderBy(field, direction) {
      order = [field, direction]
      return chain
    },
    async get() {
      let result = allData[name].filter(record => matchesQuery(record, query))
      if (order) {
        const [field, direction] = order
        result.sort((left, right) => {
          const comparison = String(left[field] || '').localeCompare(String(right[field] || ''))
          return direction === 'desc' ? -comparison : comparison
        })
      }
      if (limitCount !== null) result = result.slice(0, limitCount)
      return { data: clone(result) }
    },
    async update({ data }) {
      const records = allData[name].filter(record => matchesQuery(record, query))
      records.forEach(record => Object.assign(record, clone(data)))
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
  return Object.keys(query).every(key => {
    const condition = query[key]
    if (condition && Object.prototype.hasOwnProperty.call(condition, '$neq')) {
      return record[key] !== condition.$neq
    }
    return record[key] === condition
  })
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
          const snapshot = clone(data)
          try {
            const result = await callback(createTransaction(snapshot, options))
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

function createTransaction(data, options = {}) {
  return {
    collection(name) {
      return {
        doc(id) {
          return createTransactionDoc(data[name], id, name, options)
        }
      }
    }
  }
}

function createTransactionDoc(records, id, name, options) {
  return {
    async get() {
      return { data: clone(records.find(record => record._id === id) || null) }
    },
    async set({ data }) {
      const addError = name === 'rooms' && options.addErrorsByRoomCode && options.addErrorsByRoomCode.get(data.roomCode)
      if (addError) {
        options.addErrorsByRoomCode.delete(data.roomCode)
        throw addError
      }
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
