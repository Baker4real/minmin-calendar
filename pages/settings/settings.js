const cloud = require('../../utils/cloud')
const roomSession = require('../../utils/room')
const roomPresence = require('../../utils/roomPresence')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const settingsFlow = require('../../utils/settingsFlow')
const safeArea = require('../../utils/safeArea')
const {
  settingsHelpSheet,
  dismissSheetOnSystemBack,
  probeReducedMotion,
  restoreTabBarOnShow
} = require('../../utils/sheetLifecycle')
const { markPageHidden, markPageShown } = require('../../utils/pageVisibility')

// 与 pages/index/index.js 共享同一存储键；首页 onShow 重读本偏好
const CALENDAR_DENSITY_STORAGE_KEY = 'calendarDensity'

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
    roomMemberLabel: '',
    calendarDensity: 'compact',
    // 使用说明弹层：closed → open → leaving → closed，与首页弹层同一生命周期（issue #154）
    helpOpen: false,
    helpMounted: false,
    helpPhase: 'closed',
    pageObscured: false,
    pageHidden: false,
    sheetExitGuard: false
  }
}

Page({
  get data() {
    return settingsInitialData()
  },

  async onShow() {
    markPageShown(this)
    restoreTabBarOnShow(this)
    this.setData({ calendarDensity: getSavedCalendarDensity() })
    probeReducedMotion(this)
    await this.resolveRoom()
  },

  onHide() {
    markPageHidden(this)
  },

  onReady() {
    probeReducedMotion(this)
  },

  // 房间码解析：同步失败或未绑定都停在这张卡上，由重试/去绑定操作接续（issue #79）
  async resolveRoom() {
    const room = await roomSession.getVerifiedActiveRoom()
    syncActiveRoom(this, room)
    if (roomPresence.rememberRoomStatus(room && room.status)) {
      wx.showToast({ title: 'TA 已加入', icon: 'none' })
    }
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

  // issue #102 / #139：解除绑定在页底危险区；二次确认仍走 leaveRoom，成功后 reLaunch 回绑定页
  unbind() {
    wx.showModal({
      title: '解除绑定',
      content: '解除绑定后你会退出这个房间。TA 还在的话会留在房间里；房间里只剩你时，房间会归档。之后在绑定页点「创建」即可恢复。',
      confirmText: '解除绑定',
      confirmColor: '#F97373',
      success: async (res) => {
        if (res.confirm) {
          const result = await roomSession.leaveRoom()
          if (result.code === 0) {
            try {
              wx.setStorageSync('bindUnbindNotice', '1')
            } catch (e) {}
            // bind 非 tab 页，解绑成功后回绑定页只能 reLaunch
            wx.reLaunch({ url: '/pages/bind/bind' })
            return
          }
          wx.showToast({ title: result.msg || '解除绑定失败，请稍后重试', icon: 'none' })
        }
      }
    })
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
      title: '重新同步房间',
      content: '只会清掉本机缓存的房间码，再重新获取。不会删除记录，也不会退出房间。',
      success: async (res) => {
        if (res.confirm) {
          const result = await settingsFlow.clearLocalCache({ roomSession })
          syncActiveRoom(this, result.room)
        }
      }
    })
  },

  openHelp() {
    settingsHelpSheet(this).open(this)
  },

  closeHelp() {
    settingsHelpSheet(this).leave(this)
  },

  // 系统返回先关掉帮助，走同一条离场，不离开设置页（同首页 issue #134）
  onSheetSystemBack() {
    dismissSheetOnSystemBack(this, {
      dismissTop: () => this.closeHelp(),
      isMounted: () => settingsHelpSheet(this).isMounted(this)
    })
  },

  noop() {}
})

function syncActiveRoom(page, room) {
  // roomCodeLoaded：首次解析完成前不出重试/去绑定操作，避免未绑定文案闪出可点入口
  page.setData({
    roomCodeLoaded: true,
    roomMemberLabel: membershipLabel(room && room.status),
    ...roomAccessOutcome.buildRoomDisplayState(room)
  })
}

function membershipLabel(status) {
  if (status === 'waiting') return '等待 TA 加入'
  if (status === 'paired') return 'TA 已加入'
  return ''
}

function getSavedCalendarDensity() {
  try {
    const density = wx.getStorageSync(CALENDAR_DENSITY_STORAGE_KEY)
    if (density === 'compact' || density === 'full') return density
  } catch (e) {}
  return 'compact'
}
