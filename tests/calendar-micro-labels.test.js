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
  '.meaning-tool-text',
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
  const match = body.match(new RegExp(`${property}:\\s*([^;]+);`))
  assert.ok(match, `expected ${property}`)
  const resolved = match[1].trim().replace(/var\((--[a-z0-9-]+)\)/i, (_, name) => {
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

function todayRingRpx(wxss) {
  const match = ruleBody(wxss, '.day-cell.today').match(/inset\s+0\s+0\s+0\s+(\d+(?:\.\d+)?)rpx/)
  assert.ok(match, 'expected the today inset ring')
  return Number(match[1])
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

test('leap-month lunar stays on one line without ellipsis because a second line crosses the today ring', () => {
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
  const room = twoLineSlack + paddingVertical(cell).bottom - todayRingRpx(wxss)

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
    `a second lunar line still clears the today ring (overhang ${overhang}rpx, room ${room}rpx)`
  )
})

test('holiday, workday, and predict capsules center their labels with inset at 320px', () => {
  const wxss = readWxss()
  const tag = ruleBody(wxss, '.day-tag')
  const predict = ruleBody(wxss, '.predict-mark')
  const column = dayColumnRpx(wxss, NARROW_VIEWPORT_PX) -
    horizontalPaddingRpx(ruleBody(wxss, '.day-cell'))
  const ring = todayRingRpx(wxss)

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
    overhang <= fullBelow - ring,
    `predict capsule overhang ${overhang}rpx crosses the today ring (room ${fullBelow - ring}rpx)`
  )

  const compactCell = ruleBody(wxss, '.calendar-density-compact .day-cell')
  const compactSlack = contentHeightRpx(compactCell) - (
    declarationRpx(ruleBody(wxss, '.calendar-density-compact .day-num'), 'line-height') +
    stackedBlockRpx(ruleBody(wxss, '.calendar-density-compact .day-tag-line')) +
    stackedBlockRpx(ruleBody(wxss, '.calendar-density-compact .day-marks'))
  )
  const compactBelow = compactSlack / 2 + paddingVertical(compactCell).bottom
  assert.ok(
    overhang <= compactBelow - ring,
    `predict capsule overhang ${overhang}rpx crosses the compact today ring (room ${compactBelow - ring}rpx)`
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
  // issue #55 起图例/预测/小结工具行与密度偏好退出首屏路径（密度迁入设置页），
  // 栈深只剩 月份导航 → 日历 → 记录入口。完整密度 6 行时记录按钮上缘已落入视口，
  // 整体底部略超 1334rpx、只需极短滚动；农历行与节日标签行仍是被 calendar-display
  // 测试钉死的两层堆叠，不缩小微字吸收。issue #73 把记录按钮抬高到 104rpx
  // （320px 宽 44px 可点高度），栈底随之从 1414rpx 移到 1442rpx；钉住当前值作为棘轮，只允许变小。
  const FULL_STACK_RATCHET_RPX = 1442
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
