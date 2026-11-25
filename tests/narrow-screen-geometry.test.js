const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { readSource } = require('./sourceFiles')
const { listWxssFiles, parseWxssRules } = require('./designTokens')
const { homeFeedbackCopy } = require('./helpers/homeFeedbackCopy')
const { createMiniProgram } = require('./helpers/miniProgram')
const { renderWxmlAttribute, wxmlOpeningTags } = require('./wxmlTemplate')

// issue #56：窄屏几何、容器溢出与安全区。
// 口径：rpx 始终按 750rpx = 视口宽等比换算，px = rpx × viewportPx / 750。
// 触控目标按 DESIGN.md 借入规则「触控高度至少 44px」；320px 下七列宽度是物理上限
// （7 × 44px = 308px > 可用宽度），以防重叠平铺保证不误触相邻日期，不缩字号吸收。
const repoRoot = path.join(__dirname, '..')

const ALL_PAGES = [
  'pages/bind/bind',
  'pages/index/index',
  'pages/memory/memory',
  'pages/memory/edit/edit',
  'pages/period/period',
  'pages/period/edit/edit',
  'pages/settings/settings'
]
const NON_TAB_WXSS = [
  'pages/bind/bind.wxss',
  'pages/memory/edit/edit.wxss',
  'pages/period/edit/edit.wxss'
]
const TAB_WXSS = [
  'pages/index/index.wxss',
  'pages/period/period.wxss',
  'pages/settings/settings.wxss'
]

function readRepo(relativePath) {
  return readSource(path.join(repoRoot, relativePath), 'utf8')
}

function readRawRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function findDecls(rules, selector) {
  const rule = rules.find(item => item.selectors.includes(selector))
  assert.ok(rule, `expected rule for ${selector}`)
  return rule.decls
}

