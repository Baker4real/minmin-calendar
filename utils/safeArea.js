// 安全区运行时策略：顶部（状态栏）与底部（home 指示条/手势条）共用同一套查询。
// WXSS 的 env(safe-area-inset-*) 在部分 Android 设备上解析为 0，
// 导致自定义导航栏顶进系统状态栏、底部 sheet/表单操作贴进手势区；统一由 JS 计算，
// 经页面根节点的 CSS 变量注入（--safe-top → app.wxss 的 .safe-top；
// --safe-bottom → 各页面 .content 与底部 sheet 的 padding-bottom）。
let cachedSafeTop = null
let cachedSafeBottom = null

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

// 底部安全区插入（px）。与顶部不同：底部插入在无手势区的设备上就是 0，
// 兜底也返回 0——宁可贴边也不制造无意义底部空白。
function getSafeBottom() {
  if (cachedSafeBottom === null) cachedSafeBottom = querySafeBottomInset()
  return cachedSafeBottom
}

function querySafeBottomInset() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      const inset = readBottomInset(wx.getWindowInfo())
      if (inset !== null) return inset
    }
    const legacyInset = readBottomInset(wx.getSystemInfoSync())
    if (legacyInset !== null) return legacyInset
  } catch (e) {
    // 查询失败走兜底
  }
  return 0
}

function readBottomInset(info) {
  if (!info || !info.safeArea || typeof info.screenHeight !== 'number') return null
  const inset = info.screenHeight - info.safeArea.bottom
  return inset > 0 ? Math.round(inset) : 0
}

module.exports = { getSafeTop, getSafeBottom }
