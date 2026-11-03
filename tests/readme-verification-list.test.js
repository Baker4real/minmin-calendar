const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const { sourceFiles, runLogged, testCounts } = require('./tools/verify.cjs')

test('README, CI and pre-commit use the same verification entry', () => {
  for (const file of ['README.md', '.github/workflows/ci.yml', '.githooks/pre-commit']) {
    assert.match(fs.readFileSync(path.join(repoRoot, file), 'utf8'), /npm run verify/, file)
  }
  assert.equal(require('../package.json').scripts.verify, 'node tests/tools/verify.cjs')
})

test('syntax discovery excludes dependencies and finds nested source and tools', () => {
  const files = sourceFiles(path.join(repoRoot, 'cloudfunctions'))
  assert.ok(files.some(file => file.endsWith(path.join('dataOp', 'index.js'))))
  assert.ok(files.every(file => !file.includes(`${path.sep}node_modules${path.sep}`)))
  assert.ok(sourceFiles(__dirname).some(file => file.endsWith('verify.cjs')))
})

test('logged checks reject syntax errors and retain diagnostics', t => {
  const scratch = path.join(repoRoot, '.scratch', 'verify-tests')
  fs.mkdirSync(scratch, { recursive: true })
  const dir = fs.mkdtempSync(path.join(scratch, 'negative-'))
  // Remove exactly the files this test writes, then the empty directory; no recursive delete.
  t.after(() => {
    for (const name of ['invalid.js', 'invalid.log', 'exit.log']) fs.rmSync(path.join(dir, name), { force: true })
    fs.rmdirSync(dir)
  })
  const invalid = path.join(dir, 'invalid.js')
  fs.writeFileSync(invalid, 'const broken = ;')
  assert.equal(runLogged('invalid', ['--check', invalid], dir), false)
  assert.match(fs.readFileSync(path.join(dir, 'invalid.log'), 'utf8'), /SyntaxError/)
  assert.equal(runLogged('exit', ['-e', 'process.exit(7)'], dir), false)
})

test('test counts come from the spec reporter summary', t => {
  const scratch = path.join(repoRoot, '.scratch', 'verify-tests')
  fs.mkdirSync(scratch, { recursive: true })
  const dir = fs.mkdtempSync(path.join(scratch, 'counts-'))
  const log = path.join(dir, 'tests.log')
  // Remove exactly the file this test writes, then the empty directory; no recursive delete.
  t.after(() => {
    fs.rmSync(log, { force: true })
    fs.rmdirSync(dir)
  })
  fs.writeFileSync(log, '✔ a\r\nℹ tests 3\r\nℹ suites 0\r\nℹ pass 2\r\nℹ fail 1\r\n')
  assert.equal(testCounts(log), ' (2/3 pass, 1 fail)')
})
