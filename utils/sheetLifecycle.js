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

// 打开或离场才算遮挡。进场第一拍仍是 closed，页面还没被盖住。
// 交接标记例外：遮罩已经完全不透明，装饰继续暂停。
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

function sheetTabBarAnimates(reducedMotion) {
  return !reducedMotion
}

function syncHomepageTabBar(page, obscured) {
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

function homepageSheetPatch(page, patch) {
  const next = { ...page.data, ...patch }
  const phaseCovered = HOMEPAGE_SHEET_PHASES.some((key) => next[key] === 'open' || next[key] === 'leaving')
  const pageObscured = phaseCovered || next.infoSheetHandoff === true
  syncHomepageTabBar(page, pageObscured)
  return { ...patch, pageObscured, sheetExitGuard: homepageSheetMounted(next) }
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

module.exports = {
  createSheetLifecycle,
  homepageSheets,
  handoffSheet,
  homepageSheetMounted,
  readReducedMotionProbe,
  sheetTabBarAnimates
}
