const cloud = require('../../utils/cloud')
const roomSession = require('../../utils/room')
const { buildRoomShareCard } = require('../../utils/roomShare')
const roomPresence = require('../../utils/roomPresence')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const settingsFlow = require('../../utils/settingsFlow')
const safeArea = require('../../utils/safeArea')
const {
  probeReducedMotion,
  restoreTabBarOnShow
} = require('../../utils/sheetLifecycle')
const { withPageVisibility } = require('../../utils/pageVisibility')
const { confirmationSheet, confirmationSheetData, settingsHelpSheet } = require('../../utils/confirmationSheet')

// 与 pages/index/index.js 共享同一存储键；首页 onShow 重读本偏好
const CALENDAR_DENSITY_STORAGE_KEY = 'calendarDensity'

const SETTINGS_HELP_TOPICS = [
  {
    key: 'room',
    title: '房间与配对',
    paragraphs: [
      '房间是你们两个人共用的日历。把房间码发给对方，对方加入后就能一起看同一份经期和欢乐时光。',
      '解除绑定后，TA 还在房间里时，用房间码加入；房间里只剩你时，房间会归档，记录还在；在绑定页点「我来建房间」恢复。'
    ]
  },
  {
    key: 'records',
    title: '记录经期与欢乐时光',
    paragraphs: [
      '经期有「进行中」「结束日期不详」「已结束」三种状态。',
      '过去漏记的经期可以补记；进行中的经期结束后，用「记结束」填上结束日期。'
    ]
  },
  {
    key: 'calendar',
    title: '预测与日历标记',
    paragraphs: [
      '日历标记的意思，请点首页左上角的「图例」查看。',
      '预测是根据已有记录做的估算，不是医疗建议。'
    ]
  },
  {
    key: 'sync',
    title: '数据同步与隐私',
    paragraphs: [
      '重新同步房间会重新从云端读取你所在的房间，不会删除任何记录。',
      '导出会包含全部经期和欢乐时光；目前还不能导入恢复。'
    ]
  }
]

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
    ...safeArea.getNavTitlePadding('placeholder'),
    ...cachedRoomFirstFrame(),
    roomCodeLoaded: false,
    roomStatus: '',
    roomMemberLabel: '',
    calendarDensity: 'compact',
    // 使用说明弹层：closed → open → leaving → closed，与首页弹层同一生命周期（issue #154）
    helpOpen: false,
    helpMounted: false,
    helpPhase: 'closed',
    helpTopics: SETTINGS_HELP_TOPICS,
    helpDragClear: { token: 0, action: '', sheet: 'help' },
    pageObscured: false,
    sheetExitGuard: false,
    ...confirmationSheetData()
  }
}

Page(withPageVisibility({
  get data() {
    return settingsInitialData()
  },

  async onShow() {
    restoreTabBarOnShow(this)
    // Unknown and non-waiting states never expose the capsule's forward action.
    wx.hideShareMenu()
    this.setData({ calendarDensity: getSavedCalendarDensity() })
    probeReducedMotion(this)
    await this.resolveRoom()
  },

  onReady() {
    probeReducedMotion(this)
  },

  onUnload() {
    confirmationSheet(this).unload()
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
    if (density === this.data.calendarDensity) return
    const previousDensity = this.data.calendarDensity
    this.setData({ calendarDensity: density })
    try {
      wx.setStorageSync(CALENDAR_DENSITY_STORAGE_KEY, density)
    } catch (e) {
      this.setData({ calendarDensity: previousDensity })
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  async copyRoomCode() {
    await settingsFlow.copyRoomCode({
      roomCode: this.data.roomCode
    })
  },

  onShareAppMessage() {
    return buildRoomShareCard(this.data)
  },

  // issue #102 / #139：解除绑定在页底危险区；二次确认仍走 leaveRoom，成功后 reLaunch 回绑定页
  unbind() {
    return settingsFlow.leaveRoom({
      roomStatus: this.data.roomStatus,
      roomCode: this.data.roomCode,
      notifyOnBind: true,
      confirm: panel => confirmationSheet(this).open(panel),
      onResult: result => {
        if (result.kind === 'success') {
          // bind 非 tab 页，解绑成功后回绑定页只能 reLaunch
          wx.reLaunch({ url: '/pages/bind/bind' })
        } else if (result.kind === 'failure') {
          wx.showToast({ title: result.message, icon: 'none' })
        }
      }
    })
  },

  async exportData() {
    const result = await settingsFlow.exportRecordsAsJson({
      cloud,
      roomSession,
      confirmBeforeExport: true,
      confirm: panel => confirmationSheet(this).open(panel)
    })
    const displayState = roomAccessOutcome.buildRoomDisplayStateFromAccessOutcome(result)
    if (displayState) {
      this.setData(displayState)
    }
  },

  async clearData() {
    const confirmation = await settingsFlow.confirmResync({
      confirm: panel => confirmationSheet(this).open(panel)
    })
    if (confirmation.kind !== 'confirmed') return confirmation
    const result = await settingsFlow.clearLocalCache({ roomSession })
    syncActiveRoom(this, result.room)
    return result
  },

  openHelp() {
    settingsHelpSheet(this).open(this)
  },

  closeHelp() {
    settingsHelpSheet(this).leave(this)
  },

  onConfirmationAction(e) {
    confirmationSheet(this).action(e.currentTarget.dataset.action)
  },

  onConfirmationMask() {
    confirmationSheet(this).cancel()
  },

  onConfirmationClose() {
    confirmationSheet(this).cancel()
  },

  onSheetDragRelease(detail) {
    if (detail && detail.sheet === 'help') {
      settingsHelpSheet(this).dragRelease(this, detail)
      return
    }
    confirmationSheet(this).dragRelease(detail)
  },

  onSheetDragCancel(detail) {
    if (detail && detail.sheet === 'help') {
      settingsHelpSheet(this).dragCancel(this, detail)
      return
    }
    confirmationSheet(this).dragCancel(detail)
  },

  // 系统返回先关最上层面板，走同一条离场，不离开设置页。
  onSheetSystemBack() {
    if (this.data.confirmationMounted) {
      confirmationSheet(this).systemBack()
      return
    }
    settingsHelpSheet(this).systemBack(this)
  },

  noop() {}
}))

function syncActiveRoom(page, room) {
  // roomCodeLoaded：首次解析完成前不出重试/去绑定操作，避免未绑定文案闪出可点入口
  page.setData({
    roomCodeLoaded: true,
    roomStatus: room && room.status || '',
    roomMemberLabel: membershipLabel(room && room.status),
    ...roomAccessOutcome.buildRoomDisplayState(room)
  })
  if (page.data.roomStatus === 'waiting' && page.data.roomCode) {
    wx.showShareMenu({ menus: ['shareAppMessage'] })
  } else {
    wx.hideShareMenu()
  }
}

function membershipLabel(status) {
  if (status === 'waiting') return 'TA 还没加入'
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
