const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { parseWxssRules } = require('./designTokens')
const { readSource } = require('./sourceFiles')

const repoRoot = path.join(__dirname, '..')
const readRaw = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
const occurrences = (source, pattern) => (source.match(pattern) || []).length

test('edit pages render save and delete states from one shared template', () => {
  const sharedPath = 'pages/shared/form-controls.wxml'
  assert.ok(fs.existsSync(path.join(repoRoot, sharedPath)), 'the shared form template exists')
  const shared = readRaw(sharedPath)
  assert.equal(occurrences(shared, /<template name="sharedRecordActions">/g), 1)

  for (const kind of ['period', 'memory']) {
    const page = readRaw(`pages/${kind}/edit/edit.wxml`)
    assert.match(page, /<import src="\/pages\/shared\/form-controls\.wxml" \/>/)
    assert.equal(occurrences(page, /<template is="sharedRecordActions"/g), 1, `${kind} uses the shared action block`)
    assert.doesNotMatch(page, /<view class="btns">/, `${kind} does not keep a local action block`)
  }
})

test('three date fields and three period chip groups use the shared field templates', () => {
  const shared = readRaw('pages/shared/form-controls.wxml')
  assert.equal(occurrences(shared, /<template name="sharedDateField">/g), 1)
  assert.equal(occurrences(shared, /<template name="sharedChoiceChip">/g), 1)

  const period = readRaw('pages/period/edit/edit.wxml')
  const memory = readRaw('pages/memory/edit/edit.wxml')
  assert.equal(occurrences(period, /<template is="sharedDateField"/g), 2, 'period start and end share the date template')
  assert.equal(occurrences(memory, /<template is="sharedDateField"/g), 1, 'memory date shares the date template')
  assert.equal(occurrences(period, /<template is="sharedChoiceChip"/g), 3, 'status, flow and symptom options share the chip template')
  assert.doesNotMatch(period, /<picker\b/, 'period keeps no local date-picker markup')
  assert.doesNotMatch(memory, /<picker\b/, 'memory keeps no local date-picker markup')
})

test('both edit pages import the fifteen identical form rules from one stylesheet', () => {
  const sharedPath = 'pages/shared/record-form.wxss'
  assert.ok(fs.existsSync(path.join(repoRoot, sharedPath)), 'the shared record-form stylesheet exists')
  const sharedRules = parseWxssRules(readSource(path.join(repoRoot, sharedPath), 'utf8'))
  const selectors = [
    '.form-item', '.form-item:last-child', '.form-label', '.form-picker',
    '.form-picker-arrow', '.form-picker:active', '.form-picker.disabled',
    '.form-input', '.input-placeholder',
    '.draft-notice', '.draft-discard', '.draft-discard:active',
    '.btns', '.btn-premium', '.delete-zone'
  ]
  assert.equal(selectors.length, 15)
  for (const selector of selectors) {
    assert.ok(sharedRules.some(rule => rule.selectors.includes(selector)), `shared stylesheet owns ${selector}`)
  }

  for (const kind of ['period', 'memory']) {
    const page = readRaw(`pages/${kind}/edit/edit.wxss`)
    assert.match(page, /@import '\.\.\/\.\.\/shared\/record-form\.wxss';/)
    const localPageRules = parseWxssRules(page.split('@media')[0])
    for (const selector of selectors) {
      assert.equal(localPageRules.some(rule => rule.selectors.includes(selector)), false, `${kind} keeps no local ${selector} rule`)
    }
  }
})

test('room-code and edit inputs share only box structure while modifiers keep their visuals', () => {
  const sharedPath = 'pages/shared/form-control.wxss'
  assert.ok(fs.existsSync(path.join(repoRoot, sharedPath)), 'the shared input-structure stylesheet exists')
  const base = parseWxssRules(readRaw(sharedPath)).find(rule => rule.selectors.includes('.form-control'))
  assert.ok(base, 'the base form-control rule exists')
  assert.deepEqual(base.decls, {
    'box-sizing': 'border-box',
    width: '100%',
    'border-radius': 'var(--radius-sm)'
  })

  assert.match(readRaw('pages/shared/record-form.wxss'), /@import '\.\/form-control\.wxss';/)
  assert.match(readRaw('pages/bind/bind.wxss'), /@import '\.\.\/shared\/form-control\.wxss';/)
  assert.match(readRaw('pages/shared/form-controls.wxml'), /class="form-picker form-control\{\{saving/)
  assert.match(readRaw('pages/bind/bind.wxml'), /class="code-input form-control\{\{codeFocused/)
  for (const kind of ['period', 'memory']) {
    assert.match(readRaw(`pages/${kind}/edit/edit.wxml`), /class="form-input form-control\{\{noteFocused/)
  }

  for (const [file, selector] of [
    ['pages/shared/record-form.wxss', '.form-picker'],
    ['pages/shared/record-form.wxss', '.form-input'],
    ['pages/bind/bind.wxss', '.code-input']
  ]) {
    const modifier = parseWxssRules(readRaw(file)).find(rule => rule.selectors.includes(selector))
    for (const property of ['box-sizing', 'width', 'border-radius']) {
      assert.equal(modifier.decls[property], undefined, `${file} ${selector} leaves ${property} to the shared base`)
    }
  }
})
