const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { readSource } = require('./sourceFiles')


const PERIOD_EDIT_WXSS = readSource(
  path.join(__dirname, '..', 'pages/period/edit/edit.wxss'),
  'utf8'
)

const PERIOD_LIST_WXSS = readSource(
  path.join(__dirname, '..', 'pages/period/period.wxss'),
  'utf8'
)

function parseRules(wxss) {
  const withoutComments = wxss.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  const rulePattern = /([^{]+)\{([^}]*)\}/g
  let match
  while ((match = rulePattern.exec(withoutComments))) {
    const selectors = match[1].split(',').map((selector) => selector.trim()).filter(Boolean)
    const decls = {}
    for (const part of match[2].split(';')) {
      const separator = part.indexOf(':')
      if (separator === -1) continue
      const prop = part.slice(0, separator).trim()
      const value = part.slice(separator + 1).trim()
      if (prop) decls[prop] = value
    }
    rules.push({ selectors, decls })
  }
  return rules
}

function selectorTargetsChip(selector, chipClass) {
  return new RegExp(`(^|[\\s,+>~])\\.${chipClass}(?:$|[\\s.:#+>+~\\[])`).test(` ${selector}`)
}

function selectorIsActiveChip(selector, chipClass) {
  return new RegExp(`(^|[\\s,+>~])\\.${chipClass}\\.active(?:$|[\\s.:#+>+~\\[])`).test(` ${selector}`)
}

function cssColorToHex(value) {
  const token = /^var\((--[a-z0-9-]+)\)$/i.exec(String(value).trim())
  if (token) {
    const app = readSource(path.join(__dirname, '..', 'app.wxss'), 'utf8')
    const definition = new RegExp(`${token[1]}\\s*:\\s*([^;]+);`).exec(app)
    assert.ok(definition, `expected ${token[1]} in app.wxss`)
    return cssColorToHex(definition[1])
  }
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim())
  if (hexMatch) {
    let hex = hexMatch[1]
    if (hex.length === 3) {
      hex = hex.split('').map((digit) => digit + digit).join('')
    }
    return `#${hex.toUpperCase()}`
  }

  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(String(value).trim())
  if (rgbMatch) {
    const toHex = (channel) => Number.parseInt(channel, 10).toString(16).padStart(2, '0').toUpperCase()
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`
  }

  throw new Error(`Unsupported color: ${value}`)
}

function cascadedDeclaration(wxss, chipClass, prop, selectorTest) {
  let value
  for (const rule of parseRules(wxss)) {
    if (!rule.selectors.some((selector) => selectorTest(selector, chipClass))) continue
    if (Object.prototype.hasOwnProperty.call(rule.decls, prop)) {
      value = rule.decls[prop]
    }
  }
  return value
}

function activeChipPair(wxss, chipClass) {
  const color = cascadedDeclaration(wxss, chipClass, 'color', selectorIsActiveChip)
  const fill = cascadedDeclaration(wxss, chipClass, 'background-color', selectorIsActiveChip)
    || cascadedDeclaration(wxss, chipClass, 'background', selectorIsActiveChip)
  assert.ok(color, `missing color for .${chipClass}.active`)
  assert.ok(fill, `missing fill for .${chipClass}.active`)
  return {
    color: cssColorToHex(color),
    fill: cssColorToHex(fill)
  }
}

function declarationFor(wxss, selector, prop) {
  let value
  for (const rule of parseRules(wxss)) {
    if (!rule.selectors.includes(selector)) continue
    if (Object.prototype.hasOwnProperty.call(rule.decls, prop)) {
      value = rule.decls[prop]
    }
  }
  return value
}

function ruleTextFor(wxss, selector) {
  const rule = parseRules(wxss).find((candidate) => candidate.selectors.includes(selector))
  return rule ? Object.entries(rule.decls).map(([prop, value]) => `${prop}: ${value}`).join('; ') : ''
}

test('active flow chip uses rose type over the quiet eight-percent treatment', () => {
  const flow = activeChipPair(PERIOD_EDIT_WXSS, 'flow-chip')
  assert.equal(flow.color, '#E8909E')
  assert.equal(declarationFor(PERIOD_EDIT_WXSS, '.flow-chip.active', 'background'), 'rgba(232,144,158,0.08)')
  assert.equal(declarationFor(PERIOD_EDIT_WXSS, '.flow-chip.active', 'border-color'), 'rgba(232,144,158,0.45)')
})

test('active symptom chip uses rose type, a sixteen-percent fill and a sixty-two-percent outline', () => {
  const symptom = activeChipPair(PERIOD_EDIT_WXSS, 'symptom-chip')
  assert.equal(symptom.color, '#F0C4C0')
  assert.equal(declarationFor(PERIOD_EDIT_WXSS, '.symptom-chip.active', 'background'), 'rgba(232,144,158,0.16)')
  assert.equal(declarationFor(PERIOD_EDIT_WXSS, '.symptom-chip.active', 'border-color'), 'rgba(232,144,158,0.62)')
})

test('period edit chips keep the 88rpx touch floor', () => {
  assert.equal(
    cascadedDeclaration(PERIOD_EDIT_WXSS, 'flow-chip', 'min-height', selectorTargetsChip),
    '88rpx'
  )
  assert.equal(
    cascadedDeclaration(PERIOD_EDIT_WXSS, 'symptom-chip', 'min-height', selectorTargetsChip),
    '88rpx'
  )
})

// issue #225 的列表经量弱态保持不变；#270 后分段选中底与描边由滑块承载，不再与标签共用一层样式。
test('list flow tag keeps its quiet rose treatment beside the moving segment thumb', () => {
  for (const [property, expected] of [
    ['color', '#E8909E'],
    ['background', 'rgba(232,144,158,0.08)'],
    ['border-color', 'rgba(232,144,158,0.45)']
  ]) {
    const flowValue = declarationFor(PERIOD_LIST_WXSS, '.item-tag.flow', property)
    assert.equal(property === 'color' ? cssColorToHex(flowValue) : flowValue, expected)
  }
  assert.equal(cssColorToHex(declarationFor(PERIOD_LIST_WXSS, '.segment-option.active', 'color')), '#E8909E')
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.segment-thumb', 'background'), 'rgba(232,144,158,0.14)')
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.segment-thumb', 'border'), '1px solid rgba(232,144,158,0.48)')
})

test('list flow tag quiet treatment leaves the in-progress duration solid', () => {
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.item-duration.ongoing', 'color'), 'var(--text-on-accent)')
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.item-duration.ongoing', 'background'), 'rgba(232,144,158,0.92)')
  const editChip = activeChipPair(PERIOD_EDIT_WXSS, 'flow-chip')
  assert.equal(editChip.color, '#E8909E')
  assert.equal(declarationFor(PERIOD_EDIT_WXSS, '.flow-chip.active', 'background'), 'rgba(232,144,158,0.08)')
})

test('list symptom tags stay neutral — no rose fill, no gold', () => {
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.item-tag', 'color'), 'var(--text-secondary)')
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.item-tag', 'background'), 'var(--glass-bg)')
  const symptomRule = ruleTextFor(PERIOD_LIST_WXSS, '.item-tag')
  assert.doesNotMatch(symptomRule, /aurora-pink|232,\s*144,\s*158/)
})

test('period list styles drop prediction gold from the flow tag', () => {
  assert.doesNotMatch(ruleTextFor(PERIOD_LIST_WXSS, '.item-tag.flow'), /212,\s*165,\s*116|aurora-gold|D4A574/i)
  assert.doesNotMatch(PERIOD_LIST_WXSS, /212,\s*165,\s*116/)
})
