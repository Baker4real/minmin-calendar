const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { declarations, parseWxssRules } = require('./designTokens')
const { readRaw } = require('./sourceFiles')
const { wxmlOpeningTags } = require('./wxmlTemplate')

const repoRoot = path.join(__dirname, '..')
const SHARED = 'pages/shared/segmented-control.wxss'
const PAGES = [
  {
    file: 'pages/bind/bind.wxss', wxml: 'pages/bind/bind.wxml', container: '.tab-bar', option: '.tab', variant: 'card',
    indexClass: "segment-thumb-index-{{tab === 'join' ? 1 : 0}}"
  },
  {
    file: 'pages/period/period.wxss', wxml: 'pages/period/period.wxml', container: '.segment-control', option: '.segment-option', variant: 'canvas',
    indexClass: "segment-thumb-index-{{segment === 'memory' ? 1 : 0}}"
  },
  {
    file: 'pages/settings/settings.wxss', wxml: 'pages/settings/settings.wxml', container: '.density-control', option: '.density-option', variant: 'card',
    indexClass: "segment-thumb-index-{{calendarDensity == 'full' ? 1 : 0}}"
  }
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
    assert.equal(active.background, 'transparent')
    assert.equal(active['border-color'], 'transparent')

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

test('record, settings and bind tracks render the selected rose-glass thumb', () => {
  for (const { wxml, indexClass } of PAGES) {
    const thumb = wxmlOpeningTags(readRaw(wxml)).find((tag) => tag.classes.includes('segment-thumb'))
    assert.ok(thumb, `${wxml} renders one shared segment-thumb`)
    assert.equal(thumb.attrs['aria-hidden'], 'true', `${wxml} keeps the decorative thumb silent`)
    assert.ok((thumb.attrs.class || '').includes(indexClass), `${wxml} binds the selected index`)
    if (wxml === 'pages/bind/bind.wxml') {
      assert.equal(thumb.attrs['wx:if'], '{{tab}}', 'bind hides the thumb until an entry is selected')
    }
  }
})

test('segment thumbs glide by selected index in two or three columns and stop under reduced motion', () => {
  const shared = readRaw(SHARED)
  const thumbRule = parseWxssRules(shared).find((rule) =>
    rule.selectors.length === 1 && rule.selectors[0] === '.segment-thumb' && rule.decls.transition !== 'none')
  assert.ok(thumbRule, 'the shared thumb declares its reversible transform transition')
  const thumb = thumbRule.decls
  assert.equal(thumb.position, 'absolute')
  assert.equal(thumb.background, 'rgba(232,144,158,0.14)')
  assert.equal(thumb.border, '1px solid rgba(232,144,158,0.48)')
  assert.equal(thumb['border-radius'], 'var(--radius-md)')
  assert.equal(thumb['pointer-events'], 'none')
  assert.equal(thumb.transition, 'transform var(--duration-state) var(--ease-out)')

  assert.equal(declarations(PAGES[0].file, '.tab-bar.segment-columns-3')['grid-template-columns'], 'repeat(3, minmax(0, 1fr))')
  assert.equal(declarations(PAGES[1].file, '.segment-control.segment-columns-3')['grid-template-columns'], 'repeat(3, minmax(0, 1fr))')
  assert.equal(declarations(PAGES[0].file, '.tab-bar .segment-thumb').width, 'calc((100% - 22rpx) / 2)')
  assert.equal(declarations(PAGES[1].file, '.segment-control .segment-thumb').width, 'calc((100% - 18rpx) / 2)')
  assert.equal(declarations(PAGES[0].file, '.tab-bar .segment-thumb.segment-thumb-columns-3').width, 'calc((100% - 32rpx) / 3)')
  assert.equal(declarations(PAGES[1].file, '.segment-control .segment-thumb.segment-thumb-columns-3').width, 'calc((100% - 28rpx) / 3)')
  assert.equal(declarations(PAGES[0].file, '.segment-thumb.segment-thumb-index-1').transform, 'translateX(calc(100% + 10rpx))')
  assert.equal(declarations(PAGES[0].file, '.segment-thumb.segment-thumb-index-2').transform, 'translateX(calc(200% + 20rpx))')

  const reduced = parseWxssRules(shared).find((rule) =>
    rule.selectors.includes('.segment-thumb') && rule.decls.transition === 'none')
  assert.ok(reduced, 'reduced motion disables the thumb translation transition')
})
