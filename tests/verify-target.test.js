const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { runTarget } = require('./tools/verify.cjs')

function fixture(t, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-target-'))
  fs.mkdirSync(path.join(root, 'tests'))
  fs.writeFileSync(path.join(root, 'tests', 'one.test.js'), body)
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  return root
}
test('targeted runner records full output but only reports bounded failure excerpts', t => {
  const root = fixture(t, `const t=require('node:test');t('broken',()=>{throw Error('x'.repeat(20000))})`)
  const messages = []
  const result = runTarget({ cwd: root, tests: ['tests/one.test.js'], report: line => messages.push(line) })
  assert.equal(result.ok, false)
  assert.equal(result.counts.fail, 1)
  assert.ok(messages.join('\n').length < 6000)
  assert.ok(fs.readFileSync(result.log, 'utf8').length > 20000)
})
test('targeted runner rejects empty selections, escaped paths and zero matched names', t => {
  const root = fixture(t, `require('node:test')('exists',()=>{})`)
  assert.throws(() => runTarget({ cwd: root, tests: [] }), /tests/)
  assert.throws(() => runTarget({ cwd: root, tests: ['../one.test.js'] }), /tests/)
  const absent = runTarget({ cwd: root, tests: ['tests/one.test.js'], name: 'absent', report: () => {} })
  assert.equal(absent.ok, false, fs.readFileSync(absent.log, 'utf8'))
  assert.equal(runTarget({ cwd: root, tests: ['tests/one.test.js'], name: 'exists', report: () => {} }).ok, true)
})
