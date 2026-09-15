const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const appWxss = fs.readFileSync(path.join(__dirname, '..', 'app.wxss'), 'utf8')

test('app.wxss no longer names hover-only glass tokens', () => {
  assert.equal(appWxss.includes('--glass-bg-hover'), false)
  assert.equal(appWxss.includes('--glass-border-hover'), false)
})
