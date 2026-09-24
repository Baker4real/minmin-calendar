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
    needUnbind: false
  },

  onShow() {
    return this.checkRoom()
  },

  async checkRoom() {
    const room = await roomSession.getVerifiedActiveRoom()
    if (room.bound) {
      this.setData({ bound: true, roomCode: room.roomCode, errorMsg: '', needUnbind: false })
      return
    }

    const data = { bound: false, roomCode: '', errorMsg: room.errorMsg || '', needUnbind: false }
    this.setData(data)
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab, errorMsg: '' })
  },

  onCodeInput(e) {
    this.setData({ joinCode: e.detail.value.toUpperCase(), errorMsg: '' })
  },

  async createRoom() {
    if (this.data.loading) return
    this.setData({ loading: true, errorMsg: '' })
    const res = await roomSession.createRoom()
    if (res.code === 0) {
      this.setData({ bound: true, roomCode: res.roomCode, needUnbind: false })
    } else {
      this.setData({ errorMsg: res.msg, needUnbind: isLeaveRoomRequired(res.msg) })
    }
    this.setData({ loading: false })
  },

  async joinRoom() {
    if (this.data.loading) return
    const code = this.data.joinCode
    if (code.length !== 6) return
    this.setData({ loading: true, errorMsg: '' })
    const res = await roomSession.joinRoom(code)
    if (res.code === 0) {
      this.setData({ bound: true, roomCode: res.roomCode, needUnbind: false })
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
    wx.switchTab({ url: '/pages/index/index' })
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
