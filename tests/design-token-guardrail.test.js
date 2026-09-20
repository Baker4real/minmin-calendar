const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  PALETTE_HEXES,
  definedRadiusTokens,
  findOffPaletteHexes,
  findOffPaletteHexesInInlineStyles,
  findOffTokenRadii,
  listWxmlFiles,
  listWxssFiles
} = require('./designTokens')

const repoRoot = path.join(__dirname, '..')

test('palette registry stays normalized six-digit hex', () => {
  for (const hex of PALETTE_HEXES) {
    assert.match(hex, /^#[0-9A-F]{6}$/)
  }
})

test('palette guardrail flags hex colors outside the DESIGN.md palette', () => {
  const violations = findOffPaletteHexes('.a { color: #9ED6AE; }\n.b { background: #123456; }')
  assert.deepEqual(violations.map((v) => v.normalized), ['#9ED6AE', '#123456'])
})

test('palette guardrail accepts registered colors regardless of case or shorthand', () => {
  const css = '.a { color: #e8909e; }\n.b { color: #fff; }\n.c { background: #0a0e27; }'
  assert.deepEqual(findOffPaletteHexes(css), [])
})

test('palette guardrail ignores hex-like text inside comments', () => {
  const css = '/* removed green #9ED6AE */\n.a { color: #E8909E; }'
  assert.deepEqual(findOffPaletteHexes(css), [])
})

test('every WXSS file uses only DESIGN.md palette hex colors', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const violation of findOffPaletteHexes(fs.readFileSync(file, 'utf8'))) {
      violations.push(`${relative}:${violation.line} ${violation.hex}`)
    }
  }
  assert.deepEqual(violations, [])
})

test('inline-style guardrail flags off-palette hex in WXML style attributes', () => {
  const wxml = [
    `<view style="color: #9ED6AE">x</view>`,
    `<view style="color: {{done ? '#e8909e' : '#fff'}}">y</view>`
  ].join('\n')
  const violations = findOffPaletteHexesInInlineStyles(wxml)
  assert.deepEqual(violations.map((v) => v.normalized), ['#9ED6AE'])
})

test('inline-style guardrail ignores hex-like text outside style attributes', () => {
  const wxml = '<!-- #9ED6AE --><view class="a" data-note="#123456">#9ED6AE</view>'
  assert.deepEqual(findOffPaletteHexesInInlineStyles(wxml), [])
})

test('every WXML inline style uses only DESIGN.md palette hex colors', () => {
  const violations = []
  for (const file of listWxmlFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const violation of findOffPaletteHexesInInlineStyles(fs.readFileSync(file, 'utf8'))) {
      violations.push(`${relative}:${violation.line} ${violation.hex}`)
    }
  }
  assert.deepEqual(violations, [])
})

test('radius guardrail flags literal radii outside tokens', () => {
  const defined = new Set(['radius-md'])
  const css = [
    '.a { border-radius: 17rpx; }',
    '.b { border-radius: 50%; }',
    '.c { border-radius: 12rpx 12rpx 0 0; }'
  ].join('\n')
  const violations = findOffTokenRadii(css, defined)
  assert.deepEqual(violations.map((v) => v.component), ['17rpx', '50%', '12rpx', '12rpx'])
})

test('radius guardrail accepts tokens and zero resets', () => {
  const defined = new Set(['radius-card', 'radius-md'])
  const css = [
    '.a { border-radius: var(--radius-md); }',
    '.b { border-radius: var(--radius-card) var(--radius-card) 0 0; }',
    '.c { border-radius: 0; }'
  ].join('\n')
  assert.deepEqual(findOffTokenRadii(css, defined), [])
})

test('radius guardrail flags tokens not defined in app.wxss', () => {
  const defined = new Set(['radius-md'])
  const violations = findOffTokenRadii('.a { border-radius: var(--radius-huge); }', defined)
  assert.deepEqual(violations.map((v) => v.component), ['var(--radius-huge)'])
})

test('homepage WXSS uses only registered radius tokens', () => {
  const appTokens = definedRadiusTokens(fs.readFileSync(path.join(repoRoot, 'app.wxss'), 'utf8'))
  const indexWxss = fs.readFileSync(path.join(repoRoot, 'pages/index/index.wxss'), 'utf8')
  const violations = findOffTokenRadii(indexWxss, appTokens).map(
    (violation) => `line ${violation.line}: ${violation.component}`
  )
  assert.deepEqual(violations, [])
})
