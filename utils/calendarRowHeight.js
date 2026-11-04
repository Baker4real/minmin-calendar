// 首页日历几何账本（issue #153）：行高、格内内容最小高度、清爽密度是否合并信息行、记录入口是否在首屏，
// 由同一组输入一次算出。这里的数字都对应 pages/index/index.wxss 里的实际槽位，CSS 仍负责真实尺寸；
// tests/narrow-screen-geometry.test.js 与 tests/calendar-micro-labels.test.js 逐项核对两边一致。
// 换算口径：750rpx = 视口宽。行高上限是改成按可用高度计算之前的固定行高，下限是 44px 触控高度；
// 格内内容放不下时行高停在内容最小高度，不裁切、不缩字，记录入口改由页面自然滚动触达。

const ROW_CAP_RPX = { full: 160, compact: 140 }
const ROW_FLOOR_PX = 44

// 首屏文档流，自上而下：吸顶区占位、可选的欢迎条与行内重试、周头、网格上下内边距、记录入口。
// 吸顶区（月份导航 130 + 状态行 88，不在当月时另加「回到今天」88）本身 position: fixed，滚动时留在顶栏下。
const FIRST_SCREEN_RPX = {
  stickySpacer: 218,
  backToToday: 88,
  // 一次性配对欢迎条：caption 26rpx × 正文行高 1.6 的两行，加上下外边距 8 + 12
  partnerWelcome: 103.2,
  // 行内同步重试行：最小高 88 + 下外边距 8，文案一行
  refreshRetry: 96,
  weekHeader: 50,
  gridPadding: 12,
  quickActions: 114
}
const FIRST_SCREEN_BORDER_PX = 6

// 格内纵向槽位，自上而下：每行是 上外边距 + 盒高。最后一行装标记，「预」胶囊比它高时向下垂出。
// full：日期、农历、节日/调休、标记，顶对齐。compact：日期、节日/调休、标记，居中。
// merged：清爽密度空间不足时把节日/调休和标记并成日期下的一行，顶对齐，日期停在常规清爽格的位置，
// 信息行按「预」胶囊的高度留足，不再垂出。
const CELL_RPX = {
  full: {
    align: 'top',
    paddingTop: 4,
    paddingBottom: 4,
    stack: [
      { gap: 0, height: 32 },
      { gap: 2, height: 34 },
      { gap: 2, height: 38 },
      { gap: 2, height: 30 }
    ]
  },
  compact: {
    align: 'center',
    paddingTop: 10,
    paddingBottom: 12,
    stack: [
      { gap: 0, height: 38 },
      { gap: 2, height: 34 },
      { gap: 6, height: 30 }
    ]
  },
  merged: {
    align: 'top',
    paddingTop: 14,
    paddingBottom: 4,
    stack: [
      { gap: 0, height: 38 },
      { gap: 2, height: 42 }
    ]
  }
}
const PREDICT_MARK_RPX = 42
const TODAY_RING_RPX = 3

function cellContentMinRpx(layout) {
  const cell = CELL_RPX[layout]
  const stack = cell.stack.reduce((sum, slot) => sum + slot.gap + slot.height, 0)
  const overhang = Math.max(0, PREDICT_MARK_RPX - cell.stack[cell.stack.length - 1].height)
  if (cell.align === 'center') {
    // 居中：内容盒装下整列；整列居中后，垂出的「预」底边仍要让开今天的内描边
    return Math.max(
      cell.paddingTop + stack + cell.paddingBottom,
      cell.paddingTop - cell.paddingBottom + stack + 2 * (overhang + TODAY_RING_RPX)
    )
  }
  // 顶对齐：内容盒装下整列，最低处（垂出的「预」）还要让开今天的内描边
  return cell.paddingTop + stack + Math.max(cell.paddingBottom, overhang + TODAY_RING_RPX)
}

// 合并信息行的横向账本：节日/调休胶囊 + 4rpx + ♥ /「预」须放进一列（格子没有水平内边距）。
// 字宽按 1em 上限算，宁可少合并也不裁切。只有节日或只有标记的日子与常规清爽格对应那一行同宽，不挡合并。
const INFO_ROW_RPX = {
  contentPadding: 24,
  gridPadding: 10,
  columnPercent: 14.28,
  tagFont: 24,
  tagPadding: 8,
  heart: 24,
  predictFont: 26,
  predictPadding: 10,
  predictMinWidth: 36,
  marksGap: 4,
  infoGap: 4
}
const INFO_ROW_BORDER_PX = { grid: 1, workday: 1, predict: 1 }

