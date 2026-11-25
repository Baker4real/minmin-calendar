const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { declarations, parseWxssRules } = require('./designTokens')
const { readRaw, readSource } = require('./sourceFiles')
const { wxmlElementTree, wxmlOpeningTags } = require('./wxmlTemplate')

const repoRoot = path.join(__dirname, '..')
const WXML = 'pages/period/edit/edit.wxml'
const WXSS = 'pages/period/edit/edit.wxss'

function pageTree() {
  return wxmlElementTree(readSource(path.join(repoRoot, WXML), 'utf8'))
}

function descendants(nodes) {
  return nodes.flatMap(node => [node, ...descendants(node.children)])
}

function pageElements() {
  return descendants(pageTree())
}

function rawChoiceInvocation(handler) {
  const invocation = wxmlOpeningTags(readRaw(WXML)).find(tag =>
    tag.tag === 'template' && tag.attrs.is === 'sharedChoiceChip' &&
    (tag.attrs.data || '').includes(`tapHandler: '${handler}'`))
  assert.ok(invocation, `expected ${handler} to use sharedChoiceChip`)
  return invocation
}

test('period status reuses the shared three-column inset track and rose-glass thumb with radio semantics', () => {
  assert.match(readRaw(WXSS), /@import '\.\.\/\.\.\/shared\/segmented-control\.wxss';/)

  const group = pageElements().find(element => element.classes.includes('status-options'))
  assert.ok(group, 'the status group has its own segmented-track variant')
  assert.equal(group.attrs['aria-role'], 'radiogroup')
  assert.equal(group.attrs['aria-label'], '经期状态')
  assert.ok(group.classes.includes('segment-control'))
  assert.ok(group.classes.includes('segment-columns-3'))

  const thumb = group.children.find(element => element.classes.includes('segment-thumb'))
  assert.ok(thumb, 'the shared rose-glass thumb lives inside the status track')
  assert.ok(thumb.classes.includes('segment-thumb-columns-3'))
  assert.match(thumb.attrs.class, /segment-thumb-index-\{\{status === 'unknown-end' \? 1 : status === 'known-end' \? 2 : 0\}\}/)
  assert.equal(thumb.attrs['aria-hidden'], 'true')

  const option = group.children.find(element => element.attrs.bindtap === '{{tapHandler}}')
  assert.ok(option, 'the expanded shared choice renders inside the radiogroup')
  assert.equal(option.attrs['aria-role'], '{{role}}')
  assert.equal(option.attrs['aria-checked'], '{{checked}}')
  assert.equal(option.attrs['aria-disabled'], '{{saving}}')

  const invocation = rawChoiceInvocation('selectStatus')
  assert.match(invocation.attrs.data, /chipClass: 'segment-option'/)
  assert.match(invocation.attrs.data, /role: 'radio'/)

  assert.equal(
    declarations(WXSS, '.segment-control.segment-columns-3')['grid-template-columns'],
    'repeat(3, minmax(0, 1fr))'
  )
  const track = declarations(WXSS, '.status-options')
  assert.equal(track.background, 'rgba(10,14,39,0.88)')
  assert.equal(track.border, '1px solid rgba(255,255,255,0.08)')
  assert.equal(track['box-shadow'], 'inset 0 2rpx 6rpx rgba(0,0,0,0.28)')
  assert.equal(
    declarations(WXSS, '.segment-control .segment-thumb.segment-thumb-columns-3').width,
    'calc((100% - 28rpx) / 3)'
  )
})

