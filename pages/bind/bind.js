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
    this.checkRoom()
  },

  async checkRoom() {
    const roomCode = wx.getStorageSync('roomCode')
    if (roomCode) {
      this.setData({ bound: true, roomCode })
      return
    }

    try {
      const res = await wx.cloud.callFunction({ name: 'getMyRoom' })
      const room = res.result?.room
      if (res.result?.code === 0 && room?.roomCode) {
        wx.setStorageSync('roomCode', room.roomCode)
        this.setData({ bound: true, roomCode: room.roomCode })
        return
      }
    } catch (e) {
      this.setData({ errorMsg: '同步房间状态失败：' + e.message })
    }

    this.setData({ bound: false, roomCode: '' })
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
    try {
      const res = await wx.cloud.callFunction({ name: 'createRoom' })
      if (res.result.code === 0) {
        const room = res.result.room
        wx.setStorageSync('roomCode', room.roomCode)
        this.setData({ myRoomCode: room.roomCode, bound: true, roomCode: room.roomCode })
      } else {
        this.setData({ errorMsg: res.result.msg })
      }
    } catch (e) {
      this.setData({ errorMsg: '创建失败：' + e.message })
    }
    this.setData({ loading: false })
  },

  async joinRoom() {
    if (this.data.loading) return
    const code = this.data.joinCode
    if (code.length !== 6) return
    this.setData({ loading: true, errorMsg: '' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'joinRoom',
        data: { roomCode: code }
      })
      if (res.result.code === 0) {
        const roomCode = res.result.roomCode || code
        wx.setStorageSync('roomCode', roomCode)
        this.setData({ bound: true, roomCode })
      } else {
        this.setData({ errorMsg: res.result.msg })
      }
    } catch (e) {
      this.setData({ errorMsg: '加入失败：' + e.message })
    }
    this.setData({ loading: false })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  unbind() {
    wx.showModal({
      title: '解除绑定',
      content: '解除后需要重新扫码加入房间，数据不会丢失。确定解除？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('roomCode')
          this.setData({ bound: false, roomCode: '', myRoomCode: '', joinCode: '' })
        }
      }
    })
  }
})
