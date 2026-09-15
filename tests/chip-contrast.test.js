const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { contrastRatio, meetsContrast } = require('./contrast')

const PERIOD_EDIT_WXSS = fs.readFileSync(
  path.join(__dirname, '..', 'pages/period/edit/edit.wxss'),
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

test('active symptom chip navy type meets 4.5:1 against gold fill', () => {
  assertReadableChip('symptom-chip', 'symptom chip')
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