function infoRowFits(day, viewportWidth) {
  if (!day || day.isEmpty) return true
  const pxPerRpx = viewportWidth / 750
  const infoRpx = INFO_ROW_RPX
  const tagChars = day.holidayName ? Array.from(String(day.holidayName)).length : (day.isWorkday ? 1 : 0)
  const tagPx = tagChars
    ? (tagChars * infoRpx.tagFont + 2 * infoRpx.tagPadding) * pxPerRpx + (day.holidayName ? 0 : 2 * INFO_ROW_BORDER_PX.workday)
    : 0
  const heartPx = day.isMemory ? infoRpx.heart * pxPerRpx : 0
  const predictPx = day.isPredict
    ? Math.max(
      infoRpx.predictMinWidth * pxPerRpx,
      (infoRpx.predictFont + 2 * infoRpx.predictPadding) * pxPerRpx + 2 * INFO_ROW_BORDER_PX.predict
    )
    : 0
  const marksPx = heartPx + predictPx + (heartPx && predictPx ? infoRpx.marksGap * pxPerRpx : 0)
  if (!tagPx || !marksPx) return true
  const columnPx = (viewportWidth - 2 * (infoRpx.contentPadding + infoRpx.gridPadding) * pxPerRpx - 2 * INFO_ROW_BORDER_PX.grid) *
    infoRpx.columnPercent / 100
  return tagPx + infoRpx.infoGap * pxPerRpx + marksPx <= columnPx + 1e-6
}

function floor2(value) {
  return Math.floor(value * 100 + 1e-9) / 100
}

function ceil2(value) {
  return Math.ceil(value * 100 - 1e-9) / 100
}

function computeCalendarRowHeight({
  viewportWidth,
  viewportHeight,
  navBarHeightPx = 0,
  density = 'compact',
  days = [],
  showBackToToday = false,
  showPartnerWelcome = false,
  showRefreshRetry = false
} = {}) {
  const width = Number(viewportWidth)
  const pageHeight = Number(viewportHeight)
  const nav = Number(navBarHeightPx) || 0
  const rows = Math.max(1, Math.ceil((Array.isArray(days) ? days.length : 0) / 7))
  const layout = density === 'full' ? 'full' : 'compact'
  if (!(width > 0) || !(pageHeight > 0)) {
    return { heightPx: ROW_FLOOR_PX, contentMinPx: ROW_FLOOR_PX, capPx: ROW_FLOOR_PX, floorPx: ROW_FLOOR_PX, infoMerged: false, actionsFit: false }
  }

  const pxPerRpx = width / 750
  const chromeRpx = FIRST_SCREEN_RPX.stickySpacer + FIRST_SCREEN_RPX.weekHeader +
    FIRST_SCREEN_RPX.gridPadding + FIRST_SCREEN_RPX.quickActions +
    (showBackToToday ? FIRST_SCREEN_RPX.backToToday : 0) +
    (showPartnerWelcome ? FIRST_SCREEN_RPX.partnerWelcome : 0) +
    (showRefreshRetry ? FIRST_SCREEN_RPX.refreshRetry : 0)
  const chromePx = chromeRpx * pxPerRpx + FIRST_SCREEN_BORDER_PX
  const rawPx = (pageHeight - nav - chromePx) / rows
  const capPx = floor2(ROW_CAP_RPX[layout] * pxPerRpx)
  const minPxOf = cellLayout => ceil2(Math.max(ROW_FLOOR_PX, cellContentMinRpx(cellLayout) * pxPerRpx))
  // 清爽密度先用常规三行；每行放不下常规格、且这个月每一天都能并成一行时，合并信息行
  const infoMerged = layout === 'compact' && rawPx < minPxOf('compact') &&
    (Array.isArray(days) ? days : []).every(day => infoRowFits(day, width))
  const contentMinPx = minPxOf(infoMerged ? 'merged' : layout)
  const heightPx = floor2(Math.min(capPx, Math.max(contentMinPx, rawPx)))
  return {
    heightPx,
    contentMinPx,
    capPx,
    floorPx: ROW_FLOOR_PX,
    infoMerged,
    actionsFit: nav + chromePx + heightPx * rows <= pageHeight + 0.05
  }
}

module.exports = {
  computeCalendarRowHeight,
  calendarCellContentMinRpx: cellContentMinRpx,
  CALENDAR_ROW_CAP_RPX: ROW_CAP_RPX,
  CALENDAR_ROW_FLOOR_PX: ROW_FLOOR_PX,
  // 同一份账本，供样式测试逐项核对 CSS
  CALENDAR_LEDGER: {
    firstScreenRpx: FIRST_SCREEN_RPX,
    firstScreenBorderPx: FIRST_SCREEN_BORDER_PX,
    cellRpx: CELL_RPX,
    predictMarkRpx: PREDICT_MARK_RPX,
    todayRingRpx: TODAY_RING_RPX,
    infoRowRpx: INFO_ROW_RPX,
    infoRowBorderPx: INFO_ROW_BORDER_PX
  }
}
