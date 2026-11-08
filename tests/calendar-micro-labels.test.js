const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const WXSS_PATH = path.join(__dirname, '..', 'pages/index/index.wxss')
const APP_WXSS_PATH = path.join(__dirname, '..', 'app.wxss')
const PERIOD_WXSS_PATH = path.join(__dirname, '..', 'pages/period/period.wxss')
const MEMORY_WXSS_PATH = path.join(__dirname, '..', 'pages/memory/memory.wxss')
const APP_TOKENS = Object.fromEntries(
  [...fs.readFileSync(APP_WXSS_PATH, 'utf8').matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)]
    .map((match) => [`--${match[1]}`, match[2].trim()])
)
const MIN_CAPTION_RPX = 24
const DESIGN_CAPTION_RPX = 26
const CAPTION_LINE_HEIGHT_RATIO = 1.4
const MIN_FULL_CELL_SLACK_RPX = 8
const MIN_TOUCH_TARGET_RPX = 88
const MICRO_LABEL_SELECTORS = ['.day-tag', '.predict-mark']
const IN_CELL_MICRO_SELECTORS = [
  '.day-lunar',
  '.day-tag',
  '.predict-mark',
  '.memory-mark',
  '.calendar-density-compact .day-tag'
]
const OUT_CELL_CAPTION_SELECTORS = [
  '.sync-text',
  '.week-cell',
  '.home-status-text',
  '.month-summary-text',
  '.back-today',
  '.nav-tool',
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
  const match = body.match(new RegExp(`${property}:\\s*([^;]+);`))
  assert.ok(match, `expected ${property}`)
  const resolved = match[1].trim()
    .replace(/var\(\s*--[a-z0-9-]+\s*,\s*([^)]+)\)/i, '$1')
    .replace(/var\((--[a-z0-9-]+)\)/i, (_, name) => {
    assert.ok(APP_TOKENS[name], `unknown token ${name}`)
    return APP_TOKENS[name]
  })
  const rpx = /^(\d+(?:\.\d+)?)rpx$/.exec(resolved)
  assert.ok(rpx, `expected ${property} in rpx, got ${resolved}`)
  return Number(rpx[1])
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

const NARROW_VIEWPORT_PX = 320
const ORDINARY_LUNAR_SAMPLES = ['正月初一', '冬月三十']
const LEAP_LUNAR_SAMPLE = '闰四月初一'
const CAPSULE_SAMPLES = [
  ['中秋', '.day-tag', '.holiday-tag'],
  ['班', '.day-tag', '.workday-tag'],
  ['预', '.predict-mark', '.predict-mark']
]

function lengthTokenRpx(token) {
  if (token === '0') return 0
  const match = /^(\d+(?:\.\d+)?)rpx$/.exec(token)
  assert.ok(match, `expected an rpx length, got ${token}`)
  return Number(match[1])
}

function horizontalPaddingRpx(body) {
  const longhandLeft = body.match(/padding-left:\s*(\d+(?:\.\d+)?)rpx/)
  const longhandRight = body.match(/padding-right:\s*(\d+(?:\.\d+)?)rpx/)
  if (longhandLeft || longhandRight) {
    return (longhandLeft ? Number(longhandLeft[1]) : 0) + (longhandRight ? Number(longhandRight[1]) : 0)
  }
  const shorthand = body.match(/padding:\s*([^\n;]+)/)
  if (!shorthand) return 0
  const parts = shorthand[1].trim().split(/\s+/).map(lengthTokenRpx)
  if (parts.length === 1) return parts[0] * 2
  if (parts.length === 2 || parts.length === 3) return parts[1] * 2
  return parts[1] + parts[3]
}

function trackingRpx(body) {
  const match = body.match(/letter-spacing:\s*([^;]+);/)
  if (!match) return 0
  const resolved = match[1].trim().replace(/var\((--[a-z0-9-]+)\)/i, (_, name) => {
    assert.ok(APP_TOKENS[name], `unknown token ${name}`)
    return APP_TOKENS[name]
  })
  return lengthTokenRpx(resolved)
}

function borderBoxRpx(body, viewportPx) {
  const match = body.match(/(?:^|[;\n])\s*border:\s*([^;]+);/)
  if (!match) return 0
  const width = match[1].match(/(\d+(?:\.\d+)?)px/)
  if (!width) return 0
  return Number(width[1]) * 2 * (750 / viewportPx)
}

function contentInsetRpx(body, viewportPx) {
  const sizing = body.match(/box-sizing:\s*([^;]+)/)
  if (sizing && sizing[1].trim() === 'content-box') return 0
  return borderBoxRpx(body, viewportPx)
}

function lineBoxRpx(body, fontRpx) {
  const match = body.match(/line-height:\s*([^;]+);/)
  assert.ok(match, 'expected line-height')
  const raw = match[1].trim()
  if (raw === '1') return fontRpx
  const resolved = raw.replace(/var\((--[a-z0-9-]+)\)/i, (_, name) => {
    assert.ok(APP_TOKENS[name], `unknown token ${name}`)
    return APP_TOKENS[name]
  })
  return lengthTokenRpx(resolved)
}

function cjkRunRpx(text, fontRpx, tracking) {
  // 每个字后都计入字距，覆盖 WebKit 把 letter-spacing 加在末字之后的情况。
  return text.length * fontRpx + text.length * tracking
}

function dayColumnRpx(wxss, viewportPx) {
  const contentPad = horizontalPaddingRpx(ruleBody(wxss, '.content'))
  const gridBorder = ruleBody(wxss, '.calendar-grid').match(/border:\s*([^;]+);/)
  assert.ok(gridBorder, 'expected .calendar-grid border')
  const borderPx = Number(/(\d+(?:\.\d+)?)px/.exec(gridBorder[1])[1])
  const widthPct = Number(/(\d+(?:\.\d+)?)%/.exec(ruleBody(wxss, '.day-cell').match(/width:\s*([^;]+);/)[1])[1])
  const innerRpx = 750 - contentPad - borderPx * 2 * (750 / viewportPx)
  return innerRpx * widthPct / 100
}

