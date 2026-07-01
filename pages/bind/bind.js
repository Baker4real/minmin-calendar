const roomSession = require('../../utils/room')

Page({
  data: {
    tab: 'create',
    bound: false,
    roomCode: '',
    myRoomCode: '',
    joinCode: '',
    loading: false,
    errorMsg: ''
  },

  onShow() {
    return this.checkRoom()
  },

  async checkRoom() {
    const room = await roomSession.getVerifiedActiveRoom()
    if (room.bound) {
      this.setData({ bound: true, roomCode: room.roomCode, errorMsg: '' })
      return
    }

    const data = { bound: false, roomCode: '', errorMsg: room.errorMsg || '' }
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
      this.setData({ myRoomCode: res.roomCode, bound: true, roomCode: res.roomCode })
    } else {
      this.setData({ errorMsg: res.msg })
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
      this.setData({ bound: true, roomCode: res.roomCode })
    } else {
      this.setData({ errorMsg: res.msg })
    }
    this.setData({ loading: false })
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
            this.setData({ bound: false, roomCode: '', myRoomCode: '', joinCode: '' })
            return
          }

          this.setData({ errorMsg: result.msg || '解除绑定失败，请稍后重试' })
        }
      }
    })
  }
})
