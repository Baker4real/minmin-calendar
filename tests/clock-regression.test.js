const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const { runClockRegression } = require('./tools/clockRegression.cjs')

const scenarios = [
  'returning on a later day updates status, reminders and editor dates even when cloud records are unchanged',
  'day titles and quick entries keep the rendered today across midnight until the next calendar projection',
  'a calendar render samples today once even when the system clock crosses midnight during projection'
]

function fixture(t, { body = '', names = scenarios, cli = false } = {}) {
  const scratch = path.join(__dirname, '..', '.scratch', 'clock-regression-tests')
  fs.mkdirSync(scratch, { recursive: true })
  const root = fs.mkdtempSync(path.join(scratch, 'run-'))
  const file = path.join(root, 'tests', 'home-calendar.test.js')
  fs.mkdirSync(path.dirname(file))
  fs.writeFileSync(file, [
    "const assert = require('node:assert/strict')",
    "const test = require('node:test')",
    ...names.map(name => `test(${JSON.stringify(name)}, t => {
      assert.equal(new Date('2026-12-31T23:59:59').getTimezoneOffset(), { UTC: 0, 'Asia/Taipei': -480 }[process.env.TZ])
      console.log('clock-zone=' + process.env.TZ)
      ${body}
    })`),
    "test('unrelated calendar work', () => assert.fail('must not run the whole calendar suite'))"
  ].join('\n'))
  if (cli) {
    fs.mkdirSync(path.join(root, 'tests', 'tools'))
    fs.copyFileSync(require.resolve('./tools/clockRegression.cjs'), path.join(root, 'tests', 'tools', 'clockRegression.cjs'))
  }
  t.after(() => {
    for (const name of ['clock-UTC.log', 'clock-Asia-Taipei.log']) {
      fs.rmSync(path.join(root, '.scratch', 'verify', name), { force: true })
    }
    fs.rmSync(file)
    if (cli) {
      fs.rmSync(path.join(root, 'tests', 'tools', 'clockRegression.cjs'))
      fs.rmdirSync(path.join(root, 'tests', 'tools'))
    }
    for (const dir of ['tests', '.scratch/verify', '.scratch', '']) fs.rmdirSync(path.join(root, dir))
  })
  return root
}

function log(root, zone) {
  return fs.readFileSync(path.join(root, '.scratch', 'verify', `clock-${zone.replace('/', '-')}.log`), 'utf8')
}

test('clock regression runs only the three scenarios in both explicit child time zones and retains their logs', t => {
  const root = fixture(t)
  const originalTZ = process.env.TZ
  const result = runClockRegression({ root })
  assert.equal(result.ok, true)
  assert.deepEqual(result.runs.map(run => [run.timezone, run.ok]), [['UTC', true], ['Asia/Taipei', true]])
  assert.match(log(root, 'UTC'), /clock-zone=UTC/)
  assert.match(log(root, 'Asia/Taipei'), /clock-zone=Asia\/Taipei/)
  assert.doesNotMatch(log(root, 'UTC'), /unrelated calendar work/)
  assert.equal(process.env.TZ, originalTZ)
})

