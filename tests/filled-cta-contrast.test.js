const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { meetsContrast } = require('./contrast')

const CANVAS_NAVY = '#0A0E27'
const WARM_ROSE = '#E8909E'

function customProperties(css) {
  return Object.fromEntries(
    [...css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((match) => [`--${match[1]}`, match[2].trim()])
  )
}

// issue #104：绑定页 --bind-* 试点 token 整体退役，断言只需解析 app 级 token
const APP_TOKENS = customProperties(fs.readFileSync(path.join(__dirname, '..', 'app.wxss'), 'utf8'))

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

test('.btn-premium rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet('app.wxss'), '.btn-premium')
})

test('.copy-btn rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet('pages/settings/settings.wxss'), '.copy-btn')
})

// issue #104：绑定页复制键回归玫瑰填充 + 画布海军字。
// issue #145：创建/加入改为描边玫瑰弱选中，不再是实色玫瑰填充，对比度不走本表。
test('bind .copy-btn rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet('pages/bind/bind.wxss'), '.copy-btn')
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
