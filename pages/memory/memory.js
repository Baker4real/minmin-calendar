const safeArea = require('../../utils/safeArea')
const recordPageSync = require('../../utils/recordPageSync')

Page({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset(),
    ...safeArea.getNavTitlePadding('placeholder')
  },

  onShow() {
    recordPageSync.setRecordTabSegmentIntent('memory')
    wx.switchTab({ url: '/pages/period/period' })
    return Promise.resolve()
  }
})
