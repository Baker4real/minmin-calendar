const cloud = require('../../utils/cloud')
const roomSession = require('../../utils/room')
const settingsFlow = require('../../utils/settingsFlow')

Page({
  data: { roomCode: '', roomCodeDisplay: '未绑定' },

  async onShow() {
    const room = await roomSession.getActiveRoom()
    syncActiveRoom(this, room)
  },

  async copyRoomCode() {
    await settingsFlow.copyRoomCode({
      roomCode: this.data.roomCode
    })
  },

  goMemory() { wx.navigateTo({ url: '/pages/memory/memory' }) },

  async exportData() {
    const result = await settingsFlow.exportRecordsAsJson({
      cloud,
      roomSession
    })
    if (result.kind === 'room-repair') {
      syncRoomCode(this, result.repair)
      return
    }
    if (result.kind === 'no-room') {
      this.setData({ roomCode: '', roomCodeDisplay: '未绑定' })
    }
  },

  clearData() {
    wx.showModal({
      title: '⚠️ 确认清除',
      content: '将清除所有本地缓存，不会影响云端数据。确定？',
      success: async (res) => {
        if (res.confirm) {
          const result = await settingsFlow.clearLocalCache({ roomSession })
          this.setData({
            roomCode: '',
            roomCodeDisplay: result.roomCode || '未绑定'
          })
        }
      }
    })
  },

  about() {
    wx.showModal({
      title: '关于',
      content: '美少女的日历 v1.0.0\n\n云端共享版\n用心记录属于你们的每一天 ❤️',
      showCancel: false
    })
  }
})

function syncActiveRoom(page, room) {
  if (room && room.bound && room.roomCode) {
    page.setData({ roomCode: room.roomCode, roomCodeDisplay: room.roomCode })
    return
  }
  if (room && (room.kind === 'retryable-failure' || room.errorMsg)) {
    page.setData({ roomCode: '', roomCodeDisplay: '同步失败，请重试' })
    return
  }
  page.setData({ roomCode: '', roomCodeDisplay: '未绑定' })
}

function syncRoomCode(page, repair) {
  if (repair && repair.kind === 'success' && repair.bound && repair.roomCode) {
    page.setData({ roomCode: repair.roomCode, roomCodeDisplay: repair.roomCode })
    return
  }
  page.setData({ roomCode: '', roomCodeDisplay: '未绑定' })
}
