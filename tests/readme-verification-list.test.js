const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const testsRoot = path.join(repoRoot, 'tests')

test('README verification command lists exactly the tests on disk', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8')
  const commandLine = readme.split(/\r?\n/).find(line => line.startsWith('node --test '))
  assert.ok(commandLine, 'README.md must keep a node --test verification command line')

  const listed = [...commandLine.matchAll(/tests\\([a-z0-9-]+\.test\.js)/g)]
    .map(match => match[1])
    .sort()
  const onDisk = fs.readdirSync(testsRoot)
    .filter(name => name.endsWith('.test.js'))
    .sort()

  assert.deepEqual(
    listed,
    onDisk,
    'README node --test list must stay in sync with tests/*.test.js'
  )
})
