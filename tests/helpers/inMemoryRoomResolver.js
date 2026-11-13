// 测试用的内存版 Room 解析器：直接给出 resolveActiveRoom 的结果，替代 utils/roomResolver.js 的生产解析器注入 RoomDataClient。
// 放在 tests/ 下，不进小程序上传包。
function createInMemoryRoomResolver(config = {}) {
  const resolution = config || {}

  return {
    async resolveActiveRoom() {
      if (resolution.kind === 'resolved') {
        return {
          kind: 'resolved',
          roomCode: normalizeRoomCode(resolution.roomCode)
        }
      }
      if (resolution.kind === 'no-room') {
        return { kind: 'no-room' }
      }
      if (resolution.kind === 'retryable-failure') {
        return {
          kind: 'retryable-failure',
          message: resolution.message
        }
      }
      throw new Error('Invalid in-memory resolver config')
    }
  }
}

function normalizeRoomCode(value) {
  return String(value || '').trim().toUpperCase()
}

module.exports = { createInMemoryRoomResolver }
