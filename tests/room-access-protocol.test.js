const assert = require('node:assert/strict')
const test = require('node:test')

const {
  isStaleRoomFailure,
  shouldClearCachedRoom
} = require('../utils/roomAccessProtocol')

test('isStaleRoomFailure recognizes structured room access failures', () => {
  assert.equal(isStaleRoomFailure({
    code: -1,
    errorCode: 'ROOM_ACCESS_DENIED',
    msg: '无权访问该房间'
  }), true)
  assert.equal(isStaleRoomFailure({
    code: -1,
    errorCode: 'ROOM_NOT_FOUND',
    msg: '房间不存在'
  }), true)
  assert.equal(isStaleRoomFailure({
    code: -1,
    errorCode: 'NO_ACTIVE_ROOM',
    msg: '当前没有绑定房间'
  }), true)
})

test('isStaleRoomFailure lets structured non-room errors override legacy message matching', () => {
  assert.equal(isStaleRoomFailure({
    code: -1,
    errorCode: 'VALIDATION_ERROR',
    msg: '备注里不能填写“无权访问该房间”'
  }), false)
})

test('isStaleRoomFailure still supports legacy room access messages without an errorCode', () => {
  assert.equal(isStaleRoomFailure({ code: -1, msg: '无权访问该房间' }), true)
  assert.equal(isStaleRoomFailure({ code: -1, msg: '房间不存在' }), true)
  assert.equal(isStaleRoomFailure({ code: -1, msg: '不支持的字段: 无权访问该房间' }), false)
  assert.equal(isStaleRoomFailure({ code: -1, msg: '普通业务失败' }), false)
})

test('shouldClearCachedRoom centralizes getMyRoom stale-cache decisions', () => {
  assert.equal(shouldClearCachedRoom({ code: 1, msg: '未加入任何房间' }, ''), true)
  assert.equal(shouldClearCachedRoom({ code: 0, room: null }, ''), true)
  assert.equal(shouldClearCachedRoom({
    code: -1,
    errorCode: 'ROOM_ACCESS_DENIED',
    msg: '无权访问该房间'
  }, ''), true)
  assert.equal(shouldClearCachedRoom({
    code: -1,
    errorCode: 'VALIDATION_ERROR',
    msg: '备注里不能填写“无权访问该房间”'
  }, ''), false)
  assert.equal(shouldClearCachedRoom({
    code: 1,
    errorCode: 'VALIDATION_ERROR',
    msg: '临时业务失败'
  }, ''), false)
})
