App({
  globalData: { statusBarHeight: 0 },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({ env: 'cloud1-d8gyqvcez4e66b3da', traceUser: true })
    }
    // 获取状态栏高度
    wx.getSystemInfo({ success: (res) => {
      this.globalData.statusBarHeight = res.statusBarHeight
    }})
  }
})
