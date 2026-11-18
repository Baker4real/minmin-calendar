// 底部弹层进出。页面数据状态：closed → open → leaving → closed。
// 进场分两拍（先挂上关闭姿态，下一次渲染再打开），CSS transition 才能从中途反向。
// 离场对齐 --duration-exit，到点卸载，不听 transitionend。

const SHEET_EXIT_MS = 200

function nextRender(fn) {
  if (typeof wx !== 'undefined' && wx && typeof wx.nextTick === 'function') {
    wx.nextTick(fn)
    return
  }
  setTimeout(fn, 0)
}

function createSheetLifecycle({ visibleKey, mountedKey, phaseKey, decorate }) {
  let generation = 0
  let exitTimer = null

  function clearExitTimer() {
    if (exitTimer === null) return
    clearTimeout(exitTimer)
    exitTimer = null
  }

  function commit(page, patch) {
    page.setData(typeof decorate === 'function' ? decorate(page, patch) : patch)
  }

  return {
    isMounted(page) {
      return Boolean(page.data[mountedKey])
    },

    // 页面卸载等调用方需要取消尚未完成的进出，并取得「已经不在树上」的数据。
    dismissPatch() {
      generation += 1
      clearExitTimer()
      return {
        [visibleKey]: false,
        [mountedKey]: false,
        [phaseKey]: 'closed'
      }
    },

    open(page, extra = {}) {
      const ticket = ++generation
      clearExitTimer()
      const patch = { ...extra }
      const mounted = Boolean(page.data[mountedKey])
      const phase = page.data[phaseKey]
      if (mounted && phase === 'leaving') {
        commit(page, { ...patch, [visibleKey]: true, [mountedKey]: true, [phaseKey]: 'open' })
        return
      }
      if (mounted && phase === 'open') {
        commit(page, { ...patch, [visibleKey]: true })
        return
      }
      commit(page, { ...patch, [visibleKey]: true, [mountedKey]: true, [phaseKey]: 'closed' })
      nextRender(() => {
        if (ticket !== generation) return
        if (!page.data[mountedKey] || page.data[phaseKey] !== 'closed') return
        commit(page, { [phaseKey]: 'open' })
      })
    },

    leave(page, onUnmount, extra = {}) {
      if (!page.data[mountedKey]) return
      if (page.data[phaseKey] === 'leaving') return
      const ticket = ++generation
      clearExitTimer()
      commit(page, {
        ...extra,
        [visibleKey]: false,
        [mountedKey]: true,
        [phaseKey]: 'leaving'
      })
      exitTimer = setTimeout(() => {
        exitTimer = null
        if (ticket !== generation) return
        if (page.data[phaseKey] !== 'leaving') return
        commit(page, { [visibleKey]: false, [mountedKey]: false, [phaseKey]: 'closed' })
        if (typeof onUnmount === 'function') onUnmount()
      }, SHEET_EXIT_MS)
    }
  }
}

function readReducedMotionProbe(width) {
  return parseFloat(width) > 0
}

// 微信逻辑层没有 matchMedia。探针宽度在减弱动效下是 1px，computed style 会保留这个用值。
// 页面要放一个 .reduced-motion-probe 节点；结果记在页面上，tabBar 隐藏和恢复据此决定是否播动画。
function probeReducedMotion(page) {
  if (typeof wx === 'undefined' || !wx || typeof wx.createSelectorQuery !== 'function') return
  wx.createSelectorQuery()
    .select('.reduced-motion-probe')
    .fields({ computedStyle: ['width'] })
    .exec((res) => {
      const width = res && res[0] && res[0].width
      page._reducedMotion = readReducedMotionProbe(width)
    })
}

function sheetTabBarAnimates(reducedMotion) {
  return !reducedMotion
}

function syncSheetTabBar(page, obscured) {
  const animation = sheetTabBarAnimates(Boolean(page._reducedMotion))
  if (obscured) {
    if (page._sheetTabBarHidden) return
    page._sheetTabBarHidden = true
    if (typeof wx !== 'undefined' && wx && typeof wx.hideTabBar === 'function') {
      wx.hideTabBar({ animation })
    }
    return
  }
  if (!page._sheetTabBarHidden) return
  page._sheetTabBarHidden = false
  if (typeof wx !== 'undefined' && wx && typeof wx.showTabBar === 'function') {
    wx.showTabBar({ animation })
  }
}

// 原生 tabBar 的显隐是整个小程序共用的状态。弹层开着时页面被卸载（reLaunch、redirectTo、热启动换路径）
// 不经过离场，藏起的 tabBar 会一直藏着。tab 页每次显示时调用：本页没有弹层盖着就立即交还，
// 盖着时不动，仍由离场恢复。
function restoreTabBarOnShow(page) {
  if (page && page._sheetTabBarHidden) return
  if (typeof wx !== 'undefined' && wx && typeof wx.showTabBar === 'function') {
    wx.showTabBar({ animation: false })
  }
}

// 一页里的底部弹层共用一套遮挡规则。打开或离场才算遮挡，进场第一拍仍是 closed，页面还没被盖住。
// 遮挡期间藏起原生 tabBar，还有弹层挂载时留着系统返回拦截（sheetExitGuard）。
function sheetPageDecorator({ phaseKeys, mountedKeys }) {
  return function decorate(page, patch) {
    const next = { ...page.data, ...patch }
    const pageObscured = phaseKeys.some((key) => next[key] === 'open' || next[key] === 'leaving')
    syncSheetTabBar(page, pageObscured)
    return { ...patch, pageObscured, sheetExitGuard: mountedKeys.some((key) => Boolean(next[key])) }
  }
}

// issue #134：page-container 吃掉系统返回后会自己离场。弹层还在时下一帧重新挂上，避免第二次返回离开页面。
// 把 show 设为 false 时组件会再次触发 beforeleave，用锁挡住这次重入。
function dismissSheetOnSystemBack(page, { dismissTop, isMounted }) {
  if (page._sheetBackLock) return
  page._sheetBackLock = true
  dismissTop()
  const stillMounted = isMounted()
  page.setData({ sheetExitGuard: false })
  if (!stillMounted) {
    page._sheetBackLock = false
    return
  }
  nextRender(() => {
    page._sheetBackLock = false
    if (isMounted()) page.setData({ sheetExitGuard: true })
  })
}

function decideSheetDragRelease(displacement, elapsed, panelHeight) {
  if (!(displacement > 0)) return 'reset'
  const pastDistance = panelHeight > 0 && displacement > panelHeight * 0.25
  const pastSpeed = elapsed > 0 && displacement / elapsed > 0.11
  return pastDistance || pastSpeed ? 'close' : 'reset'
}

module.exports = {
  createSheetLifecycle,
  sheetPageDecorator,
  decideSheetDragRelease,
  dismissSheetOnSystemBack,
  probeReducedMotion,
  readReducedMotionProbe,
  restoreTabBarOnShow,
  sheetTabBarAnimates
}
