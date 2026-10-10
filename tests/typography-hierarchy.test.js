const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { listWxssFiles, parseWxssRules } = require('./designTokens')

const repoRoot = path.join(__dirname, '..')
const APP_WXSS = 'app.wxss'
const INDEX_WXSS = 'pages/index/index.wxss'
const SETTINGS_WXSS = 'pages/settings/settings.wxss'
const PERIOD_EDIT_WXSS = 'pages/period/edit/edit.wxss'

const CAPTION_FLOOR_RPX = 26
const MICRO_FLOOR_RPX = 24
const CAPTION_LINE_HEIGHT = 1.4
const MONTH_NAV_AVAILABLE_RPX = 390 // 750 视口 - content 24×2 - month-nav padding 24×2 - nav-btn 88×2 - 月份工具菜单触发器 88（issue #105）
const NAV_TOUCH_RPX = 88

function readAppTokens() {
  const tokens = {}
  for (const rule of parseWxssRules(fs.readFileSync(path.join(repoRoot, APP_WXSS), 'utf8'))) {
    for (const [prop, value] of Object.entries(rule.decls)) {
      if (prop.startsWith('--')) tokens[prop] = value
    }
  }
  return tokens
}

function ruleDecls(relative, selector) {
  const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, relative), 'utf8'))
  const rule = rules.find((candidate) => candidate.selectors.includes(selector))
  assert.ok(rule, `expected rule ${selector} in ${relative}`)
  return rule.decls
}

function resolveRpx(decls, prop, tokens, label) {
  const raw = decls[prop]
  assert.ok(raw, `expected ${prop} on ${label}`)
  const tokenRef = /^var\((--[a-z0-9-]+)\)$/i.exec(raw.trim())
  const resolved = tokenRef ? tokens[tokenRef[1]] : raw.trim()
  assert.ok(resolved, `unknown token in ${prop} on ${label}: ${raw}`)
  const rpx = /^(\d+(?:\.\d+)?)rpx$/.exec(resolved)
  assert.ok(rpx, `expected ${prop} in rpx on ${label}, got ${resolved}`)
  return Number(rpx[1])
}

function horizontalPaddingRpx(decls, label) {
  const parts = String(decls.padding || '').trim().split(/\s+/)
  const token = parts.length >= 2 ? parts[1] : parts[0]
  const match = /^(\d+(?:\.\d+)?)rpx$/.exec(token || '')
  assert.ok(match, `expected horizontal padding in rpx on ${label}`)
  return Number(match[1])
}

test('home month title sits one level above the shared nav title', () => {
  const tokens = readAppTokens()
  assert.equal(
    tokens['--font-size-month-title'],
    '40rpx',
    'the month-title role token must exist one step above --font-size-title'
  )

  const monthTitle = ruleDecls(INDEX_WXSS, '.month-title')
  const navTitle = ruleDecls(APP_WXSS, '.nav-title')
  assert.equal(monthTitle['font-size'], 'var(--font-size-month-title)')
  assert.equal(navTitle['font-size'], 'var(--font-size-title)')

  const monthSize = resolveRpx(monthTitle, 'font-size', tokens, '.month-title')
  const navSize = resolveRpx(navTitle, 'font-size', tokens, '.nav-title')
  assert.ok(
    monthSize - navSize >= 6,
    `month title ${monthSize}rpx must clear the nav title ${navSize}rpx by at least 6rpx`
  )

  assert.equal(tokens['--font-weight-title'], '700', 'title role weight is 700')
  assert.equal(monthTitle['font-weight'], 'var(--font-weight-title)')
  assert.equal(navTitle['font-weight'], 'var(--font-weight-title)')
  assert.equal(monthTitle['line-height'], 'var(--line-height-title)')
  assert.equal(tokens['--line-height-title'], '1.2')
  assert.equal(monthTitle['letter-spacing'], undefined, 'month title keeps natural CJK tracking')
  assert.equal(navTitle['letter-spacing'], undefined, 'nav title keeps natural CJK tracking')
})

