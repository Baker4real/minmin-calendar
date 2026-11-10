const {
  createSheetLifecycle,
  sheetPageDecorator,
  handoffSheet,
  dismissSheetOnSystemBack
} = require('../../utils/sheetLifecycle')

function leaveSheet(page, lifecycle, extra) {
  lifecycle.leave(page, undefined, extra)
}

// 行顺序就是系统返回优先级。拖拽使用同一个 name，关闭按钮、拖拽与系统返回共用 close。
// 生命周期键只有固定后缀：<name>Visible / <name>Mounted / <name>Phase / <name>Handoff。
const registry = [
  {
    name: 'infoSheet',
    handoff: true,
    close(page, lifecycle, extra) {
      lifecycle.leave(page, () => {
        page.setData({ infoSheetMode: '', infoSheetName: '' })
      }, { ...page._predictionEmphasisPatch(), ...extra })
    }
  },
  { name: 'monthPicker', close: leaveSheet },
  { name: 'toolsMenu', close: leaveSheet },
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
  phaseKey: `${entry.name}Phase`,
  handoffKey: entry.handoff ? `${entry.name}Handoff` : undefined
}))

const decorate = sheetPageDecorator({
  phaseKeys: registry.map(entry => entry.phaseKey),
  mountedKeys: registry.map(entry => entry.mountedKey),
  handoffKeys: registry.filter(entry => entry.handoffKey).map(entry => entry.handoffKey)
})

function homepageSheetData() {
  const data = { pageObscured: false, sheetExitGuard: false, sheetDragClear: {} }
  for (const entry of registry) {
    data[entry.visibleKey] = false
    data[entry.mountedKey] = false
    data[entry.phaseKey] = 'closed'
    if (entry.handoffKey) data[entry.handoffKey] = false
    data.sheetDragClear[entry.name] = { token: 0, action: '' }
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
    page._homepageSheets = {
      open(name, extra) {
        find(name).lifecycle.open(page, extra)
      },
      close(name) {
        close(find(name))
      },
      handoff(from, to, extra) {
        handoffSheet(page, find(from).lifecycle, find(to).lifecycle, extra)
      },
      dragRelease(detail) {
        const entry = detail && find(detail.sheet)
        if (!entry || page.data[entry.phaseKey] !== 'open') return
        const action = decideSheetDragRelease(detail.displacement, detail.elapsed, detail.panelHeight)
        const current = page.data.sheetDragClear
        const extra = {
          sheetDragClear: {
            ...current,
            [entry.name]: { token: current[entry.name].token + 1, action }
          }
        }
        if (action === 'close') close(entry, extra)
        else page.setData(extra)
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

function decideSheetDragRelease(displacement, elapsed, panelHeight) {
  if (!(displacement > 0)) return 'reset'
  const pastDistance = panelHeight > 0 && displacement > panelHeight * 0.25
  const pastSpeed = elapsed > 0 && displacement / elapsed > 0.11
  return pastDistance || pastSpeed ? 'close' : 'reset'
}

module.exports = { homepageSheetData, homepageSheets }
