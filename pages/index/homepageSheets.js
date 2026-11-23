const {
  createSheetLifecycle,
  sheetPageDecorator,
  decideSheetDragRelease,
  dismissSheetOnSystemBack
} = require('../../utils/sheetLifecycle')

function leaveSheet(page, lifecycle, extra) {
  lifecycle.leave(page, undefined, extra)
}

// 行顺序就是系统返回优先级。拖拽使用同一个 name，关闭按钮、拖拽与系统返回共用 close。
// 生命周期键只有固定后缀：<name>Visible / <name>Mounted / <name>Phase。
const registry = [
  {
    name: 'infoSheet',
    close(page, lifecycle, extra) {
      lifecycle.leave(page, () => {
        page.setData({ infoSheetMode: '', infoSheetName: '' })
      }, { ...page._predictionEmphasisPatch(), ...extra })
    }
  },
  { name: 'monthPicker', close: leaveSheet },
  {
    name: 'dayActions',
    close(page, lifecycle, extra) {
      lifecycle.leave(page, () => {
        page.setData({
          daySheetMode: 'actions',
          dayDetailFade: false,
          selectedDate: '',
          selectedDateLabel: '',
          selectedDateSubtitle: '',
          selectedDateIsFuture: false,
          selectedDayDetail: null
        })
      }, extra)
    }
  }
].map(entry => ({
  ...entry,
  visibleKey: `${entry.name}Visible`,
  mountedKey: `${entry.name}Mounted`,
  phaseKey: `${entry.name}Phase`
}))

const decorate = sheetPageDecorator({
  phaseKeys: registry.map(entry => entry.phaseKey),
  mountedKeys: registry.map(entry => entry.mountedKey)
})

function homepageSheetData() {
  const data = { pageObscured: false, sheetExitGuard: false, sheetDragClear: {} }
  for (const entry of registry) {
    data[entry.visibleKey] = false
    data[entry.mountedKey] = false
    data[entry.phaseKey] = 'closed'
    data.sheetDragClear[entry.name] = { token: 0, action: '', sheet: entry.name }
  }
  return data
}

function homepageSheets(page) {
  if (!page._homepageSheets) {
    const sheets = registry.map(entry => ({
      ...entry,
      lifecycle: createSheetLifecycle({ ...entry, decorate })
    }))
    const find = name => sheets.find(entry => entry.name === name)
    const close = (entry, extra = {}) => entry.close(page, entry.lifecycle, extra)
    const dragClearPatch = (entry, action) => {
      const current = page.data.sheetDragClear
      return {
        sheetDragClear: {
          ...current,
          [entry.name]: { token: current[entry.name].token + 1, action, sheet: entry.name }
        }
      }
    }
    page._homepageSheets = {
      open(name, extra) {
        find(name).lifecycle.open(page, extra)
      },
      close(name) {
        close(find(name))
      },
      dragRelease(detail) {
        const entry = detail && find(detail.sheet)
        if (!entry || page.data[entry.phaseKey] !== 'open') return
        const action = decideSheetDragRelease(detail.displacement, detail.elapsed, detail.panelHeight)
        const extra = dragClearPatch(entry, action)
        if (action === 'close') close(entry, extra)
        else page.setData(extra)
      },
      dragCancel(detail) {
        const entry = detail && find(detail.sheet)
        if (!entry || page.data[entry.phaseKey] !== 'open') return
        page.setData(dragClearPatch(entry, 'reset'))
      },
      systemBack() {
        dismissSheetOnSystemBack(page, {
          dismissTop() {
            const entry = sheets.find(sheet => page.data[sheet.mountedKey] && page.data[sheet.phaseKey] !== 'leaving')
            if (entry) close(entry)
          },
          isMounted: () => sheets.some(entry => entry.lifecycle.isMounted(page))
        })
      }
    }
  }
  return page._homepageSheets
}

module.exports = { homepageSheetData, homepageSheets }
