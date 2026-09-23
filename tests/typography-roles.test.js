const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { listWxssFiles, parseWxssRules } = require('./designTokens')

const repoRoot = path.join(__dirname, '..')
const APP_WXSS = path.join(repoRoot, 'app.wxss')
const DESIGN_MD = path.join(repoRoot, 'DESIGN.md')

// 字号角色契约：与 DESIGN.md「共享字号角色」表一一对应，app.wxss 是唯一实现来源。
// 角色语义：month-title 首页月份大标题（高于全局导航标题一级）/ title 标题 / body-lg 正文大号 /
// body 正文 / caption 说明标签（页面外下限 26rpx）/ calendar-date 日历日期（full 与 compact 密度）/
// calendar-micro 日历格内微字（下限 24rpx）/ button 主按钮 / input 输入文字。
const FONT_ROLE_TOKENS = {
  '--font-size-month-title': '40rpx',
  '--font-size-title': '34rpx',
  '--font-size-body-lg': '32rpx',
  '--font-size-body': '28rpx',
  '--font-size-caption': '26rpx',
  '--font-size-calendar-date': '28rpx',
  '--font-size-calendar-date-compact': '30rpx',
  '--font-size-calendar-micro': '24rpx',
  '--font-size-button': '30rpx',
  '--font-size-input': '32rpx'
}

// 文字角色之外的登记例外。glyph = 图形符号（箭头/emoji/装饰字符），字号随容器几何；
// display = 展示型大数字/大字，单点登记。新增例外必须在此登记 file + selector + 当前值，登记即评审。
const TYPOGRAPHY_EXCEPTIONS = [
  { file: 'app.wxss', selector: '.nav-back', kind: 'glyph', value: '46rpx' },
  { file: 'pages/index/index.wxss', selector: '.month-title-caret', kind: 'glyph', value: '24rpx' },
  { file: 'pages/index/index.wxss', selector: '.nav-btn', kind: 'glyph', value: '42rpx' },
  { file: 'pages/index/index.wxss', selector: '.quick-icon', kind: 'glyph', value: '32rpx' },
  { file: 'pages/index/index.wxss', selector: '.record-entry-icon', kind: 'glyph', value: '26rpx' },
  { file: 'pages/index/index.wxss', selector: '.record-entry-arrow', kind: 'glyph', value: '42rpx' },
  { file: 'pages/index/index.wxss', selector: '.no-room-icon', kind: 'glyph', value: '120rpx' },
  { file: 'pages/index/index.wxss', selector: '.jump-year-step', kind: 'glyph', value: '40rpx' },
  { file: 'pages/index/index.wxss', selector: '.sheet-close', kind: 'glyph', value: '46rpx' },
  { file: 'pages/index/index.wxss', selector: '.sheet-action-icon', kind: 'glyph', value: '26rpx' },
  { file: 'pages/index/index.wxss', selector: '.sheet-action-arrow', kind: 'glyph', value: '42rpx' },
  { file: 'pages/index/index.wxss', selector: '.stat-num', kind: 'display', value: '36rpx' },
  { file: 'pages/period/period.wxss', selector: '.item-arrow', kind: 'glyph', value: '32rpx' },
  { file: 'pages/period/period.wxss', selector: '.cycle-num', kind: 'display', value: '44rpx' },
  { file: 'pages/period/edit/edit.wxss', selector: '.form-picker-arrow', kind: 'glyph', value: '32rpx' },
  { file: 'pages/memory/memory.wxss', selector: '.memory-heart', kind: 'glyph', value: '36rpx' },
  { file: 'pages/memory/memory.wxss', selector: '.memory-arrow', kind: 'glyph', value: '32rpx' },
  { file: 'pages/memory/edit/edit.wxss', selector: '.form-picker-arrow', kind: 'glyph', value: '32rpx' },
  { file: 'pages/bind/bind.wxss', selector: '.hero-icon', kind: 'glyph', value: '120rpx' },
  { file: 'pages/bind/bind.wxss', selector: '.hero-title', kind: 'display', value: '48rpx' },
  { file: 'pages/bind/bind.wxss', selector: '.code-input', kind: 'display', value: '40rpx' },
  { file: 'pages/settings/settings.wxss', selector: '.profile-avatar', kind: 'glyph', value: '72rpx' },
  { file: 'pages/settings/settings.wxss', selector: '.menu-icon', kind: 'glyph', value: '32rpx' },
  { file: 'pages/settings/settings.wxss', selector: '.menu-arrow', kind: 'glyph', value: '32rpx' },
  { file: 'pages/settings/settings.wxss', selector: '.room-code-value', kind: 'display', value: '36rpx' }
]

