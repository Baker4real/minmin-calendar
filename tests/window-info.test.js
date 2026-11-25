const assert = require('node:assert/strict')
const test = require('node:test')

const { getWindowWidth } = require('../utils/wxWindow')

test('wx window width prefers getWindowInfo and uses the legacy seam only when needed', (t) => {
  const originalWx = global.wx
  t.after(() => { global.wx = originalWx })

  let legacyCalls = 0
  global.wx = {
    getWindowInfo: () => ({ windowWidth: 390 }),
    getSystemInfoSync: () => { legacyCalls += 1; return { windowWidth: 320 } }
  }
  assert.equal(getWindowWidth(), 390)
  assert.equal(legacyCalls, 0)

  global.wx.getWindowInfo = () => ({ windowWidth: 0 })
  assert.equal(getWindowWidth(), 320)
  assert.equal(legacyCalls, 1)
})

test('wx window width reports an unavailable value instead of inventing geometry', (t) => {
  const originalWx = global.wx
  t.after(() => { global.wx = originalWx })
  global.wx = { getSystemInfoSync: () => ({ windowWidth: Number.NaN }) }
  assert.equal(getWindowWidth(), null)
  delete global.wx
  assert.equal(getWindowWidth(), null)
})
