// 首页日历行高。上限是改成按可用高度计算之前的固定行高；下限是 44px 触控高度。
// 吸顶区（月份导航、不在当月时的「回到今天」、状态行）始终占掉可用高度，不随日历滚走。
// 竖向 rpx 与 pages/index/index.wxss 对齐：月份导航 130、状态行 88、周头 50、
// 网格上下内边距 12、记录入口 114；「回到今天」单独占 88。网格上下边框另计 2px。

const ROW_CAP_RPX = { full: 160, compact: 140 }
const ROW_FLOOR_PX = 44
const GRID_BORDER_PX = 2
const CHROME_RPX = {
  monthNav: 130,
  statusLine: 88,
  weekHeader: 50,
  gridPadding: 12,
  quickActions: 114
}
const BACK_TODAY_RPX = 88

function computeCalendarRowHeight({
  viewportWidth,
  viewportHeight,
  navBarHeightPx = 0,
  density = 'compact',
  rowCount = 6,
  showBackToToday = false
} = {}) {
  const width = Number(viewportWidth)
  const pageHeight = Number(viewportHeight)
  const nav = Number(navBarHeightPx) || 0
  const rows = Math.max(1, Math.round(Number(rowCount) || 1))
  const capRpx = ROW_CAP_RPX[density] || ROW_CAP_RPX.full
  if (!(width > 0) || !(pageHeight > 0)) {
    return { heightPx: ROW_FLOOR_PX, capPx: ROW_FLOOR_PX, floorPx: ROW_FLOOR_PX, actionsFit: false }
  }

  const chromeRpx = CHROME_RPX.monthNav + CHROME_RPX.statusLine + CHROME_RPX.weekHeader +
    CHROME_RPX.gridPadding + CHROME_RPX.quickActions + (showBackToToday ? BACK_TODAY_RPX : 0)
  const chromePx = chromeRpx * width / 750 + GRID_BORDER_PX
  const availablePx = pageHeight - nav - chromePx
  const capPx = capRpx * width / 750
  const rawPx = availablePx / rows
  const clampedPx = Math.min(capPx, Math.max(ROW_FLOOR_PX, rawPx))
  return {
    heightPx: Math.floor((clampedPx + 1e-9) * 100) / 100,
    capPx: Math.floor((capPx + 1e-9) * 100) / 100,
    floorPx: ROW_FLOOR_PX,
    actionsFit: nav + chromePx + clampedPx * rows <= pageHeight + 0.05
  }
}

module.exports = {
  computeCalendarRowHeight,
  CALENDAR_ROW_CAP_RPX: ROW_CAP_RPX,
  CALENDAR_ROW_FLOOR_PX: ROW_FLOOR_PX
}
