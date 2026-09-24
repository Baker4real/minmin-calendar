const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { meetsContrast } = require('./contrast')

const CANVAS_NAVY = '#0A0E27'
const WARM_ROSE = '#E8909E'
// issue #88 绑定页粉域试点：胶囊实色粉底与深紫字（复用试点画布深端 token）
const BIND_CTA_PINK = '#FF7FB0'
const BIND_DEEP_PURPLE = '#1A1433'

function customProperties(css) {
  return Object.fromEntries(
    [...css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((match) => [`--${match[1]}`, match[2].trim()])
  )
}

// app 级 token 之外并入 bind 页面级试点 token（--bind-*）：绑定页断言按真实引用的 token 解析
const APP_TOKENS = {
  ...customProperties(fs.readFileSync(path.join(__dirname, '..', 'app.wxss'), 'utf8')),
  ...customProperties(fs.readFileSync(path.join(__dirname, '..', 'pages/bind/bind.wxss'), 'utf8'))
}

function resolveToken(value) {
  const tokenRef = /^var\((--[a-z0-9-]+)\)$/i.exec(value)
  if (!tokenRef) return value
  assert.ok(APP_TOKENS[tokenRef[1]], `unknown token ${tokenRef[1]}`)
  return APP_TOKENS[tokenRef[1]]
}

function readStylesheet(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
}

function ruleDeclarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(?:^|\\r?\\n)${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  assert.ok(match, `expected rule ${selector}`)
  return match[1]
}

function declarationValue(block, property) {
  const match = block.match(new RegExp(`(?:^|\\r?\\n)\\s*${property}\\s*:\\s*([^;]+);`))
  assert.ok(match, `expected ${property}`)
  return match[1].trim()
}

function normalizeHex(value) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)
  assert.ok(match, `expected hex color, got ${value}`)
  const hex = match[1]
  if (hex.length === 3) {
    return `#${[...hex].map((ch) => ch + ch).join('')}`.toUpperCase()
  }
  return `#${hex.toUpperCase()}`
}

function assertRoseFillNavyLabel(css, selector) {
  const block = ruleDeclarations(css, selector)
  const color = normalizeHex(resolveToken(declarationValue(block, 'color')))
  const background = normalizeHex(resolveToken(declarationValue(block, 'background')))
  assert.equal(meetsContrast(color, background), true)
  assert.equal(color, CANVAS_NAVY)
  assert.equal(background, WARM_ROSE)
}

// issue #88 粉胶囊：实色粉底 + 深紫字，对比度在实际粉底上验收（var(--bind-cta-pink) 按 token 真值 #FF7FB0 计算）
function assertPinkFillDeepPurpleLabel(css, selector) {
  const block = ruleDeclarations(css, selector)
  const color = normalizeHex(resolveToken(declarationValue(block, 'color')))
  const background = normalizeHex(resolveToken(declarationValue(block, 'background')))
  assert.equal(meetsContrast(color, background), true)
  assert.equal(color, BIND_DEEP_PURPLE)
  assert.equal(background, BIND_CTA_PINK)
}

test('.btn-premium rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet('app.wxss'), '.btn-premium')
})

test('.copy-btn rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet('pages/settings/settings.wxss'), '.copy-btn')
})

// issue #89：选中 tab 随未绑定表单域换装粉胶囊，与主按钮同族（粉底深紫字），按真实粉底验收
test('bind .tab.active pilot pill uses deep-purple label on the real pink fill at 4.5:1', () => {
  assertPinkFillDeepPurpleLabel(readStylesheet('pages/bind/bind.wxss'), '.tab.active')
})

// issue #88：绑定页主按钮族页面级覆盖为粉胶囊（app 级 .btn-premium 基类保持玫瑰），按真实粉底验收
test('bind .btn-premium pilot pill uses deep-purple label on the real pink fill at 4.5:1', () => {
  assertPinkFillDeepPurpleLabel(readStylesheet('pages/bind/bind.wxss'), '.btn-premium')
})

// issue #78 的绑定页/设置页复制键像素同款契约已随 issue #88 解除：
// 设置页保持玫瑰底海军字（上一条用例），绑定页复制键改为与主按钮同族的粉胶囊，按真实粉底验收
test('bind .copy-btn pilot pill uses deep-purple label on the real pink fill at 4.5:1', () => {
  assertPinkFillDeepPurpleLabel(readStylesheet('pages/bind/bind.wxss'), '.copy-btn')
})

// issue #55：首页主操作统一玫瑰填充 + 画布海军字（快速记录、提醒记录、月份确认、月份选中态、复制小结）
const INDEX_WXSS = 'pages/index/index.wxss'

test('.quick-btn rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet(INDEX_WXSS), '.quick-btn')
})

test('.reminder-action rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet(INDEX_WXSS), '.reminder-action')
})

test('.jump-confirm rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet(INDEX_WXSS), '.jump-confirm')
})

test('.jump-option.active rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet(INDEX_WXSS), '.jump-option.active')
})

test('.copy-recap rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet(INDEX_WXSS), '.copy-recap')
})