test('font role scale stays strictly ordered for reading hierarchy', () => {
  const tokens = readAppTokens()
  const chain = [
    '--font-size-calendar-micro',
    '--font-size-caption',
    '--font-size-body',
    '--font-size-body-lg',
    '--font-size-title',
    '--font-size-month-title'
  ]
  const sizes = chain.map((name) => {
    const value = /^(\d+)rpx$/.exec(tokens[name] || '')
    assert.ok(value, `expected ${name} in rpx`)
    return Number(value[1])
  })
  for (let index = 1; index < sizes.length; index += 1) {
    assert.ok(
      sizes[index] > sizes[index - 1],
      `${chain[index]} (${sizes[index]}rpx) must exceed ${chain[index - 1]} (${sizes[index - 1]}rpx)`
    )
  }
})

test('month title stays single-line and inside its 88rpx trigger', () => {
  const tokens = readAppTokens()
  const monthTitle = ruleDecls(INDEX_WXSS, '.month-title')
  assert.equal(monthTitle['white-space'], 'nowrap', 'month title must never wrap on narrow screens')

  const fontSize = resolveRpx(monthTitle, 'font-size', tokens, '.month-title')
  const lineHeight = Number(tokens['--line-height-title'])
  assert.equal(monthTitle['line-height'], 'var(--line-height-title)')
  assert.ok(lineHeight >= 1.1 && lineHeight <= 1.4, `.month-title line-height ${lineHeight} out of range`)

  const trigger = ruleDecls(INDEX_WXSS, '.month-title-trigger')
  const triggerHeight = resolveRpx(trigger, 'min-height', tokens, '.month-title-trigger')
  assert.ok(
    fontSize * lineHeight <= triggerHeight,
    `month title line box ${fontSize}×${lineHeight} exceeds the ${triggerHeight}rpx trigger`
  )
})

test('month title worst-case CJK label fits the month-nav row on a 750rpx viewport', () => {
  const tokens = readAppTokens()
  const monthTitle = ruleDecls(INDEX_WXSS, '.month-title')
  const fontSize = resolveRpx(monthTitle, 'font-size', tokens, '.month-title')
  assert.equal(monthTitle['letter-spacing'], undefined, 'month title must not add tracking')
  const letterSpacing = 0
  const caretSize = resolveRpx(ruleDecls(INDEX_WXSS, '.month-title-caret'), 'font-size', tokens, '.month-title-caret')
  const trigger = ruleDecls(INDEX_WXSS, '.month-title-trigger')
  const padX = horizontalPaddingRpx(trigger, '.month-title-trigger')
  const gap = resolveRpx(trigger, 'gap', tokens, '.month-title-trigger')

  // 最坏文案「2026年12月」：6 个数字（按 0.6em 上限）+ 2 个 CJK（1em）+ 逐字 letter-spacing。
  const labelWidth = 6 * 0.6 * fontSize + 2 * fontSize + 8 * letterSpacing
  const total = labelWidth + gap + caretSize + 2 * padX
  assert.ok(
    total <= MONTH_NAV_AVAILABLE_RPX,
    `month title needs ${total.toFixed(0)}rpx of the ${MONTH_NAV_AVAILABLE_RPX}rpx available between the nav buttons`
  )
})

// caption 家族统一契约：issue #54 点名的六族全部走 26rpx caption 角色。
// 流式说明文字显式 line-height 1.4；单行控件以盒高居中（legend-symbol 行高=盒高，copy-btn flex 居中），
// 不设第二套文字行高。
const CAPTION_FAMILY_FLOW = [
  [PERIOD_EDIT_WXSS, '.form-hint'],
  [PERIOD_EDIT_WXSS, '.symptom-group-label'],
  [SETTINGS_WXSS, '.settings-group-title'],
  [SETTINGS_WXSS, '.room-code-label']
]

test('input placeholder type stays on the input role, at least the caption floor', () => {
  const tokens = readAppTokens()
  const decls = ruleDecls(APP_WXSS, '.input-placeholder')
  assert.equal(decls['font-size'], 'var(--font-size-input)')
  assert.ok(resolveRpx(decls, 'font-size', tokens, '.input-placeholder') >= CAPTION_FLOOR_RPX)
})