test('period flow renders three glass blocks with one, two and three silent degree dots and cancellation semantics', () => {
  const invocation = rawChoiceInvocation('selectFlow')
  assert.match(invocation.attrs.data, /role: 'checkbox'/)
  assert.match(invocation.attrs.data, /ariaLabel: '经量 ' \+ item\.label \+ '，单选，再点取消'/)
  assert.match(invocation.attrs.data, /degreeDots: item\.degreeDots/)

  const group = pageElements().find(element => element.classes.includes('flow-options'))
  assert.ok(group, 'the flow choices keep a public three-column container')
  const chip = descendants(group.children).find(element => element.attrs.bindtap === '{{tapHandler}}')
  assert.ok(chip, 'the expanded flow chip is available for inspection')
  const degree = descendants(chip.children).find(element => element.classes.includes('flow-degree'))
  assert.ok(degree, 'flow chips expose their degree indicator')
  assert.equal(degree.attrs['aria-hidden'], 'true', 'degree dots are decorative; the checkbox name stays unchanged')
  assert.equal(degree.attrs['wx:if'], '{{degreeDots}}')
  const dotNode = descendants(degree.children).find(element => element.classes.includes('flow-degree-dot'))
  assert.ok(dotNode)
  assert.equal(dotNode.attrs['wx:for'], '{{degreeDots}}')

  const options = declarations(WXSS, '.flow-options')
  assert.equal(options.display, 'grid')
  assert.equal(options['grid-template-columns'], 'repeat(3, minmax(0, 1fr))')
  const chipStyle = declarations(WXSS, '.flow-chip')
  assert.equal(chipStyle['min-height'], '88rpx')
  assert.equal(chipStyle['border-radius'], 'var(--radius-md)')
  const active = declarations(WXSS, '.flow-chip.active')
  assert.equal(active.color, 'var(--aurora-pink)')
  assert.equal(active.background, 'rgba(232,144,158,0.08)')
  assert.equal(active['border-color'], 'rgba(232,144,158,0.45)')
  assert.equal(active['box-shadow'], 'none')
  const dot = declarations(WXSS, '.flow-degree-dot')
  assert.equal(dot.width, '8rpx')
  assert.equal(dot.height, '8rpx')
  assert.equal(dot.background, 'currentColor')
})

test('period symptom selection uses a quiet rose outline and both chip glows fade through pseudo-elements', () => {
  const symptom = declarations(WXSS, '.symptom-chip')
  assert.equal(symptom['min-height'], '88rpx', 'the touch target remains at least 44px at the 750rpx design width')
  assert.equal(symptom['border-radius'], 'var(--radius-full)')
  const active = declarations(WXSS, '.symptom-chip.active')
  assert.equal(active.color, 'var(--aurora-pink)')
  assert.equal(active.background, 'linear-gradient(rgba(232,144,158,0.16), rgba(232,144,158,0.16)), var(--glass-fallback)')
  assert.equal(active['border-color'], 'rgba(232,144,158,0.62)')
  assert.equal(active['box-shadow'], 'none')

  const rules = parseWxssRules(readSource(path.join(repoRoot, WXSS), 'utf8'))
  for (const chipName of ['flow-chip', 'symptom-chip']) {
    const glow = rules.find(rule => rule.selectors.includes(`.${chipName}::after`) && rule.decls.transition !== 'none')
    assert.ok(glow, `.${chipName} owns a pseudo-element glow`)
    assert.equal(glow.decls.opacity, '0')
    assert.equal(glow.decls['pointer-events'], 'none')
    assert.equal(glow.decls['box-shadow'], '0 0 18rpx rgba(232,144,158,0.22)')
    assert.equal(glow.decls.transition, 'opacity var(--duration-state) ease')
    const selected = declarations(WXSS, `.${chipName}.active::after`)
    assert.equal(selected.opacity, '1')
  }

  assert.doesNotMatch(readRaw(WXSS), /rgba\(232,144,158,0\.92\)/, 'no editor chip keeps the retired solid rose block')
  assert.equal(declarations('app.wxss', '.btn-premium').background, 'var(--aurora-pink)', 'save remains the solid rose primary action')
})