// 垂出的「预」到格子下沿的留白（issue #162）：下一行的今天胶囊和经期色带从格子顶上画起，「预」不能贴上去。
// 今天不再画整格内描边，这 3rpx 不对应哪条 CSS，由几何账本给出
function edgeClearanceRpx() {
  return require('../utils/calendarRowHeight').CALENDAR_LEDGER.edgeClearanceRpx
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

test('compact calendar cells still fit the date, holiday tag, and caption-sized marks', () => {
  const wxss = readWxss()
  const cell = ruleBody(wxss, '.calendar-density-compact .day-cell')
  const dayNum = ruleBody(wxss, '.calendar-density-compact .day-num')
  const tagLine = ruleBody(wxss, '.calendar-density-compact .day-tag-line')
  const marks = ruleBody(wxss, '.calendar-density-compact .day-marks')
  const content = contentHeightRpx(cell)
  const occupied =
    declarationRpx(dayNum, 'line-height') +
    stackedBlockRpx(tagLine) +
    stackedBlockRpx(marks)
  assert.ok(
    occupied <= content,
    `compact cell content ${content}rpx cannot fit date+tag+marks ${occupied}rpx`
  )
})

test('long holiday names clip inside their own cell instead of painting across neighbors', () => {
  const wxss = readWxss()
  const cell = ruleBody(wxss, '.day-cell')
  const tagLine = ruleBody(wxss, '.day-tag-line')
  const tag = ruleBody(wxss, '.day-tag')
  const compactTag = ruleBody(wxss, '.calendar-density-compact .day-tag')

  // 完整密度：超长节日名（如「国庆/中秋」）被裁在自己的格子里
  assert.match(cell, /overflow:\s*hidden/)
  // 标签行占满格宽、标签盒不越过格宽，裁切只发生在格子边界
  assert.match(tagLine, /width:\s*100%/)
  assert.match(tag, /max-width:\s*100%/)
  // 溢出裁切保留名字起点：胶囊内部对齐 left——放得下时盒宽=文宽、短名视觉不变，
  // 超长名只在尾部被裁；标签行仍居中排版（justify-content 不动，短名不左移）
  assert.match(tag, /text-align:\s*(?:left|start)\s*;/)
  assert.match(tagLine, /justify-content:\s*center/)
  // 裁切不是省略号：读屏与当日详情仍拿完整节日名（home-calendar-state 测试钉住）
  assert.doesNotMatch(tag, /text-overflow/)
  assert.doesNotMatch(tagLine, /text-overflow/)

  // 清爽密度的标签盒高仍覆盖 24rpx 微字的 caption 行高，CJK 不被裁顶裁底
  const compactFont = declarationRpx(compactTag, 'font-size')
  const compactBox = declarationRpx(compactTag, 'height')
  assert.ok(compactFont >= MIN_CAPTION_RPX, `compact tag font ${compactFont}rpx is below the micro floor`)
  assert.ok(
    compactBox >= compactFont * CAPTION_LINE_HEIGHT_RATIO,
    `compact tag box ${compactBox}rpx does not cover ${compactFont}rpx × ${CAPTION_LINE_HEIGHT_RATIO}`
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

test('full-density lunar shows ordinary month and day names inside a 320px column', () => {
  const wxss = readWxss()
  const lunar = ruleBody(wxss, '.day-lunar')
  const font = declarationRpx(lunar, 'font-size')
  const box = declarationRpx(lunar, 'height')
  const line = declarationRpx(lunar, 'line-height')
  const tracking = trackingRpx(lunar)
  const column = dayColumnRpx(wxss, NARROW_VIEWPORT_PX) -
    horizontalPaddingRpx(ruleBody(wxss, '.day-cell')) -
    horizontalPaddingRpx(lunar)

  assert.equal(lunar.match(/font-weight:\s*([^;]+);/)[1].trim(), 'var(--font-weight-assist)')
  assert.match(lunar, /width:\s*100%/)
  assert.match(lunar, /min-width:\s*0/)
  assert.match(lunar, /white-space:\s*nowrap/)
  assert.match(lunar, /overflow:\s*hidden/)
  assert.doesNotMatch(lunar, /text-overflow\s*:\s*ellipsis/)
  assert.ok(
    box >= font * CAPTION_LINE_HEIGHT_RATIO && line >= font * CAPTION_LINE_HEIGHT_RATIO && line <= box,
    `.day-lunar box ${box}rpx / line ${line}rpx does not cover ${font}rpx × ${CAPTION_LINE_HEIGHT_RATIO}`
  )
  for (const sample of ORDINARY_LUNAR_SAMPLES) {
    const text = cjkRunRpx(sample, font, tracking)
    assert.ok(
      text <= column,
      `${sample} needs ${text}rpx but the 320px column leaves ${column}rpx`
    )
  }
})

test('leap-month lunar stays on one line without ellipsis because a second line eats the row-edge clearance', () => {
  const wxss = readWxss()
  const lunar = ruleBody(wxss, '.day-lunar')
  const cell = ruleBody(wxss, '.day-cell')
  const font = declarationRpx(lunar, 'font-size')
  const line = declarationRpx(lunar, 'line-height')
  const tracking = trackingRpx(lunar)
  const column = dayColumnRpx(wxss, NARROW_VIEWPORT_PX) -
    horizontalPaddingRpx(cell) -
    horizontalPaddingRpx(lunar)
  const twoLineStack =
    declarationRpx(ruleBody(wxss, '.day-num'), 'line-height') +
    (line * 2 + optionalRpx(lunar, 'margin-top')) +
    stackedBlockRpx(ruleBody(wxss, '.day-tag-line')) +
    stackedBlockRpx(ruleBody(wxss, '.day-marks'))
  const twoLineSlack = contentHeightRpx(cell) - twoLineStack
  const predict = ruleBody(wxss, '.predict-mark')
  const overhang = Math.max(0, declarationRpx(predict, 'height') - declarationRpx(ruleBody(wxss, '.day-marks'), 'height'))
  const room = twoLineSlack + paddingVertical(cell).bottom - edgeClearanceRpx()

  assert.ok(font >= MIN_CAPTION_RPX, `lunar font ${font}rpx is below the micro floor`)
  assert.match(lunar, /white-space:\s*nowrap/)
  assert.doesNotMatch(lunar, /text-overflow\s*:\s*ellipsis/)
  assert.equal(declarationRpx(lunar, 'height'), line, 'single-line lunar box matches its line box')
  assert.ok(
    cjkRunRpx(LEAP_LUNAR_SAMPLE, font, tracking) > column,
    `${LEAP_LUNAR_SAMPLE} fits one line, so the single-line fallback is unnecessary`
  )
  assert.ok(
    overhang > room,
    `a second lunar line still leaves the row-edge clearance (overhang ${overhang}rpx, room ${room}rpx)`
  )
})

test('holiday, workday, and predict capsules center their labels with inset at 320px', () => {
  const wxss = readWxss()
  const tag = ruleBody(wxss, '.day-tag')
  const predict = ruleBody(wxss, '.predict-mark')
  const column = dayColumnRpx(wxss, NARROW_VIEWPORT_PX) -
    horizontalPaddingRpx(ruleBody(wxss, '.day-cell'))
  const clearance = edgeClearanceRpx()

  for (const selector of ['.day-tag', '.predict-mark']) {
    const body = selector === '.day-tag' ? tag : predict
    assert.equal(body.match(/font-weight:\s*([^;]+);/)[1].trim(), 'var(--font-weight-assist)', selector)
    assert.equal(trackingRpx(body), 0, `${selector} must keep natural tracking`)
    assert.doesNotMatch(body, /text-overflow\s*:\s*ellipsis/, selector)
    assert.doesNotMatch(body, /overflow\s*:\s*hidden/, selector)
    assert.ok(horizontalPaddingRpx(body) >= 16, `${selector} side inset is flush`)
  }

  const tagFont = declarationRpx(tag, 'font-size')
  const tagHeight = declarationRpx(tag, 'height')
  const tagLine = lineBoxRpx(tag, tagFont)
  const workdayInset = contentInsetRpx(ruleBody(wxss, '.workday-tag'), NARROW_VIEWPORT_PX)
  assert.equal(tagLine, tagHeight, '.day-tag line box should fill the capsule and center the label')
  assert.ok(
    tagHeight - workdayInset >= tagFont * CAPTION_LINE_HEIGHT_RATIO,
    `workday edge leaves ${tagHeight - workdayInset}rpx, under the caption line box at 320px`
  )

  const predictFont = declarationRpx(predict, 'font-size')
  const predictHeight = declarationRpx(predict, 'height')
  const predictBorder = borderBoxRpx(predict, NARROW_VIEWPORT_PX)
  const predictLine = lineBoxRpx(predict, predictFont)
  assert.match(predict, /display:\s*flex/)
  assert.match(predict, /align-items:\s*center/)
  assert.match(predict, /justify-content:\s*center/)
  assert.match(predict, /align-self:\s*flex-start/)
  assert.ok(
    predictHeight - predictBorder >= predictFont * CAPTION_LINE_HEIGHT_RATIO &&
      predictLine <= predictHeight - predictBorder,
    `predict capsule content cannot hold a ${predictFont}rpx label at 320px`
  )

  for (const [sample, typeSelector, edgeSelector] of CAPSULE_SAMPLES) {
    const type = ruleBody(wxss, typeSelector)
    const edge = ruleBody(wxss, edgeSelector)
    const width = cjkRunRpx(sample, declarationRpx(type, 'font-size'), trackingRpx(type)) +
      horizontalPaddingRpx(type) +
      borderBoxRpx(edge, NARROW_VIEWPORT_PX)
    assert.ok(width <= column, `${sample} capsule needs ${width}rpx in a ${column}rpx column`)
  }

  const overhang = Math.max(0, predictHeight - declarationRpx(ruleBody(wxss, '.day-marks'), 'height'))
  const fullCell = ruleBody(wxss, '.day-cell')
  const fullSlack = contentHeightRpx(fullCell) - (
    declarationRpx(ruleBody(wxss, '.day-num'), 'line-height') +
    stackedBlockRpx(ruleBody(wxss, '.day-lunar')) +
    stackedBlockRpx(ruleBody(wxss, '.day-tag-line')) +
    stackedBlockRpx(ruleBody(wxss, '.day-marks'))
  )
  const fullBelow = fullSlack + paddingVertical(fullCell).bottom
  assert.ok(
    overhang <= fullBelow - clearance,
    `predict capsule overhang ${overhang}rpx eats the row-edge clearance (room ${fullBelow - clearance}rpx)`
  )

  const compactCell = ruleBody(wxss, '.calendar-density-compact .day-cell')
  const compactSlack = contentHeightRpx(compactCell) - (
    declarationRpx(ruleBody(wxss, '.calendar-density-compact .day-num'), 'line-height') +
    stackedBlockRpx(ruleBody(wxss, '.calendar-density-compact .day-tag-line')) +
    stackedBlockRpx(ruleBody(wxss, '.calendar-density-compact .day-marks'))
  )
  const compactBelow = compactSlack / 2 + paddingVertical(compactCell).bottom
  assert.ok(
    overhang <= compactBelow - clearance,
    `predict capsule overhang ${overhang}rpx eats the compact row-edge clearance (room ${compactBelow - clearance}rpx)`
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
  for (const selector of ['.sheet-action-arrow']) {
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

test('the month title stays rose and tappable without the month-nav glow', () => {
  const app = fs.readFileSync(APP_WXSS_PATH, 'utf8')
  const navTitle = ruleBody(app, '.nav-title')
  assert.doesNotMatch(navTitle, /text-shadow/, 'nav title should not carry the rose glow')

  const monthTitle = ruleBody(readWxss(), '.month-title')
  assert.match(monthTitle, /color:\s*#E8909E/i)
  assert.doesNotMatch(monthTitle, /text-shadow/)

  const trigger = ruleBody(readWxss(), '.month-title-trigger')
  assert.match(trigger, /min-height:\s*88rpx/)
})

test('earlier/later month navigation buttons keep 44px touch targets', () => {
  const body = ruleBody(readWxss(), '.nav-btn')
  const width = declarationRpx(body, 'width')
  const height = declarationRpx(body, 'height')
  assert.ok(width >= MIN_TOUCH_TARGET_RPX, `.nav-btn width ${width}rpx is below 44px (${MIN_TOUCH_TARGET_RPX}rpx)`)
  assert.ok(height >= MIN_TOUCH_TARGET_RPX, `.nav-btn height ${height}rpx is below 44px (${MIN_TOUCH_TARGET_RPX}rpx)`)
})

// issue #153：格内槽位账本就是 CSS 的那一列数字。几何模块按它算出每种排版的内容最小高度，行高从不低于它；
// 这里在最小高度上用 CSS 的真实槽位复核：整列放进内容盒，向下垂出的「预」离格子下沿留足留白，再矮 1rpx 就不行。
const CELL_LAYOUT_SELECTORS = {
  full: {
    cell: '.day-cell',
    slots: ['.day-num', '.day-lunar', '.day-tag-line', '.day-marks']
  },
  compact: {
    cell: '.calendar-density-compact .day-cell',
    slots: [
      '.calendar-density-compact .day-num',
      '.calendar-density-compact .day-tag-line',
      '.calendar-density-compact .day-marks'
    ]
  },
  merged: {
    cell: '.calendar-info-merged .day-cell',
    slots: ['.calendar-density-compact .day-num', '.calendar-info-merged .day-info']
  }
}

function cssCellLayout(wxss, layout) {
  const selectors = CELL_LAYOUT_SELECTORS[layout]
  const cell = ruleBody(wxss, selectors.cell)
  const pad = paddingVertical(cell)
  const justify = cell.match(/justify-content:\s*([^;]+);/)[1].trim()
  return {
    align: justify === 'center' ? 'center' : 'top',
    paddingTop: pad.top,
    paddingBottom: pad.bottom,
    stack: selectors.slots.map((selector, index) => {
      const body = ruleBody(wxss, selector)
      return index === 0
        ? { gap: 0, height: declarationRpx(body, 'line-height') }
        : { gap: optionalRpx(body, 'margin-top'), height: declarationRpx(body, 'height') }
    })
  }
}

// 行高 height 下，CSS 这一列是否既不溢出内容盒、垂出的「预」也离格子下沿留足留白
function cellHoldsContent(layout, height, wxss) {
  const cell = cssCellLayout(wxss, layout)
  const stack = cell.stack.reduce((sum, slot) => sum + slot.gap + slot.height, 0)
  const marks = cell.stack[cell.stack.length - 1].height
  const overhang = Math.max(0, declarationRpx(ruleBody(wxss, '.predict-mark'), 'height') - marks)
  const slack = height - cell.paddingTop - cell.paddingBottom - stack
  const below = (cell.align === 'center' ? slack / 2 : slack) + cell.paddingBottom
  return slack >= 0 && overhang <= below - edgeClearanceRpx()
}

test('the cell slot ledger is the CSS stack and each layout holds its content exactly at the ledger minimum', () => {
  const { CALENDAR_LEDGER, calendarCellContentMinRpx } = require('../utils/calendarRowHeight')
  const wxss = readWxss()
  // 完整：4 + 日期 32 + 农历 36 + 节日 40 + 标记 32，「预」垂出 12 再留格底 3 → 159
  // 清爽：居中的 日期 38 + 节日 36 + 标记 36 = 110，内边距 10 / 12；居中后「预」垂出 12 + 格底 3 → 138
  // 合并：顶对齐 14 + 日期 38 + 信息行 2+42 + 4 → 100（信息行按「预」胶囊高留足，不垂出）
  // issue #162：今天改成日期胶囊后，这 3rpx 从「让开整格内描边」改记为格底留白，数值不变，行高与合并判定都不变
  const expectedMin = { full: 159, compact: 138, merged: 100 }
  for (const layout of Object.keys(CELL_LAYOUT_SELECTORS)) {
    assert.deepEqual(CALENDAR_LEDGER.cellRpx[layout], cssCellLayout(wxss, layout), `${layout} ledger must equal the CSS slots`)
    const min = calendarCellContentMinRpx(layout)
    assert.equal(min, expectedMin[layout], `${layout} content minimum`)
    assert.ok(cellHoldsContent(layout, min, wxss), `${layout} content must fit at its ${min}rpx minimum`)
    assert.ok(!cellHoldsContent(layout, min - 1, wxss), `${layout} minimum ${min}rpx must be tight`)
    const cap = layout === 'full' ? 160 : 140
    assert.ok(min <= cap, `${layout} minimum ${min}rpx must stay under the ${cap}rpx cap`)
  }
  assert.equal(CALENDAR_LEDGER.predictMarkRpx, declarationRpx(ruleBody(wxss, '.predict-mark'), 'height'))
  assert.equal(CALENDAR_LEDGER.edgeClearanceRpx, 3, 'the row-edge clearance keeps the pre-capsule 3rpx so row heights do not move')
  assert.equal('todayRingRpx' in CALENDAR_LEDGER, false, 'today no longer draws a full-cell ring, so the ledger has no ring width')
})

function borderWidthPx(body) {
  const match = body.match(/(?:^|[;\n])\s*border:\s*(\d+(?:\.\d+)?)px\b/)
  assert.ok(match, 'expected a px border shorthand')
  return Number(match[1])
}

// issue #153：合并信息行能否放下「节日/调休 + ♥ /「预」」由几何模块按横向账本判断；账本里的每个宽度都来自 CSS
test('the merged info row ledger uses the CSS widths and its single row holds the tallest item', () => {
  const { CALENDAR_LEDGER } = require('../utils/calendarRowHeight')
  const wxss = readWxss()
  const widths = CALENDAR_LEDGER.infoRowRpx
  const borders = CALENDAR_LEDGER.infoRowBorderPx
  const grid = ruleBody(wxss, '.calendar-grid')
  const compactTag = ruleBody(wxss, '.calendar-density-compact .day-tag')
  const workday = ruleBody(wxss, '.workday-tag')
  const predict = ruleBody(wxss, '.predict-mark')
  const info = ruleBody(wxss, '.calendar-info-merged .day-info')

  assert.deepEqual(widths, {
    contentPadding: horizontalPaddingRpx(ruleBody(wxss, '.content')) / 2,
    gridPadding: horizontalPaddingRpx(grid) / 2,
    columnPercent: Number(/width:\s*(\d+(?:\.\d+)?)%/.exec(ruleBody(wxss, '.day-cell'))[1]),
    tagFont: declarationRpx(compactTag, 'font-size'),
    tagPadding: horizontalPaddingRpx(compactTag) / 2,
    heart: declarationRpx(ruleBody(wxss, '.memory-mark'), 'font-size'),
    predictFont: declarationRpx(predict, 'font-size'),
    predictPadding: horizontalPaddingRpx(predict) / 2,
    predictMinWidth: declarationRpx(predict, 'min-width'),
    marksGap: declarationRpx(ruleBody(wxss, '.day-marks'), 'gap'),
    infoGap: declarationRpx(info, 'gap')
  })
  assert.deepEqual(borders, { grid: borderWidthPx(grid), workday: borderWidthPx(workday), predict: borderWidthPx(predict) })
  // 「班」是 content-box：描边加在盒宽外；♥ 行高 1，字宽按 1em 上限记账
  assert.match(workday, /box-sizing:\s*content-box/)
  assert.match(ruleBody(wxss, '.memory-mark'), /line-height:\s*1;/)

  // 一行横排、居中；节日胶囊可收窄（超长节日名仍只裁尾部），标记不收窄
  assert.match(info, /flex-direction:\s*row/)
  assert.match(info, /justify-content:\s*center/)
  assert.match(ruleBody(wxss, '.calendar-info-merged .day-tag-line'), /min-width:\s*0/)
  assert.match(ruleBody(wxss, '.calendar-info-merged .day-marks'), /flex-shrink:\s*0/)
  // 行高装得下最高的一项：「预」胶囊（含描边），以及 320px 下「班」的 34rpx 盒高加 1px 上下描边
  const rowHeight = declarationRpx(info, 'height')
  const workdayPx = borderWidthPx(workday) * 2 * (750 / NARROW_VIEWPORT_PX)
  assert.ok(rowHeight >= declarationRpx(predict, 'height'), 'merged row is shorter than the predict capsule')
  assert.ok(rowHeight >= declarationRpx(compactTag, 'height') + workdayPx, 'merged row is shorter than the workday tag')
  for (const selector of ['.calendar-info-merged .day-tag-line', '.calendar-info-merged .day-marks']) {
    assert.equal(declarationRpx(ruleBody(wxss, selector), 'height'), rowHeight, `${selector} fills the merged row`)
  }
})

// issue #153：行高在内容最小高度与上限之间变化时，色带仍只包住日期数字（单日、连续段、开放端的形状都挂在色带上，不受影响）
test('the period band still wraps the date number at every row height the ledger can choose', () => {
  const { calendarCellContentMinRpx } = require('../utils/calendarRowHeight')
  const wxss = readWxss()
  const fullBand = ruleBody(wxss, '.period-band')
  const compactBand = ruleBody(wxss, '.calendar-density-compact .period-band')
  const bands = {
    full: { top: Number(/inset:\s*(\d+)/.exec(fullBand)[1]), height: declarationRpx(fullBand, 'height') },
    compact: { top: declarationRpx(compactBand, 'top'), height: declarationRpx(compactBand, 'height') }
  }
  for (const [layout, density, cap] of [['full', 'full', 160], ['compact', 'compact', 140], ['merged', 'compact', 140]]) {
    const cell = cssCellLayout(wxss, layout)
    const stack = cell.stack.reduce((sum, slot) => sum + slot.gap + slot.height, 0)
    for (const height of [calendarCellContentMinRpx(layout), cap]) {
      const dateTop = cell.align === 'center'
        ? cell.paddingTop + (height - cell.paddingTop - cell.paddingBottom - stack) / 2
        : cell.paddingTop
      const band = bands[density]
      assert.ok(
        band.top <= dateTop && dateTop + cell.stack[0].height <= band.top + band.height,
        `${layout} at ${height}rpx puts the date at ${dateTop}rpx outside the ${band.top}–${band.top + band.height}rpx band`
      )
    }
  }
})

// issue #162：今天是围住日期数字的紧凑胶囊，不再给整格铺底、描整格内框；整日点按范围仍是整格。
// 胶囊挂在日期上，农历、节日/调休与标记都留在胶囊外。目标高约 44–52rpx：完整密度的日期贴着格子顶（上内边距 4rpx），
// 胶囊不能高出格子顶（overflow 会把它裁平），农历字框又从 43rpx 起，所以完整密度停在 43rpx。
const TODAY_CAPSULE_SELECTOR = '.day-cell.today:not(.period) .day-num::before'
const COMPACT_TODAY_CAPSULE_SELECTOR = '.calendar-density-compact .day-cell.today:not(.period) .day-num::before'
const TODAY_CAPSULE_HEIGHT_RPX = { min: 41, max: 52 }
// 基础库把每段 rpx 各自换成整数 px：正长度向下取整，负偏移向零取整（开发者工具 3.16.1 在 390px 宽实测）。
// 胶囊各段分开取整、下一槽的位置由好几段累加，两边差得出 1px；留 2rpx，375–430px 宽都碰不到下一槽
const TODAY_CAPSULE_ROUNDING_RPX = 2
const CELL_PAINT_PROPERTIES = ['background', 'background-color', 'background-image', 'box-shadow', 'border', 'outline']

// 选择器最后一段（真正被选中的元素）；:not(...) 里的类是排除条件，不算这个元素带的类
function subjectCompound(selector) {
  const parts = selector.trim().split(/\s*[>+~]\s*|\s+/)
  return parts[parts.length - 1].replace(/:not\([^)]*\)/g, '')
}

function anchoredDeclaration(body, property) {
  const match = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+);`).exec(body)
  return match ? match[1].trim() : undefined
}

function signedRpx(value, label) {
  const resolved = String(value).trim().replace(/var\((--[a-z0-9-]+)\)/i, (_, name) => {
    assert.ok(APP_TOKENS[name], `unknown token ${name}`)
    return APP_TOKENS[name]
  })
  const match = /^(-?\d+(?:\.\d+)?)rpx$/.exec(resolved)
  assert.ok(match, `expected ${label} in rpx, got ${value}`)
  return Number(match[1])
}

// 一个选择器的全部声明，按出现顺序合并：胶囊的几何和今天的光晕共用一组规则，颜色各写一条（issue #165）
function mergedDecls(wxss, selector) {
  const { parseWxssRules } = require('./designTokens')
  const rules = parseWxssRules(wxss).filter(rule => rule.selectors.includes(selector))
  assert.ok(rules.length > 0, `expected rule for ${selector}`)
  return Object.assign({}, ...rules.map(rule => rule.decls))
}

// 胶囊相对日期行盒顶的位置与尺寸；清爽密度（含合并信息行）先读清爽覆盖，再退回基础规则
function todayCapsuleBox(wxss, density) {
  const decls = {
    ...mergedDecls(wxss, TODAY_CAPSULE_SELECTOR),
    ...(density === 'compact' ? mergedDecls(wxss, COMPACT_TODAY_CAPSULE_SELECTOR) : {})
  }
  return {
    top: signedRpx(decls.top, 'capsule top'),
    height: signedRpx(decls.height, 'capsule height'),
    width: signedRpx(decls.width, 'capsule width'),
    left: decls.left,
    marginLeft: signedRpx(decls['margin-left'], 'capsule margin-left')
  }
}

test('today is a compact capsule around the date number and never paints the whole cell', () => {
  const { parseWxssRules } = require('./designTokens')
  const { calendarCellContentMinRpx } = require('../utils/calendarRowHeight')
  const wxss = readWxss()

  // 今天格本身不上色：不铺整格底、不描整格框（经期今天也一样），今天只落在日期胶囊或色带上
  const cellPaint = []
  for (const rule of parseWxssRules(wxss)) {
    for (const selector of rule.selectors) {
      const subject = subjectCompound(selector)
      if (!/\.day-cell(?![\w-])/.test(subject) || !/\.today(?![\w-])/.test(subject)) continue
      for (const property of CELL_PAINT_PROPERTIES) {
        if (property in rule.decls) cellPaint.push(`${selector} { ${property} }`)
      }
    }
  }
  assert.deepEqual(cellPaint, [], 'today paints only the date capsule, never the whole cell')

  // 胶囊是日期身后的一层：日期自成叠放层，胶囊在数字后面、在格子与色带之上
  const capsule = mergedDecls(wxss, TODAY_CAPSULE_SELECTOR)
  assert.match(capsule.content, /^(?:''|"")$/)
  assert.equal(capsule.position, 'absolute')
  assert.equal(capsule['z-index'], '-1')
  assert.equal(capsule['box-sizing'], 'border-box')
  assert.equal(capsule['border-radius'], 'var(--radius-full)')
  const dateLayer = parseWxssRules(wxss).find(rule => rule.selectors.includes('.day-num') && rule.decls.position === 'relative')
  assert.ok(dateLayer && Number(dateLayer.decls['z-index']) >= 1, 'the date must be its own stacking layer above the band')

  // 回到今天的光晕（issue #165）和胶囊同一个框，只有更粗的描边，border-box 向内画：描边内沿也不能压到日期字形
  const haloRing = signedRpx(
    mergedDecls(wxss, '.calendar-days.calendar-emphasis-today-a .day-cell.today .day-num::after').border.split(/\s+/)[0],
    'halo ring width'
  )

  const column = dayColumnRpx(wxss, NARROW_VIEWPORT_PX)
  const lunar = ruleBody(wxss, '.day-lunar')
  const lunarLeading = (declarationRpx(lunar, 'line-height') - declarationRpx(lunar, 'font-size')) / 2
  const dateFont = {
    full: declarationRpx(ruleBody(wxss, '.day-num'), 'font-size'),
    compact: declarationRpx(ruleBody(wxss, '.calendar-density-compact .day-num'), 'font-size')
  }
  for (const [layout, density, cap] of [['full', 'full', 160], ['compact', 'compact', 140], ['merged', 'compact', 140]]) {
    const box = todayCapsuleBox(wxss, density)
    assert.ok(
      box.height >= TODAY_CAPSULE_HEIGHT_RPX.min && box.height <= TODAY_CAPSULE_HEIGHT_RPX.max,
      `${layout} capsule is ${box.height}rpx tall, outside ${TODAY_CAPSULE_HEIGHT_RPX.min}–${TODAY_CAPSULE_HEIGHT_RPX.max}rpx`
    )
    // 横向是胶囊（比高宽），居中在日期上，左右给格子留出空，不框住整格
    assert.ok(box.width > box.height, `${layout} capsule ${box.width}×${box.height}rpx should be wider than tall`)
    assert.ok(box.width <= column * 0.75, `${layout} capsule ${box.width}rpx frames most of the ${column.toFixed(1)}rpx column`)
    assert.equal(box.left, '50%', `${layout} capsule centers on the date`)
    assert.equal(box.marginLeft, -box.width / 2, `${layout} capsule centers on the date`)

    const cell = cssCellLayout(wxss, layout)
    const stack = cell.stack.reduce((sum, slot) => sum + slot.gap + slot.height, 0)
    const dateLine = cell.stack[0].height
    const dateLeading = (dateLine - dateFont[density]) / 2
    for (const height of [calendarCellContentMinRpx(layout), cap]) {
      const dateTop = cell.align === 'center'
        ? cell.paddingTop + (height - cell.paddingTop - cell.paddingBottom - stack) / 2
        : cell.paddingTop
      const top = dateTop + box.top
      const bottom = top + box.height
      // 下面紧挨的一槽：完整密度是农历，农历字框从行盒顶加半行距开始；清爽是节日/调休，合并是信息行，
      // 「班」「预」胶囊占满自己的槽，从槽顶就有底色。胶囊下沿离它们至少 TODAY_CAPSULE_ROUNDING_RPX
      const nextSlotTop = dateTop + dateLine + cell.stack[1].gap
      const nextInkTop = layout === 'full' ? nextSlotTop + lunarLeading : nextSlotTop
      const where = `${layout} at ${height}rpx: capsule ${top}–${bottom}rpx`
      assert.ok(top >= 0 && bottom <= height, `${where} is clipped by the ${height}rpx cell`)
      assert.ok(
        top <= dateTop + dateLeading && bottom >= dateTop + dateLine - dateLeading,
        `${where} does not wrap the date glyphs ${dateTop + dateLeading}–${dateTop + dateLine - dateLeading}rpx`
      )
      assert.ok(
        top + haloRing <= dateTop + dateLeading && bottom - haloRing >= dateTop + dateLine - dateLeading,
        `${where}: the ${haloRing}rpx halo ring reaches into the date glyphs ${dateTop + dateLeading}–${dateTop + dateLine - dateLeading}rpx`
      )
      assert.ok(
        bottom <= nextInkTop - TODAY_CAPSULE_ROUNDING_RPX,
        `${where} comes within ${TODAY_CAPSULE_ROUNDING_RPX}rpx of the row below the date, which starts at ${nextInkTop}rpx`
      )
    }
  }

  // 图例样本是同一枚胶囊：样本格按完整密度度量，日期居中，胶囊完整落在样本格里
  const legend = ruleBody(wxss, '.legend-sample.day-cell')
  assert.match(legend, /justify-content:\s*center/)
  const tile = declarationRpx(legend, 'height')
  const fullBox = todayCapsuleBox(wxss, 'full')
  const legendDateTop = (tile - declarationRpx(ruleBody(wxss, '.day-num'), 'line-height')) / 2
  assert.ok(
    legendDateTop + fullBox.top >= 0 && legendDateTop + fullBox.top + fullBox.height <= tile && fullBox.width <= declarationRpx(legend, 'width'),
    'the legend sample holds the whole today capsule'
  )
})

// 行高变量缺省时，CSS 退回的就是账本上限：完整 160rpx、清爽 140rpx（合并信息行沿用清爽格的高度规则）
test('the CSS row-height fallbacks are the ledger caps for both densities', () => {
  const { CALENDAR_ROW_CAP_RPX } = require('../utils/calendarRowHeight')
  const wxss = readWxss()
  const full = ruleBody(wxss, '.day-cell')
  const compact = ruleBody(wxss, '.calendar-density-compact .day-cell')
  assert.match(full, /height:\s*var\(--calendar-row-height,\s*\d+rpx\)/)
  assert.match(compact, /height:\s*var\(--calendar-row-height,\s*\d+rpx\)/)
  assert.equal(declarationRpx(full, 'height'), CALENDAR_ROW_CAP_RPX.full)
  assert.equal(declarationRpx(compact, 'height'), CALENDAR_ROW_CAP_RPX.compact)
  assert.deepEqual(CALENDAR_ROW_CAP_RPX, { full: 160, compact: 140 })
  assert.doesNotMatch(ruleBody(wxss, '.calendar-info-merged .day-cell'), /height:/)
})

test('full density first-screen stack stays within the ratcheted budget', () => {
  const wxss = readWxss()
  const FULL_STACK_RATCHET_RPX = 1442
  const SAFE_TOP_RPX = 88
  const NAV_BAR_RPX = 88
  const MONTH_NAV_CONTENT_RPX = 88
  const WEEK_TEXT_RPX = declarationRpx(ruleBody(wxss, '.week-cell'), 'line-height')
  const QUICK_CONTENT_RPX = 40
  const SIX_ROWS = 6

  const monthNavBody = ruleBody(wxss, '.month-nav')
  const monthNav = MONTH_NAV_CONTENT_RPX +
    verticalBox(monthNavBody, 'padding') +
    verticalBox(monthNavBody, 'margin')
  const weekHeader = verticalBox(ruleBody(wxss, '.week-header'), 'padding') + WEEK_TEXT_RPX
  const gridPadding = verticalBox(ruleBody(wxss, '.calendar-grid'), 'padding')
  const fullCell = declarationRpx(ruleBody(wxss, '.day-cell'), 'height')
  // 记录按钮行高 = max(min-height, 纵向内边距 + 内容行)：min-height 抬高后按真实高度记账
  const quickBody = ruleBody(wxss, '.quick-btn')
  const quickRow = Math.max(
    declarationRpx(quickBody, 'min-height'),
    verticalBox(quickBody, 'padding') + QUICK_CONTENT_RPX
  )
  const quickActions = declarationRpx(ruleBody(wxss, '.quick-actions'), 'margin-top') + quickRow

  const stack = SAFE_TOP_RPX + NAV_BAR_RPX + monthNav +
    weekHeader + gridPadding + SIX_ROWS * fullCell + quickActions

  assert.ok(
    stack <= FULL_STACK_RATCHET_RPX,
    `full density first-screen stack ${stack}rpx regressed beyond the ${FULL_STACK_RATCHET_RPX}rpx ratchet`
  )
})

test('period band stays compact, connects across a week and caps the open end without animating', () => {
  const wxss = readWxss()
  const band = ruleBody(wxss, '.period-band')
  assert.match(band, /inset:\s*0\s+0\s+auto/)
  assert.match(band, /height:\s*44rpx/)
  assert.match(band, /background:\s*rgba\(232,\s*144,\s*158,\s*0\.(?:1[89]|2[0-4])\)/)
  assert.doesNotMatch(band, /transition\s*:/)
  assert.doesNotMatch(band, /animation\s*:/)

  const compactBand = ruleBody(wxss, '.calendar-density-compact .period-band')
  assert.match(compactBand, /top:\s*8rpx/)
  assert.match(compactBand, /height:\s*48rpx/)

  const cell = ruleBody(wxss, '.day-cell.period')
  assert.match(cell, /border-radius:\s*0/)

  const start = ruleBody(wxss, '.day-cell.period-start .period-band')
  assert.match(start, /border-top-left-radius:\s*var\(--radius-full\)/)
  assert.match(start, /border-bottom-left-radius:\s*var\(--radius-full\)/)
  assert.match(start, /border-top-right-radius:\s*0/)
  assert.match(start, /border-bottom-right-radius:\s*0/)

  const middle = ruleBody(wxss, '.day-cell.period-middle .period-band')
  assert.match(middle, /border-radius:\s*0/)

  const end = ruleBody(wxss, '.day-cell.period-end .period-band')
  assert.match(end, /border-top-right-radius:\s*var\(--radius-full\)/)
  assert.match(end, /border-bottom-right-radius:\s*var\(--radius-full\)/)
  assert.match(end, /border-top-left-radius:\s*0/)
  assert.match(end, /border-bottom-left-radius:\s*0/)

  const single = ruleBody(wxss, '.day-cell.period-single .period-band')
  assert.match(single, /border-radius:\s*var\(--radius-full\)/)

  const openEnd = ruleBody(wxss, '.day-cell.period-open.period-end .period-band')
  assert.match(openEnd, /border-top-right-radius:\s*0/)
  assert.match(openEnd, /border-bottom-right-radius:\s*0/)
  const openSingle = ruleBody(wxss, '.day-cell.period-open.period-single .period-band')
  assert.match(openSingle, /border-top-right-radius:\s*0/)
  assert.match(openSingle, /border-bottom-right-radius:\s*0/)

})

// DESIGN.md 是唯一视觉权威：frontmatter 的今天胶囊登记就是 CSS 画的那一枚，整格的 todayBg / todayRing 已退役
test('DESIGN.md registers the today capsule the CSS draws', () => {
  const design = fs.readFileSync(path.join(__dirname, '..', 'DESIGN.md'), 'utf8')
  const frontmatter = design.split('\n---')[0]
  const registered = key => (new RegExp(`\\n\\s+${key}:\\s*"([^"]+)"`).exec(frontmatter) || [])[1]
  const wxss = readWxss()
  const capsule = mergedDecls(wxss, TODAY_CAPSULE_SELECTOR)
  const full = todayCapsuleBox(wxss, 'full')
  const compact = todayCapsuleBox(wxss, 'compact')

  assert.equal(registered('todayCapsuleBg'), capsule.background)
  assert.equal(registered('todayCapsuleStroke'), capsule.border)
  assert.equal(registered('todayCapsuleSize'), `${full.width}×${full.height}rpx full / ${compact.width}×${compact.height}rpx compact`)
  assert.equal(registered('todayText'), anchoredDeclaration(ruleBody(wxss, '.day-cell.today .day-num'), 'color'))
  assert.doesNotMatch(design, /todayBg|todayRing|薰衣草内描边|今天玫瑰底/, 'the full-cell today wording is retired')
})

// issue #162：图例样本就是一枚日历格：铺日历网格同款玻璃底、同款圆角，今天胶囊和各个标记落在和网格相同的合成面上；
// 经期样本的色带在样本格里竖向居中，不贴在格子顶上
test('legend samples are calendar cells on the grid glass', () => {
  const wxss = readWxss()
  const legend = ruleBody(wxss, '.legend-sample.day-cell')
  assert.equal(
    anchoredDeclaration(legend, 'background'),
    anchoredDeclaration(ruleBody(wxss, '.calendar-grid'), 'background'),
    'the legend sample paints the calendar grid glass'
  )
  // 与经期格的直角同特异度，图例规则写在后面才压得住，经期样本也保留格子圆角
  assert.equal(anchoredDeclaration(legend, 'border-radius'), anchoredDeclaration(ruleBody(wxss, '.day-cell'), 'border-radius'))
  assert.ok(wxss.indexOf('\n.legend-sample.day-cell {') > wxss.indexOf('\n.day-cell.period {'), 'the legend corner rule must follow the period square-corner rule')
  const tile = declarationRpx(legend, 'height')
  const band = declarationRpx(ruleBody(wxss, '.period-band'), 'height')
  assert.equal(declarationRpx(ruleBody(wxss, '.legend-sample .period-band'), 'top'), (tile - band) / 2, 'the band sample sits in the middle of its tile')
})

const BAND_SIDES = ['top', 'right', 'bottom', 'left']

function strokeWidthOf(value) {
  const token = String(value).trim().split(/\s+/).find(part => /^(?:0|none|hidden|-?\d+(?:\.\d+)?(?:rpx|px))$/.test(part))
  if (!token || token === 'none' || token === 'hidden') return 0
  return Number.parseFloat(token)
}

function boxSides(value) {
  const parts = String(value).trim().split(/\s+/).map(strokeWidthOf)
  const [top, right = top, bottom = top, left = right] = parts
  return { top, right, bottom, left }
}

// 一个经期格的色带最后描了哪几条边：按真实层叠（特异度、再按源码顺序）解析所有落到 .period-band 上的
// border 与 inset 阴影。只认「<格子类> .period-band」这种选择器；:not(.x) 要求格子不带 x。
function bandStrokeSides(rules, cellClasses) {
  const matched = []
  rules.forEach((rule, order) => {
    for (const selector of rule.selectors) {
      const compounds = selector.trim().split(/\s+/)
      if (compounds.length !== 2 || compounds[1] !== '.period-band') continue
      const cell = compounds[0]
      const excluded = [...cell.matchAll(/:not\(\.([\w-]+)\)/g)].map(match => match[1])
      const required = [...cell.replace(/:not\([^)]*\)/g, '').matchAll(/\.([\w-]+)/g)].map(match => match[1])
      if (!required.every(name => cellClasses.includes(name)) || excluded.some(name => cellClasses.includes(name))) continue
      matched.push({ specificity: required.length + excluded.length + 1, order, decls: rule.decls })
    }
  })
  matched.sort((a, b) => a.specificity - b.specificity || a.order - b.order)
  const width = { top: 0, right: 0, bottom: 0, left: 0 }
  for (const { decls } of matched) {
    for (const [property, value] of Object.entries(decls)) {
      if (property === 'border') BAND_SIDES.forEach(name => { width[name] = strokeWidthOf(value) })
      else if (property === 'border-width') Object.assign(width, boxSides(value))
      else {
        const side = /^border-(top|right|bottom|left)(?:-width)?$/.exec(property)
        if (side) width[side[1]] = strokeWidthOf(value)
      }
      if (property === 'box-shadow') {
        for (const shadow of value.split(/,(?![^(]*\))/)) {
          const lengths = shadow.trim().startsWith('inset') ? (shadow.match(/-?\d+(?:\.\d+)?(?:rpx|px)|\b0\b/g) || []).map(Number.parseFloat) : []
          if (lengths.length < 2) continue
          const [x, y, , spread = 0] = lengths
          if (spread > 0) BAND_SIDES.forEach(name => { width[name] = Math.max(width[name], spread) })
          if (y > 0) width.top = Math.max(width.top, y)
          if (y < 0) width.bottom = Math.max(width.bottom, -y)
          if (x > 0) width.left = Math.max(width.left, x)
          if (x < 0) width.right = Math.max(width.right, -x)
        }
      }
    }
  }
  return BAND_SIDES.filter(name => width[name] > 0)
}

// issue #162：经期今天不叠第二枚胶囊，只在色带外缘描今天。和邻格相连的一侧、进行中开口的一端都不描，
// 色带的连接与开口保持原样：中段只有上下两条边，不会在色带里画出竖线
test("today on a period band strokes only the band's outer edges and never cuts the run", () => {
  const { parseWxssRules } = require('./designTokens')
  const wxss = readWxss()
  const rules = parseWxssRules(wxss)
  const cases = [
    [['period-single'], ['top', 'right', 'bottom', 'left']],
    [['period-start'], ['top', 'bottom', 'left']],
    [['period-middle'], ['top', 'bottom']],
    [['period-end'], ['top', 'right', 'bottom']],
    [['period-open', 'period-end'], ['top', 'bottom']],
    [['period-open', 'period-single'], ['top', 'bottom', 'left']]
  ]
  for (const [segment, expected] of cases) {
    assert.deepEqual(
      bandStrokeSides(rules, ['day-cell', 'today', 'period', ...segment]),
      expected,
      `today on a ${segment.join(' ')} band strokes the wrong sides`
    )
    assert.deepEqual(bandStrokeSides(rules, ['day-cell', 'period', ...segment]), [], `a ${segment.join(' ')} band that is not today stays unstroked`)
  }

  // 今天只有一种描边：经期今天的色带边与今天胶囊同宽同色；描边画在色带盒子里，色带仍是 44 / 48rpx 高
  const ring = ruleBody(wxss, '.day-cell.today.period .period-band')
  assert.equal(anchoredDeclaration(ring, 'border'), anchoredDeclaration(ruleBody(wxss, TODAY_CAPSULE_SELECTOR), 'border'))
  assert.match(ring, /box-sizing:\s*border-box/)
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
