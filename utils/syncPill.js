const { createSheetLifecycle } = require('./sheetLifecycle')

const SYNC_STATUS_CLEAR_DELAY = 1600

// One controller per page owns the shared navbar pill lifecycle and its result-hold timer.
// Sync text and autoHide decisions still come from roomRecordsSync.
function createSyncPillController(page) {
  const lifecycle = createSheetLifecycle({
    visibleKey: 'syncStatusVisible',
    mountedKey: 'syncStatusMounted',
    phaseKey: 'syncStatusPhase'
  })
  let clearTimer = null

  function clearSyncStatusTimer() {
    if (clearTimer === null) return
    clearTimeout(clearTimer)
    clearTimer = null
  }

  function hide() {
    clearSyncStatusTimer()
    if (!page.data.syncStatusVisible && !page.data.syncStatusText) return
    if (!page.data.syncStatusMounted) {
      page.setData({ syncStatusVisible: false, syncStatusText: '' })
      return
    }
    // Keep the leaving copy and accessible name mounted until the exit completes.
    lifecycle.leave(page, () => page.setData({ syncStatusText: '' }))
  }

  return {
    show(text, options = {}) {
      clearSyncStatusTimer()
      lifecycle.open(page, { syncStatusText: text })
      if (options.autoHide === false) return
      const timer = setTimeout(() => {
        clearTimer = null
        hide()
      }, SYNC_STATUS_CLEAR_DELAY)
      if (timer && typeof timer.unref === 'function') timer.unref()
      clearTimer = timer
    },

    hide,

    clear() {
      clearSyncStatusTimer()
      page.setData({ ...lifecycle.dismissPatch(), syncStatusText: '' })
    }
  }
}

function syncPill(page) {
  if (!page._syncPillController) page._syncPillController = createSyncPillController(page)
  return page._syncPillController
}

module.exports = { syncPill }
