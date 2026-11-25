const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { parseWxssRules } = require('./designTokens')
const { readSource } = require('./sourceFiles')
const { renderWxmlAttribute, wxmlOpeningTags } = require('./wxmlTemplate')

const repoRoot = path.join(__dirname, '..')
const pages = [
  ['pages/index/index.wxml', 3],
  ['pages/settings/settings.wxml', 2],
  ['pages/period/edit/edit.wxml', 2],
  ['pages/memory/edit/edit.wxml', 2],
  ['pages/bind/bind.wxml', 1]
]

function declarations(file, selector) {
  return Object.assign({}, ...parseWxssRules(readSource(path.join(repoRoot, file), 'utf8'))
    .filter(rule => rule.selectors.includes(selector))
    .map(rule => rule.decls))
}

test('all bottom sheets use one shared shell, page guard and reduced-motion probe', () => {
  for (const [file, sheetCount] of pages) {
    const raw = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    const invocations = wxmlOpeningTags(raw).filter(tag => tag.tag === 'template')
    assert.equal(invocations.filter(tag => tag.attrs.is === 'sharedBottomSheet').length, sheetCount, `${file} shares the bottom-sheet shell`)
    assert.equal(invocations.filter(tag => tag.attrs.is === 'sharedSheetPage').length, 1, `${file} shares one page guard and probe`)

    const expanded = readSource(path.join(repoRoot, file), 'utf8')
    assert.equal((expanded.match(/<wxs\s+module="sheetDrag"\s/g) || []).length, 1, `${file} expands the template-local WXS module once`)
    const nodes = wxmlOpeningTags(expanded)
    assert.equal(nodes.filter(tag => tag.classes.includes('reduced-motion-probe')).length, 1, `${file} mounts one probe`)
    assert.equal(nodes.filter(tag => tag.tag === 'page-container' && tag.attrs.bindbeforeleave === 'onSheetSystemBack').length, 1, `${file} mounts one return guard`)
    assert.equal(nodes.filter(tag => tag.classes.includes('day-sheet-mask')).length, sheetCount, `${file} uses the shared mask`)
    assert.equal(nodes.filter(tag => tag.classes.includes('sheet-drag-zone') && tag.attrs.bindtouchcancel === '{{sheetDrag.touchCancel}}').length, sheetCount, `${file} routes every touch cancellation through sheetDrag`)
  }
})

test('shared sheet templates own their WXS module scope instead of relying on each host page', () => {
  const shared = fs.readFileSync(path.join(repoRoot, 'pages/shared/confirmation-sheet.wxml'), 'utf8')
  assert.equal((shared.match(/<wxs\s+module="sheetDrag"\s+src="\.\.\/\.\.\/utils\/sheetDrag\.wxs"><\/wxs>/g) || []).length, 1)
  for (const [file] of pages) {
    const raw = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    assert.equal(raw.includes('<wxs module="sheetDrag"'), false, `${file} must consume the template-local WXS binding`)
  }
})

test('shared sheet drag zones light the handle rose while pressed and instantly under reduced motion', () => {
  const sharedWxml = fs.readFileSync(path.join(repoRoot, 'pages/shared/confirmation-sheet.wxml'), 'utf8')
  const dragZone = wxmlOpeningTags(sharedWxml).find(tag => tag.classes.includes('sheet-drag-zone'))
  assert.ok(dragZone)
  assert.equal(dragZone.attrs['hover-class'], 'sheet-drag-zone-hover')

  const sharedWxss = readSource(path.join(repoRoot, 'pages/shared/confirmation-sheet.wxss'), 'utf8')
  assert.match(sharedWxss, /\.sheet-handle\s*\{[^}]*transition:\s*background-color var\(--duration-press\) ease/)
  assert.match(sharedWxss, /\.sheet-drag-zone:active \.sheet-handle,\s*\.sheet-drag-zone\.sheet-drag-zone-hover \.sheet-handle\s*\{[^}]*background-color:\s*rgba\(232,144,158,0\.55\)/)
  const reduced = sharedWxss.slice(sharedWxss.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reduced, /\.sheet-handle,[\s\S]*?transition:\s*none/)
})

