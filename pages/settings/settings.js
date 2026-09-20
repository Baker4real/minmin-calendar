const cloud = require('../../utils/cloud')
const roomSession = require('../../utils/room')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const settingsFlow = require('../../utils/settingsFlow')
const safeArea = require('../../utils/safeArea')

Page({
  data: { safeTop: safeArea.getSafeTop(), roomCode: '', roomCodeDisplay: '未绑定' },

  async onShow() {
    const room = await roomSession.getVerifiedActiveRoom()
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
      roomSession,
      confirmBeforeExport: true
    })
    const displayState = roomAccessOutcome.buildRoomDisplayStateFromAccessOutcome(result)
    if (displayState) {
      this.setData(displayState)
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
  page.setData(roomAccessOutcome.buildRoomDisplayState(room))
}
