// 安全区运行时策略：顶部（状态栏）与底部（home 指示条/手势条）共用同一套查询。
// WXSS 的 env(safe-area-inset-*) 在部分 Android 设备上解析为 0，
// 导致自定义导航栏顶进系统状态栏、底部 sheet/表单操作贴进手势区；统一由 JS 计算，
// 经页面根节点的 CSS 变量注入（--safe-top、--nav-bar-height、--capsule-right、
// --safe-bottom）。顶栏高度由状态栏和胶囊矩形推出，右侧让出胶囊宽度。
let cachedSafeTop = null
let cachedSafeBottom = null
let cachedCapsule = null
let cachedWindowWidth = null

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

// 胶囊矩形与顶/底安全区走同一套运行时查询。
// 顶栏高度 = 状态栏 + 由胶囊矩形推出的导航高度（胶囊在导航行里上下间隙相等）。
function getCapsuleRect() {
  if (cachedCapsule === null) cachedCapsule = queryCapsuleRect()
  return cachedCapsule
}

function queryCapsuleRect() {
  try {
    if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
      const rect = readCapsuleRect(wx.getMenuButtonBoundingClientRect())
      if (rect) return rect
    }
  } catch (e) {
    // 拿不到胶囊矩形时走兜底
  }
  return fallbackCapsuleRect()
}

function readCapsuleRect(rect) {
  if (!rect) return null
  const { width, height, top, right, bottom, left } = rect
  const numbers = [width, height, top, right, bottom, left]
  if (!numbers.every(value => typeof value === 'number' && Number.isFinite(value))) return null
  if (!(width > 0 && height > 0 && right > left && bottom > top)) return null
  return { width, height, top, right, bottom, left }
}

function fallbackCapsuleRect() {
  const statusBar = getSafeTop()
  const windowWidth = queryWindowWidth()
  const width = 87
  const height = 32
  const top = statusBar + 4
  const right = windowWidth - 7
  const left = right - width
  return { width, height, top, right, bottom: top + height, left }
}

function queryWindowWidth() {
  if (cachedWindowWidth === null) cachedWindowWidth = readWindowWidth()
  return cachedWindowWidth
}

function readWindowWidth() {
  try {
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (info && info.windowWidth > 0) return info.windowWidth
    }
    const legacy = wx.getSystemInfoSync()
    if (legacy && legacy.windowWidth > 0) return legacy.windowWidth
  } catch (e) {
    // 查询失败走兜底
  }
  return 375
}

function getNavBarHeight() {
  const statusBar = getSafeTop()
  const capsule = getCapsuleRect()
  const gap = Math.max(0, capsule.top - statusBar)
  return statusBar + gap * 2 + capsule.height
}

function getCapsuleRightInset() {
  return queryWindowWidth() - getCapsuleRect().left
}

module.exports = { getSafeTop, getSafeBottom, getCapsuleRect, getNavBarHeight, getCapsuleRightInset }
