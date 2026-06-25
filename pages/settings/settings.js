const cloud = require('../../utils/cloud')
const roomSession = require('../../utils/room')

Page({
  data: { roomCode: '' },

  async onShow() {
    const room = await roomSession.getActiveRoom()
    if (room.bound) {
      this.setData({ roomCode: room.roomCode })
      return
    }

    this.setData({ roomCode: '未绑定' })
  },

  copyRoomCode() {
    const code = this.data.roomCode
    if (!code || code === '未绑定') return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '房间码已复制' })
    })
  },

  goMemory() { wx.navigateTo({ url: '/pages/memory/memory' }) },

  async exportData() {
    wx.showLoading({ title: '导出中...' })
    try {
      const periods = await cloud.getPeriods()
      const memories = await cloud.getMemories()
      const data = { exportTime: new Date().toISOString(), periods, memories }
      const json = JSON.stringify(data, null, 2)
      const fs = wx.getFileSystemManager()
      const path = `${wx.env.USER_DATA_PATH}/minmin-calendar-backup.json`
      fs.writeFileSync(path, json, 'utf8')
      wx.hideLoading()
      wx.shareFileMessage({
        filePath: path,
        success: () => wx.showToast({ title: '导出成功' }),
        fail: () => {
          wx.setClipboardData({
            data: json,
            success: () => wx.showToast({ title: '已复制到剪贴板' })
          })
        }
      })
    } catch(e) {
      wx.hideLoading()
      wx.showToast({ title: '导出失败', icon: 'error' })
    }
  },

  clearData() {
    wx.showModal({
      title: '⚠️ 确认清除',
      content: '将清除所有本地缓存，不会影响云端数据。确定？',
      success: (res) => {
        if (res.confirm) {
          roomSession.clearLocalRoom()
          this.setData({ roomCode: '未绑定' })
          wx.showToast({ title: '已清除' })
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
