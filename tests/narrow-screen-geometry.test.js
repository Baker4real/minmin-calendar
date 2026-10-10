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

test('calendar row height stays between 44px and the previous cap for 5- and 6-row months', () => {
  const { computeCalendarRowHeight } = require('../utils/calendarRowHeight')
  // 页高 = 手机高度 − 底栏。顶栏含状态栏。6 行且不在当月时带「回到今天」。
  const phones = [
    { width: 320, screen: 568, tabBar: 48, nav: 64 },
    { width: 375, screen: 667, tabBar: 48, nav: 64 },
    { width: 390, screen: 844, tabBar: 83, nav: 91 }
  ]
  const expected = {
    '320:compact:5:0': 57.17,
    '320:compact:6:1': 44,
    '320:full:5:1': 49.66,
    '320:full:6:1': 44,
    '375:compact:5:0': 70,
    '375:compact:6:1': 52,
    '375:full:5:0': 71.2,
    '375:full:6:1': 52,
    '390:compact:5:0': 72.8,
    '390:compact:6:1': 69.56,
    '390:full:5:0': 83.2,
    '390:full:6:1': 69.56
  }

  for (const phone of phones) {
    for (const density of ['compact', 'full']) {
      for (const rowCount of [5, 6]) {
        for (const showBackToToday of [false, true]) {
          const row = computeCalendarRowHeight({
            viewportWidth: phone.width,
            viewportHeight: phone.screen - phone.tabBar,
            navBarHeightPx: phone.nav,
            density,
            rowCount,
            showBackToToday
          })
          assert.ok(row.heightPx >= 44, `${phone.width} ${density} ${rowCount} below 44px`)
          assert.ok(row.heightPx <= row.capPx + 0.001, `${phone.width} ${density} above the cap`)
          const key = `${phone.width}:${density}:${rowCount}:${showBackToToday ? 1 : 0}`
          if (expected[key] !== undefined) assert.equal(row.heightPx, expected[key], key)
        }
      }
    }
  }

  // 390×844 两种密度、375×667 清爽密度：6 行且带着「回到今天」，记录入口仍在页内。
  for (const sample of [
    { width: 390, height: 761, nav: 91, density: 'compact' },
    { width: 390, height: 761, nav: 91, density: 'full' },
    { width: 375, height: 619, nav: 64, density: 'compact' }
  ]) {
    const row = computeCalendarRowHeight({
      viewportWidth: sample.width,
      viewportHeight: sample.height,
      navBarHeightPx: sample.nav,
      density: sample.density,
      rowCount: 6,
      showBackToToday: true
    })
    assert.equal(row.actionsFit, true, `${sample.width} ${sample.density} record actions leave the first screen`)
  }
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