test('caption family shares the caption token and the 1.4 line-height policy', () => {
  const tokens = readAppTokens()
  for (const [file, selector] of CAPTION_FAMILY_FLOW) {
    const decls = ruleDecls(file, selector)
    assert.equal(decls['font-size'], 'var(--font-size-caption)', `${selector} must use the caption role token`)
    assert.equal(tokens['--line-height-assist'], String(CAPTION_LINE_HEIGHT))
    assert.equal(tokens['--font-weight-assist'], '500')
    assert.equal(decls['line-height'], 'var(--line-height-assist)', `${selector} must use the assist line-height token`)
    assert.equal(decls['font-weight'], 'var(--font-weight-assist)', `${selector} must use the assist weight`)
    assert.ok(resolveRpx(decls, 'font-size', tokens, selector) >= CAPTION_FLOOR_RPX)
  }
})

test('box-centered caption controls keep single-line box geometry', () => {
  const tokens = readAppTokens()

  const legend = ruleDecls(INDEX_WXSS, '.legend-symbol')
  assert.equal(legend['font-size'], 'var(--font-size-caption)')
  assert.equal(
    resolveRpx(legend, 'line-height', tokens, '.legend-symbol'),
    resolveRpx(legend, 'height', tokens, '.legend-symbol'),
    '.legend-symbol centers its glyph by line-height == box height'
  )

  const copyBtn = ruleDecls(SETTINGS_WXSS, '.copy-btn')
  assert.equal(copyBtn['font-size'], 'var(--font-size-caption)')
  assert.equal(copyBtn.display, 'flex')
  assert.equal(copyBtn['align-items'], 'center')
  assert.ok(
    resolveRpx(copyBtn, 'min-height', tokens, '.copy-btn') >= NAV_TOUCH_RPX,
    '.copy-btn keeps the 88rpx single-line control box'
  )
})

// 页面外用户可读 caption 下限矩阵（26rpx）。首页格内/格外微字另有
// tests/calendar-micro-labels.test.js 的 22 个选择器深钉，这里登记各页代表面。
const PAGE_CAPTION_MATRIX = {
  [INDEX_WXSS]: ['.sync-text', '.week-cell', '.stat-label', '.reminder-text', '.legend-text', '.sheet-subtitle'],
  'pages/bind/bind.wxss': ['.hero-desc', '.info-text', '.error-msg'],
  [SETTINGS_WXSS]: ['.settings-group-title', '.room-code-label', '.copy-btn', '.density-option'],
  'pages/period/period.wxss': ['.card-label', '.cycle-label', '.item-note', '.item-tag', '.item-duration', '.memory-note', '.segment-option'],
  [PERIOD_EDIT_WXSS]: ['.form-label', '.form-hint', '.symptom-group-label', '.flow-chip', '.symptom-chip'],
  'pages/memory/memory.wxss': ['.memory-note'],
  'pages/memory/edit/edit.wxss': ['.form-label']
}

test('user-readable captions on every page resolve at or above the 26rpx floor', () => {
  const tokens = readAppTokens()
  for (const [file, selectors] of Object.entries(PAGE_CAPTION_MATRIX)) {
    for (const selector of selectors) {
      const size = resolveRpx(ruleDecls(file, selector), 'font-size', tokens, `${file} ${selector}`)
      assert.ok(size >= CAPTION_FLOOR_RPX, `${file} ${selector} font-size ${size}rpx is below ${CAPTION_FLOOR_RPX}rpx`)
    }
  }
})

test('the 24rpx calendar-micro role never escapes the home calendar cells', () => {
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    if (relative === APP_WXSS) continue // token definition site
    if (fs.readFileSync(file, 'utf8').includes('var(--font-size-calendar-micro)')) {
      assert.equal(
        relative,
        INDEX_WXSS,
        `${relative} uses the ${MICRO_FLOOR_RPX}rpx in-cell micro role outside the home calendar`
      )
    }
  }
})

test('system CJK font stack is unchanged and no external font is introduced', () => {
  const app = fs.readFileSync(path.join(repoRoot, APP_WXSS), 'utf8')
  assert.match(
    app,
    /font-family:\s*-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', sans-serif;/,
    'app.wxss keeps the registered system/CJK stack'
  )
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const css = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(css, /@font-face/, `${relative} must not declare @font-face`)
    assert.doesNotMatch(css, /@import/, `${relative} must not import external font resources`)
    if (relative !== APP_WXSS) {
      assert.doesNotMatch(css, /font-family\s*:/, `${relative} inherits the shared font stack from app.wxss`)
    }
  }
})
