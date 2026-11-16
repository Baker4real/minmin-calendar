// 每页一个应用内确认面板；进出、遮挡与 tabBar 由 sheetLifecycle 统一驱动。
// open 返回 Promise：业务动作给出它的 id，所有取消路径都返回 null。
const { createSheetLifecycle, sheetPageDecorator, dismissSheetOnSystemBack } = require('./sheetLifecycle')

const decorate = sheetPageDecorator({
  phaseKeys: ['confirmationPhase'],
  mountedKeys: ['confirmationMounted']
})

function confirmationSheetData() {
  return {
    confirmationVisible: false,
    confirmationMounted: false,
    confirmationPhase: 'closed',
    confirmationName: '',
    confirmationTitle: '',
    confirmationDateText: '',
    confirmationContent: '',
    confirmationActions: [],
    confirmationDragClear: { token: 0, action: '' },
    pageObscured: false,
    sheetExitGuard: false
  }
}

function confirmationSheet(page) {
  if (page._confirmationSheet) return page._confirmationSheet

  const lifecycle = createSheetLifecycle({
    visibleKey: 'confirmationVisible',
    mountedKey: 'confirmationMounted',
    phaseKey: 'confirmationPhase',
    decorate
  })
  let pending = null

  function settle(value) {
    const resolve = pending
    pending = null
    if (resolve) resolve(value)
  }

  function clearContent() {
    page.setData({
      confirmationName: '',
      confirmationTitle: '',
      confirmationDateText: '',
      confirmationContent: '',
      confirmationActions: []
    })
  }

  function finish(value, extra = {}) {
    if (!lifecycle.isMounted(page)) {
      settle(value)
      return
    }
    lifecycle.leave(page, () => {
      clearContent()
      settle(value)
    }, extra)
  }

  page._confirmationSheet = {
    open({ name, title, dateText = '', content, actions }) {
      // 离场途中打开另一项确认时，旧询问按取消结束，不留下悬挂的调用。
      settle(null)
      return new Promise(resolve => {
        pending = resolve
        lifecycle.open(page, {
          confirmationName: name,
          confirmationTitle: title,
          confirmationDateText: dateText,
          confirmationContent: content,
          confirmationActions: actions
        })
      })
    },
    action(id) {
      finish(id === 'cancel' ? null : id)
    },
    cancel() {
      finish(null)
    },
    dragRelease(detail) {
      if (!detail || detail.sheet !== 'confirmation' || page.data.confirmationPhase !== 'open') return
      const action = decideDragRelease(detail.displacement, detail.elapsed, detail.panelHeight)
      const extra = {
        confirmationDragClear: { token: page.data.confirmationDragClear.token + 1, action }
      }
      if (action === 'close') finish(null, extra)
      else page.setData(extra)
    },
    systemBack() {
      dismissSheetOnSystemBack(page, {
        dismissTop: () => {
          if (page.data.confirmationPhase !== 'leaving') finish(null)
        },
        isMounted: () => lifecycle.isMounted(page)
      })
    },
    unload() {
      lifecycle.dismissPatch()
      settle(null)
    }
  }
  return page._confirmationSheet
}

function decideDragRelease(displacement, elapsed, panelHeight) {
  if (!(displacement > 0)) return 'reset'
  const pastDistance = panelHeight > 0 && displacement > panelHeight * 0.25
  const pastSpeed = elapsed > 0 && displacement / elapsed > 0.11
  return pastDistance || pastSpeed ? 'close' : 'reset'
}

module.exports = { confirmationSheetData, confirmationSheet }