function splitCssTokens(value) {
  const tokens = []
  let depth = 0
  let current = ''
  for (const ch of String(value).trim()) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (/\s/.test(ch) && depth === 0) {
      if (current) tokens.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

function isZeroToken(token) {
  return /^0(a?\.?0*)?(px|rpx)?$/.test(token) && parseFloat(token) === 0
}

function horizontalPaddingTokens(decls) {
  const tokens = []
  for (const key of ['padding-left', 'padding-right']) {
    if (decls[key] && !isZeroToken(decls[key].trim())) tokens.push(decls[key].trim())
  }
  if (decls.padding) {
    const parts = splitCssTokens(decls.padding)
    if (parts.length === 1 && !isZeroToken(parts[0])) tokens.push(parts[0])
    if (parts.length >= 2 && !isZeroToken(parts[1])) tokens.push(parts[1])
    if (parts.length === 4 && !isZeroToken(parts[3])) tokens.push(parts[3])
  }
  return tokens
}

function verticalPaddingRpx(decls) {
  if (!decls.padding) return 0
  const parts = splitCssTokens(decls.padding)
  const top = parts[0]
  const bottom = parts.length >= 3 ? parts[2] : parts[0]
  const toRpx = token => {
    const match = /^(\d+(?:\.\d+)?)rpx$/.exec(token)
    return match ? Number(match[1]) : 0
  }
  return toRpx(top) + toRpx(bottom)
}

function readAppTokens() {
  const tokens = {}
  for (const rule of parseWxssRules(readRepo('app.wxss'))) {
    for (const [prop, value] of Object.entries(rule.decls)) {
      if (prop.startsWith('--')) tokens[prop] = value
    }
  }
  return tokens
}

function rpxNumber(decls, prop) {
  const raw = decls[prop] || ''
  const fallback = /var\(\s*--[a-z0-9-]+\s*,\s*(\d+(?:\.\d+)?)rpx\s*\)/i.exec(raw)
  if (fallback) return Number(fallback[1])
  const match = /^(\d+(?:\.\d+)?)rpx$/.exec(raw)
  return match ? Number(match[1]) : null
}

// 「12rpx」或「var(--space-xs)」这类长度换成 rpx 数；token 从 app.wxss 读
function tokenRpx(token, appTokens) {
  const variable = /^var\((--[a-z0-9-]+)\)$/.exec(String(token).trim())
  const resolved = variable ? appTokens[variable[1]] : token
  assert.ok(resolved !== undefined, `missing app.wxss token for ${token}`)
  const value = parseFloat(resolved)
  assert.ok(Number.isFinite(value), `expected numeric rpx for ${token}, got ${resolved}`)
  return value
}

// 横幅把 1px 边框吸收进 calc() 的垂直 padding；统一换算到最窄 320px 的 rpx 账本。
function narrowLengthRpx(token) {
  const raw = String(token).trim()
  if (raw === '0') return 0
  const calc = /^calc\((-?\d+(?:\.\d+)?)rpx\s*([+-])\s*(\d+(?:\.\d+)?)px\)$/.exec(raw)
  if (calc) return Number(calc[1]) + (calc[2] === '+' ? 1 : -1) * Number(calc[3]) * 750 / 320
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(raw)
  if (px) return Number(px[1]) * 750 / 320
  const rpx = /^(-?\d+(?:\.\d+)?)rpx$/.exec(raw)
  assert.ok(rpx, `expected an rpx, px or simple calc length, got ${raw}`)
  return Number(rpx[1])
}

function fontSizeRpx(declOrToken, appTokens = readAppTokens()) {
  const raw = typeof declOrToken === 'string' ? declOrToken : declOrToken['font-size']
  return tokenRpx(raw, appTokens)
}

function horizontalPaddingRpx(decls, appTokens = readAppTokens()) {
  return horizontalPaddingTokens(decls).map(token => tokenRpx(token, appTokens))
}

test('rules with explicit width and horizontal padding use border-box (no additive overflow)', () => {
  const offenders = []
  for (const file of listWxssFiles(repoRoot)) {
    for (const rule of parseWxssRules(readSource(file, 'utf8'))) {
      const width = rule.decls.width
      if (!width || width === 'auto') continue
      if (horizontalPaddingTokens(rule.decls).length === 0) continue
      if (rule.decls['box-sizing'] !== 'border-box') {
        offenders.push(`${path.relative(repoRoot, file)} ${rule.selectors.join(', ')} (width: ${width})`)
      }
    }
  }
  assert.deepEqual(offenders, [], 'width + horizontal padding without box-sizing: border-box overflows its container')
})

test('bind card is border-box at width:100% and keeps a usable inner width at 320px', () => {
  const rules = parseWxssRules(readRepo('pages/bind/bind.wxss'))
  const content = findDecls(rules, '.content')
  const card = findDecls(rules, '.premium-card')
  const codeInput = { ...findDecls(rules, '.form-control'), ...findDecls(rules, '.code-input') }

  // 溢出根因：width:100% + padding 40rpx 在 content-box 下叠加出 82rpx 横向溢出
  assert.equal(card.width, '100%')
  assert.equal(card['box-sizing'], 'border-box')
  assert.equal(codeInput['box-sizing'], 'border-box')

  const contentPadX = horizontalPaddingTokens(content).map(token => Number(/(\d+)rpx/.exec(token)[1]))
  const cardPadX = horizontalPaddingTokens(card).map(token => Number(/(\d+)rpx/.exec(token)[1]))
  const innerRpx = 750 - 2 * contentPadX[0] - 2 * cardPadX[0]
  for (const viewportPx of [320, 375, 390]) {
    const outerPx = ((750 - 2 * contentPadX[0]) * viewportPx) / 750
    assert.ok(outerPx <= viewportPx - (2 * contentPadX[0] * viewportPx) / 750 + 0.01,
      `bind card bleeds outside content padding at ${viewportPx}px`)
  }
  assert.ok(innerRpx >= 560, `bind card inner width ${innerRpx}rpx too narrow for the join form`)
})

test('room code input stays inside the card at 320px and the six glyphs fit the line', () => {
  const rules = parseWxssRules(readRepo('pages/bind/bind.wxss'))
  const content = findDecls(rules, '.content')
  const card = findDecls(rules, '.premium-card')
  const codeInput = { ...findDecls(rules, '.form-control'), ...findDecls(rules, '.code-input') }

  const height = rpxNumber(codeInput, 'height')
  const lineHeight = rpxNumber(codeInput, 'line-height')
  assert.ok(height >= 88, `code input height ${height}rpx is below the 88rpx touch step`)
  assert.ok(lineHeight >= 88, `code input line-height ${lineHeight}rpx is below the 88rpx touch step`)
  assert.ok(lineHeight <= height, 'the line box must sit inside the explicit height')

  const contentPadX = horizontalPaddingTokens(content).map(token => Number(/(\d+)rpx/.exec(token)[1]))
  const cardPadX = horizontalPaddingTokens(card).map(token => Number(/(\d+)rpx/.exec(token)[1]))
  const inputPadX = horizontalPaddingTokens(codeInput).map(token => Number(/(\d+)rpx/.exec(token)[1]))
  const innerRpx = 750 - 2 * contentPadX[0] - 2 * cardPadX[0]
  assert.equal(codeInput.width, '100%', 'the input border box is the card inner width, so it cannot hang out of the card')

  const fontSize = rpxNumber(codeInput, 'font-size')
  const tracking = 12
  const glyphAdvance = 6 * fontSize + 5 * tracking + tracking
  const contentWidth = innerRpx - 2 * inputPadX[0]
  assert.ok(
    glyphAdvance <= contentWidth,
    `six room-code glyphs ${glyphAdvance}rpx exceed the input content width ${contentWidth}rpx`
  )

  const viewportPx = 320
  const inputOuterPx = (innerRpx * viewportPx) / 750
  const cardOuterPx = ((750 - 2 * contentPadX[0]) * viewportPx) / 750
  assert.ok(inputOuterPx <= cardOuterPx, 'the input overflows the bind card at 320px')
  assert.ok(cardOuterPx <= viewportPx, 'the bind card overflows a 320px viewport')
})

test('edit form cards are border-box so width and padding never add up past the viewport', () => {
  for (const file of ['pages/period/edit/edit.wxss', 'pages/memory/edit/edit.wxss']) {
    const card = findDecls(parseWxssRules(readRepo(file)), '.premium-card')
    assert.equal(card['box-sizing'], 'border-box', `${file} .premium-card must be border-box`)
  }
})

test('record tab memory month card header stays on one line at 320px', () => {
  // issue #108：欢乐时光月份卡头「YYYY年M月 · N 条」在 320px 宽单行完整显示。
  // issue #109：卡头右侧多了「展开/收起」文字（caption 档），一并纳入账本。
  // 宽度账本口径与 typography-hierarchy 的月份标题先例一致：CJK 按 1em、数字按 0.6em 上限估算。
  const appRules = parseWxssRules(readRepo('app.wxss'))
  const appTokens = {}
  for (const rule of appRules) {
    for (const [prop, value] of Object.entries(rule.decls)) {
      if (prop.startsWith('--')) appTokens[prop] = value
    }
  }
  // 月份卡复用 app 级玻璃卡：卡面自身不带水平 padding，账本才不漏项
  const card = findDecls(appRules, '.premium-card')
  assert.equal(
    horizontalPaddingTokens(card).length,
    0,
    '.premium-card must not add horizontal padding of its own'
  )

  const rules = parseWxssRules(readRepo('pages/period/period.wxss'))
  const content = findDecls(rules, '.content')
  const header = findDecls(rules, '.month-header')
  const headerText = findDecls(rules, '.month-header-text')
  const toggle = findDecls(rules, '.month-toggle')

  assert.equal(headerText['font-size'], 'var(--font-size-body)')
  assert.equal(headerText['white-space'], 'nowrap')
  assert.equal(toggle['font-size'], 'var(--font-size-caption)')
  assert.equal(toggle['white-space'], 'nowrap')

  const headerSizeRpx = fontSizeRpx(headerText, appTokens)
  const toggleSizeRpx = fontSizeRpx(toggle, appTokens)
  const contentPadRpx = horizontalPaddingRpx(content)[0]
  const headerPadRpx = horizontalPaddingRpx(header, appTokens)[0]
  const headerGapRpx = Number(/(\d+)rpx/.exec(header.gap)[1])
  const availableRpx = 750 - 2 * contentPadRpx - 2 * headerPadRpx

  // 卡头标题最坏文案「2026年12月 · 99 条」：8 位数字（0.6em）+ 年/月/条 3 个 CJK（1em）
  // +「·」按全宽 1em + 两侧空格按 0.5em；切换文字最坏「收起」2 个 CJK（1em）
  const titleRpx = (8 * 0.6 + 3 + 1 + 2 * 0.5) * headerSizeRpx
  const toggleRpx = 2 * toggleSizeRpx
  const worstRpx = titleRpx + headerGapRpx + toggleRpx
  assert.ok(
    worstRpx <= availableRpx,
    `month header worst case ${worstRpx}rpx exceeds the ${availableRpx}rpx available on a 750rpx viewport`
  )
})

test('calendar day cells keep the 44px touch height at 320px in both densities', () => {
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const cell = findDecls(rules, '.day-cell')
  const compactCell = findDecls(rules, '.calendar-density-compact .day-cell')
  const content = findDecls(rules, '.content')
  const grid = findDecls(rules, '.calendar-grid')

  const widthPct = Number(/(\d+(?:\.\d+)?)%/.exec(cell.width)[1])
  const fullHeight = rpxNumber(cell, 'height')
  const compactHeight = rpxNumber(compactCell, 'height')
  const contentPadRpx = horizontalPaddingRpx(content)[0]
  const gridBorderPx = Number(/(\d+(?:\.\d+)?)px/.exec(grid.border)[1])

  // 高度（DESIGN.md：触控高度至少 44px），三档视口两密度都须满足
  for (const viewportPx of [320, 375, 390]) {
    assert.ok((compactHeight * viewportPx) / 750 >= 44, `compact cell height below 44px at ${viewportPx}px`)
    assert.ok((fullHeight * viewportPx) / 750 >= 44, `full cell height below 44px at ${viewportPx}px`)
  }

  // 宽度：320px 下 7 列物理上限 ≈42.5px，钉住 40px 下限地板；整列平铺不重叠、不越界换行
  for (const viewportPx of [320, 375, 390]) {
    const gridInnerPx = viewportPx - (2 * contentPadRpx * viewportPx) / 750 - 2 * gridBorderPx
    const columnPx = (gridInnerPx * widthPct) / 100
    assert.ok(columnPx >= 40, `day column ${columnPx.toFixed(2)}px below the 40px floor at ${viewportPx}px`)
  }
  assert.ok(7 * widthPct <= 100, `7 columns at ${widthPct}% exceed one row`)
  assert.equal(cell['box-sizing'], 'border-box')
  assert.equal(cell['margin-left'], undefined)
  assert.equal(cell['margin-right'], undefined)
})

test('joint ledger: 320/375/390 × both densities × 5/6 rows × back-to-today never squeeze a cell', () => {
  const { computeCalendarRowHeight, calendarCellContentMinRpx } = require('../utils/calendarRowHeight')
  // 页高 = 手机高度 − 底栏，顶栏含状态栏。月份按「每一天都并得进一行」算；放不下的月份见上面的合并测试。
  const phones = [
    { width: 320, screen: 568, tabBar: 48, nav: 64 },
    { width: 375, screen: 667, tabBar: 48, nav: 64 },
    { width: 390, screen: 844, tabBar: 83, nav: 91 }
  ]
  // [行高 px, 清爽密度是否合并信息行, 记录入口是否在首屏]。
  // 完整密度要 159rpx 一行：320、375 上 5 行也放不下；390 上当月 5 行刚好放下，周头少一条底边后带「回到今天」的 5 行也刚好放下，6 行靠滚动。
  // 清爽色带加厚后，375 上6行带「回到今天」及320上6行的最矮情形靠滚动；其他组合按可用高度合并。
  const expected = {
    '320:compact:5:0': [56.37, true, true],
    '320:compact:5:1': [48.86, true, true],
    '320:compact:6:0': [46.98, true, true],
    '320:compact:6:1': [46.08, true, false],
    '320:full:5:0': [67.84, false, false],
    '320:full:5:1': [67.84, false, false],
    '320:full:6:0': [67.84, false, false],
    '320:full:6:1': [67.84, false, false],
    '375:compact:5:0': [70.4, true, true],
    '375:compact:5:1': [61.6, true, true],
    '375:compact:6:0': [58.66, true, true],
    '375:compact:6:1': [54, true, false],
    '375:full:5:0': [79.5, false, false],
    '375:full:5:1': [79.5, false, false],
    '375:full:6:0': [79.5, false, false],
    '375:full:6:1': [79.5, false, false],
    '390:compact:5:0': [76.96, false, true],
    '390:compact:5:1': [76.96, false, true],
    '390:compact:6:0': [76.52, false, true],
    '390:compact:6:1': [68.89, true, true],
    '390:full:5:0': [83.2, false, true],
    '390:full:5:1': [82.68, false, true],
    '390:full:6:0': [82.68, false, false],
    '390:full:6:1': [82.68, false, false]
  }

  for (const phone of phones) {
    for (const density of ['compact', 'full']) {
      for (const rows of [5, 6]) {
        for (const showBackToToday of [false, true]) {
          const key = `${phone.width}:${density}:${rows}:${showBackToToday ? 1 : 0}`
          const row = computeCalendarRowHeight({
            viewportWidth: phone.width,
            viewportHeight: phone.screen - phone.tabBar,
            navBarHeightPx: phone.nav,
            density,
            days: monthDays(rows),
            showBackToToday
          })
          assert.deepEqual([row.heightPx, row.infoMerged, row.actionsFit], expected[key], key)
          // 行高夹在内容最小高度与原上限之间；内容最小高度本身不低于 44px 触控高度，也不低于该排版 CSS 槽位之和
          const layout = density === 'full' ? 'full' : (row.infoMerged ? 'merged' : 'compact')
          assert.ok(row.contentMinPx >= 44, `${key} content minimum under 44px`)
          assert.ok(row.contentMinPx >= calendarCellContentMinRpx(layout) * phone.width / 750 - 0.001, `${key} content minimum under the ${layout} slots`)
          assert.ok(row.heightPx >= row.contentMinPx, `${key} squeezes the cell below its content`)
          assert.ok(row.heightPx <= row.capPx, `${key} above the cap`)
        }
      }
    }
  }
})

// issue #153：联合几何账本。行高、格内内容最小高度、清爽密度是否合并信息行、记录入口是否在首屏，
// 同一组输入一次断言。月份用替身格子：只带格内会占位的字段，不带真实日期。
function monthDays(rows, cells = {}) {
  return Array.from({ length: rows * 7 }, (_, index) => ({
    isEmpty: false,
    holidayName: '',
    isWorkday: false,
    isMemory: false,
    isPredict: false,
    ...(cells[index] || {})
  }))
}

test('a calendar row never drops below the cell content minimum; full density scrolls instead of squeezing', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  // 390×844：页高 761、顶栏 91。完整密度格内是 上内边距 4 + 日期 32 + 农历 2+34 + 节日 2+38 + 标记 2+30，
  // 「预」胶囊 42 比标记行高 12、向下垂出，离格子下沿还要留 3rpx：最小 4 + 140 + 12 + 3 = 159rpx = 82.68px
  const sixRows = computeCalendarRowHeight({
    viewportWidth: 390,
    viewportHeight: 761,
    navBarHeightPx: 91,
    density: 'full',
    days: monthDays(6),
    showBackToToday: true
  })
  assert.equal(sixRows.contentMinPx, 82.68)
  assert.equal(sixRows.heightPx, 82.68, 'six full rows keep their content height instead of shrinking to the screen')
  assert.equal(sixRows.infoMerged, false, 'full density never merges its rows')
  assert.equal(sixRows.actionsFit, false, 'the record actions move below the first screen and the page scrolls to them')

  // 同一屏的 5 行月份放得下：行高停在原上限 160rpx = 83.2px，记录入口仍在首屏
  const fiveRows = computeCalendarRowHeight({
    viewportWidth: 390,
    viewportHeight: 761,
    navBarHeightPx: 91,
    density: 'full',
    days: monthDays(5)
  })
  assert.equal(fiveRows.heightPx, 83.2)
  assert.equal(fiveRows.actionsFit, true)
})

test('compact density merges the holiday row into the mark row only when the standard stack does not fit', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  // 375×667：页高 619、顶栏 64，6 行且显示「回到今天」。首屏 = 吸顶占位 306 + 周头 50 + 网格内边距 12 + 记录入口 114
  // = 482rpx = 241px，移除周头底边后另有 6px 描边：每行可用 (619 − 64 − 247) / 6 = 51.33px，低于合并最小高度。
  // 常规清爽格加上2+12rpx经期槽后需要146rpx = 73px，放不下；
  // 合并后8 + 日期38 + 色带2+12 + 信息2+42 + 底4 = 108rpx = 54px，仍需自然滚动。
  const short = computeCalendarRowHeight({
    viewportWidth: 375,
    viewportHeight: 619,
    navBarHeightPx: 64,
    density: 'compact',
    days: monthDays(6),
    showBackToToday: true
  })
  assert.equal(short.infoMerged, true)
  assert.equal(short.contentMinPx, 54)
  assert.equal(short.heightPx, 54)
  assert.equal(short.actionsFit, false)

  // 390×844 当月：首屏描边为 6px，每行可用 (761 − 91 − 210.88) / 6 = 76.52px，常规清爽格放得下，不合并，行高低于148rpx上限
  const roomy = computeCalendarRowHeight({
    viewportWidth: 390,
    viewportHeight: 761,
    navBarHeightPx: 91,
    density: 'compact',
    days: monthDays(6)
  })
  assert.equal(roomy.infoMerged, false)
  assert.equal(roomy.contentMinPx, 75.92)
  assert.equal(roomy.heightPx, 76.52)
  assert.equal(roomy.actionsFit, true)
})

test('a month merges only when every day fits its holiday tag and marks on one line, otherwise it scrolls', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  // 同上 375×667、6 行带「回到今天」。一列宽 = (375 − 2×(24 + 10)×0.5 − 2px 网格描边) × 14.28% = 48.41px。
  // 合并行 = 节日/调休胶囊 + 4rpx + 标记，按字宽 1em 上限算：
  //   「中秋」+ ♥ = (2×24 + 2×8)×0.5 + 2 + 24×0.5 = 46px        → 放得下
  //   「班」+ ♥   = (24 + 2×8)×0.5 + 2px 描边 + 2 + 12 = 36px    → 放得下
  //   「中秋」+「预」= 32 + 2 + ((26 + 2×10)×0.5 + 2px) = 59px    → 放不下
  //   「班」+「预」  = 22 + 2 + 25 = 49px                         → 放不下
  //   「劳动节」+ ♥ = (3×24 + 16)×0.5 + 2 + 12 = 58px             → 放不下
  // 放不下的日子在合并行里只能被裁掉，所以整月保持常规清爽格：行高停在146rpx = 73px，记录入口改由滚动触达。
  const base = { viewportWidth: 375, viewportHeight: 619, navBarHeightPx: 64, density: 'compact', showBackToToday: true }
  const geometryWith = cell => computeCalendarRowHeight({ ...base, days: monthDays(6, { 10: cell }) })

  for (const cell of [
    { holidayName: '中秋', isMemory: true },
    { isWorkday: true, isMemory: true },
    { isMemory: true, isPredict: true },
    { holidayName: '国庆/中秋' },
    { isEmpty: true, holidayName: '中秋', isPredict: true }
  ]) {
    const row = geometryWith(cell)
    assert.equal(row.infoMerged, true, `${JSON.stringify(cell)} fits the merged row`)
    assert.equal(row.heightPx, 54)
    assert.equal(row.actionsFit, false)
  }

  for (const cell of [
    { holidayName: '中秋', isPredict: true },
    { isWorkday: true, isPredict: true },
    { holidayName: '劳动节', isMemory: true },
    { isWorkday: true, isMemory: true, isPredict: true }
  ]) {
    const row = geometryWith(cell)
    assert.equal(row.infoMerged, false, `${JSON.stringify(cell)} would be clipped in a merged row`)
    assert.equal(row.contentMinPx, 73)
    assert.equal(row.heightPx, 73)
    assert.equal(row.actionsFit, false)
  }
})

