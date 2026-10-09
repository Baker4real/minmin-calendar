const roomSession = require('../../utils/room')
const settingsFlow = require('../../utils/settingsFlow')
const safeArea = require('../../utils/safeArea')

// 云端 create/join 拒绝「已在其他房间」时返回的固定短语（roomMembershipLifecycle），
// 命中时当前屏直接提供解除绑定，而不是只留一句错误
const LEAVE_ROOM_REQUIRED_HINT = '请先解除绑定'

function isLeaveRoomRequired(msg) {
  return typeof msg === 'string' && msg.indexOf(LEAVE_ROOM_REQUIRED_HINT) !== -1
}

Page({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    tab: 'create',
    bound: false,
    roomCode: '',
    joinCode: '',
    loading: false,
    errorMsg: '',
    needUnbind: false,
    checkFailed: false,
    justCreated: false,
    homeJumpFailed: false,
    // issue #115：第一次显示到第一次校验结果之前只留品牌心
    verifying: true,
    revealed: false
  },

  onShow() {
    return this.checkRoom()
  },

  async checkRoom() {
    const room = await roomSession.getVerifiedActiveRoom()
    if (room.bound) {
      // issue #102：已绑定冷启动直达首页，不再停在绑定页多点一次「进入应用」
      // review #99：重校验清空一次性旗标——「进入应用」只在跳转失败或刚创建房间时出现
      this.setData({ bound: true, roomCode: room.roomCode, errorMsg: '', needUnbind: false, justCreated: false, checkFailed: false, homeJumpFailed: false, verifying: false })
      this.goHome()
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
      revealed: true
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
    this.setData({ joinCode: e.detail.value.toUpperCase(), errorMsg: '' })
  },

  async createRoom() {
    if (this.data.loading) return
    this.setData({ loading: true, errorMsg: '', checkFailed: false })
    const res = await roomSession.createRoom()
    if (res.code === 0) {
      // issue #102：创建后引导——本次会话内在房间码区域提示「把房间码发给 TA」（onShow 重校验后清除）
      this.setData({ bound: true, roomCode: res.roomCode, needUnbind: false, justCreated: true })
    } else {
      this.setData({ errorMsg: res.msg, needUnbind: isLeaveRoomRequired(res.msg) })
    }
    this.setData({ loading: false })
  },

  async joinRoom() {
    if (this.data.loading) return
    const code = this.data.joinCode
    if (code.length !== 6) return
    this.setData({ loading: true, errorMsg: '', checkFailed: false })
    const res = await roomSession.joinRoom(code)
    if (res.code === 0) {
      this.setData({ bound: true, roomCode: res.roomCode, needUnbind: false })
      // issue #102：加入成功给一次「已和 TA 连上」反馈再进首页；toast 发出即跳转，不等待
      wx.showToast({ title: '已和 TA 连上' })
      this.goHome()
    } else {
      this.setData({ errorMsg: res.msg, needUnbind: isLeaveRoomRequired(res.msg) })
    }
    this.setData({ loading: false })
  },

  async copyRoomCode() {
    await settingsFlow.copyRoomCode({
      roomCode: this.data.roomCode
    })
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
    wx.showModal({
      title: '解除绑定',
      content: '解除后将退出当前房间；若你是最后一人，数据会归档，可在本页重新创建恢复。确定解除？',
      success: async (res) => {
        if (res.confirm) {
          const result = await roomSession.leaveRoom()
          if (result.code === 0) {
            this.setData({ bound: false, roomCode: '', joinCode: '', errorMsg: '', needUnbind: false })
            return
          }

          this.setData({ errorMsg: result.msg || '解除绑定失败，请稍后重试' })
        }
      }
    })
  }
})
