const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { listWxmlFiles, parseWxssRules } = require('./designTokens')
const { readRaw } = require('./sourceFiles')
const { wxmlOpeningTags } = require('./wxmlTemplate')

const repoRoot = path.join(__dirname, '..')
const SHARED = 'pages/shared/glass-buttons.wxss'

function rawDeclarations(relative, selector) {
  const rule = parseWxssRules(readRaw(relative)).find(candidate => candidate.selectors.includes(selector))
  assert.ok(rule, `expected ${selector} in ${relative}`)
  return rule.decls
}

function assertEveryInstanceHasBase(baseClass, modifierClasses, excludedClasses = []) {
  const matches = []
  for (const file of listWxmlFiles(repoRoot)) {
    for (const node of wxmlOpeningTags(readRaw(path.relative(repoRoot, file)))) {
      if (!modifierClasses.some(className => node.classes.includes(className))) continue
      if (excludedClasses.some(className => node.classes.includes(className))) continue
      matches.push(node)
      assert.ok(node.classes.includes(baseClass), `${node.classes.join(' ')} must use ${baseClass}`)
    }
  }
  assert.ok(matches.length > 0, `expected instances of ${modifierClasses.join(', ')}`)
}

test('glass surfaces share one structural base while modifiers keep their tint and stroke values', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, SHARED)), 'the shared glass/button stylesheet must exist')
  assert.match(readRaw('app.wxss'), /@import '\.\/pages\/shared\/glass-buttons\.wxss';/)
  assert.deepEqual(rawDeclarations(SHARED, '.glass-surface'), {
    position: 'relative',
    overflow: 'hidden'
  })

  const modifiers = [
    ['app.wxss', '.premium-card', 'linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback)', '1px solid rgba(255,255,255,0.12)'],
    ['pages/index/index.wxss', '.month-nav', 'linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback)', '1px solid rgba(255,255,255,0.15)'],
    ['pages/period/period.wxss', '.cycle-card', 'linear-gradient(135deg, rgba(232,144,158,0.18), rgba(196,160,210,0.12)), var(--glass-fallback)', '1px solid rgba(255,255,255,0.12)'],
    ['pages/period/period.wxss', '.skeleton-card', 'linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback)', '1px solid rgba(255,255,255,0.12)']
  ]
  for (const [file, selector, background, border] of modifiers) {
    const decls = rawDeclarations(file, selector)
    assert.equal(decls.background, background, `${selector} keeps its rendered tint`)
    assert.equal(decls.border, border, `${selector} keeps its rendered stroke`)
    const selfContainedPremiumCard = file === 'app.wxss' && selector === '.premium-card'
    assert.equal(
      decls.position,
      selfContainedPremiumCard ? 'relative' : undefined,
      selfContainedPremiumCard ? '.premium-card owns its pseudo-element positioning' : `${selector} leaves position to the shared base`
    )
    assert.equal(
      decls.overflow,
      selfContainedPremiumCard ? 'hidden' : undefined,
      selfContainedPremiumCard ? '.premium-card clips its own prism hairline' : `${selector} leaves clipping to the shared base`
    )
  }
  assertEveryInstanceHasBase('glass-surface', ['premium-card', 'cycle-card', 'month-nav', 'skeleton-card'])
})

test('rose fill buttons share one flex and positioning base while modifiers keep their rendered values', () => {
  assert.deepEqual(rawDeclarations(SHARED, '.button-primary'), {
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    position: 'relative'
  })

  const modifiers = [
    ['app.wxss', '.btn-premium', 'var(--radius-md)'],
    ['pages/index/index.wxss', '.quick-btn', 'var(--radius-card)'],
    ['pages/index/index.wxss', '.copy-recap', 'var(--radius-md)'],
    ['pages/shared/room-code.wxss', '.copy-btn', 'var(--radius-sm)']
  ]
  for (const [file, selector, radius] of modifiers) {
    const decls = rawDeclarations(file, selector)
    assert.equal(decls.background, 'var(--aurora-pink)', `${selector} keeps its rose fill`)
    assert.equal(decls.color, 'var(--text-on-accent)', `${selector} keeps its navy label`)
    assert.equal(decls['border-radius'], radius, `${selector} keeps its radius modifier`)
    for (const property of ['display', 'align-items', 'justify-content', 'position']) {
      assert.equal(decls[property], undefined, `${selector} leaves ${property} to the shared base`)
    }
  }
  assertEveryInstanceHasBase('button-primary', ['btn-premium', 'quick-btn', 'copy-recap', 'copy-btn'], ['btn-ghost'])
})

