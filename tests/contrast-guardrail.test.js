const assert = require('node:assert/strict')
const test = require('node:test')

const { contrastRatio, meetsContrast } = require('./contrast')

test('white on black is the WCAG 21:1 reference pair and meets 4.5:1', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21)
  assert.equal(meetsContrast('#FFFFFF', '#000000'), true)
})

test('white on rose #E8909E fails the 4.5:1 guardrail', () => {
  assert.equal(meetsContrast('#FFFFFF', '#E8909E'), false)
})
