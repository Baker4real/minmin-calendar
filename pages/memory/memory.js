const safeArea = require('../../utils/safeArea')

// 与 pages/period/period.js 及两个记录编辑页共享的一次性「目标分段」意图键。
// 旧欢乐时光页是兼容路由：switchTab 不能带 query，先写键再切到记录 tab（issue #143）
const RECORD_TAB_SEGMENT_STORAGE_KEY = 'recordTabSegment'

Page({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset()
  },

  onShow() {
    try {
      wx.setStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY, 'memory')
    } catch (e) {}
    wx.switchTab({ url: '/pages/period/period' })
    return Promise.resolve()
  }
})
