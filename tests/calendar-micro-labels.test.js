const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const WXSS_PATH = path.join(__dirname, '..', 'pages/index/index.wxss')
const APP_WXSS_PATH = path.join(__dirname, '..', 'app.wxss')
const PERIOD_WXSS_PATH = path.join(__dirname, '..', 'pages/period/period.wxss')
const MEMORY_WXSS_PATH = path.join(__dirname, '..', 'pages/memory/memory.wxss')
const MIN_CAPTION_RPX = 24
const DESIGN_CAPTION_RPX = 26
const CAPTION_LINE_HEIGHT_RATIO = 1.4
const MIN_FULL_CELL_SLACK_RPX = 8
const MIN_TOUCH_TARGET_RPX = 88
const MICRO_LABEL_SELECTORS = ['.day-tag', '.predict-mark']
const IN_CELL_MICRO_SELECTORS = ['.day-lunar', '.day-tag', '.predict-mark', '.memory-mark']
const OUT_CELL_CAPTION_SELECTORS = [
  '.sync-text',
  '.week-cell',
  '.meaning-tool-text',
  '.density-option',
  '.stat-label',
  '.predict-weekday',
  '.reminder-text',
  '.reminder-action',
  '.sheet-subtitle',
  '.sheet-action-desc',
  '.jump-section-title',
  '.jump-today-date',
  '.detail-meaning-title',
  '.detail-meaning-text',
  '.detail-title',
  '.detail-meta',
  '.detail-empty-desc',
  '.legend-text',
  '.explain-line',
  '.recap-summary',
  '.recap-highlight'
]
const SECONDARY_TEXT_ALPHA = 0.6

function readWxss() {
  return fs.readFileSync(WXSS_PATH, 'utf8')
}

function ruleBody(wxss, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = wxss.match(new RegExp(`(?:^|[\\n}])\\s*${escaped}\\s*\\{([^}]+)\\}`))
  assert.ok(match, `expected rule for ${selector}`)
  return match[1]
}

function declarationRpx(body, property) {
  const match = body.match(new RegExp(`${property}:\\s*(\\d+(?:\\.\\d+)?)rpx`))
  assert.ok(match, `expected ${property} in rpx`)
  return Number(match[1])
}

function optionalRpx(body, property) {
  const match = body.match(new RegExp(`${property}:\\s*(\\d+(?:\\.\\d+)?)rpx`))
  return match ? Number(match[1]) : 0
}

function contentHeightRpx(cellBody) {
  const pad = paddingVertical(cellBody)
  return declarationRpx(cellBody, 'height') - pad.top - pad.bottom
}

function stackedBlockRpx(body) {
  return declarationRpx(body, 'height') + optionalRpx(body, 'margin-top')
}

function paddingVertical(body) {
  const longhandTop = body.match(/padding-top:\s*(\d+)rpx/)
  const longhandBottom = body.match(/padding-bottom:\s*(\d+)rpx/)
  if (longhandTop || longhandBottom) {
    return {
      top: longhandTop ? Number(longhandTop[1]) : 0,
      bottom: longhandBottom ? Number(longhandBottom[1]) : 0
    }
  }

  const shorthand = body.match(/padding:\s*([^\n;]+)/)
  assert.ok(shorthand, 'expected padding')
  const parts = shorthand[1].trim().split(/\s+/).map((token) => {
    const match = token.match(/^(\d+)rpx$/)
    return match ? Number(match[1]) : 0
  })
  if (parts.length === 1) return { top: parts[0], bottom: parts[0] }
  if (parts.length === 2) return { top: parts[0], bottom: parts[0] }
  return { top: parts[0], bottom: parts[2] }
}

test('calendar holiday tags and predict micro labels stay at least caption size', () => {
  const wxss = readWxss()
  for (const selector of MICRO_LABEL_SELECTORS) {
    const size = declarationRpx(ruleBody(wxss, selector), 'font-size')
    assert.ok(
      size >= MIN_CAPTION_RPX,
      `${selector} font-size ${size}rpx is below caption floor ${MIN_CAPTION_RPX}rpx`
    )
    assert.ok(
      size >= DESIGN_CAPTION_RPX,
      `${selector} font-size ${size}rpx is below DESIGN caption ${DESIGN_CAPTION_RPX}rpx`
    )
  }
})

