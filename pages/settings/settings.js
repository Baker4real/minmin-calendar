const cloud = require('../../utils/cloud')
const roomSession = require('../../utils/room')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const settingsFlow = require('../../utils/settingsFlow')
const safeArea = require('../../utils/safeArea')

// 与 pages/index/index.js 共享同一存储键；首页 onShow 重读本偏好
const CALENDAR_DENSITY_STORAGE_KEY = 'calendarDensity'

Page({
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), roomCode: '', roomCodeDisplay: '未绑定', roomCodeLoaded: false, calendarDensity: 'compact' },

  async onShow() {
    this.setData({ calendarDensity: getSavedCalendarDensity() })
    await this.resolveRoom()
  },

  // 房间码解析：同步失败或未绑定都停在这张卡上，由重试/去绑定操作接续（issue #79）
  async resolveRoom() {
    const room = await roomSession.getVerifiedActiveRoom()
    syncActiveRoom(this, room)
  },

  retryRoomResolve() {
    return this.resolveRoom()
  },

  goBind() { wx.navigateTo({ url: '/pages/bind/bind' }) },

  setCalendarDensity(e) {
    const density = e.currentTarget.dataset.density
    if (density !== 'compact' && density !== 'full') return
    this.setData({ calendarDensity: density })
    try {
      wx.setStorageSync(CALENDAR_DENSITY_STORAGE_KEY, density)
    } catch (e) {}
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
      content: '只清除保存在本机的房间码：云端记录会保留，也不会退出当前房间。确定清除？',
      success: async (res) => {
        if (res.confirm) {
          const result = await settingsFlow.clearLocalCache({ roomSession })
          syncActiveRoom(this, result.room)
        }
      }
    })
  },

  about() {
    wx.showModal({
      title: '关于',
      content: '美少女的日历 v1.0.0\n\n云端共享版\n用心记录属于你们的每一天',
      showCancel: false
    })
  }
})

function syncActiveRoom(page, room) {
  // roomCodeLoaded：首次解析完成前不出重试/去绑定操作，避免未绑定文案闪出可点入口
  page.setData({ roomCodeLoaded: true, ...roomAccessOutcome.buildRoomDisplayState(room) })
}

function getSavedCalendarDensity() {
  try {
    const density = wx.getStorageSync(CALENDAR_DENSITY_STORAGE_KEY)
    if (density === 'compact' || density === 'full') return density
  } catch (e) {}
  return 'compact'
}