test('a successful exit cannot pass zero matches, a missing scenario or a duplicate standing in for it', t => {
  for (const names of [[], scenarios.slice(0, 2), [scenarios[0], scenarios[0], scenarios[2]]]) {
    const root = fixture(t, { names })
    const result = runClockRegression({ root })
    assert.equal(result.ok, false, `must reject coverage: ${JSON.stringify(names)}`)
    assert.ok(result.runs.every(run => !run.ok))
    assert.match(log(root, 'UTC'), /# fail 0/)
  }
})

test('successful-looking TAP still needs its complete terminal plan and counters', t => {
  const root = fixture(t)
  assert.equal(runClockRegression({ root }).ok, true)
  const complete = log(root, 'UTC')
  for (const output of [
    complete.replace(/^1\.\.3\r?$/m, ''),
    complete.replace(/^# tests 3\r?$/m, ''),
    complete.replace(/^# pass 3\r?$/m, '# pass 2'),
    complete.replace(/^# cancelled 0\r?$/m, '# cancelled 1')
  ]) {
    const result = runClockRegression({ root, spawn: (command, args, options) => {
      fs.writeSync(options.stdio[1], output)
      return { status: 0, signal: null }
    } })
    assert.equal(result.ok, false, 'incomplete or inconsistent TAP must fail closed')
    assert.ok(result.runs.every(run => !run.ok && run.reason))
  }
})

test('failed, signalled, timed-out or unstarted children cannot pass even with complete successful TAP', t => {
  const root = fixture(t)
  assert.equal(runClockRegression({ root }).ok, true)
  const complete = log(root, 'UTC')
  for (const outcome of [
    { status: 1, signal: null },
    { status: 0, signal: 'SIGTERM' },
    { status: null, signal: 'SIGTERM', error: Object.assign(new Error('clock timeout'), { code: 'ETIMEDOUT' }) },
    { status: null, signal: null, error: Object.assign(new Error('node did not start'), { code: 'ENOENT' }) }
  ]) {
    const zones = []
    const result = runClockRegression({ root, spawn: (command, args, options) => {
      zones.push(options.env.TZ)
      fs.writeSync(options.stdio[1], complete)
      return outcome
    } })
    assert.equal(result.ok, false, `must reject child outcome: ${JSON.stringify(outcome)}`)
    assert.ok(result.runs.every(run => !run.ok && run.reason))
    assert.deepEqual(zones, ['UTC', 'Asia/Taipei'])
    if (outcome.error) assert.ok(log(root, 'UTC').includes(outcome.error.message))
  }
})

test('skipped and todo scenarios do not count as executed coverage', t => {
  for (const [body, summary] of [["t.skip('fixture skip')", /# skipped 3/], ["t.todo('fixture todo')", /# todo 3/]]) {
    const root = fixture(t, { body })
    const result = runClockRegression({ root })
    assert.equal(result.ok, false)
    assert.ok(result.runs.every(run => !run.ok))
    assert.match(log(root, 'UTC'), summary)
  }
})

test('failure in either time zone fails the regression while the other time zone still runs', t => {
  for (const [failingZone, expected] of [['UTC', [false, true]], ['Asia/Taipei', [true, false]]]) {
    const root = fixture(t, { body: `assert.notEqual(process.env.TZ, ${JSON.stringify(failingZone)}, 'fixture axis failure')` })
    const result = runClockRegression({ root })
    assert.equal(result.ok, false)
    assert.deepEqual(result.runs.map(run => run.ok), expected)
    assert.match(log(root, failingZone), /fixture axis failure/)
  }
})

test('the CLI reports bounded per-zone counts and paths, keeps detail in logs and exits nonzero on failure', t => {
  for (const failing of [false, true]) {
    const root = fixture(t, { cli: true, body: `console.log('clock detail '.repeat(1000)); ${failing ? "assert.notEqual(process.env.TZ, 'Asia/Taipei')" : ''}` })
    const result = spawnSync(process.execPath, [path.join(root, 'tests', 'tools', 'clockRegression.cjs')], { encoding: 'utf8' })
    assert.equal(result.status, failing ? 1 : 0)
    assert.equal(result.error, undefined)
    assert.match(result.stdout, /PASS clock-UTC \(3\/3 pass\):/)
    assert.match(result.stdout, failing ? /FAIL clock-Asia\/Taipei/ : /PASS clock-Asia\/Taipei \(3\/3 pass\):/)
    assert.equal(result.stdout.trim().split(/\r?\n/).length, 2)
    assert.ok(result.stdout.length < 1500)
    assert.doesNotMatch(result.stdout, /clock detail/)
    assert.equal(result.stderr, '')
    assert.ok(log(root, 'UTC').length > 10000)
    assert.ok(result.stdout.includes(path.join(root, '.scratch', 'verify', 'clock-UTC.log')))
    assert.ok(result.stdout.includes(path.join(root, '.scratch', 'verify', 'clock-Asia-Taipei.log')))
  }
})