test('holiday tag box is taller than caption type so CJK glyphs are not clipped', () => {
  const wxss = readWxss()
  const tag = ruleBody(wxss, '.day-tag')
  const tagLine = ruleBody(wxss, '.day-tag-line')
  const fontSize = declarationRpx(tag, 'font-size')
  const tagHeight = declarationRpx(tag, 'height')
  const tagLineHeight = declarationRpx(tagLine, 'height')
  const minBox = fontSize * CAPTION_LINE_HEIGHT_RATIO

  assert.ok(
    tagHeight > fontSize,
    `.day-tag height ${tagHeight}rpx must be greater than font-size ${fontSize}rpx`
  )
  assert.ok(
    tagHeight >= minBox,
    `.day-tag height ${tagHeight}rpx does not cover caption line-height ${fontSize} × ${CAPTION_LINE_HEIGHT_RATIO}`
  )
  assert.ok(
    tagLineHeight >= tagHeight,
    `.day-tag-line height ${tagLineHeight}rpx cannot contain .day-tag ${tagHeight}rpx`
  )
})

test('compact calendar cells still fit the date and caption-sized marks', () => {
  const wxss = readWxss()
  const cell = ruleBody(wxss, '.calendar-density-compact .day-cell')
  const dayNum = ruleBody(wxss, '.calendar-density-compact .day-num')
  const marks = ruleBody(wxss, '.calendar-density-compact .day-marks')
  const content = contentHeightRpx(cell)
  const occupied =
    declarationRpx(dayNum, 'line-height') +
    stackedBlockRpx(marks)
  assert.ok(
    occupied <= content,
    `compact cell content ${content}rpx cannot fit date+marks ${occupied}rpx`
  )
})

test('full calendar cells keep date, lunar, holiday tag, and marks with real vertical slack', () => {
  const wxss = readWxss()
  const cell = ruleBody(wxss, '.day-cell')
  const dayNum = ruleBody(wxss, '.day-num')
  const lunar = ruleBody(wxss, '.day-lunar')
  const tagLine = ruleBody(wxss, '.day-tag-line')
  const marks = ruleBody(wxss, '.day-marks')
  const content = contentHeightRpx(cell)
  const occupied =
    declarationRpx(dayNum, 'line-height') +
    stackedBlockRpx(lunar) +
    stackedBlockRpx(tagLine) +
    stackedBlockRpx(marks)
  const slack = content - occupied

  assert.ok(
    occupied < content,
    `full cell content ${content}rpx cannot fit date+lunar+tag+marks ${occupied}rpx`
  )
  assert.ok(
    slack >= MIN_FULL_CELL_SLACK_RPX,
    `full cell slack ${slack}rpx is below the ${MIN_FULL_CELL_SLACK_RPX}rpx floor`
  )
})

test('in-cell informational micro text stays at or above the 24rpx floor', () => {
  const wxss = readWxss()
  for (const selector of IN_CELL_MICRO_SELECTORS) {
    const size = declarationRpx(ruleBody(wxss, selector), 'font-size')
    assert.ok(
      size >= MIN_CAPTION_RPX,
      `${selector} font-size ${size}rpx is below the in-cell micro floor ${MIN_CAPTION_RPX}rpx`
    )
  }
})

test('captions outside calendar cells stay at or above the 26rpx floor', () => {
  const wxss = readWxss()
  for (const selector of OUT_CELL_CAPTION_SELECTORS) {
    const size = declarationRpx(ruleBody(wxss, selector), 'font-size')
    assert.ok(
      size >= DESIGN_CAPTION_RPX,
      `${selector} font-size ${size}rpx is below the caption floor ${DESIGN_CAPTION_RPX}rpx`
    )
  }
})

test('tappable arrows reach the body-secondary contrast level', () => {
  const wxss = readWxss()
  for (const selector of ['.record-entry-arrow', '.sheet-action-arrow']) {
    const color = ruleBody(wxss, selector).match(/color:\s*rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/)
    assert.ok(color, `expected a white rgba color on ${selector}`)
    assert.ok(
      Number(color[1]) >= SECONDARY_TEXT_ALPHA,
      `${selector} alpha ${color[1]} is below the secondary-text level ${SECONDARY_TEXT_ALPHA}`
    )
  }

  // 列表页箭头与正文次级信息共用 --text-secondary
  for (const [file, selector] of [
    [PERIOD_WXSS_PATH, '.item-arrow'],
    [MEMORY_WXSS_PATH, '.memory-arrow']
  ]) {
    const body = ruleBody(fs.readFileSync(file, 'utf8'), selector)
    assert.match(body, /color:\s*var\(--text-secondary\)/, `${selector} should use --text-secondary`)
  }
})

