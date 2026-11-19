const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { parseWxssRules } = require('./designTokens')
const { readSource } = require('./sourceFiles')
const { wxmlOpeningTags } = require('./wxmlTemplate')

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
    const nodes = wxmlOpeningTags(expanded)
    assert.equal(nodes.filter(tag => tag.classes.includes('reduced-motion-probe')).length, 1, `${file} mounts one probe`)
    assert.equal(nodes.filter(tag => tag.tag === 'page-container' && tag.attrs.bindbeforeleave === 'onSheetSystemBack').length, 1, `${file} mounts one return guard`)
    assert.equal(nodes.filter(tag => tag.classes.includes('day-sheet-mask')).length, sheetCount, `${file} uses the shared mask`)
    assert.equal(nodes.filter(tag => tag.classes.includes('sheet-drag-zone') && tag.attrs.bindtouchcancel === '{{sheetDrag.touchCancel}}').length, sheetCount, `${file} routes every touch cancellation through sheetDrag`)
  }
})

test('settings help adopts home sheet geometry while month and day keep their visual modifiers', () => {
  const rawSettings = fs.readFileSync(path.join(repoRoot, 'pages/settings/settings.wxml'), 'utf8')
  const settings = readSource(path.join(repoRoot, 'pages/settings/settings.wxml'), 'utf8')
  assert.match(rawSettings, /sheetId: 'help'/)
  assert.match(rawSettings, /bodyTemplate: 'settingsHelpSheetBody'/)
  assert.match(rawSettings, /sheetDragClear: helpDragClear/)
  assert.doesNotMatch(settings, /help-layer|help-mask|help-slide|help-head/)

  const shared = declarations('pages/shared/confirmation-sheet.wxss', '.day-action-sheet')
  const host = declarations('pages/shared/confirmation-sheet.wxss', '.sheet-host')
  assert.equal(shared['max-height'], '82vh')
  assert.equal(shared['overflow-y'], 'auto')
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
    'infoSheetMode', 'predictionExplanation', 'monthlyRecap', 'legendItems',
    'confirmationDateText', 'confirmationContent', 'confirmationActions',
    'datePickerName', 'datePickerYears', 'datePickerMonths', 'datePickerDays', 'datePickerValue',
    'datePickerYearAria', 'datePickerMonthAria', 'datePickerDayAria', 'datePickerConfirmAria'
  ]
  for (const field of forwarded) assert.ok(shared.includes(`${field}: ${field}`), `${field} is forwarded to the selected body template`)
})
