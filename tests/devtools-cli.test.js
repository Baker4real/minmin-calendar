const assert = require('node:assert/strict')
const test = require('node:test')

test('CLI preserves native absolute project identity and does not use shell quoting', async () => {
  const { cliArguments } = await import('./tools/devtoolsCli.mjs')
  assert.deepEqual(cliArguments('auto', 'D:/项目 name/'), ['auto', '--project', 'D:\\项目 name', '--auto-port', '9420', '--trust-project'])
  assert.throws(() => cliArguments('open', 'relative'), /absolute/)
  assert.throws(() => cliArguments('upload', 'D:/project'), /Command/)
  assert.throws(() => cliArguments('auto', 'D:/project', 70000), /port/)
})

test('CLI reads cloud function list and info, and refuses every cloud command that deploys or downloads', async () => {
  const { cliArguments } = await import('./tools/devtoolsCli.mjs')
  const cloud = { env: 'env-1', names: ['dataOp', 'login'] }
  assert.deepEqual(cliArguments('cloud-list', 'D:/project/', undefined, { env: 'env-1' }), ['cloud', 'functions', 'list', '--env', 'env-1', '--project', 'D:\\project'])
  assert.deepEqual(cliArguments('cloud-info', 'D:/project', undefined, cloud), ['cloud', 'functions', 'info', '--env', 'env-1', '--names', 'dataOp', 'login', '--project', 'D:\\project'])
  for (const command of ['cloud', 'cloud-deploy', 'cloud-inc-deploy', 'cloud-download']) {
    assert.throws(() => cliArguments(command, 'D:/project', 9420, cloud), /Command/)
  }
  assert.throws(() => cliArguments('cloud-list', 'relative', undefined, { env: 'env-1' }), /absolute/)
  assert.throws(() => cliArguments('cloud-list', 'D:/project', undefined, {}), /--env/)
  assert.throws(() => cliArguments('cloud-list', 'D:/project', undefined, { env: '--names' }), /--env/)
  assert.throws(() => cliArguments('cloud-info', 'D:/project', undefined, { env: 'env-1' }), /--names/)
  assert.throws(() => cliArguments('cloud-info', 'D:/project', undefined, { env: 'env-1', names: ['dataOp', '--paths'] }), /--names/)
})

test('a cloud query that the CLI exits 0 on is still reported as failed unless its success line is present', async () => {
  const { cloudAnswer } = await import('./tools/devtoolsCli.mjs')
  const preamble = '- initialize\n\n(node:1) [DEP0040] DeprecationWarning\n√ IDE server has started, listening on http://127.0.0.1:1\n- query cloudfunctions list\n- fetching cloudfunctions list\n'
  assert.deepEqual(cloudAnswer(`${preamble}√ query cloudfunctions list\n\n* dataOp\n* login\n`), { failed: false, text: '* dataOp\n* login' })
  const rejected = cloudAnswer(`${preamble}× fetching cloudfunctions list\n[error] {\n  code: 31,\n  message: "缺失参数 'project / appid'"\n}\n`)
  assert.equal(rejected.failed, true)
  assert.match(rejected.text, /缺失参数/)
  assert.equal(cloudAnswer('').failed, true)
})

test('a cloud query reads both success symbol sets and treats a partial-failure warning as failed', async () => {
  const { cloudAnswer } = await import('./tools/devtoolsCli.mjs')
  const preamble = '- initialize\n✔ IDE server has started, listening on http://127.0.0.1:1\n- query cloudfunctions list\n'
  assert.deepEqual(cloudAnswer(`${preamble}✔ query cloudfunctions list\n\n* dataOp\n* login\n`), { failed: false, text: '* dataOp\n* login' })
  for (const warning of ['‼', '⚠']) {
    const partial = cloudAnswer(`- query cloudfunctions info\n${warning} query cloudfunctions info\n| name | runtime |\n| dataOp | Nodejs16.13 |\n[error] login not found\n`)
    assert.equal(partial.failed, true)
    assert.match(partial.text, /\| dataOp \| Nodejs16\.13 \|/)
  }
})

test('bounded process reports exit failure, output cap and timeout distinctly', async () => {
  const { runBounded } = await import('./tools/devtoolsCli.mjs')
  const failed = await runBounded(process.execPath, ['-e', 'process.stdout.write("x".repeat(20000));process.exitCode=7'])
  assert.equal(failed.status, 'failed')
  assert.equal(failed.exitCode, 7)
  assert.equal(failed.output.length, 16384)
  const timeout = await runBounded(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 })
  assert.equal(timeout.status, 'timeout')
  assert.equal(timeout.exitCode, 124)
  const missing = await runBounded('nonexistent-test-devtools-executable', [])
  assert.equal(missing.status, 'spawn-error')
})
