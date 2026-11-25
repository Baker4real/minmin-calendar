const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { listWxmlFiles, listWxssFiles, parseWxssRules } = require('./designTokens')
const { readRaw, readSource } = require('./sourceFiles')
const { wxmlOpeningTags } = require('./wxmlTemplate')

const repoRoot = path.join(__dirname, '..')
const relative = file => path.relative(repoRoot, file).replaceAll('\\', '/')

function ruleMap(css) {
  const map = new Map()
  for (const rule of parseWxssRules(css)) {
    for (const selector of rule.selectors) map.set(selector, rule.decls)
  }
  return map
}

test('shared vector masks replace every bare navigation and action glyph with hidden currentColor icons', () => {
  const iconPath = path.join(repoRoot, 'pages/shared/vector-icons.wxss')
  assert.ok(fs.existsSync(iconPath), 'pages/shared/vector-icons.wxss is the shared zero-asset icon library')
  const css = readRaw('pages/shared/vector-icons.wxss')
  const rules = ruleMap(css)
  const base = rules.get('.ui-icon')
  assert.ok(base, 'the shared icon base exists')
  assert.equal(base['background-color'], 'currentColor')
  assert.equal(base.display, 'inline-block')
  assert.ok(base['-webkit-mask-repeat'], 'WebKit mask rendering is declared')
  assert.ok(base['mask-repeat'], 'standard mask rendering is declared')

  const kinds = ['left', 'right', 'down', 'close', 'plus']
  for (const kind of kinds) {
    const decls = rules.get(`.ui-icon-${kind}`)
    assert.ok(decls, `missing .ui-icon-${kind}`)
    assert.match(decls['-webkit-mask-image'], /^url\("data:image\/svg\+xml,/)
    assert.equal(decls['mask-image'], decls['-webkit-mask-image'])
    assert.match(decls['mask-image'], /stroke-width='1\.75'/, '1.75px stroke')
    assert.match(decls['mask-image'], /stroke-linecap='round'/, 'round caps')
    assert.match(decls['mask-image'], /stroke-linejoin='round'/, 'round joins')
  }

  for (const size of [36, 28, 24]) {
    const decls = rules.get(`.ui-icon-${size}`)
    assert.ok(decls, `missing ${size}rpx optical size`)
    assert.equal(decls.width, `${size}rpx`)
    assert.equal(decls.height, `${size}rpx`)
  }
  assert.equal(rules.get('.ui-icon-circle.ui-icon-left').left, '-1.5rpx')
  assert.equal(rules.get('.ui-icon-circle.ui-icon-right').right, '-1.5rpx')
  assert.match(readRaw('app.wxss'), /@import '\.\/pages\/shared\/vector-icons\.wxss';/)

  const wxmlFiles = listWxmlFiles(repoRoot).filter(file => relative(file).startsWith('pages/'))
  const residual = []
  const observedKinds = new Set()
  let iconCount = 0
  for (const file of wxmlFiles) {
    const source = readRaw(relative(file)).replace(/<!--[\s\S]*?-->/g, '')
    if (/[‹›⌄×＋]/.test(source)) residual.push(relative(file))
    for (const tag of wxmlOpeningTags(source)) {
      if (!tag.classes.includes('ui-icon')) continue
      iconCount += 1
      assert.equal(tag.attrs['aria-hidden'], 'true', `${relative(file)} decorative icon must be hidden from screen readers`)
      assert.ok(tag.classes.some(name => /^ui-icon-(36|28|24)$/.test(name)), `${relative(file)} icon has a standard size`)
      const kind = kinds.find(name => tag.classes.includes(`ui-icon-${name}`))
      assert.ok(kind, `${relative(file)} icon has one of the five shared geometries`)
      observedKinds.add(kind)
    }
  }
  assert.deepEqual(residual, [], 'no WXML navigation/action glyph remains as a platform-font character')
  assert.ok(iconCount >= 20, 'all former glyph callers, including both record add actions, use shared icons')
  assert.deepEqual([...observedKinds].sort(), [...kinds].sort(), 'all five geometries have real callers')
})

test('typography tokens, tracked centering, capsule geometry and home rose tokens share one optical contract', () => {
  const appRules = parseWxssRules(readSource(path.join(repoRoot, 'app.wxss'), 'utf8'))
  const tokens = {}
  for (const rule of appRules) {
    for (const [property, value] of Object.entries(rule.decls)) {
      if (property.startsWith('--')) tokens[property] = value
    }
  }
  assert.equal(tokens['--line-height-snug'], '1.32')
  assert.equal(tokens['--letter-spacing-display'], '1rpx')
  assert.equal(tokens['--letter-spacing-control-sm'], '0.5rpx')

  const decls = (file, selector) => {
    const found = parseWxssRules(readRaw(file)).filter(rule => rule.selectors.includes(selector))
    assert.ok(found.length > 0, `${file} ${selector} exists`)
    return Object.assign({}, ...found.map(rule => rule.decls))
  }
  assert.equal(decls('pages/index/index.wxss', '.quick-text')['line-height'], 'var(--line-height-snug)')
  assert.equal(decls('pages/shared/confirmation-sheet.wxss', '.sheet-title')['line-height'], 'var(--line-height-snug)')
  for (const [file, selector] of [
    ['pages/period/period.wxss', '.item-date'],
    ['pages/period/period.wxss', '.memory-date'],
    ['pages/period/period.wxss', '.month-header-text'],
    ['pages/shared/record-form.wxss', '.form-picker'],
    ['pages/shared/confirmation-sheet.wxss', '.confirmation-date']
  ]) {
    assert.equal(decls(file, selector)['line-height'], 'var(--line-height-assist)', `${selector} single-line leading`)
  }

  for (const [file, selector] of [
    ['pages/shared/nav-bar.wxss', '.nav-title'],
    ['pages/index/index.wxss', '.month-title'],
    ['pages/index/index.wxss', '.no-room-title'],
    ['pages/shared/confirmation-sheet.wxss', '.sheet-title'],
    ['pages/bind/bind.wxss', '.hero-title']
  ]) {
    assert.equal(decls(file, selector)['letter-spacing'], 'var(--letter-spacing-display)', `${selector} display tracking`)
  }
  for (const [file, selector] of [
    ['pages/shared/nav-bar.wxss', '.nav-title'],
    ['pages/index/index.wxss', '.month-title'],
    ['pages/index/index.wxss', '.no-room-title'],
    ['pages/bind/bind.wxss', '.hero-title']
  ]) {
    assert.equal(decls(file, selector)['text-indent'], 'var(--letter-spacing-display)', `${selector} trailing tracking compensation`)
  }
  for (const [file, selector] of [
    ['pages/index/index.wxss', '.empty-guide-text'],
    ['pages/bind/bind.wxss', '.hero-desc'],
    ['pages/bind/bind.wxss', '.info-text'],
    ['pages/bind/bind.wxss', '.error-msg']
  ]) {
    assert.equal(decls(file, selector)['text-indent'], 'var(--letter-spacing-assist)', `${selector} centered assist tracking compensation`)
  }
  for (const selector of ['.segment-option', '.density-option', '.tab']) {
    const control = decls('pages/shared/segmented-control.wxss', selector)
    assert.equal(control['letter-spacing'], 'var(--letter-spacing-control-sm)')
    assert.equal(control['text-indent'], 'var(--letter-spacing-control-sm)')
  }

  for (const [file, selector] of [
    ['pages/period/period.wxss', '.item-tag'],
    ['pages/period/period.wxss', '.item-duration'],
    ['pages/index/index.wxss', '.day-tag'],
    ['pages/index/index.wxss', '.predict-mark'],
    ['pages/settings/settings.wxss', '.room-member-badge']
  ]) {
    const capsule = decls(file, selector)
    assert.equal(capsule.display, 'inline-flex', `${selector} uses an inline flex box`)
    assert.equal(capsule['align-items'], 'center', `${selector} vertical centering`)
    assert.equal(capsule['justify-content'], 'center', `${selector} horizontal centering`)
    assert.equal(capsule['line-height'], '1', `${selector} unit line box`)
  }
  assert.equal(decls('pages/index/index.wxss', '.calendar-density-compact .day-tag')['line-height'], '1')
  assert.doesNotMatch(readRaw('pages/index/index.wxss'), /#E8909E/i, 'home rose fills use var(--aurora-pink), not hex literals')
})

test('Chinese display copy keeps date and quantity units intact and flowing WXSS uses word boundaries', () => {
  const util = require('../utils/util')
  const cycle = require('../utils/cycle')
  const { buildMonthlyRecap } = require('../utils/calendarInsights')
  const { buildMemoryMonthGroups } = require('../utils/memoryMonthGroups')
  const wordJoiner = String.fromCharCode(0x2060)
  const nbsp = String.fromCharCode(0x00a0)

  assert.equal(
    util.formatDisplayDate('2026-06-24', { today: '2026-10-10' }),
    `6月24${wordJoiner}日`,
    'the day number and 日 are one unbreakable display unit'
  )
  const ongoing = { _id: 'p1', startDate: '2026-10-18', endDate: '', status: 'ongoing' }
  assert.equal(
    cycle.buildHomeStatusLine([ongoing], { today: '2026-10-20' }).text,
    `经期第 3${nbsp}天`,
    'visible day counts use a non-breaking half-width space'
  )
  assert.equal(
    cycle.decoratePeriod({ _id: 'p2', startDate: '2026-10-18', endDate: '2026-10-20', status: 'known-end' }, { today: '2026-10-20' }).durationText,
    `3${nbsp}天`,
    'duration capsules keep their numeric unit together'
  )
  const memories = [{ _id: 'm1', date: '2026-10-19', note: '构造点滴' }]
  assert.equal(
    buildMemoryMonthGroups(memories, { today: '2026-10-20' })[0].title,
    `2026年10月 · 1${nbsp}条`,
    'month group counts use the same non-breaking quantity space'
  )
  assert.equal(
    buildMonthlyRecap({ year: 2026, month: 9, periods: [], memories, today: '2026-10-20' }).memorySummary,
    `留下 1${nbsp}条欢乐时光`,
    'recap counts use the same non-breaking quantity space'
  )
  const bindWxml = readRaw('pages/bind/bind.wxml')
  assert.match(bindWxml, /placeholder="\{\{roomCodePlaceholder\}\}"/)
  assert.match(bindWxml, /aria-label="\{\{roomCodeInputAriaLabel\}\}"/)
  assert.doesNotMatch(bindWxml, / /, 'static room-code copy is projected by searchable JavaScript constants')
  assert.doesNotMatch(readRaw('pages/period/period.wxml'), / /, 'dynamic quantities do not hide NBSP in templates')

  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const name = relative(file)
    if (name !== 'app.wxss' && !name.startsWith('pages/')) continue
    for (const rule of parseWxssRules(readRaw(name))) {
      const noteFallback = rule.selectors.every(selector => /(?:^|[.\s])(?:item-note|memory-note|detail-note)(?:$|[.\s])/.test(selector))
      if (rule.decls['overflow-wrap'] === 'anywhere' && !noteFallback) {
        violations.push(`${name} ${rule.selectors.join(', ')}: overflow-wrap anywhere`)
      }
      if (rule.decls['word-break'] === 'break-all' || rule.decls['word-break'] === 'break-word') {
        violations.push(`${name} ${rule.selectors.join(', ')}: word-break ${rule.decls['word-break']}`)
      }
    }
  }
  assert.deepEqual(violations, [], 'only long note fallbacks may break inside an otherwise unbroken token')
})
