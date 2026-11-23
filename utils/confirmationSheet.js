// 每页一个应用内确认面板；进出、遮挡与 tabBar 由 sheetLifecycle 统一驱动。
// open 返回 Promise：业务动作给出它的 id，所有取消路径都返回 null。
const { createSheetLifecycle, sheetPageDecorator, decideSheetDragRelease, dismissSheetOnSystemBack } = require('./sheetLifecycle')

const decorate = sheetPageDecorator({
  phaseKeys: ['confirmationPhase', 'datePickerPhase'],
  mountedKeys: ['confirmationMounted', 'datePickerMounted']
})

// #209 的小注册表同时承接非首页的确认与使用说明：拖动、触摸取消和系统返回都走同一个 close。
function registeredSheetInteractions(page, { name, phaseKey, dragClearKey, close, isMounted }) {
  const dragClearPatch = (detailPage, action) => ({
    [dragClearKey]: { token: detailPage.data[dragClearKey].token + 1, action, sheet: name }
  })
  return {
    dragRelease(detailPage, detail) {
      if (!detail || detail.sheet !== name || detailPage.data[phaseKey] !== 'open') return
      const action = decideSheetDragRelease(detail.displacement, detail.elapsed, detail.panelHeight)
      const extra = dragClearPatch(detailPage, action)
      if (action === 'close') close(detailPage, extra)
      else detailPage.setData(extra)
    },
    dragCancel(detailPage, detail) {
      if (!detail || detail.sheet !== name || detailPage.data[phaseKey] !== 'open') return
      detailPage.setData(dragClearPatch(detailPage, 'reset'))
    },
    systemBack(detailPage) {
      dismissSheetOnSystemBack(detailPage, {
        dismissTop: () => {
          if (detailPage.data[phaseKey] !== 'leaving') close(detailPage, {})
        },
        isMounted: () => isMounted(detailPage)
      })
    }
  }
}

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
    confirmationDragClear: { token: 0, action: '', sheet: 'confirmation' },
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

  const interactions = registeredSheetInteractions(page, {
    name: 'confirmation',
    phaseKey: 'confirmationPhase',
    dragClearKey: 'confirmationDragClear',
    close: (detailPage, extra) => finish(null, extra),
    isMounted: detailPage => lifecycle.isMounted(detailPage)
  })

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
      interactions.dragRelease(page, detail)
    },
    dragCancel(detail) {
      interactions.dragCancel(page, detail)
    },
    systemBack() {
      interactions.systemBack(page)
    },
    unload() {
      lifecycle.dismissPatch()
      settle(null)
    }
  }
  return page._confirmationSheet
}

// 设置「使用说明」没有 Promise 结果，但复用同一个非首页小注册表与生命周期。
function settingsHelpSheet(page) {
  if (!page._settingsHelpSheet) {
    const lifecycle = createSheetLifecycle({
      visibleKey: 'helpOpen',
      mountedKey: 'helpMounted',
      phaseKey: 'helpPhase',
      decorate: sheetPageDecorator({
        phaseKeys: ['helpPhase'],
        mountedKeys: ['helpMounted']
      })
    })
    const interactions = registeredSheetInteractions(page, {
      name: 'help',
      phaseKey: 'helpPhase',
      dragClearKey: 'helpDragClear',
      close: (detailPage, extra) => lifecycle.leave(detailPage, undefined, extra),
      isMounted: detailPage => lifecycle.isMounted(detailPage)
    })
    page._settingsHelpSheet = {
      open: lifecycle.open,
      leave: lifecycle.leave,
      isMounted: lifecycle.isMounted,
      dragRelease: interactions.dragRelease,
      dragCancel: interactions.dragCancel,
      systemBack: interactions.systemBack
    }
  }
  return page._settingsHelpSheet
}

module.exports = { confirmationSheetData, confirmationSheet, settingsHelpSheet, registeredSheetInteractions }
