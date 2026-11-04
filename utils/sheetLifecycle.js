// 底部弹层进出。页面数据状态：closed → open → leaving → closed。
// 进场分两拍（先挂上关闭姿态，下一次渲染再打开），CSS transition 才能从中途反向。
// 离场对齐 --duration-exit，到点卸载，不听 transitionend。
// 交接把来源弹层在同一次 setData 里直接卸下，目标遮罩带交接标记挂载，面板仍从底边升起。

const SHEET_EXIT_MS = 200

function nextRender(fn) {
  if (typeof wx !== 'undefined' && wx && typeof wx.nextTick === 'function') {
    wx.nextTick(fn)
    return
  }
  setTimeout(fn, 0)
}

function createSheetLifecycle({ visibleKey, mountedKey, phaseKey, handoffKey, decorate }) {
  let generation = 0
  let exitTimer = null

  function clearExitTimer() {
    if (exitTimer === null) return
    clearTimeout(exitTimer)
    exitTimer = null
  }

  function mark(active) {
    return handoffKey ? { [handoffKey]: active } : {}
  }

  function commit(page, patch) {
    page.setData(typeof decorate === 'function' ? decorate(page, patch) : patch)
  }

  return {
    isMounted(page) {
      return Boolean(page.data[mountedKey])
    },

    // 取消尚未完成的进场或离场，并给出「已经不在树上」的数据。调用方把它并进同一次 setData。
    dismissPatch() {
      generation += 1
      clearExitTimer()
      return {
        [visibleKey]: false,
        [mountedKey]: false,
        [phaseKey]: 'closed',
        ...mark(false)
      }
    },

    open(page, extra = {}, options = {}) {
      const ticket = ++generation
      clearExitTimer()
      const dismissed = typeof options.dismiss === 'function' ? options.dismiss() : {}
      const patch = { ...extra, ...dismissed, ...mark(Boolean(options.handoff)) }
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
        [phaseKey]: 'leaving',
        ...mark(false)
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

function handoffSheet(page, from, to, extra = {}) {
  if (!from.isMounted(page)) {
    to.open(page, extra)
    return
  }
  to.open(page, extra, { handoff: true, dismiss: () => from.dismissPatch() })
}

const HOMEPAGE_SHEET_PHASES = [
  'monthPickerPhase',
  'dayActionPhase',
  'monthMenuPhase',
  'infoSheetPhase'
]

const HOMEPAGE_SHEET_MOUNTED_KEYS = [
  'monthPickerMounted',
  'dayActionMounted',
  'monthMenuMounted',
  'infoSheetMounted'
]

function homepageSheetMounted(data) {
  return HOMEPAGE_SHEET_MOUNTED_KEYS.some((key) => Boolean(data && data[key]))
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

// 一页里的底部弹层共用一套遮挡规则。打开或离场才算遮挡，进场第一拍仍是 closed，页面还没被盖住。
// 交接标记例外：遮罩已经完全不透明，装饰继续暂停。遮挡期间藏起原生 tabBar，
// 还有弹层挂载时留着系统返回拦截（sheetExitGuard）。
function sheetPageDecorator({ phaseKeys, mountedKeys, handoffKeys = [] }) {
  return function decorate(page, patch) {
    const next = { ...page.data, ...patch }
    const phaseCovered = phaseKeys.some((key) => next[key] === 'open' || next[key] === 'leaving')
    const pageObscured = phaseCovered || handoffKeys.some((key) => next[key] === true)
    syncSheetTabBar(page, pageObscured)
    return { ...patch, pageObscured, sheetExitGuard: mountedKeys.some((key) => Boolean(next[key])) }
  }
}

const homepageSheetPatch = sheetPageDecorator({
  phaseKeys: HOMEPAGE_SHEET_PHASES,
  mountedKeys: HOMEPAGE_SHEET_MOUNTED_KEYS,
  handoffKeys: ['infoSheetHandoff']
})

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

function homepageSheets(page) {
  if (!page._homepageSheets) {
    page._homepageSheets = {
      monthPicker: createSheetLifecycle({
        visibleKey: 'monthPickerVisible',
        mountedKey: 'monthPickerMounted',
        phaseKey: 'monthPickerPhase',
        decorate: homepageSheetPatch
      }),
      dayActions: createSheetLifecycle({
        visibleKey: 'dayActionSheetVisible',
        mountedKey: 'dayActionMounted',
        phaseKey: 'dayActionPhase',
        decorate: homepageSheetPatch
      }),
      toolsMenu: createSheetLifecycle({
        visibleKey: 'monthMenuVisible',
        mountedKey: 'monthMenuMounted',
        phaseKey: 'monthMenuPhase',
        decorate: homepageSheetPatch
      }),
      info: createSheetLifecycle({
        visibleKey: 'infoSheetVisible',
        mountedKey: 'infoSheetMounted',
        phaseKey: 'infoSheetPhase',
        handoffKey: 'infoSheetHandoff',
        decorate: homepageSheetPatch
      })
    }
  }
  return page._homepageSheets
}

const settingsHelpPatch = sheetPageDecorator({
  phaseKeys: ['helpPhase'],
  mountedKeys: ['helpMounted']
})

// issue #154：设置页「使用说明」与首页弹层同一生命周期、同一遮挡规则。
function settingsHelpSheet(page) {
  if (!page._settingsHelpSheet) {
    page._settingsHelpSheet = createSheetLifecycle({
      visibleKey: 'helpOpen',
      mountedKey: 'helpMounted',
      phaseKey: 'helpPhase',
      decorate: settingsHelpPatch
    })
  }
  return page._settingsHelpSheet
}

module.exports = {
  createSheetLifecycle,
  homepageSheets,
  settingsHelpSheet,
  handoffSheet,
  homepageSheetMounted,
  dismissSheetOnSystemBack,
  probeReducedMotion,
  readReducedMotionProbe,
  sheetTabBarAnimates
}