test('shared sheet masks catch touch move and page-meta locks scrolling only while obscured', () => {
  const sharedDir = path.join(repoRoot, 'pages/shared')
  for (const name of fs.readdirSync(sharedDir).filter(file => file.endsWith('.wxml'))) {
    const sharedRaw = fs.readFileSync(path.join(sharedDir, name), 'utf8')
    for (const restricted of ['page-meta', 'navigation-bar']) {
      assert.equal(
        wxmlOpeningTags(sharedRaw).filter(tag => tag.tag === restricted).length,
        0,
        `pages/shared/${name}: <${restricted}> must live directly at page root, never inside a shared <template> virtual wrapper`
      )
    }
  }

  const appPages = JSON.parse(fs.readFileSync(path.join(repoRoot, 'app.json'), 'utf8')).pages || []
  for (const route of appPages) {
    const pageRaw = fs.readFileSync(path.join(repoRoot, `${route}.wxml`), 'utf8')
    const rawRendered = wxmlOpeningTags(pageRaw).filter(tag => tag.tag !== 'import' && tag.tag !== 'wxs')
    const rawMetas = rawRendered.filter(tag => tag.tag === 'page-meta')
    if (rawMetas.length > 0) {
      assert.equal(rawMetas.length, 1, `${route}.wxml mounts at most one page-meta`)
      assert.equal(rawRendered[0], rawMetas[0], `${route}.wxml keeps page-meta as its first direct node`)
      for (const forbidden of ['wx:if', 'wx:elif', 'wx:else', 'wx:for']) {
        assert.equal(Object.hasOwn(rawMetas[0].attrs, forbidden), false, `${route}.wxml page-meta must not use ${forbidden}`)
      }
    }
  }

  for (const [file, sheetCount] of pages) {
    const raw = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    const rawTags = wxmlOpeningTags(raw)
    const rawRendered = rawTags.filter(tag => tag.tag !== 'import' && tag.tag !== 'wxs')
    const rawMetas = rawRendered.filter(tag => tag.tag === 'page-meta')
    assert.equal(rawMetas.length, 1, `${file} declares one direct top-level page-meta`)
    assert.equal(rawRendered[0], rawMetas[0], `${file} keeps page-meta as its first direct node (not inside <template>)`)
    for (const forbidden of ['wx:if', 'wx:elif', 'wx:else', 'wx:for']) {
      assert.equal(Object.hasOwn(rawMetas[0].attrs, forbidden), false, `${file} page-meta must not use ${forbidden}`)
    }

    const pageInvocation = rawTags.find(tag => tag.tag === 'template' && tag.attrs.is === 'sharedSheetPage')
    assert.ok(pageInvocation, `${file} invokes the shared sheet page`)

    const nodes = wxmlOpeningTags(readSource(path.join(repoRoot, file), 'utf8'))
    const masks = nodes.filter(tag => tag.classes.includes('day-sheet-mask'))
    assert.equal(masks.filter(tag => tag.attrs.catchtouchmove === 'noop').length, sheetCount, `${file} catches movement on every shared mask`)
    const metas = nodes.filter(tag => tag.tag === 'page-meta')
    assert.equal(metas.length, 1, `${file} mounts one page-meta`)
    assert.equal(nodes[0], metas[0], `${file} keeps page-meta as its first rendered node`)
    assert.equal(renderWxmlAttribute(metas[0].attrs['page-style'], { pageObscured: true }), 'overflow: hidden;')
    assert.equal(renderWxmlAttribute(metas[0].attrs['page-style'], { pageObscured: false }), '')
  }
})

test('shared sheets keep chrome fixed above a cropped independently scrolling body with concentric close geometry', () => {
  const panel = declarations('pages/shared/confirmation-sheet.wxss', '.day-action-sheet')
  assert.equal(panel.display, 'flex')
  assert.equal(panel['flex-direction'], 'column')
  assert.equal(panel.overflow, 'hidden')
  assert.equal(panel['overflow-y'], undefined, 'the rounded outer frame no longer owns vertical scrolling')
  assert.equal(panel.padding, '18rpx 28rpx 22rpx')
  assert.equal(declarations('pages/shared/confirmation-sheet.wxss', '.sheet-drag-zone').flex, '0 0 auto')

  const body = declarations('app.wxss', '.sheet-body')
  assert.equal(body.flex, '1')
  assert.equal(body['min-height'], '0')
  assert.equal(body['overflow-y'], 'auto')
  assert.equal(body['scrollbar-width'], 'none')
  assert.equal(body['scrollbar-color'], 'transparent transparent')
  const scrollbar = declarations('app.wxss', '.sheet-body::-webkit-scrollbar')
  assert.equal(scrollbar.width, '0')
  assert.equal(scrollbar.height, '0')
  assert.equal(scrollbar.color, 'transparent')

  const close = declarations('pages/shared/confirmation-sheet.wxss', '.sheet-close')
  assert.equal(close.width, '88rpx')
  assert.equal(close.height, '88rpx')
  assert.equal(close.background, 'transparent')
  const surface = declarations('pages/shared/confirmation-sheet.wxss', '.sheet-close-surface')
  assert.equal(surface.width, '64rpx')
  assert.equal(surface.height, '64rpx')
  assert.equal(surface['border-radius'], 'var(--radius-circle)')
  assert.equal(surface.background, 'var(--glass-bg)')
  assert.equal(surface.border, '1px solid rgba(255,255,255,0.12)')

  const shared = fs.readFileSync(path.join(repoRoot, 'pages/shared/confirmation-sheet.wxml'), 'utf8')
  const closeNode = wxmlOpeningTags(shared).find(tag => tag.classes.includes('sheet-close'))
  const surfaceNode = wxmlOpeningTags(shared).find(tag => tag.classes.includes('sheet-close-surface'))
  const closeIcon = wxmlOpeningTags(shared).find(tag => tag.classes.includes('ui-icon-close'))
  assert.ok(closeNode && surfaceNode && closeIcon)
  assert.ok(closeIcon.classes.includes('ui-icon-36'), 'the #266 geometric vector close icon is preserved')
  assert.equal(closeIcon.attrs['aria-hidden'], 'true')
})