function borderPx(decls, property = 'border') {
  const match = /^(\d+(?:\.\d+)?)px\b/.exec(String(decls[property] || ''))
  assert.ok(match, 'expected a px border shorthand')
  return Number(match[1])
}

function verticalMarginRpx(decls) {
  return verticalPaddingRpx({ padding: decls.margin })
}

test('month arrows and shared sheet close circles use border-box flex centering', () => {
  for (const [file, selector] of [
    ['pages/index/index.wxss', '.nav-btn'],
    ['pages/shared/confirmation-sheet.wxss', '.sheet-close']
  ]) {
    const circle = findDecls(parseWxssRules(readRepo(file)), selector)
    assert.equal(circle['box-sizing'], 'border-box', `${file} ${selector} includes both borders in its fixed circle`)
    assert.equal(circle.display, 'flex', `${file} ${selector} display`)
    assert.equal(circle['align-items'], 'center', `${file} ${selector} vertical centering`)
    assert.equal(circle['justify-content'], 'center', `${file} ${selector} horizontal centering`)
  }
})

// issue #153：首屏账本就是记录入口以上的 CSS 文档流；每一项都从样式里读回来核对
test('the first-screen ledger is the CSS flow above the record actions', async () => {
  const { CALENDAR_LEDGER } = require('../utils/calendarRowHeight')
  const ledger = CALENDAR_LEDGER.firstScreenRpx
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const monthNav = findDecls(rules, '.month-nav')
  const sticky = findDecls(rules, '.home-sticky')
  const week = findDecls(rules, '.week-header')
  const grid = findDecls(rules, '.calendar-grid')

  // 吸顶区 = 月份导航（外边距 + 内边距 + 88rpx 控件）+ 状态行；占位再加月份导航 1px 上下描边与 R5 吸顶底边，下方内容不被盖住
  const monthNavBox = verticalMarginRpx(monthNav) + verticalPaddingRpx(monthNav) + rpxNumber(findDecls(rules, '.nav-btn'), 'height')
  assert.equal(ledger.stickySpacer, monthNavBox + rpxNumber(findDecls(rules, '.home-status'), 'height'))
  assert.equal(ledger.backToToday, rpxNumber(findDecls(rules, '.back-today'), 'height'))
  const navBorder = 2 * borderPx(monthNav)
  const stickyBorder = borderPx(sticky, 'border-bottom')
  const spacerBorder = navBorder + stickyBorder
  assert.equal(findDecls(rules, '.home-sticky-spacer').height, `calc(${ledger.stickySpacer}rpx + ${spacerBorder}px)`)
  assert.equal(
    findDecls(rules, '.home-sticky-spacer.with-back-today').height,
    `calc(${ledger.stickySpacer + ledger.backToToday}rpx + ${spacerBorder}px)`
  )

  // 行内重试行：border-box 的最小高 + 下外边距；最长的失败文案在 320px 下也只占一行
  const retry = findDecls(rules, '.refresh-retry')
  assert.equal(retry['box-sizing'], 'border-box')
  assert.equal(ledger.refreshRetry, rpxNumber(retry, 'min-height') + splitCssTokens(retry.margin).map(parseFloat)[2])
  const { retryCopies: copies } = await homeFeedbackCopy()
  assert.equal(copies.length, 3, 'observed both collection failures and the all-collection retry')
  const appTokens = readAppTokens()
  const captionRpx = fontSizeRpx(retry, appTokens)
  const contentPadRpx = horizontalPaddingRpx(findDecls(rules, '.content'))[0]
  const retryPadRpx = parseFloat(horizontalPaddingTokens(retry)[0])
  const lineRpx = 750 - 2 * contentPadRpx - 2 * retryPadRpx - 2 * borderPx(retry) * 750 / 320
  for (const copy of copies) {
    assert.ok(Array.from(copy).length * captionRpx <= lineRpx, `「${copy}」 wraps inside the retry row at 320px`)
  }
  assert.ok(captionRpx * Number(appTokens['--line-height-assist']) <= rpxNumber(retry, 'min-height'))

  // 周头 = 上下内边距 + 显式行高；网格上下内边距；记录入口 = 上外边距 + border-box 最小高
  assert.equal(ledger.weekHeader, verticalPaddingRpx(week) + rpxNumber(findDecls(rules, '.week-cell'), 'line-height'))
  assert.equal(ledger.gridPadding, verticalPaddingRpx(grid))
  const quickBtn = findDecls(rules, '.quick-btn')
  assert.equal(quickBtn['box-sizing'], 'border-box')
  assert.equal(ledger.quickActions, rpxNumber(findDecls(rules, '.quick-actions'), 'margin-top') + rpxNumber(quickBtn, 'min-height'))
  assert.equal(ledger.partnerWelcome, 103.2)

  // 月份导航与日历网格各有 1px 上下描边，R5 吸顶区底部有 1px；周头只保留顶边，底边由网格顶线单独承担。
  assert.equal(week['border-bottom'], '0')
  assert.equal(CALENDAR_LEDGER.firstScreenBorderPx, 6)
  assert.equal(CALENDAR_LEDGER.firstScreenBorderPx, navBorder + stickyBorder + borderPx(week) + 2 * borderPx(grid))
})

// issue #159：进行中经期的记录入口「经期第 N 天 · 记结束」一行放不下。连写的中文不拆开，只在文案里的空格处折行，
// 于是第一行停在「经期第 N 天 ·」、第二行是「记结束」；两行字仍在按钮最小高度里，首屏账本的记录入口高度不变。字号不缩
test('the ongoing quick-period label wraps only at its spaces and two lines stay inside the record button', () => {
  const cycle = require('../utils/cycle')
  const appTokens = readAppTokens()
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const text = findDecls(rules, '.quick-text')
  const button = findDecls(rules, '.quick-btn')
  assert.equal(text['font-size'], '28rpx', 'issue #247 keeps the old body size where the new ramp would add a third line')
  assert.equal(text['word-break'], 'keep-all', 'CJK runs break only at the spaces of the label')
  assert.equal(text['line-height'], 'var(--line-height-snug)')

  // 文字列宽（320px 下 1px 描边最宽）= 半行按钮宽 − 左右内边距 − 描边 − 圆盘 − 图文间距
  const fontRpx = fontSizeRpx(text, appTokens)
  const contentPadRpx = horizontalPaddingRpx(findDecls(rules, '.content'))[0]
  const borderRpx = borderPx(button) * 750 / 320
  const columnRpx = (750 - 2 * contentPadRpx - rpxNumber(findDecls(rules, '.quick-actions'), 'gap')) / 2 -
    2 * parseFloat(horizontalPaddingTokens(button)[0]) - 2 * borderRpx -
    rpxNumber(findDecls(rules, '.quick-icon'), 'width') - rpxNumber(button, 'gap')

  // 宽度按上界估（与本文件其他账本同口径）：CJK 与「·」1em、数字 0.6em、空格 0.5em；word joiner 不占宽。
  const widthRpx = copy => [...copy].reduce((sum, ch) => sum + (ch === String.fromCharCode(0x2060) ? 0 : /\d/.test(ch) ? 0.6 : /\s/.test(ch) ? 0.5 : 1), 0) * fontRpx
  for (const days of [1, 12, 120]) {
    const start = '2026-01-01'
    const today = new Date(Date.UTC(2026, 0, days)).toISOString().slice(0, 10)
    const { label } = cycle.buildPeriodQuickAction([{ _id: 'stand-in', startDate: start, endDate: '', status: 'ongoing' }], { today })
    const lines = label.split(/(?<=·) /)
    assert.deepEqual(lines, [`经期第 ${days} 天 ·`, '记结束'], `day ${days} label shape`)
    assert.ok(widthRpx(lines[0]) <= columnRpx, `「${lines[0]}」 ${widthRpx(lines[0])}rpx needs more than the ${columnRpx.toFixed(1)}rpx column`)
  }

  // 两行字 + 上下内边距 + 上下描边不超过按钮最小高：按钮不因折行变高，账本里的 quickActions 照旧成立
  const twoLinesRpx = 2 * fontRpx * Number(appTokens['--line-height-snug'])
  const boxRpx = twoLinesRpx + verticalPaddingRpx(button) + 2 * borderRpx
  assert.ok(boxRpx <= rpxNumber(button, 'min-height'), `two label lines need ${boxRpx.toFixed(1)}rpx, more than the ${rpxNumber(button, 'min-height')}rpx button`)
})

// 首页状态句只有一行：按 750rpx 设计宽核算每种状态的最长真实文案，含跨年日期、右侧倒数和行尾箭头。
// CJK 与标点按 1em、数字按 0.6em、空格按 0.5em 的上界口径；不通过缩字号或省略事实吸收。
test('every longest home status form fits one line and the 88rpx ledger stays unchanged', () => {
  const cycle = require('../utils/cycle')
  const { buildHomeCalendarState } = require('../utils/homeCalendarState')
  const { CALENDAR_LEDGER } = require('../utils/calendarRowHeight')
  const appTokens = readAppTokens()
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const sticky = findDecls(rules, '.home-sticky')
  const status = findDecls(rules, '.home-status')
  const main = findDecls(rules, '.home-status-text')
  const countdown = findDecls(rules, '.home-status-countdown')
  const arrow = findDecls(rules, '.home-status-arrow')
  assert.equal(rpxNumber(status, 'height'), 88)
  assert.equal(CALENDAR_LEDGER.firstScreenRpx.stickySpacer, 218)
  assert.equal(main['font-size'], '32rpx', 'issue #247 keeps the old body-lg size for the one-line status ledger')
  assert.equal(main['font-weight'], 'var(--font-weight-control)')
  assert.equal(main['white-space'], 'nowrap')
  assert.equal(countdown['font-size'], 'var(--font-size-caption)')
  assert.equal(countdown['white-space'], 'nowrap')

  const predictable = [
    { startDate: '2026-05-18', endDate: '2026-05-22' },
    { startDate: '2026-06-15', endDate: '2026-06-19' },
    { startDate: '2026-07-13', endDate: '2026-07-17' }
  ]
  const forms = [
    cycle.buildHomeStatusLine([{ startDate: '2026-01-01', status: 'ongoing' }], { today: '2026-04-30' }),
    cycle.buildHomeStatusLine([], { today: '2026-08-01' }),
    cycle.buildHomeStatusLine([
      { startDate: '2026-06-01', endDate: '2026-06-05' },
      { startDate: '2026-06-08', endDate: '2026-06-10' }
    ], { today: '2026-08-01' }),
    cycle.buildHomeStatusLine([], {
      today: '2026-12-01',
      prediction: { canPredict: true, nextStart: '2027-12-30', rangeStart: '2027-12-28', rangeEnd: '2028-01-01' }
    }),
    cycle.buildHomeStatusLine(predictable, { today: '2026-08-10' }),
    cycle.buildHomeStatusLine(predictable, {
      today: '2026-08-18',
      prediction: { canPredict: true, nextStart: '2026-08-03', rangeStart: '2026-08-02', rangeEnd: '2026-08-11' }
    }),
    cycle.buildHomeStatusLine([
      { startDate: '2025-11-01', endDate: '2025-11-05' },
      { startDate: '2025-12-01', endDate: '2025-12-05' },
      { startDate: '2025-12-29', endDate: '2026-01-02' }
    ], {
      today: '2027-01-28',
      prediction: { canPredict: true, lastStart: '2025-12-29', nextStart: '2027-01-17', rangeStart: '2027-01-16', rangeEnd: '2027-01-20' }
    }),
    buildHomeCalendarState({ year: 2026, month: 7, today: '2026-08-01', periodsSynced: false }).homeStatus
  ]

  const mainFont = fontSizeRpx(main, appTokens)
  const countdownFont = fontSizeRpx(countdown, appTokens)
  const widthRpx = (copy, fontRpx) => [...copy].reduce((sum, ch) => sum + (ch === String.fromCharCode(0x2060) ? 0 : /\d/.test(ch) ? 0.6 : /\s/.test(ch) ? 0.5 : 1), 0) * fontRpx
  const availableRpx = 750 - 2 * horizontalPaddingRpx(sticky, appTokens)[0] - 2 * parseFloat(horizontalPaddingTokens(status)[0] || '0')
  const gapRpx = rpxNumber(status, 'gap')
  const iconRules = parseWxssRules(readRepo('pages/shared/vector-icons.wxss'))
  const arrowRpx = rpxNumber(findDecls(iconRules, '.ui-icon-24'), 'width')
  assert.equal(arrowRpx, 24)
  assert.equal(arrow.width, undefined, 'the arrow box comes from the shared icon size')
  for (const form of forms) {
    const requiredRpx = widthRpx(form.text, mainFont) +
      (form.countdownText ? widthRpx(form.countdownText, countdownFont) + gapRpx : 0) + gapRpx + arrowRpx
    assert.ok(requiredRpx <= availableRpx, `${form.status}「${form.text} ${form.countdownText}」 needs ${requiredRpx.toFixed(1)}rpx, more than ${availableRpx.toFixed(1)}rpx`)
  }
})

