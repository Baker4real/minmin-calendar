const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const scenarios = [
  'returning on a later day updates status, reminders and editor dates even when cloud records are unchanged',
  'day titles and quick entries keep the rendered today across midnight until the next calendar projection',
  'a calendar render samples today once even when the system clock crosses midnight during projection'
]
const testNamePattern = `^(?:${scenarios.join('|')})$`

function runClockRegression({ root = path.resolve(__dirname, '../..'), spawn = spawnSync } = {}) {
  const logDir = path.join(root, '.scratch', 'verify')
  fs.mkdirSync(logDir, { recursive: true })
  const runs = ['UTC', 'Asia/Taipei'].map(timezone => {
    const log = path.join(logDir, `clock-${timezone.replace('/', '-')}.log`)
    const fd = fs.openSync(log, 'w')
    const env = { ...process.env, TZ: timezone }
    // node:test marks its own children; this is an independent test invocation.
    delete env.NODE_TEST_CONTEXT
    let result
    try {
      result = spawn(process.execPath, [
        '--test', '--test-reporter=tap', `--test-name-pattern=${testNamePattern}`, 'tests/home-calendar.test.js'
      ], { cwd: root, env, stdio: ['ignore', fd, fd], timeout: 30000 })
      if (result.error) fs.writeSync(fd, `${result.error.message}\n`)
    } finally { fs.closeSync(fd) }
    const output = fs.readFileSync(log, 'utf8')
    const passed = [...output.matchAll(/^ok \d+ - (.+)\r?$/gm)].map(match => match[1].trimEnd())
    const counts = Object.fromEntries([...output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\r?$/gm)].map(([, key, value]) => [key, Number(value)]))
    const complete = passed.length === scenarios.length && scenarios.every(name => passed.filter(actual => actual === name).length === 1)
      && /^1\.\.3\r?$/m.test(output)
      && Object.entries({ tests: 3, pass: 3, fail: 0, cancelled: 0, skipped: 0, todo: 0 }).every(([key, value]) => counts[key] === value)
    const reason = result.error ? `${result.error.code || 'spawn error'}: ${result.error.message}`
      : result.signal ? `signal ${result.signal}` : result.status !== 0 ? `exit ${result.status}`
      : !complete ? 'expected all 3 calendar scenarios exactly once and a clean TAP summary' : ''
    return { timezone, ok: !reason, log, reason }
  })
  return { ok: runs.every(run => run.ok), runs }
}

function main() {
  try {
    const result = runClockRegression()
    for (const run of result.runs) {
      const summary = run.ok ? '3/3 pass' : run.reason.replace(/\s+/g, ' ').slice(0, 180)
      console.log(`${run.ok ? 'PASS' : 'FAIL'} clock-${run.timezone} (${summary}): ${run.log}`)
    }
    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    console.error(`FAIL clock regression: ${error.message.replace(/\s+/g, ' ').slice(0, 180)}`)
    process.exitCode = 1
  }
}

if (require.main === module) main()
module.exports = { runClockRegression }