test('settings help adopts home sheet geometry while month and day keep their visual modifiers', () => {
  const rawSettings = fs.readFileSync(path.join(repoRoot, 'pages/settings/settings.wxml'), 'utf8')
  const settings = readSource(path.join(repoRoot, 'pages/settings/settings.wxml'), 'utf8')
  assert.match(rawSettings, /sheetId: 'help'/)
  assert.match(rawSettings, /bodyTemplate: 'settingsHelpSheetBody'/)
  assert.match(rawSettings, /helpTopics: helpTopics/)
  assert.match(rawSettings, /sheetDragClear: helpDragClear/)
  assert.doesNotMatch(settings, /help-layer|help-mask|help-slide|help-head/)

  const shared = declarations('pages/shared/confirmation-sheet.wxss', '.day-action-sheet')
  const host = declarations('pages/shared/confirmation-sheet.wxss', '.sheet-host')
  assert.equal(shared['max-height'], '82vh')
  assert.equal(shared.overflow, 'hidden')
  assert.equal(shared['border-radius'], 'var(--radius-xl) var(--radius-xl) var(--radius-lg) var(--radius-lg)')
  assert.equal(host['z-index'], '60')
  assert.equal(host.padding, '0 20rpx')

  const month = declarations('pages/index/index.wxss', '.calendar-jump-sheet')
  const info = declarations('pages/index/index.wxss', '.calendar-info-panel')
  assert.equal(month['max-height'], '86vh')
  assert.match(month.background, /rgba\(232,144,158,0\.14\)/)
  assert.match(month.background, /rgba\(18,22,61,0\.96\)/)
  assert.equal(info['max-height'], '84vh')
  assert.match(shared.background, /rgba\(232,144,158,0\.12\)/)
  assert.match(shared.background, /rgba\(18,22,61,0\.94\)/)
})

