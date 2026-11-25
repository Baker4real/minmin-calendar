const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { parseWxssRules } = require('./designTokens')
const { readRaw, readSource } = require('./sourceFiles')

const repoRoot = path.join(__dirname, '..')
const occurrences = (source, pattern) => (source.match(pattern) || []).length

test('edit pages render one fixed save template and a separate in-flow delete template', () => {
  const sharedPath = 'pages/shared/form-controls.wxml'
  assert.ok(fs.existsSync(path.join(repoRoot, sharedPath)), 'the shared form template exists')
  const shared = readRaw(sharedPath)
  assert.equal(occurrences(shared, /<template name="sharedRecordActions">/g), 1)
  assert.equal(occurrences(shared, /<template name="sharedRecordDelete">/g), 1)
  const actions = /<template name="sharedRecordActions">([\s\S]*?)<\/template>/.exec(shared)
  assert.ok(actions)
  assert.doesNotMatch(actions[1], /delete-zone|bindtap="delete"/, 'the fixed save bar never owns deletion')

  for (const kind of ['period', 'memory']) {
    const page = readRaw(`pages/${kind}/edit/edit.wxml`)
    assert.match(page, /<import src="\/pages\/shared\/form-controls\.wxml" \/>/)
    assert.equal(occurrences(page, /<template is="sharedRecordActions"/g), 1, `${kind} uses the shared save block`)
    assert.equal(occurrences(page, /<template is="sharedRecordDelete"/g), 1, `${kind} uses the shared delete block`)
    assert.ok(page.indexOf('<template is="sharedRecordDelete"') < page.indexOf('<template is="sharedRecordActions"'), `${kind} deletes in the scroll flow before its fixed save bar`)
    assert.match(page, /<template is="sharedRecordActions"[^>]*actionsClass: 'record-actions-fixed'/)
    if (kind === 'period') {
      assert.match(page, /<template is="sharedRecordActions"[^>]*actionsHidden: noteFocused/)
    } else {
      assert.doesNotMatch(page, /<template is="sharedRecordActions"[^>]*actionsHidden:/, 'memory focus never hides the fixed save bar')
    }
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

test('both edit pages import shared form, notice, and fixed-action rules from one stylesheet', () => {
  const sharedPath = 'pages/shared/record-form.wxss'
  assert.ok(fs.existsSync(path.join(repoRoot, sharedPath)), 'the shared record-form stylesheet exists')
  const sharedRules = parseWxssRules(readSource(path.join(repoRoot, sharedPath), 'utf8'))
  const selectors = [
    '.form-item', '.form-item:last-child', '.form-label', '.form-label-row',
    '.form-label-row .form-label', '.note-count', '.form-picker',
    '.form-picker-arrow', '.form-picker:active', '.form-picker.disabled',
    '.form-input', '.form-input.disabled', '.input-placeholder',
    '.micro-notice', '.micro-notice-text', '.micro-notice-action',
    '.draft-notice', '.draft-discard', '.draft-discard:active', '.start-date-owner-action',
    '.btns', '.record-actions-fixed', '.record-actions-fixed .btns',
    '.record-actions-fixed.record-actions-hidden', '.btn-premium', '.delete-zone'
  ]
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

test('room-code and edit inputs share box structure and focus timing while modifiers keep their visuals', () => {
  const sharedPath = 'pages/shared/form-control.wxss'
  assert.ok(fs.existsSync(path.join(repoRoot, sharedPath)), 'the shared input-structure stylesheet exists')
  const base = parseWxssRules(readRaw(sharedPath)).find(rule => rule.selectors.includes('.form-control'))
  assert.ok(base, 'the base form-control rule exists')
  assert.deepEqual(base.decls, {
    'box-sizing': 'border-box',
    width: '100%',
    'border-radius': 'var(--radius-md)',
    'box-shadow': 'inset 0 2rpx 6rpx rgba(0,0,0,0.28)',
    transition: 'border-color var(--duration-state) ease, box-shadow var(--duration-state) ease'
  })

  const focus = parseWxssRules(readRaw(sharedPath)).find(rule => rule.selectors.includes('.form-control.form-control-focused'))
  assert.ok(focus, 'the shared focus ring exists')
  assert.equal(focus.decls['border-color'], 'var(--aurora-pink)')
  assert.equal(
    focus.decls['box-shadow'],
    'inset 0 2rpx 6rpx rgba(0,0,0,0.28), 0 0 0 4rpx rgba(232,144,158,0.14)'
  )

  assert.match(readRaw('pages/shared/record-form.wxss'), /@import '\.\/form-control\.wxss';/)
  assert.match(readRaw('pages/bind/bind.wxss'), /@import '\.\.\/shared\/form-control\.wxss';/)
  assert.match(readRaw('pages/shared/form-controls.wxml'), /class="form-picker form-control\{\{focused \? ' form-control-focused' : ''\}\}\{\{saving/)
  assert.match(readRaw('pages/bind/bind.wxml'), /class="code-input form-control\s/)
  for (const kind of ['period', 'memory']) {
    assert.match(readRaw(`pages/${kind}/edit/edit.wxml`), /class="form-input(?: memory-note-input)? form-control\{\{noteFocused/)
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
    assert.equal(modifier.decls.background, 'rgba(10,14,39,0.88)', `${file} ${selector} uses the deep-sea well`)
    assert.equal(modifier.decls.border, '1px solid rgba(255,255,255,0.08)', `${file} ${selector} uses the weak outer edge`)
  }

  const pickerPress = parseWxssRules(readRaw('pages/shared/record-form.wxss'))
    .find(rule => rule.selectors.includes('.form-picker:active'))
  assert.ok(pickerPress, 'the date well shares the rose focus treatment on press')
  assert.equal(pickerPress.decls['border-color'], 'var(--aurora-pink)')
  assert.equal(pickerPress.decls['box-shadow'], undefined, 'press keeps the existing shadow; the mounted date panel owns focus')

  for (const [file, labels] of [
    ['pages/period/edit/edit.wxml', ['开始日期', '结束日期']],
    ['pages/memory/edit/edit.wxml', ['日期']]
  ]) {
    const wxml = readRaw(file)
    for (const label of labels) {
      assert.ok(wxml.includes(`focused: datePickerMounted && datePickerName === '${label}'`), `${file} focuses ${label} while its date panel is mounted`)
    }
  }
})