test('period end date stays mounted in a two-layer grid with inert, screen-reader-hidden collapsed content', () => {
  const region = pageElements().find(element => element.attrs.id === 'field-endDate')
  assert.ok(region, 'the end-date validation anchor remains mounted')
  assert.equal(region.attrs['wx:if'], undefined, 'status changes must not unmount the field')
  assert.ok(region.classes.includes('end-date-disclosure'))
  assert.equal(region.attrs['aria-hidden'], "{{status !== 'known-end'}}")
  assert.match(region.attrs.class, /status === 'known-end' \? ' end-date-expanded' : ''/)

  const inner = region.children.find(element => element.classes.includes('end-date-inner'))
  assert.ok(inner, 'the grid has a separate overflow-clipping inner layer')
  const picker = descendants(inner.children).find(element => element.classes.includes('form-picker'))
  assert.ok(picker, 'the same shared date picker stays inside the collapsible field')
  assert.equal(picker.attrs['aria-disabled'], '{{saving}}')
  const invocation = wxmlOpeningTags(readRaw(WXML)).find(tag =>
    tag.tag === 'template' && tag.attrs.is === 'sharedDateField' &&
    (tag.attrs.data || '').includes("tapHandler: 'openEndDatePicker'"))
  assert.ok(invocation)
  assert.match(invocation.attrs.data, /saving: saving \|\| status !== 'known-end'/)

  const rules = parseWxssRules(readSource(path.join(repoRoot, WXSS), 'utf8'))
  const baseTransition = selector => rules.find(rule => rule.selectors.includes(selector) && rule.decls.transition !== 'none')?.decls.transition
  const outer = declarations(WXSS, '.end-date-disclosure')
  assert.equal(outer.display, 'grid')
  assert.equal(outer['grid-template-rows'], '0fr')
  assert.equal(baseTransition('.end-date-disclosure'), 'grid-template-rows var(--duration-state) var(--ease-out)')
  assert.equal(declarations(WXSS, '.end-date-disclosure.end-date-expanded')['grid-template-rows'], '1fr')
  const innerStyle = declarations(WXSS, '.end-date-inner')
  assert.equal(innerStyle['min-height'], '0')
  assert.equal(innerStyle.overflow, 'hidden')
  assert.equal(innerStyle.opacity, '0')
  assert.equal(innerStyle['pointer-events'], 'none')
  assert.equal(baseTransition('.end-date-inner'), 'opacity var(--duration-state) var(--ease-out)')
  const expanded = declarations(WXSS, '.end-date-disclosure.end-date-expanded .end-date-inner')
  assert.equal(expanded.opacity, '1')
  assert.equal(expanded['pointer-events'], 'auto')

  for (const selector of ['.end-date-disclosure', '.end-date-inner']) {
    assert.ok(rules.some(rule => rule.selectors.includes(selector) && rule.decls.transition === 'none'), `${selector} becomes immediate under reduced motion`)
  }
})

test('period fixed save bar exits and returns through opacity and full downward translation without display none', () => {
  const rules = parseWxssRules(readSource(path.join(repoRoot, WXSS), 'utf8'))
  const transition = selector => rules.find(rule => rule.selectors.includes(selector) && rule.decls.transition !== 'none')?.decls.transition
  const visible = declarations(WXSS, '.record-actions-fixed')
  assert.equal(visible.opacity, '1')
  assert.equal(visible.transform, 'translateY(0)')
  assert.equal(
    transition('.record-actions-fixed'),
    'opacity var(--duration-enter) var(--ease-out), transform var(--duration-enter) var(--ease-out)'
  )

  const hidden = declarations(WXSS, '.record-actions-fixed.record-actions-hidden')
  assert.equal(hidden.display, undefined, 'the save bar stays mounted throughout focus changes')
  assert.equal(hidden.opacity, '0')
  assert.equal(hidden.transform, 'translateY(100%)')
  assert.equal(hidden['pointer-events'], 'none')
  assert.equal(
    transition('.record-actions-fixed.record-actions-hidden'),
    'opacity var(--duration-exit) var(--ease-out), transform var(--duration-exit) var(--ease-out)'
  )
  for (const selector of ['.record-actions-fixed', '.record-actions-fixed.record-actions-hidden']) {
    assert.ok(rules.some(rule => rule.selectors.includes(selector) && rule.decls.transition === 'none'), `${selector} switches immediately under reduced motion`)
  }
  assert.match(declarations(WXSS, '.content').padding, /calc\(144rpx \+ var\(--safe-bottom/, 'the fixed-bar content reserve stays unchanged')
})