// 首页未绑定 / 加载失败画面的主按钮在居中的列里按内容收缩，而 .btn-premium 基类左右内边距为 0：
// 430px 运行时截图里「重试」只有 34×53px、「去绑定」51×53px。两个方向都至少 88rpx 触控档，左右内边距走间距 token
test('the homepage room-status button keeps the 88rpx touch size in both axes for every action label', () => {
  const wxml = readRepo('pages/index/index.wxml')
  const roomStatus = wxml.slice(wxml.indexOf('class="no-room"'), wxml.indexOf('</view>', wxml.indexOf('bindtap="handleRoomStatusAction"')))
  assert.match(roomStatus, /class="btn-premium button-primary" bindtap="handleRoomStatusAction"/, 'the room-status action is the rose main button')

  const appTokens = readAppTokens()
  const button = findDecls(parseWxssRules(readRepo('pages/index/index.wxss')), '.no-room .btn-premium')
  assert.equal(button['box-sizing'], 'border-box', 'the minimum sizes include the padding')
  assert.ok(rpxNumber(button, 'min-width') >= 88, 'the button is at least 88rpx wide')
  assert.ok(rpxNumber(button, 'min-height') >= 88, 'the button is at least 88rpx tall')
  const [sidePad] = horizontalPaddingTokens(button)
  assert.match(sidePad || '', /^var\(--space-[a-z]+\)$/, 'the side padding comes from a spacing token')
  // 430px 截图里按钮贴着说明文字（中间只有说明行距的半个行间）：上方留一档间距 token，至少 --space-md
  assert.match(button['margin-top'] || '', /^var\(--space-[a-z]+\)$/, 'the gap above the button comes from a spacing token')
  assert.ok(tokenRpx(button['margin-top'], appTokens) >= 32, 'the button sits at least --space-md below the description')

  // 每个动作标签（button 已并入 body，每字 1em）加左右内边距都不低于 88rpx，标签两侧留出空隙
  const labels = ['去绑定', '重新加载', '重试'] // visible recovery-action copy fixtures
  const fontRpx = fontSizeRpx('var(--font-size-body)', appTokens)
  for (const label of labels) {
    const widthRpx = Array.from(label).length * fontRpx + 2 * tokenRpx(sidePad, appTokens)
    assert.ok(widthRpx >= 88, `「${label}」 is only ${widthRpx}rpx wide`)
  }
})

// 预测说明的摘要句整句折行时，430px 宽下「口」单独落在第二行（运行时截图）。文案不变，窗口从句另起一行
// （<text> 里的换行即断行）；最坏的跨年日期与两位数窗口下，两个从句在 320px 宽的 sheet 文字列里各占一行，任何宽度都不留孤字
test('the prediction summary starts the window clause on its own line and each clause fits one sheet line at 320px', () => {
  const insights = require('../utils/calendarInsights')
  const wxml = readRepo('pages/index/index.wxml')
  assert.match(wxml, /<text class="text-pair-title prediction-summary">\{\{predictionExplanation\.summary\}\}<\/text>/)

  const { summary } = insights.buildPredictionExplanation({
    canPredict: true,
    nextStart: '2027-12-30',
    nextDisplay: '2027年12月30⁠日',
    rangeEnd: '2028-01-09',
    usedCycleCount: 2,
    avgCycle: 28,
    avgDuration: 5,
    durationSource: 'history',
    confidence: 'low',
    ignoredCycleCount: 0
  }, [], { today: '2027-12-30' })
  const clauses = summary.split('\n')
  assert.deepEqual(clauses, ['预计 2027年12月30⁠日 开始，', '前后 10 天是可能开始的窗口'])

  const appTokens = readAppTokens()
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const summaryRule = findDecls(rules, '.prediction-summary')
  assert.equal(summaryRule['font-size'], 'var(--font-size-body-lg)')
  const fontRpx = fontSizeRpx(summaryRule, appTokens)
  const sheet = findDecls(rules, '.day-action-sheet')
  const columnRpx = 750 - 2 * parseFloat(horizontalPaddingTokens(findDecls(rules, '.sheet-host'))[0]) -
    2 * parseFloat(horizontalPaddingTokens(sheet)[0]) - 2 * borderPx(sheet) * 750 / 320
  // 宽度按上界估（与本文件其他账本同口径）：CJK 与标点 1em、数字 0.6em、空格 0.5em
  const widthRpx = copy => [...copy].reduce((sum, ch) => sum + (/\d/.test(ch) ? 0.6 : ch === ' ' ? 0.5 : 1), 0) * fontRpx
  for (const clause of clauses) {
    assert.ok(widthRpx(clause) <= columnRpx, `「${clause}」 needs ${widthRpx(clause).toFixed(1)}rpx, more than the ${columnRpx.toFixed(1)}rpx sheet column at 320px`)
  }
})

// issue #151 的行内重试行（首次加载只有一个集合失败时也会出现）同样在吸顶占位之后的文档流里，占首屏高度
test('the inline sync-retry row is an explicit input of the first-screen ledger', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  // 375×667 当月 6 行：首屏 394rpx + 6px 描边 = 203px，每行 (619 − 64 − 203) / 6 = 58.66px（合并信息行）。
  // 重试行 = 最小高 88 + 下外边距 8 = 96rpx = 48px：每行 (619 − 64 − 251) / 6 = 50.66px，低于加厚色带后的合并最小54px。
  // 再显示「回到今天」88rpx：每行只剩 43.33px，行高停在54px，记录入口移出首屏。
  const base = { viewportWidth: 375, viewportHeight: 619, navBarHeightPx: 64, density: 'compact', days: monthDays(6) }
  const plain = computeCalendarRowHeight(base)
  const retry = computeCalendarRowHeight({ ...base, showRefreshRetry: true })
  const retryAway = computeCalendarRowHeight({ ...base, showRefreshRetry: true, showBackToToday: true })

  assert.deepEqual([plain.heightPx, plain.infoMerged, plain.actionsFit], [58.66, true, true])
  assert.deepEqual([retry.heightPx, retry.infoMerged, retry.actionsFit], [54, true, false])
  assert.deepEqual([retryAway.heightPx, retryAway.contentMinPx, retryAway.actionsFit], [54, 54, false])
})

// issue #149：一次性配对欢迎条在吸顶占位之后的正常文档流里，显示时和「回到今天」一样占掉可用高度。
// 它是行高账本的显式输入：行高随之变矮但守 44px 下限，记录入口放不进首屏时如实报告。
test('the one-time partner welcome bar is an explicit input of the calendar row-height ledger', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  // 页高 = 手机高度 − 底栏；without / with 是不显示 / 显示欢迎条时的行高，fits 是显示时记录入口是否仍在首屏。
  // 放不下时行高停在内容最小高度（清爽合并108rpx与44px取大、完整 159rpx），记录入口靠滚动触达（issue #153）。
  const samples = [
    { width: 390, height: 761, nav: 91, density: 'compact', rows: 6, showBackToToday: false, without: 76.52, with: 67.57, fits: true },
    { width: 390, height: 761, nav: 91, density: 'full', rows: 5, showBackToToday: false, without: 83.2, with: 82.68, fits: false },
    { width: 375, height: 619, nav: 64, density: 'compact', rows: 6, showBackToToday: false, without: 58.66, with: 54, fits: false },
    { width: 375, height: 619, nav: 64, density: 'compact', rows: 6, showBackToToday: true, without: 54, with: 54, fits: false, plainFits: false },
    { width: 320, height: 520, nav: 64, density: 'compact', rows: 5, showBackToToday: false, without: 56.37, with: 47.57, fits: true },
    { width: 320, height: 520, nav: 64, density: 'compact', rows: 6, showBackToToday: false, without: 46.98, with: 46.08, fits: false }
  ]

  for (const sample of samples) {
    const key = `${sample.width}x${sample.height} ${sample.density} ${sample.rows} rows${sample.showBackToToday ? ' + back-today' : ''}`
    const input = {
      viewportWidth: sample.width,
      viewportHeight: sample.height,
      navBarHeightPx: sample.nav,
      density: sample.density,
      days: monthDays(sample.rows),
      showBackToToday: sample.showBackToToday
    }
    const plain = computeCalendarRowHeight(input)
    const welcomed = computeCalendarRowHeight({ ...input, showPartnerWelcome: true })

    assert.equal(plain.heightPx, sample.without, `${key} without the welcome`)
    assert.equal(plain.actionsFit, sample.plainFits ?? true, `${key} reports whether the record actions fit without the welcome`)
    assert.equal(welcomed.heightPx, sample.with, `${key} with the welcome`)
    assert.equal(welcomed.actionsFit, sample.fits, `${key} reports whether the record actions still fit`)
    assert.ok(welcomed.heightPx >= welcomed.contentMinPx, `${key} squeezes the cell below its content`)
    assert.ok(welcomed.heightPx >= 44, `${key} drops below the 44px floor`)
  }
})

