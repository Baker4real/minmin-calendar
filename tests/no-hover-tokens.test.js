const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { readSource } = require('./sourceFiles')

const appWxss = readSource(path.join(__dirname, '..', 'app.wxss'), 'utf8')

test('app.wxss no longer names hover-only glass tokens', () => {
  assert.equal(appWxss.includes('--glass-bg-hover'), false)
  assert.equal(appWxss.includes('--glass-border-hover'), false)
})
