const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { declarations, parseWxssRules } = require('./designTokens')
const { readRaw, readSource } = require('./sourceFiles')

const repoRoot = path.join(__dirname, '..')
const SHARED = 'pages/shared/retry-row.wxss'

function assertSharedRoseRow(file, row) {
  const base = declarations(file, row)
  assert.equal(base.position, 'relative')
  assert.equal(base.width, '100%')
  assert.equal(base['box-sizing'], 'border-box')
  assert.equal(base['min-height'], '88rpx')
  assert.equal(base.display, 'flex')
  assert.equal(base.padding, '0 28rpx')
  assert.equal(base['border-radius'], 'var(--radius-md)')
  assert.equal(base.background, 'var(--glass-fallback)')
  assert.equal(base.border, '1px solid rgba(255,255,255,0.1)')
  assert.equal(base.color, '#E8909E')
  assert.equal(base['font-size'], 'var(--font-size-caption)')
  assert.equal(base['font-weight'], 'var(--font-weight-control)')
  assert.equal(base['line-height'], 'var(--line-height-assist)')

  const hover = `${row}.${row.slice(1)}-hover`
  assert.equal(declarations(file, `${row}:active`).transform, 'scale(0.98)')
  assert.equal(declarations(file, hover).transform, 'scale(0.98)')
  assert.equal(declarations(file, `${row}:active`)['border-color'], 'rgba(255,255,255,0.14)')
  assert.equal(declarations(file, `${row}::before`)['background-color'], 'rgba(255,255,255,0.05)')
  assert.equal(declarations(file, `${row}:active::before`)['background-color'], 'rgba(255,255,255,0.09)')
}

function assertOnlyLocalMargins(file, row, allowed = []) {
  const localRules = parseWxssRules(readRaw(file))
    .filter(rule => rule.selectors.some(selector => selector === row || selector.startsWith(`${row}:`) || selector.startsWith(`${row}.`) || selector.startsWith(`${row}::`)))
  for (const rule of localRules) {
    assert.deepEqual(Object.keys(rule.decls).sort(), allowed.slice().sort(), `${file} keeps only retry-row placement locally`)
  }
}

test('home refresh retry imports the shared full-row rose sentence style', () => {
  const file = 'pages/index/index.wxss'
  assert.ok(fs.existsSync(path.join(repoRoot, SHARED)), 'the shared retry stylesheet must exist')
  assert.match(readRaw(file), /@import '\.\.\/shared\/retry-row\.wxss';/)
  assertSharedRoseRow(file, '.refresh-retry')
  assertOnlyLocalMargins(file, '.refresh-retry')
})

test('record refresh retries use the same rose row without nested retry blocks', () => {
  const file = 'pages/period/period.wxss'
  assert.match(readRaw(file), /@import '\.\.\/shared\/retry-row\.wxss';/)
  assertSharedRoseRow(file, '.list-retry')
  assertOnlyLocalMargins(file, '.list-retry', ['margin-top'])

  const wxml = readSource(path.join(repoRoot, 'pages/period/period.wxml'), 'utf8')
  const rows = [...wxml.matchAll(/<view wx:if="\{\{(?:loadFailed && hasLoaded && !loading|memoryLoadFailed && memoryHasLoaded && !memoryLoading)\}\}" class="list-retry"[\s\S]*?<\/view>/g)]
  assert.equal(rows.length, 2, 'both record segments keep their refresh retry row')
  for (const [row] of rows) assert.doesNotMatch(row, /retry-btn/, 'the whole rose sentence is the retry control')
})

test('bind validation retry shares the rose row while its error strip stays warning red', () => {
  const file = 'pages/bind/bind.wxss'
  assert.match(readRaw(file), /@import '\.\.\/shared\/retry-row\.wxss';/)
  assertSharedRoseRow(file, '.error-retry')
  assertOnlyLocalMargins(file, '.error-retry', ['margin-top'])

  const error = declarations(file, '.error-msg')
  assert.equal(error.color, 'var(--color-danger)')
  assert.match(error.background, /rgba\(249,\s*115,\s*115,\s*0\.1\)/)
  assert.match(error.border, /rgba\(249,\s*115,\s*115,\s*0\.24\)/)
  const wxml = readSource(path.join(repoRoot, 'pages/bind/bind.wxml'), 'utf8')
  assert.match(wxml, /class="error-retry" bindtap="retryCheck"/)
})