// issue #149、#215：可点欢迎条挂在吸顶占位之后、日历之前的正常文档流里，固定的月份导航和状态行盖不住它；
// 文案按 750rpx 设计宽度静态核算为恰好两行；上下 padding 让整条盒高进入触控区和行高账本。
test('the clickable partner welcome copy fits two rpx lines and its box matches the ledger entry', () => {
  const { CALENDAR_LEDGER } = require('../utils/calendarRowHeight')
  const wxml = readRepo('pages/index/index.wxml')
  const welcome = /<view wx:if="\{\{partnerWelcome\}\}" class="partner-welcome"[^>]*bindtap="openLegendSheet"[^>]*>([^<]+)<\/view>/.exec(wxml)
  const spacerAt = wxml.indexOf('class="home-sticky-spacer')
  const calendarAt = wxml.indexOf('class="calendar-swipe"')
  assert.ok(welcome, 'expected the one-time clickable welcome text')
  assert.ok(
    spacerAt !== -1 && spacerAt < welcome.index && welcome.index < calendarAt,
    'welcome bar must sit after the sticky spacer and before the calendar, not under the fixed month nav'
  )

  const appTokens = readAppTokens()
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const bar = findDecls(rules, '.partner-welcome')
  assert.equal(bar.position, undefined, 'welcome bar stays in normal flow')
  assert.equal(bar['font-size'], 'var(--font-size-caption)')
  assert.equal(bar['line-height'], 'var(--line-height-body)')
  const margin = splitCssTokens(bar.margin)
  const padding = splitCssTokens(bar.padding)
  assert.deepEqual(margin, ['0'], 'the banner aligns with the calendar instead of adding 24rpx side insets')
  assert.equal(padding.length, 3, 'padding is top / horizontal / bottom')
  assert.equal(padding[1], '16rpx')
  const borderRpx = borderPx(bar) * 750 / 320
  assert.equal(bar.border, '1px solid rgba(232,144,158,0.2)')
  assert.equal(bar['border-radius'], 'var(--radius-card)')
  assert.equal(bar.background, 'linear-gradient(rgba(255,255,255,0.05), rgba(255,255,255,0.05)), var(--glass-fallback)')
  const fontRpx = fontSizeRpx(bar, appTokens)
  const lineHeight = Number(appTokens['--line-height-body'])

  // 文案恰好两行：CJK 与全角标点 1em；拉丁字母 0.5–0.7em、空格 0.25–0.5em、♥ 0.5–1em 取上下界。
  // 超长时缩短说明文字，caption 字号不变。
  const contentPadRpx = horizontalPaddingRpx(findDecls(rules, '.content'))[0]
  const copyWidth = 750 - 2 * contentPadRpx - 2 * narrowLengthRpx(padding[1]) - 2 * borderRpx
  const lineEm = copyWidth / fontRpx
  let minEm = 0
  let maxEm = 0
  for (const ch of welcome[1]) {
    if (/[　-鿿＀-￯]/.test(ch)) { minEm += 1; maxEm += 1 } else if (ch === ' ') { minEm += 0.25; maxEm += 0.5 } else if (/[A-Za-z]/.test(ch)) { minEm += 0.5; maxEm += 0.7 } else { minEm += 0.5; maxEm += 1 }
  }
  assert.ok(minEm > lineEm && maxEm <= 2 * lineEm, `welcome copy ${minEm}–${maxEm}em must wrap to exactly two ${lineEm.toFixed(2)}em lines`)

  const boxRpx = narrowLengthRpx(padding[0]) + 2 * fontRpx * lineHeight + narrowLengthRpx(padding[2]) + 2 * borderRpx
  assert.ok(Math.abs(boxRpx - 103.2) < 1e-9, `welcome box ${boxRpx}rpx includes its borders`)
  assert.ok(boxRpx * 320 / 750 >= 44, 'the whole welcome box remains a 44px touch target at 320px')
  assert.equal(CALENDAR_LEDGER.firstScreenRpx.partnerWelcome, 103.2, 'ledger entry must equal the rendered welcome box')
})

test('waiting invitation and creator welcome use the same calendar ledger slot without overlapping', async () => {
  const { computeCalendarRowHeight, CALENDAR_LEDGER } = require('../utils/calendarRowHeight')
  const app = createMiniProgram({
    storage: { roomCode: 'ROOM01', roomStatusSeen: 'waiting' },
    windowInfo: { windowWidth: 375, windowHeight: 619 }
  })
  try {
    const match = collection => ({ name: 'dataOp', data: { action: 'list', collection } })
    const periods = app.cloud.when(match('periods')).reply({ code: 0, data: [], roomStatus: 'waiting' })
    const memories = app.cloud.when(match('memories')).reply({ code: 0, data: [], roomStatus: 'waiting' })
    const home = app.launch('/pages/index/index')
    await app.settle()
    const waiting = app.rendered(home)
    assert.equal(waiting.partnerInvite, true)
    assert.equal(waiting.partnerWelcome, false)
    const expected = computeCalendarRowHeight({
      viewportWidth: 375,
      viewportHeight: 619,
      navBarHeightPx: waiting.navBarHeight,
      density: waiting.calendarDensity,
      days: waiting.days,
      showBackToToday: waiting.showBackToToday,
      showPartnerWelcome: true,
      showRefreshRetry: waiting.refreshRetryVisible
    })
    assert.equal(waiting.calendarRowHeightPx, expected.heightPx)

    periods.reply({ code: 0, data: [], roomStatus: 'paired' })
    memories.reply({ code: 0, data: [], roomStatus: 'paired' })
    app.hide()
    app.show()
    await app.settle()
    const welcomed = app.rendered(home)
    assert.equal(welcomed.partnerInvite, false)
    assert.equal(welcomed.partnerWelcome, true)
    assert.equal(welcomed.calendarRowHeightPx, waiting.calendarRowHeightPx)
    assert.equal(home.setDataCalls.some(patch => patch.partnerInvite && patch.partnerWelcome), false)
    assert.equal(CALENDAR_LEDGER.firstScreenRpx.partnerInvite, undefined, 'the invitation reuses partnerWelcome instead of adding a second ledger item')

    const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
    const invite = findDecls(rules, '.partner-invite')
    const welcome = findDecls(rules, '.partner-welcome')
    for (const prop of ['box-sizing', 'margin', 'padding', 'font-size', 'line-height']) {
      assert.equal(invite[prop], welcome[prop], `shared slot ${prop}`)
    }
    const share = findDecls(rules, 'button.home-share-invite')
    const shareHeight = rpxNumber(share, 'min-height')
    assert.equal(shareHeight, 88, 'the invite action keeps the ticket-required 88rpx touch height')
    assert.equal(invite['align-items'], 'center')
    assert.equal(share['border-radius'], 'var(--radius-full)')
    assert.equal(share.background, 'rgba(232,144,158,0.1)')
    const appTokens = readAppTokens()
    const fontRpx = fontSizeRpx(invite, appTokens)
    const lineHeight = Number(appTokens['--line-height-body'])
    const invitePadding = splitCssTokens(invite.padding)
    const shareMargin = splitCssTokens(share.margin).map(narrowLengthRpx)
    const inviteBorderRpx = borderPx(invite) * 750 / 320
    const slotHeight = narrowLengthRpx(invitePadding[0]) + narrowLengthRpx(invitePadding[2]) + Math.max(
      2 * fontRpx * lineHeight,
      shareHeight + shareMargin[0] + shareMargin[2]
    ) + 2 * inviteBorderRpx
    assert.ok(Math.abs(slotHeight - CALENDAR_LEDGER.firstScreenRpx.partnerWelcome) < 1e-9,
      `padding, 88rpx button, negative margins and borders must absorb into ${CALENDAR_LEDGER.firstScreenRpx.partnerWelcome}rpx`)

    for (const selector of ['.partner-invite-title', '.partner-invite-desc']) {
      const copyRules = findDecls(rules, selector)
      assert.equal(copyRules['white-space'], 'nowrap')
      assert.equal(copyRules.overflow, 'hidden')
      assert.equal(copyRules['text-overflow'], 'ellipsis')
    }
    const contentPadRpx = horizontalPaddingRpx(findDecls(rules, '.content'))[0]
    const shareTextWidth = 3 * fontRpx + 2 * parseFloat(horizontalPaddingTokens(share)[0]) + 2 * borderPx(share) * 750 / 320
    const shareWidth = Math.max(rpxNumber(share, 'min-width'), shareTextWidth)
    const copyWidth = 750 - 2 * contentPadRpx - 2 * narrowLengthRpx(invitePadding[1]) - 2 * inviteBorderRpx - shareWidth - shareMargin[3]
    for (const copy of ['TA 还没加入', '发个邀请，TA 加入后你们看的是同一本日历']) {
      let maxEm = 0
      for (const ch of copy) {
        if (/[　-鿿＀-￯]/.test(ch)) maxEm += 1
        else if (ch === ' ') maxEm += 0.5
        else if (/[A-Za-z]/.test(ch)) maxEm += 0.7
        else maxEm += 1
      }
      assert.ok(maxEm * fontRpx <= copyWidth, `「${copy}」 exceeds its single-line copy column at 320px`)
    }
  } finally { app.teardown() }
})

// issue #149：绑定页幽灵「进入应用」是内容宽胶囊，高度 = 上下 px 内边距 + 一行字 + 描边，320px 宽下仍 ≥44px
test('bind ghost enter-app button keeps a 44px touch height at 320px', () => {
  const appTokens = readAppTokens()
  const ghost = findDecls(parseWxssRules(readRepo('pages/bind/bind.wxss')), '.btn-ghost')
  const verticalPadPx = /^(\d+(?:\.\d+)?)px$/.exec(splitCssTokens(ghost.padding)[0])
  assert.ok(verticalPadPx, 'ghost vertical padding stays in px so it does not shrink with the viewport')
  const lineHeightToken = /^var\((--line-height-[a-z]+)\)$/.exec(ghost['line-height'])
  assert.ok(lineHeightToken, 'ghost line-height uses a line-height token')
  const fontPx = fontSizeRpx(ghost, appTokens) * 320 / 750
  const borderPx = parseFloat(ghost.border)
  const heightPx = 2 * Number(verticalPadPx[1]) + fontPx * Number(appTokens[lineHeightToken[1]]) + 2 * borderPx
  assert.ok(heightPx >= 44, `ghost button is ${heightPx.toFixed(2)}px tall at 320px`)
})

test('leftmost and rightmost calendar columns keep their content off the grid border', () => {
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const grid = findDecls(rules, '.calendar-grid')
  const week = findDecls(rules, '.week-header')
  const cell = findDecls(rules, '.day-cell')
  const content = findDecls(rules, '.content')

  assert.deepEqual(horizontalPaddingTokens(grid), ['10rpx'])
  assert.deepEqual(horizontalPaddingTokens(week), ['10rpx'])

  const widthPct = Number(/(\d+(?:\.\d+)?)%/.exec(cell.width)[1])
  const contentPadRpx = horizontalPaddingRpx(content)[0]
  const gridBorderPx = Number(/(\d+(?:\.\d+)?)px/.exec(grid.border)[1])
  const gridPadRpx = 10
  for (const viewportPx of [320, 375, 390]) {
    const gridInnerPx = viewportPx
      - (2 * contentPadRpx * viewportPx) / 750
      - 2 * gridBorderPx
      - (2 * gridPadRpx * viewportPx) / 750
    const columnPx = (gridInnerPx * widthPct) / 100
    assert.ok(columnPx >= 40, `inset day column ${columnPx.toFixed(2)}px is under 40px at ${viewportPx}px`)
  }
})

