const roomSession = require('../../utils/room')
const settingsFlow = require('../../utils/settingsFlow')
const cloud = require('../../utils/cloud')
const roomRecordsSync = require('../../utils/roomRecordsSync')
const safeArea = require('../../utils/safeArea')
const { withPageVisibility } = require('../../utils/pageVisibility')

const ROOM_CODE_LENGTH = 6
const OPENING_CALENDAR_HINT_DELAY = 800

function normalizeRoomCode(value) {
  return String(value || '').replace(/\s/g, '').toUpperCase()
}

function inviteCodeFromLaunchQuery(options) {
  const raw = options && options.roomCode
  if (typeof raw !== 'string') return ''
  const code = normalizeRoomCode(raw)
  return code.length === ROOM_CODE_LENGTH ? code : ''
}

async function restoredRoomNotice() {
  try {
    const client = cloud.createRoomDataClient()
    const [periods, memories] = await Promise.all([
      client.list('periods'),
      client.list('memories')
    ])
    if (!periods || periods.kind !== 'success' || !memories || memories.kind !== 'success') return ''
    const count = (periods.data || []).length + (memories.data || []).length
    if (count <= 0) return ''
    return `已恢复原来的房间和 ${count} 条记录`
  } catch (error) {
    return ''
  }
}

Page(withPageVisibility({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset(),
    tab: '',
    bound: false,
    roomCode: '',
    joinCode: '',
    loading: false,
    errorMsg: '',
    needUnbind: false,
    checkFailed: false,
    justCreated: false,
    restoredNotice: '',
    homeJumpFailed: false,
    // issue #115/#220：第一次校验结果前只留品牌心；慢校验 800ms 后追加打开提示
    verifying: true,
    revealed: false,
    openingCalendarHint: false
  },

  onLoad(options) {
    this.pendingInviteCode = inviteCodeFromLaunchQuery(options)
  },

  onShow() {
    settingsFlow.consumeRoomLeaveNotice()
    const returningFromShare = this.inviteSharePending === true
    this.inviteSharePending = false
    return this.checkRoom({ returningFromShare })
  },

  async checkRoom(options = {}) {
    const returningFromShare = options.returningFromShare === true
    const firstCheck = this.data.verifying
    if (firstCheck && !this._openingCalendarHintTimer && !this.data.openingCalendarHint) {
      this._openingCalendarHintTimer = setTimeout(() => {
        this._openingCalendarHintTimer = null
        if (this.data.verifying) this.setData({ openingCalendarHint: true })
      }, OPENING_CALENDAR_HINT_DELAY)
    }
    const preload = firstCheck && roomSession.getRoomCode()
    const checking = roomSession.getVerifiedActiveRoom()
    if (preload) roomRecordsSync.load()
    const room = await checking
    if (this._openingCalendarHintTimer) {
      clearTimeout(this._openingCalendarHintTimer)
      this._openingCalendarHintTimer = null
    }
    if (preload && !room.bound) roomRecordsSync.discard()
    const inviteCode = this.pendingInviteCode || ''
    this.pendingInviteCode = ''
    if (room.bound) {
      // issue #102：已绑定冷启动直达首页，不再停在绑定页多点一次「进入应用」
      // review #99：重校验清空一次性旗标——「进入应用」只在跳转失败或刚创建房间时出现
      this.setData({ bound: true, roomCode: room.roomCode, errorMsg: '', needUnbind: false, justCreated: returningFromShare ? this.data.justCreated : false, checkFailed: false, homeJumpFailed: false, verifying: false, openingCalendarHint: false })
      if (!returningFromShare) this.goHome()
      return
    }

    const data = {
      bound: false,
      roomCode: '',
      errorMsg: room.errorMsg || '',
      needUnbind: false,
      justCreated: false,
      homeJumpFailed: false,
      // 校验失败（网络/云端异常）时给出可点重试；未绑定没有错误文案，不出重试
      checkFailed: Boolean(room.errorMsg),
      verifying: false,
      revealed: true,
      openingCalendarHint: false
    }
    if (inviteCode) {
      data.tab = 'join'
      data.joinCode = inviteCode
    }
    this.setData(data)
  },

  // issue #102：校验失败的可点重试——重跑 onShow 同款校验，停留在本页，不导向重新绑定
  retryCheck() {
    return this.checkRoom()
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab, errorMsg: '' })
  },

  onCodeInput(e) {
    this.setData({ joinCode: normalizeRoomCode(e.detail.value), errorMsg: '' })
  },

  async createRoom() {
    if (this.data.loading) return
    this.setData({ loading: true, errorMsg: '', checkFailed: false })
    const res = await roomSession.createRoom()
    if (res.code === 0) {
      // issue #102：创建后引导——本次会话内在房间码区域提示「把房间码发给 TA」（onShow 重校验后清除）
      this.setData({ bound: true, roomCode: res.roomCode, needUnbind: false, justCreated: true, loading: false })
      const restoredNotice = await restoredRoomNotice()
      if (restoredNotice) this.setData({ restoredNotice })
    } else {
      this.setData({ errorMsg: res.msg, needUnbind: res.reason === 'already-in-other-room', loading: false })
    }
  },

  async joinRoom() {
    if (this.data.loading) return
    const code = normalizeRoomCode(this.data.joinCode)
    if (code.length !== 6) return
    this.setData({ loading: true, errorMsg: '', checkFailed: false })
    const res = await roomSession.joinRoom(code)
    if (res.code === 0) {
      this.setData({ bound: true, roomCode: res.roomCode, needUnbind: false, loading: false })
      this.goHome()
    } else {
      this.setData({ errorMsg: res.msg, needUnbind: res.reason === 'already-in-other-room', loading: false })
    }
  },

  async copyRoomCode() {
    await settingsFlow.copyRoomCode({
      roomCode: this.data.roomCode
    })
  },

  // issue #140：邀请卡标题固定，不含经期或记录；房间码只放在启动首屏的路径参数里
  onShareAppMessage() {
    // R8：分享返回后的那次 onShow 仍校验房间，但保留建房卡，不自动离开；下一次显示恢复正常。
    this.inviteSharePending = true
    return {
      title: '邀请你加入我的日历',
      path: `/pages/bind/bind?roomCode=${this.data.roomCode}`
    }
  },

  goHome() {
    wx.switchTab({
      url: '/pages/index/index',
      fail: () => {
        // 跳转失败时停留在已绑定卡，竖起旗标让「进入应用」成为用户可见的最小兜底
        this.setData({ bound: true, homeJumpFailed: true, revealed: true, verifying: false })
      }
    })
  },

  unbind() {
    settingsFlow.leaveRoom({
      onResult: result => {
        if (result.kind === 'success') {
          this.setData({ bound: false, roomCode: '', joinCode: '', errorMsg: '', needUnbind: false })
        } else if (result.kind === 'failure') {
          this.setData({ errorMsg: result.message })
        }
      }
    })
  }
}))
