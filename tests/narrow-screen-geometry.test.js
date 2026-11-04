const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { listWxssFiles, parseWxssRules } = require('./designTokens')

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
  'pages/memory/memory.wxss',
  'pages/memory/edit/edit.wxss',
  'pages/period/edit/edit.wxss'
]
const TAB_WXSS = [
  'pages/index/index.wxss',
  'pages/period/period.wxss',
  'pages/settings/settings.wxss'
]

function readRepo(relativePath) {
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

test('rules with explicit width and horizontal padding use border-box (no additive overflow)', () => {
  const offenders = []
  for (const file of listWxssFiles(repoRoot)) {
    for (const rule of parseWxssRules(fs.readFileSync(file, 'utf8'))) {
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
  const codeInput = findDecls(rules, '.code-input')

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
  const codeInput = findDecls(rules, '.code-input')

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
  // issue #108：欢乐时光月份卡头「YYYY年M月 · N 条」在 320px 宽单行完整显示。
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

  const fontSizeRpx = Number(/(\d+)rpx/.exec(appTokens['--font-size-body'])[1])
  const toggleSizeRpx = Number(/(\d+)rpx/.exec(appTokens['--font-size-caption'])[1])
  const contentPadRpx = Number(/(\d+)rpx/.exec(horizontalPaddingTokens(content)[0])[1])
  const headerPadRpx = Number(/(\d+)rpx/.exec(horizontalPaddingTokens(header)[0])[1])
  const headerGapRpx = Number(/(\d+)rpx/.exec(header.gap)[1])
  const availableRpx = 750 - 2 * contentPadRpx - 2 * headerPadRpx

  // 卡头标题最坏文案「2026年12月 · 99 条」：8 位数字（0.6em）+ 年/月/条 3 个 CJK（1em）
  // +「·」按全宽 1em + 两侧空格按 0.5em；切换文字最坏「收起」2 个 CJK（1em）
  const titleRpx = (8 * 0.6 + 3 + 1 + 2 * 0.5) * fontSizeRpx
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
  const contentPadRpx = Number(/(\d+)rpx/.exec(horizontalPaddingTokens(content)[0])[1])
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
  // 完整密度要 159rpx 一行：320、375 上 5 行也放不下；390 上 5 行刚好放下，6 行靠滚动。
  // 清爽密度：375 / 390 上 6 行都能在首屏放下记录入口（必要时合并信息行），320 上 6 行再加「回到今天」只能滚动。
  const expected = {
    '320:compact:5:0': [56.37, true, true],
    '320:compact:5:1': [48.86, true, true],
    '320:compact:6:0': [46.98, true, true],
    '320:compact:6:1': [44, true, false],
    '320:full:5:0': [67.84, false, false],
    '320:full:5:1': [67.84, false, false],
    '320:full:6:0': [67.84, false, false],
    '320:full:6:1': [67.84, false, false],
    '375:compact:5:0': [70, false, true],
    '375:compact:5:1': [61.6, true, true],
    '375:compact:6:0': [58.66, true, true],
    '375:compact:6:1': [51.33, true, true],
    '375:full:5:0': [79.5, false, false],
    '375:full:5:1': [79.5, false, false],
    '375:full:6:0': [79.5, false, false],
    '375:full:6:1': [79.5, false, false],
    '390:compact:5:0': [72.8, false, true],
    '390:compact:5:1': [72.8, false, true],
    '390:compact:6:0': [72.8, false, true],
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
  // 「预」胶囊 42 比标记行高 12、向下垂出，还要让开今天 3rpx 的内描边：最小 4 + 140 + 12 + 3 = 159rpx = 82.68px
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
  // = 482rpx = 241px，另有 6px 描边：每行可用 (619 − 64 − 247) / 6 = 51.33px = 102.67rpx。
  // 常规清爽格（日期 38 + 节日 2+34 + 标记 6+30 居中，「预」垂出 12 并让开今天内描边）要 138rpx = 69px，放不下；
  // 合并后 上内边距 14 + 日期 38 + 信息行 2+42 + 下内边距 4 = 100rpx = 50px，放得下，记录入口仍在首屏。
  const short = computeCalendarRowHeight({
    viewportWidth: 375,
    viewportHeight: 619,
    navBarHeightPx: 64,
    density: 'compact',
    days: monthDays(6),
    showBackToToday: true
  })
  assert.equal(short.infoMerged, true)
  assert.equal(short.contentMinPx, 50)
  assert.equal(short.heightPx, 51.33)
  assert.equal(short.actionsFit, true)

  // 390×844 当月：每行可用 (761 − 91 − 210.88) / 6 = 76.52px = 147.15rpx，常规清爽格放得下，不合并，停在上限 140rpx
  const roomy = computeCalendarRowHeight({
    viewportWidth: 390,
    viewportHeight: 761,
    navBarHeightPx: 91,
    density: 'compact',
    days: monthDays(6)
  })
  assert.equal(roomy.infoMerged, false)
  assert.equal(roomy.contentMinPx, 71.76)
  assert.equal(roomy.heightPx, 72.8)
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
  // 放不下的日子在合并行里只能被裁掉，所以整月保持常规清爽格：行高停在 138rpx = 69px，记录入口改由滚动触达。
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
    assert.equal(row.heightPx, 51.33)
    assert.equal(row.actionsFit, true)
  }

  for (const cell of [
    { holidayName: '中秋', isPredict: true },
    { isWorkday: true, isPredict: true },
    { holidayName: '劳动节', isMemory: true },
    { isWorkday: true, isMemory: true, isPredict: true }
  ]) {
    const row = geometryWith(cell)
    assert.equal(row.infoMerged, false, `${JSON.stringify(cell)} would be clipped in a merged row`)
    assert.equal(row.contentMinPx, 69)
    assert.equal(row.heightPx, 69)
    assert.equal(row.actionsFit, false)
  }
})

function borderPx(decls) {
  const match = /^(\d+(?:\.\d+)?)px\b/.exec(String(decls.border || ''))
  assert.ok(match, 'expected a px border shorthand')
  return Number(match[1])
}

function verticalMarginRpx(decls) {
  return verticalPaddingRpx({ padding: decls.margin })
}

// issue #153：首屏账本就是记录入口以上的 CSS 文档流；每一项都从样式里读回来核对
test('the first-screen ledger is the CSS flow above the record actions', () => {
  const { CALENDAR_LEDGER } = require('../utils/calendarRowHeight')
  const ledger = CALENDAR_LEDGER.firstScreenRpx
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const monthNav = findDecls(rules, '.month-nav')
  const week = findDecls(rules, '.week-header')
  const grid = findDecls(rules, '.calendar-grid')

  // 吸顶区 = 月份导航（外边距 + 内边距 + 88rpx 控件）+ 状态行；占位再加月份导航 1px 上下描边，下方内容不被盖住
  const monthNavBox = verticalMarginRpx(monthNav) + verticalPaddingRpx(monthNav) + rpxNumber(findDecls(rules, '.nav-btn'), 'height')
  assert.equal(ledger.stickySpacer, monthNavBox + rpxNumber(findDecls(rules, '.home-status'), 'height'))
  assert.equal(ledger.backToToday, rpxNumber(findDecls(rules, '.back-today'), 'height'))
  const navBorder = 2 * borderPx(monthNav)
  assert.equal(findDecls(rules, '.home-sticky-spacer').height, `calc(${ledger.stickySpacer}rpx + ${navBorder}px)`)
  assert.equal(
    findDecls(rules, '.home-sticky-spacer.with-back-today').height,
    `calc(${ledger.stickySpacer + ledger.backToToday}rpx + ${navBorder}px)`
  )

  // 行内重试行：border-box 的最小高 + 下外边距；最长的失败文案在 320px 下也只占一行
  const retry = findDecls(rules, '.refresh-retry')
  assert.equal(retry['box-sizing'], 'border-box')
  assert.equal(ledger.refreshRetry, rpxNumber(retry, 'min-height') + splitCssTokens(retry.margin).map(parseFloat)[2])
  const copies = [...readRepo('pages/index/index.js').matchAll(/refreshRetryText: '([^']+)'/g)].map(match => match[1])
  assert.ok(copies.length >= 3, 'expected the retry copy table')
  const appTokens = readAppTokens()
  const captionRpx = parseFloat(appTokens['--font-size-caption'])
  const contentPadRpx = parseFloat(horizontalPaddingTokens(findDecls(rules, '.content'))[0])
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

  // 月份导航、周头、日历网格各有 1px 上下描边
  assert.equal(CALENDAR_LEDGER.firstScreenBorderPx, navBorder + 2 * borderPx(week) + 2 * borderPx(grid))
})

// issue #159：进行中经期的记录入口「经期第 N 天 · 记结束」一行放不下。连写的中文不拆开，只在文案里的空格处折行，
// 于是第一行停在「经期第 N 天 ·」、第二行是「记结束」；两行字仍在按钮最小高度里，首屏账本的记录入口高度不变。字号不缩
test('the ongoing quick-period label wraps only at its spaces and two lines stay inside the record button', () => {
  const cycle = require('../utils/cycle')
  const appTokens = readAppTokens()
  const rules = parseWxssRules(readRepo('pages/index/index.wxss'))
  const text = findDecls(rules, '.quick-text')
  const button = findDecls(rules, '.quick-btn')
  assert.equal(text['font-size'], 'var(--font-size-body)')
  assert.equal(text['word-break'], 'keep-all', 'CJK runs break only at the spaces of the label')
  assert.equal(text['line-height'], 'var(--line-height-title)')

  // 文字列宽（320px 下 1px 描边最宽）= 半行按钮宽 − 左右内边距 − 描边 − 圆盘 − 图文间距
  const fontRpx = parseFloat(appTokens['--font-size-body'])
  const contentPadRpx = parseFloat(horizontalPaddingTokens(findDecls(rules, '.content'))[0])
  const borderRpx = borderPx(button) * 750 / 320
  const columnRpx = (750 - 2 * contentPadRpx - rpxNumber(findDecls(rules, '.quick-actions'), 'gap')) / 2 -
    2 * parseFloat(horizontalPaddingTokens(button)[0]) - 2 * borderRpx -
    rpxNumber(findDecls(rules, '.quick-icon'), 'width') - rpxNumber(button, 'gap')

  // 宽度按上界估（与本文件其他账本同口径）：CJK 与「·」1em、数字 0.6em、空格 0.5em
  const widthRpx = copy => [...copy].reduce((sum, ch) => sum + (/\d/.test(ch) ? 0.6 : ch === ' ' ? 0.5 : 1), 0) * fontRpx
  for (const days of [1, 12, 120]) {
    const start = '2026-01-01'
    const today = new Date(Date.UTC(2026, 0, days)).toISOString().slice(0, 10)
    const { label } = cycle.buildPeriodQuickAction([{ _id: 'stand-in', startDate: start, endDate: '', status: 'ongoing' }], { today })
    const lines = label.split(/(?<=·) /)
    assert.deepEqual(lines, [`经期第 ${days} 天 ·`, '记结束'], `day ${days} label shape`)
    assert.ok(widthRpx(lines[0]) <= columnRpx, `「${lines[0]}」 ${widthRpx(lines[0])}rpx needs more than the ${columnRpx.toFixed(1)}rpx column`)
  }

  // 两行字 + 上下内边距 + 上下描边不超过按钮最小高：按钮不因折行变高，账本里的 quickActions 照旧成立
  const twoLinesRpx = 2 * fontRpx * Number(appTokens['--line-height-title'])
  const boxRpx = twoLinesRpx + verticalPaddingRpx(button) + 2 * borderRpx
  assert.ok(boxRpx <= rpxNumber(button, 'min-height'), `two label lines need ${boxRpx.toFixed(1)}rpx, more than the ${rpxNumber(button, 'min-height')}rpx button`)
})

// issue #151 的行内重试行（首次加载只有一个集合失败时也会出现）同样在吸顶占位之后的文档流里，占首屏高度
test('the inline sync-retry row is an explicit input of the first-screen ledger', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  // 375×667 当月 6 行：首屏 394rpx + 6px 描边 = 203px，每行 (619 − 64 − 203) / 6 = 58.66px（合并信息行）。
  // 重试行 = 最小高 88 + 下外边距 8 = 96rpx = 48px：每行 (619 − 64 − 251) / 6 = 50.66px，仍在合并最小 50px 之上。
  // 再显示「回到今天」88rpx：每行只剩 43.33px，行高停在 50px，记录入口移出首屏。
  const base = { viewportWidth: 375, viewportHeight: 619, navBarHeightPx: 64, density: 'compact', days: monthDays(6) }
  const plain = computeCalendarRowHeight(base)
  const retry = computeCalendarRowHeight({ ...base, showRefreshRetry: true })
  const retryAway = computeCalendarRowHeight({ ...base, showRefreshRetry: true, showBackToToday: true })

  assert.deepEqual([plain.heightPx, plain.infoMerged, plain.actionsFit], [58.66, true, true])
  assert.deepEqual([retry.heightPx, retry.infoMerged, retry.actionsFit], [50.66, true, true])
  assert.deepEqual([retryAway.heightPx, retryAway.contentMinPx, retryAway.actionsFit], [50, 50, false])
})

// issue #149：一次性配对欢迎条在吸顶占位之后的正常文档流里，显示时和「回到今天」一样占掉可用高度。
// 它是行高账本的显式输入：行高随之变矮但守 44px 下限，记录入口放不进首屏时如实报告。
test('the one-time partner welcome bar is an explicit input of the calendar row-height ledger', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  // 页高 = 手机高度 − 底栏；without / with 是不显示 / 显示欢迎条时的行高，fits 是显示时记录入口是否仍在首屏。
  // 放不下时行高停在内容最小高度（清爽合并 100rpx 与 44px 取大、完整 159rpx），记录入口靠滚动触达（issue #153）。
  const samples = [
    { width: 390, height: 761, nav: 91, density: 'compact', rows: 6, showBackToToday: false, without: 72.8, with: 67.57, fits: true },
    { width: 390, height: 761, nav: 91, density: 'full', rows: 5, showBackToToday: false, without: 83.2, with: 82.68, fits: false },
    { width: 375, height: 619, nav: 64, density: 'compact', rows: 6, showBackToToday: false, without: 58.66, with: 50.06, fits: true },
    { width: 375, height: 619, nav: 64, density: 'compact', rows: 6, showBackToToday: true, without: 51.33, with: 50, fits: false },
    { width: 320, height: 520, nav: 64, density: 'compact', rows: 5, showBackToToday: false, without: 56.37, with: 47.57, fits: true },
    { width: 320, height: 520, nav: 64, density: 'compact', rows: 6, showBackToToday: false, without: 46.98, with: 44, fits: false }
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
    assert.equal(plain.actionsFit, true, `${key} keeps the record actions on screen without the welcome`)
    assert.equal(welcomed.heightPx, sample.with, `${key} with the welcome`)
    assert.equal(welcomed.actionsFit, sample.fits, `${key} reports whether the record actions still fit`)
    assert.ok(welcomed.heightPx >= welcomed.contentMinPx, `${key} squeezes the cell below its content`)
    assert.ok(welcomed.heightPx >= 44, `${key} drops below the 44px floor`)
  }
})

// issue #149：欢迎条挂在吸顶占位之后、日历之前的正常文档流里，固定的月份导航和状态行盖不住它；
// 它的盒高（两行 caption × 正文行高，加上下外边距）就是行高账本里的那一项。
test('the partner welcome bar flows below the sticky spacer and its box matches the ledger entry', () => {
  const { CALENDAR_PARTNER_WELCOME_RPX } = require('../utils/calendarRowHeight')
  const wxml = readRepo('pages/index/index.wxml')
  const welcome = /<text wx:if="\{\{partnerWelcome\}\}" class="partner-welcome">([^<]+)<\/text>/.exec(wxml)
  const spacerAt = wxml.indexOf('class="home-sticky-spacer')
  const calendarAt = wxml.indexOf('class="calendar-swipe"')
  assert.ok(welcome, 'expected the one-time welcome text')
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
  const margin = splitCssTokens(bar.margin).map(token => parseFloat(token))
  assert.equal(margin.length, 3, 'margin is top / horizontal / bottom')
  const fontRpx = parseFloat(appTokens['--font-size-caption'])
  const lineHeight = Number(appTokens['--line-height-body'])

  // 文案恰好两行：CJK 与全角标点 1em；拉丁字母 0.5–0.7em、空格 0.25–0.5em、♥ 0.5–1em 取上下界
  const contentPadRpx = parseFloat(horizontalPaddingTokens(findDecls(rules, '.content'))[0])
  const lineEm = (750 - 2 * contentPadRpx - 2 * margin[1]) / fontRpx
  let minEm = 0
  let maxEm = 0
  for (const ch of welcome[1]) {
    if (/[　-鿿＀-￯]/.test(ch)) { minEm += 1; maxEm += 1 } else if (ch === ' ') { minEm += 0.25; maxEm += 0.5 } else if (/[A-Za-z]/.test(ch)) { minEm += 0.5; maxEm += 0.7 } else { minEm += 0.5; maxEm += 1 }
  }
  assert.ok(minEm > lineEm && maxEm <= 2 * lineEm, `welcome copy ${minEm}–${maxEm}em must wrap to exactly two ${lineEm.toFixed(2)}em lines`)

  const boxRpx = margin[0] + 2 * fontRpx * lineHeight + margin[2]
  assert.ok(Math.abs(boxRpx - 103.2) < 1e-9, `welcome box ${boxRpx}rpx`)
  assert.equal(CALENDAR_PARTNER_WELCOME_RPX, 103.2, 'ledger entry must equal the rendered welcome box')
})

// issue #149：绑定页幽灵「进入应用」是内容宽胶囊，高度 = 上下 px 内边距 + 一行字 + 描边，320px 宽下仍 ≥44px
test('bind ghost enter-app button keeps a 44px touch height at 320px', () => {
  const appTokens = readAppTokens()
  const ghost = findDecls(parseWxssRules(readRepo('pages/bind/bind.wxss')), '.btn-ghost')
  const verticalPadPx = /^(\d+(?:\.\d+)?)px$/.exec(splitCssTokens(ghost.padding)[0])
  assert.ok(verticalPadPx, 'ghost vertical padding stays in px so it does not shrink with the viewport')
  const lineHeightToken = /^var\((--line-height-[a-z]+)\)$/.exec(ghost['line-height'])
  assert.ok(lineHeightToken, 'ghost line-height uses a line-height token')
  const fontPx = parseFloat(appTokens[/^var\((--[a-z-]+)\)$/.exec(ghost['font-size'])[1]]) * 320 / 750
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
  const contentPadRpx = Number(/(\d+)rpx/.exec(horizontalPaddingTokens(content)[0])[1])
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
  const jumpSheet = findDecls(rules, '.calendar-jump-sheet')
  const daySheet = findDecls(rules, '.day-action-sheet')
  const infoPanel = findDecls(rules, '.calendar-info-panel')
  const mask = findDecls(rules, '.day-sheet-mask')

  // 月份跳转与日操作 sheet：自有滚动边界
  for (const [name, decls] of [['.calendar-jump-sheet', jumpSheet], ['.day-action-sheet', daySheet]]) {
    const maxVh = Number(/(\d+(?:\.\d+)?)vh/.exec(decls['max-height'] || '0')[1])
    assert.ok(maxVh > 0 && maxVh < 100, `${name} needs a sub-viewport max-height`)
    assert.equal(decls['overflow-y'], 'auto', `${name} must scroll when content grows`)
  }

  // 图例/预测/月小结面板复用 .day-action-sheet 的 overflow-y，自身只收紧高度
  const infoVh = Number(/(\d+(?:\.\d+)?)vh/.exec(infoPanel['max-height'] || '0')[1])
  assert.ok(infoVh > 0 && infoVh < 100, '.calendar-info-panel needs a sub-viewport max-height')
  assert.match(wxml, /class="day-action-sheet calendar-info-panel safe-bottom"/)

  // 父级不裁切：遮罩全屏 flex-end，无 overflow 裁切；页面入场只淡入（transform 会把 fixed 弹层拖进裁剪域）
  assert.ok(!/overflow\s*:\s*hidden/.test(mask.overflow || ''), 'sheet mask must not clip the sheet')
  const pageEnter = /@keyframes pageEnter\s*\{([\s\S]*?)\n\}/.exec(readRepo('app.wxss'))
  assert.ok(pageEnter, 'expected pageEnter keyframes')
  assert.doesNotMatch(pageEnter[1], /transform/)
})

// issue #154：设置「使用说明」面板同样有滚动边界，字号放大或文案变长时标题行的关闭键不被顶出屏幕
test('the settings help sheet scrolls within the bottom-sheet height band so its close stays on screen', () => {
  const rules = parseWxssRules(readRepo('pages/settings/settings.wxss'))
  const sheet = findDecls(rules, '.help-sheet')
  const maxVh = /^(\d+(?:\.\d+)?)vh$/.exec(sheet['max-height'] || '')
  assert.ok(maxVh, '.help-sheet needs a viewport-relative max-height')
  assert.ok(Number(maxVh[1]) >= 82 && Number(maxVh[1]) <= 86, `.help-sheet max-height ${maxVh[1]}vh is outside 82–86vh`)
  assert.equal(sheet['overflow-y'], 'auto', '.help-sheet must scroll when content grows')
  for (const host of ['.help-layer', '.help-slide']) {
    assert.doesNotMatch(findDecls(rules, host).overflow || '', /hidden/, `${host} must not clip the sheet`)
  }
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

  const pill = findDecls(parseWxssRules(readRepo('pages/index/index.wxss')), '.sync-pill')
  assert.match(pill.top, /var\(--nav-bar-height/, 'sync status must start at or below the fixed navbar')

  for (const pagePath of ALL_PAGES) {
    const wxml = readRepo(`${pagePath}.wxml`)
    const js = readRepo(`${pagePath}.js`)
    assert.match(wxml, /class="[^"]*\bnav-bar\b/, `${pagePath} must use the shared navbar`)
    assert.match(wxml, /--nav-bar-height:\s*\{\{navBarHeight\}\}px/, `${pagePath} must inject navbar height`)
    assert.match(wxml, /--capsule-right:\s*\{\{capsuleRight\}\}px/, `${pagePath} must inject the capsule slot`)
    assert.match(js, /navBarHeight:\s*safeArea\.getNavBarHeight\(\)/, `${pagePath} must read navbar height from safeArea`)
    assert.match(js, /capsuleRight:\s*safeArea\.getCapsuleRightInset\(\)/, `${pagePath} must read the capsule slot from safeArea`)
    if (wxml.includes('class="nav-back"')) {
      assert.match(
        wxml,
        /class="nav-bar header-gradient">\s*<view class="nav-back"/,
        `${pagePath} back button must live in the navbar`
      )
    }
  }

  const index = readRepo('pages/index/index.wxml')
  assert.match(
    index,
    /class="nav-bar header-gradient">\s*<view class="nav-tool"[^>]*>工具<\/view>\s*<view class="nav-title">美少女的日历<\/view>/,
    'home puts the tools entry in the navbar left slot'
  )
  assert.doesNotMatch(index, /class="nav-placeholder"/)
  assert.match(readRepo('pages/period/period.wxml'), /nav-title">记录</)
  assert.match(readRepo('pages/settings/settings.wxml'), /nav-title">设置</)
  assert.doesNotMatch(readRepo('pages/period/period.wxml'), /nav-back/)
  assert.doesNotMatch(readRepo('pages/settings/settings.wxml'), /nav-back/)
  assert.doesNotMatch(readRepo('pages/index/index.wxml'), /nav-back/)

  const design = readRepo('DESIGN.md')
  const geometry = design.slice(design.indexOf('窄屏几何与安全区'), design.indexOf('阴影登记'))
  assert.match(geometry, /共享顶栏/)
  assert.match(geometry, /胶囊/)
})

test('every page root injects --safe-bottom alongside --safe-top from runtime data', () => {
  for (const pagePath of ALL_PAGES) {
    const wxml = readRepo(`${pagePath}.wxml`)
    const js = readRepo(`${pagePath}.js`)
    assert.match(wxml, /--safe-top:\s*\{\{safeTop\}\}px; --safe-bottom:\s*\{\{safeBottom\}\}px/, `${pagePath}.wxml root style must inject both safe-area vars`)
    assert.match(js, /safeBottom:\s*safeArea\.getSafeBottom\(\)/, `${pagePath}.js data must feed safeBottom from utils/safeArea`)
  }
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