test('calendar cell content stacks fit inside the cell at both densities (date stays readable)', () => {
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const cell = findDecls(rules, '.day-cell')
  const compactCell = findDecls(rules, '.calendar-density-compact .day-cell')

  const dayNum = findDecls(rules, '.day-num')
  const lunar = findDecls(rules, '.day-lunar')
  const tagLine = findDecls(rules, '.day-tag-line')
  const marks = findDecls(rules, '.day-marks')
  const compactNum = findDecls(rules, '.calendar-density-compact .day-num')
  const compactTagLine = findDecls(rules, '.calendar-density-compact .day-tag-line')
  const compactMarks = findDecls(rules, '.calendar-density-compact .day-marks')

  const line = decls => rpxNumber(decls, 'line-height') || 0
  const box = decls => (rpxNumber(decls, 'height') || 0) + (rpxNumber(decls, 'margin-top') || 0)

  const fullStack = line(dayNum) + box(lunar) + box(tagLine) + box(marks)
  const fullRoom = rpxNumber(cell, 'height') - verticalPaddingRpx(cell)
  assert.ok(fullStack <= fullRoom, `full density stack ${fullStack}rpx exceeds cell room ${fullRoom}rpx`)

  // 清爽密度（issue #72）同样堆叠 节日/调休标签行：日期 + 标签 + 标记都必须放进格子
  const compactStack = line(compactNum) + box(compactTagLine) + box(compactMarks)
  const compactRoom = rpxNumber(compactCell, 'height') - verticalPaddingRpx(compactCell)
  assert.ok(compactStack <= compactRoom, `compact density stack ${compactStack}rpx exceeds cell room ${compactRoom}rpx`)
})

test('sheets scroll within a bounded height and are never clipped by the mask', () => {
  const wxml = readRepo('pages/index/index.wxml')
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const daySheet = findDecls(rules, '.day-action-sheet')
  const jumpSheet = { ...daySheet, ...findDecls(rules, '.calendar-jump-sheet') }
  const infoPanel = findDecls(rules, '.calendar-info-panel')
  const mask = findDecls(rules, '.day-sheet-mask')
  const body = findDecls(parseWxssRules(readRepo('app.wxss')), '.sheet-body')

  // 月份跳转与日操作 sheet：圆角外框裁切，内层内容块承担滚动。
  for (const [name, decls] of [['.calendar-jump-sheet', jumpSheet], ['.day-action-sheet', daySheet]]) {
    const maxVh = Number(/(\d+(?:\.\d+)?)vh/.exec(decls['max-height'] || '0')[1])
    assert.ok(maxVh > 0 && maxVh < 100, `${name} needs a sub-viewport max-height`)
    assert.equal(decls.overflow, 'hidden', `${name} clips its rounded outer frame`)
  }
  assert.equal(body['overflow-y'], 'auto', 'the shared body scrolls long sheet content')
  assert.equal(body['min-height'], '0')

  // 图例/预测/月小结面板复用 .day-action-sheet 的外框裁切与 .sheet-body 内层滚动，自身只收紧高度
  const infoVh = Number(/(\d+(?:\.\d+)?)vh/.exec(infoPanel['max-height'] || '0')[1])
  assert.ok(infoVh > 0 && infoVh < 100, '.calendar-info-panel needs a sub-viewport max-height')
  assert.match(wxml, /class="day-action-sheet calendar-info-panel"/)
  assert.doesNotMatch(wxml, /class="[^"]*\bsafe-bottom\b/, 'home sheets use their own safe-area padding, not the overridden global class')

  // 父级不裁切：遮罩全屏 flex-end，无 overflow 裁切；页面入场只淡入（transform 会把 fixed 弹层拖进裁剪域）
  assert.ok(!/overflow\s*:\s*hidden/.test(mask.overflow || ''), 'sheet mask must not clip the sheet')
  const pageEnter = /@keyframes fadeIn\s*\{([\s\S]*?)\n\}/.exec(readRepo('app.wxss'))
  assert.ok(pageEnter, 'expected the shared fadeIn keyframes used by pageEnter')
  assert.doesNotMatch(pageEnter[1], /transform/)
})

// issue #154 / #235：设置「使用说明」直接复用共享面板与宿主的滚动边界，
// 字号放大或文案变长时标题行的关闭键不被顶出屏幕。
test('the settings help sheet scrolls within the bottom-sheet height band so its close stays on screen', () => {
  const rules = parseWxssRules(readRepo('pages/settings/settings.wxss'))
  const sheet = findDecls(rules, '.day-action-sheet')
  const maxVh = /^(\d+(?:\.\d+)?)vh$/.exec(sheet['max-height'] || '')
  assert.ok(maxVh, 'the shared help sheet needs a viewport-relative max-height')
  assert.ok(Number(maxVh[1]) >= 82 && Number(maxVh[1]) <= 86, `shared help max-height ${maxVh[1]}vh is outside 82–86vh`)
  assert.equal(sheet.overflow, 'hidden', 'the shared outer frame crops content at its rounded corners')
  const body = findDecls(parseWxssRules(readRepo('app.wxss')), '.sheet-body')
  assert.equal(body['overflow-y'], 'auto', 'the shared inner body scrolls while the close stays in the fixed title row')
  assert.equal(body.flex, '1')
  for (const host of ['.sheet-host', '.sheet-slide']) {
    assert.doesNotMatch(findDecls(rules, host).overflow || '', /hidden/, `${host} must not clip the sheet`)
  }
})