test('date picker disables native masks, aligns pixel geometry and keeps the disabled confirm contract', () => {
  const shared = fs.readFileSync(path.join(repoRoot, 'pages/shared/confirmation-sheet.wxml'), 'utf8')
  const nodes = wxmlOpeningTags(shared)
  const frame = nodes.find(tag => tag.classes.includes('date-picker-columns'))
  const picker = nodes.find(tag => tag.tag === 'picker-view')
  assert.ok(frame)
  assert.ok(picker)
  assert.equal(frame.attrs.style, 'height: {{datePickerHeight}}px; --date-picker-mask-height: {{datePickerMaskHeight}}px;')
  assert.equal(picker.attrs.style, 'height: {{datePickerHeight}}px;')
  assert.equal(picker.attrs['mask-style'], 'background-image: none; border: 0;')

  const indicator = Object.fromEntries(picker.attrs['indicator-style'].split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf(':')
    return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()]
  }))
  assert.equal(indicator.height, '{{datePickerRowHeight}}px')
  assert.equal(indicator.top, '{{datePickerIndicatorTop}}px')
  assert.equal(indicator['box-sizing'], 'border-box')
  assert.equal(indicator['background-color'], 'rgba(232,144,158,0.10)')
  assert.equal(indicator.border, '0', 'the default bright column separators are cleared')
  assert.equal(indicator['border-top'], '1px solid rgba(232,144,158,0.32)')
  assert.equal(indicator['border-bottom'], '1px solid rgba(232,144,158,0.32)')

  const options = nodes.filter(tag => tag.classes.includes('date-picker-option'))
  assert.equal(options.length, 3)
  for (const option of options) {
    assert.equal(option.attrs.style, 'height: {{datePickerRowHeight}}px; line-height: {{datePickerRowHeight}}px;')
  }

  const columns = declarations('pages/shared/confirmation-sheet.wxss', '.date-picker-columns')
  assert.equal(columns.position, 'relative')
  assert.equal(columns.padding, '0 24rpx')
  assert.equal(columns['box-sizing'], 'border-box')
  assert.equal(columns.height, undefined, 'runtime pixels replace the fixed rpx container height')
  assert.equal(declarations('pages/shared/confirmation-sheet.wxss', '.date-picker-view').height, undefined)
  const option = declarations('pages/shared/confirmation-sheet.wxss', '.date-picker-option')
  assert.equal(option.height, undefined)
  assert.equal(option['line-height'], undefined)

  for (const [selector, edge, direction] of [
    ['.date-picker-columns::before', 'top', 'bottom'],
    ['.date-picker-columns::after', 'bottom', 'top']
  ]) {
    const mask = declarations('pages/shared/confirmation-sheet.wxss', selector)
    assert.equal(mask.content, "''")
    assert.equal(mask.position, 'absolute')
    assert.equal(mask[edge], '0')
    assert.equal(mask.left, '0')
    assert.equal(mask.right, '0')
    assert.equal(mask.height, 'var(--date-picker-mask-height)')
    assert.equal(mask['background-image'], `linear-gradient(to ${direction}, var(--glass-fallback) 0%, rgba(18,22,61,0) 100%)`)
    assert.equal(mask['background-repeat'], 'no-repeat')
    assert.equal(mask['pointer-events'], 'none')
  }
  assert.doesNotMatch(shared, /rgba\(28,32,71/)
  assert.doesNotMatch(fs.readFileSync(path.join(repoRoot, 'pages/shared/confirmation-sheet.wxss'), 'utf8'), /rgba\(28,32,71/)

  const confirm = nodes.find(tag => tag.attrs.bindtap === 'onDatePickerConfirm')
  assert.ok(confirm)
  assert.equal(confirm.tag, 'button')
  assert.equal(confirm.attrs.disabled, '{{datePickerPicking}}')
  assert.equal(confirm.attrs['aria-disabled'], '{{datePickerPicking}}')
  assert.equal(declarations('app.wxss', '.btn-premium.disabled').opacity, '0.55')
  const disabled = declarations('pages/shared/confirmation-sheet.wxss', 'button.date-picker-confirm[disabled]')
  assert.equal(disabled.background, 'var(--aurora-pink)', 'native disabled buttons keep the rose surface instead of the UA gray fill')
  assert.equal(disabled.color, 'var(--text-on-accent)', 'native disabled buttons keep navy label text')
})

test('shared bottom sheet calls keep template data flat for the WXML compiler', () => {
  for (const [file] of pages) {
    const raw = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    const invocations = wxmlOpeningTags(raw).filter(tag => tag.tag === 'template' && tag.attrs.is === 'sharedBottomSheet')
    for (const tag of invocations) {
      assert.doesNotMatch(tag.attrs.data || '', /\bbody\s*:\s*\{/, `${file} must not nest an object literal in template data`)
    }
  }

  const shared = fs.readFileSync(path.join(repoRoot, 'pages/shared/confirmation-sheet.wxml'), 'utf8')
  const forwarded = [
    'year', 'month', 'jumpYear', 'jumpMonth', 'jumpYearAtMin', 'jumpYearAtMax', 'jumpMonths',
    'selectedDayDetail', 'daySheetMode', 'dayDetailFade', 'periodBandSample', 'calendarDensity',
    'infoSheetMode', 'predictionExplanation', 'monthlyRecap', 'legendItems', 'helpTopics',
    'confirmationDateText', 'confirmationContent', 'confirmationActions',
    'datePickerName', 'datePickerYears', 'datePickerMonths', 'datePickerDays', 'datePickerValue', 'datePickerPicking',
    'datePickerRowHeight', 'datePickerHeight', 'datePickerMaskHeight', 'datePickerIndicatorTop',
    'datePickerYearAria', 'datePickerMonthAria', 'datePickerDayAria', 'datePickerConfirmAria'
  ]
  for (const field of forwarded) assert.ok(shared.includes(`${field}: ${field}`), `${field} is forwarded to the selected body template`)
})
