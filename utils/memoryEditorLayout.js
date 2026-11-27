// Empty-state writing-well geometry. All fixed slots are in rpx; the public result is px.
// 24 content top + 72 card vertical inset + 88 date field + 36 form gap + 138 save bar + 20 breathing gap.
const FIXED_CHROME_RPX = 378
const MIN_NOTE_RPX = 280

function memoryNoteMinHeightPx({ windowWidth, windowHeight, navBarHeight, safeBottom = 0 } = {}) {
  const width = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 375
  const scale = width / 750
  const minimum = MIN_NOTE_RPX * scale
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return round(minimum)
  const nav = Number.isFinite(navBarHeight) && navBarHeight > 0 ? navBarHeight : 0
  const bottom = Number.isFinite(safeBottom) && safeBottom > 0 ? safeBottom : 0
  const available = windowHeight - nav - bottom - FIXED_CHROME_RPX * scale
  return round(Math.max(minimum, available))
}

function round(value) {
  return Math.round(value * 100) / 100
}

module.exports = { memoryNoteMinHeightPx }
