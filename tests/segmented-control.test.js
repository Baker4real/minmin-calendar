const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { declarations, parseWxssRules } = require('./designTokens')
const { readRaw } = require('./sourceFiles')

const repoRoot = path.join(__dirname, '..')
const SHARED = 'pages/shared/segmented-control.wxss'
const PAGES = [
  { file: 'pages/bind/bind.wxss', container: '.tab-bar', option: '.tab', variant: 'card' },
  { file: 'pages/period/period.wxss', container: '.segment-control', option: '.segment-option', variant: 'canvas' },
  { file: 'pages/settings/settings.wxss', container: '.density-control', option: '.density-option', variant: 'card' }
]

test('bind, record and settings segmented options share the 26rpx quiet-rose option contract', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, SHARED)), 'the shared segmented stylesheet must exist')

  for (const { file, option } of PAGES) {
    assert.match(
      readRaw(file),
      /@import '\.\.\/shared\/segmented-control\.wxss';/,
      `${file} imports the one shared segmented stylesheet`
    )
    const localOptionRules = parseWxssRules(readRaw(file))
      .filter(rule => rule.selectors.some(selector => selector === option || selector.startsWith(`${option}.`) || selector.startsWith(`${option}:`)))
    assert.deepEqual(localOptionRules, [], `${file} must not keep a local option-style copy`)

    const base = declarations(file, option)
    assert.equal(base['font-size'], 'var(--font-size-caption)')
    assert.match(base.color, /^rgba\(255,255,255,/)
    assert.equal(base['border-radius'], 'var(--radius-md)')
    assert.equal(base['min-height'], '88rpx')
    const defaultRule = parseWxssRules(readRaw(SHARED))
      .find(rule => rule.selectors.includes(option) && rule.decls.transition)
    assert.match(defaultRule.decls.transition, /border-color var\(--duration-state\) ease/)

    const active = declarations(file, `${option}.active`)
    assert.equal(active.color, 'var(--aurora-pink)')
    assert.equal(active.background, 'rgba(232,144,158,0.08)')
    assert.equal(active['border-color'], 'rgba(232,144,158,0.45)')

    const activePressed = declarations(file, `${option}:active.active`)
    assert.equal(activePressed.background, 'rgba(232,144,158,0.14)')
    assert.equal(activePressed['border-color'], 'rgba(232,144,158,0.58)')
  }
})

test('segmented containers use the canvas variant only outside cards and retain 10rpx option gaps', () => {
  for (const { file, container, variant } of PAGES) {
    const box = declarations(file, container)
    assert.equal(box.display, 'grid')
    assert.equal(box['grid-template-columns'], 'repeat(2, minmax(0, 1fr))')
    assert.equal(box.gap, '10rpx')

    if (variant === 'canvas') {
      assert.equal(box.padding, '4rpx')
      assert.equal(box['border-radius'], 'var(--radius-card)')
      assert.equal(
        box.background,
        'linear-gradient(rgba(255,255,255,0.055), rgba(255,255,255,0.055)), var(--glass-fallback)'
      )
      assert.equal(box.border, '1px solid rgba(255,255,255,0.11)')
    } else {
      assert.equal(box.padding, '6rpx')
      assert.equal(box['border-radius'], 'var(--radius-card)')
      assert.equal(box.background, 'rgba(10,14,39,0.45)')
      assert.equal(box.border, '1px solid rgba(255,255,255,0.07)')
    }

    const localContainerRules = parseWxssRules(readRaw(file))
      .filter(rule => rule.selectors.includes(container))
    for (const rule of localContainerRules) {
      assert.deepEqual(
        Object.keys(rule.decls),
        Object.keys(rule.decls).filter(property => property === 'margin' || property.startsWith('margin-')),
        `${file} keeps only page-specific container margins locally`
      )
    }
  }
})
