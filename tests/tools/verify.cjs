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

// The spec reporter ends with `ℹ tests N` / `ℹ pass N` / `ℹ fail N`; echo them so the daily output carries the counts.
function testCounts(log) {
  const counts = {}
  for (const [, key, value] of fs.readFileSync(log, 'utf8').matchAll(/^ℹ (tests|pass|fail) (\d+)\r?$/gm)) counts[key] = value
  return counts.tests ? ` (${counts.pass ?? 0}/${counts.tests} pass, ${counts.fail ?? 0} fail)` : ''
}

function runLogged(name, args, logDir, cwd = root, summarize = () => '') {
  const log = path.join(logDir, `${name}.log`)
  const fd = fs.openSync(log, 'w')
  let result
  try {
    result = spawnSync(process.execPath, args, { cwd, stdio: ['ignore', fd, fd], timeout: 180000 })
    if (result.error) fs.writeSync(fd, `${result.error.message}\n`)
  } finally { fs.closeSync(fd) }
  const ok = result.status === 0 && !result.error
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${summarize(log)}: ${log}`)
  if (!ok) {
    const lines = fs.readFileSync(log, 'utf8').trim().split(/\r?\n/)
    console.error(lines.slice(-18).join('\n'))
  }
  return ok
}

function listIndex(cwd) {
  const result = spawnSync('git', ['ls-files', '-z', '--', 'app.js', 'pages', 'utils', 'cloudfunctions', 'tests'], { cwd, encoding: 'utf8' })
  if (result.status !== 0 || result.error) throw new Error(`git ls-files failed: ${result.error ? result.error.message : result.stderr.trim()}`)
  return result.stdout
}

// The pre-commit hook passes --tracked: the syntax and test lists then come from the git index (tracked plus staged
// files), so another session's untracked files in a shared work tree neither fail nor pass this commit.
function trackedFiles(cwd = root, list = listIndex) {
  return list(cwd).split('\0').filter(file => file && fs.existsSync(path.join(cwd, file)))
}

function pickTargets(files) {
  return {
    sources: files.filter(file => /\.(?:c|m)?js$/.test(file)),
    tests: files.filter(file => /^tests\/[^/]+\.test\.js$/.test(file))
  }
}

function targets(tracked) {
  if (tracked) return pickTargets(trackedFiles())
  return {
    sources: ['app.js', ...['pages', 'utils', 'cloudfunctions', 'tests'].flatMap(dir => sourceFiles(path.join(root, dir)))],
    tests: fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.js')).sort().map(name => `tests/${name}`)
  }
}

function main() {
  // One fixed directory that each run overwrites, so runs never pile up under .scratch.
  const logDir = path.join(root, '.scratch', 'verify')
  fs.mkdirSync(logDir, { recursive: true })
  const { sources: files, tests } = targets(process.argv.includes('--tracked'))
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
  const results = [syntaxOK,
    runLogged('tests', ['--test', '--test-reporter=spec', ...tests], logDir, root, testCounts),
    runLogged('room-artifacts', ['cloudfunctions/_shared/syncRoomMembershipLifecycle.js', '--check'], logDir),
    runLogged('coordinate-hit', ['tests/tools/navHitTest.cjs'], logDir)]
  process.exitCode = results.every(Boolean) ? 0 : 1
}

if (require.main === module) main()
module.exports = { sourceFiles, runLogged, testCounts, trackedFiles, pickTargets }