test('both edit pages reserve one-save fixed-bar geometry with an opaque navy gradient and safe area', () => {
  const appTokens = readAppTokens()
  const buttonHeight = tokenRpx('var(--font-size-body)', appTokens) * Number(appTokens['--line-height-assist']) + 26 * 2
  const pxToRpx = px => px * 750 / 320
  const barHeight = 20 + buttonHeight + 24 + pxToRpx(1)
  assert.ok(barHeight <= 144 && 144 - barHeight < 16, `single-save reserve 144rpx covers ${barHeight}rpx`)

  for (const kind of ['period', 'memory']) {
    const raw = readRawRepo(`pages/${kind}/edit/edit.wxml`)
    assert.match(raw, /actionsClass: 'record-actions-fixed'/)
    if (kind === 'period') assert.match(raw, /actionsHidden: noteFocused/)
    else assert.doesNotMatch(raw, /actionsHidden:/, 'memory keeps its fixed save visible while the note is focused')
    assert.doesNotMatch(raw, /has-fixed-edit-actions/, `${kind} uses the same create and edit reserve`)

    const rules = parseWxssRules(readRepo(`pages/${kind}/edit/edit.wxss`))
    const fixed = findDecls(rules, '.record-actions-fixed')
    assert.equal(fixed.position, 'fixed')
    assert.equal(fixed.left, '0')
    assert.equal(fixed.right, '0')
    assert.equal(fixed.bottom, '0')
    assert.ok(Number(fixed['z-index']) < 60, 'fixed actions stay below the shared bottom sheets')
    assert.equal(fixed.background, 'linear-gradient(180deg, rgba(10,14,39,0.96) 0%, var(--aurora-bg) 48rpx, var(--aurora-bg) 100%)')
    assert.equal(fixed['box-shadow'], 'inset 0 1px 0 rgba(255,255,255,0.08), 0 -12rpx 32rpx rgba(5,8,22,0.55)')
    assert.match(fixed.padding, /var\(--safe-bottom,\s*env\(safe-area-inset-bottom/)
    assert.equal(findDecls(rules, '.record-actions-fixed .btns')['margin-top'], '0')
    assert.equal(findDecls(rules, '.record-actions-fixed.record-actions-hidden').display, 'none')

    const content = findDecls(rules, '.content')
    assert.match(content.padding, /calc\(144rpx \+ var\(--safe-bottom,\s*env\(safe-area-inset-bottom/)
  }
})

test('draft and start-date-owner hints share a compact rose micro notice with compensated 88rpx actions', () => {
  for (const kind of ['period', 'memory']) {
    const raw = readRawRepo(`pages/${kind}/edit/edit.wxml`)
    assert.match(raw, /class="draft-notice micro-notice"/)
    assert.match(raw, /class="micro-notice-text">\{\{draftNoticeText\}\}/)

    const rules = parseWxssRules(readRepo(`pages/${kind}/edit/edit.wxss`))
    const notice = findDecls(rules, '.micro-notice')
    assert.equal(notice.display, 'flex')
    assert.equal(notice['align-items'], 'center')
    assert.equal(notice['justify-content'], 'space-between')
    assert.equal(notice.padding, '16rpx 24rpx')
    assert.equal(notice.background, 'rgba(232,144,158,0.08)')
    assert.equal(notice.border, '1px solid rgba(232,144,158,0.24)')
    assert.equal(notice['border-radius'], 'var(--radius-md)')
    const action = findDecls(rules, '.micro-notice-action')
    assert.equal(action['min-height'], '88rpx')
    assert.equal(action.padding, '16rpx')
    assert.equal(action.margin, '-16rpx')
  }
  const periodRaw = readRawRepo('pages/period/edit/edit.wxml')
  assert.match(periodRaw, /class="form-hint start-date-owner micro-notice"/)
  assert.match(periodRaw, /class="micro-notice-text">\{\{startDateOwnerText\}\}/)
})

test('sheets bottom padding carries the runtime bottom safe-area inset', () => {
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  for (const selector of ['.calendar-jump-sheet', '.day-action-sheet']) {
    const decls = findDecls(rules, selector)
    const paddingBottom = `${decls.padding || ''};${decls['padding-bottom'] || ''}`
    assert.match(
      paddingBottom,
      /var\(--safe-bottom,\s*env\(safe-area-inset-bottom/,
      `${selector} bottom padding must add var(--safe-bottom) with env() fallback`
    )
  }
})

test('safeArea exposes a runtime bottom inset with the same query discipline as the top inset', () => {
  const safeAreaPath = path.join(repoRoot, 'utils/safeArea.js')

  function loadFresh(wxMock) {
    delete require.cache[require.resolve(safeAreaPath)]
    const originalWx = global.wx
    global.wx = wxMock
    const loaded = require(safeAreaPath)
    return {
      safeArea: loaded,
      restore() {
        delete require.cache[require.resolve(safeAreaPath)]
        if (originalWx === undefined) delete global.wx
        else global.wx = originalWx
      }
    }
  }

  // 主路径：wx.getWindowInfo() 的 safeArea（home 指示条/手势条 = screenHeight − safeArea.bottom）
  let env = loadFresh({
    getWindowInfo: () => ({ screenHeight: 800, safeArea: { top: 20, bottom: 766, left: 0, right: 375 } }),
    getSystemInfoSync: () => ({ statusBarHeight: 20 })
  })
  try {
    assert.equal(env.safeArea.getSafeBottom(), 34)
    assert.equal(env.safeArea.getSafeTop(), 20)
  } finally {
    env.restore()
  }

  // 旧接口回退：getSystemInfoSync 的 safeArea
  env = loadFresh({ getSystemInfoSync: () => ({ screenHeight: 700, safeArea: { bottom: 680 } }) })
  try {
    assert.equal(env.safeArea.getSafeBottom(), 20)
  } finally {
    env.restore()
  }

  // 无安全区信息 / 底部无插入：返回 0，不制造无意义底部空白
  env = loadFresh({ getWindowInfo: () => ({ statusBarHeight: 24 }), getSystemInfoSync: () => ({}) })
  try {
    assert.equal(env.safeArea.getSafeBottom(), 0)
  } finally {
    env.restore()
  }
  env = loadFresh({ getWindowInfo: () => ({ screenHeight: 800, safeArea: { bottom: 800 } }) })
  try {
    assert.equal(env.safeArea.getSafeBottom(), 0)
  } finally {
    env.restore()
  }

  // 查询异常：兜底 0；顶部兜底保持 44（既有行为不回退）
  env = loadFresh({
    getWindowInfo: () => { throw new Error('denied') },
    getSystemInfoSync: () => { throw new Error('denied') }
  })
  try {
    assert.equal(env.safeArea.getSafeBottom(), 0)
    assert.equal(env.safeArea.getSafeTop(), 44)
  } finally {
    env.restore()
  }
})

test('safeArea balances the navbar title against the capsule and each actual left slot', () => {
  for (const { width, statusBarHeight, capsuleLeft, capsuleRight } of [
    { width: 320, statusBarHeight: 20, capsuleLeft: 226, capsuleRight: 313 },
    { width: 390, statusBarHeight: 47, capsuleLeft: 287, capsuleRight: 383 },
    { width: 430, statusBarHeight: 47, capsuleLeft: 327, capsuleRight: 423 }
  ]) {
    const env = loadSafeArea({
      getWindowInfo: () => ({ windowWidth: width, statusBarHeight }),
      getMenuButtonBoundingClientRect: () => ({
        width: capsuleRight - capsuleLeft,
        height: 32,
        top: statusBarHeight + 4,
        right: capsuleRight,
        bottom: statusBarHeight + 36,
        left: capsuleLeft
      })
    })
    try {
      const leftSlots = {
        home: (30 + 96) * width / 750 + 2,
        back: (30 + 88) * width / 750,
        placeholder: 30 * width / 750
      }
      for (const [variant, leftSlot] of Object.entries(leftSlots)) {
        const padding = env.safeArea.getNavTitlePadding(variant)
        const rightSlot = env.safeArea.getCapsuleRightInset()
        const compensation = rightSlot - leftSlot
        assert.ok(Math.abs(padding.navTitlePaddingLeft - Math.max(0, compensation)) < 1e-9, `${variant} left compensation at ${width}px`)
        assert.ok(Math.abs(padding.navTitlePaddingRight - Math.max(0, -compensation)) < 1e-9, `${variant} right compensation at ${width}px`)
        const contentCenter = (leftSlot + padding.navTitlePaddingLeft + width - rightSlot - padding.navTitlePaddingRight) / 2
        assert.ok(Math.abs(contentCenter - width / 2) < 1e-9, `${variant} title center at ${width}px`)
      }
    } finally {
      env.restore()
    }
  }
})

test('navbar height lines up with the capsule rect and reserves its right-hand slot at 375px', () => {
  const safeAreaPath = path.join(repoRoot, 'utils/safeArea.js')
  delete require.cache[require.resolve(safeAreaPath)]
  const originalWx = global.wx
  global.wx = {
    getWindowInfo: () => ({
      windowWidth: 375,
      statusBarHeight: 44,
      screenHeight: 812,
      safeArea: { top: 44, bottom: 778, left: 0, right: 375 }
    }),
    getMenuButtonBoundingClientRect: () => ({
      width: 87,
      height: 32,
      top: 48,
      right: 368,
      bottom: 80,
      left: 281
    })
  }
  try {
    const safeArea = require(safeAreaPath)
    // 状态栏 44 + 胶囊上间隙 4 的两倍 + 胶囊高 32 = 84，底边与胶囊底对齐
    assert.equal(safeArea.getNavBarHeight(), 84)
    // 右侧占位是胶囊左缘到屏幕右缘，按钮不会钻进胶囊
    assert.equal(safeArea.getCapsuleRightInset(), 94)
    assert.deepEqual(safeArea.getCapsuleRect(), {
      width: 87,
      height: 32,
      top: 48,
      right: 368,
      bottom: 80,
      left: 281
    })
  } finally {
    delete require.cache[require.resolve(safeAreaPath)]
    if (originalWx === undefined) delete global.wx
    else global.wx = originalWx
  }
})

test('navbar height lines up with the capsule rect at 320px and 390px', () => {
  // 320：状态栏 20，胶囊顶 24、高 32、左 226 → 顶栏 60，右侧占位 94
  const narrow = loadSafeArea({
    getWindowInfo: () => ({ windowWidth: 320, statusBarHeight: 20 }),
    getMenuButtonBoundingClientRect: () => ({
      width: 87, height: 32, top: 24, right: 313, bottom: 56, left: 226
    })
  })
  try {
    assert.equal(narrow.safeArea.getNavBarHeight(), 60)
    assert.equal(narrow.safeArea.getCapsuleRightInset(), 94)
  } finally {
    narrow.restore()
  }

  // 390：状态栏 47，胶囊顶 53、高 32、左 287 → 顶栏 91，右侧占位 103
  const wide = loadSafeArea({
    getWindowInfo: () => ({ windowWidth: 390, statusBarHeight: 47 }),
    getMenuButtonBoundingClientRect: () => ({
      width: 96, height: 32, top: 53, right: 383, bottom: 85, left: 287
    })
  })
  try {
    assert.equal(wide.safeArea.getNavBarHeight(), 91)
    assert.equal(wide.safeArea.getCapsuleRightInset(), 103)
  } finally {
    wide.restore()
  }
})

test('a missing capsule rect falls back without dropping the navbar slot', () => {
  const denied = loadSafeArea({
    getWindowInfo: () => { throw new Error('denied') },
    getSystemInfoSync: () => { throw new Error('denied') }
  })
  try {
    // 状态栏兜底 44；胶囊高 32，距状态栏 4，右缘距屏幕 7，宽 87，窗口宽兜底 375
    assert.deepEqual(denied.safeArea.getCapsuleRect(), {
      width: 87,
      height: 32,
      top: 48,
      right: 368,
      bottom: 80,
      left: 281
    })
    assert.equal(denied.safeArea.getNavBarHeight(), 84)
    assert.equal(denied.safeArea.getCapsuleRightInset(), 94)
  } finally {
    denied.restore()
  }

  const zeroRect = loadSafeArea({
    getWindowInfo: () => ({ windowWidth: 320, statusBarHeight: 20 }),
    getMenuButtonBoundingClientRect: () => ({ width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 })
  })
  try {
    assert.deepEqual(zeroRect.safeArea.getCapsuleRect(), {
      width: 87,
      height: 32,
      top: 24,
      right: 313,
      bottom: 56,
      left: 226
    })
    assert.equal(zeroRect.safeArea.getNavBarHeight(), 60)
    assert.equal(zeroRect.safeArea.getCapsuleRightInset(), 94)
  } finally {
    zeroRect.restore()
  }
})

function loadSafeArea(wxMock) {
  const safeAreaPath = path.join(repoRoot, 'utils/safeArea.js')
  delete require.cache[require.resolve(safeAreaPath)]
  const originalWx = global.wx
  global.wx = wxMock
  const loaded = require(safeAreaPath)
  return {
    safeArea: loaded,
    restore() {
      delete require.cache[require.resolve(safeAreaPath)]
      if (originalWx === undefined) delete global.wx
      else global.wx = originalWx
    }
  }
}

test('shared navbar is fixed, reserves the capsule, and content starts at the bar bottom', () => {
  const sharedTemplate = readRawRepo('pages/shared/nav-bar.wxml')
  assert.match(sharedTemplate, /<template name="sharedNavbar">/)
  assert.match(sharedTemplate, /wx:if="\{\{variant === 'home'\}\}" class="nav-tool"[^>]*bindtap="openLegendSheet"/)
  assert.match(sharedTemplate, /wx:elif="\{\{variant === 'back'\}\}" class="nav-back"[^>]*bindtap="goBack"/)
  assert.match(sharedTemplate, /wx:else class="nav-placeholder"/)
  assert.match(sharedTemplate, /wx:elif="\{\{title\}\}" class="nav-title">\{\{title\}\}<\/view>/)
  assert.match(readRawRepo('app.wxss'), /@import '\.\/pages\/shared\/nav-bar\.wxss';/)

  const expectedWiring = new Map([
    ['pages/bind/bind', ['immersive', "title: ''"]],
    ['pages/index/index', ['home', "title: '美少女的日历'"]],
    ['pages/memory/memory', ['placeholder', "title: '欢乐时光'"]],
    ['pages/memory/edit/edit', ['back', 'title: pageTitle']],
    ['pages/period/period', ['placeholder', "title: '记录'"]],
    ['pages/period/edit/edit', ['back', 'title: pageTitle']],
    ['pages/settings/settings', ['placeholder', "title: '设置'"]]
  ])
  assert.deepEqual([...expectedWiring.keys()].sort(), [...ALL_PAGES].sort())

  const rules = parseWxssRules(readRepo('app.wxss'))
  const nav = findDecls(rules, '.nav-bar')
  const safeTop = findDecls(rules, '.safe-top')
  const header = findDecls(rules, '.header-gradient')

  assert.equal(nav.position, 'fixed')
  assert.equal(nav.top, '0')
  assert.equal(nav.left, '0')
  assert.equal(nav.right, '0')
  assert.equal(nav['box-sizing'], 'border-box')
  assert.match(nav.height, /var\(--nav-bar-height/)
  assert.match(nav['padding-top'], /var\(--safe-top/)
  assert.match(nav['padding-right'], /var\(--capsule-right/)
  assert.notEqual(header.position, 'relative', 'header gradient must not return the navbar to document flow')

  // 内容区起点用同一顶栏高度，因此不会高于顶栏底边
  assert.match(safeTop['padding-top'], /var\(--nav-bar-height/)

  for (const pagePath of ALL_PAGES) {
    const raw = readRawRepo(`${pagePath}.wxml`)
    assert.equal(raw.split('<import src="/pages/shared/nav-bar.wxml" />').length - 1, 1, `${pagePath} imports the one navbar template`)
    const calls = [...raw.matchAll(/<template is="sharedNavbar" data="\{\{([\s\S]*?)\}\}" \/>/g)]
    assert.equal(calls.length, 1, `${pagePath} instantiates the navbar once`)
    const [variant, title] = expectedWiring.get(pagePath)
    assert.ok(calls[0][1].includes(`variant: '${variant}'`), `${pagePath} uses the ${variant} left variant`)
    assert.ok(calls[0][1].includes(title), `${pagePath} passes its title binding`)

    const wxml = readRepo(`${pagePath}.wxml`)
    assert.match(wxml, /class="[^"]*\bnav-bar\b/, `${pagePath} must use the shared navbar`)
    assert.match(wxml, /--nav-bar-height:\s*\{\{navBarHeight\}\}px/, `${pagePath} must inject navbar height`)
    assert.match(wxml, /--capsule-right:\s*\{\{capsuleRight\}\}px/, `${pagePath} must inject the capsule slot`)
  }

  const design = readRepo('DESIGN.md')
  const geometry = design.slice(design.indexOf('窄屏几何与安全区'), design.indexOf('阴影登记'))
  assert.match(geometry, /共享顶栏/)
  assert.match(geometry, /胶囊/)
})

test('bind immersive navbar preserves the safe-area slot without background, hairline, or floating orbs', () => {
  const sharedTemplate = readRawRepo('pages/shared/nav-bar.wxml')
  assert.match(sharedTemplate, /class="nav-bar header-gradient\{\{variant === 'immersive' \? ' nav-bar-immersive' : ''\}\}"/)
  assert.match(readRawRepo('pages/bind/bind.wxml'), /<template is="sharedNavbar" data="\{\{variant: 'immersive', title: '', pageObscured: pageObscured\}\}" \/>/)

  const rules = parseWxssRules(readRepo('app.wxss'))
  const immersive = findDecls(rules, '.header-gradient.nav-bar-immersive')
  assert.equal(immersive.background, 'transparent')
  assert.equal(immersive['border-bottom'], '0')
  assert.equal(immersive['backdrop-filter'], 'none')
  assert.equal(immersive['-webkit-backdrop-filter'], 'none')
  for (const property of ['height', 'padding-top', 'padding-right', 'position']) {
    assert.equal(immersive[property], undefined, `${property} stays on the shared safe-area geometry rule`)
  }
  const orbs = rules.find(rule => rule.selectors.includes('.header-gradient.nav-bar-immersive::before') && rule.selectors.includes('.header-gradient.nav-bar-immersive::after'))
  assert.ok(orbs, 'both immersive header pseudos are explicitly suppressed')
  assert.equal(orbs.decls.display, 'none')

  const nav = findDecls(rules, '.nav-bar')
  const safeTop = findDecls(rules, '.safe-top')
  assert.match(nav.height, /var\(--nav-bar-height/)
  assert.match(nav['padding-top'], /var\(--safe-top/)
  assert.match(nav['padding-right'], /var\(--capsule-right/)
  assert.equal(safeTop['padding-top'], nav.height)
})

test('edit navbars keep an 88rpx back hit slot around a 64rpx light-glass circle and 36rpx icon', () => {
  const sharedTemplate = readRawRepo('pages/shared/nav-bar.wxml')
  assert.match(sharedTemplate, /<view class="nav-back-surface"><\/view>\s*<view class="ui-icon ui-icon-left ui-icon-36 ui-icon-circle nav-back-icon" aria-hidden="true"><\/view>/)

  const rules = parseWxssRules(readRepo('app.wxss'))
  const hitSlot = findDecls(rules, '.nav-back')
  assert.ok(rpxNumber(hitSlot, 'width') >= 88)
  assert.ok(rpxNumber(hitSlot, 'height') >= 88)
  assert.ok(!hitSlot.background || hitSlot.background === 'transparent')

  const surface = findDecls(rules, '.nav-back-surface')
  for (const edge of ['top', 'right', 'bottom', 'left']) assert.equal(surface[edge], '12rpx')
  assert.equal(surface['border-radius'], 'var(--radius-full)')
  assert.equal(surface.background, 'var(--glass-bg)')
  assert.equal(surface.border, '1px solid rgba(255,255,255,0.28)')
  assert.equal(surface['box-shadow'], undefined)

  const icon = findDecls(rules, '.ui-icon-36')
  assert.equal(icon.width, '36rpx')
  assert.equal(icon.height, '36rpx')
  for (const [viewport, navContentHeight] of [[320, 40], [375, 44], [430, 44]]) {
    const surfaceHeight = (88 - 24) * viewport / 750
    assert.ok(surfaceHeight < navContentHeight, `${viewport}px: ${surfaceHeight}px back surface must fit the ${navContentHeight}px navbar content row`)
  }
})

// 同步胶囊（issue #120 进出、#151 单集合失败）住在首页顶栏的标题槽里，挂载期间替换应用标题。
// 顶栏整条在吸顶区之上，胶囊因此盖不住月份标题和状态行；每条胶囊文案在 320px 宽（胶囊右侧占位 94px）的标题槽里单行完整显示
test('the sync pill takes the navbar title slot, clear of the sticky month title, and every status fits it at 320px', async () => {
  const wxml = readRepo('pages/index/index.wxml')
  const navStart = wxml.indexOf('class="nav-bar header-gradient')
  const navEnd = wxml.indexOf('<view wx:if="{{noRoom}}"', navStart)
  assert.ok(navStart !== -1 && navEnd !== -1, 'expected the home navbar ahead of the page states')
  assert.match(
    wxml.slice(navStart, navEnd),
    /<view wx:if="\{\{syncStatusMounted\}\}" class="sync-pill [^"]*"[\s\S]*?<\/view>\s*<view wx:elif="\{\{title\}\}" class="nav-title">\{\{title\}\}<\/view>/,
    'the mounted pill replaces the app title in the navbar'
  )
  assert.equal(wxml.split('class="sync-pill').length, 2, 'the navbar holds the only sync pill')

  const appRules = parseWxssRules(readRepo('app.wxss'))
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const pill = findDecls(rules, '.sync-pill')
  for (const prop of ['position', 'top', 'left', 'width', 'z-index']) {
    assert.equal(pill[prop], undefined, `.sync-pill ${prop} lifts the pill out of the navbar slot`)
  }
  // 顶栏底边就是吸顶区顶边：标题槽里的胶囊与月份导航、状态行不重叠；胶囊不高于 32px 的微信胶囊，留在导航行里
  assert.match(findDecls(appRules, '.nav-bar').height, /^var\(--nav-bar-height\b/)
  assert.match(findDecls(rules, '.home-sticky').top, /^var\(--nav-bar-height\b/)
  for (const viewportPx of [320, 375, 390, 430]) {
    assert.ok(rpxNumber(pill, 'min-height') * viewportPx / 750 <= 32, `the pill outgrows the navbar row at ${viewportPx}px`)
  }

  // 标题槽 = 视口 − 顶栏左内边距 − 图例实际槽宽 − 胶囊占位；图例槽取 88rpx 热区与内层表面 intrinsic width 的较大值。
  const pxToRpx = px => px * 750 / 320
  const navTool = findDecls(appRules, '.nav-tool')
  const navToolSurface = findDecls(appRules, '.nav-tool-surface')
  const legendSurfaceRpx = Array.from('图例').length * fontSizeRpx(navTool) +
    horizontalPaddingRpx(navToolSurface).reduce((sum, value) => sum + value, 0) +
    2 * pxToRpx(borderPx(navToolSurface))
  const toolSlotRpx = Math.max(rpxNumber(navTool, 'min-width'), legendSurfaceRpx)
  const slotRpx = 750 - rpxNumber(findDecls(appRules, '.nav-bar'), 'padding-left') - toolSlotRpx - pxToRpx(94)
  // 同步胶囊 = 左右内边距 + 描边 + 圆点 + 间距 + 文案（caption，每字 1em）。
  const chromeRpx = 2 * parseFloat(horizontalPaddingTokens(pill)[0]) + 2 * pxToRpx(borderPx(pill)) +
    rpxNumber(findDecls(rules, '.sync-dot'), 'width') + rpxNumber(pill, 'gap')
  const syncText = findDecls(rules, '.sync-text')
  assert.equal(syncText['font-size'], 'var(--font-size-caption)')
  const captionRpx = fontSizeRpx(syncText)
  const { statuses } = await homeFeedbackCopy()
  assert.equal(statuses.size, 8, `expected every rendered sync status, found ${[...statuses].join(' / ')}`)
  for (const status of statuses) {
    const widthRpx = chromeRpx + Array.from(status).length * captionRpx
    assert.ok(widthRpx <= slotRpx, `「${status}」 needs ${widthRpx.toFixed(1)}rpx, more than the ${slotRpx.toFixed(1)}rpx title slot at 320px`)
  }
})

test('every page root injects --safe-bottom alongside --safe-top from runtime data', () => {
  for (const pagePath of ALL_PAGES) {
    const wxml = readRepo(`${pagePath}.wxml`)
    assert.match(wxml, /--safe-top:\s*\{\{safeTop\}\}px; --safe-bottom:\s*\{\{safeBottom\}\}px/, `${pagePath}.wxml root style must inject both safe-area vars`)
  }
})

test('registered pages render platform safe areas, navbar height and capsule clearance', async () => {
  for (const pagePath of ALL_PAGES) {
    const app = createMiniProgram({ storage: { roomCode: 'ROOM01' }, windowInfo: { screenHeight: 812, statusBarHeight: 44, safeArea: { top: 44, bottom: 778 } } })
    try {
      app.failNavigation('switchTab') // keep bind and the compatibility route visible
      app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
      app.cloud.when({ name: 'dataOp', data: { action: 'list' } }).reply({ code: 0, data: [] })
      const page = app.launch('/' + pagePath)
      await app.settle()
      const root = wxmlOpeningTags(readRepo(`${pagePath}.wxml`)).find(tag => tag.classes.includes('page'))
      const style = renderWxmlAttribute(root.attrs.style, app.rendered(page))
      assert.match(style, /--safe-top: 44px/, pagePath)
      assert.match(style, /--safe-bottom: 34px/, pagePath)
      assert.match(style, /--nav-bar-height: 84px/, pagePath)
      assert.match(style, /--capsule-right: 97px/, pagePath)
    } finally { app.teardown() }
  }
})

test('all seven pages inject regular-title compensation while the sync pill stays uncompressed', async () => {
  const expectedLeftPadding = new Map([
    ['pages/bind/bind', 82],
    ['pages/index/index', 32],
    ['pages/memory/memory', 82],
    ['pages/memory/edit/edit', 38],
    ['pages/period/period', 82],
    ['pages/period/edit/edit', 38],
    ['pages/settings/settings', 82]
  ])
  assert.deepEqual([...expectedLeftPadding.keys()].sort(), [...ALL_PAGES].sort())

  for (const pagePath of ALL_PAGES) {
    const app = createMiniProgram({ storage: { roomCode: 'ROOM01' }, windowInfo: { screenHeight: 812, statusBarHeight: 44, safeArea: { top: 44, bottom: 778 } } })
    try {
      app.failNavigation('switchTab')
      app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
      app.cloud.when({ name: 'dataOp', data: { action: 'list' } }).reply({ code: 0, data: [] })
      const page = app.launch('/' + pagePath)
      await app.settle()
      const data = app.rendered(page)
      const expected = expectedLeftPadding.get(pagePath)
      assert.equal(data.navTitlePaddingLeft, expected, `${pagePath} left compensation`)
      assert.equal(data.navTitlePaddingRight, 0, `${pagePath} right compensation`)
      const root = wxmlOpeningTags(readRepo(`${pagePath}.wxml`)).find(tag => tag.classes.includes('page'))
      const style = renderWxmlAttribute(root.attrs.style, data)
      assert.match(style, new RegExp(`--nav-title-padding-left: ${expected}px`), pagePath)
      assert.match(style, /--nav-title-padding-right: 0px/, pagePath)
    } finally { app.teardown() }
  }

  const title = findDecls(parseWxssRules(readRepo('app.wxss')), '.nav-title')
  assert.equal(title['box-sizing'], 'border-box')
  assert.equal(title['min-width'], '0')
  assert.match(title['padding-left'], /var\(--nav-title-padding-left,\s*0px\)/)
  assert.match(title['padding-right'], /var\(--nav-title-padding-right,\s*0px\)/)
  const pill = findDecls(parseWxssRules(readRepo('pages/index/index.wxss')), '.sync-pill')
  for (const value of Object.values(pill)) assert.doesNotMatch(value, /nav-title-padding/)
})

test('bottom inset lands on non-tab page content; tab pages stay lean behind the native tabBar', () => {
  for (const file of NON_TAB_WXSS) {
    const content = findDecls(parseWxssRules(readRepo(file)), '.content')
    assert.match(
      content.padding || '',
      /var\(--safe-bottom,\s*env\(safe-area-inset-bottom/,
      `${file} .content bottom padding must add the runtime bottom inset`
    )
  }
  for (const file of TAB_WXSS) {
    const content = findDecls(parseWxssRules(readRepo(file)), '.content')
    assert.doesNotMatch(
      content.padding || '',
      /safe-bottom/,
      `${file} is a tab page: the native tabBar already absorbs the bottom inset, do not add dead space`
    )
  }
})

test('record dashboard uses three equal tracks with middle-column hairlines', () => {
  const rules = parseWxssRules(readRepo('pages/period/period.wxss'))
  const stats = findDecls(rules, '.cycle-stats')
  assert.equal(stats.display, 'grid')
  assert.equal(stats['grid-template-columns'].replaceAll(' ', ''), 'repeat(3,minmax(0,1fr))')
  const middle = findDecls(rules, '.cycle-item:nth-child(2)')
  assert.equal(middle['border-left'], '1px solid rgba(255,255,255,0.07)')
  assert.equal(middle['border-right'], '1px solid rgba(255,255,255,0.07)')
  assert.equal(middle['box-sizing'], 'border-box')
  assert.equal(middle.padding, '0 16rpx')
})

test('period rows keep horizontal separation and protect their trailing controls', () => {
  const rules = parseWxssRules(readRepo('pages/period/period.wxss'))
  const row = findDecls(rules, '.list-item')
  assert.equal(row.gap, '16rpx')
  for (const selector of ['.item-right', '.item-duration', '.item-arrow']) {
    const decls = findDecls(rules, selector)
    assert.equal(decls['flex-shrink'], '0', `${selector} never shrinks`)
    assert.equal(decls['white-space'], 'nowrap', `${selector} stays on one line`)
  }
})
