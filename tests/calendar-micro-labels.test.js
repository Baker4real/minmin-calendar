const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const WXSS_PATH = path.join(__dirname, '..', 'pages/index/index.wxss')
const MIN_CAPTION_RPX = 24
const DESIGN_CAPTION_RPX = 26
const CAPTION_LINE_HEIGHT_RATIO = 1.4
const MIN_FULL_CELL_SLACK_RPX = 8
const MICRO_LABEL_SELECTORS = ['.day-tag', '.predict-mark', '.predict-confidence']

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
