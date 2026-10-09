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
    open(page, extra = {}) {
      const ticket = ++generation
      clearExitTimer()
      const mounted = Boolean(page.data[mountedKey])
      const phase = page.data[phaseKey]
      if (mounted && phase === 'leaving') {
        commit(page, { ...extra, [visibleKey]: true, [mountedKey]: true, [phaseKey]: 'open' })
        return
      }
      if (mounted && phase === 'open') {
        commit(page, { ...extra, [visibleKey]: true })
        return
      }
      commit(page, { ...extra, [visibleKey]: true, [mountedKey]: true, [phaseKey]: 'closed' })
      nextRender(() => {
        if (ticket !== generation) return
        if (!page.data[mountedKey] || page.data[phaseKey] !== 'closed') return
        commit(page, { [phaseKey]: 'open' })
      })
    },

    leave(page, onUnmount) {
      if (!page.data[mountedKey]) return
      if (page.data[phaseKey] === 'leaving') return
      const ticket = ++generation
      clearExitTimer()
      commit(page, { [visibleKey]: false, [mountedKey]: true, [phaseKey]: 'leaving' })
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

// 打开或离场才算遮挡。进场第一拍仍是 closed，页面还没被盖住。
const HOMEPAGE_SHEET_PHASES = [
  'monthPickerPhase',
  'dayActionPhase',
  'monthMenuPhase',
  'infoSheetPhase'
]

function homepageSheetPatch(page, patch) {
  const next = { ...page.data, ...patch }
  const pageObscured = HOMEPAGE_SHEET_PHASES.some((key) => next[key] === 'open' || next[key] === 'leaving')
  return { ...patch, pageObscured }
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
        decorate: homepageSheetPatch
      })
    }
  }
  return page._homepageSheets
}

module.exports = { createSheetLifecycle, homepageSheets }
