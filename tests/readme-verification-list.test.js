const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const { sourceFiles, runLogged, testCounts, trackedFiles, pickTargets } = require('./tools/verify.cjs')

test('README, CI and the git hooks use the same verification entry', () => {
  for (const file of ['README.md', '.github/workflows/ci.yml', '.githooks/pre-commit', '.githooks/pre-push']) {
    assert.match(fs.readFileSync(path.join(repoRoot, file), 'utf8'), /npm run verify/, file)
  }
  assert.equal(require('../package.json').scripts.verify, 'node tests/tools/verify.cjs')
})

test('the hook runs take their syntax and test lists from the git index, so untracked files stay out', () => {
  for (const hook of ['.githooks/pre-commit', '.githooks/pre-push']) {
    assert.match(fs.readFileSync(path.join(repoRoot, hook), 'utf8'), /npm run verify -- --tracked/, hook)
  }
  const picked = pickTargets(['app.js', 'pages/index/index.js', 'pages/index/index.wxml', 'tests/a.test.js', 'tests/tools/verify.cjs', 'tests/fixtures/b.test.js'])
  assert.deepEqual(picked.sources, ['app.js', 'pages/index/index.js', 'tests/a.test.js', 'tests/tools/verify.cjs', 'tests/fixtures/b.test.js'])
  assert.deepEqual(picked.tests, ['tests/a.test.js'])
  // An index entry deleted from the work tree is skipped rather than failing someone else's commit.
  assert.deepEqual(trackedFiles(repoRoot, () => 'app.js\0tests/no-such-file.test.js\0'), ['app.js'])
  assert.ok(trackedFiles().includes('tests/readme-verification-list.test.js'))
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
