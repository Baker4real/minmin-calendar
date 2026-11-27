// WeChat window metrics compatibility seam. Callers consume geometry, not API fallback branches.
function getWindowWidth() {
  try {
    if (typeof wx === 'undefined' || !wx) return null
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (info && Number.isFinite(info.windowWidth) && info.windowWidth > 0) return info.windowWidth
    }
    if (typeof wx.getSystemInfoSync === 'function') {
      const legacy = wx.getSystemInfoSync()
      if (legacy && Number.isFinite(legacy.windowWidth) && legacy.windowWidth > 0) return legacy.windowWidth
    }
  } catch (e) {
    // Callers apply their own geometry fallback.
  }
  return null
}

function getWindowHeight() {
  try {
    if (typeof wx === 'undefined' || !wx) return null
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (info && Number.isFinite(info.windowHeight) && info.windowHeight > 0) return info.windowHeight
    }
    if (typeof wx.getSystemInfoSync === 'function') {
      const legacy = wx.getSystemInfoSync()
      if (legacy && Number.isFinite(legacy.windowHeight) && legacy.windowHeight > 0) return legacy.windowHeight
    }
  } catch (e) {
    // Callers apply their own geometry fallback.
  }
  return null
}

module.exports = { getWindowWidth, getWindowHeight }
