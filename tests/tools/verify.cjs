const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.isSymbolicLink()) return []
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:c|m)?js$/.test(entry.name) ? [file] : []
  }).sort()
}

function runLogged(name, args, logDir, cwd = root) {
  const log = path.join(logDir, `${name}.log`)
  const fd = fs.openSync(log, 'w')
  let result
  try {
    result = spawnSync(process.execPath, args, { cwd, stdio: ['ignore', fd, fd], timeout: 180000 })
    if (result.error) fs.writeSync(fd, `${result.error.message}\n`)
  } finally { fs.closeSync(fd) }
  const ok = result.status === 0 && !result.error
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${log}`)
  if (!ok) {
    const lines = fs.readFileSync(log, 'utf8').trim().split(/\r?\n/)
    console.error(lines.slice(-18).join('\n'))
  }
  return ok
}

function main() {
  const logDir = path.join(root, '.scratch', 'verify', `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
  fs.mkdirSync(logDir, { recursive: true })
  const files = ['app.js', ...['pages', 'utils', 'cloudfunctions', 'tests'].flatMap(dir => sourceFiles(path.join(root, dir)))]
  const syntaxLog = path.join(logDir, 'syntax.log')
  const fd = fs.openSync(syntaxLog, 'w')
  let syntaxOK = true
  try {
    for (const file of files) {
      fs.writeSync(fd, `${path.relative(root, path.resolve(root, file))}\n`)
      const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: ['ignore', fd, fd], timeout: 10000 })
      if (result.status !== 0 || result.error) {
        syntaxOK = false
        console.error(`FAIL syntax: ${file}${result.error ? ` (${result.error.message})` : ''}`)
      }
    }
  } finally { fs.closeSync(fd) }
  console.log(`${syntaxOK ? 'PASS' : 'FAIL'} syntax (${files.length} files): ${syntaxLog}`)
  const tests = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.js')).sort().map(name => `tests/${name}`)
  const results = [syntaxOK,
    runLogged('tests', ['--test', ...tests], logDir),
    runLogged('room-artifacts', ['cloudfunctions/_shared/syncRoomMembershipLifecycle.js', '--check'], logDir),
    runLogged('coordinate-hit', ['tests/tools/navHitTest.cjs'], logDir)]
  process.exitCode = results.every(Boolean) ? 0 : 1
}

if (require.main === module) main()
module.exports = { sourceFiles, runLogged }
