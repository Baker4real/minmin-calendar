const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { meetsContrast } = require('./contrast')

const CANVAS_NAVY = '#0A0E27'
const WARM_ROSE = '#E8909E'

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
  const color = normalizeHex(declarationValue(block, 'color'))
  const background = normalizeHex(declarationValue(block, 'background'))
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

test('bind .tab.active rose fill uses canvas-navy label at 4.5:1', () => {
  assertRoseFillNavyLabel(readStylesheet('pages/bind/bind.wxss'), '.tab.active')
})