function readAppTokens() {
  const tokens = {}
  for (const rule of parseWxssRules(fs.readFileSync(APP_WXSS, 'utf8'))) {
    for (const [prop, value] of Object.entries(rule.decls)) {
      if (prop.startsWith('--')) tokens[prop] = value
    }
  }
  return tokens
}

test('app.wxss defines every shared font-size role token with the contract value', () => {
  const tokens = readAppTokens()
  for (const [name, value] of Object.entries(FONT_ROLE_TOKENS)) {
    assert.equal(tokens[name], value, `${name} should be ${value}, got ${tokens[name]}`)
  }
})

test('DESIGN.md registers every shared font-size role token', () => {
  const design = fs.readFileSync(DESIGN_MD, 'utf8')
  for (const name of Object.keys(FONT_ROLE_TOKENS)) {
    assert.ok(design.includes(name), `DESIGN.md is missing the ${name} role registration`)
  }
})

test('every WXSS font-size uses a role token or a registered glyph/display exception', () => {
  const tokens = readAppTokens()
  const exceptions = new Map(
    TYPOGRAPHY_EXCEPTIONS.map((entry) => [`${entry.file}::${entry.selector}`, entry])
  )
  const violations = []

  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseWxssRules(fs.readFileSync(file, 'utf8'))) {
      const fontSize = rule.decls['font-size']
      if (!fontSize) continue
      for (const selector of rule.selectors) {
        const tokenRef = /^var\((--font-size-[a-z-]+)\)$/.exec(fontSize)
        if (tokenRef) {
          if (!Object.prototype.hasOwnProperty.call(FONT_ROLE_TOKENS, tokenRef[1])) {
            violations.push(`${relative} ${selector}: unknown role token ${tokenRef[1]}`)
          } else if (tokens[tokenRef[1]] !== FONT_ROLE_TOKENS[tokenRef[1]]) {
            violations.push(`${relative} ${selector}: ${tokenRef[1]} no longer defined in app.wxss`)
          }
          continue
        }
        const exception = exceptions.get(`${relative}::${selector}`)
        if (!exception) {
          violations.push(`${relative} ${selector}: literal font-size ${fontSize} is not a role token`)
        } else if (exception.value !== fontSize) {
          violations.push(
            `${relative} ${selector}: font-size ${fontSize} drifted from registered exception ${exception.value}`
          )
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('typography exception registry has no stale entries', () => {
  const stale = []
  for (const entry of TYPOGRAPHY_EXCEPTIONS) {
    const file = path.join(repoRoot, entry.file)
    if (!fs.existsSync(file)) {
      stale.push(`${entry.file} ${entry.selector}: file missing`)
      continue
    }
    const found = parseWxssRules(fs.readFileSync(file, 'utf8')).some(
      (rule) => rule.selectors.includes(entry.selector) && rule.decls['font-size'] === entry.value
    )
    if (!found) stale.push(`${entry.file} ${entry.selector}: no matching font-size ${entry.value}`)
  }
  assert.deepEqual(stale, [])
})

test('glyph and display exceptions stay above the in-cell micro floor', () => {
  for (const entry of TYPOGRAPHY_EXCEPTIONS) {
    const size = Number(/^(\d+(?:\.\d+)?)rpx$/.exec(entry.value)?.[1])
    assert.ok(size >= 24, `${entry.file} ${entry.selector} exception ${entry.value} is below 24rpx`)
  }
})

// 字重 / 行高 / 字距契约来自 issue #62 角色表，不是从页面现值为自己回推。
// 数值只允许出现在 app.wxss token；页面引用 var(--font-weight-*) 等角色 token。
const FONT_WEIGHT_ROLE_TOKENS = {
  '--font-weight-body': '400',
  '--font-weight-assist': '500',
  '--font-weight-control': '600',
  '--font-weight-title': '700'
}
const LINE_HEIGHT_ROLE_TOKENS = {
  '--line-height-body': '1.6',
  '--line-height-assist': '1.4',
  '--line-height-title': '1.2'
}
const LETTER_SPACING_ROLE_TOKENS = {
  '--letter-spacing-assist': '1rpx',
  '--letter-spacing-room-code': '6rpx',
  '--letter-spacing-code-input': '12rpx'
}

const WEIGHT_VAR = {
  body: 'var(--font-weight-body)',
  assist: 'var(--font-weight-assist)',
  control: 'var(--font-weight-control)',
  title: 'var(--font-weight-title)'
}

// 共享文字角色。今天复用标题字重 700，作为相对普通日期 600 的语义强调，不另设第五档。
const TEXT_WEIGHT_ROLES = [
  ['app.wxss', '.nav-title', 'title'],
  ['app.wxss', '.btn-premium', 'control'],
  ['app.wxss', '.btn-danger', 'control'],
  ['pages/index/index.wxss', '.month-title', 'title'],
  ['pages/index/index.wxss', '.sheet-title', 'title'],
  ['pages/index/index.wxss', '.no-room-title', 'title'],
  ['pages/index/index.wxss', '.day-num', 'control'],
  ['pages/index/index.wxss', '.day-cell.today .day-num', 'title'],
  ['pages/index/index.wxss', '.day-lunar', 'assist'],
  ['pages/index/index.wxss', '.day-tag', 'assist'],
  ['pages/index/index.wxss', '.predict-mark', 'assist'],
  ['pages/index/index.wxss', '.week-cell', 'assist'],
  ['pages/index/index.wxss', '.sync-text', 'assist'],
  ['pages/index/index.wxss', '.stat-label', 'assist'],
  ['pages/index/index.wxss', '.stat-num', 'control'],
  ['pages/index/index.wxss', '.predict-date', 'control'],
  ['pages/index/index.wxss', '.predict-weekday', 'assist'],
  ['pages/index/index.wxss', '.reminder-title', 'assist'],
  ['pages/index/index.wxss', '.reminder-text', 'assist'],
  ['pages/index/index.wxss', '.reminder-action', 'control'],
  ['pages/index/index.wxss', '.quick-text', 'control'],
  ['pages/index/index.wxss', '.empty-guide-text', 'assist'],
  ['pages/index/index.wxss', '.record-entry-title', 'body'],
  ['pages/index/index.wxss', '.no-room-desc', 'assist'],
  ['pages/index/index.wxss', '.jump-today-label', 'control'],
  ['pages/index/index.wxss', '.jump-today-date', 'assist'],
  ['pages/index/index.wxss', '.jump-section-title', 'assist'],
  ['pages/index/index.wxss', '.jump-year-value', 'control'],
  ['pages/index/index.wxss', '.jump-option', 'control'],
  ['pages/index/index.wxss', '.jump-confirm', 'control'],
  ['pages/index/index.wxss', '.sheet-subtitle', 'assist'],
  ['pages/index/index.wxss', '.sheet-action-title', 'body'],
  ['pages/index/index.wxss', '.sheet-action-desc', 'assist'],
  ['pages/index/index.wxss', '.detail-empty-title', 'body'],
  ['pages/index/index.wxss', '.detail-empty-desc', 'assist'],
  ['pages/index/index.wxss', '.detail-meaning-title', 'assist'],
  ['pages/index/index.wxss', '.detail-meaning-text', 'assist'],
  ['pages/index/index.wxss', '.detail-title', 'assist'],
  ['pages/index/index.wxss', '.detail-main', 'body'],
  ['pages/index/index.wxss', '.detail-meta', 'assist'],
  ['pages/index/index.wxss', '.meaning-tool-icon', 'control'],
  ['pages/index/index.wxss', '.meaning-tool-text', 'control'],
  ['pages/index/index.wxss', '.legend-symbol', 'assist'],
  ['pages/index/index.wxss', '.legend-title', 'body'],
  ['pages/index/index.wxss', '.legend-text', 'assist'],
  ['pages/index/index.wxss', '.prediction-summary', 'body'],
  ['pages/index/index.wxss', '.explain-line', 'assist'],
  ['pages/index/index.wxss', '.recap-summary', 'assist'],
  ['pages/index/index.wxss', '.recap-highlight', 'assist'],
  ['pages/index/index.wxss', '.copy-recap', 'control'],
  ['pages/bind/bind.wxss', '.hero-title', 'title'],
  ['pages/bind/bind.wxss', '.hero-desc', 'assist'],
  ['pages/bind/bind.wxss', '.tab', 'control'],
  ['pages/bind/bind.wxss', '.tab.active', 'control'],
  ['pages/bind/bind.wxss', '.info-text', 'assist'],
  ['pages/bind/bind.wxss', '.code-input', 'body'],
  ['pages/bind/bind.wxss', '.bound-status', 'body'],
  ['pages/bind/bind.wxss', '.bound-code', 'control'],
  ['pages/bind/bind.wxss', '.error-msg', 'assist'],
  ['pages/settings/settings.wxss', '.profile-name', 'title'],
  ['pages/settings/settings.wxss', '.profile-desc', 'assist'],
  ['pages/settings/settings.wxss', '.menu-text', 'body'],
  ['pages/settings/settings.wxss', '.room-code-label', 'assist'],
  ['pages/settings/settings.wxss', '.room-code-value', 'control'],
  ['pages/settings/settings.wxss', '.room-code-value.muted', 'body'],
  ['pages/settings/settings.wxss', '.copy-btn', 'control'],
  ['pages/settings/settings.wxss', '.density-menu-desc', 'assist'],
  ['pages/settings/settings.wxss', '.density-option', 'control'],
  ['pages/period/period.wxss', '.card-label', 'assist'],
  ['pages/period/period.wxss', '.cycle-num', 'control'],
  ['pages/period/period.wxss', '.cycle-label', 'assist'],
  ['pages/period/period.wxss', '.item-date', 'body'],
  ['pages/period/period.wxss', '.item-note', 'assist'],
  ['pages/period/period.wxss', '.item-tag', 'assist'],
  ['pages/period/period.wxss', '.item-duration', 'assist'],
  ['pages/period/period.wxss', '.empty-state', 'body'],
  ['pages/period/edit/edit.wxss', '.form-label', 'assist'],
  ['pages/period/edit/edit.wxss', '.form-hint', 'assist'],
  ['pages/period/edit/edit.wxss', '.form-picker', 'body'],
  ['pages/period/edit/edit.wxss', '.form-input', 'body'],
  ['pages/period/edit/edit.wxss', '.symptom-group-label', 'assist'],
  ['pages/period/edit/edit.wxss', '.flow-chip', 'control'],
  ['pages/period/edit/edit.wxss', '.symptom-chip', 'control'],
  ['pages/memory/memory.wxss', '.memory-date', 'body'],
  ['pages/memory/memory.wxss', '.memory-note', 'assist'],
  ['pages/memory/memory.wxss', '.empty-state', 'body'],
  ['pages/memory/edit/edit.wxss', '.form-label', 'assist'],
  ['pages/memory/edit/edit.wxss', '.form-picker', 'body'],
  ['pages/memory/edit/edit.wxss', '.form-input', 'body']
]

// 圆点、心形、步进箭头留在图标槽里，不进文字字重角色，避免改图标观感。
const GLYPH_WEIGHT_HOLDS = [
  { file: 'pages/index/index.wxss', selector: '.record-entry-icon', value: '800' },
  { file: 'pages/index/index.wxss', selector: '.jump-year-step', value: '800' },
  { file: 'pages/index/index.wxss', selector: '.sheet-action-icon', value: '800' }
]

const TABULAR_NUMERIC = [
  ['pages/index/index.wxss', '.day-num'],
  ['pages/index/index.wxss', '.predict-date'],
  ['pages/index/index.wxss', '.jump-year-value'],
  ['pages/index/index.wxss', '.stat-num'],
  ['pages/period/period.wxss', '.cycle-num'],
  ['pages/period/period.wxss', '.item-date'],
  ['pages/memory/memory.wxss', '.memory-date'],
  ['pages/settings/settings.wxss', '.room-code-value'],
  ['pages/bind/bind.wxss', '.bound-code']
]

const ASSIST_TRACKING = [
  ['pages/period/edit/edit.wxss', '.form-label'],
  ['pages/memory/edit/edit.wxss', '.form-label'],
  ['pages/period/edit/edit.wxss', '.form-hint'],
  ['pages/period/edit/edit.wxss', '.symptom-group-label'],
  ['pages/settings/settings.wxss', '.profile-desc'],
  ['pages/settings/settings.wxss', '.room-code-label'],
  ['pages/period/period.wxss', '.card-label'],
  ['pages/index/index.wxss', '.empty-guide-text']
]

const NATURAL_TRACKING = [
  ['app.wxss', '.nav-title'],
  ['app.wxss', '.btn-premium'],
  ['pages/index/index.wxss', '.month-title'],
  ['pages/index/index.wxss', '.week-cell'],
  ['pages/index/index.wxss', '.day-lunar'],
  ['pages/index/index.wxss', '.day-tag'],
  ['pages/index/index.wxss', '.predict-mark'],
  ['pages/bind/bind.wxss', '.hero-title'],
  ['pages/index/index.wxss', '.jump-year-value']
]

const BODY_LINE_HEIGHT = [
  ['pages/index/index.wxss', '.prediction-summary'],
  ['pages/index/index.wxss', '.detail-main'],
  ['pages/period/period.wxss', '.empty-state'],
  ['pages/memory/memory.wxss', '.empty-state']
]

function ruleMap(relative) {
  const map = new Map()
  for (const rule of parseWxssRules(fs.readFileSync(path.join(repoRoot, relative), 'utf8'))) {
    for (const selector of rule.selectors) {
      if (!map.has(selector)) map.set(selector, rule.decls)
    }
  }
  return map
}

test('app.wxss defines shared weight, line-height, and letter-spacing roles', () => {
  const tokens = readAppTokens()
  for (const [name, value] of Object.entries({
    ...FONT_WEIGHT_ROLE_TOKENS,
    ...LINE_HEIGHT_ROLE_TOKENS,
    ...LETTER_SPACING_ROLE_TOKENS
  })) {
    assert.equal(tokens[name], value, `${name} should be ${value}, got ${tokens[name]}`)
  }
})

test('DESIGN.md registers the same weight, line-height, and letter-spacing role values', () => {
  const design = fs.readFileSync(DESIGN_MD, 'utf8')
  for (const [name, value] of Object.entries({
    ...FONT_WEIGHT_ROLE_TOKENS,
    ...LINE_HEIGHT_ROLE_TOKENS,
    ...LETTER_SPACING_ROLE_TOKENS
  })) {
    const namePattern = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const valuePattern = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(
      design,
      new RegExp(`${namePattern}\`\\s*\\|\\s*\`${valuePattern}\``),
      `DESIGN.md must register ${name} as ${value}`
    )
  }
  assert.match(design, /今天/)
  assert.match(design, /统计数字/)
  assert.match(design, /字形/)
  assert.match(design, /不保留\s*800/)
})

test('shared text uses the four weight roles and does not invent a fifth weight', () => {
  const cache = new Map()
  const violations = []
  for (const [file, selector, role] of TEXT_WEIGHT_ROLES) {
    if (!cache.has(file)) cache.set(file, ruleMap(file))
    const decls = cache.get(file).get(selector)
    if (!decls) {
      violations.push(`${file} ${selector}: missing rule`)
      continue
    }
    if (decls['font-weight'] !== WEIGHT_VAR[role]) {
      violations.push(`${file} ${selector}: expected ${WEIGHT_VAR[role]}, got ${decls['font-weight']}`)
    }
  }
  assert.deepEqual(violations, [])
})

test('literal font-weight survives only on registered icon glyphs', () => {
  const allowed = new Map(GLYPH_WEIGHT_HOLDS.map((entry) => [`${entry.file}::${entry.selector}`, entry.value]))
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseWxssRules(fs.readFileSync(file, 'utf8'))) {
      const weight = rule.decls['font-weight']
      if (!weight) continue
      for (const selector of rule.selectors) {
        if (/^var\(--font-weight-(body|assist|control|title)\)$/.test(weight)) continue
        const key = `${relative}::${selector}`
        if (allowed.get(key) !== weight) {
          violations.push(`${key}: font-weight ${weight} is outside the four text roles`)
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('calendar dates and scanned numbers use tabular figures', () => {
  const cache = new Map()
  for (const [file, selector] of TABULAR_NUMERIC) {
    if (!cache.has(file)) cache.set(file, ruleMap(file))
    const decls = cache.get(file).get(selector)
    assert.ok(decls, `missing ${file} ${selector}`)
    assert.equal(decls['font-variant-numeric'], 'tabular-nums', `${file} ${selector}`)
  }
  const today = ruleMap('pages/index/index.wxss').get('.day-cell.today .day-num')
  assert.equal(today['font-variant-numeric'], undefined, 'today inherits tabular figures from .day-num')
  const compact = ruleMap('pages/index/index.wxss').get('.calendar-density-compact .day-num')
  assert.equal(compact['font-weight'], undefined, 'compact date size must not override the shared date weight')
  assert.equal(compact['font-variant-numeric'], undefined)
  assert.equal(compact['letter-spacing'], undefined)
})

test('assist tracking is one token, and tight or single-character text stays natural', () => {
  const cache = new Map()
  const declsOf = (file, selector) => {
    if (!cache.has(file)) cache.set(file, ruleMap(file))
    return cache.get(file).get(selector)
  }
  for (const [file, selector] of ASSIST_TRACKING) {
    assert.equal(
      declsOf(file, selector)['letter-spacing'],
      'var(--letter-spacing-assist)',
      `${file} ${selector}`
    )
  }
  for (const [file, selector] of NATURAL_TRACKING) {
    assert.equal(declsOf(file, selector)['letter-spacing'], undefined, `${file} ${selector} must not add tracking`)
  }
  assert.equal(
    declsOf('pages/settings/settings.wxss', '.room-code-value')['letter-spacing'],
    'var(--letter-spacing-room-code)'
  )
  assert.equal(
    declsOf('pages/bind/bind.wxss', '.bound-code')['letter-spacing'],
    'var(--letter-spacing-room-code)'
  )
  assert.equal(
    declsOf('pages/bind/bind.wxss', '.code-input')['letter-spacing'],
    'var(--letter-spacing-code-input)'
  )
  assert.equal(declsOf('pages/settings/settings.wxss', '.room-code-value.muted')['letter-spacing'], '0')

  const allowed = new Set([
    ...Object.keys(LETTER_SPACING_ROLE_TOKENS).map((name) => `var(${name})`),
    '0'
  ])
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseWxssRules(fs.readFileSync(file, 'utf8'))) {
      const spacing = rule.decls['letter-spacing']
      if (!spacing) continue
      if (!allowed.has(spacing)) {
        violations.push(`${relative} ${rule.selectors.join(', ')}: letter-spacing ${spacing}`)
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('flowing body copy uses the body line-height role', () => {
  const cache = new Map()
  for (const [file, selector] of BODY_LINE_HEIGHT) {
    if (!cache.has(file)) cache.set(file, ruleMap(file))
    const decls = cache.get(file).get(selector)
    assert.equal(decls['line-height'], 'var(--line-height-body)', `${file} ${selector}`)
    assert.equal(decls['font-weight'], 'var(--font-weight-body)', `${file} ${selector}`)
  }
})

// 单行控件、基线对齐和胶囊盒高保留局部行高；阅读行高必须走角色 token。
const LOCAL_LINE_HEIGHT = new Map([
  ['pages/index/index.wxss::.sync-text', '1.25'],
  ['pages/index/index.wxss::.predict-date', '1.15'],
  ['pages/index/index.wxss::.predict-weekday', '1.15'],
  ['pages/index/index.wxss::.record-entry-title', '1.25'],
  ['pages/index/index.wxss::.sheet-action-title', '1.25'],
  ['pages/index/index.wxss::.legend-title', '1.25'],
  ['pages/period/edit/edit.wxss::.flow-chip', '1.2'],
  ['pages/period/edit/edit.wxss::.symptom-chip', '1.2']
])

test('reading line-heights use the shared role tokens', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseWxssRules(fs.readFileSync(file, 'utf8'))) {
      const lineHeight = rule.decls['line-height']
      if (!lineHeight) continue
      if (/^var\(--line-height-(body|assist|title)\)$/.test(lineHeight)) continue
      if (/^\d+(?:\.\d+)?rpx$/.test(lineHeight) || lineHeight === '1') continue
      for (const selector of rule.selectors) {
        const key = `${relative}::${selector}`
        if (LOCAL_LINE_HEIGHT.get(key) !== lineHeight) {
          violations.push(`${key}: line-height ${lineHeight} is not a shared reading role`)
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('system font stack is still the only face and weight roles do not add a font file', () => {
  const app = fs.readFileSync(APP_WXSS, 'utf8')
  assert.match(app, /font-family:\s*-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', sans-serif;/)
  assert.doesNotMatch(app, /@font-face/)
})