test('only the month title keeps the rose glow on the home screen', () => {
  const app = fs.readFileSync(APP_WXSS_PATH, 'utf8')
  const navTitle = ruleBody(app, '.nav-title')
  assert.doesNotMatch(navTitle, /text-shadow/, 'nav title should not carry the rose glow')

  const monthTitle = ruleBody(readWxss(), '.month-title')
  assert.match(monthTitle, /text-shadow:\s*0 0 14rpx rgba\(232,144,158,0\.28\)/)
})

test('earlier/later month navigation buttons keep 44px touch targets', () => {
  const body = ruleBody(readWxss(), '.nav-btn')
  const width = declarationRpx(body, 'width')
  const height = declarationRpx(body, 'height')
  assert.ok(width >= MIN_TOUCH_TARGET_RPX, `.nav-btn width ${width}rpx is below 44px (${MIN_TOUCH_TARGET_RPX}rpx)`)
  assert.ok(height >= MIN_TOUCH_TARGET_RPX, `.nav-btn height ${height}rpx is below 44px (${MIN_TOUCH_TARGET_RPX}rpx)`)
})

test('full density first-screen stack stays within the ratcheted budget', () => {
  const wxss = readWxss()
  // 与 tests/index-page.test.js 同一推算口径：750rpx 宽 × 667px 高 ≈ 1334rpx。
  // issue #37 的 1334rpx 目标对完整密度 6 行在当前结构下数学不可达：
  // 农历行与节日标签行是被 calendar-display 测试钉死的两层堆叠，加上 88rpx 触控行高，
  // 六行格子至少 6×(32+30+40+32+8+16)=948rpx，再叠加导航/工具栏/密度/周头/记录按钮后超出 1334rpx。
  // 这里钉住当前达到的值作为棘轮，只允许变小不允许回退。
  const FULL_STACK_RATCHET_RPX = 1614
  const SAFE_TOP_RPX = 88
  const NAV_BAR_RPX = 88
  const MONTH_NAV_CONTENT_RPX = 88
  const WEEK_TEXT_RPX = 34
  const QUICK_CONTENT_RPX = 40
  const SIX_ROWS = 6

  const monthNavBody = ruleBody(wxss, '.month-nav')
  const monthNav = MONTH_NAV_CONTENT_RPX +
    verticalBox(monthNavBody, 'padding') +
    verticalBox(monthNavBody, 'margin')
  const toolbar = declarationRpx(ruleBody(wxss, '.meaning-tool'), 'min-height') +
    verticalBox(ruleBody(wxss, '.meaning-toolbar'), 'margin')
  const densityBody = ruleBody(wxss, '.density-control')
  const density = verticalBox(densityBody, 'padding') +
    declarationRpx(ruleBody(wxss, '.density-option'), 'min-height') +
    verticalBox(densityBody, 'margin')
  const weekHeader = verticalBox(ruleBody(wxss, '.week-header'), 'padding') + WEEK_TEXT_RPX
  const gridPadding = verticalBox(ruleBody(wxss, '.calendar-grid'), 'padding')
  const fullCell = declarationRpx(ruleBody(wxss, '.day-cell'), 'height')
  const quickActions = declarationRpx(ruleBody(wxss, '.quick-actions'), 'margin-top') +
    verticalBox(ruleBody(wxss, '.quick-btn'), 'padding') +
    QUICK_CONTENT_RPX

  const stack = SAFE_TOP_RPX + NAV_BAR_RPX + monthNav + toolbar + density +
    weekHeader + gridPadding + SIX_ROWS * fullCell + quickActions

  assert.ok(
    stack <= FULL_STACK_RATCHET_RPX,
    `full density first-screen stack ${stack}rpx regressed beyond the ${FULL_STACK_RATCHET_RPX}rpx ratchet`
  )
})

function verticalBox(body, property) {
  const match = body.match(new RegExp(`(?:^|[\\n;])\\s*${property}:\\s*([^;]+);`))
  if (!match) return 0
  const parts = match[1].trim().split(/\s+/).map(token => {
    const value = token.match(/^(\d+(?:\.\d+)?)rpx$/)
    return value ? Number(value[1]) : 0
  })
  if (parts.length <= 2) return parts[0] * 2
  return parts[0] + parts[2]
}
