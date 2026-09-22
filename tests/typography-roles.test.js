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
