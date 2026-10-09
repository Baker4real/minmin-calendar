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

function createSheetLifecycle({ visibleKey, mountedKey, phaseKey }) {
  let generation = 0
  let exitTimer = null

  function clearExitTimer() {
    if (exitTimer === null) return
    clearTimeout(exitTimer)
    exitTimer = null
  }

  return {
    open(page, extra = {}) {
      const ticket = ++generation
      clearExitTimer()
      const mounted = Boolean(page.data[mountedKey])
      const phase = page.data[phaseKey]
      if (mounted && phase === 'leaving') {
        page.setData({ ...extra, [visibleKey]: true, [mountedKey]: true, [phaseKey]: 'open' })
        return
      }
      if (mounted && phase === 'open') {
        page.setData({ ...extra, [visibleKey]: true })
        return
      }
      page.setData({ ...extra, [visibleKey]: true, [mountedKey]: true, [phaseKey]: 'closed' })
      nextRender(() => {
        if (ticket !== generation) return
        if (!page.data[mountedKey] || page.data[phaseKey] !== 'closed') return
        page.setData({ [phaseKey]: 'open' })
      })
    },

    leave(page, onUnmount) {
      if (!page.data[mountedKey]) return
      if (page.data[phaseKey] === 'leaving') return
      const ticket = ++generation
      clearExitTimer()
      page.setData({ [visibleKey]: false, [mountedKey]: true, [phaseKey]: 'leaving' })
      exitTimer = setTimeout(() => {
        exitTimer = null
        if (ticket !== generation) return
        if (page.data[phaseKey] !== 'leaving') return
        page.setData({ [visibleKey]: false, [mountedKey]: false, [phaseKey]: 'closed' })
        if (typeof onUnmount === 'function') onUnmount()
      }, SHEET_EXIT_MS)
    }
  }
}

function homepageSheets(page) {
  if (!page._homepageSheets) {
    page._homepageSheets = {
      monthPicker: createSheetLifecycle({
        visibleKey: 'monthPickerVisible',
        mountedKey: 'monthPickerMounted',
        phaseKey: 'monthPickerPhase'
      }),
      dayActions: createSheetLifecycle({
        visibleKey: 'dayActionSheetVisible',
        mountedKey: 'dayActionMounted',
        phaseKey: 'dayActionPhase'
      }),
      toolsMenu: createSheetLifecycle({
        visibleKey: 'monthMenuVisible',
        mountedKey: 'monthMenuMounted',
        phaseKey: 'monthMenuPhase'
      }),
      info: createSheetLifecycle({
        visibleKey: 'infoSheetVisible',
        mountedKey: 'infoSheetMounted',
        phaseKey: 'infoSheetPhase'
      })
    }
  }
  return page._homepageSheets
}

module.exports = { createSheetLifecycle, homepageSheets }