test('warning buttons share one overlay structure while button and menu modifiers keep their red values', () => {
  assert.deepEqual(rawDeclarations(SHARED, '.button-danger'), {
    position: 'relative',
    'z-index': '0'
  })
  assert.deepEqual(rawDeclarations(SHARED, '.button-danger::before'), {
    content: "''",
    position: 'absolute',
    top: '0',
    right: '0',
    bottom: '0',
    left: '0',
    'pointer-events': 'none',
    'z-index': '-1'
  })

  for (const [file, selector] of [
    ['app.wxss', '.btn-danger'],
    ['pages/settings/settings.wxss', '.menu-item.danger']
  ]) {
    const decls = rawDeclarations(file, selector)
    assert.equal(decls.background, 'var(--glass-fallback)', `${selector} keeps its navy fallback`)
    assert.equal(decls.border, '1px solid rgba(249,115,115,0.28)', `${selector} keeps its red stroke`)
    assert.equal(decls.position, undefined, `${selector} leaves position to the shared base`)
    assert.equal(decls['z-index'], undefined, `${selector} leaves stacking to the shared base`)

    const overlay = rawDeclarations(file, `${selector}::before`)
    assert.equal(overlay['background-color'], 'var(--glass-bg)', `${selector} keeps its resting tint`)
    assert.equal(overlay['border-radius'], 'var(--radius-md)', `${selector} keeps its overlay radius`)
    for (const property of ['content', 'position', 'top', 'right', 'bottom', 'left', 'pointer-events', 'z-index']) {
      assert.equal(overlay[property], undefined, `${selector} leaves ${property} to the shared overlay`)
    }
  }
  assertEveryInstanceHasBase('button-danger', ['btn-danger'])
  assertEveryInstanceHasBase('button-danger', ['danger'])
})

test('secondary outline buttons share one flex base while ghost, confirmation and room modifiers keep their values', () => {
  assert.deepEqual(rawDeclarations(SHARED, '.button-outline'), {
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    position: 'relative'
  })

  const modifiers = [
    ['pages/bind/bind.wxss', '.btn-ghost', 'transparent', 'var(--aurora-pink)', '1.5px solid var(--aurora-pink)', 'var(--radius-full)'],
    ['pages/index/index.wxss', '.quick-btn.btn-ghost', 'var(--aurora-bg)', 'var(--aurora-pink)', '1.5px solid var(--aurora-pink)', 'var(--radius-card)'],
    ['pages/shared/confirmation-sheet.wxss', '.confirmation-secondary', 'transparent', 'var(--aurora-pink)', '1px solid rgba(232,144,158,0.45)', 'var(--radius-md)'],
    ['pages/settings/settings.wxss', '.room-action-btn', 'rgba(232,144,158,0.08)', 'var(--aurora-pink)', '1px solid rgba(232,144,158,0.45)', 'var(--radius-sm)']
  ]
  for (const [file, selector, background, color, border, radius] of modifiers) {
    const decls = rawDeclarations(file, selector)
    assert.equal(decls.background, background, `${selector} keeps its rendered fill`)
    assert.equal(decls.color, color, `${selector} keeps its rendered label`)
    assert.equal(decls.border, border, `${selector} keeps its rendered stroke`)
    assert.equal(decls['border-radius'], radius, `${selector} keeps its radius modifier`)
    for (const property of ['display', 'align-items', 'justify-content', 'position']) {
      assert.equal(decls[property], undefined, `${selector} leaves ${property} to the shared base`)
    }
  }
  assertEveryInstanceHasBase('button-outline', ['btn-ghost', 'confirmation-secondary', 'room-action-btn'])
})
