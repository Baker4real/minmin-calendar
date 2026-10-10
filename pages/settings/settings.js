const cloud = require('../../utils/cloud')
const roomSession = require('../../utils/room')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const settingsFlow = require('../../utils/settingsFlow')
const safeArea = require('../../utils/safeArea')

// 与 pages/index/index.js 共享同一存储键；首页 onShow 重读本偏好
const CALENDAR_DENSITY_STORAGE_KEY = 'calendarDensity'
// 与 pages/period/period.js 及两个记录编辑页共享的一次性「目标分段」意图键：
// switchTab 不能带 query，「查看欢乐时光」先写键再切 tab，记录 tab onShow 消费并清除（issue #103）
const RECORD_TAB_SEGMENT_STORAGE_KEY = 'recordTabSegment'

// issue #114：首帧只读本机缓存。没有缓存时用中性「读取中…」，云端校验仍是最终依据。
// 必须在页面实例创建时读。写进 data 字面量会在模块求值时只跑一次，同一次进程里的下一次进入仍是那张快照。
function cachedRoomFirstFrame() {
  const roomCode = roomSession.getRoomCode()
  if (roomCode) return { roomCode, roomCodeDisplay: roomCode }
  return { roomCode: '', roomCodeDisplay: '读取中…' }
}

function settingsInitialData() {
  return {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset(),
    ...cachedRoomFirstFrame(),
    roomCodeLoaded: false,
    calendarDensity: 'compact'
  }
}

Page({
  get data() {
    return settingsInitialData()
  },

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

  // issue #102：「解除绑定」从绑定页已绑定卡移到本页房间卡；二次确认文案与绑定页逐字一致
  unbind() {
    wx.showModal({
      title: '解除绑定',
      content: '解除后将退出当前房间；若你是最后一人，数据会归档，可在本页重新创建恢复。确定解除？',
      success: async (res) => {
        if (res.confirm) {
          const result = await roomSession.leaveRoom()
          if (result.code === 0) {
            // bind 非 tab 页，解绑成功后回绑定页只能 reLaunch
            wx.reLaunch({ url: '/pages/bind/bind' })
            return
          }
          wx.showToast({ title: result.msg || '解除绑定失败，请稍后重试', icon: 'none' })
        }
      }
    })
  },

  goMemory() {
    try {
      wx.setStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY, 'memory')
    } catch (e) {}
    wx.switchTab({ url: '/pages/period/period' })
  },

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
      title: '确认清除',
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
