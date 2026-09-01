// 顶部安全区（状态栏）高度，单位 px。
// WXSS 的 env(safe-area-inset-top) 在部分 Android 设备上解析为 0，
// 导致自定义导航栏顶进系统状态栏；统一由 JS 计算，经页面根节点的
// CSS 变量 --safe-top 注入（app.wxss 的 .safe-top 读取该变量）。
let cachedSafeTop = null

function getSafeTop() {
  if (cachedSafeTop === null) cachedSafeTop = queryStatusBarHeight()
  return cachedSafeTop
}

function queryStatusBarHeight() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (info && info.statusBarHeight > 0) return info.statusBarHeight
    }
    const legacy = wx.getSystemInfoSync()
    if (legacy && legacy.statusBarHeight > 0) return legacy.statusBarHeight
  } catch (e) {
    // 查询失败走兜底
  }
  return 44 // 约等于 88rpx 的通用兜底
}

module.exports = { getSafeTop }
