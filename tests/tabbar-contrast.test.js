const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { contrastRatio } = require('./contrast')

const appJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')
)

const TAB_CANVAS = '#0A0E27'
const SELECTED_ROSE = '#E8909E'

test('unselected tab text meets 4.5:1 against the tab canvas', () => {
  assert.ok(
    contrastRatio(appJson.tabBar.color, TAB_CANVAS) >= 4.5,
    `tabBar.color ${appJson.tabBar.color} on ${TAB_CANVAS} must be at least 4.5:1`
  )
})

test('selected tab color stays rose', () => {
  assert.equal(appJson.tabBar.selectedColor, SELECTED_ROSE)
})
