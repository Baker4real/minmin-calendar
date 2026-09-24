const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { contrastRatio, meetsContrast } = require('./contrast')

const PERIOD_EDIT_WXSS = fs.readFileSync(
  path.join(__dirname, '..', 'pages/period/edit/edit.wxss'),
  'utf8'
)

const PERIOD_LIST_WXSS = fs.readFileSync(
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

function assertReadableChip(chipClass, label) {
  const { color, fill } = activeChipPair(PERIOD_EDIT_WXSS, chipClass)
  const ratio = contrastRatio(color, fill)
  assert.equal(
    meetsContrast(color, fill),
    true,
    `${label} ${color} on ${fill} is ${ratio.toFixed(2)}:1, need ≥4.5:1`
  )
}

test('active flow chip navy type meets 4.5:1 against rose fill', () => {
  assertReadableChip('flow-chip', 'flow chip')
})

test('active symptom chip navy type meets 4.5:1 against rose fill', () => {
  assertReadableChip('symptom-chip', 'symptom chip')
})

test('active flow and symptom chips share the same rose fill and navy type', () => {
  const flow = activeChipPair(PERIOD_EDIT_WXSS, 'flow-chip')
  const symptom = activeChipPair(PERIOD_EDIT_WXSS, 'symptom-chip')
  assert.equal(flow.fill, '#E8909E')
  assert.equal(flow.color, '#0A0E27')
  assert.equal(symptom.fill, '#E8909E')
  assert.equal(symptom.color, '#0A0E27')
})

test('period edit chips keep min-height 88rpx', () => {
  assert.equal(
    cascadedDeclaration(PERIOD_EDIT_WXSS, 'flow-chip', 'min-height', selectorTargetsChip),
    '88rpx'
  )
  assert.equal(
    cascadedDeclaration(PERIOD_EDIT_WXSS, 'symptom-chip', 'min-height', selectorTargetsChip),
    '88rpx'
  )
})

test('white type on active chip fills fails 4.5:1', () => {
  const flow = activeChipPair(PERIOD_EDIT_WXSS, 'flow-chip')
  const symptom = activeChipPair(PERIOD_EDIT_WXSS, 'symptom-chip')
  assert.equal(meetsContrast('#FFFFFF', flow.fill), false)
  assert.equal(meetsContrast('#FFFFFF', symptom.fill), false)
})

// issue #76：经期列表的经量标签与编辑页选中芯片同一玫瑰角色；症状保持中性，不用预测金。
test('list flow tag rides the same rose fill and navy type as the selected edit chip', () => {
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.item-tag.flow', 'color'), '#0A0E27')
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.item-tag.flow', 'background'), 'rgba(232,144,158,0.92)')
  assert.equal(declarationFor(PERIOD_LIST_WXSS, '.item-tag.flow', 'border-color'), 'rgba(232,144,158,0.95)')

  const editChip = activeChipPair(PERIOD_EDIT_WXSS, 'flow-chip')
  assert.equal(cssColorToHex('rgba(232,144,158,0.92)'), editChip.fill)
  assert.equal(cssColorToHex('#0A0E27'), editChip.color)
})

test('list flow tag keeps navy type readable on the rose fill', () => {
  const ratio = contrastRatio('#0A0E27', cssColorToHex('rgba(232,144,158,0.92)'))
  assert.equal(
    meetsContrast('#0A0E27', cssColorToHex('rgba(232,144,158,0.92)')),
    true,
    `list flow tag #0A0E27 on rose is ${ratio.toFixed(2)}:1, need ≥4.5:1`
  )
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
